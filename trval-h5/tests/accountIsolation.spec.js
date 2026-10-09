// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { getCurrentUser, setCurrentUser, setMyData, getAccountData, clearSession } from '../src/utils/userAccountStorage'
import { request } from '../src/api'

const storage = () => {
  const values = new Map()
  return { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) }
}
beforeEach(() => { localStorage.clear(); sessionStorage.clear() })
afterEach(() => vi.unstubAllGlobals())

it('两个标签页各自绑定账号，退出 B 不影响 A', () => {
  const tabA = storage(), tabB = storage()
  vi.stubGlobal('sessionStorage', tabA)
  tabA.setItem('TOKEN', 'A-token')
  setCurrentUser('A')
  vi.stubGlobal('sessionStorage', tabB)
  tabB.setItem('TOKEN', 'B-token')
  setCurrentUser('B')
  setMyData('chatHistory', ['B-message'])
  clearSession()
  vi.stubGlobal('sessionStorage', tabA)
  setMyData('chatHistory', ['A-private-message'])
  expect(getCurrentUser()).toBe('A')
  expect(tabA.getItem('TOKEN')).toBe('A-token')
  expect(getAccountData('A', 'chatHistory')).toEqual(['A-private-message'])
  expect(getAccountData('B', 'chatHistory')).toEqual(['B-message'])
})

it('旧会话从本页 JWT 恢复身份，不采信全局 CURRENT_USER', () => {
  localStorage.setItem('CURRENT_USER', 'wrong-account')
  sessionStorage.setItem('TOKEN', `header.${btoa(JSON.stringify({ sub: 'correct-account' }))}.sig`)
  expect(getCurrentUser()).toBe('correct-account')
})

it('同标签换账号后，迟到响应不写入新账号且不复用请求', async () => {
  let finishA
  setCurrentUser('A')
  sessionStorage.setItem('TOKEN', 'tokenA')
  const response = data => ({ status: 200, json: async () => ({ code: 0, data }) })
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(r => { finishA = r }))
    .mockResolvedValueOnce(response('B-profile'))
  vi.stubGlobal('fetch', fetchMock)
  const pendingA = request('/user/profile')
  const checkA = expect(pendingA).rejects.toMatchObject({ name: 'AbortError' })
  setCurrentUser('B')
  sessionStorage.setItem('TOKEN', 'tokenB')
  expect((await request('/user/profile')).data).toBe('B-profile')
  finishA(response('A-private-profile'))
  await checkA
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('切换账号时，新账号独立刷新令牌，旧刷新不能覆盖新会话', async () => {
  let finishA, startedA
  const refreshingA = new Promise(resolve => { startedA = resolve })
  const ok = data => ({ status: 200, json: async () => ({ code: 0, data }) })
  const fetchMock = vi.fn((url, options) => {
    if (url.endsWith('/auth/refresh')) {
      const rt = JSON.parse(options.body).refreshToken
      if (rt === 'refreshA') {
        startedA()
        return new Promise(resolve => { finishA = resolve })
      }
      expect(rt).toBe('refreshB')
      return Promise.resolve(ok({ token: 'freshB', refreshToken: 'rotatedB' }))
    }
    return Promise.resolve(options.headers.Authorization === 'Bearer freshB'
      ? ok('B-profile') : { status: 401 })
  })
  vi.stubGlobal('fetch', fetchMock)
  setCurrentUser('A')
  sessionStorage.setItem('TOKEN', 'expiredA')
  sessionStorage.setItem('REFRESH_TOKEN', 'refreshA')
  const pendingA = request('/refresh-account-profile')
  const checkA = expect(pendingA).rejects.toMatchObject({ name: 'AbortError' })
  await refreshingA
  setCurrentUser('B')
  sessionStorage.setItem('TOKEN', 'expiredB')
  sessionStorage.setItem('REFRESH_TOKEN', 'refreshB')
  try {
    expect((await request('/refresh-account-profile')).data).toBe('B-profile')
  } finally {
    finishA(ok({ token: 'freshA', refreshToken: 'rotatedA' }))
    await checkA
  }
  expect(sessionStorage.getItem('TOKEN')).toBe('freshB')
  expect(sessionStorage.getItem('REFRESH_TOKEN')).toBe('rotatedB')
  expect(getCurrentUser()).toBe('B')
})
