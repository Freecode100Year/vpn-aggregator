var SOURCE_URLS = [
  // --- 纯文本 / Base64 格式 ---
  "https://raw.githubusercontent.com/freefq/free/master/v2",
  // --- Clash YAML 格式（自动识别解析）---
  // 高频更新（30 分钟 ~ 每小时）
  "https://raw.githubusercontent.com/PuddinCat/BestClash/refs/heads/main/proxies.yaml",
  "https://raw.githubusercontent.com/Au1rxx/free-vpn-subscriptions/main/output/clash.yaml",
  "https://raw.githubusercontent.com/dongchengjie/airport/refs/heads/main/subs/merged/tested_within.yaml",
  "https://raw.githubusercontent.com/anaer/Sub/main/clash.yaml",
  // 每日更新
  "https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list.yml",
  "https://raw.githubusercontent.com/chengaopan/AutoMergePublicNodes/master/list.yml",
  "https://raw.githubusercontent.com/mahdibland/ShadowsocksAggregator/master/Eternity.yml",
  // 稳定源
  "https://raw.githubusercontent.com/SnapdragonLee/SystemProxy/master/dist/clash_config.yaml",
  "https://raw.githubusercontent.com/SnapdragonLee/SystemProxy/master/dist/clash_config_extra.yaml",
  "https://raw.githubusercontent.com/Ruk1ng001/freeSub/main/clash.yaml",
  "https://raw.githubusercontent.com/mfuu/v2ray/master/clash.yaml",
  "https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/clash.yml",
  // --- 2026-08 新增（均已实测能解析出节点）---
  // 非 GitHub 源，节点量最大
  "https://clashnodefree.com/sub/clash.yml",
  // 每 3 小时自动检测
  "https://raw.githubusercontent.com/xiaoji235/airport-free/main/v2ray.txt",
  "https://raw.githubusercontent.com/xiaoji235/airport-free/main/clash/clashnodecc.txt",
  "https://raw.githubusercontent.com/xiaoji235/airport-free/main/clash/v2rayshare.txt",
  // 测速后的节点
  "https://raw.githubusercontent.com/zhangkaiitugithub/passcro/main/speednodes.yaml",
  // 同仓库的 v2ray-2.txt 是同一批节点的另一种格式，不重复添加
  "https://raw.githubusercontent.com/snakem982/proxypool/main/source/clash-meta-2.yaml",
  "https://raw.githubusercontent.com/itxve/fetch-clash-node/main/node/merge.yaml",
  "https://raw.githubusercontent.com/itxve/fetch-clash-node/main/node/NodeFree.yaml"
];
function datedSourceUrls(daysBack = 1) {
  const urls = [];
  const now = Date.now();
  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(now - i * 864e5);
    const stamp = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    urls.push(`https://raw.githubusercontent.com/free-nodes/clashfree/main/clash${stamp}.yml`);
  }
  return urls;
}
var PAGE_SIZE = 200;
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function extractLinks(text) {
  const links = new Set();
  const makeRe = () => /(?:vmess|vless|ss|ssr|trojan):\/\/[^\s'"<>]+/gi;
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
      `(?:^|[\\n,{])\\s*${key}:\\s*['"]?([^,'"{}
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
    if (type === "trojan") {
      return `trojan://${get("password")}@${server}:${port}#${encodeURIComponent(name)}`;
    }
    if (type === "vless") {
      const net = get("network") || "tcp";
      const sec = /\btls:\s*true\b/i.test(raw) ? "tls" : "none";
      return `vless://${get("uuid")}@${server}:${port}?type=${net}&security=${sec}#${encodeURIComponent(name)}`;
    }
  } catch (_) {
  }
  return null;
}
function parseClashYaml(text) {
  const links = [];
  let body = text;
  const parts = text.split(/^(?=[a-zA-Z][\w-]*:\s*(?:\n|$))/m);
  for (const part of parts) {
    if (/^proxies:\s*\n/.test(part)) {
      body = part.replace(/^proxies:\s*\n/, "");
      break;
    }
  }
  const flowRe = /^\s*-\s*\{([^}]+)\}/gm;
  let fm;
  while ((fm = flowRe.exec(body)) !== null) {
    const uri = proxyToUri(fm[1]);
    if (uri) links.push(uri);
  }
  const entryPositions = [];
  const entryRe = /^[ \t]*-[ \t]+name:/gm;
  let em;
  while ((em = entryRe.exec(body)) !== null) entryPositions.push(em.index);
  for (let i = 0; i < entryPositions.length; i++) {
    const block = body.slice(entryPositions[i], entryPositions[i + 1] ?? body.length);
    const uri = proxyToUri(block);
    if (uri) links.push(uri);
  }
  return links;
}
async function fetchAndParseSources() {
  const allLinks = new Set();
  const logs = [];
  for (const url of [...SOURCE_URLS, ...datedSourceUrls()]) {
    const shortUrl = url.replace("https://raw.githubusercontent.com/", "");
    try {
      const resp = await fetch(url, { cf: { cacheTtl: 0 } });
      if (!resp.ok) {
        logs.push(`\u274C HTTP ${resp.status}  ${shortUrl}`);
        continue;
      }
      const text = await resp.text();
      const isYaml = /\.ya?ml$/i.test(url) || /^proxies:/m.test(text);
      const links = isYaml ? parseClashYaml(text) : extractLinks(text);
      links.forEach((l) => allLinks.add(l));
      const fmt = isYaml ? "YAML" : "URI";
      logs.push(`\u2705 [${fmt}] ${links.length} \u6761  ${shortUrl}`);
    } catch (err) {
      logs.push(`\u{1F4A5} \u9519\u8BEF: ${err.message}  ${shortUrl}`);
    }
  }
  const categorized = { vmess: [], vless: [], ss: [], ssr: [], trojan: [] };
  for (const link of allLinks) {
    const proto = link.split("://")[0];
    if (proto in categorized) categorized[proto].push(link);
  }
  Object.keys(categorized).forEach((k) => categorized[k].sort());
  return { lastUpdated: (new Date()).toISOString(), data: categorized, logs };
}
async function scheduled(event, env, ctx) {
  try {
    const payload = await fetchAndParseSources();
    await env.PROXY_KV.put("lastUpdated", payload.lastUpdated);
    await env.PROXY_KV.put("data", JSON.stringify(payload.data));
    console.log("[CRON] \u8282\u70B9\u5DF2\u66F4\u65B0\u5E76\u5199\u5165 KV\u3002");
  } catch (e) {
    console.error("[CRON] \u66F4\u65B0\u5931\u8D25:", e);
  }
}
async function handleFetch(request, env, ctx) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  const url = new URL(request.url);
  if (url.pathname === "/refresh") {
    try {
      const payload = await fetchAndParseSources();
      await env.PROXY_KV.put("lastUpdated", payload.lastUpdated);
      await env.PROXY_KV.put("data", JSON.stringify(payload.data));
      const total = Object.values(payload.data).reduce((s, l) => s + l.length, 0);
      const report = payload.logs.join("\n") + `

\u5171\u6293\u53D6 ${total} \u4E2A\u8282\u70B9\uFF08\u53BB\u91CD\u540E\uFF09`;
      return new Response(report, {
        status: 200,
        headers: { "Content-Type": "text/plain;charset=UTF-8", "Cache-Control": "no-store" }
      });
    } catch (e) {
      return new Response(
        `\u274C \u66F4\u65B0\u5931\u8D25\uFF1A${e.message}`,
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
  const lastUpdated = await env.PROXY_KV.get("lastUpdated", { cacheTtl: 300 });
  const dataJson = await env.PROXY_KV.get("data", { cacheTtl: 300 });
  if (!lastUpdated || !dataJson) {
    return new Response(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>\u8282\u70B9\u805A\u5408 \u2013 \u9996\u6B21\u66F4\u65B0\u4E2D\u2026</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body class="bg-gray-50 flex min-h-screen items-center justify-center">
  <div class="text-center p-8 bg-white rounded-xl shadow">
    <h2 class="text-xl font-semibold mb-3">\u8282\u70B9\u5217\u8868\u6B63\u5728\u9996\u6B21\u66F4\u65B0\uFF0C\u8BF7\u7A0D\u540E\u5237\u65B0\u9875\u9762</h2>
    <p class="text-sm text-gray-500">\u5B9A\u65F6\u4EFB\u52A1\u6BCF\u5929\u5317\u4EAC\u65F6\u95F4 02:00 \u81EA\u52A8\u8FD0\u884C\u3002</p>
    <p class="text-sm text-gray-400 mt-2">\u5982\u9700\u7ACB\u5373\u83B7\u53D6\u6570\u636E\uFF0C\u8BF7\u524D\u5F80 Cloudflare Dashboard \u624B\u52A8\u89E6\u53D1\u4E00\u6B21\u5B9A\u65F6\u4EFB\u52A1\u3002</p>
  </div>
</body>
</html>`, { status: 200, headers: { "Content-Type": "text/html;charset=UTF-8" } });
  }
  let data;
  try {
    data = JSON.parse(dataJson);
  } catch (_) {
    data = {};
  }
  const listOf = (proto) => Array.isArray(data[proto]) ? data[proto] : [];
  const apiHeaders = (contentType) => ({
    "Content-Type": contentType,
    // 数据每天才更新一次，让边缘替我们扛住懒加载的请求量
    "Cache-Control": "public, max-age=300"
  });
  if (url.pathname === "/api/nodes") {
    const list = listOf(url.searchParams.get("proto") || "");
    const offset = Math.max(0, parseInt(url.searchParams.get("offset"), 10) || 0);
    const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit"), 10) || PAGE_SIZE));
    return new Response(
      JSON.stringify({ items: list.slice(offset, offset + limit), total: list.length }),
      { status: 200, headers: apiHeaders("application/json;charset=UTF-8") }
    );
  }
  if (url.pathname === "/api/all") {
    return new Response(
      listOf(url.searchParams.get("proto") || "").join("\n"),
      { status: 200, headers: apiHeaders("text/plain;charset=UTF-8") }
    );
  }
  const beijingTime = new Date(new Date(lastUpdated).getTime() + 8 * 3600 * 1e3);
  const formattedTime = beijingTime.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const totalCount = Object.values(data).reduce((s, l) => s + l.length, 0);
  const categories = Object.entries(data).filter(([, list]) => list.length > 0);
  const html = `<!doctype html>
<html lang="zh-CN" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>\u514D\u8D39\u8282\u70B9\u805A\u5408</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body class="bg-gray-50 min-h-screen flex flex-col">

  <!-- V2rayN \u4E0B\u8F7D\u63D0\u793A\u680F -->
  <div class="bg-blue-600 text-white text-sm py-2 px-4 text-center">
    \u{1F4E5} \u5BA2\u6237\u7AEF\u63A8\u8350\uFF1A
    <a href="https://github.com/2dust/v2rayN" target="_blank" rel="noopener"
       class="underline font-semibold hover:text-blue-200 transition">
      V2rayN \u5B98\u65B9\u4E0B\u8F7D\uFF08Windows\uFF09\u2192 github.com/2dust/v2rayN
    </a>
  </div>

  <header class="bg-white shadow sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
      <div>
        <h1 class="text-xl font-bold text-gray-800">\u514D\u8D39\u8282\u70B9\u805A\u5408</h1>
        <p class="text-sm text-gray-500">
          \u5171 <span class="font-semibold text-blue-600">${totalCount}</span> \u4E2A\u8282\u70B9
        </p>
      </div>
      <p class="text-xs text-gray-400">\u6700\u540E\u66F4\u65B0\uFF1A${formattedTime}\uFF08\u5317\u4EAC\u65F6\u95F4\uFF09</p>
    </div>
  </header>

  <main class="flex-1 max-w-5xl mx-auto px-4 py-6 w-full">
    <div class="space-y-8">
      ${categories.map(([proto, list]) => `
      <section>
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-base font-semibold text-gray-700 flex items-center gap-2">
            ${escapeHtml(proto.toUpperCase())}
            <span class="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">${list.length}</span>
          </h2>
          <button class="copy-all-btn text-xs px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-800 transition"
                  data-proto="${escapeHtml(proto)}">
            \u590D\u5236\u5168\u90E8
          </button>
        </div>
        <div class="space-y-2" data-list>
          ${list.slice(0, PAGE_SIZE).map((link) => `
          <div class="bg-white border border-gray-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <div class="flex-1 min-w-0 break-all text-xs font-mono text-gray-700">${escapeHtml(link)}</div>
            <button class="copy-btn shrink-0 text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition"
                    data-link="${escapeHtml(link)}">
              \u590D\u5236
            </button>
          </div>`).join("")}
        </div>
        ${list.length > PAGE_SIZE ? `
        <div data-sentinel data-proto="${escapeHtml(proto)}" data-loaded="${PAGE_SIZE}" data-total="${list.length}"
             class="mt-3 py-3 text-center text-xs text-gray-400">
          \u6EDA\u52A8\u52A0\u8F7D\u66F4\u591A\u2026\uFF08${PAGE_SIZE} / ${list.length}\uFF09
        </div>` : ""}
      </section>`).join("")}
    </div>
  </main>

  <footer class="mt-8 bg-white border-t px-4 py-3 text-center text-xs text-gray-400">
    \u6570\u636E\u6765\u6E90\u4E8E\u516C\u5F00 GitHub \u4ED3\u5E93 \xB7 \u4EC5\u4F9B\u5B66\u4E60\u7814\u7A76\uFF0C\u8BF7\u9075\u5B88\u5F53\u5730\u6CD5\u5F8B\u6CD5\u89C4
  </footer>

  <script>
    var PAGE_SIZE = ${PAGE_SIZE};

    function flash(el, msg, restore) {
      el.textContent = msg;
      setTimeout(function () { el.textContent = restore; }, 1500);
    }

    // \u7528\u4E8B\u4EF6\u59D4\u6258\uFF0C\u61D2\u52A0\u8F7D\u8FFD\u52A0\u8FDB\u6765\u7684\u5361\u7247\u65E0\u9700\u91CD\u65B0\u7ED1\u5B9A
    document.addEventListener('click', async function (e) {
      var one = e.target.closest('.copy-btn');
      if (one) {
        try {
          await navigator.clipboard.writeText(one.dataset.link);
          flash(one, '\u5DF2\u590D\u5236 \u2713', '\u590D\u5236');
        } catch (_) { flash(one, '\u5931\u8D25', '\u590D\u5236'); }
        return;
      }

      // \u6574\u7C7B\u590D\u5236\uFF1A\u6574\u4EFD\u5217\u8868\u4E0D\u518D\u5185\u8054\u8FDB\u9875\u9762\uFF0C\u6539\u4E3A\u6309\u9700\u62C9\u53D6
      var all = e.target.closest('.copy-all-btn');
      if (all) {
        all.textContent = '\u83B7\u53D6\u4E2D\u2026';
        try {
          var resp = await fetch('/api/all?proto=' + encodeURIComponent(all.dataset.proto));
          if (!resp.ok) throw new Error(resp.status);
          await navigator.clipboard.writeText(await resp.text());
          flash(all, '\u5DF2\u590D\u5236\u5168\u90E8 \u2713', '\u590D\u5236\u5168\u90E8');
        } catch (_) { flash(all, '\u5931\u8D25', '\u590D\u5236\u5168\u90E8'); }
      }
    });

    // \u7528 DOM API \u6784\u9020\u5361\u7247\uFF1A\u8282\u70B9\u5185\u5BB9\u8D70 textContent / dataset\uFF0C\u5929\u7136\u514D\u75AB\u6CE8\u5165
    function makeCard(link) {
      var card = document.createElement('div');
      card.className = 'bg-white border border-gray-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2';
      var text = document.createElement('div');
      text.className = 'flex-1 min-w-0 break-all text-xs font-mono text-gray-700';
      text.textContent = link;
      var btn = document.createElement('button');
      btn.className = 'copy-btn shrink-0 text-xs px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition';
      btn.dataset.link = link;
      btn.textContent = '\u590D\u5236';
      card.appendChild(text);
      card.appendChild(btn);
      return card;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(async function (entry) {
        if (!entry.isIntersecting) return;
        var sentinel = entry.target;
        if (sentinel.dataset.busy) return;    // \u540C\u4E00\u54E8\u5175\u53EF\u80FD\u8FDE\u7EED\u89E6\u53D1\uFF0C\u52A0\u9501\u53BB\u91CD
        sentinel.dataset.busy = '1';

        var proto  = sentinel.dataset.proto;
        var loaded = parseInt(sentinel.dataset.loaded, 10);
        var total  = parseInt(sentinel.dataset.total, 10);
        try {
          var resp = await fetch('/api/nodes?proto=' + encodeURIComponent(proto) +
                                 '&offset=' + loaded + '&limit=' + PAGE_SIZE);
          if (!resp.ok) throw new Error(resp.status);
          var payload = await resp.json();
          var items = payload.items || [];

          var frag = document.createDocumentFragment();
          items.forEach(function (l) { frag.appendChild(makeCard(l)); });
          sentinel.parentElement.querySelector('[data-list]').appendChild(frag);

          loaded += items.length;
          sentinel.dataset.loaded = String(loaded);
          if (!items.length || loaded >= total) {
            io.unobserve(sentinel);
            sentinel.remove();
          } else {
            sentinel.textContent = '\u6EDA\u52A8\u52A0\u8F7D\u66F4\u591A\u2026\uFF08' + loaded + ' / ' + total + '\uFF09';
            delete sentinel.dataset.busy;
          }
        } catch (_) {
          sentinel.textContent = '\u52A0\u8F7D\u5931\u8D25\uFF0C\u6EDA\u52A8\u91CD\u8BD5';
          delete sentinel.dataset.busy;
        }
      });
    }, { rootMargin: '400px' });   // \u63D0\u524D\u4E00\u5C4F\u5F00\u59CB\u52A0\u8F7D\uFF0C\u6EDA\u52A8\u65F6\u57FA\u672C\u65E0\u611F

    document.querySelectorAll('[data-sentinel]').forEach(function (el) { io.observe(el); });
  <\/script>

</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html;charset=UTF-8",
      "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline';"
    }
  });
}
export default { fetch: handleFetch, scheduled };
