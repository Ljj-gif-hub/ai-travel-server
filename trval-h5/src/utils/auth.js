/**
 * auth.js — JWT Token + 当前用户管理
 *
 * 【多账号隔离改造】
 * - Token 按账号存储（key: TOKEN）
 * - 同时记录当前登录用户名（key: CURRENT_USER）
 * - 退出登录时由 userAccountStorage.clearSession() 统一清理
 *
 * 【安全加固】Token 改存 sessionStorage（关标签页即失效，降低 XSS 窃取后长期驻留风险）；
 * 旧版 localStorage 残留 Token 首次读取时自动迁移到 sessionStorage 并清除。
 */
import { getCurrentUser } from './userAccountStorage'

const TokenKey = 'TOKEN'
const RefreshTokenKey = 'REFRESH_TOKEN'

export function getToken() {
  try {
    const sessionToken = sessionStorage.getItem(TokenKey)
    if (sessionToken) return sessionToken
    // 一次性迁移：老用户 localStorage 中的 Token 迁到 sessionStorage
    const legacyToken = localStorage.getItem(TokenKey)
    if (legacyToken) {
      sessionStorage.setItem(TokenKey, legacyToken)
      localStorage.removeItem(TokenKey)
      return legacyToken
    }
    return null
  } catch {
    return null
  }
}

export function setToken(token) {
  try {
    return sessionStorage.setItem(TokenKey, token)
  } catch {
    return false
  }
}

export function removeToken() {
  try {
    sessionStorage.removeItem(TokenKey)
    // 兜底清除旧存储残留
    localStorage.removeItem(TokenKey)
    return true
  } catch {
    return false
  }
}

/* ==================== RefreshToken（长寿命 7 天，旋转刷新） ====================
 * 与 TOKEN 同账号粒度：当前登录账号的 refreshToken 存 sessionStorage
 * （旧版 localStorage 残留首次读取时自动迁移并清除）。
 */
export function getRefreshToken() {
  try {
    const t = sessionStorage.getItem(RefreshTokenKey)
    if (t) return t
    const legacy = localStorage.getItem(RefreshTokenKey)
    if (legacy) {
      sessionStorage.setItem(RefreshTokenKey, legacy)
      localStorage.removeItem(RefreshTokenKey)
      return legacy
    }
    return null
  } catch {
    return null
  }
}

export function setRefreshToken(token) {
  try {
    return sessionStorage.setItem(RefreshTokenKey, token)
  } catch {
    return false
  }
}

export function removeRefreshToken() {
  try {
    sessionStorage.removeItem(RefreshTokenKey)
    localStorage.removeItem(RefreshTokenKey)
    return true
  } catch {
    return false
  }
}

/**
 * 获取当前登录用户名
 * 与账号数据存储共用同一个会话身份来源。
 */
export function getCurrentUsername() {
  return getCurrentUser()
}

/**
 * 判断 JWT 是否已过期（base64 解 payload 读 exp）。
 * 解码失败/无 exp 字段时返回 false（不误杀，交给后端 401 兜底）。
 * @param {string} token
 * @returns {boolean}
 */
export function isTokenExpired(token) {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  try {
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (!payload || typeof payload.exp !== 'number') return false
    return payload.exp * 1000 <= Date.now()
  } catch {
    return false
  }
}

export default {
  getToken,
  setToken,
  removeToken,
  getRefreshToken,
  setRefreshToken,
  removeRefreshToken,
  getCurrentUsername,
  isTokenExpired,
}
