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
const lifecyclesRequiringContractPlanVersion = new Set([
  "CONTRACTED",
  "READY",
  "IN_PROGRESS",
  "CODE_VERIFIED",
  "CONTENT_VERIFIED",
  "PUBLISHED",
]);
const profileStatuses = new Set(["CURRENT", "LOCKED", "COMPLETE"]);
const profileFields = new Set(["version", "title", "description", "status", "gate"]);

const { PRACTICE_CASES } = await import(configUrl.href);

function assert(condition, message) {
  if (!condition) errors.push(message);
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

const slugs = new Set();
const caseIndexes = new Set();
const designDocuments = new Set();
const repositoryUrls = new Set();

for (const practiceCase of PRACTICE_CASES) {
  assert(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(practiceCase.slug), `${practiceCase.slug}: invalid slug`);
  assert(!slugs.has(practiceCase.slug), `${practiceCase.slug}: duplicate slug`);
  slugs.add(practiceCase.slug);
  assert(/^\d+$/.test(practiceCase.index), `${practiceCase.slug}: invalid case index`);
  assert(!caseIndexes.has(practiceCase.index), `${practiceCase.slug}: duplicate case index`);
  caseIndexes.add(practiceCase.index);

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
  assert(Number.isInteger(practiceCase.publishedUnits) && practiceCase.publishedUnits >= 0, `${practiceCase.slug}: invalid publishedUnits`);
  assert(practiceCase.publishedUnits <= practiceCase.totalUnits, `${practiceCase.slug}: publishedUnits exceeds totalUnits`);
  assert(/^\d+\.\d+$/.test(practiceCase.planVersion), `${practiceCase.slug}: invalid planVersion`);
  assert(typeof practiceCase.statusLabel === "string" && practiceCase.statusLabel.trim(), `${practiceCase.slug}: empty statusLabel`);
  assert(typeof practiceCase.currentAction === "string" && practiceCase.currentAction.trim(), `${practiceCase.slug}: empty currentAction`);
  assert(typeof practiceCase.trackNarrative === "string" && practiceCase.trackNarrative.trim(), `${practiceCase.slug}: empty trackNarrative`);
  assert(typeof practiceCase.theoryLabel === "string" && practiceCase.theoryLabel.trim(), `${practiceCase.slug}: empty theoryLabel`);
  assert(typeof practiceCase.profileRoadmapTitle === "string" && practiceCase.profileRoadmapTitle.trim(), `${practiceCase.slug}: empty profileRoadmapTitle`);
  assert(typeof practiceCase.profileRoadmapDescription === "string" && practiceCase.profileRoadmapDescription.trim(), `${practiceCase.slug}: empty profileRoadmapDescription`);
  assert(profiles.length > 0, `${practiceCase.slug}: empty profileRoadmap`);

  if (practiceCase.status === "PLANNED") {
    assert(activeTracks.length === 0, `${practiceCase.slug}: PLANNED cannot expose an ACTIVE track`);
    if (currentUnit) {
      assert(
        currentUnit.lifecycle === "CANDIDATE" ||
          currentUnit.lifecycle === "CONTRACTED" ||
          currentUnit.lifecycle === "READY",
        `${practiceCase.slug}: PLANNED has an implementation lifecycle`,
      );
      assert(currentTrack?.status === "NEXT", `${practiceCase.slug}: PLANNED current track is not NEXT`);
    }
    assert(profiles.every((profile) => profile.status === "LOCKED"), `${practiceCase.slug}: PLANNED requires all profiles LOCKED`);
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
    assert(practiceCase.statusLabel.includes(currentUnit?.code ?? ""), `${practiceCase.slug}: BUILDING statusLabel omits current unit`);
    assert(currentProfiles.length === 1, `${practiceCase.slug}: BUILDING requires exactly one CURRENT profile`);
  }
  if (practiceCase.status === "VERIFIED") {
    assert(activeTracks.length === 0, `${practiceCase.slug}: VERIFIED cannot expose an ACTIVE track`);
    assert(completeTracks.length === practiceCase.tracks.length, `${practiceCase.slug}: VERIFIED requires complete tracks`);
    assert(practiceCase.publishedUnits === practiceCase.totalUnits, `${practiceCase.slug}: VERIFIED requires all units published`);
    if (currentUnit) {
      assert(currentUnit.lifecycle === "PUBLISHED", `${practiceCase.slug}: VERIFIED current unit is not PUBLISHED`);
      assert(currentTrack?.status === "COMPLETE", `${practiceCase.slug}: VERIFIED current track is not COMPLETE`);
    }
    assert(profiles.every((profile) => profile.status === "COMPLETE"), `${practiceCase.slug}: VERIFIED requires complete profiles`);
  }

  if (currentUnit) {
    assert(typeof currentUnit.code === "string" && currentUnit.code.trim(), `${practiceCase.slug}: empty current unit code`);
    assert(typeof currentUnit.title === "string" && currentUnit.title.trim(), `${practiceCase.slug}: empty current unit title`);
    assert(currentTrack, `${practiceCase.slug}: currentUnit points to an unknown track`);
    assert(currentUnit.code.startsWith(currentUnit.trackCode), `${practiceCase.slug}: current unit and track codes disagree`);
    if (lifecyclesRequiringContractPlanVersion.has(currentUnit.lifecycle)) {
      assert(currentUnit.contractPlanVersion, `${practiceCase.slug}: ${currentUnit.lifecycle} requires contractPlanVersion`);
    }
    if (currentUnit.contractPlanVersion) {
      const casePlanVersion = parsePlanVersion(practiceCase.planVersion);
      const contractPlanVersion = parsePlanVersion(currentUnit.contractPlanVersion);
      assert(contractPlanVersion, `${practiceCase.slug}: invalid contractPlanVersion`);
      if (casePlanVersion && contractPlanVersion) {
        const planComparison = comparePlanVersions(casePlanVersion, contractPlanVersion);
        assert(planComparison >= 0, `${practiceCase.slug}: contractPlanVersion is newer than planVersion`);
        if (planComparison > 0) {
          assert(
            typeof currentUnit.planCompatibility === "string" && currentUnit.planCompatibility.trim(),
            `${practiceCase.slug}: older unit contract has no planCompatibility`,
          );
          assertIncludes(
            currentUnit.planCompatibility ?? "",
            `PLAN v${practiceCase.planVersion}`,
            `${practiceCase.slug}: planCompatibility does not cover the current plan`,
          );
        } else {
          assert(!currentUnit.planCompatibility, `${practiceCase.slug}: current contract has redundant planCompatibility`);
        }
      }
    } else {
      assert(!currentUnit.planCompatibility, `${practiceCase.slug}: planCompatibility has no contractPlanVersion`);
    }
    if (lifecyclesRequiringStartRef.has(currentUnit.lifecycle)) {
      assert(currentUnit.startRef, `${practiceCase.slug}: ${currentUnit.lifecycle} requires a startRef`);
    } else {
      assert(!currentUnit.startRef, `${practiceCase.slug}: ${currentUnit.lifecycle} cannot expose a startRef`);
    }
    if (currentUnit.startRef) {
      assert(/^course\/[a-z0-9]+(?:\.[0-9]+)?-start$/.test(currentUnit.startRef), `${practiceCase.slug}: invalid startRef`);
      assert(currentTrack?.repositoryUrl, `${practiceCase.slug}: startRef has no current repository`);
    }
    const supersededRefs = new Set();
    for (const superseded of currentUnit.supersededStartRefs ?? []) {
      assert(currentUnit.startRef, `${practiceCase.slug}: superseded start ref has no canonical startRef`);
      assert(superseded.ref && superseded.reason, `${practiceCase.slug}: incomplete superseded start ref`);
      assert(superseded.ref !== currentUnit.startRef, `${practiceCase.slug}: canonical start ref supersedes itself`);
      assert(!supersededRefs.has(superseded.ref), `${practiceCase.slug}: duplicate superseded start ref`);
      supersededRefs.add(superseded.ref);
      assertIncludes(design, superseded.ref, `${practiceCase.slug} superseded start ref`);
      assertIncludes(design, superseded.reason, `${practiceCase.slug} superseded start reason`);
    }
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
    } else if (profile.status === "LOCKED") {
      profilePhase = "LOCKED";
    }
  }
  assert(currentProfiles.length <= 1, `${practiceCase.slug}: multiple CURRENT profiles`);

  for (const track of practiceCase.tracks) {
    assert(typeof track.code === "string" && track.code.trim(), `${practiceCase.slug}: empty track code`);
    assert(Number.isInteger(track.units) && track.units > 0, `${practiceCase.slug}/${track.code}: invalid unit count`);
    assert(!trackCodes.has(track.code), `${practiceCase.slug}: duplicate track code ${track.code}`);
    trackCodes.add(track.code);
    if (track.status === "LOCKED") {
      assert(!track.repositoryUrl, `${practiceCase.slug}/${track.code}: LOCKED track exposes a repository`);
    }
    if (track.status === "ACTIVE" || track.status === "COMPLETE") {
      assert(track.repositoryUrl, `${practiceCase.slug}/${track.code}: ${track.status} track has no repository`);
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
  if (deliveryProfile) {
    assert(practiceCase.milestones.at(-1)?.version === deliveryProfile.version, `${practiceCase.slug}: final milestone is not the delivery profile`);
  }
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
    assertIncludes(
      design,
      `| \`${profile.version}\` | \`${profile.status}\` | ${profile.title} | ${profile.description} | ${profile.gate} |`,
      `${practiceCase.slug}/${profile.version}`,
    );
  }
  if (currentUnit) {
    assertIncludes(design, `> 状态：${currentUnit.code} 已启动，当前 \`${currentUnit.lifecycle}\``, practiceCase.slug);
    assertIncludes(design, `| ${currentUnit.code} | \`${currentUnit.lifecycle}\` |`, practiceCase.slug);
    if (currentUnit.startRef) assertIncludes(design, currentUnit.startRef, practiceCase.slug);
    if (currentUnit.contractPlanVersion) {
      assertIncludes(design, `> 当前单元合同 \`planVersion\`：\`${currentUnit.contractPlanVersion}\``, practiceCase.slug);
    }
    if (currentUnit.planCompatibility) assertIncludes(design, currentUnit.planCompatibility, practiceCase.slug);
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
    assertIncludes(projectHtml, practiceCase.profileRoadmapTitle, `${practiceCase.slug} dist`);
    assertIncludes(projectHtml, practiceCase.profileRoadmapDescription, `${practiceCase.slug} dist`);
    for (const profile of profiles) {
      assertIncludes(projectHtml, profile.version, `${practiceCase.slug}/${profile.version} dist`);
      assertIncludes(projectHtml, profile.status === "CURRENT" ? "CURRENT PROFILE" : profile.status, `${practiceCase.slug}/${profile.version} dist`);
      assertIncludes(projectHtml, profile.title, `${practiceCase.slug}/${profile.version} dist`);
      assertIncludes(projectHtml, profile.description, `${practiceCase.slug}/${profile.version} dist`);
      assertIncludes(projectHtml, profile.gate, `${practiceCase.slug}/${profile.version} dist`);
    }
    if (currentUnit?.startRef) assertIncludes(projectHtml, currentUnit.startRef, `${practiceCase.slug} dist`);
    if (currentUnit?.contractPlanVersion) {
      assertIncludes(projectHtml, `UNIT CONTRACT · PLAN v${currentUnit.contractPlanVersion}`, `${practiceCase.slug} dist`);
    }
    if (currentUnit?.planCompatibility) assertIncludes(projectHtml, currentUnit.planCompatibility, `${practiceCase.slug} dist`);
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
