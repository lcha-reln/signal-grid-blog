const configuredBase = import.meta.env.BASE_URL;

export const BASE_PATH = configuredBase.endsWith("/")
  ? configuredBase
  : `${configuredBase}/`;

export function sitePath(path = ""): string {
  return `${BASE_PATH}${path.replace(/^\/+/, "")}`;
}

export const SITE = {
  title: "RE-LN / Signal Grid",
  shortTitle: "RE/LN",
  description:
    "从 Aeron、交易系统与有状态服务，到 Java 低延迟和生产级 AI Agent 后端工程。",
  author: "lcha-reln",
  locale: "zh-CN",
  url: "https://lcha-reln.github.io/signal-grid-blog/",
  github: "https://github.com/lcha-reln/signal-grid-blog",
  cms: "https://app.pagescms.org",
};

export type SeriesKey =
  "aeron" | "trading" | "availability" | "performance" | "agent" | "meta";

export interface SeriesStage {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  fromOrder: number;
}

export interface SeriesDefinition {
  key: SeriesKey;
  title: string;
  eyebrow: string;
  description: string;
  prerequisite: string;
  outcome: string;
  color: string;
  index: string;
  stages?: readonly SeriesStage[];
}

export const PRIMARY_SERIES_KEY: Exclude<SeriesKey, "meta"> = "aeron";

export const META_SERIES: SeriesDefinition = {
  key: "meta",
  title: "站点指南",
  eyebrow: "SIGNAL GRID",
  description: "关于这个博客的内容结构、编辑流程与发布方式。",
  prerequisite: "无需先修知识",
  outcome: "了解站点的内容结构、写作方式与发布流程。",
  color: "cyan",
  index: "00",
};

export const SERIES: readonly SeriesDefinition[] = [
  {
    key: "aeron",
    title: "Aeron 系统工程",
    eyebrow: "AERON SYSTEMS",
    description:
      "从 Transport 的可靠低延迟传输与 SBE 协议演进，到 Archive 录制、可恢复服务与历史追赶，再到 Cluster 的确定性状态机、边缘一致性、升级和故障验收，建立完整而可验证的 Aeron 心智模型。",
    prerequisite:
      "熟悉 Java 17、线程与网络基础；建议先了解 UDP、背压和二进制 Buffer。Agrona 章节可作为底层原语补充阅读，不要求预先掌握 SBE。",
    outcome:
      "能够正确设计可演进的 SBE 消息并组合 Transport、Archive 与 Cluster，解释位置、流控、持久化和一致性边界，完成断线追赶、边缘幂等、兼容升级与故障恢复验收。",
    color: "cyan",
    index: "01",
    stages: [
      {
        index: "01",
        eyebrow: "AERON TRANSPORT",
        title: "可靠低延迟传输",
        description:
          "从身份与位置模型进入 SBE 协议、发送、接收、可靠 UDP、拓扑和 Media Driver 运维。",
        fromOrder: 5,
      },
      {
        index: "02",
        eyebrow: "AERON ARCHIVE",
        title: "录制、回放与可恢复服务",
        description:
          "理解录制目录、持久性边界、历史追赶、跨主机复制、磁盘治理和业务 Checkpoint。",
        fromOrder: 70,
      },
      {
        index: "03",
        eyebrow: "AERON CLUSTER",
        title: "确定性集群与恢复",
        description:
          "把共识日志、业务状态机、客户端语义、选举、灾备和运行手册连成闭环。",
        fromOrder: 120,
      },
      {
        index: "04",
        eyebrow: "EVOLUTION & FAILURE LAB",
        title: "升级与故障验收",
        description:
          "把协议兼容、Archive 与 Snapshot 迁移、回滚边界和三节点故障恢复变成可验证工程。",
        fromOrder: 175,
      },
    ],
  },
  {
    key: "trading",
    title: "交易系统",
    eyebrow: "EXCHANGE SYSTEMS",
    description:
      "围绕中心化交易所，从产品、订单语义与交易前风控一路走到撮合、OMS、行情重建、仓位、期货结算、账本、保证金和清算，建立业务规则与系统状态机之间的映射。",
    prerequisite: "理解基础现货交易和百分比、盈亏计算；了解事件驱动架构更佳。",
    outcome:
      "能够解释订单从准入、撮合、私有回报到结算入账的完整生命周期，说明公开行情与 OMS 如何从权威事件恢复，并把产品规则转成可测试、可审计的状态、风控、数据与账务约束。",
    color: "amber",
    index: "02",
    stages: [
      {
        index: "01",
        eyebrow: "MARKET MAP",
        title: "市场与产品",
        description:
          "先建立产品、参与者、现金流和系统边界，再把合约规格、交易日与市场状态收敛为版本化主数据。",
        fromOrder: 10,
      },
      {
        index: "02",
        eyebrow: "ORDER FLOW, RISK & MARKET DATA",
        title: "订单、风控、撮合与行情",
        description:
          "从订单契约与原子准入追到订单簿、撮合、OMS 和私有回报，再用快照、增量、序列号与校验恢复公开行情。",
        fromOrder: 30,
      },
      {
        index: "03",
        eyebrow: "POSITION, SETTLEMENT & LEDGER",
        title: "仓位、结算与账本",
        description:
          "连接仓位、每日盯市与交割、资金费率、双重记账、余额不变量和风险定价。",
        fromOrder: 60,
      },
      {
        index: "04",
        eyebrow: "RISK & CAPITAL",
        title: "保证金与清算",
        description: "比较保证金模式、清算机制、账户组织与组合风控。",
        fromOrder: 90,
      },
      {
        index: "05",
        eyebrow: "SYNTHESIS",
        title: "系统综合",
        description: "用做市串联流动性、库存、对冲和交易基础设施。",
        fromOrder: 120,
      },
    ],
  },
  {
    key: "availability",
    title: "有状态系统可靠性",
    eyebrow: "STATEFUL RESILIENCE",
    description:
      "围绕单写者有状态服务，从 WAL、本地持久化与崩溃恢复，推进到时间、一致性、复制协议与 fencing，再连接消息连续性、跨系统副作用、过载控制、状态所有权迁移、一致检查点、灾备、滚动升级、协议可观测性与故障证明。",
    prerequisite:
      "理解基础分布式系统与事件驱动概念；不要求预先掌握 WAL、Kafka、Aeron 或 ZooKeeper。",
    outcome:
      "能够定义故障模型、确认点与持久化边界，比较 Primary-Backup、Quorum、Chain Replication 与状态机复制，区分墙钟、逻辑顺序与权威提交，设计幂等副作用、过载降级和所有权迁移协议，建立一致检查点、PITR 与安全升级边界，并用协议指标和可重放故障实验给出 RPO/RTO 与恢复正确性的证据。",
    color: "coral",
    index: "03",
    stages: [
      {
        index: "01",
        eyebrow: "DURABILITY FOUNDATIONS",
        title: "故障模型与本地恢复",
        description: "从可靠性全景进入 WAL、持久化确认点和崩溃恢复。",
        fromOrder: 10,
      },
      {
        index: "02",
        eyebrow: "TIME, CONSENSUS & COORDINATION",
        title: "时间、共识与协调",
        description:
          "先区分墙钟、逻辑顺序与故障检测，再用历史模型辨别一致性合同，比较复制、确认与读取路径，最后理解多数派日志、任期、协调状态、Lease 与 fencing。",
        fromOrder: 25,
      },
      {
        index: "03",
        eyebrow: "LOGS & CONTINUITY",
        title: "分布式日志与消息连续性",
        description:
          "连接 Kafka 日志、消费位置、应用序列号、跨系统副作用、过载反馈环与状态所有权迁移。",
        fromOrder: 50,
      },
      {
        index: "04",
        eyebrow: "RECOVERY, EVOLUTION & PROOF",
        title: "检查点、灾备与验证",
        description:
          "把一致检查点、PITR、灾难恢复、混合版本升级、协议可观测性和故障验证收敛为可演练、可回滚、可证明的恢复链。",
        fromOrder: 80,
      },
    ],
  },
  {
    key: "performance",
    title: "Java 低延迟工程",
    eyebrow: "LOW-LATENCY ENGINEERING",
    description:
      "从 Java Memory Model 与 VarHandle 出发，用可信测量建立证据，再下探机器模型、HotSpot 执行、垃圾回收与 Linux 数据路径，最后以 Disruptor、Agrona 等工具理解序列协调、线程拓扑、背压与低分配设计。",
    prerequisite:
      "熟悉 Java 语法、线程与基本数据结构；不要求预先掌握 Java 内存模型。",
    outcome:
      "能够用 happens-before 证明线程间协议，解释 Cache、JIT、分配、GC、CPU 与网络队列如何共同塑造尾延迟，并通过基准、运行时事件、硬件计数器和生产指标判断优化是否成立。",
    color: "blue",
    index: "04",
    stages: [
      {
        index: "01",
        eyebrow: "CORRECTNESS & EVIDENCE",
        title: "并发正确性与性能证据",
        description:
          "先证明线程间协议正确，再建立能够识别尾延迟、饱和与测量偏差的证据链。",
        fromOrder: 10,
      },
      {
        index: "02",
        eyebrow: "JVM & LINUX RUNTIME",
        title: "机器、JVM 与 Linux 运行时",
        description:
          "沿 Cache、JIT、分配、GC、调度与网卡队列追踪 Java 热路径的真实执行成本。",
        fromOrder: 30,
      },
      {
        index: "03",
        eyebrow: "DATA PATH TOOLKIT",
        title: "事件通路与执行模型",
        description:
          "用 Disruptor 与 Agrona 落地有界通路、单写者、批处理、背压和 Agent 循环。",
        fromOrder: 70,
      },
    ],
  },
  {
    key: "agent",
    title: "AI Agent 后端工程",
    eyebrow: "AGENT SYSTEMS",
    description:
      "从概率模型与确定性系统的边界出发，逐步进入模型契约、工具运行时、RAG、持久化编排、评测、安全、可观测与生产治理。",
    prerequisite:
      "具备一门后端语言、HTTP、数据库和异步编程基础；Python 可随前几章补齐。",
    outcome:
      "能够设计可回放、可评测、可审计、可审批，并能安全执行受限副作用的生产级 Agent 后端。",
    color: "violet",
    index: "05",
    stages: [
      {
        index: "01",
        eyebrow: "ENGINEERING FOUNDATIONS",
        title: "系统边界与后端基础",
        description:
          "先建立概率模型进入确定性系统时必须守住的边界，再补齐类型、并发与长任务接口。",
        fromOrder: 100,
      },
      {
        index: "02",
        eyebrow: "MODEL CONTRACTS",
        title: "模型接口与结构化契约",
        description:
          "理解 Token、上下文和不确定性，并把模型接入收敛为可替换、可校验的接口。",
        fromOrder: 200,
      },
      {
        index: "03",
        eyebrow: "TOOL RUNTIME",
        title: "工具调用与权限边界",
        description:
          "从原生 Tool Loop 进入工具契约、权限、审批、重试和结果未知。",
        fromOrder: 300,
      },
      {
        index: "04",
        eyebrow: "RETRIEVAL & GROUNDING",
        title: "RAG 与知识治理",
        description: "建立可版本化、可评测、有权限和带引用的企业知识检索系统。",
        fromOrder: 400,
      },
      {
        index: "05",
        eyebrow: "ORCHESTRATION & DURABILITY",
        title: "编排、状态与持久化",
        description:
          "把 Agent Loop 提升为可暂停、可恢复、可迁移且能安全处理副作用的运行时。",
        fromOrder: 500,
      },
      {
        index: "06",
        eyebrow: "EVALUATION",
        title: "Agent Eval 与回归判断",
        description:
          "用确定性断言、Judge 校准、关键切片和版本血缘判断系统是否真的改善。",
        fromOrder: 600,
      },
      {
        index: "07",
        eyebrow: "SECURITY & INTEROPERABILITY",
        title: "安全、Policy 与 MCP",
        description:
          "从威胁模型和 Prompt Injection 进入确定性策略控制与安全互操作边界。",
        fromOrder: 700,
      },
      {
        index: "08",
        eyebrow: "PRODUCTION SYSTEMS",
        title: "可观测、可靠性与平台化",
        description:
          "建立 Trace、SLO、容量、发布、隔离和事故恢复能力，并抽取稳定的平台边界。",
        fromOrder: 800,
      },
    ],
  },
] as const;

export type Series = SeriesDefinition;
