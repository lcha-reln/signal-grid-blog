---
title: "M10·05：用同源 Evidence 封存 matching-0.5.0"
description: "把结构化 RED、有界准入裁判、open-loop 资格、降序长稳态晋级、逐 attempt 恢复重放、mutant 和 clean tag/manifest 绑定为 matching-0.5.0 的可复核停止点。"
date: 2026-09-02T09:50:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M10
lessonOrder: 50
permalink: matching-0-5-0-release-evidence
tags:
  - 撮合引擎
  - Release Evidence
  - 性能资格
draft: false
---

> 完成身份：annotated [`course/m10-start`](https://github.com/lcha-reln/cex-matching/tree/course/m10-start) 的 tag object 为 `1aad7f297c9293b901996d42568151e88a9bf84e`，peeled 到 `c93a5afff277c05068143a6f51d1b8d14508beb2`；annotated [`course/m10-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete) 与 annotated [`matching-0.5.0`](https://github.com/lcha-reln/cex-matching/tree/matching-0.5.0) 的 tag object 分别为 `057d8b6d08e8dec415e4c956e2dfcb9d3f0f4891` 与 `ca6db6bfdf7c0834a61dd52eeeb5471f61635011`，均 peeled 到 clean source [`77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete)。

> 公开复核从 [`manifest.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/manifest.json) 开始，manifest SHA-256 为 `03134fc4e80e6a29ba425a1e383d393af0cceeb1692b865e2c4c833b45bcc717`。它使用 `cex.lab-evidence.v2`，绑定 7 项 claim、11 条 limitation 与 219 个唯一 artifact；再加 manifest 本身，公开 evidence tree 共 220 个文件。

性能单元最容易出现一种“证据倒置”：先决定要发布一个漂亮数字，再挑一次最好运行、删除 overload、补一张环境表，最后给 commit 打 tag。这样的 artifact 再多，也只能证明一组文件曾经生成，不能证明产品合同从起点到发布都没有移动。

M10 的发布链顺序相反：annotated start ref 先冻结工作负载、义务、错误候选和五篇 permalink；production 实现与 judge 在同一输入上从 RED 走到 GREEN；release environment 再生成 open-loop、资源和 qualification-v2 长稳态晋级观察；最后把 complete tag 与产品 tag 绑定到同一个 clean commit，并由 manifest 逐项哈希所有候选与 attempt artifact，包括较高档的失败证据。

`matching-0.5.0` 的含义因此不是“最快的撮合引擎”，而是：**M09 可恢复单机 runtime 之上，有界准入、pre-WAL overload、环境绑定 capacity envelope 与负载中正确性形成一条可独立复核的证据链。**它已是这个边界明确的产品停止点，仍不是高可用集群。

## 起点 RED 冻结评测空间，而不是预演成功

M10 的结构化起点报告使用 `matching.m10.check.v1 / GOAL_NOT_IMPLEMENTED`。完成态普通 `m10Check` 则必须生成并校验 `matching.m10.check.v2`，真实 smoke 与 deterministic diagnostic 在 v2 中仍是不同证据来源。起点冻结：

```text
20 admission/methodology fixed scenarios
seed 6010
64 histories × 256 actions = 16,384 generated admission-model actions
4 lanes: BELOW_CAPACITY / QUEUE_FULL / CHECKPOINT_PAUSE / FAIL_CLOSE_RETRY
28 obligations
12 executable mutants
5 tutorial permalinks
```

这些既是合同规模，也是 complete evidence 重新回答的同一组输入。start ref 上 judge 以 schema-valid RED 非零退出；complete tag 已存在也不会改变历史起点的结果，因此 RED 仍可独立复核。

冻结输入的价值是防止实现完成后删掉最难 scenario、换 seed、减少 actions 或重命名错误候选。有限 corpus 仍不是穷尽证明，但它让读者能判断 complete 是否回答了起点提出的同一个问题。

annotated start ref 冻结结构化 RED；顶部的 complete/product tag object、peeled commit 与 manifest hash 则冻结 GREEN 与发布身份，两端不会因后续分支变化而漂移。

## GREEN 必须同时包含语义裁判和测量方法裁判

M10 的 28 项 obligation 可以按五条证明链理解：

| 证明链            | 代表性义务                                                                                          | 主要反对什么                                          |
| ----------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 有界准入          | finite capacity、non-blocking、queue bounded、caller bytes owned                                    | 无界积压、blocking producer、caller buffer 竞态       |
| mutation boundary | full reject、pre-WAL、pre-apply/identity、enqueue≠ACK                                               | 拒绝后已有持久副作用、入队冒充 durable outcome        |
| owner 生命周期    | single worker FIFO、same-envelope checkpoint retry、failure close、quiesce/drain                    | 重排、重复命令、悬挂 completion、失败后继续 apply     |
| 测量守恒          | offer/completion reconciliation、open-loop、scheduled origin、raw percentile、environment           | coordinated omission、漏算 overload、不可重算 summary |
| 发布正确性        | deterministic knee、above-knee rejection、resource dimensions、reopen/replay、system error boundary | 挑最好 rate、资源盲区、负载中语义损坏、异常冒充 pass  |

固定场景负责构造具名边界，generated admission model 在四条 lane 上扩展状态组合。两者都要保存 seed、action grammar、counterexample 与 canonical digest；但 generated model 不能冒充真实 JVM scheduling，release qualification 也不能替代确定性语义裁判。

完成态 `m10Check` 还必须真实运行一次全新的 `CI_SMOKE`，而不是让上面的确定性 method model 冒充端到端 runner。Gradle 依赖链先执行实际 `LocalMatchingService + WAL/Snapshot + checkpoint + raw artifact + fresh reopen`，再跑全部 artifact Schema probe；`M10CheckRunner` 随后用独立 release-bundle verifier 复核同一 smoke bundle，并把它标为 `REAL_CI_SMOKE_BUNDLE / METHOD_SMOKE_ONLY`。model-clock 结果只能进入 `deterministicDiagnostic`，不能替代或伪造这条 runtime 证据。

累计 M00～M09 回归要在负载实现前后保持 GREEN，且架构报告把 `matching-core` delta 限定为 `M10_HOT_PATH_AUDIT_SPLIT_ONLY`：只把全量 retained-order audit 从逐命令热路径拆到 cold boundary，业务合同和 terminal identity retention 保持不变；production module 也不得依赖 JMH/benchmark/testkit。这避免为了追数字而偷偷改变撮合、WAL 或 Snapshot 语义。

## Mutant 只有被语义反例击中才算 kill

冻结的 12 个 executable mutant 是：

```text
M10-UNBOUNDED-QUEUE
M10-BLOCKING-PUT
M10-REJECT-AFTER-WAL
M10-REJECT-BINDS-IDENTITY
M10-ENQUEUE-AS-ACK
M10-DUAL-WORKER-REORDER
M10-DROPPED-COMPLETION
M10-METRICS-UNDERCOUNT
M10-CLOSED-LOOP-GENERATOR
M10-LATENCY-FROM-ACTUAL-SEND
M10-WRONG-PERCENTILE-KNEE
M10-SKIP-LOAD-RECOVERY-CHECK
```

它们不是为了追求 mutation score，而是把最危险的“看起来能跑”实现变成可执行候选。每个 candidate 必须在同一冻结输入下产生可重放的 `STUDENT_FAILURE`，并保存最小反例或明确 witness。

如果 candidate 因编译器崩溃、线程未启动、文件系统不可用、timer 失效、Schema writer 出错或 judge 自身异常而退出，它是 `SYSTEM_ERROR`，不能算 kill。否则最容易制造一个荒谬结论：测试基础设施越不稳定，mutation score 越高。

同理，single-delete 或缩减器得到非法 history 时应标记 `INVALID_HISTORY`，不能当 semantic kill。evidence 要分开 report status、candidate outcome、counterexample identity 和系统异常计数。

[`mutants.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/check/mutants.json) 在当前 source 上记录 `12/12` executable mutants 均被语义反例以 `STUDENT_FAILURE` 击中；3 个 `SYSTEM_ERROR` controls 仅用来证明分类边界，没有计入 kill。

## Release qualification 必须能从 raw 重建决策

完整 release artifact 至少包含四层：

1. **环境与输入**：声明 source commit 必须等于 checked-out HEAD，release 工作树 dirty=false；同时绑定实际加载的 benchmark/local-runtime/core class-tree SHA-256 与 combined runtime SHA-256。qualification environment 必须包含 Java/runtime、显式 JVM arguments、maximum heap、GC names、OS/arch、CPU/logical processors/physical memory、operator storage labels、power policy、真实 WAL root 与规范化绝对 file URI，以及 WAL FileStore name/type/total/usable/unallocated space；再记录 queue/WAL/Snapshot、workload schema/hash/seed、profile 和计时器，并公开未改变的 M09 default `64 records / 1 MiB`、`M10Q2` qualification identity 与其继承的有限 `1000000 records / 1 GiB` suffix budget；
2. **方法 raw**：恰好两个未启用 allocation profiler 的 JMH `SampleTime` 入口完整 per-fork histogram、三个 open-loop sweep 的每个 planned demand、producer lag、gate outcome/depth、logical scheduled→owner-completion samples、checkpoint scheduled/gate-decision/owner-completion、resource samples、fixed observation cut、decision closure、terminal drain 和 quantile inputs；production gate `decisionNanos` 归一化写为 raw `admissionDecisionNanos`，queue observation 标记 `ADMISSION_GATE_DECISION`，production `ownerCompletedNanos` 以 `OWNER_COMPLETED_UNDER_GATE` 来源写为同名 raw 字段，不虚构额外 observation/dequeue timestamp 或内部 queue/service 分段；
3. **决策 summary**：各 rate 的 `D-U=A+O+X`、`P=A-C`、`B=U+P` cut 账本与 closure/drain 守恒、logical scheduled→owner-completion percentile、producer lag 50/250 ms 门禁、gate/maintenance 对账、四项 fixed-cut saturation 与 `POST_CUT_PLANNED_OVERLOAD_REJECTION` 单向恶化项、三个 knee、published knee、`capacity.qualifiedOperatingPointCandidate` 和完整严格降序的 `capacity.provisionalSoakCandidates`；
4. **长稳态晋级与正确性**：`soak.promotionPolicyId=M10Q2_DESCENDING_FULL_DURATION_FIRST_PASS`、`soak.attempts[{attemptNumber,outcome,point}]` 连续前缀、point 内的 `saturated/saturationReasons`、`soak.qualifiedAttemptNumber`、`soak.qualifiedPointId` 与最终 `capacity.qualifiedOperatingPoint`，以及每个实际 attempt 的 1800 秒时间序列、fixed observation cut、有限 decision closure、quiesce/drain、有限 fresh reopen、same-identity duplicate、M08 unbounded/no-snapshot accepted-trace direct replay 与 semantic digest。较高 `SATURATED` attempt 的 raw/recovery artifact 不能因后续降档通过而被删除。

summary 不是权威替代品。复核者应能从 raw 重新得到 planned/decided/undecided/admitted/rejected/completed，从 `admissionDecisionNanos` 重算 producer lag，从 `ownerCompletedNanos` 重算 percentile，按不移动的 scheduled `T` 重建 `RAW_RECONSTRUCTED` cut，复算 `D-U=A+O+X`、`P=A-C`、`B=U+P` 与 saturation/knee，再由 sweeps 重建 70% candidate 和完整降序 provisional candidates。随后还要验证 attempts 恰好是候选数组从首项开始的连续前缀：每个较高 `SATURATED` attempt 都有完整 closure、drain、raw、fresh reopen 与 direct replay，任何 `SYSTEM_ERROR` 后没有降档；首个 `QUALIFIED` 同时绑定 qualified attempt number、point id 与最终 QOP。closure 的 `postCutOverloaded` 只能单向恶化 verdict。`metricsCut()` 的单调 `cutToken` 只存在于 production 内存 cut；phase-cut raw schema 持久化 observed time/账本并由每个 point 的 cut 与时序复核，不能声称 bundle 含 token。closure/drain 后得到的决策与完成不能反向改写 observation cut。

`CI_SMOKE` 生成同构的 qualification-v2 短报告以检查方法，且由普通 `m10Check` 强制真实执行和独立复核；确定性场景还必须覆盖首档通过、较高档饱和后降档、全部饱和、`SYSTEM_ERROR` 立即停止、attempt 跳项/重排/重复和遗漏失败证据。它必须明确写 `METHOD_SMOKE_ONLY`，不能出现在产品 capacity claim 的来源字段。release manifest 只能引用完整 `RELEASE_QUALIFICATION` 的环境绑定 artifact。

证据条数不能继续写成单个 soak 的常量。令 `k = soak.attempts.length`：release bundle 的 phase-cut 数为 `48+k`，verified/reconstructed recovery points 与 `recovery.recordCount` 都为 `24+k`；CI smoke 分别为 `16+k` 与 `8+k`。本次 `k=3`，raw 确实包含 `51` 条 phase cut 和 `27` 条 reconstructed/published recovery point，没有把两个较高饱和候选挤出总数。

## 发布数字从确定性 GREEN 一直闭合到 raw

[`check.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/check/check.json) 及其子报告给出 `20/20` fixed scenarios、`16,384/16,384` generated actions、`28/28` obligations 和 `12/12` `STUDENT_FAILURE` mutant kills；3 个 `SYSTEM_ERROR` controls 不计 kill。[`qualification.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/qualification.json) 则绑定同一 workload hash `92300fe4580a99f7e8ece911bce2f68a41b945273c923ed484051a011be4fa9b`，以 `RELEASE_QUALIFICATION / M10Q2` 得到：

| 决策层         | 已发布观察                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| calibration    | 20,002,832,500 ns 内 6,603 logical/durable completions，reference rate `330`                                              |
| sweep          | knees `[379, 379, 379]`，published knee `379`，70% candidate `265`                                                        |
| soak attempt 1 | `231 offers/s`，415,800 planned，79 overload，`SATURATED`                                                                 |
| soak attempt 2 | `165 offers/s`，297,000 planned，971 overload，`SATURATED`                                                                |
| soak attempt 3 | `82 offers/s`，147,600 planned/admitted/applied/terminal，overload/checkpoint-required/failed/pending 均为 0，`QUALIFIED` |
| final          | `qualifiedAttemptNumber=3`，point `qop-soak-attempt-03-rate-00000082`，QOP `82 offers/s`                                  |

raw recomputation 从 gzip 解压后复算 `1,153,200` arrival、`1,113,889` completion、`1,153,200` queue、`6,401` resource、`102` maintenance、`51` phase-cut 与 `1,113,889` accepted-trace records，总计 `4,540,732` 条；27 条 recovery trace、27 个 published point、trace hash、suffix records/bytes 与 point join 均精确。[`recovery.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/recovery.json) 进一步保存了每个 attempt 的 fresh reopen 与 direct-replay digest。

运行环境也是结果的一部分：OpenJDK `25.0.4.1+1-LTS` / Eclipse Adoptium / OpenJDK 64-Bit Server VM，4 个显式 JVM input arguments，maximum heap `2,147,483,648 B`，GC 为 `G1 Concurrent GC`、`G1 Old Generation`、`G1 Young Generation`；Mac OS X `26.0.1` / aarch64，Apple M2，8 processors，8 GiB physical memory；operator labels 为 `APPLE SSD AP0256Z` / `APFS` / `AC_POWER_LOW_POWER_MODE_OFF_SLEEP_DISABLED`。真实 WAL root 是 `/private/tmp/cex-matching-m10-release-77e80b0-wal`（`file:///private/tmp/cex-matching-m10-release-77e80b0-wal/`），FileStore 为 `/dev/disk3s5` / `apfs`，total `245,107,195,904 B`，usable 与 unallocated 均为 `25,473,101,824 B`。

`cex.lab-evidence.v2` manifest 已把这个 environment object 精确投影出来，writer 与独立 verifier 逐字段比较；它没有从 `METHOD_SMOKE_ONLY` 的 CI environment 拼接 release 字段。旧 `8d13c40` 尽管 runner 状态为 PASS，却缺少 heap/GC 与真实 WAL FileStore 身份，因此仍归类为 `EVIDENCE_CONTRACT_GAP`；本次发布只使用 source `77e80b0…` 的完整重跑。

[`core-sample-time.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/diagnostics/core-sample-time.json) 保存两个 JMH 1.37 `SampleTime` histogram：`canonicalEnvelopeDecode` score `1,112.40 ns/op`，`restingMakerThenMatchingTaker` score `2,673.27 ns/op`。它们是 `DIAGNOSTIC_ONLY`、`eligibleForCapacityEnvelope=false`，没有 allocation profiler，不包含 queue/WAL/checkpoint/end-to-end schedule，所以不参与 knee 或 QOP 计算。QOP 也只适用于上述环境与 commit、单 producer、空簿 `BTC-USDT BUY IOC @ 100 × 1` workload，不能外推为任意订单 mix 的容量。

`M10Q2` 还需要一条独立的 phase-budget 证明链。每个 phase 的 prefix 为“开始时实际 suffix `+ ceil(offeredRate×110 ms) + capacity 64 + one owner in-flight`”，其中 110 ms 由 100 ms checkpoint offset 与 10 ms 准入上限组成；post-checkpoint suffix 则保守使用“该 phase 全部 planned initial offers `N + capacity 64 + one owner in-flight`”。两侧 records/bytes 分开校验，`1024-byte` planning ceiling 再由实际 durable record 复核。用 100 ms 代替 110 ms、从 post-checkpoint 上界减去事后 pre-offset 数、依赖资格流 retry、把两侧相加、只看 records 或把 `M10Q2` 继承的数字标成 M09 default，任何一种都使 capacity claim 失效。

该 prefix 公式还绑定 `10 ms` proactive-checkpoint admission lag 上限，并在 owner 完成 checkpoint 时读取 reset 前真实 records/bytes，与 runner durable-completion 计数和 plan 上界三方核对，reset 后两项必须为零。迟到、出现资格流 `CheckpointRequired`、实际 prefix 超界或任何对账异常都属于 `SYSTEM_ERROR`，必须使 runner 与独立 verifier 同时失败并立即停止；只在事后 summary 里写 `validatedSeparately=true` 不构成证明。只有完整且可复核的业务 saturation 能允许尝试下一 candidate，通用 service 的补救 checkpoint/retry 不得进入资格流。

调度证明也不能藏在 summary boolean 中：initial-arrival thread 必须独立于 completion/checkpoint/resource/artifact coordinator；在固定 scheduled cut `T` 上，必须把尚未决策的 scheduled demand 记入 backlog，再在最多 250 ms closure grace 内完成所有 initial decision，producer lag p99/max 不超过 50/250 ms；post-cut closure 不得美化 cut。resource sampler 从 window start 覆盖到 terminal drain，目标 1 Hz，scheduled gap、相邻真实 observed gap 与每条 sampling lag 都不得超过 2 秒，不能在长停顿后用连续补点伪造覆盖。它只发布 all-thread allocated bytes、GC count/millis、process CPU nanos、heap used、committed virtual memory、系统级 memory used 与 queue depth。committed virtual memory 不是 RSS，system memory used 是系统级 gauge；JMH 没有 allocation/op profiler，也不发布单次 GC pause。越界或字段混名是 system/method failure，不是一个可以继续发布的 saturated point。

恢复证明也不是一个 `exact=true`。对每个 attempt，最后一次成功 checkpoint 之后，runner 的 owner-side suffix records/bytes 累计、decompressed completion raw 按 `NEW_DURABLY_APPLIED.walRecordLength` 重建的 suffix、以及 fresh reopen 后 `LocalMatchingRuntime.recoverySuffixStats()` 读取的实际 suffix必须三方相等；summary 与该 attempt 的 recovery record 再逐字段复制同一结果。live、fresh reopen duplicate 与 M08 diagnostic direct replay 的 result/state digest 要三方一致，accepted-trace v2 还必须从 gzip JSONL 独立重建二进制 hash。任一差异都是 `SYSTEM_ERROR` 并阻止继续降档；direct replay 也不能替代真实有限 fresh reopen。

## 先预测：一个 `PASS=true` 能否独立支撑产品 tag

假设 summary 写着 `PASS=true`，但没有 raw offers、environment fingerprint、artifact hash，也没有把最终 QOP 连回三次 sweep、完整候选数组和 attempt 前缀。能否因为裁判进程以零退出就发布？不能。零退出只说明某段程序选择了成功路径；缺少输入身份和中间观察时，复核者无法区分真实闭合、漏算样本、跳过较高失败候选或手工改写 summary。

再假设 raw 齐全，却发现 complete tag 与 product tag peeled 到不同 commit。即使两边各自构建成功，也不能拼成一次 M10 release：代码身份、资格数字和产品名没有指向同一系统。预测这些失败路径，是为了让 manifest 成为证据索引而不是成功徽章。

## Worked example：一条 claim 怎样穿过 manifest

以“overload 是 pre-WAL”这条 claim 为例，合格 evidence 不能只写：

```json
{ "preWalOverload": true }
```

它需要一条可追溯链：

```text
claim id
→ obligation FULL_REJECTS_OVERLOADED / REJECTION_PRE_WAL
→ fixed/generated scenario identity
→ offered command identity + queue-full decision
→ before/after WAL position, identity index, apply count, semantic digest
→ expected no-change observation
→ report PASS
→ artifact SHA-256 in manifest
```

若 before/after 只比较 WAL file size，仍可能漏掉 identity binding；若只比较 core digest，仍可能已经 append 一条未 apply record。claim 要列出它真正观察的所有 owner。

再看“published QOP”这条 claim：它必须从三个 sweep 的有序 rate/saturation 列表，按“第一对连续 saturated 的第一个”算出三个 knee，取最小值并用 `floor(70% × published knee)` 得到 `qualifiedOperatingPointCandidate`；随后收集所有不高于 candidate、且三个 sweep 都实际未饱和的已测 rate，形成完整严格降序的 `provisionalSoakCandidates`。runner 从数组首项开始执行 1800 秒 attempts：较高档只有在 closure、drain、raw、fresh recovery 和 direct replay 全部闭合且 outcome 为 `SATURATED` 后才允许降档；任何 `SYSTEM_ERROR` 立即停止；首个 `QUALIFIED` 才成为最终 QOP。直接在 manifest 写一个 QOP 而不保留候选数组、失败 attempts 与这些选择关系，是不可复核的结论。

这两个例子分别代表确定性业务边界与含噪测量决策。前者期望同输入精确复现，后者不要求跨机器数字相同，却要求算法、原始观察和环境身份完整。

## complete tag、产品 tag 与 manifest 必须形成一个 identity

完成身份要求 annotated `course/m10-complete` 与 annotated `matching-0.5.0` 指向同一个 clean commit。本次两个 tag 的 peeled commit 都是 `77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb`，manifest 中 `source.dirty=false`；`cex.lab-evidence.v2` 交叉记录：

```text
unit = M10
course start/complete identity
product release identity
source commit
dirty = false
runtimeProvenance = checked-out HEAD + loaded class-tree hashes
report schema/status
claims + observations + limitations
artifact path + SHA-256
```

tag 名相同不够，必须核对 annotated tag object 与 peeled commit；source identity、judge report、workload、两个 JMH raw histogram、raw sweep、phase cuts、maintenance、每个 soak attempt 的 resource/raw/recovery/replay、correctness、architecture 和 counterexample artifact 都由 manifest 绑定或枚举并校验 hash。本站公开的同源静态副本绑定 219 个不重复 artifact 路径，manifest 外层 hash 也已独立固定，没有“博客另写一份更漂亮报告”的空间。

顶部已列出完整 40 位 commit、三个 annotated tag object 和 manifest SHA-256；[`manifest.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/manifest.json) 是 artifact 清单与 7 项 claim / 11 条 limitation 的权威索引。

## 实现与证据阅读路径必须从身份开始

源码阅读先按依赖方向进行：确认 `matching-core` 只有架构报告逐路径列出的 cold-boundary audit split，且业务合同、全量 retained-order audit 与 terminal identity retention 都没有变化；再看 [`LocalMatchingService`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-local-runtime/src/main/java/io/github/lchareln/cex/matching/local/LocalMatchingService.java) 如何包住既有 runtime；随后看非生产 [`M10QualificationRunner`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/M10QualificationRunner.java) 与 [`EnvironmentFingerprint`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/EnvironmentFingerprint.java) 怎样生成 scheduled offers、资源样本和完整环境；最后进入 [`M10ReleaseBundleVerifier`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M10ReleaseBundleVerifier.java) 与 [`M10EvidenceWriter`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M10EvidenceWriter.java)。反向从 JSON 猜线程与 mutation 语义，很容易把“报告声称如此”误当成“production 路径只能如此”。

每一层都应能指回上一层的权威身份：benchmark 只通过公开 production API 施压，judge 不把 reference shortcut 注入 production，evidence writer 只汇总已有 raw/report 而不重算一份更漂亮的结果。[`architecture.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/check/architecture.json) 与 manifest 内的 artifact hash 已将这个依赖方向封存。

要独立复跑时，推荐顺序是：

```bash
git switch --detach course/m10-start
./gradlew m10Check --no-daemon

git switch --detach course/m10-complete
./gradlew clean build --no-daemon
./gradlew m10Check --no-daemon
./gradlew m10ReleaseQualification --no-daemon \
  -Pm10.sourceCommit=77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb \
  -Pm10.walRoot=/absolute/new/m10-wal \
  -Pm10.output=build/reports/m10-release \
  -Pm10.cpuModel='REPLACE_WITH_EXACT_CPU_MODEL' \
  -Pm10.storageDevice='REPLACE_WITH_OPERATOR_STORAGE_LABEL' \
  -Pm10.filesystem='REPLACE_WITH_OPERATOR_FILESYSTEM_LABEL' \
  -Pm10.powerPolicy='REPLACE_WITH_EXACT_POWER_POLICY' \
  -Pm10.runId='REPLACE_WITH_STABLE_RUN_ID'
./gradlew m10Evidence -Pm10.unitTag=course/m10-complete -Pm10.productRelease=matching-0.5.0 --no-daemon
```

起点应得到声明的结构化 RED；完成身份的 `m10Check` 会先真实生成并复核短 `CI_SMOKE`，然后才在合适的本地发布环境运行完整 qualification。读者不应把共享 CI 的 smoke 当成 release rerun，也不应在环境不同后期待相同绝对数字；应期待相同 workload/schema/算法、完整环境指纹和内部守恒。

然后从 manifest 验证 hash，再打开权威 JSON report，检查 status、counts、claims、limitations 和 product identity，最后抽样重算一条 percentile、一轮 knee、候选数组、attempt 晋级与一条 pre-WAL witness。网页文章只解释这些同源静态文件，不运行远程 Java、JMH、WAL force 或 1800 秒 attempts。

本次已封存的报告路径是 [`reports/check/check.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/check/check.json)、[`reports/release/qualification.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/qualification.json) 与 [`reports/release/recovery.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/recovery.json)；上述命令则是读者在自己环境里重建新 bundle 的复核合同，不应期待跨机器复制相同绝对性能数字。

## 哪些情况必须阻止 matching-0.5.0 发布

以下任一情况都应使 release gate 失败并拒绝产品 tag；本次发布 bundle 没有命中其中任何一项：

- fixed/generated/obligation/mutant 未达到冻结全集，或出现未解释 `SYSTEM_ERROR`；
- overload 在 WAL、identity 或 apply 后才返回；
- enqueued task 没有 terminal completion，或 queue/order ledger 不守恒；
- raw offer 被过滤，percentile、saturation、knee、候选数组、attempt outcome 或最终 QOP 无法重算；
- `qualifiedOperatingPointCandidate` 不等于 `floor(70% × published knee)`，`provisionalSoakCandidates` 未包含全部不高于 candidate 且三轮共同未饱和的实测 rate，或数组不是严格降序；
- `soak.attempts` 不是候选数组从首项开始的连续前缀，出现跳过、重排、重复、attempt number 不连续、遗漏较高失败候选或 point identity 错配；
- 较高 `SATURATED` attempt 未先完成 1800 秒窗口、decision closure、terminal drain、raw 封存、fresh reopen 与 direct replay 就降档，或在任何 `SYSTEM_ERROR` 后仍继续尝试；
- 最终 QOP 不是首个 `QUALIFIED` attempt，`soak.qualifiedAttemptNumber`、`soak.qualifiedPointId`、attempt point 与 `capacity.qualifiedOperatingPoint` 不一致，或全部候选饱和仍生成 QOP；
- 报告虚构第二个 decision observation、dequeue 时钟、持久化 cut token、四段 latency 或内部 queue/service 分布，或没有把 raw `admissionDecisionNanos`/`ownerCompletedNanos` 追溯到真实 gate/owner timestamp 与 `ADMISSION_GATE_DECISION` observation；
- initial-arrival thread 被 coordinator 反向阻塞，producer lag p99/max 超过 50/250 ms，或 250 ms closure grace 后仍有 initial demand 未决策；
- 要求所有 initial decision 早于 scheduled cut，cut 随 capture 时刻移动、capture lag 超过 10 ms，未将 cut 时未决策需求纳入 backlog，未证明 `D-U=A+O+X`、`P=A-C`、`B=U+P`，或用 post-cut closure/terminal drain 覆盖 immutable cut；
- `postCutOverloaded>0` 却没有以 `POST_CUT_PLANNED_OVERLOAD_REJECTION` 单向使 point 饱和，或用 post-cut completion/queue 回落清除 fixed-cut saturation reason；
- 资源采样未同时满足 1 Hz target、2 秒 scheduled gap、observed gap 与 sampling lag；
- committed virtual memory 被写成 RSS、system memory used 被写成进程内存、GC 累计 millis 被写成单次 pause，或 JMH histogram 被写成精确 allocation/op；
- `m10Check` 没有真实执行/复核 CI smoke、把 model fixture 冒充 runner，或只有 `CI_SMOKE` 而没有完整环境绑定 release qualification；
- M09 默认 64 records / 1 MiB 被改写或与 M10Q2 混名，未说明 M10Q2 继承的有限 budget，100 ms same-FIFO checkpoint、10 ms admission lag、actual start suffix `+ ceil(rate×110 ms) + capacity + 1` prefix、`N + capacity + 1` post-checkpoint 上界、真实 prefix 复核、qualification 禁止 `CheckpointRequired` 或 1024-byte ceiling 缺失；
- 任一 1800 秒 attempt 没有覆盖各自唯一的 +100 ms same-FIFO proactive checkpoint及其维护 raw/停顿，或资源维度/环境指纹缺失；
- release environment 缺少 maximum heap、GC names、真实 WAL root/规范化 file URI、WAL FileStore name/type/space，manifest 没有精确投影 qualification environment，或使用 CI smoke 字段代填；
- 任一 attempt 的 owner 累计/decompressed raw/fresh reopen suffix records/bytes 不一致，有限 fresh reopen、duplicate original result、M08 diagnostic direct replay 或 semantic digest 分叉，或用 direct replay 替代 fresh recovery proof；
- 证据计数仍按单个 soak 写死，而不是令 `k=soak.attempts.length` 后验证 release `48+k` phase cuts、`24+k` recovery points/records，以及 CI `16+k` phase cuts、`8+k` recovery points/records；
- JMH 不是恰好两个冻结的 `SampleTime` 诊断入口，缺少完整 histogram，或被纳入 capacity gate；
- `matching-core` 出现架构报告未列明的 delta、改变业务合同/terminal identity retention，或把全量 audit 从 cold boundary 删除；production module 依赖 benchmark/testkit；
- 声明 source commit 不等于 checked-out HEAD、release 工作树不 clean、加载 class-tree hash 缺失，或 complete 与产品 tag 没有指向同一 clean commit；
- manifest、report、artifact hash、claim observation 或 limitation 不一致。

这些不是一张发布清单的装饰，而是各机制的 proof obligation 汇合点。失败时应保留 raw/counterexample 并修复来源，不能改阈值、删样本或把异常降级成 limitation 来“完成单元”。

## matching-0.5.0 的保证边界

上述证据已全部闭合，因此 `matching-0.5.0` 可以保证：M09 的单进程、单 shard、可恢复 runtime 拥有固定上界的异步准入；queue-full 在权威 mutation 前明确拒绝；入队与 durable outcome 分离；指定环境下**单 producer、空簿 `BTC-USDT BUY IOC @ 100 × 1`** workload 的 knee、provisional candidates、长稳态 attempts、最终 `82 offers/s` QOP、percentile 与资源可以从 raw 重建；每个实际 attempt 负载后的恢复与幂等语义保持一致。这个 envelope 仍不能外推成任意订单 mix 的 service capacity。

它仍不保证 Aeron、复制、quorum、leader failover、跨主机 exactly-once、多 shard、多 producer scalability、网络 SLA 或长期生产稳定性。每个 1800 秒有限 attempt 和有限 mutant corpus 都不能扩大成形式化证明。

这个停止点的价值正在于边界诚实：M10 已在知道本地过载语义和单机容量证据的位置停下；M11 才引入单节点 Aeron Cluster adapter，不把 Cluster 自身成本混入 M10 的结果。`matching-0.5.0` 是经过环境绑定资格的本地持久撮合服务，不是高可用集群。
