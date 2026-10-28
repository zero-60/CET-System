<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { listeningApi } from '../api/listening'
import type {
  AnswerOptionKey,
  AttemptDetail,
  AttemptResult,
  ListeningQuestionView,
} from '../api/listening'
import AudioPlayer from '../components/AudioPlayer.vue'

const question = ref<ListeningQuestionView | null>(null)
const answers = ref<Record<number, AnswerOptionKey | null>>({})
const result = ref<AttemptResult | null>(null)
const loading = ref(false)
const submitting = ref(false)
const errorMessage = ref('')
const startedAt = ref(Date.now())
const audioCurrentTime = ref(0)
const audioDuration = ref(0)

const answeredCount = computed(
  () => Object.values(answers.value).filter((answer) => answer !== null).length,
)
const questionCount = computed(
  () => question.value?.content.questions.length ?? 0,
)
const subtypeLabel = computed(() => {
  const labels: Record<string, string> = {
    news: '新闻报道',
    conversation: '长对话',
    passage: '听力短文',
  }
  return question.value
    ? labels[question.value.content.subtype] ?? question.value.content.subtype
    : ''
})

function getDetail(questionNo: number): AttemptDetail | undefined {
  return result.value?.details.find((detail) => detail.question_no === questionNo)
}

function selectOption(questionNo: number, option: string) {
  if (result.value || !['A', 'B', 'C', 'D'].includes(option)) return
  answers.value[questionNo] = option as AnswerOptionKey
}

async function loadQuestion() {
  loading.value = true
  errorMessage.value = ''
  result.value = null

  try {
    const data = await listeningApi.getQuestion()
    question.value = data
    answers.value = Object.fromEntries(
      data.content.questions.map((item) => [item.question_no, null]),
    )
    startedAt.value = Date.now()
    audioCurrentTime.value = 0
    audioDuration.value = 0
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '加载听力题目失败，请稍后重试。'
  } finally {
    loading.value = false
  }
}

async function submitAnswers() {
  if (!question.value || result.value || submitting.value) return

  const unanswered = questionCount.value - answeredCount.value
  if (unanswered > 0) {
    const confirmed = window.confirm(
      `还有 ${unanswered} 道题未作答，确定现在提交吗？`,
    )
    if (!confirmed) return
  }

  submitting.value = true
  errorMessage.value = ''

  try {
    result.value = await listeningApi.submitAttempt({
      question_id: question.value.question_id,
      answers: { ...answers.value },
      mode: 'training',
      elapsed_seconds: Math.max(0, Math.floor((Date.now() - startedAt.value) / 1000)),
    })
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : '提交失败，请检查网络后重试。'
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  void loadQuestion()
})
</script>

<template>
  <main class="page-shell">
    <header class="app-header">
      <div class="brand-mark" aria-hidden="true">听</div>
      <div class="header-copy">
        <p class="eyebrow">CET LISTENING WORKSPACE</p>
        <h1>听力训练</h1>
      </div>
      <span class="mode-badge">MOCK 模式</span>
    </header>

    <section v-if="loading" class="state-card">
      <div class="loading-dot"></div>
      <h2>正在加载听力材料</h2>
      <p>正在通过统一的 listeningApi 获取数据。</p>
    </section>

    <section v-else-if="errorMessage && !question" class="state-card error-card">
      <h2>暂时无法加载材料</h2>
      <p>{{ errorMessage }}</p>
      <button class="primary-button" type="button" @click="loadQuestion">
        重试
      </button>
    </section>

    <template v-else-if="question">
      <section class="hero-card">
        <div class="hero-main">
          <span class="section-tag">{{ subtypeLabel }}</span>
          <h2>{{ question.title }}</h2>
          <p>
            当前使用本地模拟题目和判分；音频播放器已连接本地 MP3 文件。
          </p>
        </div>
        <div class="hero-stats">
          <div>
            <strong>{{ answeredCount }}/{{ questionCount }}</strong>
            <span>已作答</span>
          </div>
          <div>
            <strong>{{ result ? `${result.accuracy}%` : '—' }}</strong>
            <span>正确率</span>
          </div>
        </div>
      </section>

      <section class="audio-section">
        <div class="section-heading audio-section-heading">
          <div>
            <p class="eyebrow">LISTENING AUDIO</p>
            <h2>听力音频</h2>
          </div>
          <span class="progress-label">
            {{ audioDuration ? `${Math.floor(audioCurrentTime)} / ${Math.floor(audioDuration)} 秒` : '等待读取音频时长' }}
          </span>
        </div>

        <AudioPlayer
          :src="question.content.audio_url"
          :title="question.title"
          @timeupdate="audioCurrentTime = $event"
          @durationchange="audioDuration = $event"
        />

        <p class="audio-help">
          如果无法播放，请确认文件已放在 <code>public/audio/listening-1.mp3</code>。
        </p>
      </section>

      <div class="section-heading">
        <div>
          <p class="eyebrow">QUESTIONS</p>
          <h2>开始答题</h2>
        </div>
        <span class="progress-label">已完成 {{ answeredCount }} / {{ questionCount }}</span>
      </div>

      <section class="question-list">
        <article
          v-for="item in question.content.questions"
          :key="item.question_no"
          class="question-card"
        >
          <div class="question-top">
            <span class="question-number">Q{{ item.question_no }}</span>
            <span
              class="question-status"
              :class="{
                'status-done': answers[item.question_no] !== null,
                'status-correct': result && getDetail(item.question_no)?.correct,
                'status-wrong': result && !getDetail(item.question_no)?.correct,
              }"
            >
              {{
                result
                  ? (getDetail(item.question_no)?.correct ? '回答正确' : '回答错误')
                  : (answers[item.question_no] !== null ? '已作答' : '未作答')
              }}
            </span>
          </div>

          <h3>{{ item.stem }}</h3>

          <div class="option-grid">
            <button
              v-for="(optionText, optionKey) in item.options"
              :key="optionKey"
              class="option-button"
              :class="{
                selected: answers[item.question_no] === optionKey,
                'correct-option':
                  result && getDetail(item.question_no)?.correct_key === optionKey,
                'wrong-option':
                  result &&
                  answers[item.question_no] === optionKey &&
                  !getDetail(item.question_no)?.correct,
              }"
              type="button"
              :disabled="!!result"
              @click="selectOption(item.question_no, optionKey)"
            >
              <span class="option-key">{{ optionKey }}</span>
              <span>{{ optionText }}</span>
            </button>
          </div>

          <div v-if="result && getDetail(item.question_no)" class="explanation">
            <strong>
              正确答案：{{ getDetail(item.question_no)?.correct_key }}
            </strong>
            <p>{{ getDetail(item.question_no)?.explanation }}</p>
          </div>
        </article>
      </section>

      <p v-if="errorMessage" class="inline-error">{{ errorMessage }}</p>

      <footer class="action-bar">
        <div class="action-summary">
          <strong>作答进度 {{ answeredCount }} / {{ questionCount }}</strong>
          <p>
            {{ result ? '本次模拟判分已完成。' : '提交后将显示模拟成绩和逐题解析。' }}
          </p>
        </div>
        <div class="action-buttons">
          <button
            v-if="!result"
            class="primary-button"
            type="button"
            :disabled="submitting || loading"
            @click="submitAnswers"
          >
            {{ submitting ? '提交中…' : '提交答案' }}
          </button>
          <button
            v-else
            class="primary-button"
            type="button"
            @click="loadQuestion"
          >
            重新练习
          </button>
        </div>
      </footer>

      <section v-if="result" class="result-card">
        <div>
          <p class="eyebrow">MOCK RESULT</p>
          <h2>本次练习已完成</h2>
          <p>
            这是本地模拟判分结果。接入真实后端后，成绩将以服务端返回值为准。
          </p>
          <span class="attempt-id">记录编号：{{ result.attempt_id }}</span>
        </div>
        <div class="result-score">
          <strong>{{ result.correct_count }}/{{ result.total }}</strong>
          <span>正确题数</span>
        </div>
      </section>
    </template>

    <footer class="page-footer">
      前端开发阶段 · Mock 题目与判分仅用于验证交互，不代表正式真题或真实成绩
    </footer>
  </main>
</template>
