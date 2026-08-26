import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configUrl = pathToFileURL(join(root, "src", "practice", "config.ts"));
const verifyDist = process.argv.includes("--dist");
const errors = [];
const lifecyclesRequiringStartRef = new Set([
  "READY",
  "IN_PROGRESS",
  "CODE_VERIFIED",
  "CONTENT_VERIFIED",
  "PUBLISHED",
]);

const { PRACTICE_CASES } = await import(configUrl.href);

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function assertIncludes(haystack, needle, context) {
  assert(haystack.includes(needle), `${context}: missing ${JSON.stringify(needle)}`);
}

const slugs = new Set();
const designDocuments = new Set();
const repositoryUrls = new Set();

for (const practiceCase of PRACTICE_CASES) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(practiceCase.slug), `${practiceCase.slug}: invalid slug`);
  assert(!slugs.has(practiceCase.slug), `${practiceCase.slug}: duplicate slug`);
  slugs.add(practiceCase.slug);

  const validDesignDocument =
    /^docs\/[A-Za-z0-9_./-]+\.md$/.test(practiceCase.designDocument) &&
    !practiceCase.designDocument.split("/").includes("..");
  assert(validDesignDocument, `${practiceCase.slug}: invalid designDocument`);
  assert(!designDocuments.has(practiceCase.designDocument), `${practiceCase.slug}: duplicate designDocument`);
  designDocuments.add(practiceCase.designDocument);
  const design = validDesignDocument
    ? await readFile(join(root, practiceCase.designDocument), "utf8")
    : "";

  const unitTotal = practiceCase.tracks.reduce((sum, track) => sum + track.units, 0);
  const activeTracks = practiceCase.tracks.filter((track) => track.status === "ACTIVE");
  const completeTracks = practiceCase.tracks.filter((track) => track.status === "COMPLETE");
  const createdRepositories = practiceCase.tracks.filter((track) => track.repositoryUrl).length;
  const currentUnit = practiceCase.currentUnit;
  const currentTrack = currentUnit
    ? practiceCase.tracks.find((track) => track.code === currentUnit.trackCode)
    : undefined;
  const trackCodes = new Set();
  const milestoneVersions = new Set();

  assert(practiceCase.totalUnits === unitTotal, `${practiceCase.slug}: totalUnits does not equal track units`);
  assert(
    Number.isInteger(practiceCase.plannedRepositories) && practiceCase.plannedRepositories >= createdRepositories,
    `${practiceCase.slug}: plannedRepositories is smaller than the visible repository count`,
  );
  assert(practiceCase.publishedUnits >= 0, `${practiceCase.slug}: publishedUnits is negative`);
  assert(practiceCase.publishedUnits <= practiceCase.totalUnits, `${practiceCase.slug}: publishedUnits exceeds totalUnits`);
  assert(/^\d+\.\d+$/.test(practiceCase.planVersion), `${practiceCase.slug}: invalid planVersion`);

  if (practiceCase.status === "PLANNED") {
    assert(activeTracks.length === 0, `${practiceCase.slug}: PLANNED cannot expose an ACTIVE track`);
  }
  if (practiceCase.status === "BUILDING") {
    assert(activeTracks.length === 1, `${practiceCase.slug}: BUILDING requires exactly one ACTIVE track`);
    assert(currentUnit, `${practiceCase.slug}: BUILDING requires a currentUnit`);
    assert(currentTrack?.status === "ACTIVE", `${practiceCase.slug}: current track is not ACTIVE`);
    assert(currentTrack?.repositoryUrl, `${practiceCase.slug}: ACTIVE current track has no repository`);
    assert(
      currentUnit?.lifecycle === "IN_PROGRESS" ||
        currentUnit?.lifecycle === "CODE_VERIFIED" ||
        currentUnit?.lifecycle === "CONTENT_VERIFIED" ||
        currentUnit?.lifecycle === "PUBLISHED",
      `${practiceCase.slug}: BUILDING has an invalid current unit lifecycle`,
    );
  }
  if (practiceCase.status === "VERIFIED") {
    assert(activeTracks.length === 0, `${practiceCase.slug}: VERIFIED cannot expose an ACTIVE track`);
    assert(completeTracks.length === practiceCase.tracks.length, `${practiceCase.slug}: VERIFIED requires complete tracks`);
    assert(practiceCase.publishedUnits === practiceCase.totalUnits, `${practiceCase.slug}: VERIFIED requires all units published`);
  }

  if (currentUnit) {
    assert(currentTrack, `${practiceCase.slug}: currentUnit points to an unknown track`);
    assert(currentUnit.code.startsWith(currentUnit.trackCode), `${practiceCase.slug}: current unit and track codes disagree`);
    if (lifecyclesRequiringStartRef.has(currentUnit.lifecycle)) {
      assert(currentUnit.startRef, `${practiceCase.slug}: ${currentUnit.lifecycle} requires a startRef`);
    } else {
      assert(!currentUnit.startRef, `${practiceCase.slug}: ${currentUnit.lifecycle} cannot expose a startRef`);
    }
    if (currentUnit.startRef) {
      assert(currentTrack?.repositoryUrl, `${practiceCase.slug}: startRef has no current repository`);
    }
    for (const superseded of currentUnit.supersededStartRefs ?? []) {
      assert(currentUnit.startRef, `${practiceCase.slug}: superseded start ref has no canonical startRef`);
      assert(superseded.ref && superseded.reason, `${practiceCase.slug}: incomplete superseded start ref`);
      assert(superseded.ref !== currentUnit.startRef, `${practiceCase.slug}: canonical start ref supersedes itself`);
      assertIncludes(design, superseded.ref, `${practiceCase.slug} superseded start ref`);
      assertIncludes(design, superseded.reason, `${practiceCase.slug} superseded start reason`);
    }
  }

  for (const track of practiceCase.tracks) {
    assert(!trackCodes.has(track.code), `${practiceCase.slug}: duplicate track code ${track.code}`);
    trackCodes.add(track.code);
    if (track.status === "LOCKED") {
      assert(!track.repositoryUrl, `${practiceCase.slug}/${track.code}: LOCKED track exposes a repository`);
    }
    if (track.repositoryUrl) {
      assert(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(track.repositoryUrl), `${practiceCase.slug}/${track.code}: invalid GitHub repository URL`);
      assert(!repositoryUrls.has(track.repositoryUrl), `${track.repositoryUrl}: duplicate repository URL`);
      repositoryUrls.add(track.repositoryUrl);
    }
    assertIncludes(design, `${track.title}（${track.units} 个单元）`, `${practiceCase.slug}/${track.code}`);
  }

  for (const milestone of practiceCase.milestones) {
    assert(!milestoneVersions.has(milestone.version), `${practiceCase.slug}: duplicate milestone ${milestone.version}`);
    milestoneVersions.add(milestone.version);
    assertIncludes(design, `\`${milestone.version}\``, `${practiceCase.slug} milestone`);
  }

  assertIncludes(design, `> \`planVersion\`：\`${practiceCase.planVersion}\``, practiceCase.slug);
  assertIncludes(design, `> 案例 slug：\`${practiceCase.slug}\``, practiceCase.slug);
  assertIncludes(design, `${practiceCase.totalUnits} 个候选交付单元`, practiceCase.slug);
  assertIncludes(design, `${practiceCase.plannedRepositories} 个按门禁顺序创建的代码仓库`, practiceCase.slug);
  if (currentUnit) {
    assertIncludes(design, `> 状态：${currentUnit.code} 已启动，当前 \`${currentUnit.lifecycle}\``, practiceCase.slug);
    assertIncludes(design, `| ${currentUnit.code} | \`${currentUnit.lifecycle}\` |`, practiceCase.slug);
    if (currentUnit.startRef) assertIncludes(design, currentUnit.startRef, practiceCase.slug);
  }
  for (const track of practiceCase.tracks.filter((item) => item.repositoryUrl)) {
    assertIncludes(design, track.repositoryUrl, `${practiceCase.slug}/${track.code}`);
  }

  if (verifyDist) {
    const projectHtml = await readFile(join(root, "dist", "practice", practiceCase.slug, "index.html"), "utf8");
    const currentRepository = currentTrack?.repositoryUrl;
    const startUrl = currentRepository && currentUnit?.startRef
      ? `${currentRepository}/tree/${currentUnit.startRef}`
      : undefined;

    assertIncludes(projectHtml, `PLAN v${practiceCase.planVersion}`, `${practiceCase.slug} dist`);
    assertIncludes(projectHtml, practiceCase.statusLabel, `${practiceCase.slug} dist`);
    if (currentUnit?.startRef) assertIncludes(projectHtml, currentUnit.startRef, `${practiceCase.slug} dist`);
    for (const superseded of currentUnit?.supersededStartRefs ?? []) {
      assertIncludes(projectHtml, superseded.ref, `${practiceCase.slug} dist`);
      assertIncludes(projectHtml, superseded.reason, `${practiceCase.slug} dist`);
    }
    if (currentRepository) {
      assertIncludes(projectHtml, `href="${currentRepository}"`, `${practiceCase.slug} repository link`);
    }
    if (startUrl) assertIncludes(projectHtml, `href="${startUrl}"`, `${practiceCase.slug} start link`);
  }
}

if (verifyDist) {
  const portalHtml = await readFile(join(root, "dist", "practice", "index.html"), "utf8");
  for (const practiceCase of PRACTICE_CASES) {
    assertIncludes(portalHtml, `/signal-grid-blog/practice/${practiceCase.slug}/`, "practice portal dist");
  }
}

if (errors.length > 0) {
  console.error("Practice plan verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Practice plan verified: ${PRACTICE_CASES.length} case(s)${verifyDist ? " with dist" : ""}.`);
