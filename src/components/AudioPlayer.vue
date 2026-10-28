<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import './AudioPlayer.css'

const props = defineProps<{
  src: string
  title?: string
  /** Optional VERIFIED range boundaries in seconds of the source file. */
  startTime?: number
  endTime?: number
}>()

const emit = defineEmits<{
  timeupdate: [absoluteSeconds: number]
  durationchange: [segmentDurationSeconds: number]
  ended: []
  error: [message: string]
}>()

const audio = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const isLoading = ref(false)
const currentTime = ref(0)
const fileDuration = ref(0)
const playbackRate = ref(1)
const volume = ref(1)
const playerError = ref('')
const isSeeking = ref(false)
const seekValue = ref(0)
const reachedEnd = ref(false)

const speedOptions = [0.75, 1, 1.25, 1.5, 2]

const startBound = computed(() => {
  const candidate = props.startTime
  if (candidate === undefined || !Number.isFinite(candidate) || candidate < 0) return 0
  return Math.min(candidate, fileDuration.value || candidate)
})
const endBound = computed(() => {
  const candidate = props.endTime
  if (candidate === undefined || !Number.isFinite(candidate) || candidate <= startBound.value) return fileDuration.value
  return Math.min(candidate, fileDuration.value || candidate)
})
const segmentDuration = computed(() => Math.max(0, endBound.value - startBound.value))
const shownTime = computed(() => Math.min(segmentDuration.value, Math.max(0, currentTime.value - startBound.value)))
const progress = computed(() => segmentDuration.value > 0 ? Math.min(100, (shownTime.value / segmentDuration.value) * 100) : 0)

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const whole = Math.floor(seconds)
  const minutes = Math.floor(whole / 60)
  const remaining = whole % 60
  const hours = Math.floor(minutes / 60)
  const mm = String(minutes % 60).padStart(2, '0')
  const ss = String(remaining).padStart(2, '0')
  return hours ? `${String(hours).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`
}

async function togglePlayback() {
  const el = audio.value
  if (!el || !props.src) return
  playerError.value = ''
  if (!el.paused) { el.pause(); return }
  if (reachedEnd.value || el.currentTime >= endBound.value - 0.05) {
    el.currentTime = startBound.value
    reachedEnd.value = false
  }
  isLoading.value = true
  try {
    await el.play()
  } catch {
    playerError.value = '音频播放失败。请确认文件路径和格式。'
    emit('error', playerError.value)
  } finally {
    isLoading.value = false
  }
}

function onMetadata() {
  const el = audio.value
  if (!el || !Number.isFinite(el.duration)) return
  fileDuration.value = el.duration
  el.playbackRate = playbackRate.value
  el.volume = volume.value
  if (el.currentTime < startBound.value || el.currentTime > endBound.value) el.currentTime = startBound.value
  currentTime.value = el.currentTime
  seekValue.value = shownTime.value
  emit('durationchange', segmentDuration.value)
}

function finish() {
  if (reachedEnd.value) return
  reachedEnd.value = true
  isPlaying.value = false
  emit('ended')
}

function onTimeUpdate() {
  const el = audio.value
  if (!el) return
  if (segmentDuration.value > 0 && el.currentTime >= endBound.value - 0.025) {
    if (!el.paused) el.pause()
    // Keep the absolute position of the last sample for timing annotations.
    currentTime.value = endBound.value
    emit('timeupdate', currentTime.value)
    finish()
    return
  }
  currentTime.value = el.currentTime
  if (!isSeeking.value) seekValue.value = shownTime.value
  emit('timeupdate', currentTime.value)
}

function onSeekInput(value: string) {
  isSeeking.value = true
  seekValue.value = Number(value)
}

function onSeekCommit() {
  const el = audio.value
  if (el) {
    const relative = Math.min(Math.max(0, seekValue.value), segmentDuration.value)
    el.currentTime = startBound.value + relative
    currentTime.value = el.currentTime
    reachedEnd.value = false
    emit('timeupdate', currentTime.value)
  }
  isSeeking.value = false
}

function setSpeed(value: string) {
  const next = Number(value)
  if (!speedOptions.includes(next)) return
  playbackRate.value = next
  if (audio.value) audio.value.playbackRate = next
}

function setVolume(value: string) {
  const next = Math.max(0, Math.min(1, Number(value)))
  volume.value = next
  if (audio.value) audio.value.volume = next
}

function onAudioError() {
  playerError.value = '无法读取 MP3。请先复制音频到项目 public/audio 目录，并检查 audio_url。'
  isLoading.value = false
  isPlaying.value = false
  emit('error', playerError.value)
}

watch(() => [props.src, props.startTime, props.endTime], () => {
  const el = audio.value
  if (!el) return
  el.pause()
  isPlaying.value = false
  reachedEnd.value = false
  currentTime.value = 0
  fileDuration.value = 0
  seekValue.value = 0
  playerError.value = ''
  el.load()
}, { flush: 'post' })

onBeforeUnmount(() => { audio.value?.pause() })
</script>

<template>
  <section class="audio-player" aria-label="听力音频播放器">
    <audio
      ref="audio" :src="src || undefined" preload="metadata"
      @play="isPlaying = true" @pause="isPlaying = false"
      @loadedmetadata="onMetadata" @timeupdate="onTimeUpdate"
      @ended="finish" @error="onAudioError"
    />
    <div class="audio-player-main">
      <button
        class="audio-play-button" type="button" :disabled="!src || isLoading"
        :aria-label="isPlaying ? '暂停音频' : '播放音频'" @click="togglePlayback"
      >
        <span v-if="isLoading" class="audio-spinner" aria-hidden="true"></span>
        <svg v-else-if="isPlaying" viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1.2"/><rect x="14" y="4" width="4" height="16" rx="1.2"/></svg>
        <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10-6.5z"/></svg>
      </button>
      <div class="audio-track-area">
        <div class="audio-track-heading">
          <div><strong>{{ title || '听力音频' }}</strong><span class="audio-track-subtitle">{{ isLoading ? '正在加载音频…' : isPlaying ? '正在播放' : '准备就绪' }}</span></div>
          <span class="audio-time">{{ formatTime(shownTime) }} / {{ formatTime(segmentDuration) }}</span>
        </div>
        <input
          type="range" class="audio-seek" min="0" :max="segmentDuration || 0" step="0.1"
          :value="isSeeking ? seekValue : shownTime" :style="{ '--audio-progress': `${progress}%` }"
          :disabled="!src || !segmentDuration" aria-label="音频播放进度"
          @input="onSeekInput(($event.target as HTMLInputElement).value)" @change="onSeekCommit"
        />
      </div>
    </div>
    <div class="audio-player-controls">
      <label class="audio-control">倍速
        <select :value="playbackRate" aria-label="播放倍速" @change="setSpeed(($event.target as HTMLSelectElement).value)">
          <option v-for="speed in speedOptions" :key="speed" :value="speed">{{ speed }}×</option>
        </select>
      </label>
      <label class="audio-volume-control">音量
        <input type="range" min="0" max="1" step="0.05" :value="volume" aria-label="音量"
          @input="setVolume(($event.target as HTMLInputElement).value)"/>
      </label>
    </div>
    <p v-if="playerError" class="audio-player-error" role="alert">{{ playerError }}</p>
  </section>
</template>
