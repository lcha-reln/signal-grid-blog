import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

const stringList = z.union([z.string(), z.array(z.string())]).optional();
const seriesKey = z.enum([
  "aeron",
  "trading",
  "availability",
  "performance",
  "agent",
  "storage",
  "meta",
]);

const posts = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: stringList,
    categories: stringList,
    permalink: z.string().min(1),
    description: z.string().optional(),
    draft: z.boolean().optional().default(false),
    featured: z.boolean().optional().default(false),
    series: seriesKey,
    seriesOrder: z.coerce.number().int().positive(),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
  }),
});

const practiceLessons = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/practice" }),
  schema: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    project: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    profileVersion: z.string().min(1),
    unitCode: z.string().regex(/^[A-Z][0-9]{2}$/),
    lessonOrder: z.coerce.number().int().positive(),
    permalink: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tags: z.array(z.string()).optional().default([]),
    draft: z.boolean().optional().default(true),
  }),
});

export const collections = { posts, practiceLessons };
