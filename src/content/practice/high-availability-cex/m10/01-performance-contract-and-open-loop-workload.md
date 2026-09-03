---
title: "M10·01：先冻结性能主张，再设计 Open-loop 工作负载"
description: "区分 JMH micro diagnostics、持久运行时端到端测量、CI_SMOKE 与 RELEASE_QUALIFICATION，并用绝对计划到达保留排队、generator lag 和 overload 的真实代价。"
date: 2026-09-02T09:10:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M10
lessonOrder: 10
permalink: performance-contract-and-open-loop-workload
tags:
  - 撮合引擎
  - 性能工程
  - Open Loop
draft: false
---

> 完成身份：annotated [`course/m10-start`](https://github.com/lcha-reln/cex-matching/tree/course/m10-start) peeled 到 `c93a5afff277c05068143a6f51d1b8d14508beb2`，冻结结构化 RED；annotated [`course/m10-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete) 与 [`matching-0.5.0`](https://github.com/lcha-reln/cex-matching/tree/matching-0.5.0) 都 peeled 到干净 source [`77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete)。站内 [`cex.lab-evidence.v2` manifest](/signal-grid-blog/practice/high-availability-cex/m10/evidence/manifest.json) 的 SHA-256 为 `03134fc4e80e6a29ba425a1e383d393af0cceeb1692b865e2c4c833b45bcc717`；它绑定的 [`RELEASE_QUALIFICATION`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/qualification.json) 为 `PASS`。三轮 knee 是 `[379, 379, 379]`，published knee 是 `379 offers/s`，`265` 只是 70% candidate 上界；长稳态按 `231 SATURATED → 165 SATURATED → 82 QUALIFIED` 降档，所以 final QOP 是 `82 offers/s`，不是 231。

一套撮合程序可以在 JMH 中跑出很漂亮的数字，却在真实 WAL force、同步 checkpoint 和有界队列面前迅速积压；也可以在 closed-loop 压测里保持稳定的 p99，只因为压测端每次都等上一条请求完成，系统越慢，下一条请求来得越晚。

M10 不先问“能跑多少 TPS”，而先问：**我们究竟要测哪一条路径，计划施加多少到达压力，哪些工作即使迟到或被拒绝也必须进入分母，这组观察最多能支持什么结论？**

这篇的停止点不是一个数字，而是一份不会把系统停顿藏起来的工作负载合同。只有它稳定，后面的 knee、长稳态候选晋级、final QOP、资源曲线和 release evidence 才有共同语义。

## 一个“性能数字”必须先绑定被测路径

M10 明确分开两种测量，二者不能合并成一张排行榜。

| 测量层                   | 路径                                                                              | 可以回答                                                     | 不能回答                                                          |
| ------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------- |
| JMH micro diagnostics    | 确定性 `matching-core` 热路径或 canonical M08 envelope decode                     | 两个冻结入口的局部延迟成本与分布                             | allocation/op、完整 WAL、force、queue、checkpoint、恢复和产品 TPS |
| local runtime end-to-end | scheduled arrival → `trySubmit` → queue → worker → WAL/force → apply → completion | 指定环境与 workload 下的准入、排队、持久完成、过载和资源包络 | 跨机器 SLA、Aeron Cluster 容量、真实网络端到端延迟                |

micro suite 使用独立 fork 的 JMH `SampleTime`，只冻结两个诊断入口：`CoreMatchingBenchmark.restingMakerThenMatchingTaker` 与 `CoreMatchingBenchmark.canonicalEnvelopeDecode`。前者观察 core 撮合热路径，后者观察 canonical M08 envelope decode；两者都不参与 release capacity gate。端到端资格则必须保留 M08/M09 已建立的 durable result、同步 checkpoint 和正确性检查；如果为了测得更高吞吐而关掉 force、切换到未声明的无限恢复预算或移除恢复复核，测到的已经是另一个系统。

端到端 workload 也不是“全部订单类型”的缩影。M10 冻结的是**单 producer、空 BTC-USDT 订单簿、递增 identity 的 `BUY IOC @ 100 × 1`**，[`matching.m10.workload.v1`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-testkit/src/test/resources/m10/workload-v1.json) 的 canonical SHA-256 为 `92300fe4580a99f7e8ece911bce2f68a41b945273c923ed484051a011be4fa9b`。它没有预置对手方挂单，因此主要测量 canonical decode、准入、WAL/force、无成交 IOC apply、completion、checkpoint 与恢复链路；真正发生 maker/taker 成交的 core 路径只由上面的 JMH 入口做局部诊断。后续若加入混合 maker/taker、深簿撤单、多品种或多 producer 流量，必须产生新的 workload identity 和容量报告，不能沿用由本 workload 推导的 QOP。M10 的 capacity envelope 只属于这份 workload，不是 `LocalMatchingService` 对任意交易流的通用容量。

因此，同一份报告里可以同时出现 micro 与 end-to-end，但必须有不同的 workload、单位、环境字段和结论。任何把前者 ops/s 写成 `matching-0.5.0` 容量的做法，都违反 M10 的主张边界。

## CI_SMOKE 和 RELEASE_QUALIFICATION 证明不同事情

M10 还把运行 profile 分成两层：

- `CI_SMOKE` 在共享的 GitHub hosted runner 上短时执行，用来发现 harness 断裂、Schema 不匹配、计数不守恒、准入语义回归或方法实现错误；
- `RELEASE_QUALIFICATION` 在记录完整硬件、JVM、文件系统和 workload 的发布环境执行完整 calibration、三次 sweep，并对严格降序 provisional candidates 执行一个或多个有限 1800 秒 soak attempts，形成只对该环境、该 commit 有效的 capacity envelope。

M10Q2 使用 `matching.m10.qualification.v2` 把短窗口选择与长稳态晋级分开。三次 sweep 只计算 `capacity.qualifiedOperatingPointCandidate=floor(70%×publishedKnee)`，再把不高于该上界、且三轮都实测未饱和的全部档位严格降序写入 `capacity.provisionalSoakCandidates`；短窗口最高档仍只是候选，不能提前叫 QOP。runner 从第一项开始产生 `soak.attempts` 连续前缀，前置 `SATURATED` point 必须完整跑满 1800 秒并闭合 decision closure、terminal drain、raw、fresh reopen 与 direct replay 后才可降档，任何 `SYSTEM_ERROR` 立即停止，首个 `QUALIFIED` point 才由 `soak.qualifiedAttemptNumber`、`soak.qualifiedPointId` 与 `capacity.qualifiedOperatingPoint` 三方绑定为 final QOP。

`CI_SMOKE` 的正式结论只能是 `METHOD_SMOKE_ONLY`。完成态 `./gradlew m10Check` 不是只跑一份 model-clock fixture：它会先生成一份新的真实 `CI_SMOKE` bundle，让同一个 `LocalMatchingService`、WAL、Snapshot、checkpoint、raw writer 与 fresh reopen 路径实际执行，再由 Schema probe 和独立 release-bundle verifier 复核；确定性 model-clock 只保留为算法诊断。smoke 必须使用与 release 相同的 qualification-v2 attempts 形状，另由确定性正反例覆盖首候选饱和后降档、全候选饱和、`SYSTEM_ERROR` 立即停止、跳档与遗漏失败证据；但它的三秒 point 仍不能替代 1800 秒晋级。即便这条真实 runner 通过，也不表示 GitHub hosted runner 是稳定基准机，更不表示短窗口覆盖了 release 长度的 JIT/GC 尾部、每个 attempt phase 唯一 checkpoint 之后的长期漂移或热失控。反过来，release profile 也不因运行时间更长就自动成为通用 SLA：更换 CPU、JDK、GC、heap、FileStore、挂载参数、WAL 目录或 workload mix，都可能移动 knee。

这一区分解决了一个常见发布陷阱：CI 负责每次提交都能执行的方法门禁，release environment 负责一个可追溯停止点的环境绑定观察。两者相互补充，不能互相冒名。

## 资格运行使用 M10Q2，不改写 M09 默认值

M09 的生产默认恢复上界仍是 `64 records / 1048576 bytes`。它适合 M09 的有界恢复合同，却无法在每个 1800 秒候选命令流里每 64 条都制造一次不断变大的 full snapshot；这样会产生二次写放大，并最终碰到 snapshot format 上界。M10 不隐藏这个冲突，也不把扩大后的数字冒充 M09 默认。

完整资格明确标记为 `M10Q2`，并继承 M10Q1 的有限 `1000000 records / 1073741824 bytes`、这份 workload 的 `1024-byte` planned record ceiling，以及每个 scheduled phase 开始后 `100 ms` 的 proactive checkpoint。checkpoint 作为维护任务进入与业务命令相同的有界 owner-worker FIFO，因此排队和暂停继续留在 scheduled-arrival latency 中。成功维护准入相对计划 offset 最多允许迟到 `10 ms`；owner 完成 checkpoint 时还要把 `CheckpointResult` 给出的 reset 前真实 suffix records/bytes，与 runner 同步维护的 prefix 计数以及 phase 预检上界核对，reset 后两项必须归零。若持续满队列、迟到、真实 prefix 超界，或资格业务流竟返回 `CheckpointRequired`，它属于方法/系统 `SYSTEM_ERROR` 并立即终止整个 qualification；只有完整 1800 秒 attempt 得到业务 saturation，且 closure、drain、raw、fresh reopen 与 direct replay 全部闭合的 candidate point 才允许降档。

每个 phase 开始前分别证明两侧能装下，而不是把 checkpoint 前后相加：

```text
prefix records = phase 开始时的实际 suffix records
               + ceil(offeredRate × 110 ms)
               + queue capacity 64
               + 1 owner in-flight

post-checkpoint suffix records = 该 phase 全部 planned initial offers N
                               + queue capacity 64
                               + 1 owner in-flight
```

`110 ms = 100 ms` 计划 offset `+ 10 ms` 维护准入上限。prefix 不再把“理论上应在 100 ms 前发生的数量”写成事实，而是以 phase 开始的实际 suffix 为起点，再用到达率与最晚维护准入时刻给出上界。post-checkpoint 则保守地为整个 phase 的 `N + 65`，不减去一个事后观察到的 pre-offset 数，也不依赖 qualification 中被禁止的 `CheckpointRequired` 补救 retry。records 与按 `1024 bytes/record` planning ceiling 推导的 bytes 分开校验；执行时任何 durable record 真值超过 ceiling 都必须失败。资格报告同时公开 M09 default 与 M10Q2 finite runtime，使读者不能把本次 capacity envelope 倒灌成 64-record 默认配置的性能结论。

## Open-loop 的时钟不等待上一条响应

假设目标到达率为每秒 1,000 次，则理想间隔为 1 毫秒。open-loop generator 先确定绝对计划：

```text
t0 + 0 ms
t0 + 1 ms
t0 + 2 ms
t0 + 3 ms
...
```

到了某个计划时刻，它就尝试 offer；它不会因为上一条 completion 尚未返回而顺延整个时间轴。实现上，initial-arrival thread 只负责初始 scheduled offers，不处理 completion、checkpoint、retry、资源采样或 JSON/gzip artifact I/O；异步 coordinator 独立处理这些后续工作。否则一次同步 checkpoint 或慢磁盘写报告就会反向停住 producer，把 open-loop 偷换回 completion-paced loop。每个计划 offer 至少留下当前边界实际拥有的 raw：

```text
scheduledArrivalNanos
admissionDecisionNanos / producerLagNanos  // admission gate 的真实 decisionNanos，归一化为 run-relative
admissionOutcome = ENQUEUED_NOT_ACK | OVERLOADED | NOT_ACCEPTING | FAILED_CLOSED
queueObservationKind = ADMISSION_GATE_DECISION
decisionQueueDepth
ownerCompletedNanos / latencyFromScheduledNanos  // 仅 admitted logical operation 拥有
```

这里的 `admissionDecisionNanos` 不是 coordinator 过一会儿观察到的时刻，也不是一个与 gate decision 分离的“调用前 send”时刻；它来自 `AdmissionResult.decisionNanos`。queue raw 以 `ADMISSION_GATE_DECISION` 明示同一 owner 边界，独立 verifier 再以 `(point, logicalOperationId, attempt)` 把 arrival、queue 与 outcome/depth 精确连接。completion raw 的 `ownerCompletedNanos` 由 `ServiceCompletion.ownerCompletedNanos` 归一化而来，来源合同是 `OWNER_COMPLETED_UNDER_GATE`。于是系统变慢时，证据会如实表现为 producer lag、gate decision depth/outcome、较长 logical completion latency 或 overload，而不是悄悄降低施加的到达率。

closed-loop 则是另一种合法但不同的实验：client 等 response 再发下一条，它适合回答固定并发客户端能获得怎样的响应，却不适合寻找外部到达率超过服务能力时的 queue knee。M10 的容量 sweep 选择 open-loop，正因为目标是观察过载边界。

## Scheduled cut 先固定需求切面，再关闭准入决策并排空

open-loop 不意味着施压线程可以无限迟到，但也不能要求每个靠近窗口末尾的计划到达都在同一时刻前完成 gate decision。M10 固定 scheduled cut `T`：到 `T` 立即冻结需求与服务切面；initial-arrival thread 最多再使用 `250 ms` decision-closure grace 完成所有尚未决策的 initial demand。producer lag 仍必须满足：

```text
p99 <= 50 ms
max <= 250 ms
```

因此，decision 在 `T` 后不自动失败；真正失败的是 producer lag p99/max 越过 50/250 ms、closure 结束仍有 initial demand 未决策，或 runner 把迟到从分母中删掉。这些都是 method/system failure，不是一个更慢但仍可发布的 capacity point。

在 `T` 时，runner 通过持有 service admission gate 的 `metricsCut()` 冻结 `observationCut`。设计划需求总数为 `D=plannedInitialOffers`，切面时尚未得到 gate decision 的需求为 `U=scheduledDecisionBacklogAtCut`，则已决策数必须等于 `D-U=A+O+X`：`A` 是已接纳，`O` 是 overload，`X` 是其他显式拒绝。若 cut 前 owner 已终结 `C` 个 admitted operation，则 service pending `P=A-C`，切面的 `endingBacklog B=U+P`。这使“到时仍未获得准入决策的外部需求”真实进入 backlog，不会因尚未入队而消失。

production cut 带单调 `cutToken` 与真实 `observedNanos`，但 qualification raw schema 只持久化后者及其账本，不把内存中的 token 冒充 bundle 字段。方法合同把 observation cut 标成 `IMMUTABLE_SCHEDULED_WINDOW_END_RAW_RECONSTRUCTED_BEFORE_PRODUCER_CLOSURE_AND_TERMINAL_DRAIN`，并令 `scheduler.scheduledObservationCutDoesNotMove=true`：`observedNanos` 的 capture lag 必须 `<=10 ms`，但 cut membership 仍由 raw timestamp 按 scheduled `T` 重建，不把切面移到 capture 时刻。`T` 后的 decision closure 会完成账本；若它发生 `postCutOverloaded>0`，只能以 `POST_CUT_PLANNED_OVERLOAD_REJECTION` 把 verdict 单向恶化为饱和，不能回写清掉 `U`、`B` 或任何 cut reason。closure 结束后才进入 `terminalDrain`，把全部已接纳 logical operation——包括 cut 后才完成准入的部分——推进到 zero pending，再做恢复检查。closure 和 drain 证明需求未被静默丢弃，却不能把未来结果借回来美化固定切面。

## 先预测：一次 8 毫秒暂停会出现在哪里

考虑一个简化教学例子，它不是 M10 实测数据。计划每 1 毫秒到达一次，worker 在 `t0+3 ms` 进入一次 8 毫秒同步 checkpoint。

| 计划到达      | closed-loop 可能发生什么     | M10 open-loop 必须记录什么                                                                                             |
| ------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `+3 ms`       | 等 checkpoint 完成后才继续发 | initial demand 的 scheduled/gate-decision 时刻、outcome/depth 仍保留，若 admitted 则 owner-completion latency 包含暂停 |
| `+4...+10 ms` | 这些请求根本尚未产生         | 每个计划 offer 都保留 producer lag 与 outcome；可能 admission，也可能 pre-WAL overload                                 |
| `+11 ms`      | 看起来又恢复为一次普通请求   | queue-depth/backlog 与 logical completion 是否恢复必须可见                                                             |

在继续读之前先做预测：若报告只从“实际调用 `trySubmit` 的时刻”计算延迟，generator 本身晚了 6 毫秒，这 6 毫秒应不应该消失？答案是否定的。对容量实验而言，外部需求在计划时刻已经存在；从实际 send 起算会把施压器跟不上和系统排队共同造成的缺口删除，形成 coordinated omission。

M10 的 qualification bundle 因而必须发布四类不同证据，而不是宣称拥有四段内部时钟：

```text
scheduledArrival → gate decision         // raw 名为 admissionDecisionNanos；producer lag
gate outcome + decision-time queue depth // ADMISSION_GATE_DECISION，不虚构第二个 observation timestamp
scheduledArrival → owner completion      // raw 名为 ownerCompletedNanos；admitted logical end-to-end
maintenance scheduled/gate decision/owner terminal
```

冻结的 raw schema 没有 dequeue 时刻、与 gate decision 分离的第二个 observation timestamp，也没有 admission→dequeue/dequeue→completion 分段。reject 保留 scheduled/gate decision、producer lag、gate outcome 与 queue depth 并进入 planned demand 总账，但没有 owner completion latency；内部 queue wait 与 service-time 拆分留给后续单元。

## Worked example：把所有计划 offer 对回一张账

继续用一组完全虚构、只用于手算的 10 个 planned offers。假设 scheduled cut 到来时还有 2 个需求没有 gate decision；已决策的 8 个中，6 个已入队、2 个 overload，而 owner 只完成了其中 4 个：

```text
D = plannedInitialOffers             = 10
U = scheduledDecisionBacklogAtCut    = 2
initialDecisionsAtCut = D - U        = 8 = A(6) + O(2) + X(0)
P = servicePendingAtCut = A - C      = 6 - 4 = 2
B = endingBacklog = U + P            = 2 + 2 = 4
```

closure grace 内，剩余 2 个需求完成 decision 并都入队；terminal drain 后，最终账本变为：

```text
all initial decisions = 10
enqueued              = 8
rejected              = 2
drain 后 completed  = 8
```

如果实现只保存 cut 时已决策的 8 个样本，就会把 `U=2` 的到期需求从分母中抹掉；如果 closure 后又用最终完成结果回写 cut，则会把 `B=4` 洗成零。正确证据同时保留 immutable cut 与 closure/drain 最终账本：前者回答固定时刻有多少到期需求还没有得到决策或完成，后者证明它们没有被静默丢弃。summary 必须能逐项对账回 raw，而不是另外维护一套容易漂移的计数器。

这个例子还说明，`Enqueued` 只能表示内存队列接纳。它不能计入 durable success；真正的业务 outcome 要等 completion 中既有 `SubmissionResult`。下一篇会把这条边界放入服务状态机。

## 沿三条 owner 路径复核实现

M10 的阅读顺序应从合同 owner 出发，而不是先看报表绘图库：

1. 从 [`LocalMatchingService`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-local-runtime/src/main/java/io/github/lchareln/cex/matching/local/LocalMatchingService.java) 确认 `trySubmit` 的准入结果与 completion 分离，且 production 模块不依赖 benchmark、JMH 或 testkit。
2. 从非生产 [`M10QualificationRunner`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/M10QualificationRunner.java) 追到 workload canonical hash、profile、rate ladder、窗口和绝对计划到达，确认这些输入没有在运行时漂移。
3. 继续确认 initial-arrival thread 不承担 completion/checkpoint/artifact I/O，并沿 raw demand ledger 到 fixed observation cut、decision closure、terminal drain 与 summary，检查 `D-U=A+O+X`、`P=A-C`、`B=U+P` 与最终守恒式；同时核对 production gate `decisionNanos` 如何写成 raw `admissionDecisionNanos`，production `ownerCompletedNanos` 如何写成同名 raw 字段，不要寻找并不存在的第二 decision observation、dequeue timestamp 或持久化 `cutToken`。

阅读时先找 clock boundary：哪个时刻是 workload 的 scheduled origin，哪个时刻只是 generator 实际获得 CPU。再找 ownership boundary：谁产生计划，谁做准入，谁拥有 durable completion。最后才看 percentile 和图表。

源码阅读使用精确 commit，完成身份由 complete/product tag 固定，报告身份则由 `cex.lab-evidence.v2` manifest 逐文件绑定。读源码回答“谁拥有时钟与状态”，读 qualification 回答“这次运行观察到了什么”；二者缺一都不能推出容量主张。

## 完成运行如何闭合环境与结果

前一次 `8d13c40` runner 虽走完 workload，但 release report 没有绑定 maximum heap、garbage-collector identity、真实 WAL root/URI，以及 WAL 所在 FileStore 的 name/type/space，因此只被保留为 [`EVIDENCE_CONTRACT_GAP`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/docs/qualification-attempts/m10-release-8d13c40-20260903-evidence-contract-gap.json)，其数字没有进入本次发布结论。`CI_SMOKE` 的环境字段也没有被用来代填 release 环境。

完成运行 `m10-release-77e80b0-20260903` 在 Apple M2、8 处理器、8 GiB 物理内存、2 GiB maximum heap、Eclipse Adoptium JDK `25.0.4.1+1-LTS`、G1 GC、macOS `26.0.1` aarch64 上执行；WAL 位于 `/private/tmp/cex-matching-m10-release-77e80b0-wal`，实际 FileStore 为 `/dev/disk3s5` / `apfs`，operator label 为 `APPLE SSD AP0256Z`，power policy 为 `AC_POWER_LOW_POWER_MODE_OFF_SLEEP_DISABLED`。这些字段由 qualification 与 manifest 逐项绑定，而不是从 smoke 推测。

这个 QOP 只属于上述 commit、完整环境和单 producer、单 worker、单 shard、空 BTC-USDT 簿、`BUY IOC @ 100 × 1` workload。JMH `SampleTime` 仍只解释两个局部入口的成本，不参与 knee、candidate 或 QOP 计算；反过来，QOP 也不覆盖 Rest、WebSocket、TLS、网络、Aeron Cluster、复制、多 shard 或混合订单流。

## 验收应反对哪些漂亮但错误的结果

M10 的方法验收不是“程序跑完且有 JSON”。至少要能拒绝这些实现：

- 用 blocking `put` 让 producer 等空位，却声称 `trySubmit` 非阻塞；
- 用 response 驱动下一次发送，把 open-loop 偷换成 closed-loop；
- 从 actual send 而非 scheduled arrival 起算端到端延迟；
- 从 report 反推并不存在的第二个 decision observation/dequeue 时钟，忽略 gate/owner 时钟的真实来源，或把概念上的 queue/service 分段写成已发布 raw；
- generator 迟到时跳过计划 offer，令分母随系统变慢而缩小；
- 让 completion/checkpoint coordinator 阻塞 initial-arrival thread，或在 producer lag p99/max 超过 50/250 ms、decision closure 后仍有未决策需求时给 capacity point 判 PASS；
- 要求所有 decision 都早于 fixed cut，从而使 250 ms lag 恩典自相矛盾；或不记录 cut 时的 scheduled-decision backlog；
- 用 decision closure 或 terminal drain 后的最终状态覆盖 fixed observation cut；
- 只汇总 enqueued 样本，删除 overload 决策；
- 把任一 JMH diagnostic score 与持久路径的 completion/s 相加或横向比较；
- 把 `CI_SMOKE` 数字发布成 release capacity；
- 关闭正确性检查、WAL force 或 checkpoint 后仍沿用同一产品主张。

对应的正面证据是 workload canonical hash、全部 raw offer identity、守恒总账、profile 身份、环境指纹，以及可以从 raw 重新计算的 summary。有限语料只能证明这些冻结输入上的观察闭合，不能证明所有调度、所有机器和所有长期负载。

## 这篇冻结的是实验问题，不是答案

到这里，读者应能先于运行回答三件事：micro 与 end-to-end 各自测了什么；为什么 CI smoke 不能替代 release qualification；为什么 open-loop 必须从绝对 scheduled arrival 保留迟到、排队与拒绝。

M10 已经让 planned demand、准入决策、固定 cut、terminal drain、资格晋级和完整环境身份在同一 source 上闭合，并在这个狭义边界内得到 `82 offers/s` final QOP。它仍不是跨环境 SLA，更不是整个 CEX 的 TPS。下一篇把服务的有界准入和结果语义落到源码与裁判上，说明这条 overload 曲线为什么具有可安全执行的产品含义。
