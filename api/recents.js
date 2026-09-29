import { createHmac } from 'node:crypto';
import { googleSession } from './auth.js';

const MAX_BYTES = 900_000;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const user = googleSession(req);
  if (!user) return res.status(401).json({ error: 'Google sign-in required' });
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN || !process.env.SESSION_SECRET) {
    return res.status(503).json({ error: 'Chat storage is not configured' });
  }
  if (!['GET', 'PUT'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  const account = createHmac('sha256', process.env.SESSION_SECRET)
    .update('walmo-cloud-recents:' + user.sub).digest('hex');
  const key = 'walmo:recents:v1:' + account;
  try {
    const redis = async command => {
      const result = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
        method: 'POST', headers: {
          Authorization: 'Bearer ' + process.env.UPSTASH_REDIS_REST_TOKEN,
          'Content-Type': 'application/json'
        }, body: JSON.stringify(command), signal: AbortSignal.timeout(8000)
      });
      if (!result.ok) throw new Error('Storage unavailable');
      const value = await result.json();
      if (value.error) throw new Error('Storage unavailable');
      return value.result;
    };
    if (req.method === 'GET') {
      const raw = await redis(['GET', key]);
      return res.status(200).json({ saved: raw ? JSON.parse(raw) : null });
    }
    let origin;
    try { origin = new URL(req.headers.origin).host; } catch { origin = ''; }
    if (!origin || origin !== req.headers.host) return res.status(403).json({ error: 'Invalid origin' });
    if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return res.status(415).json({ error: 'JSON required' });
    const data = req.body;
    if (!data || typeof data !== 'object' || !Array.isArray(data.chats) || !Array.isArray(data.trash)) {
      return res.status(400).json({ error: 'Invalid chats' });
    }
    const chats = data.chats.slice(0, 50).map(chat => ({
      id: String(chat.id || '').slice(0, 100), title: String(chat.title || '').slice(0, 120),
      pinned: chat.pinned === true, updatedAt: Number(chat.updatedAt) || 0,
      messages: Array.isArray(chat.messages) ? chat.messages.slice(0, 100).map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: String(msg.content || '').slice(0, 12000),
        timestamp: String(msg.timestamp || '').slice(0, 60)
      })) : []
    })).filter(chat => chat.id && chat.messages.length);
    const trash = data.trash.slice(0, 50).filter(item => item && item.chat && item.chat.id && Number.isFinite(Number(item.deletedAt)));
    const payload = JSON.stringify({ chats, trash, savedAt: Date.now() });
    if (Buffer.byteLength(payload) > MAX_BYTES) return res.status(413).json({ error: 'Too many chats to sync' });
    await redis(['SET', key, payload]);
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Recents storage error:', error);
    return res.status(503).json({ error: 'Chat storage temporarily unavailable' });
  }
}
