// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ProfileTools from '../src/components/ProfileTools.vue'

const mocks = vi.hoisted(() => ({ getLevel: vi.fn(), checkIn: vi.fn(), token: vi.fn(), push: vi.fn() }))
vi.mock('../src/api', () => ({ userApi: { getLevel: mocks.getLevel, checkIn: mocks.checkIn } }))
vi.mock('../src/utils/auth', () => ({ getToken: mocks.token }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: key => key }) }))

let app, vm
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 0)); await nextTick() }
const button = label => [...document.querySelectorAll('button')].find(el => el.textContent.includes(label))
beforeEach(() => {
  vi.clearAllMocks()
  mocks.token.mockReturnValue('test-token')
  const mount = document.createElement('div'); document.body.appendChild(mount)
  app = createApp(ProfileTools)
  vm = app.mount(mount)
})
afterEach(() => { app.unmount(); document.body.replaceChildren() })

it('签到从接口读取，提交成功后禁用按钮并在重新打开时读取持久化状态', async () => {
  mocks.getLevel.mockResolvedValueOnce({ code: 0, data: { points: 0, level: '青铜', checkedIn: false } })
  mocks.checkIn.mockResolvedValue({ code: 0, data: { points: 5, level: '青铜', checkedIn: true, awardedPoints: 5 } })
  vm.open('checkIn'); await settle()
  const action = button('profile.checkInReward')
  expect(action.disabled).toBe(false)
  action.click(); action.click(); await settle()
  expect(mocks.checkIn).toHaveBeenCalledTimes(1)
  expect(button('profile.checkedIn').disabled).toBe(true)
  mocks.getLevel.mockResolvedValue({ code: 0, data: { points: 5, level: '青铜', checkedIn: true } })
  vm.open('member'); await settle()
  expect(mocks.getLevel).toHaveBeenCalledTimes(2)
  expect(button('profile.checkedIn').disabled).toBe(true)
})

it('未登录不会调用签到接口，加载失败可重试', async () => {
  mocks.token.mockReturnValue(null)
  vm.open('checkIn'); await settle()
  expect(mocks.push).toHaveBeenCalledWith('/login')
  expect(mocks.getLevel).not.toHaveBeenCalled()
  mocks.token.mockReturnValue('test-token')
  mocks.getLevel.mockRejectedValueOnce(new Error('offline'))
  vm.open('checkIn'); await settle()
  expect(button('common.retry')).toBeTruthy()
  mocks.getLevel.mockResolvedValueOnce({ code: 0, data: { points: 0, checkedIn: false } })
  button('common.retry').click(); await settle()
  expect(button('profile.checkInReward')).toBeTruthy()
})
