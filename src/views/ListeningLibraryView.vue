<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import './ListeningLibraryView.css'

type AudioStatus = 'named' | 'unassigned' | 'missing' | 'multiple'
type ExamLevel = 'cet4' | 'cet6'

interface CatalogPaper {
  id: string
  level: ExamLevel
  year: number
  session: string
  paper: string
  has_question_pdf: boolean
  has_analysis_pdf: boolean
  audio_status: AudioStatus
  unique_audio_files: number
  unassigned_session_audio_files: number
  practice_ready: boolean
}
interface Catalog {
  catalog_kind: string
  total_exam_papers: number
  items: CatalogPaper[]
}

const rows = ref<CatalogPaper[]>([])
const loading = ref(true)
const error = ref('')
const level = ref<'all' | ExamLevel>('cet4')
const year = ref('all')
const session = ref('all')
const selected = ref<CatalogPaper | null>(null)
const previewablePapers = ref<Set<string>>(new Set())
const years = computed(() =>
  [...new Set(rows.value.map((x) => x.year))].sort((a, b) => b - a)
)
const visible = computed(() => rows.value.filter((r) =>
  (level.value === 'all' || r.level === level.value) &&
  (year.value === 'all' || String(r.year) === year.value) &&
  (session.value === 'all' || r.session === session.value)
))
const readyCount = computed(() => visible.value.filter(x => x.practice_ready).length)
const withBothPdfs = computed(() =>
  visible.value.filter(x => x.has_question_pdf && x.has_analysis_pdf).length
)

function audioLabel(status: AudioStatus) {
  const map: Record<AudioStatus, string> = {
    named: '发现该套音频',
    unassigned: '仅发现未归属音频',
    missing: '未找到对应音频',
    multiple: '多条音频待核对',
  }
  return map[status]
}

function labelFor(r: CatalogPaper) {
  return `${r.level === 'cet4' ? '四级' : '六级'} · ${r.year} 年 ${r.session === '06' ? '6 月' : r.session === '12' ? '12 月' : '9 月'} · 第 ${r.paper} 套`
}

async function loadCatalog() {
  error.value = ''
  loading.value = true
  try {
    const base = import.meta.env.BASE_URL
    const response = await fetch(`${base}data/listening-catalog.json`, { cache: 'no-store' })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = (await response.json()) as Catalog
    if (data.catalog_kind !== 'file-inventory-not-question-bank' || !Array.isArray(data.items)) {
      throw new Error('目录 JSON 格式不正确')
    }
    rows.value = data.items
    // Material-preview availability is separate from practice_ready.
    // A preview can show authentic option text without claiming backend grading is ready.
    try {
      const manifestResponse = await fetch(`${base}data/listening-questions/manifest.json`, { cache: 'no-store' })
      if (manifestResponse.ok) {
        const manifest = await manifestResponse.json() as { papers?: Array<{ paper_id: string }> }
        previewablePapers.value = new Set((manifest.papers || []).map((paper) => paper.paper_id))
      }
    } catch {
      previewablePapers.value = new Set()
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => { void loadCatalog() })
</script>

<template>
  <main class="catalog-shell">
    <header class="catalog-header">
      <div>
        <p class="catalog-eyebrow">CET PRACTICE LIBRARY</p>
        <h1>听力真题资料库</h1>
        <p>先把你的本地文件整理成可查询的目录，再逐套完成音频、题目和解析的数据关联。</p>
      </div>
      <RouterLink class="catalog-demo-link" to="/listening">打开模拟练习</RouterLink>
    </header>

    <div class="catalog-notice">
      <strong>当前处于资料整理阶段</strong>
      <p>资料“已发现”表示清单中有文件线索，不代表已经自动读取题目，也不代表可以开始真实判分。真实入库前不要把第三套自动指向第一套音频。</p>
    </div>

    <section class="catalog-filter-panel">
      <label>
        考试级别
        <select v-model="level">
          <option value="all">全部</option>
          <option value="cet4">英语四级</option>
          <option value="cet6">英语六级</option>
        </select>
      </label>
      <label>
        年份
        <select v-model="year">
          <option value="all">全部年份</option>
          <option v-for="option in years" :key="option" :value="String(option)">{{ option }}</option>
        </select>
      </label>
      <label>
        场次
        <select v-model="session">
          <option value="all">全部场次</option>
          <option value="06">6 月</option>
          <option value="09">9 月</option>
          <option value="12">12 月</option>
        </select>
      </label>
    </section>

    <section class="catalog-stat-row">
      <div><strong>{{ visible.length }}</strong><span>候选套卷</span></div>
      <div><strong>{{ withBothPdfs }}</strong><span>真题与解析都有线索</span></div>
      <div><strong>{{ readyCount }}</strong><span>已完成数据入库</span></div>
    </section>

    <section v-if="loading" class="catalog-empty">正在读取本地资料目录……</section>
    <section v-else-if="error" class="catalog-empty catalog-error">
      <p>目录加载失败：{{ error }}</p>
      <p>请运行 <code>node scripts/build-cet-catalog.mjs "F:\CET\cet-inventory\inventory.csv"</code> 生成数据。</p>
      <button type="button" @click="loadCatalog">重新加载</button>
    </section>
    <section v-else-if="visible.length === 0" class="catalog-empty">当前筛选条件下没有资料。</section>
    <section v-else class="catalog-grid">
      <button
        v-for="item in visible"
        :key="item.id"
        type="button"
        class="catalog-paper"
        :class="{ 'catalog-paper-active': selected?.id === item.id }"
        @click="selected = item"
      >
        <span class="catalog-paper-top">
          <span class="catalog-paper-level">{{ item.level === 'cet4' ? 'CET-4' : 'CET-6' }}</span>
          <span class="catalog-paper-status">{{ item.practice_ready ? '已入库' : '待整理' }}</span>
        </span>
        <strong>{{ labelFor(item) }}</strong>
        <span class="catalog-file-row">
          <span :class="item.has_question_pdf ? 'catalog-found' : 'catalog-missing'">{{ item.has_question_pdf ? '✓' : '—' }} 真题</span>
          <span :class="item.has_analysis_pdf ? 'catalog-found' : 'catalog-missing'">{{ item.has_analysis_pdf ? '✓' : '—' }} 解析</span>
        </span>
        <span class="catalog-audio" :class="`audio-${item.audio_status}`">{{ audioLabel(item.audio_status) }}</span>
      </button>
    </section>

    <section v-if="selected" class="catalog-detail">
      <div>
        <p class="catalog-eyebrow">SELECTED PAPER</p>
        <h2>{{ labelFor(selected) }}</h2>
        <p>题目文件：{{ selected.has_question_pdf ? '找到文件线索' : '未找到' }}；解析文件：{{ selected.has_analysis_pdf ? '找到文件线索' : '未找到' }}。</p>
        <p>音频状态：{{ audioLabel(selected.audio_status) }}。{{ selected.audio_status === 'unassigned' ? '该场次存在音频文件，但尚不能判断属于哪套。' : '' }}</p>
        <p>下一步需要完成音频材料起止时间核对、题目文字复核，并由后端维护标准答案后才能开放正式练习。</p>
        <RouterLink
          v-if="previewablePapers.has(selected.id)"
          :to="`/listening/paper/${selected.id}`"
          class="catalog-preview-link"
        >查看已整理的真实选项（暂不判分）</RouterLink>
      </div>
      <span class="catalog-detail-mark">尚不可正式作答</span>
    </section>

    <footer class="catalog-footer">
      目录数据由本地 CSV 生成。未上传原始 PDF 或 MP3，亦不包含答案和本地绝对路径。
    </footer>
  </main>
</template>
