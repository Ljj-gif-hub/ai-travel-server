# 首页 / 我的页吸顶栏补发记录（2026-09-01）

- 地址：http://8.148.223.54/
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260901-home-profile-sticky`
- 回滚备份：`/opt/backups/releases/20260901-home-profile-sticky/frontend-before.tar.gz`
- 发布脚本：`deploy/release_home_profile_sticky_20260901.sh`

## 本次更新

- 首页保留首屏大图，滚过“搜索景点”后渐入吸顶搜索和快捷功能栏。
- “我的”页首屏与背景图融合，滚过头图后渐入吸顶标题栏。
- 只补发 `HomeView.vue`、`Profile.vue` 及对应测试，未发布其他工作区改动。

## 验证

- 本地及服务器隔离目录中 14 个测试文件、62 项测试通过。
- 生产构建、Nginx 配置、线上资源哈希和后端健康检查全部通过。
- 首页、“我的”页、行程页的线上源码哈希均与本地目标版本一致。

## 回滚

在服务器执行 `bash /tmp/release_home_profile_sticky_20260901.sh rollback`。
