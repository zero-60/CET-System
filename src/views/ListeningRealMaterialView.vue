<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AudioPlayer from '../components/AudioPlayer.vue'
import { listeningApi } from '../api/listening'
import type { AnswerOptionKey, AttemptResult, ListeningQuestionView } from '../api/listening/types'
import { getMaterialById, getPaperManifest, realBackendEnabled, type PaperManifest } from '../api/listening/realMaterials'
import './ListeningReal.css'

const route = useRoute()
const loading = ref(true)
const submitting = ref(false)
const error = ref('')
const message = ref('')
const material = ref<ListeningQuestionView | null>(null)
const paper = ref<PaperManifest | null>(null)
const answers = ref<Record<number, AnswerOptionKey | null>>({})
const result = ref<AttemptResult | null>(null)
const localSubmitted = ref(false)
const audioTime = ref(0)
const startedAt = ref(Date.now())
const draftStart = ref<number | null>(null)
const draftEnd = ref<number | null>(null)

const materialId = computed(() => String(route.params.materialId || ''))
const answeredCount = computed(() => Object.values(answers.value).filter(Boolean).length)
const total = computed(() => material.value?.content.questions.length || 0)
const draftReady = computed(() => draftStart.value !== null && draftEnd.value !== null && draftEnd.value > draftStart.value)

function choose(questionNo: number, key: string) {
  if (result.value || localSubmitted.value) return
  if (!['A','B','C','D'].includes(key)) return
  answers.value[questionNo] = key as AnswerOptionKey
}

function detailFor(number: number) {
  return result.value?.details.find((d) => d.question_no === number)
}

function storeDraft() {
  if (!material.value) return
  // Only a temporary developer annotation. Not a learning record or authoritative timing.
  const payload = { question_id: material.value.question_id, start: draftStart.value, end: draftEnd.value }
  localStorage.setItem(`time-draft:${material.value.question_id}`, JSON.stringify(payload))
}

function setBoundary(field: 'start' | 'end') {
  const value = Math.round(audioTime.value * 100) / 100
  if (field === 'start') draftStart.value = value
  else draftEnd.value = value
  storeDraft()
  message.value = `${field === 'start' ? '起点' : '终点'}已暂存：${value.toFixed(2)} 秒（未写入正式题库）`
}

function exportDraft() {
  if (!material.value || !draftReady.value) return
  const payload = {
    question_id: material.value.question_id,
    audio_url: material.value.content.audio_url,
    proposed_time_range: { start: draftStart.value, end: draftEnd.value },
    verified: false,
    note: '用户试听手动标注，仅为待复核草稿，不得自动视为准确音频片段。',
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${material.value.question_id}.time-draft.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

async function submit() {
  if (!material.value || submitting.value || result.value || localSubmitted.value) return
  const unfilled = total.value - answeredCount.value
  if (unfilled && !window.confirm(`还有 ${unfilled} 道题没选答案，仍然继续吗？`)) return
  error.value = ''
  message.value = ''
  if (!realBackendEnabled) {
    localSubmitted.value = true
    message.value = '本地预览已收集你的选项，但没有真实判分。等队友接入后端标准答案后才能显示正式结果。'
    return
  }
  submitting.value = true
  try {
    const response = await listeningApi.submitAttempt({
      question_id: material.value.question_id,
      answers: { ...answers.value },
      mode: 'training',
      elapsed_seconds: Math.floor((Date.now() - startedAt.value) / 1000),
    })
    if (!response.can_judge) throw new Error('后端当前无法判分，请检查题库答案与接口状态')
    result.value = response
    message.value = '已收到后端真实判分结果。'
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '提交失败，请稍后重试'
  } finally {
    submitting.value = false
  }
}

function retryLocal() {
  localSubmitted.value = false
  message.value = ''
  result.value = null
  if (material.value) answers.value = Object.fromEntries(material.value.content.questions.map(q => [q.question_no, null]))
  startedAt.value = Date.now()
}

watch(materialId, async () => {
  loading.value = true
  error.value = ''
  message.value = ''
  result.value = null
  localSubmitted.value = false
  material.value = null
  paper.value = null
  audioTime.value = 0
  draftStart.value = null
  draftEnd.value = null
  try {
    const [data, manifest] = await Promise.all([getMaterialById(materialId.value), getPaperManifest()])
    material.value = data
    paper.value = manifest.papers.find(p => p.materials.some(m => m.question_id === data.question_id)) || null
    answers.value = Object.fromEntries(data.content.questions.map(q => [q.question_no, null]))
    startedAt.value = Date.now()
    const saved = localStorage.getItem(`time-draft:${data.question_id}`)
    if (saved) {
      const previous = JSON.parse(saved) as { start?: number; end?: number }
      draftStart.value = typeof previous.start === 'number' && Number.isFinite(previous.start) ? previous.start : null
      draftEnd.value = typeof previous.end === 'number' && Number.isFinite(previous.end) ? previous.end : null
    }
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '材料加载失败'
  } finally {
    loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <main class="real-shell">
    <nav class="real-breadcrumb">
      <RouterLink to="/listening/library">资料库</RouterLink>
      <span>›</span>
      <RouterLink v-if="paper" :to="`/listening/paper/${paper.paper_id}`">{{ paper.title }}</RouterLink>
      <span>›</span><span>材料预览</span>
    </nav>

    <div v-if="loading" class="real-status">正在加载真实题目选项…</div>
    <div v-else-if="error && !material" class="real-status">{{ error }}</div>
    <template v-else-if="material">
      <section class="real-hero">
        <p class="real-overline">QUESTION PREVIEW · {{ material.content.subtype.toUpperCase() }}</p>
        <h1>{{ material.title }}</h1>
        <p>本组 {{ total }} 道题，已选 {{ answeredCount }} 道。选项来自原卷扫描页；尚未提供听力问题文本、SRT 字幕或标准答案。</p>
      </section>
      <div class="real-notice">
        <strong>{{ realBackendEnabled ? '后端联调模式' : '真实选项预览 / 不判分' }}</strong>
        <p>当前播放的是整套约 18 分 21 秒的音频，尚未核对这组材料在合集中的起止秒数。请先试听定位，避免误认为这段音频已自动切分。</p>
      </div>

      <section class="real-audio-wrap">
        <h2>听力音频（完整合集）</h2>
        <AudioPlayer
          :key="material.question_id"
          :src="material.content.audio_url"
          :title="`${material.title} / 原始整卷录音`"
          :start-time="material.content.time_range?.start"
          :end-time="material.content.time_range?.end"
          @timeupdate="audioTime = $event"
        />
        <div class="real-timing">
          <div class="real-timing-head">
            <strong>试听标注时间区间（可选）</strong>
            <span>当前：{{ audioTime.toFixed(2) }} 秒</span>
          </div>
          <p>把播放进度拖到本组开头、结尾，各点一次记录。标注仅保存在本机，不会自动认定为正确时间轴。</p>
          <div class="real-timing-buttons">
            <button type="button" @click="setBoundary('start')">记录当前为起点</button>
            <button type="button" @click="setBoundary('end')">记录当前为终点</button>
            <button type="button" :disabled="!draftReady" @click="exportDraft">导出时间草稿 JSON</button>
          </div>
          <p class="real-timing-values">起点 {{ draftStart ?? '未设' }} s · 终点 {{ draftEnd ?? '未设' }} s</p>
          <p v-if="draftStart !== null && draftEnd !== null && draftEnd <= draftStart" class="real-error">终点必须大于起点，请重新标注。</p>
        </div>
      </section>

      <section class="real-questions">
        <div class="real-question-heading">
          <h2>原卷选项</h2><span>已作答 {{ answeredCount }} / {{ total }}</span>
        </div>
        <article v-for="q in material.content.questions" :key="q.question_no" class="real-question">
          <div class="real-question-top"><span>Question {{ q.question_no }}</span><small>{{ answers[q.question_no] ? '已选择' : '未选择' }}</small></div>
          <p class="real-stem">原卷未印出此题完整英文问句，请在录音中听题。此处不编造题干。</p>
          <div class="real-option-grid">
            <button
              v-for="(optionText,key) in q.options"
              :key="key" type="button"
              :disabled="!!result || localSubmitted"
              :class="['real-option', { chosen: answers[q.question_no] === key, 'server-correct': result && detailFor(q.question_no)?.correct_key === key }]"
              @click="choose(q.question_no, key)"
            ><strong>{{ key }}</strong><span>{{ optionText }}</span></button>
          </div>
          <div v-if="result && detailFor(q.question_no)" class="real-explanation">
            {{ detailFor(q.question_no)?.correct ? '正确' : '错误' }} · 正确答案：{{ detailFor(q.question_no)?.correct_key }}
            <p>{{ detailFor(q.question_no)?.explanation }}</p>
          </div>
        </article>
      </section>

      <div class="real-actions">
        <span>{{ result ? `后端判分：${result.correct_count}/${result.total}` : realBackendEnabled ? '真实后端模式：可尝试提交' : '本地预览：提交只会锁定选项，不给分' }}</span>
        <button v-if="!localSubmitted && !result" type="button" :disabled="submitting" @click="submit">{{ submitting ? '提交中…' : realBackendEnabled ? '提交到后端判分' : '完成本组预览（不判分）' }}</button>
        <button v-else type="button" @click="retryLocal">重新选择</button>
      </div>
      <p v-if="message" class="real-feedback">{{ message }}</p>
      <p v-if="error" class="real-error">{{ error }}</p>
    </template>
  </main>
</template>
