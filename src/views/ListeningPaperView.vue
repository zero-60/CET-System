<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { getPaperManifest, type PaperManifest } from '../api/listening/realMaterials'
import './ListeningReal.css'

const route = useRoute()
const paper = ref<PaperManifest | null>(null)
const loading = ref(true)
const error = ref('')
const paperId = computed(() => String(route.params.paperId || ''))

watch(paperId, async () => {
  loading.value = true
  error.value = ''
  paper.value = null
  try {
    const manifest = await getPaperManifest()
    paper.value = manifest.papers.find((item) => item.paper_id === paperId.value) || null
    if (!paper.value) error.value = '该套试卷尚未完成初步题目整理。'
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '无法加载材料列表'
  } finally {
    loading.value = false
  }
}, { immediate: true })
</script>

<template>
  <main class="real-shell">
    <nav class="real-breadcrumb">
      <RouterLink to="/listening/library">听力资料库</RouterLink><span>›</span><span>套卷材料</span>
    </nav>
    <div v-if="loading" class="real-status">正在读取套卷材料…</div>
    <div v-else-if="error" class="real-status">{{ error }}</div>
    <template v-else-if="paper">
      <section class="real-hero">
        <p class="real-overline">AUTHENTIC PAPER · QUESTION PREVIEW</p>
        <h1>{{ paper.title }}</h1>
        <p>已按原卷结构分为 {{ paper.materials.length }} 组，含 25 道听力选项。当前仅用于核对和预览，不提供虚假的标准答案或正式成绩。</p>
      </section>
      <div class="real-notice">
        <strong>目前只校对了试卷上的选项</strong>
        <p>{{ paper.question_note }}</p>
        <p>{{ paper.audio_note }}</p>
        <p>{{ paper.answer_status }}；{{ paper.transcript_status }}。</p>
      </div>
      <section class="real-grid">
        <RouterLink
          v-for="(item,index) in paper.materials"
          :key="item.question_id"
          class="real-material-card"
          :to="`/listening/material/${item.question_id}`"
        >
          <span>材料 {{ index+1 }} · {{ item.subtype.toUpperCase() }}</span>
          <strong>{{ item.title }}</strong>
          <small>题号 {{ item.numbers.join('、') }}</small>
          <em>查看题目选项</em>
        </RouterLink>
      </section>
      <p class="real-bottom-note">来源：{{ paper.source }}。逐题文字在正式入库前仍建议与 PDF 原卷进行一次人工复核。</p>
    </template>
  </main>
</template>
