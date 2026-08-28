export type PracticeCaseStatus = "PLANNED" | "BUILDING" | "VERIFIED";
export type PracticeProfileStatus = "CURRENT" | "LOCKED" | "COMPLETE";

export interface PracticeDeliveryProfile {
  version: string;
  title: string;
  description: string;
  status: PracticeProfileStatus;
  gate: string;
}

export interface PracticeTrack {
  code: string;
  title: string;
  description: string;
  units: number;
  status: "NEXT" | "LOCKED" | "ACTIVE" | "COMPLETE";
  unlock: string;
  repositoryUrl?: string;
}

export interface PracticeMilestone {
  version: string;
  title: string;
  description: string;
}

export interface PracticeCase {
  slug: string;
  designDocument: string;
  planVersion: string;
  index: string;
  eyebrow: string;
  title: string;
  summary: string;
  status: PracticeCaseStatus;
  statusLabel: string;
  totalUnits: number;
  plannedRepositories: number;
  stack: readonly string[];
  theoryPath: string;
  theoryLabel: string;
  units: readonly string[];
  currentUnitCode?: string;
  currentAction: string;
  profileRoadmapTitle: string;
  profileRoadmapDescription: string;
  profileRoadmap: readonly PracticeDeliveryProfile[];
  trackNarrative: string;
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
    designDocument: "docs/HIGH_AVAILABILITY_CEX_PRACTICE_PLAN.md",
    planVersion: "0.4",
    index: "01",
    eyebrow: "FLAGSHIP BUILD / EXCHANGE SYSTEMS",
    title: "高可用 CEX 交易核心",
    summary: "从单交易对限价撮合起步，先交付高可用现货核心，再按门禁演进到杠杆、永续、交割与期权。",
    status: "BUILDING",
    statusLabel: "SPOT · M00–M02 已发布",
    totalUnits: 30,
    plannedRepositories: 3,
    stack: ["Java", "Aeron Cluster", "Gradle", "Docker", "Astro Labs"],
    theoryPath: "series/trading/",
    theoryLabel: "查看交易系统理论",
    units: ["M00", "M01", "M02"],
    currentUnitCode: "M02",
    currentAction:
      "M02 可寻址订单生命周期、四篇教程、Matching Lab 与 tag 绑定 evidence 已发布；当前停在不持久、不联网的内存撮合器，M03 参考模型与性质测试尚未签约。",
    profileRoadmapTitle: "现货是第一份完整交付，不是专题终点",
    profileRoadmapDescription: "只有当前 Profile 展开单元、仓库与实施设计；LOCKED 只冻结产品方向和解锁门禁，不代表已经创建单元、仓库或服务；后续优先复用已发布的 Matching、Counter 与 Rest 边界，具体仓库拓扑在解锁时评审。",
    profileRoadmap: [
      {
        version: "SPOT-CEX-1.0",
        title: "单地域、高可用现货交易核心",
        description: "现金资产交换在 Matching、Counter 与 Rest 之间形成可恢复闭环。",
        status: "CURRENT",
        gate: "当前从 M00 开始，只展开 SPOT 单元与仓库",
      },
      {
        version: "MARGIN-SPOT-1.0",
        title: "杠杆现货",
        description: "以债务为核心，引入借贷、计息、抵押品、逐仓/全仓、风险率与强制减仓。",
        status: "LOCKED",
        gate: "SPOT-CEX-1.0 资格审查通过后再评审",
      },
      {
        version: "PERP-CEX-1.0",
        title: "永续合约",
        description: "无到期日持仓按标记价持续重估，并引入资金费率、保险基金与 ADL。",
        status: "LOCKED",
        gate: "MARGIN-SPOT-1.0 资格审查通过后再评审",
      },
      {
        version: "DELIVERY-FUTURES-1.0",
        title: "交割合约",
        description: "到期时刻驱动交易停止、结算价、交割或现金结算与终局对账。",
        status: "LOCKED",
        gate: "PERP-CEX-1.0 资格审查通过后再评审",
      },
      {
        version: "OPTIONS-CEX-1.0",
        title: "期权",
        description: "非线性收益引入 Greeks、波动率、组合保证金、行权与指派。",
        status: "LOCKED",
        gate: "DELIVERY-FUTURES-1.0 资格审查通过后再评审",
      },
    ],
    trackNarrative: "三个项目分别建仓、顺序出现；没有巨型单仓，也没有预建空服务。",
    tracks: [
      {
        code: "M",
        title: "Matching",
        description: "订单簿、价格时间优先、成交事实、复制执行与行情输出。",
        units: 13,
        status: "ACTIVE",
        unlock: "当前唯一实施仓库",
        repositoryUrl: "https://github.com/lcha-reln/cex-matching",
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
        version: "matching-0.1.0",
        title: "正确的限价撮合",
        description: "确定性单机内核、参考模型和可重放反例；明确不持久、不高可用。",
      },
      {
        version: "matching-0.5.0",
        title: "可恢复的单机撮合",
        description: "WAL、快照、崩溃恢复和容量证据形成独立停止点。",
      },
      {
        version: "matching-0.8.0",
        title: "单分片高可用",
        description: "Aeron Cluster、切主、重试、结果未知和 fencing 通过故障门禁。",
      },
      {
        version: "matching-1.0.0",
        title: "可运营的撮合项目",
        description: "静态分片、可续接输出、升级恢复和运行资格形成完整闭环。",
      },
      {
        version: "SPOT-CEX-1.0",
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
      "多地域 Active-Active",
      "当前 SPOT Profile 不实现杠杆现货、合约与期权交易及清算",
    ],
  },
];

export function getPracticeCase(slug: string): PracticeCase | undefined {
  return PRACTICE_CASES.find((practiceCase) => practiceCase.slug === slug);
}
