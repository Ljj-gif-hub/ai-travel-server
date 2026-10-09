// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { expect, it, vi } from 'vitest'
const getOrders = vi.hoisted(() => vi.fn())
vi.mock('../src/api', () => ({ orderApi: { getOrders }, paymentApi: {}, refundApi: {}, invoiceApi: {} }))
vi.mock('../src/utils/auth', () => ({ getToken: () => 'logged-in' }))
vi.mock('vue-router', () => ({ useRouter: () => ({ back() {}, push() {} }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))
import OrdersView from '../src/views/OrdersView.vue'

it('加载第 2 页后保留第 1 页，末页不再显示更多按钮', async () => {
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: i + 1, orderNo: `O${i + 1}`, type: 'hotel', price: 100, status: 'pending' }))
  getOrders.mockResolvedValueOnce({ code: 0, data: rows.slice(0, 20) })
    .mockResolvedValueOnce({ code: 0, data: rows.slice(20) })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(OrdersView)
  try {
    app.mount(host)
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(host.querySelectorAll('.order-card')).toHaveLength(20)
    const more = [...host.querySelectorAll('button')].find(button => button.textContent.includes('orders.loadMore'))
    expect(more).toBeTruthy()
    more.click()
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(getOrders).toHaveBeenNthCalledWith(2, '', 1, 20)
    expect(host.querySelectorAll('.order-card')).toHaveLength(21)
    expect(host.textContent).toContain('orders.noMore')
    expect(host.textContent).not.toContain('orders.loadMore')
  } finally { app.unmount(); host.remove() }
})
