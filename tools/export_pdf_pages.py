#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Render selected pages (small JPEGs) from local PDF or from PDF inside ZIP.
No OCR and no network upload. Install PyMuPDF only for this optional tool.
"""
import argparse
import sys
import zipfile
from pathlib import Path


def parse_pages(value, length):
    result=[]
    for part in value.split(','):
        part=part.strip()
        if not part: continue
        if '-' in part:
            a,b=part.split('-',1)
            numbers=range(int(a),int(b)+1)
        else:
            numbers=[int(part)]
        for x in numbers:
            if not 1 <= x <= length: raise ValueError(f'页码 {x} 超出范围 1～{length}')
            if x not in result: result.append(x)
    return result


def main():
    p=argparse.ArgumentParser(description='将本地 PDF 或 ZIP 内 PDF 的指定页导出为小型 JPG。')
    group=p.add_mutually_exclusive_group(required=True)
    group.add_argument('--pdf',help='PDF 文件路径')
    group.add_argument('--zip',help='包含 PDF 的 ZIP 压缩包路径')
    p.add_argument('--member',help='ZIP 内的 PDF 文件名；使用 --zip 时必须提供')
    p.add_argument('--pages',required=True,help='页码，如 1,2,5-7')
    p.add_argument('--out',required=True,help='导出图片目录')
    p.add_argument('--width',type=int,default=1300,help='图像宽度像素，默认 1300')
    args=p.parse_args()
    try:
        import fitz
    except ImportError:
        sys.exit('请先安装图片渲染依赖：python -m pip install pymupdf')
    if args.zip:
        if not args.member: sys.exit('使用 --zip 时必须加 --member 指定 ZIP 内 PDF 文件名。')
        with zipfile.ZipFile(args.zip) as z:
            matched = next((name for name in z.namelist() if name.replace('\\','/')==args.member.replace('\\','/')),None)
            if not matched:
                sys.exit('压缩包内未找到 PDF。实际文件列表：\n'+'\n'.join(z.namelist()))
            doc=fitz.open(stream=z.read(matched),filetype='pdf')
    else:
        doc=fitz.open(args.pdf)
    out=Path(args.out)
    out.mkdir(parents=True,exist_ok=True)
    pages=parse_pages(args.pages,len(doc))
    for n in pages:
        page=doc[n-1]
        scale=args.width/page.rect.width
        pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False)
        dest=out/f'page_{n:03d}.jpg'
        pix.save(str(dest),jpg_quality=78)
        print('已保存',dest, f'{dest.stat().st_size/1024:.1f} KB')
    print('完成。请根据资料内容只挑需要识别的页面，不必上传所有页面。')

if __name__=='__main__':main()
