import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configUrl = pathToFileURL(join(root, "src", "practice", "config.ts"));
const unitsUrl = pathToFileURL(join(root, "src", "practice", "units.ts"));
const lessonsRoot = join(root, "src", "content", "practice");
const verifyDist = process.argv.includes("--dist");
const errors = [];
const lifecycleRanks = new Map([
  ["CONTRACTED", 0],
  ["READY", 1],
  ["IN_PROGRESS", 2],
  ["CODE_VERIFIED", 3],
  ["CONTENT_VERIFIED", 4],
  ["PUBLISHED", 5],
]);
const profileStatuses = new Set(["CURRENT", "LOCKED", "COMPLETE"]);
const profileFields = new Set(["version", "title", "description", "status", "gate"]);
const lessonFields = [
  "title",
  "description",
  "date",
  "project",
  "profileVersion",
  "unitCode",
  "lessonOrder",
  "permalink",
  "draft",
];

const { PRACTICE_CASES } = await import(configUrl.href);
const { PRACTICE_UNITS } = await import(unitsUrl.href);

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function isPublicHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function assertIncludes(haystack, needle, context) {
  assert(haystack.includes(needle), `${context}: missing ${JSON.stringify(needle)}`);
}

function parsePlanVersion(value) {
  const match = /^(\d+)\.(\d+)$/.exec(value ?? "");
  return match ? [Number(match[1]), Number(match[2])] : undefined;
}

function comparePlanVersions(left, right) {
  if (left[0] !== right[0]) return left[0] - right[0];
  return left[1] - right[1];
}

function isAtLeast(lifecycle, minimum) {
  return (lifecycleRanks.get(lifecycle) ?? -1) >= (lifecycleRanks.get(minimum) ?? Number.MAX_SAFE_INTEGER);
}

function isFixedCourseRef(value, suffix) {
  return new RegExp(`^course/[a-z][a-z0-9]*(?:\\.\\d+)?-${suffix}$`).test(value ?? "");
}

function parseScalar(rawValue) {
  const value = rawValue.trim();
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d+$/.test(value)) return Number(value);
  return value;
}

function parseLesson(file, source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(source);
  assert(match, `${file}: missing YAML frontmatter`);
  if (!match) return { data: {}, body: source };

  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line || /^\s/.test(line) || line.trimStart().startsWith("#")) continue;
    const field = /^([A-Za-z][A-Za-z0-9]*):(?:\s*(.*))?$/.exec(line);
    if (field) data[field[1]] = parseScalar(field[2] ?? "");
  }
  return { data, body: source.slice(match[0].length) };
}

async function listMarkdownFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listMarkdownFiles(path)));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(path);
  }
  return files.sort();
}

async function readIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

const caseSlugs = new Set();
const caseIndexes = new Set();
const designDocuments = new Set();
const repositoryUrls = new Set();
const casesBySlug = new Map();

for (const practiceCase of PRACTICE_CASES) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(practiceCase.slug), `${practiceCase.slug}: invalid slug`);
  assert(!caseSlugs.has(practiceCase.slug), `${practiceCase.slug}: duplicate slug`);
  caseSlugs.add(practiceCase.slug);
  casesBySlug.set(practiceCase.slug, practiceCase);
  assert(/^\d+$/.test(practiceCase.index), `${practiceCase.slug}: invalid case index`);
  assert(!caseIndexes.has(practiceCase.index), `${practiceCase.slug}: duplicate case index`);
  caseIndexes.add(practiceCase.index);
  const validDesignDocument =
    /^docs\/[A-Za-z0-9_./-]+\.md$/.test(practiceCase.designDocument) &&
    !practiceCase.designDocument.split("/").includes("..");
  assert(validDesignDocument, `${practiceCase.slug}: invalid designDocument`);
  assert(!designDocuments.has(practiceCase.designDocument), `${practiceCase.slug}: duplicate designDocument`);
  designDocuments.add(practiceCase.designDocument);
}

const unitKeys = new Set();
const unitOrders = new Set();
const unitsByKey = new Map();
for (const unit of PRACTICE_UNITS) {
  const key = `${unit.projectSlug}/${unit.code}`;
  const practiceCase = casesBySlug.get(unit.projectSlug);
  const profile = practiceCase?.profileRoadmap.find((item) => item.version === unit.profileVersion);
  const track = practiceCase?.tracks.find((item) => item.code === unit.trackCode);

  assert(!unitKeys.has(key), `${key}: duplicate registered unit`);
  unitKeys.add(key);
  unitsByKey.set(key, unit);
  assert(practiceCase, `${key}: unit points to a missing practice case`);
  assert(profile, `${key}: unit points to a missing profile ${unit.profileVersion}`);
  assert(profile?.status !== "LOCKED", `${key}: unit points to LOCKED profile ${unit.profileVersion}`);
  assert(track, `${key}: unit points to a missing track ${unit.trackCode}`);
  assert(track?.status !== "LOCKED", `${key}: unit points to LOCKED track ${unit.trackCode}`);
  assert(unit.code.startsWith(unit.trackCode), `${key}: unit and track codes disagree`);
  assert(/^[A-Z][0-9]{2}$/.test(unit.code), `${key}: invalid unit code`);
  assert(Number.isInteger(unit.order) && unit.order > 0, `${key}: invalid unit order`);
  const orderKey = `${unit.projectSlug}/${unit.order}`;
  assert(!unitOrders.has(orderKey), `${key}: duplicate unit order ${unit.order}`);
  unitOrders.add(orderKey);
  assert(lifecycleRanks.has(unit.lifecycle), `${key}: invalid lifecycle ${unit.lifecycle}`);
  assert(typeof unit.title === "string" && unit.title.trim(), `${key}: empty title`);
  assert(typeof unit.summary === "string" && unit.summary.trim(), `${key}: empty summary`);
  assert(/^\d+\.\d+$/.test(unit.contractPlanVersion), `${key}: invalid contractPlanVersion`);
  const lifecycleRank = lifecycleRanks.get(unit.lifecycle) ?? -1;
  if (lifecycleRank >= lifecycleRanks.get("READY")) {
    assert(isFixedCourseRef(unit.startRef, "start"), `${key}: invalid or floating startRef`);
    assert(unit.startRef?.startsWith(`course/${unit.code.toLowerCase()}`), `${key}: startRef belongs to another unit`);
  } else {
    assert(!unit.startRef, `${key}: ${unit.lifecycle} must not publish startRef before READY`);
  }
  if (unit.completeRef) {
    assert(isFixedCourseRef(unit.completeRef, "complete"), `${key}: invalid or floating completeRef`);
    assert(unit.completeRef.startsWith(`course/${unit.code.toLowerCase()}`), `${key}: completeRef belongs to another unit`);
  }
  if (lifecycleRank >= lifecycleRanks.get("CODE_VERIFIED")) {
    assert(unit.completeRef, `${key}: ${unit.lifecycle} requires completeRef`);
    assert(unit.evidencePath, `${key}: ${unit.lifecycle} requires evidencePath`);
  } else {
    assert(!unit.completeRef, `${key}: ${unit.lifecycle} must not publish completeRef before CODE_VERIFIED`);
    assert(!unit.evidencePath, `${key}: ${unit.lifecycle} must not publish evidencePath before CODE_VERIFIED`);
    assert(!unit.evidenceUrl, `${key}: ${unit.lifecycle} must not publish evidenceUrl before CODE_VERIFIED`);
  }
  if (unit.evidencePath) {
    assert(!unit.evidencePath.startsWith("/") && !unit.evidencePath.split("/").includes(".."), `${key}: invalid evidencePath`);
  }
  if (unit.evidenceUrl) assert(isPublicHttpsUrl(unit.evidenceUrl), `${key}: evidenceUrl must be a public HTTPS URL`);
  if (unit.lifecycle === "PUBLISHED") {
    assert(unit.evidenceUrl, `${key}: PUBLISHED requires a public evidenceUrl`);
  }
  for (const field of ["adds", "delivers", "excludes", "gate", "evidence", "localCommands"]) {
    assert(Array.isArray(unit[field]) && unit[field].length > 0, `${key}: empty ${field}`);
  }
  for (const command of unit.localCommands) {
    const courseRefs = command.match(/course\/[a-z0-9.-]+/g) ?? [];
    for (const ref of courseRefs) {
      assert(
        ref === unit.startRef || ref === unit.completeRef,
        `${key}: command publishes unfrozen course ref ${ref}`,
      );
    }
  }
  const supersededRefs = new Set();
  for (const superseded of unit.supersededStartRefs ?? []) {
    assert(isFixedCourseRef(superseded.ref, "start"), `${key}: invalid superseded start ref`);
    assert(superseded.ref !== unit.startRef, `${key}: canonical start ref supersedes itself`);
    assert(!supersededRefs.has(superseded.ref), `${key}: duplicate superseded start ref`);
    assert(typeof superseded.reason === "string" && superseded.reason.trim(), `${key}: superseded ref has no reason`);
    supersededRefs.add(superseded.ref);
  }
}

for (const practiceCase of PRACTICE_CASES) {
  const design = await readIfExists(join(root, practiceCase.designDocument));
  const caseUnits = PRACTICE_UNITS.filter((unit) => unit.projectSlug === practiceCase.slug);
  const configuredUnitCodes = new Set(practiceCase.units ?? []);
  const publishedUnits = caseUnits.filter((unit) => unit.lifecycle === "PUBLISHED").length;
  const readyUnits = caseUnits.filter((unit) => unit.lifecycle === "READY");
  const activeDeliveryUnits = caseUnits.filter((unit) =>
    ["IN_PROGRESS", "CODE_VERIFIED", "CONTENT_VERIFIED"].includes(unit.lifecycle)
  );
  const currentUnit = practiceCase.currentUnitCode
    ? unitsByKey.get(`${practiceCase.slug}/${practiceCase.currentUnitCode}`)
    : undefined;
  const currentTrack = currentUnit
    ? practiceCase.tracks.find((track) => track.code === currentUnit.trackCode)
    : undefined;
  const unitTotal = practiceCase.tracks.reduce((sum, track) => sum + track.units, 0);
  const activeTracks = practiceCase.tracks.filter((track) => track.status === "ACTIVE");
  const completeTracks = practiceCase.tracks.filter((track) => track.status === "COMPLETE");
  const createdRepositories = practiceCase.tracks.filter((track) => track.repositoryUrl).length;
  const trackCodes = new Set();
  const milestoneVersions = new Set();
  const profileVersions = new Set();
  const profiles = Array.isArray(practiceCase.profileRoadmap) ? practiceCase.profileRoadmap : [];
  const currentProfiles = profiles.filter((profile) => profile.status === "CURRENT");
  const currentProfile = currentProfiles[0];
  const deliveryProfile = currentProfile ?? (practiceCase.status === "VERIFIED" ? profiles.at(-1) : undefined);

  assert(practiceCase.tracks.length > 0, `${practiceCase.slug}: no tracks`);
  assert(Number.isInteger(practiceCase.totalUnits) && practiceCase.totalUnits > 0, `${practiceCase.slug}: invalid totalUnits`);
  assert(practiceCase.totalUnits === unitTotal, `${practiceCase.slug}: totalUnits does not equal track units`);
  assert(
    Number.isInteger(practiceCase.plannedRepositories) && practiceCase.plannedRepositories >= createdRepositories,
    `${practiceCase.slug}: plannedRepositories is smaller than the visible repository count`,
  );
  assert(/^\d+\.\d+$/.test(practiceCase.planVersion), `${practiceCase.slug}: invalid planVersion`);
  assert(typeof practiceCase.statusLabel === "string" && practiceCase.statusLabel.trim(), `${practiceCase.slug}: empty statusLabel`);
  assert(typeof practiceCase.currentAction === "string" && practiceCase.currentAction.trim(), `${practiceCase.slug}: empty currentAction`);
  assert(typeof practiceCase.trackNarrative === "string" && practiceCase.trackNarrative.trim(), `${practiceCase.slug}: empty trackNarrative`);
  assert(typeof practiceCase.theoryLabel === "string" && practiceCase.theoryLabel.trim(), `${practiceCase.slug}: empty theoryLabel`);
  assert(typeof practiceCase.profileRoadmapTitle === "string" && practiceCase.profileRoadmapTitle.trim(), `${practiceCase.slug}: empty profileRoadmapTitle`);
  assert(typeof practiceCase.profileRoadmapDescription === "string" && practiceCase.profileRoadmapDescription.trim(), `${practiceCase.slug}: empty profileRoadmapDescription`);
  assert(profiles.length > 0, `${practiceCase.slug}: empty profileRoadmap`);
  assert(configuredUnitCodes.size === (practiceCase.units ?? []).length, `${practiceCase.slug}: duplicate unit code in case registry`);
  assert(configuredUnitCodes.size === caseUnits.length, `${practiceCase.slug}: case registry and unit registry differ`);
  assert(readyUnits.length <= 1, `${practiceCase.slug}: more than one unit is READY`);
  assert(activeDeliveryUnits.length <= 1, `${practiceCase.slug}: more than one unit occupies the active delivery window`);
  for (const unit of caseUnits) assert(configuredUnitCodes.has(unit.code), `${practiceCase.slug}: unit ${unit.code} is not listed by the case`);
  for (const code of configuredUnitCodes) assert(unitsByKey.has(`${practiceCase.slug}/${code}`), `${practiceCase.slug}: missing registered unit ${code}`);
  if (practiceCase.currentUnitCode) {
    assert(currentUnit, `${practiceCase.slug}: currentUnitCode points to a missing registered unit`);
    assert(configuredUnitCodes.has(practiceCase.currentUnitCode), `${practiceCase.slug}: currentUnitCode is not in case units`);
  }
  if (activeDeliveryUnits.length === 1) {
    assert(
      currentUnit?.code === activeDeliveryUnits[0].code,
      `${practiceCase.slug}: currentUnitCode does not identify the active delivery unit`,
    );
  }

  if (practiceCase.status === "PLANNED") {
    assert(activeTracks.length === 0, `${practiceCase.slug}: PLANNED cannot expose an ACTIVE track`);
    assert(!currentUnit || !isAtLeast(currentUnit.lifecycle, "IN_PROGRESS"), `${practiceCase.slug}: PLANNED has an implementation lifecycle`);
    assert(profiles.every((profile) => profile.status === "LOCKED"), `${practiceCase.slug}: PLANNED requires all profiles LOCKED`);
  }
  if (practiceCase.status === "BUILDING") {
    assert(activeTracks.length === 1, `${practiceCase.slug}: BUILDING requires exactly one ACTIVE track`);
    assert(currentUnit, `${practiceCase.slug}: BUILDING requires a currentUnitCode`);
    assert(currentTrack?.status === "ACTIVE", `${practiceCase.slug}: current track is not ACTIVE`);
    assert(currentTrack?.repositoryUrl, `${practiceCase.slug}: ACTIVE current track has no repository`);
    assert(currentUnit && isAtLeast(currentUnit.lifecycle, "IN_PROGRESS"), `${practiceCase.slug}: BUILDING unit is not in progress`);
    assert(practiceCase.statusLabel.includes(currentUnit?.code ?? ""), `${practiceCase.slug}: BUILDING statusLabel omits current unit`);
    assert(currentProfiles.length === 1, `${practiceCase.slug}: BUILDING requires exactly one CURRENT profile`);
  }
  if (practiceCase.status === "VERIFIED") {
    assert(activeTracks.length === 0, `${practiceCase.slug}: VERIFIED cannot expose an ACTIVE track`);
    assert(completeTracks.length === practiceCase.tracks.length, `${practiceCase.slug}: VERIFIED requires complete tracks`);
    assert(publishedUnits === practiceCase.totalUnits, `${practiceCase.slug}: VERIFIED requires all units published`);
    assert(!currentUnit || currentUnit.lifecycle === "PUBLISHED", `${practiceCase.slug}: VERIFIED current unit is not PUBLISHED`);
    assert(profiles.every((profile) => profile.status === "COMPLETE"), `${practiceCase.slug}: VERIFIED requires complete profiles`);
  }

  let profilePhase = "COMPLETE";
  for (const profile of profiles) {
    assert(/^[A-Z][A-Z0-9-]*-\d+\.\d+$/.test(profile.version), `${practiceCase.slug}: invalid profile version ${profile.version}`);
    assert(!profileVersions.has(profile.version), `${practiceCase.slug}: duplicate profile version ${profile.version}`);
    profileVersions.add(profile.version);
    assert(typeof profile.title === "string" && profile.title.trim(), `${practiceCase.slug}/${profile.version}: empty title`);
    assert(typeof profile.description === "string" && profile.description.trim(), `${practiceCase.slug}/${profile.version}: empty description`);
    assert(typeof profile.gate === "string" && profile.gate.trim(), `${practiceCase.slug}/${profile.version}: empty gate`);
    for (const field of Object.keys(profile)) {
      assert(profileFields.has(field), `${practiceCase.slug}/${profile.version}: profile exposes forbidden field ${field}`);
    }
    assert(profileStatuses.has(profile.status), `${practiceCase.slug}/${profile.version}: invalid status ${profile.status}`);
    if (profile.status === "COMPLETE") {
      assert(profilePhase === "COMPLETE", `${practiceCase.slug}: COMPLETE profile appears after an open profile`);
    } else if (profile.status === "CURRENT") {
      assert(profilePhase === "COMPLETE", `${practiceCase.slug}: CURRENT profile appears out of order`);
      profilePhase = "CURRENT";
    } else {
      profilePhase = "LOCKED";
    }
  }
  assert(currentProfiles.length <= 1, `${practiceCase.slug}: multiple CURRENT profiles`);

  for (const track of practiceCase.tracks) {
    assert(typeof track.code === "string" && track.code.trim(), `${practiceCase.slug}: empty track code`);
    assert(Number.isInteger(track.units) && track.units > 0, `${practiceCase.slug}/${track.code}: invalid unit count`);
    assert(!trackCodes.has(track.code), `${practiceCase.slug}: duplicate track code ${track.code}`);
    trackCodes.add(track.code);
    if (track.status === "LOCKED") assert(!track.repositoryUrl, `${practiceCase.slug}/${track.code}: LOCKED track exposes a repository`);
    if (track.status === "ACTIVE" || track.status === "COMPLETE") assert(track.repositoryUrl, `${practiceCase.slug}/${track.code}: ${track.status} track has no repository`);
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
  if (deliveryProfile) assert(practiceCase.milestones.at(-1)?.version === deliveryProfile.version, `${practiceCase.slug}: final milestone is not the delivery profile`);
  for (const profile of profiles.filter((item) => item.status === "LOCKED")) {
    assert(!milestoneVersions.has(profile.version), `${practiceCase.slug}: LOCKED profile appears in current milestones`);
  }

  assertIncludes(design, `> \`planVersion\`：\`${practiceCase.planVersion}\``, practiceCase.slug);
  assertIncludes(design, `> 案例 slug：\`${practiceCase.slug}\``, practiceCase.slug);
  assertIncludes(design, `${practiceCase.totalUnits} 个候选交付单元`, practiceCase.slug);
  assertIncludes(design, `${practiceCase.plannedRepositories} 个按门禁顺序创建的代码仓库`, practiceCase.slug);
  assertIncludes(design, practiceCase.profileRoadmapTitle, practiceCase.slug);
  assertIncludes(design, practiceCase.profileRoadmapDescription, practiceCase.slug);
  for (const profile of profiles) {
    assertIncludes(design, `| \`${profile.version}\` | \`${profile.status}\` | ${profile.title} | ${profile.description} | ${profile.gate} |`, `${practiceCase.slug}/${profile.version}`);
  }
  if (currentUnit) {
    assertIncludes(design, `> 状态：${currentUnit.code} 已启动，当前 \`${currentUnit.lifecycle}\``, practiceCase.slug);
    assertIncludes(design, `| ${currentUnit.code} | \`${currentUnit.lifecycle}\` |`, practiceCase.slug);
  }
  for (const unit of caseUnits) {
    const key = `${practiceCase.slug}/${unit.code}`;
    const casePlanVersion = parsePlanVersion(practiceCase.planVersion);
    const contractPlanVersion = parsePlanVersion(unit.contractPlanVersion);
    assert(contractPlanVersion, `${key}: invalid contractPlanVersion`);
    if (casePlanVersion && contractPlanVersion) {
      const comparison = comparePlanVersions(casePlanVersion, contractPlanVersion);
      assert(comparison >= 0, `${key}: contractPlanVersion is newer than case planVersion`);
      if (comparison > 0) {
        assert(typeof unit.planCompatibility === "string" && unit.planCompatibility.trim(), `${key}: older unit contract has no planCompatibility`);
        assertIncludes(unit.planCompatibility ?? "", `PLAN v${practiceCase.planVersion}`, `${key}: planCompatibility`);
      } else {
        assert(!unit.planCompatibility, `${key}: current contract has redundant planCompatibility`);
      }
    }
    assertIncludes(design, unit.startRef, `${key} design`);
    assertIncludes(design, `> 当前单元合同 \`planVersion\`：\`${unit.contractPlanVersion}\``, `${key} design`);
    if (unit.planCompatibility) assertIncludes(design, unit.planCompatibility, `${key} design`);
    for (const superseded of unit.supersededStartRefs ?? []) {
      assertIncludes(design, superseded.ref, `${key} superseded start ref`);
      assertIncludes(design, superseded.reason, `${key} superseded start reason`);
    }
    for (const prerequisite of unit.prerequisiteUnitCodes) {
      const prerequisiteUnit = unitsByKey.get(`${practiceCase.slug}/${prerequisite}`);
      assert(prerequisiteUnit, `${key}: missing prerequisite unit ${prerequisite}`);
      if (isAtLeast(unit.lifecycle, "READY")) {
        assert(prerequisiteUnit?.lifecycle === "PUBLISHED", `${key}: prerequisite ${prerequisite} is not PUBLISHED`);
      }
    }
  }

  if (verifyDist) {
    const projectHtml = await readIfExists(join(root, "dist", "practice", practiceCase.slug, "index.html"));
    assert(projectHtml, `${practiceCase.slug}: missing project route in dist`);
    assertIncludes(projectHtml, `PLAN v${practiceCase.planVersion}`, `${practiceCase.slug} dist`);
    assertIncludes(projectHtml, practiceCase.statusLabel, `${practiceCase.slug} dist`);
    assertIncludes(projectHtml, practiceCase.profileRoadmapTitle, `${practiceCase.slug} dist`);
    for (const profile of profiles) {
      assertIncludes(projectHtml, profile.version, `${practiceCase.slug}/${profile.version} dist`);
      assertIncludes(projectHtml, profile.title, `${practiceCase.slug}/${profile.version} dist`);
    }
    if (currentUnit) assertIncludes(projectHtml, `/signal-grid-blog/practice/${practiceCase.slug}/${currentUnit.code.toLowerCase()}/`, `${practiceCase.slug} current unit link`);
    for (const unit of caseUnits) {
      const unitPath = join(root, "dist", "practice", practiceCase.slug, unit.code.toLowerCase(), "index.html");
      const shouldExposeUnit = isAtLeast(unit.lifecycle, "IN_PROGRESS");
      assert((await exists(unitPath)) === shouldExposeUnit, `${practiceCase.slug}/${unit.code}: unit route exposure disagrees with lifecycle`);
      if (shouldExposeUnit) {
        const unitHtml = await readFile(unitPath, "utf8");
        assertIncludes(unitHtml, unit.title, `${practiceCase.slug}/${unit.code} dist`);
        assertIncludes(unitHtml, unit.lifecycle, `${practiceCase.slug}/${unit.code} dist`);
        assertIncludes(unitHtml, unit.startRef, `${practiceCase.slug}/${unit.code} dist`);
        if (unit.completeRef) assertIncludes(unitHtml, unit.completeRef, `${practiceCase.slug}/${unit.code} complete ref dist`);
        if (unit.lifecycle === "PUBLISHED") {
          assertIncludes(unitHtml, unit.evidenceUrl, `${practiceCase.slug}/${unit.code} evidence URL dist`);
        }
      }
    }
  }
}

const lessons = [];
const lessonRoutes = new Set();
const lessonOrders = new Set();
for (const path of await listMarkdownFiles(lessonsRoot)) {
  const file = relative(root, path).split(sep).join("/");
  const source = await readFile(path, "utf8");
  const { data, body } = parseLesson(file, source);
  for (const field of lessonFields) assert(data[field] !== undefined && data[field] !== "", `${file}: missing ${field}`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.project ?? ""), `${file}: invalid project`);
  assert(/^[A-Z][A-Z0-9-]*-\d+\.\d+$/.test(data.profileVersion ?? ""), `${file}: invalid profileVersion`);
  assert(/^[A-Z][0-9]{2}$/.test(data.unitCode ?? ""), `${file}: invalid unitCode`);
  assert(Number.isInteger(data.lessonOrder) && data.lessonOrder > 0, `${file}: invalid lessonOrder`);
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.permalink ?? ""), `${file}: invalid permalink`);
  assert(typeof data.draft === "boolean", `${file}: draft must be a boolean`);
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(String(data.date ?? "")), `${file}: date must include an explicit timezone`);

  const practiceCase = casesBySlug.get(data.project);
  const unit = unitsByKey.get(`${data.project}/${data.unitCode}`);
  const profile = practiceCase?.profileRoadmap.find((item) => item.version === data.profileVersion);
  assert(practiceCase, `${file}: lesson points to a missing practice case`);
  assert(unit, `${file}: lesson points to a missing or LOCKED unit`);
  assert(profile, `${file}: lesson points to a missing profile`);
  assert(profile?.status !== "LOCKED", `${file}: lesson points to LOCKED profile ${data.profileVersion}`);
  assert(unit?.profileVersion === data.profileVersion, `${file}: lesson profile and unit profile disagree`);
  assert(data.draft || unit?.lifecycle === "PUBLISHED", `${file}: non-draft lesson requires a PUBLISHED unit`);

  const expectedPrefix = `src/content/practice/${data.project}/${String(data.unitCode).toLowerCase()}/`;
  assert(file.startsWith(expectedPrefix), `${file}: path must follow project/unit hierarchy`);
  const routeKey = `${data.project}/${String(data.unitCode).toLowerCase()}/${data.permalink}`;
  const orderKey = `${data.project}/${data.unitCode}/${data.lessonOrder}`;
  assert(!lessonRoutes.has(routeKey), `${file}: duplicate lesson permalink ${routeKey}`);
  assert(!lessonOrders.has(orderKey), `${file}: duplicate lessonOrder ${orderKey}`);
  lessonRoutes.add(routeKey);
  lessonOrders.add(orderKey);

  const repositoryUrl = practiceCase?.tracks.find((track) => track.code === unit?.trackCode)?.repositoryUrl;
  if (repositoryUrl && source.includes(`${repositoryUrl}/`)) {
    const fixedRefs = [unit?.startRef, unit?.completeRef, unit?.productRelease].filter(Boolean);
    const escapedRepository = repositoryUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const sourceLinks = source.match(new RegExp(`${escapedRepository}/(?:tree|blob)/[^\\s)\"']+`, "g")) ?? [];
    for (const link of sourceLinks) {
      assert(fixedRefs.some((ref) => link.includes(`/${ref}`)), `${file}: floating or foreign source ref ${link}`);
    }
  }
  if (!data.draft && unit?.completeRef) assertIncludes(body, unit.completeRef, `${file}: published lesson complete ref`);
  lessons.push({ file, data, unit });
}

for (const unit of PRACTICE_UNITS.filter((item) => item.lifecycle === "PUBLISHED")) {
  assert(
    lessons.some((lesson) => lesson.data.project === unit.projectSlug && lesson.data.unitCode === unit.code && !lesson.data.draft),
    `${unit.projectSlug}/${unit.code}: PUBLISHED unit has no published lesson`,
  );
}

if (verifyDist) {
  const portalHtml = await readIfExists(join(root, "dist", "practice", "index.html"));
  for (const practiceCase of PRACTICE_CASES) {
    assertIncludes(portalHtml, `/signal-grid-blog/practice/${practiceCase.slug}/`, "practice portal dist");
  }

  const rss = await readIfExists(join(root, "dist", "rss.xml"));
  const sitemap = `${await readIfExists(join(root, "dist", "sitemap-index.xml"))}\n${await readIfExists(join(root, "dist", "sitemap-0.xml"))}`;
  const search = await readIfExists(join(root, "dist", "search.json"));
  const postsIndex = await readIfExists(join(root, "dist", "posts", "index.html"));
  assert(!rss.includes("/practice/"), "dist/rss.xml: practice content must not enter the main RSS");
  for (const lesson of lessons) {
    const route = `/signal-grid-blog/practice/${lesson.data.project}/${String(lesson.data.unitCode).toLowerCase()}/${lesson.data.permalink}/`;
    const routeFile = join(root, "dist", "practice", lesson.data.project, String(lesson.data.unitCode).toLowerCase(), lesson.data.permalink, "index.html");
    assert(!postsIndex.includes(lesson.data.title), `${lesson.file}: practice lesson entered posts archive/statistics`);
    if (lesson.data.draft) {
      assert(!(await exists(routeFile)), `${lesson.file}: draft generated a production route`);
      assert(!sitemap.includes(route), `${lesson.file}: draft entered sitemap`);
      assert(!search.includes(route) && !search.includes(lesson.data.permalink), `${lesson.file}: draft entered search output`);
      assert(!rss.includes(lesson.data.permalink), `${lesson.file}: draft entered RSS`);
    } else {
      assert(await exists(routeFile), `${lesson.file}: published lesson route is missing`);
      assertIncludes(sitemap, route, `${lesson.file}: published lesson sitemap`);
    }
  }
}

if (errors.length > 0) {
  console.error("Practice plan verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `Practice plan verified: ${PRACTICE_CASES.length} case(s), ${PRACTICE_UNITS.length} registered unit(s), ${lessons.length} lesson(s)${verifyDist ? " with dist" : ""}.`,
);
