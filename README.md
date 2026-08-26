# RE/LN · Signal Grid

基于 Astro、Pages CMS 与 GitHub Pages 的静态技术博客。主题名为 **Signal Grid / 信号矩阵**：用实时消息与集群拓扑的视觉语言组织技术内容，同时保持长篇中文阅读体验。

## 本地开发

```bash
pnpm install
pnpm dev
```

完整校验与生产构建：

```bash
pnpm check
pnpm build
pnpm preview
```

## 内容编辑

新博客的文章保存在 `src/content/posts/`，与旧博客仓库完全分离。

- 在线编辑：打开 [Pages CMS](https://app.pagescms.org)，授权 GitHub 后选择 `signal-grid-blog` 仓库与 `main` 分支。
- 本地编辑：直接修改 `src/content/posts/**/*.md`。
- 图片：Pages CMS 会上传到 `public/images/posts/`，正文地址使用 `/signal-grid-blog/images/posts/...`。
- 新文章：填写 `permalink` 作为稳定英文短链，发布后尽量不要修改。

Pages CMS 的字段与媒体规则位于 `.pages.yml`。

实战教程是独立内容类型，不是博客文章或理论学习路径。案例级状态位于 `src/practice/config.ts`，已签约单元位于 `src/practice/units.ts`，教程 Markdown 位于 `src/content/practice/`。只登记真正已签约的单元，不为候选地图创建空文章。

教程必须通过 `project / profileVersion / unitCode` 指向已登记案例和单元，同单元的 `lessonOrder` 与 `permalink` 必须唯一，源码和证据必须引用不可移动的 tag。在单元达到 `PUBLISHED` 之前教程必须保持 `draft: true`；草稿不生成生产路由，不进入 Pagefind、sitemap 或 RSS。

## 发布

`.github/workflows/deploy.yml` 会在 `main` 分支更新后构建并发布 GitHub Pages。首次启用时，在仓库 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。

当前站点是 GitHub 项目站 `lcha-reln.github.io/signal-grid-blog/`，Astro 的 `base` 已设置为 `/signal-grid-blog`。未来绑定自定义域名时，需要同步更新 `astro.config.mjs`、`src/config.ts`、`public/robots.txt` 与 Pages CMS 图片输出路径。

## 主要结构

```text
src/
  components/       页面组件、搜索和 Mermaid 运行时
  layouts/          全局页面框架
  lib/content.ts    路由、摘要、专题与排序的唯一逻辑入口
  pages/            首页、专题、归档、文章、RSS
  practice/         实战案例与已签约单元注册表
  styles/           Signal Grid 主题与长文排版
src/content/posts/  新博客的 Markdown 内容源
src/content/practice/  独立实战教程内容源
public/images/posts Pages CMS 图片目录
```

实战路由按 `practice/<project>/<unit>/<lesson>/` 分层。本地先运行 `pnpm verify:practice`；发布前必须再运行完整 `pnpm build` 和站点验收。验证脚本只检查本仓配置与静态产物，不会网络读取或 checkout 课程代码仓库。

旧 Hexo 博客继续由 `lcha-reln.github.io` 仓库独立维护，本仓库不包含也不迁移旧文章。
