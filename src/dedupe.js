// Finding the same node under different names. Lists copy each other, rename
// nodes ("🇺🇸 US-01", "github.com/xxx") and reorder link parameters, so two
// links are the same node when everything that decides the connection is the
// same: protocol, server, port, credentials and transport. The name after
// "#" (and vmess "ps", ssr "remarks"/"group") is ignored.

export const PROTOCOLS = ['vmess', 'vless', 'trojan', 'ss', 'ssr', 'hysteria2', 'tuic'];
const ALIASES = { hy2: 'hysteria2' };

export function protocolOf(link) {
  const p = link.slice(0, link.indexOf('://')).toLowerCase();
  return ALIASES[p] || p;
}

function b64(text) {
  let t = text.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const host = (h) => String(h ?? '').trim().toLowerCase().replace(/^\[|\]$/g, '');
const path = (p) => (!p || p === '/' ? '' : String(p));

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// Query parameters that change the connection, sorted, without empty ones.
function params(search) {
  const q = new URLSearchParams(search);
  const out = [];
  for (const [k, v] of q) {
    const key = k.toLowerCase();
    if (!v || key === 'remarks' || key === 'group') continue;
    out.push(`${key}=${key === 'path' ? path(v) : v}`);
  }
  return out.sort().join('&');
}

function vmessKey(body) {
  const c = JSON.parse(b64(body));
  return ['vmess', host(c.add), String(c.port), String(c.id).toLowerCase(), c.net || 'tcp',
    c.type && c.type !== 'none' ? c.type : '', host(c.host), path(c.path), c.tls || '', host(c.sni)].join('|');
}

// ss://BASE64(method:password)@host:port[?plugin] or ss://BASE64(method:password@host:port)
function ssKey(body) {
  const [main, query = ''] = body.split('?');
  let cred, server;
  const at = main.lastIndexOf('@');
  if (at >= 0) {
    const user = safeDecode(main.slice(0, at));
    cred = user.includes(':') ? user : b64(user);
    server = main.slice(at + 1);
  } else {
    const plain = b64(main);
    const i = plain.lastIndexOf('@');
    cred = plain.slice(0, i);
    server = plain.slice(i + 1);
  }
  const colon = server.lastIndexOf(':');
  return ['ss', host(server.slice(0, colon)), server.slice(colon + 1).replace(/\/$/, ''), cred, params(query)].join('|');
}

// ssr://BASE64(host:port:protocol:method:obfs:BASE64(password)/?params)
function ssrKey(body) {
  const plain = b64(body);
  const [main, query = ''] = plain.split('/?');
  const parts = main.split(':');
  const tail = parts.splice(-5); // port, protocol, method, obfs, password; the host may hold colons (IPv6)
  const server = parts.join(':');
  const q = new URLSearchParams(query);
  const keep = ['obfsparam', 'protoparam'].map((k) => `${k}=${q.get(k) ? safeDecode(q.get(k)) : ''}`);
  return ['ssr', host(server), ...tail, ...keep].join('|');
}

// vless, trojan, hysteria2, tuic: user@host:port?params
function urlKey(proto, body) {
  const u = new URL('http://' + body);
  return [proto, host(u.hostname), u.port || '443', safeDecode(u.username) + (u.password ? ':' + safeDecode(u.password) : ''),
    params(u.search)].join('|');
}

/** The identity of the node a link points to, or null for a link that cannot be read. */
export function nodeKey(link) {
  const proto = protocolOf(link);
  let body = link.slice(link.indexOf('://') + 3);
  const hash = body.indexOf('#');
  if (hash >= 0) body = body.slice(0, hash);
  try {
    if (proto === 'vmess') return vmessKey(body);
    if (proto === 'ss') return ssKey(body);
    if (proto === 'ssr') return ssrKey(body);
    if (PROTOCOLS.includes(proto)) return urlKey(proto, body);
  } catch {}
  return null;
}

/**
 * Adds links to a collection, skipping nodes it already has. Returns how
 * many were new. seen maps node keys to the first link found for them.
 */
export function addUnique(seen, links) {
  let added = 0;
  for (const link of links) {
    const key = nodeKey(link);
    if (!key || seen.has(key)) continue;
    seen.set(key, link);
    added++;
  }
  return added;
}
