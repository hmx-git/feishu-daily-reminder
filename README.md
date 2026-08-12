# 飞书例会提醒 MCP

这个项目提供一个可被 Codex/Claude Desktop 等 MCP 客户端调用的本地 MCP 服务，也包含一个无需电脑开机的 GitHub Actions 云端提醒。

## 云端提醒（电脑关机也能发送）

`.github/workflows/feishu-reminder.yml` 每天在 **北京时间 10:15** 运行（GitHub Actions 可能有几分钟延迟）。当前发送的是一张飞书互动卡片，包含：

- 顶部例会提醒图片
- 例会表链接
- 「填写例会表」按钮
- 不能参会时联系 PM 的提示

GitHub 仓库的 **Settings → Secrets and variables → Actions → Secrets** 中，需要分别创建以下 3 个 Repository secrets：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CHAT_ID`（当前群：`oc_36e99ff82ec6bc822f7320b645bf556d`）

创建或更新代码后，在 Actions 页面手动运行 `Feishu daily meeting reminder` 测试。

## 本地 MCP

本地 MCP 支持：

- 向飞书群发送文本消息
- 按群名称查找 `chat_id`
- 创建、查看、取消每天固定时间的提醒
- 持久化提醒配置，服务重启后自动恢复

### 准备飞书应用

在飞书开放平台创建企业自建应用，为应用配置发送群消息所需的权限，并将应用加入目标群「破茧大群」。

复制 `.env.example` 为 `.env`，填写：

```dotenv
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_CHAT_ID=oc_xxx
FEISHU_CHAT_NAME=破茧大群
FEISHU_TIMEZONE=Asia/Shanghai
FEISHU_SCHEDULE_FILE=./data/schedules.json
```

### 安装与启动

```powershell
npm.cmd install
npm.cmd run start
```

MCP 使用 stdio 传输。服务进程必须持续运行，定时器才能按时触发；已创建的计划会保存到 `data/schedules.json`，服务重启后会恢复。

### MCP 客户端配置

可参考 `mcp-config.example.json`。生产环境请不要把密钥提交到仓库，推荐使用 `.env` 或客户端的安全环境变量配置。

### 可用工具

- `send_feishu_message`: 立即发送消息
- `schedule_daily_reminder`: 创建每天提醒，默认时间为 10:15
- `list_scheduled_reminders`: 查看已保存计划
- `cancel_scheduled_reminder`: 按 ID 取消计划
- `find_feishu_group`: 按名称查找群
