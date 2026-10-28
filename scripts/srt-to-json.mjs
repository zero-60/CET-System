import fs from 'node:fs/promises'
import path from 'node:path'

const [inputPath, outputPath] = process.argv.slice(2)

if (!inputPath) {
  console.error('用法：node scripts/srt-to-json.mjs <input.srt> [output.json]')
  process.exit(1)
}

function toSeconds(timestamp) {
  const normalized = timestamp.trim().replace(',', '.')
  const match = normalized.match(/^(\d{2,}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/)
  if (!match) throw new Error(`无法识别时间戳：${timestamp}`)
  const fraction = Number(`0.${(match[4] || '0').padEnd(3, '0')}`)
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + fraction
}

const raw = await fs.readFile(inputPath, 'utf8')
  .replace(/^\uFEFF/, '')
  .replace(/\r\n/g, '\n')
  .trim()

const blocks = raw.split(/\n\s*\n/)
const segments = []

for (const block of blocks) {
  const lines = block.split('\n').map((line) => line.trimEnd())
  const timeIndex = lines.findIndex((line) => line.includes('-->'))
  if (timeIndex < 0) continue

  const timeLine = lines[timeIndex]
  const match = timeLine.match(/(\d{2,}:\d{2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{2,}:\d{2}:\d{2}[,.]\d{1,3})/)
  if (!match) {
    console.warn(`跳过无法解析的字幕块：${timeLine}`)
    continue
  }

  const start = toSeconds(match[1])
  const end = toSeconds(match[2])
  const text = lines.slice(timeIndex + 1).join(' ').trim()
  if (!text) continue

  segments.push({
    index: segments.length + 1,
    start: Number(start.toFixed(3)),
    end: Number(end.toFixed(3)),
    text,
  })
}

if (segments.length === 0) {
  console.error('没有解析到字幕。请确认文件是标准 SRT 格式，并包含时间戳行。')
  process.exit(1)
}

const output = JSON.stringify(segments, null, 2) + '\n'
if (outputPath) {
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true })
  await fs.writeFile(outputPath, output, 'utf8')
  console.log(`已转换 ${segments.length} 条字幕：${outputPath}`)
} else {
  console.log(output)
}
