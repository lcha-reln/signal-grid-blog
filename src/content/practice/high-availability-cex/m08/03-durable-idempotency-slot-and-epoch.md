---
title: "M08·03：用 commandId、Slot 与 epoch 建立 durable idempotency"
description: "冻结 commandId/Slot/payloadHash 双向绑定、exact replay、三类冲突、producer gap、stale slot 的绑定优先级与 epoch fence。"
date: 2026-08-31T16:38:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M08
lessonOrder: 30
permalink: durable-idempotency-slot-and-epoch
tags:
  - 撮合引擎
  - 幂等性
  - Producer Epoch
draft: false
---

> 本篇按 annotated [`course/m08-start`](https://github.com/lcha-reln/cex-matching/tree/course/m08-start) 到 annotated [`course/m08-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m08-complete) 的真实 durable identity 状态机校准；双向 binding、冲突优先级和重启结果由[完成 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m08/evidence/manifest.json)绑定。
>
> 完成身份：`course/m08-complete` peeled commit `5c8d8f6a5356f6ebbdf87d83745d8e8bd0861199`；本站 manifest SHA-256 `19a5c93e618ef5d9430719b135ca95aa7db6513c7389e0cfb50eb80c430e2923`。

“用 commandId 去重”只解决一半问题：同一个 commandId 可能被错误地换 payload 或移动到另一个 producer sequence；反过来，同一个 producer slot 也可能收到两个 commandId。只查一张 map，会让至少一种身份冲突穿过 WAL。

M08 的结论是：**commandId 与 producer Slot 必须双向绑定同一个 payloadHash 和原始结果；exact known binding 永远只重放，任何单边冲突、gap 或 fenced epoch 都不 append、不 apply、不推进索引；在 strict-continuous、无淘汰的 M08 索引中，所谓 stale slot 必须先落到 duplicate 或 slot conflict。**

## Slot 是四元有序位置

冻结定义是：

```text
Slot = (
  producerId,
  producerEpoch,
  shardId,
  producerSequence
)
```

其中 epoch 与 sequence 都是正整数，sequence 从 1 开始。Slot 不是 WAL sequence，也不是 core `ApplicationSequence`：

| 序列域 | owner | 何时推进 |
| --- | --- | --- |
| producer Slot sequence | 某 producer/epoch/shard | 新 identity 通过 preflight 并最终 journal/apply |
| WAL sequence | local runtime | 每条新 durable record |
| ApplicationSequence | matching-core | 每条被 apply 的 canonical 业务命令，包括业务拒绝 |
| AcceptanceSequence | matching-core | Place 真正 Accepted |

exact duplicate 不推进任何一项；structural/conflict/gap rejection 也不推进。业务 rejection 是新 durable command，会占前三个对应边界，但不一定占 AcceptanceSequence。

## 两张索引互相证明

runtime 需要重建等价于下面的双向关系：

```text
commandId
  → Slot + payloadHash + original result/positions

Slot
  → commandId + payloadHash + original result/positions
```

只存 `commandId → hash` 会漏掉同一 Slot 换 commandId；只存 `Slot → commandId` 会漏掉同 commandId 被搬到新 Slot。两边还必须指向同一原始 canonical result，duplicate 才不会根据“当前状态”重新计算一个不同结果。

payload 相同并不自动代表 duplicate。两个不同 commandId、两个合法连续 Slot 可以有完全相同的 Place payload，它们是两条独立业务命令，后者可能因 duplicate orderId 被 core 拒绝；这条拒绝仍要 journal。

## exact known binding 必须最先重放

structural canonical/hash/shard 校验通过后，identity 决策顺序固定为：

```text
exact known commandId + Slot + payloadHash binding
→ commandId / Slot / payload conflicts
→ producer epoch + sequence rules
→ append a new record
```

exact 命中返回：

```text
DUPLICATE_REPLAYED
original WAL position
original ApplicationSequence/result context
original canonical business result
```

不 append、不 force、不 apply。即使 runtime 已经切到更高 producer epoch，旧 epoch 中**已存在**的 exact command 仍能 replay；否则一次晚到 ACK retry 会因 epoch fence 永远拿不到原结果。

这也是为什么 duplicate check 早于 epoch check。

## 三种绑定冲突不能合并成“duplicate”

对单一差异，稳定分类是：

| 已知关系 | 新提交 | 结果 |
| --- | --- | --- |
| commandId 已绑定 hash H | 同 commandId，payload hash H2≠H | `COMMAND_ID_PAYLOAD_CONFLICT` |
| commandId 已绑定 Slot S | 同 commandId、同 hash，Slot S2≠S | `COMMAND_ID_SLOT_CONFLICT` |
| Slot S 已绑定 commandId C | 同 Slot，另一个 commandId C2 | `SLOT_IDENTITY_CONFLICT` |

三者全部：

```text
append = 0
force  = 0
apply  = 0
producer state unchanged
all durable indexes unchanged
```

当前 `IdentityIndex` 已把复合优先级写成可执行决策：已知 commandId 先比较 Slot，Slot 不同立即是 `COMMAND_ID_SLOT_CONFLICT`；Slot 相同再比较 payloadHash，hash 不同是 `COMMAND_ID_PAYLOAD_CONFLICT`；commandId 未知但 Slot 已知才是 `SLOT_IDENTITY_CONFLICT`；两边完全一致才重放 duplicate。

已知旧 epoch commandId 若换 payload，仍先得到 identity conflict，而不是用 `PRODUCER_EPOCH_FENCED` 隐藏篡改；因为 known binding/conflict 在 epoch 状态机之前。

## sequence gap 不能通过“记住最大值”跨过去

同一 producer 当前 epoch 保存唯一 next expected sequence。假设 next=4：

| 提交 sequence | identity 是否已知 | 结果 |
| ---: | --- | --- |
| 4 | 新 | 允许进入 append path |
| 5 或更大 | 新 | `PRODUCER_SEQUENCE_GAP` |
| 1..3 | exact known | `DUPLICATE_REPLAYED` |
| 1..3 | 不同 commandId | `SLOT_IDENTITY_CONFLICT` |

gap rejection 绝不能把 next 从 4 推到 6。若这么做，sequence 4 永远无法提交，日志中出现生产者不可解释的空洞。

这里没有第三种“unknown empty stale slot”。M08 同时要求 sequence 从 1 严格连续、每个已通过位置永久写入双向 binding、索引不淘汰，因此 next 之前的每个 slot 必然已知。`PRODUCER_SEQUENCE_STALE` 可以作为未来引入索引淘汰后的保留协议码，但本单元不能为了凑 coverage 伪造不可达 witness。

## epoch 切换只接受 sequence 1

更高 epoch 可以跳号，例如从 epoch 7 直接切到 12，但新 epoch 第一条必须是 sequence 1：

```text
epoch > current && sequence == 1  → candidate new owner
epoch > current && sequence != 1  → PRODUCER_EPOCH_MUST_START_AT_ONE
```

成功 journal/apply epoch 12 sequence 1 后，epoch 7 中从未见过的 Slot 全部被 fence：

```text
old epoch, exact known binding → DUPLICATE_REPLAYED
old epoch, unknown command/slot → PRODUCER_EPOCH_FENCED
```

这两行必须同时成立。若先做 epoch fence，合法旧 retry 丢失原结果；若允许 old unknown，新旧 producer 可交错写入同一有序域。

更高 epoch 的 sequence 1 也不能仅在内存中“宣布所有权”后再写 WAL。只有该命令经过 append→force→apply，恢复才能知道 epoch 已切换；失败前所有 producer state 保持旧值。

## 一条时间线串起 replay、gap 与 fence

假设 producer P、shard 1：

| step | epoch/seq | commandId | 结果 | next state |
| ---: | --- | --- | --- | --- |
| 1 | 3/1 | A | new durably applied | epoch3 next2 |
| 2 | 3/3 | C | `PRODUCER_SEQUENCE_GAP` | epoch3 next2 |
| 3 | 3/2 | B | new durably applied | epoch3 next3 |
| 4 | 8/2 | X | `PRODUCER_EPOCH_MUST_START_AT_ONE` | epoch3 next3 |
| 5 | 8/1 | D | new durably applied | epoch8 next2 |
| 6 | 3/1 | A exact | `DUPLICATE_REPLAYED` | epoch8 next2 |
| 7 | 3/3 | C unknown | `PRODUCER_EPOCH_FENCED` | epoch8 next2 |

step 2 的 gap 没占 Slot，因此 step 7 的 C 即便 commandId 曾在被拒请求里出现，也不是 durable known binding。preflight rejection 不进入 WAL/index；切 epoch 后它是 old unknown。

## original result 不能按当前状态重算

第一次 command A 可能得到：

```text
ApplicationSequence=41
PlaceRejected(MARKET_NOT_OPEN)
marketMode=HALTED
```

之后市场重开。exact retry A 仍必须返回原始 HALTED rejection，而不是把 payload 重新 apply 后成功下单。result index 因而保存/可重建原始事件、context/positions 与 semantic digest。

它不需要为 A 保存整本 `bookAfter`：恢复从 genesis 重放所有 record 可以重建当前 book；duplicate ACK 只需原始命令结果合同。WAL 也只存 command，不双写 result snapshot。

## epoch fence 不是集群 leader fence

M08 的 producer epoch 只保护一个本地 runtime 的 command slot ownership。它不证明：

- 网络中只有一个 leader；
- Aeron/Raft term 已复制到 quorum；
- 旧进程无法访问共享磁盘；
- 多 shard 路由一致；
- 外部副作用 exactly-once。

目录独占锁阻止两个本地 writer 同时打开同一 WAL；producer epoch 解决命令流代际。三节点选主与 quorum fence 属于后续集群单元，不能借用相同词汇提前声称。

## 已完成的本地验证入口

固定与生成场景已经逐项观察 exact replay 的 append/force/apply count、三类 conflict、gap、stale slot 的 binding-precedence、higher/old epoch 和 restart 后相同结果：

```bash
./gradlew clean build --no-daemon
./gradlew m08Check --no-daemon
```

complete gate 的独立 identity model 与第三 durability ledger 在 96×48=4,608 个边界上逐步对照 WAL position、ApplicationSequence、原始 duplicate result 与 semantic digest；24/24 obligations 都有具体 witness。`PRODUCER_SEQUENCE_STALE` 仍是无直接 witness 的保留码，因为 permanent binding 会先把旧 slot 分成 exact duplicate 或 slot conflict。

网页只读取发布后的静态 binding history；它不运行文件 I/O，也不充当权威索引。

## 本篇停止点

现在 commandId、Slot 与 payloadHash 形成双向 durable identity；exact old retry 先于 epoch fence，冲突/gap 不越过，stale slot 由永久 binding 先分类，higher epoch 必须从 1 开始。调用方在 unknown outcome 后有了唯一安全重试方式。

下一篇把这套索引放进 M08W1 分段 WAL，说明 rollover 的 directory force、genesis replay，以及只有哪一种最后尾部损坏可以截断。
