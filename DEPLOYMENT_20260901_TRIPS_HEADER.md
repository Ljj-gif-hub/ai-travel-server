# 行程页顶部发布记录（2026-09-01）

- 地址：http://8.148.223.54/#/trips
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260901-trips-header`
- 回滚备份：`/opt/backups/releases/20260901-trips-header/frontend-before.tar.gz`
- 发布脚本：`deploy/release_trips_header_20260901.sh`

## 本次更新

- 行程页标题改为左对齐。
- 裸加号改为蓝紫渐变“新建线路”按钮。
- 三点菜单改为轻量“更多”按钮。
- 只发布 `src/views/TripsView.vue`，未发布工作区其他改动，也未修改后端、数据库和上传文件。

## 验证

- 服务器隔离目录中 14 个测试文件、62 项测试通过。
- 生产构建和 Nginx 配置检查通过。
- 上线后的 `index.html`、Service Worker、TripsView CSS/JS 与构建产物哈希一致。
- 后端健康检查返回 `UP`，未登录订单接口返回 401。

## 回滚

在服务器执行 `bash /tmp/release_trips_header_20260901.sh rollback`。
