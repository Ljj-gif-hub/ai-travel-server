# 个人中心功能接通发布记录（2026-09-05）

- 地址：http://8.148.223.54/#/profile
- 状态：DEPLOYED
- 发布目录：`/opt/releases/20260905-profile-functional-r1`
- 回滚备份：`/opt/backups/releases/20260905-profile-functional-r1`
- 部署脚本：`deploy/release_profile_functional_20260905.sh`（服务器副本 `/tmp/release_profile_functional_20260905.sh`）

Codex GPT-6 已完成本地实现并上传候选包；因额度中断时 `prepare` 停在旧吸顶测试。本轮补上 `tests/profilePresentation.spec.js`，重新构建后完成切换。

## 本次更新

只叠加个人中心相关前后端文件，保留线上其他已发布页面改动：

- 扫一扫：相册/拍照识别二维码，或粘贴本站链接后打开。
- 签到：`POST /api/user/check-in`，北京时间每日一次、每次 5 积分。
- 会员等级、真实通知、头像上传、反馈截图、统计字段与设置页账号信息。

新增可空列 `users.last_check_in_date`。没有接入真实短信、第三方支付、人工客服或邀请返券。

## 验证

- 隔离目录：前端 18 个文件、79 项测试通过；后端镜像构建 14 项测试通过。
- 切换后健康检查 `UP`；未登录访问订单接口返回 401。
- 用一次性账号完成签到、重复签到、资料保存和统计冒烟，随后删除该账号。
- 公网首页、Service Worker、Profile / Settings / jsQR / EditProfile 资源返回 200，`index.html` 哈希与构建产物一致。
- 当前环境没有浏览器自动化，未再做公网点击验收。

发布包 SHA-256：`74f467b5255b8e072a364bd6f421b76625e11cad0298aa06e61cc7e450553b9f`

新版 `index.html` SHA-256：`61bfa1268adc0862b8283b7b14cdd1c3bb6d5064beb39945a1bb5aa22a038865`

## 回滚

在服务器执行 `bash /tmp/release_profile_functional_20260905.sh rollback`。恢复发布前的应用镜像和前端文件；新增可空列可保留，旧代码兼容。
