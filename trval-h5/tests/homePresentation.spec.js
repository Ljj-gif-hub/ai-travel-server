// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { expect, it, vi } from 'vitest'

const { push, getToken, getSavedPlans } = vi.hoisted(() => ({
  push: vi.fn(), getToken: vi.fn(() => null), getSavedPlans: vi.fn(),
}))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
vi.mock('../src/utils/auth', () => ({ getToken }))
vi.mock('../src/api/destination', () => ({ getHotDestinations: async () => ({ data: [] }) }))
vi.mock('../src/api/attraction', () => ({ getHotSpotNames: () => ['西湖'], findAttractionByName: vi.fn() }))
vi.mock('../src/api', () => ({
  noteApi: { getAllNotes: async () => ({ code: 1 }) },
  planApi: { getSavedPlans }, followApi: {}, commentApi: {}, uploadApi: {},
}))
vi.mock('../src/components/AIChatDialog.vue', () => ({ __esModule: true, default: { render: () => null } }))
import HomeView from '../src/views/HomeView.vue'

it('首页保留规划和已保存行程入口，降级笔记使用加载后的照片且裂图只替换一次', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ 上海: '/images/shanghai.jpg', 杭州: '/images/hangzhou.jpg' }) })))
  const host = document.createElement('div')
  document.body.append(host)
  let app
  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick() }
  try {
    app = createApp(HomeView)
    app.mount(host)
    await settle()
    const topbar = host.querySelector('.home-topbar')
    expect(topbar.classList.contains('visible')).toBe(false)
    host.querySelector('.home-topbar-trigger').getBoundingClientRect = () => ({ top: -1 })
    window.dispatchEvent(new Event('scroll'))
    await nextTick()
    expect(topbar.classList.contains('visible')).toBe(true)
    host.querySelector('.planner-cta').click()
    expect(push).toHaveBeenCalledWith('/agent-planner')
    expect(host.querySelector('.saved-plan')).toBeNull()
    expect(host.querySelectorAll('.ctrip-note-card')).toHaveLength(10)
    const cover = host.querySelector('.ctrip-card-main-img')
    expect(cover.getAttribute('src')).toBe('/images/shanghai.jpg')
    expect(host.querySelectorAll('.ctrip-feed video')).toHaveLength(0)
    cover.dispatchEvent(new Event('error'))
    expect(cover.getAttribute('src')).toBe('/travel-cover.svg')
    cover.dispatchEvent(new Event('error'))
    expect(cover.getAttribute('src')).toBe('/travel-cover.svg')
    app.unmount()

    getToken.mockReturnValue('test-session')
    getSavedPlans.mockResolvedValue({ code: 0, data: [{ id: 7, destination: '杭州', days: 1, planData: { dayPlans: [{ day: 1, timeSlots: [{ attraction: '西湖' }] }] } }] })
    app = createApp(HomeView)
    app.mount(host)
    await settle()
    expect(host.querySelector('.saved-plan')).toBeTruthy()
    host.querySelector('.saved-plan-link').click()
    expect(push).toHaveBeenLastCalledWith({ path: '/agent-map', query: { savedPlanId: 7 } })
  } finally {
    app?.unmount()
    host.remove()
    vi.unstubAllGlobals()
  }
})
