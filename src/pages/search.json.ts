import { getCollection } from "astro:content";
import { getExcerpt, getPostPath, getSeries, normalizeList, sortPosts } from "../lib/content";
import {
  getPracticeLessonContext,
  getPracticeLessonPath,
  getPublishedPracticeLessons,
} from "../practice/content";

export const prerender = true;

export async function GET() {
  const [posts, practiceLessons] = await Promise.all([
    getCollection("posts", ({ data }) => !data.draft),
    getCollection("practiceLessons"),
  ]);
  const postEntries = sortPosts(posts).map((post) => ({
    title: post.data.title,
    description: getExcerpt(post, 150),
    url: getPostPath(post),
    tags: normalizeList(post.data.tags),
    series: getSeries(post).title,
  }));
  const practiceEntries = getPublishedPracticeLessons(practiceLessons).map((lesson) => {
    const { practiceCase, unit } = getPracticeLessonContext(lesson);
    return {
      title: lesson.data.title,
      description: lesson.data.description,
      url: getPracticeLessonPath(lesson),
      tags: lesson.data.tags,
      series: `实战 · ${practiceCase.title} · ${unit.code}`,
    };
  });

  return new Response(
    JSON.stringify([...postEntries, ...practiceEntries]),
    { headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}
