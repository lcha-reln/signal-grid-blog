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

export const PRIMARY_SERIES_KEY: Exclude<SeriesKey, "meta"> = "availability";

export const META_SERIES = {
  key: "meta",
  title: "站点指南",
  eyebrow: "SIGNAL GRID",
  description: "关于这个博客的内容结构、编辑流程与发布方式。",
  prerequisite: "无需先修知识",
  outcome: "了解站点的内容结构、写作方式与发布流程。",
  color: "cyan",
  index: "00",
} as const;

export const SERIES = [
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
    description: "订单簿、保证金、强平与衍生品机制的业务和技术视角。",
    prerequisite: "基础市场知识与事件驱动系统概念",
    outcome: "把交易业务规则映射到可实现、可审计的系统模型。",
    color: "amber",
    index: "04",
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

export type Series = (typeof SERIES)[number];
