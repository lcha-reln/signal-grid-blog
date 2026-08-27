import type { CollectionEntry } from "astro:content";
import { sitePath } from "../config";
import { getPracticeCase, PRACTICE_CASES, type PracticeCase } from "./config";
import {
  getPracticeUnit,
  getPracticeUnits,
  getPracticeUnitSegment,
  isPracticeUnitAtLeast,
  PRACTICE_UNITS,
  type PracticeUnit,
} from "./units";

export type PracticeLesson = CollectionEntry<"practiceLessons">;

export interface PracticeLessonContext {
  lesson: PracticeLesson;
  practiceCase: PracticeCase;
  unit: PracticeUnit;
}

function lessonKey(lesson: PracticeLesson): string {
  return `${lesson.data.project}/${lesson.data.unitCode}`;
}

function isPublicHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function validatePracticeUnits(): void {
  const unitKeys = new Set<string>();
  const unitOrders = new Set<string>();

  for (const unit of PRACTICE_UNITS) {
    const practiceCase = getPracticeCase(unit.projectSlug);
    if (!practiceCase) {
      throw new Error(`Practice unit ${unit.code} references unknown project ${unit.projectSlug}`);
    }
    if (!practiceCase.units.includes(unit.code)) {
      throw new Error(
        `Practice unit ${unit.projectSlug}/${unit.code} is missing from its case units registry`,
      );
    }
    if (!practiceCase.tracks.some((track) => track.code === unit.trackCode)) {
      throw new Error(
        `Practice unit ${unit.projectSlug}/${unit.code} references unknown track ${unit.trackCode}`,
      );
    }
    const profile = practiceCase.profileRoadmap.find(
      (candidate) => candidate.version === unit.profileVersion,
    );
    if (!profile) {
      throw new Error(
        `Practice unit ${unit.projectSlug}/${unit.code} references unknown profile ${unit.profileVersion}`,
      );
    }
    if (profile.status === "LOCKED") {
      throw new Error(
        `Practice unit ${unit.projectSlug}/${unit.code} cannot belong to LOCKED profile ${unit.profileVersion}`,
      );
    }

    const key = `${unit.projectSlug}/${unit.code}`;
    if (!unit.objective.trim() || !unit.stopPoint.trim()) {
      throw new Error(`Practice unit ${key} has an empty objective or stopPoint`);
    }
    for (const field of [
      "adds",
      "delivers",
      "freezes",
      "excludes",
      "gate",
      "interaction",
      "evidence",
      "localCommands",
    ] as const) {
      if (unit[field].length === 0 || unit[field].some((item) => !item.trim())) {
        throw new Error(`Practice unit ${key} has an empty ${field} contract`);
      }
    }
    if (unitKeys.has(key)) throw new Error(`Duplicate practice unit ${key}`);
    unitKeys.add(key);

    const orderKey = `${unit.projectSlug}/${unit.order}`;
    if (unitOrders.has(orderKey)) {
      throw new Error(`Duplicate practice unit order ${unit.order} in ${unit.projectSlug}`);
    }
    unitOrders.add(orderKey);

    if (isPracticeUnitAtLeast(unit.lifecycle, "READY") && !unit.startRef) {
      throw new Error(`Practice unit ${key} must freeze startRef at READY`);
    }
    if (!isPracticeUnitAtLeast(unit.lifecycle, "READY") && unit.startRef) {
      throw new Error(`Practice unit ${key} must not publish startRef before READY`);
    }
    if (
      isPracticeUnitAtLeast(unit.lifecycle, "CODE_VERIFIED") &&
      (!unit.completeRef || !unit.completeCommit || !unit.evidencePath || !unit.evidenceContract)
    ) {
      throw new Error(
        `Practice unit ${key} must freeze completeRef, completeCommit, evidencePath and evidenceContract at CODE_VERIFIED`,
      );
    }
    if (unit.completeCommit && !/^[0-9a-f]{40}$/.test(unit.completeCommit)) {
      throw new Error(`Practice unit ${key} completeCommit must be a full lowercase Git SHA`);
    }
    if (
      !isPracticeUnitAtLeast(unit.lifecycle, "CODE_VERIFIED") &&
      (unit.completeRef ||
        unit.completeCommit ||
        unit.evidencePath ||
        unit.evidenceUrl ||
        unit.evidenceContract)
    ) {
      throw new Error(`Practice unit ${key} must not publish completion proof before CODE_VERIFIED`);
    }
    if (unit.evidenceContract) {
      const {
        schemaVersion,
        project,
        publicManifestPath,
        manifestSha256,
        claimIds,
        limitations,
        reportFacts,
      } = unit.evidenceContract;
      if (
        !schemaVersion.trim() ||
        !project.trim() ||
        !publicManifestPath.trim() ||
        publicManifestPath.startsWith("/") ||
        publicManifestPath.split("/").some((segment) => !segment || segment === "." || segment === "..") ||
        !/^[0-9a-f]{64}$/.test(manifestSha256)
      ) {
        throw new Error(`Practice unit ${key} evidenceContract has an empty identity field`);
      }
      if (
        claimIds.length === 0 ||
        limitations.length === 0 ||
        new Set(claimIds).size !== claimIds.length ||
        claimIds.some((claim) => !claim.trim()) ||
        limitations.some((limitation) => !limitation.trim())
      ) {
        throw new Error(`Practice unit ${key} evidenceContract is empty or ambiguous`);
      }
      const reportFactKeys = new Set<string>();
      if (!Array.isArray(reportFacts) || reportFacts.length === 0) {
        throw new Error(`Practice unit ${key} evidenceContract has no semantic report facts`);
      }
      for (const fact of reportFacts) {
        const factKey = `${fact.artifactPath}\0${fact.field}`;
        const validPrimitive =
          fact.equals === null ||
          typeof fact.equals === "string" ||
          typeof fact.equals === "number" ||
          typeof fact.equals === "boolean";
        if (
          !fact.artifactPath.startsWith("reports/") ||
          !fact.artifactPath.endsWith(".json") ||
          fact.artifactPath
            .split("/")
            .some((segment: string) => !segment || segment === "." || segment === "..") ||
          !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(fact.field) ||
          !validPrimitive ||
          reportFactKeys.has(factKey) ||
          Boolean(fact.claimId) !== Boolean(fact.observationField) ||
          (fact.claimId !== undefined && !claimIds.includes(fact.claimId)) ||
          (fact.observationField !== undefined &&
            !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(fact.observationField))
        ) {
          throw new Error(`Practice unit ${key} evidenceContract has an invalid report fact`);
        }
        reportFactKeys.add(factKey);
      }
    }
    if (isPracticeUnitAtLeast(unit.lifecycle, "CONTENT_VERIFIED") && !unit.expectedLessons) {
      throw new Error(`Practice unit ${key} must freeze expectedLessons at CONTENT_VERIFIED`);
    }
    if (unit.expectedLessons) {
      const orders = new Set<number>();
      const permalinks = new Set<string>();
      for (const lesson of unit.expectedLessons) {
        if (
          !Number.isInteger(lesson.lessonOrder) ||
          lesson.lessonOrder <= 0 ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lesson.permalink) ||
          orders.has(lesson.lessonOrder) ||
          permalinks.has(lesson.permalink)
        ) {
          throw new Error(`Practice unit ${key} has an invalid expectedLessons contract`);
        }
        orders.add(lesson.lessonOrder);
        permalinks.add(lesson.permalink);
      }
      if (unit.expectedLessons.length === 0) {
        throw new Error(`Practice unit ${key} has an empty expectedLessons contract`);
      }
    }
    if (unit.evidenceUrl && !isPublicHttpsUrl(unit.evidenceUrl)) {
      throw new Error(`Practice unit ${key} evidenceUrl must be a public HTTPS URL`);
    }
    if (unit.lifecycle === "PUBLISHED" && !unit.evidenceUrl) {
      throw new Error(`Practice unit ${key} must publish an evidenceUrl at PUBLISHED`);
    }
    for (const command of unit.localCommands) {
      const courseRefs = command.match(/course\/[a-z0-9.-]+/g) ?? [];
      for (const ref of courseRefs) {
        if (ref !== unit.startRef && ref !== unit.completeRef) {
          throw new Error(`Practice unit ${key} command publishes unfrozen course ref ${ref}`);
        }
      }
    }
  }

  for (const practiceCase of PRACTICE_CASES) {
    const caseUnits = getPracticeUnits(practiceCase.slug);
    const readyUnits = caseUnits.filter((unit) => unit.lifecycle === "READY");
    const activeDeliveryUnits = caseUnits.filter((unit) =>
      ["IN_PROGRESS", "CODE_VERIFIED", "CONTENT_VERIFIED"].includes(unit.lifecycle),
    );
    if (readyUnits.length > 1) {
      throw new Error(`Practice case ${practiceCase.slug} has more than one READY unit`);
    }
    if (activeDeliveryUnits.length > 1) {
      throw new Error(
        `Practice case ${practiceCase.slug} has more than one active delivery unit`,
      );
    }
    if (
      activeDeliveryUnits.length === 1 &&
      practiceCase.currentUnitCode !== activeDeliveryUnits[0].code
    ) {
      throw new Error(
        `Practice case ${practiceCase.slug} currentUnitCode does not identify its active delivery unit`,
      );
    }
    for (const unitCode of practiceCase.units) {
      if (!getPracticeUnit(practiceCase.slug, unitCode)) {
        throw new Error(
          `Practice case ${practiceCase.slug} references missing unit ${unitCode}`,
        );
      }
    }
    if (
      practiceCase.currentUnitCode &&
      !practiceCase.units.includes(practiceCase.currentUnitCode)
    ) {
      throw new Error(
        `Practice case ${practiceCase.slug} currentUnitCode is not in its units registry`,
      );
    }
  }
}

export function validatePracticeContent(lessons: PracticeLesson[]): void {
  validatePracticeUnits();

  const routes = new Map<string, string>();
  const orders = new Map<string, string>();
  const lessonCountByUnit = new Map<string, number>();
  const publishedCountByUnit = new Map<string, number>();
  const lessonsByUnit = new Map<string, PracticeLesson[]>();

  for (const lesson of lessons) {
    const practiceCase = getPracticeCase(lesson.data.project);
    if (!practiceCase) {
      throw new Error(
        `Practice lesson ${lesson.id} references unknown project ${lesson.data.project}`,
      );
    }

    const unit = getPracticeUnit(lesson.data.project, lesson.data.unitCode);
    if (!unit || !practiceCase.units.includes(lesson.data.unitCode)) {
      throw new Error(
        `Practice lesson ${lesson.id} references unregistered unit ${lesson.data.project}/${lesson.data.unitCode}`,
      );
    }
    if (lesson.data.profileVersion !== unit.profileVersion) {
      throw new Error(
        `Practice lesson ${lesson.id} profileVersion ${lesson.data.profileVersion} does not match unit ${unit.profileVersion}`,
      );
    }
    if (!lesson.data.draft && unit.lifecycle !== "PUBLISHED") {
      throw new Error(
        `Practice lesson ${lesson.id} cannot be published while ${unit.code} is ${unit.lifecycle}`,
      );
    }

    const unitKey = lessonKey(lesson);
    const routeKey = `${unitKey}/${lesson.data.permalink}`;
    const existingRoute = routes.get(routeKey);
    if (existingRoute) {
      throw new Error(`Duplicate practice lesson permalink: ${existingRoute} and ${lesson.id}`);
    }
    routes.set(routeKey, lesson.id);

    const orderKey = `${unitKey}/${lesson.data.lessonOrder}`;
    const existingOrder = orders.get(orderKey);
    if (existingOrder) {
      throw new Error(`Duplicate practice lesson order: ${existingOrder} and ${lesson.id}`);
    }
    orders.set(orderKey, lesson.id);

    lessonCountByUnit.set(unitKey, (lessonCountByUnit.get(unitKey) ?? 0) + 1);
    lessonsByUnit.set(unitKey, [...(lessonsByUnit.get(unitKey) ?? []), lesson]);
    if (!lesson.data.draft) {
      publishedCountByUnit.set(unitKey, (publishedCountByUnit.get(unitKey) ?? 0) + 1);
    }
  }

  for (const unit of PRACTICE_UNITS) {
    const key = `${unit.projectSlug}/${unit.code}`;
    if (
      isPracticeUnitAtLeast(unit.lifecycle, "CONTENT_VERIFIED") &&
      (lessonCountByUnit.get(key) ?? 0) === 0
    ) {
      throw new Error(`Practice unit ${key} is ${unit.lifecycle} but has no lesson`);
    }
    if (isPracticeUnitAtLeast(unit.lifecycle, "CONTENT_VERIFIED")) {
      const expected = [...(unit.expectedLessons ?? [])]
        .sort((left, right) => left.lessonOrder - right.lessonOrder)
        .map((lesson) => `${lesson.lessonOrder}:${lesson.permalink}`);
      const actual = [...(lessonsByUnit.get(key) ?? [])]
        .sort((left, right) => left.data.lessonOrder - right.data.lessonOrder)
        .map((lesson) => `${lesson.data.lessonOrder}:${lesson.data.permalink}`);
      if (expected.length !== actual.length || expected.some((value, index) => value !== actual[index])) {
        throw new Error(`Practice unit ${key} lessons differ from its frozen content contract`);
      }
    }
    if (
      unit.lifecycle === "PUBLISHED" &&
      (publishedCountByUnit.get(key) ?? 0) !== (unit.expectedLessons?.length ?? 0)
    ) {
      throw new Error(`Practice unit ${key} must publish every frozen lesson atomically`);
    }
  }
}

export function sortPracticeLessons(lessons: PracticeLesson[]): PracticeLesson[] {
  return [...lessons].sort((left, right) => {
    if (left.data.project !== right.data.project) {
      return left.data.project.localeCompare(right.data.project);
    }
    const leftUnit = getPracticeUnit(left.data.project, left.data.unitCode);
    const rightUnit = getPracticeUnit(right.data.project, right.data.unitCode);
    if ((leftUnit?.order ?? 0) !== (rightUnit?.order ?? 0)) {
      return (leftUnit?.order ?? 0) - (rightUnit?.order ?? 0);
    }
    if (left.data.lessonOrder !== right.data.lessonOrder) {
      return left.data.lessonOrder - right.data.lessonOrder;
    }
    return left.data.date.valueOf() - right.data.date.valueOf();
  });
}

export function getPublishedPracticeLessons(lessons: PracticeLesson[]): PracticeLesson[] {
  validatePracticeContent(lessons);
  return sortPracticeLessons(lessons.filter((lesson) => !lesson.data.draft));
}

export function getPracticeLessonContext(lesson: PracticeLesson): PracticeLessonContext {
  const practiceCase = getPracticeCase(lesson.data.project);
  const unit = getPracticeUnit(lesson.data.project, lesson.data.unitCode);
  if (!practiceCase || !unit) {
    throw new Error(`Practice lesson ${lesson.id} has no registered project/unit context`);
  }
  return { lesson, practiceCase, unit };
}

export function getPracticeLessonsForUnit(
  lessons: PracticeLesson[],
  projectSlug: string,
  unitCode: string,
): PracticeLesson[] {
  return sortPracticeLessons(
    lessons.filter(
      (lesson) =>
        !lesson.data.draft &&
        lesson.data.project === projectSlug &&
        lesson.data.unitCode === unitCode,
    ),
  );
}

export function getPracticeUnitPath(unit: PracticeUnit): string {
  return sitePath(`practice/${unit.projectSlug}/${getPracticeUnitSegment(unit)}/`);
}

export function getPracticeLessonPath(lesson: PracticeLesson): string {
  const { unit } = getPracticeLessonContext(lesson);
  return sitePath(
    `practice/${unit.projectSlug}/${getPracticeUnitSegment(unit)}/${lesson.data.permalink}/`,
  );
}

export function getPracticeRepositoryUrl(
  practiceCase: PracticeCase,
  unit: PracticeUnit,
): string | undefined {
  return practiceCase.tracks.find((track) => track.code === unit.trackCode)?.repositoryUrl;
}

export function getPracticeLessonReadingMinutes(lesson: PracticeLesson): number {
  const body = lesson.body ?? "";
  const plain = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, "");
  const code = (body.match(/```[\s\S]*?```/g) ?? []).join("").length;
  return Math.max(1, Math.ceil(plain.length / 500 + code / 1200));
}

export function getPracticePublishedUnitCount(projectSlug: string): number {
  return getPracticeUnits(projectSlug).filter((unit) => unit.lifecycle === "PUBLISHED").length;
}
