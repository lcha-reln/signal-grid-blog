import { createHash } from "node:crypto";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configUrl = pathToFileURL(join(root, "src", "practice", "config.ts"));
const unitsUrl = pathToFileURL(join(root, "src", "practice", "units.ts"));
const labsUrl = pathToFileURL(join(root, "src", "practice", "labs.ts"));
const losslessJsonUrl = pathToFileURL(
  join(root, "src", "practice", "lossless-json.ts"),
);
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
const profileFields = new Set([
  "version",
  "title",
  "description",
  "status",
  "gate",
]);
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
const { MATCHING_EXECUTION_POLICIES, MATCHING_GOLDEN_COMMANDS, PRACTICE_LABS } =
  await import(labsUrl.href);
const { parseJsonPreservingIntegers } = await import(losslessJsonUrl.href);

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function isPublicHttpsUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function assertIncludes(haystack, needle, context) {
  assert(
    haystack.includes(needle),
    `${context}: missing ${JSON.stringify(needle)}`,
  );
}

function normalizeMarkdownTableRow(value) {
  return value
    .trim()
    .split("|")
    .map((cell) => cell.trim())
    .join("|");
}

function assertTableIncludes(haystack, needle, context) {
  const normalizedNeedle = normalizeMarkdownTableRow(needle);
  const found = haystack
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .some((line) => normalizeMarkdownTableRow(line).includes(normalizedNeedle));
  assert(found, `${context}: missing table row ${JSON.stringify(needle)}`);
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
  return (
    (lifecycleRanks.get(lifecycle) ?? -1) >=
    (lifecycleRanks.get(minimum) ?? Number.MAX_SAFE_INTEGER)
  );
}

function isFixedCourseRef(value, suffix) {
  return new RegExp(`^course/[a-z][a-z0-9]*(?:\\.\\d+)?-${suffix}$`).test(
    value ?? "",
  );
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
  if (value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replaceAll("''", "'");
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

function localEvidenceRelativePath(value) {
  if (!isPublicHttpsUrl(value)) return undefined;
  const url = new URL(value);
  const base = "/signal-grid-blog/";
  if (
    url.origin !== "https://lcha-reln.github.io" ||
    !url.pathname.startsWith(base)
  ) {
    return undefined;
  }
  assert(
    !url.search && !url.hash,
    `${value}: local evidence URL cannot contain query or hash`,
  );
  try {
    const local = decodeURIComponent(url.pathname.slice(base.length));
    assert(
      local && !isAbsolute(local) && !local.split("/").includes(".."),
      `${value}: invalid local evidence path`,
    );
    return local;
  } catch {
    assert(false, `${value}: local evidence URL cannot be decoded`);
    return undefined;
  }
}

async function sha256File(path) {
  return createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
}

function sameOrderedStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    Array.isArray(expected) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function readObjectField(source, field) {
  return field.split(".").reduce((value, segment) => {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, segment)
    ) {
      return undefined;
    }
    return value[segment];
  }, source);
}

function isGoldenInteger(value) {
  return (
    (typeof value === "number" && Number.isInteger(value) && value >= 0) ||
    (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value))
  );
}

function isRuleSetIdentity(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    isGoldenInteger(value.version) &&
    typeof value.contentHash === "string" &&
    /^sha256:[0-9a-f]{64}$/.test(value.contentHash)
  );
}

function isRuleSetArtifact(value) {
  return (
    isRuleSetIdentity(value) &&
    typeof value.schemaVersion === "string" &&
    value.schemaVersion.length > 0 &&
    typeof value.instrumentId === "string" &&
    value.instrumentId.length > 0 &&
    isGoldenInteger(value.lowerInclusive) &&
    isGoldenInteger(value.upperInclusive) &&
    BigInt(value.lowerInclusive) > 0n &&
    BigInt(value.lowerInclusive) <= BigInt(value.upperInclusive)
  );
}

function isGoldenBook(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    Array.isArray(value.bids) &&
    Array.isArray(value.asks) &&
    [...value.bids, ...value.asks].every(
      (level) =>
        level &&
        isGoldenInteger(level.priceTicks) &&
        BigInt(level.priceTicks) > 0n &&
        Array.isArray(level.orders) &&
        level.orders.every(
          (order) =>
            order &&
            isGoldenInteger(order.orderId) &&
            BigInt(order.orderId) > 0n &&
            isGoldenInteger(order.remainingQuantityLots) &&
            BigInt(order.remainingQuantityLots) > 0n &&
            (isGoldenInteger(order.sequence) ||
              isGoldenInteger(order.acceptanceSequence)) &&
            (!Object.hasOwn(order, "admissionRuleSet") ||
              isRuleSetIdentity(order.admissionRuleSet)),
        ),
    )
  );
}

async function validateNoSymlinkComponents(anchor, target, key) {
  const lexical = relative(anchor, target);
  assert(
    lexical && !lexical.startsWith(`..${sep}`) && lexical !== "..",
    `${key}: path escapes trusted root`,
  );
  let current = anchor;
  for (const segment of lexical.split(sep)) {
    current = join(current, segment);
    const info = await lstat(current);
    assert(
      !info.isSymbolicLink(),
      `${key}: symlink path component is forbidden ${relative(root, current)}`,
    );
  }
}

async function validatePublishedEvidence(unit, key) {
  const contract = unit.evidenceContract;
  assert(contract, `${key}: local evidence has no frozen evidenceContract`);
  if (!contract) return;
  const local = localEvidenceRelativePath(unit.evidenceUrl);
  assert(
    local,
    `${key}: evidence must be hosted under the Signal Grid static site`,
  );
  assert(
    local === contract.publicManifestPath,
    `${key}: evidence URL differs from frozen publicManifestPath`,
  );
  if (!local || local !== contract.publicManifestPath) return;

  const publicRoot = join(root, "public");
  const manifestPath = resolve(publicRoot, local);
  assert(
    manifestPath.startsWith(`${publicRoot}${sep}`),
    `${key}: evidence manifest escapes public directory`,
  );
  assert(
    manifestPath.endsWith(`${sep}manifest.json`),
    `${key}: evidenceUrl must identify manifest.json`,
  );

  const source = await readIfExists(manifestPath);
  assert(source, `${key}: local evidence manifest is missing`);
  if (!source) return;
  assert(
    (await sha256File(manifestPath)) === contract.manifestSha256,
    `${key}: evidence manifest hash differs from the frozen CI artifact`,
  );

  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    assert(false, `${key}: local evidence manifest is not valid JSON`);
    return;
  }

  assert(
    manifest.schemaVersion === contract.schemaVersion,
    `${key}: evidence schemaVersion changed`,
  );
  assert(manifest.case === unit.projectSlug, `${key}: evidence case changed`);
  assert(
    manifest.project === contract.project,
    `${key}: evidence project changed`,
  );
  assert(manifest.unit === unit.code, `${key}: evidence unit changed`);
  assert(
    manifest.unitTag === unit.completeRef,
    `${key}: evidence unitTag differs from completeRef`,
  );
  assert(
    manifest.productRelease === (unit.productRelease ?? null),
    `${key}: evidence productRelease changed`,
  );
  assert(
    manifest.planVersion === unit.contractPlanVersion,
    `${key}: evidence planVersion differs from unit contract`,
  );
  assert(
    manifest.source?.commit === unit.completeCommit,
    `${key}: evidence source differs from completeCommit`,
  );
  assert(
    manifest.source?.dirty === false,
    `${key}: dirty evidence cannot be published`,
  );
  assert(
    typeof manifest.generatedAt === "string" &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(
        manifest.generatedAt,
      ),
    `${key}: evidence generatedAt is not RFC 3339 UTC`,
  );
  for (const field of ["java", "os", "arch"]) {
    assert(
      typeof manifest.environment?.[field] === "string" &&
        manifest.environment[field].trim(),
      `${key}: evidence environment.${field} is empty`,
    );
  }
  assert(
    sameOrderedStrings(manifest.limitations, contract.limitations),
    `${key}: evidence limitations differ from the frozen contract`,
  );
  assert(
    sameOrderedStrings(
      (manifest.claims ?? []).map((claim) => claim.id),
      contract.claimIds,
    ),
    `${key}: evidence claim ids or order differ from the frozen contract`,
  );

  const claimIds = new Set();
  const claimsById = new Map();
  const artifactPaths = new Set();
  const parsedJsonArtifacts = new Map();
  let realPublicRoot;
  let realEvidenceRoot;
  try {
    await validateNoSymlinkComponents(publicRoot, manifestPath, key);
    const manifestInfo = await lstat(manifestPath);
    assert(
      manifestInfo.isFile() && !manifestInfo.isSymbolicLink(),
      `${key}: evidence manifest must be a regular file`,
    );
    realPublicRoot = await realpath(publicRoot);
    const realManifest = await realpath(manifestPath);
    assert(
      realManifest.startsWith(`${realPublicRoot}${sep}`),
      `${key}: evidence manifest escapes real public directory`,
    );
    realEvidenceRoot = await realpath(dirname(manifestPath));
  } catch {
    assert(false, `${key}: cannot resolve local evidence tree`);
    return;
  }

  for (const claim of manifest.claims ?? []) {
    assert(
      typeof claim.id === "string" && claim.id.trim(),
      `${key}: evidence claim has no id`,
    );
    assert(
      !claimIds.has(claim.id),
      `${key}: duplicate evidence claim ${claim.id}`,
    );
    claimIds.add(claim.id);
    claimsById.set(claim.id, claim);
    assert(
      claim.status === "pass",
      `${key}: non-pass evidence claim ${claim.id}`,
    );
    assert(
      typeof claim.category === "string" && claim.category.trim(),
      `${key}: claim ${claim.id} has no category`,
    );
    assert(
      typeof claim.statement === "string" && claim.statement.trim(),
      `${key}: claim ${claim.id} has no statement`,
    );
    assert(
      typeof claim.command === "string" && claim.command.trim(),
      `${key}: claim ${claim.id} has no command`,
    );
    assert(
      claim.observations &&
        typeof claim.observations === "object" &&
        !Array.isArray(claim.observations),
      `${key}: claim ${claim.id} has no observations`,
    );
    assert(
      Array.isArray(claim.artifacts) && claim.artifacts.length > 0,
      `${key}: claim ${claim.id} has no artifact`,
    );

    for (const artifact of claim.artifacts ?? []) {
      const artifactRelative = artifact.path;
      const validRelative =
        typeof artifactRelative === "string" &&
        artifactRelative.length > 0 &&
        !isAbsolute(artifactRelative) &&
        !artifactRelative.includes("\\") &&
        artifactRelative
          .split("/")
          .every((segment) => segment && segment !== "." && segment !== "..");
      assert(
        validRelative,
        `${key}: invalid evidence artifact path ${artifactRelative}`,
      );
      if (!validRelative) continue;
      assert(
        /^[0-9a-f]{64}$/.test(artifact.sha256 ?? ""),
        `${key}: invalid artifact hash ${artifactRelative}`,
      );
      assert(
        !artifactPaths.has(artifactRelative),
        `${key}: duplicate evidence artifact ${artifactRelative}`,
      );
      artifactPaths.add(artifactRelative);

      const artifactPath = resolve(dirname(manifestPath), artifactRelative);
      assert(
        artifactPath.startsWith(`${dirname(manifestPath)}${sep}`),
        `${key}: artifact escapes evidence directory ${artifactRelative}`,
      );
      try {
        const artifactInfo = await lstat(artifactPath);
        assert(
          artifactInfo.isFile() && !artifactInfo.isSymbolicLink(),
          `${key}: evidence artifact must be a regular file ${artifactRelative}`,
        );
        const realArtifact = await realpath(artifactPath);
        assert(
          realArtifact.startsWith(`${realEvidenceRoot}${sep}`),
          `${key}: real artifact escapes evidence directory ${artifactRelative}`,
        );
        assert(
          (await sha256File(artifactPath)) === artifact.sha256,
          `${key}: artifact hash mismatch ${artifactRelative}`,
        );
        if (artifactRelative.endsWith(".json")) {
          const parsedArtifact = JSON.parse(
            await readFile(artifactPath, "utf8"),
          );
          parsedJsonArtifacts.set(artifactRelative, parsedArtifact);
          if (Object.hasOwn(parsedArtifact, "status")) {
            assert(
              parsedArtifact.status === "PASS",
              `${key}: JSON evidence artifact is not PASS ${artifactRelative}`,
            );
          }
        }
      } catch {
        assert(
          false,
          `${key}: evidence artifact is missing ${artifactRelative}`,
        );
      }
    }
  }

  for (const fact of contract.reportFacts ?? []) {
    assert(
      artifactPaths.has(fact.artifactPath),
      `${key}: semantic report is not bound by manifest ${fact.artifactPath}`,
    );
    const report = parsedJsonArtifacts.get(fact.artifactPath);
    assert(
      report,
      `${key}: semantic report is not valid JSON ${fact.artifactPath}`,
    );
    if (!report) continue;
    const actual = readObjectField(report, fact.field);
    assert(
      Object.is(actual, fact.equals),
      `${key}: semantic report fact changed ${fact.artifactPath}#${fact.field}`,
    );
    if (fact.claimId && fact.observationField) {
      const claim = claimsById.get(fact.claimId);
      assert(
        claim,
        `${key}: semantic report fact references missing claim ${fact.claimId}`,
      );
      assert(
        Object.is(
          readObjectField(claim?.observations, fact.observationField),
          actual,
        ),
        `${key}: claim observation differs from report ${fact.claimId}#${fact.observationField}`,
      );
    }
  }
}

const caseSlugs = new Set();
const caseIndexes = new Set();
const designDocuments = new Set();
const repositoryUrls = new Set();
const casesBySlug = new Map();

for (const practiceCase of PRACTICE_CASES) {
  assert(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(practiceCase.slug),
    `${practiceCase.slug}: invalid slug`,
  );
  assert(
    !caseSlugs.has(practiceCase.slug),
    `${practiceCase.slug}: duplicate slug`,
  );
  caseSlugs.add(practiceCase.slug);
  casesBySlug.set(practiceCase.slug, practiceCase);
  assert(
    /^\d+$/.test(practiceCase.index),
    `${practiceCase.slug}: invalid case index`,
  );
  assert(
    !caseIndexes.has(practiceCase.index),
    `${practiceCase.slug}: duplicate case index`,
  );
  caseIndexes.add(practiceCase.index);
  const validDesignDocument =
    /^docs\/[A-Za-z0-9_./-]+\.md$/.test(practiceCase.designDocument) &&
    !practiceCase.designDocument.split("/").includes("..");
  assert(validDesignDocument, `${practiceCase.slug}: invalid designDocument`);
  assert(
    !designDocuments.has(practiceCase.designDocument),
    `${practiceCase.slug}: duplicate designDocument`,
  );
  designDocuments.add(practiceCase.designDocument);
}

const unitKeys = new Set();
const unitOrders = new Set();
const releaseTargetKeys = new Set();
const unitsByKey = new Map();
for (const unit of PRACTICE_UNITS) {
  const key = `${unit.projectSlug}/${unit.code}`;
  const practiceCase = casesBySlug.get(unit.projectSlug);
  const profile = practiceCase?.profileRoadmap.find(
    (item) => item.version === unit.profileVersion,
  );
  const track = practiceCase?.tracks.find(
    (item) => item.code === unit.trackCode,
  );

  assert(!unitKeys.has(key), `${key}: duplicate registered unit`);
  unitKeys.add(key);
  unitsByKey.set(key, unit);
  assert(practiceCase, `${key}: unit points to a missing practice case`);
  assert(
    profile,
    `${key}: unit points to a missing profile ${unit.profileVersion}`,
  );
  assert(
    profile?.status !== "LOCKED",
    `${key}: unit points to LOCKED profile ${unit.profileVersion}`,
  );
  assert(track, `${key}: unit points to a missing track ${unit.trackCode}`);
  assert(
    track?.status !== "LOCKED",
    `${key}: unit points to LOCKED track ${unit.trackCode}`,
  );
  assert(
    unit.code.startsWith(unit.trackCode),
    `${key}: unit and track codes disagree`,
  );
  assert(/^[A-Z][0-9]{2}$/.test(unit.code), `${key}: invalid unit code`);
  assert(
    Number.isInteger(unit.order) && unit.order > 0,
    `${key}: invalid unit order`,
  );
  const orderKey = `${unit.projectSlug}/${unit.order}`;
  assert(
    !unitOrders.has(orderKey),
    `${key}: duplicate unit order ${unit.order}`,
  );
  unitOrders.add(orderKey);
  assert(
    lifecycleRanks.has(unit.lifecycle),
    `${key}: invalid lifecycle ${unit.lifecycle}`,
  );
  assert(
    typeof unit.title === "string" && unit.title.trim(),
    `${key}: empty title`,
  );
  assert(
    typeof unit.summary === "string" && unit.summary.trim(),
    `${key}: empty summary`,
  );
  assert(
    typeof unit.objective === "string" && unit.objective.trim(),
    `${key}: empty objective`,
  );
  assert(
    typeof unit.stopPoint === "string" && unit.stopPoint.trim(),
    `${key}: empty stopPoint`,
  );
  assert(
    /^\d+\.\d+$/.test(unit.contractPlanVersion),
    `${key}: invalid contractPlanVersion`,
  );
  const lifecycleRank = lifecycleRanks.get(unit.lifecycle) ?? -1;
  if (unit.releaseTarget) {
    const releaseTargetKey = `${unit.projectSlug}/${unit.releaseTarget}`;
    assert(
      /^[a-z][a-z0-9-]*-\d+\.\d+\.\d+$/.test(unit.releaseTarget),
      `${key}: invalid releaseTarget`,
    );
    assert(
      practiceCase?.milestones.some(
        (milestone) => milestone.version === unit.releaseTarget,
      ),
      `${key}: releaseTarget is not a declared case milestone`,
    );
    assert(
      unit.stopPoint.includes(unit.releaseTarget),
      `${key}: stopPoint omits releaseTarget`,
    );
    assert(
      !releaseTargetKeys.has(releaseTargetKey),
      `${key}: duplicate releaseTarget`,
    );
    releaseTargetKeys.add(releaseTargetKey);
  }
  if (unit.productRelease) {
    assert(
      lifecycleRank >= lifecycleRanks.get("CODE_VERIFIED"),
      `${key}: productRelease cannot exist before CODE_VERIFIED`,
    );
    assert(
      unit.productRelease === unit.releaseTarget,
      `${key}: productRelease differs from releaseTarget`,
    );
  }
  if (
    unit.releaseTarget &&
    lifecycleRank >= lifecycleRanks.get("CODE_VERIFIED")
  ) {
    assert(
      unit.productRelease === unit.releaseTarget,
      `${key}: named stop point requires its productRelease from CODE_VERIFIED onward`,
    );
  }
  if (!unit.releaseTarget) {
    assert(
      !unit.productRelease,
      `${key}: productRelease has no declared releaseTarget`,
    );
  }
  if (lifecycleRank >= lifecycleRanks.get("READY")) {
    assert(
      isFixedCourseRef(unit.startRef, "start"),
      `${key}: invalid or floating startRef`,
    );
    assert(
      unit.startRef?.startsWith(`course/${unit.code.toLowerCase()}`),
      `${key}: startRef belongs to another unit`,
    );
  } else {
    assert(
      !unit.startRef,
      `${key}: ${unit.lifecycle} must not publish startRef before READY`,
    );
  }
  if (unit.completeRef) {
    assert(
      isFixedCourseRef(unit.completeRef, "complete"),
      `${key}: invalid or floating completeRef`,
    );
    assert(
      unit.completeRef.startsWith(`course/${unit.code.toLowerCase()}`),
      `${key}: completeRef belongs to another unit`,
    );
  }
  if (lifecycleRank >= lifecycleRanks.get("CODE_VERIFIED")) {
    assert(unit.completeRef, `${key}: ${unit.lifecycle} requires completeRef`);
    assert(
      /^[0-9a-f]{40}$/.test(unit.completeCommit ?? ""),
      `${key}: ${unit.lifecycle} requires a full completeCommit`,
    );
    assert(
      unit.evidencePath,
      `${key}: ${unit.lifecycle} requires evidencePath`,
    );
    assert(
      unit.evidenceContract,
      `${key}: ${unit.lifecycle} requires evidenceContract`,
    );
  } else {
    assert(
      !unit.completeRef,
      `${key}: ${unit.lifecycle} must not publish completeRef before CODE_VERIFIED`,
    );
    assert(
      !unit.completeCommit,
      `${key}: ${unit.lifecycle} must not publish completeCommit before CODE_VERIFIED`,
    );
    assert(
      !unit.evidencePath,
      `${key}: ${unit.lifecycle} must not publish evidencePath before CODE_VERIFIED`,
    );
    assert(
      !unit.evidenceUrl,
      `${key}: ${unit.lifecycle} must not publish evidenceUrl before CODE_VERIFIED`,
    );
    assert(
      !unit.evidenceContract,
      `${key}: ${unit.lifecycle} must not publish evidenceContract before CODE_VERIFIED`,
    );
  }
  if (unit.evidenceContract) {
    assert(
      typeof unit.evidenceContract.schemaVersion === "string" &&
        unit.evidenceContract.schemaVersion.trim(),
      `${key}: empty evidence schemaVersion`,
    );
    assert(
      typeof unit.evidenceContract.project === "string" &&
        unit.evidenceContract.project.trim(),
      `${key}: empty evidence project`,
    );
    assert(
      typeof unit.evidenceContract.publicManifestPath === "string" &&
        unit.evidenceContract.publicManifestPath.endsWith("/manifest.json") &&
        !isAbsolute(unit.evidenceContract.publicManifestPath) &&
        unit.evidenceContract.publicManifestPath
          .split("/")
          .every((segment) => segment && segment !== "." && segment !== ".."),
      `${key}: invalid evidence publicManifestPath`,
    );
    assert(
      /^[0-9a-f]{64}$/.test(unit.evidenceContract.manifestSha256 ?? ""),
      `${key}: invalid evidence manifestSha256`,
    );
    for (const field of ["claimIds", "limitations"]) {
      const values = unit.evidenceContract[field];
      assert(
        Array.isArray(values) && values.length > 0,
        `${key}: empty evidenceContract.${field}`,
      );
      assert(
        new Set(values).size === values.length,
        `${key}: duplicate evidenceContract.${field}`,
      );
      assert(
        values.every((value) => typeof value === "string" && value.trim()),
        `${key}: blank evidenceContract.${field}`,
      );
    }
    const reportFacts = unit.evidenceContract.reportFacts;
    assert(
      Array.isArray(reportFacts) && reportFacts.length > 0,
      `${key}: empty evidenceContract.reportFacts`,
    );
    const reportFactKeys = new Set();
    for (const fact of reportFacts ?? []) {
      const factKey = `${fact.artifactPath}\0${fact.field}`;
      const validExpected =
        fact.equals === null ||
        typeof fact.equals === "string" ||
        typeof fact.equals === "boolean" ||
        (typeof fact.equals === "number" && Number.isFinite(fact.equals));
      assert(
        typeof fact.artifactPath === "string" &&
          fact.artifactPath.startsWith("reports/") &&
          fact.artifactPath.endsWith(".json") &&
          !isAbsolute(fact.artifactPath) &&
          fact.artifactPath
            .split("/")
            .every((segment) => segment && segment !== "." && segment !== ".."),
        `${key}: invalid semantic report path ${fact.artifactPath}`,
      );
      assert(
        typeof fact.field === "string" &&
          /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(fact.field),
        `${key}: invalid semantic report field ${fact.field}`,
      );
      assert(validExpected, `${key}: invalid semantic report value ${factKey}`);
      assert(
        !reportFactKeys.has(factKey),
        `${key}: duplicate semantic report fact ${factKey}`,
      );
      reportFactKeys.add(factKey);
      assert(
        Boolean(fact.claimId) === Boolean(fact.observationField),
        `${key}: semantic report claim binding is incomplete ${factKey}`,
      );
      if (fact.claimId) {
        assert(
          unit.evidenceContract.claimIds.includes(fact.claimId),
          `${key}: semantic report fact references unknown claim ${fact.claimId}`,
        );
        assert(
          /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(
            fact.observationField ?? "",
          ),
          `${key}: invalid claim observation field ${fact.observationField}`,
        );
      }
    }
  }
  if (lifecycleRank >= lifecycleRanks.get("CONTENT_VERIFIED")) {
    assert(
      Array.isArray(unit.expectedLessons) && unit.expectedLessons.length > 0,
      `${key}: ${unit.lifecycle} requires expectedLessons`,
    );
  }
  if (unit.expectedLessons) {
    const expectedOrders = new Set();
    const expectedPermalinks = new Set();
    for (const lesson of unit.expectedLessons) {
      assert(
        Number.isInteger(lesson.lessonOrder) && lesson.lessonOrder > 0,
        `${key}: invalid expected lesson order`,
      );
      assert(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lesson.permalink ?? ""),
        `${key}: invalid expected lesson permalink`,
      );
      assert(
        !expectedOrders.has(lesson.lessonOrder),
        `${key}: duplicate expected lesson order`,
      );
      assert(
        !expectedPermalinks.has(lesson.permalink),
        `${key}: duplicate expected lesson permalink`,
      );
      expectedOrders.add(lesson.lessonOrder);
      expectedPermalinks.add(lesson.permalink);
    }
  }
  if (unit.evidencePath) {
    assert(
      !unit.evidencePath.startsWith("/") &&
        !unit.evidencePath.split("/").includes(".."),
      `${key}: invalid evidencePath`,
    );
  }
  if (unit.evidenceUrl)
    assert(
      isPublicHttpsUrl(unit.evidenceUrl),
      `${key}: evidenceUrl must be a public HTTPS URL`,
    );
  if (unit.lifecycle === "PUBLISHED") {
    assert(unit.evidenceUrl, `${key}: PUBLISHED requires a public evidenceUrl`);
    await validatePublishedEvidence(unit, key);
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
  ]) {
    assert(
      Array.isArray(unit[field]) &&
        unit[field].length > 0 &&
        unit[field].every((value) => typeof value === "string" && value.trim()),
      `${key}: empty ${field}`,
    );
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
    assert(
      isFixedCourseRef(superseded.ref, "start"),
      `${key}: invalid superseded start ref`,
    );
    assert(
      superseded.ref !== unit.startRef,
      `${key}: canonical start ref supersedes itself`,
    );
    assert(
      !supersededRefs.has(superseded.ref),
      `${key}: duplicate superseded start ref`,
    );
    assert(
      typeof superseded.reason === "string" && superseded.reason.trim(),
      `${key}: superseded ref has no reason`,
    );
    supersededRefs.add(superseded.ref);
  }
}

const labsByKey = new Map();
const matchingLabSource = await readIfExists(
  join(root, "src", "practice", "matching-lab.ts"),
);
const matchingLabComponent = await readIfExists(
  join(root, "src", "components", "MatchingLab.astro"),
);
for (const forbidden of [
  "STUDENT_FAILURE",
  "SYSTEM_ERROR",
  "innerHTML",
  "outerHTML",
  "eval(",
  "new Function(",
]) {
  assert(
    !matchingLabSource.includes(forbidden) &&
      !matchingLabComponent.includes(forbidden),
    `Matching Lab browser runtime contains forbidden capability or judge term ${forbidden}`,
  );
}
for (const requiredRuntimeToken of [
  "INVALID_EXECUTION_POLICY",
  "FOK_NOT_FILLABLE",
  "POST_ONLY_WOULD_TAKE",
  "REMAINDER_CANCELED",
  "IOC_REMAINDER",
  "requireAcceptedExecutionPolicy",
]) {
  assert(
    matchingLabSource.includes(requiredRuntimeToken),
    `Matching Lab browser runtime is missing execution-policy contract ${requiredRuntimeToken}`,
  );
}
for (const requiredUiToken of [
  "data-model-execution-policy",
  "POLICY_REJECTED",
  "REMAINDER_CANCELED_ONLY",
  "TRADES_AND_REMAINDER_CANCELED",
]) {
  assert(
    matchingLabComponent.includes(requiredUiToken),
    `Matching Lab component is missing execution-policy control ${requiredUiToken}`,
  );
}

for (const lab of PRACTICE_LABS) {
  const key = `${lab.projectSlug}/${lab.unitCode}`;
  const allowedFields = new Set([
    "kind",
    "projectSlug",
    "unitCode",
    "title",
    "summary",
    "modes",
    "goldenReplay",
    "browserModel",
  ]);
  assert(
    Object.keys(lab).every((field) => allowedFields.has(field)),
    `${key}: lab contains an undeclared top-level field`,
  );
  assert(!labsByKey.has(key), `${key}: duplicate lab registry entry`);
  labsByKey.set(key, lab);
  const unit = unitsByKey.get(key);
  assert(unit, `${key}: lab references an unregistered unit`);
  assert(lab.kind === "MATCHING", `${key}: unsupported lab kind ${lab.kind}`);
  assert(
    typeof lab.title === "string" && lab.title.trim(),
    `${key}: lab title is empty`,
  );
  assert(
    typeof lab.summary === "string" && lab.summary.trim(),
    `${key}: lab summary is empty`,
  );
  const usesBrowserModel = lab.modes?.[1] === "BROWSER_MODEL";
  const usesEvidencePrediction = lab.modes?.[1] === "EVIDENCE_PREDICTION";
  assert(
    Array.isArray(lab.modes) &&
      lab.modes.length === 2 &&
      lab.modes[0] === "JAVA_GOLDEN_REPLAY" &&
      (usesBrowserModel || usesEvidencePrediction),
    `${key}: matching lab modes must remain Golden replay then one honest prediction mode`,
  );
  assert(
    usesBrowserModel === Boolean(lab.browserModel),
    `${key}: browser model configuration and selected mode differ`,
  );

  const replay = lab.goldenReplay;
  const replayFields = new Set([
    "presentation",
    "manifestPath",
    "scenarioPackPath",
    "eventBatchesPath",
    "canonicalHistoryPath",
    "checkBindings",
    "supportingReports",
    "digest",
    "metrics",
    "scenarios",
  ]);
  assert(
    replay && Object.keys(replay).every((field) => replayFields.has(field)),
    `${key}: Golden replay contains an undeclared field`,
  );
  assert(
    replay.presentation === "GOLDEN_HISTORY" ||
      replay.presentation === "COUNTEREXAMPLE",
    `${key}: unsupported Golden presentation ${replay.presentation}`,
  );
  const bindingFields = [
    "digestField",
    "scenarioCountField",
    "commandCountField",
  ];
  assert(
    replay.checkBindings &&
      Object.keys(replay.checkBindings).length === bindingFields.length &&
      bindingFields.every(
        (field) =>
          typeof replay.checkBindings[field] === "string" &&
          /^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(
            replay.checkBindings[field],
          ),
      ),
    `${key}: invalid Golden check bindings`,
  );
  const supportRoles = (replay.supportingReports ?? []).map(
    (report) => report.role,
  );
  assert(
    Array.isArray(replay.supportingReports) &&
      replay.supportingReports.every(
        (report) =>
          report &&
          Object.keys(report).length === 2 &&
          Object.hasOwn(report, "role") &&
          Object.hasOwn(report, "path") &&
          (report.role === "REPLAY" || report.role === "MUTANTS"),
      ) &&
      new Set(supportRoles).size === supportRoles.length,
    `${key}: invalid Golden supporting reports`,
  );
  assert(
    (replay.presentation === "GOLDEN_HISTORY" && supportRoles.length === 0) ||
      (replay.presentation === "COUNTEREXAMPLE" &&
        sameOrderedStrings(supportRoles, ["REPLAY", "MUTANTS"])),
    `${key}: Golden presentation and supporting reports differ`,
  );
  const staticPaths = [
    replay.manifestPath,
    replay.scenarioPackPath,
    replay.eventBatchesPath,
    replay.canonicalHistoryPath,
    ...(replay.supportingReports ?? []).map((report) => report.path),
  ];
  assert(
    new Set(staticPaths).size === staticPaths.length,
    `${key}: duplicate lab static source`,
  );
  for (const path of staticPaths) {
    assert(
      typeof path === "string" &&
        path.startsWith(
          `practice/${lab.projectSlug}/${lab.unitCode.toLowerCase()}/evidence/`,
        ) &&
        !isAbsolute(path) &&
        path
          .split("/")
          .every((segment) => segment && segment !== "." && segment !== ".."),
      `${key}: invalid lab static path ${path}`,
    );
    assert(
      await exists(join(root, "public", path)),
      `${key}: missing lab static source ${path}`,
    );
  }
  assert(
    unit?.evidenceContract?.publicManifestPath === replay.manifestPath,
    `${key}: lab manifest differs from the unit evidence contract`,
  );
  let replayManifest;
  try {
    replayManifest = parseJsonPreservingIntegers(
      await readFile(join(root, "public", replay.manifestPath), "utf8"),
    );
  } catch (error) {
    assert(
      false,
      `${key}: cannot parse lab evidence manifest (${error.message})`,
    );
  }
  const manifestArtifacts = new Map();
  for (const claim of replayManifest?.claims ?? []) {
    for (const artifact of claim.artifacts ?? []) {
      manifestArtifacts.set(artifact.path, artifact.sha256);
    }
  }
  for (const path of [
    replay.scenarioPackPath,
    replay.eventBatchesPath,
    replay.canonicalHistoryPath,
    ...(replay.supportingReports ?? []).map((report) => report.path),
  ]) {
    const artifactPath = relative(dirname(replay.manifestPath), path);
    const manifestHash = manifestArtifacts.get(artifactPath);
    assert(
      manifestHash,
      `${key}: lab source is not a manifest artifact ${artifactPath}`,
    );
    if (manifestHash) {
      assert(
        (await sha256File(join(root, "public", path))) === manifestHash,
        `${key}: lab source hash differs from manifest ${artifactPath}`,
      );
    }
  }
  assert(
    /^sha256:[0-9a-f]{64}$/.test(replay.digest ?? ""),
    `${key}: invalid lab digest`,
  );
  assert(
    manifestArtifacts.get(
      relative(dirname(replay.manifestPath), replay.canonicalHistoryPath),
    ) === replay.digest.replace(/^sha256:/, ""),
    `${key}: lab canonical artifact hash differs from displayed digest`,
  );
  assert(
    Array.isArray(replay.metrics) &&
      replay.metrics.length > 0 &&
      replay.metrics.every(
        (metric) =>
          metric.label?.trim() && metric.value?.trim() && metric.note?.trim(),
      ),
    `${key}: lab metrics are empty`,
  );
  const scenarioIds = new Set();
  let configuredCommands = 0;
  for (const scenario of replay.scenarios ?? []) {
    assert(
      typeof scenario.id === "string" &&
        scenario.id.trim() &&
        !scenarioIds.has(scenario.id) &&
        scenario.title?.trim() &&
        scenario.focus?.trim() &&
        Number.isInteger(scenario.commands) &&
        scenario.commands > 0,
      `${key}: invalid or duplicate lab scenario ${scenario.id}`,
    );
    scenarioIds.add(scenario.id);
    configuredCommands += scenario.commands;
  }
  assert(scenarioIds.size > 0, `${key}: lab has no Golden scenarios`);

  let scenarioPack;
  let eventBatches;
  const supportingDocuments = new Map();
  try {
    scenarioPack = parseJsonPreservingIntegers(
      await readFile(join(root, "public", replay.scenarioPackPath), "utf8"),
    );
    eventBatches = parseJsonPreservingIntegers(
      await readFile(join(root, "public", replay.eventBatchesPath), "utf8"),
    );
    for (const report of replay.supportingReports ?? []) {
      supportingDocuments.set(
        report.role,
        parseJsonPreservingIntegers(
          await readFile(join(root, "public", report.path), "utf8"),
        ),
      );
    }
  } catch (error) {
    assert(false, `${key}: cannot parse lab Golden sources (${error.message})`);
  }
  const sourceScenarios = scenarioPack?.scenarios ?? [];
  const sourceIds = sourceScenarios.map((scenario) => scenario.scenarioId);
  const sourceCommands = sourceScenarios.reduce(
    (total, scenario) => total + (scenario.commands?.length ?? 0),
    0,
  );
  const sourceCommandTypes = new Set(
    sourceScenarios.flatMap((scenario) =>
      (scenario.commands ?? []).map((command) => command.type ?? "PLACE"),
    ),
  );
  assert(
    [...sourceCommandTypes].every((command) =>
      MATCHING_GOLDEN_COMMANDS.includes(command),
    ),
    `${key}: Golden corpus contains an unsupported command type`,
  );
  assert(
    sourceIds.length === scenarioIds.size &&
      sourceIds.every((id, index) => id === replay.scenarios[index]?.id) &&
      sourceScenarios.every(
        (scenario, index) =>
          scenario.commands?.length === replay.scenarios[index]?.commands,
      ) &&
      sourceCommands === configuredCommands,
    `${key}: lab catalog differs from its Golden scenario pack`,
  );
  const expectedEventScenarios = sourceScenarios.map((scenario) => ({
    scenarioId: scenario.scenarioId,
    cases: scenario.commands.map((command) => {
      const common = {
        caseId: command.caseId,
        ...(command.type ? { type: command.type } : {}),
        ...(command.entrypoint ? { entrypoint: command.entrypoint } : {}),
        input: command.input,
        ...(command.expectedRuleSet
          ? { expectedRuleSet: command.expectedRuleSet }
          : {}),
      };
      return command.expected?.stateAfter
        ? {
            ...common,
            applicationSequence: command.expected.applicationSequence,
            events: command.expected.events,
            stateAfter: command.expected.stateAfter,
          }
        : {
            ...common,
            events: command.expected?.events,
            bookAfter: command.expected?.bookAfter,
          };
    }),
  }));
  assert(
    JSON.stringify(eventBatches?.scenarios) ===
      JSON.stringify(expectedEventScenarios),
    `${key}: lab scenario pack and event-batches are not the same Golden corpus`,
  );
  const allSourceCommands = sourceScenarios.flatMap(
    (scenario) => scenario.commands ?? [],
  );
  const governedCommands = allSourceCommands.filter(
    (command) => command.expected?.stateAfter !== undefined,
  );
  const usesGovernedOutcomes =
    allSourceCommands.length > 0 &&
    governedCommands.length === allSourceCommands.length;
  assert(
    governedCommands.length === 0 || usesGovernedOutcomes,
    `${key}: Golden corpus mixes legacy bookAfter and governed stateAfter results`,
  );
  assert(
    usesEvidencePrediction === usesGovernedOutcomes,
    `${key}: evidence prediction mode requires every command to expose governed stateAfter`,
  );
  if (usesEvidencePrediction) {
    assert(
      sourceCommandTypes.has("PREPARE_RULE_SET") &&
        sourceCommandTypes.has("ACTIVATE_RULE_SET") &&
        !lab.browserModel,
      `${key}: evidence prediction must expose real control commands without a browser matcher`,
    );
    for (const scenario of sourceScenarios) {
      for (const [commandIndex, command] of (
        scenario.commands ?? []
      ).entries()) {
        const commandKey = `${key}/${scenario.scenarioId}/${command.caseId}`;
        const expected = command.expected;
        const state = expected?.stateAfter;
        const expectedApplicationSequence = isGoldenInteger(
          expected?.applicationSequence,
        )
          ? BigInt(expected.applicationSequence)
          : undefined;
        assert(
          expectedApplicationSequence === BigInt(commandIndex + 1),
          `${commandKey}: applicationSequence is not fresh-state contiguous`,
        );
        assert(
          state &&
            isGoldenInteger(state.nextApplicationSequence) &&
            expectedApplicationSequence !== undefined &&
            BigInt(state.nextApplicationSequence) ===
              expectedApplicationSequence + 1n &&
            isGoldenInteger(state.nextAcceptanceSequence) &&
            isGoldenInteger(state.controlRevision) &&
            isRuleSetArtifact(state.activeRuleSet) &&
            (!Object.hasOwn(state, "preparedRuleSet") ||
              isRuleSetArtifact(state.preparedRuleSet)) &&
            isGoldenBook(state.book),
          `${commandKey}: governed stateAfter is incomplete`,
        );
        if (state?.lastActivationFence !== undefined) {
          const fence = state.lastActivationFence;
          assert(
            isGoldenInteger(fence?.applicationSequence) &&
              isGoldenInteger(fence?.controlRevision) &&
              isGoldenInteger(fence?.firstAcceptanceSequence),
            `${commandKey}: activation fence is incomplete`,
          );
        }
        const type = command.type ?? "PLACE";
        if (type === "PLACE" && command.entrypoint === "GOVERNED") {
          assert(
            isRuleSetIdentity(command.expectedRuleSet),
            `${commandKey}: governed Place has no expected rule identity`,
          );
        }
        const events = expected?.events ?? [];
        for (const event of events) {
          if (
            [
              "PLACE_REJECTED",
              "CANCEL_REJECTED",
              "ACCEPTED",
              "RESTED",
              "REMAINDER_CANCELED",
              "CANCELED",
            ].includes(event.type)
          ) {
            assert(
              isRuleSetIdentity(event.executionRuleSet),
              `${commandKey}: ${event.type} has no execution rule attribution`,
            );
          }
          if (
            ["ACCEPTED", "RESTED", "REMAINDER_CANCELED", "CANCELED"].includes(
              event.type,
            )
          ) {
            assert(
              isRuleSetIdentity(event.admissionRuleSet),
              `${commandKey}: ${event.type} has no admission rule attribution`,
            );
          }
          if (event.type === "TRADE") {
            assert(
              isRuleSetIdentity(event.makerAdmissionRuleSet) &&
                isRuleSetIdentity(event.takerAdmissionRuleSet) &&
                isRuleSetIdentity(event.executionRuleSet),
              `${commandKey}: Trade attribution is incomplete`,
            );
          }
          if (event.type === "RULE_SET_ACTIVATED") {
            assert(
              isRuleSetIdentity(event.previousActive) &&
                isRuleSetIdentity(event.active) &&
                isGoldenInteger(event.fence?.applicationSequence) &&
                isGoldenInteger(event.fence?.controlRevision) &&
                isGoldenInteger(event.fence?.firstAcceptanceSequence),
              `${commandKey}: activation event has no exact fence`,
            );
          }
        }
      }
    }
  }
  for (const scenario of sourceScenarios) {
    for (const command of scenario.commands ?? []) {
      if ((command.type ?? "PLACE") !== "PLACE") continue;
      const rawPolicy = command.input?.executionPolicy ?? "GTC";
      assert(
        typeof rawPolicy === "string" && rawPolicy.length > 0,
        `${key}/${scenario.scenarioId}/${command.caseId}: raw executionPolicy is invalid`,
      );
      const normalizedPolicy = MATCHING_EXECUTION_POLICIES.includes(rawPolicy)
        ? rawPolicy
        : undefined;
      if (normalizedPolicy && usesBrowserModel) {
        assert(
          lab.browserModel?.supportedExecutionPolicies?.includes(
            normalizedPolicy,
          ),
          `${key}/${scenario.scenarioId}/${command.caseId}: corpus policy is unsupported by the browser model`,
        );
      }
      const events = command.expected?.events ?? [];
      const accepted = events.find((event) => event.type === "ACCEPTED");
      if (accepted) {
        assert(
          !(
            lab.browserModel?.requireAcceptedExecutionPolicy ??
            usesGovernedOutcomes
          ) || Object.hasOwn(accepted, "executionPolicy"),
          `${key}/${scenario.scenarioId}/${command.caseId}: Accepted omits required executionPolicy`,
        );
        if (Object.hasOwn(accepted, "executionPolicy")) {
          assert(
            MATCHING_EXECUTION_POLICIES.includes(accepted.executionPolicy) &&
              accepted.executionPolicy === normalizedPolicy,
            `${key}/${scenario.scenarioId}/${command.caseId}: Accepted executionPolicy is not the normalized input`,
          );
        }
      }
      const remainderIndex = events.findIndex(
        (event) => event.type === "REMAINDER_CANCELED",
      );
      if (remainderIndex >= 0) {
        const remainder = events[remainderIndex];
        let canceledQuantityIsPositive = false;
        try {
          canceledQuantityIsPositive =
            BigInt(remainder.canceledQuantityLots) > 0n;
        } catch {
          canceledQuantityIsPositive = false;
        }
        assert(
          normalizedPolicy === "IOC" &&
            remainder.reason === "IOC_REMAINDER" &&
            canceledQuantityIsPositive &&
            remainderIndex === events.length - 1 &&
            !events.some((event) => event.type === "RESTED"),
          `${key}/${scenario.scenarioId}/${command.caseId}: invalid IOC RemainderCanceled event`,
        );
      }
    }
  }
  if (Object.hasOwn(eventBatches ?? {}, "status")) {
    assert(
      eventBatches.status === "PASS",
      `${key}: lab event report is not PASS`,
    );
  }
  if (Object.hasOwn(eventBatches ?? {}, "required")) {
    assert(
      eventBatches.required === scenarioIds.size,
      `${key}: lab event report scenario count differs`,
    );
  }
  if (Object.hasOwn(eventBatches ?? {}, "minimizedCommands")) {
    assert(
      eventBatches.minimizedCommands === configuredCommands,
      `${key}: lab event report command count differs`,
    );
  }
  const checkPath = join(
    root,
    "public",
    dirname(replay.manifestPath),
    "reports",
    "check.json",
  );
  try {
    const check = parseJsonPreservingIntegers(
      await readFile(checkPath, "utf8"),
    );
    assert(
      readObjectField(check, replay.checkBindings.digestField) ===
        replay.digest,
      `${key}: lab digest differs from check.json#${replay.checkBindings.digestField}`,
    );
    assert(
      readObjectField(check, replay.checkBindings.scenarioCountField) ===
        scenarioIds.size &&
        readObjectField(check, replay.checkBindings.commandCountField) ===
          configuredCommands,
      `${key}: lab counts differ from check.json`,
    );
  } catch (error) {
    assert(false, `${key}: cannot verify lab check report (${error.message})`);
  }

  if (replay.presentation === "COUNTEREXAMPLE") {
    const replayReport = supportingDocuments.get("REPLAY");
    const mutantReport = supportingDocuments.get("MUTANTS");
    const replayScenarios = Array.isArray(replayReport?.scenarios)
      ? replayReport.scenarios
      : [];
    const mutantScenarios = Array.isArray(mutantReport?.mutants)
      ? mutantReport.mutants
      : [];
    assert(
      replayReport?.status === "PASS" &&
        replayReport.requested === sourceScenarios.length &&
        replayReport.completed === sourceScenarios.length &&
        replayScenarios.length === sourceScenarios.length,
      `${key}: strict replay report does not cover every counterexample`,
    );
    assert(
      mutantReport?.status === "PASS" &&
        mutantReport.required === sourceScenarios.length &&
        mutantReport.killed === sourceScenarios.length &&
        mutantReport.systemErrorControl === "SYSTEM_ERROR" &&
        mutantScenarios.length === sourceScenarios.length,
      `${key}: mutant report does not prove every counterexample`,
    );

    const mutantIds = new Set();
    for (const [index, scenario] of sourceScenarios.entries()) {
      const failureIndex = scenario.firstFailingCommandIndex;
      const expectedAtFailure = Number.isInteger(failureIndex)
        ? scenario.commands?.[failureIndex]?.expected
        : undefined;
      const fingerprint = `${scenario.propertyId}/${scenario.divergenceKind}`;
      assert(
        typeof scenario.mutantId === "string" &&
          scenario.mutantId.trim() &&
          !mutantIds.has(scenario.mutantId) &&
          scenario.classification === "STUDENT_FAILURE" &&
          typeof scenario.propertyId === "string" &&
          scenario.propertyId.trim() &&
          typeof scenario.divergenceKind === "string" &&
          scenario.divergenceKind.trim() &&
          typeof scenario.lane === "string" &&
          scenario.lane.trim() &&
          typeof scenario.seed === "string" &&
          /^[0-9a-f]{16}$/.test(scenario.seed) &&
          Number.isInteger(scenario.historyIndex) &&
          scenario.historyIndex >= 0 &&
          Number.isInteger(scenario.originalCommandCount) &&
          scenario.originalCommandCount === scenario.originalCommands?.length &&
          Number.isInteger(scenario.minimizedCommandCount) &&
          scenario.minimizedCommandCount === scenario.commands?.length &&
          scenario.minimizedCommandCount > 0 &&
          scenario.minimizedCommandCount < scenario.originalCommandCount &&
          Number.isInteger(failureIndex) &&
          failureIndex >= 0 &&
          failureIndex < scenario.commands?.length &&
          scenario.oneMinimal === true &&
          Number.isInteger(scenario.shrinkTrials) &&
          scenario.shrinkTrials > 0 &&
          expectedAtFailure &&
          scenario.actualAtFailure &&
          JSON.stringify(scenario.actualAtFailure) !==
            JSON.stringify(expectedAtFailure),
        `${key}: incomplete or non-divergent counterexample ${scenario.scenarioId}`,
      );
      mutantIds.add(scenario.mutantId);

      const replayed = replayScenarios[index];
      assert(
        replayed?.scenarioId === scenario.scenarioId &&
          replayed.mutantId === scenario.mutantId &&
          replayed.commands === scenario.commands?.length &&
          replayed.expectedFingerprint === fingerprint &&
          replayed.actualFingerprint === fingerprint &&
          replayed.classification === scenario.classification &&
          replayed.referenceOutcomesExact === true &&
          replayed.actualOutcomeExact === true &&
          replayed.provenanceExact === true &&
          replayed.oneMinimalReverified === true &&
          replayed.passed === true,
        `${key}: strict replay fields differ for ${scenario.scenarioId}`,
      );

      const mutant = mutantScenarios[index];
      assert(
        mutant?.id === scenario.mutantId &&
          mutant.classification === scenario.classification &&
          mutant.killed === true &&
          mutant.propertyId === scenario.propertyId &&
          mutant.divergenceKind === scenario.divergenceKind &&
          mutant.historyIndex === scenario.historyIndex &&
          mutant.seed === scenario.seed &&
          mutant.originalCommands === scenario.originalCommandCount &&
          mutant.minimizedCommands === scenario.minimizedCommandCount &&
          mutant.shrinkTrials === scenario.shrinkTrials &&
          mutant.oneMinimal === true &&
          mutant.replayed === true,
        `${key}: mutant fields differ for ${scenario.scenarioId}`,
      );
    }
  }

  if (usesBrowserModel) {
    const model = lab.browserModel;
    const modelFields = new Set([
      "instrumentId",
      "supportedExecutionPolicies",
      "defaultExecutionPolicy",
      "requireAcceptedExecutionPolicy",
      "minPriceTicks",
      "maxPriceTicks",
      "minQuantityLots",
      "maxQuantityLots",
      "maxOrderId",
      "maxCommands",
      "firstGeneratedOrderId",
      "supportedCommands",
      "showLifecycleRegistry",
      "seedOrders",
    ]);
    assert(
      model && Object.keys(model).every((field) => modelFields.has(field)),
      `${key}: browser model contains an undeclared field`,
    );
    assert(
      model.instrumentId === "BTC-USDT",
      `${key}: browser model instrument drifted`,
    );
    assert(
      Array.isArray(model.supportedExecutionPolicies) &&
        model.supportedExecutionPolicies.length > 0 &&
        model.supportedExecutionPolicies.every((policy) =>
          MATCHING_EXECUTION_POLICIES.includes(policy),
        ) &&
        new Set(model.supportedExecutionPolicies).size ===
          model.supportedExecutionPolicies.length,
      `${key}: browser model execution-policy set is invalid`,
    );
    assert(
      model.supportedExecutionPolicies?.includes(model.defaultExecutionPolicy),
      `${key}: browser model default execution policy is unsupported`,
    );
    assert(
      typeof model.requireAcceptedExecutionPolicy === "boolean",
      `${key}: Accepted execution-policy requirement is invalid`,
    );
    if (
      lab.projectSlug === "high-availability-cex" &&
      ["M01", "M02", "M03"].includes(lab.unitCode)
    ) {
      assert(
        sameOrderedStrings(model.supportedExecutionPolicies, ["GTC"]) &&
          model.defaultExecutionPolicy === "GTC" &&
          model.requireAcceptedExecutionPolicy === false,
        `${key}: published pre-M04 browser policy contract drifted`,
      );
    }
    assert(
      Array.isArray(model.supportedCommands) &&
        model.supportedCommands.length > 0 &&
        model.supportedCommands.every(
          (command) => command === "PLACE" || command === "CANCEL",
        ) &&
        new Set(model.supportedCommands).size ===
          model.supportedCommands.length,
      `${key}: browser model command set is invalid`,
    );
    assert(
      typeof model.showLifecycleRegistry === "boolean",
      `${key}: browser model lifecycle visibility is invalid`,
    );
    assert(
      model.supportedCommands?.includes("CANCEL") ===
        model.showLifecycleRegistry,
      `${key}: cancel support and lifecycle registry visibility must advance together`,
    );
    assert(
      sourceCommandTypes.size === model.supportedCommands?.length &&
        [...sourceCommandTypes].every((command) =>
          model.supportedCommands.includes(command),
        ),
      `${key}: browser model command set differs from the Golden corpus`,
    );
    assert(
      Number.isInteger(model.maxCommands) &&
        model.maxCommands > 0 &&
        model.maxCommands <= 100,
      `${key}: browser model command bound is invalid`,
    );
    try {
      const minPrice = BigInt(model.minPriceTicks);
      const maxPrice = BigInt(model.maxPriceTicks);
      const minQuantity = BigInt(model.minQuantityLots);
      const maxQuantity = BigInt(model.maxQuantityLots);
      const maxOrderId = BigInt(model.maxOrderId);
      const firstOrderId = BigInt(model.firstGeneratedOrderId);
      assert(
        minPrice > 0n &&
          minPrice <= maxPrice &&
          minQuantity > 0n &&
          minQuantity <= maxQuantity,
        `${key}: browser model numeric bounds are invalid`,
      );
      assert(
        maxOrderId > 0n,
        `${key}: browser model order ID bound is invalid`,
      );
      assert(
        firstOrderId > 0n && firstOrderId <= maxOrderId,
        `${key}: browser model first order ID is invalid`,
      );
      const seedIds = new Set();
      for (const seed of model.seedOrders ?? []) {
        const price = BigInt(seed.priceTicks);
        const quantity = BigInt(seed.quantityLots);
        const orderId = BigInt(seed.orderId);
        assert(
          seed.side === "BUY" || seed.side === "SELL",
          `${key}: invalid seed side`,
        );
        assert(
          orderId > 0n && orderId <= maxOrderId && !seedIds.has(seed.orderId),
          `${key}: invalid or duplicate seed order ID`,
        );
        seedIds.add(seed.orderId);
        assert(
          price >= minPrice && price <= maxPrice,
          `${key}: seed price is outside bounds`,
        );
        assert(
          quantity >= minQuantity && quantity <= maxQuantity,
          `${key}: seed quantity is outside bounds`,
        );
      }
      assert(
        !seedIds.has(model.firstGeneratedOrderId),
        `${key}: generated order ID collides with a seed identity`,
      );
    } catch (error) {
      assert(
        false,
        `${key}: browser model contains a non-integer bound (${error.message})`,
      );
    }
  }
}

for (const practiceCase of PRACTICE_CASES) {
  const design = await readIfExists(join(root, practiceCase.designDocument));
  const caseUnits = PRACTICE_UNITS.filter(
    (unit) => unit.projectSlug === practiceCase.slug,
  );
  const configuredUnitCodes = new Set(practiceCase.units ?? []);
  const publishedUnits = caseUnits.filter(
    (unit) => unit.lifecycle === "PUBLISHED",
  ).length;
  const readyUnits = caseUnits.filter((unit) => unit.lifecycle === "READY");
  const activeDeliveryUnits = caseUnits.filter((unit) =>
    ["IN_PROGRESS", "CODE_VERIFIED", "CONTENT_VERIFIED"].includes(
      unit.lifecycle,
    ),
  );
  const currentUnit = practiceCase.currentUnitCode
    ? unitsByKey.get(`${practiceCase.slug}/${practiceCase.currentUnitCode}`)
    : undefined;
  const currentTrack = currentUnit
    ? practiceCase.tracks.find((track) => track.code === currentUnit.trackCode)
    : undefined;
  const unitTotal = practiceCase.tracks.reduce(
    (sum, track) => sum + track.units,
    0,
  );
  const activeTracks = practiceCase.tracks.filter(
    (track) => track.status === "ACTIVE",
  );
  const completeTracks = practiceCase.tracks.filter(
    (track) => track.status === "COMPLETE",
  );
  const createdRepositories = practiceCase.tracks.filter(
    (track) => track.repositoryUrl,
  ).length;
  const trackCodes = new Set();
  const milestoneVersions = new Set();
  const profileVersions = new Set();
  const profiles = Array.isArray(practiceCase.profileRoadmap)
    ? practiceCase.profileRoadmap
    : [];
  const currentProfiles = profiles.filter(
    (profile) => profile.status === "CURRENT",
  );
  const currentProfile = currentProfiles[0];
  const deliveryProfile =
    currentProfile ??
    (practiceCase.status === "VERIFIED" ? profiles.at(-1) : undefined);

  assert(practiceCase.tracks.length > 0, `${practiceCase.slug}: no tracks`);
  assert(
    Number.isInteger(practiceCase.totalUnits) && practiceCase.totalUnits > 0,
    `${practiceCase.slug}: invalid totalUnits`,
  );
  assert(
    practiceCase.totalUnits === unitTotal,
    `${practiceCase.slug}: totalUnits does not equal track units`,
  );
  assert(
    Number.isInteger(practiceCase.plannedRepositories) &&
      practiceCase.plannedRepositories >= createdRepositories,
    `${practiceCase.slug}: plannedRepositories is smaller than the visible repository count`,
  );
  assert(
    /^\d+\.\d+$/.test(practiceCase.planVersion),
    `${practiceCase.slug}: invalid planVersion`,
  );
  assert(
    typeof practiceCase.statusLabel === "string" &&
      practiceCase.statusLabel.trim(),
    `${practiceCase.slug}: empty statusLabel`,
  );
  assert(
    typeof practiceCase.currentAction === "string" &&
      practiceCase.currentAction.trim(),
    `${practiceCase.slug}: empty currentAction`,
  );
  assert(
    typeof practiceCase.trackNarrative === "string" &&
      practiceCase.trackNarrative.trim(),
    `${practiceCase.slug}: empty trackNarrative`,
  );
  assert(
    typeof practiceCase.theoryLabel === "string" &&
      practiceCase.theoryLabel.trim(),
    `${practiceCase.slug}: empty theoryLabel`,
  );
  assert(
    typeof practiceCase.profileRoadmapTitle === "string" &&
      practiceCase.profileRoadmapTitle.trim(),
    `${practiceCase.slug}: empty profileRoadmapTitle`,
  );
  assert(
    typeof practiceCase.profileRoadmapDescription === "string" &&
      practiceCase.profileRoadmapDescription.trim(),
    `${practiceCase.slug}: empty profileRoadmapDescription`,
  );
  assert(profiles.length > 0, `${practiceCase.slug}: empty profileRoadmap`);
  assert(
    configuredUnitCodes.size === (practiceCase.units ?? []).length,
    `${practiceCase.slug}: duplicate unit code in case registry`,
  );
  assert(
    configuredUnitCodes.size === caseUnits.length,
    `${practiceCase.slug}: case registry and unit registry differ`,
  );
  assert(
    readyUnits.length <= 1,
    `${practiceCase.slug}: more than one unit is READY`,
  );
  assert(
    activeDeliveryUnits.length <= 1,
    `${practiceCase.slug}: more than one unit occupies the active delivery window`,
  );
  for (const unit of caseUnits)
    assert(
      configuredUnitCodes.has(unit.code),
      `${practiceCase.slug}: unit ${unit.code} is not listed by the case`,
    );
  for (const code of configuredUnitCodes)
    assert(
      unitsByKey.has(`${practiceCase.slug}/${code}`),
      `${practiceCase.slug}: missing registered unit ${code}`,
    );
  if (practiceCase.currentUnitCode) {
    assert(
      currentUnit,
      `${practiceCase.slug}: currentUnitCode points to a missing registered unit`,
    );
    assert(
      configuredUnitCodes.has(practiceCase.currentUnitCode),
      `${practiceCase.slug}: currentUnitCode is not in case units`,
    );
  }
  if (activeDeliveryUnits.length === 1) {
    assert(
      currentUnit?.code === activeDeliveryUnits[0].code,
      `${practiceCase.slug}: currentUnitCode does not identify the active delivery unit`,
    );
  }

  if (practiceCase.status === "PLANNED") {
    assert(
      activeTracks.length === 0,
      `${practiceCase.slug}: PLANNED cannot expose an ACTIVE track`,
    );
    assert(
      !currentUnit || !isAtLeast(currentUnit.lifecycle, "IN_PROGRESS"),
      `${practiceCase.slug}: PLANNED has an implementation lifecycle`,
    );
    assert(
      profiles.every((profile) => profile.status === "LOCKED"),
      `${practiceCase.slug}: PLANNED requires all profiles LOCKED`,
    );
  }
  if (practiceCase.status === "BUILDING") {
    assert(
      activeTracks.length === 1,
      `${practiceCase.slug}: BUILDING requires exactly one ACTIVE track`,
    );
    assert(
      currentUnit,
      `${practiceCase.slug}: BUILDING requires a currentUnitCode`,
    );
    assert(
      currentTrack?.status === "ACTIVE",
      `${practiceCase.slug}: current track is not ACTIVE`,
    );
    assert(
      currentTrack?.repositoryUrl,
      `${practiceCase.slug}: ACTIVE current track has no repository`,
    );
    assert(
      currentUnit && isAtLeast(currentUnit.lifecycle, "IN_PROGRESS"),
      `${practiceCase.slug}: BUILDING unit is not in progress`,
    );
    assert(
      practiceCase.statusLabel.includes(currentUnit?.code ?? ""),
      `${practiceCase.slug}: BUILDING statusLabel omits current unit`,
    );
    assert(
      currentProfiles.length === 1,
      `${practiceCase.slug}: BUILDING requires exactly one CURRENT profile`,
    );
  }
  if (practiceCase.status === "VERIFIED") {
    assert(
      activeTracks.length === 0,
      `${practiceCase.slug}: VERIFIED cannot expose an ACTIVE track`,
    );
    assert(
      completeTracks.length === practiceCase.tracks.length,
      `${practiceCase.slug}: VERIFIED requires complete tracks`,
    );
    assert(
      publishedUnits === practiceCase.totalUnits,
      `${practiceCase.slug}: VERIFIED requires all units published`,
    );
    assert(
      !currentUnit || currentUnit.lifecycle === "PUBLISHED",
      `${practiceCase.slug}: VERIFIED current unit is not PUBLISHED`,
    );
    assert(
      profiles.every((profile) => profile.status === "COMPLETE"),
      `${practiceCase.slug}: VERIFIED requires complete profiles`,
    );
  }

  let profilePhase = "COMPLETE";
  for (const profile of profiles) {
    assert(
      /^[A-Z][A-Z0-9-]*-\d+\.\d+$/.test(profile.version),
      `${practiceCase.slug}: invalid profile version ${profile.version}`,
    );
    assert(
      !profileVersions.has(profile.version),
      `${practiceCase.slug}: duplicate profile version ${profile.version}`,
    );
    profileVersions.add(profile.version);
    assert(
      typeof profile.title === "string" && profile.title.trim(),
      `${practiceCase.slug}/${profile.version}: empty title`,
    );
    assert(
      typeof profile.description === "string" && profile.description.trim(),
      `${practiceCase.slug}/${profile.version}: empty description`,
    );
    assert(
      typeof profile.gate === "string" && profile.gate.trim(),
      `${practiceCase.slug}/${profile.version}: empty gate`,
    );
    for (const field of Object.keys(profile)) {
      assert(
        profileFields.has(field),
        `${practiceCase.slug}/${profile.version}: profile exposes forbidden field ${field}`,
      );
    }
    assert(
      profileStatuses.has(profile.status),
      `${practiceCase.slug}/${profile.version}: invalid status ${profile.status}`,
    );
    if (profile.status === "COMPLETE") {
      assert(
        profilePhase === "COMPLETE",
        `${practiceCase.slug}: COMPLETE profile appears after an open profile`,
      );
    } else if (profile.status === "CURRENT") {
      assert(
        profilePhase === "COMPLETE",
        `${practiceCase.slug}: CURRENT profile appears out of order`,
      );
      profilePhase = "CURRENT";
    } else {
      profilePhase = "LOCKED";
    }
  }
  assert(
    currentProfiles.length <= 1,
    `${practiceCase.slug}: multiple CURRENT profiles`,
  );

  for (const track of practiceCase.tracks) {
    assert(
      typeof track.code === "string" && track.code.trim(),
      `${practiceCase.slug}: empty track code`,
    );
    assert(
      Number.isInteger(track.units) && track.units > 0,
      `${practiceCase.slug}/${track.code}: invalid unit count`,
    );
    assert(
      !trackCodes.has(track.code),
      `${practiceCase.slug}: duplicate track code ${track.code}`,
    );
    trackCodes.add(track.code);
    if (track.status === "LOCKED")
      assert(
        !track.repositoryUrl,
        `${practiceCase.slug}/${track.code}: LOCKED track exposes a repository`,
      );
    if (track.status === "ACTIVE" || track.status === "COMPLETE")
      assert(
        track.repositoryUrl,
        `${practiceCase.slug}/${track.code}: ${track.status} track has no repository`,
      );
    if (track.repositoryUrl) {
      assert(
        /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
          track.repositoryUrl,
        ),
        `${practiceCase.slug}/${track.code}: invalid GitHub repository URL`,
      );
      assert(
        !repositoryUrls.has(track.repositoryUrl),
        `${track.repositoryUrl}: duplicate repository URL`,
      );
      repositoryUrls.add(track.repositoryUrl);
    }
    assertIncludes(
      design,
      `${track.title}（${track.units} 个单元）`,
      `${practiceCase.slug}/${track.code}`,
    );
  }

  for (const milestone of practiceCase.milestones) {
    assert(
      !milestoneVersions.has(milestone.version),
      `${practiceCase.slug}: duplicate milestone ${milestone.version}`,
    );
    milestoneVersions.add(milestone.version);
    assertIncludes(
      design,
      `\`${milestone.version}\``,
      `${practiceCase.slug} milestone`,
    );
  }
  if (deliveryProfile)
    assert(
      practiceCase.milestones.at(-1)?.version === deliveryProfile.version,
      `${practiceCase.slug}: final milestone is not the delivery profile`,
    );
  for (const profile of profiles.filter((item) => item.status === "LOCKED")) {
    assert(
      !milestoneVersions.has(profile.version),
      `${practiceCase.slug}: LOCKED profile appears in current milestones`,
    );
  }

  assertIncludes(
    design,
    `> \`planVersion\`：\`${practiceCase.planVersion}\``,
    practiceCase.slug,
  );
  assertIncludes(
    design,
    `> 案例 slug：\`${practiceCase.slug}\``,
    practiceCase.slug,
  );
  assertIncludes(
    design,
    `${practiceCase.totalUnits} 个候选交付单元`,
    practiceCase.slug,
  );
  assertIncludes(
    design,
    `${practiceCase.plannedRepositories} 个按门禁顺序创建的代码仓库`,
    practiceCase.slug,
  );
  assertIncludes(design, practiceCase.profileRoadmapTitle, practiceCase.slug);
  assertIncludes(
    design,
    practiceCase.profileRoadmapDescription,
    practiceCase.slug,
  );
  for (const profile of profiles) {
    assertTableIncludes(
      design,
      `| \`${profile.version}\` | \`${profile.status}\` | ${profile.title} | ${profile.description} | ${profile.gate} |`,
      `${practiceCase.slug}/${profile.version}`,
    );
  }
  if (currentUnit) {
    assertIncludes(
      design,
      `> 状态：${currentUnit.code} 当前 \`${currentUnit.lifecycle}\``,
      practiceCase.slug,
    );
    assertTableIncludes(
      design,
      `| ${currentUnit.code} | \`${currentUnit.lifecycle}\` |`,
      practiceCase.slug,
    );
  }
  for (const unit of caseUnits) {
    const key = `${practiceCase.slug}/${unit.code}`;
    const casePlanVersion = parsePlanVersion(practiceCase.planVersion);
    const contractPlanVersion = parsePlanVersion(unit.contractPlanVersion);
    assert(contractPlanVersion, `${key}: invalid contractPlanVersion`);
    if (casePlanVersion && contractPlanVersion) {
      const comparison = comparePlanVersions(
        casePlanVersion,
        contractPlanVersion,
      );
      assert(
        comparison >= 0,
        `${key}: contractPlanVersion is newer than case planVersion`,
      );
      if (comparison > 0) {
        assert(
          typeof unit.planCompatibility === "string" &&
            unit.planCompatibility.trim(),
          `${key}: older unit contract has no planCompatibility`,
        );
        assertIncludes(
          unit.planCompatibility ?? "",
          `PLAN v${practiceCase.planVersion}`,
          `${key}: planCompatibility`,
        );
      } else {
        assert(
          !unit.planCompatibility,
          `${key}: current contract has redundant planCompatibility`,
        );
      }
    }
    if (unit.startRef) assertIncludes(design, unit.startRef, `${key} design`);
    if (unit.releaseTarget)
      assertIncludes(
        design,
        unit.releaseTarget,
        `${key} release target design`,
      );
    if (unit.completeCommit)
      assertIncludes(
        design,
        unit.completeCommit,
        `${key} complete commit design`,
      );
    assertIncludes(
      design,
      `> ${unit.code} 单元合同 \`planVersion\`：\`${unit.contractPlanVersion}\``,
      `${key} design`,
    );
    if (unit.planCompatibility)
      assertIncludes(design, unit.planCompatibility, `${key} design`);
    for (const superseded of unit.supersededStartRefs ?? []) {
      assertIncludes(design, superseded.ref, `${key} superseded start ref`);
      assertIncludes(
        design,
        superseded.reason,
        `${key} superseded start reason`,
      );
    }
    for (const prerequisite of unit.prerequisiteUnitCodes) {
      const prerequisiteUnit = unitsByKey.get(
        `${practiceCase.slug}/${prerequisite}`,
      );
      assert(
        prerequisiteUnit,
        `${key}: missing prerequisite unit ${prerequisite}`,
      );
      if (isAtLeast(unit.lifecycle, "READY")) {
        assert(
          prerequisiteUnit?.lifecycle === "PUBLISHED",
          `${key}: prerequisite ${prerequisite} is not PUBLISHED`,
        );
      }
    }
  }

  if (verifyDist) {
    const projectHtml = await readIfExists(
      join(root, "dist", "practice", practiceCase.slug, "index.html"),
    );
    assert(projectHtml, `${practiceCase.slug}: missing project route in dist`);
    assertIncludes(
      projectHtml,
      `PLAN v${practiceCase.planVersion}`,
      `${practiceCase.slug} dist`,
    );
    assertIncludes(
      projectHtml,
      practiceCase.statusLabel,
      `${practiceCase.slug} dist`,
    );
    assertIncludes(
      projectHtml,
      practiceCase.profileRoadmapTitle,
      `${practiceCase.slug} dist`,
    );
    for (const profile of profiles) {
      assertIncludes(
        projectHtml,
        profile.version,
        `${practiceCase.slug}/${profile.version} dist`,
      );
      assertIncludes(
        projectHtml,
        profile.title,
        `${practiceCase.slug}/${profile.version} dist`,
      );
    }
    if (currentUnit)
      assertIncludes(
        projectHtml,
        `/signal-grid-blog/practice/${practiceCase.slug}/${currentUnit.code.toLowerCase()}/`,
        `${practiceCase.slug} current unit link`,
      );
    for (const unit of caseUnits) {
      const unitPath = join(
        root,
        "dist",
        "practice",
        practiceCase.slug,
        unit.code.toLowerCase(),
        "index.html",
      );
      const shouldExposeUnit = isAtLeast(unit.lifecycle, "IN_PROGRESS");
      assert(
        (await exists(unitPath)) === shouldExposeUnit,
        `${practiceCase.slug}/${unit.code}: unit route exposure disagrees with lifecycle`,
      );
      if (shouldExposeUnit) {
        const unitHtml = await readFile(unitPath, "utf8");
        assertIncludes(
          unitHtml,
          unit.title,
          `${practiceCase.slug}/${unit.code} dist`,
        );
        assertIncludes(
          unitHtml,
          unit.lifecycle,
          `${practiceCase.slug}/${unit.code} dist`,
        );
        assertIncludes(
          unitHtml,
          unit.startRef,
          `${practiceCase.slug}/${unit.code} dist`,
        );
        if (unit.completeRef)
          assertIncludes(
            unitHtml,
            unit.completeRef,
            `${practiceCase.slug}/${unit.code} complete ref dist`,
          );
        if (unit.completeCommit)
          assertIncludes(
            unitHtml,
            unit.completeCommit,
            `${practiceCase.slug}/${unit.code} complete commit dist`,
          );
        if (unit.productRelease) {
          assertIncludes(
            unitHtml,
            unit.productRelease,
            `${practiceCase.slug}/${unit.code} product release dist`,
          );
        } else if (unit.releaseTarget) {
          assertIncludes(
            unitHtml,
            `TARGET · ${unit.releaseTarget}`,
            `${practiceCase.slug}/${unit.code} release target dist`,
          );
        }
        if (unit.lifecycle === "PUBLISHED") {
          assertIncludes(
            unitHtml,
            unit.evidenceUrl,
            `${practiceCase.slug}/${unit.code} evidence URL dist`,
          );
          const localEvidence = localEvidenceRelativePath(unit.evidenceUrl);
          if (localEvidence) {
            assert(
              await exists(join(root, "dist", localEvidence)),
              `${practiceCase.slug}/${unit.code}: local evidence is missing from dist`,
            );
          }
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
  for (const field of lessonFields)
    assert(
      data[field] !== undefined && data[field] !== "",
      `${file}: missing ${field}`,
    );
  assert(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.project ?? ""),
    `${file}: invalid project`,
  );
  assert(
    /^[A-Z][A-Z0-9-]*-\d+\.\d+$/.test(data.profileVersion ?? ""),
    `${file}: invalid profileVersion`,
  );
  assert(
    /^[A-Z][0-9]{2}$/.test(data.unitCode ?? ""),
    `${file}: invalid unitCode`,
  );
  assert(
    Number.isInteger(data.lessonOrder) && data.lessonOrder > 0,
    `${file}: invalid lessonOrder`,
  );
  assert(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(data.permalink ?? ""),
    `${file}: invalid permalink`,
  );
  assert(typeof data.draft === "boolean", `${file}: draft must be a boolean`);
  assert(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/.test(
      String(data.date ?? ""),
    ),
    `${file}: date must include an explicit timezone`,
  );

  const practiceCase = casesBySlug.get(data.project);
  const unit = unitsByKey.get(`${data.project}/${data.unitCode}`);
  const profile = practiceCase?.profileRoadmap.find(
    (item) => item.version === data.profileVersion,
  );
  assert(practiceCase, `${file}: lesson points to a missing practice case`);
  assert(unit, `${file}: lesson points to a missing or LOCKED unit`);
  assert(profile, `${file}: lesson points to a missing profile`);
  assert(
    profile?.status !== "LOCKED",
    `${file}: lesson points to LOCKED profile ${data.profileVersion}`,
  );
  assert(
    unit?.profileVersion === data.profileVersion,
    `${file}: lesson profile and unit profile disagree`,
  );
  assert(
    data.draft || unit?.lifecycle === "PUBLISHED",
    `${file}: non-draft lesson requires a PUBLISHED unit`,
  );

  const expectedPrefix = `src/content/practice/${data.project}/${String(data.unitCode).toLowerCase()}/`;
  assert(
    file.startsWith(expectedPrefix),
    `${file}: path must follow project/unit hierarchy`,
  );
  const routeKey = `${data.project}/${String(data.unitCode).toLowerCase()}/${data.permalink}`;
  const orderKey = `${data.project}/${data.unitCode}/${data.lessonOrder}`;
  assert(
    !lessonRoutes.has(routeKey),
    `${file}: duplicate lesson permalink ${routeKey}`,
  );
  assert(
    !lessonOrders.has(orderKey),
    `${file}: duplicate lessonOrder ${orderKey}`,
  );
  lessonRoutes.add(routeKey);
  lessonOrders.add(orderKey);

  const repositoryUrl = practiceCase?.tracks.find(
    (track) => track.code === unit?.trackCode,
  )?.repositoryUrl;
  if (repositoryUrl && source.includes(`${repositoryUrl}/`)) {
    const fixedRefs = [
      unit?.startRef,
      unit?.completeRef,
      unit?.productRelease,
    ].filter(Boolean);
    const escapedRepository = repositoryUrl.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    const sourceLinks =
      source.match(
        new RegExp(`${escapedRepository}/(?:tree|blob)/[^\\s)\"']+`, "g"),
      ) ?? [];
    for (const link of sourceLinks) {
      assert(
        fixedRefs.some(
          (ref) =>
            link === `${repositoryUrl}/tree/${ref}` ||
            link.startsWith(`${repositoryUrl}/tree/${ref}/`) ||
            link === `${repositoryUrl}/blob/${ref}` ||
            link.startsWith(`${repositoryUrl}/blob/${ref}/`),
        ),
        `${file}: floating or foreign source ref ${link}`,
      );
    }
  }
  if (!data.draft && unit?.completeRef)
    assertIncludes(
      body,
      unit.completeRef,
      `${file}: published lesson complete ref`,
    );
  lessons.push({ file, data, unit });
}

for (const unit of PRACTICE_UNITS.filter(
  (item) => item.lifecycle === "PUBLISHED",
)) {
  const unitLessons = lessons.filter(
    (lesson) =>
      lesson.data.project === unit.projectSlug &&
      lesson.data.unitCode === unit.code,
  );
  assert(
    unitLessons.length === (unit.expectedLessons?.length ?? 0) &&
      unitLessons.every((lesson) => !lesson.data.draft),
    `${unit.projectSlug}/${unit.code}: PUBLISHED unit must expose every frozen lesson and no draft`,
  );
}

for (const unit of PRACTICE_UNITS.filter((item) =>
  isAtLeast(item.lifecycle, "CONTENT_VERIFIED"),
)) {
  const actual = lessons
    .filter(
      (lesson) =>
        lesson.data.project === unit.projectSlug &&
        lesson.data.unitCode === unit.code,
    )
    .map((lesson) => `${lesson.data.lessonOrder}:${lesson.data.permalink}`)
    .sort();
  const expected = (unit.expectedLessons ?? [])
    .map((lesson) => `${lesson.lessonOrder}:${lesson.permalink}`)
    .sort();
  assert(
    actual.length === expected.length &&
      actual.every((value, index) => value === expected[index]),
    `${unit.projectSlug}/${unit.code}: lesson set differs from frozen expectedLessons`,
  );
}

if (verifyDist) {
  const portalHtml = await readIfExists(
    join(root, "dist", "practice", "index.html"),
  );
  for (const practiceCase of PRACTICE_CASES) {
    assertIncludes(
      portalHtml,
      `/signal-grid-blog/practice/${practiceCase.slug}/`,
      "practice portal dist",
    );
  }

  const rss = await readIfExists(join(root, "dist", "rss.xml"));
  const sitemap = `${await readIfExists(join(root, "dist", "sitemap-index.xml"))}\n${await readIfExists(join(root, "dist", "sitemap-0.xml"))}`;
  const search = await readIfExists(join(root, "dist", "search.json"));
  const postsIndex = await readIfExists(
    join(root, "dist", "posts", "index.html"),
  );
  assert(
    !rss.includes("/practice/"),
    "dist/rss.xml: practice content must not enter the main RSS",
  );
  for (const lesson of lessons) {
    const route = `/signal-grid-blog/practice/${lesson.data.project}/${String(lesson.data.unitCode).toLowerCase()}/${lesson.data.permalink}/`;
    const routeFile = join(
      root,
      "dist",
      "practice",
      lesson.data.project,
      String(lesson.data.unitCode).toLowerCase(),
      lesson.data.permalink,
      "index.html",
    );
    assert(
      !postsIndex.includes(lesson.data.title),
      `${lesson.file}: practice lesson entered posts archive/statistics`,
    );
    if (lesson.data.draft) {
      assert(
        !(await exists(routeFile)),
        `${lesson.file}: draft generated a production route`,
      );
      assert(!sitemap.includes(route), `${lesson.file}: draft entered sitemap`);
      assert(
        !search.includes(route) && !search.includes(lesson.data.permalink),
        `${lesson.file}: draft entered search output`,
      );
      assert(
        !rss.includes(lesson.data.permalink),
        `${lesson.file}: draft entered RSS`,
      );
    } else {
      assert(
        await exists(routeFile),
        `${lesson.file}: published lesson route is missing`,
      );
      assertIncludes(
        sitemap,
        route,
        `${lesson.file}: published lesson sitemap`,
      );
      if (lesson.unit?.completeRef) {
        const lessonHtml = await readFile(routeFile, "utf8");
        assertIncludes(
          lessonHtml,
          lesson.unit.completeRef,
          `${lesson.file}: published lesson complete ref dist`,
        );
        assertIncludes(
          lessonHtml,
          lesson.unit.evidenceUrl,
          `${lesson.file}: published lesson evidence URL dist`,
        );
      }
    }
  }

  for (const lab of PRACTICE_LABS) {
    const unit = unitsByKey.get(`${lab.projectSlug}/${lab.unitCode}`);
    const route = `/signal-grid-blog/practice/${lab.projectSlug}/${lab.unitCode.toLowerCase()}/lab/`;
    const routeFile = join(
      root,
      "dist",
      "practice",
      lab.projectSlug,
      lab.unitCode.toLowerCase(),
      "lab",
      "index.html",
    );
    const shouldPublish = unit?.lifecycle === "PUBLISHED";
    assert(
      (await exists(routeFile)) === shouldPublish,
      `${lab.projectSlug}/${lab.unitCode}: lab route exposure disagrees with unit lifecycle`,
    );
    if (shouldPublish) {
      const html = await readFile(routeFile, "utf8");
      assertIncludes(
        html,
        lab.title,
        `${lab.projectSlug}/${lab.unitCode} lab dist`,
      );
      assertIncludes(
        html,
        "JAVA_GOLDEN_REPLAY",
        `${lab.projectSlug}/${lab.unitCode} lab dist`,
      );
      assertIncludes(
        html,
        lab.modes[1],
        `${lab.projectSlug}/${lab.unitCode} prediction mode dist`,
      );
      assertIncludes(
        html,
        unit.completeRef,
        `${lab.projectSlug}/${lab.unitCode} lab complete ref`,
      );
      assertIncludes(
        html,
        `/signal-grid-blog/${lab.goldenReplay.manifestPath}`,
        `${lab.projectSlug}/${lab.unitCode} lab manifest source`,
      );
      assertIncludes(
        html,
        `/signal-grid-blog/${lab.goldenReplay.scenarioPackPath}`,
        `${lab.projectSlug}/${lab.unitCode} lab scenario source`,
      );
      assertIncludes(
        html,
        `/signal-grid-blog/${lab.goldenReplay.eventBatchesPath}`,
        `${lab.projectSlug}/${lab.unitCode} lab event source`,
      );
      assertIncludes(
        html,
        `/signal-grid-blog/${lab.goldenReplay.canonicalHistoryPath}`,
        `${lab.projectSlug}/${lab.unitCode} lab canonical source`,
      );
      for (const report of lab.goldenReplay.supportingReports ?? []) {
        assertIncludes(
          html,
          `/signal-grid-blog/${report.path}`,
          `${lab.projectSlug}/${lab.unitCode} lab supporting source ${report.role}`,
        );
      }
      if (lab.goldenReplay.presentation === "COUNTEREXAMPLE") {
        assertIncludes(
          html,
          "PREDICT BEFORE REVEAL",
          `${lab.projectSlug}/${lab.unitCode} counterexample reveal control`,
        );
        assertIncludes(
          html,
          "锁定预测并揭示对照",
          `${lab.projectSlug}/${lab.unitCode} counterexample reveal label`,
        );
      }
      if (lab.modes[1] === "EVIDENCE_PREDICTION") {
        assertIncludes(
          html,
          "锁定预测并揭示状态",
          `${lab.projectSlug}/${lab.unitCode} evidence prediction control`,
        );
        assertIncludes(
          html,
          "不是浏览器里的 Java 撮合器",
          `${lab.projectSlug}/${lab.unitCode} honest execution boundary`,
        );
      }
      assert(
        !html.includes("data-pagefind-body"),
        `${lab.projectSlug}/${lab.unitCode}: runtime lab entered Pagefind body`,
      );
      assertIncludes(
        sitemap,
        route,
        `${lab.projectSlug}/${lab.unitCode} lab sitemap`,
      );
      assert(
        !search.includes(route),
        `${lab.projectSlug}/${lab.unitCode}: runtime lab entered static search output`,
      );
    } else {
      assert(
        !sitemap.includes(route),
        `${lab.projectSlug}/${lab.unitCode}: unpublished lab entered sitemap`,
      );
      assert(
        !search.includes(route),
        `${lab.projectSlug}/${lab.unitCode}: unpublished lab entered search output`,
      );
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
