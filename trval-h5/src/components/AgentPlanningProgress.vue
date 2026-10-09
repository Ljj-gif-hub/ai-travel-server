<script setup>
/**
 * Agent 规划中的过程动画：高光卡片 + 步骤清单 + 当前阶段视觉（雷达/POI/贴士/路线）。
 * 步骤状态由父级 SSE 驱动；本组件只负责展示。
 */
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({ name: 'AgentPlanningProgress' })

const props = defineProps({
  progress: { type: Number, default: 0 },
  steps: { type: Array, default: () => [] },
  destination: { type: String, default: '' },
  phase: { type: String, default: 'research' },
  highlights: { type: Array, default: () => [] },
  preview: { type: Object, default: () => ({}) },
  liveMessage: { type: String, default: '' },
})

const { t } = useI18n()
const collapsed = ref(false)
const shownPct = ref(0)
let pctTimer = 0

watch(() => props.progress, (v) => {
  const target = Math.max(0, Math.min(100, Math.round(v)))
  clearInterval(pctTimer)
  pctTimer = window.setInterval(() => {
    if (shownPct.value === target) { clearInterval(pctTimer); return }
    shownPct.value += shownPct.value < target ? 1 : -1
  }, 28)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(pctTimer))

const doingIdx = computed(() => props.steps.findIndex(s => s.status === 'doing'))
const visual = computed(() => {
  const p = props.phase
  if (p === 'plan') return 'pois'
  if (p === 'adjust') return 'tips'
  if (p === 'finalize') return 'route'
  return 'radar' // research / verify / 连接中
})

const liveCaption = computed(() => {
  if (props.liveMessage) return props.liveMessage.replace(/^\S+\s/, '').replace(/^\[Demo\]\s*/, '')
  const dest = props.destination || ''
  if (props.phase === 'verify') return t('map.genSearchingHotels', { dest })
  if (props.phase === 'plan') return t('map.genPickingSpots')
  if (props.phase === 'adjust') return t('map.genSearchingTips', { dest })
  if (props.phase === 'finalize') return t('map.genConfirmingRoute')
  return t('map.genSearchingSpots', { dest })
})

const poiNames = computed(() => {
  const fromPreview = (props.preview.attractions || []).filter(Boolean)
  if (fromPreview.length) return fromPreview.slice(0, 8)
  return props.highlights.map(h => h.name).slice(0, 6)
})

const tipCards = computed(() => [
  { key: 'overview', title: t('map.tipOverview'), emoji: '🏔' },
  { key: 'time', title: t('map.tipBestTime'), emoji: '🧭' },
  { key: 'tips', title: t('map.tipTips'), emoji: '💡' },
  { key: 'must', title: t('map.tipMustRead'), emoji: '📖' },
])

function imgStyle(url) {
  return url
    ? { backgroundImage: `url("${url}"), linear-gradient(145deg, #c7d2fe, #818cf8)` }
    : {}
}
</script>

<template>
  <div class="ap">
    <p class="ap-hint">{{ t('map.genWaitHint') }}</p>

    <div class="ap-carousel" v-if="highlights.length">
      <div v-for="(h, i) in highlights" :key="h.name + i" class="ap-hcard">
        <div class="ap-himg" :class="{ plc: !h.img }" :style="imgStyle(h.img)">
          <span class="ap-hloc">📍 {{ h.loc || destination }}</span>
        </div>
        <div class="ap-hcap">{{ h.caption || h.name }}</div>
      </div>
    </div>

    <button type="button" class="ap-prog" @click="collapsed = !collapsed">
      <span>{{ t('agent.generatingLine', { pct: shownPct + '%' }) }}</span>
      <svg class="ap-chev" :class="{ up: !collapsed }" viewBox="0 0 24 24" width="16" height="16"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2"/></svg>
    </button>

    <div class="ap-steps" v-show="!collapsed">
      <div v-for="(s, i) in steps" :key="s.name" class="ap-step" :class="s.status">
        <span class="ap-dot">
          <span v-if="s.status === 'done'" class="ap-check">✓</span>
          <span v-else-if="s.status === 'doing'" class="ap-spin"></span>
        </span>
        <div class="ap-step-body">
          <div class="ap-step-name">{{ s.name }}</div>
          <div v-if="s.status === 'done' && s.summary" class="ap-sum">{{ s.summary }}</div>
        </div>
      </div>
    </div>

    <div class="ap-live" v-if="doingIdx >= 0 || !steps.some(s => s.status === 'done')">
      <div class="ap-live-msg">{{ liveCaption }}</div>

      <div v-if="visual === 'radar'" class="radar" :class="{ hotel: phase === 'verify' }">
        <div class="radar-grid"></div>
        <div class="radar-ring r1"></div>
        <div class="radar-ring r2"></div>
        <div class="radar-ring r3"></div>
        <div class="radar-sweep"></div>
        <div class="radar-core"></div>
      </div>

      <div v-else-if="visual === 'pois'" class="poi-feed">
        <div class="radar-grid faint"></div>
        <div class="poi-row">
          <div v-for="(n, i) in poiNames" :key="n + i" class="poi-chip" :style="{ animationDelay: i * 0.18 + 's' }">
            <span class="poi-dot" :class="'c' + (i % 3)"></span>
            <span class="poi-name">{{ n }}</span>
          </div>
          <div v-if="!poiNames.length" class="poi-chip" style="animation-delay:0s">
            <span class="poi-dot c0"></span>
            <span class="poi-name">{{ destination }}</span>
          </div>
        </div>
      </div>

      <div v-else-if="visual === 'tips'" class="tip-fan">
        <div v-for="(c, i) in tipCards" :key="c.key" class="tip-slot" :style="{ '--i': i }">
          <div class="tip-card">
            <div class="tip-cover">{{ c.emoji }}</div>
            <div class="tip-title">{{ c.title }}</div>
            <div class="tip-lines"><i></i><i></i><i></i></div>
          </div>
        </div>
      </div>

      <div v-else class="route-mini">
        <svg viewBox="0 0 280 132" class="route-svg" aria-hidden="true">
          <path class="route-line" d="M24 96 C70 96, 78 36, 128 48 S 196 108, 256 38"/>
          <circle class="poi p-spot" cx="24" cy="96" r="9"/>
          <text x="24" y="100" text-anchor="middle" class="poi-n">1</text>
          <circle class="poi p-spot" cx="128" cy="48" r="9"/>
          <text x="128" y="52" text-anchor="middle" class="poi-n">2</text>
          <circle class="poi p-food" cx="186" cy="88" r="9"/>
          <text x="186" y="92" text-anchor="middle" class="poi-n">3</text>
          <circle class="poi p-spot" cx="256" cy="38" r="9"/>
          <text x="256" y="42" text-anchor="middle" class="poi-n">4</text>
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ap { padding: 0 0 8px; }
.ap-hint { margin: 0 0 10px; font-size: 13px; color: #64748b; line-height: 1.55; }

.ap-carousel { display: flex; gap: 10px; overflow-x: auto; padding: 0 0 12px; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.ap-carousel::-webkit-scrollbar { display: none; }
.ap-hcard { flex: 0 0 168px; scroll-snap-align: start; }
.ap-himg { position: relative; height: 112px; border-radius: 12px; background: linear-gradient(145deg, #c7d2fe, #a5b4fc 40%, #818cf8); background-size: cover; background-position: center; overflow: hidden; }
.ap-himg.plc { background: linear-gradient(145deg, #c7d2fe, #818cf8); }
.ap-hloc { position: absolute; left: 8px; bottom: 8px; padding: 2px 8px; border-radius: 8px; background: rgba(0,0,0,.45); color: #fff; font-size: 10px; max-width: calc(100% - 16px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ap-hcap { margin-top: 6px; font-size: 12px; font-weight: 600; color: #1a1a2e; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.ap-prog { display: flex; align-items: center; justify-content: space-between; width: 100%; border: 0; background: transparent; padding: 4px 0 10px; font-size: 13px; font-weight: 600; color: #334155; cursor: pointer; }
.ap-chev { color: #94a3b8; transition: transform .2s; }
.ap-chev.up { transform: rotate(180deg); }

.ap-steps { display: flex; flex-direction: column; gap: 10px; padding-bottom: 12px; }
.ap-step { display: flex; gap: 10px; align-items: flex-start; }
.ap-dot { width: 20px; height: 20px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border: 1.5px solid #e2e8f0; margin-top: 1px; }
.ap-step.done .ap-dot { border-color: #1a1a2e; background: #1a1a2e; }
.ap-step.doing .ap-dot { border-color: transparent; }
.ap-check { color: #fff; font-size: 11px; font-weight: 800; line-height: 1; }
.ap-spin { width: 16px; height: 16px; border: 2px solid #e2e8f0; border-top-color: #1a1a2e; border-radius: 50%; animation: ap-spin .7s linear infinite; }
.ap-step-name { font-size: 14px; color: #1a1a2e; font-weight: 500; }
.ap-step.wait .ap-step-name { color: #94a3b8; }
.ap-sum { margin-top: 6px; padding: 8px 12px; border-radius: 10px; background: #f1f5f9; font-size: 12px; color: #475569; }

.ap-live { background: #f1f5f9; border-radius: 14px; padding: 12px; overflow: hidden; }
.ap-live-msg { font-size: 12px; color: #64748b; margin-bottom: 10px; line-height: 1.45; }

.radar { position: relative; height: 132px; border-radius: 10px; overflow: hidden; background: #e8eef3; }
.radar-grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(148,163,184,.28) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.28) 1px, transparent 1px); background-size: 22px 22px; }
.radar-grid.faint { opacity: .7; }
.radar-ring { position: absolute; left: 50%; top: 50%; border: 1.5px solid rgba(37,99,235,.35); border-radius: 50%; transform: translate(-50%,-50%); animation: ap-pulse 2.4s ease-out infinite; }
.radar-ring.r1 { width: 36px; height: 36px; }
.radar-ring.r2 { width: 72px; height: 72px; animation-delay: .4s; }
.radar-ring.r3 { width: 110px; height: 110px; animation-delay: .8s; }
.radar-sweep { position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; margin: -60px 0 0 -60px; border-radius: 50%; background: conic-gradient(from 0deg, transparent 0 72%, rgba(37,99,235,.38) 100%); animation: ap-spin 2.6s linear infinite; }
.radar-core { position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px; border-radius: 50%; background: #1d4ed8; box-shadow: 0 0 0 4px rgba(37,99,235,.25); }
.radar.hotel .radar-ring { border-color: rgba(16,185,129,.4); }
.radar.hotel .radar-sweep { background: conic-gradient(from 0deg, transparent 0 72%, rgba(16,185,129,.4) 100%); }
.radar.hotel .radar-core { background: #059669; box-shadow: 0 0 0 4px rgba(16,185,129,.25); }

.poi-feed { position: relative; min-height: 120px; border-radius: 10px; overflow: hidden; background: #e8eef3; }
.poi-row { position: relative; z-index: 1; display: flex; gap: 8px; overflow-x: auto; padding: 36px 10px 12px; scrollbar-width: none; }
.poi-row::-webkit-scrollbar { display: none; }
.poi-chip { flex-shrink: 0; display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 10px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.08); font-size: 12px; color: #1a1a2e; animation: ap-chip .45s ease both; }
.poi-dot { width: 8px; height: 8px; border-radius: 50%; }
.poi-dot.c0 { background: #22c55e; }
.poi-dot.c1 { background: #f59e0b; }
.poi-dot.c2 { background: #3b82f6; }
.poi-name { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tip-fan { display: flex; justify-content: center; align-items: flex-end; height: 148px; }
.tip-slot { width: 78px; margin: 0 -10px; }
.tip-slot:nth-child(1) { transform: rotate(-11deg) translateY(8px); }
.tip-slot:nth-child(2) { transform: rotate(-4deg) translateY(2px); }
.tip-slot:nth-child(3) { transform: rotate(4deg) translateY(2px); }
.tip-slot:nth-child(4) { transform: rotate(11deg) translateY(8px); }
.tip-card { height: 118px; border-radius: 10px; background: #fff; box-shadow: 0 6px 16px rgba(15,23,42,.12); animation: ap-fan .5s ease both; animation-delay: calc(var(--i) * .08s); overflow: hidden; }
.tip-cover { height: 52px; display: flex; align-items: center; justify-content: center; font-size: 22px; background: linear-gradient(160deg, #c7d2fe, #818cf8); }
.tip-title { padding: 6px 6px 0; font-size: 11px; font-weight: 700; color: #1a1a2e; text-align: center; }
.tip-lines { padding: 6px; display: flex; flex-direction: column; gap: 4px; }
.tip-lines i { display: block; height: 3px; border-radius: 2px; background: #e2e8f0; }
.tip-lines i:nth-child(2) { width: 70%; }
.tip-lines i:nth-child(3) { width: 45%; }

.route-mini { height: 132px; border-radius: 10px; background: #e8eef3; overflow: hidden; }
.route-svg { width: 100%; height: 100%; }
.route-line { fill: none; stroke: #3b82f6; stroke-width: 4; stroke-linecap: round; stroke-dasharray: 420; animation: ap-draw 2.2s ease-in-out infinite alternate; }
.poi { stroke: #fff; stroke-width: 2; }
.p-spot { fill: #22c55e; }
.p-food { fill: #f59e0b; }
.poi-n { fill: #fff; font-size: 9px; font-weight: 700; font-family: inherit; }

@keyframes ap-spin { to { transform: rotate(360deg); } }
@keyframes ap-pulse { 0% { opacity: .7; transform: translate(-50%,-50%) scale(0.7); } 100% { opacity: 0; transform: translate(-50%,-50%) scale(1.2); } }
@keyframes ap-chip { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes ap-fan { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; } }
@keyframes ap-draw { from { stroke-dashoffset: 420; } to { stroke-dashoffset: 0; } }
</style>
