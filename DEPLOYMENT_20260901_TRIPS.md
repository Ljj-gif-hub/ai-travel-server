# 行程页发布记录（2026-09-01）

- 地址：http://8.148.223.54/#/trips
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260901-trips-polish`
- 回滚备份：`/opt/backups/releases/20260901-trips-polish/frontend-before.tar.gz`
- 部署脚本：`deploy/release_trips_20260901.sh`（服务器副本 `/tmp/release_trips_20260901.sh`）

## 本次更新

- 已有线路按目的地匹配封面，优先使用核验过的景点实拍。
- 暂无线路或目的地为空时，用漓江山水实拍代替纯渐变卡片；仍显示原有空态文案。
- “开始规划”按钮改为浅色底、深紫色粗体字。
- 顶部重复的“我的线路”入口改为“全部线路”。
- 缺少评分的景点显示“暂无评分”，始终保留“线路详情”；不编造评分。

只将以下四个文件叠加到线上源码基线后构建，未发布工作区其他改动：

1. `src/views/TripsView.vue`
2. `src/locales/zh/trips.js`
3. `src/locales/en/trips.js`
4. `tests/tripsPresentation.spec.js`

复用线上已有图片和 `src/data/homePlanImages.js`。没有修改后端、数据库或上传文件，没有重启服务容器。

## 验证

- 本地及服务器：11 个测试文件、57 项测试通过，生产构建成功。
- 回归检查涵盖厦门/杭州市封面、未知目的地、图片加载失败、暂无线路景点图，以及缺评分卡片的详情跳转。
- 本地浏览器确认默认景点封面与按钮显示正常。
- 公网浏览器确认新版“全部线路”“开始规划”和原有空态文案。
- 首页、Service Worker、行程页 JS/CSS 和漓江/厦门图片通过服务器 HTTP 内容哈希检查。
- 公网样式和默认图片返回 HTTP 200，健康检查返回 `UP`；未登录订单接口返回 401。

发布包 SHA-256：`bce1ed1ed96f8d3c3ced29fa40c1ccedbb462e4c32032ed44d3a21857c5547c8`

新版 index.html SHA-256：`fe57c28ef87f1fd793b706c4aaaf0b001c27d5f01e88e55df1f129b2d3ad7f5e`

## 回滚

在服务器执行 `bash /tmp/release_trips_20260901.sh rollback`。恢复发布前的源码和构建产物，同时保留新旧哈希资源，兼容已打开页面的客户端。大型 images、demos、showcase 静态资源本次未修改，不包含在回滚归档中。
