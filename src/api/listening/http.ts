import axios from 'axios'
import type { ListeningApi, ListeningQuestionView, ListeningSubmitPayload, AttemptResult } from './types'

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

/** Proposed contract: POST /v1/next-question -> { question: ListeningQuestionView };
 * POST /api/attempts -> AttemptResult. Confirm these paths and envelopes with your teammate.
 * If the backend differs, adapt this file only; Vue components use the shared interface.
 */
export const httpListeningApi: ListeningApi = {
  async getQuestion() {
    const response = await http.post<{ question: ListeningQuestionView }>('/v1/next-question', { type: 'listening' })
    if (!response.data?.question) throw new Error('取题接口返回格式不符合约定：缺少 question 字段。')
    return response.data.question
  },
  async submitAttempt(payload: ListeningSubmitPayload) {
    const response = await http.post<AttemptResult>('/api/attempts', payload)
    if (!response.data || typeof response.data.correct_count !== 'number') throw new Error('提交接口返回格式不符合约定：缺少 correct_count。')
    return response.data
  },
}
