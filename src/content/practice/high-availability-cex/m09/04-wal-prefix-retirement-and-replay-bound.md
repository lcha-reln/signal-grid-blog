---
title: "M09·04：在双重 RecoveryBudget 内安全回收 WAL 前缀"
description: "冻结 64 records 与 1,048,576 encoded bytes 的 pre-WAL 上限，分离 Snapshot 发布、cut+1 rollover、两代保留和 whole-segment retirement。"
date: 2026-09-01T09:40:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 40
permalink: wal-prefix-retirement-and-replay-bound
tags:
  - 撮合引擎
  - WAL Retention
  - Recovery Budget
draft: true
---

> 教程草稿：annotated [`course/m09-start`](https://github.com/lcha-reln/cex-matching/tree/course/m09-start) 已冻结 RecoveryBudget 和 retention RED，正文按实现审查 HEAD `c26a613` 校准；`8f6a357` 加入主体机制，当前 HEAD 又补齐 recovery-scan hard budget。这里的数值是输入合同，不是已测得的性能、RTO 或完成结果。

有 Snapshot 不等于恢复工作量有界。如果 suffix 可以无限增长，启动仍可能重放任意多 record；如果为了缩短恢复直接删除旧 WAL，又可能在 Snapshot 或 namespace 尚未可靠时删掉唯一权威历史。

M09 把这两个风险放在同一个单轴内，但用两条独立规则解决：

1. **RecoveryBudget** 在下一条 WAL mutation 前限制 suffix records 与 bytes；
2. **whole-segment retirement** 只在 Snapshot 已发布、WAL 恢复起点 durable、且目录删除可持久证明后回收被完整覆盖的 closed segment。

## 双重预算的精确定义

冻结配置为：

```text
maxSuffixRecords = 64
maxSuffixBytes   = 1_048_576
```

records 从 latest published Snapshot cut 之后第一条 WAL record 开始计数；bytes 累加完整 M08W1 encoded record length，包含 framing overhead 与 M08C1 envelope，而不是只统计业务 payload。

接受下一条新 record 的条件是：

```text
currentSuffixRecords + 1 <= maxSuffixRecords
and
currentSuffixBytes + nextEncodedRecordBytes <= maxSuffixBytes
```

等于上限仍是合法 terminal budget 状态；**下一条会让任一维度超过上限时**才必须被拒绝。这一区分可以避免 off-by-one，也避免“达到 64 后又偷偷写第 65 条”。

两维缺一不可：只数 record 会让一条超大 command 绕过工作量约束，只数 bytes 又无法限制大量很小 record 的 per-record decode/apply 成本。

## 检查必须发生在 WAL mutation 前

`LocalMatchingRuntime.submit` 的相关顺序是：

```text
decode canonical envelope
→ validate size/support
→ durable identity preflight
→ RecoveryBudget preflight
→ WAL append + force
→ core apply + identity commit
→ ACK
```

预算不足时返回 `SubmissionResult.CheckpointRequired`，其中带当前 suffix records/bytes 和配置上限；此时：

- 不 append record；
- 不 force WAL；
- 不 apply core；
- 不推进 WAL/Application/producer sequence；
- runtime 仍可保持 `OPEN`，等待调用方显式执行 `checkpoint()`。

当前实现不会在 `submit` 内偷偷自动 checkpoint。自动维护策略、后台线程和延迟调度会新增并发与错误语义，不属于 M09。

## 哪些请求会消耗预算

| 输入结果 | 是否产生新 WAL record | 是否消耗 suffix budget |
| --- | --- | --- |
| structural invalid | 否 | 否 |
| identity conflict/gap/fenced epoch | 否 | 否 |
| exact duplicate | 否 | 否 |
| 新命令的业务 Accepted | 是 | 是 |
| 新命令的业务 Reject | 是 | 是 |

exact duplicate 在 budget preflight 前就由 durable identity index 命中，返回 original result，不需要为“只是查询旧结果”强迫 checkpoint。业务 Reject 则是新 durable command，拥有 Slot/ApplicationSequence/original result，必须计入预算。

若 canonical envelope 本身超过 M08W1 record capacity，错误仍是结构性 size rejection，而不是 `CHECKPOINT_REQUIRED`；扩大 recovery budget 也不能让非法 record 变合法。

## hard budget 同样约束 fresh recovery

只在 live append 检查预算仍有一个漏洞：旧版本或旧配置可能已经留下超长 WAL，fresh runtime 若边扫描边 apply，到第 65 条才发现越界，就会构造一份半恢复状态。

当前审查 HEAD `c26a613` 在 `SegmentedWal` recovery scan 中加入 `RecoveryUsage`：

```text
discover Snapshot cut S
→ scan retained WAL in sequence order
→ for each record > S:
     require records+1 <= 64
     require bytes+recordLength <= 1_048_576
→ only after the complete scan succeeds, install/replay suffix
```

任一维度越界时抛 `RecoveryException`，而 `LocalMatchingRuntime.recover()` 尚未 apply 任何 suffix record。旧/crossing segment 中 `<=S` 的 record 仍要验证 CRC、canonical bytes 与 sequence，但不计入 suffix budget。

若目录没有 Snapshot，整个 genesis WAL 都是待 replay history，因此 finite M09 config 也会拒绝超预算的 legacy log。这不是 N/N-1 migration：M09 选择 fail closed，不自动生成 Snapshot、不按前 64 条启动，也不放宽 hard bound。

## checkpoint 是一次同步维护事务，但包含多个资格

当前 `checkpoint()` 的顺序可简化为：

```text
1. capture complete applied LocalRuntimeStateImage @ S
2. publish M09S1 final:
   temp write → file force → read-back → atomic rename → snapshot-dir force
3. if needed, force rollover to active M08W1 header(firstWalSequence=S+1)
4. retain latest two immutable Snapshot generations
5. choose protected older Snapshot cut
6. delete only closed segments fully covered by that protected cut
7. force WAL directory after deletions
8. reset in-memory suffix records/bytes to zero
```

第 2 步完成时 Snapshot 已经发布；第 3 步是进入删除前缀之前的条件。若在两者之间 crash，latest Snapshot + 完整 old/crossing WAL 仍可恢复，前一篇已证明这一点。

只有整个 `checkpoint()` 正常返回后，当前实例才把 suffix counters 归零。中途 I/O failure 会让实例 fail closed；fresh open 根据实际 latest Snapshot 和实际 suffix 重新计算 counters，不能信任旧进程内存中的维护进度。

## 为什么先形成 cut+1 durable active header

如果旧 active segment 同时包含 cut 前和 cut 后 record，它是 crossing segment，不能删除。若 cut 正好位于 active segment 尾部，rollover 会创建：

```text
segment-(N+1).m08w1
firstWalSequence = S + 1
```

新 header 经过 temp write、file force、atomic rename 与 WAL-directory force 后，即使 suffix 为空，也有一条 durable segment chain 声明精确下一 WAL position。

这一步服务的是“删掉旧 closed segment 后还能从哪里继续”。它不参与 M09S1 final 的发布资格，也不创建第二份 Snapshot descriptor。

若当前 active segment 已经是 header-only 且起点正好为 cut+1，重复 rollover 没有新增安全价值，当前实现会保留它。

## 当前实现为什么保留两个 Snapshot generation

`SnapshotStore` 使用 immutable generation，并在每次 checkpoint 后保留 latest 与 previous 两份 final Snapshot。超过两份时，先删除更旧 Snapshot，再 force snapshot directory。

但 recovery 始终选择 latest final；previous 不是自动 fallback。最新 generation 若 corruption、unknown version、wrong shard 或 anchor mismatch，runtime 仍 fail closed。

两代保留还让 WAL deletion 更保守：

```text
generation G-1 cut = P   (protected older)
generation G   cut = S   (latest authority, S >= P)

prune closed WAL only through P
```

第一次 checkpoint 只有一代，返回 protected cut 0，不删 WAL。第二次有两代，最多删到较老 generation 的 cut。第三次先保留最新两代，再把 protection 前移到新的 previous cut。

这是一种实现策略，不是 M09 的通用多版本恢复协议；它也不授权从坏 latest 自动选 previous。

## whole segment 的删除资格

每个候选 M08W1 segment 必须同时满足：

```text
segment is final and closed
segmentId != activeSegmentId
every frame is complete and valid
greatestWalSequence <= protectedSnapshotCut
```

删除前，runtime 会重新扫描 closed segment 的 header、record boundary、CRC、WAL sequence 与 canonical M08C1 envelope。即使 record CRC 被重新计算，内部 envelope 非 canonical 仍会阻止 retirement。不能因为 Snapshot 已存在就把未验证的旧 bytes 当垃圾。

以下对象永远不能在 M09 中为了省空间被处理：

- active segment；
- 横跨 protected cut 的 crossing segment；
- 只被 latest、尚未被 protected previous 完整覆盖的 segment；
- 任何包含 corruption 或 incomplete non-final frame 的 segment；
- 单个 segment 内 cut 前的部分 records。

M09 只删除 whole segment，不做 record compaction，也不重写 crossing segment。

## 一次具体的 generation/segment 推演

假设目录经历：

```text
G1 cut = 40
G2 cut = 75
G3 cut = 110

segment 1 = WAL 1...32
segment 2 = WAL 33...64
segment 3 = WAL 65...96
segment 4 = WAL 97...110
segment 5 = header-only, firstWal=111
```

发布 G2 后，保留 G1/G2，protected cut 是 40：segment 1 可删；segment 2 crossing 40，必须留。

发布 G3 后，先删除 Snapshot G1 并 force snapshot directory，保留 G2/G3；protected cut 前移到 75：segment 2 现在完全覆盖，可删；segment 3 crossing 75，仍保留。

即使 G3 cut 已经到 110，也不会在这一步直接删 segment 3/4，因为当前实现按 previous generation 保守推进保护边界。

## 删除后的 directory force 不是装饰

`Files.delete` 正常返回，只说明当前进程 namespace 已看不到文件，不等于删除在 crash 后必定保留。M09 的顺序是：

```text
delete eligible closed segment(s)
→ force WAL parent directory
→ only then report retention completion
```

crash 发生在 first delete 后、directory force 前，重新打开时可能看到删除已保留，也可能看到被删 segment 重现。两种观察都必须安全：

- reappearing covered segment 经过完整验证后可作为冗余忽略；
- missing covered segment 由 already-published Snapshot 覆盖；
- active/crossing/uncovered segment 从未获得删除资格；
- 如果缺失 prefix 没有 valid published Snapshot 覆盖，直接 fail closed。

directory force 失败后，当前实例不能继续接受命令或宣称 retirement 成功。fresh open 再以实际目录状态判断。

## latest corruption 不能用旧代掩盖

保留 previous Snapshot 和旧 prefix 容易诱发一个错误优化：latest final 坏了就试上一代。M09 明确禁止自动 fallback，因为：

1. 无法仅凭文件存在证明 previous 所需 suffix 仍完整；
2. fallback 可能丢失 latest cut 之后已经 durable/ACK 的命令；
3. 自动修复会把明确 corruption 变成不可见数据回退。

因此 selection 规则始终是：highest final generation 完整有效，或 fail closed。previous generation 和 reappearing WAL 是保守 retention 的物理事实，不是第二恢复真相。

## RecoveryBudget 不是恢复时间 SLA

`64 records / 1,048,576 encoded bytes` 只给出一个有限 replay work bound。它没有测量：

- Snapshot decode 时间；
- 单条命令 apply 复杂度；
- page cache、磁盘或 CPU 抖动；
- p50/p99 recovery latency；
- 真实订单/identity 规模下的 Snapshot 文件大小；
- checkpoint 对 caller 的暂停时间。

尤其当前 Snapshot 是同步、quiescent 的，状态越大，checkpoint 暂停越长。性能资格在 M10；不能从结构上有界推导毫秒级 RTO。

## 本地审查时抓住四个断言

在 completion evidence 形成前，可以先逐项审查实现：

1. `RecoveryBudget.accepts` 对 records 和 bytes 都用 `<=`，且 overflow fail closed；
2. `submit` 在 `wal.append` 前返回 `CheckpointRequired`；
3. recovery scan 在任何 suffix apply 前以同一 records+bytes hard bound 拒绝越界目录；
4. `checkpoint` 在 Snapshot directory force 后才 rollover，并在 rollover 后才 prune；
5. `pruneClosedSegmentsThrough` 跳过 active/crossing segment，删除后 force WAL directory。

冻结 RED 中的 `RECOVERY_BUDGET_REJECTS_PRE_WAL`、`RETIRE_ONLY_FULLY_COVERED_SEGMENTS`、`RETIREMENT_DELETE_CRASH_WINDOW` 等 scenario 仍是待执行输入，不是当前草稿可写成 PASS 的 evidence。

## 本篇停止点

M09 现在既限制了 suffix 的 record/encoded-byte 工作量，也把磁盘所有权转移拆成可证明步骤：Snapshot 先独立发布，cut+1 WAL 起点随后 durable，两个 generation 保守保护，最后只回收完全覆盖的 closed segment 并 force 目录。

最后一篇把这些主张变成裁判合同：什么由 fixed/generated history 反对，什么由 durability ledger 观察，什么只能称 code-level injection 或 process crash，而不能冒充真实断电和商用高可用。
