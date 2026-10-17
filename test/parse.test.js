import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClashYaml, extractLinks } from '../src/parse.js';

const YAML = `port: 7890
proxies:
- auth: pw1
  name: hy
  server: 1.2.3.4
  port: 443
  sni: a.com
  skip-cert-verify: true
  type: hysteria2
- name: real
  type: vless
  server: r.com
  port: 443
  uuid: 11111111-2222-3333-4444-555555555555
  network: tcp
  tls: true
  servername: www.example.com
  flow: xtls-rprx-vision
  client-fingerprint: chrome
  alpn:
  - h2
  reality-opts:
    public-key: PUBKEY
    short-id: ab12
- {name: "w s", type: trojan, server: t.com, port: 443, password: "p@ss", network: ws, ws-opts: {path: /ws, headers: {Host: cdn.t.com}}}
proxy-groups:
- name: auto
  type: select
`;

test('Clash YAML: block entries not starting with name, reality, flow style with nesting', () => {
  const links = parseClashYaml(YAML);
  assert.equal(links.length, 3);
  const hy = links.find((l) => l.startsWith('hysteria2://'));
  assert.match(hy, /^hysteria2:\/\/pw1@1\.2\.3\.4:443\?sni=a\.com&insecure=1#hy$/);
  const v = new URL(links.find((l) => l.startsWith('vless://')).replace('vless://', 'http://'));
  assert.equal(v.searchParams.get('security'), 'reality');
  assert.equal(v.searchParams.get('pbk'), 'PUBKEY');
  assert.equal(v.searchParams.get('sid'), 'ab12');
  assert.equal(v.searchParams.get('sni'), 'www.example.com');
  assert.equal(v.searchParams.get('flow'), 'xtls-rprx-vision');
  const t = new URL(links.find((l) => l.startsWith('trojan://')).replace('trojan://', 'http://'));
  assert.equal(decodeURIComponent(t.username), 'p@ss');
  assert.equal(t.searchParams.get('path'), '/ws');
  assert.equal(t.searchParams.get('host'), 'cdn.t.com');
});

test('plain and Base64 lists', () => {
  const plain = 'trojan://a@b.com:443#x\nhy2://c@d.com:443\n';
  assert.equal(extractLinks(plain).length, 2);
  assert.equal(extractLinks(Buffer.from(plain).toString('base64')).length, 2);
});
