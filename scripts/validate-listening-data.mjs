import fs from 'node:fs/promises'
import path from 'node:path'

const root = process.cwd()
const materialsDir = path.join(root, 'src', 'data', 'listening', 'materials')
const allowedSubtypes = new Set(['news', 'conversation', 'passage'])
const seenIds = new Set()
const errors = []
const warnings = []
let checked = 0

async function walk(dir) {
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }

  const result = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) result.push(...await walk(fullPath))
    else if (
      entry.isFile() &&
      entry.name.endsWith('.json') &&
      !entry.name.startsWith('_') &&
      !entry.name.endsWith('.template.json')
    ) result.push(fullPath)
  }
  return result
}

function fail(file, message) {
  errors.push(`${path.relative(root, file)}: ${message}`)
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0
}

const files = await walk(materialsDir)

if (files.length === 0) {
  console.log('尚未发现正式材料 JSON。模板已就绪；复制并填写真实材料后再运行验证。')
  process.exit(0)
}

for (const file of files) {
  let data
  try {
    data = JSON.parse(await fs.readFile(file, 'utf8'))
  } catch (error) {
    fail(file, `JSON 无法解析：${error.message}`)
    continue
  }
  checked++

  if (!nonEmpty(data.question_id)) fail(file, 'question_id 不能为空。')
  else if (seenIds.has(data.question_id)) fail(file, `question_id 重复：${data.question_id}`)
  else seenIds.add(data.question_id)

  if (data.type !== 'listening') fail(file, 'type 必须为 "listening"。')

  if (!data.exam || !['cet4', 'cet6'].includes(data.exam.level)) {
    fail(file, 'exam.level 必须为 cet4 或 cet6。')
  }
  if (!Number.isInteger(data.exam?.year) || data.exam.year < 2000 || data.exam.year > 2100) {
    fail(file, 'exam.year 必须为合理的四位年份。')
  }
  if (!nonEmpty(data.exam?.session)) fail(file, 'exam.session 不能为空，例如 "06" 或 "12"。')
  if (!nonEmpty(data.exam?.paper)) fail(file, 'exam.paper 不能为空。')

  const content = data.content
  if (!content || !allowedSubtypes.has(content.subtype)) {
    fail(file, 'content.subtype 必须为 news、conversation 或 passage。')
    continue
  }

  if (!nonEmpty(content.audio_url)) {
    fail(file, 'content.audio_url 不能为空。')
  } else if (content.audio_url.startsWith('/audio/')) {
    const localAudioPath = path.join(root, 'public', content.audio_url.replace(/^\/+/, ''))
    try {
      const stat = await fs.stat(localAudioPath)
      if (!stat.isFile() || stat.size === 0) fail(file, `音频文件不存在或为空：${localAudioPath}`)
    } catch {
      fail(file, `找不到本地音频文件：${localAudioPath}`)
    }
  } else if (/^[A-Za-z]:\\/.test(content.audio_url)) {
    fail(file, 'audio_url 不能是 Windows 本地路径；请使用 /audio/... 或可访问的 HTTP(S) URL。')
  } else if (!/^https?:\/\//.test(content.audio_url)) {
    warnings.push(`${path.relative(root, file)}: audio_url 不是 /audio/... 或 HTTP(S) URL，请确认其可被浏览器访问。`)
  }

  if (!Number.isFinite(content.duration_seconds) || content.duration_seconds <= 0) {
    fail(file, 'content.duration_seconds 必须为大于 0 的音频时长（秒）。')
  }

  if (!Array.isArray(content.questions) || content.questions.length === 0) {
    fail(file, 'content.questions 至少需要一道小题。')
  } else {
    const questionNos = new Set()
    for (const [i, q] of content.questions.entries()) {
      if (!Number.isInteger(q.question_no) || q.question_no < 1) {
        fail(file, `第 ${i + 1} 道题的 question_no 必须为正整数。`)
      } else if (questionNos.has(q.question_no)) {
        fail(file, `question_no 重复：${q.question_no}`)
      } else questionNos.add(q.question_no)

      if (!nonEmpty(q.stem)) fail(file, `第 ${i + 1} 道题 stem 不能为空。`)
      for (const key of ['A', 'B', 'C', 'D']) {
        if (!nonEmpty(q.options?.[key])) fail(file, `第 ${i + 1} 道题缺少选项 ${key}。`)
      }
    }
  }

  if (content.time_range) {
    const { start, end } = content.time_range
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
      fail(file, 'time_range 必须满足 0 <= start < end。')
    }
    if (Number.isFinite(content.duration_seconds) && end > content.duration_seconds + 1) {
      warnings.push(`${path.relative(root, file)}: time_range.end 超过 duration_seconds，请核对。`)
    }
  }

  if (content.transcript !== undefined) {
    if (!Array.isArray(content.transcript)) {
      fail(file, 'content.transcript 必须为数组。')
    } else {
      let lastStart = -1
      const segmentIds = new Set()
      for (const [i, seg] of content.transcript.entries()) {
        if (!Number.isInteger(seg.index) || seg.index < 1) fail(file, `字幕第 ${i + 1} 条 index 必须为正整数。`)
        else if (segmentIds.has(seg.index)) fail(file, `字幕 index 重复：${seg.index}`)
        else segmentIds.add(seg.index)

        if (!Number.isFinite(seg.start) || !Number.isFinite(seg.end) || seg.start < 0 || seg.end <= seg.start) {
          fail(file, `字幕第 ${i + 1} 条必须满足 0 <= start < end。`)
        }
        if (Number.isFinite(seg.start) && seg.start < lastStart) {
          fail(file, `字幕第 ${i + 1} 条 start 顺序不正确。`)
        }
        if (Number.isFinite(seg.start)) lastStart = seg.start
        if (!nonEmpty(seg.text)) fail(file, `字幕第 ${i + 1} 条 text 不能为空。`)
        if (Number.isFinite(content.duration_seconds) && Number.isFinite(seg.end) && seg.end > content.duration_seconds + 1) {
          warnings.push(`${path.relative(root, file)}: 字幕第 ${i + 1} 条结束时间超过音频时长。`)
        }
      }
    }
  }

  // Do not put correct answers or answer explanations in the initial public question data.
  const serialized = JSON.stringify(data)
  if (/"(?:answer_key|correct_key|correct_answer|answer_explanation)"\s*:/i.test(serialized)) {
    fail(file, '检测到疑似标准答案字段；真实答案与解析应由后端在受控时机提供。')
  }
}

console.log(`已检查 ${checked} 份正式材料 JSON。`)
for (const warning of warnings) console.warn(`警告：${warning}`)
if (errors.length) {
  console.error(`发现 ${errors.length} 个错误：`)
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}
console.log('数据结构检查通过。注意：此工具不判断题目内容的真实性，也不验证字幕是否与音频逐句同步。')
