<script setup>
/**
 * LoginView.vue — 智能旅游助手 登录/注册 合并页
 *
 * 设计规范：
 *   品牌主色: #7b42f5 (紫)
 *   圆角: 输入框12px / 卡片18px / 按钮14px
 *   字号: 标题24px / 正文15px / 辅助12px
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { showToast, showLoadingToast, closeToast, showDialog } from 'vant'
import { setToken, setRefreshToken, removeToken, removeRefreshToken } from '../utils/auth'
import { authApi } from '../api'
import { useTripStore } from '../stores/trip'
import {
  setCurrentUser, initAccountData, accountExists,
  getAccountData, setAccountData, clearSession,
} from '../utils/userAccountStorage'

const router = useRouter()
const route = useRoute()
const { t } = useI18n()
const tripStore = useTripStore()

const authScroll = ref(null)
const activeTab = ref(route.meta?.initialTab === 'register' ? 'register' : 'login')
const switchTab = (tab, event) => {
  event?.currentTarget?.blur()
  activeTab.value = tab
  requestAnimationFrame(() => requestAnimationFrame(() => authScroll.value?.scrollTo({ top: 0 })))
}
const isLogin = computed(() => activeTab.value === 'login')

const showLoginPwd = ref(false)
const showRegPwd = ref(false)
const showRegConfirmPwd = ref(false)
const loginMethod = ref('password')

const loginForm = reactive({ username: '', password: '' })
const smsForm = reactive({ phone: '', code: '' })
const loginErrors = reactive({ username: '', password: '' })
const loginLoading = ref(false)

const registerForm = reactive({ username: '', phone: '', password: '', confirmPassword: '' })
const registerErrors = reactive({ username: '', phone: '', password: '', confirmPassword: '' })
const agreeTerms = ref(false)
const registerLoading = ref(false)

const showTermsPopup = ref(false)
const termsPopupTitle = ref('')
const termsPopupContent = ref('')
const termsData = {
  userAgreement: {
    content: `【首部及导言】\n欢迎使用智能旅游助手！\n\n为使用智能旅游助手软件及服务，您应当阅读并遵守《智能旅游助手用户协议》。\n\n一、协议的范围\n1.1 本协议是您与智能旅游助手之间关于使用本软件及相关服务所订立的协议。\n\n二、账号注册与使用\n2.1 您在注册账号时，应当提供真实、准确、完整的个人资料。\n2.2 您应当妥善保管账号和密码。\n\n三、用户行为规范\n3.1 您在使用本服务时，应当遵守国家法律法规。\n\n四、隐私保护\n4.1 我们重视您的隐私保护，具体内容详见《隐私政策》。`,
  },
  privacyPolicy: {
    content: `【隐私政策】\n\n生效日期：2026年1月1日\n\n智能旅游助手（以下简称"我们"）深知个人信息对您的重要性。\n\n一、我们收集的信息\n1.1 账号信息：手机号、用户名、密码（加密存储）。\n1.2 位置信息：当您使用地图导航功能时。\n1.3 设备信息：设备型号、操作系统版本。\n\n二、信息的使用\n2.1 为您提供旅行规划、景点推荐等核心服务。\n2.2 优化产品体验，改进服务质量。\n\n三、信息的存储与保护\n3.1 您的个人信息存储于境内服务器。\n3.2 我们采用SSL加密传输保护您的信息安全。\n\n四、您的权利\n4.1 您可以随时查看、修改您的个人信息。\n4.2 您可以注销账号，我们将删除您的所有个人数据。`,
  },
}
const openTerms = (type) => {
  const data = termsData[type]
  if (!data) return
  termsPopupTitle.value = t('auth.' + type)
  termsPopupContent.value = data.content
  showTermsPopup.value = true
}

const isPhoneValid = computed(() => /^1[3-9]\d{9}$/.test(registerForm.phone.trim()))

const validateLogin = () => {
  loginErrors.username = ''; loginErrors.password = ''
  let valid = true
  if (!loginForm.username.trim()) { loginErrors.username = t('auth.enterUsername'); valid = false }
  if (!loginForm.password.trim()) { loginErrors.password = t('auth.enterPassword'); valid = false }
  return valid
}

const validateRegister = () => {
  registerErrors.username = ''; registerErrors.phone = ''; registerErrors.password = ''; registerErrors.confirmPassword = ''
  let valid = true
  if (!registerForm.username.trim()) { registerErrors.username = t('auth.enterUsername'); valid = false }
  if (!registerForm.phone.trim()) { registerErrors.phone = t('auth.enterPhone'); valid = false }
  else if (!isPhoneValid.value) { registerErrors.phone = t('auth.enterValidPhone'); valid = false }
  if (!registerForm.password.trim()) { registerErrors.password = t('auth.enterPassword'); valid = false }
  else if (registerForm.password.length < 6) { registerErrors.password = t('auth.passwordTooShort'); valid = false }
  if (!registerForm.confirmPassword.trim()) { registerErrors.confirmPassword = t('auth.enterConfirmPassword'); valid = false }
  else if (registerForm.password !== registerForm.confirmPassword) { registerErrors.confirmPassword = t('auth.passwordMismatch'); valid = false }
  if (!agreeTerms.value) { showToast({ message: t('auth.agreeTermsRequired'), position: 'middle', duration: 2200 }); valid = false }
  return valid
}

const canRegister = computed(() => registerForm.username.trim() && isPhoneValid.value && registerForm.password.length >= 6 && registerForm.confirmPassword.trim() && registerForm.password === registerForm.confirmPassword && agreeTerms.value)

const clearLoginError = (field) => { loginErrors[field] = '' }
const clearRegisterError = (field) => { registerErrors[field] = '' }

const requestSmsCode = () => {
  if (!/^1[3-9]\d{9}$/.test(smsForm.phone.trim())) {
    showToast({ message: t('auth.enterValidPhone'), position: 'middle' })
    return
  }
  showToast({ message: t('auth.smsNotConfigured'), position: 'middle' })
}

const handleSmsLogin = () => {
  if (!/^1[3-9]\d{9}$/.test(smsForm.phone.trim())) {
    showToast({ message: t('auth.enterValidPhone'), position: 'middle' })
    return
  }
  if (!smsForm.code.trim()) {
    showToast({ message: t('auth.enterSmsCode'), position: 'middle' })
    return
  }
  showToast({ message: t('auth.smsNotConfigured'), position: 'middle' })
}

const handleLogin = async () => {
  if (!validateLogin()) return
  loginLoading.value = true
  showLoadingToast({ message: t('auth.loggingIn'), duration: 0, forbidClick: true, loadingType: 'spinner' })
  try {
    const response = await authApi.login({ username: loginForm.username.trim(), password: loginForm.password })
    if (response.code === 0) {
      // BUGID ACCT 修复：换账号登录时清空行程 store 残留（token 过期被踢回登录页后 trip 状态未清）
      tripStore.resetState()
      const data = response.data; setToken(data.token)
      // 【Token 自动刷新】保存长寿命 refreshToken（7 天），401 时 api 层自动旋转刷新
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      const username = data.user?.username || loginForm.username.trim()
      setCurrentUser(username)
      if (!accountExists(username)) initAccountData(username)
      const userInfo = { avatar: data.user?.avatar || '', nickname: data.user?.nickname || username, username, level: data.user?.level || '普通会员', points: data.user?.points || 0, following: data.user?.following || 0, followers: data.user?.followers || 0, travelNotes: data.user?.travelNotes || 0, bio: data.user?.bio || '', citiesVisited: data.user?.citiesVisited || 0, totalDays: data.user?.totalDays || 0, totalSpent: data.user?.totalSpent || 0, totalPhotos: data.user?.totalPhotos || 0 }
      setAccountData(username, 'userInfo', userInfo)
      closeToast()
      showToast({ message: t('auth.loginSuccess'), position: 'middle', duration: 1800 })
      setTimeout(() => { const u = localStorage.getItem('redirectUrl'); if (u) { localStorage.removeItem('redirectUrl'); router.push(u) } else router.push('/') }, 600)
    } else { closeToast(); showToast({ message: response.message || t('auth.loginFailed'), position: 'middle', duration: 1800 }) }
  } catch { closeToast(); showToast({ message: t('auth.networkError'), position: 'middle', duration: 1800 }) }
  finally { loginLoading.value = false }
}

const handleRegister = async () => {
  if (!validateRegister()) return
  registerLoading.value = true
  showLoadingToast({ message: t('auth.registering'), duration: 0, forbidClick: true, loadingType: 'spinner' })
  try {
    // 后端 AuthController.register 只接收 username/password/phone（无验证码流程）
    const response = await authApi.register({ username: registerForm.username.trim(), password: registerForm.password, confirmPassword: registerForm.confirmPassword, phone: registerForm.phone.trim() || null })
    if (response.code === 0) {
      const newUsername = registerForm.username.trim()
      if (!accountExists(newUsername)) initAccountData(newUsername)
      closeToast(); showToast({ message: t('auth.registerSuccess'), position: 'middle', duration: 2000 })
      activeTab.value = 'login'; loginForm.username = registerForm.username
      Object.assign(registerForm, { username: '', phone: '', password: '', confirmPassword: '' }); agreeTerms.value = false
    } else if (response.code === -2 || (response.message && response.message.includes('已存在'))) { closeToast(); showToast({ message: t('auth.usernameTaken'), position: 'middle', duration: 2000 }) }
    else { closeToast(); showToast({ message: response.message || t('auth.registerFailed'), position: 'middle', duration: 1800 }) }
  } catch { closeToast(); showToast({ message: t('auth.networkError'), position: 'middle', duration: 1800 }) }
  finally { registerLoading.value = false }
}

// ==================== 第三方 OAuth 登录配置 ====================
// 填入你的 AppID 后即可生效（密钥放后端 application.yml）
const OAUTH_CONFIG = {
  wechat: {
    appid: '',                    // ← 微信开放平台 AppID
    redirectUri: encodeURIComponent(window.location.origin + '/login'),
    authUrl: 'https://open.weixin.qq.com/connect/qrconnect',
  },
  alipay: {
    appid: '',                    // ← 支付宝开放平台 AppID
    redirectUri: encodeURIComponent(window.location.origin + '/login'),
    authUrl: 'https://openauth.alipay.com/oauth2/publicAppAuthorize.htm',
  },
  qq: {
    appid: '',
    redirectUri: encodeURIComponent(window.location.origin + '/login'),
    authUrl: 'https://graph.qq.com/oauth2.0/authorize',
  },
}

/** 生成 OAuth 防 CSRF state：crypto 强随机（32 位 hex），替代可预测的 Math.random */
const generateOAuthState = () => {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

const handleThirdPartyLogin = async (platform) => {
  const key = platform
  const cfg = OAUTH_CONFIG[key]
  // 未配置 AppID → 友好提示
  if (!cfg || !cfg.appid) {
    showToast({ message: t('auth.oauthNotConfigured', { platform: t('auth.' + key) }), position: 'middle', duration: 2200 })
    return
  }

  try {
    if (key === 'wechat') {
      // ──── 微信 OAuth 2.0 ────
      const state = generateOAuthState()
      localStorage.setItem('oauth_state', state)
      localStorage.setItem('oauth_platform', 'wechat')
      const url = `${cfg.authUrl}?appid=${cfg.appid}&redirect_uri=${cfg.redirectUri}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`
      window.location.href = url
    }
    else if (key === 'alipay') {
      // ──── 支付宝 OAuth 2.0 ────
      const state = generateOAuthState()
      localStorage.setItem('oauth_state', state)
      localStorage.setItem('oauth_platform', 'alipay')
      const url = `${cfg.authUrl}?app_id=${cfg.appid}&redirect_uri=${cfg.redirectUri}&scope=auth_user&state=${state}`
      window.location.href = url
    }
    else if (key === 'qq') {
      const state = generateOAuthState()
      localStorage.setItem('oauth_state', state)
      localStorage.setItem('oauth_platform', 'qq')
      const url = `${cfg.authUrl}?response_type=code&client_id=${cfg.appid}&redirect_uri=${cfg.redirectUri}&state=${state}&scope=get_user_info`
      window.location.href = url
    }
  } catch (e) {
    showToast({ message: t('auth.oauthRedirectFailed'), position: 'middle', duration: 1800 })
  }
}

/** 处理 OAuth 回调（在 onMounted 中调用） */
const handleOAuthCallback = async () => {
  const code = route.query.code
  const state = route.query.state
  const savedState = localStorage.getItem('oauth_state')
  const platform = localStorage.getItem('oauth_platform')

  // 非回调模式，跳过
  if (!code || !platform) return

  // 校验 state 防 CSRF
  if (state !== savedState) {
    showToast({ message: t('auth.oauthVerifyFailed'), position: 'middle', duration: 2000 })
    return
  }

  showLoadingToast({ message: t('auth.thirdPartyLoggingIn', { platform: t('auth.' + platform) }), duration: 0, forbidClick: true })

  try {
    // 调用后端换取 token
    const response = await authApi.socialLogin(platform, code, OAUTH_CONFIG[platform]?.redirectUri)

    if (response.code === 0) {
      const data = response.data
      setToken(data.token)
      if (data.refreshToken) setRefreshToken(data.refreshToken)
      const username = data.user?.username || `user_${Date.now()}`
      setCurrentUser(username)
      if (!accountExists(username)) initAccountData(username)
      if (data.user) setAccountData(username, 'userInfo', { ...(getAccountData(username, 'userInfo') || {}), ...data.user })
      closeToast()
      showToast({ message: t('auth.loginSuccessOAuth'), position: 'middle', duration: 1500 })
      setTimeout(() => {
        const u = localStorage.getItem('redirectUrl')
        if (u) { localStorage.removeItem('redirectUrl'); router.push(u) }
        else router.push('/')
      }, 500)
    } else {
      closeToast()
      showToast({ message: response.message || t('auth.loginFailed'), position: 'middle', duration: 1800 })
    }
  } catch {
    closeToast()
    showToast({ message: t('auth.networkError'), position: 'middle', duration: 1800 })
  } finally {
    localStorage.removeItem('oauth_state')
    localStorage.removeItem('oauth_platform')
    // 清理 URL 参数
    router.replace({ path: '/login', query: {} })
  }
}

const leaveAsGuest = () => {
  removeToken()
  removeRefreshToken()
  clearSession()
  localStorage.removeItem('redirectUrl')
  sessionStorage.removeItem('selected_destination_spot')
  location.replace(`${location.pathname}${location.search}#/`)
}
const goBack = leaveAsGuest

const handleForgetPassword = () => {
  showDialog({ title: t('auth.forgotPasswordTitle'), message: t('auth.forgotPasswordMessage'), confirmButtonText: t('auth.gotIt'), confirmButtonColor: '#7b42f5' }).catch(() => {})
}

const pageReady = ref(false)
onMounted(() => {
  requestAnimationFrame(() => { pageReady.value = true })
  handleOAuthCallback()
})
</script>

<template>
  <div class="auth-page" :class="{ ready: pageReady }">
    <!-- 背景图层 -->
    <div class="bg-scenery">
      <div class="bg-overlay"></div>
    </div>

    <!-- 返回 -->
    <button class="back-btn" @click="goBack" :aria-label="t('common.back')">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>

    <!-- 滚动区 -->
    <div ref="authScroll" class="auth-scroll">
      <div class="auth-inner" :class="{ register: !isLogin }">

        <!-- 表单卡片 -->
        <div class="form-card" :class="{ in: pageReady }">

          <!-- 登录 -->
          <Transition name="form-switch">
          <div v-if="isLogin" class="form-body" key="login">
            <template v-if="loginMethod === 'password'">
              <div class="input-group" :class="{ err: loginErrors.username }">
                <input v-model="loginForm.username" type="text" autocomplete="username" :placeholder="t('auth.username')" class="form-input" @focus="clearLoginError('username')" @input="clearLoginError('username')"/>
              </div>
              <div class="input-group" :class="{ err: loginErrors.password }">
                <input v-model="loginForm.password" :type="showLoginPwd ? 'text' : 'password'" autocomplete="current-password" :placeholder="t('auth.password')" class="form-input" @focus="clearLoginError('password')" @input="clearLoginError('password')"/>
                <button class="pwd-btn" @click="showLoginPwd = !showLoginPwd" type="button">
                  <svg v-if="!showLoginPwd" viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="3"/><path d="M2 10 S5 5 10 5 S18 10 18 10 S15 15 10 15 S2 10 2 10"/></svg>
                  <svg v-else viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="3" x2="17" y2="17"/><path d="M7 7 Q5 9 4 10 Q7 15 10 15 Q13 15 15 12"/><circle cx="10" cy="10" r="2"/></svg>
                </button>
              </div>
            </template>
            <template v-else>
              <div class="input-group">
                <input v-model="smsForm.phone" type="tel" inputmode="numeric" maxlength="11" autocomplete="tel" :placeholder="t('auth.phone')" class="form-input"/>
              </div>
              <div class="input-group">
                <input v-model="smsForm.code" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" :placeholder="t('auth.smsCode')" class="form-input"/>
                <button type="button" class="sms-code-btn" @click="requestSmsCode">{{ t('auth.sendCode') }}</button>
              </div>
            </template>
            <div v-if="loginMethod === 'password'" class="forgot-row">
              <span class="forgot-link" @click="handleForgetPassword">{{ t('auth.forgotPassword') }}</span>
            </div>
            <button class="submit-btn login-btn" :disabled="loginLoading" @click="loginMethod === 'password' ? handleLogin() : handleSmsLogin()">
              <span v-if="!loginLoading">{{ loginMethod === 'password' ? t('auth.loginNow') : t('auth.smsLogin') }}</span>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" class="spin"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.3)" stroke-width="3"/><path d="M12 2 A10 10 0 0 1 22 12" stroke="white" stroke-width="3" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>
            </button>
            <div class="secondary-actions">
              <button type="button" class="secondary-action" @click="loginMethod = loginMethod === 'password' ? 'sms' : 'password'">{{ loginMethod === 'password' ? t('auth.smsLogin') : t('auth.passwordLogin') }}</button>
              <span class="secondary-dot" aria-hidden="true">·</span>
              <button type="button" class="secondary-action" @click="switchTab('register', $event)">{{ t('auth.registerAccount') }}</button>
            </div>
          </div>
          </Transition>

          <!-- 注册 -->
          <Transition name="form-switch">
          <div v-if="!isLogin" class="form-body" key="register">
            <div class="input-group" :class="{ err: registerErrors.username }">
              <input v-model="registerForm.username" type="text" :placeholder="t('auth.username')" class="form-input" @focus="clearRegisterError('username')" @input="clearRegisterError('username')"/>
            </div>
            <div class="input-group" :class="{ err: registerErrors.phone }">
              <input v-model="registerForm.phone" type="tel" maxlength="11" :placeholder="t('auth.phone')" class="form-input" @focus="clearRegisterError('phone')" @input="clearRegisterError('phone')"/>
            </div>
            <div class="input-group" :class="{ err: registerErrors.password }">
              <input v-model="registerForm.password" :type="showRegPwd ? 'text' : 'password'" :placeholder="t('auth.passwordMinLength')" class="form-input" @focus="clearRegisterError('password')" @input="clearRegisterError('password')"/>
              <button class="pwd-btn" @click="showRegPwd = !showRegPwd" type="button">
                <svg v-if="!showRegPwd" viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="3"/><path d="M2 10 S5 5 10 5 S18 10 18 10 S15 15 10 15 S2 10 2 10"/></svg>
                <svg v-else viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="3" x2="17" y2="17"/><path d="M7 7 Q5 9 4 10 Q7 15 10 15 Q13 15 15 12"/><circle cx="10" cy="10" r="2"/></svg>
              </button>
            </div>
            <div class="input-group" :class="{ err: registerErrors.confirmPassword }">
              <input v-model="registerForm.confirmPassword" :type="showRegConfirmPwd ? 'text' : 'password'" :placeholder="t('auth.confirmPassword')" class="form-input" @focus="clearRegisterError('confirmPassword')" @input="clearRegisterError('confirmPassword')"/>
              <button class="pwd-btn" @click="showRegConfirmPwd = !showRegConfirmPwd" type="button">
                <svg v-if="!showRegConfirmPwd" viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="10" cy="10" r="3"/><path d="M2 10 S5 5 10 5 S18 10 18 10 S15 15 10 15 S2 10 2 10"/></svg>
                <svg v-else viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="3" y1="3" x2="17" y2="17"/><path d="M7 7 Q5 9 4 10 Q7 15 10 15 Q13 15 15 12"/><circle cx="10" cy="10" r="2"/></svg>
              </button>
            </div>
            <div class="terms-row">
              <button class="terms-check" @click="agreeTerms = !agreeTerms" type="button">
                <svg v-if="agreeTerms" viewBox="0 0 18 18" width="18" height="18"><circle cx="9" cy="9" r="8.5" fill="#7b42f5"/><polyline points="5 9.5 8 12 13 6" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <svg v-else viewBox="0 0 18 18" width="18" height="18"><circle cx="9" cy="9" r="8" fill="none" stroke="rgba(255,255,255,.78)" stroke-width="1.5"/></svg>
              </button>
              <span class="terms-label">{{ t('auth.termsLabelPrefix') }}<span class="terms-link" @click.stop="openTerms('userAgreement')">{{ t('auth.userAgreement') }}</span>{{ t('auth.termsLabelAnd') }}<span class="terms-link" @click.stop="openTerms('privacyPolicy')">{{ t('auth.privacyPolicy') }}</span></span>
            </div>
            <button class="submit-btn reg-btn" :class="{ off: !canRegister }" :disabled="!canRegister || registerLoading" @click="handleRegister">
              <span v-if="!registerLoading">{{ t('common.register') }}</span>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" class="spin"><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,.3)" stroke-width="3"/><path d="M12 2 A10 10 0 0 1 22 12" stroke="white" stroke-width="3" stroke-linecap="round"><animateTransform attributeName="transform" type="rotate" from="0 12 12" to="360 12 12" dur="0.8s" repeatCount="indefinite"/></path></svg>
            </button>
            <div class="secondary-actions">
              <button type="button" class="secondary-action" @click="switchTab('login', $event)">{{ t('common.login') }}</button>
            </div>
          </div>
          </Transition>
        </div>
      </div>
    </div>

    <div class="social-login" aria-label="快捷登录">
      <button class="social-icon wechat" @click="handleThirdPartyLogin('wechat')" :aria-label="t('auth.wechat')" :title="t('auth.wechat')">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M15.5 8.5a5.5 5.5 0 0 1 0 11c-.8 0-1.6-.2-2.3-.5L9 20.5l.5-3.5A5.5 5.5 0 1 1 15.5 8.5z"/><circle cx="12.5" cy="14" r=".8" fill="currentColor" stroke="none"/><circle cx="16.5" cy="14" r=".8" fill="currentColor" stroke="none"/></svg>
      </button>
      <button class="social-icon qq" @click="handleThirdPartyLogin('qq')" :aria-label="t('auth.qq')" :title="t('auth.qq')">
        <span>QQ</span>
      </button>
      <button class="social-icon alipay" @click="handleThirdPartyLogin('alipay')" :aria-label="t('auth.alipay')" :title="t('auth.alipay')"><span>支</span></button>
    </div>

    <!-- 协议弹窗 -->
    <van-popup v-model:show="showTermsPopup" position="bottom" :style="{ height: '65%', borderRadius: '20px 20px 0 0' }" round safe-area-inset-bottom>
      <div class="terms-popup">
        <div class="terms-popup-header">
          <span class="terms-popup-title">{{ termsPopupTitle }}</span>
          <button class="terms-popup-close" @click="showTermsPopup = false">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div class="terms-popup-body"><pre class="terms-content">{{ termsPopupContent }}</pre></div>
        <div class="terms-popup-footer"><button class="terms-agree-btn" @click="agreeTerms = true; showTermsPopup = false">{{ t('auth.termsAgree') }}</button></div>
      </div>
    </van-popup>
  </div>
</template>

<style scoped>
/*
 * ================================================================
 * 设计规范
 *   主色: #7b42f5 (紫)
 *   圆角: 输入框12px / 卡片18px / 按钮14px
 *   间距: 模块24px / 输入框16px / 内边距14px
 *   最大宽: 420px 自动居中
 * ================================================================
 */

/* ──── 页面 ──── */
.auth-page {
  position: relative; width: 100%; height: 100vh; height: 100dvh;
  overflow: hidden; display: flex; flex-direction: column;
}

/* ──── 背景 ──── */
.bg-scenery {
  position: absolute; z-index: 0; inset: 0;
  background: url('/images/landmarks/1a57149358c0.jpg') center/cover no-repeat, linear-gradient(180deg, #87CEEB 0%, #2D7A6E 55%, #4DB8A0 100%);
  background-color: #4DB8A0;
}
.bg-overlay {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(21,31,68,.22) 0%, rgba(30,42,85,.08) 34%, rgba(18,26,55,.2) 100%),
    radial-gradient(circle at 50% 14%, rgba(255,255,255,.22), transparent 34%);
}

/* ──── 返回 ──── */
.back-btn {
  position: absolute; z-index: 10;
  top: max(44px, env(safe-area-inset-top, 12px)); left: 16px;
  width: 36px; height: 36px;
  background: transparent; border: 0;
  color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background 0.2s, color 0.2s, transform 0.2s;
}
.back-btn:active { transform: translateX(-2px); }

/* ──── 滚动区 ──── */
.auth-scroll {
  position: relative; z-index: 2; flex: 1;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
  padding: 0 20px 24px;
}
.auth-inner {
  display: flex; flex-direction: column; align-items: center;
  padding-top: max(224px, 27vh);
  padding-bottom: 80px;
}
.auth-inner.register { padding-top: max(128px, 15vh); }

/* ──── 表单卡片（淡紫磨砂玻璃） ──── */
.form-card {
  width: 100%; max-width: 420px;
  background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none;
  border-radius: 0; padding: 4px 2px 0; position: relative; overflow: hidden;
  border: 0; box-shadow: none;
  opacity: 0; transform: translateY(12px); transition: opacity .5s ease .1s, transform .5s ease .1s;
}
.form-card.in { opacity: 1; transform: translateY(0); }
.form-body { display: flex; flex-direction: column; gap: 14px; }

/* 表单切换动画 */
.form-switch-enter-active { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.form-switch-leave-active { transition: all 0.2s cubic-bezier(0.4, 0, 1, 1); position: absolute; width: 100%; }
.form-switch-enter-from { opacity: 0; transform: translateX(40px); }
.form-switch-leave-to   { opacity: 0; transform: translateX(-30px); }

/* ──── 输入框 ──── */
.input-group {
  display: flex; align-items: center;
  background: transparent; padding: 0 4px; height: 46px;
  border: 0; border-bottom: 1px solid rgba(255,255,255,.58);
  transition: border-color .25s;
}
.input-group:focus-within { border-bottom-color: #fff; }
.input-group.err { border-bottom-color: #fca5a5; }
.form-input {
  flex: 1; min-width: 0; height: 100%; border: none; outline: none;
  background: transparent; font-size: 15px; color: #fff; text-shadow: 0 1px 4px rgba(15,23,42,.25);
}
.form-input::placeholder { color: rgba(255,255,255,.74); font-size: 14px; }
.form-input:-webkit-autofill,
.form-input:-webkit-autofill:hover,
.form-input:-webkit-autofill:focus,
.form-input:-webkit-autofill:active {
  -webkit-background-clip: text;
  -webkit-text-fill-color: #fff !important;
  caret-color: #fff;
  transition: background-color 9999s ease-out 0s;
}
.pwd-btn {
  flex-shrink: 0; width: 36px; height: 36px; border: none; background: transparent;
  color: rgba(255,255,255,.72); cursor: pointer; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  transition: opacity .2s, transform .2s; margin-left: 2px;
}
.pwd-btn:active { background: rgba(123,66,245,.08); color: #7b42f5; transform: scale(.88); }
.sms-code-btn { flex-shrink: 0; border: 0; background: transparent; color: #fff; font-size: 13px; font-weight: 600; padding: 8px 0 8px 12px; text-shadow: 0 1px 5px rgba(15,23,42,.4); }

/* ──── 忘记密码 ──── */
.forgot-row { display: flex; justify-content: flex-end; margin-top: -4px; }
.forgot-link { font-size: 13px; color: #fff; cursor: pointer; padding: 4px 2px; font-weight: 600; text-shadow: 0 1px 6px rgba(15,23,42,.45); }

/* ──── 提交按钮 ──── */
.submit-btn {
  width: 100%; height: 48px; border: 1px solid rgba(255,255,255,.48); border-radius: 12px;
  color: #fff; font-size: 16px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: background .25s ease, transform .25s ease;
  margin-top: 4px;
}
.submit-btn:active { transform: scale(.96); }
.submit-btn:disabled { opacity: .5; pointer-events: none; }
.login-btn, .reg-btn { background: rgba(15,23,42,.24); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); box-shadow: none; }
.secondary-actions { display: flex; align-items: center; justify-content: center; gap: 12px; margin-top: 0; }
.secondary-action { border: 0; background: transparent; color: rgba(255,255,255,.86); font-size: 13px; padding: 5px 4px; text-shadow: 0 1px 5px rgba(15,23,42,.4); }
.secondary-dot { color: rgba(255,255,255,.55); }
.login-btn:active, .reg-btn:active:not(.off) { background: rgba(15,23,42,.38); transform: scale(.965); }
.reg-btn.off { opacity: 1; background: rgba(15,23,42,.14); color: rgba(255,255,255,.56); border-color: rgba(255,255,255,.24); }
.spin { animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ──── 协议 ──── */
.terms-row { display: flex; align-items: flex-start; gap: 6px; }
.terms-check { flex-shrink: 0; border: none; background: transparent; cursor: pointer; padding: 0; margin-top: 1px; }
.terms-label { font-size: 12px; color: rgba(255,255,255,.82); line-height: 1.6; text-shadow: 0 1px 5px rgba(15,23,42,.4); }
.terms-link { color: #fff; font-weight: 700; cursor: pointer; text-decoration: underline; text-underline-offset: 2px; }

/* ──── 左下角快捷登录 ──── */
.social-login {
  position: absolute; z-index: 4; left: 20px; bottom: max(24px, env(safe-area-inset-bottom, 16px));
  display: flex; align-items: center; gap: 10px;
}
.social-icon {
  width: 36px; height: 36px; padding: 6px; border: 0; background: transparent;
  display: flex; align-items: center; justify-content: center; filter: drop-shadow(0 1px 4px rgba(15,23,42,.35));
}
.social-icon.wechat { color: #07c160; }
.social-icon.qq { color: #12b7f5; font-size: 14px; font-weight: 800; letter-spacing: -1px; }
.social-icon.alipay { color: #1677ff; font-size: 23px; font-weight: 800; line-height: 1; }

/* ──── 协议弹窗 ──── */
.terms-popup { display: flex; flex-direction: column; height: 100%; background: #fff; }
.terms-popup-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px 14px; border-bottom: 1px solid #f1f5f9; }
.terms-popup-title { font-size: 17px; font-weight: 700; color: #1e293b; }
.terms-popup-close { width: 36px; height: 36px; border: none; background: #f8fafc; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #94a3b8; }
.terms-popup-body { flex: 1; overflow-y: auto; padding: 16px 20px; }
.terms-content { font-size: 13px; line-height: 1.8; color: #475569; white-space: pre-wrap; word-break: break-word; margin: 0; }
.terms-popup-footer { padding: 14px 20px; padding-bottom: calc(14px + env(safe-area-inset-bottom, 0px)); border-top: 1px solid #f1f5f9; }
.terms-agree-btn { width: 100%; padding: 14px; border: none; border-radius: 14px; background: #7b42f5; color: #fff; font-size: 16px; font-weight: 600; cursor: pointer; }

/* ──── 移动端 ──── */
@media screen and (max-width: 360px) {
  .auth-scroll { padding: 0 16px 24px; }
  .form-card { padding: 4px 0 0; }
  .input-group { height: 46px; }
  .submit-btn { height: 48px; font-size: 16px; }
}
@media screen and (min-width: 420px) {
  .form-card { padding: 28px 24px 24px; }
}

:deep(.van-popup) { z-index: 10000 !important; }
:deep(.van-overlay) { z-index: 9990 !important; }
</style>
