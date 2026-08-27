# Signal Grid 学习路径

这份文件记录专题的 canonical 阅读顺序。页面中的连续 Chapter 编号由 `seriesOrder` 排序后生成；修改标题或文件名时，不应同时改变已经发布的 `permalink`。

顶层专题只表达已经形成系统课程的稳定知识主线：`aeron`、`trading`、`availability`、`performance`、`agent`。普通产品或组件名仍使用 `tags` 表示；Aeron 因同时覆盖 Transport、Archive 与 Cluster 的完整系统栈，单独形成顶层学习路径。`categories` 仅为兼容早期文章保留，不参与前台导航。

## Aeron 系统工程

| 阶段            | Chapter | `seriesOrder` | 标题                                                                         | `permalink`                                                                           |
| --------------- | ------: | ------------: | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Aeron Transport |      01 |             5 | Aeron 全栈导读：Transport、Archive、Cluster 与 Agrona 的边界                 | `aeron-stack-transport-archive-cluster-overview`                                      |
| Aeron Transport |      02 |            10 | Aeron Transport：Channel、Stream、Session 与 Image 的身份模型                | `aeron-transport-channel-stream-session-image`                                        |
| Aeron Transport |      03 |            15 | Aeron 与 SBE：从字节流到可演进协议——Schema、Flyweight 与兼容性测试           | `aeron-sbe-schema-flyweight-and-compatibility-testing`                                |
| Aeron Transport |      04 |            20 | Aeron Transport：Publication、Log Buffer 与发送热路径                        | `aeron-transport-publication-log-buffer-offer-try-claim`                              |
| Aeron Transport |      05 |            30 | Aeron Transport：Subscription、poll 与消息重组                               | `aeron-transport-subscription-poll-fragmentation`                                     |
| Aeron Transport |      06 |            40 | Aeron Transport：可靠 UDP、流控、拥塞控制与丢包恢复                          | `aeron-transport-reliable-udp-flow-congestion-loss`                                   |
| Aeron Transport |      07 |            50 | Aeron Transport：多目标、Spy 与双向通信模式                                  | `aeron-transport-mdc-mds-spy-response-channels`                                       |
| Aeron Transport |      08 |            60 | Aeron Transport：Media Driver 生产配置、监控与故障诊断                       | `aeron-transport-media-driver-operations-diagnostics`                                 |
| Aeron Archive   |      09 |            70 | Aeron Archive：架构、控制会话与录制生命周期                                  | `aeron-archive-recording-lifecycle`                                                   |
| Aeron Archive   |      10 |            80 | Aeron Archive：Catalog、Segment、持久性与录制续接                            | `aeron-archive-storage-and-retention`                                                 |
| Aeron Archive   |      11 |            90 | Aeron Archive：Replay、Bounded Replay 与历史追实时                           | `aeron-archive-replay-and-live-merge`                                                 |
| Aeron Archive   |      12 |           100 | Aeron Archive：跨主机复制、Live Merge 与灾备恢复                             | `aeron-archive-replication-and-recovery`                                              |
| Aeron Archive   |      13 |           110 | Aeron Archive：校验、修复、迁移、监控与容量治理                              | `aeron-archive-operations-and-repair`                                                 |
| Aeron Archive   |      14 |           115 | Aeron 可恢复服务实战：Request/Response、Archive 录制、Checkpoint 与断线追赶  | `aeron-recoverable-service-request-response-archive-checkpoint-catchup`               |
| Aeron Cluster   |      15 |           120 | Aeron Cluster：架构、组件与一条消息的提交之旅                                | `aeron-cluster-architecture-and-log-commit`                                           |
| Aeron Cluster   |      16 |           130 | Aeron Cluster：确定性业务内核、会话、协议与网关                              | `aeron-cluster-deterministic-services-and-clients`                                    |
| Aeron Cluster   |      17 |           135 | Aeron Cluster 边缘一致性：Gateway、幂等请求、Read Barrier 与 Projection 恢复 | `aeron-cluster-edge-consistency-gateway-idempotency-read-barrier-projection-recovery` |
| Aeron Cluster   |      18 |           140 | Aeron Cluster：Timers、Snapshots 与 Replay                                   | `aeron-cluster-timers-snapshots-and-recovery`                                         |
| Aeron Cluster   |      19 |           150 | Aeron Cluster：选举、Catch-up、Leader 切换与一致性边界                       | `aeron-cluster-elections-catchup-and-consistency`                                     |
| Aeron Cluster   |      20 |           160 | Aeron Cluster：生产部署、安全边界与 Cluster Backup                           | `aeron-cluster-deployment-security-and-backup`                                        |
| Aeron Cluster   |      21 |           170 | Aeron Cluster：Counters、ClusterTool、性能与排障 Runbook                     | `aeron-cluster-operations-performance-and-troubleshooting`                            |
| 升级与故障验收  |      22 |           175 | Aeron 升级工程：协议兼容、Archive 迁移、Cluster 滚动重启与回滚               | `aeron-upgrade-engineering-protocol-archive-cluster-rollback`                         |
| 升级与故障验收  |      23 |           180 | Aeron Cluster 故障实验室：三节点、Snapshot、选举、Backup 与恢复验收          | `aeron-cluster-failure-lab-snapshot-election-backup-recovery`                         |

本路径以 Aeron 1.52.2、SBE 1.39.0 和对应官方文档、源码及 Javadoc 为版本基线。在线 Cookbook 用于补充实战问题，不替代核心概念与 API 事实。Transport 是 Archive 与 Cluster 的共同前提；SBE 把传输字节收敛为可演进协议；Archive 负责可定位的持久化流，并可与业务 Checkpoint 组合成可恢复服务；Cluster 在 Transport 与 Archive 之上建立确定性复制状态机，最后通过升级与故障实验验证整条恢复链。Agrona 不重复放入本路径，阅读 Buffer、Agent 与 IdleStrategy 时可回到 [Java 低延迟工程 Chapter 12](../src/content/posts/2026-03-10-agrona-direct-buffer-queues-and-agents.md)。

## 交易系统

| 阶段                   | Chapter | `seriesOrder` | 标题                                                                       | `permalink`                                                  |
| ---------------------- | ------: | ------------: | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 市场与产品             |      01 |            10 | CEX 交易系统全景：从产品、订单到清算账本                                   | `cex-trading-system-overview`                                |
| 市场与产品             |      02 |            15 | 交易品种主数据与市场状态：合约规格、交易日、停牌、价格带与规则版本         | `trading-instrument-master-market-state-and-rule-versioning` |
| 市场与产品             |      03 |            20 | 现货、期货与永续合约：基差、收敛与对冲                                     | `derivatives-contracts-and-basis`                            |
| 订单、风控、撮合与行情 |      04 |            30 | 交易订单语义：Market、Limit、TIF、Post-Only 与条件单                       | `order-types-and-execution-strategies`                       |
| 订单、风控、撮合与行情 |      05 |            35 | 交易前风控与订单准入：资金预占、信用限额、Fat Finger、价格带与 Kill Switch | `pre-trade-risk-and-order-admission`                         |
| 订单、风控、撮合与行情 |      06 |            40 | 订单簿与自成交保护：从队列结构到 STP                                       | `order-book-and-self-trade-prevention`                       |
| 订单、风控、撮合与行情 |      07 |            50 | 撮合机制：价格时间优先、连续竞价与集合竞价                                 | `matching-engine-and-auctions`                               |
| 订单、风控、撮合与行情 |      08 |            52 | OMS 与私有执行回报：订单身份、Cancel/Replace、Drop Copy 与断线对账         | `oms-private-execution-reports-and-reconciliation`           |
| 订单、风控、撮合与行情 |      09 |            55 | 行情数据管线与订单簿重建：权威事件、快照、增量与 Gap 恢复                  | `market-data-pipeline-and-order-book-reconstruction`         |
| 仓位、结算与账本       |      10 |            60 | 合约仓位生命周期：开仓、减仓、平仓与盈亏                                   | `position-lifecycle-and-pnl`                                 |
| 仓位、结算与账本       |      11 |            65 | 期货结算与交割：每日盯市、Variation Margin、最终结算与实物交割             | `futures-settlement-variation-margin-and-delivery`           |
| 仓位、结算与账本       |      12 |            70 | 永续合约资金费率：溢价、结算与基差交易                                     | `perpetual-funding-rate`                                     |
| 仓位、结算与账本       |      13 |            75 | 交易账本与双重记账：从成交入账、余额预占到冲正与对账                       | `trading-ledger-double-entry-accounting-and-reconciliation`  |
| 仓位、结算与账本       |      14 |            80 | 保证金风险引擎：权益、维持保证金与标记价格                                 | `margin-metrics-and-mark-price`                              |
| 保证金与清算           |      15 |            90 | 逐仓与全仓：风险隔离、共享权益与风险传播                                   | `isolated-and-cross-margin`                                  |
| 保证金与清算           |      16 |           100 | 强平风险瀑布：部分清算、保险基金与 ADL                                     | `liquidation-and-adl`                                        |
| 保证金与清算           |      17 |           110 | 统一账户与组合保证金：抵押品折扣、净额与压力测试                           | `unified-account-and-portfolio-margin`                       |
| 系统综合               |      18 |           120 | 订单簿做市：价差、库存、逆向选择与合规边界                                 | `market-making-mechanics-and-strategies`                     |

阶段边界和首页主线维护在 `src/config.ts`。新增或移动章节时，应同时检查：

- 同一专题的 `seriesOrder` 不重复；
- 文章落入且只落入一个阶段；
- 文章前后导航与本表一致；
- 首页只展示主路径前六章，完整路径仍在专题页；
- 新链接包含 `/signal-grid-blog/` base。

## 有状态系统可靠性

| 阶段                   | Chapter | `seriesOrder` | 标题                                                                                       | `permalink`                                                                  |
| ---------------------- | ------: | ------------: | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 故障模型与本地恢复     |      01 |            10 | 有状态服务的高可用架构：热备复制、选主与快照恢复                                           | `high-availability-stateful-service`                                         |
| 故障模型与本地恢复     |      02 |            20 | WAL 到底保证什么：从 Write-Ahead Rule、fsync 到崩溃恢复                                    | `write-ahead-log-durability-and-crash-recovery`                              |
| 时间、共识与协调       |      03 |            25 | 分布式时间：时钟、因果与租约                                                               | `distributed-systems-time-clocks-ordering-and-leases`                        |
| 时间、共识与协调       |      04 |            27 | 一致性不是一个形容词：线性一致、顺序一致、可串行化与实时顺序                               | `consistency-models-linearizability-serializability-and-real-time-order`     |
| 时间、共识与协调       |      05 |            28 | 复制协议的设计空间：Primary-Backup、同步与异步复制、Quorum、Chain Replication 与状态机复制 | `replication-protocol-design-space-primary-backup-quorum-chain-smr`          |
| 时间、共识与协调       |      06 |            30 | Raft 论文精读：Leader 选举、日志复制、安全性与成员变更                                     | `raft-consensus-leader-election-log-replication-and-safety`                  |
| 时间、共识与协调       |      07 |            40 | ZooKeeper 3.9：从 znode、Watch 到 ZAB、一致性与工程配方                                    | `zookeeper-coordination-consistency-and-recipes`                             |
| 分布式日志与消息连续性 |      08 |            50 | Kafka 4.3：从分区日志、ISR 与 KRaft 到消费语义、事务和生产运维                             | `kafka-distributed-log-kraft-consumers-and-transactions`                     |
| 分布式日志与消息连续性 |      09 |            60 | 分布式消息序列号：Gap 检测、乱序处理与 Aeron 实战                                          | `distributed-message-sequencing`                                             |
| 分布式日志与消息连续性 |      10 |            65 | 跨系统副作用：结果未知、幂等、Outbox/Inbox、2PC 与 Saga                                    | `cross-system-side-effects-idempotency-outbox-inbox-2pc-saga`                |
| 分布式日志与消息连续性 |      11 |            70 | 过载也是故障：背压、Admission Control、Retry Budget 与 Load Shedding                       | `overload-backpressure-admission-control-retry-budget-load-shedding`         |
| 分布式日志与消息连续性 |      12 |            75 | 状态所有权如何安全迁移：Shard、Catch-up、Handoff、Rebalancing 与 Fencing                   | `state-ownership-migration-shard-catchup-handoff-fencing`                    |
| 检查点、灾备与验证     |      13 |            80 | 分布式快照与一致检查点：从 Chandy–Lamport 到 Barrier、Checkpoint 与恢复位点                | `distributed-snapshots-consistent-checkpoints-barriers-recovery-cursors`     |
| 检查点、灾备与验证     |      14 |            85 | 历史什么时候可以删除：Recovery Frontier、Log Truncation、Dedup 生命周期与安全回收          | `history-retention-recovery-frontier-log-truncation-dedup-gc`                |
| 检查点、灾备与验证     |      15 |            90 | 备份不是副本：PITR、RPO/RTO、灾难恢复与恢复演练                                            | `backup-pitr-disaster-recovery-and-restore-drills`                           |
| 检查点、灾备与验证     |      16 |            95 | 副本都在线，数据却已经错了：Checksum、Scrubbing、损坏隔离与权威修复                        | `silent-data-corruption-checksum-scrubbing-isolation-authoritative-repair`   |
| 检查点、灾备与验证     |      17 |           100 | 有状态系统如何滚动升级：协议版本、快照迁移、双版本执行与安全回滚                           | `stateful-system-rolling-upgrades-protocol-snapshot-migration-safe-rollback` |
| 检查点、灾备与验证     |      18 |           105 | 有状态系统的可观测性：从存活指标到 Epoch、Commit、Lag、Cursor 与恢复证据                   | `stateful-system-observability-epoch-commit-lag-cursor-recovery`             |
| 检查点、灾备与验证     |      19 |           108 | 从协议伪代码到形式化规格：TLA+、Invariant、Counterexample 与 Refinement                    | `protocol-pseudocode-to-tla-invariants-counterexamples-refinement`           |
| 检查点、灾备与验证     |      20 |           110 | 如何证明恢复协议真的可靠：Failpoint、确定性模拟、历史检查与故障注入                        | `recovery-protocol-verification-failpoints-simulation-history-checking`      |

本路径先建立单写者有状态服务的复制与恢复全景，再用 WAL 说明单机如何建立可恢复的持久前缀；随后区分墙钟、逻辑顺序、超时与 Lease，并用 operation history 精确定义一致性合同。复制协议设计空间先把 Primary-Backup、同步与异步确认、Quorum、Chain Replication 和状态机复制放进同一张决策图，再由 Raft、ZooKeeper/ZAB 与 Kafka/KRaft 分别展示共识协议、协调接口和分布式日志。应用序列号与跨系统副作用继续处理消息连续性和结果未知，过载控制与状态所有权迁移则说明系统怎样在压力和在线重平衡中维持唯一权威。最后，一致检查点先建立可恢复 cut，Recovery Frontier 再证明哪些历史与去重证据可以安全回收；PITR 与灾难恢复处理跨故障域的长期基线，Checksum、Scrubbing 与权威修复处理“副本仍在线但内容已经损坏”的静默故障。混合版本升级与协议可观测性给出演进状态和运行证据，TLA+ 把协议不变量、反例与 refinement 写成可探索规格，再由历史检查与确定性故障注入完成实现层验证闭环。本地 WAL、复制提交、业务幂等、全局快照、备份、完整性校验和 exactly-once 始终是不同保证；Raft 也是分析框架，不代表 ZooKeeper、Kafka 或 Aeron Cluster 与标准 Raft 使用相同协议，现代 Kafka 更不依赖 ZooKeeper。

## Java 低延迟工程

| 阶段                   | Chapter | `seriesOrder` | 标题                                                                      | `permalink`                                                             |
| ---------------------- | ------: | ------------: | ------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 并发正确性与性能证据   |      01 |            10 | Java Memory Model 与 VarHandle：happens-before、内存顺序与安全发布        | `java-memory-model-varhandle-memory-ordering`                           |
| 并发正确性与性能证据   |      02 |            20 | Java 低延迟到底应该怎么测：JMH、尾延迟与生产证据链                        | `java-low-latency-measurement`                                          |
| 机器、JVM 与系统运行时 |      03 |            30 | Java 低延迟的机器模型：Cache Line、局部性、伪共享与 NUMA                  | `java-low-latency-machine-model-cache-locality-false-sharing-numa`      |
| 机器、JVM 与系统运行时 |      04 |            40 | HotSpot 如何执行你的代码：TLAB、逃逸分析、JIT、去优化与 Safepoint         | `hotspot-execution-tlab-escape-analysis-jit-deoptimization-safepoint`   |
| 机器、JVM 与系统运行时 |      05 |            45 | Vector API 与 SIMD：数据布局、自动向量化、边界条件与基准证据              | `java-vector-api-simd-data-layout-auto-vectorization-benchmarks`        |
| 机器、JVM 与系统运行时 |      06 |            50 | Java 低延迟 GC：分配率、Live Set、G1、ZGC 与 Generational Shenandoah      | `java-low-latency-gc-allocation-live-set-g1-zgc-shenandoah`             |
| 机器、JVM 与系统运行时 |      07 |            52 | Java 线程为什么没有继续运行：Monitor、AQS、park/unpark 与调度延迟         | `java-thread-contention-aqs-park-unpark-scheduling`                     |
| 机器、JVM 与系统运行时 |      08 |            58 | Java 网络 I/O 的真实数据路径：NIO、Selector、DirectBuffer、系统调用与背压 | `java-nio-selector-socket-data-path-backpressure`                       |
| 机器、JVM 与系统运行时 |      09 |            59 | 从 Readiness 到 Completion：Java、epoll、io_uring、零拷贝与 Backpressure  | `java-epoll-io-uring-zero-copy-completion-backpressure`                 |
| 机器、JVM 与系统运行时 |      10 |            60 | Linux 低延迟运行时：CPU 亲和性、NUMA、IRQ、RSS/RPS/XPS 与 Busy Poll       | `linux-low-latency-runtime-cpu-affinity-numa-irq-rss-rps-xps-busy-poll` |
| 数据通路原语与执行模型 |      11 |            70 | LMAX Disruptor 4：Ring Buffer、消费拓扑与 Batch Rewind                    | `lmax-disruptor-ring-buffer-and-sequencing`                             |
| 数据通路原语与执行模型 |      12 |            80 | Agrona 2：DirectBuffer、并发队列与 Agent 执行模型                         | `agrona-direct-buffer-queues-and-agents`                                |
| 数据通路原语与执行模型 |      13 |            90 | Java 堆外内存与 FFM：MemorySegment、Arena、mmap 与生命周期                | `java-off-heap-memory-ffm-memorysegment-arena-mmap-lifecycle`           |

本路径先从 JMM 与 VarHandle 建立数据竞争、happens-before、内存顺序和安全发布的证明方法；接着用 JMH、开放负载、尾延迟直方图与生产灰度建立可信的性能证据链；再把 Java 热路径放回 Cache、局部性、伪共享、TLB、SMT 与 NUMA 的真实机器模型。随后沿 HotSpot 的分层编译、对象分配、去优化与 Safepoint 解释运行时波动，用 Vector API 与自动向量化检验数据布局怎样落到 SIMD 指令，再把分配率、Live Set 与回收余量带入 G1、ZGC 和 Generational Shenandoah，并追踪线程怎样因 Monitor、AQS 与 park/unpark 从竞争进入等待。Java NIO 章节把 partial I/O、Selector readiness、发送队列和背压接到 socket 边界；io_uring 章节继续区分 readiness 与 completion，拆开零拷贝和多级在途队列；Linux 章节再沿 CPU、NUMA、IRQ、NAPI 与网卡队列追到真实内核路径。完成这些基础后，Disruptor 与 Agrona 分别把约束落到事件拓扑、序列、并发容器和 Agent 循环，最后由 FFM 用显式的空间、时间和线程边界收束堆外 Buffer、native 调用与 mmap 生命周期。

## AI Agent 后端工程

| 阶段               | Chapter | `seriesOrder` | 标题                                                 | `permalink`                         |
| ------------------ | ------: | ------------: | ---------------------------------------------------- | ----------------------------------- |
| 系统边界与后端基础 |      01 |           100 | AI Agent 后端工程地图：概率模型与确定性系统的边界    | `ai-agent-backend-engineering-map`  |
| 系统边界与后端基础 |      02 |           110 | Python AI 后端：类型、Pydantic、精确数值与可复现工程 | `python-ai-backend-typing-pydantic` |

这条路径研究的不是怎样把更多 Prompt 和工具堆进循环，而是怎样把概率模型放进一个状态明确、权限受控、可以恢复、能够评测并且便于审计的后端系统。Chapter 01 先划清模型、Workflow、Agent Runtime、Tool Gateway、领域系统和生产治理的职责；Chapter 02 再把确定性边界落实为 Python 类型关系、Pydantic 运行时 Schema、精确领域值、事务约束与可复现环境。后续章节会沿可靠异步、模型契约、工具运行时、RAG、持久化编排、Eval、安全与平台化逐层展开。完整的 42 篇 canonical 规划记录在 [AI Agent 后端工程博客系列规划](./AI_AGENT_BACKEND_SERIES_PLAN.md)。
