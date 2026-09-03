---
title: "M12·05：用故障历史、语义反例和 Manifest 发布 matching-0.8.0"
description: "把三成员 Leader 故障实验收束成可重放裁判与内容寻址 evidence，建立 fixed scenario、executed witness、mutant、SYSTEM_ERROR、架构边界和产品停止点的发布规则。"
date: 2026-09-03T15:50:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M12
lessonOrder: 50
permalink: three-node-leader-failure-evidence
tags:
  - Evidence
  - 故障注入
  - Semantic Mutant
  - matching-0.8.0
draft: false
---

> 固定交付身份：annotated [`course/m12-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m12-complete) 与 annotated [`matching-0.8.0`](https://github.com/lcha-reln/cex-matching/tree/matching-0.8.0) 均 peeled 到 clean commit `d8b1b1fbb36323502495a8bc0a60042db1e9e040`。本站托管的 [manifest](/signal-grid-blog/practice/high-availability-cex/m12/evidence/manifest.json) SHA-256 是 `e25ff7069a831a56cc42b1ebd7d5aaf0cde39b6158caf1e68b8725b0f8862983`；本站不提供远程 Java/Aeron 环境，读者在本地运行真实实验。

三个 member 都启动过、Leader 也被杀过，并不等于高可用正确性已经证明。测试可能杀错进程，可能把 timeout 当拒绝，可能在无 quorum 时接受 response，可能丢掉 duplicate result table，甚至可能因为 Aeron 未启动而“没有观察到第二个业务效果”。如果报告只剩一行 `PASS`，这些路径无法区分。

clean completion commit 上的 `m12Evidence` 已重新运行真实 child-process fault suite 并得到 `PASS`。自动选举实际先选出 member 2，外部 controller 强杀 PID 38709 后由 member 0 在 term 1 接替；三次 `freshStart=false` 前的 ArchiveMarkFile witness 分别观察到 `ageMillis=10001/10002/13078`，均严格大于 10,000 ms，并保留各自的 stopped PID、时间戳、probe count 与单调等待耗时。最终三个 member 的 identity count 与 identity/result digest 都对齐 Direct oracle。这些是本次证据观察，不是固定等待或任意机器上的性能保证。

本篇的论点是：**`matching-0.8.0` 必须由一条可重放的真实 child-process 历史、逐项 executed witness、能杀死具体语义错误的 mutant、不会把 `SYSTEM_ERROR` 计成 kill 的 classifier probe，以及 clean tag/commit/manifest 链共同命名。** Evidence 证明的是单机、单分片三成员的 Leader 进程故障正确性，不是完整商用资格。

## 先写可判定命题，再收集日志

M12 在起点已经冻结 14 个固定场景与 25 项 proof obligation。场景是故障日程中的可理解片段，obligation 是必须从执行观察推出的性质；两者不是同一份标签清单。

例如：

| 场景                   | 关键 obligation                                                            | 需要的执行事实                                                                                             |
| ---------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 三真实成员初次选主     | `THREE_REAL_MEMBERS`、`SINGLE_INITIAL_LEADER`                              | 3 个 distinct live PID、独立目录/端口、1 Leader + 2 Follower                                               |
| Leader kill 与替代选主 | `EXTERNAL_LEADER_KILL`、`NEW_LEADER_ELECTED`、`LEADERSHIP_TERM_ADVANCES`   | kill 前重采样 fault-target ID/term、父进程强杀、替代 ID 不同且 term 高于该最新值                           |
| UNKNOWN 同身份重试     | `SAME_IDENTITY_RETRY`、`ORIGINAL_RESULT_REPLAY`、`ONE_EFFECT_PER_IDENTITY` | envelope identity byte-exact、correlation/generation 更新、唯一 binding                                    |
| former Leader catch-up | `FORMER_LEADER_RETURNS_AS_FOLLOWER`、`FOLLOWER_CATCH_UP`                   | 实时 ArchiveMarkFile 活动年龄严格大于 10,000 ms 的 witness、新 PID、保留目录、Follower role、状态/位置收敛 |
| minority 不确认        | `NO_QUORUM_NO_ACK`                                                         | 两个 Follower 停止、offer accepted、response deadline 内无可信 ACK                                         |
| 最终等价               | `MEMBER_STATE_EQUIVALENCE`、`RUNTIME_METADATA_EXCLUDED`                    | 三 member 与 Direct 的业务摘要一致，role/term/PID 不进 digest                                              |

一份报告声称 `observed=25` 不够。完成 coverage 恰好有 25 个有序 assertion fact：前 24 个由 `M12HistoryJudge` 从真实 Cluster trace 重算；最后的 `SYSTEM_ERROR_NEVER_SEMANTIC` 由三个 executable precondition/classifier probe 聚合，不是真实 Cluster fault witness。每项都要保存稳定 assertion ID、producer、观察值和 witness digest；只复制 25 个字符串不能生成 PASS，也不能把 classifier probe 冒充真实故障执行。

### Fixed schedule 需要一条完整 invocation history

真实 Cluster run 的原始事实不是“发送了 84 次”，而是每次 attempt 的可关联记录：

```text
attempt ordinal
phase in frozen schedule
client generation / correlation
durable command identity and canonical hash
ingress accepted? observed client authority
terminal invocation state
response disposition / original sequence / result digest
member and term observations around the boundary
responseAcceptedUnderCurrentClientAuthority per attempt
observedResponseAuthorityTerm per durable binding
```

这两个字段故意只描述客户端观察。前者是 client runtime 结合 generation、session/leader/term authority、correlation 与 command identity 得出的验收结论；后者只是 binding 首次从响应被观察时附带的客户端 authority term。M11 response bytes 不携带 leadership/apply term，因此 history 不能据此声称响应来自哪个实际 service apply term；那类事实只能由 application/member observation 与日程关系支持。

起点合同冻结 66 个 distinct business command 与“至少 84 次” accepted ingress；当前完成 judge 把实际日程收紧为 85 次 invocation，其中 1 次 `NOT_SUBMITTED`、恰好 84 次 accepted ingress，最终 `nextApplicationSequence=67`。数字之间的关系要能从历史重算：

- 32 条切主前 NEW；
- 8 次已 ACK duplicate；
- 1 条 applied-but-unobserved UNKNOWN 与 1 次同 identity retry；
- 32 条切主后 NEW；
- 8 次已 ACK duplicate；
- 1 条 no-quorum UNKNOWN 与 1 次 quorum 恢复后的同 identity retry。

第一个纯 `NOT_SUBMITTED` observation 不应增加 accepted ingress。UNKNOWN retry 的最终 disposition 可以按合同为 NEW 或 DUP，但整个 identity table 只能出现 66 个 binding。

历史还必须保留 phase 顺序。把所有最终结果按 command ID 排序后再比较，会抹掉“response 在哪个 Leader、哪一 generation 下被接受”和“故障发生在 UNKNOWN 前还是后”的关键信息。

## Mutant 要表达会伤害用户的语义错误

M12 冻结八个 required mutant：

```text
M12-OFFER-AS-ACK
M12-TIMEOUT-AS-REJECTED
M12-RETRY-WITH-NEW-IDENTITY
M12-DUPLICATE-AS-NEW-EFFECT
M12-MINORITY-ACK
M12-ACCEPT-STALE-LEADER-AUTHORITY
M12-DROP-IDENTITY-DURING-CATCH-UP
M12-INCLUDE-TERM-IN-SEMANTIC-DIGEST
```

它们分别破坏 offer/ACK、UNKNOWN、identity、duplicate、quorum、authority、catch-up 与状态边界。八个 mutant 只运行在 deterministic semantic history model 上，不是真实 Aeron Cluster fault execution，也不能充当 Cluster evidence；一个 candidate 只有让这条语义裁判得到业务 `STUDENT_FAILURE`，并保存可重放 counterexample，才算被杀死。

下列结果都不能计 kill：

- 测试进程异常退出；
- Aeron 无法 bind 端口；
- child JVM 没启动；
- history JSON 损坏；
- deadline 或环境资源不足；
- 裁判写入证据的 pre-fault、pre-stop 或 final stable member-status snapshot 捕获到三类已知 fail-stop 形状之外的 Aeron `WARN`，或其中 `droppedDiagnosticWarnings` 非零；
- mutant 根本没有触达其声明的语义分支。

“报错了”不等于“裁判识别了错误语义”。Counterexample 至少要指出首次违反的 obligation、对应 attempt/member observation、expected/actual 与重放 fingerprint。

## SYSTEM_ERROR classifier probe 不得冒充基础设施注入

三个 control 不模拟学生错误，它们的最低合同是探测裁判分类器能否把系统/环境异常保留为 `SYSTEM_ERROR`：

```text
M12-NON-LEADER-FAULT-TARGET-CONTROL
M12-CLUSTER-STARTUP-CONTROL
M12-CORRUPT-HISTORY-OUTPUT-CONTROL
```

期望不是让 suite 绿色，而是得到明确 `SYSTEM_ERROR` 且 `countedAsKill=false`。这三个名称分别对应：

- 杀错 member 却拿 Leader 存活当“成功切主”；
- Cluster 根本没起来却拿无 ACK 当“少数派安全”；
- 损坏或缺字段的报告被默认值补成 PASS。

如果某个 probe 只是 hardcoded exception，它只能证明 classifier/counting contract，不能称为已破坏或保护了真实 fault-target resolver、Cluster startup 或 history parser 路径。只有报告记录了实际 resolver/preflight/parser seam 且可重放时，才能升级对应声明。无论 probe 深度如何，真实 no-quorum accepted-but-unconfirmed 窗口若构造失败，必须让整个完成 gate 以 `SYSTEM_ERROR` 失败关闭，不得退化为 NOT_SUBMITTED 后计 PASS。

## 架构证据保护继承边界

M12 的运行时复杂度增加很多，但允许改变的业务面积很小。Architecture/inherited report 应至少证明：

- `matching-core` 相对 `course/m11-complete` byte-identical；
- M11 六份 request/response/snapshot Golden byte-identical；
- 不宣称整个 M11 adapter 源码不变：M12 明确修正 `M11ClusteredMatchingService` 的 undelivered-egress 行为，已绑定的业务结果在 best-effort egress 无法交付时保留为可同 identity 重放的结果，并由 `M11BoundedProgressTest` 的行为测试覆盖；
- Aeron 依赖仍只存在于 Cluster runtime/adapter 允许边界；
- `ClusteredService` 没有 standalone WAL、数据库、HTTP、Counter/Rest 或外部副作用路径；
- fault controller 位于 testkit/父进程，production service 不决定故障；
- 三个 member 由 child JVM 启动，并存在父进程强制终止路径；
- runtime metadata 没有进入 durable identity 或业务 digest。

静态源码扫描只能支持所检查 source graph 的结论，不能写成“任何动态加载都绝无可能”。真实 PID/status/history 则支持本次执行路径，两类证据互补，不能互相冒充。

## `m12Check` 必须现场运行真实故障日程

固定完成 tag 上的普通门禁是：

```bash
git switch --detach course/m12-complete
./gradlew clean build --no-daemon --max-workers=1
./gradlew m12Check --no-daemon --max-workers=1
```

`m12Check` 写出 strict `matching.m12.check.v2`，并由相应 JSON Schema 再读回验证。发布 PASS 来自真实 `REAL_AERON_CHILD_PROCESSES` history，不使用 deterministic model control 代替三成员运行。裁判写入证据的 pre-fault、pre-stop 与 final stable member-status snapshots 只允许 `leader heartbeat timeout`、`inactive follower quorum` 与带数字 `leaderCommitPosition`/`quorumPosition` 的 `quorum position went backwards` 三种完整 Aeron fail-stop warning；这些快照中的任何未知 warning 或 dropped warning 都必须沿异常路径得到 `SYSTEM_ERROR`。正常 teardown 后的 `log recording stopped: eos=true` 不在这项发布证据断言内。`m12Evidence` 已在 clean completion/product-tag commit 上绑定 fresh run，而不是复用开发期间报告。

报告树应把不同证明责任拆开，而不是复制一个大 JSON：

- inherited M11 与 architecture；
- frozen corpus 和 canonical command bytes；
- invocation history；
- topology / leadership / quorum / catch-up；其中 topology 必须包含三项完整 restart-safety witness，catch-up 必须用 ordinal 和完整对象绑定 former Leader 首次回归的 witness；
- state equivalence 与 Direct comparison；
- coverage witness ledger；
- mutants、counterexamples 与 strict replay；
- environment 与 correctness-only scope。

控制台摘要只是导航。裁判的权威事实应能从这些 child report 重新计算，且每个关键 report 都必须独立通过自己的 strict JSON Schema。仅顶层 `check.json` 有 Schema、子报告只携带 `schemaVersion` 或 hash，不足以宣称其字段集与语义已失败关闭；当前公开 manifest 已登记最终 Schema 清单及每个 artifact 的 hash。

## Evidence 只能在 clean、tag-bound 提交生成

完成实现通过后，先把最终代码提交到一个 clean commit，再让以下 ref 收敛：

```text
main
unit/m12
annotated course/m12-complete
annotated matching-0.8.0
```

`contract/m12-revision` 与 annotated `course/m12-start` 继续停在结构化 RED，不得移动。确认完成与产品 tag peeled 到同一提交后，运行：

```bash
./gradlew m12Evidence --no-daemon --max-workers=1
```

Evidence writer 必须重新运行或严格绑定同一次真实 gate，而不是把开发期间某份临时 PASS 复制进 bundle。目标路径为：

```text
build/lab-evidence/M12/manifest.json
```

manifest 使用 `cex.lab-evidence.v2`，至少绑定：

- case/project/unit、PLAN v0.15；
- `unitTag=course/m12-complete`；
- `productRelease=matching-0.8.0`；
- 40 位 source commit、`dirty=false`；
- Java/OS/arch 与 correctness-only 环境说明；
- 有序 claim、每项 statement/command/observations/artifacts；
- 每个 artifact 的相对路径与 SHA-256；
- 与实现完全一致、非空且有序的 limitations；
- RFC 3339 UTC `generatedAt`。

站点发布时复制整个 M12 bundle 到固定静态路径，再冻结 manifest 文件自身的 SHA-256 与关键 `reportFacts`。不能手工改 child report 后重新计算 hash 来掩盖失败，因为 verifier 还会把 report field 与 claim observation 交叉核对。

### ReportFacts 应冻结关系，不冻结偶然值

发布前必须从实际完成 bundle 读取并登记关键事实。适合冻结的包括：

| 类别    | 应登记的事实                                                                                                                                                                                                                                                                                                                                                                     |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 身份    | schema、unit、status、PLAN、source commit/dirty、completeRef、product release                                                                                                                                                                                                                                                                                                    |
| 语料    | workload SHA、seed、14 fixed、25 obligation、8 mutant、3 control、66 identity、85 invocation、84 accepted ingress、最终 next sequence=67                                                                                                                                                                                                                                         |
| 拓扑    | real child-process scope、member count=3、quorum=2、报告字段 `aeronAppointedLeaderId=-1`、任意自动初选 member、distinct PID/目录/端口、外部 fault controller                                                                                                                                                                                                                     |
| 切主    | `faultTargetLeaderId`/`faultTargetLeadershipTermId` 是 kill 前最新稳定 authority，killed member 与之相同，replacement ID 不同且 term 严格更高，本次 frozen history 的 `staleLeaderAcknowledgements=0`；不把它写成真实 delayed old-egress 注入                                                                                                                                    |
| UNKNOWN | 两个 accepted UNKNOWN、same-identity retry、唯一 binding、允许的 NEW/DUP 分支；attempt 的 `responseAcceptedUnderCurrentClientAuthority` 与 binding 的 `observedResponseAuthorityTerm` 只表达客户端验收/观察，不冒充 response wire 的 apply term                                                                                                                                  |
| 追赶    | topology 的 `archiveMarkFileLivenessTimeoutMillis=10000`、`restartSafetyPredicate=ARCHIVE_MARK_FILE_ACTIVITY_AGE_GT_LIVENESS_TIMEOUT`、`restartSafetyWitnessCount=3` 与三项 `restartSafetyWitnesses`；catch-up 的 `firstReturnRestartSafetyWitnessOrdinal`/`firstReturnRestartSafetyWitness`；former Leader 新 PID、Follower role、三 member state/identity/position convergence |
| 少数派  | 无 quorum 期间可信 ACK=0、恢复 quorum 后收敛                                                                                                                                                                                                                                                                                                                                     |
| 裁判    | coverage required/observed、executed witness ledger、mutant required/killed、SYSTEM_ERROR 不计 kill、replay exact                                                                                                                                                                                                                                                                |
| 等价    | 三 member `identityResultCount=66`，且每个 `identityResultDigest` 与 Direct oracle expected digest 相同；semantic state 与允许比较的位置关系也闭合                                                                                                                                                                                                                               |
| 诊断    | evidence-captured pre-fault/pre-stop/final stable member-status snapshots 的 component error=0；warning 只允许三类完整 fail-stop 形状，`droppedDiagnosticWarnings=0`；这些快照中的未知或丢失 warning 必须是 `SYSTEM_ERROR`，不泛化到 teardown 后日志                                                                                                                             |
| 边界    | core/M11 Golden unchanged、external side effects absent、performance qualified=false                                                                                                                                                                                                                                                                                             |

不应该预先冻结：替代 Leader 必须是 1、term 必须等于 2、选主必须在某个毫秒数内、绝对 log position 或某台开发机的 PID。这些是本次运行 observation，可以留在 artifact 中，但不是跨环境的业务正确性常量。

每项 restart-safety witness 的严格字段集为 `ordinal`、`memberId`、`stoppedProcessId`、`archiveMarkFile`、`lastActivityTimestampMillis`、`observedAtMillis`、`ageMillis`、`livenessTimeoutMillis`、`probeCount`、`waitElapsedNanos`、`aeronVersion`、`predicate`、`activityTimestampPositive` 和 `ageStrictlyExceedsLivenessTimeout`。发布合同可以预先要求 `livenessTimeoutMillis=10000`、`aeronVersion=1.52.2`、固定 predicate 与两个布尔值为真；具体 ordinal/member/PID/path/timestamp/age/probe/wait，以及 catch-up 最终引用的 ordinal，必须原样取自完成 tag 上的真实运行，本文不会提前填写。

## Limitations 是产品版本含义的一半

`matching-0.8.0` 的名称容易让读者误解成“撮合已经生产就绪”。最终 manifest 和教程必须保留至少这些边界：

- 三个 member 在同一台机器上，只证明进程隔离，不证明主机/磁盘隔离；
- 只覆盖一个静态 shard 和固定语料；
- 只注入当前 Leader 的 process fail-stop 与两个 Follower 停止形成的无 quorum 窗口；
- 不覆盖任意网络分区、非对称延迟、时钟故障或完整 split-brain matrix；
- 不运行 Cluster Backup/restore、主机/磁盘丢失、断电或跨地域 DR；
- 不提供 TPS、percentile、failover-under-load、RTO、SLO 或 Cluster 容量；
- 不覆盖 rolling/mixed-version upgrade、rollback 或 N-2；
- 不覆盖多 shard、路由、迁移或再均衡；
- 不提供可续接 Execution/Market output；
- 不包含 Counter、Rest、数据库、HTTP、WebSocket、结算或外部副作用；
- 真实 child-process 日程没有注入跨 client generation 的 delayed old-egress；这条拒绝逻辑只有 unit/semantic-model evidence；
- 14/25/8/3 是有限证据，不是形式化完备；
- 本地环境结果不能外推成任意硬件、操作系统或网络的资格。

限制不是免责声明附件，而是版本语义。删除其中任意一项，就等于扩大产品 claim，必须增加相应实现与证据，不能靠文案升级。

## 网站为什么只托管静态副本

浏览器适合解释时间线、展示报告、让读者预测 UNKNOWN 或 ACK；它不适合在公共站点里编译不受信任 Java、启动三个 Aeron member 或向宿主机注入故障。M12 因而坚持本地优先：

```text
reader local repository:
  compile + run + spawn child JVM + kill + judge + export evidence

Signal Grid:
  immutable tutorial + manifest + hashed reports + explanations
```

这不是功能缩水，而是权限和可信边界。读者可以从固定 tag 完整复现；站点无需持有远程执行权限、源码上传或多进程沙箱。网页动画也不能冒充真实 Aeron 证据。

## 发布证据链已经闭合

M12 的连续证据链已经完成：结构化 RED 起点不动；完成代码位于 clean commit `d8b1b1fbb36323502495a8bc0a60042db1e9e040`；最终提交重新运行全量 build 与 `m12Check`；8 个 mutant 均以业务失败被杀；3 个 control 均保持 SYSTEM_ERROR 且不计 kill；完成 tag 与产品 tag 同指一个提交；`m12Evidence` 生成 33 个 artifact 的 content-addressed bundle；博客复制原始 bundle并登记 manifest SHA 与 reportFacts；五篇教程同时从 draft 转为公开。

`course/m12-complete` 给出课程复现点，`matching-0.8.0` 给出产品停止点：一个单机、单分片三成员 Cluster 能在 Leader 进程故障和短暂无 quorum 后，以同 identity 重试和 follower catch-up 收敛到一个业务效果。其余商用能力继续留在明确边界之外。
