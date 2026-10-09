<script setup>
import { ref, nextTick, watch, computed, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { showToast, showConfirmDialog } from 'vant'
import { getToken } from '../utils/auth'
import { chatApi, planApi } from '../api'
import { CHAT_SYSTEM_PROMPT } from '../constants/systemPrompts'
import {
  getCurrentSessionId, getCurrentSessionMessages,
  saveCurrentSessionMessages, clearCurrentSession, createNewSession,
  getAllSessions, switchToSession, deleteSession,
  genMsgId,
} from '../utils/chatSession'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import 'highlight.js/styles/github.css'

defineOptions({ name: 'AIChatDialog' })

const { t } = useI18n()

/* ==================== Props ==================== */
const props = defineProps({
  visible: { type: Boolean, default: false },
  contextQuery: {
    type: Object,
    default: () => ({ destination: '', budget: '', days: '' }),
  },
  initialMessages: {
    type: Array,
    default: () => [],
  },
})

/* ==================== Emits ==================== */
const emit = defineEmits(['update:visible', 'close', 'plan-saved'])

/* v-model 双向绑定：localVisible 同步 props.visible */
const localVisible = computed({
  get: () => props.visible,
  set: (val) => emit('update:visible', val),
})

/* ==================== State ==================== */
const messages = ref([])
const inputText = ref('')
const chatContent = ref(null)
const isSending = ref(false)
const isThinking = ref(false)
const isListening = ref(false)
const recognition = ref(null)
const isAutoScrollEnabled = ref(true)
let abortController = null
const showQuickBar = ref(true)
const isSavingPlan = ref(false)
const showTools = ref(false)
const messageInput = ref(null)
const hasConversation = computed(() => messages.value.some(m => m.type === 'user' || m.type === 'ai'))
const toolActions = computed(() => [
  { text: t('chat.history'), icon: 'clock-o', key: 'history', disabled: isSending.value },
  { text: t('chat.newConversation'), icon: 'add-o', key: 'new', disabled: isSending.value },
  ...(hasConversation.value ? [{ text: t('chat.clearConversation'), icon: 'delete-o', key: 'clear', disabled: isSending.value }] : []),
])
const selectTool = (action) => {
  showTools.value = false
  if (action.key === 'history') openHistory()
  else if (action.key === 'new') newConversation()
  else if (action.key === 'clear') clearConversation()
}

/* ==================== Markdown 渲染 ==================== */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  // MAPXSS 修复：linkify 生成的 <a href> 不做 scheme 过滤，仅放行 http/https/mailto 防 javascript: 注入
  validateLink: (url) => /^(https?:|mailto:)/i.test(url),
  highlight: function (str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return `<pre><code class="hljs language-${lang}">${hljs.highlight(str, { language: lang, ignoreIllegals: true }).value}</code></pre>`
      } catch (__) {}
    }
    return `<pre><code class="hljs">${md.utils.escapeHtml(str)}</code></pre>`
  },
})

/* ==================== Helpers ==================== */
const generateUniqueId = () => `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`

const preprocessMarkdown = (text) => {
  if (!text) return ''
  let result = text
  result = result.replace(/\\n/g, '\n')
  result = result.replace(/^(#{1,6})([^\s#])/gm, '$1 $2')
  result = result.replace(/^(\s*[-*+])(\S)/gm, '$1 $2')
  result = result.replace(/^(\s*\d+\.)([^\s])/gm, '$1 $2')
  result = result.replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
  result = result.replace(/<\/?strong>/g, '**')
  result = result.replace(/<em>(.*?)<\/em>/g, '*$1*')
  result = result.replace(/<\/?em>/g, '*')
  result = result.replace(/<br\s*\/?>/gi, '\n')
  result = result.replace(/\*\*\s*\*\*/g, '')
  return result
}

const renderMarkdown = (text) => (text ? md.render(preprocessMarkdown(text)) : '')

/* ==================== Quick Questions ==================== */
// 用 computed：切换语言后快捷问题/引导项即时更新，而非 setup 期一次性求值
// 正文 query 同样走 i18n，与 label 同步切换语言
const quickQuestions = computed(() => [
  { label: t('chat.quickCheaper'), query: t('chat.quickCheaperQuery') },
  { label: t('chat.quickFood'), query: t('chat.quickFoodQuery') },
  { label: t('chat.quickShorter'), query: t('chat.quickShorterQuery') },
  { label: t('chat.quickFamily'), query: t('chat.quickFamilyQuery') },
])

/* ==================== Guide Chips ==================== */
const guideChips = computed(() => [
  { key: 'weekend', icon: 'guide-o' },
  { key: 'couples', icon: 'like-o' },
  { key: 'parents', icon: 'friends-o' },
  { key: 'beijing', icon: 'location-o' },
].map(chip => ({
  ...chip, label: t(`chat.drawer.${chip.key}`),
  description: t(`chat.drawer.${chip.key}Hint`), query: t(`chat.drawer.${chip.key}Query`),
})))

/* ==================== Plan Detection ==================== */
const hasPlanContent = (content) => {
  if (!content || content.length < 100) return false
  const planPatterns = [
    /第\d+天/, /Day\s*\d/i, /行程/, /费用/, /住宿/, /交通/,
    /美食/, /景点/, /注意事项/, /预算汇总/, /总计/,
  ]
  const matchCount = planPatterns.filter((p) => p.test(content)).length
  return matchCount >= 2
}

const lastAIMessageHasPlan = computed(() => {
  if (messages.value.length === 0) return false
  const lastAI = [...messages.value].reverse().find((m) => m.type === 'ai')
  return lastAI && !lastAI.isStreaming && hasPlanContent(lastAI.content)
})

/* ==================== Scroll Management ==================== */
let scrollScheduled = false
let lastScrollTime = 0

const isNearBottom = () => {
  if (!chatContent.value) return true
  const el = chatContent.value
  return el.scrollHeight - el.scrollTop - el.clientHeight < 100
}

const handleScroll = () => {
  isAutoScrollEnabled.value = isNearBottom()
}

const scrollToBottom = async (force = false) => {
  await nextTick()
  if (!chatContent.value) return
  const now = Date.now()
  if (now - lastScrollTime < 50) {
    if (!scrollScheduled) {
      scrollScheduled = true
      setTimeout(() => { scrollToBottom(force); scrollScheduled = false }, 60)
    }
    return
  }
  lastScrollTime = now
  if (force || isAutoScrollEnabled.value) {
    chatContent.value.scrollTo({
      top: chatContent.value.scrollHeight,
      behavior: isSending.value ? 'auto' : 'smooth',
    })
  }
}

/* ==================== Voice Recognition ==================== */
const initSpeechRecognition = () => {
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    recognition.value = new SpeechRecognition()
    recognition.value.lang = 'zh-CN'
    recognition.value.continuous = false
    recognition.value.interimResults = true
    recognition.value.onstart = () => {
      isListening.value = true
      showToast(t('chat.listening'))
    }
    recognition.value.onresult = (event) => {
      let finalTranscript = ''
      let interimTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) finalTranscript += transcript
        else interimTranscript += transcript
      }
      if (interimTranscript) inputText.value = finalTranscript + interimTranscript
      if (finalTranscript) inputText.value = finalTranscript
    }
    recognition.value.onerror = (event) => {
      isListening.value = false
      const errors = {
        'no-speech': t('chat.errNoSpeech'),
        'audio-capture': t('chat.errAudioCapture'),
        'not-allowed': t('chat.errNotAllowed'),
      }
      showToast(errors[event.error] || t('chat.recognitionFailed'))
    }
    recognition.value.onend = () => {
      isListening.value = false
    }
  }
}

const toggleVoiceInput = () => {
  if (!recognition.value) {
    showToast(t('chat.voiceNotSupported'))
    return
  }
  if (isListening.value) {
    recognition.value.stop()
  } else {
    inputText.value = ''
    recognition.value.start()
  }
}

const stopVoice = () => {
  if (recognition.value) {
    try { recognition.value.stop() } catch (e) { /* ignore */ }
    isListening.value = false
  }
}

/* ==================== Send Message (SSE Streaming) ==================== */
let sendDebounce = false

/* ==================== SSE 断线重连 ==================== */
// 【注意】后端限流 20 次/分钟，重连退避间隔必须 ≥2s（2s / 4s，最多 2 次）
const SSE_RECONNECT_DELAYS = [2000, 4000]
const isReconnecting = ref(false)

/**
 * 流式对话 + 网络错误自动重连：
 * - AbortError（主动取消/关闭弹层）→ 原样上抛，静默不提示
 * - 网络错误 → 丢弃半截回复，退避后重新发送完整消息列表（后端重新生成）
 * - 重连等待期间弹层关闭/组件卸载（abortController 被置 null）→ 中止，不复活
 */
const streamChatWithReconnect = async (chatHistory, aiMsgIndex) => {
  let reconnectCount = 0
  for (;;) {
    abortController = new AbortController()
    try {
      const response = await chatApi.getChatStream([
        {
          role: 'system',
          content: CHAT_SYSTEM_PROMPT,
        },
        ...chatHistory,
      ], abortController.signal)

      if (!response.ok) throw new Error(`HTTP ${response.status}`)

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let isDone = false

      while (!isDone) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() || ''
        for (const evt of events) {
          const trimmedEvt = evt.trim()
          if (!trimmedEvt) continue
          if (trimmedEvt === 'data: [DONE]' || trimmedEvt === 'data:[DONE]') {
            isDone = true
            break
          }
          if (!trimmedEvt.startsWith('data:')) continue
          try {
            const dataLines = trimmedEvt.split('\n')
            // 所有行都保留：首行剥掉 data: 前缀，续行原样保留（含真实换行的分帧内容不再丢失）
            let content = dataLines
              .map((line) => line.replace(/^data:\s?/, ''))
              .join('\n')
            if (content && content !== '[DONE]' && content.trim().toLowerCase() !== 'null') {
              if (isThinking.value) isThinking.value = false
              // 防御：过滤可能残留的 "null" 分片
              messages.value[aiMsgIndex].content += content
              scrollToBottom()
            }
          } catch (e) {
            /* skip malformed SSE lines */
          }
        }
      }
      return // 流正常结束
    } catch (e) {
      if (e?.name === 'AbortError') throw e // 主动取消，不重连
      if (reconnectCount >= SSE_RECONNECT_DELAYS.length) throw e // 重连次数耗尽
      const delay = SSE_RECONNECT_DELAYS[reconnectCount]
      reconnectCount += 1
      if (messages.value[aiMsgIndex]) messages.value[aiMsgIndex].content = '' // 丢弃半截回复，重发完整消息列表
      isReconnecting.value = true
      await new Promise((r) => setTimeout(r, delay))
      isReconnecting.value = false
      // 重连等待期间弹层关闭/卸载 → 中止，避免后台悄悄重连
      if (!abortController) {
        const err = new Error('aborted during reconnect wait')
        err.name = 'AbortError'
        throw err
      }
    }
  }
}

const sendMessage = async () => {
  const text = inputText.value.trim()
  if (!text || isSending.value) {
    showToast(t('chat.inputRequired'))
    return
  }
  if (sendDebounce) return
  sendDebounce = true
  setTimeout(() => { sendDebounce = false }, 500)

  // 【历史对话】确保存在当前会话，否则首次对话无法持久化
  if (!getCurrentSessionId()) createNewSession()

  isSending.value = true
  isThinking.value = true
  showQuickBar.value = false

  messages.value.push({ id: generateUniqueId(), type: 'user', content: text })
  inputText.value = ''
  await nextTick()
  scrollToBottom(true)

  const aiMsgIndex = messages.value.length
  messages.value.push({ id: generateUniqueId(), type: 'ai', content: '', isStreaming: true })

  const { destination, budget, days } = props.contextQuery
  let prompt = text
  if (destination && budget && days) {
    prompt = `我计划去${destination}旅游，预算${budget}元，共${days}天。${text}`
  }

  const chatHistory = messages.value
    .filter((m) => m.type === 'user' || (m.type === 'ai' && m.content && m.content.length > 0))
    .map((m) => ({ role: m.type === 'user' ? 'user' : 'assistant', content: m.content }))
  // BUGID 修复：此前构造的上下文 prompt 从未传给后端（死代码），这里把它注入为当前这条
  // user 消息的 content，让 AI 真正收到目的地/预算/天数上下文；与 sendQuickWithContext 共用同一套逻辑
  if (prompt !== text) {
    const lastUserMsg = [...chatHistory].reverse().find(m => m.role === 'user')
    if (lastUserMsg) {
      lastUserMsg.content = prompt
    } else {
      chatHistory.push({ role: 'user', content: prompt })
    }
  }

  try {
    await streamChatWithReconnect(chatHistory, aiMsgIndex)
    if (messages.value[aiMsgIndex]) messages.value[aiMsgIndex].isStreaming = false
    isSending.value = false
    isThinking.value = false
    showQuickBar.value = true
  } catch (e) {
    if (e?.name === 'AbortError') return
    if (messages.value[aiMsgIndex]) messages.value[aiMsgIndex].isStreaming = false
    isSending.value = false
    isThinking.value = false
    isReconnecting.value = false
    showQuickBar.value = true
    showToast(t('chat.requestFailed'))
  }
}

const fillSuggestion = async (question) => {
  inputText.value = question
  await nextTick()
  messageInput.value?.focus()
}

/* 【修复】快捷指令携带上下文：将已有行程内容附带给AI */
const sendQuickWithContext = (label, query) => {
  const lastAIMsg = [...messages.value].reverse().find(m => m.type === 'ai' && m.content?.length > 50)
  if (lastAIMsg) {
    inputText.value = `【当前行程参考】\n${lastAIMsg.content.slice(0, 500)}\n\n【新需求】${query}`
  } else {
    inputText.value = query
  }
  sendMessage()
}

/* ==================== Save Plan ==================== */
const savePlan = async () => {
  if (isSavingPlan.value) return
  const { destination, budget, days } = props.contextQuery
  const lastAI = [...messages.value].reverse().find((m) => m.type === 'ai')
  if (!lastAI) return

  try {
    isSavingPlan.value = true
    await planApi.savePlan({
      destination: destination || '未指定',
      budget: Number(budget) || null,
      days: Number(days) || null,
      // 后端 SavedPlanRequest 只有 planData 字段，content 会被丢弃 → 内容放进 planData
      planData: { content: lastAI.content },
      source: 'home',
    })
    showToast(t('chat.planSaved'))
    emit('plan-saved', {
      destination: destination || '未指定',
      budget: budget || '',
      days: days || '',
      content: lastAI.content,
    })
  } catch (e) {
    showToast(t('chat.saveFailed'))
  } finally {
    isSavingPlan.value = false
  }
}

/* ==================== Dialog Controls ==================== */
/** 保存会话前处理：最后一条若仍在流式生成（被中断），先标记为已中断再持久化，
 *  避免重开时恢复半截的流式气泡 / isStreaming 残留 */
const saveSessionMessagesSafe = () => {
  const list = messages.value
  if (Array.isArray(list) && list.length) {
    const last = list[list.length - 1]
    if (last && last.type === 'ai' && last.isStreaming) {
      last.isStreaming = false
      last.interrupted = true
    }
  }
  saveCurrentSessionMessages(list)
}

const closeDialog = () => {
  saveSessionMessagesSafe()
  localVisible.value = false
  emit('close')
  if (abortController) { abortController.abort(); abortController = null }
  stopVoice()
  isSending.value = false
  isThinking.value = false
  isReconnecting.value = false
}

/* ==================== Init Messages ==================== */
/* 清洗历史消息里遗留的 "nullnullnull..."（旧版后端推理分片产生的脏数据） */
const stripLeadingNulls = (content) =>
  typeof content === 'string' ? content.replace(/^(null\s*)+/i, '') : content || ''

const initMessages = () => {
  // 【修复】优先从持久存储加载当前会话消息
  const saved = getCurrentSessionMessages()
  const { destination, budget, days } = props.contextQuery

  if (props.initialMessages && props.initialMessages.length > 0) {
    messages.value = [...props.initialMessages]
  } else if (saved.length > 1) {
    // 有历史会话记录 → 恢复（清洗旧 AI 消息里遗留的 null 前缀）
    messages.value = saved.map((m) => (m.type === 'ai' ? { ...m, content: stripLeadingNulls(m.content) } : m))
  } else {
    // 全新会话 → 种子消息
    messages.value = [{ id: genMsgId(), type: 'system', content: t('chat.greeting') }]
    if (destination && budget && days) {
      messages.value.push({ id: genMsgId(), type: 'system', content: t('chat.loadedInfo', { dest: destination, days: days, budget: budget }) })
    }
  }
}

/* 【修复】新建会话 */
const newConversation = () => {
  saveSessionMessagesSafe() // 先保存当前
  createNewSession()
  messages.value = [{
    id: genMsgId(), type: 'system',
    content: t('chat.greetingNew'),
  }]
  showQuickBar.value = false
  showToast({ message: t('chat.newConversationStarted'), position: 'top' })
}

/* 【修复】清空当前会话 */
const clearConversation = async () => {
  try {
    await showConfirmDialog({
      title: t('chat.clearConversation'), message: t('chat.drawer.clearCurrentMessage'),
      zIndex: 10040,
      confirmButtonText: t('chat.clearConfirm'), cancelButtonText: t('common.cancel'),
    })
  } catch { return }
  clearCurrentSession()
  messages.value = [{
    id: genMsgId(), type: 'system',
    content: t('chat.greeting'),
  }]
  showQuickBar.value = false
  showToast({ message: t('chat.conversationCleared'), position: 'top' })
}

/* ==================== 历史对话列表（豆包式历史会话入口） ==================== */
const showHistory = ref(false)
const conversations = ref([])
const loadConversations = () => { conversations.value = getAllSessions() }
const openHistory = () => { saveSessionMessagesSafe(); loadConversations(); showHistory.value = true }

/** 会话预览：优先取最近一条 AI 回复，否则用户消息 */
const convPreview = (c) => {
  if (!c.messages || !c.messages.length) return t('chat.historyEmptyConversation')
  const msgs = [...c.messages].reverse()
  const a = msgs.find((x) => x.type === 'ai' && x.content)
  if (a) return a.content.slice(0, 50) + (a.content.length > 50 ? '...' : '')
  const u = msgs.find((x) => x.type === 'user' && x.content)
  return u ? u.content.slice(0, 50) + (u.content.length > 50 ? '...' : '') : t('chat.historyEmptyConversation')
}

const convTime = (ts) => {
  if (!ts) return ''
  const d = new Date(ts)
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return t('chat.timeJustNow')
  if (mins < 60) return t('chat.timeMinAgo', { n: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t('chat.timeHourAgo', { n: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t('chat.timeDayAgo', { n: days })
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/** 切换到指定历史会话 */
const pickConversation = (conv) => {
  saveSessionMessagesSafe()
  const restored = switchToSession(conv.id)
  if (restored) {
    messages.value = restored.map((m) => (m.type === 'ai' ? { ...m, content: stripLeadingNulls(m.content) } : m))
  } else {
    messages.value = [{ id: genMsgId(), type: 'system', content: t('chat.greeting') }]
  }
  showQuickBar.value = messages.value.length > 1
  showHistory.value = false
  nextTick(); nextTick(); scrollToBottom(true)
  showToast({ message: t('chat.historyRestored'), position: 'top' })
}

/** 删除指定历史会话；若删的是当前会话则重置为全新对话 */
const removeConversation = async (id) => {
  try {
    await showConfirmDialog({
      title: t('chat.deleteConversationTitle'),
      message: t('chat.deleteConversationMsg'),
      zIndex: 10040,
      confirmButtonText: t('chat.deleteConfirm'),
      cancelButtonText: t('common.cancel'),
    })
    const wasCurrent = getCurrentSessionId() === id
    deleteSession(id)
    loadConversations()
    if (wasCurrent) {
      messages.value = [{ id: genMsgId(), type: 'system', content: t('chat.greeting') }]
      showQuickBar.value = false
    }
    showToast({ message: t('chat.deleteConversationDone'), position: 'top' })
  } catch (e) { /* 用户取消 */ }
}

const startNewFromHistory = () => { newConversation(); showHistory.value = false }

/* ==================== Lifecycle ==================== */
watch(
  () => props.visible,
  async (val) => {
    showTools.value = false
    if (val) {
      // 【修复】打开时从持久存储恢复会话消息
      initMessages()
      showHistory.value = false
      showQuickBar.value = messages.value.length > 1
      await nextTick(); await nextTick()
      scrollToBottom(true)
    } else {
      // 【修复】关闭时保存会话，不断开SSE连接（由closeDialog处理）
      saveSessionMessagesSafe()
      if (abortController) {
        abortController.abort()
        abortController = null
      }
      stopVoice()
      isSending.value = false
      isThinking.value = false
      isReconnecting.value = false
    }
  }
)

// Initialize voice recognition on creation
initSpeechRecognition()

// 组件销毁时兜底中止：父组件直接卸载（未走 visible=false）时也要断开 SSE、停语音，
// 防止流式写入已卸载组件的响应式状态、后台请求泄漏
onBeforeUnmount(() => {
  if (abortController) { abortController.abort(); abortController = null }
  isReconnecting.value = false
  stopVoice()
})
</script>

<template>
  <van-popup
    v-model:show="localVisible"
    class="ai-chat-popup"
    :aria-label="t('chat.assistantName')"
    teleport="body"
    :z-index="10000"
    position="bottom"
    :style="{ height: '88%', maxHeight: '88dvh' }"
    lock-scroll
    close-on-click-overlay
    round
    @update:show="(val) => !val && closeDialog()"
  >
    <div class="dialog-root">
      <div class="drawer-handle" aria-hidden="true" />
      <!-- ======== 历史对话列表视图 ======== -->
      <div v-if="showHistory" class="history-view">
        <div class="history-header">
          <span class="history-title">{{ t('chat.history') }}</span>
          <button class="header-action-btn" :aria-label="t('chat.drawer.backToChat')" @click="showHistory = false"><van-icon name="arrow-left" size="20" /></button>
        </div>
        <div class="history-body">
          <div v-if="conversations.length === 0" class="history-empty">
            <van-icon class="history-empty-icon" name="clock-o" />
            <div class="history-empty-text">{{ t('chat.noHistory') }}</div>
          </div>
          <div v-else class="history-list">
            <div v-for="conv in conversations" :key="conv.id" class="history-item" @click="pickConversation(conv)">
              <div class="hi-main">
                <div class="hi-title">{{ conv.title || t('chat.newConversation') }}</div>
                <div class="hi-preview">{{ convPreview(conv) }}</div>
              </div>
              <div class="hi-right">
                <span class="hi-time">{{ convTime(conv.updatedAt) }}</span>
                <van-icon name="delete-o" size="18" color="#EF4444" class="hi-del" role="button" :aria-label="t('chat.deleteConversationTitle')" @click.stop="removeConversation(conv.id)" />
              </div>
            </div>
          </div>
          <button class="history-new-btn" @click="startNewFromHistory">
            <van-icon name="add-o" size="18" />{{ t('chat.newConversation') }}
          </button>
        </div>
      </div>
      <template v-else>
      <!-- ======== Header ======== -->
      <div class="dialog-header">
        <div class="assistant-brand">
          <div class="brand-avatar" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
              <circle cx="16" cy="16" r="11" opacity=".4" />
              <path d="m21 11-3 7-7 3 3-7 7-3Z" fill="currentColor" fill-opacity=".12" />
              <path d="m14 14 4 4M16 3v3m13 10h-3M16 29v-3M3 16h3" stroke-linecap="round" />
            </svg>
          </div>
          <div><div class="header-title">{{ t('chat.assistantName') }}</div><div class="header-subtitle">{{ t('chat.drawer.subtitle') }}</div></div>
        </div>
        <div class="header-right">
          <van-popover v-model:show="showTools" :actions="toolActions" placement="bottom-end" :z-index="10020" @select="selectTool">
            <template #reference><button class="header-action-btn" :aria-label="t('chat.drawer.more')" :aria-expanded="showTools" aria-haspopup="true"><van-icon name="ellipsis" size="21" /></button></template>
          </van-popover>
          <button class="header-action-btn" :aria-label="t('chat.close')" @click="closeDialog"><van-icon name="cross" size="19" /></button>
        </div>
      </div>

      <!-- ======== Chat Body ======== -->
      <div ref="chatContent" class="chat-body" @scroll="handleScroll">
        <div class="chat-inner">
          <!-- Guide State -->
          <div v-if="!hasConversation" class="chat-guide">
            <div class="guide-eyebrow"><span aria-hidden="true" />{{ t('chat.drawer.eyebrow') }}</div>
            <h2 class="guide-heading">{{ t('chat.drawer.heading') }}</h2>
            <p class="guide-hint">{{ t('chat.drawer.hint') }}</p>
            <p v-if="contextQuery.destination" class="guide-context"><van-icon name="location-o" />{{ contextQuery.destination }}<span v-if="contextQuery.days"> · {{ contextQuery.days }}{{ t('chat.drawer.daysUnit') }}</span><span v-if="contextQuery.budget"> · ¥{{ contextQuery.budget }}</span></p>
            <div class="guide-section-title">{{ t('chat.drawer.ideas') }}</div>
            <div class="guide-chips">
              <button v-for="chip in guideChips" :key="chip.key" class="guide-chip" @click="fillSuggestion(chip.query)">
                <span class="guide-chip-icon" aria-hidden="true"><van-icon :name="chip.icon" size="19" /></span>
                <span class="guide-chip-title">{{ chip.label }}</span>
                <span class="guide-chip-description">{{ chip.description }}</span>
              </button>
            </div>
          </div>

          <!-- Message List -->
          <div v-else class="msg-list">
            <div v-for="msg in messages" :key="msg.id" :class="['msg-row', msg.type]">
              <!-- System message -->
              <div v-if="msg.type === 'system'" class="sys-msg">
                <span>{{ msg.content }}</span>
              </div>

              <!-- User message -->
              <div v-else-if="msg.type === 'user'" class="user-msg-row">
                <div class="user-bubble">{{ msg.content }}</div>
                <div class="user-avatar"><van-icon name="user-o" color="#fff" size="16" /></div>
              </div>

              <!-- AI message -->
              <div v-else-if="msg.type === 'ai'" class="ai-msg-row">
                <div class="ai-avatar" aria-hidden="true"><van-icon name="guide-o" size="19" /></div>
                <div class="ai-bubble" :class="{ streaming: msg.isStreaming }">
                  <!-- Thinking animation -->
                  <div v-if="isThinking && msg === messages[messages.length - 1]" class="thinking">
                    <span class="think-dot" /><span class="think-dot" /><span class="think-dot" />
                    <span class="think-text">{{ t('chat.thinking') }}</span>
                  </div>
                  <!-- Rendered markdown -->
                  <div v-else class="md-body" v-html="renderMarkdown(msg.content)" />
                </div>
              </div>
            </div>

            <!-- Save plan button -->
            <div v-if="lastAIMessageHasPlan" class="save-plan-row">
              <button class="save-plan-btn" :disabled="isSavingPlan" @click="savePlan">
                <van-loading v-if="isSavingPlan" size="14" color="#fff" />
                <span v-else>💾 {{ t('chat.saveToPlan') }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ======== Footer Input ======== -->
      <div class="chat-footer">
        <!-- SSE reconnect hint -->
        <div v-if="isReconnecting" class="reconnect-tip">
          <van-loading size="14" color="#8B5CF6" />{{ t('chat.reconnecting') }}
        </div>
        <!-- Quick chips bar -->
        <div v-if="showQuickBar && messages.length > 1" class="quick-bar">
          <button v-for="(q, i) in quickQuestions" :key="i" class="quick-chip" @click="sendQuickWithContext(q.label, q.query)">
            {{ q.label }}
          </button>
        </div>

        <!-- Input row -->
        <div class="input-row">
          <div class="input-glass">
            <textarea
              ref="messageInput"
              v-model="inputText"
              rows="2"
              :placeholder="t('chat.drawer.placeholder')"
              :aria-label="t('chat.drawer.messageLabel')"
              class="msg-input"
              @keydown.ctrl.enter.prevent="!$event.isComposing && sendMessage()"
              @focus="scrollToBottom(true)"
            />
            <div class="composer-actions">
              <button class="input-action" :class="{ listening: isListening }" :aria-label="t('chat.voiceInput')" :aria-pressed="isListening" @click="toggleVoiceInput">
                <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M6 11v1a6 6 0 0 0 12 0v-1M12 18v3m-3 0h6" /></svg>
                <span>{{ isListening ? t('chat.listening') : t('chat.voiceInput') }}</span>
              </button>
            <button
              class="send-btn"
              :class="{ disabled: !inputText.trim() || isSending }"
              :disabled="!inputText.trim() || isSending"
              :aria-label="t('chat.send')"
              @click="sendMessage"
            >
              <van-icon v-if="!isSending" name="arrow-up" size="20" color="#fff" />
              <van-loading v-else size="16" color="#fff" />
            </button>
            </div>
          </div>
        </div>

        <!-- Voice toast -->
        <div v-if="isListening" class="voice-toast">
          <span class="voice-pulse" />{{ t('chat.listening') }}
        </div>
      </div>
      </template>
    </div>
  </van-popup>
</template>

<style scoped>
/* 覆盖全局底部弹层的 left:10px，保持抽屉左右等距。 */
.ai-chat-popup.van-popup--bottom { width:calc(100% - 20px) !important; max-width:640px !important; left:0 !important; right:0; margin:0 auto; }

/* ==================== Dialog Root ==================== */
.dialog-root {
  --chat-ink: #252334;
  --chat-muted: #727084;
  --chat-line: #ebe8f2;
  --chat-card: #fff;
  --chat-accent: #7043bd;
  display: flex;
  flex-direction: column;
  height: 100%;
  color: var(--chat-ink);
  background: radial-gradient(ellipse at 10% 12%, #f0eafa 0, transparent 46%), #fcfbfe;
}
.drawer-handle { width:32px; height:4px; flex-shrink:0; border-radius:4px; background:#ded9e8; margin:9px auto 0; }
.dialog-root button:focus-visible { outline:2px solid var(--chat-accent); outline-offset:3px; }
.dialog-root button { font-family:inherit; }

/* ==================== Header ==================== */
.dialog-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 18px 14px;
  border-bottom: 1px solid var(--chat-line);
}
.assistant-brand { display:flex; align-items:center; gap:10px; min-width:0; }
.brand-avatar { width:40px; height:40px; border-radius:14px; display:grid; place-items:center; flex-shrink:0; background:#eee7fb; color:var(--chat-accent); }
.header-right { display:flex; align-items:center; gap:2px; flex-shrink:0; }
.header-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--chat-ink);
}
.header-subtitle { font-size:11px; color:var(--chat-muted); margin-top:3px; }
.header-action-btn {
  width: 40px; height: 40px; min-width: 40px; min-height: 40px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; border-radius: 50%;
  color:var(--chat-muted); cursor: pointer; transition: background 0.2s;
}
.header-action-btn:active { background: rgba(0,0,0,0.05); }

/* ==================== Chat Body ==================== */
.chat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 22px 20px;
  -webkit-overflow-scrolling: touch;
  isolation: isolate;
}
.chat-inner {
  max-width: 500px;
  margin: 0 auto;
  width: 100%;
}

/* ==================== Guide ==================== */
.chat-guide {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding-top: 8px;
  text-align: left;
}
.guide-eyebrow { display:flex; align-items:center; gap:7px; font-size:11px; color:var(--chat-accent); font-weight:600; margin-bottom:12px; }
.guide-eyebrow span { width:5px; height:5px; border-radius:50%; background:currentColor; }
.guide-heading {
  font-size: 25px;
  line-height: 1.35;
  letter-spacing: -0.5px;
  font-weight: 700;
  color: var(--chat-ink);
  margin: 0 0 12px;
}
.guide-hint {
  font-size: 13px;
  line-height: 1.8;
  color: var(--chat-muted);
  margin: 0;
}
.guide-context { display:flex; align-items:center; flex-wrap:wrap; gap:4px; font-size:12px; color:var(--chat-accent); margin:12px 0 0; }
.guide-section-title { font-size:12px; color:var(--chat-muted); margin:28px 0 12px; }
.guide-chips {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.guide-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  text-align: left;
  padding: 14px;
  background: var(--chat-card);
  border: 1px solid var(--chat-line);
  border-radius: 16px;
  color: var(--chat-ink);
  cursor: pointer;
  box-shadow: 0 3px 10px rgba(37,35,52,0.025);
  transition: border-color 0.2s, transform 0.2s;
}
.guide-chip-icon { display:grid; place-items:center; width:30px; height:30px; margin-bottom:11px; border-radius:10px; background:#f3effb; color:var(--chat-accent); }
.guide-chip-title { font-size:14px; font-weight:600; line-height:1.4; }
.guide-chip-description { font-size:12px; color:var(--chat-muted); line-height:1.65; margin-top:5px; }
.guide-chip:hover {
  border-color: #c4b5fd;
  color: #7C3AED;
}
.guide-chip:active {
  transform: scale(0.96);
}

/* ==================== Message List ==================== */
.msg-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-bottom: 8px;
}
.msg-row.user,
.msg-row.ai,
.msg-row.system {
  /* base class for potential extensions */
}

/* System message */
.sys-msg {
  align-self: center;
  background: rgba(139, 92, 246, 0.08);
  color: #7C3AED;
  font-size: 12px;
  padding: 8px 16px;
  border-radius: 20px;
  text-align: center;
  max-width: 85%;
}

/* User message */
.user-msg-row {
  display: flex;
  justify-content: flex-end;
  align-items: flex-end;
  gap: 8px;
  animation: msgIn 0.3s ease-out;
}
.user-bubble {
  max-width: 75%;
  padding: 12px 18px;
  background: #7546c8;
  color: #fff;
  border-radius: 20px 20px 6px 20px;
  font-size: 15px;
  line-height: 1.6;
  word-break: break-word;
  box-shadow: 0 3px 10px rgba(139, 92, 246, 0.12);
}
.user-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #c4b5fd, #8B5CF6);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* AI message */
.ai-msg-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  animation: msgIn 0.35s ease-out;
}
.ai-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: linear-gradient(135deg, #ede9fe, #ddd6fe);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  color: var(--chat-accent);
  flex-shrink: 0;
}
.ai-bubble {
  max-width: 80%;
  padding: 14px 18px;
  background: var(--chat-card);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-radius: 6px 20px 20px 20px;
  border: 1px solid rgba(139, 92, 246, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  font-size: 14px;
  line-height: 1.7;
  color: var(--chat-ink);
  word-break: break-word;
  min-width: 70px;
}
.ai-bubble.streaming {
  min-height: 48px;
}

@keyframes msgIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
.user-msg-row,
.ai-msg-row {
  /* will-change 已禁用 — 每条消息预分配GPU层导致OOM */
}

/* ==================== Thinking Animation ==================== */
.thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
}
.think-dot {
  width: 7px;
  height: 7px;
  background: #8B5CF6;
  border-radius: 50%;
  animation: thinkBounce 1.4s ease-in-out infinite both;
}
.think-dot:nth-child(2) {
  animation-delay: 0.16s;
}
.think-dot:nth-child(3) {
  animation-delay: 0.32s;
}
.think-text {
  font-size: 13px;
  color: #94A3B8;
}
@keyframes thinkBounce {
  0%, 80%, 100% {
    transform: scale(0.5);
    opacity: 0.4;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

/* ==================== Markdown ==================== */
.md-body {
  line-height: 1.75;
}
.md-body :deep(pre) {
  background: #f8f7ff;
  border-radius: 12px;
  padding: 14px;
  overflow-x: auto;
  margin: 10px 0;
  border: 1px solid rgba(139, 92, 246, 0.08);
}
.md-body :deep(code) {
  font-family: 'Monaco', 'Menlo', monospace;
  font-size: 12px;
}
.md-body :deep(p code) {
  background: rgba(139, 92, 246, 0.08);
  padding: 2px 6px;
  border-radius: 6px;
  color: #7C3AED;
}
.md-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: 14px 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(139, 92, 246, 0.08);
  display: block;
  overflow-x: auto;
}
.md-body :deep(th),
.md-body :deep(td) {
  border-bottom: 1px solid rgba(139, 92, 246, 0.06);
  padding: 9px 12px;
  text-align: left;
  font-size: 13px;
}
.md-body :deep(th) {
  background: rgba(139, 92, 246, 0.04);
  font-weight: 600;
  color: #1E293B;
}
.md-body :deep(tr:nth-child(even)) {
  background: rgba(139, 92, 246, 0.02);
}
.md-body :deep(blockquote) {
  margin: 14px 0;
  padding: 12px 16px;
  border-left: 4px solid #A78BFA;
  background: rgba(139, 92, 246, 0.04);
  border-radius: 0 12px 12px 0;
}
.md-body :deep(h2),
.md-body :deep(h3) {
  margin: 16px 0 8px;
  font-weight: 600;
  color: #1E293B;
}
.md-body :deep(h2) {
  font-size: 1.2em;
}
.md-body :deep(h3) {
  font-size: 1.1em;
}
.md-body :deep(ul),
.md-body :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}
.md-body :deep(li) {
  margin: 5px 0;
}
.md-body :deep(p) {
  margin: 6px 0;
}
.md-body :deep(strong) {
  color: #7C3AED;
}
.md-body :deep(hr) {
  border: none;
  border-top: 1px solid rgba(139, 92, 246, 0.08);
  margin: 14px 0;
}

/* ==================== Save Plan Button ==================== */
.save-plan-row {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}
.save-plan-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 24px;
  background: linear-gradient(135deg, #8B5CF6, #6366F1);
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(139, 92, 246, 0.3);
  transition: all 0.2s;
}
.save-plan-btn:active {
  transform: scale(0.95);
}
.save-plan-btn:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

/* ==================== Footer ==================== */
.chat-footer {
  flex-shrink: 0;
  position: relative;
  padding: 12px 16px calc(14px + env(safe-area-inset-bottom, 0px));
  background: rgba(252, 251, 254, 0.84);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--chat-line);
}

/* SSE reconnect hint */
.reconnect-tip {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  font-size: 12px; color: #8B5CF6; padding: 2px 0 6px;
}

/* Quick chips bar */
.quick-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding: 4px 0 8px;
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
}
.quick-bar::-webkit-scrollbar {
  display: none;
}
.quick-chip {
  flex-shrink: 0;
  padding: 8px 14px;
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  border: 1px solid rgba(139, 92, 246, 0.12);
  border-radius: 20px;
  font-size: 12px;
  color: #7C3AED;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}
.quick-chip:active {
  background: rgba(139, 92, 246, 0.1);
  border-color: #c4b5fd;
  transform: scale(0.95);
}

/* Input row */
.input-row {
  max-width: 500px;
  margin: 0 auto;
}
.input-glass {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 13px 12px 9px;
  background: var(--chat-card);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid #ded4ef;
  border-radius: 20px;
  box-shadow: 0 4px 18px rgba(64, 39, 104, 0.04);
  transition: border-color 0.25s, box-shadow 0.25s;
}
.composer-actions { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.input-glass:focus-within {
  border-color: rgba(139, 92, 246, 0.35);
  box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.08);
}

.input-action {
  min-height: 40px;
  padding: 0 6px;
  gap: 6px;
  color: var(--chat-muted);
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 12px;
  flex-shrink: 0;
  transition: background 0.2s;
}
.input-action.listening {
  background: rgba(139, 92, 246, 0.1);
  animation: pulse-ring 1.5s infinite;
}
@keyframes pulse-ring {
  0% {
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.3);
  }
  70% {
    box-shadow: 0 0 0 12px rgba(139, 92, 246, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(139, 92, 246, 0);
  }
}

.msg-input {
  width: 100%;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  color: var(--chat-ink);
  padding: 0 3px;
  resize: none;
  box-sizing: border-box;
}
.msg-input::placeholder {
  color: #918b9f;
  opacity: 1;
}
.msg-input::-webkit-input-placeholder {
  color: #918b9f;
  opacity: 1;
}

.send-btn {
  width: 40px;
  height: 40px;
  border-radius: 13px;
  border: none;
  background: #7546c8;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(139, 92, 246, 0.3);
}
.send-btn:active {
  transform: scale(0.92);
}
.send-btn.disabled {
  background: #ded9e9;
  box-shadow: none;
  cursor: not-allowed;
}

/* Voice toast */
.voice-toast {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  color: #8B5CF6;
}
.voice-pulse {
  width: 8px;
  height: 8px;
  background: #8B5CF6;
  border-radius: 50%;
  animation: pulse-ring 1s infinite;
}

/* ==================== Small screen adaptation ==================== */
@media screen and (max-width: 360px) {
  .chat-body { padding:18px 14px; }
  .dialog-header { padding-left:14px; padding-right:10px; }
  .assistant-brand { gap:7px; }
  .brand-avatar { width:34px; height:34px; }
  .header-title { font-size:14px; }
  .guide-heading { font-size:23px; }
  .guide-chip { padding:12px; }
  .chat-footer { padding-left:12px; padding-right:12px; }
}

/* ==================== 历史对话列表视图 ==================== */
.history-view { display:flex; flex-direction:column; height:100%; }
.history-header { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; padding:12px 16px; background:rgba(255,255,255,0.5); backdrop-filter:blur(18px) saturate(170%); -webkit-backdrop-filter:blur(18px) saturate(170%); border-bottom:0.5px solid rgba(0,0,0,0.05); }
.history-title { font-size:17px; font-weight:700; color:#1E293B; }
.history-body { flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:12px 14px 20px; }
.history-empty { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:60px 0; gap:12px; color:#94A3B8; }
.history-empty-icon { font-size:40px; }
.history-empty-text { font-size:14px; }
.history-list { display:flex; flex-direction:column; gap:10px; }
.history-item { display:flex; align-items:center; gap:10px; padding:12px 14px; background:rgba(255,255,255,0.8); backdrop-filter:blur(10px); -webkit-backdrop-filter:blur(10px); border-radius:16px; border:1px solid rgba(139,92,246,0.08); box-shadow:0 2px 10px rgba(0,0,0,0.03); cursor:pointer; transition:transform .15s; }
.history-item:active { transform:scale(.98); }
.hi-main { flex:1; min-width:0; }
.hi-title { font-size:14px; font-weight:600; color:#1E293B; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hi-preview { font-size:12px; color:#94A3B8; margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hi-right { display:flex; flex-direction:column; align-items:flex-end; gap:4px; flex-shrink:0; }
.hi-time { font-size:11px; color:#A8B2C0; }
.hi-del { padding:4px; border-radius:50%; }
.hi-del:active { background:rgba(239,68,68,0.1); }
.history-new-btn { display:flex; align-items:center; justify-content:center; gap:6px; margin:16px auto 0; padding:11px 26px; background:linear-gradient(135deg,#8B5CF6,#6366F1); color:#fff; border:none; border-radius:24px; font-size:14px; font-weight:600; cursor:pointer; box-shadow:0 4px 14px rgba(139,92,246,0.3); }
.history-new-btn:active { transform:scale(.96); }
:global(html[data-theme='dark']) .dialog-root {
  --chat-ink:#eeeaf5; --chat-muted:#aea6c0; --chat-line:#393246;
  --chat-card:#272231; --chat-accent:#c4a8f6;
  background:radial-gradient(ellipse at 10% 12%, #332541 0, transparent 46%), #1d1925;
}
:global(html[data-theme='dark']) .chat-footer { background:rgba(29,25,37,.88); }
:global(html[data-theme='dark']) .brand-avatar,
:global(html[data-theme='dark']) .guide-chip-icon,
:global(html[data-theme='dark']) .ai-avatar { background:#3b2e50; }
:global(html[data-theme='dark']) .input-glass { border-color:#56426e; }
:global(html[data-theme='dark']) .send-btn.disabled { background:#493f56; }
.history-item { background:var(--chat-card); border-color:var(--chat-line); }
.history-title, .hi-title { color:var(--chat-ink); }
.history-header { background:transparent; border-color:var(--chat-line); }
.hi-preview, .hi-time, .history-empty { color:var(--chat-muted); }
@media (prefers-reduced-motion: reduce) {
  .dialog-root *, .dialog-root *::before, .dialog-root *::after { animation:none !important; transition:none !important; }
}
</style>
