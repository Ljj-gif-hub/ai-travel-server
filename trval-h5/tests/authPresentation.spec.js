import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const source = readFileSync(new URL('../src/views/LoginView.vue', import.meta.url), 'utf8')

it('登录与注册页面只保留核心操作', () => {
  expect(source).toContain('.login-btn, .reg-btn')
  expect(source).toContain('background: transparent; backdrop-filter: none')
  expect(source).not.toContain('class="tab-slider"')
  expect(source).not.toContain('class="tab-bar"')
  expect(source).not.toContain('class="logo-ring"')
  expect(source).not.toContain('class="brand-section"')
  expect(source).not.toContain('class="app-slogan"')
  expect(source).not.toContain('class="third-party"')
  expect(source).not.toContain('class="footer-text"')
  expect(source).toContain('border-bottom: 1px solid rgba(255,255,255,.58)')
  expect(source).toContain('.form-input:-webkit-autofill')
  expect(source).toContain('-webkit-background-clip: text')
  expect(source).not.toContain('.login-btn { background: #22c59c')
  expect(source).not.toContain('linear-gradient(135deg, #8b5cf6, #6d28d9)')
  expect(source).toContain('.login-btn, .reg-btn { background: rgba(15,23,42,.24)')
  expect(source).toContain("{{ t('auth.registerAccount') }}")
  expect(source).toContain("loginMethod === 'password' ? 'sms' : 'password'")
  expect(source).toContain('class="social-login"')
  expect(source).toContain("handleThirdPartyLogin('qq')")
  expect(source).toContain("event?.currentTarget?.blur()")
})
