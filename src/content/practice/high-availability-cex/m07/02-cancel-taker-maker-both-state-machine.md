---
title: "M07·02：把 CANCEL_TAKER、MAKER、BOTH 写成三条终态路径"
description: "从 would-trade 边界精确定义三种 STP disposition 对 maker/taker 余量、生命周期、事件顺序和扫描终止的影响。"
date: 2026-08-31T16:10:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M07
lessonOrder: 20
permalink: cancel-taker-maker-both-state-machine
tags:
  - 撮合引擎
  - STP
  - 订单生命周期
draft: false
---

> 本文按 annotated [`course/m07-start`](https://github.com/lcha-reln/cex-matching/tree/course/m07-start) 到 annotated [`course/m07-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m07-complete) 的真实演进讲解；完成 tag peeled 到 `8e9c147b12bfb6b55e69ff04ecfe3aa4c510ed23`，对应[静态 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m07/evidence/manifest.json)已经公开。

STP 不是“检测到同组就跳过成交”这么简单。跳过之后，两张订单谁还活着、剩余量是多少、是否继续扫描、是否还能 Rest，都会改变订单簿的确定终态。

M07 把决定权放在当前 taker 携带的 policy 上，并冻结三条互斥路径：**CANCEL_TAKER 终止 taker、CANCEL_MAKER 终止当前 maker 并继续、CANCEL_BOTH 同时终止双方。任何同组 pair 都不能产生 `Trade`。**

## STP 发生在“本来会成交”的边界

扫描只有同时满足以下条件才触发 STP：

```text
maker price crosses taker limit
maker and taker both have positive remaining quantity
maker.group == taker.group
group > 0
```

先定义一个只用于事件归因的量：

```text
wouldTradeQuantity = min(makerRemaining, takerRemaining)
```

它表示若没有 STP，这一对订单本来会成交多少；它不是一定要从双方各减掉的数量。三种 disposition 取消的是订单当前**完整正余量**，而非固定减去 `wouldTradeQuantity`。

例如 maker 剩 3、taker 剩 10，则 `wouldTradeQuantity=3`：

- `CANCEL_TAKER` 取消 taker 的 10，不是 3；
- `CANCEL_MAKER` 取消 maker 的 3；
- `CANCEL_BOTH` 分别取消 maker 的 3 与 taker 的 10。

若把三者都实现成双方各减 3，就偷偷加入了 M07 明确排除的 `DECREMENT_AND_CANCEL`。

## 只有通过准入的 taker 才进入 STP 终态

普通 GTC/IOC 请求通过 raw、duplicate、rule、band、mode 等 guard 后，先得到 Accepted identity 与 `AcceptanceSequence`，再进行真实价格时间扫描。事件顺序因而是：

```text
Accepted
→ zero or more Trade / SelfTradePrevented in real scan order
→ optional Rested or non-STP remainder terminal event
```

对 `CANCEL_TAKER`/`CANCEL_BOTH`，命中 STP 后 taker 从已接受的活跃状态进入不可逆 CANCELED，并停止扫描；不能倒退成“从未接受”，也不能占过 identity 后把 registry 删除。

FOK 与 POST_ONLY 是例外：它们各自有 Accepted 前预检。若预检拒绝，就没有 Accepted、STP 事件或任何 maker mutation。第四篇会单独证明这一点。

## `CANCEL_TAKER`：保留 maker，终止全部 taker 余量

状态转移可写成：

```text
maker: RESTING(m)  ───────────────→ RESTING(m)
taker: ACTIVE(t)   ─STP conflict─→ CANCELED(t)
scan:                              STOP
```

规范观察：

| 字段                    | 值                       |
| ----------------------- | ------------------------ |
| `wouldTradeQuantity`    | `min(m, t)`              |
| maker canceled quantity | 0                        |
| taker canceled quantity | `t`                      |
| maker book position     | 原价位、原 FIFO 位置不变 |
| taker final lifecycle   | CANCELED                 |
| further maker scan      | 不发生                   |

“maker 不变”包括数量、acceptance sequence、admission rule 与价位队列位置全部不变。不能先从 maker 扣量再补回；事件账本会观察到伪造的数量历史。

若 taker 在遇到同组 maker 前已经和非同组 maker 成交一部分，取消的是**当时剩余量**：

```text
Accepted(qty=10)
Trade(non-self, qty=4)
SelfTradePrevented(CANCEL_TAKER, takerCanceled=6)
```

最终数量分区是 `10 = filled 4 + canceled 6`，没有 Rested remainder。

## `CANCEL_MAKER`：终止当前 maker，taker 继续

状态转移是：

```text
maker: RESTING(m)  ─STP conflict─→ CANCELED(m)
taker: ACTIVE(t)   ───────────────→ ACTIVE(t)
scan:                              CONTINUE
```

规范观察：

| 字段                    | 值                             |
| ----------------------- | ------------------------------ |
| `wouldTradeQuantity`    | `min(m, t)`                    |
| maker canceled quantity | `m`                            |
| taker canceled quantity | 0                              |
| maker final lifecycle   | CANCELED，identity 保留        |
| taker remaining         | `t`，未因该 pair 减少          |
| further maker scan      | 同价下一单，再到后续可成交价位 |

这里“继续”是 disposition 的核心。若当前 maker 是价位头部，先把它从 book 移除并标记 CANCELED，然后用同一个 taker 观察新的头部。taker 可能连续取消多个同组 maker，也可能在这些 STP 事件之间与非同组 maker 正常成交。

扫描结束后，taker 按原 ExecutionPolicy 收口：GTC 可 Rest，IOC 取消非 STP 余量，FOK 因预检保证应完整成交。不能因为使用 `CANCEL_MAKER` 就强迫一个 GTC taker 终止。

## `CANCEL_BOTH`：双方终止，立即停止

状态转移是：

```text
maker: RESTING(m)  ─STP conflict─→ CANCELED(m)
taker: ACTIVE(t)   ─STP conflict─→ CANCELED(t)
scan:                              STOP
```

事件必须同时携带 maker canceled=`m` 与 taker canceled=`t`，并记录相同 group/disposition。双方都进入不可逆终态，maker 从 book 移除，taker 不 Rest，也不继续寻找非同组流动性。

一个常见半实现是只移除 maker，然后把 taker remainder Rest 到 book。这会把 `CANCEL_BOTH` 退化成 `CANCEL_MAKER`，也让同一命令在最终 book 中留下本应终止的 taker。

## 三种 disposition 的一张完整表

假设冲突前 maker 余量为 `m>0`、taker 余量为 `t>0`：

| disposition    | maker delta | taker delta | maker terminal | taker terminal     | scan     |
| -------------- | ----------: | ----------: | -------------- | ------------------ | -------- |
| `CANCEL_TAKER` |           0 |  cancel `t` | 否             | 是                 | stop     |
| `CANCEL_MAKER` |  cancel `m` |           0 | 是             | 否，由后续扫描决定 | continue |
| `CANCEL_BOTH`  |  cancel `m` |  cancel `t` | 是             | 是                 | stop     |

三行都满足：

```text
Trade(self pair) does not exist
maker original = maker filled + maker canceled + maker resting
taker original = taker filled + taker canceled + taker resting
```

当前 core 的事件不是“至少包含这些语义”，而是下面这个精确 record：

```text
MatchingEvent.SelfTradePrevented(
  AcceptanceSequence makerSequence,
  OrderId makerOrderId,
  AcceptanceSequence takerSequence,
  OrderId takerOrderId,
  PriceTicks makerPriceTicks,
  QuantityLots wouldTradeQuantityLots,
  long participantGroupId,
  SelfTradePreventionPolicy policy,
  long makerCanceledQuantityLots,
  long takerCanceledQuantityLots,
  RuleSetIdentity makerAdmissionRuleSet,
  RuleSetIdentity takerAdmissionRuleSet,
  RuleSetIdentity executionRuleSet
)
```

注意两个 canceled 字段是 `long`，`wouldTradeQuantityLots` 才是 `QuantityLots`。record 自身拒绝 maker sequence 不早于 taker、相同 maker/taker orderId、非正 group、`NONE` policy、负取消量、`wouldTrade` 大于被取消侧，以及与 disposition 不一致的取消量。`ExecutionBatch` 再验证这个 maker 确实按 crossing、价格时间顺序出现，且同一批内不会以 `Trade`/STP 重复消费。

## 冻结 fixture 同时钉住 BUY 与 SELL

三条最小 disposition history 刻意没有只测 BUY taker：

| scenario                  | resting maker         | incoming taker              | 终态                                     |
| ------------------------- | --------------------- | --------------------------- | ---------------------------------------- |
| `CANCEL_TAKER_SAME_GROUP` | SELL 2 lots，group 21 | BUY 5 lots，`CANCEL_TAKER`  | maker 保留 2，taker 取消 5               |
| `CANCEL_MAKER_SAME_GROUP` | BUY 2 lots，group 22  | SELL 5 lots，`CANCEL_MAKER` | maker 取消 2，SELL taker 未减量并 Rest 5 |
| `CANCEL_BOTH_SAME_GROUP`  | BUY 2 lots，group 23  | SELL 5 lots，`CANCEL_BOTH`  | maker 取消 2，SELL taker 取消 5          |

因此“BUY/SELL 对称”不是一句实现注释：SELL taker 的 crossing 是 `takerLimit <= makerBid`，扫描顺序也与 BUY 相反；但 group equality、完整余量取消和生命周期规则必须完全相同。

## maker 的旧 policy 为什么不参与仲裁

假设 maker 当年以 `CANCEL_TAKER` 入簿，今天 taker 携带 `CANCEL_MAKER`。若同时读取双方 policy，就需要定义优先级矩阵：谁覆盖谁、组合是否升级为 BOTH、节点配置变更是否重算。PLAN v0.9 没有这条复杂度。

M07 的唯一答案是：

```text
disposition = current taker policy
identity comparison = current taker group vs stored maker group
```

maker 只贡献 group 和订单状态。这样相同有序输入只有一个结果，也与交易所常见“incoming order chooses STP instruction”的模型一致，而不绑定某个具体 venue API。

## 事件可以交错，但同组 pair 永远没有 Trade

真实扫描可能形成：

```text
Accepted(taker)
Trade(non-self maker A)
SelfTradePrevented(self maker B, CANCEL_MAKER)
Trade(non-self maker C)
SelfTradePrevented(self maker D, CANCEL_MAKER)
Rested(taker remainder)
```

不能把所有 Trade 收集在前、所有 STP 事件放在后；那会丢掉价格时间扫描的真实因果顺序。第三账本应在每个事件后更新 maker/taker 余量和生命周期，验证下一个事件面对的是上一个事件之后的状态。

## Accepted 之后的四个反例

| fault                                    | 违反的合同                            |
| ---------------------------------------- | ------------------------------------- |
| same group 仍输出 `Trade`                | STP 最核心不变量失效                  |
| `CANCEL_TAKER` 只减 `wouldTradeQuantity` | 偷偷实现 decrement，taker 仍可能 Rest |
| `CANCEL_MAKER` 同时取消 taker            | 把 continue 路径退化成 BOTH           |
| `CANCEL_BOTH` 保留 maker 或 taker        | 一方终态丢失                          |

这些 fault 不能只用最终 BBO 检查。需要同时比较事件、full-depth book、registry lifecycle、数量分区和 identity attribution。

## 本地实现时先跑累计基线

从 `course/m07-start` 开始，第一步仍应运行：

```bash
./gradlew clean build --no-daemon
./gradlew m07Check --no-daemon
```

start 上的结构化 RED 只说明目标尚未实现，不允许删除既有 M00～M06 测试来腾出空间。complete 上累计回归、production/reference/event-ledger、24/24 witness 和 8/8 mutant 都已由 clean tag-bound evidence 封存；同一完成点没有创建产品 release。

网页 Lab 只能用发布后的静态 history 让读者预测 maker/taker delta 和下一扫描动作。它不执行 Java，也不把一张状态表当作 production 验证。

## 本篇停止点

现在三种 disposition 已经拥有唯一的余量、终态和扫描动作，并且 Accepted identity 不会因 STP 被抹掉。下一篇把这些局部转换放回 M01 的价格时间扫描，证明同价 FIFO、事件交错和 `CANCEL_MAKER` 跨价位继续。

当前结论仍不包括 FOK Accepted 前预演、POST_ONLY 优先级、账户资产、持久化、并发、复制或 HA。
