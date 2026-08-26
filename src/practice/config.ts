export type PracticeCaseStatus = "PLANNED" | "BUILDING" | "VERIFIED";

export interface PracticeTrack {
  code: string;
  title: string;
  description: string;
  units: number;
  status: "NEXT" | "LOCKED" | "ACTIVE" | "COMPLETE";
  unlock: string;
}

export interface PracticeMilestone {
  version: string;
  title: string;
  description: string;
}

export interface PracticeCase {
  slug: string;
  planVersion: string;
  index: string;
  eyebrow: string;
  title: string;
  summary: string;
  profile: string;
  status: PracticeCaseStatus;
  statusLabel: string;
  publishedUnits: number;
  totalUnits: number;
  repositories: number;
  stack: readonly string[];
  theoryPath: string;
  currentAction: string;
  tracks: readonly PracticeTrack[];
  milestones: readonly PracticeMilestone[];
  browserLabs: readonly string[];
  localLabs: readonly string[];
  included: readonly string[];
  excluded: readonly string[];
}

// This file owns machine-readable public status and planning counts. Curriculum
// scope and governance live in docs/HIGH_AVAILABILITY_CEX_PRACTICE_PLAN.md.
export const PRACTICE_CASES: readonly PracticeCase[] = [
  {
    slug: "high-availability-cex",
    planVersion: "0.1",
    index: "01",
    eyebrow: "FLAGSHIP BUILD / EXCHANGE SYSTEMS",
    title: "高可用 CEX 交易核心",
    summary: "从单交易对限价撮合起步，逐步交付 Matching、Counter 与 Rest 三个可独立发布、可恢复、可验收的工程。",
    profile: "单地域、高可用、现货 CEX 交易核心",
    status: "PLANNED",
    statusLabel: "课程基线 · 准备 M00",
    publishedUnits: 0,
    totalUnits: 30,
    repositories: 3,
    stack: ["Java", "Aeron Cluster", "Gradle", "Docker", "Astro Labs"],
    theoryPath: "series/trading/",
    currentAction: "当前只准备 Matching M00；M01 是下一候选，Counter 与 Rest 保持锁定。",
    tracks: [
      {
        code: "M",
        title: "Matching",
        description: "订单簿、价格时间优先、成交事实、复制执行与行情输出。",
        units: 13,
        status: "NEXT",
        unlock: "当前唯一允许启动的代码仓库",
      },
      {
        code: "C",
        title: "Counter",
        description: "账户、资产、预占、OMS、手续费、账本与异步查询投影。",
        units: 10,
        status: "LOCKED",
        unlock: "Matching 1.0 通过后创建",
      },
      {
        code: "R",
        title: "Rest",
        description: "PriAPI、OpenAPI、WebSocket、认证、限流与外部一致性语义。",
        units: 7,
        status: "LOCKED",
        unlock: "Counter 1.0 通过后创建",
      },
    ],
    milestones: [
      {
        version: "matching-0.1",
        title: "正确的限价撮合",
        description: "确定性单机内核、参考模型和可重放反例；明确不持久、不高可用。",
      },
      {
        version: "matching-0.5",
        title: "可恢复的单机撮合",
        description: "WAL、快照、崩溃恢复和容量证据形成独立停止点。",
      },
      {
        version: "matching-0.8",
        title: "单分片高可用",
        description: "Aeron Cluster、切主、重试、结果未知和 fencing 通过故障门禁。",
      },
      {
        version: "matching-1.0",
        title: "可运营的撮合项目",
        description: "静态分片、可续接输出、升级恢复和运行资格形成完整闭环。",
      },
      {
        version: "spot-cex-1.0",
        title: "三项目商用 Profile",
        description: "Matching、Counter、Rest 形成兼容版本组并通过端到端资格审查。",
      },
    ],
    browserLabs: [
      "逐条输入订单并观察盘口、FIFO 与成交事件",
      "调整随机 seed，重放性质测试缩小后的最小反例",
      "选择 ACK 与崩溃窗口，推演恢复后的权威状态",
      "沿 Leader 切换时间线判断成功、失败或 UNKNOWN",
      "观察资产在准入、成交、撤单和手续费之间的变化",
      "制造 WS sequence gap 并选择 resume 或 snapshot 重建",
    ],
    localLabs: [
      "使用仓库自带 Gradle Wrapper 编译和执行 Java 测试",
      "运行确定性 testkit、固定 seed、状态摘要与不变量检查",
      "在本地启动三节点 Aeron Cluster 或 Docker Compose",
      "通过受控脚本执行 kill、pause、restart 与网络故障实验",
      "导出测试、恢复、性能和故障时间线证据，不上传源码",
    ],
    included: [
      "现货 CLOB 与多交易对静态分片",
      "资产、预占、订单、成交、手续费和双式账本",
      "PriAPI、OpenAPI 与公共/私有 WebSocket",
      "幂等、恢复、过载、升级、备份和故障演练",
    ],
    excluded: [
      "充值、提现、钱包和链节点",
      "KYC、AML、法币与监管报送",
      "在线代码判题、远程沙箱和云端学习档案",
      "多地域 Active-Active 与第一季衍生品清算",
    ],
  },
];

export function getPracticeCase(slug: string): PracticeCase | undefined {
  return PRACTICE_CASES.find((practiceCase) => practiceCase.slug === slug);
}
