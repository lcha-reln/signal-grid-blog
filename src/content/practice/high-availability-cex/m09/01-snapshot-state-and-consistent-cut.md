---
title: "M09·01：冻结 Snapshot 的完整状态与一致性切点"
description: "从订单簿、终态身份、RuleSet、市场模式到 durable idempotency，建立完整已 apply state image，并把 Snapshot cut 固定在 caller-serialized 命令边界。"
date: 2026-09-01T09:10:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 10
permalink: snapshot-state-and-consistent-cut
tags:
  - 撮合引擎
  - Snapshot
  - 状态恢复
draft: true
---

> 教程草稿：annotated [`course/m09-start`](https://github.com/lcha-reln/cex-matching/tree/course/m09-start) 已冻结结构化 RED，当前正文按实现审查 HEAD `c26a613` 校准；它在 `8f6a357` 主体 Snapshot 实现上补齐 recovery-scan hard budget。M09 尚无 complete tag、完成 evidence 或发布结论；文中的类和测试说明“实现现在怎样工作”，不等于课程门禁已经通过。

M08 已经能从 genesis WAL 重建状态，却必须重放全部历史。给它加 Snapshot 时，最诱人的做法是把买卖盘序列化：price level、orderId、remaining quantity 都在，重启后盘口看起来也一样。

这个做法对商用撮合核心仍然不够。

两份运行时可以拥有完全相同的盘口，却对下一条命令给出不同答案：一份处于 `OPEN`，另一份处于 `CANCEL_ONLY`；一份记得某个 orderId 已成交，另一份把它当成从未出现；一份保存了 producer slot 的原始 Reject，另一份在重试时按新市场状态重新计算。恢复若只追求“页面深度相同”，会制造一个悄悄分叉的状态机。

M09 的第一条结论因此是：**Snapshot 保存的不是查询投影，而是一个完整、已 apply、能决定下一条命令结果的 semantic state image。cut 只能落在两条 caller-serialized 命令之间。**

## 先区分三种看起来都叫“状态”的东西

| 状态 | 主要用途 | 能否单独恢复撮合核心 |
| --- | --- | --- |
| `OrderBookSnapshot` | 查询当前 resting liquidity | 不能；没有终态订单和控制面 |
| WAL 命令历史 | 从 genesis 重新执行 | 能，但恢复工作量无界增长 |
| M09 `LocalRuntimeStateImage` | 在一个已 apply cut 安装完整运行时 | 能；仍需连续 WAL suffix |

查询投影允许丢掉历史，只要对当前读请求够用。恢复状态不能这样做，因为它要回答的是：

> 如果紧接着提交同一个 canonical command，恢复后的运行时是否会产生与原运行时完全相同的 result、sequence、fence 和 digest？

这也是为什么 M09 没有把数据库或行情深度当恢复源。它们是别的 owner 维护的投影，不拥有撮合状态机的全部语义。

## 实现里的状态树

当前实现把恢复状态分成三层，而不是让 Snapshot codec 直接窥探撮合内部的散列表：

```text
LocalRuntimeStateImage
├─ CommandApplierState
│  ├─ MatchingStateImage
│  │  ├─ MarketControlSnapshot
│  │  └─ all accepted OrderImage entries
│  ├─ transcriptDigest
│  └─ semanticStateDigest
├─ IdentityBindingImage[]
├─ lastWalSequence
└─ lastApplicationSequence
```

对应 owner 很清楚：

- `SingleInstrumentMatchingEngine` 导出和恢复 `MatchingStateImage`；
- `MatchingCoreCommandApplier` 保存 core image、transcript digest 与 semantic digest；
- `IdentityIndex` 导出 commandId/Slot 双向 binding、producer cursor 所需历史和 original canonical result；
- `LocalMatchingRuntime` 在同一个命令边界组合这些状态，并把 WAL/Application anchor 交给 Snapshot 层。

这种分层很重要。`matching-core` 仍然不依赖文件、CRC 或 `FileChannel`；本地恢复格式由 `matching-local-runtime` 拥有。未来 Aeron adapter 也不能迫使 deterministic core 知道基础设施细节。

## 订单状态必须包含终态墓碑

`MatchingStateImage` 保存所有已接受订单，而不只保存 resting order。每个 `OrderImage` 至少包含：

```text
AcceptanceSequence
orderId / side / price
ExecutionPolicy
admission RuleSet identity
participantGroupId / STP policy
original / remaining / filled / canceled quantity
lifecycle = RESTING | FILLED | CANCELED
optional cancellation origin + application sequence
```

这让两个关键不变量跨过 WAL 回收仍成立：

1. 已成交或已撤销 orderId 不能因为不在 book 上就复活；
2. 同价 FIFO 仍由原始 `AcceptanceSequence` 决定，不能按反序列化顺序重新编号。

恢复时，engine 先把全部 order identity 放回 `ordersById`，只有 `RESTING` 订单才重新加入 bid/ask price level。price level 内按冻结的 AcceptanceSequence 重建，终态订单则保留为不可复活的墓碑。

状态对象的构造器还会主动拒绝不可能的图：重复 orderId、重复 acceptance sequence、终态数量分区不守恒、IOC 变成 resting、FOK 变成 canceled、取消发生在 next application sequence 之后。这些检查不是测试专用断言，而是安装 Snapshot 前的 fail-closed 边界。

## 控制状态不是可以重置的配置

`MarketControlSnapshot` 同样进入完整 state image：

- active RuleSet artifact；
- optional prepared RuleSet；
- control revision 与 last activation fence；
- next ApplicationSequence 与 next AcceptanceSequence；
- `OPEN/CANCEL_ONLY/HALTED` 与 mode revision；
- last mode-transition fence；
- last Mass Cancel fence，包括 operator attribution 与取消区间。

prepared RuleSet 最容易被误解成“半完成动作”。它其实是 M05 中一条已经完整 apply 的 Prepare 命令所产生的权威状态，只是还没被 Activate。Snapshot 必须保留它，正如数据库会保留一行尚未被下一条业务命令引用的数据。

同理，`HALTED` 不是启动时可以默认回 `OPEN` 的临时开关。若 Snapshot 漏掉 mode，重启后的第一张 Place 就会从 `MARKET_NOT_OPEN` 分叉成 Accepted；这不是可用性优化，而是业务语义损坏。

## durable identity 要连原始结果一起保存

M08 的 exact retry 依赖两份索引：

```text
commandId -> Slot + payloadHash + WAL position + original result
Slot      -> commandId + payloadHash + WAL position + original result
```

M09 的 `IdentityBindingImage` 因而保存：

- canonical commandId；
- producerId、epoch、shard、producerSequence；
- payload SHA-256；
- 原始 segment/WAL/Application position；
- result type、events、context、semantic digest 与 result digest。

producer cursor 没有单独序列化成一张“当前值”表；`IdentityIndex.restore` 按 WAL position 的 canonical 顺序重建它，并验证每个 epoch 从 sequence 1 开始、同 epoch 连续、旧 epoch 不倒退。这样一份伪造的 cursor 不能绕过完整 binding history。

保存 original result 也不是为了 UI 回显。exact duplicate 必须返回第一次执行时的业务 Reject、事件、context 和位置。若只保存 payloadHash，恢复后按当前 RuleSet 或 mode 重算，幂等接口会给同一个 commandId 两个答案。

## cut 为什么必须位于两条命令之间

M09 仍然是单进程、单 shard、caller-serialized runtime。`LocalMatchingRuntime.checkpoint()` 与 `submit()` 都是 `synchronized`，并共享 `operationInProgress` 防止 fault callback 嵌套执行。

checkpoint 读取的边界可写成：

```text
command N: append complete
        -> WAL force complete
        -> core apply complete
        -> identity commit complete
        -> ACK 可见

checkpoint cut @ N

command N+1: 尚未开始 canonical preflight 或 WAL append
```

实现先取：

```text
lastWal         = nextWalSequence - 1
lastApplication = nextApplicationSequence - 1
```

再在同一临界区内组合 `commandApplier.stateImage()` 与 `identities.stateImage()`。`LocalRuntimeStateImage` 要求 next application 恰好等于 `lastApplication + 1`，最后一条 identity binding 的 WAL/Application position 也必须等于 cut。

因此不存在下面这些模糊状态：

- command 已 force 但 core 只 apply 一半；
- market mode 已改、fence 尚未生成；
- Mass Cancel 只撤了一部分订单；
- identity 已写一侧索引、另一侧还没写；
- Snapshot 线程与下一条 Place 并发复制容器。

M09 没有后台 Snapshot 线程，也没有 copy-on-write。Prepare、Activate、ChangeMode、MassCancel 在本阶段都是同步、确定性的完整命令。cut 只可能看见它们 apply 前或 apply 后。

## 两类 digest 不能互相冒充

M09S1 同时使用几种完整性信号：

| 信号 | 比较对象 | 能证明什么 |
| --- | --- | --- |
| transcript digest | canonical command/result 历史 | 终态墓碑和历史语义没有被静默丢弃 |
| semantic state digest | core public state + transcript | 恢复后的业务状态与行为承诺一致 |
| CRC32C | Snapshot framing bytes | 完整 frame 的意外损坏检测 |
| serialization SHA-256 | 整份 canonical M09S1 bytes | 具体编码身份稳定 |

serialization digest 相同不能替代独立 semantic model：production encoder 与 decoder 可能以同一种方式遗漏字段。semantic digest 相同也不能说明文件 framing、generation 或 shard header 合法。

当前 codec 在 decode 后还会重新 encode，并要求 byte-for-byte 相同，用来拒绝非 canonical 表示。但最终课程证据仍必须让一个不解析 production Snapshot bytes 的参考模型检查业务等价，而不是让 codec 自己给自己颁证书。

## 从状态图到可执行反例

阅读实现时，可以用“遗漏字段后，哪条下一命令最先分叉”审查每个字段：

| 漏掉的状态 | 最小后续命令 | 错误表现 |
| --- | --- | --- |
| terminal order identity | 重用旧 orderId | 已终态订单被重新接受 |
| prepared RuleSet | Activate | target 不存在或错误拒绝 |
| `CANCEL_ONLY` | Place | 恢复后错误成交或挂单 |
| Mass Cancel fence | 同 revision 的控制命令 | attribution/fence 分叉 |
| original duplicate result | exact retry | 按新状态重算结果 |
| AcceptanceSequence | 同价新挂单 | FIFO 次序变化 |
| transcript digest | 查询相同、历史不同的状态 | semantic proof 失去终态承诺 |

这张表比“序列化了多少字段”更有用：字段只有绑定到下一步行为，才成为可验证的恢复合同。

## 读者可以怎样本地跟踪实现

建议按 owner 顺序阅读，而不是从 600 多行 codec 开始：

1. `MatchingStateImage`：完整订单与控制状态的不变量；
2. `SingleInstrumentMatchingEngine.stateImage/restore`：book 与终态身份怎样分开重建；
3. `IdentityIndex.stateImage/restore`：durable binding 与 producer cursor；
4. `LocalRuntimeStateImage`：core、identity 与 WAL cut 怎样交叉验证；
5. `M09SnapshotCodec`：最后才看 canonical bytes。

`course/m09-start` 上的 `FULL_CORE_STATE_ROUND_TRIP`、`TERMINAL_ORDER_NON_RESURRECTION`、`DURABLE_IDENTITY_AND_ORIGINAL_RESULT_ROUND_TRIP` 等 fixed scenario 是待完成 judge 的冻结输入，不是已经通过的结果。当前草稿不会写完成数字或引用不存在的 manifest。

## 本篇停止点

我们已经得到一个精确的 Snapshot state contract：它包含完整订单生命周期、price-time identity、RuleSet/mode/fence、sequence、transcript 和 durable idempotency；cut 只位于完整已 apply 的 caller-serialized 命令边界。

但这些 bytes 何时从临时文件变成权威 Snapshot，仍是另一个问题。下一篇只处理 M09S1 的原子发布，并严格区分“Snapshot 已发布”与“已经有资格删除旧 WAL 前缀”。
