export type PracticeUnitLifecycle =
  | "CONTRACTED"
  | "READY"
  | "IN_PROGRESS"
  | "CODE_VERIFIED"
  | "CONTENT_VERIFIED"
  | "PUBLISHED";

export interface SupersededPracticeRef {
  ref: string;
  reason: string;
}

export interface PracticeEvidenceContract {
  schemaVersion: string;
  project: string;
  publicManifestPath: string;
  manifestSha256: string;
  claimIds: readonly string[];
  limitations: readonly string[];
  reportFacts: readonly PracticeEvidenceReportFact[];
}

export interface PracticeEvidenceReportFact {
  artifactPath: string;
  field: string;
  equals: string | number | boolean | null;
  claimId?: string;
  observationField?: string;
}

export interface PracticeLessonContract {
  lessonOrder: number;
  permalink: string;
}

export interface PracticeUnit {
  projectSlug: string;
  profileVersion: string;
  code: string;
  trackCode: string;
  title: string;
  summary: string;
  objective: string;
  order: number;
  lifecycle: PracticeUnitLifecycle;
  contractPlanVersion: string;
  planCompatibility?: string;
  prerequisiteUnitCodes: readonly string[];
  startRef?: string;
  supersededStartRefs?: readonly SupersededPracticeRef[];
  completeRef?: string;
  completeCommit?: string;
  productRelease?: string;
  evidencePath?: string;
  evidenceUrl?: string;
  evidenceContract?: PracticeEvidenceContract;
  expectedLessons?: readonly PracticeLessonContract[];
  adds: readonly string[];
  delivers: readonly string[];
  freezes: readonly string[];
  excludes: readonly string[];
  gate: readonly string[];
  interaction: readonly string[];
  evidence: readonly string[];
  stopPoint: string;
  localCommands: readonly string[];
}

const LIFECYCLE_RANK: Readonly<Record<PracticeUnitLifecycle, number>> = {
  CONTRACTED: 0,
  READY: 1,
  IN_PROGRESS: 2,
  CODE_VERIFIED: 3,
  CONTENT_VERIFIED: 4,
  PUBLISHED: 5,
};

// Only contracted or started units belong here. Candidate units stay in the
// design document until their contract is frozen; this prevents empty course
// pages from becoming an accidental public roadmap.
export const PRACTICE_UNITS: readonly PracticeUnit[] = [
  {
    projectSlug: "high-availability-cex",
    profileVersion: "SPOT-CEX-1.0",
    code: "M00",
    trackCode: "M",
    title: "最小可执行规格",
    summary: "冻结一条 PlaceLimitOrder 输入、确定性验证和 canonical history digest，让后续撮合演进拥有不可漂移的第一份合同。",
    objective: "把一条不可信的限价单候选输入转换成可运行、可证伪且不产生订单簿状态的验证合同。",
    order: 10,
    lifecycle: "PUBLISHED",
    contractPlanVersion: "0.1",
    planCompatibility: "PLAN v0.4 冻结 M02 的可寻址订单生命周期合同；M00 输入、验证、canonical history、digest 与 evidence 合同不变。",
    prerequisiteUnitCodes: [],
    startRef: "course/m00.2-start",
    supersededStartRefs: [
      {
        ref: "course/m00-start",
        reason: "bootstrap 任务源码未进入 Git",
      },
      {
        ref: "course/m00.1-start",
        reason: "修复了任务源码，但仓内文档仍指向失败的原始起点",
      },
    ],
    completeRef: "course/m00-complete",
    completeCommit: "2aa9f344cf1b57dd84b622362ecc0c6866121145",
    evidencePath: "build/lab-evidence/M00/manifest.json",
    evidenceUrl:
      "https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m00/evidence/manifest.json",
    evidenceContract: {
      schemaVersion: "cex.lab-evidence.v1",
      project: "matching",
      publicManifestPath: "practice/high-availability-cex/m00/evidence/manifest.json",
      manifestSha256: "a8962136833f185bee24fd45f22ea58b0db0ac1c837106f02dba7d2483f9deee",
      claimIds: [
        "input-contract",
        "canonical-history",
        "deterministic-replay",
        "semantic-mutant",
        "architecture-boundary",
      ],
      limitations: [
        "Only one PlaceLimitOrder input contract is implemented for BTC-USDT.",
        "A VALID result is not Accepted, Rested, or Trade and creates no order-book state.",
        "There is no cancel, amendment, market order, TIF, STP, fee, asset, or account logic.",
        "The unit has no persistence, networking, database, threads, Aeron, or high availability.",
        "The evidence makes no throughput, latency, recovery, or production-readiness claim.",
      ],
      reportFacts: [
        { artifactPath: "reports/check.json", field: "schemaVersion", equals: "matching.m00.check.v2" },
        { artifactPath: "reports/check.json", field: "unit", equals: "M00" },
        { artifactPath: "reports/check.json", field: "status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "contractPlanVersion", equals: "0.1" },
        {
          artifactPath: "reports/check.json",
          field: "fixture.sha256",
          equals: "5809644a1c27c5b57b9162ee2a051a020b6a0fa13ab9aa31f53222c1081c540f",
          claimId: "input-contract",
          observationField: "fixtureSha256",
        },
        {
          artifactPath: "reports/check.json",
          field: "fixture.records",
          equals: 17,
          claimId: "input-contract",
          observationField: "records",
        },
        {
          artifactPath: "reports/check.json",
          field: "fixture.valid",
          equals: 2,
          claimId: "input-contract",
          observationField: "valid",
        },
        {
          artifactPath: "reports/check.json",
          field: "fixture.invalid",
          equals: 15,
          claimId: "input-contract",
          observationField: "invalid",
        },
        {
          artifactPath: "reports/check.json",
          field: "canonical.format",
          equals: "M00H1",
          claimId: "canonical-history",
          observationField: "format",
        },
        {
          artifactPath: "reports/check.json",
          field: "canonical.lines",
          equals: 37,
          claimId: "canonical-history",
          observationField: "lines",
        },
        {
          artifactPath: "reports/check.json",
          field: "canonical.utf8Bytes",
          equals: 3199,
          claimId: "canonical-history",
          observationField: "utf8Bytes",
        },
        {
          artifactPath: "reports/check.json",
          field: "canonical.digest",
          equals: "sha256:2d287d677d5f200f2b5bd1dd18dabbd40e865779489ce6da36d0411a3b670669",
          claimId: "canonical-history",
          observationField: "digest",
        },
        {
          artifactPath: "reports/check.json",
          field: "replays.requested",
          equals: 100,
          claimId: "deterministic-replay",
          observationField: "requested",
        },
        {
          artifactPath: "reports/check.json",
          field: "replays.completed",
          equals: 100,
          claimId: "deterministic-replay",
          observationField: "completed",
        },
        {
          artifactPath: "reports/check.json",
          field: "replays.distinctDigests",
          equals: 1,
          claimId: "deterministic-replay",
          observationField: "distinctDigests",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutant.id",
          equals: "M00-QTY-ZERO-ACCEPTED",
          claimId: "semantic-mutant",
          observationField: "id",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutant.classification",
          equals: "STUDENT_FAILURE",
          claimId: "semantic-mutant",
          observationField: "classification",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutant.killed",
          equals: true,
          claimId: "semantic-mutant",
          observationField: "killed",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutant.caseId",
          equals: "quantity-zero",
          claimId: "semantic-mutant",
          observationField: "caseId",
        },
        {
          artifactPath: "reports/check.json",
          field: "architecture.coreSourceFiles",
          equals: 10,
          claimId: "architecture-boundary",
          observationField: "coreSourceFiles",
        },
        {
          artifactPath: "reports/check.json",
          field: "architecture.violations",
          equals: 0,
          claimId: "architecture-boundary",
          observationField: "violations",
        },
        { artifactPath: "reports/check.json", field: "architecture.status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "assertions.length", equals: 6 },
        { artifactPath: "reports/check.json", field: "assertions.0.id", equals: "fixture-boundary" },
        { artifactPath: "reports/check.json", field: "assertions.0.status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "assertions.1.id", equals: "validation-contract" },
        { artifactPath: "reports/check.json", field: "assertions.1.status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "assertions.2.id", equals: "canonical-golden" },
        { artifactPath: "reports/check.json", field: "assertions.2.status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "assertions.3.id", equals: "deterministic-replay" },
        { artifactPath: "reports/check.json", field: "assertions.3.status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "assertions.4.id", equals: "architecture-boundary" },
        { artifactPath: "reports/check.json", field: "assertions.4.status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "assertions.5.id", equals: "semantic-mutant" },
        { artifactPath: "reports/check.json", field: "assertions.5.status", equals: "PASS" },
        {
          artifactPath: "reports/mutants.json",
          field: "schemaVersion",
          equals: "matching.m00.mutants.v1",
        },
        { artifactPath: "reports/mutants.json", field: "candidates.length", equals: 3 },
        { artifactPath: "reports/mutants.json", field: "candidates.0.id", equals: "PRODUCTION-CONTROL" },
        { artifactPath: "reports/mutants.json", field: "candidates.0.classification", equals: "PASS" },
        { artifactPath: "reports/mutants.json", field: "candidates.0.killed", equals: false },
        {
          artifactPath: "reports/mutants.json",
          field: "candidates.1.id",
          equals: "M00-QTY-ZERO-ACCEPTED",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "candidates.1.classification",
          equals: "STUDENT_FAILURE",
        },
        { artifactPath: "reports/mutants.json", field: "candidates.1.killed", equals: true },
        { artifactPath: "reports/mutants.json", field: "candidates.1.caseId", equals: "quantity-zero" },
        { artifactPath: "reports/mutants.json", field: "candidates.2.id", equals: "SYSTEM-ERROR-CONTROL" },
        {
          artifactPath: "reports/mutants.json",
          field: "candidates.2.classification",
          equals: "SYSTEM_ERROR",
        },
        { artifactPath: "reports/mutants.json", field: "candidates.2.killed", equals: false },
        {
          artifactPath: "reports/architecture.json",
          field: "schemaVersion",
          equals: "matching.m00.architecture.v1",
        },
        { artifactPath: "reports/architecture.json", field: "status", equals: "PASS" },
        { artifactPath: "reports/architecture.json", field: "coreSourceFiles", equals: 10 },
        { artifactPath: "reports/architecture.json", field: "violations.length", equals: 0 },
      ],
    },
    expectedLessons: [
      { lessonOrder: 10, permalink: "place-limit-order-input-contract" },
      { lessonOrder: 20, permalink: "fixture-canonical-history" },
      { lessonOrder: 30, permalink: "fail-closed-deterministic-judge" },
      { lessonOrder: 40, permalink: "publish-verifiable-evidence" },
    ],
    adds: ["PlaceLimitOrder 输入合同", "按固定优先级执行的确定性验证", "canonical history 与 SHA-256 digest"],
    delivers: ["固定语料可以被重复解析并得到逐字节一致的历史", "无订单簿时也能先证明输入边界与裁判语义"],
    freezes: [
      "BTC-USDT、PlaceLimitOrder、正 long tick/lot 与 BUY/SELL 的精确输入域",
      "instrumentId → orderId → side → priceTicks → quantityLots 的错误优先级",
      "M00H1 canonical bytes、固定 fixture、semantic digest 与失败关闭裁判语义",
    ],
    excludes: ["订单簿、成交和撤单", "WAL、快照与数据库", "Aeron Cluster、网关和账户资产"],
    gate: ["固定 fixture 通过 Draft 2020-12 schema", "100 次重放产生同一 canonical digest", "必需 semantic mutant 被确定性裁判杀死"],
    interaction: [
      "在看到结果前预测合法与非法输入的首个错误字段",
      "逐条回放固定 fixture，对照 validation result、canonical history 与 digest",
    ],
    evidence: ["M00 check report", "canonical history 与固定 digest", "semantic mutant 和架构边界结果"],
    stopPoint: "一份已发布的可执行输入规格；合法结果仍只是 VALID，不代表订单已经接受、挂单或成交。",
    localCommands: [
      "./gradlew clean build --no-daemon",
      "./gradlew m00Check --no-daemon",
      "./gradlew m00Evidence -Pm00.unitTag=course/m00-complete --no-daemon",
    ],
  },
  {
    projectSlug: "high-availability-cex",
    profileVersion: "SPOT-CEX-1.0",
    code: "M01",
    trackCode: "M",
    title: "单交易对 GTC 限价撮合",
    summary: "把 M00 已冻结的输入合同应用到单写者内存订单簿，以价格优先、同价 FIFO 和 maker price 产生确定、完整、有序的事件 batch。",
    objective: "让一条通过 M00 验证的 GTC 限价命令第一次确定性改变 BTC-USDT 订单簿，并能解释每个业务事件和剩余数量。",
    order: 20,
    lifecycle: "PUBLISHED",
    contractPlanVersion: "0.3",
    planCompatibility: "PLAN v0.4 冻结 M02 的订单索引、撤单与不可逆终态合同；M01 价格时间优先、事件 batch、Golden corpus 与 evidence 合同不变。",
    prerequisiteUnitCodes: ["M00"],
    startRef: "course/m01-start",
    completeRef: "course/m01-complete",
    completeCommit: "be2e3b8e5db4959c5639d7aa3e7314dbac45d82b",
    evidencePath: "build/lab-evidence/M01/manifest.json",
    evidenceUrl:
      "https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m01/evidence/manifest.json",
    evidenceContract: {
      schemaVersion: "cex.lab-evidence.v1",
      project: "matching",
      publicManifestPath: "practice/high-availability-cex/m01/evidence/manifest.json",
      manifestSha256: "a9cfe568883c02c9b4816095cf1bbc11fbd6166f19936141d7bdad46cd942dc2",
      claimIds: [
        "m00-input-regression",
        "price-time-priority",
        "matching-event-batches",
        "quantity-and-book-invariants",
        "deterministic-event-history",
        "semantic-mutants",
        "architecture-boundary",
      ],
      limitations: [
        "Only one in-memory BTC-USDT GTC limit-order book is implemented.",
        "Scenario order IDs are unique; duplicate IDs, duplicate commands, and addressable lifecycle semantics are outside M01.",
        "There is no cancel, amendment, order index, IOC, FOK, post-only, market order, STP, market state, or price band.",
        "There is no account, asset, position, fee, settlement, or risk logic.",
        "Fixed scenarios and semantic mutants are not the independent generated reference model or property proof deferred to M03.",
        "The unit has no persistence, networking, database, threads, Aeron, or high availability.",
        "The evidence makes no throughput, latency, recovery, or production-readiness claim.",
      ],
      reportFacts: [
        { artifactPath: "reports/check.json", field: "schemaVersion", equals: "matching.m01.check.v2" },
        { artifactPath: "reports/check.json", field: "unit", equals: "M01" },
        { artifactPath: "reports/check.json", field: "status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "contractPlanVersion", equals: "0.3" },
        {
          artifactPath: "reports/check.json",
          field: "scenarioCorpus.sha256",
          equals: "d050bc2fc029e3ac0afb5047e3030412412f3a7aecf0938a19a5953618ff9ed7",
          claimId: "price-time-priority",
          observationField: "sha256",
        },
        {
          artifactPath: "reports/check.json",
          field: "scenarioCorpus.scenarios",
          equals: 8,
          claimId: "price-time-priority",
          observationField: "scenarios",
        },
        {
          artifactPath: "reports/check.json",
          field: "scenarioCorpus.cases",
          equals: 22,
          claimId: "price-time-priority",
          observationField: "cases",
        },
        {
          artifactPath: "reports/check.json",
          field: "scenarioCorpus.schemaProbes",
          equals: 5,
          claimId: "price-time-priority",
          observationField: "schemaProbes",
        },
        {
          artifactPath: "reports/check.json",
          field: "m00Regression.status",
          equals: "PASS",
          claimId: "m00-input-regression",
          observationField: "status",
        },
        {
          artifactPath: "reports/check.json",
          field: "m00Regression.artifact",
          equals: "m00-regression.json",
          claimId: "m00-input-regression",
          observationField: "artifact",
        },
        { artifactPath: "reports/check.json", field: "priceTime.status", equals: "PASS" },
        { artifactPath: "reports/check.json", field: "priceTime.artifact", equals: "price-time.json" },
        { artifactPath: "reports/check.json", field: "priceTime.scenarios", equals: 8 },
        { artifactPath: "reports/check.json", field: "priceTime.cases", equals: 22 },
        {
          artifactPath: "reports/check.json",
          field: "eventBatches.status",
          equals: "PASS",
          claimId: "matching-event-batches",
          observationField: "status",
        },
        {
          artifactPath: "reports/check.json",
          field: "eventBatches.artifact",
          equals: "event-batches.json",
          claimId: "matching-event-batches",
          observationField: "artifact",
        },
        {
          artifactPath: "reports/check.json",
          field: "eventBatches.cases",
          equals: 22,
          claimId: "matching-event-batches",
          observationField: "cases",
        },
        {
          artifactPath: "reports/check.json",
          field: "invariants.status",
          equals: "PASS",
          claimId: "quantity-and-book-invariants",
          observationField: "status",
        },
        {
          artifactPath: "reports/check.json",
          field: "invariants.artifact",
          equals: "invariants.json",
          claimId: "quantity-and-book-invariants",
          observationField: "artifact",
        },
        { artifactPath: "reports/check.json", field: "canonical.format", equals: "M01H1" },
        {
          artifactPath: "reports/check.json",
          field: "canonical.digest",
          equals: "sha256:74585489c50e81cc3e6a10044263186ce66a7f1b20e1f45015fed68614c3e5a1",
        },
        { artifactPath: "reports/check.json", field: "canonical.lines", equals: 155 },
        { artifactPath: "reports/check.json", field: "canonical.bytes", equals: 14256 },
        {
          artifactPath: "reports/check.json",
          field: "replays.requested",
          equals: 100,
          claimId: "deterministic-event-history",
          observationField: "requested",
        },
        {
          artifactPath: "reports/check.json",
          field: "replays.completed",
          equals: 100,
          claimId: "deterministic-event-history",
          observationField: "completed",
        },
        {
          artifactPath: "reports/check.json",
          field: "replays.distinctDigests",
          equals: 1,
          claimId: "deterministic-event-history",
          observationField: "distinctDigests",
        },
        {
          artifactPath: "reports/check.json",
          field: "mutants.status",
          equals: "PASS",
          claimId: "semantic-mutants",
          observationField: "status",
        },
        {
          artifactPath: "reports/check.json",
          field: "mutants.artifact",
          equals: "mutants.json",
          claimId: "semantic-mutants",
          observationField: "artifact",
        },
        {
          artifactPath: "reports/check.json",
          field: "mutants.required",
          equals: 3,
          claimId: "semantic-mutants",
          observationField: "required",
        },
        {
          artifactPath: "reports/check.json",
          field: "mutants.killed",
          equals: 3,
          claimId: "semantic-mutants",
          observationField: "killed",
        },
        {
          artifactPath: "reports/check.json",
          field: "mutants.systemErrorControl",
          equals: "SYSTEM_ERROR",
          claimId: "semantic-mutants",
          observationField: "systemErrorControl",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.0.id",
          equals: "M01-SAME-PRICE-LIFO",
        },
        { artifactPath: "reports/check.json", field: "requiredMutants.length", equals: 3 },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.0.classification",
          equals: "STUDENT_FAILURE",
        },
        { artifactPath: "reports/check.json", field: "requiredMutants.0.killed", equals: true },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.0.scenarioId",
          equals: "same-price-fifo-three-makers",
        },
        { artifactPath: "reports/check.json", field: "requiredMutants.0.caseId", equals: "fifo-taker" },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.1.id",
          equals: "M01-TAKER-PRICE",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.1.classification",
          equals: "STUDENT_FAILURE",
        },
        { artifactPath: "reports/check.json", field: "requiredMutants.1.killed", equals: true },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.1.scenarioId",
          equals: "better-price-before-time",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.1.caseId",
          equals: "buy-takes-better-price-first",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.2.id",
          equals: "M01-SKIP-FIRST-MAKER",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.2.classification",
          equals: "STUDENT_FAILURE",
        },
        { artifactPath: "reports/check.json", field: "requiredMutants.2.killed", equals: true },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.2.scenarioId",
          equals: "better-price-before-time",
        },
        {
          artifactPath: "reports/check.json",
          field: "requiredMutants.2.caseId",
          equals: "buy-takes-better-price-first",
        },
        {
          artifactPath: "reports/check.json",
          field: "architecture.status",
          equals: "PASS",
          claimId: "architecture-boundary",
          observationField: "status",
        },
        {
          artifactPath: "reports/check.json",
          field: "architecture.artifact",
          equals: "architecture.json",
          claimId: "architecture-boundary",
          observationField: "artifact",
        },
        {
          artifactPath: "reports/check.json",
          field: "architecture.sourceFiles",
          equals: 15,
          claimId: "architecture-boundary",
          observationField: "sourceFiles",
        },
        { artifactPath: "reports/check.json", field: "artifacts.0", equals: "m00-regression.json" },
        { artifactPath: "reports/check.json", field: "artifacts.length", equals: 7 },
        { artifactPath: "reports/check.json", field: "artifacts.1", equals: "price-time.json" },
        { artifactPath: "reports/check.json", field: "artifacts.2", equals: "event-batches.json" },
        { artifactPath: "reports/check.json", field: "artifacts.3", equals: "invariants.json" },
        { artifactPath: "reports/check.json", field: "artifacts.4", equals: "canonical-history.utf8" },
        { artifactPath: "reports/check.json", field: "artifacts.5", equals: "mutants.json" },
        { artifactPath: "reports/check.json", field: "artifacts.6", equals: "architecture.json" },
        {
          artifactPath: "reports/m00-regression.json",
          field: "schemaVersion",
          equals: "matching.m01.m00-regression.v1",
        },
        { artifactPath: "reports/m00-regression.json", field: "unit", equals: "M01" },
        {
          artifactPath: "reports/m00-regression.json",
          field: "status",
          equals: "PASS",
          claimId: "m00-input-regression",
          observationField: "status",
        },
        { artifactPath: "reports/m00-regression.json", field: "records", equals: 17 },
        { artifactPath: "reports/m00-regression.json", field: "valid", equals: 2 },
        { artifactPath: "reports/m00-regression.json", field: "invalid", equals: 15 },
        { artifactPath: "reports/m00-regression.json", field: "engineInvalidCases", equals: 15 },
        {
          artifactPath: "reports/m00-regression.json",
          field: "engineInvalidOutcome",
          equals: "REJECTED_WITHOUT_BOOK_OR_SEQUENCE_MUTATION",
        },
        {
          artifactPath: "reports/m00-regression.json",
          field: "firstValidSequenceAfterInvalids",
          equals: 1,
        },
        { artifactPath: "reports/m00-regression.json", field: "completedReplays", equals: 100 },
        { artifactPath: "reports/m00-regression.json", field: "distinctDigests", equals: 1 },
        {
          artifactPath: "reports/m00-regression.json",
          field: "canonicalDigest",
          equals: "sha256:2d287d677d5f200f2b5bd1dd18dabbd40e865779489ce6da36d0411a3b670669",
        },
        {
          artifactPath: "reports/price-time.json",
          field: "schemaVersion",
          equals: "matching.m01.price-time.v1",
        },
        { artifactPath: "reports/price-time.json", field: "unit", equals: "M01" },
        { artifactPath: "reports/price-time.json", field: "status", equals: "PASS" },
        {
          artifactPath: "reports/price-time.json",
          field: "fixtureSha256",
          equals: "d050bc2fc029e3ac0afb5047e3030412412f3a7aecf0938a19a5953618ff9ed7",
        },
        { artifactPath: "reports/price-time.json", field: "scenarios", equals: 8 },
        { artifactPath: "reports/price-time.json", field: "cases", equals: 22 },
        {
          artifactPath: "reports/invariants.json",
          field: "schemaVersion",
          equals: "matching.m01.invariants.v1",
        },
        { artifactPath: "reports/invariants.json", field: "unit", equals: "M01" },
        { artifactPath: "reports/invariants.json", field: "status", equals: "PASS" },
        { artifactPath: "reports/invariants.json", field: "cases", equals: 22 },
        { artifactPath: "reports/invariants.json", field: "accepted", equals: 21 },
        { artifactPath: "reports/invariants.json", field: "rejected", equals: 1 },
        { artifactPath: "reports/invariants.json", field: "trades", equals: 12 },
        { artifactPath: "reports/invariants.json", field: "checks.eventBatchOrder", equals: 22 },
        {
          artifactPath: "reports/invariants.json",
          field: "checks.positiveTradeQuantity",
          equals: 12,
        },
        {
          artifactPath: "reports/invariants.json",
          field: "checks.quantityConservation",
          equals: 22,
        },
        { artifactPath: "reports/invariants.json", field: "checks.makerPrice", equals: 12 },
        {
          artifactPath: "reports/invariants.json",
          field: "checks.priceTimePriority",
          equals: 12,
        },
        {
          artifactPath: "reports/invariants.json",
          field: "checks.bookStructureAndNoCross",
          equals: 44,
        },
        {
          artifactPath: "reports/invariants.json",
          field: "aggregateArithmetic",
          equals: "BigInteger",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "schemaVersion",
          equals: "matching.m01.mutants.v1",
        },
        { artifactPath: "reports/mutants.json", field: "requiredMutants.length", equals: 3 },
        { artifactPath: "reports/mutants.json", field: "unit", equals: "M01" },
        {
          artifactPath: "reports/mutants.json",
          field: "productionControl.id",
          equals: "M01-PRODUCTION-CONTROL",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "productionControl.classification",
          equals: "PASS",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.0.id",
          equals: "M01-SAME-PRICE-LIFO",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.0.classification",
          equals: "STUDENT_FAILURE",
        },
        { artifactPath: "reports/mutants.json", field: "requiredMutants.0.killed", equals: true },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.0.scenarioId",
          equals: "same-price-fifo-three-makers",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.0.caseId",
          equals: "fifo-taker",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.1.id",
          equals: "M01-TAKER-PRICE",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.1.classification",
          equals: "STUDENT_FAILURE",
        },
        { artifactPath: "reports/mutants.json", field: "requiredMutants.1.killed", equals: true },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.1.scenarioId",
          equals: "better-price-before-time",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.1.caseId",
          equals: "buy-takes-better-price-first",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.2.id",
          equals: "M01-SKIP-FIRST-MAKER",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.2.classification",
          equals: "STUDENT_FAILURE",
        },
        { artifactPath: "reports/mutants.json", field: "requiredMutants.2.killed", equals: true },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.2.scenarioId",
          equals: "better-price-before-time",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "requiredMutants.2.caseId",
          equals: "buy-takes-better-price-first",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "systemErrorControl.id",
          equals: "M01-SYSTEM-ERROR-CONTROL",
        },
        {
          artifactPath: "reports/mutants.json",
          field: "systemErrorControl.classification",
          equals: "SYSTEM_ERROR",
        },
        {
          artifactPath: "reports/architecture.json",
          field: "schemaVersion",
          equals: "matching.m01.architecture.v1",
        },
        { artifactPath: "reports/architecture.json", field: "unit", equals: "M01" },
        { artifactPath: "reports/architecture.json", field: "status", equals: "PASS" },
        { artifactPath: "reports/architecture.json", field: "sourceFiles", equals: 15 },
        { artifactPath: "reports/architecture.json", field: "violations.length", equals: 0 },
      ],
    },
    expectedLessons: [
      { lessonOrder: 10, permalink: "price-priority-order-book" },
      { lessonOrder: 20, permalink: "fifo-acceptance-sequence" },
      { lessonOrder: 30, permalink: "maker-price-multi-level-matching" },
      { lessonOrder: 40, permalink: "price-time-golden-evidence" },
    ],
    adds: ["单写者内存订单簿上的价格时间优先撮合状态迁移"],
    delivers: [
      "Bid 价格降序、Ask 价格升序，同价按 acceptedSequence FIFO",
      "GTC 限价单的挂单、maker/taker 部分成交、完全成交与连续吃单",
      "按命令边界输出完整有序的 Accepted、Rejected、Trade 与 Rested event batch",
      "可规范化的盘口摘要、固定场景历史与 semantic digest",
    ],
    freezes: [
      "M00 验证失败只产生 Rejected(code, field)，不分配 acceptedSequence 且不修改订单簿",
      "合法命令由单写者分配单调递增 acceptedSequence；同价 FIFO 不依赖时间戳或 orderId",
      "买价大于等于最佳卖价、卖价小于等于最佳买价时成交，成交价始终使用 resting maker 价格",
      "合法命令的 event batch 顺序固定为 Accepted、零到多条 Trade、可选 Rested",
      "taker 未成交余量只入队一次并保留原 acceptedSequence；完全成交订单和空价位必须移除",
      "每批结束后活动盘口不存在零余量订单、空价位或仍可成交的交叉状态",
    ],
    excludes: [
      "撤单、改单、订单索引、重复 orderId 处理与命令幂等",
      "IOC、FOK、Post-only、市价单、STP、市场状态和价格带",
      "账户、资产、仓位、手续费、结算与交易前风控",
      "WAL、Snapshot、数据库、网络、线程、时钟、随机数、性能内存布局和 Aeron",
      "M03 才引入的独立参考模型、生成式测试、反例缩小与 matching-0.1.0 release",
    ],
    gate: [
      "保持 M00 输入、验证、canonical history 与 digest 回归；M00 的完整 no-order-book 证明继续由冻结完成 tag 保存",
      "黄金历史覆盖空盘口、单边盘口、恰好触价、多价位成交、maker 部分成交、taker 剩余挂单和同价三单 FIFO",
      "自动检查成交量为正、双边数量守恒、maker price、价位与队列一致、无空价位和批末无交叉",
      "maker 使用 taker 价格、同价 LIFO、跳过首个 maker 三个 semantic mutant 必须以 STUDENT_FAILURE 被杀死",
      "相同 scenario pack 经 fresh replay 产生逐字节一致的 event/book history 与 digest；SYSTEM_ERROR 不能冒充通过",
    ],
    interaction: [
      "L2 订单簿 stepper：逐条输入有界限价单，先预测 event batch，再观察 BBO、价位 FIFO 与成交",
      "worked example：一笔 taker 连续吃掉三个 maker 价位",
      "completion problem：补全同价 FIFO 与部分成交余量",
      "independent variant：镜像 Bid/Ask，以 SELL taker 验证相同合同",
    ],
    evidence: [
      "版本化 price-time scenario pack、逐命令 event batch 与 canonical order-book history",
      "数量守恒、maker price、价位/队列一致和批末无交叉的不变量报告",
      "确定性 fresh replay、三项 M01 semantic mutant、M00 输入回归与 M01 架构边界报告",
    ],
    stopPoint: "一个正确但不支持撤单、不持久、不联网、无性能与高可用保证的单交易对 GTC 内存撮合器。",
    localCommands: [
      "git switch -c unit/m01 course/m01-start",
      "./gradlew clean build --no-daemon",
      "./gradlew m01Check --no-daemon",
      "./gradlew m01Evidence -Pm01.unitTag=course/m01-complete --no-daemon",
    ],
  },
  {
    projectSlug: "high-availability-cex",
    profileVersion: "SPOT-CEX-1.0",
    code: "M02",
    trackCode: "M",
    title: "可寻址订单、撤单与终态闭合",
    summary: "在不改变 M01 价格时间优先语义的前提下，用权威 lifecycle registry 定位挂单、撤销精确余量，并以不可逆终态阻止已接受 orderId 复活。",
    objective: "让每个已接受订单拥有可寻址且不可复活的内存生命周期，同时稳定解释未知、迟到、重复撤单和重复 orderId。",
    order: 30,
    lifecycle: "IN_PROGRESS",
    contractPlanVersion: "0.4",
    prerequisiteUnitCodes: ["M01"],
    startRef: "course/m02-start",
    expectedLessons: [
      { lessonOrder: 10, permalink: "order-lifecycle-result-contract" },
      { lessonOrder: 20, permalink: "addressable-index-middle-cancel" },
      { lessonOrder: 30, permalink: "irreversible-terminal-orders" },
      { lessonOrder: 40, permalink: "lifecycle-golden-evidence" },
    ],
    adds: ["可寻址订单生命周期：权威 lifecycle registry、精确撤单与不可逆 FILLED/CANCELED 终态"],
    delivers: [
      "CancelOrderInput(instrumentId, orderId) 与 SingleInstrumentMatchingEngine.cancel(CancelOrderInput) 命令边界",
      "活动挂单和部分成交余量可按 orderId 撤销；同价队列中间撤单不改变幸存订单 FIFO",
      "ORDER_NOT_FOUND、ORDER_ALREADY_FILLED、ORDER_ALREADY_CANCELED 与 DUPLICATE_ORDER_ID 的稳定业务结果",
      "唯一 ordersById lifecycle registry 的 RESTING entry、订单簿节点与 FILLED/CANCELED 终态身份共同形成可检查但仍只驻留内存的生命周期状态",
    ],
    freezes: [
      "Place 的 M00 验证失败或 Cancel 的 instrumentId/orderId 验证失败只产生 Rejected(code, field)，不分配 acceptedSequence、不占用 orderId 且不修改状态",
      "已接受 orderId 在当前 engine 生命周期内只能首次使用一次；RESTING、FILLED 或 CANCELED 上的重复 Place 产生 PlaceRejected(DUPLICATE_ORDER_ID)",
      "有效但从未接受的 orderId 撤单产生 CancelRejected(ORDER_NOT_FOUND)，且不创建 tombstone；之后的首次合法 Place 仍可接受",
      "RESTING 撤单产生唯一 Canceled(sequence, orderId, side, priceTicks, canceledQuantityLots)，删除精确剩余量且不消耗 acceptedSequence",
      "FILLED 与 CANCELED 是不可逆终态；迟到或重复撤单分别产生 CancelRejected(ORDER_ALREADY_FILLED) 或 CancelRejected(ORDER_ALREADY_CANCELED)",
      "每个已接受 orderId 在 lifecycle registry 中恰好一次；RESTING entry 与订单簿节点一一对应并引用同一内部订单，FILLED/CANCELED 不入簿且不能删除或复活",
      "撤销同价队列任意位置只移除目标节点，幸存订单保留原 acceptedSequence 和相对 FIFO；价位仅在最后一笔离开时删除",
      "Place batch 继续遵守 M01 的 Rejected 或 Accepted → Trade* → Rested?；Cancel batch 只能是 Rejected、Canceled 或 CancelRejected 之一",
    ],
    excludes: [
      "commandId、请求重放、durable idempotency、Cancel/Replace 与 Mass Cancel",
      "IOC、FOK、Post-only、市价单、STP、市场状态、价格带和多交易对",
      "账户、资产、预占释放、仓位、手续费、结算和用户可见 OMS 查询",
      "terminal tombstone 回收、墙钟过期、WAL、Snapshot、数据库、网络、线程、性能内存布局和 Aeron",
      "M03 才引入的独立参考模型、生成式测试、反例缩小与 matching-0.1.0 release",
    ],
    gate: [
      "M00 输入合同与 M01 的 8 场景、22 命令价格时间 Golden corpus 完整回归",
      "冻结 10 场景、34 命令 lifecycle corpus，覆盖非法与未知撤单、唯一价位撤单、中间撤单、部分成交余量、fully-filled maker/taker、迟到/重复撤单，以及 active/filled/canceled ID 重复",
      "逐命令检查事件语法、盘口和 lifecycle registry；RESTING entry 与 book 节点双向一一对应，terminal 不入簿且单调不可逆",
      "M02-CANCEL-WRONG-FIFO-ORDER、M02-GHOST-RESTING-ORDER、M02-TERMINAL-ID-REUSE 与 M02-REPEATED-CANCEL-SUCCEEDS 四个 semantic mutant 必须以 STUDENT_FAILURE 被杀死",
      "相同 lifecycle scenario pack 经 100 次 fresh replay 产生逐字节一致的 M02H1 history 与唯一 digest；SYSTEM_ERROR 必须失败关闭",
      "matching-core 继续保持单写者、无 I/O、数据库、网络、线程、时钟、随机数和 Aeron 依赖的架构边界",
    ],
    interaction: [
      "L1 状态矩阵：在揭示结果前判断 UNSEEN、RESTING、FILLED 与 CANCELED 上的 Place/Cancel disposition",
      "L2 Matching Lab：共享 M01–M03 通用壳，先回放 10/34 静态 Java Golden，再以有界浏览器模型预测 Place 或 Cancel 的事件、盘口与 registry 生命周期",
      "worked example：同价 #1 → #2 → #3 中撤销 #2，再用 taker 验证 #1 → #3 FIFO",
      "completion problem：补全部分成交余量撤单及空价位删除",
      "independent variant：以 SELL 侧镜像未知、迟到和重复撤单合同",
    ],
    evidence: [
      "版本化 lifecycle scenario pack、逐命令 event batch、order-book/index/terminal observation 与 M02H1 canonical history",
      "M00/M01 回归、10 场景 34 命令生命周期结果和结构不变量报告",
      "100 次 fresh replay、四项 M02 semantic mutant、异常 control 与 M02 架构边界报告",
      "PUBLISHED 前由完成阶段 CI 生成 manifest、artifact SHA-256 和明确 limitations；当前 IN_PROGRESS 阶段不预造 evidence",
    ],
    stopPoint: "一个生命周期闭合的单交易对 GTC 内存撮合器：支持精确撤单且终态订单不会复活，但不承诺请求重试幂等、tombstone 回收、持久化、网络、性能或高可用。",
    localCommands: [
      "git switch -c unit/m02 course/m02-start",
      "./gradlew clean build --no-daemon",
      "./gradlew m02Check --no-daemon",
    ],
  },
];

export function isPracticeUnitAtLeast(
  lifecycle: PracticeUnitLifecycle,
  minimum: PracticeUnitLifecycle,
): boolean {
  return LIFECYCLE_RANK[lifecycle] >= LIFECYCLE_RANK[minimum];
}

export function getPracticeUnits(projectSlug: string): PracticeUnit[] {
  return PRACTICE_UNITS.filter((unit) => unit.projectSlug === projectSlug).sort(
    (left, right) => left.order - right.order,
  );
}

export function getPracticeUnit(projectSlug: string, code: string): PracticeUnit | undefined {
  const normalizedCode = code.toUpperCase();
  return PRACTICE_UNITS.find(
    (unit) => unit.projectSlug === projectSlug && unit.code === normalizedCode,
  );
}

export function getPracticeUnitSegment(unit: PracticeUnit): string {
  return unit.code.toLowerCase();
}
