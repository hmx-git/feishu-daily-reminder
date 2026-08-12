import fs from 'node:fs/promises';
import path from 'node:path';

const required = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_CHAT_ID'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing GitHub Actions secret: ${key}`);
}

const meetingSheetUrl = 'https://qdreaming.feishu.cn/sheets/C7jXszp7OhnbgNt2xTucg4FMnyf';
const defaultMessage = `1. 辛苦大家提前填写例会表：\n[打开破茧每日例会表](${meetingSheetUrl})\n\n2. 有事不能参加联系PM~`;

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok || body.code) {
    throw new Error(`Feishu API ${response.status}/${body.code ?? ''}: ${body.msg || text}`);
  }
  return body;
}

function buildReminderCard(imageKey, message = defaultMessage) {
  const text = message.replaceAll('\\n', '\n');
  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: '📅 例会提醒' }
    },
    elements: [
      {
        tag: 'img',
        img_key: imageKey,
        mode: 'fit_horizontal',
        alt: { tag: 'plain_text', content: '例会提醒图片' }
      },
      {
        tag: 'div',
        text: { tag: 'lark_md', content: text }
      },
      {
        tag: 'action',
        actions: [
          {
            tag: 'button',
            type: 'primary',
            text: { tag: 'plain_text', content: '填写例会表' },
            url: meetingSheetUrl
          }
        ]
      }
    ]
  };
}

const auth = await request('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    app_id: process.env.FEISHU_APP_ID,
    app_secret: process.env.FEISHU_APP_SECRET
  })
});
const token = auth.tenant_access_token;
const imagePath = path.resolve(process.env.FEISHU_IMAGE_PATH || 'assets/meeting-reminder.jpg');
const bytes = await fs.readFile(imagePath);
const form = new FormData();
form.append('image_type', 'message');
form.append('image', new Blob([bytes], { type: 'image/jpeg' }), path.basename(imagePath));
const uploaded = await request('https://open.feishu.cn/open-apis/im/v1/images', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: form
});
const imageKey = uploaded.data?.image_key;
if (!imageKey) throw new Error('Feishu did not return an image_key after upload.');

const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json'
};
const message = process.env.FEISHU_MESSAGE || defaultMessage;
const card = buildReminderCard(imageKey, message);
const sent = await request('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
  method: 'POST',
  headers,
  body: JSON.stringify({
    receive_id: process.env.FEISHU_CHAT_ID,
    msg_type: 'interactive',
    content: JSON.stringify(card)
  })
});
console.log(`Sent reminder card to chat ${process.env.FEISHU_CHAT_ID}; message_id=${sent.data?.message_id}`);
