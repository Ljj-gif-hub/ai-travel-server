// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from 'vue'
import { expect, it, vi } from 'vitest'

const { addNote, showToast } = vi.hoisted(() => ({
  addNote: vi.fn(async () => ({ code: 1, message: 'failed' })),
  showToast: vi.fn(),
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('vant', async () => ({ ...(await vi.importActual('vant')), showToast }))
vi.mock('../src/api', () => ({ collectionApi: {
  getMine: vi.fn(async () => ({ code: 0, data: [{ id: 5, name: '旅行' }] })),
  create: vi.fn(async () => ({ code: 0, data: { id: 5 } })),
  addNote,
} }))
import CollectionSheet from '../src/components/CollectionSheet.vue'

it('新建合集成功但收藏失败时保留弹层，不报告收藏成功，并允许重试', async () => {
  const show = ref(false)
  const saved = vi.fn()
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp({ render: () => h(CollectionSheet, {
    show: show.value, noteId: 6, onSaved: saved,
    'onUpdate:show': value => { show.value = value },
  }) })
  try {
    app.mount(host)
    show.value = true
    await vi.waitFor(() => expect(host.querySelector('.create-btn')).toBeTruthy())
    host.querySelector('.create-btn').click()
    await nextTick()
    const input = host.querySelector('.create-form input')
    input.value = '旅行'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    host.querySelector('.create-btn--solid').click()
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledWith('collection.saveFailed'))
    expect(saved).not.toHaveBeenCalled()
    expect(show.value).toBe(true)
    expect(showToast).not.toHaveBeenCalledWith('collection.saved')
    addNote.mockResolvedValueOnce({ code: 0, data: { added: true } })
    await vi.waitFor(() => expect(host.querySelector('.collection-item')).toBeTruthy())
    host.querySelector('.collection-item').click()
    await vi.waitFor(() => expect(saved).toHaveBeenCalledOnce())
    expect(show.value).toBe(false)
  } finally {
    app.unmount()
    host.remove()
  }
})
