import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE = 'walmo_google_session';
const MAX_AGE = 30 * 24 * 60 * 60;

function value(req, name) {
  return (req.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith(name + '='))?.slice(name.length + 1) || '';
}

function signature(payload, secret) {
  return createHmac('sha256', secret).update('google-session:' + payload).digest('hex');
}

function storageId(sub, secret) {
  return createHmac('sha256', secret).update('walmo-ui-storage:' + sub).digest('hex').slice(0, 32);
}

export function googleSession(req, env = process.env) {
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) return null;
  const raw = value(req, COOKIE);
  const [payload, sig] = raw.split('.');
  if (!/^[A-Za-z0-9_-]{20,1000}$/.test(payload || '') || !/^[a-f0-9]{64}$/.test(sig || '')) return null;
  const expected = signature(payload, env.SESSION_SECRET);
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!/^[0-9]{10,40}$/.test(data.sub) || !Number.isSafeInteger(data.exp) || data.exp <= Date.now()) return null;
    return { sub: data.sub, email: typeof data.email === 'string' ? data.email : '' };
  } catch { return null; }
}

function response(res, status, data, cookie) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  if (cookie) res.setHeader('Set-Cookie', cookie);
  return res.json(data);
}

export default async function handler(req, res) {
  const env = process.env;
  if (!env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
    return response(res, 503, { success: false, error: 'Google sign-in is not configured' });
  }
  if (req.method === 'GET') {
    const session = googleSession(req);
    return response(res, 200, { success: true, clientId: env.GOOGLE_CLIENT_ID, signedIn: !!session, email: session?.email || '', storageId: session ? storageId(session.sub, env.SESSION_SECRET) : null });
  }
  if (req.method !== 'POST') return response(res, 405, { success: false, error: 'Method not allowed' });
  let origin;
  try { origin = new URL(req.headers.origin).host; } catch { origin = ''; }
  if (!origin || origin !== req.headers.host) return response(res, 403, { success: false, error: 'Invalid origin' });
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) return response(res, 415, { success: false, error: 'JSON required' });
  if (Number(req.headers['content-length'] || 0) > 20000) return response(res, 413, { success: false, error: 'Request too large' });
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return response(res, 400, { success: false, error: 'Invalid request' });
  const suffix = `; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${MAX_AGE}`;
  const clearAnonymous = 'walmo_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
  const clearLanguage = 'walmo_language=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0';
  if (body.action === 'logout') {
    return response(res, 200, { success: true, signedIn: false }, [
      `${COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`, clearAnonymous, clearLanguage
    ]);
  }
  if (body.action !== 'login' || typeof body.credential !== 'string' || body.credential.length > 10000) {
    return response(res, 400, { success: false, error: 'Invalid credential' });
  }
  try {
    const { OAuth2Client } = await import('google-auth-library');
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: body.credential, audience: env.GOOGLE_CLIENT_ID });
    const token = ticket.getPayload();
    if (!/^[0-9]{10,40}$/.test(token?.sub || '')) throw new Error('Invalid Google subject');
    const email = token.email_verified && typeof token.email === 'string' && token.email.length <= 254 ? token.email : '';
    const payload = Buffer.from(JSON.stringify({ sub: token.sub, email, exp: Date.now() + MAX_AGE * 1000 })).toString('base64url');
    return response(res, 200, { success: true, signedIn: true, storageId: storageId(token.sub, env.SESSION_SECRET) }, [
      `${COOKIE}=${payload}.${signature(payload, env.SESSION_SECRET)}${suffix}`, clearAnonymous, clearLanguage
    ]);
  } catch (error) {
    console.error('Google token verification failed:', error);
    return response(res, 401, { success: false, error: 'Google sign-in could not be verified' });
  }
}


