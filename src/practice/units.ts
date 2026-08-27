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
  excludes: readonly string[];
  gate: readonly string[];
  evidence: readonly string[];
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
    order: 10,
    lifecycle: "PUBLISHED",
    contractPlanVersion: "0.1",
    planCompatibility: "PLAN v0.2 只新增 SPOT 之后的锁定 Profile 路线；M00 输入、验证、canonical history 与 digest 合同不变。",
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
    },
    expectedLessons: [
      { lessonOrder: 10, permalink: "place-limit-order-input-contract" },
      { lessonOrder: 20, permalink: "fixture-canonical-history" },
      { lessonOrder: 30, permalink: "fail-closed-deterministic-judge" },
      { lessonOrder: 40, permalink: "publish-verifiable-evidence" },
    ],
    adds: ["PlaceLimitOrder 输入合同", "按固定优先级执行的确定性验证", "canonical history 与 SHA-256 digest"],
    delivers: ["固定语料可以被重复解析并得到逐字节一致的历史", "无订单簿时也能先证明输入边界与裁判语义"],
    excludes: ["订单簿、成交和撤单", "WAL、快照与数据库", "Aeron Cluster、网关和账户资产"],
    gate: ["固定 fixture 通过 Draft 2020-12 schema", "100 次重放产生同一 canonical digest", "必需 semantic mutant 被确定性裁判杀死"],
    evidence: ["M00 check report", "canonical history 与固定 digest", "semantic mutant 和架构边界结果"],
    localCommands: [
      "./gradlew clean build --no-daemon",
      "./gradlew m00Check --no-daemon",
      "./gradlew m00Evidence -Pm00.unitTag=course/m00-complete --no-daemon",
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
