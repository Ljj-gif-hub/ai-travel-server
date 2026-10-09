# 行程页吸顶栏发布记录（2026-09-01）

- 地址：http://8.148.223.54/#/trips
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260901-trips-sticky`
- 回滚备份：`/opt/backups/releases/20260901-trips-sticky/frontend-before.tar.gz`
- 发布脚本：`deploy/release_trips_sticky_20260901.sh`

## 本次更新

- 行程页改为窗口滚动；标题滚出后吸顶显示「线路规划」和加号/更多。
- 只发布 `TripsView.vue`、吸顶 composable 和对应测试，未改后端、数据库和上传文件。

## 验证

- 服务器隔离目录中 14 个测试文件、62 项测试通过。
- 生产构建、Nginx 配置、线上资源哈希和后端健康检查通过。

## 回滚

在服务器执行 `bash /tmp/release_trips_sticky_20260901.sh rollback`。
