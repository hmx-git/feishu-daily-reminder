---
name: feishu-lihui-skill
description: Create, customize, deploy, and troubleshoot reusable Feishu meeting reminders for any group, daily or weekly schedule, timezone, image, meeting-sheet link, message text, and delivery method. Use when a user wants a shareable Feishu meeting reminder template, a top-image interactive card with a button, a computer-independent GitHub Actions schedule, a local MCP fallback, holiday/workday rules, duplicate prevention, or guidance for Feishu authorization and GitHub Secrets.
---

# 通用飞书例会提醒

将飞书例会提醒配置成可复用的互动卡片和定时发送流程。使用者只需提供目标群、频率、时间、时区、图片、例会表链接和文案；优先使用 GitHub Actions，必要时以本地 MCP 作为优先发送端或兜底端。

## 参数解析

从用户请求或上下文提取以下参数；缺失时询问，不猜测群或权限：

- `chat_id`：目标群 ID；只有群名时先调用群查询，并确认机器人已入群。
- `schedule`：支持每天、工作日每天、每周指定星期，例如每周五 17:00。
- `timezone`：默认 `Asia/Shanghai`。
- `sheet_url`：例会表、OKR 或会议资料链接。
- `message`：卡片正文；保留用户的换行、标点和 emoji。
- `image_url` / `image_path`：可选顶部图片。飞书文件链接需要应用有读取权限。
- `card_title`：默认 `📅 例会提醒`。
- `button_text`：默认 `填写例会表`。
- `delivery`：默认 `github-actions`；用户要求本地优先时使用 `local-first-cloud-fallback`。
- `latest_send_time`：可选的当天截止时间；超过此时间不再补发。
- `workdays_only`：可选；开启后跳过周末和已配置的法定节假日。

### 周期转换

将用户时区的时间转换为 GitHub Actions 使用的 UTC cron，并明确告知换算结果：

- 北京时间每周五 17:00 = UTC 每周五 09:00，cron 为 `0 9 * * 5`。
- 北京时间每天 10:05 = UTC 每天 02:05，cron 为 `5 2 * * *`。
- GitHub Actions 可能延迟几分钟，不保证精确到秒；需要截止窗口时必须在脚本中再次校验北京时间。

## 交付方式

### 云端 GitHub Actions（默认）

适合电脑关机仍要发送的场景：

1. 使用用户自己的 GitHub 仓库和飞书应用。
2. 配置可复用的发送脚本和 `.github/workflows/feishu-reminder.yml`。
3. 将群、文案、图片、链接和标题通过环境变量或安全配置注入。
4. 分别配置以下 Repository Secrets：
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
   - `FEISHU_CHAT_ID`
5. 手动执行一次 `workflow_dispatch` 验证，再等待定时运行。

不要要求用户把 `FEISHU_APP_SECRET` 粘贴到聊天中。

### 本地优先 + GitHub 兜底

仅在用户明确要求本地时间更准确或电脑开机时优先本地时使用：

1. 本地 MCP 在目标时间先发送。
2. 发送成功后，将当天成功状态写入 GitHub 状态文件。
3. GitHub Actions 在兜底窗口内先检查状态；已成功则跳过，避免重复消息。
4. 若本地失败，GitHub 只在截止窗口内尝试。
5. 当天截止时间之后两端都不得继续补发；下一次等待下一个符合条件的周期。
6. 修改代码或 MCP 配置后重启 MCP/Codex，确认只有一条计划，避免旧计划重复发送。

本地 MCP 依赖电脑、网络和 MCP 进程持续可用；电脑关机时不能发送。云端兜底仍需要 GitHub Secrets、Actions 开启和机器人权限正确。

## 互动卡片

优先发送一条 `interactive` 卡片，结构固定为：

1. 顶部为用户提供的图片；
2. 中间为 `lark_md` 正文，保留换行和 emoji；
3. 底部为 primary 按钮，链接到 `sheet_url`。

```json
{
  "config": { "wide_screen_mode": true },
  "header": {
    "template": "blue",
    "title": { "tag": "plain_text", "content": "<card_title>" }
  },
  "elements": [
    {
      "tag": "img",
      "img_key": "<uploaded_image_key>",
      "mode": "fit_horizontal",
      "alt": { "tag": "plain_text", "content": "例会提醒图片" }
    },
    {
      "tag": "div",
      "text": { "tag": "lark_md", "content": "<message>" }
    },
    {
      "tag": "action",
      "actions": [{
        "tag": "button",
        "type": "primary",
        "text": { "tag": "plain_text", "content": "<button_text>" },
        "url": "<sheet_url>"
      }]
    }
  ]
}
```

没有图片时删除 `img` 元素，不伪造 `image_key`。飞书文件链接可通过 `FEISHU_IMAGE_URL` 传入；发送脚本应提取 `/file/<token>`，用应用凭证下载后再上传为消息图片。

发送接口：

- 获取 `tenant_access_token`：`POST /open-apis/auth/v3/tenant_access_token/internal`
- 上传图片：`POST /open-apis/im/v1/images`，表单字段 `image_type=message`
- 发群消息：`POST /open-apis/im/v1/messages?receive_id_type=chat_id`
- `msg_type` 使用 `interactive`，`content` 使用卡片 JSON 字符串。

## 时间窗口、节假日和去重

- GitHub workflow 的 cron 只负责唤起任务；发送脚本必须使用 `Asia/Shanghai` 再校验实际当前时间。
- 若设置 `window_start` / `latest_send_time`，窗口外直接退出，不发送。
- 对本地优先方案，计划应保存 `latest_send_time`；本地发送前检查截止时间，失败后不要在同一天重新 arm 发送。
- `workdays_only=true` 时跳过周六、周日和节假日；节假日表应作为可更新数据文件，不把临时调休当成普通周末硬编码。
- 去重状态至少包含日期、状态和来源，例如 `{"date":"YYYY-MM-DD","status":"sent","source":"local-mcp"}`。
- 不要为了验证而同时手动触发本地和云端；测试应只触发一个端，避免真实群收到重复消息。

## 权限与授权

每个使用者都要用自己的租户完成授权：

- 创建或使用自己的飞书应用；
- 开通发送群消息和图片上传/读取相关权限（常见为 `im:resource` 或 `im:resource:upload`，以飞书开发者后台当前名称为准）；
- 发布或更新应用版本并完成租户授权；
- 将机器人加入目标群；
- 使用自己的 App ID、App Secret 和 Chat ID。

Skill 可以生成配置、代码和排错步骤，但不能替别人完成飞书授权，也不能共享 App Secret、GitHub Secrets 或私有群权限。

## 分享给别人

分享 Skill、模板代码或仓库结构即可；不要分享真实密钥、`.env`、聊天截图中的 token 或私有配置。对方只需替换自己的群 ID、图片链接、例会表链接、时间和文案，但机器人必须已加入目标群并获得图片读取权限。

GitHub Secrets 必须逐个创建：Name 和 Secret value 分开填写，不要把多行 `NAME=value` 粘进一个 Secret，也不要把 Secret 放在普通 Variables 中。

## 执行工作流

1. 整理用户参数，明确频率、时区、目标群、图片、链接、文案、截止时间和交付方式。
2. 判断是否需要工作日/节假日过滤、云端独立运行或本地优先去重。
3. 生成或更新发送脚本和 workflow，确保参数均可配置。
4. 进行语法检查和差异检查；不要打印 `.env` 或任何 Secret。
5. 提醒用户分别配置 Secrets、确认机器人入群和图片权限。
6. 只触发一个端做验证，确认收到一张图片卡片、正文和按钮。
7. 云端成功后再停用重复的旧本地计划；本地优先方案则保留云端兜底，但确认状态去重正常。
8. 汇报实际生效的时间、UTC cron、截止窗口、是否跳过节假日、部署方式和剩余授权动作。

## 常见排错

- `Missing ... secret`：Secret 名称、仓库、Environment 或分支不对；修正后重新运行新的 `workflow_dispatch`。
- 图片上传 403：检查图片文件权限、应用版本是否发布、机器人是否在目标租户和群中。
- 发消息失败：检查 `FEISHU_CHAT_ID`、机器人入群状态、发送权限和 `receive_id_type=chat_id`。
- 卡片格式异常：正文使用 `lark_md`；图片放在 `elements` 第一项；按钮使用 URL action；检查换行是否被双重转义。
- 定时未发送：检查 Actions 是否启用、cron 是否按 UTC 配置、当前北京时间是否在窗口内，以及是否被工作日/节假日过滤。
- 出现两次提醒：检查本地与云端是否同时发送、GitHub 状态文件是否成功更新、是否残留旧计划；只保留一条本地计划并启用发送状态去重。
- 修改后 MCP 显示 `Transport closed` 或计划消失：重启 Codex/MCP，随后调用计划列表确认只有目标计划。

## 输出规范

完成配置后，用中文简洁说明：目标群、频率、北京时间和 UTC cron、卡片内容、图片/按钮、截止窗口、部署方式、授权待办和后续修改方式。绝不输出任何 Secret 值。