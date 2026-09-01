---
title: "M09·05：用存储账本与故障窗口验证 Snapshot 恢复"
description: "把完整 state cut、M09S1 publication、suffix equivalence、双重预算和 whole-segment retirement 拆成 fixed/generated history、retained-genesis runtime、独立 no-I/O storage ledger 与 executable candidates。"
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
draft: false
---

> 完成身份：annotated [`course/m09-start`](https://github.com/lcha-reln/cex-matching/tree/course/m09-start) 冻结 RED 输入；annotated [`course/m09-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m09-complete) peeled 到 `147a7e7dd2439764d4a5fe4d1048142645d26f2d`。公开复核从 [`manifest.json`](/signal-grid-blog/practice/high-availability-cex/m09/evidence/manifest.json) 开始，manifest SHA-256 为 `22b0d234e7257a74461e56feccfe6f859cc4f401dbae32fb11a8e966d9bf984a`；所有数字都受十三条 limitation 约束。

Snapshot happy path 很容易自证：保存、重启、看到相同盘口。很多危险实现也能通过这个测试——遗漏 `HALTED`、included record 重放一次、suffix 跳过一条业务 Reject、rename 后未 force 目录就选择 Snapshot，或在 cut+1 WAL 起点尚未 durable 时删除旧 segment。

真正的证据体系必须能回答两个问题：

1. production 若违反一条冻结不变量，裁判能否给出一个经过单删检验、可重放的 semantic counterexample？
2. harness、reference、fixture 或环境自己坏掉时，系统能否拒绝把意外异常算成“杀死 mutant”？

M09 的证据结论是：**fixed/generated operation history、retained-genesis runtime、独立 no-I/O storage ledger 与 executable candidate 必须共同闭合；code-level injection、child-process crash 和真实 power loss 必须分层陈述。**

## 先把主张拆成可观察事实

一个总的 `PASS=true` 不能替代下面这些独立 claim：

| claim | 最少要观察什么 |
| --- | --- |
| complete state cut | order lifecycle、FIFO、RuleSet、mode/fence、identity/result、sequence、digest |
| Snapshot publication | temp/file force/rename/snapshot-directory force 与 latest selection |
| suffix equivalence | Snapshot install、cut record 零次 apply、S+1 连续 replay、candidate/genesis runtime terminal equality |
| recovery budget | records、encoded bytes、pre-WAL rejection、fresh scan 越界时零 suffix apply |
| prefix retirement | protected cut、active/crossing retention、delete、WAL-directory force |
| fail closed | unknown version、corruption、identity mismatch、gap、missing authority 不进入 OPEN |
| scope boundary | 无 Aeron、复制、网络、数据库恢复、后台 Snapshot 与性能资格 |

每条 claim 都由 manifest 中的 limitations 限定。比如“fixed StorageOperations trace 观察到 JDK 程序顺序”不等于“所有文件系统断电一致”，“suffix 最多 64 条”也不等于“恢复必定低于某个毫秒值”。

## 起点 RED 与完成报告必须分开

`course/m09-start` 将 M09 从口头计划变成可机器检查的 RED：

```text
22 fixed scenarios
repository-owned SplitMix64 profile, base seed 5909
96 histories × 40 operations
4 named lanes
32 coverage obligations
7 process-crash windows
8 deterministic failure seams
9 storage/state mutants + 3 invalid-latest candidates
5 tutorial permalinks
```

这些数值先冻结评测空间，防止完成后临时挑容易样例；最终报告再证明这份有限语料在 complete commit 上通过。它们仍不证明穷尽、形式正确性或真实故障覆盖。

start ref 上运行：

```bash
git switch --detach course/m09-start
./gradlew m09Check --no-daemon
```

应生成 schema-valid 的 `GOAL_NOT_IMPLEMENTED` RED 并非零退出。这个失败是课程起点合同，不是系统故障，也不能当 completion evidence。

读者可以切到完成身份运行同一裁判与构建：

```bash
git switch --detach course/m09-complete
./gradlew clean build --no-daemon
./gradlew m09Check --no-daemon
```

annotated complete tag 对应 clean commit `147a7e7dd2439764d4a5fe4d1048142645d26f2d`；结构化报告、counterexample artifacts 与 manifest 已在本站保存同源副本。

## fixed corpus 用业务反例而不是 API 行覆盖

22 个已通过的 fixed scenario、88 个 declared operation 与 32/32 obligation 可按五条论证链分组；fixed canonical digest 为 `1636ed177f59347ec11b8e9ffe1fb6d872fd3de5225298381a161a0b7d755f43`。

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

完成报告包含两条针对 legacy over-budget directory 的回归入口：一条让 record count 越界，另一条让 record 数未越界但 encoded bytes 越界。二者都在任何 suffix apply 前拒绝打开。production default 是 64 records / 1 MiB；为了构造 crossing suffix，fixed multi-segment 机制 fixture 使用 test-only 4 MiB，而不是修改生产默认值。

## generated history 的 operation 不只是 submit

生成器使用四条命名 lane：

| lane | 主要压力 |
| --- | --- |
| `STATE_AND_IDENTITY` | 订单终态、控制状态、duplicate/conflict |
| `CUT_AND_SUFFIX` | cut 前后、restart、empty/cross-segment suffix |
| `PUBLISH_AND_SELECTION` | temp/final、generation、corruption、latest fail closed |
| `RETIREMENT_AND_BUDGET` | records/bytes 边界、rollover、whole-segment delete |

operation domain 包含 submit、duplicate/conflict、Snapshot、restart、rollover、retire 与 `CRASH`，而不是 40 次 Place 的随机循环。这里的 generated `CRASH` 是 `CONTROLLED_BEFORE_LIVE_APPLY_DURABILITY_UNKNOWN_THEN_FRESH_REOPEN`：在 live apply 前制造 durable-unknown，再 fresh reopen；它**不是**操作系统杀进程。每条 history 使用 fresh directory、candidate runtime、retained-genesis runtime 与 ledger，并保存 seed、lane 和 operation grammar。

generated suite 的预算预测域是 fresh append candidate、checkpoint retry 与 65 个 setup operation。最终报告包含 96×40=3,840 个声明生成操作，另加这 65 个 budget prelude；2,703 次预算预测精确分解为 2,702 accept + 1 reject，并产生一项 record-limit `CHECKPOINT_REQUIRED` witness。generated canonical digest 为 `9551ad7a3026964b57b366e39d6307510789cd83c750bf239098f9ba299354e5`。这组 generated 数字本身不声称产生了独立的 byte-overrun witness。

records/bytes 双维度的越界证据来自 fixed `RECOVERY_BUDGET_REJECTS_PRE_WAL` 场景，而不是从唯一的 generated reject 外推。它分别保存四项 `budgetWitnesses`：

```text
LIVE_RECORD_OVERRUN_REJECTED_PRE_WAL
LIVE_BYTE_OVERRUN_REJECTED_PRE_WAL
FRESH_RECOVERY_RECORD_OVERRUN_REJECTED_PRE_APPLY
FRESH_RECOVERY_BYTE_OVERRUN_REJECTED_PRE_APPLY
```

因此“records 很少但 bytes 越界”与“bytes 尚未越界但 records 越界”由 fixed 证据闭合；generated suite 只按自己的声明域提供额外历史压力，不能替代这四项归因。

## 两条 runtime 语义路径加一份独立 storage ledger

最终 judge 使用：

```text
retained-genesis-WAL runtime
production M09S1 candidate + actual M08W1 suffix replay
independent no-I/O storage ledger
```

ledger 只观察外部存储事实：

- temp/final Snapshot filename、generation、cut 与 file digest；
- Snapshot write、file force、rename、snapshot-directory force；
- active/crossing segment 与 cut+1 header；
- WAL record ranges、encoded bytes 与 suffix counters；
- segment delete、snapshot/WAL directory force；
- ACK/exception、runtime state、apply count；
- fresh reopen 选择 latest、replay 或 fail-closed 的原因。

candidate 与 retained-genesis runtime 共享 production WAL parser 和 inherited matching core；只有 ledger 不使用 production WAL parser。ledger 不能决定业务结果，它只检查 budget prediction、cut、exact inventory 与合法 recovery set。因此 evidence 没有第三套完整 M00～M08 业务模型，也不该把 parser/core 的共同缺陷说成已被独立 oracle 排除。

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

child 进程用 `Runtime.halt(86)` 避开正常 shutdown，再由父进程读取 namespace 并 fresh open。七个结果只证明：进程在声明 hook 终止、父进程观察到约定 namespace、fresh reopen 得到约定语义。它们不独立证明底层 `write/force/rename/delete` 的真实调用顺序，也不证明 page cache、控制器或物理介质在断电时的行为；实际 JDK 程序顺序由 fixed `StorageOperations` trace 另行观察。

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

八个 seam 只证明 fault 在 declared pre-operation hook 被触发，并检查当前实例是否 fail closed、是否禁止后续 mutation、fresh open 怎样处理已观察到的文件状态。它们不声称底层 operation 已执行或未执行，也不模拟电源、固件、真实 ENOSPC 或特定文件系统实现。

受控注入本身也不是通过条件。若在 `SNAPSHOT_READ` 抛预期 IOException，只有当 runtime 不进入 OPEN、不删 authority、下一次无 fault reopen 仍能恢复时，场景才有语义价值。

## 九个 storage/state mutant 加三个 invalid-latest candidate

十二个 executable candidate 分成四组，其中 selection/corruption 的三项是 invalid-latest acceptance candidate，其余九项是 storage/state mutant：

| 错误族 | mutant |
| --- | --- |
| state omission | `M09-SNAPSHOT-DROPS-RESTING-ORDER`、`M09-SNAPSHOT-RESETS-MARKET-MODE`、`M09-SNAPSHOT-DROPS-PREPARED-RULE-SET`、`M09-SNAPSHOT-DROPS-DURABLE-IDENTITY-RESULT` |
| cut/suffix | `M09-SUFFIX-REPLAYS-CUT-RECORD`、`M09-SUFFIX-SKIPS-FIRST-RECORD` |
| invalid-latest acceptance | `M09-UNKNOWN-VERSION-ACCEPTED`、`M09-CORRUPT-SNAPSHOT-ACCEPTED`、`M09-SNAPSHOT-IDENTITY-MISMATCH-ACCEPTED` |
| retirement | `M09-RETIREMENT-BEFORE-SNAPSHOT-DIRECTORY-FORCE`、`M09-RETIREMENT-DELETES-CROSSING-SEGMENT`、`M09-GENESIS-FALLBACK-WITH-MISSING-PREFIX` |

十二项都在 fresh strict replay 中以 `STUDENT_FAILURE` 被杀。把 candidate 直接改成 `throw new RuntimeException()` 仍不是 kill；throwing control 被归为 `SYSTEM_ERROR`。

one-minimal 的标准只是：删除剩余 history 中任一 operation 后，不再产生同一 fingerprint；PASS、`INVALID_HISTORY` 或不同 failure 都允许。最终 64 个 single-delete trial 全部是 `INVALID_HISTORY`，0 个仍复现相同 fingerprint，且 `INVALID_HISTORY` 全部不计 kill；这不是 global minimum 证明。counterexample canonical digest 为 `0dd88e0ced4a35dab53f357a657c299484eabeeb6111cd70221603a971f0a3eb`。

## `STUDENT_FAILURE` 与 `SYSTEM_ERROR` 必须分开

可以归为 semantic failure 的情况是：

- production 正常运行并违反冻结 obligation；
- 反例能在 fresh runtime 重放；
- reference 与 ledger 自身都健康；
- fingerprint 明确绑定 state/file/result 差异。

以下情况只能是 `SYSTEM_ERROR`：

- fixture/schema/parser 失败；
- candidate/genesis runtime harness 抛异常，或 ledger 自称业务 oracle；
- ledger 无法读取文件或自身算术溢出；
- shrinker 产生非法 history；
- temp directory/权限出现未计划环境故障；
- mutant/control 只是任意抛异常；
- child 没在命名 hook halt，或父进程无法确认退出原因。

`SYSTEM_ERROR` 永远不能计为 mutant kill。否则一个坏 harness 可以通过把所有 candidate 跑崩，伪装成“证据很强”。

## 静态 evidence 已怎样公开

本站不接外部 Java 执行服务，也不登记 M09 浏览器 L2 Lab。真正的编译、真实文件 I/O、child JVM、generated history、mutation replay 与 evidence 导出由读者在本地代码仓库运行。

M09 达到 `CODE_VERIFIED` 后，博客注册表已经绑定：

- annotated complete ref 与完整 commit；
- clean/dirty 状态和环境事实；
- frozen input digests；
- claim/limitation 与 report facts；
- fixed/generated/coverage/mutant/counterexample/crash artifacts；
- 每个 artifact 的 SHA-256 和 manifest 自身 hash。

达到 `PUBLISHED` 时，五篇教程与 20 个同源静态 artifact 已原子公开。manifest 绑定 clean source commit、`productRelease=null`、六项 claim、十三条 limitation 与每个 artifact 的 SHA-256；外层 hash 为 `22b0d234e7257a74461e56feccfe6f859cc4f401dbae32fb11a8e966d9bf984a`。架构报告为 55 个 core source、39 个 local-runtime source、0 violation，且 production wiring 使用 `StorageOperations`、testkit probe 不进入 production。入口是 [`manifest.json`](/signal-grid-blog/practice/high-availability-cex/m09/evidence/manifest.json)。

网页只做静态解释与证据链接，不实现另一套 Snapshot codec，不写本地文件，也不把动画当裁判；本单元没有浏览器 Lab。

## 证据语言的最终边界

有限门禁已经闭合，但只能说：

- 在冻结的 fixed/generated corpus 中，candidate 与 retained-genesis runtime 未观察到 semantic 分叉；二者共享 production WAL parser 和 inherited core；
- 九个 storage/state mutant 与三个 invalid-latest candidate 被可重放反例反对；
- fixed `StorageOperations` trace 观察了实际 JDK 程序顺序，八个 seam 只验证 declared pre-operation hook；
- 七个 child JVM halt 验证 hook、namespace 与 fresh reopen，不证明底层 operation order；
- RecoveryBudget 对配置的 records/bytes 有结构上限。

不能由此推出：

- 任意 history 或任意故障都已证明；
- 真实断电、控制器 cache、云盘和所有文件系统已合格；
- Snapshot pause、恢复延迟或吞吐达到生产 SLA；
- N/N-1 格式迁移、在线升级或 rollback 可用；
- Aeron、复制、leader/quorum/failover 已实现；
- 当前单机 runtime 已经高可用或 production-ready。

## 本篇停止点

M09 的五篇论证链到这里闭合：完整已 apply state cut，经 file force/atomic rename/snapshot-directory force 成为权威 Snapshot；连续 suffix 与 genesis replay 保持语义等价；records+bytes 双重预算在 WAL 前阻止越界；cut+1 WAL 起点与目录 force 保护 whole-segment retirement；retained-genesis runtime、no-I/O ledger、fault evidence 与 executable candidate 共同反对错误实现。

当前交付已封存教程和静态 evidence，但停止点仍是单进程、单 shard、caller-serialized 的本地恢复边界。它没有浏览器 Lab、产品 release、复制、高可用、Aeron、性能资格或格式演进；M10 也没有因此自动开启。
