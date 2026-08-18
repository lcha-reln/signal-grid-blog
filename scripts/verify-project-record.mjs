import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectsRoot = fileURLToPath(new URL("../docs/projects/", import.meta.url));
const entries = await readdir(projectsRoot, { withFileTypes: true });
const recordPaths = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => resolve(projectsRoot, entry.name, "PROJECT_RECORD.md"))
  .sort();

if (recordPaths.length === 0) {
  console.error(`Project record verification failed: no PROJECT_RECORD.md below ${projectsRoot}`);
  process.exit(1);
}

let failed = false;
let totalDefinitions = 0;
let totalTasks = 0;
let totalGates = 0;
const projectIds = new Map();

for (const recordPath of recordPaths) {
  let source;
  try {
    source = await readFile(recordPath, "utf8");
  } catch (error) {
    console.error(`Project record verification failed: ${recordPath}`);
    console.error(`- cannot read PROJECT_RECORD.md: ${error.message}`);
    failed = true;
    continue;
  }

  const result = await verifyRecord(source, recordPath);
  totalDefinitions += result.definitions;
  totalTasks += result.tasks;
  totalGates += result.gates;
  if (result.projectId) {
    const previousPath = projectIds.get(result.projectId);
    if (previousPath) {
      console.error(`Project record verification failed: ${recordPath}`);
      console.error(`- duplicate project_id ${result.projectId}; first defined in ${previousPath}`);
      failed = true;
    } else {
      projectIds.set(result.projectId, recordPath);
    }
  }
  if (result.failures.length > 0) {
    console.error(`Project record verification failed: ${recordPath}`);
    for (const failure of result.failures) console.error(`- ${failure}`);
    failed = true;
  }
}

if (failed) process.exit(1);

console.log(
  `Project records verified: ${recordPaths.length} record(s), ${totalDefinitions} definitions, ${totalTasks} tasks, ${totalGates} gates`,
);

async function verifyRecord(source, recordPath) {
  const failures = [];
  const fail = (message) => failures.push(message);
  const lines = source.split("\n");
  const projectDirectory = resolve(recordPath, "..");
  const cellsOf = (line) =>
    line
      .split("|")
      .slice(1, -1)
      .map((cell) => cell.trim());
  const normalizedValue = (value) => (value ?? "").trim().replace(/^`([^`]*)`$/, "$1").trim();
  const isBlank = (value) => normalizedValue(value) === "";
  const isPlaceholder = (value) =>
    isBlank(value) || /^(?:—|-|TBD|TODO|待定|待分配)$/i.test(normalizedValue(value));
  const containsId = (value, id) =>
    new RegExp(`(^|[^A-Z0-9-])${id.replaceAll("-", "\\-")}([^A-Z0-9-]|$)`).test(value ?? "");
  const requireCellCount = (id, cells, count) => {
    if (cells.length !== count) fail(`${id} must have exactly ${count} table cells, found ${cells.length}`);
  };
  const requireFields = (id, fields) => {
    for (const [label, value] of fields) {
      if (isPlaceholder(value)) fail(`${id} has missing or placeholder field: ${label}`);
    }
  };

  const frontmatterMatch = source.match(/^---\n([\s\S]*?)\n---\n/);
  if (!frontmatterMatch) fail("missing YAML frontmatter");

  const frontmatter = new Map();
  const frontmatterKeyCounts = new Map();
  for (const line of (frontmatterMatch?.[1] ?? "").split("\n")) {
    const match = line.match(/^([a-z_]+):\s*(.*)$/);
    if (match) {
      frontmatterKeyCounts.set(match[1], (frontmatterKeyCounts.get(match[1]) ?? 0) + 1);
      frontmatter.set(match[1], match[2].trim());
    }
  }
  for (const [key, count] of frontmatterKeyCounts) {
    if (count !== 1) fail(`frontmatter field ${key} must be defined exactly once`);
  }

  const requiredFrontmatter = [
    "record_schema",
    "project_id",
    "record_health",
    "project_status",
    "claim_status",
    "qualification_profile",
    "qualification_evidence_set",
    "current_phase",
    "current_task",
    "updated_at",
    "last_reconciled_at",
    "reconciliation_base_git_sha",
    "next_review_due",
  ];
  for (const key of requiredFrontmatter) {
    if (!frontmatter.has(key) || isBlank(frontmatter.get(key))) fail(`missing or empty frontmatter field: ${key}`);
  }

  if (frontmatter.get("record_schema") !== "signal-grid-project-record/v1") {
    fail("unexpected record_schema");
  }

  const frontmatterStates = new Map([
    ["record_health", new Set(["current", "needs_reconciliation", "archived"])],
    [
      "project_status",
      new Set(["proposed", "active", "paused", "blocked", "completed", "cancelled", "archived"]),
    ],
    [
      "claim_status",
      new Set(["not_proven", "qualified_for_named_profile", "suspended", "withdrawn"]),
    ],
  ]);
  for (const [field, allowed] of frontmatterStates) {
    const value = frontmatter.get(field);
    if (value && !allowed.has(value)) fail(`invalid ${field}: ${value}`);
  }
  const reconciliationBase = frontmatter.get("reconciliation_base_git_sha");
  if (reconciliationBase && !/^(?:[0-9a-f]{40}|none)$/i.test(reconciliationBase)) {
    fail("reconciliation_base_git_sha must be a 40-character hexadecimal SHA or none");
  }

  const atomicProfileId = "(?:WORKLOAD|HARDWARE|DURABILITY|FAILURE)_PROFILE-\\d{3}";
  const profileSetId = "PROFILE_SET-\\d{3}";
  const qualificationSetId = "QUALIFICATION_SET-\\d{3}";
  const profileId = `(?:${atomicProfileId}|${profileSetId}|${qualificationSetId})`;
  const idPattern = new RegExp(
    `\\b(?:FACT-\\d{3}|ASM-\\d{3}|OQ-\\d{3}|REQ-(?:FUNC|QUAL|OPS|SEC)-\\d{3}|INV-\\d{3}|ADR-\\d{4}|RISK-\\d{3}|EVD-\\d{4}|GATE-\\d{3}|TASK-P\\d+-\\d{3}|${profileId}|CHG-\\d{8}-\\d{3})\\b`,
    "g",
  );
  const definitionPattern = new RegExp(
    `^\\|\\s*((?:FACT-\\d{3}|ASM-\\d{3}|OQ-\\d{3}|REQ-(?:FUNC|QUAL|OPS|SEC)-\\d{3}|INV-\\d{3}|RISK-\\d{3}|EVD-\\d{4}|GATE-\\d{3}|TASK-P\\d+-\\d{3}|${profileId}|CHG-\\d{8}-\\d{3}))\\s*\\|`,
  );
  const definitions = new Map();
  for (let index = 0; index < lines.length; index += 1) {
    const tableDefinition = lines[index].match(definitionPattern);
    const adrDefinition = lines[index].match(/^###\s+(ADR-\d{4})：/);
    const id = tableDefinition?.[1] ?? adrDefinition?.[1];
    if (!id) continue;
    if (definitions.has(id)) {
      fail(`duplicate definition ${id} at lines ${definitions.get(id)} and ${index + 1}`);
    } else {
      definitions.set(id, index + 1);
    }
  }
  for (const match of source.matchAll(idPattern)) {
    if (!definitions.has(match[0])) fail(`reference without definition: ${match[0]}`);
  }

  let previousChangeTime = Number.NEGATIVE_INFINITY;
  let previousChangeId;
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!/^CHG-\d{8}-\d{3}$/.test(cells[0] ?? "")) continue;
    const id = cells[0];
    requireCellCount(id, cells, 7);
    requireFields(id, [
      ["timestamp", cells[1]],
      ["change", cells[2]],
      ["reason", cells[3]],
      ["impact", cells[4]],
      ["artifact or commit", cells[5]],
      ["follow-up", cells[6]],
    ]);
    const changeTime = Date.parse(cells[1] ?? "");
    if (!Number.isFinite(changeTime)) {
      fail(`change ${id} has an invalid timestamp`);
      continue;
    }
    if (changeTime < previousChangeTime) {
      fail(`change ${id} timestamp is earlier than preceding change ${previousChangeId}`);
    }
    previousChangeTime = changeTime;
    previousChangeId = id;
  }

  const evidenceStates = new Map();
  const evidenceRows = new Map();
  const allowedEvidenceStates = new Set(["planned", "pass", "fail", "partial", "stale", "invalid"]);
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!/^EVD-\d{4}$/.test(cells[0] ?? "")) continue;
    requireCellCount(cells[0], cells, 7);
    const state = cells[5];
    requireFields(cells[0], [
      ["proof object", cells[1]],
      ["artifact or command", cells[2]],
      ["invalidation trigger", cells[6]],
    ]);
    if (!allowedEvidenceStates.has(state)) fail(`evidence ${cells[0]} has no valid state`);
    else evidenceStates.set(cells[0], state);
    if (state === "pass") {
      requireFields(cells[0], [
        ["environment or version", cells[3]],
        ["result", cells[4]],
      ]);
      for (const [label, value] of [
        ["artifact or command", cells[2]],
        ["environment or version", cells[3]],
        ["result", cells[4]],
      ]) {
        if (/^(?:无|不存在|未执行|待运行|待观察)$/i.test(normalizedValue(value))) {
          fail(`pass evidence ${cells[0]} cannot use an unobserved value for ${label}`);
        }
      }
    }
    const evidenceRow = {
      proves: cells[1],
      artifact: cells[2],
      environment: cells[3],
      result: cells[4],
      state,
      invalidation: cells[6],
      localMarkdownArtifacts: [],
    };
    evidenceRows.set(cells[0], evidenceRow);
    const artifactLinks = [...(cells[2] ?? "").matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map(
      (match) => match[1].trim().replace(/^<|>$/g, ""),
    );
    for (const artifactLink of artifactLinks) {
      if (
        artifactLink.startsWith("#") ||
        artifactLink.startsWith("/") ||
        /^[a-z][a-z0-9+.-]*:/i.test(artifactLink)
      ) {
        continue;
      }
      const relativePath = artifactLink.split("#", 1)[0].split("?", 1)[0];
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(relativePath);
      } catch {
        fail(`evidence ${cells[0]} has an invalid encoded artifact link: ${artifactLink}`);
        continue;
      }
      const artifactPath = resolve(projectDirectory, decodedPath);
      const projectRelativePath = relative(projectDirectory, artifactPath);
      if (
        projectRelativePath === "" ||
        projectRelativePath === ".." ||
        projectRelativePath.startsWith(`..${sep}`) ||
        isAbsolute(projectRelativePath)
      ) {
        fail(`evidence ${cells[0]} relative artifact escapes the project directory: ${artifactLink}`);
        continue;
      }
      try {
        const artifactStat = await lstat(artifactPath);
        if (artifactStat.isSymbolicLink() || !artifactStat.isFile()) {
          fail(`evidence ${cells[0]} relative artifact must be a regular non-symlink file: ${artifactLink}`);
          continue;
        }
        const [projectRealPath, artifactRealPath] = await Promise.all([
          realpath(projectDirectory),
          realpath(artifactPath),
        ]);
        const expectedRealPath = resolve(projectRealPath, projectRelativePath);
        const realRelativePath = relative(projectRealPath, artifactRealPath);
        if (
          artifactRealPath !== expectedRealPath ||
          realRelativePath === ".." ||
          realRelativePath.startsWith(`..${sep}`) ||
          isAbsolute(realRelativePath)
        ) {
          fail(`evidence ${cells[0]} relative artifact resolves through a symlink or outside the project: ${artifactLink}`);
          continue;
        }
      } catch (error) {
        fail(`evidence ${cells[0]} cannot read relative artifact ${artifactLink}: ${error.message}`);
        continue;
      }
      if (!artifactPath.toLowerCase().endsWith(".md")) continue;
      let artifactSource;
      try {
        artifactSource = await readFile(artifactPath, "utf8");
      } catch (error) {
        fail(`evidence ${cells[0]} cannot read Markdown artifact ${artifactLink}: ${error.message}`);
        continue;
      }
      const declaredIdLines = [...artifactSource.matchAll(/^- 证据 ID：.*$/gm)];
      const declaredIdMatches = [...artifactSource.matchAll(/^- 证据 ID：\s*`?(EVD-\d{4})`?\s*$/gm)];
      if (declaredIdLines.length !== 1 || declaredIdMatches.length !== 1) {
        fail(`evidence ${cells[0]} Markdown artifact ${artifactLink} must declare exactly one evidence ID`);
      }
      const declaredId = declaredIdMatches[0]?.[1];
      if (declaredId !== cells[0]) {
        fail(`evidence ${cells[0]} Markdown artifact ${artifactLink} must declare the same evidence ID`);
      }
      const declaredVerdictLines = [...artifactSource.matchAll(/^- Verdict：.*$/gm)];
      const declaredVerdictMatches = [...artifactSource.matchAll(/^- Verdict：\s*`?([a-z_]+)`?.*$/gm)];
      if (declaredVerdictLines.length !== 1 || declaredVerdictMatches.length !== 1) {
        fail(`evidence ${cells[0]} Markdown artifact ${artifactLink} must declare exactly one verdict`);
      }
      const declaredVerdict = declaredVerdictMatches[0]?.[1];
      if (declaredVerdict !== state) {
        fail(
          `evidence ${cells[0]} Markdown artifact ${artifactLink} verdict ${declaredVerdict ?? "missing"} does not match registry state ${state}`,
        );
      }
      const machineEvidenceIdMatches = [...artifactSource.matchAll(/^- Evidence-ID:\s*`?(EVD-\d{4})`?\s*$/gm)];
      const machineKindMatches = [...artifactSource.matchAll(/^- Evidence-Kind:\s*`([a-z_]+)`\s*$/gm)];
      const machineVerdictMatches = [...artifactSource.matchAll(/^- Verdict:\s*`?([a-z_]+)`?\s*$/gm)];
      const machineProofMatches = [...artifactSource.matchAll(/^- Proof-Object:\s*`([^`]+)`\s*$/gm)];
      const machineResultMatches = [...artifactSource.matchAll(/^- Result:\s*`([^`]+)`\s*$/gm)];
      const machineFieldLineCounts = {
        evidenceId: [...artifactSource.matchAll(/^- Evidence-ID:.*$/gm)].length,
        kind: [...artifactSource.matchAll(/^- Evidence-Kind:.*$/gm)].length,
        verdict: [...artifactSource.matchAll(/^- Verdict:.*$/gm)].length,
        proofObject: [...artifactSource.matchAll(/^- Proof-Object:.*$/gm)].length,
        result: [...artifactSource.matchAll(/^- Result:.*$/gm)].length,
      };
      evidenceRow.localMarkdownArtifacts.push({
        path: artifactLink,
        evidenceId: machineEvidenceIdMatches.length === 1 ? machineEvidenceIdMatches[0][1] : undefined,
        kind: machineKindMatches.length === 1 ? machineKindMatches[0][1] : undefined,
        verdict: machineVerdictMatches.length === 1 ? machineVerdictMatches[0][1] : undefined,
        proofObject: machineProofMatches.length === 1 ? machineProofMatches[0][1] : undefined,
        result: machineResultMatches.length === 1 ? machineResultMatches[0][1] : undefined,
        machineFieldCounts: machineFieldLineCounts,
      });
    }
  }

  const taskStates = new Map();
  const taskRows = new Map();
  const allowedTaskStates = new Set(["todo", "doing", "blocked", "done", "dropped"]);
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!/^TASK-P\d+-\d{3}$/.test(cells[0] ?? "")) continue;
    requireCellCount(cells[0], cells, 7);
    const [id, phase, deliverable, acceptance, evidence, state] = cells;
    if (!allowedTaskStates.has(state)) fail(`task ${id} has no valid state`);
    else taskStates.set(id, state);
    taskRows.set(id, { phase, deliverable, acceptance, evidence, state });
  }

  const currentTask = frontmatter.get("current_task");
  const doingTasks = [...taskStates].filter(([, state]) => state === "doing");
  const projectStatus = frontmatter.get("project_status");
  if (projectStatus === "completed") {
    const unfinishedTasks = [...taskStates].filter(([, state]) =>
      ["doing", "todo", "blocked"].includes(state),
    );
    if (unfinishedTasks.length > 0) {
      fail(
        `completed project cannot retain doing, todo, or blocked tasks: ${unfinishedTasks
          .map(([id]) => id)
          .join(", ")}`,
      );
    }
    if (currentTask && currentTask !== "none" && !["done", "dropped"].includes(taskStates.get(currentTask))) {
      fail(`completed project current_task ${currentTask} must be none, done, or dropped`);
    }
  } else {
    if (currentTask && taskStates.get(currentTask) !== "doing") {
      fail(`current_task ${currentTask} must exist with state doing`);
    }
    if (doingTasks.length !== 1) fail(`expected exactly one doing task, found ${doingTasks.length}`);
  }
  const currentPhase = frontmatter.get("current_phase");
  if (currentTask && currentTask !== "none" && taskRows.get(currentTask)?.phase !== currentPhase) {
    fail(`current_phase ${currentPhase} does not match ${currentTask}`);
  }
  for (const [id, row] of taskRows) {
    if (row.state !== "done") continue;
    const evidenceIds = [...row.evidence.matchAll(/EVD-\d{4}/g)].map((match) => match[0]);
    if (evidenceIds.length === 0) fail(`done task ${id} has no registered EVD`);
    for (const evidenceId of evidenceIds) {
      if (evidenceStates.get(evidenceId) !== "pass") {
        fail(`done task ${id} requires pass evidence ${evidenceId}`);
      }
      if (!containsId(evidenceRows.get(evidenceId)?.proves, id)) {
        fail(`done task ${id} requires evidence ${evidenceId} to reference it in the proof-object column`);
      }
    }
    if (!row.deliverable || !row.acceptance || /^(?:待分配|无|TBD)$/i.test(row.acceptance)) {
      fail(`done task ${id} has incomplete deliverable or acceptance contract`);
    }
  }

  const gateStates = new Map();
  const allowedGateStates = new Set(["not_started", "partial", "pass", "fail", "stale"]);
  for (const line of lines) {
    const cells = cellsOf(line);
    if (!/^GATE-\d{3}$/.test(cells[0] ?? "")) continue;
    requireCellCount(cells[0], cells, 4);
    const state = cells[3];
    if (!allowedGateStates.has(state)) fail(`gate ${cells[0]} has no valid state`);
    else gateStates.set(cells[0], state);
  }

  const adrStates = new Set(["proposed", "accepted", "rejected", "superseded"]);
  const adrStatesById = new Map();
  const acceptedAdrFields = [
    "决策日期",
    "决策人",
    "上下文",
    "关联需求",
    "关联不变量",
    "候选",
    "最终决定",
    "排除理由",
    "正面后果",
    "负面后果",
    "运维/恢复/兼容影响",
    "关联风险",
    "验证计划/证据",
    "重开触发",
    "supersedes",
    "superseded_by",
  ];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^###\s+(ADR-\d{4})：/);
    if (!match) continue;
    const end = lines.slice(index + 1).findIndex((line) => /^###\s+ADR-\d{4}：|^##\s+/.test(line));
    const block = lines.slice(index + 1, end === -1 ? lines.length : index + 1 + end);
    const stateLine = block.find((line) => line.startsWith("- 状态："));
    const state = stateLine?.match(/`([^`]+)`/)?.[1];
    if (!state || !adrStates.has(state)) fail(`ADR ${match[1]} has no valid state`);
    else adrStatesById.set(match[1], state);
    if (state === "accepted") {
      for (const field of acceptedAdrFields) {
        const fieldLine = block.find((line) => line.startsWith(`- ${field}：`));
        if (!fieldLine) {
          fail(`accepted ADR ${match[1]} missing field: ${field}`);
          continue;
        }
        const value = fieldLine.slice(`- ${field}：`.length).trim();
        if (isPlaceholder(value)) {
          fail(`accepted ADR ${match[1]} has empty or placeholder field: ${field}`);
        }
      }
    }
  }

  const assumptionStates = new Set(["open", "validated", "invalidated", "superseded"]);
  const openQuestionStates = new Set(["open", "resolved", "deferred", "superseded"]);
  const requirementStates = new Set([
    "draft",
    "accepted",
    "implemented",
    "verified",
    "deferred",
    "rejected",
    "superseded",
  ]);
  const invariantStates = new Set(["proposed", "accepted", "enforced", "verified", "broken", "superseded"]);
  const riskStates = new Set(["open", "mitigating", "accepted", "closed"]);
  const profileStates = new Set(["missing", "draft", "accepted", "verified", "stale", "superseded"]);
  const versionStates = new Set(["proposed", "accepted", "deprecated", "superseded"]);
  const requirementRows = [];
  const invariantRows = [];
  const riskRows = [];
  const profileRows = [];
  const profileRowsById = new Map();
  const profilePattern = new RegExp(`^${profileId}$`);
  const atomicProfilePattern = new RegExp(`^${atomicProfileId}$`);
  const profileSetPattern = new RegExp(`^${profileSetId}$`);
  const qualificationSetPattern = new RegExp(`^${qualificationSetId}$`);
  const parseStrictTraceIds = (value, patternSource, label) => {
    const source = (value ?? "").trim();
    const tokenSource = `\`(${patternSource})\``;
    const fullPattern = new RegExp(`^${tokenSource}(?:\\s*<br\\s*/?>\\s*${tokenSource})*$`);
    if (!fullPattern.test(source)) {
      fail(`${label} must contain only backticked IDs separated by <br>`);
      return [];
    }
    return [...source.matchAll(new RegExp(tokenSource, "g"))].map((match) => match[1]);
  };
  const proofObjectIdSource = `(?:FACT-\\d{3}|ASM-\\d{3}|OQ-\\d{3}|REQ-(?:FUNC|QUAL|OPS|SEC)-\\d{3}|INV-\\d{3}|ADR-\\d{4}|RISK-\\d{3}|EVD-\\d{4}|GATE-\\d{3}|TASK-P\\d+-\\d{3}|${profileId})`;
  const parseStrictProofObjectIds = (value, label) => {
    const source = (value ?? "").trim();
    const fullPattern = new RegExp(`^${proofObjectIdSource}(?:/${proofObjectIdSource})*$`);
    if (!fullPattern.test(source)) {
      fail(`${label} must be a positive slash-separated ID list with no prose`);
      return [];
    }
    return source.split("/");
  };
  const exactPassProofs = (evidenceIds, expectedIds, expectedKind, expectedResult, label) => {
    const expected = [...expectedIds].sort();
    const matched = [];
    for (const evidenceId of evidenceIds) {
      if (evidenceStates.get(evidenceId) !== "pass") continue;
      const proofIds = parseStrictProofObjectIds(evidenceRows.get(evidenceId)?.proves, `${label} ${evidenceId}`);
      const uniqueProofIds = [...new Set(proofIds)].sort();
      if (
        proofIds.length === expected.length &&
        uniqueProofIds.join(",") === expected.join(",") &&
        normalizedValue(evidenceRows.get(evidenceId)?.result) === expectedResult
      ) {
        const row = evidenceRows.get(evidenceId);
        const artifacts = row?.localMarkdownArtifacts ?? [];
        if (artifacts.length !== 1) {
          fail(`${label} ${evidenceId} requires exactly one project-contained non-symlink Markdown artifact`);
          continue;
        }
        const artifact = artifacts[0];
        if (
          Object.values(artifact.machineFieldCounts).some((count) => count !== 1) ||
          artifact.evidenceId !== evidenceId ||
          artifact.kind !== expectedKind ||
          artifact.verdict !== "pass" ||
          artifact.proofObject !== normalizedValue(row?.proves) ||
          artifact.result !== expectedResult
        ) {
          fail(
            `${label} ${evidenceId} artifact must exactly bind Evidence-ID, Evidence-Kind, Verdict, Proof-Object, and Result to the registry`,
          );
          continue;
        }
        matched.push(evidenceId);
      }
    }
    return matched;
  };
  for (const line of lines) {
    const cells = cellsOf(line);
    const id = cells[0] ?? "";
    if (/^ASM-\d{3}$/.test(id)) {
      requireCellCount(id, cells, 4);
      requireFields(id, [
        ["assumption", cells[1]],
        ["validation method", cells[2]],
      ]);
      if (!assumptionStates.has(cells[3])) fail(`assumption ${id} has no valid state`);
    }
    if (/^OQ-\d{3}$/.test(id)) {
      requireCellCount(id, cells, 8);
      requireFields(id, [
        ["question", cells[1]],
        ["decision deadline", cells[3]],
        ["related item", cells[4]],
        ["updated", cells[6]],
      ]);
      if (!openQuestionStates.has(cells[7])) fail(`open question ${id} has no valid state`);
      if (cells[7] === "resolved" && isPlaceholder(cells[5])) {
        fail(`resolved open question ${id} requires a non-placeholder resolution`);
      }
    }
    if (/^REQ-(?:FUNC|QUAL|OPS|SEC)-\d{3}$/.test(id)) {
      requireCellCount(id, cells, 5);
      requireFields(id, [
        ["normative statement", cells[1]],
        ["priority", cells[2]],
        ["acceptance", cells[3]],
      ]);
      if (!requirementStates.has(cells[4])) fail(`requirement ${id} has no valid state`);
      requirementRows.push(cells);
    }
    if (/^INV-\d{3}$/.test(id)) {
      requireCellCount(id, cells, 5);
      requireFields(id, [
        ["predicate", cells[1]],
        ["enforcement point", cells[2]],
        ["oracle", cells[3]],
      ]);
      if (!invariantStates.has(cells[4])) fail(`invariant ${id} has no valid state`);
      invariantRows.push(cells);
    }
    if (/^RISK-\d{3}$/.test(id)) {
      requireCellCount(id, cells, 9);
      requireFields(id, [
        ["scenario", cells[1]],
        ["impact", cells[2]],
        ["detection", cells[3]],
        ["mitigation", cells[4]],
        ["review date", cells[7]],
      ]);
      if (!riskStates.has(cells[8])) fail(`risk ${id} has no valid state`);
      if (["accepted", "closed"].includes(cells[8])) {
        if (isPlaceholder(cells[5]) || cells[5] === "unassigned") {
          fail(`${cells[8]} risk ${id} requires an owner`);
        }
        if (isPlaceholder(cells[6]) || cells[6].startsWith("未接受")) {
          fail(`${cells[8]} risk ${id} requires an explicit disposition`);
        }
      }
      riskRows.push(cells);
    }
    if (profilePattern.test(id)) {
      requireCellCount(id, cells, 6);
      requireFields(id, [
        ["type", cells[1]],
        ["owner", cells[3]],
        ["current source", cells[4]],
        ["next action", cells[5]],
      ]);
      if (!profileStates.has(cells[2])) fail(`profile ${id} has no valid state`);
      if (["accepted", "verified"].includes(cells[2])) {
        if (cells[3] === "unassigned") fail(`${cells[2]} profile ${id} requires an owner`);
        if (/^(?:无|不存在|none\b)/i.test(cells[4])) {
          fail(`${cells[2]} profile ${id} requires a concrete source`);
        }
      }
      profileRows.push(cells);
      profileRowsById.set(id, cells);
    }
  }

  const versionStart = lines.findIndex((line) => line === "### 4.4 版本账本");
  const versionEnd = lines.findIndex((line, index) => index > versionStart && /^##\s+/.test(line));
  if (versionStart === -1) {
    fail("missing version ledger");
  } else {
    const versionBlock = lines.slice(versionStart + 1, versionEnd === -1 ? lines.length : versionEnd);
    for (const line of versionBlock) {
      const cells = cellsOf(line);
      if (cells.length === 0 || cells[0] === "组件" || /^-+$/.test(cells[0])) continue;
      const id = `version ${cells[0] ?? "unknown"}`;
      requireCellCount(id, cells, 5);
      requireFields(id, [
        ["component", cells[0]],
        ["state", cells[2]],
        ["acceptance prerequisite", cells[4]],
      ]);
      if (!versionStates.has(cells[2])) fail(`${id} has no valid state`);
      if (cells[2] === "accepted") {
        requireFields(id, [
          ["version", cells[1]],
          ["evidence", cells[3]],
        ]);
      }
    }
  }

  const profileSetBindings = new Map();
  const qualificationSetBindings = new Map();
  const profileTraceStart = lines.findIndex((line) => line === "### 12.1.1 Profile Set 追踪矩阵");
  const profileTraceEnd = lines.findIndex(
    (line, index) => index > profileTraceStart && /^###\s+12\.(?:1\.[2-9]|[2-9])\b|^##\s+/.test(line),
  );
  if (profileTraceStart !== -1) {
    const profileTraceBlock = lines.slice(
      profileTraceStart + 1,
      profileTraceEnd === -1 ? lines.length : profileTraceEnd,
    );
    for (const line of profileTraceBlock) {
      const cells = cellsOf(line);
      const setId = (cells[0] ?? "").replaceAll("`", "");
      if (!profileSetPattern.test(setId) && !qualificationSetPattern.test(setId)) continue;
      requireCellCount(`profile trace ${setId}`, cells, 3);
      const evidenceIds = parseStrictTraceIds(cells[2], "EVD-\\d{4}", `Profile trace ${setId} evidence`);
      if (profileSetPattern.test(setId)) {
        if (profileSetBindings.has(setId)) fail(`duplicate Profile Set trace row for ${setId}`);
        const memberIds = parseStrictTraceIds(cells[1], atomicProfileId, `Profile Set ${setId} binding`);
        profileSetBindings.set(setId, { memberIds, evidenceIds });
      } else {
        if (qualificationSetBindings.has(setId)) fail(`duplicate Qualification Set trace row for ${setId}`);
        const boundProfileSetIds = parseStrictTraceIds(
          cells[1],
          profileSetId,
          `Qualification Set ${setId} binding`,
        );
        qualificationSetBindings.set(setId, { boundProfileSetIds, evidenceIds });
      }
    }
  }

  const gateEvidence = new Map();
  const traceStart = lines.findIndex((line) => line === "### 15.1 Gate 追踪矩阵");
  const traceEnd = lines.findIndex((line, index) => index > traceStart && /^##\s+/.test(line));
  if (traceStart !== -1) {
    const traceBlock = lines.slice(traceStart + 1, traceEnd === -1 ? lines.length : traceEnd);
    for (const line of traceBlock) {
      const cells = cellsOf(line);
      const gateId = (cells[0] ?? "").replaceAll("`", "");
      if (!/^GATE-\d{3}$/.test(gateId)) continue;
      requireCellCount(`trace ${gateId}`, cells, 4);
      if (gateEvidence.has(gateId)) fail(`duplicate Gate trace row for ${gateId}`);
      gateEvidence.set(
        gateId,
        [...(cells[3] ?? "").matchAll(/EVD-\d{4}/g)].map((match) => match[0]),
      );
    }
  }

  const claimStatus = frontmatter.get("claim_status");
  const allGatesPass = gateStates.size > 0 && [...gateStates.values()].every((state) => state === "pass");
  if (claimStatus === "not_proven") {
    if (frontmatter.get("qualification_profile") !== "none") {
      fail("not_proven claim must keep qualification_profile none");
    }
    if (frontmatter.get("qualification_evidence_set") !== "none") {
      fail("not_proven claim must keep qualification_evidence_set none");
    }
  }
  if (claimStatus === "qualified_for_named_profile") {
    if (!allGatesPass) fail("qualified claim is forbidden while any production gate is not pass");
    const qualificationProfile = frontmatter.get("qualification_profile");
    const qualificationProfileRow = profileRowsById.get(qualificationProfile);
    if (!qualificationProfileRow || !profileSetPattern.test(qualificationProfile)) {
      fail("qualified claim requires qualification_profile to reference a defined PROFILE_SET");
    } else if (qualificationProfileRow[2] !== "verified") {
      fail(`qualified claim requires verified qualification_profile ${qualificationProfile}`);
    }
    const qualificationEvidenceSet = frontmatter.get("qualification_evidence_set");
    const qualificationEvidenceRow = profileRowsById.get(qualificationEvidenceSet);
    if (!qualificationEvidenceRow || !qualificationSetPattern.test(qualificationEvidenceSet)) {
      fail("qualified claim requires qualification_evidence_set to reference a defined QUALIFICATION_SET");
    } else if (qualificationEvidenceRow[2] !== "verified") {
      fail(`qualified claim requires verified qualification_evidence_set ${qualificationEvidenceSet}`);
    }
    const qualificationBoundaryPattern = /(?:\bdraft\b|\bunresolved\b|\bnull\b|\bmissing\b|\bunknown\b|\bnone\b|\bunassigned\b|\bTBD\b|\bTODO\b|not[_ -]?proven|not[_ -]?qualified|未知|未分配|待确认|待定|待分配|未闭合|未验证|无来源|无真实)/i;
    for (const [id, cells] of [
      [qualificationProfile, qualificationProfileRow],
      [qualificationEvidenceSet, qualificationEvidenceRow],
    ]) {
      if (cells && [cells[3], cells[4], cells[5]].some((value) => qualificationBoundaryPattern.test(value))) {
        fail(`qualified claim forbids unresolved, unknown, or draft owner/source/action text for ${id}`);
      }
    }
    if (frontmatter.get("record_health") !== "current") {
      fail("qualified claim requires record_health current");
    }
    const currentAdrs = [...adrStatesById].filter(([, state]) => !["rejected", "superseded"].includes(state));
    if (currentAdrs.length === 0) fail("qualified claim requires at least one current ADR");
    for (const [adrId, state] of currentAdrs) {
      if (state !== "accepted") fail(`qualified claim requires accepted current ADR ${adrId}`);
    }
    const mustRequirements = requirementRows.filter(
      (cells) => cells[2] === "must" && !["rejected", "superseded"].includes(cells[4]),
    );
    if (mustRequirements.length === 0) fail("qualified claim requires at least one current must requirement");
    for (const cells of mustRequirements) {
      if (cells[4] !== "verified") {
        fail(`qualified claim requires verified must requirement ${cells[0]}`);
      }
    }
    const currentInvariants = invariantRows.filter((cells) => cells[4] !== "superseded");
    if (currentInvariants.length === 0) fail("qualified claim requires at least one current invariant");
    for (const cells of currentInvariants) {
      if (cells[4] !== "verified") {
        fail(`qualified claim requires verified invariant ${cells[0]}`);
      }
    }
    const currentProfiles = profileRows.filter(
      (cells) => atomicProfilePattern.test(cells[0]) && cells[2] !== "superseded",
    );
    if (currentProfiles.length !== 4) {
      fail(`qualified claim requires exactly four current atomic profiles, found ${currentProfiles.length}`);
    }
    for (const cells of currentProfiles) {
      if (cells[2] !== "verified") fail(`qualified claim requires verified profile ${cells[0]}`);
      if ([cells[3], cells[4], cells[5]].some((value) => qualificationBoundaryPattern.test(value))) {
        fail(`qualified claim forbids unresolved, unknown, or draft owner/source/action text for ${cells[0]}`);
      }
    }
    const currentKinds = currentProfiles.map((cells) => cells[0].split("_PROFILE-")[0]);
    const expectedKinds = ["DURABILITY", "FAILURE", "HARDWARE", "WORKLOAD"];
    if ([...new Set(currentKinds)].sort().join(",") !== expectedKinds.join(",")) {
      fail(`qualified claim requires one current profile of each kind; found ${currentKinds.sort().join(",")}`);
    }
    const selectedProfileBinding = profileSetBindings.get(qualificationProfile);
    if (!selectedProfileBinding) {
      fail(`qualified claim requires a Profile Set trace row for ${qualificationProfile}`);
    } else {
      const expectedMemberIds = currentProfiles.map((cells) => cells[0]).sort();
      const actualMemberIds = [...new Set(selectedProfileBinding.memberIds)].sort();
      if (
        selectedProfileBinding.memberIds.length !== 4 ||
        actualMemberIds.join(",") !== expectedMemberIds.join(",")
      ) {
        fail(`Profile Set ${qualificationProfile} must bind exactly the four current atomic profiles`);
      }
      const setEvidenceIds = exactPassProofs(
        selectedProfileBinding.evidenceIds,
        [qualificationProfile, ...expectedMemberIds],
        "profile_set_verification",
        `profile_set_verified=${qualificationProfile}`,
        `Profile Set ${qualificationProfile} evidence`,
      );
      if (setEvidenceIds.length !== 1) {
        fail(`Profile Set ${qualificationProfile} requires exactly one pass evidence proving the set and all four members`);
      } else {
        const expectedSource = setEvidenceIds[0];
        for (const cells of [...currentProfiles, qualificationProfileRow]) {
          if (cells && normalizedValue(cells[4]) !== expectedSource) {
            fail(`${cells[0]} current source must be the selected Profile Set evidence ${expectedSource}`);
          }
        }
      }
    }
    const selectedQualificationBinding = qualificationSetBindings.get(qualificationEvidenceSet);
    if (!selectedQualificationBinding) {
      fail(`qualified claim requires a Qualification Set trace row for ${qualificationEvidenceSet}`);
    } else {
      if (
        selectedQualificationBinding.boundProfileSetIds.length !== 1 ||
        selectedQualificationBinding.boundProfileSetIds[0] !== qualificationProfile
      ) {
        fail(`Qualification Set ${qualificationEvidenceSet} must bind selected Profile Set ${qualificationProfile}`);
      }
      const qualificationEvidenceIds = exactPassProofs(
        selectedQualificationBinding.evidenceIds,
        [qualificationEvidenceSet, qualificationProfile],
        "qualification_grant",
        `qualification_granted=${qualificationEvidenceSet};profile_set=${qualificationProfile};claim=qualified_for_named_profile`,
        `Qualification Set ${qualificationEvidenceSet} evidence`,
      );
      if (qualificationEvidenceIds.length !== 1) {
        fail(`Qualification Set ${qualificationEvidenceSet} requires exactly one pass evidence proving it and the selected Profile Set`);
      } else if (normalizedValue(qualificationEvidenceRow?.[4]) !== qualificationEvidenceIds[0]) {
        fail(`${qualificationEvidenceSet} current source must be its selected qualification evidence ${qualificationEvidenceIds[0]}`);
      }
    }
    if (riskRows.length === 0) fail("qualified claim requires a risk register");
    for (const cells of riskRows) {
      const [id, , , , , owner, acceptance, , state] = cells;
      if (
        state !== "closed" &&
        (isPlaceholder(owner) || owner === "unassigned" || isPlaceholder(acceptance) || acceptance.startsWith("未接受"))
      ) {
        fail(`qualified claim requires an owned, explicitly accepted disposition for ${id}`);
      }
    }
    for (const [gateId] of gateStates) {
      const evidenceIds = gateEvidence.get(gateId) ?? [];
      const hasRelatedPassEvidence = evidenceIds.some(
        (evidenceId) =>
          evidenceStates.get(evidenceId) === "pass" && containsId(evidenceRows.get(evidenceId)?.proves, gateId),
      );
      if (!hasRelatedPassEvidence) {
        fail(`qualified claim requires ${gateId} to trace to pass evidence whose proof object references the Gate`);
      }
    }
  }

  const now = Date.now();
  const reviewDue = Date.parse(frontmatter.get("next_review_due") ?? "");
  if (!Number.isFinite(reviewDue)) fail("invalid next_review_due");
  if (Number.isFinite(reviewDue) && reviewDue < now && frontmatter.get("record_health") === "current") {
    fail("record_health cannot remain current after next_review_due");
  }
  for (const cells of riskRows) {
    const reviewAt = Date.parse(cells[7] ?? "");
    if (!Number.isFinite(reviewAt)) fail(`risk ${cells[0]} has invalid review date`);
    if (reviewAt < now && cells[8] !== "closed" && frontmatter.get("record_health") === "current") {
      fail(`risk ${cells[0]} review is overdue while record_health is current`);
    }
  }

  const resumeStart = lines.findIndex((line) => line === "## 0. Resume Capsule");
  const resumeEnd = lines.findIndex((line, index) => index > resumeStart && /^##\s+/.test(line));
  const resume = lines.slice(resumeStart, resumeEnd === -1 ? lines.length : resumeEnd).join("\n");
  for (const required of [currentTask, currentPhase, claimStatus, "INV-001", "INV-015", "RISK-001", "RISK-012"]) {
    if (required && !resume.includes(required)) fail(`Resume Capsule missing ${required}`);
  }
  if (!source.includes("## 0. Resume Capsule")) fail("missing Resume Capsule");
  if (!source.includes("## 23. Append-only Change Log")) fail("missing append-only change log");

  return {
    failures,
    projectId: frontmatter.get("project_id"),
    definitions: definitions.size,
    tasks: taskStates.size,
    gates: gateStates.size,
  };
}
