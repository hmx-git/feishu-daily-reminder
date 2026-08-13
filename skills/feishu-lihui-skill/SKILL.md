---
name: feishu-lihui-skill
description: Create, customize, deploy, and troubleshoot reusable Feishu meeting reminders for any group, schedule, timezone, image, meeting-sheet link, message text, and delivery method. Use when a user wants a shareable Feishu meeting reminder template, an interactive card with a top image and button, a computer-independent GitHub Actions schedule, or guidance for Feishu authorization and GitHub Secrets.
---

# 通用飞书例会提醒

将飞书例会提醒做成可复用模板。目标是让使用者提供自己的群、时间、时区、图片、例会表链接和文案后，生成同样风格的互动卡片，并优先部署到 GitHub Actions，使电脑关机时仍可发送。

## 先收集配置

向用户确认或从上下文提取以下参数；缺失时使用明确的占位符，不要猜测群或权限：

- `chat_id`：目标群 ID；若用户只提供群名，指导其先查找群 ID，并确认机器人已入群。
- `schedule`：发送频率和时间，例如每天 10:15、每周一 09:30。
- `timezone`：默认 `Asia/Shanghai`。
- `sheet_url`：例会表或会议资料链接。
- `message`：卡片正文，保留用户要求的编号和换行。
- `image`：可选的顶部图片路径；没有图片时省略图片元素。
- `card_title`：默认 `📅 例会提醒`。
- `button_text`：默认 `填写例会表`。
- `delivery`：默认 `github-actions`；只有用户明确接受电脑必须开机时才使用本地 MCP。

不要要求用户把 `FEISHU_APP_SECRET` 粘贴到聊天中。只告诉用户需要在自己的 GitHub 仓库 Secrets 中配置它。

## 交付方式选择

### 云端 GitHub Actions（默认

适合电脑关机仍要发送的场景：

1. 使用用户自己的 GitHub 仓库和飞书应用。
2. 在仓库中加入发送脚本和 `.github/workflows/feishu-reminder.yml`。
3. 将本地时间转换为 UTC cron；例如 `Asia/Shanghai` 每天 10:15 对应 `15 2 * * *`。
4. 配置三个 Repository Secrets，每个单独创建：
   - `FEISHU_APP_ID`
   - `FEISHU_APP_SECRET`
   - `FEISHU_CHAT_ID`
5. 手动执行一次 `workflow_dispatch` 验证，再等待定时运行。

GitHub Actions 的定时任务可能延迟几分钟，不保证精确到秒。使用者需要确认仓库 Actions 已启用，并且机器人在目标群中。

### 本地 MCP（备用

仅在用户明确选择本地方案时使用。必须说明电脑、网络和 MCP 进程都要保持可用；电脑关机后不会发送。若已有本地提醒和云端提醒并行，先确认是否会重复发送，再取消多余任务。

## 互动卡片结构

优先发送一条 `interactive` 卡片：

1. 顶部放用户提供的图片（上传图片获得 `image_key`）。
2. 下面放正文，使用 `lark_md`，把换行保留为 `\n`。
3. 底部放一个 primary 按钮，链接到 `sheet_url`。
4. 没有图片时，删除 `img` 元素，不要伪造图片 key。

卡片的通用结构：

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
      "actions": [
        {
          "tag": "button",
          "type": "primary",
          "text": { "tag": "plain_text", "content": "<button_text>" },
          "url": "<sheet_url>"
        }
      ]
    }
  ]
}
```

发送时使用：

- 获取 `tenant_access_token`：`POST /open-apis/auth/v3/tenant_access_token/internal`
- 上传图片：`POST /open-apis/im/v1/images`，表单字段 `image_type=message`
- 发群消息：`POST /open-apis/im/v1/messages?receive_id_type=chat_id`
- `msg_type` 为 `interactive`，`content` 为卡片 JSON 字符串。

## 权限与授权

每个使用者都要用自己的租户完成授权，尤其是跨公司或跨租户分享时：

- 创建或使用自己的飞书应用；
- 开通发送群消息和图片上传相关权限（常见为 `im:resource` 或 `im:resource:upload`，以飞书开发者后台当前权限名称为准）；
- 发布/更新应用版本并完成租户授权；
- 将机器人加入目标群；
- 使用自己的 App ID、App Secret 和 Chat ID。

Skill 可以生成配置、代码和排错步骤，但不能替别人完成飞书授权，也不能共享你的 App Secret、GitHub Secrets 或私有群权限。

## 分享给别人时的安全规则

- 分享 Skill 文件、模板代码或仓库结构即可；不要分享真实密钥、`.env`、聊天截图中的 token 或私有配置。
- 对方只需替换自己的参数；不同群通常替换 `FEISHU_CHAT_ID`，但机器人必须在该群内。
- 不要把多行 `NAME=value` 粘到一个 GitHub Secret；Name 和 Secret value 分开填写。
- 不要把目标群 ID、例会表 URL、图片和固定文案硬编码为唯一方案；默认值只能作为示例或由用户明确提供。

## 通用工作流

1. 读取用户参数，整理成配置表并指出缺项。
2. 判断云端或本地方案；默认云端。
3. 创建或修改发送脚本，使群 ID、文案、链接、图片路径、标题和按钮可通过环境变量配置。
4. 生成 GitHub Actions cron，并同时提供 `workflow_dispatch` 手动测试入口。
5. 运行语法检查；不要打印密钥或 `.env`。
6. 指导用户分别配置 Secrets，并确认机器人入群及权限。
7. 手动触发一次，验证收到一张卡片：图片、正文、按钮和链接都正确。
8. 只有云端成功后，才建议停用本地重复提醒。
9. 汇报已完成项、需要用户授权的项、定时延迟说明和后续修改方式。

## 常见排错

- `Missing ... secret`：Secret 名称、仓库、Environment 或分支配置不对；新建/修正后重新运行，不要只重试旧失败记录。
- 图片上传 403/权限不足：检查图片资源权限、应用版本是否发布、机器人是否在目标租户和群中。
- 发消息失败：检查 `FEISHU_CHAT_ID`、机器人入群状态、发送消息权限和 `receive_id_type=chat_id`。
- 卡片格式丑或换行异常：正文使用 `lark_md`，正确保留换行；图片放在 `elements` 第一项；按钮使用 URL action。
- 定时未发送：检查 Actions 是否启用、cron 是否按 UTC 配置、GitHub 是否延迟；先用 `workflow_dispatch` 测试。

## 输出规范

完成配置后，用中文简洁说明：目标群、时间/时区、卡片内容、部署方式、用户仍需完成的授权，以及如何修改群、图片、链接和文案。绝不输出任何 Secret 值。
