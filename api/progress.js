import { createHmac } from 'node:crypto';
import { MemWal } from '@mysten-incubation/memwal';
import { namespaceFor, send, withTimeout, createRateLimiter, sanitizeTopic } from './chat.js';

export const config = { maxDuration: 60 };

export function extractTopics(results) {
  // Recall is relevance-ranked. Sort real timestamps where available; never
  // manufacture dates. This is the newest of the retrieved records, not an archive.
  const entries = (Array.isArray(results) ? results : []).filter(x =>
    typeof x?.text === 'string' && x.text.startsWith('Web3 learning log'));
  entries.sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  const seen = new Set();
  const topics = [];
  for (const entry of entries) {
    const match = /^Web3 learning log: the user asked to learn about (.+)\.$/u.exec(entry.text);
    if (!match) continue;
    const topic = sanitizeTopic(match[1]);
    const key = topic.toLowerCase();
    if (topic && !seen.has(key)) { seen.add(key); topics.push(topic); }
  }
  return topics;
}

export function createProgressHandler({ env = process.env, createMemory = namespace => MemWal.create({
  key: env.MEMWAL_PRIVATE_KEY, accountId: env.MEMWAL_ACCOUNT_ID,
  serverUrl: 'https://relayer.memory.walrus.xyz', namespace
}) } = {}) {
  const rateLimit = createRateLimiter();
  return async function handler(req, res) {
    if (req.method !== 'GET') return send(res, 405, { success: false, error: 'Method not allowed' });
    if (req.headers.origin) {
      let host;
      try { host = new URL(req.headers.origin).host; } catch { host = null; }
      if (host !== req.headers.host) return send(res, 403, { success: false, error: 'Invalid origin' });
    }
    if (typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32)
      return send(res, 503, { success: false, error: 'SESSION_SECRET is required and must contain at least 32 characters' });
    if (!env.MEMWAL_PRIVATE_KEY || !env.MEMWAL_ACCOUNT_ID)
      return send(res, 503, { success: false, error: 'Backend credentials are not configured' });
    let cookie;
    try {
      const session = namespaceFor(req, env.SESSION_SECRET, env.NODE_ENV === 'production', env);
      cookie = session.cookie;
      const forwarded = env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : null;
      const ip = env.VERCEL === '1'
        ? (typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '') || 'unknown'
        : req.socket?.remoteAddress || 'unknown';
      const keys = [[`session:${session.namespace}`, 20]];
      if (ip !== 'unknown') keys.push([`ip:${createHmac('sha256', env.SESSION_SECRET).update(ip).digest('hex')}`, 60]);
      const retryAfter = rateLimit(keys);
      if (retryAfter) {
        res.setHeader('Retry-After', String(retryAfter));
        return send(res, 429, { success: false, error: 'Too many requests. Please try again shortly.' }, cookie);
      }
      const memory = createMemory(session.namespace);
      const recalled = await withTimeout(() => memory.recall({
        query: 'Web3 learning log', limit: 20, maxDistance: 0.9
      }), 5000, 'Progress recall');
      return send(res, 200, { success: true, topics: extractTopics(recalled?.results) }, cookie);
    } catch (error) {
      console.error('Progress failed:', error);
      return send(res, 502, { success: false, error: 'Learning progress temporarily unavailable' }, cookie);
    }
  };
}

export default createProgressHandler();
