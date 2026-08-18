# EVD-0002：Project 01 框架本地验收

- 证据 ID：`EVD-0002`
- 关联任务：`TASK-P0-001`
- 关联 Gate：`GATE-001`（只覆盖项目合同与站点框架的局部条件）
- 验收时间：2026-08-18T22:06:45+08:00
- 验收对象：待提交的 Project 01 框架 release candidate；正式 commit SHA 与 Pages run 在发布后的审计 commit 中回填
- Verdict：`partial`——本地结构、构建与浏览器验收通过；GitHub Pages 部署和生产 URL 尚待验证

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

## 4. 独立审校结论

技术合同、项目记录/linter 与站点集成分别独立复核。发布前发现的 Gateway 状态、跨 Gateway 幂等身份、Outbox GC、Snapshot 恢复 Oracle、显式 Project 归属和 qualification 绕过问题均已修复；当前剩余 P0/P1 为 0。

## 5. 证据边界与失效条件

本证据不证明任何撮合代码、Aeron Cluster 故障切换、TPS、p99/p99.9、RPO、RTO、掉电持久性或生产资格。它只证明 Project 01 的记录、公开框架和首篇文章在本候选版本上的本地行为。

正式发布后，审计 follow-up 只回填被验收 release SHA、Pages run 与生产 URL，不会使该 release 的既有证据自失效。若文章语义、项目记录合同、linter、站点配置、运行依赖或浏览器行为发生变化，则本证据必须重新验证或标记为 `stale`。
