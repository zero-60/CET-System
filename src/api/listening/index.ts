import { httpListeningApi } from './http'
import { mockListeningApi } from './mock'
const apiMode = import.meta.env.VITE_API_MODE || 'mock'
if (import.meta.env.PROD && apiMode === 'mock') throw new Error('生产构建不能使用 Mock API，请设置 VITE_API_MODE=http。')
export const listeningApi = apiMode === 'mock' ? mockListeningApi : httpListeningApi
export type { AnswerOptionKey, AttemptDetail, AttemptResult, ListeningQuestionView, ListeningSubQuestion, ListeningSubmitPayload, ListeningSubtype, PracticeMode, TranscriptSegment } from './types'
