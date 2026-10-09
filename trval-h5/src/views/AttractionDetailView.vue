<script setup>
/**
 * 景点详情 — 头图 + 信息卡 + 时段/门票 + 地址 + Tab（对齐携程图三）
 */
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, showImagePreview, Swipe, SwipeItem } from 'vant'
import { getAttractionDetail, getNearbyAttractions } from '../api/attraction'
import { getToken } from '../utils/auth'
import { getMyData, setMyData } from '../utils/userAccountStorage'
import EmptyState from '../components/EmptyState.vue'

defineOptions({ name: 'AttractionDetailView' })

const GUEST_FAV_KEY = 'attraction_fav_ids'
const router = useRouter()
const route = useRoute()
const { t } = useI18n()

const spot = ref(null)
const status = ref('loading')
const errorMessage = ref('')
const nearbyLoading = ref(false)
const nearbyError = ref('')
const tab = ref('guide')
const favIds = ref([])

const loadFav = () => {
  try {
    favIds.value = getToken()
      ? (getMyData('attractionFavorites') || [])
      : JSON.parse(localStorage.getItem(GUEST_FAV_KEY) || '[]')
  } catch { favIds.value = [] }
}
const spotKey = computed(() => spot.value?.uid || spot.value?.id || spot.value?.name || '')
const isFav = computed(() => spotKey.value && favIds.value.includes(spotKey.value))
const hasCoordinates = computed(() => Number.isFinite(Number(spot.value?.lat)) && Number.isFinite(Number(spot.value?.lng)))

let loadController
let loadId = 0
const routeTarget = () => ({
  id: route.query.id ? String(route.query.id) : '',
  uid: route.query.uid ? String(route.query.uid) : '',
  lat: route.query.lat,
  lng: route.query.lng,
})

const load = async (target = routeTarget()) => {
  loadController?.abort()
  loadController = new AbortController()
  const currentLoad = ++loadId
  spot.value = null
  errorMessage.value = ''
  nearbyLoading.value = false
  nearbyError.value = ''
  tab.value = 'guide'
  window.scrollTo(0, 0)
  const hasTargetCoordinates = target.lat !== undefined && target.lat !== null && target.lat !== ''
    && target.lng !== undefined && target.lng !== null && target.lng !== ''
  if (!target.id && !target.uid && !hasTargetCoordinates) {
    status.value = 'missing'
    return
  }

  status.value = 'loading'
  try {
    const data = await getAttractionDetail(target, { signal: loadController.signal })
    if (currentLoad !== loadId) return
    if (!data) { status.value = 'missing'; return }
    spot.value = data
    status.value = 'ready'

    if (data.nearbySpots?.length) return
    if (!Number.isFinite(Number(data.lat)) || !Number.isFinite(Number(data.lng))) return
    nearbyLoading.value = true
    try {
      const nearby = await getNearbyAttractions(data.lat, data.lng, { signal: loadController.signal })
      if (currentLoad === loadId && spot.value) {
        spot.value.nearbySpots = nearby
          .filter(item => item.uid !== spot.value.uid)
          .sort((a, b) => (b.rating || 0) - (a.rating || 0))
          .slice(0, 8)
      }
    } catch (error) {
      if (error?.name !== 'AbortError' && currentLoad === loadId) nearbyError.value = t('attraction.nearbyFailed')
    } finally {
      if (currentLoad === loadId) nearbyLoading.value = false
    }
  } catch (error) {
    if (error?.name !== 'AbortError' && currentLoad === loadId) {
      errorMessage.value = error?.message || t('attraction.detailFailed')
      status.value = /未找到|不存在|not found/i.test(errorMessage.value) ? 'missing' : 'error'
    }
  }
}

const goBack = () => { if (window.history.length > 1) router.back(); else router.replace('/') }
const imgSrc = (img) => img?.src || ''
const onImgErr = (e, img) => {
  const fallback = img?.fallback || '/travel-cover.svg'
  if (e.target.src.endsWith(fallback)) return
  e.target.src = fallback
}

const openGallery = (start = 0) => {
  const images = (spot.value?.images || []).map(imgSrc).filter(Boolean)
  if (images.length) showImagePreview(images, Math.min(start, images.length - 1))
}

const toggleFav = () => {
  if (!spot.value) return
  const id = spotKey.value
  favIds.value = isFav.value ? favIds.value.filter(x => x !== id) : [id, ...favIds.value]
  if (getToken()) setMyData('attractionFavorites', favIds.value)
  else localStorage.setItem(GUEST_FAV_KEY, JSON.stringify(favIds.value))
  showToast({ message: isFav.value ? t('attraction.favOn') : t('attraction.favOff'), position: 'middle' })
}

const copyLink = async (url) => {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(url)
  const input = document.createElement('textarea')
  input.value = url
  input.style.position = 'fixed'
  input.style.opacity = '0'
  document.body.appendChild(input)
  input.select()
  const copied = document.execCommand('copy')
  input.remove()
  if (!copied) throw new Error('copy failed')
}

const share = async () => {
  const url = window.location.href
  try {
    if (navigator.share) { await navigator.share({ title: spot.value?.name, url }); return }
    await copyLink(url)
    showToast({ message: t('attraction.shareOk'), position: 'middle' })
  } catch {
    showToast({ message: t('attraction.shareFail'), position: 'middle' })
  }
}

const callPhone = () => {
  if (!spot.value?.phone) { showToast({ message: t('attraction.noPhone'), position: 'middle' }); return }
  window.location.href = `tel:${spot.value.phone}`
}
const navigate = () => {
  if (!hasCoordinates.value) return
  const params = new URLSearchParams({
    position: `${spot.value.lng},${spot.value.lat}`,
    name: spot.value.name,
    src: 'ai-travel',
    coordinate: 'gaode',
    callnative: '1',
  })
  window.location.href = `https://uri.amap.com/marker?${params}`
}
const addToTrip = () => {
  sessionStorage.setItem('selected_destination_spot', spot.value?.name || '')
  router.push('/agent-planner')
}
const goSearch = () => router.replace('/attraction-search')
const goNearby = (item) => router.replace({
  path: '/attraction-detail',
  query: item.uid ? { uid: item.uid, lat: item.lat, lng: item.lng } : { id: item.id },
})

onMounted(() => { loadFav(); load() })
watch(() => route.fullPath, () => load())
onBeforeUnmount(() => loadController?.abort())
</script>

<template>
  <div v-if="status === 'loading'" class="ad-state-page" aria-live="polite">
    <div class="ad-state-nav">
      <button class="ad-icon-btn dark" :aria-label="t('common.back')" @click="goBack"><van-icon name="arrow-left" size="18" /></button>
    </div>
    <van-skeleton-image class="ad-hero-skeleton" />
    <div class="ad-state-card"><van-skeleton title avatar :row="5" /></div>
  </div>

  <div v-else-if="status === 'error'" class="ad-state-page">
    <div class="ad-state-nav">
      <button class="ad-icon-btn dark" :aria-label="t('common.back')" @click="goBack"><van-icon name="arrow-left" size="18" /></button>
    </div>
    <EmptyState
      icon="replay"
      :title="t('attraction.detailFailed')"
      :desc="errorMessage"
      :btn-text="t('attraction.retry')"
      btn-type="gradient"
      @btn-click="load()"
    />
  </div>

  <div v-else-if="status === 'missing'" class="ad-state-page">
    <div class="ad-state-nav">
      <button class="ad-icon-btn dark" :aria-label="t('common.back')" @click="goBack"><van-icon name="arrow-left" size="18" /></button>
    </div>
    <EmptyState
      icon="location-o"
      :title="t('attraction.missing')"
      :desc="t('attraction.missingHint')"
      :btn-text="t('attraction.backToSearch')"
      btn-type="gradient"
      @btn-click="goSearch"
    />
  </div>

  <div v-else-if="spot" class="ad-page">
    <div class="ad-hero">
      <Swipe v-if="spot.images?.length" class="ad-swipe" :autoplay="0" indicator-color="rgba(255,255,255,0.55)" indicator-active-color="#fff">
        <SwipeItem v-for="(img, i) in spot.images" :key="i">
          <img class="ad-hero-img" :src="imgSrc(img)" :alt="`${spot.name} ${i + 1}`" @click="openGallery(i)" @error="e => onImgErr(e, img)" />
        </SwipeItem>
      </Swipe>
      <div v-else class="ad-hero-empty"><van-icon name="photo-o" size="42" /><span>{{ t('attraction.noImage') }}</span></div>
      <div class="ad-hero-nav">
        <button class="ad-icon-btn" :aria-label="t('common.back')" @click="goBack"><van-icon name="arrow-left" size="18" /></button>
        <div class="ad-hero-actions">
          <button class="ad-icon-btn" :aria-label="t('attraction.share')" @click="share"><van-icon name="share-o" size="18" /></button>
          <button class="ad-icon-btn" :aria-label="isFav ? t('attraction.saved') : t('attraction.save')" @click="toggleFav">
            <van-icon :name="isFav ? 'like' : 'like-o'" size="18" :color="isFav ? '#ef4444' : '#fff'" />
          </button>
        </div>
      </div>
      <button v-if="spot.images?.length" class="ad-all" @click="openGallery(0)">
        <van-icon name="photo-o" size="13" /> {{ t('attraction.imageCount', { n: spot.images.length }) }}
      </button>
    </div>

    <div class="ad-sheet">
      <div class="ad-belong">
        <span>{{ t('attraction.belongTo') }}：{{ spot.park }}</span>
        <span v-if="spot.city">{{ spot.city }}</span>
      </div>
      <div class="ad-title-row">
        <h1 class="ad-title">{{ spot.name }}</h1>
        <span v-if="spot.heat" class="ad-heat">🔥 {{ spot.heat }}</span>
      </div>
      <div v-if="spot.rating" class="ad-rating">
        <van-icon name="star" size="14" color="#f59e0b" />
        <strong>{{ spot.rating }}</strong><span>/5</span>
        <span v-if="spot.reviewCount">· {{ t('attraction.reviews', { n: spot.reviewCount }) }}</span>
      </div>
      <div v-if="spot.listTitle" class="ad-list-line">{{ spot.listTitle }}</div>

      <div class="ad-info-row">
        <div class="ad-info-card">
          <div class="ad-info-h"><van-icon name="clock-o" size="14" /> {{ t('attraction.hours') }}</div>
          <div v-if="spot.hours?.length" class="ad-info-b" v-for="h in spot.hours" :key="h">{{ h }}</div>
          <div v-else class="ad-info-b">{{ t('attraction.infoUnknown') }}</div>
        </div>
        <div class="ad-info-card">
          <div class="ad-info-h"><van-icon name="coupon-o" size="14" /> {{ t('attraction.ticketInfo') }}</div>
          <div class="ad-info-b">
            {{ spot.priceText || (spot.ticketRequired ? t('attraction.ticketFrom', { n: spot.ticketFrom }) : t('attraction.checkOfficial')) }}
          </div>
        </div>
      </div>

      <div v-if="spot.address || spot.phone" class="ad-addr">
        <button v-if="spot.address" class="ad-addr-text" @click="navigate">
          <van-icon name="location-o" size="16" color="#8B5CF6" />
          <span>{{ spot.address }}</span>
          <van-icon name="arrow" size="13" color="#cbd5e1" />
        </button>
        <button v-if="spot.phone" class="ad-phone" @click="callPhone">
          <van-icon name="phone-o" size="16" color="#8B5CF6" />
          <span>{{ t('attraction.phone') }}</span>
        </button>
      </div>

      <div class="ad-tabs">
        <button v-for="key in ['guide','notice','nearby']" :key="key" class="ad-tab" :class="{ on: tab === key }" @click="tab = key">
          {{ t('attraction.tab' + key.charAt(0).toUpperCase() + key.slice(1)) }}
        </button>
      </div>

      <div class="ad-tab-body">
        <div v-if="tab === 'guide'" class="ad-guide">
          <h2>{{ t('attraction.guideTitle') }}</h2>
          <p>{{ spot.overview || t('attraction.guideFallback', { name: spot.name }) }}</p>
          <button v-if="spot.address" class="ad-inline-action" @click="navigate">
            <van-icon name="guide-o" /> {{ t('attraction.openNavigation') }}
          </button>
        </div>
        <div v-else-if="tab === 'notice'" class="ad-notice">{{ spot.notice }}</div>
        <div v-else>
          <div v-if="nearbyLoading" class="ad-near-loading"><van-loading size="22" /> {{ t('attraction.loadingNearby') }}</div>
          <div v-else-if="nearbyError" class="ad-stub">{{ nearbyError }}</div>
          <div v-else-if="!spot.nearbySpots?.length" class="ad-stub">{{ t('attraction.nearbyEmpty') }}</div>
          <button v-for="n in spot.nearbySpots" :key="n.uid || n.id" class="ad-near" @click="goNearby(n)">
            <img v-if="n.images?.[0]" :src="imgSrc(n.images[0])" :alt="n.name" @error="e => onImgErr(e, n.images[0])" />
            <span v-else class="ad-near-placeholder"><van-icon name="photo-o" size="22" /></span>
            <div>
              <div class="ad-near-name">{{ n.name }}</div>
              <div class="ad-near-meta">{{ n.category || n.city }}<template v-if="n.rating"> · {{ n.rating }}分</template></div>
              <div v-if="n.address" class="ad-near-address">{{ n.address }}</div>
            </div>
            <van-icon name="arrow" size="14" color="#cbd5e1" />
          </button>
        </div>
      </div>
    </div>

    <div class="ad-bottom-bar">
      <button class="ad-bottom-secondary" @click="toggleFav">
        <van-icon :name="isFav ? 'like' : 'like-o'" size="19" :color="isFav ? '#ef4444' : '#64748b'" />
        <span>{{ isFav ? t('attraction.saved') : t('attraction.save') }}</span>
      </button>
      <button class="ad-bottom-secondary" :disabled="!hasCoordinates" @click="navigate">
        <van-icon name="guide-o" size="19" />
        <span>{{ t('attraction.navigation') }}</span>
      </button>
      <button class="ad-bottom-primary" @click="addToTrip">
        <van-icon name="plus" size="17" /> {{ t('attraction.addToTrip') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ad-page, .ad-state-page {
  width: 100%; max-width: 480px; min-height: 100dvh; margin: 0 auto;
  background: #f8fafc; box-shadow: 0 0 36px rgba(30,41,59,.08);
}
.ad-page { padding-bottom: calc(86px + env(safe-area-inset-bottom, 0px)); }
.ad-state-nav { padding: calc(12px + env(safe-area-inset-top)) 16px 10px; }
.ad-state-card { margin: -16px 12px 0; padding: 24px 16px; border-radius: 18px; background: #fff; position: relative; }
.ad-hero-skeleton { width: 100% !important; height: 260px !important; }
.ad-hero { position: relative; height: 280px; background: linear-gradient(135deg,#312e48,#1e1b2e); }
.ad-swipe, .ad-hero-img { width: 100%; height: 280px; }
.ad-hero-img { object-fit: cover; display: block; }
.ad-hero-empty {
  width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 8px; color: rgba(255,255,255,.55); font-size: 12px;
}
.ad-hero-nav {
  position: absolute; top: 0; left: 0; right: 0; z-index: 3;
  display: flex; justify-content: space-between; align-items: center;
  padding: calc(10px + env(safe-area-inset-top)) 12px 0;
}
.ad-hero-actions { display: flex; gap: 8px; }
.ad-icon-btn {
  width: 32px; height: 32px; border: none; border-radius: 50%;
  background: rgba(0,0,0,0.38); color: #fff;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
}
.ad-icon-btn.dark { background: #e2e8f0; color: #1e293b; }
.ad-all {
  position: absolute; right: 12px; bottom: 28px; z-index: 3; display: flex; align-items: center; gap: 4px;
  border: none; border-radius: 16px; padding: 6px 11px;
  background: rgba(0,0,0,0.48); color: #fff; font-size: 11px; cursor: pointer;
}
.ad-sheet {
  position: relative; z-index: 4; margin-top: -16px;
  background: #fff; border-radius: 16px 16px 0 0; padding: 16px 16px 8px;
}
.ad-belong { display: flex; justify-content: space-between; font-size: 12px; color: #64748b; }
.ad-title-row { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; position: relative; }
.ad-title { flex: 1; margin: 0; font-size: 24px; font-weight: 800; color: #0f172a; line-height: 1.2; }
.ad-heat { font-size: 12px; color: #ea580c; font-weight: 700; padding-top: 6px; }
.ad-rating { margin-top: 10px; display: flex; align-items: center; gap: 3px; font-size: 13px; color: #64748b; }
.ad-rating strong { color: #b45309; font-size: 16px; }
.ad-list-line { display: inline-flex; margin-top: 8px; padding: 4px 9px; border-radius: 12px; font-size: 11px; color: #6d28d9; background: #f3e8ff; }
.ad-info-row { display: flex; gap: 8px; margin-top: 14px; overflow-x: auto; }
.ad-info-card {
  flex: 1; min-width: 140px; padding: 10px 12px;
  border: 1px solid #e2e8f0; border-radius: 12px;
}
.ad-info-h { display: flex; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; color: #1e293b; margin-bottom: 6px; }
.ad-info-b { font-size: 11px; color: #64748b; line-height: 1.5; }
.ad-addr {
  display: flex; align-items: center; gap: 10px;
  margin-top: 12px; padding: 12px 0; border-top: 1px solid #f1f5f9; border-bottom: 1px solid #f1f5f9;
}
.ad-addr-text {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 7px; border: none; background: none;
  padding: 4px 0; font-size: 12px; color: #475569; line-height: 1.45; text-align: left; cursor: pointer;
}
.ad-addr-text span { flex: 1; }
.ad-phone {
  flex-shrink: 0; border: none; background: none; padding-left: 12px;
  border-left: 1px solid #e2e8f0; display: flex; flex-direction: column; align-items: center; gap: 2px;
  font-size: 11px; color: #64748b;
}
.ad-tabs { display: flex; gap: 18px; margin-top: 14px; border-bottom: 1px solid #f1f5f9; }
.ad-tab { border: none; background: none; padding: 8px 0 10px; font-size: 14px; color: #64748b; }
.ad-tab.on { color: #8B5CF6; font-weight: 700; box-shadow: inset 0 -2px 0 #8B5CF6; }
.ad-tab-body { padding: 16px 0 24px; min-height: 120px; }
.ad-stub { font-size: 13px; color: #94a3b8; text-align: center; padding: 28px 0; }
.ad-notice { font-size: 13px; color: #334155; line-height: 1.7; }
.ad-guide h2 { margin: 0 0 8px; font-size: 16px; color: #1e293b; }
.ad-guide p { margin: 0; font-size: 13px; color: #475569; line-height: 1.75; }
.ad-inline-action {
  display: inline-flex; align-items: center; gap: 5px; margin-top: 14px; padding: 8px 12px;
  border: 1px solid #ddd6fe; border-radius: 18px; background: #faf8ff; color: #7c3aed; font-size: 12px;
}
.ad-near {
  width: 100%; display: flex; gap: 10px; align-items: center; margin-bottom: 8px; padding: 7px;
  border: none; border-radius: 10px; background: transparent; text-align: left; cursor: pointer;
}
.ad-near:active { background: #f8fafc; }
.ad-near img, .ad-near-placeholder { width: 76px; height: 58px; border-radius: 9px; object-fit: cover; background: #e2e8f0; flex-shrink: 0; }
.ad-near-placeholder { display: grid; place-items: center; color: #94a3b8; }
.ad-near > div { min-width: 0; flex: 1; }
.ad-near-name { font-size: 14px; font-weight: 700; color: #1e293b; }
.ad-near-meta { font-size: 12px; color: #94a3b8; margin-top: 4px; }
.ad-near-address { margin-top: 3px; font-size: 11px; color: #94a3b8; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ad-near-loading { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 28px 0; color: #94a3b8; font-size: 13px; }
.ad-bottom-bar {
  position: fixed; left: 50%; bottom: 0; z-index: 20; transform: translateX(-50%);
  width: min(100%, 480px); display: flex; align-items: center; gap: 6px;
  padding: 9px 12px calc(9px + env(safe-area-inset-bottom, 0px));
  background: rgba(255,255,255,.94); border-top: 1px solid rgba(226,232,240,.85);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
}
.ad-bottom-secondary {
  width: 58px; min-height: 46px; border: none; background: transparent; color: #64748b;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; font-size: 10px;
}
.ad-bottom-secondary:disabled { opacity: .4; }
.ad-bottom-primary {
  flex: 1; height: 44px; border: none; border-radius: 22px; color: #fff; font-size: 14px; font-weight: 700;
  background: linear-gradient(135deg,#8b5cf6,#6366f1); box-shadow: 0 7px 18px rgba(99,102,241,.22);
  display: flex; align-items: center; justify-content: center; gap: 5px;
}
@media (max-width: 360px) {
  .ad-sheet { padding-left: 13px; padding-right: 13px; }
  .ad-tabs { gap: 14px; }
  .ad-title { font-size: 22px; }
}
</style>
