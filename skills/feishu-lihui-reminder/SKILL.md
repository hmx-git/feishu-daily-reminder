---
name: feishu-lihui-reminder
description: Configure, troubleshoot, and maintain a daily Feishu meeting reminder for the “破茧” group. Use when setting up a 10:15 Asia/Shanghai reminder, adding a top image and interactive card layout, connecting a Feishu MCP, deploying a computer-independent GitHub Actions workflow, configuring GitHub secrets, diagnosing failed runs, or changing the reminder content and schedule.
---

# Feishu 例会提醒

Use this skill to reproduce and maintain the daily meeting reminder configured during this task. Prefer the cloud workflow so the user's computer can be shut down.

## Canonical configuration

- Schedule: every day at `10:15`, timezone `Asia/Shanghai`.
- GitHub cron equivalent: `15 2 * * *` (UTC).
- Target group: Feishu `破茧` / `破茧大群`.
- Known chat ID: `oc_36e99ff82ec6bc822f7320b645bf556d`.
- Sheet URL: `https://qdreaming.feishu.cn/sheets/C7jXszp7OhnbgNt2xTucg4FMnyf`.
- Reminder text:

```text
1. 辛苦大家提前填写例会表：
[打开破茧每日例会表](https://qdreaming.feishu.cn/sheets/C7jXszp7OhnbgNt2xTucg4FMnyf)

2. 有事不能参加联系PM~
```

Never include or print the Feishu App Secret in replies, logs, commits, screenshots, or skill files.

## Choose the delivery mode

1. **Cloud / preferred:** GitHub Actions scheduled workflow. It runs independently of the user's computer.
2. **Local MCP:** Use only when the user specifically wants an MCP tool or accepts that the host must stay on and the MCP process must remain running.
3. Do not recommend Aily as the default solution when the user has already reported exhausted free usage or paid limits.

## Cloud workflow

The project used for this setup is `D:\work\work_feishu`, with remote repository `https://github.com/hmx-git/feishu-daily-reminder`.

Expected workflow file: `D:\work\work_feishu\.github\workflows\feishu-reminder.yml`.

It should:

- run on `schedule` with cron `15 2 * * *`;
- support `workflow_dispatch` for a manual test;
- use Node 20+ and `npm ci`;
- pass these repository secrets to `src/send-reminder.js`:
  - `FEISHU_APP_ID`
  - `FEISHU_APP_SECRET`
  - `FEISHU_CHAT_ID`

### Secret setup troubleshooting

Each secret must be created separately at:

`Repository → Settings → Secrets and variables → Actions → Secrets → New repository secret`

The **Name** field must contain only one exact name, and the **Secret** field must contain only its value. Never paste lines such as `FEISHU_APP_ID=...` into the Secret field, and never paste all three variables into one secret. Do not use Variables or an Environment secret unless the workflow declares that Environment.

If the run says `Missing GitHub Actions secret: FEISHU_APP_ID`, inspect the secret-name list first. The error means the workflow received an empty value, not that Feishu rejected the App ID.

After adding or correcting secrets, start a new `workflow_dispatch` run on `main`; do not rely only on the old failed run.

### Card message implementation

The cloud sender should:

1. Request a Feishu `tenant_access_token` using `FEISHU_APP_ID` and `FEISHU_APP_SECRET`.
2. Upload the image with `POST /open-apis/im/v1/images`, `image_type=message`, and obtain `image_key`.
3. Send one `interactive` message to the target chat using `POST /open-apis/im/v1/messages?receive_id_type=chat_id`.
4. Put the image at the top of the card, followed by the two reminder items and a primary “填写例会表” URL button.

Use a card body equivalent to:

```json
{
  "config": { "wide_screen_mode": true },
  "header": {
    "template": "blue",
    "title": { "tag": "plain_text", "content": "📅 例会提醒" }
  },
  "elements": [
    {
      "tag": "img",
      "img_key": "<uploaded image_key>",
      "mode": "fit_horizontal",
      "alt": { "tag": "plain_text", "content": "例会提醒图片" }
    },
    {
      "tag": "div",
      "text": { "tag": "lark_md", "content": "<reminder text>" }
    },
    {
      "tag": "action",
      "actions": [
        {
          "tag": "button",
          "type": "primary",
          "text": { "tag": "plain_text", "content": "填写例会表" },
          "url": "https://qdreaming.feishu.cn/sheets/C7jXszp7OhnbgNt2xTucg4FMnyf"
        }
      ]
    }
  ]
}
```

Send the card as `msg_type: "interactive"` and `content: JSON.stringify(card)`.

Required Feishu capabilities include sending group messages and image upload (`im:resource:upload` / `im:resource`, as applicable). The bot must be added to the target group. If image upload returns access denied, verify scopes, publish/update the Feishu app version, and confirm the app is authorized for the current tenant.

## Test and cutover

1. Run local syntax checks (`node --check`) without printing `.env`.
2. Commit and push the workflow/sender changes to GitHub.
3. Manually run `Feishu daily meeting reminder` from Actions.
4. Confirm the run is green and verify the Feishu group received one card containing the image, text, and button.
5. Only after cloud delivery succeeds, cancel the duplicate local MCP reminder with its reminder ID. Do not cancel the local fallback before cloud verification.
6. Explain that GitHub scheduled workflows can start a few minutes late and are not guaranteed to run at the exact second.

## Local MCP fallback

The local MCP server is in `D:\work\work_feishu\src\server.js`. It supports `send_feishu_message`, `find_feishu_group`, `schedule_daily_reminder`, `list_scheduled_reminders`, and `cancel_scheduled_reminder`.

A local timer requires:

- the MCP process to stay running;
- the computer and network to stay available;
- valid `.env` credentials;
- the Feishu app to remain in the group.

Use the local MCP only when those constraints are acceptable. The local version originally used a separate image and text message; use the cloud interactive-card sender when the user requests the polished card format.

## Security and cost guidance

- Keep `.env` and App Secrets out of Git.
- Never ask the user to paste an App Secret into chat.
- Treat GitHub Actions usage and Feishu app/API availability as separate concerns. A daily short GitHub Actions job normally consumes very little runner time; check the current GitHub billing policy if the user asks for a definitive current cost.
- A successful manual run proves the current secrets, permissions, image upload, and send path worked; it does not guarantee zero schedule delay or permanent service availability.
