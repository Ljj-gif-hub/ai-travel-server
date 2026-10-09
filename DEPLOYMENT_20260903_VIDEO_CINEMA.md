# 视频详情页 B 站风影院布局发布记录（2026-09-03）

- 地址：http://8.148.223.54/#/video-detail
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260903-video-cinema`
- 回滚备份：`/opt/backups/releases/20260903-video-cinema/frontend-before.tar.gz`
- 部署脚本：`deploy/release_video_cinema_20260903.sh`（服务器副本 `/tmp/release_video_cinema_20260903.sh`）

## 本次更新

视频详情页由「抖音式全屏滑动」整体重写为「B 站风深色影院布局」，只叠加以下 5 个文件，未改后端/数据库/上传文件，未重启服务容器：

1. `src/views/VideoDetailView.vue` — 整页重写：深色主题、16:9 大播放器（自定义控制条/倍速/全屏/键盘快捷键）、标题+统计行（播放/点赞/评论/收藏/分享）+简介+标签+作者卡、右侧「相关推荐」栏（点击切换视频）、评论区改内联（保留回复/传图/点赞/删除）
2. `src/locales/zh/community.js` / `src/locales/en/community.js` — 新增 `detailTitle` / `relatedVideos` / `favorite` / `viewsUnit`
3. `vite.config.js` — 代理目标支持 `API_TARGET` 环境变量（默认仍 `localhost:3200`，不影响生产构建）
4. `tests/videoDetailPresentation.spec.js` — 测试用例适配新布局（移除 video-shell/slotSrc 等旧断言）

## 验证

- 服务器隔离发布目录：16 个测试文件、74 项测试通过，生产构建成功。
- Nginx 配置检查通过；切换后 index.html、sw.js、VideoDetailView 的 JS/CSS 哈希与构建产物一致。
- `/actuator/health` 返回 `UP`。
- 公网浏览器自动化验收：页面渲染新版 `vd-page` 布局，标题/统计/标签/作者卡/相关推荐/评论区齐全，视频可播放。
- 首次 activate 因脚本笔误（`mv sw.js sw.js`）触发自动回滚，线上始终为旧版可用状态；修正脚本后重新激活成功。

发布包 SHA-256：`96dd45d4aafa4d00f2a5717dbf79c7fa7db3dbf0e32381e8a558165a8e05f7e6`

新版 `index.html` SHA-256：`b9c552b1901f46197bbed6abd2be0e4bf10472739c6345273f6b3c84f30a1644`

## 回滚

在服务器执行 `bash /tmp/release_video_cinema_20260903.sh rollback`。恢复发布前的源码和构建产物，同时保留新旧哈希资源，兼容已打开页面的客户端。大型 images、demos、showcase 静态资源本次未修改，不包含在回滚归档中。
