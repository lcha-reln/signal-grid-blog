---
title: "M10·04：把 Allocation、GC 与有限 Soak 变成可解释证据"
description: "记录 all-thread allocation、GC count/millis、process CPU、heap、committed virtual memory、系统级 memory-used 与 queue，对降序 provisional candidates 逐个执行有限 soak；饱和候选也必须闭合恢复。"
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
draft: false
---

> 完成身份：annotated [`course/m10-start`](https://github.com/lcha-reln/cex-matching/tree/course/m10-start) peeled 到 `c93a5afff277c05068143a6f51d1b8d14508beb2`；annotated [`course/m10-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete) 与 annotated [`matching-0.5.0`](https://github.com/lcha-reln/cex-matching/tree/matching-0.5.0) 均 peeled 到 clean source [`77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb`](https://github.com/lcha-reln/cex-matching/tree/course/m10-complete)。公开复核从 [`manifest.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/manifest.json) 开始，manifest SHA-256 为 `03134fc4e80e6a29ba425a1e383d393af0cceeb1692b865e2c4c833b45bcc717`。

> 本篇的实测数字只来自 [`qualification.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/qualification.json)、[`recovery.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/recovery.json) 与 manifest 绑定的 gzip raw；旧 `8d13c40` 运行仍是 `EVIDENCE_CONTRACT_GAP`，没有被新 schema 追认。

同一个 end-to-end p99 可以由完全不同的系统状态产生：一种运行 all-thread allocation delta 稳定、queue 在 phase 唯一 proactive checkpoint 后回落并保持低位；另一种运行 heap used 持续增长、GC count/time delta 加速，只是 30 秒窗口尚未暴露长期趋势。只保存最终 percentile，无法区分二者，更无法解释换 JVM 或存储后为什么 knee 移动。

M10 的资源证据不负责把所有慢点归因到某一行代码，而负责建立一条可复核的共时关系：**在明确环境和固定 workload 下，每个实际尝试的 provisional candidate 中，logical scheduled→owner-completion latency、queue、checkpoint、all-thread allocated bytes、GC count/millis、process CPU nanos、heap used、committed virtual memory 与系统级 memory used 如何随时间变化；1800 秒后，系统能否排空、fresh reopen，并保持 duplicate original result 与串行重放一致。**

有限 soak 只扩大观察窗口，不会自动升级为长期稳定性或生产就绪认证。

## 没有环境指纹，性能结果就没有可迁移的身份

release evidence 至少绑定以下事实：

```text
source commit = checked-out HEAD / course tag / product tag / dirty=false
loaded matching-benchmarks/local-runtime/core class-tree SHA-256 + combined SHA-256
Java vendor + version + explicitly supplied JVM arguments
maximum heap + garbage-collector names
OS name + version + architecture
CPU model + logical cores + RAM
operator storage labels + actual WAL root / normalized file URI
WAL FileStore name + type + total / usable / unallocated space
queue / WAL / Snapshot configuration
workload schema + canonical hash + seed
rate / windows / repetitions / timer configuration
```

存储身份不能只写操作系统名称或操作者提供的设备标签。APFS、本地 NVMe、容器 overlay、网络卷或加密层会改变 force 和尾延迟；同一台机器把 WAL 换到另一个挂载点，也可能移动 capacity envelope。`matching.m10.qualification.v2` 现在要求 runner 从实际 `walRoot` 捕获规范化绝对 `file:` URI、FileStore name/type，以及 total/usable/unallocated space；`storageDevice` 与 `filesystem` 仍作为 operator labels 单独保留，不能冒充实际探测值。空间字段是运行时点观察，也不等于挂载参数、介质耐久或跨挂载点归因。

JVM 输入同样重要。只记录 `java.version` 和显式参数，仍无法知道运行时真正采用的 heap 上限与 GC identity。新合同因此同时要求 `maximumHeapBytes` 和按自然顺序保存、非空且不重复的 `garbageCollectorNames`；它们不是完整 VM flag 展开，也不证明某次 pause 的原因。runner 还必须现场执行 `git rev-parse HEAD`，要求它等于声明的 source commit；release profile 要求工作树 clean，并分别哈希实际加载的 `matching-benchmarks`、`matching-local-runtime`、`matching-core` class tree，再绑定一个 combined runtime hash。这样“源码是某 commit”与“JVM 实际加载了哪些 class bytes”不会被当成同一条未经验证的主张。

`cex.lab-evidence.v2` manifest 不再只摘要 Java/OS/arch，而是必须精确投影 qualification report 的完整 environment object；writer 与独立 verifier 会逐字段对比。普通 `CI_SMOKE` 即便拥有部分同名环境字段，仍是 `METHOD_SMOKE_ONLY`，禁止替代 release capture。旧 `8d13c40` 正因为缺少 maximum heap、GC names、WAL root/URI 与实际 FileStore/space 而被拒绝；source `77e80b0962cd6a74f6d8cd0ac203b3be5bdd6bdb` 的完整重跑则将这些字段全部绑定，并通过了独立 bundle verifier。

## Micro allocation 与端到端资源不是同一个观察

JMH 使用独立 fork 与 `SampleTime`，并且完整 release 只接受恰好两个诊断入口：`CoreMatchingBenchmark.restingMakerThenMatchingTaker` 与 `CoreMatchingBenchmark.canonicalEnvelopeDecode`。当前 `jmhCore` 没有启用 GC/allocation profiler，只发布完整 SampleTime histogram；不能从这份结果声称精确 allocation/op。前者只覆盖 core benchmark path，后者只覆盖 canonical M08 envelope decode；两者都不包含完整 service task、defensive bytes copy、queue node、WAL force、Snapshot 或 resource sampler，也都不参与 capacity gate。

端到端资格的资源时序只观察：

- `totalThreadAllocatedBytes`：所有线程的累计 allocation bytes；
- `garbageCollectionCount` 与 `garbageCollectionMillis`：累计 GC 次数与累计毫秒，不含单次 pause 事件/时长；
- `processCpuNanos`：进程累计 CPU time；
- `heapUsedBytes`：heap gauge；
- `committedVirtualMemoryBytes`：已承诺虚拟地址空间，不是 RSS；
- `systemMemoryUsedBytes`：系统总内存减 free memory 的系统级 gauge，不是进程内存；
- `queueDepth`：服务 queue gauge。

可以用 phase 末值减起点值，形成 all-thread allocated bytes delta，进一步除以 logical terminal completions 得到解释性比率；但它包含 sampler、coordinator 等所有线程，既不是 JMH allocation/op，也不能归因到某类对象。两个 JMH diagnostic 与端到端资源流可以互相提出假设，却不能简单相减或换算产品 TPS。

## 1 Hz 是采样合同，不是“尽量多取几个点”

resource sampler 从每个 scheduled window start 覆盖到对应 terminal drain，目标 cadence 是 `1 Hz`。资格同时限制三件事：相邻计划采样时刻的 gap、相邻真实 `observedNanos` 的 gap，以及每条 `observedNanos - scheduledNanos` sampling lag，三者都必须 `<=2 s`。sampler 从真实 observation 计算下一目标，不在长停顿后连发 catch-up 样本伪造规则覆盖。1 Hz 只支撑 1800 秒长期资源覆盖与漂移观察，不能保证命中一次毫秒级 checkpoint 峰值；checkpoint 的精确 scheduled/admission/owner-completion 来自 maintenance raw，queue 与 logical latency 则由事件级 raw 补充。这三个 2 秒门禁反对的是稀疏平均与补点幻觉，不是把资源样本升级成精细 pause profiler。

字段还要按语义分组。all-thread allocation、GC count/millis 与 process CPU nanos 等累计 counter 必须单调不减；heap used、committed virtual memory、system memory used 与 queue depth 等 gauge 必须非负，却不能错误地要求单调。采集器不可用、维度缺失、scheduled/observed gap 或 sampling lag 越界都属于 system/environment failure，不能把缺失值填成零后继续资格。

## 先预测：每次 attempt 的唯一 checkpoint 峰值之后有没有真正恢复

每个 provisional-candidate attempt 都是一个 1800 秒 scheduled phase，只在该 phase start 后 `100 ms` 安排一次 proactive checkpoint。健康的简化形状可能是：

```text
queue depth
  0 ──╮
      ╰──────╮
             ╰── 0 ─────────────────────────
       one checkpoint       long post-maintenance window
```

checkpoint 期间 worker 停止完成业务任务，queue 上升；checkpoint 完成后，若该 candidate 的 service capacity 足以承受计划到达率，queue 应回落到基线，并在余下时间不持续爬升。这里 checkpoint 对应的 end-to-end tail 不能删除，但也不能把一次早期峰值叙述成周期维护证据。

危险形状是一开始就没有回落，或回落后又在没有第二次 checkpoint 的情况下持续增长：

```text
baseline: 0 → checkpoint peak → 8 → 11 → 16 → 23 ...
```

即使 30 秒 sweep 的平均 completion 接近 admission，30 分钟 soak 仍会暴露 checkpoint 后追不平或后续慢性增长。若 committed virtual memory 增长而 heap used 回落，只能形成“虚拟地址空间承诺变化”的诊断问题，不能写成 RSS 或物理驻留增长；system memory used 的变化也受整机其他进程影响。当前字段不足以独立证明 native leak。

先做预测：如果 CPU 只有 40%，queue 在唯一 checkpoint 后仍持续增长，能否得出“还有 60% CPU 容量”？不能。瓶颈可能是 force、单 worker、I/O wait 或 scheduler；业务 progress 指标比 CPU 百分比更接近服务承诺。

## 每个 1800 秒候选 attempt 都应保持真实维护行为

qualification v2 先从短扫导出完整、严格降序的 `capacity.provisionalSoakCandidates`，再依次执行候选。每个真正进入 `soak.attempts` 的 attempt 都必须：

- 使用同一绝对 open-loop schedule 语义；
- 保留固定 queue capacity 64；
- 保留真实 WAL force，并明确使用 `M10Q2` 继承的有限 `1000000 records / 1 GiB` suffix budget；M09 默认 `64 records / 1 MiB` 只作为不变对照公开，不能冒充本次 qualification config；
- 在每个 scheduled phase 的 `100 ms` offset 把 proactive checkpoint 送入同一 owner-worker FIFO，gate admission lag 不超过 `10 ms`；prefix 以 actual start suffix `+ ceil(rate×110 ms) + capacity + 1` 预检，post-checkpoint 以 `N + capacity + 1` 预检，owner 完成时真实 prefix 不超界与 `1024-byte` planning ceiling 运行时复核；
- 资格业务流的 `CHECKPOINT_REQUIRED` 计数保持为零；出现该结果即 `SYSTEM_ERROR`，立即停止整个 qualification，不以补救 checkpoint/retry 延续当前 point，也不降档；
- 覆盖该 attempt 在 `+100 ms` 的唯一 proactive checkpoint，保存它在同一 FIFO 中的 admission/completion 与停顿 raw；
- 保存资源时间序列、raw offer ledger 与 checkpoint markers；
- 保持 1 Hz target cadence，scheduled gap、observed gap 与每条 sampling lag 都不超过 2 秒，并让 initial-arrival thread 独立于 completion/checkpoint/resource/artifact coordinator；
- 不因采样器压力而静默丢失 planned offer；
- 在运行结束后停止新准入并 drain 已接纳任务。

如果唯一 proactive checkpoint 的 admission/completion raw 缺失，或它没有走同一 FIFO，这是 `SYSTEM_ERROR`，不能因为“业务没报错”而通过，也不能降档。attempt 自己在固定 scheduled cut `T` 的 observation 必须可机械判定；该 cut 是 `RAW_RECONSTRUCTED`，不会随 capture 移动，capture lag 不超过 10 ms，并由 raw 按 `T` 重建 planned、decided、`scheduledDecisionBacklogAtCut`、service pending 和 `endingBacklog=scheduled-decision backlog+service pending`。`T` 后最多 250 ms 的 decision closure 必须完成所有 initial decision，但不能回写切面清掉 demand backlog；其中 `postCutOverloaded>0` 只能以第五项单向使 verdict 饱和。

若结论是 `SATURATED`，runner 仍须完成 closure、terminal drain、完整 raw 封存、fresh reopen 与 direct replay；这些证据闭合后，attempt 才能作为连续前缀中的失败候选保留，并允许尝试严格降序数组的下一档。若出现任何方法、环境、账本、durability、recovery 或 verifier `SYSTEM_ERROR`，资格立即停止。只有首个完整 `QUALIFIED` attempt 才设置 `soak.qualifiedAttemptNumber`、`soak.qualifiedPointId` 和最终 `capacity.qualifiedOperatingPoint`；所有候选都饱和时不得写 release `PASS`。soak 的教学职责不是等待时钟，也不是伪造周期维护，而是覆盖真实维护边界后继续观察长时间资源与 backlog 漂移。

同样，采样间隔与 timer 配置必须记录。只有开始/结束两个点无法辨认 peak 与趋势；采样过密又可能扰动被测系统。M10 发布的是带配置的观察，不把 observer effect 宣称为零。

## 实测环境：先把数字锁回它发生的机器

`m10-release-77e80b0-20260903` 从 `2026-09-02T21:41:08.259162Z` 运行到 `2026-09-03T00:26:17.524744Z`。环境对象由 runner 捕获后精确投影到 manifest：

| 维度                | 发布记录                                                                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Java                | OpenJDK Runtime Environment `25.0.4.1+1-LTS`，Eclipse Adoptium，OpenJDK 64-Bit Server VM                         |
| JVM input arguments | `-Dfile.encoding=UTF-8`、`-Duser.country=CN`、`-Duser.language=zh`、`-Duser.variant`                             |
| heap / GC           | maximum heap `2,147,483,648 B` (2 GiB)；`G1 Concurrent GC`、`G1 Old Generation`、`G1 Young Generation`           |
| OS / CPU / RAM      | Mac OS X `26.0.1`，`aarch64`，Apple M2，8 logical processors，`8,589,934,592 B` physical memory                  |
| operator labels     | storage `APPLE SSD AP0256Z`，filesystem `APFS`，power `AC_POWER_LOW_POWER_MODE_OFF_SLEEP_DISABLED`               |
| actual WAL root     | `/private/tmp/cex-matching-m10-release-77e80b0-wal`，`file:///private/tmp/cex-matching-m10-release-77e80b0-wal/` |
| actual FileStore    | name `/dev/disk3s5`，type `apfs`，total `245,107,195,904 B`，usable / unallocated 均为 `25,473,101,824 B`        |

这是数字的适用边界，不是对其他 JVM、文件系统或功耗策略的等价声明。完整字段与运行时 class-tree hash 可直接查看 [`qualification.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/qualification.json)。

## 三次 1800 秒 attempt：两次饱和，第三次通过

三轮 sweep 的 knee 都是 `379 offers/s`，published knee 为 `379`，70% candidate 为 `265`。完整已测、严格降序的 provisional candidates 是 `[231, 165, 82]`；runner 没有跳过前两档：

| rate | outcome     | planned / admitted / overload / terminal |    p99 latency | p99 queue | ending backlog |
| ---: | ----------- | ---------------------------------------- | -------------: | --------: | -------------: |
|  231 | `SATURATED` | 415,800 / 415,721 / 79 / 415,721         | 270,368,283 ns |        62 |              0 |
|  165 | `SATURATED` | 297,000 / 296,029 / 971 / 296,029        |  39,670,554 ns |        34 |              0 |
|   82 | `QUALIFIED` | 147,600 / 147,600 / 0 / 147,600          |  10,776,680 ns |         1 |              0 |

`231` 同时命中 `OVERLOAD_REJECTION` 和 `P99_QUEUE_DEPTH_AT_LEAST_80_PERCENT`，`165` 命中 `OVERLOAD_REJECTION`；两者都在降档前完成 drain、raw 封存与恢复闭环。`82` 是第一个完整 `QUALIFIED` attempt，因此最终 QOP 是 `82 offers/s`。它只适用于上述环境与 source、单 producer、空簿、`BTC-USDT BUY IOC @ 100 × 1` 的冻结 workload，不是通用 TPS。

## Resource raw 回答“发生了什么”，不回答“谁是根因”

下表按 point id 从三个 [`resources` gzip 分片](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/resources/part-00000.jsonl.gz)重算；另两片是 [`part-00001`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/resources/part-00001.jsonl.gz) 与 [`part-00002`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/resources/part-00002.jsonl.gz)。

| rate | samples | all-thread allocation delta | GC count / millis delta | process CPU delta |           heap-used min…max | queue min…max | max sampling lag |
| ---: | ------: | --------------------------: | ----------------------: | ----------------: | --------------------------: | ------------: | ---------------: |
|  231 |   1,792 |            32,448,107,800 B |         +44 / +1,857 ms | 85,313,295,000 ns | 500,824,472…1,855,584,664 B |          0…64 |    34,554,500 ns |
|  165 |   1,791 |            23,129,479,144 B |          +316 / +411 ms | 66,859,006,000 ns |  25,118,456…1,063,642,232 B |          0…64 |    10,137,250 ns |
|   82 |   1,792 |            11,536,481,976 B |          +212 / +232 ms | 49,645,088,000 ns |    32,756,824…548,793,912 B |          0…14 |    10,027,584 ns |

三次 attempt 的最大 scheduled/observed sample gap 分别为 `1,034,554,500`、`1,010,137,250`、`1,010,027,584 ns`，均低于 2 秒门禁。QOP 的 committed virtual memory 范围为 `449,776,451,584…449,782,890,496 B`，system memory used 范围为 `7,534,870,528…8,529,149,952 B`。前者不是 RSS，后者是整机 gauge；表中 allocation 是 all-thread delta，GC millis 是累计差，都不能定位对象或单次 pause。

JMH 则是另一个诊断层。[`core-sample-time.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/diagnostics/core-sample-time.json) 使用 JMH 1.37、单线程、2 forks、3 次 × 2 秒 warmup 和 5 次 × 3 秒 measurement：

| diagnostic-only benchmark       | SampleTime score |   p50 |   p99 | unit  |
| ------------------------------- | ---------------: | ----: | ----: | ----- |
| `canonicalEnvelopeDecode`       |         1,112.40 |   917 | 1,834 | ns/op |
| `restingMakerThenMatchingTaker` |         2,673.27 | 2,292 | 4,416 | ns/op |

这两个 histogram 的 `resultScope=DIAGNOSTIC_ONLY`、`eligibleForCapacityEnvelope=false`；它们没有 queue、WAL force、checkpoint 和 end-to-end scheduled-arrival path，也没有 allocation profiler。因此 JMH 只用于定位 core/decode 路径，没有参与 knee、candidate 或 QOP 决策。

## 每个 attempt 完成后都必须重新证明业务状态

“某个压测进程 1800 秒没有退出”不是正确性证据。M10 对每个实际尝试的候选在停止负载后执行一条有序闭环；它适用于最终通过者，也适用于准备降档的饱和候选：

```text
stop new admission
→ drain every enqueued task to terminal completion
→ capture accepted/durable trace and final digest
→ close runtime
→ fresh reopen from Snapshot + WAL under M10Q2 inherited finite budget
→ retry selected commands with the same identity
→ replay accepted trace through M08 unbounded/no-snapshot fresh-apply diagnostic
→ compare ordered results, original results and semantic digest
```

fresh reopen 检查实际持久状态，不信任仍在内存里的 service；它必须继续使用 `M10Q2` 继承的有限 budget，并记录实际 suffix records、suffix bytes 与恢复耗时。same-identity duplicate replay 检查 M08/M09 durable idempotency 没有被异步 queue 破坏。direct ordered replay 则明确使用 `M08_LEGACY_UNBOUNDED_NO_SNAPSHOT`，只是一条 fresh-apply transcript/state 诊断，用于反对丢任务、重排、重复 apply 或 benchmark-only shortcut；它不执行第二套 M09 full snapshot，也不能替代当前 attempt 的有限 fresh recovery proof。

这里的 actual suffix 不是 runner 抄进 JSON 的一个数字，而是三条真实路径必须相等：owner/coordinator 在最后一次成功 checkpoint reset 后累计的 durable record 数与 bytes；独立解压 completion raw 后，按 `NEW_DURABLY_APPLIED.walRecordLength` 重建的 records/bytes；以及 fresh `LocalMatchingRuntime.open(...)` 后由 `recoverySuffixStats()` 读取的实际恢复 suffix。三方不一致就不能生成 recovery PASS。随后 summary 与 `recovery.json` 还要逐字段一致，独立 bundle verifier 再从 decompressed raw 复算一次；这才阻止“重开成功，但报告里的 suffix 其实来自运行前估算”。

结果证据同样是三方语义闭合：live durable trace、当前 attempt 有限 fresh reopen 后的 duplicate original results、以及 M08 diagnostic direct replay 的有序 result digest 与 terminal semantic-state digest 必须一致；accepted-trace v2 还要从 gzip JSONL 中独立重建二进制 trace hash。direct replay 是第三条诊断观察，不会把它变成第二个权威恢复源。

对比时要区分 workload admission record 与 durable command trace：`OVERLOADED` 从未进入 WAL，不应出现在 accepted trace；`Enqueued` 最终若因 failed close 得到明确 failure，也不能伪装成已经 apply。只有 completion 中确认的 durable result 才进入对应重放集合。

负载前后还要运行 M00～M09 累计回归，并检查 `matching-core` 没有借性能单元偷偷改变业务语义。吞吐提高不能补偿一条 original result 或 semantic digest 分叉。

## 源码阅读从采样来源追到 report limitation

从 [`M10QualificationRunner.java`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/M10QualificationRunner.java)、[`JdkResourceCollector.java`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/JdkResourceCollector.java) 与 [`EnvironmentFingerprint.java`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/EnvironmentFingerprint.java) 逐项追溯环境与资源来源：maximum heap、GC names、真实 WAL FileStore、all-thread allocation、GC 累计 count/millis、process CPU nanos、heap used、committed virtual memory、system memory used 和 queue depth 分别使用什么单位、采样时刻、失败语义。缺失工具不能填零，因为“观察不到”与“资源没有消耗”完全不同；JMH raw 也不能被解释成未启用 profiler 的 allocation 数据。

随后选择一个 checkpoint marker，关联附近的 scheduled offers、queue depth、logical completion、GC 累计 delta 与 process CPU samples。再沿 soak 结束流程确认 quiesce 先于 close、drain 后账本守恒、fresh reopen 使用真实目录，且 suffix records/bytes 同时等于 owner 累计、decompressed completion raw 重建与 reopened runtime `recoverySuffixStats()`；最后检查 duplicate 保留 original result、direct replay 采用 accepted durable trace。

最后检查报告 limitation 是否明确包含：有限 30 分钟、指定 workload、单 load producer、指定环境、all-thread allocation 非对象归因、无 allocation/op profiler、无 RSS/non-heap/单次 GC pause、无真实断电、无 Aeron/复制/网络。限制不是免责声明装饰，而是决定 evidence 可以支持哪些句子的合同。

## 验收要同时反对资源缺失和正确性捷径

一份合格结果至少需要：

- release report 明确列出 Java/runtime、显式 JVM arguments、maximum heap、GC names、OS/arch、CPU/processors、physical memory、operator storage labels 与 power policy，并从真实 WAL root 捕获规范化绝对 file URI、FileStore name/type/total/usable/unallocated space；source commit 等于 checked-out HEAD，release 工作树 clean，并绑定三组已加载 class tree 与 combined runtime SHA-256；
- micro 与 end-to-end 明确分栏，不互相冒充；
- totalThreadAllocatedBytes、GC count/millis、processCpuNanos、heapUsedBytes、committedVirtualMemoryBytes、systemMemoryUsedBytes 与 queueDepth 都有来源、单位和时间范围；
- committed virtual memory 明确不叫 RSS，system memory used 明确是系统级 gauge；GC 累计 millis 不冒充单次 pause，JMH 不冒充 allocation/op profiler；
- planned offer、resource sample、checkpoint marker 和 completion 可以在时间线上关联；
- sampler 覆盖 scheduled window start 到 terminal drain，目标 1 Hz，scheduled gap、observed gap 与每条 sampling lag 都不超过 2 秒，累计 counter 单调而 gauge 只要求非负；
- `provisionalSoakCandidates` 完整且严格降序，`soak.attempts` 是其从第一个元素开始的连续前缀；每个 attempt 足够 1800 秒，覆盖各自唯一的 +100 ms same-FIFO proactive checkpoint，并保存维护 admission/completion raw 与停顿；
- 每个 attempt 在 fixed scheduled cut 上的 `D-U=A+O+X`、`P=A-C`、`B=U+P` 账本闭合，capture lag 不超过 10 ms；250 ms decision closure 与 terminal drain 不回写 cut，`postCutOverloaded` 仅可单向恶化 verdict；
- 较高 `SATURATED` attempt 在降档前已完成 closure、drain、raw、fresh reopen 与 direct replay；任何 `SYSTEM_ERROR` 都立即停止，首个 `QUALIFIED` attempt 与 `soak.qualifiedAttemptNumber`、`soak.qualifiedPointId`、最终 `capacity.qualifiedOperatingPoint` 四者一致，全部候选饱和时不发布 QOP；
- queue/backlog 不出现未经解释的持续增长，所有 enqueued task 最终有 completion；
- 每个 attempt 的有限 fresh reopen suffix records/bytes 与 owner 累计、decompressed raw 重建三方一致；same-identity duplicate、live trace 与 M08 unbounded/no-snapshot direct replay 的 result/state digest 闭合，且恢复/诊断主张没有混名；
- 任何采样失败、环境缺失或恢复分叉都使 release qualification 失败，而不是降级成一张不完整图；
- `CI_SMOKE` 的短资源样本仍只标记方法 smoke，不冒充 release soak。

本次 qualification 已对三个 attempt 全部闭环：

| rate | actual suffix records / bytes |   fresh recovery | durable / duplicates | result + state digest            |
| ---: | ----------------------------: | ---------------: | -------------------: | -------------------------------- |
|  231 |          415,697 / 97,688,795 | 5,758,787,916 ns |    415,721 / 415,721 | live = recovered = direct replay |
|  165 |          296,011 / 69,568,186 | 4,513,930,750 ns |    296,029 / 296,029 | live = recovered = direct replay |
|   82 |          147,592 / 34,831,712 | 2,061,758,375 ns |    147,600 / 147,600 | live = recovered = direct replay |

[`recovery.json`](/signal-grid-blog/practice/high-availability-cex/m10/evidence/reports/release/recovery.json) 保留了 `27` 条 point record，包含三个 soak attempts；[`RecoveryVerifier.java`](https://github.com/lcha-reln/cex-matching/blob/course/m10-complete/matching-benchmarks/src/main/java/io/github/lchareln/cex/matching/benchmark/RecoveryVerifier.java) 和独立 bundle verifier 还确认 owner 累计、decompressed completion raw 与 fresh reopen suffix records/bytes 三方精确一致。direct replay 仍只是 M08 unbounded/no-snapshot 诊断，没有被冒充成 fresh recovery。

## 每次 1800 秒结束的是一个资格 attempt，不是容量讨论

M10 的资源和 soak 证据能说明：在记录的环境、commit、candidate rate 与有限时间内，真实持久路径经历该 attempt 唯一的 proactive checkpoint 后能否排空和恢复，以及资源趋势是否触发冻结的 saturation 条件。只有首个完整 `QUALIFIED` attempt 才成为最终 QOP；较高饱和候选的证据不会被最终通过者覆盖。它不能证明周期 checkpoint 行为、数月稳定、所有订单 mix、真实断电或 Cluster 下的相同行为。

本次 `QUALIFIED` 使 `matching-0.5.0` 可以成为“可恢复单机撮合 + 有界准入 + 环境绑定容量资格”的命名停止点，但不是“已经高可用”或“拥有通用 TPS”。最后一篇继续把 RED、mutant、raw artifacts、正确性与 tag/manifest 绑成同一产品身份。
