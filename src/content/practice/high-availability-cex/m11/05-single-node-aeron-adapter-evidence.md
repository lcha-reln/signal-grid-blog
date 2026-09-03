---
title: "M11·05：为单节点 Aeron Adapter 设计可复核 Evidence"
description: "把结构化 RED、真实 Cluster、六份 codec Golden、Direct/Cluster 差分、Snapshot restart、mutant 与架构边界组织成紧凑证据，并严格区分冻结规模和未来完成结果。"
date: 2026-09-03T09:50:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M11
lessonOrder: 50
permalink: single-node-aeron-adapter-evidence
tags:
  - Aeron Cluster
  - 软件测试
  - Evidence
  - 确定性
draft: true
---

> 当前状态：M11 只有 annotated [`course/m11-start`](https://github.com/lcha-reln/cex-matching/tree/course/m11-start) 冻结的 [结构化 RED 合同](https://github.com/lcha-reln/cex-matching/blob/course/m11-start/docs/specs/m11.md)。本文可以写冻结的输入规模、场景 ID、candidate ID 和验收方法；不能填写未来 complete commit、PASS、实际 comparison count、运行摘要、manifest hash 或线上 evidence。

“启动过一次单节点 Cluster”不是证据，“Direct 和 Cluster 最后盘口一样”也不够。前者没有证明业务一定从 log apply 推进，后者可能漏掉 original result、事件顺序和 identity table。相反，把整个 Aeron Archive 和数百兆 driver 日志提交进博客，也不会自动提高结论质量，只会让证据难以审阅和长期维护。

M11 的证据设计遵循一个原则：**每项公开 claim 都绑定能直接支持它的最小 artifact；冻结输入与实际观察分开；环境错误不能伪装成业务失败；完整 runtime 临时目录不进入 Git。**

## 先区分“合同数字”与“结果数字”

起点已经冻结以下试验规模，所以草稿可以准确引用：

| 冻结项目                       |                        合同值 |
| ------------------------------ | ----------------------------: |
| fixed scenarios                |                            22 |
| generator                      | `splitmix64-v1` / seed `6111` |
| continuous corpus segments     |                            32 |
| actions per segment            |                           128 |
| actual Cluster ingress actions |             2 × 4,096 = 8,192 |
| lanes                          |          4，每组 8 个 segment |
| controlled snapshot cut        |        全局 action 2,048 之后 |
| proof obligations              |                            28 |
| semantic candidates            |                            10 |
| `SYSTEM_ERROR` controls        |                             3 |
| binary Golden                  |                             6 |

这些数字只说明“必须运行什么”，不说明“已经运行成功”。下列数字必须等完成裁判真实产生后才能写：

- fixed 通过数；
- Direct/Cluster comparison 数；
- event、result、state digest；
- Snapshot frame/entry/byte 数；
- candidate kill 数与反例长度；
- Aeron component/runtime observation；
- public artifact 数与总大小；
- complete SHA 与 manifest SHA-256。

把计划数写成通过数，是课程证据最隐蔽的造假方式之一。

## 七项 claim 应形成一条因果链

完成态 `cex.lab-evidence.v2` manifest 的 claim identity 已在起点冻结，顺序为：

```text
m00-m10-semantic-regression
single-node-clustered-service
correlated-apply-response
direct-cluster-business-equivalence
cluster-snapshot-restart
protocol-compatibility-and-mutants
architecture-and-unit-identity
```

它们不是七种不同测试工具，而是从前提到结论的七层证明。

### 继承回归先证明“没有换题”

`m00-m10-semantic-regression` 必须重跑当前 HEAD 编译出的 inherited gate，证明 M11 没有为了接入 Cluster 改写已发布撮合语义。尤其要确认 `matching-core` 相对 M10 的边界，不能只引用旧 M10 manifest。

### 真实 Service 再证明“不是模拟”

`single-node-clustered-service` 绑定真实 localhost Media Driver、Archive、Consensus Module 和 Service Container 的启动身份、member 0/appointed leader 0、actual ingress 与 bounded deadline/error capture。fake queue 只能作局部测试，不能进入这项 claim。

### 提交链证明“offer 不是成功”

`correlated-apply-response` 绑定 offer-accepted、log callback、result bind、response offer 的顺序观察，证明 session/correlation 不充当 durable identity，response publication 不反向改变业务状态。

### 差分证明“Adapter 没改业务语义”

`direct-cluster-business-equivalence` 绑定同一 ordered bytes 在 Direct 与 actual Cluster 的逐条规范化 result/events、comparison count 和 final semantic digest。报告同时保存 runtime metadata，但 equality projection 明确排除它们。

### Restart 证明“恢复仍忠实”

`cluster-snapshot-restart` 绑定全局 action 2,048 后 Admin snapshot 请求的 `OK`，并把它与真正完成分开：关闭前必须同时记录 snapshot counter 增量、toggle `NEUTRAL`、Recording Log 中 service `-1/0` 的新 recording ID 与同 term/position、Service 写出的 payload digest；fresh reopen 后还要证明 `onStart` 消费 non-null Image 并加载相同 digest/application sequence。之后才检查 suffix continuity、duplicate original result 和最终 digest。

### Codec 与 candidate 证明“反面路径会被抓住”

`protocol-compatibility-and-mutants` 绑定六份 request/response/snapshot version 1/2 Golden、current2/minReadable1 matrix、范围外版本/损坏输入，以及十个 executable semantic candidate。三个 throwing/environment control 仍必须是 `SYSTEM_ERROR`。

### 架构与身份证明“证据来自要发布的源码”

`architecture-and-unit-identity` 最终绑定 core 无 Aeron、Cluster runtime 无 standalone WAL、ClusteredService 无外部业务副作用、依赖版本、Java/OS/arch、clean source、complete tag、`productRelease=null` 与全部 artifact hash。Aeron runtime 自身的网络/文件 I/O 不是这里的禁止项。

M11 是普通课程单元，不创建产品 release。当前候选地图把 `matching-0.8.0` 暂列为 M12 的目标；M12 尚未签约时，这只是后续评审坐标。无论未来如何调整，M11 manifest 出现任何产品 release 都已经越过本单元合同。

## 22 个 fixed scenario 要覆盖机制，不是堆 smoke

冻结场景为：

```text
CODEC_V1_GOLDENS
CODEC_V2_GOLDENS
MALFORMED_FAILS_CLOSED
UNSUPPORTED_VERSION_FAILS_CLOSED
REAL_SINGLE_MEMBER_LEADER
OFFER_IS_NOT_SUCCESS
CORRELATION_ROUND_TRIP
SESSION_NOT_BUSINESS_IDENTITY
NEW_RESPONSE_AFTER_APPLY
DUPLICATE_REPLAYS_ORIGINAL
COMMAND_ID_CONFLICT_NO_MUTATION
SLOT_CONFLICT_NO_MUTATION
DIRECT_CLUSTER_EVENTS_EQUAL
DIRECT_CLUSTER_DIGEST_EQUAL
RUNTIME_METADATA_EXCLUDED
NO_STANDALONE_WAL_WRITE
SNAPSHOT_ACCEPTANCE_AND_COMPLETION_DISTINCT
SNAPSHOT_STATE_EXACT_AFTER_RESTART
SNAPSHOT_IDENTITY_RESULT_SURVIVES
SNAPSHOT_SEQUENCE_CONTINUES
CURRENT_READS_PREVIOUS_SNAPSHOT
CURRENT_DOWN_ENCODES_PREVIOUS_RESPONSE
```

它们按机制可以归为五组：codec fail-closed、真实 runtime、identity/response、Direct/Cluster equality、Snapshot/restart。报告应保留 scenario ID、实际执行状态、关键 observation 与失败 fingerprint，不能只写 `22/22`。

例如 `SNAPSHOT_STATE_EXACT_AFTER_RESTART` 与 `SNAPSHOT_IDENTITY_RESULT_SURVIVES` 必须分开：前者关心完整业务状态，后者关心 duplicate/conflict 的 original result。只验证订单簿会漏掉后一类错误。

## Generated differential 必须真的走 8,192 次 Cluster ingress

生成器使用 seed `6111`，把 32 个 128-action segment 连接成一个连续 4,096-action corpus；它们不是 32 个 fresh-state history。四组各八段，按 lane-major 顺序排列：

```text
CURRENT_NEW
PREVIOUS_NEW
DUPLICATE_REPLAY
IDENTITY_CONFLICT
```

证据至少要回答：

1. 两次 fresh generation 是否 byte-exact；
2. 每条 ordered request 是否都进入 Direct path；
3. segment 边界是否保持 ApplicationSequence、producer cursor 和业务 state 连续；
4. 一个 fresh uninterrupted Cluster 和另一个 fresh snapshot/restart Cluster 是否各实际接收 4,096 条，总计 8,192 条真实 ingress；
5. 每条 normalized result/event comparison 是否相等；
6. 全局 action 2,048 的 cut 前是否完成响应，且 Snapshot acceptance、completion 与 restart load witness 是否全闭合；
7. restart 后 suffix 是否从正确位置继续；
8. final state digest 是否三路闭合。

如果只把 generator 输出喂给 Direct，再从中抽样十条走 Cluster，就不满足 `totalActualClusterIngress=8192`。相反，若所有请求都走 Cluster，却只比较 final digest，也无法定位中途 event/result 分叉。

## 十个 candidate 分别代表一种危险实现

冻结 candidate 是：

```text
M11-OFFER-AS-SUCCESS
M11-SESSION-AS-IDENTITY
M11-CORRELATION-AS-IDENTITY
M11-RESPOND-BEFORE-BIND
M11-DROP-IDENTITY-FROM-SNAPSHOT
M11-CORRUPT-SNAPSHOT-TO-GENESIS
M11-REJECT-N-MINUS-ONE
M11-INCLUDE-RUNTIME-METADATA-IN-DIGEST
M11-DOUBLE-WRITE-LOCAL-WAL
M11-ACCEPT-UNSUPPORTED-VERSION
```

每个 candidate 必须产生可重放 counterexample，并以 `STUDENT_FAILURE` 结束。裁判自身抛异常、Cluster 没启动、deadline 超时或端口冲突只能是 `SYSTEM_ERROR`，永不计 kill。

`one-minimal` 仍只表示删除任一单项就不再复现同一 fingerprint，不是全局最短证明。若缩小历史造成非法前置条件，应标为 `INVALID_HISTORY`，同样不能计 kill。

## ReportFacts 要冻结语义，不只冻结文件 hash

manifest 的 artifact SHA-256 能证明公开文件未被改写，却不能阻止一整套失败报告被同步改写后重新计算 hash。博客侧 `evidenceContract.reportFacts` 因此要绑定权威 JSON 中的关键字段。

完成时至少应冻结这些类别，具体路径和值以真实 writer 为准：

| 报告            | 需要绑定的语义事实                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| top-level check | schema、status、contractPlanVersion、inherited M10 status                                                    |
| runtime         | member count/id、appointed leader、real component identity、actual ingress count                             |
| apply/response  | offerIsSuccess=false、apply-only mutation、bind-before-response、session/correlation identity=false          |
| differential    | generation/count、runtimeMetadataExcluded、events/results/final digest equality                              |
| codec           | request v1→response v1、v2 只协商 1/2、全部 outcome 可降 v1、optional commandId、两 binding Snapshot Golden  |
| restart         | cut=2048、Admin accepted 与 counter/toggle/RecordingLog/written digest 完成、non-null Image 同 digest loaded |
| mutants         | required/killed/classification、systemErrorCountedAsKill=false                                               |
| architecture    | coreInfrastructureFree、Aeron confined、standaloneWalDualWrite=false、serviceExternalSideEffects=false       |
| publication     | artifact count/bytes、containsAeronArchive=false、source clean、productRelease=null                          |

带 `claimId/observationField` 的 fact 还要与 manifest claim observation 交叉核对。一个 artifact 在 manifest 中只能归属一个 claim，不能为了复用而在多个 claim 重复登记同一路径。

当前没有这些完成报告，所以草稿只写字段责任，不填 `PASS`、digest 或实际数值。

## Public evidence 应小而完整

M10 为环境绑定性能资格保留了大量压缩 raw，公开目录约 460 MiB。M11 没有性能 raw 或长稳态时间序列，不应照搬这个体积。

建议公开包遵守：

```text
target total size   <= 5 MiB
hard total limit    <= 10 MiB
artifact count      <= 64
largest artifact    <= 2 MiB
Aeron archive files = 0
term/cluster-dir     = 0
```

适合公开的内容包括：

- content-addressed workload profile；
- 六份小型 binary Golden 及可读 inventory；
- fixed scenario 结果；
- generated canonical request/transcript 的压缩摘要与 digest；
- Direct/Cluster/restart comparison 报告；
- coverage、mutant、counterexample、replay；
- architecture、environment、publication inventory；
- manifest。

不应提交：

- Aeron Archive recording；
- term buffer、mark file、driver/cluster 工作目录；
- 可由 fixture 重生的巨大逐 poll 日志；
- 端口、临时绝对路径或机器私有数据；
- 与 claim 无关的 debug dump。

完整临时目录可以留在 `build/tmp/m11` 供本次诊断，测试结束后不进入 Git。公开报告应保存足够的 seed、input hash、comparison count、digest 和首个差异，使读者能在本地重跑，而不是把 runtime 文件系统本身当作证据。

## 起点与完成态的命令必须给出不同预期

完成实现的固定阅读坐标包括：

```text
course/m11-complete:matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M11CheckRunner.java
course/m11-complete:matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M11MutantSuite.java
course/m11-complete:matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M11EvidenceWriter.java
```

这些坐标是待创建、推送并验证的 complete ref；`IN_PROGRESS` 阶段只记录路径，进入 `CODE_VERIFIED` 后才转换成固定源码链接，不能把它们写成当前发布证明。

在 `course/m11-start`：

```bash
./gradlew clean build --no-daemon
# 预期：M00～M10 继承门禁保持 GREEN

./gradlew m11Check --no-daemon
# 预期：写出 schema-valid GOAL_NOT_IMPLEMENTED，然后非零退出
```

显式 M11 RED 不应让默认 root build 变红。这样读者能区分“仓库坏了”和“新能力尚未实现”。

未来完成态才允许要求：

```bash
./gradlew clean build --no-daemon
./gradlew m11Check --no-daemon
./gradlew m11Evidence -Pm11.unitTag=course/m11-complete --no-daemon
```

第二组命令现在不是通过声明。只有 clean complete source、实际 tag、manifest 和全部报告形成后，教程才能把预期改为 PASS。

运行时按文件检查事实，而不是只保留终端最后一行：

- 起点的 `build/reports/m11/check.json` 应保持 `matching.m11.check.v1 / GOAL_NOT_IMPLEMENTED`，且 `m11Check` 非零退出；
- 完成候选的 `build/reports/m11/check.json` 必须升级为 v2，并同时生成 fixed、generated、Cluster runtime、protocol、coverage、mutant/counterexample、architecture 与 environment 报告；实际 status 只能照录本次运行结果；
- `m11Evidence` 只有在 clean HEAD 与 annotated `course/m11-complete` 精确一致时，才有资格创建 `build/lab-evidence/M11/manifest.json`；tag、源码、报告或 artifact 任一漂移都必须失败关闭；
- 整套命令只在读者本地运行 Java 与 Aeron，不上传源码、不调用远程 Judge 或外部服务。

## 发布仍要经过三个独立门禁

代码完成不自动等于教程可发布：

```text
CODE_VERIFIED
  = complete tag + complete SHA + exact evidence contract

CONTENT_VERIFIED
  = five exact lessonOrder/permalink documents reviewed

PUBLISHED
  = five draft flags flipped together + public evidence copied
    + blog verifier + deploy + live route/hash verification
```

M11 五篇当前都必须保持 `draft: true`。发布时每篇正文都要引用 fixed `course/m11-complete`，不能继续只指向 start，也不能链接 `main`、`unit/m11` 或其他浮动分支。M12 必须等 M11 生产路由与 manifest hash 在线验证后才打开。

## Evidence 可以支持的最终结论仍然很窄

如果未来七项 claim 全部通过，M11 能支持的结论是：真实单节点 Aeron Cluster Adapter 在健康 apply、application request/response/snapshot version 1/2、受控 Snapshot/restart 和规范化业务语义上与 Direct runner 一致，并且没有双写 standalone WAL。

它仍不能支持三节点 quorum、leader failover、fencing、`UNKNOWN`、Cluster Backup、Cluster TPS/p99、外部 exactly-once、rolling upgrade 或 production-readiness。保留这些限制，才能让当前候选 M12 在未来签约后增加一个可检验的新复杂度，而不是替前一章补交遗漏的边界。
