/**
 * agent.js — Agent 旅游规划 API 封装
 * 统一走 Spring Boot 透传：/api/agent → 3200 (JWT鉴权+共享密钥) → 3201 (Python)
 */
import { getToken } from '../utils/auth'
import i18n from '../i18n'

// 与 api/index.js 保持一致：生产走 VITE_API_BASE，开发默认 /api
const BASE = import.meta.env.VITE_API_BASE || '/api'

/**
 * SSE 流式 Agent 规划 — XMLHttpRequest + onprogress
 */
export function agentPlanStream(params, callbacks) {
  const { onProgress, onComplete, onError } = callbacks
  const xhr = new XMLHttpRequest()
  let lastIdx = 0
  let buf = ''
  let settled = false
  const token = getToken()
  const fail = (message) => {
    if (settled) return
    settled = true
    onError?.(message)
  }
  const handleLine = (line) => {
    const value = line.trim()
    if (settled || !value.startsWith('data:')) return
    const json = value.substring(5).trim()
    if (!json) return
    let event
    try { event = JSON.parse(json) } catch { fail('Agent 返回了无效数据，请重试'); return }
    if (event?.event_type === 'complete') {
      settled = true
      onComplete?.(event)
    } else if (event?.event_type === 'error') {
      fail(event.message || 'Agent 服务异常')
    } else {
      onProgress?.(event)
    }
  }

  xhr.open('POST', `${BASE}/agent/plan/stream`, true)
  xhr.setRequestHeader('Content-Type', 'application/json')
  xhr.setRequestHeader('Accept', 'text/event-stream')
  xhr.setRequestHeader('Accept-Language', i18n.global.locale.value)
  if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

  xhr.onprogress = function () {
    if (xhr.status < 200 || xhr.status >= 300) return
    const add = xhr.responseText.substring(lastIdx)
    lastIdx = xhr.responseText.length
    if (!add) return
    buf += add
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    lines.forEach(handleLine)
  }

  // HTTP 成功不等于规划完成；缺少终止事件的 EOF 必须收尾。
  xhr.onload = function () {
    if (xhr.status < 200 || xhr.status >= 300) {
      let msg = 'Agent 请求失败 (' + xhr.status + ')'
      try { msg = JSON.parse(xhr.responseText)?.message || msg } catch {}
      fail(msg)
      return
    }
    xhr.onprogress()
    handleLine(buf)
    buf = ''
    if (!settled) fail('行程生成中断，未收到完整结果，请重试')
  }

  xhr.onerror = function () { fail('无法连接 Agent 服务，请稍后重试') }
  xhr.ontimeout = function () { fail('请求超时') }
  xhr.timeout = 300000
  xhr.send(JSON.stringify(params))
  return () => { settled = true; xhr.abort() }
}

export async function agentPlanSync(params) {
  const headers = { 'Content-Type': 'application/json', 'Accept-Language': i18n.global.locale.value }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  const r = await fetch(`${BASE}/agent/plan`, { method: 'POST', headers, body: JSON.stringify(params) })
  return r.json()
}

export async function agentHealth() {
  const r = await fetch(`${BASE}/agent/health`)
  return r.json()
}
