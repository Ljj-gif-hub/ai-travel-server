// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
vi.mock('../src/i18n', () => ({ default: { global: { locale: { value: 'en-US' } } } }))
import { agentPlanStream } from '../src/api/agent'

let xhr
let events
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
  events = { onProgress: vi.fn(), onComplete: vi.fn(), onError: vi.fn() }
  vi.stubGlobal('XMLHttpRequest', class {
    constructor() { xhr = this; this.status = 200; this.responseText = ''; this.headers = {} }
    open() {}
    setRequestHeader(key, value) { this.headers[key] = value }
    send(body) { this.body = body }
    abort() { this.onerror?.() }
  })
})
afterEach(() => vi.unstubAllGlobals())

it('连接事件后 EOF 必须报错，不能一直等待', () => {
  agentPlanStream({ destination: '杭州' }, events)
  xhr.responseText = 'data: {"event_type":"connected"}\n\n'
  xhr.onprogress()
  xhr.onload()
  expect(events.onProgress).toHaveBeenCalledTimes(1)
  expect(events.onError).toHaveBeenCalledTimes(1)
  expect(events.onComplete).not.toHaveBeenCalled()
  expect(xhr.headers['Accept-Language']).toBe('en-US')
})

it('分块且末尾无换行的完成事件只处理一次', () => {
  agentPlanStream({}, events)
  xhr.responseText = 'data: {"event_type":"comp'
  xhr.onprogress()
  xhr.responseText += 'lete","data":{"people":5}}'
  xhr.onload()
  xhr.ontimeout()
  expect(events.onComplete).toHaveBeenCalledTimes(1)
  expect(events.onComplete.mock.calls[0][0].data.people).toBe(5)
  expect(events.onError).not.toHaveBeenCalled()
})

it('HTTP 失败和无效 JSON 显式报错，主动取消静默', () => {
  agentPlanStream({}, events)
  xhr.status = 401
  xhr.responseText = '{"message":"请登录"}'
  xhr.onload()
  expect(events.onError).toHaveBeenCalledWith('请登录')
  events.onError.mockClear()
  agentPlanStream({}, events)
  xhr.responseText = 'data: invalid\n\n'
  xhr.onload()
  expect(events.onError).toHaveBeenCalledTimes(1)
  events.onError.mockClear()
  const cancel = agentPlanStream({}, events)
  cancel()
  xhr.onload()
  expect(events.onError).not.toHaveBeenCalled()
})
