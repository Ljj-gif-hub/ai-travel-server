<script setup>
import { ref, onDeactivated } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast } from 'vant'
import { userApi } from '../api'
import { getToken } from '../utils/auth'
import { scannedRoute } from '../utils/profileActions'

const emit = defineEmits(['updated'])
const router = useRouter()
const { t } = useI18n()
const visible = ref(false), mode = ref(''), busy = ref(false), error = ref(false)
const level = ref(null), scanText = ref(''), scanInput = ref(null)
let sequence = 0

async function loadLevel() {
  const seq = ++sequence
  busy.value = true; error.value = false
  try {
    const res = await userApi.getLevel()
    if (seq !== sequence) return
    if (res?.code !== 0) throw new Error()
    level.value = res.data
    emit('updated', res.data)
  } catch { if (seq === sequence) error.value = true }
  finally { if (seq === sequence) busy.value = false }
}

function open(action) {
  if ((action === 'checkIn' || action === 'member') && !getToken()) {
    router.push('/login'); return
  }
  mode.value = action; visible.value = true; scanText.value = ''; error.value = false
  if (action === 'member' || action === 'checkIn') { level.value = null; loadLevel() }
}
defineExpose({ open })
onDeactivated(() => { visible.value = false; sequence++; busy.value = false })

async function checkIn() {
  if (busy.value || level.value?.checkedIn) return
  busy.value = true
  const seq = ++sequence
  try {
    const res = await userApi.checkIn()
    if (seq !== sequence) return
    if (res?.code !== 0) throw new Error()
    level.value = res.data
    emit('updated', res.data)
    showToast(t(res.data.awardedPoints ? 'profile.checkInSuccess' : 'profile.checkedIn'))
  } catch { if (seq === sequence) showToast(t('profile.actionFailed')) }
  finally { if (seq === sequence) busy.value = false }
}

async function readQr(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/') || file.size > 10 * 1024 * 1024) {
    showToast(t('profile.imageLimit')); return
  }
  scanText.value = ''; busy.value = true
  const url = URL.createObjectURL(file)
  try {
    const { default: jsQR } = await import('jsqr')
    const img = new Image()
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = url })
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const code = jsQR(pixels.data, pixels.width, pixels.height)
    if (!code) throw new Error()
    scanText.value = code.data
  } catch { showToast(t('profile.qrNotFound')) }
  finally { URL.revokeObjectURL(url); busy.value = false }
}

function openResult() {
  const path = scannedRoute(scanText.value, window.location.href)
  if (!path || router.resolve(path).matched.some(r => r.path.includes(':pathMatch'))) {
    showToast(t('profile.scanUnsupported')); return
  }
  visible.value = false
  router.push(path)
}
function navigate(path) { visible.value = false; router.push(path) }
</script>

<template>
  <van-popup v-model:show="visible" position="bottom" round closeable :style="{ maxHeight: '85vh' }" safe-area-inset-bottom>
    <div class="tool-content">
      <h3>{{ t('profile.' + (mode === 'member' ? 'memberTitle' : mode === 'service' ? 'customerService' : mode || 'scan')) }}</h3>
      <template v-if="mode === 'scan'">
        <p>{{ t('profile.scanHint') }}</p>
        <input ref="scanInput" type="file" accept="image/*" hidden @change="readQr" />
        <van-button block type="primary" :loading="busy" @click="scanInput.click()">{{ t('profile.chooseQr') }}</van-button>
        <van-field v-model="scanText" type="textarea" :label="t('profile.scanResult')" :placeholder="t('profile.pasteLink')" maxlength="4096" />
        <van-button block :disabled="!scanText.trim() || busy" @click="openResult">{{ t('profile.openLink') }}</van-button>
      </template>
      <template v-else-if="mode === 'service'">
        <p>{{ t('profile.serviceHint') }}</p>
        <van-cell :title="t('profile.aiHelp')" is-link @click="navigate('/chat')" />
        <van-cell :title="t('profile.feedback')" is-link @click="navigate('/feedback')" />
        <van-cell :title="t('profile.myOrders')" is-link @click="navigate('/orders')" />
        <van-cell :title="t('profile.myPlans')" is-link @click="navigate('/trips')" />
      </template>
      <template v-else>
        <van-loading v-if="busy && !level" />
        <van-button v-else-if="error" block @click="loadLevel">{{ t('common.retry') }}</van-button>
        <template v-else-if="level">
          <h2>{{ level.level }} · {{ t('profile.pointsValue', { n: level.points }) }}</h2>
          <p>{{ level.nextLevel ? t('profile.nextLevel', { level: level.nextLevel, n: level.pointsToNextLevel }) : t('profile.topLevel') }}</p>
          <p>{{ t('profile.pointsRules') }}</p>
          <van-button block type="primary" :loading="busy" :disabled="level.checkedIn" @click="checkIn">{{ t(level.checkedIn ? 'profile.checkedIn' : 'profile.checkInReward') }}</van-button>
        </template>
      </template>
    </div>
  </van-popup>
</template>

<style scoped>
.tool-content { max-width: 480px; margin: auto; padding: 24px 20px; color: var(--text-primary); }
.tool-content h3 { margin: 0 28px 20px 0; }
.tool-content p { color: var(--text-secondary); line-height: 1.7; margin: 14px 0; }
.tool-content :deep(.van-button) { margin-top: 14px; }
</style>
