const configuredBase = import.meta.env.BASE_URL;

export const BASE_PATH = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;

export function sitePath(path = ""): string {
  return `${BASE_PATH}${path.replace(/^\/+/, "")}`;
}

export const SITE = {
  title: "RE-LN / Signal Grid",
  shortTitle: "RE/LN",
  description: "从 Aeron Transport、Archive 与 Cluster，到交易系统、有状态系统可靠性和 Java 低延迟工程。",
  author: "lcha-reln",
  locale: "zh-CN",
  url: "https://lcha-reln.github.io/signal-grid-blog/",
  github: "https://github.com/lcha-reln/signal-grid-blog",
  cms: "https://app.pagescms.org",
};

export type SeriesKey =
  | "aeron"
  | "trading"
  | "availability"
  | "performance"
  | "meta";

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
    description: "从 Transport 的可靠低延迟传输，到 Archive 的录制、回放与复制，再到 Cluster 的确定性状态机、选举恢复和生产运维，建立完整而可验证的 Aeron 心智模型。",
    prerequisite: "熟悉 Java 17、线程与网络基础；建议先了解 UDP、背压和二进制 Buffer。Agrona 章节可作为底层原语补充阅读。",
    outcome: "能够正确选择并组合 Transport、Archive 与 Cluster，解释位置、流控、持久化和一致性边界，并设计可观测、可恢复的生产部署。",
    color: "cyan",
    index: "01",
    stages: [
      {
        index: "01",
        eyebrow: "AERON TRANSPORT",
        title: "可靠低延迟传输",
        description: "从身份与位置模型进入发送、接收、可靠 UDP、拓扑和 Media Driver 运维。",
        fromOrder: 5,
      },
      {
        index: "02",
        eyebrow: "AERON ARCHIVE",
        title: "录制、回放与复制",
        description: "理解录制目录、持久性边界、历史追赶、跨主机复制与磁盘治理。",
        fromOrder: 70,
      },
      {
        index: "03",
        eyebrow: "AERON CLUSTER",
        title: "确定性集群与恢复",
        description: "把共识日志、业务状态机、客户端语义、选举、灾备和运行手册连成闭环。",
        fromOrder: 120,
      },
    ],
  },
  {
    key: "trading",
    title: "交易系统",
    eyebrow: "EXCHANGE SYSTEMS",
    description: "围绕中心化交易所，从产品与订单语义一路走到撮合、仓位、保证金、清算和账本，建立业务规则与系统状态机之间的映射。",
    prerequisite: "理解基础现货交易和百分比、盈亏计算；了解事件驱动架构更佳。",
    outcome: "能够解释订单从受理、撮合到清算入账的完整生命周期，并把产品规则转成可测试、可审计的状态与账务约束。",
    color: "amber",
    index: "02",
    stages: [
      {
        index: "01",
        eyebrow: "MARKET MAP",
        title: "市场与产品",
        description: "先建立产品、参与者、现金流和系统边界。",
        fromOrder: 10,
      },
      {
        index: "02",
        eyebrow: "ORDER FLOW",
        title: "订单与撮合",
        description: "从订单契约追到订单簿、撮合、成交与自成交保护。",
        fromOrder: 30,
      },
      {
        index: "03",
        eyebrow: "POSITION, LEDGER & PRICING",
        title: "仓位、账本与定价",
        description: "连接持仓现金流、资金费率、双重记账、余额不变量与标记价格。",
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
    description: "围绕单写者有状态服务，从 WAL、本地持久化与崩溃恢复，推进到物理时间、因果顺序、复制、任期与 fencing，再连接消息连续性、快照重放和故障切换。",
    prerequisite: "理解基础分布式系统与事件驱动概念；不要求预先掌握 WAL、Kafka、Aeron 或 ZooKeeper。",
    outcome: "能够定义故障模型、确认点与持久化边界，区分墙钟、逻辑顺序与权威提交，计算 RTO/RPO，并设计可证明唯一写者、可隔离旧写（fencing）、可检测缺口和可演练的恢复协议。",
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
        description: "先区分墙钟、逻辑顺序与故障检测，再理解多数派日志、任期、协调状态、Lease 与 fencing。",
        fromOrder: 25,
      },
      {
        index: "03",
        eyebrow: "LOGS & CONTINUITY",
        title: "分布式日志与消息连续性",
        description: "连接 Kafka 日志、消费位置、应用序列号与恢复协议。",
        fromOrder: 50,
      },
    ],
  },
  {
    key: "performance",
    title: "Java 低延迟工程",
    eyebrow: "LOW-LATENCY ENGINEERING",
    description: "从 Java Memory Model 与 VarHandle 出发，以 Disruptor、Agrona 等工具为切口，理解内存顺序、序列协调、线程拓扑、批处理、背压与低分配设计，并用测量验证取舍。",
    prerequisite: "熟悉 Java 语法、线程与基本数据结构；不要求预先掌握 Java 内存模型。",
    outcome: "能够用 happens-before 与内存顺序证明线程间协议，从内存访问和线程协作解释吞吐与尾延迟，并用基准、剖析和生产指标判断优化是否成立。",
    color: "blue",
    index: "04",
  },
] as const;

export type Series = SeriesDefinition;
