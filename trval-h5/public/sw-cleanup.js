// 升级时删除旧版统一 API 缓存，包括已退出账号的资料、订单等响应。
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.delete('api-cache'))
})
