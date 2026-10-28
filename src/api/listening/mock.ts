import type {
  AttemptResult,
  ListeningApi,
  ListeningQuestionView,
  ListeningSubmitPayload,
} from './types'

const MOCK_QUESTION: ListeningQuestionView = {
  question_id: 'mock_cet4_news_001',
  type: 'listening',
  title: 'Mock News Report — Sample 01',
  content: {
    subtype: 'news',
    audio_url: '/audio/listening-1.mp3',
    duration_seconds: 0,
    questions: [
      {
        question_no: 1,
        stem: 'What is the report mainly about?',
        options: {
          A: 'A new museum exhibition',
          B: 'An improvement to local public transport',
          C: 'A change in school admission rules',
          D: 'A city-wide sports competition',
        },
      },
      {
        question_no: 2,
        stem: 'When is the new service expected to begin?',
        options: {
          A: 'This Friday',
          B: 'Next month',
          C: 'At the end of the year',
          D: 'Next summer',
        },
      },
      {
        question_no: 3,
        stem: 'What can passengers do with the mobile application?',
        options: {
          A: 'Book a hotel room',
          B: 'Apply for a driving licence',
          C: 'Check bus arrival information',
          D: 'Change their school timetable',
        },
      },
    ],
    transcript: [
      {
        index: 1,
        start: 0,
        end: 4,
        text: 'Placeholder transcript only. Replace this with the real transcript and timestamps before using subtitle sync.',
      },
    ],
  },
}

const MOCK_ANSWER_KEYS: Record<number, 'A' | 'B' | 'C' | 'D'> = {
  1: 'B',
  2: 'B',
  3: 'C',
}

const MOCK_EXPLANATIONS: Record<number, string> = {
  1: '示例解析：主旨题需要概括整段材料的核心内容，不应只根据某个细节作答。',
  2: '示例解析：做时间细节题时，应留意音频中表示时间的词组，并区分相近选项。',
  3: '示例解析：功能细节题要将选项与材料中描述的具体用途对应起来。',
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

export const mockListeningApi: ListeningApi = {
  async getQuestion() {
    await delay(180)
    return JSON.parse(JSON.stringify(MOCK_QUESTION)) as ListeningQuestionView
  },

  async submitAttempt(payload: ListeningSubmitPayload) {
    await delay(250)

    if (payload.question_id !== MOCK_QUESTION.question_id) {
      throw new Error(`Mock 数据中不存在题目：${payload.question_id}`)
    }

    const details = MOCK_QUESTION.content.questions.map((question) => {
      const userKey = payload.answers[question.question_no] ?? null
      const correctKey = MOCK_ANSWER_KEYS[question.question_no]

      return {
        question_no: question.question_no,
        user_key: userKey,
        correct_key: correctKey,
        correct: userKey === correctKey,
        explanation: MOCK_EXPLANATIONS[question.question_no],
      }
    })

    const correctCount = details.filter((item) => item.correct).length
    const total = details.length

    const result: AttemptResult = {
      attempt_id: `mock-attempt-${Date.now()}`,
      question_id: payload.question_id,
      can_judge: true,
      correct_count: correctCount,
      total,
      accuracy: total === 0 ? 0 : Math.round((correctCount / total) * 100),
      elapsed_seconds: payload.elapsed_seconds,
      details,
    }

    return result
  },
}
