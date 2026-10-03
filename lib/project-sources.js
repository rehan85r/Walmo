import https from 'node:https';
import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';

export function publicAddress(address) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === 'unicast';
  } catch { return false; }
}
export function sourceUrl(value) {
  if (typeof value !== 'string' || value.length > 1500) throw new Error('Use a public HTTPS source URL.');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') ||
      !url.hostname.includes('.') || /\.(?:local|localhost|internal|test|invalid)$/i.test(url.hostname) ||
      url.hostname === 'localhost' || ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, '')) ||
      [...url.searchParams.keys()].some(k => /token|secret|signature|password|credential|api.?key/i.test(k)))
    throw new Error('Use a public HTTPS page without credentials or private access tokens.');
  url.hash = '';
  return url.href;
}
export function pageText(html, type) {
  if (/text\/plain/i.test(type)) return html.replace(/\s+/g, ' ').trim().slice(0, 40000);
  const $ = load(html, { xml: /xml|rss|atom/i.test(type) });
  $('script,style,noscript,svg,iframe,form,nav,footer,header').remove();
  const main = $('main,article').first();
  return (main.length ? main.text() : $.root().text()).replace(/\s+/g, ' ').trim().slice(0, 40000);
}
export const digest = text => createHash('sha256').update(text).digest('hex');

// Resolve and pin a public IP for every hop. Never fetch arbitrary URLs with an
// unvalidated second DNS resolution; redirects are checked again too.
export async function fetchSource(input, { resolve = lookup, request = https.request, timeout = 10000 } = {}) {
  const deadline = Date.now() + timeout;
  async function hop(value, redirects = 0) {
    const url = new URL(sourceUrl(value));
    const remaining = () => Math.max(1, deadline - Date.now());
    let dnsTimer;
    const addresses = await Promise.race([
      resolve(url.hostname, { all: true, verbatim: true }),
      new Promise((_, reject) => { dnsTimer = setTimeout(() => reject(new Error('Source DNS timed out')), remaining()); })
    ]).finally(() => clearTimeout(dnsTimer));
    if (!addresses.length || addresses.some(x => !publicAddress(x.address))) throw new Error('Source resolves to a non-public address');
    if (Date.now() >= deadline) throw new Error('Source timed out');
    const pinned = addresses[0];
    const result = await new Promise((resolveResult, reject) => {
      let timer;
      const req = request(url, { method: 'GET', headers: {
        'User-Agent': 'WalmoProjectTracker/1.0', Accept: 'text/html,application/rss+xml,application/atom+xml,application/xml,text/plain'
      }, lookup: (_host, options, callback) => options?.all
        ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family) }, res => {
        const status = res.statusCode || 0;
        if ([301,302,303,307,308].includes(status)) {
          res.resume();clearTimeout(timer);
          return resolveResult({ redirect: res.headers.location });
        }
        if (status < 200 || status >= 300) { res.resume();return req.destroy(new Error(`Source returned HTTP ${status}`)); }
        const type = String(res.headers['content-type'] || '');
        if (!/text\/html|text\/plain|application\/(?:rss\+xml|atom\+xml|xml|xhtml\+xml)|text\/xml/i.test(type)) {
          res.resume();return req.destroy(new Error('Source is not a readable HTML, text or feed page'));
        }
        let size = 0;const chunks = [];
        res.on('data', chunk => { size += chunk.length;if(size > 1000000)req.destroy(new Error('Source exceeds 1 MB'));else chunks.push(chunk); });
        res.on('error', reject);
        res.on('end', () => {clearTimeout(timer);resolveResult({ text: pageText(Buffer.concat(chunks).toString('utf8'), type) });});
      });
      timer = setTimeout(() => req.destroy(new Error('Source timed out')), remaining());
      req.on('error', error => {clearTimeout(timer);reject(error)});req.end();
    });
    if ('redirect' in result) {
      if (!result.redirect || redirects >= 3) throw new Error('Source redirect limit reached');
      return hop(new URL(result.redirect,url).href, redirects + 1);
    }
    if (result.text.length < 100 || /just a moment|enable javascript.*(?:continue|browser)|verify you are human|access denied/i.test(result.text.slice(0, 500)))
      throw new Error('Page is blocked, requires JavaScript, or has insufficient readable content');
    return { url: url.href, text: result.text, hash: digest(result.text) };
  }
  return hop(input);
}
