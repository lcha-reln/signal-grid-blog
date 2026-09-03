---
title: "M11·05：为单节点 Aeron Adapter 设计可复核 Evidence"
description: "把结构化 RED、真实 Cluster、六份 codec Golden、Direct/Cluster 差分、Snapshot restart、mutant 与架构边界组织成紧凑证据，并逐项对照冻结合同与实际观察。"
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
draft: false
---

> 发布状态：annotated [`course/m11-start`](https://github.com/lcha-reln/cex-matching/tree/course/m11-start) 保留历史 [结构化 RED 合同](https://github.com/lcha-reln/cex-matching/blob/course/m11-start/docs/specs/m11.md)；annotated [`course/m11-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m11-complete) 固定了通过实现与 PASS 报告。公开 evidence 路径为 `/practice/high-availability-cex/m11/evidence/manifest.json`，可在 [manifest](/signal-grid-blog/practice/high-availability-cex/m11/evidence/manifest.json) 逐项复核。

“启动过一次单节点 Cluster”不是证据，“Direct 和 Cluster 最后盘口一样”也不够。前者没有证明业务一定从 log apply 推进，后者可能漏掉 original result、事件顺序和 identity table。相反，把整个 Aeron Archive 和数百兆 driver 日志提交进博客，也不会自动提高结论质量，只会让证据难以审阅和长期维护。

M11 的证据设计遵循一个原则：**每项公开 claim 都绑定能直接支持它的最小 artifact；冻结输入与实际观察分开；环境错误不能伪装成业务失败；完整 runtime 临时目录不进入 Git。**

## 冻结合同必须与实际观察逐项对账

起点数字只定义“裁判必须运行什么”；complete 报告才回答“本次到底观察到了什么”。M11 的对账结果如下：

| 证据面             | 冻结合同                                                | complete tag 的实际观察                                      |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------ |
| fixed scenarios    | 22 个固定场景                                         | 22/22 PASS，每个保留 scenario ID 与 observation                  |
| generated corpus   | `splitmix64-v1`、seed `6111`、32 段×128 action          | 连续 corpus 两条 Cluster 路径分别完成 4,096/4,096 action     |
| real ingress       | uninterrupted 与 restart 必须各走全量 Cluster ingress | 共观察 8,192 次真实 Cluster ingress                            |
| Snapshot cut       | action 2,048 后切分历史                               | 前缀 1,536 NEW + 512 duplicate；恢复后首条 NEW 的 sequence=1537 |
| restart suffix     | duplicate/conflict 不得产生第二个业务效果              | 512 个跨 Snapshot duplicate 和 1,024 个 conflict 全部通过      |
| proof obligations  | 28 项                                                    | 28/28 PASS                                                         |
| assertion ledger   | 不得以一个总 PASS 掩盖局部证明                          | fixed/coverage ledger 记录 32 条 assertion fact                    |
| semantic faults    | 10 个由 production 组件派生的单故障 candidate                | 10/10 都产生 fresh persisted replay 并通过 one-delete audit；replay 不启动 Aeron |
| judge controls     | 3 个环境/裁判故障不得计为 kill                            | 3/3 保持 `SYSTEM_ERROR`，且 `systemErrorCountedAsKill=false`       |
| report inventory   | 报告集合必须完整、无重复绑定                              | 12 份 child report                                               |
| evidence inventory | 公开 artifact 需逐文件哈希并限制体积                         | manifest 绑定 27 个 payload artifact；公开目录另含 manifest，共 28 个文件 |
| runtime identity   | 真实 localhost 单 member Cluster                              | Aeron `1.52.2`、Agrona `2.5.0`、member 0 / `LEADER`             |
| teardown           | 按所有权关闭并收集 component error                         | teardown 结束后无 component error                              |

这个表的用途不是让两列数字“看起来一样”，而是防止把冻结规模偷换成运行结果。具体 digest、artifact SHA-256 和每个观察字段仍以公开 manifest 及其绑定报告为准。

## 七项 claim 应形成一条因果链

`cex.lab-evidence.v2` manifest 的 claim identity 已在起点冻结，complete evidence 保持同一顺序并将七项全部判为 PASS：

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

`single-node-clustered-service` 绑定真实 localhost Media Driver、Archive、Consensus Module 和 Service Container 的启动身份、member 0/appointed leader 0、实际 role=`LEADER`、8,192 次 ingress 与 bounded deadline/error capture。fake queue 只能作局部测试，不能进入这项 claim。

### 提交链证明“offer 不是成功”

`correlated-apply-response` 绑定 offer-accepted、log callback、result bind、response offer 的顺序观察，证明 session/correlation 不充当 durable identity，response publication 不反向改变业务状态。

### 差分证明“Adapter 没改业务语义”

`direct-cluster-business-equivalence` 绑定同一 ordered bytes 在 Direct 与 actual Cluster 的逐条规范化 result/events、comparison count 和 final semantic digest。报告同时保存 runtime metadata，但 equality projection 明确排除它们。

### Restart 证明“恢复仍忠实”

`cluster-snapshot-restart` 绑定全局 action 2,048 后 Admin snapshot 请求的 `OK`，并把它与真正完成分开：关闭前必须同时记录 snapshot counter 增量、toggle `NEUTRAL`、Recording Log 中 service `-1/0` 的新 recording ID 与同 term/position、Service 写出的 payload digest；fresh reopen 后还要证明 `onStart` 消费 non-null Image 并加载相同 digest/application sequence。之后才检查 suffix continuity、duplicate original result 和最终 digest。

### Codec 与 candidate 证明“反面路径会被抓住”

`protocol-compatibility-and-mutants` 绑定六份 request/response/snapshot version 1/2 Golden、current2/minReadable1 matrix、范围外版本/损坏输入，以及十个 executable semantic candidate。报告观察到 10/10 个 candidate 被 `STUDENT_FAILURE` 反例杀死，对应 10 份 fresh persisted replay 通过 one-delete audit；三个 throwing/environment control 保持 `SYSTEM_ERROR`。

### 架构与身份证明“证据来自要发布的源码”

`architecture-and-unit-identity` 绑定 core 无 Aeron、callback 可达 production source graph 无 standalone-WAL/API reference、ClusteredService 无外部业务副作用、Aeron `1.52.2` / Agrona `2.5.0`，以及 clean source、complete tag 和 `productRelease=null`。Java/OS/arch 位于 manifest 顶层环境，`environment.json` 由 `single-node-clustered-service` claim 绑定；27 个 payload artifact 的 SHA-256 则由 manifest 的各项 claim 共同登记。这项 WAL 观察是可达源码图证据，不是运行时写入计数器；Aeron runtime 自身的网络/文件 I/O 也不是这里的禁止项。

M11 是普通课程单元，不创建产品 release。`matching-0.8.0` 属于其他单元的产品决策；M11 manifest 若出现任何产品 release，就已经越过本单元合同。

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

它们按机制可以归为五组：codec fail-closed、真实 runtime、identity/response、Direct/Cluster equality、Snapshot/restart。fixed 报告观察为 22/22 PASS，同时保留每个 scenario ID、执行状态，以及 assertion ID、observed value、observation SHA-256 与 witness SHA-256，因而不是一个没有过程的总计数。

例如 `SNAPSHOT_STATE_EXACT_AFTER_RESTART` 与 `SNAPSHOT_IDENTITY_RESULT_SURVIVES` 必须分开：前者关心完整业务状态，后者关心 duplicate/conflict 的 original result。只验证订单簿会漏掉后一类错误。

## Generated differential 必须真的走 8,192 次 Cluster ingress

生成器使用 seed `6111`，把 32 个 128-action segment 连接成一个连续 4,096-action corpus；它们不是 32 个 fresh-state history。顺序由合同中的显式段表冻结：

```text
CURRENT_NEW[0..7]
→ DUPLICATE_REPLAY[0..3]
→ PREVIOUS_NEW[0..7]
→ DUPLICATE_REPLAY[4..7]
→ IDENTITY_CONFLICT[0..7]
```

这让 Snapshot 前缀精确成为 1,536 个 NEW 加 512 个 duplicate，保存 `applicationSequence=1536/next=1537`；恢复后的第一条真实 ingress 是 NEW，而不是仅靠读取 Snapshot 字段推断“sequence 会继续”。suffix 中随后还有 512 个跨 Snapshot duplicate 和 1,024 个 conflict，必须逐条核对完整 original result 与零状态变化。

证据至少要回答：

1. 两次 fresh generation 是否 byte-exact；
2. 每条 ordered request 是否都进入 Direct path；
3. segment 边界是否保持 ApplicationSequence、producer cursor 和业务 state 连续；
4. 一个 fresh uninterrupted Cluster 和另一个 fresh snapshot/restart Cluster 是否各实际接收 4,096 条，总计 8,192 条真实 ingress；
5. 每条 normalized result/event comparison 是否相等；
6. 全局 action 2,048 的 cut 前是否完成响应，且 Snapshot acceptance、completion 与 restart load witness 是否全闭合；
7. restart 后第一条真实 NEW 是否得到 application/producer sequence 1537，随后 512 个跨 Snapshot duplicate 是否完整复现原结果；
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

每个 candidate 都产生了可重放 counterexample，并以 `STUDENT_FAILURE` 结束。完成结果是 10/10 个由真实 production 组件派生的单故障 candidate、10 份 fresh persisted replay 与 10 次 one-delete audit；这些 candidate replay 使用 production codec、Direct runtime 和 completion boundary，但不启动真实 Aeron。裁判自身抛异常、Cluster 没启动、deadline 超时或端口冲突只能是 `SYSTEM_ERROR`，永不计 kill；8,192 次真实 Cluster ingress 与 Snapshot/restart 由另外两项 runtime claim 证明。

`one-minimal` 仍只表示删除任一单项就不再复现同一 fingerprint，不是全局最短证明。若缩小历史造成非法前置条件，应标为 `INVALID_HISTORY`，同样不能计 kill。

## ReportFacts 要冻结语义，不只冻结文件 hash

manifest 的 artifact SHA-256 能证明公开文件未被改写，却不能阻止一整套失败报告被同步改写后重新计算 hash。博客侧 `evidenceContract.reportFacts` 因此要绑定权威 JSON 中的关键字段。

公开 `reportFacts` 已将下列语义事实冻结为 manifest 验收合同：

| 报告            | 已绑定的语义事实                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| top-level check | schema、`PASS`、contractPlanVersion、inherited M10 status，以及 12 份 child report inventory                          |
| runtime         | member count/id、appointed leader 0、actual role `LEADER`、Aeron/Agrona 版本、8,192 次 ingress、teardown 无 component error |
| apply/response  | offerIsSuccess=false、apply-only mutation、bind-before-response、session/correlation identity=false                             |
| differential    | fresh generation byte-exact、4,096/4,096 action、runtimeMetadataExcluded、events/results/final digest equality                   |
| codec           | request v1→response v1、v2 只协商 1/2、全部 outcome 可降 v1、optional commandId、两 binding Snapshot Golden                     |
| restart         | cut=2048、1,536 NEW+512 duplicate、first sequence=1537、512 跨 Snapshot duplicate、1,024 conflict                     |
| coverage        | 28/28 obligation、32 条 assertion fact、三个 `SYSTEM_ERROR` control 不计 kill                                              |
| mutants/replay  | 10/10 production-component-derived single-fault candidate、10 份 fresh persisted replay、10 次 one-delete audit；不冒充 Aeron fault path |
| architecture    | coreInfrastructureFree、Aeron confined、callback-reachable source graph 无 standalone-WAL/API reference、serviceExternalSideEffects=false |
| publication     | 27 个 artifact、containsAeronArchive=false、source clean、productRelease=null                                               |

带 `claimId/observationField` 的 fact 还要与 manifest claim observation 交叉核对。一个 artifact 在 manifest 中只能归属一个 claim，不能为了复用而在多个 claim 重复登记同一路径。

这些字段由 manifest 中的 artifact hash 与 claim observation 双重绑定；读者仍应打开对应 child report 查看数据，不应只读本文的摘要数字。

## Public evidence 应小而完整

M10 为环境绑定性能资格保留了大量压缩 raw，公开目录约 460 MiB。M11 没有性能 raw 或长稳态时间序列，不应照搬这个体积。

公开包遵守以下上界：

```text
target total size   <= 5 MiB
hard total limit    <= 10 MiB
artifact count      <= 64
largest artifact    <= 2 MiB
Aeron archive files = 0
term/cluster-dir     = 0
```

manifest 绑定的 27 个 payload artifact 覆盖：

- content-addressed workload profile；
- 六份小型 binary Golden 及可读 inventory；
- fixed scenario 结果；
- generated canonical request/transcript 的压缩摘要与 digest；
- Direct/Cluster/restart comparison 报告；
- coverage、mutant、counterexample、replay；
- architecture 与 environment 报告。

公开目录还包含 manifest 本身，因此磁盘上共 28 个文件；“27”只表示由 manifest 绑定的 payload artifact 数。

不应提交：

- Aeron Archive recording；
- term buffer、mark file、driver/cluster 工作目录；
- 可由 fixture 重生的巨大逐 poll 日志；
- runtime 目录内容、密钥、token 或其他 secret；报告会保留端口块、本机临时路径、FileStore 和系统环境字段，用来限定这一次观察，而不是提供可移植配置；
- 与 claim 无关的 debug dump。

完整临时目录可以留在 `build/tmp/m11` 供本次诊断，测试结束后不进入 Git。公开报告保存 seed、input hash、comparison count、关键 digest 和等价判定；它没有声称保存首个差异位置，失败定位仍需本地重跑，也不能把 runtime 文件系统本身当作证据。

## 起点与完成态的命令必须给出不同预期

通过实现的固定阅读坐标包括：

- [`M11CheckRunner.java`](https://github.com/lcha-reln/cex-matching/blob/course/m11-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M11CheckRunner.java)
- [`M11MutantSuite.java`](https://github.com/lcha-reln/cex-matching/blob/course/m11-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M11MutantSuite.java)
- [`M11EvidenceWriter.java`](https://github.com/lcha-reln/cex-matching/blob/course/m11-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M11EvidenceWriter.java)

这三个链接锁定 annotated complete tag，分别对应顶层裁判编排、由 production 组件派生的单故障 candidate 与发布证据身份；第二项不是实际 Aeron fault path。

在 `course/m11-start`：

```bash
./gradlew clean build --no-daemon
# 预期：M00～M10 继承门禁保持 GREEN

./gradlew m11Check --no-daemon
# 预期：写出 schema-valid GOAL_NOT_IMPLEMENTED，然后非零退出
```

显式 M11 RED 不会让默认 root build 变红。这样读者能区分“仓库坏了”和“当时的新能力存在实现缺口”。

在 `course/m11-complete` 运行：

```bash
./gradlew clean build --no-daemon
./gradlew m11Check --no-daemon
./gradlew m11Evidence -Pm11.unitTag=course/m11-complete --no-daemon
```

这组命令已在 clean complete source 上 PASS，并产生 12 份 child report 与 27 个 manifest artifact。结论仍以报告内容为准，不用终端最后一行代替业务观察。

运行时按文件检查事实，而不是只保留终端最后一行：

- 起点的 `build/reports/m11/check.json` 应保持 `matching.m11.check.v1 / GOAL_NOT_IMPLEMENTED`，且 `m11Check` 非零退出；
- complete tag 的 `build/reports/m11/check.json` 为 v2/PASS，并同时生成 fixed、generated、Cluster runtime、protocol、coverage、mutant/counterexample/replay、architecture 与 environment 报告；
- `m11Evidence` 只有在 clean HEAD 与 annotated `course/m11-complete` 精确一致时，才有资格创建 `build/lab-evidence/M11/manifest.json`；tag、源码、报告或 artifact 任一漂移都必须失败关闭；
- 整套命令只在读者本地运行 Java 与 Aeron，不上传源码、不调用远程 Judge 或外部服务。

## 发布通过三个独立门禁

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

五篇教程已一次性切换为 `draft: false`，每篇都引用 fixed `course/m11-complete`，不使用 `main`、`unit/m11` 或其他浮动分支作为发布证明。M11 只有在生产路由和 manifest hash 线上验证通过时，才为下一单元打开实施窗口。

## Evidence 可以支持的最终结论仍然很窄

M11 的七项 claim 已全部通过。它能支持的结论是：真实单节点 Aeron Cluster Adapter 在健康 apply、application request/response/snapshot version 1/2、受控 Snapshot/restart 和规范化业务语义上与 Direct runner 一致；callback 可达 production source graph 中不存在 standalone-WAL/API reference。后一句严格限定在源码图观察域，不是运行时 write counter。

它仍不能支持三节点 quorum、leader failover、fencing、`UNKNOWN`、Cluster Backup、Cluster TPS/p99、外部 exactly-once、rolling upgrade 或 production-readiness。它也不是性能证据，更不是生产就绪声明。保留这些限制，才能让下一单元只增加一个可检验的新复杂度，而不是替 M11 补交遗漏的边界。
