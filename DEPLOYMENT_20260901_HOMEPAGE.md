# 首页发布记录（2026-09-01）

- 地址：http://8.148.223.54/#/
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260901-homepage-glass`
- 回滚备份：`/opt/backups/releases/20260901-homepage-glass/frontend-before.tar.gz`
- 发布脚本：`deploy/release_homepage_20260901.sh`（服务器副本位于 `/tmp/`）

## 本次变更

“问问 AI”保留为悬浮按钮，采用透明磨砂玻璃背景和循环流动的紫色边光；减少动态效果的系统设置下停用动画。保留旅行灵感的双列瀑布流布局，左上角轮播卡略小于普通笔记卡。首页顶部更换为武陵源旅行图片，并保留明确的 AI 规划入口。

仅将以下七个文件覆盖到生产源码基线后构建，没有发布工作区其他未完成的改动：

- `src/views/HomeView.vue`
- `src/App.vue`
- `src/locales/zh/home.js`
- `src/locales/en/home.js`
- `public/travel-cover.svg`
- `public/travel-hero.jpg`
- `tests/homePresentation.spec.js`

## 验证

- 本地与服务器隔离发布目录的测试均为 10 个文件、52 项通过，生产构建通过。
- 原服务器依赖目录缺少 Vitest；仅在隔离发布目录使用现有锁文件安装开发依赖后完成构建。
- Nginx 配置检查通过；切换后首页、Service Worker、首页 CSS/JS、新图片与构建产物的 SHA-256 一致。
- 公网首页 CSS 和顶部图片返回 HTTP 200，`/actuator/health` 返回 `UP`；服务器接口检查确认未登录访问 `/api/orders` 返回 401。
- 本地浏览器已确认玻璃背景、边光角度随时间变化及按钮打开 AI 对话框。部署后公网页面的浏览器自动化多次超时，未完成公网截图复查；公网资源与健康检查已通过。
- 后端、Nginx 与数据服务容器均未重启，没有更改数据库或上传文件。

发布包 SHA-256：`8144552b3a2f172e16835b3f173b096e671494e415deb435531f7c60f144dcef`

新版 `index.html` SHA-256：`dfeff8fe24726998c0284fee28a6c57f88ca599a36b439c6aff62dea1d8e3867`

## 回滚

在服务器运行 `bash /tmp/release_homepage_20260901.sh rollback`。该操作恢复备份的旧版源码及前端产物；旧、新哈希资源均保留，以兼容已经打开页面的客户端。备份不包含本次未修改的 images、demos 和 showcase 大型静态资源目录。
