---
title: "M10·02：让过载在 WAL 之前终止，而不是把入队冒充 ACK"
description: "实现单 worker、有界 FIFO、非阻塞 trySubmit、caller bytes 所有权、CheckpointRequired 同 envelope 重试，以及 failure close、quiesce 和 drain 的明确结果语义。"
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
draft: true
---

> 实施中说明：本篇描述冻结的生产合同和验收方法，不把草稿当成实现完成证明。服务类、complete/product tag、source commit、场景结果与 manifest 身份均在完成后由 evidence 填入。

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
completion<SubmissionResult>
```

单 worker 有两个目的。它复用 M08/M09 已证明的 caller-serialized 顺序，而不是发明第二种并发撮合语义；它还让 FIFO admission order 与 runtime apply order之间有一条可检查的映射。

“API 允许并发调用”不等于 M10 发布多 producer scalability 数字。本单元的 capacity profile 只使用单 load producer，避免把 producer 争用、CAS 扩展性与 NUMA 又塞进同一个复杂度窗口。并发 API 的语义由 fixed/generated admission model 检查，容量结论则保持单 producer 边界。

## `Enqueued` 是内存承诺，不是业务结果

`trySubmit` 的概念返回只有两类：

```text
Enqueued(completion)
Rejected(OVERLOADED | NOT_ACCEPTING | FAILED_CLOSED)
```

`Enqueued` 表示服务已经取得 envelope bytes 的所有权，并把一个任务放进有界内存队列。此刻可能尚未 decode，更没有 append、force 或 apply。调用者只有等待 `completion`，才能得到既有 `SubmissionResult` 所表达的 durable、duplicate、业务 rejected、checkpoint 后结果或 failed-closed outcome。

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

## CheckpointRequired 不能变成新命令

M09 在 suffix records/bytes 将越界前返回 `CheckpointRequired`，且不会 append 当前 envelope。M10 worker 接到它时执行：

```text
submit exact envelope E
→ CheckpointRequired, E 尚未进入 WAL
→ 同步 checkpoint()
→ submit exact envelope E again
→ completion with existing SubmissionResult
```

这里有三条不可省略的不变量：

- retry 使用同一 bytes、同一 command identity、同一 queue task，而不是生成新的 producer sequence；
- checkpoint 在 owner worker 上同步完成，后续任务不能越过 E；
- scheduled arrival 到 completion 的端到端延迟包含整个 checkpoint 暂停。

如果 benchmark 把 checkpoint 样本从 percentile 中剔除，或把重试登记成第二个 planned offer，容量报告会同时低估尾延迟并破坏总账。若 checkpoint 本身失败，runtime 按既有合同 failed closed；worker 不应跳过 E 继续 apply 后面的任务。

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

这里的 `completed` 表示 completion 已终结，不等于业务成功。它必须原样携带既有 `SubmissionResult`：可能是 structural/preflight reject、durably applied、duplicate original result、checkpoint 后结果或明确 failed-closed。把所有 exception 都算作业务失败同样不对：工具缺失、线程异常、账本断裂或 judge 缺陷属于 `SYSTEM_ERROR`，不能替实现生成一个看似合规的 completion。

## Worked example：一条命令跨过 queue、checkpoint 与 durable ACK

下面是一条规范化时间线，数字仅用于理解顺序，不是实测：

```text
10.000 ms  scheduled arrival for command C42
10.080 ms  trySubmit owns bytes and returns Enqueued(f42)
12.000 ms  worker dequeues C42
12.100 ms  runtime returns CheckpointRequired, no WAL mutation
12.200 ms  worker starts synchronous checkpoint
20.000 ms  checkpoint completes
20.100 ms  worker retries exact C42
20.400 ms  WAL append completes
22.000 ms  WAL force completes
22.300 ms  core apply + identity commit complete
22.350 ms  f42 completes with durable SubmissionResult
```

四段观察是：

```text
scheduled→admission = 0.080 ms
admission→dequeue   = 1.920 ms
dequeue→completion  = 10.350 ms
scheduled→completion= 12.350 ms
```

在 `10.080 ms` 把请求计为 ACK 会提前约 12 毫秒确认一个尚未进入 WAL 的事实；从第二次 submit 的 `20.100 ms` 起算则会删除 checkpoint 的主要代价。正确 timeline 让调用语义与性能测量使用同一组边界。

## 实现阅读应先追 mutation，再看线程代码

实现完成后，可按以下顺序核对：

1. 从 `trySubmit` 的 queue-full 分支向下追踪，证明它到达任何 decoder、WAL writer、identity index 或 core mutation 之前已经终止。
2. 从 `Enqueued` 携带的 completion 追到 owner worker，确认只有 worker 调用 `LocalMatchingRuntime`，且 FIFO task 不被第二 worker 重排。
3. 找到 caller bytes 防御性所有权测试，观察 enqueue 后修改源 buffer 的反例。
4. 找到 `CheckpointRequired` 分支，确认同一 task/envelope 同步 checkpoint 后重试，且只产生一个 workload identity。
5. 分别阅读 quiesce/drain 与 failed-close 路径，确认所有 enqueued task 都有 terminal completion。

具体 source path、测试报告和 scenario identity 在实现完成后由 evidence 填入。草稿只固定要证明的 mutation boundary，不预先宣称代码已经满足它。

## 验收不是“queue size 从未大于 64”这么简单

固定容量 64 是 release profile 的配置，但容量检查只是第一层。完整验收还要证明：

- `trySubmit` 不等待空位，queue 满时可观察到 `OVERLOADED`；
- reject 前 WAL position、ApplicationSequence、producer cursor、identity binding 与 core digest 均不变；
- `Enqueued` 与 durable completion 是两个不同事件；
- 单 worker FIFO 在并发 caller 的成功准入顺序上成立；
- checkpoint pause 没有被删样本，同 envelope 只完成一次；
- graceful close 拒绝新任务并 drain 已接纳任务；
- failure close 明确终结 pending completion，且不继续 apply；
- caller 修改原 buffer 不改变实际执行 envelope；
- 所有账本在 quiesce 后守恒，系统异常不会冒充 semantic pass。

这些义务分别对应可执行反例，而不是一条笼统的“背压测试通过”。只有 pre-WAL、ownership、ordering、completion 和关闭语义一起成立，overload 才是调用方可安全使用的产品能力。

## 有界准入只解决本地过载，不等于高可用

M10 到这里获得的是一个明确的单进程服务边界：内存队列有上限，满载拒绝不污染权威状态，排队成功不冒充持久结果，同步 checkpoint 与失败会进入真实 completion 语义。

它没有复制 queue task，没有 leader，也没有在进程崩溃后替客户端决定 outcome。尚未获得 durable completion 的请求仍是 `UNKNOWN`，必须用同一 identity 重试。下一篇会在这个诚实的 API 上定义 percentile、saturation、knee 与 QOP；若跳过本篇，所谓 capacity 只能说明“某个队列在某次运行里没有爆”，不能指导安全准入。
