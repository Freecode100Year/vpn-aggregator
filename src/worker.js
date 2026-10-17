import { PROTOCOLS, protocolOf, addUnique } from './dedupe.js';
import { extractLinks, parseClashYaml } from './parse.js';

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
  "https://raw.githubusercontent.com/SnapdragonLee/SystemProxy/master/dist/clash_config_extra.yaml",
  "https://raw.githubusercontent.com/Ruk1ng001/freeSub/main/clash.yaml",
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
  "https://raw.githubusercontent.com/itxve/fetch-clash-node/main/node/NodeFree.yaml",
  // --- 2026-10 新增（均已实测可下载）---
  // 三轮真实流量验证后的节点，每 15 分钟更新
  "https://raw.githubusercontent.com/0xRadikal/Free-v2ray-Configs/main/verified/configs_base64.txt",
  // 经典聚合，每日更新
  "https://raw.githubusercontent.com/awesome-vpn/awesome-vpn/master/all",
  // 每日更新
  "https://raw.githubusercontent.com/free18/v2ray/main/v.txt"
];
// 采集间隔：与 wrangler.toml 的 crons 保持一致
var EVERY_HOURS = 24;
// 手动 /refresh 至少间隔这么久，防止被人反复触发
var REFRESH_GAP_MS = 10 * 60 * 1000;
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
// 并发抓取所有源，按节点身份查重（见 dedupe.js）：同一节点换了名字、
// 参数顺序不同，也只保留最先找到的一条。源的顺序就是优先级。
async function fetchAndParseSources() {
  const urls = [...new Set([...SOURCE_URLS, ...datedSourceUrls()])];
  const results = await Promise.all(urls.map(async (url) => {
    try {
      const resp = await fetch(url, { cf: { cacheTtl: 0 } });
      if (!resp.ok) return { url, error: `HTTP ${resp.status}` };
      const text = await resp.text();
      const isYaml = /\.ya?ml$/i.test(url) || /^proxies:/m.test(text);
      return { url, fmt: isYaml ? "YAML" : "URI", links: isYaml ? parseClashYaml(text) : extractLinks(text) };
    } catch (err) {
      return { url, error: err.message };
    }
  }));
  const seen = new Map();
  const logs = [];
  const sources = [];
  let found = 0;
  for (const r of results) {
    const shortUrl = r.url.replace("https://raw.githubusercontent.com/", "");
    if (r.error) {
      logs.push(`\u274C ${r.error}  ${shortUrl}`);
      sources.push({ url: r.url, error: r.error });
      continue;
    }
    const added = addUnique(seen, r.links);
    found += r.links.length;
    logs.push(`\u2705 [${r.fmt}] ${r.links.length} 条，新增 ${added}  ${shortUrl}`);
    sources.push({ url: r.url, found: r.links.length, added });
  }
  const categorized = Object.fromEntries(PROTOCOLS.map((p) => [p, []]));
  for (const link of seen.values()) categorized[protocolOf(link)]?.push(link);
  Object.keys(categorized).forEach((k) => categorized[k].sort());
  const stats = { found, unique: seen.size, sources };
  return { lastUpdated: (new Date()).toISOString(), data: categorized, stats, logs };
}
async function save(env, payload) {
  await env.PROXY_KV.put("data", JSON.stringify(payload.data));
  await env.PROXY_KV.put("stats", JSON.stringify(payload.stats));
  await env.PROXY_KV.put("lastUpdated", payload.lastUpdated);
}
async function scheduled(event, env, ctx) {
  try {
    const payload = await fetchAndParseSources();
    await save(env, payload);
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
    const last = Date.parse(await env.PROXY_KV.get("lastUpdated") || "") || 0;
    if (Date.now() - last < REFRESH_GAP_MS) {
      const s = Math.ceil((last + REFRESH_GAP_MS - Date.now()) / 1000);
      return new Response(`刚更新过，${s} 秒后才能再次手动更新。`, {
        status: 429,
        headers: { "Content-Type": "text/plain;charset=UTF-8", "Cache-Control": "no-store", "Retry-After": String(s) }
      });
    }
    try {
      const payload = await fetchAndParseSources();
      await save(env, payload);
      const { found, unique } = payload.stats;
      const report = payload.logs.join("\n") + `

共采集 ${found} 条，查重去掉 ${found - unique} 条，剩 ${unique} 个节点`;
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
    <p class="text-sm text-gray-500">定时任务每 ${EVERY_HOURS} 小时自动运行一次。</p>
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
    // 数据几小时才更新一次，让边缘替我们扛住懒加载的请求量
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
  // 订阅地址：所有节点（或 ?proto= 一种）的 Base64，可直接填进 v2rayN 等客户端
  if (url.pathname === "/sub") {
    const proto = url.searchParams.get("proto");
    const links = proto ? listOf(proto) : Object.values(data).flat();
    const bytes = new TextEncoder().encode(links.join("\n"));
    let bin = "";
    for (let i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return new Response(btoa(bin), { status: 200, headers: apiHeaders("text/plain;charset=UTF-8") });
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
  let stats = null;
  try { stats = JSON.parse(await env.PROXY_KV.get("stats", { cacheTtl: 300 }) || "null"); } catch (_) {}
  const origin = "https://" + url.host;
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

  <!-- 作者的开源项目 -->
  <nav class="bg-gray-800 text-gray-300 text-xs py-2 px-4 flex flex-wrap justify-center gap-x-4 gap-y-1">
    <span class="text-gray-400">GitHub 开源项目：</span>
    <a href="https://github.com/Freecode100Year/vpn-aggregator" target="_blank" rel="noopener" class="underline hover:text-white">本站源码</a>
    <a href="https://github.com/Freecode100Year/private-talk" target="_blank" rel="noopener" class="underline hover:text-white">隐匿对话</a>
    <a href="https://github.com/Freecode100Year/UltraLightBrowser" target="_blank" rel="noopener" class="underline hover:text-white">UltraLightBrowser</a>
    <a href="https://github.com/Freecode100Year/WarpGameBoost" target="_blank" rel="noopener" class="underline hover:text-white">WarpGameBoost</a>
  </nav>

  <header class="bg-white shadow sticky top-0 z-10">
    <div class="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
      <div>
        <h1 class="text-xl font-bold text-gray-800">\u514D\u8D39\u8282\u70B9\u805A\u5408</h1>
        <p class="text-sm text-gray-500">
          \u5171 <span class="font-semibold text-blue-600">${totalCount}</span> \u4E2A\u8282\u70B9${stats ? `
          <span class="text-gray-400">（采集 ${stats.found} 条，查重去掉 ${stats.found - stats.unique} 条）</span>` : ""}
        </p>
      </div>
      <p class="text-xs text-gray-400">\u6700\u540E\u66F4\u65B0\uFF1A${formattedTime}\uFF08\u5317\u4EAC\u65F6\u95F4\uFF09</p>
    </div>
  </header>

  <main class="flex-1 max-w-5xl mx-auto px-4 py-6 w-full">
    <div class="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
      <p>⚠️ 这些都是陌生人搭的公开节点：对方能看到你访问了哪些网站，能截获没有加密的内容，也可能随时失效。只用 HTTPS 网站，不要拿来登录重要账号或传敏感内容。</p>
      <p>订阅地址（每 ${EVERY_HOURS} 小时自动更新、已查重）：<code class="select-all break-all">${escapeHtml(origin)}/sub</code>　单一协议在后面加 <code>?proto=vless</code> 等。</p>
    </div>
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

  ${stats ? `
  <section class="max-w-5xl mx-auto px-4 w-full">
    <details class="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
      <summary class="cursor-pointer font-semibold">采集源（${stats.sources.length} 个）· 每个源找到 / 查重后新增</summary>
      <ul class="mt-2 space-y-1 font-mono break-all">
        ${stats.sources.map((x) => `<li>${x.error ? `❌ ${escapeHtml(x.error)}` : `${x.found} / ${x.added}`}　<a class="text-blue-600 hover:underline" href="${escapeHtml(x.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(x.url.replace("https://raw.githubusercontent.com/", ""))}</a></li>`).join("")}
      </ul>
    </details>
  </section>` : ""}

  <footer class="mt-8 bg-white border-t px-4 py-3 text-center text-xs text-gray-400">
    \u6570\u636E\u6765\u6E90\u4E8E\u516C\u5F00 GitHub \u4ED3\u5E93 \xB7 \u4EC5\u4F9B\u5B66\u4E60\u7814\u7A76\uFF0C\u8BF7\u9075\u5B88\u5F53\u5730\u6CD5\u5F8B\u6CD5\u89C4 · <a class="underline" href="https://github.com/Freecode100Year/vpn-aggregator" target="_blank" rel="noopener">源代码</a>
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
