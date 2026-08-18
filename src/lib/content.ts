import type { CollectionEntry } from "astro:content";
import {
  META_SERIES,
  SERIES,
  sitePath,
  type SeriesDefinition,
  type SeriesKey,
  type SeriesStage,
} from "../config";

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
  const series = SERIES.find((candidate) => candidate.key === key);
  if (!series) {
    throw new Error(`Unknown series "${key}" for ${post.id}`);
  }
  return series;
}

export function getPostsInSeries(posts: Post[], key: SeriesKey): Post[] {
  const seriesPosts = posts.filter((post) => getSeriesKey(post) === key);
  const orders = new Map<number, string>();

  for (const post of seriesPosts) {
    const existing = orders.get(post.data.seriesOrder);
    if (existing) {
      throw new Error(
        `Duplicate seriesOrder ${post.data.seriesOrder} in ${key}: ${existing} and ${post.id}`,
      );
    }
    orders.set(post.data.seriesOrder, post.id);
  }

  return seriesPosts.sort((a, b) => {
    const aOrder = a.data.seriesOrder;
    const bOrder = b.data.seriesOrder;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.data.date.valueOf() - b.data.date.valueOf();
  });
}

export function getValidatedSeriesStages(series: SeriesDefinition): readonly SeriesStage[] {
  const stages = series.stages ?? [];
  if (series.chapterScope === "stage" && stages.length === 0) {
    throw new Error(`Series ${series.key} uses stage-scoped chapters but defines no stages.`);
  }

  const keys = new Set<string>();
  const indexes = new Set<string>();
  for (let index = 0; index < stages.length; index += 1) {
    const stage = stages[index];
    const previous = stages[index - 1];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stage.key)) {
      throw new Error(`Invalid stage key "${stage.key}" in ${series.key}.`);
    }
    if (!stage.index.trim()) {
      throw new Error(`Stage "${stage.key}" in ${series.key} must define a non-empty index.`);
    }
    if (keys.has(stage.key)) {
      throw new Error(`Duplicate stage key "${stage.key}" in ${series.key}.`);
    }
    if (indexes.has(stage.index)) {
      throw new Error(`Duplicate stage index "${stage.index}" in ${series.key}.`);
    }
    if (previous && stage.fromOrder <= previous.fromOrder) {
      throw new Error(`Stages for ${series.key} must use strictly increasing fromOrder values.`);
    }
    keys.add(stage.key);
    indexes.add(stage.index);
  }

  return stages;
}

export function getPostSeriesStage(series: SeriesDefinition, post: Post): SeriesStage | undefined {
  const stages = getValidatedSeriesStages(series);
  if (series.chapterScope !== "stage") {
    if (post.data.seriesStage) {
      throw new Error(
        `Post ${post.id} declares seriesStage "${post.data.seriesStage}", but ${series.key} is not stage-scoped.`,
      );
    }
    return undefined;
  }

  const stageKey = post.data.seriesStage;
  if (!stageKey) {
    throw new Error(`Post ${post.id} must declare seriesStage because ${series.key} is stage-scoped.`);
  }

  const stageIndex = stages.findIndex((stage) => stage.key === stageKey);
  if (stageIndex === -1) {
    throw new Error(`Post ${post.id} references unknown seriesStage "${stageKey}" in ${series.key}.`);
  }

  const stage = stages[stageIndex];
  const nextOrder = stages[stageIndex + 1]?.fromOrder ?? Number.POSITIVE_INFINITY;
  if (post.data.seriesOrder < stage.fromOrder || post.data.seriesOrder >= nextOrder) {
    throw new Error(
      `Post ${post.id} uses seriesOrder ${post.data.seriesOrder}, outside seriesStage "${stage.key}" ` +
      `[${stage.fromOrder}, ${Number.isFinite(nextOrder) ? nextOrder : "infinity"}).`,
    );
  }

  return stage;
}

export function getChapterContext(posts: Post[], post: Post) {
  const series = getSeries(post);
  const seriesPosts = getPostsInSeries(posts, series.key);
  let chapterPosts = seriesPosts;
  const stage = getPostSeriesStage(series, post);

  if (stage) {
    chapterPosts = seriesPosts.filter(
      (entry) => getPostSeriesStage(series, entry)?.key === stage.key,
    );
  }

  const index = chapterPosts.findIndex((entry) => entry.id === post.id);
  return {
    index,
    total: chapterPosts.length,
    stage,
    previous: index > 0 ? chapterPosts[index - 1] : undefined,
    next: index >= 0 && index < chapterPosts.length - 1 ? chapterPosts[index + 1] : undefined,
  };
}

export function getActiveSeries(posts: Post[]) {
  return SERIES.map((series) => {
    getValidatedSeriesStages(series);
    const seriesPosts = getPostsInSeries(posts, series.key);
    for (const post of seriesPosts) {
      getPostSeriesStage(series, post);
    }
    return { series, posts: seriesPosts };
  }).filter(({ posts: seriesPosts }) => seriesPosts.length > 0);
}
