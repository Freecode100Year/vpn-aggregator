import test from 'node:test';
import assert from 'node:assert/strict';
import { nodeKey, addUnique, protocolOf } from '../src/dedupe.js';

const b64 = (s) => Buffer.from(s).toString('base64');
const vmess = (o) => 'vmess://' + b64(JSON.stringify(o));
const same = (a, b) => assert.equal(nodeKey(a), nodeKey(b));
const differ = (a, b) => assert.notEqual(nodeKey(a), nodeKey(b));

test('vmess: name, case, port type and default path do not matter', () => {
  same(vmess({ ps: 'A', add: '1.2.3.4', port: '443', id: 'ABC', net: 'ws', path: '/', tls: 'tls' }),
    vmess({ ps: 'B', add: '1.2.3.4', port: 443, id: 'abc', net: 'ws', path: '', tls: 'tls', type: 'none' }));
  differ(vmess({ add: '1.2.3.4', port: '443', id: 'abc', net: 'ws', path: '/a' }),
    vmess({ add: '1.2.3.4', port: '443', id: 'abc', net: 'ws', path: '/b' }));
});

test('vless and trojan: names and parameter order do not matter, transport does', () => {
  same('vless://u@Ex.com:443?type=ws&security=tls&path=%2Fx#A', 'vless://u@ex.com:443?security=tls&path=%2Fx&type=ws&sni=#B');
  differ('vless://u@ex.com:443?type=ws', 'vless://u@ex.com:443?type=grpc');
  differ('trojan://pw@h.com:443', 'trojan://pw@h.com:8443');
  same('trojan://pw@h.com:443#1', 'trojan://pw@h.com:443?#2');
});

test('ss: both link forms are the same node', () => {
  same(`ss://${b64('aes-256-gcm:pw')}@1.1.1.1:8388#x`, `ss://${b64('aes-256-gcm:pw@1.1.1.1:8388')}#y`);
  same(`ss://${b64('aes-256-gcm:pw')}@1.1.1.1:8388`, 'ss://aes-256-gcm:pw@1.1.1.1:8388');
  differ(`ss://${b64('aes-256-gcm:pw')}@1.1.1.1:8388`, `ss://${b64('aes-256-gcm:pw2')}@1.1.1.1:8388`);
});

test('ssr: remarks and group do not matter', () => {
  const ssr = (s) => 'ssr://' + Buffer.from(s).toString('base64url');
  const base = '1.2.3.4:443:origin:aes-256-cfb:plain:' + Buffer.from('pw').toString('base64url');
  same(ssr(base + '/?remarks=QQ&group=Rw'), ssr(base + '/?remarks=Qg'));
});

test('hy2 is hysteria2; unreadable links are skipped', () => {
  assert.equal(protocolOf('hy2://x@h:1'), 'hysteria2');
  same('hy2://pw@h.com:443?sni=a#1', 'hysteria2://pw@h.com:443?sni=a#2');
  assert.equal(nodeKey('vmess://not-base64!'), null);
});

test('addUnique keeps the first link of each node', () => {
  const seen = new Map();
  assert.equal(addUnique(seen, ['trojan://pw@h.com:443#first', 'trojan://pw@h.com:443#second', 'trojan://x@h.com:443']), 2);
  assert.equal(addUnique(seen, ['trojan://pw@h.com:443#third']), 0);
  assert.deepEqual([...seen.values()], ['trojan://pw@h.com:443#first', 'trojan://x@h.com:443']);
});
