---
title: "M15·04：负载超过承受范围时，怎样知道系统没有假装成功"
description: "为固定 Cluster 到达建立逻辑账与实际 attempt 账，把队列满、输出背压、UNKNOWN 和系统错误分别记录，再用环境与原始观测解释容量。"
date: 2026-09-08T08:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M15
lessonOrder: 40
permalink: cluster-capacity-overload-and-diagnostics
tags:
  - 容量测试
  - 背压
  - 可观测性
  - 撮合系统
draft: false
---

> 完成身份：[course/m15.1-complete](https://github.com/lcha-reln/cex-matching/tree/course/m15.1-complete) 与 [matching-1.0.1](https://github.com/lcha-reln/cex-matching/tree/matching-1.0.1) 同指干净提交 `73cbc6524bb14adeb5639f97cb4dc1358f893961`。本文结论来自该身份重新执行的累计资格；[公开 manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m15/evidence/manifest.json) 的 SHA-256 为 `42e1c2d65bd8e11eb8f47a89c4ca01ad92e50b3bbb6821cd5c1b3e1ab40f8aab`。

一个客户端发送订单、等待响应，然后发送下一笔。系统越慢，客户端发得越少；最后报告“没有拒绝，平均延迟稳定”。这份记录可能准确描述了客户端的等待过程，却没有检验系统面对预定到达压力时会怎样。

**M15 让到达计划独立于响应推进，并把每个逻辑请求、每次实际尝试与最终可确认结果分别记账。** 容量结论必须同时解释真实成交、输出、过载和故障，还要绑定所用制品与运行环境。这里仍是两组三成员、两个 publisher 和一个 sink 的单主机资格，没有通用 TPS 或服务等级承诺。

## 到达计划不能被慢响应悄悄改写

M15-O1 使用一个独立 schedule producer，按冻结时间产生逻辑到达；每 shard 有一个同步 single-owner client worker。worker 可以同步等待响应，但 schedule producer 不能跟着等待。每个 shard 的输入 queue 只有 64 个槽，worker 至多再持有一个输入，不能另藏一个无界待发或重试队列。

输入按 ordinal 交替进入两个 shard。每笔使用独立、确定性的 commandId 与 producer 身份，IOC BUY 的 taker 账户与预置 maker 不同。容量 fixture 的 maker 挂单是 price 100、1,000,000 lots；它与升级/备份程序的 1,000 lots fixture 分开。一次“新准入”必须是实际跨账户成交，不能用价格不匹配的空跑抬高成功数。

冻结计划的全局速率如下。这里的 baseline 6000 已包含 warmup 250，不能再额外加一次 warmup：

| 阶段       | 到达计划               | 逻辑到达数 |
| ---------- | ---------------------- | ---------- |
| warmup     | 25/s，10s              | 250        |
| measured 1 | 25/s，10s              | 250        |
| measured 2 | 100/s，10s             | 1000       |
| measured 3 | 250/s，10s             | 2500       |
| burst      | 同一计划时刻的 2000 项 | 2000       |
| fault      | 50/s，5s               | 250        |

合计 6250。匀速阶段第 i 项的偏移为 `floor(i × 1e9 / rate)`。scheduler 迟到时保留原 planned time 并记录 lateness，不能把当前时刻改成新的计划时刻。burst 则先关闭 worker gate，生成同计划时刻的输入，再释放 worker；要求实际观察 queue 64 满与至少一次 queue-full。

## 逻辑请求账和实际 attempt 账回答不同问题

某个逻辑请求可能在应用队列入口被拒绝，可能提交后得到明确响应，也可能发生 UNKNOWN 后再以同一身份查询结果。这些路径的网络尝试次数不同。把一次 retry 当成一笔新到达，会改变负载分母；只记最后成功，又会抹掉中间无法确认的事实。

逻辑账为每个计划 ordinal 保留输入身份、planned time、初始 outcome 和最终 resolution。attempt 账记录真正执行过的 dispatch、offer、返回或异常以及原始响应。prelude、输出控制、独立背压实验与 retry 都单独计入实际操作，不能冒充6250中的新输入。

| 观察到的边界           | 应保留的含义                       | 后续动作                           |
| ---------------------- | ---------------------------------- | ---------------------------------- |
| 到达尚未进入有界 queue | 该输入没有成为 worker 的已提交请求 | 保留 queue-full 与原 ordinal       |
| 明确输出准入拒绝       | 本次业务没有应用，状态应不变       | 解除容量条件后按原身份重试         |
| 提交后没有确定结果     | `UNKNOWN` 仍可能已经成交           | 每项最多 3 次同身份 reconciliation |
| 组件或 I/O 故障        | `SYSTEM_ERROR`                     | 失败并保留原诊断，不能记为正常过载 |

每个阶段有最多 120 秒的 drain/reconcile 界限。届时仍有 unresolved UNKNOWN，就不能交付该次容量资格。初始 UNKNOWN 也不能被后来成功覆盖：两项事实分别说明当时是否能确认、后来是否找回了原结果。

## 有界输入队列之外，还要验证输出满时的原子拒绝

输入 queue 满说明控制端不能再排队，M14 的 Execution 输出满则发生在撮合准入前。两处都称“背压”，责任却不同。C03 单独暂停 shard 1 的 publisher，用实际业务填满 32 个 pending Execution batch，然后提交一条固定身份的新输入。

预期结果为 `OUTPUT_BACKPRESSURED`，完整业务状态、账户归属、原响应历史和双流输出都保持不变。此时 shard 2 还要完成至少四笔真实成交与 durable output，证明一个 shard 的输出阻塞没有被包装成全局停止。

恢复 publisher 并进行有界 drain 后，原来被拒绝的同一请求应第一次真正应用；再次精确重试才返回原结果。若实现先改订单簿再发现输出没空间，或拒绝时占用了永久请求身份，这个顺序会直接暴露错误。

持续 publisher pump 也需要有界。sink journal 的写入或 force 失败，应停止相关处理并向控制端报告 component error；不能继续发 ACK，把没有确认持久保存的结果算成 durable。C03 的拒绝次数不计作系统错误，journal I/O 错误也不能归入 C03 的正常拒绝。

leader 切换时，原发布器还可能在复制 ACK 后返回 `replicated ACK UNKNOWN: AUTHORITY_CHANGED`。资格控制端保留这份原始结果，核对实际请求、durable receipt 与 metadata probe，再以完全相同的控制 ID 和请求字节最多确认三次。后续相关响应可以确认游标，首次 UNKNOWN 仍留在记录中。这个恢复动作属于资格控制端；发布器角色本身并未因此获得自动重试能力。

## 故障窗口和负载后的正常重启分别验收

fault 阶段继续按独立时间计划产生 250 个输入。在取得 20 个相关的新业务响应后，控制端杀死当时实际观察到的 Leader，记录 kill、退出、选举恢复和第一条确认响应的本地单调时间。不能根据固定 member 编号假定它一定是 Leader。

这个窗口可能观察到 UNKNOWN，也可能为零。零就如实记零，不把继承的 M14 UNKNOWN witness 改名为本次观测。C06 对 UNKNOWN 和 `OUTPUT_PROFILE_LIMIT` 另有两个冻结 synthetic accounting control：先让基线被 validator 接受，再真正改变逻辑分类、保留 attempt 事实，要求得到 `STUDENT_FAILURE`。它们不计入6250、不计真实 attempt 或新 UNKNOWN 覆盖；本次真实账若有相应结果，还必须额外检查真实原账的指定变异。

被杀的旧 launch 永久保留 `EXPECTED_FAULT`，不能后来写成正常停止。故障阶段收敛后，用相同 N、相同 root/ports/member、`fresh-start=false` 和新 launchId 重启该成员，等实际六成员完整状态一致，再进入 C05。

C04 后的独立 expired-mark 检查同样遵循 [mark 终止判据勘误 1](https://github.com/lcha-reln/cex-matching/blob/course/m15-errata-1/docs/operations/m15-mark-termination-errata-1.md)：若两次 stopped header 都为 `-1`，过期时间必须从已绑定的正值 lastLive 计算；仍需真实超过 10,000ms、间隔至少 100ms 的完整双读以及原 PID/组件身份。这个判据只说明原 mark 的状态，不会替被杀进程补出正常 EOF 或 `CLOSE_COMPLETED`。V04 仍须用 C04 实际 kill/exit/lifecycle 原件，验证它不能成为正常切换证明。

C05 才是负载后的正常恢复实验：取得实际 snapshot，九角色正常 EOF 停止，再重启比较完整 history/cut，并对旧请求与负载阶段新增请求分别作精确重试。Leader 被杀后的替代成员加入，不能代替这一次全部正常停止后的恢复证明。

## 延迟和资源数字必须说明测量位置

主延迟从 planned arrival 到 correlated response，由控制端同一单调时钟计算。因此 schedule lateness、queue 等待和真实请求时间都在定义内。dispatch、offer、sink durable 与 replicated ACK 的控制端观察另外记录，各自报告样本数和含义。来自不同 JVM 的 `nanoTime` 没有共同原点，不能直接相减。

每个实际 runtime child 在 callback 外按 1 秒采样 heap used/committed/max、GC count/time、process CPU 和 direct buffer。每个 nominal stage、每个角色至少要有三条实际采样；FD 可明确标注 unavailable。报告还保存完整状态诊断、runtime 目录逻辑大小、sink journal、retained history 和 snapshot 增长。

目录体积是在持续发布暂停、在途动作结束后采样的持久文件逻辑长度。采样在遍历前排除临时传输目录，包括 publisher 的 `aeron-<pid>`，避免把 MediaDriver 正在回收的 logbuffer 算进持久历史。Archive、Cluster、sink journal 和原生历史告警仍要测量；这些目录意外丢失时必须失败。这项测量没有统计稀疏文件实际占用的磁盘块。故障重入时 Aeron 保存的原生历史告警也保留原 bytes 和引用。历史上的 `leader heartbeat timeout` 要与当前角色的 component error 分别核对，不能因为告警文件存在就替整次恢复作出结论。

M15 不通过关闭 M14 的完整状态诊断来获得一组更好看的数字，也不把有界 queue 推导成全系统常数内存。完整身份历史仍保留；2,000,000 条操作的有限历史 guard 还包含 ACK 等控制记录。接近 guard 时，新业务与必要控制都可能受到限制，能否继续 drain 取决于仍有合法控制空间；原有精确 retry 的可读性要与新增操作能力分开解释。

## 从原始账重算，才能决定这次运行是否合格

冻结输入位于 [M15 资源目录](https://github.com/lcha-reln/cex-matching/tree/course/m15-start/matching-testkit/src/test/resources/m15)，其中 `profile-o1.json`、`arrivals-v1.json`、`workload-v1.json` 与 `validator-controls-v1.json` 分别约束环境、计划、场景和计账控制。实际角色由完成源码中的 [M15BundleProcessHarness](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15BundleProcessHarness.java) 与 [M15RoleProcess](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15RoleProcess.java) 驱动，[M15RawTrace](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15RawTrace.java) 保存原始操作和 bytes，[M15RawReader](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15RawReader.java) 负责严格复验归档；容量程序入口为 [M15CapacitySuite](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15CapacitySuite.java)，账本由 [M15CapacityRawAudit](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15CapacityRawAudit.java) 根据原始记录独立重算。

实际报告必须重算全部 ordinal、尝试、初始结果与终态，验证每个 measured nominal stage、每 shard 至少十笔新跨账户成交和 durable output，并保存 queue、C03、C04、C05 的真实观察。raw gzip 分块可引用重复内容，但所有引用都必须还原为当时收到的原 bytes；validator 自身异常属于 SYSTEM_ERROR，不能算成功识别了业务错误。

本次 C 系列在下述环境绑定运行中通过；下表保留实际到达、尝试和结果的不同口径。

| 本次原始账口径           | 实测数量 |
| ------------------------ | -------- |
| 逻辑到达                 | 6250     |
| 实际尝试                 | 2513     |
| 逻辑输入产生的实际 Trade | 802      |
| 实际尝试中的 UNKNOWN     | 3        |
| queue-full 拒绝          | 3742     |
| 输出背压拒绝             | 1706     |
| profile 拒绝             | 0        |
| 未提交到传输             | 0        |
| 重复响应                 | 3        |
| 名义阶段资源样本         | 268      |

数量取自[容量汇总](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m15/evidence/reports/check/capacity.json)和[原始账本](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m15/evidence/reports/check/capacity-ledger.json)；[独立重算报告](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m15/evidence/reports/check/capacity-raw-accounting.json)逐项核对计划、实际尝试、响应和资源来源。[输出观察时间](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m15/evidence/reports/check/capacity-output-timings.json)保留控制端观测定义。UNKNOWN 保留首次分类，后续同身份确认不改写该事实。
读者能从这套证据判断指定环境里发生了多少到达、拒绝、成交与恢复；超出这套环境和有限工作负载的容量，需要重新测量。
