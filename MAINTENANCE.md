# Signal Grid 日常开发维护手册

这份文档用于维护新博客仓库 `signal-grid-blog`。旧博客 `lcha-reln.github.io` 与本项目相互独立，不要把两个仓库的分支或部署配置混用。

## 1. 项目固定信息

- 本地目录：`/Users/reln/signal-grid-blog`
- GitHub 仓库：<https://github.com/lcha-reln/signal-grid-blog>
- 主分支：`main`
- 生产地址：<https://lcha-reln.github.io/signal-grid-blog/>
- 内容后台：<https://app.pagescms.org>
- 技术栈：Astro、Pages CMS、GitHub Pages、Pagefind、Mermaid
- CI 运行时：Node 24、pnpm 10.30.3

本地也应使用 Node 24，开始工作前先核对：

```bash
cd /Users/reln/signal-grid-blog
node --version
pnpm --version
```

`pnpm --version` 应为 `10.30.3`。版本来源同时记录在 `package.json#packageManager` 和部署 workflow 中。

## 2. 每次开始工作的标准流程

```bash
cd /Users/reln/signal-grid-blog
git status --short --branch
git switch main
git pull --ff-only
pnpm install --frozen-lockfile
pnpm dev
```

浏览器打开：

```text
http://localhost:4321/signal-grid-blog/
```

注意：

- 如果 `git status` 显示有未提交修改，先提交到自己的分支或暂存，不要直接拉取远端。
- 使用 `--frozen-lockfile`，避免安装依赖时无意修改 `pnpm-lock.yaml`。
- 本项目是 GitHub Project Pages，开发地址和生产地址都带 `/signal-grid-blog/`，不是域名根路径。

## 3. 推荐的本地开发流程

不要在复杂改动期间长期占用 `main`，建议为每项工作创建分支：

```bash
git switch main
git pull --ff-only
git switch -c feature/short-description
pnpm dev
```

完成后运行：

```bash
pnpm check
pnpm build
git diff --check
git status --short
```

确认无误再提交：

```bash
git add <本次修改的文件>
git commit -m "feat: describe the change"
git push -u origin feature/short-description
```

然后在 GitHub 创建 PR，合并到 `main`。小型、明确且已经完整验证的维护改动也可以直接提交到 `main`，但推送前仍要运行完整构建。

常用提交前缀：

- `content:` 新增或更新文章
- `feat:` 新功能
- `fix:` 修复问题
- `style:` 纯视觉调整
- `docs:` 文档
- `chore:` 依赖、配置和例行维护

## 4. 用 Pages CMS 写文章

1. 打开 <https://app.pagescms.org>，登录 GitHub。
2. 确认仓库选择 `lcha-reln/signal-grid-blog`，分支选择 `main`。
3. 进入“文章”，创建或编辑内容。
4. 新文章先主动打开“草稿”开关；当前 CMS 默认值为 `false`，不要在半成品状态下误发布。
5. 完成后填写摘要和标签，选择“学习路径”并设置“路径排序”，再将 `draft` 改为 `false` 保存。

Pages CMS 保存后会直接创建 Git commit，并触发 GitHub Pages 部署。它不是一个独立数据库，正文始终保存在仓库的 `src/content/posts/` 中。

写作时要遵守：

- `permalink` 是文章公开地址，只允许小写英文、数字和连字符，例如 `disruptor-sequencing-basics`。
- `permalink` 必须全站唯一，发布后尽量不要修改。
- 修改已发布文章时补充 `updated`。
- 日期使用带时区的 ISO 格式，例如 `2026-08-12T16:00:00+08:00`。
- 草稿不会进入首页、文章列表、搜索、RSS 或 sitemap。
- 不要同时在 Pages CMS 和本地修改同一篇文章；CMS 保存后，本地继续工作前先 `git pull --ff-only`。

如果 `main` 将来开启强制 PR 保护，需要同时确认 Pages CMS GitHub App 有写入权限，否则 CMS 会保存失败。

## 5. 在本地写文章

文章放在 `src/content/posts/`。建议文件名使用 `YYYY-MM-DD-short-name.md`，但公开 URL 由 `permalink` 决定，不由文件名决定。

最小模板：

```yaml
---
title: 文章标题
description: 用于首页、搜索和分享卡片的摘要
date: 2026-08-12T16:00:00+08:00
updated: 2026-08-12T16:00:00+08:00
tags:
  - Disruptor
  - Java 并发
permalink: disruptor-sequencing-basics
series: performance
seriesOrder: 10
featured: false
draft: true
---

从这里开始写正文。
```

本地预览也会过滤草稿。如果必须检查最终主题效果，可以只在本地工作分支暂时设置 `draft: false`；未完成时不要合入 `main`。

### 图片

- 图片文件放在 `public/images/posts/`。
- Markdown 地址必须写成 `/signal-grid-blog/images/posts/<文件名>`。
- 推荐使用压缩过的 WebP；图片需写有意义的替代文字。

```markdown
![Disruptor 消费拓扑](/signal-grid-blog/images/posts/disruptor-topology.webp)
```

不要写 `/images/posts/...`，否则生产环境会绕过项目 base 路径并返回 404。

### 站内链接

```markdown
[阅读下一篇](/signal-grid-blog/posts/next-article/)
```

不要写 `/posts/...`。Astro 组件中的链接应调用 `sitePath()`，不要手工拼域名或根相对路径。

### Mermaid

使用标准 fenced code block：

````markdown
```mermaid
flowchart LR
  A[Producer] --> B[Cluster]
  B --> C[Archive]
```
````

Mermaid 只在实际存在图表的页面加载。语法问题不一定让 Astro 构建失败，因此发布前要在浏览器中检查图表，并分别看一次深色和浅色主题。移动端为保留节点文字可读性，图表会保持约 620px 的内部画布并允许横向滚动；文章页面本身不应出现横向溢出。

### 学习路径归类

`series` 与 `seriesOrder` 是正式学习路径的唯一依据。公开主线包括：

- `aeron`：Aeron 系统工程
- `trading`：交易系统
- `availability`：有状态系统可靠性
- `performance`：Java 低延迟工程
- `agent`：AI Agent 后端工程
- `meta`：站点指南，仅用于站点说明类内容

`seriesOrder` 只负责排序：数值越小越靠前，页面会自动显示连续的 Chapter 编号。使用 10、20、30 这样的间隔值，便于中途插入章节；同一路径内不要重复。

标签描述具体产品、组件与概念，例如 Media Driver、Replay、Raft、Kafka、ZooKeeper、Disruptor、STP；标签不决定专题归属。`categories` 仅为兼容早期 Markdown 保留，不在 Pages CMS 或前台导航中展示，新文章不要再填写。若增加新的顶层主线，需要同时修改站点配置、内容 schema、Pages CMS 选项和专题页面。

首页“推荐阅读顺序”由 `src/config.ts` 中的 `PRIMARY_SERIES_KEY` 指定。较长专题可在同一文件的专题配置中维护 `stages`，用 `fromOrder` 将文章分成若干阅读阶段；文章本身仍只填写 `series` 和 `seriesOrder`，不要在 frontmatter 重复阶段名称。

### 实战案例专区

`/signal-grid-blog/practice/` 是独立于文章归档和理论专题的项目制教学入口。它回答“如何从零交付一个经过验证的完整系统”，不应伪装成新的 `series` 或继续塞进 `posts`。

- 案例元数据维护在 `src/practice/config.ts`；每个案例通过自己的 `designDocument` 指向设计稿，不共享某一案例的硬编码路径。
- 已签约及之后的交付单元维护在 `src/practice/units.ts`。候选地图和 `LOCKED` Profile 不得进入注册表；案例的 `units` 只存单元代码，已发布数由注册表中的 `PUBLISHED` 生命周期推导，不手填第二份进度。
- 高可用 CEX 的范围、课程含义和治理维护在 `docs/HIGH_AVAILABILITY_CEX_PRACTICE_PLAN.md`；`src/practice/config.ts` 维护带 `planVersion` 的机器可读 Profile 路线、公开状态、当前 Profile 规划数量与里程碑。两者必须在同一次变更中同步。规划仓库数是独立项目决策，不从 track 或 Profile 数量推导。
- 只有范围、单元合同或课程语义变化才提高 `planVersion`；生命周期、仓库 URL、固定 tag 和 evidence 链接属于实施状态，不单独制造计划版本。
- Profile 是案例层的产品演进轴，不是 Matching、Counter、Rest 项目 track。Profile 配置只允许 `version / title / description / status / gate` 五个字段；新增字段必须先按计划治理评审。`LOCKED` Profile 只能记录能力增量和解锁门禁，不得携带单元、仓库、起点 tag 或当前实施状态；页面上的单元与仓库数量只描述当前 Profile。
- 已签订或启动的单元必须记录自己的 `contractPlanVersion`。若案例计划随后升版而当前单元合同语义未变，保留冻结合同版本，并用 `planCompatibility` 明确解释差异；不得移动 tag 或回写课程仓库来伪造版本一致。
- `PLANNED` 案例可以没有 `currentUnitCode`；`BUILDING` 必须对应唯一 `ACTIVE` track 和注册表中的实施单元，`VERIFIED` 的所有单元都必须已 `PUBLISHED`。单元引用的 `startRef` 和发布后的 `completeRef` 必须是不可移动的课程 tag。
- 每个案例最多一个单元占用活跃交付窗口（`IN_PROGRESS / CODE_VERIFIED / CONTENT_VERIFIED`），最多一个下一单元处于 `READY`；存在活跃单元时，它必须与 `currentUnitCode` 完全一致。只有当前单元 `PUBLISHED` 后，下一单元才能进入实施窗口。
- `scripts/verify-practice-plan.mjs` 按案例校验设计稿、案例配置、单元注册表、教程 frontmatter 和可选静态产物。它拒绝缺失或锁定单元、重复 `lessonOrder`/`permalink`、未达 `PUBLISHED` 却公开的教程和浮动源码 ref。它不读取、checkout 或联网访问课程代码仓库；跨仓 tag 的存在性只在发布前独立核验。
- 案例总入口为 `src/pages/practice/index.astro`。
- 项目驾驶舱由 `src/pages/practice/[project]/index.astro` 生成，已开始的单元页使用 `src/pages/practice/[project]/[unit]/index.astro`，已发布教程使用 `src/pages/practice/[project]/[unit]/[lesson].astro`。
- 当前只发布已经确认的案例和阶段地图，不为未来章节创建空 Markdown、空模块或虚假完成度。
- 实战教程使用独立 `practiceLessons` collection，Markdown 位于 `src/content/practice/<project>/<unit>/`。Frontmatter 使用 `project / profileVersion / unitCode / lessonOrder / permalink / draft`，不重复单元合同。
- 教程一律以 `draft: true` 开始。只有单元达到 `PUBLISHED` 后才能改为非草稿；草稿不生成生产路由，不进入搜索、sitemap、博客文章统计或主 RSS。`CONTENT_VERIFIED` 冻结该单元预期的 `lessonOrder / permalink` 集合；`PUBLISHED` 必须一次公开完整集合，不允许只翻转其中一篇。`CODE_VERIFIED` 同时冻结 complete tag、完整 40 位提交 SHA、仓库内 evidence 路径和发布证据合同；当前 M00 的生产 evidence 必须托管在 Signal Grid 的固定静态路径，verifier 会复核 CI manifest SHA-256、来源、精确 claim/限制和全部 artifact SHA-256。发布教程必须引用固定 complete tag 和可复核 evidence，不引用 `main`、`unit/*` 等浮动分支。

互动采用本地优先的混合模式：

- 网页负责讲解、预测题、确定性模拟、事件回放和本地证据展示。
- Java 编译、Aeron Cluster、Docker、性能测试和故障注入由读者在独立代码仓库本地运行。
- 站点不上传学习者源码，不连接远程 Judge，也不使用网页动画冒充真实工程验收。

实战页面、实验资源和 Worker URL 同样必须遵守 `/signal-grid-blog/` base；组件链接使用 `sitePath()`，按需加载的资源使用 `import.meta.env.BASE_URL` 或 `new URL(..., import.meta.url)`。

## 6. 构建、预览与验收

快速检查：

```bash
pnpm verify:practice
pnpm check
```

完整生产构建：

```bash
pnpm build
```

`pnpm build` 会依次执行：

1. `astro check`
2. 实战设计稿、案例配置、单元注册表与教程发布门禁
3. `astro build`
4. 实战静态产物链接与状态检查
5. `pagefind --site dist`

不要只运行 `astro build`，否则全文搜索索引不会刷新。

检查最终静态产物：

```bash
pnpm preview
```

至少检查：

- 首页桌面版和手机宽度
- 新文章详情页及 `EDIT ON GITHUB` 链接
- 明暗主题
- 图片、代码块、表格和 Mermaid
- 搜索结果能否进入 `/signal-grid-blog/posts/.../`
- 实战单元驾驶舱路由可访问，草稿教程路由为 404，且不出现在搜索、sitemap 或 RSS
- RSS 与 sitemap

关键产物应存在：

```text
dist/index.html
dist/posts/<permalink>/index.html
dist/rss.xml
dist/sitemap-index.xml
dist/pagefind/pagefind.js
```

`dist/`、`.astro/` 和 `node_modules/` 都不应提交。

## 7. 发布与部署

任何进入 `main` 的 commit 都会触发 `.github/workflows/deploy.yml`，包括：

- 本地直接 push
- PR 合并
- Pages CMS 保存

查看部署：

```bash
gh run list --workflow deploy.yml --limit 5
gh run watch <RUN_ID>
```

手动重新触发当前 `main`：

```bash
gh workflow run deploy.yml --ref main
```

部署成功后检查：

- <https://lcha-reln.github.io/signal-grid-blog/>
- <https://lcha-reln.github.io/signal-grid-blog/rss.xml>
- <https://lcha-reln.github.io/signal-grid-blog/sitemap-index.xml>
- 本次新增或修改的文章 URL

短时间连续 push 时，旧的部署任务可能被最新任务取消。这是 workflow 的 `cancel-in-progress: true` 在工作，以最新 `main` 的 run 为准。

仓库 Settings → Pages → Source 必须保持为 **GitHub Actions**。

## 8. 依赖升级

Dependabot PR 不要看到绿色按钮就直接合并。每个 PR 单独验证：

```bash
gh pr checkout <PR_NUMBER>
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm preview
```

重点回归：Markdown 渲染、搜索、Mermaid、明暗主题和带 base 的链接。

查看过期依赖：

```bash
pnpm outdated
```

小范围升级：

```bash
pnpm up <package>
pnpm build
```

Astro 主版本或 TypeScript 主版本升级必须单独开分支，先看迁移说明。不要一次执行 `pnpm up --latest` 升级全部依赖。升级后应同时提交 `package.json` 和 `pnpm-lock.yaml`。

如果升级 Node 或 pnpm，还要同步检查：

- `package.json#packageManager`
- `.github/workflows/deploy.yml`
- 本文档记录的版本

## 9. 安全回滚

如果构建失败，GitHub Pages 不会覆盖上一版成功部署，修复失败提交即可。

偶发 runner 或网络故障可以先重跑：

```bash
gh run rerun <RUN_ID> --failed
gh run watch <RUN_ID>
```

如果错误版本已经成功上线，在 `main` 创建一个 revert commit：

```bash
git switch main
git pull --ff-only
git log --oneline -10
git revert <BAD_COMMIT_SHA>
pnpm install --frozen-lockfile
pnpm build
git push origin main
```

坏改动是 merge commit 时：

```bash
git revert -m 1 <BAD_MERGE_SHA>
```

发生冲突时，解决后执行 `git revert --continue`，再构建和推送。

不要对共享的 `main` 使用 `git reset --hard` 加 force push。Pages CMS 误删文章或图片也应 revert 对应 Git commit，这样文件和历史都能恢复。

## 10. `/signal-grid-blog/` 路径不变量

当前站点是 GitHub Project Pages。以下配置必须保持一致：

- `astro.config.mjs`：`base: "/signal-grid-blog"`
- `src/config.ts`：生产 URL 包含 `/signal-grid-blog/`
- Astro 组件：使用 `sitePath()` 或 `import.meta.env.BASE_URL`
- `.pages.yml`：图片输出为 `/signal-grid-blog/images/posts`
- Markdown 图片和站内链接：显式带 `/signal-grid-blog/`
- `public/robots.txt`：sitemap URL 包含 `/signal-grid-blog/`

新增页面或组件后可以扫描可疑的根相对路径：

```bash
rg -n 'href="/|src="/|fetch\("/|\]\(/' src public
rg -n 'signal-grid-blog|lcha-reln.github.io' astro.config.mjs src public .pages.yml README.md MAINTENANCE.md
```

如果将来绑定自定义域名，需要成组修改 Astro `site/base`、`SITE.url`、Pages CMS 图片输出、robots、Markdown 中的硬编码内链，并重新执行完整构建。只改其中一处会产生双重 base 或 404。

## 11. 常见故障

### Pages CMS 看不到仓库或文章配置

- 检查 Pages CMS GitHub App 是否有 `signal-grid-blog` 的访问权限。
- 确认选中的是 `main`。
- 确认仓库根目录存在 `.pages.yml`。

### 新文章没有上线

- 检查 `draft` 是否仍为 `true`。
- 查看最新 GitHub Actions run。
- 核对 `permalink` 是否唯一且只含小写英文、数字、连字符。

### 图片 404

- 核对文件是否在 `public/images/posts/`。
- 核对正文 URL 是否以 `/signal-grid-blog/images/posts/` 开头。
- 注意文件名大小写；GitHub Pages 区分大小写。

### 页面或静态资源 404

通常是新代码写了不带 base 的 `/...` 根路径。使用第 10 节的 `rg` 命令扫描。

### 搜索不可用

- 确认运行了完整的 `pnpm build`。
- 确认 `dist/pagefind/pagefind.js` 存在。
- 开发服务器中的搜索体验不等于最终 Pagefind 索引，以 `pnpm preview` 为准。

### Mermaid 空白或报错

- 检查 fenced code block 的语言是否为 `mermaid`。
- 打开浏览器控制台查看语法错误。
- 在生产预览中复现，并检查深色与浅色主题。

### 本地通过、CI 失败

- 先确认本地是否使用 Node 24 和 pnpm 10.30.3。
- 使用 `pnpm install --frozen-lockfile` 后重新构建。
- 不要提交由其他 pnpm 大版本生成的锁文件。

### Actions 构建通过但部署失败

- 先重跑失败 job。
- 检查 Settings → Pages → Source 是否为 GitHub Actions。
- 检查 workflow permissions 与 `github-pages` environment。

## 12. 关键文件索引

```text
.pages.yml                         Pages CMS 表单与媒体配置
.github/workflows/deploy.yml       GitHub Pages 部署
astro.config.mjs                   Astro site/base、Markdown、sitemap
src/config.ts                      站点信息、base 路径工具、专题配置
src/content.config.ts              文章 frontmatter schema
src/content/posts/                 Markdown 文章
docs/HIGH_AVAILABILITY_CEX_PRACTICE_PLAN.md  高可用 CEX 实战课程设计单一事实源
src/lib/content.ts                 URL、排序、摘要、专题归类
src/components/SignalHero.astro    首页信号拓扑
src/components/PracticeCaseCard.astro  实战案例卡片
src/practice/config.ts             实战案例与阶段元数据
src/pages/practice/                实战门户与项目驾驶舱
scripts/verify-practice-plan.mjs   实战设计、配置与静态产物一致性门禁
src/styles/global.css              全站与首页主题样式
src/styles/practice.css            实战页面与响应式样式
src/styles/prose.css               文章正文样式
public/images/posts/               文章图片
```

维护时优先保持三件事：内容仍是可迁移的 Markdown、生产 URL 不丢 base、`main` 始终可以完整构建。
