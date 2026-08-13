# Aeron 专题来源覆盖表

这份文件用于审计 Signal Grid 的 Aeron 专题是否覆盖官方知识面。它不是文章目录的替代品，也不把在线文档的段落复制进博客。

## 版本与取材规则

- 发布基线：Aeron `1.52.2`、Agrona `2.5.0`、Java 17+。
- 概念导航以 [Aeron 官方文档](https://aeron.io/docs/) 为最高优先级。
- API、默认值、线程边界和工具行为需要同时核对 [Aeron 1.52.2 固定版本源码](https://github.com/aeron-io/aeron/tree/1.52.2) 或对应 Javadoc。
- [Aeron & Archive Cookbook](https://aeron.io/docs/cookbook/aeron/) 与 [Cluster Cookbook](https://aeron.io/docs/cookbook/aeron-cluster/) 只补充实践问题，不决定知识结构。
- 旧博客翻译、旧摘录和未标版本的性能数字不作为来源。
- 官方页面若仍包含旧版本示例，以 1.52.2 行为为准，并在文章中明确版本差异。

## Aeron Transport

| 官方主题 | 主要覆盖文章 |
| --- | --- |
| [Overview](https://aeron.io/docs/aeron/overview/) | 全栈导读；Transport 1 |
| [Basic Sample](https://aeron.io/docs/aeron/basic-sample/) | Transport 1–3 |
| [Media Driver](https://aeron.io/docs/aeron/media-driver/) | Transport 1、6 |
| [Channels, Streams & Sessions](https://aeron.io/docs/aeron/aeron-channel-stream-session/) | Transport 1、5 |
| [Publications & Subscriptions](https://aeron.io/docs/aeron/publications-subscriptions/) | Transport 2、3 |
| [Log Buffers & Images](https://aeron.io/docs/aeron/log-buffers-images/) | Transport 1–3 |
| [Understanding Position](https://aeron.io/docs/aeron/aeron-understanding-position/) | 全栈导读；Transport 2–4 |
| [Multi-Destination-Cast](https://aeron.io/docs/aeron/multi-destination-cast/) | Transport 5 |
| [Aeron Tooling](https://aeron.io/docs/aeron/aeron-tooling/) | Transport 6 |
| [Common Errors](https://aeron.io/docs/aeron/dealing-with-common-errors/) | Transport 2、3、6 |
| [Two Agent IPC Sample](https://aeron.io/docs/aeron/two-agent-ipc-sample/) | Transport 1、3 |
| [Aeron Agent](https://aeron.io/docs/aeron/aeron-agent/) | Transport 6 |
| [Troubleshooting](https://github.com/aeron-io/aeron/wiki/Troubleshooting-Guide) | Transport 6；Archive 5；Cluster 6 |

Transport 还应覆盖官方 Wiki 中与当前运行时直接相关的主题：client concurrency model、thread utilisation、message delivery assurances、flow/congestion control、response channels、name resolution、persistent subscriptions、publication revoke 与 configuration precedence。若 Wiki 与稳定 tag 冲突，以 tag 源码为准。

## Aeron Archive

| 官方主题 | 主要覆盖文章 |
| --- | --- |
| [Overview](https://aeron.io/docs/aeron-archive/overview/) | 全栈导读；Archive 1 |
| [Basic Sample](https://aeron.io/docs/aeron-archive/basic-sample/) | Archive 1–3 |
| [Working with Recordings](https://aeron.io/docs/aeron-archive/working-with-recordings/) | Archive 1、2 |
| [Multi-host Sample](https://aeron.io/docs/aeron-archive/multi-host-sample/) | Archive 3、4 |
| [Replication Sample](https://aeron.io/docs/aeron-archive/replication-sample/) | Archive 4 |
| [Purging and Truncation](https://aeron.io/docs/aeron-archive/purging-and-truncation/) | Archive 2、5 |
| [Archive Tooling](https://aeron.io/docs/aeron-archive/aeron-archive-tooling/) | Archive 5 |

Archive 的固定版本源码核对重点包括：`AeronArchive`、`ArchiveProxy`、recording descriptor/signal poller、`Catalog`、`RecordingWriter`、`RecordingReader`、`ReplaySession`、`ReplayMerge`、`PersistentSubscription`、replication session 与 `ArchiveTool`。

## Aeron Cluster

| 官方主题 | 主要覆盖文章 |
| --- | --- |
| [Overview](https://aeron.io/docs/aeron-cluster/overview/) | 全栈导读；Cluster 1 |
| [Basic Sample](https://aeron.io/docs/aeron-cluster/basic-sample/) | Cluster 1、2 |
| [Gateway Design](https://aeron.io/docs/aeron-cluster/gateway-design/) | Cluster 2 |
| [Efficient Business Logic](https://aeron.io/docs/aeron-cluster/efficient-business-logic/) | Cluster 2、6 |
| [Databases](https://aeron.io/docs/aeron-cluster/databases/) | Cluster 2、3 |
| [Reference Data](https://aeron.io/docs/aeron-cluster/reference-data/) | Cluster 2、3 |
| [Cluster Timers](https://aeron.io/docs/aeron-cluster/cluster-timers/) | Cluster 3 |
| [Cluster Clients](https://aeron.io/docs/aeron-cluster/cluster-clients/) | Cluster 2、4 |
| [Gateway Patterns](https://aeron.io/docs/aeron-cluster/cluster-gateway-patterns/) | Cluster 2、5 |
| [Cluster Backup](https://aeron.io/docs/aeron-cluster/cluster-backup/) | Cluster 5 |
| [Performance Limits](https://aeron.io/docs/aeron-cluster/performance-limits/) | Cluster 2、6 |
| [Client Consistency](https://aeron.io/docs/aeron-cluster/client-consistency/) | Cluster 2、4 |
| [On Sharding](https://aeron.io/docs/aeron-cluster/on-sharding/) | Cluster 6 |
| [Election States](https://aeron.io/docs/aeron-cluster/election-state/) | Cluster 4 |
| [Understanding Cluster Counters](https://aeron.io/docs/aeron-cluster/understanding-cluster-counters/) | Cluster 1、4、6 |
| [Operating Aeron Cluster](https://aeron.io/docs/aeron-cluster/operating-aeron-cluster/) | Cluster 5、6 |
| [Cluster Errors](https://aeron.io/docs/aeron-cluster/cluster-errors/) | Cluster 5、6 |

Cluster 的固定版本源码核对重点包括：`ConsensusModuleAgent`、`Election` / `ElectionState`、`LogPublisher`、`CommitPos` / `RecordingPos` counters、`BoundedLogAdapter`、`ClusteredServiceAgent`、timer service、snapshot loaders/takers、`AeronCluster`、`ClusterBackupAgent` 与 `ClusterTool`。

## Cookbook 问题映射

| Cookbook 实践问题 | 放入章节 |
| --- | --- |
| Media Driver、端口、poll loop、资源/性能配置、channel alias | Transport 1、3、6 |
| 大于 MTU 的消息、FragmentAssembler、零额外发送复制 | Transport 2、3 |
| counters、timeout、checksum、JDK opens、Mac warm-up | Transport 6；Archive 5 |
| IPC agent、UDP RPC、等待连接、阻塞封装、取消读取 | Transport 1、3、5 |
| data loss、运行时状态、log 文件大小、Wireshark、端口范围 | Transport 4、6 |
| Archive replication error、本地控制连接 | Archive 1、4、5 |
| RFQ server | Cluster 1–4 的贯穿案例 |
| slow clients | Cluster 2、6 |
| startup tasks | Cluster 3 |
| Kubernetes | Cluster 5 |

## 发布前覆盖门禁

- 每个表格中的官方主题至少在一篇文章的“官方资料”中出现；
- API 示例不使用 master-only 或已删除类型；
- Position、registration ID、session ID、recording ID、replay/replication ID 不混用；
- Transport、Archive、Cluster 的可靠性与持久性边界分别表述；
- 所有 `offer`、claim、poll、异步控制和破坏性运维操作写明失败/终态；
- Mermaid 图不暗示跨 Image 全序、Archive 自动业务 exactly-once、两节点容错一台或 Cluster Backup 自动投票接管；
- 所有文章在 Node 24 完整构建中通过，并在真实浏览器检查 Mermaid、表格、代码与移动端横向滚动。
