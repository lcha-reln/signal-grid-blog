---
title: "M10·05：用同源 Evidence 封存 matching-0.5.0"
description: "把结构化 RED、有界准入裁判、open-loop 资格、资源与有限 soak、恢复重放、mutant 和 clean tag/manifest 绑定为 matching-0.5.0 的可复核停止点。"
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
draft: true
---

> 实施中说明：M10 尚未用本篇宣告完成。`course/m10-complete`、`matching-0.5.0`、peeled commit、dirty 状态、20/20 fixed、16,384/16,384 generated actions、28/28 obligation、12/12 mutant、release qualification、manifest SHA-256 与 artifact hash 均在真实运行并通过后由 evidence 填入；失败项不得先写成通过。

性能单元最容易出现一种“证据倒置”：先决定要发布一个漂亮数字，再挑一次最好运行、删除 overload、补一张环境表，最后给 commit 打 tag。这样的 artifact 再多，也只能证明一组文件曾经生成，不能证明产品合同从起点到发布都没有移动。

M10 的发布链顺序相反：annotated start ref 先冻结工作负载、义务、错误候选和五篇 permalink；production 实现与 judge 在同一输入上从 RED 走到 GREEN；release environment 再生成 open-loop、资源和有限 soak 观察；最后把 complete tag 与产品 tag 绑定到同一个 clean commit，并由 manifest 逐项哈希全部 artifact。

`matching-0.5.0` 的含义因此不是“最快的撮合引擎”，而是：**M09 可恢复单机 runtime 之上，有界准入、pre-WAL overload、环境绑定 capacity envelope 与负载中正确性已经形成一条可独立复核的证据链。**

## 起点 RED 冻结评测空间，而不是预演成功

M10 的结构化起点报告使用 `matching.m10.check.v1 / GOAL_NOT_IMPLEMENTED`。它冻结：

```text
20 admission/methodology fixed scenarios
seed 6010
64 histories × 256 actions = 16,384 generated admission-model actions
4 lanes: BELOW_CAPACITY / QUEUE_FULL / CHECKPOINT_PAUSE / FAIL_CLOSE_RETRY
28 obligations
12 executable mutants
5 tutorial permalinks
```

这些是合同规模，不是完成数字。start ref 上 judge 应以 schema-valid RED 非零退出；如果因为未来 complete tag 已经存在就改变结果，历史起点将失去可复核性。M10 同时修正 start workflow 的时间语义：未来发布不应让过去的 RED 因“发现未来 tag”而变红为系统错误。

冻结输入的价值是防止实现完成后删掉最难 scenario、换 seed、减少 actions 或重命名错误候选。有限 corpus 仍不是穷尽证明，但它让读者能判断 complete 是否回答了起点提出的同一个问题。

实际 start tag 对象、报告 hash 与 workflow 结果在封存后由 evidence 填入；草稿不把计划身份写成已经在线可见。

## GREEN 必须同时包含语义裁判和测量方法裁判

M10 的 28 项 obligation 可以按五条证明链理解：

| 证明链 | 代表性义务 | 主要反对什么 |
| --- | --- | --- |
| 有界准入 | finite capacity、non-blocking、queue bounded、caller bytes owned | 无界积压、blocking producer、caller buffer 竞态 |
| mutation boundary | full reject、pre-WAL、pre-apply/identity、enqueue≠ACK | 拒绝后已有持久副作用、入队冒充 durable outcome |
| owner 生命周期 | single worker FIFO、same-envelope checkpoint retry、failure close、quiesce/drain | 重排、重复命令、悬挂 completion、失败后继续 apply |
| 测量守恒 | offer/completion reconciliation、open-loop、scheduled origin、raw percentile、environment | coordinated omission、漏算 overload、不可重算 summary |
| 发布正确性 | deterministic knee、above-knee rejection、resource dimensions、reopen/replay、system error boundary | 挑最好 rate、资源盲区、负载中语义损坏、异常冒充 pass |

固定场景负责构造具名边界，generated admission model 在四条 lane 上扩展状态组合。两者都要保存 seed、action grammar、counterexample 与 canonical digest；但 generated model 不能冒充真实 JVM scheduling，release qualification 也不能替代确定性语义裁判。

累计 M00～M09 回归要在负载实现前后保持 GREEN，且架构报告证明 `matching-core` 没有 M10 业务改动、production module 不依赖 JMH/benchmark/testkit。这避免为了追数字而偷偷改变撮合、WAL 或 Snapshot 语义。

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

实际 12 个结果只有完成裁判运行后才能写成 `12/12`；frontmatter 下的实施中说明故意保留待填身份。

## Release qualification 必须能从 raw 重建决策

完整 release artifact 至少包含四层：

1. **环境与输入**：source identity、dirty=false、JVM/OS/CPU/RAM/FileStore、queue/WAL/Snapshot、workload schema/hash/seed、profile 和计时器；
2. **方法 raw**：JMH 原始结果、三个 open-loop sweep 的每个 planned offer、queue/resource samples、checkpoint markers 和 quantile inputs；
3. **决策 summary**：各 rate 守恒总账、四段 percentile、四项 saturation、三个 knee、published knee 与 QOP；
4. **有限 soak 与正确性**：30 分钟 QOP 时间序列、quiesce/drain、fresh reopen、same-identity duplicate、accepted trace direct replay 与 semantic digest。

summary 不是权威替代品。复核者应能从 raw 重新得到 planned/offered/enqueued/rejected/completed，从分布样本重算 percentile，从 rate observations 重算 saturation/knee/QOP，并把 soak 的 durable trace 与恢复报告关联。

`CI_SMOKE` 可以生成相同形状的短报告以检查方法，但必须明确写 `METHOD_SMOKE_ONLY`，且不能出现在产品 capacity claim 的来源字段。release manifest 只能引用完整 `RELEASE_QUALIFICATION` 的环境绑定 artifact。

具体 throughput、latency、knee、QOP、资源曲线和 correctness observations 在完成后由 evidence 填入。本篇不会以“预期值”代替 raw。

## 先预测：一个 `PASS=true` 能否独立支撑产品 tag

假设 summary 写着 `PASS=true`，但没有 raw offers、environment fingerprint、artifact hash，也没有把 QOP 连回三次 sweep。能否因为裁判进程以零退出就发布？不能。零退出只说明某段程序选择了成功路径；缺少输入身份和中间观察时，复核者无法区分真实闭合、漏算样本或手工改写 summary。

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

再看“published QOP”这条 claim：它必须从三个 sweep 的有序 rate/saturation 列表，按“第一对连续 saturated 的第一个”算出三个 knee，再取最小值并 floor 70%。直接在 manifest 写一个 QOP 而不保留输入，是不可复核的结论。

这两个例子分别代表确定性业务边界与含噪测量决策。前者期望同输入精确复现，后者不要求跨机器数字相同，却要求算法、原始观察和环境身份完整。

## complete tag、产品 tag 与 manifest 必须形成一个 identity

完成身份要求 annotated `course/m10-complete` 与 annotated `matching-0.5.0` 指向同一个 clean commit。manifest 还要交叉记录：

```text
unit = M10
course start/complete identity
product release identity
source commit
dirty = false
report schema/status
claims + observations + limitations
artifact path + SHA-256
```

tag 名相同不够，必须核对 annotated tag object 与 peeled commit；source archive、judge report、workload、raw sweep、resource/soak、correctness、architecture 和 counterexample artifact 都要由 manifest 枚举并校验 hash。本站保存同源静态副本时，还要验证副本 manifest hash 和每个 artifact hash，没有“博客另写一份更漂亮报告”的空间。

完整 40 位 commit、tag object、manifest SHA-256 与 artifact 清单在完成后由 evidence 填入。任何一个仍缺失时，教程保持 `draft: true`，不能只公开其中几篇。

## 实现与证据阅读路径必须从身份开始

源码阅读先按依赖方向进行：确认 `matching-core` 没有 M10 业务改动；再看 `matching-local-runtime` 的 service/worker 如何包住既有 runtime；随后看非生产 `matching-benchmarks` 怎样生成 scheduled offers、资源样本与 release profile；最后才进入 testkit 的 obligation、candidate 和 evidence writer。反向从 JSON 猜线程与 mutation 语义，很容易把“报告声称如此”误当成“production 路径只能如此”。

每一层都应能指回上一层的权威身份：benchmark 只通过公开 production API 施压，judge 不把 reference shortcut 注入 production，evidence writer 只汇总已有 raw/report 而不重算一份更漂亮的结果。具体 source path 与架构报告在完成后由 evidence 填入。

完成发布后，推荐复核顺序是：

```bash
git switch --detach course/m10-start
./gradlew m10Check --no-daemon

git switch --detach course/m10-complete
./gradlew clean build --no-daemon
./gradlew m10Check --no-daemon
./gradlew m10ReleaseQualification --no-daemon
./gradlew m10Evidence -Pm10.unitTag=course/m10-complete -Pm10.productRelease=matching-0.5.0 --no-daemon
```

起点应得到声明的结构化 RED；完成身份应先通过累计构建与语义裁判，再在合适的本地发布环境运行完整 qualification。读者不应把共享 CI 的 smoke 当成 release rerun，也不应在环境不同后期待相同绝对数字；应期待相同 workload/schema/算法、完整环境指纹和内部守恒。

然后从 manifest 验证 hash，再打开权威 JSON report，检查 status、counts、claims、limitations 和 product identity，最后抽样重算一条 percentile、一轮 knee/QOP 与一条 pre-WAL witness。网页文章只解释这些同源静态文件，不运行远程 Java、JMH、WAL force 或 30 分钟 soak。

实际命令是否通过、报告路径和线上 evidence URL 在发布后由 evidence 填入；此处命令是冻结的复核合同，不是草稿阶段的 PASS 声明。

## 哪些情况必须阻止 matching-0.5.0 发布

以下任一情况都应保持教程为草稿并拒绝产品 tag：

- fixed/generated/obligation/mutant 未达到冻结全集，或出现未解释 `SYSTEM_ERROR`；
- overload 在 WAL、identity 或 apply 后才返回；
- enqueued task 没有 terminal completion，或 queue/order ledger 不守恒；
- raw offer 被过滤，percentile、saturation、knee 或 QOP 无法重算；
- 只有 `CI_SMOKE`，没有完整环境绑定 release qualification；
- 30 分钟 soak 未跨多次 checkpoint，或资源维度/环境指纹缺失；
- fresh reopen、duplicate original result、direct replay 或 semantic digest 分叉；
- `matching-core` 被性能单元改写，或 production module 依赖 benchmark/testkit；
- complete 与产品 tag 没有指向同一 clean commit；
- manifest、report、artifact hash、claim observation 或 limitation 不一致。

这些不是一张发布清单的装饰，而是各机制的 proof obligation 汇合点。失败时应保留 raw/counterexample 并修复来源，不能改阈值、删样本或把异常降级成 limitation 来“完成单元”。

## matching-0.5.0 的保证边界

当且仅当上述证据全部闭合，`matching-0.5.0` 才能保证：M09 的单进程、单 shard、可恢复 runtime 拥有固定上界的异步准入；queue-full 在权威 mutation 前明确拒绝；入队与 durable outcome 分离；指定环境和 workload 的 knee/QOP、percentile、资源与有限 soak 可以从 raw 重建；负载后恢复与幂等语义保持一致。

它仍不保证 Aeron、复制、quorum、leader failover、跨主机 exactly-once、多 shard、多 producer scalability、网络 SLA 或长期生产稳定性。30 分钟有限 soak 和有限 mutant corpus都不能扩大成形式化证明。

这个停止点的价值正在于边界诚实：M11 可以在一个已经知道本地过载语义和单机容量证据的系统上引入单节点 Aeron Cluster adapter，而不把 Cluster 自身成本混入 M10 的结果。M11 未完成之前，`matching-0.5.0` 仍只是经过环境绑定资格的本地持久撮合服务，不是高可用集群。
