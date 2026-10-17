// 从订阅内容里取出节点链接：纯文本 / Base64 里的 URI，或 Clash YAML 的 proxies。
// 只用正则，不用完整的 YAML 解析器：大文件解析太耗 Worker 的 CPU 时间。

export function extractLinks(text) {
  const links = new Set();
  const makeRe = () => /(?:vmess|vless|ssr?|trojan|hysteria2|hy2|tuic):\/\/[^\s'"<>]+/gi;
  const re1 = makeRe();
  let m;
  while ((m = re1.exec(text)) !== null) links.add(m[0]);
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || !/^[A-Za-z0-9+/]+={0,2}$/.test(t) || t.length % 4 !== 0) continue;
    try {
      const decoded = atob(t);
      const re2 = makeRe();
      let m2;
      while ((m2 = re2.exec(decoded)) !== null) links.add(m2[0]);
    } catch (_) {
    }
  }
  return Array.from(links);
}
function proxyToUri(raw) {
  const get = (key) => {
    const m = raw.match(new RegExp(
      `(?:^|[\\n,{])[\\s-]*${key}:\\s*['"]?([^,'"{}
]+?)['"]?(?=\\s*[,}\\n]|$)`,
      "i"
    ));
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : "";
  };
  const type = get("type");
  const name = get("name") || "node";
  const server = get("server");
  const port = get("port");
  if (!type || !server || !port) return null;
  try {
    if (type === "vmess") {
      const wsPath = raw.match(/\bpath:\s*['"]?([^\s,'"{}]+)/)?.[1] || "/";
      const wsHost = raw.match(/\bHost:\s*['"]?([^\s,'"{}]+)/)?.[1] || get("servername") || server;
      const cfg = {
        v: "2",
        ps: name,
        add: server,
        port: String(port),
        id: get("uuid"),
        aid: get("alterId") || "0",
        net: get("network") || "tcp",
        type: "none",
        host: wsHost,
        path: wsPath,
        tls: /\btls:\s*true\b/i.test(raw) ? "tls" : ""
      };
      return "vmess://" + btoa(unescape(encodeURIComponent(JSON.stringify(cfg))));
    }
    if (type === "ss") {
      const cred = btoa(unescape(encodeURIComponent(`${get("cipher")}:${get("password")}`)));
      return `ss://${cred}@${server}:${port}#${encodeURIComponent(name)}`;
    }
    // 传输与 TLS 参数：没有这些，ws / grpc / reality 节点转出来是连不上的
    const net = get("network") || "tcp";
    const q = new URLSearchParams();
    const set = (k, v) => { if (v) q.set(k, v); };
    q.set("type", net);
    set("sni", get("servername") || get("sni"));
    set("fp", get("client-fingerprint"));
    set("alpn", raw.match(/\balpn:\s*\[([^\]]*)\]/)?.[1].replace(/['"\s]/g, ""));
    if (net === "ws") {
      set("path", raw.match(/\bpath:\s*['"]?([^\s,'"{}]+)/)?.[1]);
      set("host", raw.match(/\bHost:\s*['"]?([^\s,'"{}]+)/)?.[1]);
    }
    if (net === "grpc") set("serviceName", get("grpc-service-name"));
    const insecure = /\bskip-cert-verify:\s*true\b/i.test(raw);
    if (type === "trojan") {
      if (insecure) q.set("allowInsecure", "1");
      return `trojan://${encodeURIComponent(get("password"))}@${server}:${port}?${q}#${encodeURIComponent(name)}`;
    }
    if (type === "vless") {
      const pbk = get("public-key");
      q.set("security", pbk ? "reality" : /\btls:\s*true\b/i.test(raw) ? "tls" : "none");
      set("pbk", pbk);
      set("sid", get("short-id"));
      set("flow", get("flow"));
      return `vless://${get("uuid")}@${server}:${port}?${q}#${encodeURIComponent(name)}`;
    }
    if (type === "hysteria2") {
      const h = new URLSearchParams();
      const hset = (k, v) => { if (v) h.set(k, v); };
      hset("sni", get("sni"));
      hset("obfs", get("obfs"));
      hset("obfs-password", get("obfs-password"));
      if (insecure) h.set("insecure", "1");
      const auth = get("password") || get("auth");
      return `hysteria2://${encodeURIComponent(auth)}@${server}:${port}?${h}#${encodeURIComponent(name)}`;
    }
  } catch (_) {
  }
  return null;
}
export function parseClashYaml(text) {
  const links = [];
  let body = text;
  const parts = text.split(/^(?=[a-zA-Z][\w-]*:\s*(?:\n|$))/m);
  for (const part of parts) {
    if (/^proxies:\s*\n/.test(part)) {
      body = part.replace(/^proxies:\s*\n/, "");
      break;
    }
  }
  // 行内写法 - { name: x, ws-opts: { path: /p } }：整行交给 proxyToUri
  const flowRe = /^\s*-\s*(\{.*\})\s*$/gm;
  let fm;
  while ((fm = flowRe.exec(body)) !== null) {
    const uri = proxyToUri(fm[1]);
    if (uri) links.push(uri);
  }
  // 块写法：条目以 "- 某键:" 开头（不一定是 name），且缩进与第一条相同，
  // 这样条目里嵌套的列表（如 alpn）不会被当成新条目
  const entryPositions = [];
  const entryRe = /^([ \t]*)-[ \t]+[\w-]+:(?![^\n]*\{)/gm;
  let em, indent = null;
  while ((em = entryRe.exec(body)) !== null) {
    indent ??= em[1];
    if (em[1] === indent) entryPositions.push(em.index);
  }
  for (let i = 0; i < entryPositions.length; i++) {
    const block = body.slice(entryPositions[i], entryPositions[i + 1] ?? body.length);
    const uri = proxyToUri(block);
    if (uri) links.push(uri);
  }
  return links;
}
