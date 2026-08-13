# GitHub 云端定时提醒

`.github/workflows/feishu-reminder.yml` 会在每天 02:15 UTC（北京时间 10:15）运行，电脑关机也不受影响。GitHub Actions 的定时任务可能延迟几分钟，不保证精确到秒。

需要在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中创建 3 个 Repository secrets：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CHAT_ID`（当前群：`oc_36e99ff82ec6bc822f7320b645bf556d`）

飞书应用还必须拥有图片上传权限 `im:resource:upload` 或 `im:resource`，并已发布最新版本；应用机器人需要在目标群「破茧」中。

创建仓库后可在 Actions 页面手动运行 `Feishu daily meeting reminder` 测试。测试成功后，建议取消原来的本机提醒，避免重复发送。

## 本地优先、云端兜底

云端工作流先等待约 5 分钟，再检查 data/local-delivery.json。当天本地 MCP 已成功发送时，云端跳过；否则在北京时间 10:15–10:28 内发送。
