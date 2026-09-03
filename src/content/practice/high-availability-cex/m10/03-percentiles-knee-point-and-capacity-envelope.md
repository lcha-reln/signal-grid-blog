---
title: "M10·03：从 Percentile、饱和判据推导 Knee 与候选 QOP"
description: "用 producer lag、gate outcome/depth、logical scheduled-to-owner-completion latency、maintenance timing、连续饱和规则和三次 sweep 的最保守 knee，生成降序 provisional candidates；最终 QOP 只由长稳态晋级产生。"
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
draft: false
---

> 完成身份：annotated [`course/m10-start`](https://github.com/lcha-reln/cex-matching/tree/course/m10-start) peeled 到 `c93a5afff277c05068143a6f51d1b8d14508beb2`；annotated [`course/m10-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete) 与 [`matching-0.5.0`](https://github.com/lcha-reln/cex-matching/tree/matching-0.5.0) 都 peeled 到干净 source [`77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete)。完成数字来自 [`RELEASE_QUALIFICATION`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/qualification.json)，并由 [`cex.lab-evidence.v2` manifest](/signal-grid-blog/practice/high-availability-cex/m10/evidence/manifest.json) 逐件绑定；manifest SHA-256 为 `03134fc4e80e6a29ba425a1e383d393af0cceeb1692b865e2c4c833b45bcc717`。

“平均延迟 2 毫秒、最大吞吐 10 万 TPS”很难指导撮合服务准入。平均数可能掩盖同步 checkpoint 的长尾，“最大”可能只是某个短窗口把请求暂存在 queue，测试结束时仍有 backlog；即便 p99 很低，如果它从实际 send 起算，也可能已经删除 generator lag。

M10 不用单个峰值挑选产品操作点，而是建立一条因果链：**从绝对计划到达记录 producer lag、gate outcome/depth、admitted logical scheduled→owner-completion latency 与 checkpoint maintenance timing，以拒绝、queue depth、completion ratio 和 backlog 共同判定 saturation；在三个独立 sweep 中按固定规则找 knee，用最保守 knee 的 70% 生成 candidate，再收集所有不高于 candidate、且三轮均实测未饱和的 rate，组成严格降序的 `provisionalSoakCandidates`。这些只是长稳态候选；只有第一个完整 1800 秒 attempt 得到 `QUALIFIED`，才产生最终 `qualifiedOperatingPoint`。**

算法可以确定，测量输入仍受环境噪声影响。最终 QOP 是该环境、该 workload、该 commit 经短扫和长稳态共同晋级的保守操作点，不是跨机器 SLA。

## 一个端到端 percentile 必须说明实际拥有的时钟

M10 qualification raw 合同要求四类互补观察，但只有 admitted logical operation 的 scheduled→owner-completion 是端到端 latency percentile：

| 证据               | raw 字段或边界                                                                                | 主要暴露什么                                             |
| ------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| producer pacing    | scheduled arrival、gate `decisionNanos` 归一化后的 raw `admissionDecisionNanos`、producer lag | generator 与 scheduler 是否按计划施压                    |
| gate decision      | admission outcome、`ADMISSION_GATE_DECISION`、decision-time queue depth                       | pre-WAL 接纳/拒绝及决策时容量状态                        |
| logical end-to-end | scheduled arrival → raw `ownerCompletedNanos`                                                 | admitted logical operation 的全部排队、WAL 与 apply 等待 |
| maintenance timing | checkpoint scheduled、gate decision、owner completion                                         | 唯一 proactive checkpoint 的 admission lag 与完整停顿    |

被 `OVERLOADED` 拒绝的 offer 保留 scheduled arrival、admission decision、producer lag、gate outcome 与 queue depth，并进入 planned/decided/rejected 总账，但没有 owner-completion latency。不能把 reject 伪造为极短 completion，也不能从负载分母删除。

logical scheduled→owner-completion 的 schema summary 发布 p50、p95、p99、p99.9；样本 count 由 `logical.terminalCompletions`、`terminalDrain.logicalLatencySamples` 与 completion raw 对账。min/max 只能由完整 completion raw 重算，当前不是 schema summary 字段，不能写成已直接发布的 summary。具体 quantile convention 必须由 report schema 声明，并允许用 completion raw record 重算；producer lag 发布独立 p99/max 门禁，gate/queue 与 maintenance 也按各自字段核对。关键不在选择某个库，而在 raw、quantile summary 与 total 使用同一批 identity 并可对账。

冻结的 raw schema 没有 dequeue timestamp 或 admission→dequeue/dequeue→completion 分段；真实 gate time 只写为 `admissionDecisionNanos`，queue observation 用 `ADMISSION_GATE_DECISION` 声明它的 owner，独立 verifier 以 `(point, logicalOperationId, attempt)` 核对 arrival、queue、outcome 与 decision depth。真实 owner completion 则写为 `ownerCompletedNanos`。不能另行虚构一个与 gate decision 分离的 observation timestamp；内部 queue wait 与 service time 仍只能作为概念模型，不能写成已发布测量。

只报 average 会遗漏“多数很快、少数跨过 proactive checkpoint”的长尾；只报 percentile 而没有 count/min/max，又可能隐藏样本被过滤。M10 要求 logical end-to-end 的这些字段组合出现，因为每个字段反对一种不同的测量错误。资格业务流若返回 `CheckpointRequired` 会直接失败，不能把补救 retry 混入这组可发布 percentile。

producer lag 也有独立的资格门禁，而不是再添一条 latency percentile：p99 必须 `<=50 ms`，max 必须 `<=250 ms`。scheduled cut `T` 后允许最多 `250 ms` decision-closure grace，因此 decision 晚于 `T` 本身不是失败；cut 时尚未决策的计划需求必须作为显式 demand backlog 保留。违反 lag 门禁、closure 结束仍未决策，或把迟到槽从分母删掉，才属于 method/system failure；不能把它们归因成 saturation 后继续参与 knee。

## 饱和不是 CPU=100%，而是服务承诺开始失稳

对一个 measured rate，runner 先在固定 scheduled cut `T` 通过 admission-gate 内的 `metricsCut()` 冻结 `observationCut`。production cut 有单调 `cutToken`，但当前 raw phase-cut 只持久化 observed time 与账本，不把 token 写成不存在的 bundle 字段。方法合同明确标记 `IMMUTABLE_SCHEDULED_WINDOW_END_RAW_RECONSTRUCTED_BEFORE_PRODUCER_CLOSURE_AND_TERMINAL_DRAIN`：scheduler 明示 cut 不移动，capture lag 必须 `<=10 ms`；verifier 由 raw 按 `T` 重建 cut membership，不把 `observedNanos` 当成新切面。设 `D` 为 planned initial offers、`U` 为 cut 时尚未得到 gate decision 的 scheduled demand，已决策总数必须满足 `D-U=A+O+X`；已接纳未完成 `P=A-C`，`endingBacklog B=U+P`。只要该 immutable cut 满足以下任一条件，就标记为 saturated：

1. `OVERLOADED > 0`；
2. queue-depth p99 达到 capacity 的 80%；
3. measure window 内 `completed / admitted < 99.5%`；
4. cut 的 `endingBacklog B=scheduled-decision backlog U + service pending P` 相对开头增长超过 capacity 的 10%。
5. decision closure 期间 `postCutOverloaded > 0`，以 `POST_CUT_PLANNED_OVERLOAD_REJECTION` 单向失败关闭。

前四项是 fixed cut 本体，分别观察 admission、queue occupancy、completion 和包含未决策 demand 的趋势；第五项只允许 closure 的晚到 overload 把原本未饱和的 verdict 恶化为饱和。post-cut completion 或 queue 回落不得反向清除 fixed-cut reason。process CPU 累计时间不在 saturation 定义里，因为 CPU 使用不高并不表示服务没饱和：WAL force 可能在等存储，worker 可能在 checkpoint，锁或 scheduler 也可能限制 progress。GC 累计 count/millis、heap used、committed virtual memory 与系统级 memory-used 等资源 raw 是解释性证据，不应替代业务队列的判据；其中 committed virtual memory 和 system memory used 都不是进程 RSS。

queue capacity 为 64 时，p99=52 已经超过 80% 水位；即使没有一次 offer 被拒绝，也说明绝大多数高位样本只剩很少余量。若开始 backlog=4、结束=12，增长 8 超过 capacity 的 10%，同样饱和，即便最后一次 drain 能在测量窗口外清空。

completion ratio 则反对“只要成功 enqueue 就算处理完成”。如果 window 内 admitted 10,000、completed 9,900，比率 99%，剩余工作仍在 queue 或 worker 中，不能把 admission throughput 当 sustainable completion throughput。

冻结 observation cut 后，runner 先在有限 closure grace 内完成全部 initial decision，再执行 `terminalDrain`，把全部已接纳 logical operation 推进到 zero pending。closure/drain 后的守恒证明没有 silent drop，却不得反向提高 cut 内 completed/admitted、把 `U` 降为零或降低 `B`。否则任何短窗口都能靠未来工作被洗成更好的切面，saturation 定义就失去意义。

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

## Worked example：按冻结规则手算 knee、候选数组与最终 QOP

下面是完全虚构的教学表。假设 calibration 基数为 1,000 offers/s，因此 ladder 的一部分是 700、850、1,000、1,150、1,350、1,600，且未列出的 `postCutOverloaded` 都为 0。第一轮观测如下：

|  Rate | overload | queue p99 | completion ratio | backlog growth | saturated |
| ----: | -------: | --------: | ---------------: | -------------: | --------- |
|   700 |        0 |        18 |           100.0% |              0 | no        |
|   850 |        0 |        30 |            99.8% |              2 | no        |
| 1,000 |        3 |        58 |            99.4% |             10 | yes       |
| 1,150 |       41 |        64 |            97.8% |             22 | yes       |
| 1,350 |      220 |        64 |            94.0% |             30 | yes       |
| 1,600 |      510 |        64 |            90.0% |             35 | yes       |

单个 sweep 的 knee 是**第一对连续 saturated rate 中较小的那个**。这里第一对是 1,000 与 1,150，所以 knee=1,000，而不是最后一个没有 overload 的 850，也不是最大完成率或最大 observed throughput。

为什么要求连续两档？单一档可能因一次偶发暂停产生 saturation；相邻更高 rate 仍饱和，才形成沿负载上升的较稳定转折证据。如果整条 ladder 没有连续 saturated pair，资格必须失败关闭：它可能没有把系统推过 knee，也可能测量不稳定，不能从“最高档仍不错”直接宣布容量更高。

再假设三个教学 sweep 的 knee 分别为 1,000、1,150、1,000，则：

```text
published knee = min(1000, 1150, 1000) = 1000
capacity.qualifiedOperatingPointCandidate = floor(70% × 1000) = 700 offers/s
capacity.provisionalSoakCandidates = [700, 500, 250] // 教学数组：严格降序且三轮都实测未饱和

attempt #1: point=700, outcome=SATURATED
             // 完成 1800 秒、closure、drain、raw、fresh reopen 与 direct replay 后才能降档
attempt #2: point=500, outcome=QUALIFIED

soak.qualifiedAttemptNumber      = 2
soak.qualifiedPointId            = attempt #2 的 point identity
capacity.qualifiedOperatingPoint = 500 offers/s
```

70% 是 M10 冻结的 provisional-candidate 上界策略，不是普适容量定律，也不是可以直接合成的新测量档位。如果某个 rate 在任一 sweep 中饱和，它不能进入数组；如果没有共同未饱和的已测档位，资格立即失败。数组必须一次性由 sweep 结果完整导出并严格降序，不能在看到 soak 结果后插入新 rate、跳过中间档位、重排或重复。attempt 必须是数组的连续前缀：只有较高档得到完整且可复核的 `SATURATED`，才允许尝试下一档；任何 `SYSTEM_ERROR` 都立即停止。若所有候选都饱和，不得发布 QOP。

最终 QOP 只为**单 producer、空簿 `BUY IOC @ 100 × 1`** 这份 frozen workload 留出 queue、checkpoint 和环境抖动余量；下一篇会解释每个候选的 1800 秒资源与正确性证据。不能把教学例的 500 复制到另一台机器，也不能把它外推到 maker/taker 成交、深簿、多品种或多 producer 流量。

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
- scheduled cut 是否固定，cut 时未决策需求是否进入 `scheduledDecisionBacklogAtCut`，producer lag p99/max 是否不超过 50/250 ms，closure grace 后是否已完成全部 initial decision；
- admitted logical scheduled→owner-completion latency 的 count/min/max/p50/p95/p99/p99.9 是什么，gate decision time/outcome/depth 与 checkpoint scheduled/gate-decision/owner-completion 如何单独对账；
- fixed observation cut 是否满足 `D-U=A+O+X`、`P=A-C`、`B=U+P`，queue p99、completion ratio、backlog delta 触发了哪项本体 saturation，decision closure 的 `postCutOverloaded` 是否只能单向恶化 verdict，terminal drain 是否独立完成且不回写 cut；
- 三次 sweep 的 knee 如何从相邻状态计算，published knee 为何取该值；
- `qualifiedOperatingPointCandidate` 如何由 `floor(70% × published knee)` 得到，完整的 `provisionalSoakCandidates` 又如何从不高于 candidate、三轮都实测未饱和的 rate 中严格降序生成；
- `soak.attempts` 是否严格对应候选数组的连续前缀，较高 `SATURATED` attempt 是否在降档前完成 closure、drain、raw、fresh reopen 与 direct replay，是否不存在越过 `SYSTEM_ERROR` 的 fallback；
- 首个 `QUALIFIED` attempt 是否同时绑定 `soak.qualifiedAttemptNumber`、`soak.qualifiedPointId` 与 `capacity.qualifiedOperatingPoint`；全部候选饱和时是否保持无最终 QOP；
- checked-out HEAD/dirty、已加载 benchmark/local-runtime/core class tree hash、JVM、硬件、FileStore、WAL/Snapshot 配置与 workload hash 是什么；
- above-knee 是否出现明确 overload，而不是无界积压或 silently drop。

文章不能先写一个预期 throughput 再让报告去证明它；先冻结算法，正是为了防止事后改口。下面的完成数字全部由同一 qualification report 和可重算 raw 导出，没有继承前一次环境身份不完整的运行。

## 完成结果：从三次 knee 降到首个合格 QOP

完成运行的 20 秒 unpaced calibration 处理 `6,603` 个 logical operation，得到只用于选档的 reference rate `330`。因此三轮共用一条实测 ladder `[82, 165, 231, 280, 330, 379, 445, 528]`；每轮的 `379` 与 `445` 都是第一对连续 saturated rate：

```text
sweep knees                       = [379, 379, 379]
published knee                    = min(379, 379, 379) = 379 offers/s
qualifiedOperatingPointCandidate = floor(70% × 379) = 265 offers/s
provisionalSoakCandidates        = [231, 165, 82]
soak attempts                    = [231 SATURATED, 165 SATURATED, 82 QUALIFIED]
qualifiedOperatingPoint          = 82 offers/s
```

`265` 是计算出的上界，不是 runner 虚构出的新实测档位。候选数组只取不高于 265、且三轮都真实未饱和的 ladder point，所以是 `[231, 165, 82]`。三个 1800 秒 attempt 的业务账本如下：

| rate | outcome     | planned offers | admitted | overloaded | terminal completions | ending backlog |
| ---: | ----------- | -------------: | -------: | ---------: | -------------------: | -------------: |
|  231 | `SATURATED` |        415,800 |  415,721 |         79 |              415,721 |              0 |
|  165 | `SATURATED` |        297,000 |  296,029 |        971 |              296,029 |              0 |
|   82 | `QUALIFIED` |        147,600 |  147,600 |          0 |              147,600 |              0 |

这里的 latency 是 admitted logical operation 从 scheduled arrival 到 owner completion 的端到端时间，producer lag 则是另一条 scheduled arrival 到 gate decision 的时钟：

| rate | p50 latency |  p95 latency |   p99 latency | p99.9 latency | queue p99 |   producer lag p99 / max | observation-cut lag |
| ---: | ----------: | -----------: | ------------: | ------------: | --------: | -----------------------: | ------------------: |
|  231 | 3.459554 ms | 54.376720 ms | 270.368283 ms | 294.187596 ms |        62 | 2.020637 / 139.835097 ms |         0.131708 ms |
|  165 | 4.508228 ms |  7.098914 ms |  39.670554 ms | 809.206621 ms |        34 |  2.885368 / 77.661883 ms |         0.151292 ms |
|   82 | 6.115351 ms |  9.317974 ms |  10.776680 ms | 101.243337 ms |         1 |  5.950797 / 22.960788 ms |         0.050791 ms |

231 同时触发 `OVERLOAD_REJECTION` 与 `P99_QUEUE_DEPTH_AT_LEAST_80_PERCENT`；165 仍因 `OVERLOAD_REJECTION` 饱和；82 没有 saturation reason，且三个 point 都完成全部计划到达的准入决策、terminal drain 与 zero pending。因此 231 只是一个被保留的饱和尝试，不得把它外推成长稳态容量；最终 QOP 是 82。

raw 独立重算覆盖整个 release run，而不只是最后一个 point：`1,153,200` 条 arrival、`1,153,200` 条 queue、`1,113,889` 条 completion、`6,401` 条 resource、`102` 条 maintenance 和 `51` 条 phase-cut record；`1,113,889` 条 accepted trace 组成 `27` 个重建 recovery trace，与 27 个已发布 point 精确连接，trace hash 与 suffix records/bytes 都重算相等。这些计数才是 percentile、queue 和恢复结论的分母。

这些值只绑定报告里的 Apple M2、8 处理器、2 GiB heap、G1 GC、JDK `25.0.4.1+1-LTS`、macOS `26.0.1` aarch64、APFS WAL FileStore 与 power policy。frozen 负载只有一个 producer、一个 worker、一个 shard、空订单簿、递增 durable identity 的 `BTC-USDT BUY IOC @ 100 × 1`，不预置 maker，因此没有成交；报告也不包含 Rest、WebSocket、TLS、网络、Aeron、复制、多分片、多品种或多 producer。两个 JMH `SampleTime` 诊断仍与端到端 envelope 分离，不能拿来替换或抬高 QOP；CI smoke 也只是 `METHOD_SMOKE_ONLY`，不提供上述 release 数字。

## 源码阅读从 raw identity 走到决策，不从图表反推

从 [`M10QualificationRunner.java`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/M10QualificationRunner.java) 选择一个 rate，沿一条 logical identity 贯穿：scheduled arrival、由 production gate `decisionNanos` 得到的 raw `admissionDecisionNanos` 与 producer lag、`ADMISSION_GATE_DECISION` outcome/depth、raw `ownerCompletedNanos`、observation-cut membership、decision closure、terminal drain 与 summary bucket；再另选该 phase 的 maintenance identity，核对 checkpoint scheduled/gate decision/owner completion。应由 manifest 索引的 gzip raw 独立重算至少一个 logical scheduled→owner-completion percentile、cut 账本公式、四项 cut 本体输入与单向恶化的 `postCutOverloaded` 第五项，并确认 closure/drain 结果没有覆盖 observation cut。不要从 raw 猜测不存在的 dequeue 时刻或持久化 `cutToken`。

再阅读 knee selector：它应只消费按 ladder 顺序排列的 saturated boolean，选择第一对连续 true 的第一个；若没有连续 pair，返回资格失败，而不是 fallback 到最高 rate。最后确认三轮使用相同 canonical workload/profile，published knee 取最小值，candidate 才采用 70% 整数向下取整；`provisionalSoakCandidates` 必须包含全部 `<=candidate` 且每一 sweep 都未饱和的已测 rate，并严格降序。promotion verifier 还要拒绝 attempts 跳号、跳过候选、重排、重复、遗漏较高失败证据，以及 `qualifiedAttemptNumber`、`qualifiedPointId`、最终 QOP 之间的任何错配。

测试还应有 `M10-CLOSED-LOOP-GENERATOR`、`M10-LATENCY-FROM-ACTUAL-SEND`、`M10-METRICS-UNDERCOUNT` 和 `M10-WRONG-PERCENTILE-KNEE` 一类可执行错误候选。只有在相同冻结输入下产生 `STUDENT_FAILURE` 的语义反例才算 kill；timer 失效、raw 缺失或 runner 错误必须是 `SYSTEM_ERROR`。

## 短扫 candidate 不是 QOP，首个长稳态通过者才是

M10Q2 的短扫只说明：在被记录的发布环境和 workload 中，三次 sweep 的最保守 knee 给出 70% candidate，并能导出一组共同未饱和的已测档位。本次 231 与 165 都在完整 1800 秒后依固定 scheduled cut 被判为 `SATURATED`，但仍完成了 decision closure、terminal drain、raw 对账与恢复核验，所以 runner 才能依次降档；82 是第一个 `QUALIFIED` point，并被 `soak.qualifiedAttemptNumber=3`、`soak.qualifiedPointId=qop-soak-attempt-03-rate-00000082` 与 `capacity.qualifiedOperatingPoint=82` 三方绑定。它不保证真实用户流量具有相同订单分布，不保证网络、Aeron 或三节点复制后的容量，也不承诺跨运行的长期 p99。

这一边界恰好让 QOP 有工程价值：它不是一个脱离来源的营销数字，而是一条能从 raw offer、saturation 判据、三次 knee、完整候选数组和 attempt 前缀重复推导的决策。下一篇继续解读这三个实际候选的 all-thread allocation、GC count/millis、process CPU、heap used、committed virtual memory、系统级 memory used、queue 和 checkpoint，并用 quiesce/reopen/replay 检查“跑得久”有没有悄悄牺牲正确性。
