# 免费节点聚合（vpn.freedom8964.com）

一个 Cloudflare Worker：定时从公开的 GitHub 仓库和订阅地址采集免费代理节点，查重后按协议列出，并提供订阅地址。

网站：<https://vpn.freedom8964.com>

## 功能

- **自动采集**：每 3 小时一次（Cron `0 */3 * * *`），并发抓取 `src/worker.js` 里 `SOURCE_URLS` 列出的源。支持纯文本、Base64 和 Clash YAML 三种格式，协议有 vmess、vless（含 reality）、trojan、ss、ssr、hysteria2 和 tuic。
- **查重**（`src/dedupe.js`）：只要协议、服务器、端口、凭据和传输参数都相同，就算同一个节点。节点名、链接里参数的顺序、大小写和默认路径的写法都不影响判断。重复的只保留最先找到的一条，源在列表里越靠前，优先级越高。
- **采集报告**：页面底部列出每个源找到多少条、查重后新增多少条。
- **订阅地址**：
  - `/sub`：全部节点，Base64，可以直接填进 v2rayN 等客户端。
  - `/sub?proto=vless`：只要一种协议。
- **手动更新**：打开 `/refresh` 立即采集一次并返回报告。两次之间至少隔 10 分钟。

## 接口

| 路径 | 内容 |
|---|---|
| `/` | 节点列表页（每类先显示 200 条，滚动加载） |
| `/sub`、`/sub?proto=` | Base64 订阅 |
| `/api/all?proto=` | 纯文本，一行一条 |
| `/api/nodes?proto=&offset=&limit=` | JSON 分页 |
| `/refresh` | 手动采集 |

## 开发与部署

```sh
npm test            # 查重和解析的单元测试
npx wrangler dev    # 本地运行，访问 /refresh 采集一次
npx wrangler deploy # 部署（KV 命名空间、自定义域名、Cron 都在 wrangler.toml）
```

想加源，就把 raw 链接加进 `SOURCE_URLS`：重复的节点会被查重去掉，加重复的源只会多花一次抓取。

## 注意

这些都是陌生人搭的公开节点：对方能看到你访问了哪些网站，能截获没有加密的内容，节点也可能随时失效。只用 HTTPS 网站，不要拿来登录重要账号，也不要传敏感内容。本项目只做采集和整理，不运营任何节点。
