#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Inventory local CET archives with standard-library Python only.

No PDF OCR, no upload, no answer disclosure, no writes to source tree.
Analyzes regular files and ZIP members without unpacking ZIP archives.
"""
import argparse
import csv
import hashlib
import json
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

EXTENSIONS = {'.pdf', '.mp3', '.m4a', '.wav', '.srt', '.txt', '.zip'}
AUDIO_EXTENSIONS = {'.mp3', '.m4a', '.wav'}
SKIP_DIRS = {'node_modules', '.git', 'dist', '.venv', '__pycache__'}


def file_kind(name):
    suffix = Path(name).suffix.lower()
    if suffix in AUDIO_EXTENSIONS: return 'audio'
    if suffix == '.srt': return 'subtitle'
    if suffix == '.txt': return 'text'
    if suffix != '.pdf': return 'other'
    filename = Path(name).name
    if any(k in filename for k in ('解析', '详解', '答案')): return 'analysis_pdf'
    if any(k in filename for k in ('真题', '试题', '试卷')): return 'question_pdf'
    return 'pdf_unknown'


def get_metadata(name, context=''):
    combined = (context + '/' + name).replace('\\', '/')
    leaf = Path(name).name
    level = 'unknown'
    if '四级' in leaf or re.search(r'cet\s*[-_]?4', leaf, flags=re.I): level = 'cet4'
    elif '六级' in leaf or re.search(r'cet\s*[-_]?6', leaf, flags=re.I): level = 'cet6'
    elif '四级' in combined: level = 'cet4'
    elif '六级' in combined: level = 'cet6'

    # Prioritize the basename. Folder names may refer to a different session.
    m = re.search(r'(?<!\d)(20\d{2})\s*[-_.年]?\s*(0[169]|12)(?!\d)', leaf)
    if not m:
        m = re.search(r'(?<!\d)(20\d{2})\s*[-_.年]?\s*(0[169]|12)(?!\d)', combined)
    year, session = (m.group(1), m.group(2)) if m else ('', '')

    set_num = ''
    if m:
        near = leaf[m.end():]
        set_match = re.search(r'^\s*[-_\s]*(?:第)?\s*([123])\s*(?:套)?(?=[-_.\s]|$)', near)
        if set_match: set_num = set_match.group(1)
    if not set_num:
        named = re.search(r'第\s*([一二三123])\s*套', leaf)
        if named: set_num = {'一':'1', '二':'2', '三':'3'}.get(named.group(1), named.group(1))
    if not set_num:
        # Some archives name children '2025-06-1-真题.pdf' and archive has the set number.
        archive_match = re.search(r'(?:20\d{2})[-_.](?:0[169]|12)[-_.]([123])(?:[-_.]|$)', context)
        if archive_match: set_num = archive_match.group(1)
    return {'level':level,'year':year,'session':session,'paper':set_num}


def digest_file(path):
    sha = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''):
            sha.update(chunk)
    return sha.hexdigest()


def digest_zip_member(z, info):
    sha = hashlib.sha256()
    with z.open(info, 'r') as f:
        for chunk in iter(lambda:f.read(1024*1024), b''):
            sha.update(chunk)
    return sha.hexdigest()


def scan(root, output, hash_audio=True):
    rows = []
    errors = []
    visited = 0
    for p in root.rglob('*'):
        if not p.is_file(): continue
        if any(part.lower() in SKIP_DIRS for part in p.relative_to(root).parts): continue
        try:
            p.relative_to(output)
            continue
        except ValueError: pass
        suffix = p.suffix.lower()
        if suffix not in EXTENSIONS: continue
        visited += 1
        if suffix == '.zip':
            try:
                with zipfile.ZipFile(p, 'r') as z:
                    for info in z.infolist():
                        if info.is_dir(): continue
                        name = info.filename.replace('\\','/')
                        ext = Path(name).suffix.lower()
                        if ext not in EXTENSIONS or ext == '.zip': continue
                        meta = get_metadata(name, str(p.relative_to(root)))
                        row = {
                            'storage':'zip_member',
                            'source':str(p.relative_to(root)) + ' :: ' + name,
                            'basename':Path(name).name,
                            'kind':file_kind(name),
                            'bytes':info.file_size,
                            **meta,
                            'audio_sha256':'',
                        }
                        if hash_audio and ext in AUDIO_EXTENSIONS:
                            try: row['audio_sha256']=digest_zip_member(z, info)
                            except Exception as e: errors.append(f'音频校验失败 {row["source"]}: {e}')
                        rows.append(row)
            except (zipfile.BadZipFile, OSError) as e:
                errors.append(f'压缩包读取失败 {p}: {e}')
        else:
            meta = get_metadata(p.name, str(p.parent.relative_to(root)))
            row = {
                'storage':'file',
                'source':str(p.relative_to(root)),
                'basename':p.name,
                'kind':file_kind(p.name),
                'bytes':p.stat().st_size,
                **meta,
                'audio_sha256':'',
            }
            if hash_audio and suffix in AUDIO_EXTENSIONS:
                try: row['audio_sha256']=digest_file(p)
                except OSError as e: errors.append(f'音频校验失败 {p}: {e}')
            rows.append(row)
    return rows, errors, visited


def summarize(root, rows, errors, visited, hashed):
    groups=defaultdict(list)
    for row in rows:
        key=(row['level'],row['year'],row['session'],row['paper'])
        groups[key].append(row)
    counts=Counter(r['kind'] for r in rows)
    sha_groups=defaultdict(list)
    for row in rows:
        if row['kind']=='audio' and row['audio_sha256']:
            sha_groups[row['audio_sha256']].append(row)
    duplicate_audio = [members for members in sha_groups.values() if len(members)>1]

    report=[
        '# 四六级本地资料自动扫描报告',
        '',
        f'- 扫描根目录：`{root}`',
        f'- 生成时间：{datetime.now().astimezone().isoformat(timespec="seconds")}',
        f'- 实际遍历到的常见资料文件/压缩包：{visited}（包括 ZIP 本身）',
        f'- 清单记录数：{len(rows)}（包括 ZIP 内部文件，因此同一资料可能重复出现）',
        f'- PDF 真题：{counts["question_pdf"]}；PDF 解析：{counts["analysis_pdf"]}；其他 PDF：{counts["pdf_unknown"]}',
        f'- 音频：{counts["audio"]}；字幕：{counts["subtitle"]}',
        f'- 音频 SHA-256 校验：{"已执行" if hashed else "已跳过"}',
        '',
        '## 按考试、年份、场次与套卷分组',
        '',
        '| 级别 | 年份 | 场次 | 套卷 | 真题PDF | 解析PDF | 音频 | 字幕 | 检查提醒 |',
        '|---|---|---|---|---:|---:|---:|---:|---|',
    ]
    serialized_groups=[]
    for key in sorted(groups):
        entries=groups[key]
        c=Counter(r['kind'] for r in entries)
        remarks=[]
        if key[1]=='': remarks.append('年份待确认')
        if key[3]=='': remarks.append('套卷待确认')
        if c['question_pdf']==0: remarks.append('真题未找到')
        if c['analysis_pdf']==0: remarks.append('解析未找到')
        if c['audio']==0: remarks.append('该组未找到音频；可能共用，需核验')
        if any(r['storage']=='zip_member' for r in entries): remarks.append('含 ZIP 内部记录')
        report.append('| '+ ' | '.join([
            key[0], key[1] or '—', key[2] or '—', key[3] or '—',
            str(c['question_pdf']),str(c['analysis_pdf']),str(c['audio']),str(c['subtitle']),
            '；'.join(remarks) or '文件类型较完整（未验证内容）',
        ])+' |')
        serialized_groups.append({
            'level':key[0], 'year':key[1], 'session':key[2], 'paper':key[3],
            'status':'needs_human_review',
            'files':[{'source':r['source'],'kind':r['kind'],'storage':r['storage'],'audio_sha256':r['audio_sha256']} for r in entries],
        })

    report.extend(['','## 完全相同的音频（SHA-256）','','只有**校验值完全相同**才表示音频文件字节一致；不同校验值并不能说明听力内容一定不同。'])
    if not hashed:
        report.append('本次跳过了音频哈希校验，不能判断是否共用文件。')
    elif duplicate_audio:
        for i,members in enumerate(duplicate_audio,1):
            report.append(f'\n### 重复组 {i}（{len(members)} 份，SHA-256 `{members[0]["audio_sha256"][:16]}…`）\n')
            for r in members:
                report.append('- `'+r['source'].replace('`','')+'`')
    else:
        report.append('未发现字节完全一致的重复音频（这不排除某些套卷共用内容但文件编码不同）。')

    report.extend(['','## 注意事项','',
        '1. **此脚本只盘点文件，不读取题目文本、不做 OCR、不断言答案正确。**',
        '2. ZIP 内部文件不解压；如果压缩包与已解压文件同时存在，清单可能同时列出两条来源。',
        '3. 文件名推断年份/套卷，不代表对 PDF 的内容已核验；尤其不能根据命名认定三套共用音频。',
        '4. 这份报告和 inventory.csv 可发给协作人员，但源文件绝对路径、内部资料名称也可能敏感，请先检查。',
        '5. 生产环境标准答案必须由后端保存，不能放进前端公开材料 JSON。',
    ])
    if errors:
        report.extend(['','## 读取警告','']+['- '+e for e in errors])
    return '\n'.join(report)+'\n', serialized_groups


def main():
    ap=argparse.ArgumentParser(description='离线扫描四六级试卷、音频及 ZIP，输出小型清单。无需安装第三方 Python 包。')
    ap.add_argument('--root', required=True, help='真题资料所在的根文件夹，可含四级/六级子目录')
    ap.add_argument('--out', required=True, help='扫描报告输出文件夹（不要放在扫描根目录的原始资料子目录中）')
    ap.add_argument('--skip-audio-hash', action='store_true', help='跳过 SHA-256 音频查重，以减少大资料库的扫描时间')
    args=ap.parse_args()
    root=Path(args.root).expanduser().resolve()
    out=Path(args.out).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        sys.exit(f'未找到资料根目录：{root}\n请在文件资源管理器中复制真实文件夹路径，再运行。')
    out.mkdir(parents=True, exist_ok=True)
    print('开始扫描：',root)
    rows, errors, visited=scan(root,out,hash_audio=not args.skip_audio_hash)
    fields=['storage','source','basename','kind','bytes','level','year','session','paper','audio_sha256']
    with (out/'inventory.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.DictWriter(f,fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    report,groups=summarize(root,rows,errors,visited,not args.skip_audio_hash)
    (out/'report.md').write_text(report,encoding='utf-8')
    (out/'catalog_candidates.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2),encoding='utf-8')
    print('扫描完成！',len(rows),'条文件记录，',len(groups),'个候选材料分组。')
    print('报告：',out/'report.md')
    print('表格：',out/'inventory.csv')
    print('候选分组：',out/'catalog_candidates.json')
    if errors:
        print(f'提示：{len(errors)} 个 ZIP/文件读取警告，详见 report.md')

if __name__=='__main__':
    main()
