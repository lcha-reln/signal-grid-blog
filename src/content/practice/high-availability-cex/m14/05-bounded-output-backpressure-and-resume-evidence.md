---
title: "M14·05：用有界积压与固定标签复验连续输出"
description: "从数量、字节和记录数三条容量边界推导原子背压，区分另一分片的真实进展、传输资源高水位与有限故障证据，并建立可复验发布入口。"
date: 2026-09-07T20:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M14
lessonOrder: 50
permalink: bounded-output-backpressure-and-resume-evidence
tags:
  - 背压
  - 故障验收
  - Java
  - 撮合系统
draft: false
---

> 完成身份：[course/m14-complete](https://github.com/lcha-reln/cex-matching/tree/course/m14-complete)，完整提交 `56c4ec09ddf9fcf57f1cce763ae8b451ba7f394f`。本文结论绑定 clean 完成树重新执行的 M14 资格；[公开 manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m14/evidence/manifest.json) 的 SHA-256 为 `7eb56335954e03a6792b8f9971b922e3bd45bf5dcbd60e47f1e5cedde3fb2081`。

Execution pending 队列还能放 25 个 batch，一笔订单却被拒绝了。这一定是容量判断出错吗？再换一个问题：如果系统先完成成交，准备输出时才发现空间不足，能不能返回“稍后重试”？

**输出容量决定一笔新命令能否整体进入权威状态。** 队列数量、规范字节数和输出记录数约束的是不同资源；其中任意一项不足，都不能留下“业务已变化、身份未保存、事实无法续接”的半次结果。

M14 为这条边界冻结了 Q1 profile，同时把满队列后的 ACK 排空、另一 shard 的实际进展、重启与分片传输放进有限验收。本篇最后给出完整复验入口；这些证据证明特定合同，不能推导任意负载下的吞吐量或生产可用性。

## 容量是被摘要绑定的协议输入

同一个 profile 名称如果在两台机器上对应不同上限，可能让同一份 committed command 得到不同准入结果。因此 Q1 使用规范 JSON bytes 和固定内容摘要，genesis、snapshot、各进程启动参数与资格负载都绑定它。

| 对象或资源 | Q1 上限 | 达到边界后的含义 |
| --- | --- | --- |
| Execution pending | 32 batch / 262144 bytes | 不能再整体保存新输出时拒绝新业务 |
| 单个输出 batch | 256 records / 65536 bytes | 不允许拆成多个业务 batch 绕过 |
| Market 环形历史 | 16 batch / 524288 bytes | 淘汰旧增量，落后者可能需 snapshot |
| 全分片 Market snapshot | 1048576 bytes | 新状态必须能形成合法图像 |
| 单 shard book / 单 book resting orders | 16 / 128 | 新状态不能越过已签约形状 |
| 普通读取 / publisher 队列 | 最多 4 batch / 262144 bytes | 完整对象受预算约束 |
| 应用传输帧 | 4096 bytes，其中 header 512 | 大对象按协议分片后完整重组 |
| 成功 M14 业务／控制历史 | 2,000,000 条 | 新业务与新控制返回 `HISTORY_LIMIT`，精确重试仍可读取 |

这些数字不是容量压测结果。profile 还绑定连接、重组、工作周期与超时限制，防止只限制 outbox，却在外部运输阶段建立无界积压。历史 guard 不会裁剪旧身份，也不会让快照恢复成本固定；outbox 满后还能通过控制排空，以这项独立 guard 尚未耗尽为条件。

## 两种满队列实验才能区分数量与字节

第一种实验使用数量为 0 的 Place。它在核心里产生合法的字段拒绝事实，因此是一个新准入业务命令，需要一个 Execution batch。连发 32 个不同身份而不 ACK，下一条不能再进入。

这里有两个容易误读的地方。业务字段拒绝与 outbox preflight 拒绝不同：前者已经属于一次 apply，有业务序号和输出；后者因为无法整体准入而保持完整状态不变。另一方面，满队列时精确重试已绑定身份仍应返回原结果，不需要再分配一个 batch。

数量测试还不能证明字节限制有效。冻结的第二种实验配置 16 张八字符名称的 book，每张预装 128 个不同价格的 SELL maker，maker/taker 的 accountRef 都取 64 bytes，并提前 ACK 预装输出。一次吃掉 128 个 maker 的请求，规范 Execution 输出推导为 **39783 bytes**。

六次这种输出累计 238698 bytes，仍在 262144 内；第七次会到 278481 bytes，必须拒绝，即使 pending 数量距离 32 还很远。不能为了让它通过而缩短账户、修改价格层数或提高 profile；应检查真实编码尺寸与冻结推导是否一致。

因此开篇第一个问题的答案是：剩余 batch 槽位并不代表剩余字节够用。测试必须分别触及数量和字节边界，否则一条失效的限额分支可能长期隐藏。

## 单批记录越界与数值溢出也要在安装前拒绝

128 笔公共 Trade 加上 128 个卖价位清零，构成 256 条 Market records，刚好抵达单批边界。如果同一笔请求还留下一个新的买价位，Market 多出一条 LevelSet，达到 257 条。此时应返回 `OUTPUT_PROFILE_LIMIT`，保持订单簿、所有身份表、账户归属、两条 outbox 与下一序号都不变。

不能把前 256 条发出去再补一条，也不能只放弃 Market、保留已经成交的 Execution。M14 的新命令承诺是一个整体：候选业务变化及其全部必需输出都可表示，才安装到 live state。

聚合盘口还有数值边界。某价位当前剩余量是 `Long.MAX_VALUE`，再新增 1 lot 时，逐订单数量仍可合法，但价格层聚合不能表示为正的 i64。独立参考投影使用 `BigInteger` 发现溢出，生产路径将其作为预期的 profile refusal。它不能先溢出成负数，也不能把这个业务输入导致的可预期拒绝误记为基础设施异常。

本地的 `aggregateOverflowIsPredictableProfileRefusalBeforeLiveApply` 以及 L06 固定程序分别验证这些关系。真正关键的断言是拒绝前后的完整 snapshot 字节一致；只断言错误码或余额未变化，都没有覆盖整次准入的边界。

## 满分片必须能排空，另一分片必须真的推进

Execution 达到上限时仍要允许复制 grant 和 ACK。控制使用独立 UUID/controlRevision，不占 pending Execution quota。消费者持久接收并提交累计 ACK 后释放前缀，原先被拒绝的同一个尚未绑定请求才可首次成功 apply。

这个重试不能重新换一个 commandId 来“证明恢复”。换身份只能说明后来有一条新命令成功，无法证明拒绝没有预先消耗旧身份、producer cursor 或 shard sequence。

分片隔离的验证也不能停留在“shard 2 没报错”。C05 在 shard 1 真正饱和的同一观察窗口，要求 shard 2 实际 apply、生成输出、被 sink 持久接收并完成 ACK；同时检查 shard 1 的拒绝没有部分状态变化。两个 group 的业务顺序独立，故障证据必须包含另一组的正向进展。

本地可以先复验容量与排空用例：

```bash
./gradlew :matching-cluster-runtime:test \
  --tests '*M14ShardRuntimeTest.exactCapacityRefusalPreservesIdentityThenCumulativeAckUnblocksSameRequest' \
  --tests '*M14ShardRuntimeTest.aggregateOverflowIsPredictableProfileRefusalBeforeLiveApply' \
  --no-daemon --max-workers=1
```

它们不启动真实 Cluster，回答的是确定性状态转换问题。跨组、跨 JVM 的故障结论由完整 qualification 的进程证据承担。

## 每条故障结论需要对应的实际观察窗口

M14 的资格分为确定性本地语义、冻结的生成历史和真实进程故障三部分。每条生成 history 都有显式 prelude，宏展开后的业务提交、控制、读取、拒绝和恢复尝试另外计数，逻辑动作数量不等于底层操作数量。

参考侧从独立线性模型构造 typed 业务事实、归属和公共盘口，再用独立编码器生成预期字节。反例在实际候选状态或输出路径中改变行为，必须有通过的 production control 和明确业务差异。抛异常、损坏报告及缺少原始 artifact 都是 `SYSTEM_ERROR`，不能计为成功杀死反例。

真实进程验证使用两组三成员、外部 publisher 和一个 durable sink，初始至少 9 个子 JVM，接管时至少 10 个。七个窗口各有不同证明对象：

| 窗口 | 注入或恢复位置 | 需要保存的证据 |
| --- | --- | --- |
| C01 | apply 后、发布前杀 Leader | 新 Leader 仍可取得原 batch |
| C02 | sink force 后、ACK 未完成 | sink 重启及同 bytes 重复验收 |
| C03 | publisher 收 ACK、调用 Cluster ACK 提交前 | 没有后续业务时仍能补交确认并回收 outbox |
| C04 | ADMIN_OK 后活旧 publisher 迟到 | 旧 DATA 与新的 stale ACK 均被拒绝 |
| C05 | shard 1 Execution 真正满 | 原子拒绝、shard 2 进展、排空后同身份首次 apply |
| C06 | 六成员 snapshot 加后缀、全部重启 | 六次实际 snapshot load 与完整状态一致 |
| C07 | 真实大对象与 Market 增量缺口 | 多帧重组、部分消息不推进、snapshot 后缀一致 |

故障控制器位于 service 之外。等待基于可观察里程碑和有界轮询，不用固定 sleep 推断“应该已经提交”。退出时还必须检查本次拥有的进程都已清理；超时或残留进程不会得到 PASS。

以下结果来自页首 clean 完成提交重新执行并导出的正式资格。每个数字都取自 manifest 绑定的对应报告；逻辑动作、实际尝试、断言和进程窗口分别解释。

| 证据层 | 已执行并通过的范围 | 具体观察 |
| --- | --- | --- |
| 固定语义 | 12 个场景 | 21276 次 primitive，341070 次断言 |
| 冻结生成历史 | seed 6414，48×80＝3840 个逻辑动作，另有 48 条 prelude | 57549 次 primitive，1041767 次断言，复核全部 15360 次随机抽取 |
| 生成成交归属 | 78 条实际 Trade | 72 次 maker/taker 账户不同的归属断言 |
| 语义反例 | 8/8 被杀死，各自正常实现对照通过 | 另有 3 个 `SYSTEM_ERROR` 控制，均不计入 kill |
| 真实进程 | C01—C07 全部通过 | 两组三成员、独立 publisher/sink 的实际故障窗口 |

业务提交、控制、读取和恢复等可执行步骤，在真实调用之前记一次 ATTEMPT，返回或异常作为同一序号的 outcome 保存。宏内部为准备、排空和恢复增加的工作也计入实际次数；不能只报告成功返回的命令。断言数量描述这份有限程序执行了什么，不是可靠性概率或故障覆盖率。

## 复验身份应当连接代码、原始 bytes 与公开结论

复验应在页首 `course/m14-complete` 对应的 40 位提交执行，并核对同一公开 manifest。完整入口为：

```bash
./gradlew clean build --no-daemon --max-workers=1
./gradlew m14Check --no-daemon --max-workers=1
```

[M14CheckRunner.java](https://github.com/lcha-reln/cex-matching/blob/course/m14-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M14CheckRunner.java) 串起架构约束、本地语义、继承回归与真实进程资格。运行后先读 `build/reports/m14/check.json`，再沿 `fixed.json`、`generated.json`、`mutants.json` 和 `m14-cluster-faults.json` 回到对应场景；不要用其中一份子报告代替总门禁。发布证据时，`m14Evidence` 还会重新执行 qualification，要求 clean source 和 annotated completion tag 指向同一提交，并绑定工作负载、profile、corpus、各报告及原始文件的 SHA-256。

发布器采用判定阶段最初保存的 bytes/hash，不在复制时把已经变化的文件重新计算后当成新的依据。同大小、同修改时间的替换仍应被发现；staging 和安装后的 manifest/payload 也再次核验。公开页面随后要逐一验证 manifest 列出的文件实际存在且摘要一致，Git 忽略的日志不能只留在本地目录里。

本地原始记录采用自包含的 gzip JSONL。每份文件内部先保存带 SHA-256 的内容块，再用块列表定义完整二进制对象；重复快照或输出只引用已经定义的对象。校验器重新拼接块、验证完整对象的原始长度与 SHA，因此数量和字节拒绝前后的完整 snapshot、实际请求和输出都能还原，压缩没有把它们删成一串不可复验的摘要。

这条路径位于同一 testkit 目录的 `M14LocalTrace.java` 与 `M14RawTraceValidator.java`。压缩文件的原始 SHA 和字节数在写入过程中捕获，成功关闭后固定为报告中的 `rawSha256`、`rawBytes`；读取时再与实际文件比较。共享 `M14GzipJsonLines.java` 限制压缩量、展开量和单行长度，并拒绝坏 CRC、非法 UTF-8、第二个 gzip member、尾部垃圾及不完整末行。记录只允许一个最终分类，之后必须结束。

真实进程 archive 也独立封装当场保存的原始 bytes、用途与断言，使用同一个严格读取器；它不借用本地参考模型的通过结果来替代进程观察。可以通过 `M14SemanticSuiteTest` 的原始压缩绑定、内容字典还原及 attempt 回归测试，和 `M14GzipJsonLinesTest` 的损坏输入测试，单独检查这部分证据基础设施。完整 `m14Check` 仍负责确认这些文件确实属于本次判定。

M14 不发布产品版本。即使本单元全部通过，也只说明从显式 genesis 开始，在 Q1 和这些有限窗口内具备输出保存、续接、fencing 与背压资格。全历史身份与原始结果仍不裁剪，完整快照恢复需要重放前缀，时间和内存会随历史增长；单机多个 JVM 也不能代替跨主机失效隔离。

因此开篇第二个问题不能用“稍后重试”解决：如果成交已经进入 live state，输出却无法保存，协议本身已经失去完整承诺。M14 通过候选计算、容量预检、原子安装和可排空控制守住这条边界；运营升级、备份恢复与 `matching-1.0.0` 的发布资格，还要在后续 M15 单独建立。
