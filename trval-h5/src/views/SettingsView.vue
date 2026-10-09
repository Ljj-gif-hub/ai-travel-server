<script setup>
import { onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { closeToast, showConfirmDialog, showLoadingToast, showToast } from 'vant'
import { getToken, removeToken } from '../utils/auth'
import { clearSession as clearAccountSession, getMyData, setMyData } from '../utils/userAccountStorage'
import { userApi } from '../api'
import { useTheme } from '../utils/theme'
import { setLanguage } from '../i18n'
import { useTripStore } from '../stores/trip'

const router = useRouter()
const tripStore = useTripStore()
const { t, locale } = useI18n()
const { themeMode, setTheme } = useTheme()
const isLoggedIn = ref(!!getToken())

const themeOptions = [
  { value: 'system', labelKey: 'themeSystem' },
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
]
const langOptions = [
  { value: 'zh-CN', labelKey: 'langZh' },
  { value: 'en-US', labelKey: 'langEn' },
]

const goBack = () => window.history.length > 1 ? router.back() : router.push('/profile')
const open = (path) => router.push(path)
const notificationsEnabled = ref(getMyData('notificationsEnabled') !== false)
const showNotifications = ref(false)
const showSecurity = ref(false)
const account = ref(null)
const securityLoading = ref(false)
const securityFailed = ref(false)
const toggleNotifications = value => {
  if (!getToken()) { router.push('/login'); return }
  notificationsEnabled.value = value
  setMyData('notificationsEnabled', value)
}
const openSecurity = async () => {
  if (!getToken()) { router.push('/login'); return }
  showSecurity.value = true; securityLoading.value = true; securityFailed.value = false
  try {
    const res = await userApi.getProfile()
    if (res?.code !== 0) throw new Error()
    account.value = res.data
  } catch { securityFailed.value = true }
  finally { securityLoading.value = false }
}

let logoutTimer
const handleLogout = async () => {
  try {
    await showConfirmDialog({ title: t('profile.logoutConfirmTitle'), message: t('profile.logoutConfirmMessage') })
  } catch { return }

  showLoadingToast({ message: t('profile.loggingOut'), duration: 0, forbidClick: true })
  try { await userApi.logout() } catch { /* 服务端失败也要清理本地会话 */ }
  removeToken()
  clearAccountSession()
  tripStore.resetState()
  localStorage.removeItem('userInfo')
  closeToast()
  showToast(t('profile.loggedOut'))
  logoutTimer = setTimeout(() => router.replace('/login'), 500)
}

onUnmounted(() => clearTimeout(logoutTimer))
</script>

<template>
  <div class="settings-page">
    <van-nav-bar :title="t('settings.title')" left-arrow safe-area-inset-top @click-left="goBack" />

    <div class="settings-content">
      <section class="setting-group">
        <button class="setting-row" @click="open('/edit-profile')">
          <span>{{ t('settings.personalInfo') }}</span><van-icon name="arrow" />
        </button>
        <button class="setting-row" @click="openSecurity">
          <span>{{ t('settings.accountSecurity') }}</span><van-icon name="arrow" />
        </button>
        <button class="setting-row" @click="showNotifications = true">
          <span>{{ t('settings.messageNotifications') }}</span><van-icon name="arrow" />
        </button>
      </section>

      <section class="setting-group">
        <div class="setting-stack">
          <span>{{ t('settings.theme') }}</span>
          <div class="option-row">
            <button v-for="opt in themeOptions" :key="opt.value" :class="['option', { active: themeMode === opt.value }]" @click="setTheme(opt.value)">
              {{ t(`settings.${opt.labelKey}`) }}
            </button>
          </div>
        </div>
        <div class="setting-stack">
          <span>{{ t('settings.language') }}</span>
          <div class="option-row">
            <button v-for="opt in langOptions" :key="opt.value" :class="['option', { active: locale === opt.value }]" @click="setLanguage(opt.value)">
              {{ t(`settings.${opt.labelKey}`) }}
            </button>
          </div>
        </div>
      </section>

      <section class="setting-group">
        <button class="setting-row" @click="open('/feedback')">
          <span>{{ t('settings.feedback') }}</span><van-icon name="arrow" />
        </button>
        <button class="setting-row" @click="open('/about')">
          <span>{{ t('settings.about') }}</span><van-icon name="arrow" />
        </button>
      </section>

      <button v-if="isLoggedIn" class="logout-btn" @click="handleLogout">{{ t('common.logout') }}</button>
    </div>
    <van-popup v-model:show="showNotifications" round closeable position="bottom" safe-area-inset-bottom>
      <div class="settings-content">
        <h3>{{ t('settings.messageNotifications') }}</h3>
        <van-cell :title="t('settings.inAppNotifications')">
          <template #right-icon><van-switch :model-value="notificationsEnabled" :aria-label="t('settings.inAppNotifications')" size="24" @update:model-value="toggleNotifications" /></template>
        </van-cell>
        <p>{{ t('settings.notificationsHint') }}</p>
      </div>
    </van-popup>
    <van-popup v-model:show="showSecurity" round closeable position="bottom" safe-area-inset-bottom>
      <div class="settings-content">
        <h3>{{ t('settings.accountSecurity') }}</h3>
        <van-loading v-if="securityLoading" />
        <van-button v-else-if="securityFailed" block @click="openSecurity">{{ t('common.retry') }}</van-button>
        <template v-else-if="account">
          <van-cell :title="t('settings.username')" :value="account.username" />
          <van-cell :title="t('settings.contactInfo')" is-link @click="open('/edit-profile')" />
          <p>{{ t('settings.securityHint') }}</p>
          <van-button block type="danger" @click="handleLogout">{{ t('settings.signOutSessions') }}</van-button>
        </template>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
.settings-page { min-height: 100vh; background: var(--bg-page); }
.settings-content { max-width: 480px; margin: 0 auto; padding: 14px 14px 32px; }
.setting-group {
  margin-bottom: 14px; overflow: hidden; border-radius: 18px;
  background: var(--bg-card); border: 1px solid var(--glass-border); box-shadow: var(--shadow-sm);
}
.setting-row {
  width: 100%; min-height: 58px; padding: 0 18px; border: 0; border-bottom: 1px solid var(--border-light);
  background: transparent; color: var(--text-primary); font-size: 15px;
  display: flex; align-items: center; justify-content: space-between; cursor: pointer;
}
.setting-row:last-child { border-bottom: 0; }
.setting-row :deep(.van-icon) { color: var(--text-hint); }
.setting-stack { padding: 15px 16px; border-bottom: 1px solid var(--border-light); color: var(--text-primary); font-size: 14px; }
.setting-stack:last-child { border-bottom: 0; }
.option-row { display: flex; gap: 8px; margin-top: 12px; }
.option {
  flex: 1; padding: 8px 4px; border: 1px solid var(--border-light); border-radius: 11px;
  background: transparent; color: var(--text-secondary); font-size: 13px; cursor: pointer;
}
.option.active { color: #fff; border-color: transparent; background: linear-gradient(135deg, #8B5CF6, #6366F1); box-shadow: 0 4px 12px rgba(139,92,246,.22); }
.logout-btn {
  width: 100%; padding: 14px; border: 0; border-radius: 16px; background: #fff;
  color: #ef4444; font-size: 15px; font-weight: 600; box-shadow: var(--shadow-sm); cursor: pointer;
}
:global(html[data-theme='dark']) .logout-btn { background: var(--bg-card); }
</style>
