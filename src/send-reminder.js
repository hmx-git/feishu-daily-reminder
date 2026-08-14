import fs from 'node:fs/promises';
import path from 'node:path';
import { isWorkingDay, loadHolidayDates } from './workday.js';

const required = ['FEISHU_APP_ID', 'FEISHU_APP_SECRET', 'FEISHU_CHAT_ID'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing GitHub Actions secret: ${key}`);
}

const defaultSheetUrl = 'https://qdreaming.feishu.cn/sheets/C7jXszp7OhnbgNt2xTucg4FMnyf';
const defaultMessage = `1. \u8f9b\u82e6\u5927\u5bb6\u63d0\u524d\u586b\u5199\u4f8b\u4f1a\u8868:\n[\u6253\u5f00\u4f8b\u4f1a\u8868](${defaultSheetUrl})\n\n2. \u6709\u4e8b\u4e0d\u80fd\u53c2\u52a0\u8054\u7cfbPM~`;
const meetingSheetUrl = process.env.FEISHU_SHEET_URL || defaultSheetUrl;
const defaultImagePath = process.env.FEISHU_IMAGE_PATH || 'assets/meeting-reminder.jpg';
const holidayFile = path.resolve(process.env.FEISHU_HOLIDAY_FILE || 'data/holiday-calendar.json');
const workdaysOnly = process.env.FEISHU_WORKDAYS_ONLY !== 'false';
const holidayDates = await loadHolidayDates(holidayFile);

function getTimeParts(timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(new Date()).reduce((parts, part) => {
    parts[part.type] = part.value;
    return parts;
  }, {});
}

function parseClock(value, fallback) {
  const clock = String(value || fallback);
  const match = clock.match(/^\d{2}:\d{2}$/);
  if (!match) throw new Error(`Invalid clock value: ${clock}`);
  const [hour, minute] = clock.split(':').map(Number);
  if (hour > 23 || minute > 59) throw new Error(`Invalid clock value: ${clock}`);
  return hour * 60 + minute;
}

function localDateString(timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).reduce((result, part) => { result[part.type] = part.value; return result; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

async function skipIfLocalAlreadySent() {
  if (process.env.FEISHU_SKIP_IF_LOCAL_SENT !== 'true') return false;
  const stateUrl = process.env.FEISHU_LOCAL_STATE_URL;
  if (!stateUrl) return false;
  try {
    const response = await fetch(`${stateUrl}${stateUrl.includes('?') ? '&' : '?'}t=${Date.now()}`, { headers: { 'Cache-Control': 'no-cache' } });
    if (!response.ok) return false;
    const state = await response.json();
    const today = localDateString(process.env.FEISHU_WINDOW_TIMEZONE || 'Asia/Shanghai');
    if (state.date === today && state.status === 'sent' && state.source === 'local-mcp') {
      console.log('Skipped cloud fallback: local MCP already sent today.');
      return true;
    }
  } catch {
    console.log('Could not read local-delivery state; cloud fallback will continue.');
  }
  return false;
}
function enforceWorkday() {
  if (!workdaysOnly) return;
  const timezone = process.env.FEISHU_WINDOW_TIMEZONE || 'Asia/Shanghai';
  const today = localDateString(timezone);
  if (!isWorkingDay(today, holidayDates)) {
    console.log(`Skipped reminder: ${today} is not a working day in ${timezone}`);
    process.exit(0);
  }
}
function enforceSendWindow() {
  if (process.env.FEISHU_ENFORCE_WINDOW !== 'true') return;
  const timezone = process.env.FEISHU_WINDOW_TIMEZONE || 'Asia/Shanghai';
  const parts = getTimeParts(timezone);
  const current = Number(parts.hour) * 60 + Number(parts.minute);
  const startText = process.env.FEISHU_WINDOW_START || '10:15';
  const endText = process.env.FEISHU_WINDOW_END || '10:25';
  const start = parseClock(startText, '10:15');
  const end = parseClock(endText, '10:25');
  if (current < start || current > end) {
    console.log(`Skipped scheduled reminder: local time ${parts.hour}:${parts.minute} ${timezone} is outside ${startText}-${endText}.`);
    process.exit(0);
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok || body.code) {
    throw new Error(`Feishu API ${response.status}/${body.code ?? ''}: ${body.msg || text}`);
  }
  return body;
}

async function downloadBinary(url, headers = {}) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    await response.arrayBuffer();
    throw new Error(`Image download failed with HTTP ${response.status}`);
  }
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get('content-type')?.split(';')[0] || 'image/jpeg'
  };
}

function extractFeishuFileToken(value) {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    const match = parsed.pathname.match(/\/file\/([^/]+)/);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

async function loadImage(token) {
  const configuredUrl = process.env.FEISHU_IMAGE_URL;
  const fileToken = process.env.FEISHU_IMAGE_FILE_TOKEN || extractFeishuFileToken(configuredUrl);
  if (fileToken) {
    const headers = { Authorization: `Bearer ${token}` };
    const encoded = encodeURIComponent(fileToken);
    const endpoints = [
      `https://open.feishu.cn/open-apis/drive/v1/files/${encoded}/download`,
      `https://open.feishu.cn/open-apis/drive/v1/medias/${encoded}/download`
    ];
    let lastError;
    for (const endpoint of endpoints) {
      try { return await downloadBinary(endpoint, headers); }
      catch (error) { lastError = error; }
    }
    throw new Error(`Unable to download Feishu image file; check file access permission and token (${lastError?.message || 'unknown error'})`);
  }
  if (configuredUrl) return downloadBinary(configuredUrl);
  return {
    bytes: new Uint8Array(await fs.readFile(path.resolve(defaultImagePath))),
    mimeType: process.env.FEISHU_IMAGE_MIME_TYPE || 'image/jpeg'
  };
}

function buildReminderCard(imageKey, message) {
  const text = message.replaceAll('\\n', '\n');
  const elements = [];
  if (imageKey) {
    elements.push({
      tag: 'img',
      img_key: imageKey,
      mode: 'fit_horizontal',
      alt: { tag: 'plain_text', content: '\u4f8b\u4f1a\u63d0\u9192\u56fe\u7247' }
    });
  }
  elements.push(
    { tag: 'div', text: { tag: 'lark_md', content: text } },
    {
      tag: 'action',
      actions: [{
        tag: 'button',
        type: 'primary',
        text: { tag: 'plain_text', content: process.env.FEISHU_BUTTON_TEXT || '\u586b\u5199\u4f8b\u4f1a\u8868' },
        url: meetingSheetUrl
      }]
    }
  );
  return {
    config: { wide_screen_mode: true },
    header: {
      template: process.env.FEISHU_CARD_TEMPLATE || 'blue',
      title: { tag: 'plain_text', content: process.env.FEISHU_CARD_TITLE || '\ud83d\udcc5 \u4f8b\u4f1a\u63d0\u9192' }
    },
    elements
  };
}

enforceWorkday();
enforceSendWindow();
if (await skipIfLocalAlreadySent()) process.exit(0);

const auth = await requestJson('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    app_id: process.env.FEISHU_APP_ID,
    app_secret: process.env.FEISHU_APP_SECRET
  })
});
const token = auth.tenant_access_token;

let imageKey;
if (process.env.FEISHU_SKIP_IMAGE !== 'true') {
  const image = await loadImage(token);
  const filename = process.env.FEISHU_IMAGE_FILENAME || 'reminder-image.jpg';
  const form = new FormData();
  form.append('image_type', 'message');
  form.append('image', new Blob([image.bytes], { type: image.mimeType }), filename);
  const uploaded = await requestJson('https://open.feishu.cn/open-apis/im/v1/images', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form
  });
  imageKey = uploaded.data?.image_key;
  if (!imageKey) throw new Error('Feishu did not return an image_key after upload.');
}

const message = process.env.FEISHU_MESSAGE || defaultMessage;
const card = buildReminderCard(imageKey, message);
const sent = await requestJson('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    receive_id: process.env.FEISHU_CHAT_ID,
    msg_type: 'interactive',
    content: JSON.stringify(card)
  })
});
console.log(`Sent reminder card; message_id=${sent.data?.message_id}`);
