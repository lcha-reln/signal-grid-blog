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
  productRelease?: string;
  evidencePath?: string;
  evidenceUrl?: string;
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
    lifecycle: "CODE_VERIFIED",
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
    evidencePath: "build/lab-evidence/M00/manifest.json",
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
