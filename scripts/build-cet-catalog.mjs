#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

/**
 * 把本地扫描 inventory.csv 转成不含 Windows 本地路径的前端目录数据。
 * 该目录只反映文件线索，绝不生成真实题目、字幕、答案或音频关联结论。
 *
 * Usage:
 *   node scripts/build-cet-catalog.mjs "F:\CET\cet-inventory\inventory.csv"
 *   node scripts/build-cet-catalog.mjs "/path/to/inventory.csv" "/path/to/output.json"
 */

const inputPath = process.argv[2]
const outputPath = process.argv[3] || path.resolve('public/data/listening-catalog.json')
if (!inputPath) {
  console.error('用法：node scripts/build-cet-catalog.mjs <inventory.csv> [output.json]')
  process.exit(1)
}

function parseCsv(text) {
  const out = []
  let row = []
  let cell = ''
  let inQuote = false
  const s = text.replace(/^\uFEFF/, '')

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '"') {
      if (inQuote && s[i + 1] === '"') {
        cell += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (c === ',' && !inQuote) {
      row.push(cell)
      cell = ''
    } else if ((c === '\n' || c === '\r') && !inQuote) {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cell)
      if (row.some(x => x.trim())) out.push(row)
      row = []
      cell = ''
    } else {
      cell += c
    }
  }
  if (inQuote) throw new Error('CSV 引号未正确闭合')
  if (cell || row.length) {
    row.push(cell)
    if (row.some(x => x.trim())) out.push(row)
  }
  if (!out.length) return []

  const [header, ...data] = out
  return data.map((cells, i) => {
    if (cells.length !== header.length) {
      throw new Error(`CSV 第 ${i + 2} 行字段数不正确：期望 ${header.length}，实际 ${cells.length}`)
    }
    return Object.fromEntries(header.map((name, index) => [name.trim(), cells[index]?.trim() || '']))
  })
}

const records = parseCsv(fs.readFileSync(inputPath, 'utf8'))
const groups = new Map()
const unassignedAudio = new Map()

function keyOf(level, year, session, paper = '') {
  return [level, year, session, paper].join('|')
}

for (const r of records) {
  if (!['cet4', 'cet6'].includes(r.level)) continue
  if (!/^\d{4}$/.test(r.year) || !/^(06|09|12)$/.test(r.session)) continue

  if (r.kind === 'audio' && !r.paper) {
    const k = keyOf(r.level, r.year, r.session)
    if (!unassignedAudio.has(k)) unassignedAudio.set(k, new Set())
    if (r.audio_sha256) unassignedAudio.get(k).add(r.audio_sha256)
    continue
  }

  if (!/^[123]$/.test(r.paper)) continue
  const k = keyOf(r.level, r.year, r.session, r.paper)
  if (!groups.has(k)) {
    groups.set(k, {
      level: r.level,
      year: Number(r.year),
      session: r.session,
      paper: r.paper,
      pdfQuestion: false,
      pdfAnalysis: false,
      audioHashes: new Set()
    })
  }
  const group = groups.get(k)
  if (r.kind === 'question_pdf') group.pdfQuestion = true
  if (r.kind === 'analysis_pdf') group.pdfAnalysis = true
  if (r.kind === 'audio' && r.audio_sha256) group.audioHashes.add(r.audio_sha256)
}

const items = [...groups.values()].map(group => {
  const unassignedCount = unassignedAudio.get(
    keyOf(group.level, String(group.year), group.session)
  )?.size || 0
  const audioCount = group.audioHashes.size
  const audioStatus = audioCount > 1
    ? 'multiple'
    : audioCount === 1
      ? 'named'
      : unassignedCount > 0
        ? 'unassigned'
        : 'missing'

  return {
    id: `${group.level}_${group.year}_${group.session}_paper${group.paper}`,
    level: group.level,
    year: group.year,
    session: group.session,
    paper: group.paper,
    has_question_pdf: group.pdfQuestion,
    has_analysis_pdf: group.pdfAnalysis,
    audio_status: audioStatus,
    unique_audio_files: audioCount,
    unassigned_session_audio_files: unassignedCount,
    // "可练习" 需要题干/选项、音频映射、答案等完成核验后才能置 true。
    practice_ready: false
  }
}).sort((a, b) =>
  b.year - a.year ||
  b.session.localeCompare(a.session) ||
  a.level.localeCompare(b.level) ||
  Number(a.paper) - Number(b.paper)
)

const data = {
  schema_version: '1.0',
  catalog_kind: 'file-inventory-not-question-bank',
  generated_at: new Date().toISOString(),
  source_record_count: records.length,
  total_exam_papers: items.length,
  notes: [
    '只根据扫描文件名生成目录候选，年份和套卷仍需核对原卷。',
    'ZIP 内文件与解压文件可能被重复记录；有无文件按逻辑真值汇总，音频按 SHA-256 去重。',
    'unassigned 只代表同场次存在未明确归属的音频，不能认定本套可用。',
    'practice_ready 全部为 false，不代表任何套卷已完成真正入库。',
    '真实答案和解析不得随初始题目视图发送给前端。'
  ],
  items
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(data, null, 2) + '\n', 'utf8')

const audioStats = items.reduce((acc, item) => {
  acc[item.audio_status] = (acc[item.audio_status] || 0) + 1
  return acc
}, {})
console.log(`读取清单：${records.length} 条`)
console.log(`生成候选套卷：${items.length} 套`)
console.log('套卷音频状态：', audioStats)
console.log(`写入：${path.resolve(outputPath)}`)
console.log('提醒：这是扫描清单，不是已经可作答的正式真题。')
