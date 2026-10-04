import { SuiGrpcClient } from '@mysten/sui/grpc';
import { WalrusClient } from '@mysten/walrus';

export const config = { maxDuration: 60 };
const client = new WalrusClient({ network: 'mainnet', suiClient: new SuiGrpcClient({ network: 'mainnet', baseUrl: 'https://fullnode.mainnet.sui.io:443' }), storageNodeClientOptions: { timeout: 12_000 } });
const limits = new Map();
export function certification(status, epoch) {
  if (status?.type === 'permanent' && status.isCertified === true && Number.isInteger(status.endEpoch) && status.endEpoch > epoch) return true;
  // Historical initialCertifiedEpoch alone does not prove a deletable copy still exists.
  return status?.type === 'deletable' && Number.isInteger(status.initialCertifiedEpoch) && status.deletableCounts?.count_deletable_certified > 0;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return res.status(403).json({ error: 'Invalid origin' }); }
    catch { return res.status(403).json({ error: 'Invalid origin' }); }
  }
  const now = Date.now();
  for (const [key, value] of limits) if (value.until < now) limits.delete(key);
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0];
  const limit = limits.get(ip) || { count: 0, until: now + 60_000 };
  if (++limit.count > 6 || limits.size > 1000) return res.status(429).json({ error: 'Please wait before checking again' });
  limits.set(ip, limit);
  if (Number(req.headers['content-length'] || 0) > 4096 || (typeof req.body === 'string' && req.body.length > 4096)) return res.status(413).json({ error: 'Request too large' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
  const ids = body?.blobIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 5 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(id) || Buffer.from(id, 'base64url').toString('base64url') !== id)) return res.status(400).json({ error: 'Provide up to five valid Blob IDs' });
  const unique = [...new Set(ids)];
  const deadline = AbortSignal.timeout(20_000);
  try {
    const epoch = await Promise.race([client.stakingState().then(state => state.epoch), new Promise((_, reject) => deadline.addEventListener('abort', () => reject(new Error('Timeout')), { once: true }))]);
    const results = await Promise.all(unique.map(async blobId => {
      try {
        const status = await Promise.race([client.getVerifiedBlobStatus({ blobId, signal: deadline }), new Promise((_, reject) => {
          if (deadline.aborted) return reject(new Error('Timeout'));
          deadline.addEventListener('abort', () => reject(new Error('Timeout')), { once: true });
        })]);
        return { blob_id: blobId, verified: certification(status, epoch), status: status.type, endEpoch: status.endEpoch ?? null, deletable: status.type === 'deletable', event: status.statusEvent ?? null };
      } catch { return { blob_id: blobId, verified: false, status: 'unverified' }; }
    }));
    return res.status(200).json({ network: 'mainnet', method: 'Walrus SDK verified storage-node quorum', checkedAt: new Date().toISOString(), results });
  } catch { return res.status(503).json({ error: 'Mainnet verification unavailable. Try again.' }); }
}
