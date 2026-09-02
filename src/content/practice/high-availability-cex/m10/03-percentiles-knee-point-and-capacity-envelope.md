---
title: "M10·03：从 Percentile、饱和判据推导 Knee 与 QOP"
description: "用计划到达的四段延迟、raw/summary 对账、连续饱和规则和三次 sweep 的最保守 knee，生成环境绑定而非跨机器承诺的容量包络。"
date: 2026-09-02T09:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M10
lessonOrder: 30
permalink: percentiles-knee-point-and-capacity-envelope
tags:
  - 撮合引擎
  - 尾延迟
  - 容量规划
draft: true
---

> 实施中说明：本篇中的算例均为明确标注的教学数据，不是 M10 实测结果。三次 sweep、published knee、QOP、吞吐、拒绝数和全部 percentile 在 `RELEASE_QUALIFICATION` 完成后由 evidence 填入。

“平均延迟 2 毫秒、最大吞吐 10 万 TPS”很难指导撮合服务准入。平均数可能掩盖同步 checkpoint 的长尾，“最大”可能只是某个短窗口把请求暂存在 queue，测试结束时仍有 backlog；即便 p99 很低，如果它从实际 send 起算，也可能已经删除 generator lag。

M10 不用单个峰值挑选产品操作点，而是建立一条因果链：**从绝对计划到达记录四段延迟，以拒绝、queue depth、completion ratio 和 backlog 共同判定 saturation；在三个独立 sweep 中按固定规则找 knee，最后取最保守 knee 的 70% 作为 QOP。**

算法可以确定，测量输入仍受环境噪声影响。QOP 是该环境、该 workload、该 commit 的保守操作点，不是跨机器 SLA。

## 一个端到端 percentile 必须说明起点和样本集合

每个成功入队并获得 terminal completion 的 offer 至少产生四种时长：

| 分布 | 起点 → 终点 | 主要暴露什么 |
| --- | --- | --- |
| admission delay | scheduled → decision | generator lag、caller 争用、准入成本 |
| queue delay | admission → dequeue | backlog 与 owner worker 停顿 |
| service delay | dequeue → completion | checkpoint、WAL force、apply 与 worker 内成本 |
| end-to-end | scheduled → completion | 外部计划需求最终等待的全部代价 |

被 `OVERLOADED` 拒绝的 offer 没有 queue/service/end-to-end completion 样本，但必须保留 `scheduled → decision`，并进入 planned/offered/rejected 总账。不能把 reject 伪造为极短 completion，也不能从负载分母删除。

每个分布发布 count、min、max、p50、p95、p99、p99.9。具体 quantile convention 必须由 report schema 声明，并允许用 raw record 重算；草稿不擅自替完成实现指定另一套取整规则。关键不在选择某个库，而在 raw、直方图/quantile summary 与 total 使用同一批样本身份并可对账。

只报 average 会遗漏“多数很快、少数跨 checkpoint”的双峰或长尾；只报 percentile 而没有 count/min/max，又可能隐藏样本被过滤。M10 要求它们组合出现，因为每个字段反对一种不同的测量错误。

## 饱和不是 CPU=100%，而是服务承诺开始失稳

对一个 measured rate，只要满足以下任一条件，就标记为 saturated：

1. `OVERLOADED > 0`；
2. queue-depth p99 达到 capacity 的 80%；
3. measure window 内 `completed / admitted < 99.5%`；
4. window 末 backlog 相对开头增长超过 capacity 的 10%。

这四项分别观察 admission、queue occupancy、completion 和趋势。CPU 利用率不在 saturation 定义里，因为 CPU 低并不表示服务没饱和：WAL force 可能在等存储，worker 可能在 checkpoint，锁或 scheduler 也可能限制 progress。CPU、GC、RSS 等是解释性资源证据，不应替代业务队列的判据。

queue capacity 为 64 时，p99=52 已经超过 80% 水位；即使没有一次 offer 被拒绝，也说明绝大多数高位样本只剩很少余量。若开始 backlog=4、结束=12，增长 8 超过 capacity 的 10%，同样饱和，即便最后一次 drain 能在测量窗口外清空。

completion ratio 则反对“只要成功 enqueue 就算处理完成”。如果 window 内 admitted 10,000、completed 9,900，比率 99%，剩余工作仍在 queue 或 worker 中，不能把 admission throughput 当 sustainable completion throughput。

## 三次 sweep 为什么从 calibration ladder 开始

`RELEASE_QUALIFICATION` 先执行 20 秒 unpaced calibration。它只用于得到缩放基数，不发布为产品容量。随后三个独立 sweep 都使用：

```text
rate ladder = calibration × 25/50/70/85/100/115/135/160%
每个 rate 先 warmup 10 秒
再 measure 30 秒
```

calibration 让不同环境上的 ladder 大致覆盖低载到过载，而不是预写一个可能在慢机器上全饱和、在快机器上全空闲的绝对列表。它不进入 capacity claim，是因为 unpaced producer 本身会受到本地循环、queue 拒绝与调度方式影响，并不等同于可持续到达率。

每个 rate 有独立 warmup，是为了让 JIT、cache 和本地状态进入相对稳定区间；measure 仍保留 checkpoint 等正常行为。不能在 warmup 结束后才临时清空 queue、重置 runtime 或扩大 budget，从而让 measurement 观察另一个系统。

三个 sweep 不是简单把窗口延长三倍。它们产生三个独立 knee，暴露热状态、文件系统、GC 和调度噪声造成的不稳定；发布时取最小值，避免只挑最好的一次。

## 先预测：只有一档饱和时能不能宣布 knee

设一轮 ladder 中只有 1,350 offers/s 被标记 saturated，1,150 和 1,600 都没有饱和。此时能否把 1,350 直接当 knee？不能。孤立饱和可能来自一次噪声，而更高一档恢复非饱和又说明转折没有形成连续证据；资格应报告“没有找到第一对连续 saturated rate”，而不是挑中间的异常点。

再预测一种相反情况：最高两档仍不饱和。它是否证明系统容量高于最高档？它只证明这条 ladder 没有覆盖 knee，无法产生冻结算法要求的发布操作点。两种情况都必须失败关闭，促使复核者检查 calibration、计时、raw ledger 与环境，而不是事后发明 fallback。

## Worked example：按冻结规则手算 knee 与 QOP

下面是完全虚构的教学表。假设 calibration 基数为 1,000 offers/s，因此 ladder 的一部分是 700、850、1,000、1,150、1,350、1,600。第一轮观测如下：

| Rate | overload | queue p99 | completion ratio | backlog growth | saturated |
| ---: | ---: | ---: | ---: | ---: | --- |
| 700 | 0 | 18 | 100.0% | 0 | no |
| 850 | 0 | 30 | 99.8% | 2 | no |
| 1,000 | 3 | 58 | 99.4% | 10 | yes |
| 1,150 | 41 | 64 | 97.8% | 22 | yes |
| 1,350 | 220 | 64 | 94.0% | 30 | yes |
| 1,600 | 510 | 64 | 90.0% | 35 | yes |

单个 sweep 的 knee 是**第一对连续 saturated rate 中较小的那个**。这里第一对是 1,000 与 1,150，所以 knee=1,000，而不是最后一个没有 overload 的 850，也不是最大完成率或最大 observed throughput。

为什么要求连续两档？单一档可能因一次偶发暂停产生 saturation；相邻更高 rate 仍饱和，才形成沿负载上升的较稳定转折证据。如果整条 ladder 没有连续 saturated pair，资格必须失败关闭：它可能没有把系统推过 knee，也可能测量不稳定，不能从“最高档仍不错”直接宣布容量更高。

再假设三个教学 sweep 的 knee 分别为 1,000、1,150、1,000，则：

```text
published knee = min(1000, 1150, 1000) = 1000
QOP            = floor(70% × 1000)     = 700 offers/s
```

70% 是 M10 冻结的保守策略，不是普适容量定律。它为当前 workload 留出 queue、checkpoint 和环境抖动余量；下一篇的 30 分钟有限 soak 会在这个 QOP 上检验资源与正确性，但仍不能把 700 复制到另一台机器。

## 常见错误：哪种图会制造一个虚假的高 knee

比较三种错误处理：

- 图 A 只绘制 completion 样本，删除 overload；
- 图 B 从 actual send 起算 latency，删除 generator lag；
- 图 C 每个 rate 测完后无限 drain，再用最终 completed/admitted=100% 覆盖窗口内 ratio。

三者都会把 knee 往右推。A 把系统明确拒绝的需求移出样本，B 把施压器和调度跟不上移出延迟，C 把不可持续 backlog 的未来工作借回来填满当前窗口。

正确报告需要同时给出窗口内业务判据和 drain 后守恒：前者判断 rate 是否持续，后者证明没有 silently dropped completion。两者回答不同问题，不能用 drain 后全完成否定 measure window 已饱和的事实。

另一个常见错误是按 throughput 最大点选 knee。bounded queue 在短窗口里可以吸收工作，使 admitted throughput 暂时高于 sustainable completion；最大点还可能伴随大量 rejection。M10 的 knee 由预先冻结的 saturation 状态序列决定，避免运行后挑一个好看的指标。

## capacity envelope 应保留怎样的边界

一份合格 envelope 不只包含一个 QOP。它至少应能回答：

- calibration、rate ladder、warmup/measure window、三次重复和 queue capacity 是什么；
- 每个 rate 的 planned/offered/enqueued/rejected/completed 是否守恒；
- 四段 latency 的 count/min/max/p50/p95/p99/p99.9 是什么；
- queue p99、completion ratio、backlog delta 触发了哪项 saturation；
- 三次 sweep 的 knee 如何从相邻状态计算，published knee 为何取该值；
- QOP 如何由固定公式得到；
- commit、JVM、硬件、FileStore、WAL/Snapshot 配置与 workload hash 是什么；
- above-knee 是否出现明确 overload，而不是无界积压或 silently drop。

其中实际数字、hash 与环境字段在资格运行完成后由 evidence 填入。文章不能先写一个预期 throughput 再让报告去证明它；先冻结算法，正是为了防止事后改口。

## 实现阅读从 raw identity 走到决策，不从图表反推

完成实现后应选择一个 rate，沿一条 offer identity 贯穿：scheduled record、admission decision、queue sample、dequeue、completion、window membership 与 summary bucket。随后独立从 raw 重算至少一个 percentile 和四项 saturation 输入。

再阅读 knee selector：它应只消费按 ladder 顺序排列的 saturated boolean，选择第一对连续 true 的第一个；若没有连续 pair，返回资格失败，而不是 fallback 到最高 rate。最后确认三轮使用相同 canonical workload/profile，published knee 取最小值，QOP 采用整数向下取整。

测试还应有 `M10-CLOSED-LOOP-GENERATOR`、`M10-LATENCY-FROM-ACTUAL-SEND`、`M10-METRICS-UNDERCOUNT` 和 `M10-WRONG-PERCENTILE-KNEE` 一类可执行错误候选。只有在相同冻结输入下产生 `STUDENT_FAILURE` 的语义反例才算 kill；timer 失效、raw 缺失或 runner 错误必须是 `SYSTEM_ERROR`。

## QOP 是后续资格的输入，不是最终销售承诺

M10 的 QOP 只说明：在被记录的发布环境和 workload 中，三次 sweep 的最保守 knee 经 70% 策略缩减后，得到下一阶段有限 soak 的目标到达率。它不保证真实用户流量具有相同订单分布，不保证网络、Aeron 或三节点复制后的容量，也不承诺长期 p99。

这一边界恰好让 QOP 有工程价值：它不是一个脱离来源的营销数字，而是一条能从 raw offer、saturation 判据、三次 knee 与公式重复推导的决策。下一篇将在 QOP 下观察 allocation、GC、CPU、memory、RSS、queue 和 checkpoint，并用 quiesce/reopen/replay 检查“跑得久”有没有悄悄牺牲正确性。
