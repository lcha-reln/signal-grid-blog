---
title: "M07·03：让 STP 沿价格时间扫描而不是绕开它"
description: "把同组判断嵌入 maker-by-maker 扫描，证明同价 FIFO、Trade/STP 真实交错，以及 CANCEL_MAKER 必须继续到后续价位。"
date: 2026-08-31T16:20:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M07
lessonOrder: 30
permalink: stp-price-time-scan-and-cross-level-cases
tags:
  - 撮合引擎
  - STP
  - 价格时间优先
draft: false
---

> 本篇按 annotated [`course/m07-start`](https://github.com/lcha-reln/cex-matching/tree/course/m07-start)、annotated [`course/m07-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m07-complete) 与已发布的 `self-trade-prevention-v1.json`/结果 evidence 校准；完成 commit 为 `8e9c147b12bfb6b55e69ff04ecfe3aa4c510ed23`。

上一课从单个同组 pair 推导三种终态，但撮合器面对的是一串按价格时间排序的 maker。错误实现常把 STP 做成一次“查找同组订单并删除”的旁路：它可能越过更早的非同组 maker、只检查 best level，或先成交再撤销。

M07 的扫描原则是：**保持 M01 的 maker-by-maker 价格时间顺序；对每个可成交 maker，先判断正 group 是否相同，再在这个确切位置产生 Trade 或 STP disposition。CANCEL_MAKER 移除当前 maker 后继续同价下一单及后续可成交价位。**

## STP 不改变谁先被观察

BUY taker 仍从最低 ask 开始，SELL taker 仍从最高 bid 开始；同价内部仍按 `AcceptanceSequence` 升序。STP 不能先搜索所有同组 maker，也不能把非同组订单重排到前面。

规范扫描可表达为：

```text
while taker has positive remaining:
  maker = best price, earliest acceptance sequence
  if maker price does not cross taker limit:
    stop

  if taker.group > 0 and maker.group == taker.group:
    apply taker disposition before any Trade for this pair
    stop or continue according to disposition
  else:
    trade at maker price
    remove maker only when fully filled
```

`group=0` 永不进入 self 分支。不同正 group 也直接走已有 Trade 路径，maker price、数量和 FIFO 全部保持 M01～M06 行为。

## 同价 FIFO 不是“成交 FIFO”而是“观察 FIFO”

冻结场景 `SAME_PRICE_FIFO_INTERLEAVE` 在 ask 100 上依次放入：

| sequence | order      | group | remaining |
| -------: | ---------- | ----: | --------: |
|        1 | order 1601 |    32 |         1 |
|        2 | order 1602 |    31 |         2 |
|        3 | order 1603 |    33 |         1 |

随后是 BUY order 1604：limit=100、qty=4、group=31、`CANCEL_MAKER`。合法顺序一定是 1601 → 1602 → 1603。1601 虽非同组，必须先成交；1602 命中 STP 后取消 maker；然后才观察 1603。

不能先过滤出“所有非 self makers=[1601,1603]”再成交。正确事件骨架是：

```text
Accepted(1604, qty=4)
Trade(maker=1601, price=100, qty=1)
SelfTradePrevented(maker=1602, policy=CANCEL_MAKER,
                   wouldTrade=2, makerCanceled=2, takerCanceled=0)
Trade(maker=1603, price=100, qty=1)
Rested(1604, remaining=2, group=31, policy=CANCEL_MAKER)
```

因此 FIFO 的含义是：每个 maker 按队列顺序被状态机观察，并在那个位置作出 Trade/STP 决策，而不是只对最终产生 Trade 的子集排序。

## 冻结的 SELL 跨价位 `CANCEL_MAKER` 历史

`CANCEL_MAKER_CROSS_LEVEL` 反过来建立四档 bid：

| sequence | price | order      |      group | remaining |
| -------: | ----: | ---------- | ---------: | --------: |
|        1 |   102 | order 1701 | 41（self） |         1 |
|        2 |   101 | order 1702 |         42 |         2 |
|        3 |   100 | order 1703 | 41（self） |         1 |
|        4 |    99 | order 1704 |         43 |         2 |

提交 SELL order 1705：limit=99、qty=4、group=41、policy=`CANCEL_MAKER`、GTC。真实扫描是：

| step | maker         | 决定                      | taker remaining | maker terminal |
| ---: | ------------- | ------------------------- | --------------: | -------------- |
|    1 | 1701(102,g41) | STP，cancel maker 1       |               4 | CANCELED       |
|    2 | 1702(101,g42) | Trade 2 @ maker price 101 |               2 | FILLED         |
|    3 | 1703(100,g41) | STP，cancel maker 1       |               2 | CANCELED       |
|    4 | 1704(99,g43)  | Trade 2 @ maker price 99  |               0 | FILLED         |

事件按相同顺序表达：

```text
Accepted(1705)
SelfTradePrevented(1701,1705,CANCEL_MAKER,makerCanceled=1)
Trade(1702,1705,price=101,qty=2)
SelfTradePrevented(1703,1705,CANCEL_MAKER,makerCanceled=1)
Trade(1704,1705,price=99,qty=2)
```

这条 history 同时证明四件事：SELL 从最高 bid 向下扫描、Trade 与 STP 可以交错、成交价仍是 maker price、`CANCEL_MAKER` 能越过一个 self 价位继续到后续可成交价位。它不是把 BUY 示例机械反转：SELL crossing 固定为 `takerLimit <= makerBid`，maker 事件价格必须单调不增。

## 换成另外两种 disposition 会在哪里停止

沿用同价 FIFO 场景，order 1604 先与 1601 成交 1 lot，再第一次碰到 self maker 1602；此时 taker remainder 是 3。

### `CANCEL_TAKER`

```text
Accepted(1604)
Trade(1601,1604,qty=1)
SelfTradePrevented(1602,1604,CANCEL_TAKER,
                   makerCanceled=0,takerCanceled=3)
STOP
```

1602 原地保持 RESTING qty=2；1603 未被观察。1604 的 4 lots 分区为 filled 1 + canceled 3。

### `CANCEL_BOTH`

```text
Accepted(1604)
Trade(1601,1604,qty=1)
SelfTradePrevented(1602,1604,CANCEL_BOTH,
                   makerCanceled=2,takerCanceled=3)
STOP
```

1602 与 1604 都进入 CANCELED，1603 不变。扫描不能继续到 1603。

这说明 disposition 不只是终态字段，它控制状态机是否还有下一次 maker 观察。

## 同组判断必须早于这一个 pair 的 Trade

错误顺序：

```text
trade = min(makerRemaining, takerRemaining)
apply Trade mutation
if same group:
  emit SelfTradePrevented / roll back
```

即使随后把数量加回来，也已经制造过一条 self `Trade`、可能终结 maker、改变 price level，甚至触发下游成交回报。M07 要求：对**当前 pair**，group comparison 与 disposition 在任何 Trade event/mutation 之前。

但它不要求 STP 事件排到先前非同组 Trade 之前。上例 A 的 Trade 已经真实发生，B 的 STP 必须排在其后。正确顺序是局部的 maker-by-maker 决策，不是把 STP 设成整个命令的全局第一事件。

## `CANCEL_MAKER` 不能只清 best level

一种看似合理的优化是：发现 best price self maker 后，删除这个价位的同组订单，然后直接结束匹配。它会漏掉：

- 同价后面仍有非同组 maker；
- 下一个价位仍在 taker limit 内；
- 后续价位又出现同组 maker，需要再次 STP；
- FOK 需要跨多个价位才能满足数量。

正确停止条件仍只有原撮合条件：taker 无余量、遇到不可成交价格，或 disposition 明确要求 stop。`CANCEL_MAKER` 本身从不构成 stop。

八个必杀 mutant 中的 `M07-CANCEL-MAKER-BEST-LEVEL-ONLY` 就针对这一缺陷；它必须由跨价位 history 杀死，而不是依赖随机碰巧生成。

## `ExecutionBatch` 先封住局部事件语法

core 不能仅靠 judge 才发现伪造事件。当前 `ExecutionBatch` 会对同一 Accepted 后的所有 `Trade`/`SelfTradePrevented` maker 执行以下局部校验：

```text
maker acceptance sequence < taker acceptance sequence
maker orderId != taker orderId
同一 batch 内 maker orderId 与 maker sequence 各自唯一
maker price 必须穿过 taker limit
BUY taker 的 maker price 单调不减；SELL taker 单调不增
同价 maker acceptance sequence 严格递增
```

因此伪造“同一 maker 先 Trade 再 STP”、非 crossing maker、错价位顺序或同价逆 FIFO 的 batch 会在构造时失败。这个本地 grammar 仍不替代第三账本：单个 `Trade` 不携带双方 group，`ExecutionBatch` 也没有命令前 registry；“该 maker 当时是否真实存在、group 是否相等、数量与生命周期是否闭合”仍需 production/reference/ledger 跨状态验证。

批次的终结语法也已经封闭：rejection/cancel 是 singleton；接受批次必须以 `Accepted` 开头；`CANCEL_TAKER/BOTH` 的 STP 必须是最后一个事件并精确取消当前 taker remainder；GTC 的正余量只能由最后一个 `Rested` 收口；IOC 的普通正余量只能由最后一个 `RemainderCanceled(IOC_REMAINDER)` 收口，而 STP 已取消 taker 时不能再追加；accepted FOK 必须完整成交，accepted POST_ONLY 只能无 Trade/STP 地 Rest。rule/group/policy attribution 若在批内漂移也会被拒绝。

## maker 移除后仍保留 terminal identity

被 `CANCEL_MAKER`/`CANCEL_BOTH` 终止的 maker 从 active price level 移除，但 registry 中仍保留 CANCELED lifecycle、原 acceptance sequence、group、admission rule、已成交量与 canceled remainder。

后续可观察语义与 M02/M06 一致：

```text
Cancel(old maker id) → ORDER_ALREADY_CANCELED
Place(reused maker id) → DUPLICATE_ORDER_ID
```

STP 不能用“从 list 删除 object”代替终态转换。否则 book 看似正确，identity 与数量历史已经丢失。

## BUY/SELL 对称，但价格顺序相反

SELL taker 扫描 bids 时逻辑完全对称：从最高 bid 到更低 bid，同价按 acceptance sequence。实现与测试应对称生成两边历史，但不能用简单反转 list 忽略 maker price 与 crossing 条件。

可以把不变量写成：

```text
at every scan step:
  selected maker is current best price and earliest sequence
  event is exactly one of Trade or SelfTradePrevented
  same positive group implies SelfTradePrevented, never Trade
  different group or group 0 implies ordinary matching behavior
```

第三账本逐事件验证这个不变量，比只比较最终 BBO 更能发现跳过 maker、错价和事件重排。

## 本地验证

M07 实现不能另开一个绕过累计 gate 的 demo module。正式入口仍应是：

```bash
./gradlew clean build --no-daemon
./gradlew m07Check --no-daemon
```

冻结输入位于 `matching-testkit/src/test/resources/m07/fixtures/self-trade-prevention-v1.json`，其中显式包含上述同价和 SELL 跨价位序列；independent flat-list reference 用自己的表示推导相同事件。完成裁判又以 160×64 生成历史和第三账本逐边界复核，因此 PASS 不是由 fixture 自洽或 core 单测单独推出的。

浏览器 Lab 可以把静态 book 画成队列，让读者逐步选择 Trade/STP/stop/continue；它不能执行任意 Java，也不能用动画顺序替代本地裁判。

## 本篇停止点

到这里，STP 已被放回原始价格时间扫描：同组判断发生在每个 pair 的 Trade 之前，事件按真实扫描交错，`CANCEL_MAKER` 能继续同价与跨价位，其他两种 disposition 精确停止。

下一篇处理最容易出错的组合：IOC remainder、FOK Accepted 前预演、POST_ONLY 原始盘口，以及 M05 rule/M06 mode 的既有优先级。
