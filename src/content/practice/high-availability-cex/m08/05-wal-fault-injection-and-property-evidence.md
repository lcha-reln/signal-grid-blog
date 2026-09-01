---
title: "M08·05：用故障注入与恢复账本验证本地 WAL"
description: "读取已冻结的 20 个固定场景、96×48 生成配置、24 项覆盖义务与确定性故障点，并严格区分 synthetic I/O、进程 crash smoke 与真实断电。"
date: 2026-08-31T16:40:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M08
lessonOrder: 50
permalink: wal-fault-injection-and-property-evidence
tags:
  - 撮合引擎
  - 故障注入
  - Release Evidence
draft: false
---

> annotated [`course/m08-start`](https://github.com/lcha-reln/cex-matching/tree/course/m08-start)（peeled commit `a26b5776172d66ecc4865a6fbd6cfa73cb22aaf0`）冻结输入边界，annotated [`course/m08-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m08-complete) 冻结完成实现与裁判；下列通过数字来自本站保存的[完成 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m08/evidence/manifest.json)，不是 start 计划值或浏览器模拟值。
>
> 完成身份：`course/m08-complete` peeled commit `5c8d8f6a5356f6ebbdf87d83745d8e8bd0861199`；本站 manifest SHA-256 `19a5c93e618ef5d9430719b135ca95aa7db6513c7389e0cfb50eb80c430e2923`。

WAL happy path 很容易测：写一条、重启、看到同一订单。真正需要反对的是更危险的实现——record force 前 ACK、directory force 前 ACK、duplicate 再 apply、gap 推进 producer、尾部 CRC 错误被当 torn 截掉。

M08 的证据结论是：**固定场景、生成 operation history、无 I/O reference 与第三 durability ledger 必须逐边界一致，并让十个 semantic mutants 产生 one-minimal fresh replay；deterministic fault seam 证明程序对失败点的反应，child JVM crash 只做真实文件 smoke，两者都不是物理断电证明。**

## 20 个 fixed scenario 已经是可寻址输入

start tag 同时冻结了 schema `matching.m08.scenario.v1` 与 `matching-testkit/src/test/resources/m08/fixtures/local-wal-durability-v1.json`。后者 SHA-256 为 `5160121600c151c91db5431a4e1a8ef8fcd4a73ba67683d96a09daba389100a3`，包含 20 个有序 scenario、73 个符号化 operation，以及恰好 24 个 obligation 的并集。

| 顺序 | frozen scenario ID | 要建立的故障链 |
| ---: | --- | --- |
| 1 | `CANONICAL_VALID_AND_BUSINESS_REJECTION` | canonical 成功与业务拒绝都先持久再 apply |
| 2 | `STRUCTURAL_REJECTIONS_BEFORE_WAL` | wrong shard / hash mismatch 不改变 WAL |
| 3 | `LIVE_EXACT_DUPLICATE` | live exact retry 只返回原结果 |
| 4 | `RESTART_EXACT_DUPLICATE` | restart 后仍返回原 position/result |
| 5 | `COMMAND_ID_PAYLOAD_CONFLICT` | 同 commandId/Slot 换 payload 稳定拒绝 |
| 6 | `COMMAND_ID_SLOT_CONFLICT` | 同 commandId 换 Slot 稳定拒绝 |
| 7 | `SLOT_IDENTITY_CONFLICT` | 同 Slot 换 commandId 稳定拒绝 |
| 8 | `PRODUCER_SEQUENCE_GAP_AND_BOUND_STALE` | gap 不推进；已绑定旧 slot 先按 binding 判定 |
| 9 | `PRODUCER_EPOCH_FENCE` | 新 epoch 激活后 fence 旧 epoch 未见命令 |
| 10 | `HIGHER_EPOCH_MUST_START_AT_ONE` | 更高 epoch 必须从 sequence 1 开始 |
| 11 | `TORN_LENGTH_PREFIX_UNKNOWN` | length prefix torn 后 UNKNOWN、失败关闭并修尾 |
| 12 | `COMPLETE_BODY_BEFORE_FORCE_UNKNOWN` | 完整 body 尚未 force 时禁止 ACK |
| 13 | `FORCED_RECORD_BEFORE_APPLY_UNKNOWN` | record 已 force、apply 前失败仍不猜结果 |
| 14 | `APPLIED_BEFORE_ACK_UNKNOWN` | live apply 后、返回前失败仍由重启裁决 |
| 15 | `ROLLOVER_DIRECTORY_FORCE_ORDER` | 新 segment 首条 record 不越过目录 barrier |
| 16 | `ORPHAN_TEMP_IS_NOT_AUTHORITY` | orphan `.tmp` 删除后不参与权威前缀 |
| 17 | `FINAL_TORN_TAIL_REPAIR` | 只修最后 segment 的 incomplete suffix |
| 18 | `COMPLETE_FINAL_FRAME_CORRUPTION` | 完整 final frame 损坏必须 fail closed |
| 19 | `NON_FINAL_OR_MIDDLE_CORRUPTION` | 非尾部损坏不得跳过或截断 |
| 20 | `SINGLE_WRITER_AND_APPLY_FAILURE` | 目录锁与 apply failure 都禁止降级打开 |

这些 operation 名是 frozen stimulus，不是通过状态本身。complete runner 已另行生成 fixed history/report，为每条 history 记录 submit/restart/rollover/fault、返回结果、文件边界、apply count 与恢复后的 semantic digest；20 个场景与 24/24 obligations 全部通过。

## generated suite 的单位是 operation，不只是命令

start tag 还冻结了 schema `matching.m08.generator.v1` 与 `matching-testkit/src/test/resources/m08/fixtures/property-suite-v1.json`；fixture SHA-256 为 `477a2b16be5d2d6f6f378b203660bf1106db89409ad06e77bdb7837edbfc74ea`。generator 使用 repository-owned `splitmix64-v1`、decimal seed `5808`：

```text
96 fresh histories × 48 operations
= 4,608 deterministic operation boundaries
```

operation 域必须包含：

```text
submit canonical/invalid/conflicting command
restart from current WAL bytes
roll over to a new segment
inject a named write/force/move/lock/apply failure
introduce a contract-specific tail/corruption fixture
retry exact or conflicting identity
```

history 按 `historyIndex % 4` 进入固定 lane，所以每条 lane 恰好 24 条；每条 lane 还绑定一个 frozen prefix scenario：

| modulo | lane ID | prefix scenario | histories |
| ---: | --- | --- | ---: |
| 0 | `CANONICAL_AND_BUSINESS` | `CANONICAL_VALID_AND_BUSINESS_REJECTION` | 24 |
| 1 | `IDENTITY_SLOT_AND_EPOCH` | `PRODUCER_SEQUENCE_GAP_AND_BOUND_STALE` | 24 |
| 2 | `ACK_AND_FAIL_CLOSED` | `FORCED_RECORD_BEFORE_APPLY_UNKNOWN` | 24 |
| 3 | `ROLLOVER_AND_RECOVERY` | `ROLLOVER_DIRECTORY_FORCE_ORDER` | 24 |

operation domain 的六项抽样权重也已冻结，且合计必须为 100：

| operation | weight |
| --- | ---: |
| submit | 56 |
| exact duplicate | 12 |
| identity conflict | 10 |
| restart | 10 |
| rollover | 6 |
| deterministic fault | 6 |

`invalidEnvelopeOneIn=24` 与 `businessRejectionOneIn=8` 是 submit 内部的触发频率，不是第七、第八项权重；不能把它们再加到 100 上。

每条 history 必须使用 fresh runtime/reference/ledger，以及由 harness 或部署流程**预先创建并持久发布**的 fresh WAL directory。`LocalMatchingRuntime` 不调用 `createDirectories`；`SegmentedWal` 只用 `Files.isDirectory(config.directory(), NOFOLLOW_LINKS)` 确认配置路径本身是现存真实目录而非 symlink。这个检查不递归证明所有祖先目录都没有 symlink，也不替部署方证明目录项已落到物理介质。复用上一条目录会泄漏 duplicate index 和 producer epoch，使结果不再只由 seed/history index 决定。

## 无 I/O reference 与 durability ledger 各管一半真相

independent no-I/O reference 不解析 production WAL bytes，只按抽象 operation 维护：

```text
commandId ↔ Slot + payloadHash + original result
producer current epoch + next sequence
expected WAL sequence + ApplicationSequence
expected apply count
canonical result + semantic state digest
expected duplicate/conflict/gap/fence outcome
```

它不能调用 production M08C1 codec、segment parser、binding map 或 matching runtime preflight；否则同一 off-by-one/gap bug 可能被双方接受。

第三 durability ledger 观察实际 side effects：

```text
write/force/move/directory-force call order
bytes visible at each injected boundary
ACK count and status
core apply count
runtime OPEN / FAILED_CLOSED state
restart scan/truncate/replay decisions
result/position returned to duplicates
```

reference 回答“抽象身份和结果应该是什么”，ledger 回答“程序是否跨过了不该跨的 durable barrier”。两者与 production result/file state 三方比较，才能发现 ACK 正确但 file bytes 错、或 file 正确但 duplicate 再 apply。

## 24 项 obligation 必须逐 ID 绑定 witness

schema 与两份 fixture 冻结的是下面这 24 个 ID，而不是一组可在完成时改名的自然语言目标：

| obligation ID | witness 至少要说明什么 |
| --- | --- |
| `CANONICAL_ENVELOPE` | decode 后 re-encode 与输入逐字节相同 |
| `WRONG_SHARD_PRE_WAL` | wrong shard 不写 WAL、不 apply |
| `PAYLOAD_HASH_PRE_WAL` | hash mismatch 不写 WAL、不 apply |
| `BUSINESS_REJECTION_JOURNALED` | core Reject 仍存在于 durable prefix 并可重放 |
| `LIVE_EXACT_DUPLICATE` | live duplicate 不 append/force/reapply |
| `RESTART_EXACT_DUPLICATE` | restart duplicate 返回原 position/result |
| `COMMAND_ID_PAYLOAD_CONFLICT` | 同 commandId/Slot 换 payload 稳定拒绝 |
| `COMMAND_ID_SLOT_CONFLICT` | 同 commandId 换 Slot 稳定拒绝 |
| `SLOT_IDENTITY_CONFLICT` | 同 Slot 换 commandId 稳定拒绝 |
| `PRODUCER_SEQUENCE_GAP` | gap 不推进 producer cursor |
| `STALE_SLOT_RESOLVES_BY_BINDING_PRECEDENCE` | 已绑定旧 slot 先落到 duplicate 或 slot conflict |
| `PRODUCER_EPOCH_FENCED` | 旧 epoch 未见命令被 fence |
| `HIGHER_EPOCH_MUST_START_AT_ONE` | 新 epoch 非 sequence 1 不激活 |
| `HIGHER_EPOCH_ACTIVATION` | sequence 1 durable apply 后才切 epoch |
| `APPEND_BEFORE_FORCE` | force 只发生在完整 record append 之后 |
| `RECORD_FORCE_BEFORE_ACK` | 该 record 的 force happens-before ACK |
| `DIRECTORY_FORCE_BEFORE_FIRST_RECORD_ACK` | rollover 目录项 force happens-before 新段首条 ACK |
| `APPLY_BEFORE_ACK` | core apply 与 result 固定 happens-before ACK |
| `FAIL_CLOSED_UNKNOWN` | 不确定窗口无成功 ACK，且同实例拒绝后续命令 |
| `ROLLOVER_CHAIN` | segmentId/firstWalSequence/record sequence 连续 |
| `ORPHAN_TEMP_IGNORED` | `.tmp` 被移除且不进入 replay |
| `FINAL_TORN_TAIL_TRUNCATED` | 只截 final incomplete suffix，并 force 修复结果 |
| `COMPLETE_CORRUPTION_FAIL_CLOSED` | 完整或中段 corruption 不跳过、不修补 |
| `DIRECTORY_SINGLE_WRITER_LOCK` | 同一目录第二 writer 无法进入 OPEN |

“调用过 force”不是 witness；需要显示该 command ACK 的 happens-before 关系。“恢复成功”也不够；必须证明恢复状态等于合法 durable prefix 的 reference semantic digest，且 apply count 没有 duplicate。每个 obligation 都应指向具体 history/operation boundary 和原始 artifact，而不是构建结束时手工填一个 `true`。

## deterministic seam 冻结代码边界，不穷举现实故障

当前 `FaultPoint` 一共暴露 27 个命名 hook：

| 边界 | frozen hook |
| --- | --- |
| directory owner | `BEFORE_DIRECTORY_LOCK`、`AFTER_DIRECTORY_LOCK` |
| segment publication | `BEFORE_SEGMENT_HEADER_WRITE`、`AFTER_SEGMENT_HEADER_WRITE`、`BEFORE_SEGMENT_HEADER_FORCE`、`AFTER_SEGMENT_HEADER_FORCE`、`BEFORE_SEGMENT_ATOMIC_RENAME`、`AFTER_SEGMENT_ATOMIC_RENAME`、`BEFORE_DIRECTORY_FORCE`、`AFTER_DIRECTORY_FORCE` |
| record append | `BEFORE_RECORD_LENGTH_WRITE`、`AFTER_RECORD_LENGTH_WRITE`、`BEFORE_RECORD_BODY_WRITE`、`AFTER_RECORD_BODY_WRITE`、`BEFORE_RECORD_FORCE`、`AFTER_RECORD_FORCE` |
| tail/reopen durability | `BEFORE_TAIL_TRUNCATE`、`AFTER_TAIL_TRUNCATE`、`BEFORE_TAIL_TRUNCATE_FORCE`、`AFTER_TAIL_TRUNCATE_FORCE`、`BEFORE_RECOVERY_ACTIVE_FORCE`、`AFTER_RECOVERY_ACTIVE_FORCE`、`BEFORE_RECOVERY_DIRECTORY_FORCE`、`AFTER_RECOVERY_DIRECTORY_FORCE` |
| apply / local ACK window | `BEFORE_RECOVERY_APPLY`、`BEFORE_LIVE_APPLY`、`AFTER_LIVE_APPLY_BEFORE_ACK` |

`FaultInjector.hit(FaultPoint)` 当前只允许在这些确定位置抛出通用 `IOException`；它没有观察真实块设备、挂载状态或操作系统错误码，也没有一个名为 `SYSTEM_ERROR` 的 runtime result。live apply/ACK 窗口抛错会得到 `DurabilityUnknown(stage="APPLY_OR_ACK")` 并让实例 `FAILED_CLOSED`；recovery apply 抛错则使 `open` 以 `RecoveryException` 失败。`SYSTEM_ERROR` 只属于课程裁判对 harness/reference/fixture 意外失败的分类。

优点是可重放：同一 seed、history 和 injection index 得到相同异常边界，shrinker 能删除无关操作。通过条件不是“抛了预期异常”，而是：

```text
no forbidden ACK
no later command accepted by failed-closed runtime
durable bytes form either the prior legal prefix or an allowed final torn suffix
restart never skips a complete/corrupt record
identity/producer/application state equals reference after recovery
```

complete suite 还用命名 `FileSystemException` 注入了 synthetic ENOSPC 与 synthetic read-only case，每条证据都显式写 `actualFilesystem=false`。这类 case 只能证明“指定 hook 收到测试生成的 I/O failure 后，runtime 满足禁止 ACK / fail-closed / restart 合同”；它不能写成真实磁盘耗尽、真实只读 mount、权限错误或特定文件系统验证。

## child JVM crash smoke 比异常注入多证明什么

deterministic exception 无法完全模拟进程突然终止：finally block、buffer close、shutdown hook 可能在普通异常中运行。completion gate 因而必须另起 child JVM，在选定的现有 `FaultPoint` 调用 `Runtime.halt`；父进程只能在子进程退出后，用同一个预配真实目录打开 fresh runtime：

```text
child submits operation
→ halt at selected append/force/apply/ACK boundary
→ parent observes actual files
→ open fresh runtime and recover
→ compare legal durable prefix + semantic digest
```

完成报告冻结了三个 hook：`AFTER_RECORD_LENGTH_WRITE`、`AFTER_RECORD_FORCE` 与 `AFTER_LIVE_APPLY_BEFORE_ACK`。三个真实 child 都以 `Runtime.halt(86)` 退出，父进程在同一预配目录 fresh reopen；length-only 窗口修复 torn suffix 后 exact retry 为 `NewDurablyApplied`，后两个 durable 窗口 exact retry 为 `DuplicateReplayed`，并比较了 reopen 前后 WAL 文件摘要与 semantic digest。

这只能称为 **process crash smoke**：它证明代码没有依赖正常 close/shutdown，且当时可见的真实文件 bytes 能被 recovery parser 处理。OS 与硬件仍在运行，page cache、controller 和供电都没有消失。

## 真断电需要另一套证据装置

以下说法都不能由 `Runtime.halt` 或 injected I/O 得出：

```text
拔电后物理介质一定保留所有 forced bytes
某型号磁盘控制器严格兑现 cache flush
任意文件系统的 rename + directory fsync 语义相同
云块设备不会在宿主故障后回退写入
```

真正 power-loss qualification 需要记录硬件、固件、文件系统、挂载参数、电源切断装置、写缓存策略和多次恢复观察。M08 教学项目不提供这套实验室，因此 evidence 必须明确写“injected fault”或“child JVM crash smoke”，绝不能写“真实断电已证明”。

`FileChannel.force(true)` 的结论也只到 JDK/OS 文档化 barrier；部署环境还要单独资格验证。

## 十个 mutant 让裁判能够反对危险实现

completion judge 已杀死以下十个精确 fault id：

```text
M08-ACK-BEFORE-RECORD-FORCE
M08-ACK-BEFORE-DIRECTORY-FORCE
M08-DUPLICATE-REAPPLIES
M08-COMMAND-ID-PAYLOAD-CONFLICT-ACCEPTED
M08-SLOT-IDENTITY-CONFLICT-ACCEPTED
M08-GAP-ADVANCES-PRODUCER
M08-FENCED-EPOCH-ACCEPTED
M08-BUSINESS-REJECTION-NOT-JOURNALED
M08-TORN-TAIL-REPLAYED
M08-CORRUPTION-SKIPPED
```

它们覆盖 ACK、durable identity、producer order、业务拒绝恢复和损坏处理。只跑“正常 restart 后 book 相同”几乎一个都杀不全。

每个 executable candidate 都从 harness 预创建的 fresh directory/runtime 开始，并真实改变返回值、WAL/core apply、producer binding、恢复动作或文件状态。裁判记录 13 次实际 mutation action，十条 M08X2 反例共 56 个最小高层 history token，digest 为 `sha256:9608baeba56ba525e6eeba5c33d9f6368b72c8f68e22b5e7f0c6fdf768d9566a`。

这里的 one-minimal 只表示：在保留该性质要求的完整 submit/close/restart/retry grammar 时，删除任一剩余**高层 history token**都不再产生相同 property fingerprint；它不声称对底层 I/O 指令或所有可能历史全局最小。随后仍必须用 fresh runtime strict replay 得到同一差异。

## `SYSTEM_ERROR` 不能冒充 mutant kill

以下情况不是 `STUDENT_FAILURE` 反例：

- reference 或 ledger 自己抛错；
- fixture/parser/codec 驱动损坏；
- shrinker 无法重放；
- 临时目录/文件控制发生未计划 I/O error；
- candidate 对所有输入直接抛异常；
- child JVM 没在指定 hook halt。

它们都应归类 `SYSTEM_ERROR` 并 fail closed。一个 mutant kill 必须保存明确的 expected/actual ACK、bytes/recovery/apply count、semantic digest 和同一 property fingerprint。

注入的预期 I/O fault 本身不是系统错误；裁判要检查 candidate 对这个受控 fault 的语义反应。只有 harness 意外失败才是 `SYSTEM_ERROR`。

## 本地 gate 与 evidence 状态

M07 complete/evidence/review 封存后，`course/m08-start` 锁定上述 schema、fixture、permalink 与结构化 RED，`course/m08-complete` 再封存完成实现。正式入口是：

```bash
./gradlew clean build --no-daemon
./gradlew m08Check --no-daemon
```

在 start tag 上，累计 M00～M07 保持 GREEN，`m08Check` 验证 M08C1/M08W1 schemas/fixtures、20 fixed、seed 5808、96×48、四 lane、六项权重、24 obligation ID、十 mutant ID 与五篇 permalink 后，以结构化 `GOAL_NOT_IMPLEMENTED` 非零退出。实现分支已经有 local runtime 与 fault seam，不会自动把这个 start runner 变成完成裁判。

complete runner 已执行 production/reference/ledger、fixed/generated/synthetic-fault/child-halt differential、coverage witness、十个 one-minimal replay、architecture gate 与所有继承回归：fixed digest 为 `sha256:444e999094bc58aabed7869df60a07a019de9969f8bd39318edc3c0590527472`；两次 byte-exact 的 96×48 generated digest 为 `sha256:56a2d7f63df96737c286bab5c96a16aa50e0dd33df58f9cefc9d7abee5aaff41`。1,152 次权重驱动操作之外，完整 corpus 还实际执行了 192 个 invalid envelope 与 576 个 durable business rejection；第三 ledger 对照 4,608 个边界，architecture 为 54 core / 28 local-runtime / 0 violation。

本站只读取发布后的静态 WAL/evidence，允许预测 fault outcome 与 recovery decision；它不会上传源码、启动外部 Judge、写用户 WAL 或执行远程 crash。真正的 Java、文件系统和 child JVM 测试由读者本地运行。

## 有限证据允许说什么

| 已通过的真实 gate | 可以声称 | 不能声称 |
| --- | --- | --- |
| 20 fixed | 冻结故障场景得到期望 prefix/recovery | 覆盖任意 I/O/硬件故障 |
| 96×48 generated | seed/profile 下 4,608 操作一致 | 穷尽或形式证明 |
| 24/24 obligations | 每项合同有可重放 witness | 生产负载/容量合格 |
| 10/10 mutants | 裁判反对十类精确错误 | 能发现任意未知 WAL 缺陷 |
| synthetic I/O 且 `actualFilesystem=false` | 程序在受控 hook fail closed | 真实 ENOSPC、只读 mount、权限或断电已测试 |
| child JVM `Runtime.halt` | 非正常进程退出后的文件 recovery smoke | OS/控制器/介质的 power-loss 保证 |
| clean tag-bound evidence | artifact 绑定一个完成身份 | 产品 release、Cluster 或 HA |

任何 missing witness、unstable replay、dirty tree、unexpected I/O 或 `SYSTEM_ERROR` 都不能降级为警告后发布 PASS。

## M08 的诚实停止点

M08 的当前停止点可以描述为：单进程、单 shard、caller-serialized 的本地 runtime 以 M08C1 journal 所有 M00～M07 命令，在 record 与目录持久 barrier、core apply 后 ACK；它能从 genesis M08W1 WAL 重建规则、mode、STP、业务拒绝、original result 与 durable idempotency。

它仍没有 Snapshot、有界恢复、retention、复制、Aeron、leader/quorum/failover、网络 exactly-once、数据库恢复源或双写、Outbox、多 shard、group commit、SLA、升级协议和外部副作用幂等。故障证据也不等于真实断电认证或 production-ready；下一阶段仍需逐项增加而不能一次宣称高可用。
