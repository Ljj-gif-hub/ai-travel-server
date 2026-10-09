// Hash 路由链接保留部署子目录；邀请不承诺尚未实现的返券奖励。
export function registrationLink(href) {
  const url = new URL(href)
  url.search = ''
  url.hash = '/register'
  return url.href
}

export function scannedRoute(value, href) {
  try {
    const url = new URL(value.trim(), href)
    const base = new URL(href)
    if (url.origin !== base.origin || url.pathname !== base.pathname || !url.hash.startsWith('#/')) return null
    const route = url.hash.slice(1)
    return route.startsWith('//') || /[\\\r\n]/.test(route) ? null : route
  } catch { return null }
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return }
  } catch { /* HTTP 或浏览器权限限制：使用兼容复制 */ }
  const input = document.createElement('textarea')
  input.value = text
  input.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  document.body.appendChild(input)
  input.select()
  input.setSelectionRange(0, text.length)
  try {
    if (!document.execCommand('copy')) throw new Error('Copy failed')
  } finally { input.remove() }
}

// 通知来自真实订单/优惠券；状态进入 ID，状态变化后会重新显示为未读。
export function accountNotifications(orders, coupons, readIds, t) {
  return [
    ...orders.map(o => ({
      id: `order:${o.id}:${o.status}`, icon: 'orders-o', iconColor: '#3B82F6', path: '/orders',
      title: t('profile.orderNotification'),
      preview: `${o.hotelName || o.scenicName || o.flightNo || o.orderNo} · ${t('profile.orderStatus_' + o.status)}`,
    })),
    ...coupons.filter(c => c.status === 'unused').map(c => ({
      id: `coupon:${c.id}`, icon: 'coupon-o', iconColor: '#F59E0B', path: '/coupons',
      title: t('profile.couponNotification'),
      preview: `${c.title} · ${t('profile.validUntil', { date: c.validUntil })}`,
    })),
  ].map(item => ({ ...item, unread: !readIds.includes(item.id) }))
}
