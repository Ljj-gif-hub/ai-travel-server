// @vitest-environment jsdom
import { createApp, h, ref, nextTick } from 'vue'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import zh from '../src/locales/zh/chat'

const mocks = vi.hoisted(() => ({
  stream: vi.fn(), confirm: vi.fn(), clear: vi.fn(), save: vi.fn(), create: vi.fn(),
  history: vi.fn(), restore: vi.fn(), messages: vi.fn(),
}))
vi.mock('vant', async original => ({ ...await original(), showToast: vi.fn(), showConfirmDialog: mocks.confirm }))
// jsdom has no layout engine; test menu wiring here and Popover positioning in the browser.
vi.mock('vant/es', async original => {
  const { defineComponent, h } = await import('vue')
  return {
    ...await original(),
    Popover: defineComponent({
      props: ['show', 'actions'], emits: ['update:show', 'select'],
      setup: (props, { slots, emit }) => () => h('div', [
        h('div', { onClick: () => emit('update:show', !props.show) }, slots.reference?.()),
        ...(props.show ? props.actions.map(action => h('button', {
          class: 'van-popover__action', disabled: action.disabled,
          onClick: () => emit('select', action),
        }, action.text)) : []),
      ]),
    }),
  }
})
vi.mock('../src/api', () => ({ chatApi: { getChatStream: mocks.stream }, planApi: {} }))
vi.mock('../src/utils/chatSession', () => ({
  getCurrentSessionId: () => 'test-session', getCurrentSessionMessages: mocks.messages,
  saveCurrentSessionMessages: mocks.save, clearCurrentSession: mocks.clear,
  createNewSession: mocks.create, getAllSessions: mocks.history, switchToSession: mocks.restore,
  deleteSession: vi.fn(), genMsgId: () => crypto.randomUUID(),
}))
import AIChatDialog from '../src/components/AIChatDialog.vue'

let app, host, visible
const originalScrollTo = HTMLElement.prototype.scrollTo
beforeEach(() => {
  vi.clearAllMocks()
  HTMLElement.prototype.scrollTo = vi.fn()
  mocks.messages.mockReturnValue([{ id: 'seed', type: 'system', content: 'hello' }])
  mocks.history.mockReturnValue([])
  mocks.stream.mockResolvedValue({ ok: true, body: { getReader: () => ({
    read: vi.fn().mockResolvedValueOnce({ value: new TextEncoder().encode('data: 可以，我们先确定出发地。\n\ndata: [DONE]\n\n'), done: false })
      .mockResolvedValue({ done: true }),
  }) } })
})
afterEach(async () => {
  visible.value = false
  await nextTick()
  await settleFrames()
  app?.unmount()
  host?.remove()
  if (originalScrollTo) HTMLElement.prototype.scrollTo = originalScrollTo
  else delete HTMLElement.prototype.scrollTo
})
const findButton = text => [...document.querySelectorAll('button')].find(el => el.getAttribute('aria-label') === text || el.textContent.trim() === text)
// Let Vant finish attaching its popup refs before interacting or unmounting.
const settleFrames = async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame) }
const chooseTool = async text => {
  findButton('更多对话操作').click()
  await nextTick()
  await settleFrames()
  await vi.waitFor(() => expect([...document.querySelectorAll('.van-popover__action')].some(el => el.textContent.includes(text))).toBe(true))
  ;[...document.querySelectorAll('.van-popover__action')].find(el => el.textContent.includes(text)).click()
  await nextTick()
  await settleFrames()
}
async function mountDrawer() {
  host = document.createElement('div')
  document.body.append(host)
  visible = ref(false)
  app = createApp({ render: () => h(AIChatDialog, { visible: visible.value, 'onUpdate:visible': value => { visible.value = value } }) })
  app.use(createI18n({ legacy: false, locale: 'zh', messages: { zh: { chat: zh, common: { cancel: '取消' } } } }))
  app.mount(host)
  visible.value = true
  await nextTick()
}

it('灵感卡先填入草稿；多行输入和输入法不误发送，显式发送保留流式聊天', async () => {
  await mountDrawer()
  expect(document.querySelectorAll('.guide-chip')).toHaveLength(4)
  expect(findButton('发送').disabled).toBe(true)
  document.querySelector('.guide-chip').click()
  await nextTick()
  const input = document.querySelector('textarea')
  expect(input.value).toBe(zh.drawer.weekendQuery)
  expect(mocks.stream).not.toHaveBeenCalled()
  expect(findButton('发送').disabled).toBe(false)
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true }))
  expect(mocks.stream).not.toHaveBeenCalled()
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }))
  await vi.waitFor(() => expect(document.querySelector('.ai-bubble').textContent).toContain('可以，我们先确定出发地。'))
  expect(mocks.stream).toHaveBeenCalledTimes(1)
  expect(mocks.stream.mock.calls[0][0].at(-1).content).toBe(zh.drawer.weekendQuery)
})

it('空对话不显示清空；历史仍能恢复，新建前保存原对话', async () => {
  const saved = [{ id: 'u', type: 'user', content: '已有的旅行想法' }, { id: 'a', type: 'ai', content: '历史回答' }]
  mocks.history.mockReturnValue([{ id: 'old', title: '厦门旅行', messages: saved }])
  mocks.restore.mockReturnValue(saved)
  await mountDrawer()
  await chooseTool('历史对话')
  expect(document.querySelector('.history-title').textContent).toBe('历史对话')
  document.querySelector('.history-item').click()
  await nextTick()
  expect(document.querySelector('.user-bubble').textContent).toBe('已有的旅行想法')
  expect(mocks.restore).toHaveBeenCalledWith('old')
  await chooseTool('新建对话')
  expect(mocks.save).toHaveBeenCalledWith(saved)
  expect(mocks.create).toHaveBeenCalledTimes(1)
  await nextTick()
  expect(document.querySelector('.chat-guide')).toBeTruthy()
  findButton('更多对话操作').click()
  await nextTick()
  expect([...document.querySelectorAll('.van-popover__action')].some(el => el.textContent.includes('清空对话'))).toBe(false)
})

it('清空仅在确认后执行，取消保留消息，关闭仍保存会话', async () => {
  mocks.messages.mockReturnValue([{ id: 'u', type: 'user', content: '保留这条消息' }, { id: 'a', type: 'ai', content: '回答' }])
  await mountDrawer()
  mocks.confirm.mockRejectedValueOnce(new Error('cancel'))
  await chooseTool('清空对话')
  await nextTick()
  expect(mocks.clear).not.toHaveBeenCalled()
  expect(document.querySelector('.user-bubble').textContent).toBe('保留这条消息')
  mocks.confirm.mockResolvedValueOnce('confirm')
  await chooseTool('清空对话')
  await vi.waitFor(() => expect(mocks.clear).toHaveBeenCalledTimes(1))
  expect(mocks.confirm).toHaveBeenLastCalledWith(expect.objectContaining({ zIndex: 10040 }))
  findButton('关闭').click()
  await nextTick()
  expect(visible.value).toBe(false)
  expect(mocks.save).toHaveBeenCalled()
})
