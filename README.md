# 飞书例会提醒 MCP

这个项目提供一个可被 Codex/Claude Desktop 等 MCP 客户端调用的本地 MCP 服务，用于：

- 向飞书群发送文本消息
- 按群名称查找 `chat_id`
- 创建、查看、取消每天固定时间的提醒
- 持久化提醒配置，服务重启后自动恢复

## 1. 准备飞书应用

在飞书开放平台创建企业自建应用，并为应用配置发送群消息所需的权限。将应用加入目标群「破茧大群」。

复制 `.env.example` 为 `.env`，填写：

```dotenv
FEISHU_APP_ID=cli_xxx
FEISHU_APP_SECRET=xxx
FEISHU_CHAT_ID=
FEISHU_CHAT_NAME=破茧大群
FEISHU_TIMEZONE=Asia/Shanghai
FEISHU_SCHEDULE_FILE=./data/schedules.json
```

推荐直接填写 `FEISHU_CHAT_ID`；若留空，服务会使用 `FEISHU_CHAT_NAME` 调用群列表接口查找群 ID。

## 2. 安装与启动

```powershell
npm.cmd install
npm.cmd run start
```

MCP 使用 stdio 传输。服务进程必须持续运行，定时器才能按时触发；已创建的计划会保存到 `data/schedules.json`，服务重启后会恢复。

## 3. MCP 客户端配置

可参考 `mcp-config.example.json`：

```json
{
  "mcpServers": {
    "feishu-reminder": {
      "command": "node",
      "args": ["D:/work/work_feishu/src/server.js"],
      "env": {
        "FEISHU_APP_ID": "cli_xxx",
        "FEISHU_APP_SECRET": "xxx",
        "FEISHU_CHAT_NAME": "破茧大群",
        "FEISHU_TIMEZONE": "Asia/Shanghai"
      }
    }
  }
}
```

生产环境请不要把密钥提交到仓库；推荐使用 `.env` 或客户端的安全环境变量配置。

## 4. 可用工具

- `send_feishu_message`: 立即发送消息
- `schedule_daily_reminder`: 创建每天提醒，默认时间为 10:15
- `list_scheduled_reminders`: 查看已保存计划
- `cancel_scheduled_reminder`: 按 ID 取消计划
- `find_feishu_group`: 按名称查找群

示例调用参数：

```json
{
  "time": "10:15",
  "chat_name": "破茧大群",
  "message": "1. 提醒大家填写例会表，链接如下：\\nhttps://qdreaming.feishu.cn/sheets/C7jXszp7OhnbgNt2xTucg4FMnyf\\n2. 有事不能参加联系PM~"
}
```

> 注意：如果要让任务无人值守执行，请将此 MCP 服务配置为随机器/开发环境启动的常驻进程，并确保网络、飞书应用凭据和目标群权限持续有效。

## 自动化配置状态

已准备好 .env、飞书群 chat_id 与 MCP 服务代码。由于 Codex 全局配置文件受保护，项目中额外生成了 codex-config-snippet.toml，将其中的 mcp_servers.feishu_reminder 段复制到 C:\Users\WX\.codex\config.toml 后重启 Codex 即可加载。

