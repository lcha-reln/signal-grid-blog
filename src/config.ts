const configuredBase = import.meta.env.BASE_URL;

export const BASE_PATH = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`;

export function sitePath(path = ""): string {
  return `${BASE_PATH}${path.replace(/^\/+/, "")}`;
}

export const SITE = {
  title: "RE-LN / Signal Grid",
  shortTitle: "RE/LN",
  description: "把实时消息、分布式一致性与交易系统讲清楚。",
  author: "lcha-reln",
  locale: "zh-CN",
  url: "https://lcha-reln.github.io/signal-grid-blog/",
  github: "https://github.com/lcha-reln/signal-grid-blog",
  cms: "https://app.pagescms.org",
};

export type SeriesKey =
  | "aeron"
  | "etcd"
  | "zookeeper"
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

export const PRIMARY_SERIES_KEY: Exclude<SeriesKey, "meta"> = "trading";

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
    title: "Aeron",
    eyebrow: "REAL-TIME TRANSPORT",
    description: "从 Media Driver 到 Cluster，拆开低延迟消息系统的每一层。",
    prerequisite: "Java NIO、线程模型与基础网络知识",
    outcome: "建立从传输、归档到集群容错的完整心智模型。",
    color: "cyan",
    index: "01",
  },
  {
    key: "etcd",
    title: "etcd",
    eyebrow: "DISTRIBUTED STATE",
    description: "理解 Raft、MVCC、Watch，以及生产集群的安全与运维。",
    prerequisite: "分布式系统基础与 HTTP/gRPC 入门",
    outcome: "能够设计、部署并排查生产级 etcd 集群。",
    color: "violet",
    index: "02",
  },
  {
    key: "zookeeper",
    title: "ZooKeeper",
    eyebrow: "COORDINATION",
    description: "从数据模型、Watch 到 ACL 和运维的完整协调系统路线。",
    prerequisite: "Java 基础与分布式协调概念",
    outcome: "理解会话、临时节点、Watch 与常见协调配方。",
    color: "lime",
    index: "03",
  },
  {
    key: "trading",
    title: "交易系统",
    eyebrow: "MARKET MECHANICS",
    description: "从 CEX 产品地图、订单与撮合，到仓位、资金费率、保证金、强平和做市，串起交易业务规则与核心系统边界。",
    prerequisite: "基础现货交易概念、百分比与盈亏计算；技术章节建议了解事件驱动架构。",
    outcome: "能够沿下单、撮合、持仓、风控与结算链路解释关键规则，并把规则转化为可测试、可审计的系统模型。",
    color: "amber",
    index: "04",
    stages: [
      {
        index: "01",
        eyebrow: "MARKET MAP",
        title: "市场地图",
        description: "先建立产品、参与者和系统边界。",
        fromOrder: 10,
      },
      {
        index: "02",
        eyebrow: "ORDER FLOW",
        title: "订单与撮合",
        description: "从订单输入追到订单簿、成交与自成交保护。",
        fromOrder: 30,
      },
      {
        index: "03",
        eyebrow: "POSITION & PRICING",
        title: "仓位与定价",
        description: "理解持仓现金流、资金费率与标记价格。",
        fromOrder: 60,
      },
      {
        index: "04",
        eyebrow: "RISK & CAPITAL",
        title: "风险与资本",
        description: "比较保证金模式、清算机制与组合风控。",
        fromOrder: 90,
      },
      {
        index: "05",
        eyebrow: "SYNTHESIS",
        title: "综合应用",
        description: "用做市串联流动性、库存、对冲与合规边界。",
        fromOrder: 120,
      },
    ],
  },
  {
    key: "availability",
    title: "高可用架构",
    eyebrow: "RESILIENCE",
    description: "从单写者热备、选主与一致性校验，到序列号、Gap 检测和故障恢复，建立可验证、可切换、可恢复的系统链路。",
    prerequisite: "Kafka 消费模型、ZooKeeper 临时节点与 Java 并发基础",
    outcome: "能够为有状态服务定义故障边界、切换协议与可验证恢复流程。",
    color: "coral",
    index: "05",
  },
  {
    key: "performance",
    title: "高性能组件",
    eyebrow: "MECHANICAL SYMPATHY",
    description: "Agrona、Disruptor 与零分配、无锁编程的工程实践。",
    prerequisite: "Java 内存模型、缓存与并发编程基础",
    outcome: "能基于性能数据选择合适的数据结构与并发策略。",
    color: "blue",
    index: "06",
  },
] as const;

export type Series = SeriesDefinition;
