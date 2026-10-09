# 行程页双卡布局发布记录（2026-09-01）

- 地址：http://8.148.223.54/#/trips
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260901-trips-cards`
- 回滚备份：`/opt/backups/releases/20260901-trips-cards/frontend-before.tar.gz`
- 发布脚本：`deploy/release_trips_cards_20260901.sh`

## 本次更新

- 行程页顶栏改为「线路规划」+ 加号/更多图标。
- AI 规划卡与我的线路卡齐高，比例左 2/5、右 3/5。
- 只发布 `TripsView.vue`、行程文案和对应测试，未改后端、数据库和上传文件。

## 验证

- 服务器隔离目录中 14 个测试文件、62 项测试通过。
- 生产构建和 Nginx 配置检查通过。
- 上线后的 `index.html`、Service Worker、TripsView CSS/JS 与构建产物哈希一致。

## 回滚

在服务器执行 `bash /tmp/release_trips_cards_20260901.sh rollback`。
