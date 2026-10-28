import { createRouter, createWebHistory } from 'vue-router'
import ListeningPracticeView from '../views/ListeningPracticeView.vue'
import ListeningLibraryView from '../views/ListeningLibraryView.vue'
import ListeningPaperView from '../views/ListeningPaperView.vue'
import ListeningRealMaterialView from '../views/ListeningRealMaterialView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/listening/library' },
    { path: '/listening/library', name: 'listening-library', component: ListeningLibraryView },
    { path: '/listening/paper/:paperId', name: 'listening-paper', component: ListeningPaperView },
    { path: '/listening/material/:materialId', name: 'listening-material', component: ListeningRealMaterialView },
    // 保留之前的 Mock 练习页面地址，不修改其答题、播放器及 API 层。
    { path: '/listening', name: 'listening', component: ListeningPracticeView },
  ],
})
