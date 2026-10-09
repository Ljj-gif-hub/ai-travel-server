// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import zhTrips from '../src/locales/zh/trips'

const { push, getSavedPlans } = vi.hoisted(() => ({ push: vi.fn(), getSavedPlans: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => zhTrips[key.split('.').pop()] || key }) }))
vi.mock('../src/utils/auth', () => ({ getToken: () => 'test-session' }))
vi.mock('../src/api', () => ({
  planApi: { getSavedPlans },
  templateApi: { getMarket: async () => ({ code: 0, data: { list: [] } }) },
}))
vi.mock('../src/api/destination', () => ({
  getHotDestinations: async () => ({ data: [] }),
  getSurroundTour: vi.fn(),
  getCityAttractions: async () => ({ code: 0, data: [
    { name: '天安门广场', rating: 4.9 }, { name: '天安门', rating: null },
  ] }),
}))
vi.mock('../src/components/AIChatDialog.vue', () => ({ default: { render: () => null } }))
import TripsView from '../src/views/TripsView.vue'

let app, host
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function mountTrips(destination) {
  getSavedPlans.mockResolvedValue({ code: 0, data: destination === undefined ? [] : [{ id: 1, destination, days: 3 }] })
  vi.stubGlobal('navigator', {
    geolocation: { getCurrentPosition: (_success, failure) => failure({ code: 1 }) },
  })
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, json: async () =>
    String(url).startsWith('/api/city/location') ? { code: 0, data: { city: '北京市' } }
      : { 厦门: '/images/wrong-xiamen.jpg', 桂林: '/images/guilin.jpg', 深圳: '/images/shenzhen.jpg' },
  })))
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(TripsView)
  app.mount(host)
  // Includes the dynamic city-attractions module import.
  await vi.waitFor(() => expect(host.querySelectorAll('.guide-card')).toHaveLength(2))
  await nextTick()
}

it('厦门线路使用目的地实拍，封面失败时不改用其他城市，缺评分不隐藏详情入口', async () => {
  await mountTrips(' 厦门市 ')
  const cover = host.querySelector('img.plan-route-bg')
  expect(cover.getAttribute('src')).toBe('/images/landmarks/597f60c6ed8b.jpg')
  expect(host.querySelector('.plan-card-label-route').textContent).toBe('我的线路')
  expect(host.querySelector('.plan-card-ai')).toBeTruthy()
  expect(host.querySelector('.nav-action')).toBeTruthy()
  expect(host.querySelector('.nav-more')).toBeTruthy()
  expect(host.querySelector('.plan-sec-title').textContent).toBe('线路规划')
  const topbar = host.querySelector('.trips-topbar')
  expect(topbar.classList.contains('visible')).toBe(false)
  host.querySelector('.trips-topbar-trigger').getBoundingClientRect = () => ({ top: -1 })
  window.dispatchEvent(new Event('scroll'))
  await nextTick()
  expect(topbar.classList.contains('visible')).toBe(true)
  host.querySelector('.plan-ai-btn').click()
  expect(push).toHaveBeenLastCalledWith('/agent-planner')
  host.querySelector('.nav-more').click()
  await nextTick()
  expect(document.body.textContent).toContain('导入行程')
  expect(document.body.textContent).toContain('批量删除')
  expect(document.body.textContent).toContain('导出行程')
  expect(document.body.textContent).toContain('行程设置')
  host.querySelector('.plan-sec-link').click()
  expect(push).toHaveBeenLastCalledWith('/my-routes')

  const [square, gate] = host.querySelectorAll('.guide-card')
  expect(square.querySelector('.meta-star').textContent).toContain('4.9')
  expect(gate.querySelector('.meta-star')).toBeNull()
  expect(gate.querySelector('.meta-unrated').textContent).toBe('暂无评分')
  expect(gate.querySelector('.meta-go').textContent).toBe('线路详情')
  gate.querySelector('.meta-go').click()
  const target = new URL(push.mock.lastCall[0], 'http://localhost')
  expect(target.pathname).toBe('/destination-detail')
  expect(target.searchParams.get('city')).toBe('北京')
  expect(target.searchParams.get('name')).toBe('天安门')

  cover.dispatchEvent(new Event('error'))
  await nextTick()
  expect(host.querySelector('img.plan-route-bg')).toBeNull()
  expect(host.querySelector('.plan-route-bg-fallback')).toBeTruthy()
})

it.each([
  ['杭州市', '/images/landmarks/4b9a47ad501e.jpg'],
  ['深圳', '/images/shenzhen.jpg'],
  ['未知目的地', null],
])('目的地 %s 只使用匹配照片，没有匹配时保留中性占位', async (destination, expected) => {
  await mountTrips(destination)
  expect(host.querySelector('img.plan-route-bg')?.getAttribute('src') || null).toBe(expected)
})

it('暂无线路时保留风景封面和空态文案，不虚构目的地标题', async () => {
  await mountTrips()
  const cover = host.querySelector('img.plan-route-bg')
  expect(cover.getAttribute('src')).toBe('/images/landmarks/ac3fee83cf73.jpg')
  expect(cover.getAttribute('alt')).toBe('')
  expect(host.querySelector('.plan-route-title').textContent).toBe('暂无线路')
  expect(host.querySelector('.plan-route-count')).toBeNull()
})
