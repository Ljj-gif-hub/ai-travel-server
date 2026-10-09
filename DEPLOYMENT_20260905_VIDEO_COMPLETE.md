# 视频观看页完善发布记录（2026-09-05）

- 地址：http://8.148.223.54/#/video-detail
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260905-video-complete`
- 回滚备份：`/opt/backups/releases/20260905-video-complete`
- 部署脚本：`deploy/release_video_complete_20260905.sh`（服务器副本 `/tmp/release_video_complete_20260905.sh`）

Codex GPT-6 已完成本地实现、隔离构建和 `activate`。因额度中断，公网验收与发布记录未写完。本轮只补验收和记录，没有再次改线上文件。

## 本次更新

只叠加视频页相关前端文件，未改后端、数据库或上传目录：

1. `src/views/VideoDetailView.vue` — 沉浸式竖滑、电脑侧栏、真实点赞/关注/收藏/搜索/分享、声音倍速进度全屏、评论分页与失败重试。
2. `src/components/CollectionSheet.vue` — 收藏到合集。
3. `src/locales/zh/community.js` / `src/locales/en/community.js` — 观看页文案。
4. `tests/videoDetailPresentation.spec.js` / `tests/collectionSheet.spec.js` — 对应断言。

没有扩表、没有写业务数据。发布前 MySQL 物理体积约 200M，发布后仍为 200M。磁盘占用 84%，剩余 6.2G。

## 验证

- 隔离目录：前端测试及生产构建通过；`activate` 校验 `index.html`、`sw.js`、`VideoDetailView-DhYuDIYH.js`、`VideoDetailView-DU6iJcxF.css`。
- 公网与本机、发布目录的 `index.html` 哈希一致：`29654b722613cca8daa72bba08f536d3170701371e8388ca317e3b652c3f40b4`。
- 公网 Video JS / CSS / `sw.js` 哈希与发布产物一致。
- 资源含 `video-page-root`、`video-shell`、`side-actions`、`comment-drawer`、`share-link`、`playbackRate`、`CollectionSheet`。
- `/actuator/health` 返回 `UP`；未登录访问 `/api/orders` 返回 401。
- 个人中心 `hero-tools`、`/settings` 路由及 Profile / Settings 资源仍可访问。
- 当前环境没有浏览器自动化，未再做公网点击验收。

发布包 SHA-256：`cfd1108f98fdc6a2a59c5a8aca11c6dec23181268ec75f561f3b2f8e40271324`

新版 `index.html` SHA-256：`29654b722613cca8daa72bba08f536d3170701371e8388ca317e3b652c3f40b4`

## 回滚

在服务器执行 `bash /tmp/release_video_complete_20260905.sh rollback`。恢复发布前的前端源码和构建产物；大型 images、demos、showcase 静态资源本次未修改，不包含在回滚归档中。
