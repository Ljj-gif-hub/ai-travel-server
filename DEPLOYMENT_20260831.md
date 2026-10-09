**修复版发布结果 · 2026-09-01**

状态：**DEPLOYED，已上线**。用户已明确授权向 8.148.223.54 上传并更新 /opt/bundle；源码包校验、备份、构建、切换和服务验证已完成。

访问地址：[AI 旅游助手](http://8.148.223.54/)。沿用现有 HTTP 入口，未配置 HTTPS；真实支付、退款与对账仍未接入完整闭环。

| 检查 | 结果 |
| --- | --- |
| 构建 | 服务器前端 51 项测试和生产构建、Java 镜像构建、Agent 契约检查通过。此前本地三端共 106 项测试通过。 |
| 首页和资源 | 公网首页、sw.js、sw-cleanup.js 返回 200；提供的 index.html 摘要与新构建一致。本机通过公网访问首页及其引用的 8 个脚本/样式资源，均返回 200。 |
| 服务健康 | /actuator/health 返回 HTTP 200、status=UP；Agent 容器 healthy。本机经公网独立检查也通过。 |
| 身份保护 | 未登录访问 /api/orders 返回 HTTP 401。 |
| 运行版本 | Java、Agent 容器实际镜像 ID 与各自 release-20260831-repair 标签对应镜像一致。 |
| 记忆迁移 | Agent 已挂载 travel-java_agent-data 到 /app/data；启动前迁移文件摘要与停写备份一致。 |
| 网络隔离 | Java 3200、Agent 3201 仅在容器网络暴露，不再发布宿主机端口；公网入口仍为 Nginx 80。 |
| 验证边界 | 浏览器自动化导航超时，未完成页面交互验收。HTTP 和构建检查不等同于完整浏览器端到端测试；本次未进行真实支付或付费模型调用。 |

首次切换曾因构建目录 700、生成文件 600 导致 Nginx 读取失败，已回滚恢复旧服务，并修正 Compose 回滚参数兼容问题。随后增加静态资源目录 755/文件 644 设置、Nginx 用户读取检查和首页权限设置，第二次切换成功。数据库和 uploads 未被迁移、清空或回滚。

**版本与备份**

- 服务器部署目录：/opt/bundle；Compose 项目：travel-java。
- 新版本暂存目录：/opt/releases/20260831-repair。
- 备份目录：/opt/backups/releases/20260831-repair，包含 sources.tar.gz、数据库备份、Agent 停写快照及迁移摘要。重试前另存 database-before-retry-20260901.sql.gz。
- 新镜像：travel-java:release-20260831-repair、travel-agent:release-20260831-repair。
- 回滚镜像：travel-java:rollback-20260831-repair、travel-agent:rollback-20260831-repair。原 Java 镜像已被历史部署清理，回滚镜像由原运行容器快照保留。
- 部署脚本：[release_20260831.sh](H:/ai项目/project/ai-travel-project/deploy/release_20260831.sh)，服务器副本 /tmp/release_20260831.sh；切换日志 /tmp/release_20260901_activate.log。
- 上传包 SHA-256：e7951b13551eb9627449700c484c63814549e9c3178dfcea2af2e2e876596eb5。

备份仅保存在服务器，未下载用户数据库或记忆数据。后续需要回滚时，先停止写入并另存当前 Agent 数据卷，再使用旧版本恢复流程；脚本中的 Agent 快照对应本次切换前状态，不能替代日后的最新数据备份。不要执行 docker compose down -v。
