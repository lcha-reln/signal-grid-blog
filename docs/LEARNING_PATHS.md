# Signal Grid 学习路径

这份文件记录专题的 canonical 阅读顺序。页面中的连续 Chapter 编号由 `seriesOrder` 排序后生成；修改标题或文件名时，不应同时改变已经发布的 `permalink`。

顶层专题只表达已经形成系统课程的稳定知识主线：`aeron`、`trading`、`availability`、`performance`。普通产品或组件名仍使用 `tags` 表示；Aeron 因同时覆盖 Transport、Archive 与 Cluster 的完整系统栈，单独形成顶层学习路径。`categories` 仅为兼容早期文章保留，不参与前台导航。

## Aeron 系统工程

| 阶段 | Chapter | `seriesOrder` | 标题 | `permalink` |
| --- | ---: | ---: | --- | --- |
| Aeron Transport | 01 | 5 | Aeron 全栈导读：Transport、Archive、Cluster 与 Agrona 的边界 | `aeron-stack-transport-archive-cluster-overview` |
| Aeron Transport | 02 | 10 | Aeron Transport：Channel、Stream、Session 与 Image 的身份模型 | `aeron-transport-channel-stream-session-image` |
| Aeron Transport | 03 | 20 | Aeron Transport：Publication、Log Buffer 与发送热路径 | `aeron-transport-publication-log-buffer-offer-try-claim` |
| Aeron Transport | 04 | 30 | Aeron Transport：Subscription、poll 与消息重组 | `aeron-transport-subscription-poll-fragmentation` |
| Aeron Transport | 05 | 40 | Aeron Transport：可靠 UDP、流控、拥塞控制与丢包恢复 | `aeron-transport-reliable-udp-flow-congestion-loss` |
| Aeron Transport | 06 | 50 | Aeron Transport：多目标、Spy 与双向通信模式 | `aeron-transport-mdc-mds-spy-response-channels` |
| Aeron Transport | 07 | 60 | Aeron Transport：Media Driver 生产配置、监控与故障诊断 | `aeron-transport-media-driver-operations-diagnostics` |
| Aeron Archive | 08 | 70 | Aeron Archive：架构、控制会话与录制生命周期 | `aeron-archive-recording-lifecycle` |
| Aeron Archive | 09 | 80 | Aeron Archive：Catalog、Segment、持久性与录制续接 | `aeron-archive-storage-and-retention` |
| Aeron Archive | 10 | 90 | Aeron Archive：Replay、Bounded Replay 与历史追实时 | `aeron-archive-replay-and-live-merge` |
| Aeron Archive | 11 | 100 | Aeron Archive：跨主机复制、Live Merge 与灾备恢复 | `aeron-archive-replication-and-recovery` |
| Aeron Archive | 12 | 110 | Aeron Archive：校验、修复、迁移、监控与容量治理 | `aeron-archive-operations-and-repair` |
| Aeron Cluster | 13 | 120 | Aeron Cluster：架构、组件与一条消息的提交之旅 | `aeron-cluster-architecture-and-log-commit` |
| Aeron Cluster | 14 | 130 | Aeron Cluster：确定性业务内核、会话、协议与网关 | `aeron-cluster-deterministic-services-and-clients` |
| Aeron Cluster | 15 | 140 | Aeron Cluster：Timers、Snapshots 与 Replay | `aeron-cluster-timers-snapshots-and-recovery` |
| Aeron Cluster | 16 | 150 | Aeron Cluster：选举、Catch-up、Leader 切换与一致性边界 | `aeron-cluster-elections-catchup-and-consistency` |
| Aeron Cluster | 17 | 160 | Aeron Cluster：生产部署、安全边界与 Cluster Backup | `aeron-cluster-deployment-security-and-backup` |
| Aeron Cluster | 18 | 170 | Aeron Cluster：Counters、ClusterTool、性能与排障 Runbook | `aeron-cluster-operations-performance-and-troubleshooting` |

本路径以 Aeron 1.52.2 和对应官方文档、源码及 Javadoc 为版本基线。在线 Cookbook 用于补充实战问题，不替代核心概念与 API 事实。Transport 是 Archive 与 Cluster 的共同前提；Archive 负责可定位的持久化流，Cluster 在 Transport 与 Archive 之上建立确定性复制状态机。Agrona 不重复放入本路径，阅读 Buffer、Agent 与 IdleStrategy 时可回到 [Java 低延迟工程 Chapter 02](../src/content/posts/2026-03-10-agrona-direct-buffer-queues-and-agents.md)。

## 交易系统

| 阶段 | Chapter | `seriesOrder` | 标题 | `permalink` |
| --- | ---: | ---: | --- | --- |
| 市场与产品 | 01 | 10 | CEX 交易系统全景：从产品、订单到清算账本 | `cex-trading-system-overview` |
| 市场与产品 | 02 | 20 | 现货、期货与永续合约：基差、收敛与对冲 | `derivatives-contracts-and-basis` |
| 订单与撮合 | 03 | 30 | 交易订单语义：Market、Limit、TIF、Post-Only 与条件单 | `order-types-and-execution-strategies` |
| 订单与撮合 | 04 | 40 | 订单簿与自成交保护：从队列结构到 STP | `order-book-and-self-trade-prevention` |
| 订单与撮合 | 05 | 50 | 撮合机制：价格时间优先、连续竞价与集合竞价 | `matching-engine-and-auctions` |
| 仓位与定价 | 06 | 60 | 合约仓位生命周期：开仓、减仓、平仓与盈亏 | `position-lifecycle-and-pnl` |
| 仓位与定价 | 07 | 70 | 永续合约资金费率：溢价、结算与基差交易 | `perpetual-funding-rate` |
| 仓位与定价 | 08 | 80 | 保证金风险引擎：权益、维持保证金与标记价格 | `margin-metrics-and-mark-price` |
| 保证金与清算 | 09 | 90 | 逐仓与全仓：风险隔离、共享权益与风险传播 | `isolated-and-cross-margin` |
| 保证金与清算 | 10 | 100 | 强平风险瀑布：部分清算、保险基金与 ADL | `liquidation-and-adl` |
| 保证金与清算 | 11 | 110 | 统一账户与组合保证金：抵押品折扣、净额与压力测试 | `unified-account-and-portfolio-margin` |
| 系统综合 | 12 | 120 | 订单簿做市：价差、库存、逆向选择与合规边界 | `market-making-mechanics-and-strategies` |

阶段边界和首页主线维护在 `src/config.ts`。新增或移动章节时，应同时检查：

- 同一专题的 `seriesOrder` 不重复；
- 文章落入且只落入一个阶段；
- 文章前后导航与本表一致；
- 首页只展示主路径前六章，完整路径仍在专题页；
- 新链接包含 `/signal-grid-blog/` base。

## 有状态系统可靠性

| Chapter | `seriesOrder` | 标题 | `permalink` |
| ---: | ---: | --- | --- |
| 01 | 10 | 有状态服务的高可用架构：热备复制、选主与快照恢复 | `high-availability-stateful-service` |
| 02 | 15 | Raft 论文精读：Leader 选举、日志复制、安全性与成员变更 | `raft-consensus-leader-election-log-replication-and-safety` |
| 03 | 20 | ZooKeeper 3.9：从 znode、Watch 到 ZAB、一致性与工程配方 | `zookeeper-coordination-consistency-and-recipes` |
| 04 | 30 | Kafka 4.3：从分区日志、ISR 与 KRaft 到消费语义、事务和生产运维 | `kafka-distributed-log-kraft-consumers-and-transactions` |
| 05 | 40 | 分布式消息序列号：Gap 检测、乱序处理与 Aeron 实战 | `distributed-message-sequencing` |

本路径先建立单写者有状态服务的复制与恢复全景，再用 Raft 原论文构造多数派共识、日志提交和安全性证明的标准模型；随后分别进入 ZooKeeper/ZAB 的协调接口与 Kafka/KRaft 的分布式日志工程，最后落到应用级序列号、Gap 检测和恢复协议。Raft 是分析框架，不代表 ZooKeeper、Kafka 或 Aeron Cluster 与标准 Raft 使用相同协议；现代 Kafka 也不依赖 ZooKeeper。

## Java 低延迟工程

| Chapter | `seriesOrder` | 标题 | `permalink` |
| ---: | ---: | --- | --- |
| 01 | 10 | LMAX Disruptor 4：Ring Buffer、消费拓扑与 Batch Rewind | `lmax-disruptor-ring-buffer-and-sequencing` |
| 02 | 20 | Agrona 2：DirectBuffer、并发队列与 Agent 执行模型 | `agrona-direct-buffer-queues-and-agents` |

本路径先用 Disruptor 建立事件管线、序列与背压模型，再用 Agrona 下探 Buffer、内存顺序、并发容器与执行循环；后续补充内存布局和基准方法。新增章节时保持 `seriesOrder` 以 10 为间隔，并用真实依赖关系决定顺序，不按发布日期倒排。
