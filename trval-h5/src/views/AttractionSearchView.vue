<script setup>
/**
 * 景点搜索页 — 历史 / 热门 / 榜单，点结果进详情
 */
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { searchAttractions, getAttractionHot } from '../api/attraction'
import { getToken } from '../utils/auth'
import EmptyState from '../components/EmptyState.vue'

const TYPE_ICON = {
  poi: { name: 'photo-o', bg: '#14b8a6' },
  landmark: { name: 'location-o', bg: '#14b8a6' },
  note: { name: 'comment-o', bg: '#94a3b8' },
  topic: { name: 'label-o', bg: '#3b82f6' },
  ai: { name: 'chat-o', bg: '#8B5CF6' },
  tour: { name: 'flag-o', bg: '#0d9488' },
  deal: { name: 'fire', bg: '#ef4444' },
}

const escapeHtml = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const highlight = (text, q) => {
  const raw = escapeHtml(text)
  const kw = (q || '').trim()
  if (!kw) return raw
  const esc = escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return raw.replace(new RegExp(esc, 'gi'), (m) => `<em>${m}</em>`)
}

defineOptions({ name: 'AttractionSearchView' })

const HISTORY_KEY = 'attraction_search_history'
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const keyword = ref('')
const history = ref([])
const hot = ref([])
const results = ref(null)
const searching = ref(false)
const searchError = ref('')

const loadHistory = () => {
  try { history.value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { history.value = [] }
}
const saveHistory = (q) => {
  const name = (q || '').trim()
  if (!name) return
  history.value = [name, ...history.value.filter(x => x !== name)].slice(0, 10)
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value))
}
const clearHistory = () => {
  history.value = []
  localStorage.removeItem(HISTORY_KEY)
}

const goDetail = (item) => {
  const query = item.uid
    ? { uid: item.uid, lat: item.lat, lng: item.lng }
    : { id: item.id }
  router.push({ path: '/attraction-detail', query })
}

let searchController
let requestId = 0
const runSearch = async (q, save = false) => {
  const text = (q ?? keyword.value).trim()
  if (keyword.value !== text) keyword.value = text
  if (!text) { results.value = null; searchError.value = ''; return }
  if (save) saveHistory(text)
  searchController?.abort()
  searchController = new AbortController()
  const currentRequest = ++requestId
  searching.value = true
  searchError.value = ''
  try {
    const data = await searchAttractions(text, { signal: searchController.signal })
    if (currentRequest === requestId) results.value = data
  } catch (error) {
    if (error?.name !== 'AbortError' && currentRequest === requestId) {
      results.value = []
      searchError.value = error?.message || t('attraction.searchFailed')
    }
  } finally {
    if (currentRequest === requestId) searching.value = false
  }
}

const pickKeyword = (name) => { keyword.value = name; runSearch(name, true) }
const submit = () => runSearch(keyword.value, true)
const clearKeyword = () => {
  searchController?.abort()
  requestId += 1
  keyword.value = ''
  results.value = null
  searchError.value = ''
  searching.value = false
}
const goBack = () => { if (window.history.length > 1) router.back(); else router.replace('/') }

const openHit = (item) => {
  if (item.type === 'ai') {
    if (!getToken()) {
      showToast({ message: t('common.notLoggedIn'), position: 'middle' })
      return
    }
    if (item.query) sessionStorage.setItem('selected_destination_spot', item.query)
    router.push('/agent-planner')
    return
  }
  if (item.type === 'note' || item.type === 'topic') {
    router.push('/community')
    return
  }
  if (item.id || item.uid) { goDetail(item); return }
  showToast({ message: t('attraction.moreSoon'), position: 'middle' })
}

const rightText = (item) => {
  if (item.type === 'landmark') return t('attraction.landmark')
  if (item.type === 'poi') return item.category || (item.price ? t('attraction.ticketFromShort', { n: item.price }) : '')
  if (item.price) return t('attraction.priceFrom', { n: item.price })
  return ''
}

let debounce
watch(keyword, (v) => {
  clearTimeout(debounce)
  if (!String(v).trim()) { clearKeyword(); return }
  debounce = setTimeout(() => runSearch(v, false), 300)
}, { flush: 'sync' })

onMounted(async () => {
  loadHistory()
  hot.value = await getAttractionHot().catch(() => [])
  if (route.query.q) {
    keyword.value = String(route.query.q)
    runSearch(keyword.value)
  }
})

onBeforeUnmount(() => {
  clearTimeout(debounce)
  searchController?.abort()
})
</script>

<template>
  <div class="as-page">
    <form class="as-nav" role="search" @submit.prevent="submit">
      <button type="button" class="as-back" :aria-label="t('common.back')" @click="goBack">
        <van-icon name="arrow-left" size="20" />
      </button>
      <div class="as-input-wrap">
        <van-icon name="search" size="16" color="#8B5CF6" />
        <input
          v-model="keyword"
          class="as-input"
          :placeholder="t('attraction.searchPlaceholder')"
          :aria-label="t('attraction.searchPlaceholder')"
          autocomplete="off"
          enterkeyhint="search"
        />
        <button v-if="keyword" type="button" class="as-clear" :aria-label="t('attraction.clearSearch')" @click="clearKeyword">
          <van-icon name="clear" size="16" color="#94A3B8" />
        </button>
      </div>
      <button type="submit" class="as-go" :disabled="searching || !keyword.trim()">
        {{ searching ? t('attraction.searching') : t('attraction.search') }}
      </button>
    </form>

    <div v-if="results !== null || searching || searchError" class="as-body as-body-hits">
      <div v-if="searching" class="as-loading" aria-live="polite">
        <van-skeleton v-for="i in 5" :key="i" title :row="1" class="as-skeleton" />
      </div>
      <EmptyState
        v-else-if="searchError"
        icon="replay"
        :title="t('attraction.searchFailed')"
        :desc="searchError"
        :btn-text="t('attraction.retry')"
        btn-type="gradient"
        @btn-click="submit"
      />
      <EmptyState
        v-else-if="!results.length"
        icon="search"
        :title="t('attraction.noResult')"
        :desc="t('attraction.noResultHint')"
        :btn-text="t('attraction.clearSearch')"
        @btn-click="clearKeyword"
      />
      <div v-else class="as-hits">
        <p class="as-result-count">{{ t('attraction.resultCount', { n: results.length }) }}</p>
        <button
          v-for="(item, i) in results"
          :key="item.type + (item.uid || item.id || i) + item.title"
          type="button"
          class="as-hit"
          @click="openHit(item)"
        >
          <span class="as-hit-icon" :style="{ background: (TYPE_ICON[item.type] || TYPE_ICON.poi).bg }">
            <van-icon :name="(TYPE_ICON[item.type] || TYPE_ICON.poi).name" size="12" color="#fff" />
          </span>
          <div class="as-hit-mid">
            <div class="as-hit-title">
              <span v-html="highlight(item.title, keyword)" />
              <span v-if="item.type === 'poi' && item.bookable" class="as-hit-tag">{{ t('attraction.bookTomorrow') }}</span>
            </div>
            <div v-if="item.type === 'poi'" class="as-hit-sub">
              <span v-if="item.heat" class="as-hit-heat">{{ t('attraction.heat', { n: item.heat }) }}</span>
              <span>{{ item.address }}</span>
            </div>
          </div>
          <span v-if="rightText(item)" class="as-hit-right" :class="{ price: item.price }">{{ rightText(item) }}</span>
          <van-icon name="arrow" size="14" color="#cbd5e1" />
        </button>
      </div>
      <button type="button" class="as-fab" @click="router.push({ path: '/feedback', query: { from: 'attraction-search' } })">
        <van-icon name="edit" size="16" />
        <span>{{ t('attraction.feedback') }}</span>
      </button>
    </div>

    <div v-else class="as-body">
      <div class="as-sec" v-if="history.length">
        <div class="as-sec-head">
          <span>{{ t('attraction.history') }}</span>
          <button type="button" class="as-sec-action" :aria-label="t('attraction.clearHistory')" @click="clearHistory">
            <van-icon name="delete-o" size="17" color="#94A3B8" />
          </button>
        </div>
        <div class="as-tags">
          <button v-for="h in history" :key="h" type="button" class="as-tag" @click="pickKeyword(h)">{{ h }}</button>
        </div>
      </div>

      <div class="as-sec">
        <div class="as-sec-head"><span>{{ t('attraction.hot') }}</span></div>
        <div class="as-tags">
          <button v-for="item in hot" :key="item.id" type="button" class="as-tag" @click="pickKeyword(item.name)">{{ item.name }}</button>
        </div>
      </div>

      <div class="as-tip-card">
        <van-icon name="info-o" size="18" color="#8B5CF6" />
        <div>
          <strong>{{ t('attraction.searchTipTitle') }}</strong>
          <p>{{ t('attraction.searchTip') }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.as-page {
  width: 100%; max-width: 480px; min-height: 100dvh; margin: 0 auto;
  background: rgba(255,255,255,.94); padding-bottom: 40px;
  box-shadow: 0 0 36px rgba(30,41,59,.06);
}
.as-nav {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; padding-top: calc(10px + env(safe-area-inset-top));
  position: sticky; top: 0; z-index: 10;
  background: rgba(255,255,255,.9); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.as-back, .as-clear, .as-sec-action {
  border: none; background: none; color: #1e293b; display: grid; place-items: center; cursor: pointer;
}
.as-back { width: 36px; height: 36px; border-radius: 50%; }
.as-clear { width: 30px; height: 30px; margin-right: -7px; }
.as-sec-action { width: 36px; height: 36px; margin: -10px -8px -10px 0; }
.as-input-wrap {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px;
  height: 36px; padding: 0 10px;
  border: 1.5px solid #8B5CF6; border-radius: 18px; background: #f8f5ff;
}
.as-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 14px; color: #1e293b; }
.as-clear { flex-shrink: 0; }
.as-go {
  border: none; background: #8B5CF6; color: #fff; font-size: 14px; font-weight: 600;
  padding: 0 14px; height: 36px; border-radius: 10px;
}
.as-go:disabled { opacity: .55; }
.as-body { padding: 8px 16px 24px; }
.as-sec { margin-bottom: 20px; }
.as-sec-head { display: flex; align-items: center; justify-content: space-between; font-size: 15px; font-weight: 700; color: #1e293b; margin-bottom: 10px; }
.as-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.as-tag {
  min-height: 36px; padding: 6px 12px; border: none; background: #f1f5f9;
  border-radius: 18px; font-size: 13px; color: #334155; cursor: pointer;
}
.as-tag:active { background: #ede9fe; color: #7c3aed; }
.as-tip-card {
  display: flex; align-items: flex-start; gap: 10px; margin-top: 26px; padding: 14px;
  border: 1px solid #ede9fe; border-radius: 14px; background: #faf8ff; color: #475569;
}
.as-tip-card strong { display: block; font-size: 13px; color: #334155; }
.as-tip-card p { margin: 4px 0 0; font-size: 12px; line-height: 1.55; color: #64748b; }
.as-body-hits { padding-bottom: 80px; }
.as-hits { display: flex; flex-direction: column; }
.as-result-count { margin: 4px 0 8px; font-size: 12px; color: #94a3b8; }
.as-hit {
  width: 100%; min-height: 64px; display: flex; align-items: center; gap: 9px; padding: 10px 0;
  border: none; border-bottom: 1px solid #f1f5f9; background: transparent; text-align: left; cursor: pointer;
}
.as-hit-icon {
  width: 22px; height: 22px; border-radius: 50%; flex-shrink: 0; margin-top: 2px;
  display: flex; align-items: center; justify-content: center;
}
.as-hit-mid { flex: 1; min-width: 0; }
.as-hit-title { font-size: 15px; color: #1e293b; line-height: 1.4; }
.as-hit-title :deep(em) { color: #8B5CF6; font-style: normal; font-weight: 700; }
.as-hit-tag { margin-left: 6px; font-size: 11px; color: #8B5CF6; font-weight: 500; }
.as-hit-sub { margin-top: 4px; font-size: 11px; color: #94a3b8; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.as-hit-heat { color: #ef4444; margin-right: 6px; }
.as-hit-right { flex-shrink: 0; font-size: 12px; color: #94a3b8; padding-top: 2px; }
.as-hit-right.price { color: #f97316; font-weight: 600; }
.as-loading { padding: 8px 0; }
.as-skeleton { padding: 14px 0; border-bottom: 1px solid #f1f5f9; }
.as-fab {
  position: fixed; right: 16px; bottom: 28px; z-index: 8;
  width: 48px; height: 48px; border: none; border-radius: 50%;
  background: #fff; color: #64748b; font-size: 10px;
  box-shadow: 0 4px 14px rgba(0,0,0,0.12);
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px;
}
@media (min-width: 641px) {
  .as-fab { right: calc((100vw - 480px) / 2 + 16px); }
}
@media (max-width: 360px) {
  .as-nav { padding-left: 8px; padding-right: 8px; gap: 6px; }
  .as-go { padding: 0 11px; }
}
</style>
