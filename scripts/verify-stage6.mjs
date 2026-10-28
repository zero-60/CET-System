import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const pathInProject = (p) => path.join(root, p)
const manifestPath = pathInProject('public/data/listening-questions/manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const errors = []
let groupCount = 0
let questionCount = 0
const ids = new Set()
const numbers = new Set()

for (const paper of manifest.papers) {
  for (const entry of paper.materials) {
    groupCount++
    const file = pathInProject(`public/data/listening-questions/${entry.file}`)
    if (!fs.existsSync(file)) { errors.push(`找不到 ${file}`); continue }
    const text = fs.readFileSync(file, 'utf8')
    const data = JSON.parse(text)
    if (data.question_id !== entry.question_id) errors.push(`编号不匹配：${entry.question_id}`)
    if (ids.has(data.question_id)) errors.push(`重复材料 ID：${data.question_id}`)
    ids.add(data.question_id)
    if (data.type !== 'listening') errors.push(`${data.question_id} 类型不是 listening`)
    if (!data.content?.audio_url?.startsWith('/audio/')) errors.push(`${data.question_id} 缺少音频 URL`)
    if (!Array.isArray(data.content?.questions)) errors.push(`${data.question_id} 缺少小题`)
    for (const q of data.content?.questions || []) {
      questionCount++
      if (numbers.has(q.question_no)) errors.push(`重复小题号 ${q.question_no}`)
      numbers.add(q.question_no)
      for (const key of ['A','B','C','D']) if (!q.options?.[key]?.trim()) errors.push(`Q${q.question_no} 缺失 ${key} 选项`)
    }
    if (/"(?:answer_key|correct_key|correct_answer|answer_side)"\s*:/.test(text)) errors.push(`${data.question_id} 不应在初始数据中存储答案`)
  }
}

console.log(`题组数：${groupCount}；小题数：${questionCount}`)
const missing = Array.from({length:25}, (_,i)=>i+1).filter(x=>!numbers.has(x))
if (missing.length) errors.push('遗漏题号：'+missing.join(','))
if (groupCount !== 8) errors.push('预期 8 个材料组')
if (questionCount !== 25) errors.push('预期 25 道小题')
if (errors.length) {
  errors.forEach(e=>console.error('错误：'+e))
  process.exit(1)
}
console.log('格式检查通过！注意：仍需人工对照 PDF 审核选项文字并校对音频时间范围。')
