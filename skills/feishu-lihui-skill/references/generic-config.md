# Generic Feishu reminder reference

Use placeholders rather than values from any one user's project:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CHAT_ID`
- `FEISHU_SHEET_URL`
- `FEISHU_MESSAGE`
- `FEISHU_IMAGE_PATH`
- `FEISHU_TIMEZONE`

The preferred deployment is a GitHub Actions scheduled workflow with a manual `workflow_dispatch` test. Keep secrets in GitHub Actions Secrets and never commit `.env` or real credentials.

For a daily schedule, convert the user's local time to UTC before writing the cron expression. GitHub schedules may start late by a few minutes.
