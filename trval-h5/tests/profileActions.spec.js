// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import QRCode from 'qrcode'
import jsQR from 'jsqr'
import { registrationLink, scannedRoute, copyText, accountNotifications } from '../src/utils/profileActions'

afterEach(() => vi.restoreAllMocks())

it('邀请链接保留部署目录并能被二维码编码和识别', () => {
  const href = registrationLink('http://example.com/travel/?_v=123#/profile')
  expect(href).toBe('http://example.com/travel/#/register')
  const qr = QRCode.create(href), size = (qr.modules.size + 8) * 5
  const rgba = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const row = Math.floor(y / 5) - 4, col = Math.floor(x / 5) - 4
    if (row >= 0 && col >= 0 && row < qr.modules.size && col < qr.modules.size && qr.modules.get(row, col)) {
      const i = (y * size + x) * 4
      rgba[i] = rgba[i + 1] = rgba[i + 2] = 0
    }
  }
  expect(jsQR(rgba, size, size).data).toBe(href)
  expect(scannedRoute(href, 'http://example.com/travel/#/profile')).toBe('/register')
})

it('扫码拒绝外站、脚本和错误部署目录', () => {
  const base = 'http://example.com/#/profile'
  for (const value of ['https://evil.test/#/profile', 'javascript:alert(1)', 'http://example.com/other/#/profile', '#//evil.test']) {
    expect(scannedRoute(value, base)).toBeNull()
  }
  expect(scannedRoute('#/share/abc123', base)).toBe('/share/abc123')
})

it('HTTP 复制降级且失败不报成功、不遗留输入框', async () => {
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => true) })
  await copyText('http://example.com/#/register')
  expect(document.execCommand).toHaveBeenCalledWith('copy')
  expect(document.querySelector('textarea')).toBeNull()
  document.execCommand.mockReturnValue(false)
  await expect(copyText('test')).rejects.toThrow()
  expect(document.querySelector('textarea')).toBeNull()
})

it('通知只来自真实数据，订单状态变化重新标记未读', () => {
  const t = key => key
  expect(accountNotifications([], [], [], t)).toEqual([])
  const read = ['order:1:pending']
  expect(accountNotifications([{ id: 1, status: 'pending', orderNo: 'real' }], [], read, t)[0].unread).toBe(false)
  expect(accountNotifications([{ id: 1, status: 'paid', orderNo: 'real' }], [], read, t)[0].unread).toBe(true)
  expect(accountNotifications([], [{ id: 3, status: 'expired' }], [], t)).toEqual([])
})
