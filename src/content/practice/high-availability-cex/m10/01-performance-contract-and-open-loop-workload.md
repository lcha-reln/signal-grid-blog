---
title: "M10·01：先冻结性能主张，再设计 Open-loop 工作负载"
description: "区分 core micro、持久运行时端到端测量、CI_SMOKE 与 RELEASE_QUALIFICATION，并用绝对计划到达保留排队、generator lag 和 overload 的真实代价。"
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
draft: true
---

> 实施中说明：本篇只解释 M10 已冻结的测量合同，不宣称任何容量结果。`course/m10-complete`、`matching-0.5.0`、source commit、环境指纹、吞吐与 percentile 均在完成资格运行后由 evidence 填入。

一套撮合程序可以在 JMH 中跑出很漂亮的数字，却在真实 WAL force、同步 checkpoint 和有界队列面前迅速积压；也可以在 closed-loop 压测里保持稳定的 p99，只因为压测端每次都等上一条请求完成，系统越慢，下一条请求来得越晚。

M10 不先问“能跑多少 TPS”，而先问：**我们究竟要测哪一条路径，计划施加多少到达压力，哪些工作即使迟到或被拒绝也必须进入分母，这组观察最多能支持什么结论？**

这篇的停止点不是一个数字，而是一份不会把系统停顿藏起来的工作负载合同。只有它稳定，后面的 knee、QOP、资源曲线和 release evidence 才有共同语义。

## 一个“性能数字”必须先绑定被测路径

M10 明确分开两种测量，二者不能合并成一张排行榜。

| 测量层 | 路径 | 可以回答 | 不能回答 |
| --- | --- | --- | --- |
| core micro | 预构造命令进入确定性 `matching-core` 热路径 | 某种命令组合下，纯业务状态转换的局部成本与分布 | WAL、force、queue、checkpoint、恢复和产品 TPS |
| local runtime end-to-end | scheduled arrival → `trySubmit` → queue → worker → WAL/force → apply → completion | 指定环境与 workload 下的准入、排队、持久完成、过载和资源包络 | 跨机器 SLA、Aeron Cluster 容量、真实网络端到端延迟 |

core micro 使用独立 fork 的 JMH `SampleTime`，目的是诊断热路径，而不是绕过持久化后替产品报喜。端到端资格则必须保留 M08/M09 已建立的 durable result、同步 checkpoint 和正确性检查；如果为了测得更高吞吐而关掉 force、扩大 RecoveryBudget 或移除恢复复核，测到的已经是另一个系统。

因此，同一份报告里可以同时出现 micro 与 end-to-end，但必须有不同的 workload、单位、环境字段和结论。任何把前者 ops/s 写成 `matching-0.5.0` 容量的做法，都违反 M10 的主张边界。

## CI_SMOKE 和 RELEASE_QUALIFICATION 证明不同事情

M10 还把运行 profile 分成两层：

- `CI_SMOKE` 在共享的 GitHub hosted runner 上短时执行，用来发现 harness 断裂、Schema 不匹配、计数不守恒、准入语义回归或方法实现错误；
- `RELEASE_QUALIFICATION` 在记录完整硬件、JVM、文件系统和 workload 的发布环境执行完整 calibration、三次 sweep 与有限 soak，形成只对该环境、该 commit 有效的 capacity envelope。

`CI_SMOKE` 的正式结论只能是 `METHOD_SMOKE_ONLY`。它通过不表示 runner 是稳定基准机，也不表示短窗口覆盖了 JIT 稳态、周期性 checkpoint、GC 尾部或热失控。反过来，release profile 也不因运行时间更长就自动成为通用 SLA：更换 CPU、JDK、GC、heap、FileStore、挂载参数、WAL 目录或 workload mix，都可能移动 knee。

这一区分解决了一个常见发布陷阱：CI 负责每次提交都能执行的方法门禁，release environment 负责一个可追溯停止点的环境绑定观察。两者相互补充，不能互相冒名。

## Open-loop 的时钟不等待上一条响应

假设目标到达率为每秒 1,000 次，则理想间隔为 1 毫秒。open-loop generator 先确定绝对计划：

```text
t0 + 0 ms
t0 + 1 ms
t0 + 2 ms
t0 + 3 ms
...
```

到了某个计划时刻，它就尝试 offer；它不会因为上一条 completion 尚未返回而顺延整个时间轴。每个计划 offer 至少留下：

```text
scheduledAt
decisionAt
admission = ENQUEUED | OVERLOADED | NOT_ACCEPTING | FAILED_CLOSED
dequeuedAt?       // 仅 enqueued
completedAt?      // 仅 enqueued，必须最终有明确 completion
```

于是系统变慢时，证据会如实表现为 generator lag、queue wait、较长 completion latency 或 overload，而不是悄悄降低施加的到达率。

closed-loop 则是另一种合法但不同的实验：client 等 response 再发下一条，它适合回答固定并发客户端能获得怎样的响应，却不适合寻找外部到达率超过服务能力时的 queue knee。M10 的容量 sweep 选择 open-loop，正因为目标是观察过载边界。

## 先预测：一次 8 毫秒暂停会出现在哪里

考虑一个简化教学例子，它不是 M10 实测数据。计划每 1 毫秒到达一次，worker 在 `t0+3 ms` 进入一次 8 毫秒同步 checkpoint。

| 计划到达 | closed-loop 可能发生什么 | M10 open-loop 必须记录什么 |
| --- | --- | --- |
| `+3 ms` | 等 checkpoint 完成后才继续发 | offer 仍在 `+3 ms` 决策，若入队则 completion 包含暂停 |
| `+4...+10 ms` | 这些请求根本尚未产生 | 每个计划 offer都保留；可能排队，也可能 pre-WAL overload |
| `+11 ms` | 看起来又恢复为一次普通请求 | backlog 是否仍在、queue wait 是否回落必须可见 |

在继续读之前先做预测：若报告只从“实际调用 `trySubmit` 的时刻”计算延迟，generator 本身晚了 6 毫秒，这 6 毫秒应不应该消失？答案是否定的。对容量实验而言，外部需求在计划时刻已经存在；从实际 send 起算会把施压器跟不上和系统排队共同造成的缺口删除，形成 coordinated omission。

M10 因而至少分解四段时间：

```text
scheduled → admission decision
admission → dequeue
dequeue   → durable completion
scheduled → durable completion
```

reject 没有 dequeue/completion，但仍要记录 `scheduled → decision`，并进入 planned offers 的总账。

## Worked example：把所有计划 offer 对回一张账

继续用一组完全虚构、只用于手算的 10 个 planned offers。假设 generator 有两次迟到，queue 满时拒绝 2 次，其余 8 次入队并最终完成：

```text
planned   = 10
offered   = 10
enqueued  = 8
rejected  = 2
completed = 8
```

两条最小守恒式是：

```text
offered = enqueued + rejected
drain 后 enqueued = completed
```

如果实现只保存 8 个 enqueued 样本，报告可能写成“100% 完成”；但真实 workload 的 admission success 是 8/10，且两个 overload 正是容量边界的一部分。如果 generator 落后时直接跳过两个过期计划槽，`offered=8` 又会把需求从历史中抹掉。

正确做法是 raw record 保留全部 10 个 schedule identity，再由同一份 raw data汇总 decision、latency、queue depth 和 completion。summary 必须能逐项对账回 raw，而不是另外维护一套容易漂移的计数器。

这个例子还说明，`Enqueued` 只能表示内存队列接纳。它不能计入 durable success；真正的业务 outcome 要等 completion 中既有 `SubmissionResult`。下一篇会把这条边界放入服务状态机。

## 实现完成后应沿三条 owner 路径阅读

M10 的阅读顺序应从合同 owner 出发，而不是先看报表绘图库：

1. 在 `matching-local-runtime` 找到 `LocalMatchingService`，确认 `trySubmit` 的准入结果与 completion 分离，且 production 模块不依赖 benchmark、JMH 或 testkit。
2. 在非生产 `matching-benchmarks` 中找到 `matching.m10.workload.v1` 的解析与 canonical hash，确认 seed、profile、rate ladder、窗口和计划到达都来自冻结输入。
3. 沿 raw offer ledger 到 summary，检查 planned/offered/enqueued/rejected/completed、四段时间和 queue samples 由同一批 identity 关联，而非事后估算。

阅读时先找 clock boundary：哪个时刻是 workload 的 scheduled origin，哪个时刻只是 generator 实际获得 CPU。再找 ownership boundary：谁产生计划，谁做准入，谁拥有 durable completion。最后才看 percentile 和图表。

具体类路径、commit 与 artifact 清单会在实现和资格运行完成后由 evidence 填入；草稿不预写不存在的文件身份。

## 验收应反对哪些漂亮但错误的结果

M10 的方法验收不是“程序跑完且有 JSON”。至少要能拒绝这些实现：

- 用 blocking `put` 让 producer 等空位，却声称 `trySubmit` 非阻塞；
- 用 response 驱动下一次发送，把 open-loop 偷换成 closed-loop；
- 从 actual send 而非 scheduled arrival 起算端到端延迟；
- generator 迟到时跳过计划 offer，令分母随系统变慢而缩小；
- 只汇总 enqueued 样本，删除 overload 决策；
- 把 JMH core ops/s 与持久路径的 completion/s 相加或横向比较；
- 把 `CI_SMOKE` 数字发布成 release capacity；
- 关闭正确性检查、WAL force 或 checkpoint 后仍沿用同一产品主张。

对应的正面证据是 workload canonical hash、全部 raw offer identity、守恒总账、profile 身份、环境指纹，以及可以从 raw 重新计算的 summary。有限语料只能证明这些冻结输入上的观察闭合，不能证明所有调度、所有机器和所有长期负载。

## 这篇冻结的是实验问题，不是答案

到这里，读者应能先于运行回答三件事：micro 与 end-to-end 各自测了什么；为什么 CI smoke 不能替代 release qualification；为什么 open-loop 必须从绝对 scheduled arrival 保留迟到、排队与拒绝。

M10 此时仍没有一个可发布的 TPS 或 p99。它只有一份可审计的问题定义：在不改变持久化和正确性语义的前提下，指定环境面对指定计划到达时，何处开始持续饱和。下一篇先完成服务的有界准入和结果语义；没有这条边界，任何 overload 曲线都缺少可安全执行的产品含义。
