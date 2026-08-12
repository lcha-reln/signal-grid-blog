import type { CollectionEntry } from "astro:content";
import { META_SERIES, SERIES, sitePath, type SeriesKey } from "../config";

export type Post = CollectionEntry<"posts">;

export function normalizeList(value?: string | string[]): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function getPostSlug(post: Post): string {
  return post.data.permalink.replace(/^\/+|\/+$/g, "");
}

export function getPostPath(post: Post): string {
  return sitePath(`posts/${getPostSlug(post)}/`);
}

export function sortPosts(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf());
}

export function getExcerpt(post: Post, maxLength = 132): string {
  if (post.data.description) return post.data.description;

  const body = post.body ?? "";
  const source = body
    .split("<!-- more -->")[0]
    .replace(/^---[\s\S]*?---/, "")
    .replace(/<div class=["']mermaid["']>[\s\S]*?<\/div>/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1")
    .replace(/[\*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (source.length <= maxLength) return source;
  return `${source.slice(0, maxLength).trim()}…`;
}

export function readingMinutes(post: Post): number {
  const body = post.body ?? "";
  const plain = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "");
  const code = (body.match(/```[\s\S]*?```/g) ?? []).join("").length;
  return Math.max(1, Math.ceil(plain.length / 500 + code / 1200));
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getSeriesKey(post: Post): SeriesKey {
  return post.data.series;
}

export function getSeries(post: Post) {
  const key = getSeriesKey(post);
  if (key === "meta") return META_SERIES;
  return SERIES.find((series) => series.key === key) ?? SERIES[5];
}

export function getPostsInSeries(posts: Post[], key: SeriesKey): Post[] {
  return posts
    .filter((post) => getSeriesKey(post) === key)
    .sort((a, b) => {
      const aOrder = a.data.seriesOrder ?? Number.POSITIVE_INFINITY;
      const bOrder = b.data.seriesOrder ?? Number.POSITIVE_INFINITY;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.data.date.valueOf() - b.data.date.valueOf();
    });
}
