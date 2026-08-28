---
title: "M04·04：Post-only 必须在 touch 边界之前守住 maker 身份"
description: "用命令开始时的最佳对手价做 pre-Accepted 准入：会 touch/cross 就零副作用拒绝，不会成交才允许 Accepted→Rested。"
date: 2026-08-28T19:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M04
lessonOrder: 40
permalink: post-only-maker-admission
tags:
  - 撮合引擎
  - Post-only
  - Maker Admission
draft: false
---

> 本篇仍以 annotated [`course/m04-start`](https://github.com/lcha-reln/cex-matching/tree/course/m04-start) 为练习起点；发布正文固定到 annotated [`course/m04-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m04-complete)，完成 commit 为 `9d1bca13da6b13aa97a8002baff37fbc2393abe4`。Post-only 的 touch/cross、身份复用与 SELL 镜像已进入同一份公开 Golden 与性质证据。

IOC 和 FOK 都允许成为 taker，只是对未成交余量采取不同态度。Post-only 的目标正相反：这笔请求只有在**不会立即成交**时才允许进入订单生命周期。最容易低估的边界是“touch”——买价恰好等于最佳卖价、或卖价恰好等于最佳买价时，订单已经会成交，不能被当作 maker 挂单。

本篇只证明一个命题：**Post-only 准入必须基于命令开始时的最佳对手价，在 Accepted 之前拒绝任何 touch/cross 请求；拒绝不占 identity/sequence、不改变 maker，接受后的唯一语法是 `Accepted → Rested`。**

这是一条撮合状态机内部保证，不是对手续费、返佣或外部 venue 回报字段的承诺。费用归属最终由 Counter 根据权威成交事实和费率版本结算。

## Maker 不是请求标签，而是一次准入事实

客户端把字段写成 Post-only，不代表系统可以先成交、再把成交标记为 maker。maker/taker 角色由订单进入簿时的相对状态决定：若提交时已经存在可 crossing 的对手单，这笔新订单就是 taker。

因此 Post-only 的结果闭集很窄：

```text
字段非法
  → Rejected(...)

orderId 已被接受
  → PlaceRejected(DUPLICATE_ORDER_ID)

命令开始时会 touch/cross
  → PlaceRejected(POST_ONLY_WOULD_TAKE)

不会成交
  → Accepted(POST_ONLY) → Rested(完整数量)
```

它没有 Trade、RemainderCanceled 或接受后普通 Canceled。若调用方随后主动撤掉已经 RESTING 的 Post-only，那才是另一条 Cancel 命令产生 M02 的 `Canceled`。

## 手算 BUY 的 non-cross、touch 与 cross

盘口只有一档：

```text
Ask 100: orderId=10, sequence=1, remaining=2
```

依次考虑三笔 fresh 请求：

| 请求 | 与 best Ask 的关系 | 结果 | 是否占 ID/sequence |
| --- | --- | --- | --- |
| `BUY 99 × 1 POST_ONLY` | non-cross | `Accepted → Rested` at Bid 99 | 是 |
| `BUY 100 × 1 POST_ONLY` | touch | `POST_ONLY_WOULD_TAKE` | 否 |
| `BUY 101 × 1 POST_ONLY` | cross | `POST_ONLY_WOULD_TAKE` | 否 |

BUY 100 不是“价格没有超过对手价，所以可以挂”。限价撮合的 crossing 条件是 `buyLimit >= makerAsk`；等号已经能成交。SELL 镜像则是 `sellLimit <= makerBid`，等号同样必须拒绝。

若 touch 请求使用 orderId 20 被拒，下一笔 `BUY 99 × 1 POST_ONLY` 仍可使用 orderId 20，并获得紧邻上一笔 Accepted 的 sequence。对被拒 ID 发 Cancel 必须得到 `ORDER_NOT_FOUND`。

## 最佳对手价足以决定当前是否会取单

生产订单簿已经按最佳价排序：Ask 从低到高、Bid 从高到低。若 BUY 不会 crossing 最佳 Ask，它更不可能 crossing 更贵的 Ask；若 SELL 不会 crossing 最佳 Bid，它更不可能 crossing 更低的 Bid。

因此准入只需读取 best opposite：

```java
private boolean wouldTake(PlaceLimitOrder command) {
  NavigableMap<Long, PriceLevelState> opposite =
      command.side() == Side.BUY ? asks : bids;
  if (opposite.isEmpty()) {
    return false;
  }
  long bestOppositePrice = opposite.firstKey();
  return crosses(
      command.side(),
      command.priceTicks().value(),
      bestOppositePrice);
}
```

它复用与正常 match 完全相同的 `crosses()`，而不是维护第二份“maker-only 比较器”。这避免最常见的 `>`/`<` 错误：

```java
return takerSide == Side.BUY
    ? takerLimitPrice >= makerPrice
    : takerLimitPrice <= makerPrice;
```

M04 core 是单写者；一次 `placeRequest()` 内，从 `wouldTake()` 到接受/挂单之间没有另一个 command 插入。未来接入 Aeron Cluster 也必须保持日志 apply 的串行命令边界，而不是让网络线程并发读写订单簿。

## 准入检查必须先于 sequence 与 identity

Post-only 与 FOK 一样属于 normalized pre-accept policy rejection，但 duplicate 仍应更早：

```java
if (ordersById.containsKey(command.orderId())) {
  return singleton(new MatchingEvent.PlaceRejected(
      command.orderId(), PlaceRejectionCode.DUPLICATE_ORDER_ID));
}

if (policy == ExecutionPolicy.POST_ONLY && wouldTake(command)) {
  return singleton(new MatchingEvent.PlaceRejected(
      command.orderId(),
      PlaceRejectionCode.POST_ONLY_WOULD_TAKE));
}

// 到这里才允许分配 sequence、登记 identity 和 Accepted。
```

为什么 duplicate 更早？若一个活动 orderId 再次提交 crossing Post-only，权威事实首先是“该身份已经被接受过”，而不是“这份新 payload 当前会取单”。反过来会让同一 terminal ID 的结果随盘口变化，破坏 M02 的稳定生命周期。

策略拒绝必须保持：

```text
bookAfter == bookBefore
registryAfter == registryBefore
nextSequenceAfter == nextSequenceBefore
makerRemaindersAfter == makerRemaindersBefore
```

不要为拒绝的 Post-only 创建 CANCELED tombstone。课程内部把它建模为 `PlaceRejected`，因为它从未 Accepted；某些外部交易所 API 可能把表面状态描述为 canceled，那是 Rest adapter 与 venue protocol 的映射问题，不能改变 Matching 内部代数。

## 被接受的 Post-only 必须完整 Rested

通过 `wouldTake()` 意味着当前没有可成交 maker。共享 match 循环会执行零次，taker 保留全部数量，然后走普通 rest 路径：

```text
Accepted(sequence, orderId, side, priceTicks,
         originalQuantity, POST_ONLY)
Rested(sequence, orderId, side, priceTicks,
       remainingQuantity=originalQuantity)
```

`ExecutionBatch` grammar 应主动拒绝这些畸形组合：

```text
Accepted(POST_ONLY) → Trade → Rested
Accepted(POST_ONLY) → RemainderCanceled
Accepted(POST_ONLY) 且没有 Rested
Accepted(POST_ONLY) → Rested(partial quantity)
```

事件 grammar 不是 engine 单元测试的重复品。它守住所有未来 adapter、reference 或测试构造器：即使某段代码绕过正常 match 直接组装 batch，也不能制造“被接受的 Post-only 曾经成为 taker”的历史。

`ExecutionBatchPolicyGrammarTest.postOnlyCannotTradeAndMustRestItsFullQuantity` 直接锁定了四个形状：缺失 `Rested`、`Trade → Rested` 与 partial `Rested` 必须被拒绝，完整 `Rested` 必须被接受。`RemainderCanceled` 以及真实历史中的 book/lifecycle 对应关系仍由 M04 event-derived ledger 逐命令检查。

## 真实 API 的表示差异不能反向污染 core

课程把 Post-only 放进互斥 `ExecutionPolicy`，但 venue API 未必如此。[Coinbase Exchange 下单接口](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/orders/create-new-order)使用独立 `post_only` flag，并把它与 `time_in_force` 的组合限制写在 API 合同中；[OKX API v5](https://www.okx.com/docs-v5/en/#order-book-trading-trade-post-place-order)则把 `post_only` 作为 `ordType` 之一。

这些接口还可能对“会取单”的请求返回不同状态或错误字段。M04 不试图兼容每一种 wire 表示，只冻结内部状态机事实：

```text
没有 Accepted → 没有 Matching 生命周期身份
有 Accepted(POST_ONLY) → 必须完整 RESTING 且没有 Trade
```

未来 Rest 可以把 venue-specific request 转成 `PlaceLimitOrderRequest`，再把内部 `PlaceRejected` 映射成对外协议；它不能要求 Matching 为每家交易所复制一套生命周期。

## 四种错误设计为何都不是真正的 Post-only

### 只拒绝 cross，不拒绝 touch

把 BUY 条件写成 `price > bestAsk`，会接受 BUY 100 对 Ask 100。共享 match 随即产生 Trade，maker-only 保证被等号击穿。

### 先 match，再看是否产生 Trade

发现 Trade 后再“撤销”已经太晚：maker remaining、事件和生命周期都被改写。与 FOK 一样，Post-only 必须 preflight，而不是补偿。

### 先 Rested，再从盘口删除

即使最终 book snapshot 与拒绝前相同，也已经消耗 sequence、占用 ID，并可能让并发观察者看到短暂挂单。它是接受后撤单，不是准入拒绝。

### 用手续费结果判断 maker

fee schedule 属于 Counter，且可能按账户等级和版本变化。Matching 的 Post-only 只判断是否会立即成交，不能等待费用计算来决定是否接受。

## 练习：镜像 SELL，并把 duplicate 加进矩阵

准备：

```text
Bid 100: orderId=1, sequence=1, remaining=2
```

为以下请求写出完整结果：

```text
A. SELL orderId=2 price=101 quantity=1 POST_ONLY
B. SELL orderId=2 price=100 quantity=1 POST_ONLY
C. SELL orderId=2 price= 99 quantity=1 POST_ONLY
D. SELL orderId=1 price= 99 quantity=1 POST_ONLY
```

分别在 fresh state 评估 A/B/C：A non-cross，应 `Accepted → Rested`；B touch、C cross，都应 `POST_ONLY_WOULD_TAKE`。D 即使会 cross，也必须先返回 `DUPLICATE_ORDER_ID`。

再做一个状态化变体：先让 B 被拒，然后用同一 orderId 2 提交 A。它应被接受并得到 sequence 2；这证明策略拒绝没有消费 identity 或 sequence。

测试不要只断言错误码。保存拒绝前的 full-depth snapshot，并在之后 Cancel orderId 2 得到 `ORDER_NOT_FOUND`；再接受 A 后 Cancel 同 ID，应产生正常 `Canceled`。`postOnlyRejectsTouchWithoutEffectThenAllowsSameIdentityToRestNonCrossing` 会真实执行这两次 Cancel，从结果上区分“从未接受”与“接受后挂单”，而不是从方法名推导证据。

## 本篇的可验证停止点

运行 Post-only 的 production 测试与 batch grammar：

```bash
./gradlew :matching-core:test \
  --tests '*SingleInstrumentExecutionPolicyTest.postOnlyRejectsTouchWithoutEffectThenAllowsSameIdentityToRestNonCrossing' \
  --tests '*SingleInstrumentExecutionPolicyTest.sellIocAndPostOnlyMirrorBuyAcrossPartialCrossAndNonCrossingBoundaries' \
  --tests '*SingleInstrumentExecutionPolicyTest.sellPoliciesMirrorBuyLimitsAndTouchSemantics' \
  --tests '*ExecutionBatchPolicyGrammarTest.postOnlyCannotTradeAndMustRestItsFullQuantity' \
  --no-daemon
```

这些测试通过时，可以声称：在当前单写者内存 core 中，BUY touch 与 SELL touch、cross/non-cross 的直接样例符合共享 crossing 边界，策略拒绝不占状态，被接受的 Post-only 只能完整挂单。BUY cross 与完整 BUY/SELL 对称性还要由独立 reference 与 M04 property corpus 对拍，不由上述几个方法名代替。

沿着本篇阶段性分支时仍不能声称 M04 已完成：production core 与线性 reference 的局部测试只是两条实现路径；testkit 还必须把 raw policy、事件 grammar、生命周期、验证优先级和八项 plausible fault 放进同一可重放证明链。发布完成态已经让 8/8 mutant 与 23/23 覆盖义务通过，[M04 Matching Lab](/signal-grid-blog/practice/high-availability-cex/m04/lab/) 则消费同一 Golden。下一篇处理最后一个问题：**怎样不预写结果，而由 Golden/property、mutant、三态裁判与 clean-tree evidence 共同形成完成事实。**
