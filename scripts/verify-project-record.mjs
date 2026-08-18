import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
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
  for (const line of (frontmatterMatch?.[1] ?? "").split("\n")) {
    const match = line.match(/^([a-z_]+):\s*(.+)$/);
    if (match) frontmatter.set(match[1], match[2].trim());
  }

  const requiredFrontmatter = [
    "record_schema",
    "project_id",
    "record_health",
    "project_status",
    "claim_status",
    "qualification_profile",
    "current_phase",
    "current_task",
    "updated_at",
    "last_reconciled_at",
    "reconciliation_base_git_sha",
    "next_review_due",
  ];
  for (const key of requiredFrontmatter) {
    if (!frontmatter.has(key)) fail(`missing frontmatter field: ${key}`);
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

  const profileId = "(?:WORKLOAD|HARDWARE|DURABILITY|FAILURE)_PROFILE-\\d{3}";
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
    evidenceRows.set(cells[0], {
      proves: cells[1],
      artifact: cells[2],
      environment: cells[3],
      result: cells[4],
      state,
      invalidation: cells[6],
    });
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
      const artifactPath = resolve(recordPath, "..", decodedPath);
      try {
        const artifactStat = await stat(artifactPath);
        if (!artifactStat.isFile()) {
          fail(`evidence ${cells[0]} relative artifact is not a file: ${artifactLink}`);
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
      const declaredId = artifactSource.match(/^- 证据 ID：\s*`?(EVD-\d{4})`?\s*$/m)?.[1];
      if (declaredId !== cells[0]) {
        fail(`evidence ${cells[0]} Markdown artifact ${artifactLink} must declare the same evidence ID`);
      }
      const declaredVerdict = artifactSource.match(/^- Verdict：\s*`?([a-z_]+)`?/m)?.[1];
      if (declaredVerdict !== state) {
        fail(
          `evidence ${cells[0]} Markdown artifact ${artifactLink} verdict ${declaredVerdict ?? "missing"} does not match registry state ${state}`,
        );
      }
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
  if (claimStatus === "qualified_for_named_profile") {
    if (!allGatesPass) fail("qualified claim is forbidden while any production gate is not pass");
    const qualificationProfile = frontmatter.get("qualification_profile");
    const qualificationProfileRow = profileRowsById.get(qualificationProfile);
    if (!qualificationProfileRow) {
      fail("qualified claim requires qualification_profile to reference a defined profile");
    } else if (qualificationProfileRow[2] !== "verified") {
      fail(`qualified claim requires verified qualification_profile ${qualificationProfile}`);
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
    const currentProfiles = profileRows.filter((cells) => cells[2] !== "superseded");
    if (currentProfiles.length === 0) fail("qualified claim requires at least one current profile");
    for (const cells of currentProfiles) {
      if (cells[2] !== "verified") fail(`qualified claim requires verified profile ${cells[0]}`);
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
