import fs from 'node:fs/promises';
import path from 'node:path';

const required = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_CHAT_ID'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing GitHub Actions secret: ${key}`);

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok || body.code) throw new Error(`Feishu API ${response.status}/${body.code ?? ''}: ${body.msg || text}`);
  return body;
}

const auth = await request('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET })
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

const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
await request('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
  method: 'POST', headers,
  body: JSON.stringify({ receive_id: process.env.FEISHU_CHAT_ID, msg_type: 'image', content: JSON.stringify({ image_key: imageKey }) })
});
const message = process.env.FEISHU_MESSAGE || `1. 辛苦大家提前填写例会表：\nhttps://qdreaming.feishu.cn/sheets/C7jXszp7OhnbgNt2xTucg4FMnyf\n\n2. 有事不能参加联系PM~`;
const sent = await request('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
  method: 'POST', headers,
  body: JSON.stringify({ receive_id: process.env.FEISHU_CHAT_ID, msg_type: 'text', content: JSON.stringify({ text: message }) })
});
console.log(`Sent image and reminder text to chat ${process.env.FEISHU_CHAT_ID}; message_id=${sent.data?.message_id}`);
