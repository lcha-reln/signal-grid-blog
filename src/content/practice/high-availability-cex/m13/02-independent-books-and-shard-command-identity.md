---
title: "M13·02：订单簿各自独立，命令身份为什么属于整个 shard"
description: "拆开 orderId、commandId、producer slot 与两层应用序号，通过跨 book 冲突、控制命令和旧身份重试，解释独立订单簿与 shard 级幂等之间的关系。"
date: 2026-09-07T15:02:37+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M13
lessonOrder: 20
permalink: independent-books-and-shard-command-identity
tags:
  - 命令身份
  - 幂等
  - 订单簿
  - Java
draft: false
---

> 本地复验身份：annotated [`course/m13-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m13-complete)，clean commit `eb1b65d2ea2159ba607e3271f0bfd209ea4906ea`。本文结论取自该身份的一次 fresh M13 qualification；[manifest 发布入口](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/manifest.json) 随本单元教程发布提供。

在 shard 1 中，先向 BTC-USDT 放入卖单 orderId 7，再向 ETH-USDT 放入买单 orderId 7。它们会因订单 ID 相同而冲突，还是会互相成交？再换一种输入：保留 BTC 请求的 commandId 和 producer slot，只把 instrument 改为 ETH，这次是否仍应接受？

两次预测的差别是本篇的主线：**订单身份属于 book，持久命令身份属于整个 shard。** 把订单簿拆开，并不意味着可以把去重表也按 instrument 随手拆开。否则同一业务请求经过一次目标变更，就能在另一张 book 上再次产生效果。

M13 延续已有撮合算法、执行策略、STP、规则和模式语义；新增的是这些状态的 instrument 作用域，以及明确区分的 shard/book 两层应用顺序。

## 先把三个“ID”放回各自的作用域

orderId 用来在一张 book 中找到订单；commandId 用来指认一次持久命令；producer slot 用来声明某 producer、epoch、shard 内的序号位置。三个值回答的问题不同，不能靠共享一个 Map 省略区别。

| 身份                                         | 本单元作用域                | 合法复用与禁止复用                       |
| -------------------------------------------- | --------------------------- | ---------------------------------------- |
| orderId                                      | 单张 book                   | BTC#7 与 ETH#7 可以同时存在              |
| commandId                                    | 单个 shard                  | 改 instrument 后不能仍冒充原命令         |
| `Slot(producerId, epoch, shardId, sequence)` | 单个 shard 的 producer 历史 | 一个 slot 只能绑定一个 commandId/payload |
| correlationId                                | 一次传输尝试                | 重试时更新，不产生新业务身份             |

`DirectM13ShardRuntime` 为每个 instrument 建立独立 `DeterministicMatchingAdapter`；订单队列、规则和模式都在 adapter 的状态中。它同时在 shard 层保存 `byCommand`、`bySlot` 和 producer cursor。这个所有权结构直接表达了表中的边界。

开篇第一组订单必须独立存在。跨 instrument 的买卖方向与价格相同也不会令它们互相成交，因为两张 book 根本没有共享的价格队列。若 `SHARE_BOOK_STATE` 把两个目标映射到同一 adapter，原本不相关的订单就会冲突或成交，逐本状态比较应当揭示错误。

源码定位：[DirectM13ShardRuntime.java](https://github.com/lcha-reln/cex-matching/blob/course/m13-complete/matching-cluster-runtime/src/main/java/io/github/lchareln/cex/matching/cluster/DirectM13ShardRuntime.java) 管理 book 和 shard 索引，[M13IdentityBinding.java](https://github.com/lcha-reln/cex-matching/blob/course/m13-complete/matching-cluster-runtime/src/main/java/io/github/lchareln/cex/matching/cluster/M13IdentityBinding.java) 保存规范化请求及原结果。

## 一条 shard 历史可以包含两条 book 局部顺序

下面的序列取自 `independentBooksHaveLocalSequencesAndOrderIds`。表中是本次应用得到的序号，不是执行之后的 next 值：

| 按顺序提交的新命令  | shard sequence | BTC book sequence | ETH book sequence |
| ------------------- | -------------- | ----------------- | ----------------- |
| BTC SELL，orderId 7 | 1              | 1                 | —                 |
| ETH BUY，orderId 7  | 2              | —                 | 1                 |
| BTC BUY，orderId 8  | 3              | 2                 | —                 |
| ETH OPEN → HALTED   | 4              | —                 | 2                 |

执行前三条后，下一 shard sequence 是 4，ETH 下一 book sequence 是 2。因此 ETH 模式变更的 `expectedApplicationSequence` 必须填 2。把它填成 4，相当于把另一张 book 的历史也算进了 ETH 的乐观控制条件。

当前测试使用的控制 API 是：

```java
new M08Command.ChangeMarketMode(
    2, MarketMode.OPEN, MarketMode.HALTED, "operator")
```

命令由外层 M13 request 选择 ETH。应用之后，ETH 为 HALTED，BTC 仍为 OPEN。规则 prepare/activate 也遵循同样的 book 局部状态与序号；不能因为它们和订单共用同一条 shard log，就把控制条件提升为 shard 作用域。

新准入的业务命令推进 shard 一次，并让目标 book 推进一次。这里的“业务命令”包括 adapter 产生规范业务拒绝结果的命令；例如合法到达目标 book 的操作可能因为 book 规则而得到拒绝事件。它与 route/identity/producer 的 preflight 拒绝不同，后者既不调用 adapter，也不消耗这两层序号。

## 双向身份绑定堵住两种不同的重复入口

只用 commandId 建索引会漏掉“换一个 commandId，复用旧 producer slot”；只用 slot 建索引则会漏掉“同 commandId，换一个 slot”。M13 因而把二者绑定为同一份 `M13IdentityBinding`。

提交时，`identityRejection` 按当前实现区分：

```text
已见 commandId，slot 改了       → COMMAND_ID_SLOT_CONFLICT
已见 commandId，payload 改了    → COMMAND_ID_PAYLOAD_CONFLICT
新 commandId，slot 已占用       → SLOT_IDENTITY_CONFLICT
commandId、slot、payload 均相同 → 查回原 binding
```

payload hash 覆盖 shard、route version/hash、instrument 与规范命令内容。它不是只对 `Place` 的价格、数量求摘要。开篇第二个预测因此得到冲突：同 commandId、同 slot 改 BTC 为 ETH，已经改变 durable payload。

`OMIT_INSTRUMENT_FROM_IDENTITY` 的反例针对的正是这条约束。它不是要求所有 book 共用订单 ID 空间，而是要求“同一个持久请求”不能偷偷换执行对象。对照实验需要同时证明：独立身份的 BTC#7/ETH#7 合法，复用 commandId 后改 instrument 非法。只验证后者可能掩盖把全部 book 误做成一个大命名空间的另一种错误。

## 精确重试要先找到过去，再判断新请求能否进入现在

假设一条 BTC 请求已被 apply，之后路由从 v1 追加为 v2，客户端仍未确定第一次调用的结果。如果按“先检查当前 route”处理重试，原请求会因 v1 过期而被拒绝；如果客户端为了通过检查修改 route 字段，它又不再是原来的 durable payload。

M13 的顺序是：规范请求和 shard 检查 → 双向身份检查 → 已有原结果返回 → 新请求准入。精确 duplicate 因此可以携带原来的 route identity、原来的 producer epoch，跨越路由追加、producer 升级和进程重启，返回原结果。

返回值不是当前状态查询。`DUPLICATE_REPLAYED` 带回原 `shardSequence`、完整原 `CanonicalResult` 和当时的 `semanticStateDigest`；只有 correlation 对应这一次尝试。假如其他订单早已改变盘口，原 digest 理应与当前 digest 不同。

producer fencing 也只阻止旧 epoch 继续创造新身份。producer 从 epoch 1 升到 2 后，epoch 1 的新命令被 `PRODUCER_EPOCH_FENCED` 拒绝，epoch 1 已经持久绑定的精确 duplicate 仍能取得原结果。这不是绕过 fencing，而是区分“重新执行”与“读取已决定结果”。

客户端遇到 UNKNOWN 时调用 `withCorrelationId(...)` 或 invocation 的 retry 路径，只更新传输身份。更换 commandId、slot、instrument 或 route hash 都可能变成另一条命令。Aeron 提供有序复制，应用仍须定义这些确定性状态转换；它不自动替业务实现这份 durable identity 合同。[Replicated State Machines](https://aeron.io/docs/cluster-quickstart/replicated-state-machines/)

## 用局部序号和跨 book 冲突检验这张状态图

复验完成版时，可以直接运行现有三个机制测试：

```bash
git switch --detach course/m13-complete
./gradlew :matching-cluster-runtime:test \
  --tests '*M13ShardRuntimeTest.independentBooksHaveLocalSequencesAndOrderIds' \
  --tests '*M13ShardRuntimeTest.shardIdentitySpansBooksAndDuplicateSurvivesRouteChangeAndRestart' \
  --tests '*M13ShardRuntimeTest.producerFencingIsShardWideButDoesNotInvalidateDurableDuplicates' \
  --no-daemon --max-workers=1
```

先在纸上填出前面的序号表，再运行第一项。随后阅读另外两项中“保存 snapshot → 冲突请求 → snapshot 完全相等”和“追加路由 → 原请求重试 → 原结果完全相等”的断言。只比较 disposition 或订单数量会遗漏原事件、结果序号和历史 digest 的替换。

一个独立变体是：在 BTC 上多执行一条新命令，然后保持 ETH 的 `expectedApplicationSequence` 不变，再提交 ETH 控制命令。若它因为 BTC 的进展而失败，应检查是否误用了 shard sequence；不要把 expected 值改成新的全局数字来让测试转绿。

本次 [生成报告](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/reports/check/generated.json) 实际完成 seed 6313 的 64×64=4096 个 action：3328 次新应用、256 次原结果重放、512 次 preflight 拒绝；完成 12288 次逐本状态比较，以及 3328 次完整事件比较。逐本控制场景另外通过 39 个断言，shard 身份与 producer fence 场景通过 22 个断言。固定 mutant `USE_SHARD_SEQUENCE_FOR_BOOK_CONTROL` 在控制序号作用域上失败，`OMIT_INSTRUMENT_FROM_IDENTITY` 则把应拒绝的 instrument 变更错误判成 duplicate；二者都由业务分歧判为 `STUDENT_FAILURE`，各自 production control 为 PASS。[mutant 报告](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/reports/check/mutants.json) 将这些分类与原始 trace 绑定。这些是已经执行的有限比较，不能从计数推导出所有历史都正确。

## 原结果一旦成为承诺，恢复就必须保存整个承诺

独立 book 解决了订单、队列、规则与控制序号的隔离；shard 级双向绑定保证同一持久命令不会借 instrument 变更再执行一次。精确重试返回过去已经决定的结果，而新请求继续服从当前路由与 producer fence。

这些结论尚未提供跨 shard 去重、跨交易对原子命令或网络 exactly-once。下一篇处理更直接的恢复义务：既然客户端能够在重启后索取旧结果，snapshot 就不能只保存最终盘口，也必须能验证每一条保留的原始结果。
