import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8')

it('个人页保留一张常用服务卡，顶部工具可进入设置', () => {
  const profile = read('../src/views/Profile.vue')
  const router = read('../src/router/index.js')

  expect(profile).toContain('class="hero-tools"')
  expect(profile).toContain('ref="profileTopbarTrigger"')
  expect(profile).toContain('profileTopbarVisible')
  expect(profile).toContain('useStickyAfterTrigger')
  expect(profile).toContain('class="common-grid"')
  expect(profile).not.toContain('class="settings-card"')
  expect(router).toContain("path: '/settings'")
  expect(router).toContain("import('../views/SettingsView.vue')")
})
