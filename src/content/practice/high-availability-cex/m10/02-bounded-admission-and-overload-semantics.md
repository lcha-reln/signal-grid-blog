---
title: "M10·02：让过载在 WAL 之前终止，而不是把入队冒充 ACK"
description: "实现单 worker、有界 FIFO、非阻塞 trySubmit、caller bytes 所有权、SubmissionResult 原样完成，以及 failure close、quiesce 和 drain 的明确结果语义。"
date: 2026-09-02T09:20:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M10
lessonOrder: 20
permalink: bounded-admission-and-overload-semantics
tags:
  - 撮合引擎
  - 背压
  - Durable ACK
draft: false
---

> 完成身份：annotated [`course/m10-start`](https://github.com/lcha-reln/cex-matching/tree/course/m10-start) peeled 到 `c93a5afff277c05068143a6f51d1b8d14508beb2`；annotated [`course/m10-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete) 与 [`matching-0.5.0`](https://github.com/lcha-reln/cex-matching/tree/matching-0.5.0) 都 peeled 到干净 source [`77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete)。站内 [`cex.lab-evidence.v2` manifest](/signal-grid-blog/practice/high-availability-cex/m10/evidence/manifest.json) SHA-256 为 `03134fc4e80e6a29ba425a1e383d393af0cceeb1692b865e2c4c833b45bcc717`；它同时绑定普通 check 与独立 `RELEASE_QUALIFICATION`，两者都不把入队冒充 durable ACK。

M09 的 `LocalMatchingRuntime.submit` 是 caller-serialized 的同步边界：调用者进入运行时，命令经过 identity preflight、WAL append/force、core apply 后才得到 durable outcome。要测过载并允许并发 caller，M10 需要在它前面加一个异步服务边界。

真正困难的不是创建线程和队列，而是阻止两个危险语义混进 API：第一，queue 接纳被误当成 durable ACK；第二，queue 满之后命令已经触碰 WAL 或 identity，调用方却收到一个看似可安全重试的 overload。

M10 的生产结论因此是：**一条 owner worker 以固定容量 FIFO 串行调用既有 runtime；`trySubmit` 只做防御性 bytes 所有权转移与非阻塞准入，queue-full 必须在 decode、WAL、identity 和 apply 之前给出确定拒绝。**

## 服务拥有线程，core 仍然不认识线程

`matching-core` 在 M10 保持零业务改动，也不引入 queue、clock、JMH、WAL 或 Aeron。新的并发 owner 只属于 `matching-local-runtime`：

```text
concurrent callers
      │ trySubmit(byte[])
      ▼
fixed-capacity FIFO
      │
      ▼ single owner worker
LocalMatchingRuntime.submit(envelope)
      │ append → force → apply
      ▼
completion<ServiceCompletion>
      ├─ SubmissionCompleted(exact SubmissionResult)
      └─ ExplicitFailure(service failure)
```

单 worker 有两个目的。它复用 M08/M09 已证明的 caller-serialized 顺序，而不是发明第二种并发撮合语义；它还让 FIFO admission order 与 runtime apply order之间有一条可检查的映射。

“API 允许并发调用”不等于 M10 发布多 producer scalability 数字。本单元的 capacity profile 只使用单 load producer，避免把 producer 争用、CAS 扩展性与 NUMA 又塞进同一个复杂度窗口。并发 API 的语义由 fixed/generated admission model 检查，容量结论则保持单 producer 边界。

## `Enqueued` 是内存承诺，不是业务结果

`trySubmit` 的概念返回只有两类：

```text
Enqueued(completion)
Rejected(OVERLOADED | NOT_ACCEPTING | FAILED_CLOSED)
```

`Enqueued` 表示服务已经取得 envelope bytes 的所有权，并把一个任务放进有界内存队列。此刻可能尚未 decode，更没有 append、force 或 apply。调用者只有等待 `completion`，才能得到 `SubmissionCompleted(exact SubmissionResult)` 或 `ExplicitFailure`。前者可表达 durable、duplicate、业务 rejected、`CheckpointRequired`、durability unknown 或 runtime failed-closed；服务不把任何既有 variant 改写成另一种业务结果。后者只用于 owner worker 无法调用或完成既有 runtime 边界的情形，不能伪装成业务结果。

把入队当 ACK 会制造明确的数据丢失窗口：

```text
caller sees Enqueued
→ process crashes before dequeue
→ no WAL record exists
→ fresh recovery cannot知道这条命令
```

真实进程崩溃时，客户端只能把尚未取得 durable completion 的请求视为 `UNKNOWN`，随后使用同一 command identity 重试。M10 不会为了让 callback 看起来完整，伪造一次本地 failure；进程已经不存在，就没有可信 callback。

这也解释了为什么 API 不直接返回 `Accepted`。撮合的业务 Accepted 与 queue admission 是不同层次的事实，使用同一个词会使监控、重试与调用方状态机全部含混。

## 先预测：capacity=2 时第三条命令能碰什么

设 queue capacity 为 2，worker 恰好在执行同步 checkpoint。A、B 已经成功入队，C 此时调用 `trySubmit`。

先预测四个问题：

1. C 能否等待一个空位再返回？
2. C 能否先 decode，发现命令合法后再判断 queue？
3. C 能否为 producer sequence 或 commandId 建立临时 binding？
4. C 收到 `OVERLOADED` 后能否原样重试同一 bytes？

冻结答案是：C 必须立即以 `OVERLOADED` 返回；除防御性 bytes 处理和 admission ledger 外，不触碰 decode、WAL、identity、订单簿或任何业务 sequence；同 identity 原样重试仍是安全动作。

如果用 blocking `put`，调用耗时会吸收 queue wait，准入 API 就不再是 non-blocking；压测器也可能被动退化成 closed-loop。如果先 append WAL 再拒绝，调用方看到的“拒绝”已经可能对应 durable command，原样重试会从 overload 变成 duplicate 或 conflict。M10 把 overload 定义成 **pre-WAL 的确定性准入拒绝**，正是为了消除这种歧义。

## caller bytes 必须在返回前完成所有权转移

调用者可以在 `trySubmit` 返回后立即复用或修改原 `byte[]`。如果 queue 只保存引用，worker 稍后 decode 的可能是另一份内容：

```text
caller: bytes = command A
service: enqueue reference(bytes)
caller: overwrite bytes as command B
worker: decode command B
```

这会破坏 payload hash、command identity 与 evidence 重放。M10 要求准入成功前进行防御性 ownership transfer；队列内任务拥有不可由 caller 再修改的 bytes。测试不能只比较 object identity，而要在 `Enqueued` 后主动覆写 caller buffer，再确认 worker 仍处理原 envelope。

queue-full 的实现仍要保持 pre-WAL。防御性复制本身不是业务 side effect，但不应成为可以无限分配绕过容量的隐藏第二队列。资格证据要同时观察固定 queue capacity、pending task 数和资源维度，而不是只看 `BlockingQueue.size()` 的一个瞬时值。

## CheckpointRequired 不能被服务吞掉，资格流也不能依赖它续跑

M09 在 suffix records/bytes 将越界前返回 `CheckpointRequired`，且不会 append 当前 envelope。M10 的通用 service 合同必须先原样完成本次 admitted attempt；调用方若选择恢复服务，可在显式 checkpoint 后重试同一 envelope：

```text
submit exact envelope E
→ CheckpointRequired, E 尚未进入 WAL
→ completion attempt-1 with unchanged CheckpointRequired
→ caller/coordinator 显式 checkpoint()
→ caller/coordinator retry exact envelope E with the same identity
→ completion attempt-2 with existing SubmissionResult
```

这里有三条不可省略的不变量：

- retry 使用同一 bytes 与同一 command identity，而不是生成新的 producer sequence；它是一个单独可核对的 admission attempt，但仍属于同一个逻辑 operation；
- service 不拥有 checkpoint 策略，也不把两个 runtime 返回折叠成一个 synthetic result；调用方必须保存 attempt-1 的 `CheckpointRequired`；
- 逻辑 operation 的 scheduled arrival 到最终 completion 延迟包含 attempt-1、同步 checkpoint 与 retry 的全部暂停。

这段 sequence 用于证明 service 的结果透明性与“同 identity 才能安全重试”，并由确定性 service/judge 场景覆盖；它**不是** M10 release qualification 的正常路径。`M10Q2` 已为每个 phase 提前证明预算并安排 proactive checkpoint，因此真实资格业务流一旦出现 `CheckpointRequired` 就立即以 `SYSTEM_ERROR` 终止整个资格，不生成 release retry attempt，也不允许靠临时 checkpoint 把 candidate 救回来或降档继续。qualification 的 preflight 直接对整个 planned demand 和 queue/owner 余量做保守上界，不再保留一个似乎允许补救的 retry bound。否则 runner 可以在计划错误后自愈，capacity evidence 就不再证明 frozen plan 足以覆盖真实执行。

## M10Q2 的 100 ms checkpoint 也必须经过同一 FIFO

上面的 `CheckpointRequired` 是既有 runtime 在 mutation 前给出的被动边界；完整容量资格还为每个 scheduled phase 安排一次 proactive checkpoint。它们不能混成一个隐藏在 service 内部的优化策略。

M09 的默认恢复预算继续是 `64 records / 1 MiB`。M10 的长资格流以 `M10Q2` 身份继承 `M10Q1` 的有限 `1000000 records / 1 GiB` suffix budget、只针对冻结 workload 的 `1024-byte` record planning ceiling，以及 phase scheduled start 后 `100 ms` 的 checkpoint offset。维护任务从异步 coordinator 送入与业务任务相同的 capacity-64 FIFO，由同一 owner worker 执行；不能插队到当前 task 前，也不能在 arrival thread 上同步执行。它的 admission gate decision 相对计划时刻最多迟到 `10 ms`；迟到属于 `SYSTEM_ERROR`，会停止整个资格，而不是把当前 attempt 归为 `SATURATED` 后降档。

这要求 phase 启动前分别做两个预算证明：

```text
prefixRecords = actualStartSuffixRecords
              + ceil(offeredRate × 110 ms)
              + queueCapacity
              + oneOwnerInFlight

postCheckpointSuffixRecords = allPlannedInitialOffers N
                            + queueCapacity
                            + oneOwnerInFlight
```

两侧都分别检查 records 和 bytes。`110 ms` 是 `100 ms` 计划 offset 加 `10 ms` gate-admission 上限；prefix 以 phase 开始时的实际 suffix 为起点，证明 checkpoint 最晚准入并轮到执行前不会先撞预算。post-checkpoint suffix 使用更保守的 `N + capacity + 1`：不减去一个事后观察到的 pre-offset 数，也不借用 qualification 中被禁止的 retry。checkpoint owner 完成时，runner 还必须把 `CheckpointResult.suffix*BeforeCheckpoint` 与自己的 durable-completion 累计计数逐项比较，再验证真实 prefix 不超过 preflight 上界、reset 后 records/bytes 都为零。把两侧相加会假设 checkpoint 从未发生，把它们只算 records 又会漏掉 encoded bytes 上界；只写 `validatedSeparately=true` 而不核对真实 prefix 同样不合格。

initial-arrival thread 继续按绝对 schedule 发初始 offer，不等待 checkpoint 或 completion。coordinator 异步收集结果并安排 proactive maintenance；资格流不允许 `CheckpointRequired` 后继续 retry。因此 checkpoint 可以制造真实 queue buildup，却不能把初始流量变成 closed-loop，也不能用补救性维护掩盖错误预算。资格报告必须同时显示 M09 default 与 `M10Q2`，并说明后者继承的有限 budget，避免把这个容量结果误用到 64-record 默认运行时。

这里还要区分两种“继续”：同一 candidate 内的补救性 command retry 被禁止；candidate 之间的降档只属于冻结的 qualification-v2 promotion。只有一个较高 provisional candidate 被完整跑满 1800 秒、完成 decision closure、terminal drain、raw 对账、fresh reopen 与 direct replay，并被确定性归类为 `SATURATED` 后，runner 才能尝试降序数组中的下一档。任何 checkpoint、调度、环境、账本、恢复或 verifier 异常都是 `SYSTEM_ERROR`，必须立即停止，不能伪装成 saturation 来换取降档。

## failure close 与 graceful close 是两条不同路径

服务至少有以下可观察状态：

```text
ACCEPTING
QUIESCING
FAILED_CLOSED
CLOSED
```

正常 `close` 走 quiesce：先原子停止新准入，使后续 `trySubmit` 返回 `NOT_ACCEPTING`；再按 FIFO 排空已经 enqueued 的任务并完成它们；最后关闭 runtime 与 worker。不能先关闭 runtime，再让队列里的 completion 永久悬挂。

runtime failure 则进入 `FAILED_CLOSED`：停止新准入；当前失败任务获得明确 failure；队列中尚未 apply 的任务也必须逐个获得 failed-closed completion，不能静默丢弃，更不能越过失败点继续执行。对账应满足 drain/terminal 后：

```text
offered = enqueued + rejected
enqueued = completed
```

这里的 `completed` 表示 completion 已终结，不等于业务成功。它必须原样携带既有 `SubmissionResult`：可能是 structural/preflight reject、durably applied、duplicate original result、`CheckpointRequired`、durability unknown 或明确 failed-closed。把所有 exception 都算作业务失败同样不对：工具缺失、线程异常、账本断裂或 judge 缺陷属于 `SYSTEM_ERROR`，不能替实现生成一个看似合规的 completion。

## Worked example：用概念时序理解 queue、checkpoint 与 durable ACK

下面是一条概念时间线，数字仅用于理解所有权和顺序，不是实测，也不是 M10 raw 已发布的内部分段；其中 `CheckpointRequired` 路径只解释通用 service 语义，正式资格流遇到它会失败：

```text
10.000 ms  scheduled arrival for command C42
10.080 ms  trySubmit owns bytes and returns Enqueued(f42)
12.000 ms  worker dequeues C42
12.100 ms  runtime returns CheckpointRequired, no WAL mutation
12.120 ms  attempt-1 completion preserves CheckpointRequired
12.200 ms  coordinator starts synchronous checkpoint
20.000 ms  checkpoint completes
20.100 ms  coordinator retries exact C42 through trySubmit
20.400 ms  WAL append completes
22.000 ms  WAL force completes
22.300 ms  core apply + identity commit complete
22.350 ms  f42 completes with durable SubmissionResult
```

若未来 production 进一步拥有 dequeue 等时钟，可以做如下教学分解：

```text
scheduled→admission = 0.080 ms
admission→dequeue   = 1.920 ms
dequeue→attempt-1 completion = 0.120 ms
scheduled→completion= 12.350 ms
```

在 `10.080 ms` 把请求计为 ACK 会提前约 12 毫秒确认一个尚未进入 WAL 的事实；从第二次 submit 的 `20.100 ms` 起算则会删除 checkpoint 的主要代价。这个概念时序解释了为什么不能混淆边界。production 的 `AdmissionResult.decisionNanos` 与 `ServiceCompletion.ownerCompletedNanos` 已分别提供真实 gate/owner 时间，runner 将它们归一化写进 raw `admissionDecisionNanos` 与 `ownerCompletedNanos`；queue observation 显式标记为 `ADMISSION_GATE_DECISION`。当前没有 dequeue timestamp，也没有与 gate decision 分离的第二 observation，所以不能把 admission→dequeue 或 dequeue→completion 写成已测分布。

M10 qualification 合同要求发布 scheduled arrival→gate decision 的 producer lag、gate outcome 与 decision-time queue depth、admitted logical operation 的 scheduled→owner-completion latency，以及 checkpoint maintenance 的 scheduled/gate-decision/owner-completion timing。`metricsCut()` 在 admission gate 内生成单调 `cutToken` 和 observed time，但 bundle 的 phase-cut schema 只持久化 observed time 与账本，不声称存在 raw `cutToken`。内部 queue wait 和 service time 拆分留给后续单元。

## 沿源码先追 mutation，再看线程代码

在当前固定 source commit 上可按以下顺序核对：

1. 从 [`LocalMatchingService.trySubmit`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-local-runtime/src/main/java/io/github/lchareln/cex/matching/local/LocalMatchingService.java) 的 queue-full 分支向下追踪，证明它到达任何 decoder、WAL writer、identity index 或 core mutation 之前已经终止。
2. 从同一类中 `Enqueued` 携带的 completion 追到 owner worker，确认只有 worker 调用 `LocalMatchingRuntime`，且 FIFO task 不被第二 worker 重排；这是一条源码语义检查，不意味着 raw 记录 dequeue 时刻。
3. 找到 caller bytes 防御性所有权测试，观察 enqueue 后修改源 buffer 的反例。
4. 找到 `CheckpointRequired` 分支，确认服务原样完成；再分开检查确定性 service 场景如何证明 same-envelope retry，以及资格 runner 为何把任何 `CheckpointRequired` 直接分类为失败而不生成 release retry attempt。
5. 在 [`M10QualificationRunner`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/M10QualificationRunner.java) 找到 `M10Q2` phase preflight 与 100 ms maintenance admission，确认它继承的 prefix 使用 actual start suffix `+ ceil(rate×110 ms) + capacity + 1`，post-checkpoint 使用 `N + capacity + 1`，admission lag 不超过 10 ms、owner 返回的真实 reset 前 prefix 与 runner 计数/plan 一致，initial-arrival thread 不等待 coordinator。
6. 分别阅读 quiesce/drain 与 failed-close 路径，确认所有 enqueued task 都有 terminal completion。

[`M10CheckRunner`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M10CheckRunner.java) 把这些路径汇总成机器可读的 [`reports/check/check.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/check/check.json)；该报告为 `matching.m10.check.v2 / PASS`，source 是同一干净 `77e80b0…`。

## 两层证据分别回答语义正确与长稳态是否闭合

普通 check 已在 source `77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb` 上闭合以下有限语料；表中数字是实际 PASS 计数，但仍不是 release 容量：

| 证据层                       | 冻结验收                           | 它证明什么                                                                                               |
| ---------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------- |
| fixed real-service scenarios | `20 / 20 PASS`                     | non-blocking admission、pre-WAL overload、单 owner FIFO、结果透传、failure close 与 drain 的冻结场景成立 |
| generated admission model    | `16,384 / 16,384` actions executed | 64 组 × 256 步、四条 overload lane 的生成历史逐步与模型对账                                              |
| coverage obligations         | `28 / 28` observed                 | 每条冻结义务至少有对应观察，但不等于状态空间穷尽                                                         |
| executable candidates        | `12 / 12 STUDENT_FAILURE`          | 十二个语义/方法 mutant 都有最小反例；另有 `3` 个 `SYSTEM_ERROR` controls，全部不计为 kill                |

独立 [`RELEASE_QUALIFICATION`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/qualification.json) 又在同一 source 上完整跑了三个 1800 秒 attempt。其 logical 总账与 terminal drain 如下：

| attempt | offered rate | planned offers | initially admitted | pre-WAL overloaded | terminal completions | outcome     |
| ------: | -----------: | -------------: | -----------------: | -----------------: | -------------------: | ----------- |
|       1 |          231 |        415,800 |            415,721 |                 79 |              415,721 | `SATURATED` |
|       2 |          165 |        297,000 |            296,029 |                971 |              296,029 | `SATURATED` |
|       3 |           82 |        147,600 |            147,600 |                  0 |              147,600 | `QUALIFIED` |

三个 attempt 的 `closedOrInvalid` 与 `explicitServiceFailures` 都是 0，terminal drain 后 `pending` 也都是 0；每个 admitted 数都与 `NEW_DURABLY_APPLIED`、durable acknowledgement 及 terminal completion 相等。因此 231 与 165 证明“有界队列如何安全拒绝”，却都不是可持续操作点；首个合格的 final QOP 是 82。pre-WAL overload 的产品语义由 fixed/generated 裁判证明，容量点则由这份完整 release bundle 评定，两层证据没有互相冒名。

## 验收不是“queue size 从未大于 64”这么简单

固定容量 64 是 release profile 的配置，但容量检查只是第一层。完整验收还要证明：

- `trySubmit` 不等待空位，queue 满时可观察到 `OVERLOADED`；
- reject 前 WAL position、ApplicationSequence、producer cursor、identity binding 与 core digest 均不变；
- `Enqueued` 与 durable completion 是两个不同事件；
- 单 worker FIFO 在并发 caller 的成功准入顺序上成立；
- checkpoint pause 没有被删样本，每个 admission attempt 恰好完成一次，logical operation 只形成一个最终 outcome；
- M09 default 与 `M10Q2` 没有混名，且报告明确后者继承 `M10Q1` 的有限 budget；phase preflight 以 actual start suffix `+ ceil(rate×110 ms) + capacity + 1` 与 `N + capacity + 1` 分开证明 checkpoint 两侧，proactive checkpoint admission lag 不超过 10 ms，真实 reset 前 prefix 与 plan 闭合，1024-byte ceiling 也由实际 durable record 复核；
- 通用 service 原样暴露 `CheckpointRequired`，但 qualification 中该 variant 的总数必须为零，不能把补救 retry 混入 release capacity；
- provisional candidate 只有在 1800 秒窗口、closure、drain、raw、recovery 与 replay 全部闭合且结论为 `SATURATED` 后才允许降档；`SYSTEM_ERROR` 必须立即停止；
- graceful close 拒绝新任务并 drain 已接纳任务；
- failure close 明确终结 pending completion，且不继续 apply；
- caller 修改原 buffer 不改变实际执行 envelope；
- 所有账本在 quiesce 后守恒，系统异常不会冒充 semantic pass。

这些义务分别对应可执行反例和可下载报告，而不是一条笼统的“背压测试通过”。只有 pre-WAL、ownership、ordering、completion 和关闭语义一起成立，overload 才是调用方可安全使用的产品能力；有限的 20 个 fixed scenarios、16,384 个 generated actions 和 12 个 mutant 仍不构成穷尽证明。

## 有界准入只解决本地过载，不等于高可用

M10 到这里获得的是一个明确的单进程服务边界：内存队列有上限，满载拒绝不污染权威状态，排队成功不冒充持久结果，所有既有 `SubmissionResult` 原样完成。通用调用方可在看见 `CheckpointRequired` 后显式维护并同 identity 重试；`M10Q2` qualification 则要求 proactive checkpoint 计划本身足够，出现该 variant 就以 `SYSTEM_ERROR` 停止，不把补救路径纳入 capacity，也不把 method failure 当作降档理由。

它没有复制 queue task，没有 leader，也没有在进程崩溃后替客户端决定 outcome。尚未获得 durable completion 的请求仍是 `UNKNOWN`，必须用同一 identity 重试。下一篇会在这个诚实的 API 上定义 percentile、saturation、knee、provisional candidates 与最终 QOP；若跳过本篇，所谓 capacity 只能说明“某个队列在某次运行里没有爆”，不能指导安全准入。
