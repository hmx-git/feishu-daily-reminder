import dotenv from 'dotenv';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(ROOT, '.env') });
const scheduleFile = path.resolve(process.env.FEISHU_SCHEDULE_FILE || path.join(ROOT, 'data', 'schedules.json'));
const timezone = process.env.FEISHU_TIMEZONE || 'Asia/Shanghai';
const defaultMessage = '1. 提醒大家填写例会表，链接如下：\\nhttps://qdreaming.feishu.cn/sheets/C7jXszp7OhnbgNt2xTucg4FMnyf\\n2. 有事不能参加联系PM~';
let schedules = [];
const timers = new Map();
let tokenCache = { value: '', expiresAt: 0 };
const githubRepo = process.env.GITHUB_REPO || 'hmx-git/feishu-daily-reminder';
const githubStatePath = process.env.GITHUB_STATE_PATH || 'data/local-delivery.json';
const githubBranch = process.env.GITHUB_BRANCH || 'main';

async function loadSchedules() {
  try {
    schedules = JSON.parse(await fs.readFile(scheduleFile, 'utf8'));
    if (!Array.isArray(schedules)) schedules = [];
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to load schedules:', error.message);
    schedules = [];
  }
}
async function saveSchedules() {
  await fs.mkdir(path.dirname(scheduleFile), { recursive: true });
  await fs.writeFile(scheduleFile, JSON.stringify(schedules, null, 2) + '\n', 'utf8');
}
function assertCredentials() {
  if (!process.env.FEISHU_APP_ID || !process.env.FEISHU_APP_SECRET) {
    throw new Error('请先配置 FEISHU_APP_ID 和 FEISHU_APP_SECRET。');
  }
}
async function feishuRequest(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!response.ok || body.code) throw new Error(`飞书 API ${response.status}/${body.code ?? ''}: ${body.msg || text}`);
  return body;
}
async function getTenantAccessToken() {
  assertCredentials();
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const body = await feishuRequest('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: process.env.FEISHU_APP_ID, app_secret: process.env.FEISHU_APP_SECRET })
  });
  tokenCache = { value: body.tenant_access_token, expiresAt: Date.now() + (body.expire || 7200) * 1000 };
  return tokenCache.value;
}
async function api(pathname, options = {}) {
  const token = await getTenantAccessToken();
  return feishuRequest(`https://open.feishu.cn/open-apis${pathname}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}
async function findGroup(chatName) {
  if (process.env.FEISHU_CHAT_ID && (!chatName || chatName === process.env.FEISHU_CHAT_NAME)) return { chat_id: process.env.FEISHU_CHAT_ID, name: chatName || process.env.FEISHU_CHAT_NAME };
  const wanted = chatName || process.env.FEISHU_CHAT_NAME;
  if (!wanted) throw new Error('请提供 chat_id 或 chat_name，或配置 FEISHU_CHAT_ID/FEISHU_CHAT_NAME。');
  let pageToken = '';
  do {
    const query = new URLSearchParams({ page_size: '100' });
    if (pageToken) query.set('page_token', pageToken);
    const body = await api(`/im/v1/chats?${query}`);
    const item = (body.data?.items || []).find((chat) => chat.name === wanted || chat.name?.includes(wanted));
    if (item) return { chat_id: item.chat_id, name: item.name, description: item.description };
    pageToken = body.data?.page_token || '';
  } while (pageToken);
  throw new Error(`找不到飞书群：${wanted}。请确认应用已加入该群，或直接配置 FEISHU_CHAT_ID。`);
}
async function sendMessage({ chatId, chatName, message }) {
  const target = chatId ? { chat_id: chatId, name: chatName } : await findGroup(chatName);
  const body = await api('/im/v1/messages?receive_id_type=chat_id', {
    method: 'POST', body: JSON.stringify({ receive_id: target.chat_id, msg_type: 'text', content: JSON.stringify({ text: message }) })
  });
  return { message_id: body.data?.message_id, chat_id: target.chat_id, chat_name: target.name };
}
function zonedWallTimeToDate(dateString, hour, minute) {
  const guess = new Date(`${dateString}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(guess).reduce((a, p) => (a[p.type] = p.value, a), {});
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  const wanted = Date.UTC(Number(dateString.slice(0, 4)), Number(dateString.slice(5, 7)) - 1, Number(dateString.slice(8, 10)), hour, minute, 0);
  return new Date(guess.getTime() + (wanted - shown));
}
function nextOccurrence(time) {
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) throw new Error('time 必须是 HH:mm 格式，例如 10:15。');
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now).reduce((a, p) => (a[p.type] = p.value, a), {});
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  let candidate = zonedWallTimeToDate(today, hour, minute);
  if (candidate <= now) candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  return candidate;
}
function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).reduce((result, part) => { result[part.type] = part.value; return result; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function githubContentsUrl() {
  const encoded = githubStatePath.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `https://api.github.com/repos/${githubRepo}/contents/${encoded}`;
}
function githubHeaders() {
  if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is not configured.');
  return { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'feishu-daily-reminder-local-mcp' };
}
async function githubGetStateFile() {
  const response = await fetch(`${githubContentsUrl()}?ref=${encodeURIComponent(githubBranch)}`, { headers: githubHeaders() });
  if (response.status === 404) return { sha: null };
  const body = await response.json();
  if (!response.ok || !body.content) throw new Error(`GitHub state read failed (HTTP ${response.status}).`);
  return { sha: body.sha || null };
}
async function markLocalDeliverySent() {
  const state = { date: localDateString(), status: 'sent', source: 'local-mcp' };
  const current = await githubGetStateFile();
  const payload = { message: `Record local Feishu delivery for ${state.date}`, content: Buffer.from(`${JSON.stringify(state, null, 2)}\n`, 'utf8').toString('base64'), branch: githubBranch };
  if (current.sha) payload.sha = current.sha;
  const response = await fetch(githubContentsUrl(), { method: 'PUT', headers: { ...githubHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!response.ok) throw new Error(`GitHub state sync failed (HTTP ${response.status}).`);
}
function armSchedule(schedule) {
  if (timers.has(schedule.id)) clearTimeout(timers.get(schedule.id));
  const delay = Math.max(0, nextOccurrence(schedule.time).getTime() - Date.now());
  const timer = setTimeout(async () => {
    try {
      await sendMessage({ chatId: schedule.chat_id, chatName: schedule.chat_name, message: schedule.message });
      schedule.last_sent_at = new Date().toISOString();
      if (schedule.cloud_fallback) {
        try { await markLocalDeliverySent(); schedule.last_delivery_state_at = new Date().toISOString(); }
        catch (error) { console.error('Local reminder sent, but GitHub state sync failed:', error.message); }
      }
      await saveSchedules();
    } catch (error) { console.error(`Schedule ${schedule.id} failed:`, error.message); }
    armSchedule(schedule);
  }, delay);
  timers.set(schedule.id, timer);
}
const server = new McpServer({ name: 'feishu-reminder', version: '1.0.0' });
server.registerTool('send_feishu_message', { description: '立即向飞书群发送文本消息。', inputSchema: { chat_id: z.string().optional(), chat_name: z.string().optional(), message: z.string().min(1) } }, async ({ chat_id, chat_name, message }) => {
  try { const result = await sendMessage({ chatId: chat_id, chatName: chat_name, message }); return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...result }, null, 2) }] }; }
  catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
server.registerTool('find_feishu_group', { description: '按群名称查找飞书群 chat_id。', inputSchema: { chat_name: z.string().min(1) } }, async ({ chat_name }) => {
  try { return { content: [{ type: 'text', text: JSON.stringify(await findGroup(chat_name), null, 2) }] }; }
  catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
server.registerTool('schedule_daily_reminder', { description: '创建每天固定时间发送到飞书群的提醒，可启用 GitHub 云端兜底。', inputSchema: { time: z.string().regex(/^\d{2}:\d{2}$/).default('10:15'), chat_id: z.string().optional(), chat_name: z.string().optional(), message: z.string().min(1).default(defaultMessage), cloud_fallback: z.boolean().default(false) } }, async ({ time, chat_id, chat_name, message, cloud_fallback }) => {
  try {
    if (cloud_fallback && !process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required when cloud_fallback is enabled.');
    const target = chat_id ? { chat_id, name: chat_name } : await findGroup(chat_name);
    const schedule = { id: crypto.randomUUID(), type: 'daily', time, timezone, chat_id: target.chat_id, chat_name: target.name || chat_name, message, cloud_fallback, created_at: new Date().toISOString(), last_sent_at: null };
    schedules.push(schedule); await saveSchedules(); armSchedule(schedule);
    return { content: [{ type: 'text', text: JSON.stringify({ ok: true, schedule }, null, 2) }] };
  } catch (error) { return { isError: true, content: [{ type: 'text', text: error.message }] }; }
});
server.registerTool('list_scheduled_reminders', { description: '查看已创建的每日飞书提醒。', inputSchema: {} }, async () => ({ content: [{ type: 'text', text: JSON.stringify(schedules, null, 2) }] }));
server.registerTool('cancel_scheduled_reminder', { description: '按提醒 ID 取消一个每日提醒。', inputSchema: { id: z.string().min(1) } }, async ({ id }) => {
  const index = schedules.findIndex((item) => item.id === id);
  if (index < 0) return { isError: true, content: [{ type: 'text', text: `找不到提醒 ID：${id}` }] };
  clearTimeout(timers.get(id)); timers.delete(id); const [removed] = schedules.splice(index, 1); await saveSchedules();
  return { content: [{ type: 'text', text: JSON.stringify({ ok: true, removed }, null, 2) }] };
});
await loadSchedules();
for (const schedule of schedules) if (schedule.type === 'daily') armSchedule(schedule);
await server.connect(new StdioServerTransport());
