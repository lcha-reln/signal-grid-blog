---
title: "M09·03：证明 Snapshot 加连续 WAL suffix 等价于 genesis replay"
description: "从 Snapshot anchor、旧或 crossing segment 到 cut+1 suffix，建立逐条一次 apply、完整 identity/result 恢复和三方 semantic equivalence。"
date: 2026-09-01T09:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 30
permalink: snapshot-suffix-recovery-equivalence
tags:
  - 撮合引擎
  - Snapshot Recovery
  - WAL Replay
draft: true
---

> 教程草稿：annotated [`course/m09-start`](https://github.com/lcha-reln/cex-matching/tree/course/m09-start) 冻结了等价命题和反例输入；正文按实现审查 HEAD `c26a613` 校准，其中 `8f6a357` 加入主体恢复路径，当前 HEAD 又把双重 hard budget 延伸到 recovery scan。当前没有 complete tag、最终 judge 报告、manifest 或通过数字。

Snapshot 的价值不是“启动时少读几个文件”，而是合法替换 genesis replay 的起点。若 included record 被 apply 两次、suffix 第一条被跳过，或 Snapshot 只恢复 book 而漏掉 original duplicate result，进程可能仍能启动，却已不再是原来的状态机。

M09 要证明的核心等式是：

```text
restore(complete M09S1 Snapshot @ S)
+ replay(continuous M08W1 records with walSequence > S)
== genesisReplay(all durable M08W1 records through the same terminal point)
```

这里的等号比较 semantic state、sequence、fence、durable identity 和后续命令结果，不比较 Snapshot generation 名称、目录路径或 segment 布局。

## anchor 不是一个模糊时间戳

`SnapshotAnchor` 冻结四个正交身份：

```text
generation
shardId
lastWalSequence = S
lastApplicationSequence = A
```

当前 M08 对每条 durable business command 恰好写一条 WAL record，并让 ApplicationSequence 推进一次，所以正常 history 中 `S` 与 `A` 同步增长。但它们仍是不同 owner 的字段：WAL sequence 约束持久记录位置，ApplicationSequence 约束 core apply 边界。

`LocalRuntimeStateImage` 会交叉检查：

- core 的 next ApplicationSequence 等于 `A+1`；
- identity binding history 的最后 WAL/Application position 等于 `S/A`；
- Snapshot filename 的 cut 与 header anchor 一致；
- Snapshot shard 与打开 runtime 的配置一致。

不能用 wall clock、文件修改时间或“最后一个看起来像命令的 frame”猜 cut。

## recovery 分成 install 与 replay 两个阶段

fresh `LocalMatchingRuntime.open` 的顺序是：

```text
acquire exclusive WAL-directory lock
→ discover + validate latest M09S1 final Snapshot
→ discover final M08W1 segment chain
→ validate chain and collect only records after cut
→ install complete matching/identity state from Snapshot
→ replay collected suffix records in exact order
→ only then enter OPEN
```

Snapshot install 不产生业务事件，也不推进任何 sequence。它通过：

- `SingleInstrumentMatchingEngine.restore(MatchingStateImage)` 重建 control、order registry 与 price levels；
- `MatchingCoreCommandApplier.restore(CommandApplierState)` 恢复 transcript，并重新计算 semantic digest；
- `IdentityIndex.restore(IdentityBindingImage[])` 重建双向 binding 与 producer cursor。

随后 replay 才对 `S+1...T` 调用 production command applier，并在每条边界核对 expected ApplicationSequence、canonical identity 和 result position。

当前审查 HEAD 还在扫描阶段维护一份 `RecoveryUsage`。每看见下一条待 replay record，先用完整 encoded record length 检查 records+bytes 双重预算；整条 suffix 扫描成功后，`LocalMatchingRuntime.recover` 才开始 apply。若第 65 条或 byte 累加会越界，open 直接抛 `RecoveryException`，不会留下“前 64 条已经 apply、最后一条才失败”的半恢复 core。

没有 Snapshot 时，M09 finite config 会把 genesis WAL 全部视为待 replay history，因此同样受 hard budget。一个由旧 unbounded 配置写出的超长目录不能靠切换 `snapshotDefaults` 自动升级；它需要显式迁移/检查点方案，而通用格式与在线迁移明确排除在 M09 之外。

## 恢复可以从三种 WAL 形态出发

Snapshot 发布并不要求 WAL 立即被切成漂亮的 suffix 文件。合法目录至少有三种形态。

### 形态一：旧 segment 完整跨过 cut

```text
Snapshot cut = 120
segment 7 header firstWalSequence = 101
segment 7 records = 101 ... 128
```

recovery 必须完整扫描并验证 `101...120`，但不 apply；只把 `121...128` 作为 suffix。这使 snapshot-directory force 后、rollover 前的 crash 可恢复。

### 形态二：旧 prefix + header-only cut+1 segment

```text
segment 7 records = ... 120
segment 8 header firstWalSequence = 121
segment 8 has no records
```

empty suffix 是合法状态。header-only final segment 不是 torn record，也不能被删除后创建一个猜测的 active file。

### 形态三：suffix 跨越多个 segment

```text
segment 8 records = 121 ... 140
segment 9 records = 141 ... 160
```

segmentId 与 WAL sequence 都必须连续；record 不能因 rollover 而丢失或重复。M09 不要求 suffix 全放在一个 segment，也不为恢复方便做 record compaction。

## 旧 prefix 可以被验证后忽略，不能未经验证跳过

当第一份保留 segment 从 cut 之前开始，`SegmentedWal` 仍会验证其中的：

- header magic/version/CRC、shard、segmentId 与 firstWalSequence；
- 每条 record length、CRC32C 与 WAL sequence；
- `walSequence <= S` 的 M08C1 envelope canonical bytes 与 shard；
- crossing record 的 application position；
- segment chain 是否连续并最终到达 Snapshot anchor。

对 `>S` 的 record，scanner 还要在读取并加入 replay list 时累计 RecoveryBudget；旧的 `<=S` bytes 需要完整验证，但不计入 Snapshot suffix budget。

验证这些旧 record 不是为了重演业务，而是为了证明“Snapshot 所声称的 cut 确实被当前 WAL chain 覆盖”。若第一份 segment 从 `S+2` 开始，或整条 chain 连 `S` 都没有到达，recovery 必须 fail closed。

这也解释了为什么目录中有 Snapshot 不等于可以随便删日志：Snapshot 与 WAL anchor 必须能组成一条连续、可验证的恢复路径。

## cut record 必须恰好零次 replay

Snapshot@S 已经包含 command S apply 后的全部状态，包括：

- next sequence；
- terminal order tombstone；
- RuleSet/mode fence；
- identity binding；
- original canonical result；
- transcript 与 semantic digest。

若 recovery 又 apply record S，一条 Mass Cancel 可能再次遍历，Activate 可能遇到 stale fence，Place 可能变成 duplicate orderId。即使 identity index 恰好把它拦成 duplicate，也不能用幂等层掩盖恢复游标错误：durable record replay 本身必须从 `S+1` 开始。

当前 `recoverSegment` 对所有 `walSequence <= S` 的 record 只做验证，不加入 `recoveredRecords`；`LocalMatchingRuntime.recover` 只遍历收集出的 `>S` suffix。这是结构上的 exactly-once，不是依赖业务命令碰巧幂等。

## 第一条 suffix 也不能被跳过

若 `S+1` 是一条业务 Reject，跳过它可能暂时不改变盘口，但会改变：

- next ApplicationSequence；
- producer next sequence；
- commandId/Slot binding；
- original duplicate result；
- transcript digest；
- 后续 Activate/ChangeMode 的 expected fence。

因此“最终 book 相同”不是等价判据。第一条保留 segment 的 header 若声称从 `S+2` 开始，或 record chain 中间出现 gap，runtime 不能扫描到下一条合法 frame 后继续。

完整 frame 的 CRC/hash/codec/identity failure 也不能当 torn tail 截掉。M08 的窄 torn-tail 修复规则仍然适用：只允许 final segment 最后一条**不完整** frame 截断并 force；完整 bytes 的任何校验失败都属于 corruption。

## identity history 为什么可以越过已删除 WAL

Snapshot 内的 `IdentityBindingImage[]` 保存从 WAL 1 到 cut S 的全部 durable identity 与 original result，包括它们当时的 segment position。即使旧 segment 后续被安全删除：

- exact duplicate 仍能返回原结果；
- commandId/Slot conflict 仍能按原 precedence 拒绝；
- producer epoch/sequence cursor 仍能从完整 binding history 重建；
- terminal order identity 不会因日志回收而消失。

suffix replay 只追加 `S+1...` 的新 binding。恢复后两份索引仍然是一条从 genesis 连续到 terminal point 的逻辑历史，而不是“Snapshot 之后才开始认识 commandId”。

这个选择让 Snapshot 体积随 durable identity 历史增长；M09 没有引入幂等索引 TTL、producer tombstone GC 或业务时间淘汰。那是未来独立复杂度，不能偷偷塞进 recovery 单元。

## 用一个具体时间线检查 off-by-one

假设：

```text
Snapshot generation = 3
lastWalSequence      = 6
lastApplication      = 6
suffix records       = 7, 8
```

恢复必须满足：

| 观察 | Snapshot install 后 | replay 7 后 | replay 8 后 |
| --- | ---: | ---: | ---: |
| next WAL position | 7 | 8 | 9 |
| next ApplicationSequence | 7 | 8 | 9 |
| record 6 apply count | 0 | 0 | 0 |
| record 7 apply count | 0 | 1 | 1 |
| record 8 apply count | 0 | 0 | 1 |

然后提交 record 8 的 exact retry，应返回它第一次的 position/result，且 append、force、apply 均不再发生。提交一条新 sequence 9，才会产生新的 WAL record 与 application result。

## semantic equivalence 需要三条独立观察路径

完成门禁不能只比较 production codec round trip。冻结 RED 要求最终至少有：

1. **genesis path**：保留完整 durable history，从 M08W1 record 1 开始重放；
2. **independent semantic model**：不解析 production Snapshot bytes，按抽象 operation 维护期望状态；
3. **Snapshot path**：读取真实 M09S1 文件，安装 state，再重放真实 M08W1 suffix。

每个 operation boundary 都应比较：

- book 与全量 order lifecycle；
- RuleSet、mode 与 control fence；
- next WAL/Application/Acceptance sequence；
- identity/producer cursor 与 original result；
- transcript/semantic digest；
- 紧接着的 canonical command result。

production encoder 与 decoder 同意只能说明内部 round trip。独立 model 若复用 production state image、codec 或 recovery selector，也会失去反对共同缺陷的能力。

## 没有 Snapshot 时的边界

fresh directory 没有 Snapshot 时，M08 genesis recovery 仍可用，但第一份 WAL segment 必须从 segment 1、WAL sequence 1 开始。若 prefix 已经删除，又没有一份完整有效的 published Snapshot 覆盖缺口，runtime 必须 fail closed。

它不能：

- 创建一个空 book；
- 使用 bootstrap RuleSet 与默认 `OPEN`；
- 从数据库或 query projection 补状态；
- 自动忽略最新坏 Snapshot 后选择旧 generation；
- 跳到最早仍存在的 WAL record 继续。

## 当前实现与完成证据之间的距离

实现基线已经包含 codec round trip、Snapshot+suffix 与 genesis 的 focused tests，以及 suffix read fault seam；这些是代码审查入口，不是最终课程 evidence。

`course/m09-start` 冻结的 `SNAPSHOT_SUFFIX_EQUALS_GENESIS_REPLAY`、`EMPTY_SUFFIX_RECOVERY`、`MULTI_SEGMENT_SUFFIX_RECOVERY` 和两个 cut mutants 仍需由完成 judge、独立模型、fresh runtime 与结构化报告共同收口。当前草稿不写 PASS 比例、complete commit 或 manifest hash。

## 本篇停止点

现在恢复等式已经精确到每条 record：Snapshot 安装 cut S 的完整状态，旧或 crossing WAL 可被完整验证，只有连续 `S+1...` suffix 各 apply 一次；最终结果必须与同一 durable history 的 genesis replay 等价。

下一篇解决恢复工作量和磁盘所有权：怎样用 records+bytes 双重 RecoveryBudget 在 WAL mutation 前阻止越界，以及何时才允许删除被 Snapshot 覆盖的 whole segment。
