---
title: "M08·01：用 M08C1 canonical envelope 固定本地日志入口"
description: "区分本地 journal ingress 与外部协议，冻结 command identity、canonical payload hash，以及结构错误不入 WAL、业务拒绝必须入 WAL 的边界。"
date: 2026-08-31T16:36:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M08
lessonOrder: 10
permalink: canonical-command-envelope-and-identity
tags:
  - 撮合引擎
  - WAL
  - Canonical Encoding
draft: false
---

> 本篇按 annotated [`course/m08-start`](https://github.com/lcha-reln/cex-matching/tree/course/m08-start) 到 annotated [`course/m08-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m08-complete) 的真实演进讲解；代码结论由本站保存的[完成 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m08/evidence/manifest.json)绑定，不是浏览器重新实现的格式。
>
> 完成身份：`course/m08-complete` peeled commit `5c8d8f6a5356f6ebbdf87d83745d8e8bd0861199`；本站 manifest SHA-256 `19a5c93e618ef5d9430719b135ca95aa7db6513c7389e0cfb50eb80c430e2923`。

M07 结束时，相同初始状态与相同有序命令可以得到相同事件和订单簿，但进程退出后一切都消失。为本地恢复加入 WAL，第一反应往往是“把 REST 请求 JSON 写进文件”。这会把外部字段别名、默认值和协议版本带进恢复边界，同一个业务命令可能拥有多组字节表示。

M08 的第一条结论是：**WAL 只接收一种内部 canonical command envelope；它是单 shard 本地 journal ingress 与恢复格式，不是 REST/OpenAPI/Aeron wire protocol。结构上不能形成唯一 canonical identity 的输入不入 WAL，结构合法但业务会拒绝的命令必须先持久化再交给 core。**

## 新模块包住 core，不把文件系统塞进 core

M08 新增 `matching-local-runtime`，依赖方向固定为：

```text
matching-local-runtime ──depends on──> matching-core
matching-core          ──depends on──> JDK value/domain logic only
```

runtime 拥有：

- M08C1 decode/canonicalize/hash；
- identity、slot、epoch 与 producer sequence preflight；
- M08W1 segment、record、force、rollover 与 directory lock；
- 私有 matching engine 的 apply 与恢复；
- canonical result cache 和 durable idempotency index。

`matching-core` 继续不知道文件、目录、CRC、网络、数据库、线程池、时钟、随机数或 Aeron。runtime 打开后，也不允许调用方取得私有 engine 后绕过 WAL 直接 `place/cancel/changeMode`；否则恢复只能重建一部分真实状态。

这个边界仍是 caller-serialized、单进程、单 shard。新增模块不等于集群 adapter，更不等于柜台 sync。

## 所有消耗 ApplicationSequence 的命令都必须可 journal

M08C1 的 payload command union 至少覆盖：

```text
Place, including M07 participant group + STP policy
Cancel
Prepare RuleSet
Activate RuleSet
Change MarketMode
MassCancel
```

判断标准不是“会不会成交”，而是“这条确定性命令会不会占一个 `ApplicationSequence` 并改变可恢复结果历史”。业务拒绝同样占应用边界，因此也必须记录。

只写 Place/Cancel 的日志会在恢复后丢掉：

- active/prepared RuleSet 与 activation fence；
- `OPEN/CANCEL_ONLY/HALTED`、mode revision 与 transition fence；
- Mass Cancel 后的 terminal identity；
- M07 group/STP 造成的 maker/taker 终态；
- 业务拒绝占用过的 application sequence。

“订单簿看起来差不多”不足以恢复撮合状态机；控制状态、拒绝历史与 durable identity 都是权威状态的一部分。

## M08C1 envelope 冻结哪几件事

PLAN v0.10 冻结的逻辑字段是：

```text
producerId
producerEpoch
shardId
producerSequence
commandId
payloadHash = sha256(M08C1 canonical command payload bytes)
commandPayload
```

每个字段回答一个独立问题：

| 字段 | 作用 |
| --- | --- |
| `producerId` | 哪个本地命令生产者的有序槽位域 |
| `producerEpoch` | 同一 producer 的哪一代所有权 |
| `shardId` | 命令明确属于哪个本地 shard |
| `producerSequence` | 该 epoch 内连续槽位，正数且从 1 开始 |
| `commandId` | canonical UUID 命令身份 |
| `payloadHash` | 绑定 canonical payload bytes，检测同 identity 换内容 |
| `commandPayload` | 恢复时可重新提交给 core 的完整原始业务命令 |

`commandId` 不是 Java object identity、HTTP request object 或 Aeron session id。UUID 的 canonical identity 必须有唯一表示；大小写、花括号、别名字符串不能在 journal 内产生多个等价编码。

当前 codec 已把这些选择落地：`M08C1` 使用 big-endian、magic `0x4D303843`（`M08C`）和 version `1`，envelope 上限 1 MiB，command payload 上限 256 KiB，六类 command tag 为 `1..6`。BigInteger 以 UTF-8 canonical decimal 保存，decode 后必须满足 `value.toString().equals(raw)`，所以 `+1`、`01` 等别名不能进入 WAL。

## canonical 的判据是 decode 后逐字节回编码

入口不能只问“能不能 parse”，还必须问“这是不是唯一规范字节”：

```text
decode(envelopeBytes)
→ validate structural bounds
→ encode(decodedEnvelope)
→ require reencodedBytes == originalBytes byte-for-byte
→ recompute SHA-256 over canonical command payload bytes
→ require recomputedHash == claimed payloadHash
```

这样可以拒绝：

- 同一整数的非最短编码；
- 非规范 UUID/framing；
- 额外尾随字节或字段重排；
- 超限 envelope/command payload；
- wrong shard；
- claimed hash 与 canonical payload 不一致。

SHA-256 在这里证明 **command identity 与 payload bytes 的稳定绑定**。它不替代 M08W1 frame 的 CRC32C，也不证明业务命令合法。

## 结构错误与业务拒绝的持久边界不同

最重要的分类表是：

| 输入 | 是否 append/force | 是否 apply core | 是否消耗 ApplicationSequence |
| --- | --- | --- | --- |
| 无法 decode / 非 canonical framing | 否 | 否 | 否 |
| envelope/record 超限 | 否 | 否 | 否 |
| wrong shard | 否 | 否 | 否 |
| payload hash mismatch | 否 | 否 | 否 |
| identity/slot/epoch preflight conflict | 否 | 否 | 否 |
| canonical Place 但 price=0 | 是 | 是，得到 M00 rejection | 是 |
| canonical duplicate orderId | 是 | 是，得到业务 rejection | 是 |
| canonical stale RuleSet/mode fence | 是 | 是，得到业务 rejection | 是 |
| canonical HALTED Place | 是 | 是，得到 `MARKET_NOT_OPEN` | 是 |

结构错误不具备可重放的内部命令身份，不能污染 journal。业务错误则是 core 在确定应用边界作出的权威结果；若不记 WAL，恢复后的 `ApplicationSequence` 会向前缩短，同一个后续 fence 在 live 与 replay 中得到不同答案。

因此“Reject”不能一概发生在 append 之前。只有 runtime structural/identity preflight rejection 不入 WAL；core business rejection 必须先 durable，再 apply。

## canonical payload 必须保留 raw 业务输入

runtime 不能为了方便先把 Place 归一化成“肯定有效”的 domain object，再编码进 WAL。否则 price=0、非法 ExecutionPolicy/STP pair 等 core rejection 根本无法重放。

M08C1 command payload 需要保留足以重现 M00～M07 决策顺序的 raw 字段，包括：

```text
instrument/orderId/side/price/quantity
ExecutionPolicy raw token
participantGroupId + STP raw token
expected RuleSet identity when governed
control command expected application/mode/rule fields
operator attribution
```

“结构可编码”与“业务可接受”是两套验证。前者保证 journal 能安全解析并拥有唯一 bytes；后者由 matching-core 产生稳定业务事件。

## M08C1 不是外部公开协议

REST/OpenAPI 可能使用 JSON、字符串 decimal、可选字段和版本协商；未来 Aeron ingress 可能有 session/correlation/cluster metadata。M08C1 不冻结这些外部选择。

合理边界是：

```text
external protocol
→ authentication/rate limit/request parsing
→ build exact internal M08C1 command identity + raw payload
→ matching-local-runtime journal ingress
```

M08 只从最后一箭头开始。它不声称网络 exactly-once，不规定 REST 如何分配 producer epoch，也不把内部 WAL bytes 暴露为公网兼容承诺。未来 adapter 可以转换到 M08C1 语义，但不能把今天的 HTTP framing 当作恢复格式。

## canonical identity 的三个反例

| 错误设计 | live 看似可用 | recovery 为什么失真 |
| --- | --- | --- |
| 直接写 REST JSON | parser 能读多个字段顺序/数字格式 | 相同命令拥有多种 bytes/hash |
| business validation 后才 journal | 只保存“成功命令” | 拒绝占过的 application sequence 消失 |
| 只 journal normalized Place | 文件更短 | raw rejection 与验证优先级不可重放 |

一个 journal contract 的首要目标不是方便 `toString()`，而是让 bytes、identity、命令语义与应用边界存在唯一关系。

## 已落地的本地入口

M07 complete/evidence/review 封存后，annotated `course/m08-start` 已在 `a26b5776172d66ecc4865a6fbd6cfa73cb22aaf0` 保存结构化 RED；annotated `course/m08-complete` 则封存 production runtime、完成裁判与公开 evidence。源码通过 `M08EnvelopeCodec.encode/decodeCanonical` 形成唯一字节，通过 `LocalMatchingRuntime.open/submit` 进入本地 WAL。读者可以运行：

```bash
./gradlew clean build --no-daemon
./gradlew :matching-local-runtime:test --no-daemon
./gradlew m08Check --no-daemon
```

start tag 上，累计 M00～M07 保持 GREEN，`m08Check` 在验证 M08C1/M08W1 声明与冻结 fixtures 后以结构化 `GOAL_NOT_IMPLEMENTED` 非零退出；complete tag 上，同一入口已经重建 20 个 fixed、96×48 generated、24/24 coverage、故障窗口、executable mutants 与继承回归。不能只根据类名存在就声称完成。

本单元不新增浏览器 WAL 执行器；教程只读取本站同源发布的静态 envelope/evidence，帮助读者判断 structural 与 business boundary。它不上传或编译 Java，也不把浏览器编码器当作权威 WAL codec。

## 本篇停止点

现在 M08 拥有一个明确入口边界：`matching-local-runtime` 独占 core apply，M08C1 为内部 canonical journal 格式，完整覆盖 M07 业务命令；structural invalid 不入 WAL，业务拒绝必须持久化后重建。

我们还没有定义何时可以对调用方 ACK。下一篇沿 append、force、apply 三个边界分析 crash window，并说明为什么 `FileChannel.force(true)` 之前绝不能返回成功。
