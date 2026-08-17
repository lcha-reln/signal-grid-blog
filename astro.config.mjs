import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import { satteri } from "@astrojs/markdown-satteri";

const tableScrollPlugin = {
  name: "table-scroll-wrapper",
  element: {
    filter: ["table"],
    visit(node, context) {
      context.wrapNode(node, {
        type: "element",
        tagName: "div",
        properties: {
          className: ["table-scroll"],
          tabIndex: 0,
          role: "region",
          ariaLabel: "可横向滚动的数据表格",
        },
        children: [],
      });
    },
  },
};

export default defineConfig({
  site: "https://lcha-reln.github.io",
  base: "/signal-grid-blog",
  output: "static",
  trailingSlash: "always",
  build: {
    format: "directory",
  },
  prerenderConflictBehavior: "error",
  vite: {
    build: {
      // Mermaid 的可选图表引擎会被拆成按需加载的独立 chunk。
      chunkSizeWarningLimit: 700,
    },
  },
  integrations: [sitemap()],
  markdown: {
    processor: satteri({ hastPlugins: [tableScrollPlugin] }),
    syntaxHighlight: {
      type: "shiki",
      excludeLangs: ["mermaid", "math"],
    },
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark-default",
      },
      wrap: false,
    },
  },
});
