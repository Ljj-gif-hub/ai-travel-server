# 我的页 / 登录页发布记录（2026-09-01）

- 地址：http://8.148.223.54/#/profile 、http://8.148.223.54/#/login 、http://8.148.223.54/#/settings
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260901-profile-login`
- 回滚备份：`/opt/backups/releases/20260901-profile-login/frontend-before.tar.gz`
- 部署脚本：`deploy/release_profile_login_20260901.sh`（服务器副本 `/tmp/release_profile_login_20260901.sh`）

## 本次更新

Codex 已完成「我的」页和登录页打磨，本轮只把这些前端改动叠加到线上源码基线后构建，没有发布工作区其他未完成改动。

- 「我的」页：顶部工具（扫一扫 / 签到 / 客服 / 设置），常用服务合并为一张卡。
- 新增独立设置页：主题、语言、反馈、关于、退出登录。
- 登录/注册改为风景优先的极简布局：透明输入、账号密码/验证码切换、左下角微信/QQ/支付宝入口。

只叠加以下文件，并对生产路由做 `/settings` 补丁：

1. `src/views/Profile.vue`
2. `src/views/LoginView.vue`
3. `src/views/SettingsView.vue`
4. `src/locales/zh/profile.js` / `src/locales/en/profile.js`
5. `src/locales/zh/auth.js` / `src/locales/en/auth.js`
6. `src/locales/zh/settings.js` / `src/locales/en/settings.js`
7. `tests/profilePresentation.spec.js` / `tests/authPresentation.spec.js`

没有修改后端、数据库或上传文件，没有重启服务容器。验证码真实下发和第三方登录仍为占位提示。

## 验证

- 服务器隔离发布目录：14 个测试文件、62 项测试通过，生产构建成功。
- Nginx 配置检查通过；切换后首页、Service Worker、登录背景图、Profile/LoginView/SettingsView 的 JS/CSS 哈希与构建产物一致。
- 公网上述资源返回 HTTP 200；`/actuator/health` 返回 `UP`；未登录 `/api/orders` 返回 401。
- 公网 CSS 包含 `hero-tools`、`login-btn`、`settings-page`。当前环境没有浏览器自动化，未做公网点击验收。

发布包 SHA-256：`990d76d8f6e3cd8d9636bcc9b37b7b69953f58418e5f99b6abef21eb2ca8cf29`

新版 `index.html` SHA-256：`8a498007c7af61ea81a8ba27c1ad8906c3aa83844970d71472bc6178d421e6c1`

## 回滚

在服务器执行 `bash /tmp/release_profile_login_20260901.sh rollback`。恢复发布前的源码和构建产物，同时保留新旧哈希资源，兼容已打开页面的客户端。大型 images、demos、showcase 静态资源本次未修改，不包含在回滚归档中。
