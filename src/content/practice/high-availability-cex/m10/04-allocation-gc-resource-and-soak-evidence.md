---
title: "M10·04：把 Allocation、GC 与有限 Soak 变成可解释证据"
description: "记录环境指纹、allocation/GC/CPU/heap/RSS/queue 时间序列，在 QOP 下执行 30 分钟有限 soak，并以 quiesce、fresh reopen 与重放闭合正确性。"
date: 2026-09-02T09:40:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M10
lessonOrder: 40
permalink: allocation-gc-resource-and-soak-evidence
tags:
  - 撮合引擎
  - JVM
  - Soak Test
draft: true
---

> 实施中说明：30 分钟是冻结的 `RELEASE_QUALIFICATION` 运行设计，不是已经通过的结果。真实环境、资源曲线、checkpoint 次数、JMH/soak 数字与恢复结论均在完成后由 evidence 填入。

同一个 end-to-end p99 可以由完全不同的系统状态产生：一种运行 allocation 稳定、queue 周期性随 checkpoint 上升后回落；另一种运行 heap 持续增长、GC pause 加重，只是 30 秒窗口尚未跨过崩溃点。只保存最终 percentile，无法区分二者，更无法解释换 JVM 或存储后为什么 knee 移动。

M10 的资源证据不负责把所有慢点归因到某一行代码，而负责建立一条可复核的共时关系：**在明确环境和固定 workload 下，延迟、queue、checkpoint、allocation、GC、CPU、heap/non-heap 与 RSS 如何随时间变化；在 QOP 连续运行 30 分钟后，系统能否排空、fresh reopen，并保持 duplicate original result 与串行重放一致。**

有限 soak 只扩大观察窗口，不会自动升级为长期稳定性或生产就绪认证。

## 没有环境指纹，性能结果就没有可迁移的身份

release evidence 至少绑定以下事实：

```text
source commit / course tag / product tag / dirty=false
Java vendor + version + full JVM flags
heap limit + selected GC
OS / kernel / architecture
CPU model + logical cores + RAM
FileStore type + tested path + usable space
queue / WAL / Snapshot configuration
workload schema + canonical hash + seed
rate / windows / repetitions / timer configuration
```

FileStore 必须绑定实际 WAL/Snapshot path，而不是只写操作系统名称。APFS、本地 NVMe、容器 overlay、网络卷或加密层会改变 force 和尾延迟；同一台机器把工作目录换到另一个挂载点，也可能移动 capacity envelope。

完整 JVM flags 同样重要。只记录 `java.version` 而漏掉 heap、GC、JIT 或诊断参数，会让后续复跑无法解释差异。环境字段缺失时，资格应失败关闭，而不是把未知环境的数字发布后再补注释。

实际值在运行后由 evidence 填入；草稿不会猜 CPU 型号、可用空间或 JVM 参数。

## Micro allocation 与端到端资源不是同一个观察

纯 core JMH 使用独立 fork 与 `SampleTime`。若配置了可靠 profiler，它可以给出 allocation/op 等局部热路径诊断。这个数字只覆盖 benchmark method 的对象生命周期，不包含 service task、defensive bytes copy、queue node、WAL buffer、Snapshot 或 resource sampler。

端到端资格则至少观察：

- GC collection count、累计 time 与可获得的 pause 分布；
- process CPU，而非整机平均 CPU；
- heap used/committed、non-heap；
- resident set size；
- queue depth 与 backlog；
- completion、overload、checkpoint 时间线；
- allocation/op 的精确来源，或明确标为 sampled estimate。

JFR 是很有价值的 sampled 诊断工具，却不能被描述成“每一次 allocation 的精确证明”。如果报告的 allocation 来自 JMH 精确计数、JFR sample 或 JVM counter，它必须标注来源与限制。把 sampled 值写成 exact，会制造比没有指标更危险的确定感。

micro 与 end-to-end 可以互相提出假设，例如 core allocation 上升可能解释 GC 压力，但不能简单相减或换算产品 TPS。两条路径的线程、持久化和对象域都不同。

## 先预测：queue 锯齿究竟是健康恢复还是慢性积压

设 QOP 下每隔一段时间触发同步 checkpoint。健康的简化形状可能是：

```text
queue depth
  0 ──╮      ╭── 0 ──╮      ╭── 0
      ╰──────╯       ╰──────╯
       checkpoint     checkpoint
```

checkpoint 期间 worker 停止完成业务任务，queue 上升；checkpoint 完成后，service capacity 高于 QOP 到达率，queue 回落到基线。这里 checkpoint 对应的 end-to-end tail 不能删除，但 backlog 没有跨周期累积。

危险形状则是每次只回落一部分：

```text
baseline: 0 → 4 → 9 → 15 → 23 ...
```

即使 30 秒 sweep 的平均 completion 接近 admission，30 分钟 soak 会暴露慢性增长。另一个危险形状是 RSS 持续增长而 heap 周期性回落，提示 off-heap、native buffer、mapped file 或观测误差需要进一步诊断；不能用“GC 正常”直接排除进程内存风险。

先做预测：如果 CPU 只有 40%，queue 却跨 checkpoint 周期持续增长，能否得出“还有 60% CPU 容量”？不能。瓶颈可能是 force、单 worker、I/O wait 或 scheduler；业务 progress 指标比 CPU 百分比更接近服务承诺。

## 30 分钟有限 soak 应保持真实维护行为

release soak 在上一篇推导的 QOP 下连续运行 30 分钟。它必须：

- 使用同一绝对 open-loop schedule 语义；
- 保留固定 queue capacity 64；
- 保留真实 WAL force、M09 RecoveryBudget 与同步 checkpoint；
- 跨过多次 checkpoint，而不是通过扩大 budget 避开维护；
- 保存资源时间序列、raw offer ledger 与 checkpoint markers；
- 不因采样器压力而静默丢失 planned offer；
- 在运行结束后停止新准入并 drain 已接纳任务。

如果 30 分钟内没有跨过预期维护路径，资格不应只因“没有错误”而通过。soak 的教学职责不是等待时钟，而是重复经过 queue buildup、checkpoint、WAL/Snapshot 和恢复相关边界。

同样，采样间隔与 timer 配置必须记录。只有开始/结束两个点无法辨认 peak 与趋势；采样过密又可能扰动被测系统。M10 发布的是带配置的观察，不把 observer effect 宣称为零。

## Worked example：把一段资源曲线变成可证伪假设

下面仍是教学数据，不是实测。假设三个连续 checkpoint 周期观察到：

| 周期 | queue 起点/峰值/终点 | GC pause | RSS 终点 | 解释 |
| --- | --- | --- | --- | --- |
| A | 1 / 38 / 2 | 一次短暂停 | 420 MiB | checkpoint 后基本追平 |
| B | 2 / 41 / 5 | 两次短暂停 | 438 MiB | 终点略增，需要继续观察 |
| C | 5 / 49 / 12 | 一次较长暂停 | 470 MiB | backlog 与 RSS 同时抬升，不能称稳态 |

这张表不能证明 GC 是根因，因为 checkpoint、force 与调度也在同时发生。它能支持一个下一步可证伪问题：在相同 workload 下，queue 终点和 RSS 是否继续单调上升，较长 GC pause 是否与 completion gap 对齐？

如果只取整个 soak 的平均 queue，三个周期可能仍很低；如果只取 RSS max，也无法区分正常预热平台与持续增长。时间序列、事件 marker 与资源维度要保持同一 clock domain，才能做因果上谨慎、可复跑的解释。

发布 evidence 中的真实曲线与 observations 在运行后填入。文章不会把上述虚构 420/470 MiB 当成验收阈值。

## Soak 完成后必须重新证明业务状态

“压测进程 30 分钟没有退出”不是正确性证据。M10 在停止负载后执行一条有序闭环：

```text
stop new admission
→ drain every enqueued task to terminal completion
→ capture accepted/durable trace and final digest
→ close runtime
→ fresh reopen from Snapshot + WAL
→ retry selected commands with the same identity
→ replay accepted trace through direct serialized path
→ compare ordered results, original results and semantic digest
```

fresh reopen 检查实际持久状态，不信任仍在内存里的 service。same-identity duplicate replay 检查 M08/M09 durable idempotency 没有被异步 queue 破坏；direct serialized replay 反对丢任务、重排、重复 apply 或 benchmark-only shortcut。

对比时要区分 workload admission record 与 durable command trace：`OVERLOADED` 从未进入 WAL，不应出现在 accepted trace；`Enqueued` 最终若因 failed close 得到明确 failure，也不能伪装成已经 apply。只有 completion 中确认的 durable result 才进入对应重放集合。

负载前后还要运行 M00～M09 累计回归，并检查 `matching-core` 没有借性能单元偷偷改变业务语义。吞吐提高不能补偿一条 original result 或 semantic digest 分叉。

## 实现阅读从采样来源追到 report limitation

实现完成后，资源字段应逐项追溯来源：哪个来自 JVM MXBean，哪个来自 OS/process reader，哪个来自 JMH profiler，哪个来自 JFR sample；单位、采样时刻、失败语义和缺失字段如何表达。缺失工具不能填零，因为“观察不到”与“资源没有消耗”完全不同。

随后选择一个 checkpoint marker，关联附近的 scheduled offers、queue depth、completion gap、GC 和 CPU/RSS 样本。再沿 soak 结束流程确认 quiesce 先于 close、drain 后账本守恒、fresh reopen 使用真实目录、duplicate 保留 original result、direct replay 采用 accepted durable trace。

最后检查报告 limitation 是否明确包含：有限 30 分钟、指定 workload、单 load producer、指定环境、采样误差、JFR 非精确 allocation proof、无真实断电、无 Aeron/复制/网络。限制不是免责声明装饰，而是决定 evidence 可以支持哪些句子的合同。

## 验收要同时反对资源缺失和正确性捷径

一份合格结果至少需要：

- 完整 environment fingerprint，且 FileStore 绑定实际测试路径；
- micro 与 end-to-end 明确分栏，不互相冒充；
- allocation/GC/CPU/heap/non-heap/RSS/queue 都有来源、单位和时间范围；
- planned offer、resource sample、checkpoint marker 和 completion 可以在时间线上关联；
- QOP soak 足够 30 分钟并跨过多次同步 checkpoint；
- queue/backlog 不出现未经解释的持续增长，所有 enqueued task 最终有 completion；
- quiesce、fresh reopen、same-identity duplicate 与 direct replay 结果闭合；
- 任何采样失败、环境缺失或恢复分叉都使 release qualification 失败，而不是降级成一张不完整图；
- `CI_SMOKE` 的短资源样本仍只标记方法 smoke，不冒充 release soak。

实际 pass/fail、checkpoint count、资源 observations 与 artifact hash 在完成后由 evidence 填入。当前草稿只给出验收问题。

## 30 分钟结束的是一次资格运行，不是容量讨论

M10 的资源和 soak 证据能说明：在记录的环境、commit、QOP 与有限时间内，真实持久路径经历多次维护后仍能排空和恢复，资源趋势没有触发冻结的失败条件。它不能证明数月稳定、所有订单 mix、真实断电或 Cluster 下的相同行为。

这个克制使下一篇的 `matching-0.5.0` 有清晰含义：它可以是一个“可恢复单机撮合 + 有界准入 + 环境绑定容量资格”的命名停止点，而不是“已经高可用”或“拥有通用 TPS”。最后一篇将检查 RED、mutant、raw artifacts、正确性与 tag/manifest 是否足以共同支持这个产品身份。
