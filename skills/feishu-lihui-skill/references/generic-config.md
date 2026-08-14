# Generic Feishu reminder reference

Use placeholders rather than values from any one user's project:

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_CHAT_ID`
- `FEISHU_SHEET_URL`
- `FEISHU_MESSAGE`
- `FEISHU_IMAGE_URL` or `FEISHU_IMAGE_PATH`
- `FEISHU_TIMEZONE`
- `FEISHU_WORKDAYS_ONLY`
- `FEISHU_WINDOW_START`
- `FEISHU_WINDOW_END`
- `FEISHU_SKIP_IF_LOCAL_SENT`
- `FEISHU_LOCAL_STATE_URL`

The preferred deployment is a GitHub Actions scheduled workflow with a manual `workflow_dispatch` test. Keep secrets in GitHub Actions Secrets and never commit `.env` or real credentials.

For a daily schedule, convert the user's local time to UTC before writing the cron expression. For example, Asia/Shanghai 10:05 is `5 2 * * *`; Asia/Shanghai every Friday 17:00 is `0 9 * * 5`. GitHub schedules may start late by a few minutes, so enforce the Beijing-time window inside the sender and exit after the daily cutoff.

For local-first delivery, send locally first, write a dated success state, and let GitHub check that state before sending. Keep only one local schedule, and set an explicit `latest_send_time` when same-day retries must stop.