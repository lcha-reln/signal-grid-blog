---
title: "M05·04：旧订单不重判，跨版本成交必须可归因"
description: "把价格带定义为 prospective entry rule，保留旧 maker 的价格时间优先级，并在事件、batch 与快照中区分 admission 和 execution rule。"
date: 2026-08-31T11:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M05
lessonOrder: 40
permalink: grandfathered-orders-and-rule-attribution
tags:
  - 撮合引擎
  - Grandfathering
  - 事件归因
draft: false
---

> M05 的价格带是 order-entry rule：只判断订单提交当时是否允许入场。Activate 不扫描、不改价、不重排也不取消已有订单。市场暂停和操作员 Mass Cancel 会在 M06 单独建模，不能藏在本篇的“激活副作用”中。完成实现冻结在 annotated [`course/m05-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m05-complete)（`e593c13292c0f97665f90239a4c8d4a1ca40f579`），跨版本结果与边界由[公开 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m05/evidence/manifest.json)绑定。

如果新 band 比旧 band 更窄，订单簿上很可能已经有一些新规则不再允许提交的报价。此时最容易写出的代码是 Activate 后遍历订单簿，把越界订单删掉。它看似“让当前簿符合配置”，却同时破坏了 M01 price-time priority、M02 可寻址生命周期和 M04 已冻结的事件历史。

M05 选择 grandfather 语义：**已接受订单继续按照它入场时的规则与原 acceptance sequence 存活；新 Place 按当前 active rule 准入；跨版本成交按 resting maker price 执行，并同时披露 maker admission、taker admission 与 execution rule identity。**

## prospective rule 与 continuous validity 是两种产品

把 band 定义成 prospective entry rule，状态迁移很简单：

```text
Activate(newRule)
=> activeRuleSet changed
&& prepared cleared
&& existing book byte-for-byte unchanged
&& existing registry lifecycle unchanged
```

若要 continuous validity，激活时就必须定义更多现在没有答案的问题：

- 越界订单是取消、暂停还是移动价格？
- 取消事件按哪个确定顺序输出？
- 部分成交订单取消多少 remainder？
- 操作员如何知道清理完成？
- 大簿扫描能否阻塞撮合线程？
- 重放时外部柜台如何区分政策撤单与客户撤单？

这些并非一个布尔 `revalidate=true` 能解决的细节。M06 会用 operating mode 和确定性 Mass Cancel 明确定义市场控制状态机；M05 到 Activate method boundary 就停止。

## 手算固定的跨版本 maker 场景

固定语料 `grandfathered-cross-version-maker` 用一组故意反直觉的价格证明边界：

1. bootstrap v0 的 band 是 `[1, Long.MAX_VALUE]`，legacy GTC SELL `orderId=60` 以 `90 × 2` 接受并入簿；
2. Prepare v1 `[95,105]`，active 仍是 v0；
3. 在 `ApplicationSequence=3` Activate v1，簿上的 SELL @ 90 保持不动；
4. governed FOK BUY `orderId=61` 以 limit 100、expected v1 入场；
5. 100 位于 `[95,105]`，并能完全吃到 1 lot 的旧 maker，因此在 maker price 90 成交；
6. 随后新 GTC SELL `orderId=62` 再报 90，因为它是新入场命令，返回 `PRICE_OUTSIDE_ACTIVE_BAND`。

同一个报价 90，旧订单继续有效，新订单被拒绝，不矛盾。判断时刻不同：order 60 已经在 v0 下获得身份与优先级；order 62 必须接受 v1 的当前准入。

成交事件应能表达：

```text
makerOrderId = 60
takerOrderId = 61
tradePriceTicks = 90
makerAdmissionRuleSet = v0 bootstrap identity
takerAdmissionRuleSet = v1 [95,105] identity
executionRuleSet = v1 [95,105] identity
```

这里 `executionRuleSet` 不是“允许 trade price 90 的规则”。它表示撮合命令执行时的 active identity；entry band 根本不会持续校验 maker price。真正解释为何 90 合法的是 maker 在 v0 下已被接受、taker BUY limit 100 没有被突破，以及 maker-price execution 仍成立。

## 每张订单在接受时冻结 admission identity

订单进入 registry 与 book 时，除了 M04 已有字段，还要保存：

```text
AcceptanceSequence sequence
OrderId orderId
Side side
PriceTicks limitPrice
QuantityLots remaining
ExecutionPolicy policy
RuleSetIdentity admissionRuleSet
```

`admissionRuleSet` 是历史事实，不能通过查看当前 active rule 动态计算。否则规则切换后，所有老订单都会被错误显示成新版本入场；再切一次，历史又会变化。

GTC 或 POST_ONLY 的 positive remainder 写入 `OrderBookSnapshot.RestingOrderView` 时同样携带 admission identity。snapshot 必须 detached：激活、成交或取消之后，先前返回的视图不能跟着改变。

旧 M00～M04 的 compatibility constructor 可以把缺少该字段的 value 规范化为 bootstrap v0 identity。这个兼容只发生在新内存模型的适配边界，不能改变冻结的 M04F1/M04H1/M04X1 canonical bytes 与 digest。

## 事件归因要覆盖完整生命周期

只在 `Trade` 上增加两个版本字段仍不够。审计者需要从订单被接受到消失都能恢复同一身份：

| 事件或视图 | 最少需要的规则事实 |
| --- | --- |
| `Accepted` | taker/order admission identity |
| `Rested` | remainder admission identity |
| `Trade` | maker admission、taker admission、execution identity |
| `RemainderCanceled` | IOC order admission identity |
| successful `Canceled` | order admission 与 cancel execution identity |
| resting snapshot | 每个 remainder 的 admission identity |
| returned batch context | active execution identity 与 control revision |

对业务拒绝，order 尚未获得 admission identity，但 batch context 仍必须说明它在哪个 active identity 与 control revision 下被判断。这样 `RULE_SET_MISMATCH` 或 `PRICE_OUTSIDE_ACTIVE_BAND` 才有可解释的控制视图。

不要只写 `ruleVersion=1`。完整 identity 是 `(version, contentHash)`；同版本不同内容正是 Prepare 必须 fail closed 的故障类型。事件里若丢掉 hash，就无法证明两个消费者解释的是同一 artifact。

## Batch context 把一次命令的事实封在一起

`ExecutionBatch` 可以携带一个统一上下文：

```java
public record MarketExecutionContext(
    RuleSetIdentity activeRuleSet,
    long controlRevision,
    Optional<ApplicationSequence> applicationSequence) {}
```

M05 新入口返回本次已应用 sequence；M00～M04 compatibility value 允许用 bootstrap context 表示“历史 API 没有这一字段”。重要的是，事件 grammar 校验以下关系：

- `Accepted.admissionRuleSet == batch.context.activeRuleSet`；
- 每个 taker 事件沿用同一 admission identity；
- `Trade.executionRuleSet == batch.context.activeRuleSet`；
- `Trade.makerAdmissionRuleSet` 等于簿中被扣减 maker 的冻结身份；
- `Canceled.executionRuleSet == cancel batch.context.activeRuleSet`；
- bookAfter 中未成交 remainder 仍保留各自 admission identity。

这些是构造时就能检查的局部不变量。跨命令的 registry、数量守恒与 sequence 连续性还要交给独立 oracle 和第三本 ledger 验证。

## Activate 不能制造任何隐式订单事件

成功 Activate 的 batch 只描述控制面切换。若它顺手重判订单，就必须输出一组新的业务事件；若没有事件却改了簿，异步柜台通过消费业务结果将永远无法知道用户订单为何消失。

因此可以给 Activate 写一条强 metamorphic property：

```text
snapshotBook(beforeActivate) == snapshotBook(afterActivate)
registryLifecycle(beforeActivate) == registryLifecycle(afterActivate)
nextAcceptanceSequence(beforeActivate) == nextAcceptanceSequence(afterActivate)
```

允许变化的只有 application sequence、active/prepared control state、control revision 与 activation fence。semantic mutant `M05-ACTIVATION-REVALIDATES-RESTING` 就专门把“激活清理越界 maker”植入错误实现，裁判必须用最小反例杀死它。

## 独立练习：三次切换也不能改老 maker 的出生证明

可以构造比固定语料更强的历史：

1. 在 v0 接受 SELL A @ 90；
2. 激活 v1 `[95,105]`，证明 A 仍在；
3. 在 v1 接受 SELL B @ 100；
4. 激活 v2 `[99,101]`，证明 A、B 的 FIFO 与 admission identity 都不变；
5. 用 v2 的 BUY C @ 101 吃掉 A 再吃 B；
6. 检查两个逐 maker `Trade` 的价格、数量与三元规则归因；
7. 取消任一 remainder，检查 admission identity 仍是它出生时的版本，execution identity 是取消时的 v2。

每个 Activate 前后保存 detached full-depth snapshot，不只比较最优价。一个错误实现可能保留 top of book，却重排同价 FIFO 或丢失深度层 attribution。

柜台的 sync 服务未来消费**已提交/已应用的业务事件**异步落库；它不应解析 raw consensus log，也不能通过当前公共配置反推历史 admission identity。M05 的事件归因正是给这条异步投影提供确定输入，但本单元本身仍没有数据库、Outbox/Inbox 或 Raft。

## 本篇停止在可解释的跨版本内存状态

到这里，active band 的切换不会破坏既有订单，跨版本成交也能回答“谁在哪版规则下入场、在哪版 active rule 下执行”。这仍然只是 caller-serialized、内存内的确定状态机。

最后一篇把这些合同收进可失败的证据系统：固定 12 场景、10,240 条生成命令、独立 flat-list reference、第三 ledger、八个 semantic mutants，以及只由 completion tag 冻结的 evidence manifest。
