export type ListeningSubtype = 'news' | 'conversation' | 'passage' | 'recording'
export type AnswerOptionKey = 'A' | 'B' | 'C' | 'D'
export type PracticeMode = 'training' | 'exam'
export type CetLevel = 'cet4' | 'cet6'

export interface ListeningExamMetadata {
  level: CetLevel
  year: number
  /** Common CET sessions are June ('06') and December ('12'); preserve the source's actual session. */
  session: string
  paper: string
}

export interface TranscriptSegment {
  index: number
  start: number
  end: number
  text: string
}

export interface ListeningSubQuestion {
  question_no: number
  stem: string
  options: Record<AnswerOptionKey, string>
  /** Optional links to transcript segment indexes; only fill after checking the audio/text alignment. */
  transcript_segment_ids?: number[]
}

export interface ListeningQuestionView {
  /** Stable ID for one listening material/audio group; it may contain multiple sub-questions. */
  question_id: string
  type: 'listening'
  title: string
  exam?: ListeningExamMetadata
  content: {
    subtype: ListeningSubtype
    /** A web URL or root-relative path, e.g. /audio/cet4/2025-06/paper1/news01.mp3 */
    audio_url: string
    duration_seconds: number
    time_range?: {
      start: number
      end: number
    }
    questions: ListeningSubQuestion[]
    /** Optional transcript. In exam mode, the backend should withhold this until allowed. */
    transcript?: TranscriptSegment[]
  }
}

export interface ListeningSubmitPayload {
  question_id: string
  answers: Record<number, AnswerOptionKey | null>
  mode: PracticeMode
  elapsed_seconds: number
}

export interface AttemptDetail {
  question_no: number
  user_key: AnswerOptionKey | null
  correct_key: AnswerOptionKey
  correct: boolean
  explanation: string
}

export interface AttemptResult {
  attempt_id: string
  question_id: string
  can_judge: boolean
  correct_count: number
  total: number
  accuracy: number
  elapsed_seconds: number
  details: AttemptDetail[]
}

export interface ListeningApi {
  getQuestion(): Promise<ListeningQuestionView>
  submitAttempt(payload: ListeningSubmitPayload): Promise<AttemptResult>
}
