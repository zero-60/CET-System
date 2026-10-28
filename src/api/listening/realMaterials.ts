/**
 * Only this file switches the material source from public Mock fixtures to the future backend.
 * The GET /api/listening/materials/:id endpoint is a proposal, NOT an existing confirmed API.
 */
import axios from 'axios'
import type { ListeningQuestionView } from './types'

export interface PaperManifestItem {
  question_id: string
  title: string
  subtype: string
  numbers: number[]
  file: string
}

export interface PaperManifest {
  paper_id: string
  title: string
  level: string
  source: string
  audio_url: string
  audio_duration_seconds: number
  audio_note: string
  question_note: string
  review_status: string
  answer_status: string
  transcript_status: string
  materials: PaperManifestItem[]
}

export interface MaterialManifest {
  schema_version: string
  papers: PaperManifest[]
}

const mode = import.meta.env.VITE_API_MODE || 'mock'
const base = import.meta.env.BASE_URL

export async function getPaperManifest(): Promise<MaterialManifest> {
  // The manifest is a frontend catalog for previews; it does NOT authorize grading.
  // A team may replace this with GET /api/listening/papers when the backend is ready.
  const response = await fetch(`${base}data/listening-questions/manifest.json`, { cache: 'no-store' })
  if (!response.ok) throw new Error(`读取材料目录失败：HTTP ${response.status}`)
  const data = await response.json() as MaterialManifest
  if (!Array.isArray(data.papers)) throw new Error('材料目录格式不正确')
  return data
}

export async function getMaterialById(materialId: string): Promise<ListeningQuestionView> {
  if (mode === 'http') {
    // Confirm this URL, credentials, and response shape with the backend teammate.
    const apiBase = import.meta.env.VITE_API_BASE_URL || ''
    const { data } = await axios.get<ListeningQuestionView>(
      `${apiBase.replace(/\/$/, '')}/api/listening/materials/${encodeURIComponent(materialId)}`,
      { timeout: 15_000 },
    )
    if (data.question_id !== materialId || data.type !== 'listening') {
      throw new Error('后端材料响应不符合约定，检查 realMaterials.ts 的响应转换')
    }
    return data
  }

  const manifest = await getPaperManifest()
  for (const paper of manifest.papers) {
    const material = paper.materials.find((item) => item.question_id === materialId)
    if (!material) continue
    // Only use manifest-approved relative paths; never use unvalidated URL params as file paths.
    const response = await fetch(
      `${base}data/listening-questions/${material.file}`,
      { cache: 'no-store' },
    )
    if (!response.ok) throw new Error(`读取真题选项失败：HTTP ${response.status}`)
    const data = await response.json() as ListeningQuestionView
    if (data.question_id !== materialId || data.type !== 'listening') {
      throw new Error('题组 JSON 与材料目录编号不一致')
    }
    return data
  }
  throw new Error('该题组尚未整理或不存在，请返回套卷列表选择')
}

export const realBackendEnabled = mode === 'http'
