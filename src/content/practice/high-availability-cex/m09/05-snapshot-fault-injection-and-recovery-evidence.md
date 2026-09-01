---
title: "M09·05：用独立模型与故障窗口验证 Snapshot 恢复"
description: "把完整 state cut、M09S1 publication、suffix equivalence、双重预算和 whole-segment retirement 拆成 fixed/generated history、独立模型、文件账本与 semantic mutants。"
date: 2026-09-01T09:50:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 50
permalink: snapshot-fault-injection-and-recovery-evidence
tags:
  - 撮合引擎
  - 故障注入
  - Release Evidence
draft: true
---

> 教程草稿：annotated [`course/m09-start`](https://github.com/lcha-reln/cex-matching/tree/course/m09-start) 已冻结 RED 输入，当前正文按实现审查 HEAD `c26a613` 校准；`8f6a357` 加入主体 Snapshot/recovery，当前 HEAD 又补齐 recovery-scan hard budget。以下数量描述 corpus/profile 的**计划形状**，不表示已通过；M09 尚无 complete tag、完成 manifest、artifact hash 或公开 evidence。

Snapshot happy path 很容易自证：保存、重启、看到相同盘口。很多危险实现也能通过这个测试——遗漏 `HALTED`、included record 重放一次、suffix 跳过一条业务 Reject、rename 后未 force 目录就选择 Snapshot，或在 cut+1 WAL 起点尚未 durable 时删除旧 segment。

真正的证据体系必须能回答两个问题：

1. production 若违反一条冻结不变量，裁判能否给出一个最小、可重放的 semantic counterexample？
2. harness、reference、fixture 或环境自己坏掉时，系统能否拒绝把意外异常算成“杀死 mutant”？

M09 的证据结论是：**fixed/generated operation history、独立 semantic model、真实 Snapshot/WAL durability ledger 与 executable mutants 必须四方闭合；code-level injection、child-process crash 和真实 power loss 必须分层陈述。**

## 先把主张拆成可观察事实

一个总的 `PASS=true` 不能替代下面这些独立 claim：

| claim | 最少要观察什么 |
| --- | --- |
| complete state cut | order lifecycle、FIFO、RuleSet、mode/fence、identity/result、sequence、digest |
| Snapshot publication | temp/file force/rename/snapshot-directory force 与 latest selection |
| suffix equivalence | Snapshot install、cut record 零次 apply、S+1 连续 replay、genesis/model terminal equality |
| recovery budget | records、encoded bytes、pre-WAL rejection、fresh scan 越界时零 suffix apply |
| prefix retirement | protected cut、active/crossing retention、delete、WAL-directory force |
| fail closed | unknown version、corruption、identity mismatch、gap、missing authority 不进入 OPEN |
| scope boundary | 无 Aeron、复制、网络、数据库恢复、后台 Snapshot 与性能资格 |

每条 claim 还需要 limitations。比如“目录 seam 顺序正确”不等于“所有文件系统断电一致”，“suffix 最多 64 条”也不等于“恢复必定低于某个毫秒值”。

## 冻结 RED 是输入，不是完成报告

`course/m09-start` 将 M09 从口头计划变成可机器检查的 RED：

```text
22 fixed scenarios
repository-owned SplitMix64 profile, base seed 5909
96 histories × 40 operations
4 named lanes
32 coverage obligations
7 process-crash windows
8 deterministic failure seams
12 required semantic mutants
5 tutorial permalinks
```

这些数值只说明评测空间已被冻结，防止实现完成后临时挑容易样例。它们不证明穷尽、形式正确性、真实故障覆盖或任何通过比例。

start ref 上运行：

```bash
git switch --detach course/m09-start
./gradlew m09Check --no-daemon
```

应生成 schema-valid 的 `GOAL_NOT_IMPLEMENTED` RED 并非零退出。这个失败是课程起点合同，不是系统故障，也不能当 completion evidence。

若读者想审查当前实现而非冻结起点，可以本地切到实现审查基线并运行普通构建：

```bash
git switch --detach c26a613
./gradlew clean build --no-daemon
```

本文不声称该命令已经等价于最终 `m09Check`；完成 judge、counterexample artifacts、clean-tag binding 与静态 evidence 仍需另行收口。

## fixed corpus 用业务反例而不是 API 行覆盖

冻结的 fixed scenarios 可以按五条论证链分组。

### 完整 state image

- `FULL_CORE_STATE_ROUND_TRIP`
- `TERMINAL_ORDER_NON_RESURRECTION`
- `DURABLE_IDENTITY_AND_ORIGINAL_RESULT_ROUND_TRIP`
- `RULE_SET_AND_ACTIVATION_FENCE_ROUND_TRIP`
- `CANCEL_ONLY_MODE_ROUND_TRIP`
- `HALTED_MASS_CANCEL_FENCE_ROUND_TRIP`
- `TRANSCRIPT_AND_DIGEST_ROUND_TRIP`

这些场景不能只比较 book depth。每个都要在恢复后提交能暴露遗漏字段的命令：复用 terminal orderId、exact duplicate/conflict、Activate prepared RuleSet、在 `CANCEL_ONLY` 下 Place，或读取 Mass Cancel fence attribution。

### Snapshot + suffix 等价

- `SNAPSHOT_SUFFIX_EQUALS_GENESIS_REPLAY`
- `EMPTY_SUFFIX_RECOVERY`
- `MULTI_SEGMENT_SUFFIX_RECOVERY`

它们分别约束普通 suffix、header-only cut+1 空 suffix，以及跨 segment replay。观察必须包含每条 operation boundary，不能只在最后比较一次 digest。

### publication 与 latest selection

- `ORPHAN_TEMP_SNAPSHOT_IS_NOT_AUTHORITY`
- `SNAPSHOT_PUBLICATION_ORDER`
- `NEWEST_PUBLISHED_GENERATION_WINS`
- `UNKNOWN_SNAPSHOT_VERSION_FAILS_CLOSED`
- `SNAPSHOT_CORRUPTION_FAILS_CLOSED`
- `SNAPSHOT_IDENTITY_MISMATCH_FAILS_CLOSED`

这里必须保留第二篇的关键语义：snapshot-directory force 后 generation 已发布；rollover 只决定能否退休旧前缀。latest invalid 失败关闭，不自动选 previous。

### budget 与 retention

- `RECOVERY_BUDGET_REJECTS_PRE_WAL`
- `RETIRE_ONLY_FULLY_COVERED_SEGMENTS`
- `RETIREMENT_REQUIRES_PUBLISHED_SNAPSHOT`
- `RETIREMENT_DELETE_DIRECTORY_FORCE_ORDER`
- `RETIREMENT_DELETE_CRASH_WINDOW`
- `MISSING_PREFIX_WITHOUT_VALID_SNAPSHOT_FAILS_CLOSED`

预算场景要观察返回值之外的负事实：next WAL/Application/producer sequence、file size、apply count 都没有变化。retirement 场景要记录每个 final/temp Snapshot、segment header、record range、delete 与两个目录 force。

当前审查 HEAD 还增加了两条针对 legacy over-budget directory 的回归入口：一条让 record count 越界，另一条让 record 数未越界但 encoded bytes 越界。它们要求 finite recovery 在任何 suffix apply 前拒绝打开；这些 focused tests 是实现反馈，不是完成 evidence，也不会在本文提前写通过状态。

## generated history 的 operation 不只是 submit

生成器使用四条命名 lane：

| lane | 主要压力 |
| --- | --- |
| `STATE_AND_IDENTITY` | 订单终态、控制状态、duplicate/conflict |
| `CUT_AND_SUFFIX` | cut 前后、restart、empty/cross-segment suffix |
| `PUBLISH_AND_SELECTION` | temp/final、generation、corruption、latest fail closed |
| `RETIREMENT_AND_BUDGET` | records/bytes 边界、rollover、whole-segment delete |

operation domain 包含 submit、duplicate/conflict、Snapshot、restart、rollover、retire 与 crash，而不是 40 次 Place 的随机循环。每条 history 都必须使用 fresh directory、fresh runtime、fresh model 和 fresh ledger；保存 seed、lane、operation grammar 和 shrink 后最小历史。

RecoveryBudget 需要至少生成三类 witness：

```text
below limit
exactly at record or byte limit
next record would exceed either dimension
```

尤其要生成“records 很少但 bytes 越界”和“bytes 很小但 records 越界”，否则只实现一维的错误可能藏在 happy path 中。

## 三方 semantic 裁判加一份 durability ledger

最终 judge 需要三条计算路径：

```text
full M08W1 genesis replay
independent semantic model without production Snapshot parser
production M09S1 install + actual M08W1 suffix replay
```

并另设一份 recovery/durability ledger，只观察外部事实：

- temp/final Snapshot filename、generation、cut 与 file digest；
- Snapshot write、file force、rename、snapshot-directory force；
- active/crossing segment 与 cut+1 header；
- WAL record ranges、encoded bytes 与 suffix counters；
- segment delete、snapshot/WAL directory force；
- ACK/exception、runtime state、apply count；
- fresh reopen 选择 latest、replay 或 fail-closed 的原因。

independent model 不能调用 `M09SnapshotCodec.decodeCanonical`，不能复用 `MatchingStateImage.restore` 后再声称“独立”，也不能以 production 的 `semanticStateDigest()` 作为唯一期望值。ledger 则不能决定业务结果；它只证明持久顺序和合法 recovery set。

## 七个 process-crash 窗口分别要反对什么

冻结 RED 的 child JVM window 是：

| window | fresh reopen 必须回答的问题 |
| --- | --- |
| before temp write | 旧 authority 是否完整 |
| after partial temp write | orphan temp 是否被忽略并安全清理 |
| after Snapshot file force, before rename | complete temp 是否仍非权威 |
| after rename, before snapshot-directory force | 实际 namespace 如何被严格发现，是否无非法 ACK/retirement |
| after snapshot-directory force, before retention | **latest Snapshot 是否已权威，并能配完整 old/crossing WAL 恢复** |
| after first segment delete, before WAL-directory force | 删除保留或重现两种观察是否都可恢复 |
| after retirement-directory force, before return | maintenance Unknown Outcome 是否可由 fresh reopen 消解 |

child 进程用 `Runtime.halt(86)` 避开正常 shutdown，再由父进程读取真实文件并 fresh open。它能证明实现没有依赖 `close()` 才写关键 bytes，但仍不能证明 page cache、控制器或物理介质在断电时的行为。

## 八个 deterministic seam 负责精确归因

结构化 failure injection 覆盖：

```text
SNAPSHOT_TEMP_WRITE
SNAPSHOT_FILE_FORCE
SNAPSHOT_ATOMIC_RENAME
SNAPSHOT_DIRECTORY_FORCE
RETIREMENT_SEGMENT_DELETE
RETIREMENT_DIRECTORY_FORCE
SNAPSHOT_READ
WAL_SUFFIX_READ
```

seam 的价值是把失败归到准确的程序边界，并检查当前实例是否 fail closed、是否禁止后续 mutation、fresh open 是否从真实 durable state 恢复。它不模拟电源、固件、真实 ENOSPC 或特定文件系统实现。

受控注入本身也不是通过条件。若在 `SNAPSHOT_READ` 抛预期 IOException，只有当 runtime 不进入 OPEN、不删 authority、下一次无 fault reopen 仍能恢复时，场景才有语义价值。

## semantic mutant 必须制造真实分叉

冻结 mutant 分成四组：

| 错误族 | mutant |
| --- | --- |
| state omission | `M09-SNAPSHOT-DROPS-RESTING-ORDER`、`M09-SNAPSHOT-RESETS-MARKET-MODE`、`M09-SNAPSHOT-DROPS-PREPARED-RULE-SET`、`M09-SNAPSHOT-DROPS-DURABLE-IDENTITY-RESULT` |
| cut/suffix | `M09-SUFFIX-REPLAYS-CUT-RECORD`、`M09-SUFFIX-SKIPS-FIRST-RECORD` |
| selection/corruption | `M09-UNKNOWN-VERSION-ACCEPTED`、`M09-CORRUPT-SNAPSHOT-ACCEPTED`、`M09-SNAPSHOT-IDENTITY-MISMATCH-ACCEPTED` |
| retirement | `M09-RETIREMENT-BEFORE-SNAPSHOT-DIRECTORY-FORCE`、`M09-RETIREMENT-DELETES-CROSSING-SEGMENT`、`M09-GENESIS-FALLBACK-WITH-MISSING-PREFIX` |

每个 mutant 必须真的改变 state image、replay cursor、selection 或 file ownership，并由 fresh runtime strict replay 产生同一个 property fingerprint。把 candidate 直接改成 `throw new RuntimeException()` 不是语义 mutant；那只证明程序会崩。

最小 counterexample 的标准是：删除剩余 history 中任一 operation 后，不再产生同一 fingerprint。shrinker 每次尝试也要新建 runtime/model/directory，防止前一次失败污染结果。

## `STUDENT_FAILURE` 与 `SYSTEM_ERROR` 必须分开

可以归为 semantic failure 的情况是：

- production 正常运行并违反冻结 obligation；
- 反例能在 fresh runtime 重放；
- reference 与 ledger 自身都健康；
- fingerprint 明确绑定 state/file/result 差异。

以下情况只能是 `SYSTEM_ERROR`：

- fixture/schema/parser 失败；
- independent model 抛异常或复用了 production 实现；
- ledger 无法读取文件或自身算术溢出；
- shrinker 产生非法 history；
- temp directory/权限出现未计划环境故障；
- mutant/control 只是任意抛异常；
- child 没在命名 hook halt，或父进程无法确认退出原因。

`SYSTEM_ERROR` 永远不能计为 mutant kill。否则一个坏 harness 可以通过把所有 candidate 跑崩，伪装成“证据很强”。

## 静态 evidence 将来怎样公开

本站不接外部 Java 执行服务，也不登记 M09 浏览器 L2 Lab。真正的编译、真实文件 I/O、child JVM、generated history、mutation replay 与 evidence 导出由读者在本地代码仓库运行。

只有 M09 达到 `CODE_VERIFIED` 后，博客注册表才允许绑定：

- annotated complete ref 与完整 commit；
- clean/dirty 状态和环境事实；
- frozen input digests；
- claim/limitation 与 report facts；
- fixed/generated/coverage/mutant/counterexample/crash artifacts；
- 每个 artifact 的 SHA-256 和 manifest 自身 hash。

达到 `PUBLISHED` 时，五篇教程与同源静态 evidence 才能原子公开。当前五篇保持 `draft: true`，不进入 Pagefind、sitemap、RSS 或公开 lesson route；也不会先创建一个空 manifest、填占位 hash 或写不存在的 PASS 数字。

未来网页最多做静态解释：读者选择 state omission、crash point 或 suffix 形态，再查看已经发布的 authority/recovery decision。网页不会实现另一套 Snapshot codec，不写本地文件，也不把动画当裁判。

## 证据语言的最终边界

即使未来有限门禁全部闭合，也只能说：

- 在冻结的 fixed/generated corpus 中，独立模型未观察到 semantic 分叉；
- 命名 semantic mutants 被可重放反例反对；
- deterministic seam 验证了程序级 failure ordering；
- child JVM halt 验证了真实文件上的 process-crash/reopen smoke；
- RecoveryBudget 对配置的 records/bytes 有结构上限。

不能由此推出：

- 任意 history 或任意故障都已证明；
- 真实断电、控制器 cache、云盘和所有文件系统已合格；
- Snapshot pause、恢复延迟或吞吐达到生产 SLA；
- N/N-1 格式迁移、在线升级或 rollback 可用；
- Aeron、复制、leader/quorum/failover 已实现；
- 当前单机 runtime 已经高可用或 production-ready。

## 本篇停止点

M09 的五篇论证链到这里闭合：完整已 apply state cut，经 file force/atomic rename/snapshot-directory force 成为权威 Snapshot；连续 suffix 与 genesis replay 保持语义等价；records+bytes 双重预算在 WAL 前阻止越界；cut+1 WAL 起点与目录 force 保护 whole-segment retirement；独立 model、ledger、fault window 与 mutant 负责反对错误实现。

但当前交付仍是教程草稿和实现审查阶段，不是完成 evidence。M09 继续停在单进程、单 shard、caller-serialized 的本地恢复边界；复制、高可用、性能和格式演进留给后续单元逐轴增加。
