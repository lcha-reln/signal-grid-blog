# EVD-0002：Project 01 框架本地与发布验收

- 证据 ID：`EVD-0002`
- 关联任务：`TASK-P0-001`
- 关联 Gate：`GATE-001`（只覆盖项目合同与站点框架的局部条件）
- 验收时间：2026-08-18T22:17:10+08:00
- 验收对象：Project 01 框架 release `afe7e6cafe8d716d9f6e12751d3b8beb33ab1fb9`
- Verdict：`pass`——本地结构、构建与浏览器验收，以及 GitHub Pages build/deploy 和生产 URL 烟测均通过

## 1. 权威构建门禁

在 `/Users/reln/signal-grid-blog` 执行：

```bash
npx --yes --offline -p node@24 -c '/Users/reln/.codex/skills/maintain-signal-grid-blog/scripts/verify_blog.sh full'
```

观察结果：

- Node `v24.19.0`，pnpm `10.30.3`；
- 项目记录校验：1 份记录、118 个定义、8 个任务、10 个 Gate；
- Astro：25 个文件，0 error、0 warning、0 hint；
- 静态构建：76 pages；
- Pagefind：65 pages、13,475 words；
- 新文章、新专题、RSS、search、sitemap 均生成；
- `pnpm build` 先执行同一个项目记录 linter，Pages 默认构建入口无法绕过记录门禁；
- full verifier 结论：`Full verification passed`。

上述 118 个定义是被验收 release `afe7e6cafe8d716d9f6e12751d3b8beb33ab1fb9` 的观察值。审计 follow-up 新增 `CHG-20260818-003` 后，Node 24 full verifier 再次通过：119 个定义、8 个任务、10 个 Gate，Astro 仍为 0 diagnostics，76 pages 与 65 个 Pagefind 页面均成功生成。该计数变化来自审计元数据，不改变被验收的站点运行行为。

## 2. 项目记录 linter 的变异验证

使用 Node 24 对 canonical 记录和临时变异副本执行校验。结果如下：

| 变异 | 预期 | 实际 |
| --- | --- | --- |
| canonical 记录 | pass | pass |
| `reconciliation_base_git_sha: none` | pass | pass |
| Assumption/Version/Requirement/Invariant/Risk/Profile 状态拼错 | fail closed | blocked |
| reconciliation SHA 非 40 位 hex/`none` | fail closed | blocked |
| accepted ADR 含空值或占位符 | fail closed | blocked |
| done task 引用错误或不证明该 task 的 EVD | fail closed | blocked |
| completed 项目仍有 doing/todo/blocked task | fail closed | blocked |
| 多记录重复 `project_id` | fail closed | blocked |
| qualified claim 使用未定义 profile、无 pass EVD、Gate 无证据或 ADR 仍 proposed | fail closed | blocked |
| 完整有效的 qualified fixture | pass | pass |
| `suspended` / `withdrawn` | pass，不误触 qualification | pass |

这组变异只证明记录结构门禁按预期工作，不证明撮合实现、HA、容量或生产资格。

## 3. 浏览器响应式与主题矩阵

使用本地静态产物和应用内真实浏览器检查文章、专题页与专题索引。

| 视口 | 主题 | 页面级横向溢出 | Mermaid | Project 导航 |
| ---: | --- | --- | --- | --- |
| 1440×1000 | dark | 无，`scrollWidth = clientWidth = 1440` | 4/4 SVG，0 error | 正确 |
| 621×900 | light | 无，`621 = 621` | 4/4 SVG，0 error | 正确 |
| 620×900 | dark | 无，`620 = 620` | 4/4 SVG，0 error | 正确 |
| 390×844 | light | 无，`390 = 390` | 4/4 SVG，0 error | 正确 |
| 390×844 | dark | 无，`390 = 390` | 4/4 SVG，0 error | 正确 |

额外交互证据：

- 390px 下 Mermaid `<dialog>` 宽 390px，关闭按钮右边界 378px，没有被裁切；
- 打开大图后 body 滚动锁生效；按 `Escape` 后 dialog 关闭、滚动锁解除、焦点返回原“查看大图”按钮；
- 专题页生成 `#stage-aeron-cluster-matching-engine`，显示 `01 CHAPTER`；
- 390px 直接打开 Project fragment 时，目标标题顶部为 302px、sticky header 底部为 61px，锚点没有被顶栏遮挡；
- 文章面包屑与侧栏均显示 Project，并使用带 `/signal-grid-blog/` base 的阶段回链；
- 390px 专题索引显示 6 个专题卡片且无页面级横向溢出；
- 浏览器 console 日志为空；测试后已恢复默认视口。

## 4. GitHub Pages 发布与生产 URL

- 发布 commit：`afe7e6cafe8d716d9f6e12751d3b8beb33ab1fb9`（`content: start production Aeron matching project`）；
- GitHub Pages：[run `32146500240`](https://github.com/lcha-reln/signal-grid-blog/actions/runs/32146500240)，build job 成功，deploy job 成功；
- 生产专题：<https://lcha-reln.github.io/signal-grid-blog/series/production/>；
- 生产文章：<https://lcha-reln.github.io/signal-grid-blog/posts/production-aeron-cluster-matching-engine-project/>。

线上干净浏览器烟测结果：

- 文章 H1、canonical、Open Graph、Project 面包屑和 GitHub 项目记录链接正确；
- 4/4 Mermaid 均渲染为 SVG，4 个大图按钮可用，浏览器 console 为空；
- 390px 下无页面级横向溢出，Project fragment 未被 sticky header 遮挡；
- Mermaid dialog 的滚动锁、`Escape` 关闭与焦点恢复正确；
- RSS、sitemap、Pagefind 搜索索引均包含新文章 permalink。

部署刚完成时曾观察到 HTML 与 Mermaid 模块的短暂 CDN 传播先后差异；模块随后返回 200，新开的干净浏览器会话通过上述 4/4 检查。最终 verdict 依据传播完成后的稳定结果。

## 5. 独立审校结论

技术合同、项目记录/linter 与站点集成分别独立复核。发布前发现的 Gateway 状态、跨 Gateway 幂等身份、Outbox GC、Snapshot 恢复 Oracle、显式 Project 归属和 qualification 绕过问题均已修复；当前剩余 P0/P1 为 0。

## 6. 证据边界与失效条件

本证据不证明任何撮合代码、Aeron Cluster 故障切换、TPS、p99/p99.9、RPO、RTO、掉电持久性或生产资格。它只证明 Project 01 的记录、公开框架和首篇文章在 release `afe7e6cafe8d716d9f6e12751d3b8beb33ab1fb9` 上的本地与线上行为，并闭合 `TASK-P0-001`。`GATE-001` 仍为 `partial`，`claim_status` 仍为 `not_proven`。

本审计 follow-up 回填被验收 release SHA、Pages run、生产 URL 及其直接派生的任务/章节/Resume 状态，并把首篇的进度句改成不随时间漂移的等义表述；这些变化不改变技术合同或站点运行行为，不会使该 release 的既有证据自失效。若文章或记录发生实质语义变化，或者 linter、站点配置、运行依赖、浏览器行为发生变化，则本证据必须重新验证或标记为 `stale`。
