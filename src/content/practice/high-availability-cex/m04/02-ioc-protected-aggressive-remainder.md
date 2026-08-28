---
title: "M04·02：IOC 可以主动成交，但绝不能越过自己的限价"
description: "把既有 priceTicks 解释为 aggressive IOC 的最差成交价，用 Accepted→Trade*→RemainderCanceled? 闭合数量与 CANCELED 生命周期。"
date: 2026-08-28T18:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M04
lessonOrder: 20
permalink: ioc-protected-aggressive-remainder
tags:
  - 撮合引擎
  - IOC
  - 价格保护
draft: false
---

> 本篇继续从 annotated [`course/m04-start`](https://github.com/lcha-reln/cex-matching/tree/course/m04-start) 演进；发布正文固定到 annotated [`course/m04-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m04-complete)，完成 commit 为 `9d1bca13da6b13aa97a8002baff37fbc2393abe4`。本文推导的 IOC 结果已由[固定 Golden event batches](/signal-grid-blog/practice/high-availability-cex/m04/evidence/reports/fixed-event-batches.json)与生成式性质报告交叉验证。

上一篇把 `ExecutionPolicy` 固定成一条请求与结果轴。现在遇到第一个真正改变余量命运的策略：IOC。它经常被口语化为“马上能成交多少就成交多少，剩下撤掉”，但这句话遗漏了三个会直接造成资金风险的边界：什么价格算“能成交”、余量是否曾经入簿、零成交的订单是否仍然占用身份。

本篇只证明一个命题：**M04 的 IOC 仍是一笔有 `priceTicks` 保护的限价单；它在该边界内沿既有价格时间顺序成交，任何正余量从未进入订单簿，而是在同一 command batch 中以 `RemainderCanceled(..., IOC_REMAINDER)` 进入 CANCELED 终态。**

这意味着 IOC 不是市价单，也不是 FOK，更不是一笔短暂挂单后由异步撤单清理的 GTC。

## `priceTicks` 已经是最差成交价

M04 不新增 `worstPriceTicks`。同一个 `priceTicks` 对所有策略都保留限价含义：

```text
BUY  可以成交 makerPrice <= priceTicks
SELL 可以成交 makerPrice >= priceTicks
```

一个 BUY IOC 报价 100，可以吃 Ask 99 和 Ask 100，不能吃 Ask 101；一个 SELL IOC 报价 100，可以吃 Bid 101 和 Bid 100，不能吃 Bid 99。策略只决定未成交余量是否挂单，不会扩大价格域。

这也解释了“aggressive”真正表示什么：订单当前会主动寻找对手流动性，而不是允许无限滑点。M04 没有无保护市价单；若调用方想扩大可成交范围，只能显式提交更宽的限价，并承担这个输入事实。

撮合循环仍然使用 M01 已证明的 crossing 条件和 maker price：

```java
private static boolean crosses(
    Side takerSide, long takerLimitPrice, long makerPrice) {
  return takerSide == Side.BUY
      ? takerLimitPrice >= makerPrice
      : takerLimitPrice <= makerPrice;
}
```

不要为 IOC 再写一套 comparator。GTC 与 IOC 对“哪些 maker 可成交、谁先成交、成交价是什么”的答案必须完全相同；它们只在正余量出现后分叉。

## 手算一笔部分成交 IOC

fresh engine 依次接受：

```text
sequence=1  SELL orderId=10  price=100  quantity=2
sequence=2  SELL orderId=11  price=101  quantity=5
```

随后提交：

```text
BUY orderId=20 priceTicks=100 quantityLots=3 policy=IOC
```

按价格时间顺序推导：

1. 请求字段、policy 和 orderId 都合法，分配 `sequence=3`；
2. 产生 `Accepted(..., executionPolicy=IOC)`；
3. Ask 100 在限价内，按 maker price 100 成交 2；
4. taker 还剩 1，但下一档 Ask 101 超过 BUY limit 100；
5. 余量 1 不入簿，产生 `RemainderCanceled(..., canceledQuantityLots=1, IOC_REMAINDER)`；
6. orderId 20 进入 `CANCELED`，Ask 101 的 5 lot 保持原样。

完整事件 batch 是：

```text
Accepted(sequence=3, orderId=20, side=BUY,
         priceTicks=100, quantityLots=3, executionPolicy=IOC)
Trade(makerSequence=1, makerOrderId=10,
      takerSequence=3, takerOrderId=20,
      priceTicks=100, quantityLots=2)
RemainderCanceled(sequence=3, orderId=20, side=BUY,
                  priceTicks=100, canceledQuantityLots=1,
                  reason=IOC_REMAINDER)
```

数量分区必须在同一个命令边界闭合：

```text
originalQuantityLots
  = tradedQuantityLots
  + canceledQuantityLots
  = 2 + 1
```

若 quantity 改成 2，batch 只有 `Accepted → Trade`，订单进入 `FILLED`，不应伪造一个 canceled quantity 为 0 的事件。若盘口为空，batch 是 `Accepted → RemainderCanceled(全部数量)`；零成交不等于未接受。

## 余量取消是独立事件，不是普通 Cancel

M02 的 `Canceled` 表示一笔已经 `RESTING` 的活动订单被后续 Cancel 命令移出盘口。IOC 的正余量从未 RESTING，因此必须用另一种事实：

```java
record RemainderCanceled(
    AcceptanceSequence sequence,
    OrderId orderId,
    Side side,
    PriceTicks priceTicks,
    QuantityLots canceledQuantityLots,
    RemainderCancelReason reason)
    implements MatchingEvent {}

enum RemainderCancelReason {
  IOC_REMAINDER
}
```

两类事件的因果来源不同：

| 事件 | 触发者 | 之前是否 RESTING | 是否有独立 Cancel 命令 |
| --- | --- | --- | --- |
| `Canceled` | 后续 Cancel | 是 | 是 |
| `RemainderCanceled` | 当前 IOC place 的未成交余量 | 否 | 否 |

若把两者合并，事件消费者无法判断释放的是“曾经挂在盘口上的预占”还是“本次即时执行没有使用的余量”，也无法验证 IOC 从未进入 book。

事件 grammar 还要求 `RemainderCanceled` 必须是 batch 最后一项，且 sequence、orderId、side、price 与 Accepted 完全相同，取消量精确等于所有 Trade 后的 positive remaining。M04 的 `RemainderCancelReason` 只有 `IOC_REMAINDER` 一个非 null 成员：事件构造器先拒绝 null，batch grammar 再校验它确实是 `IOC_REMAINDER`。因此当前类型系统内无法构造“另一个非 null 错误 reason”；这项校验为未来扩展 enum 保持失败关闭。

## 实现只在共享匹配循环之后分叉

请求通过验证、duplicate 与策略准入后，engine 先建立 Accepted 身份，再复用原有 `match()`：

```java
List<MatchingEvent> events = new ArrayList<>();
events.add(accepted);

if (command.side() == Side.BUY) {
  match(taker, asks, events, true);
} else {
  match(taker, bids, events, false);
}
```

只有匹配完成仍有正余量时，IOC 才走独立终局：

```java
if (taker.remainingQuantityLots == 0) {
  taker.markFilled();
} else if (policy == ExecutionPolicy.IOC) {
  long canceledQuantityLots = taker.cancelAcceptedRemainder();
  events.add(
      new MatchingEvent.RemainderCanceled(
          taker.sequence,
          taker.orderId,
          taker.side,
          taker.priceTicks,
          new QuantityLots(canceledQuantityLots),
          RemainderCancelReason.IOC_REMAINDER));
} else {
  // FOK 与 GTC/POST_ONLY 在各自合同中处理。
}
```

`cancelAcceptedRemainder()` 应同时完成数量转移与终态迁移：

```text
remaining = positive
canceled += remaining
remaining = 0
lifecycle = CANCELED
```

状态改变和事件生成必须属于同一个串行 command apply。不要先返回 batch，再由后台任务修改 registry；否则故障窗口会出现事件声称已取消、内存身份仍是 ACCEPTED 的分裂真相。

## 晚到 Cancel 和重复 Place 由终态回答

上面的 orderId 20 已经 Accepted，因此身份永久存在。随后：

```text
Cancel(orderId=20)
  → CancelRejected(ORDER_ALREADY_CANCELED)

Place(orderId=20, 任意合法字段)
  → PlaceRejected(DUPLICATE_ORDER_ID)
```

若 IOC 完全成交，则晚到 Cancel 返回 `ORDER_ALREADY_FILLED`。这两种情况都不能退化成 `ORDER_NOT_FOUND`，也不能允许 ID 复用。

M04 故意只使用 M02 已有的 `FILLED/CANCELED` 终态，不新增一套“到期”生命周期。IOC 的语义是当前 place 命令内取消余量，而不是等待墙钟超时；把它放进另一个终态只会复制 duplicate、late Cancel 和 tombstone 规则。

## 四种错误实现会在不同观察面露馅

### 把 IOC 当成短命 GTC

先 `Rested`，再调用普通 Cancel，会让盘口和事件流短暂出现活动订单。若进程在两步之间崩溃，恢复后甚至可能留下本不该存在的挂单。

### 把 IOC 当成 FOK

只要不能全成就整体拒绝，会丢失限价内本来可以完成的部分成交。手算例中 2 lot Trade 会凭空消失。

### 吃穿 `priceTicks`

若循环在 IOC 分支里忽略 crossing 条件，BUY 100 会继续吃 Ask 101。最终全成看起来“更成功”，实则违反用户价格保护。

### 零成交时不占 orderId

IOC 已经 Accepted。若零成交后从 registry 删除身份，同 ID 可以再次 Place，晚到 Cancel 也会错误返回 `ORDER_NOT_FOUND`，破坏 M02 的不可逆生命周期。

## 练习：镜像 SELL 方向并证明最差价

准备盘口：

```text
Bid 100: orderId=1, sequence=1, remaining=2
Bid  99: orderId=2, sequence=2, remaining=5
```

提交 `SELL orderId=3 priceTicks=100 quantityLots=3 policy=IOC`，先不要运行代码，写出：

1. 完整 ordered events；
2. `original = traded + canceled` 的数值；
3. `bookAfter`；
4. 晚到 Cancel 的结果；
5. 把 limit 改为 99 后哪些事件会变化。

正确答案中，SELL 100 只能成交 Bid 100 的 2 lot，剩余 1 被 `IOC_REMAINDER` 取消，Bid 99 保持 5；晚到 Cancel 是 `ORDER_ALREADY_CANCELED`。改成 SELL 99 后，两档都在价格边界内，订单会按 100 再 99 的顺序成交满 3，并进入 FILLED，不产生余量事件。

把 BUY/SELL 两组写成镜像参数测试，并额外断言 Trade price 总是 maker price。只比较最终成交总量不足以发现顺序或价格错误。

## 本篇的可验证停止点

聚焦运行 IOC 的 production 测试：

```bash
./gradlew :matching-core:test \
  --tests '*SingleInstrumentExecutionPolicyTest.iocZeroFillIsAcceptedThenCanceledWithoutResting' \
  --tests '*SingleInstrumentExecutionPolicyTest.iocTradesAllAvailableLiquidityInsideItsLimitAndCancelsOnlyTheRemainder' \
  --tests '*SingleInstrumentExecutionPolicyTest.fullyFilledIocHasNoRemainderEvent' \
  --tests '*SingleInstrumentExecutionPolicyTest.sellIocAndPostOnlyMirrorBuyAcrossPartialCrossAndNonCrossingBoundaries' \
  --no-daemon
```

再运行 event grammar 聚焦测试。第一个方法直接构造 `IOC → Rested` 并证明该 batch 被拒绝，同时构造合法的 `IOC → RemainderCanceled` 作为对照；第二个方法分别构造“取消量不等于 Trade 后 remaining”和“`RemainderCanceled` 后仍有 Trade”，两者都必须失败关闭。

```bash
./gradlew :matching-core:test \
  --tests '*ExecutionBatchPolicyGrammarTest.iocRequiresItsPositiveRemainderToBeCanceledNotRested' \
  --tests '*ExecutionBatchPolicyGrammarTest.iocRemainderMustEqualTheUnfilledQuantityAndTerminateTheBatch' \
  --no-daemon
```

本篇阶段性 GREEN 只能说明 IOC 的 BUY/SELL 价格边界、数量分区、主要事件尾部和终态闭合。发布完成态还由 [`invariants.json`](/signal-grid-blog/practice/high-availability-cex/m04/evidence/reports/invariants.json)、八项变异体和 [M04 Matching Lab](/signal-grid-blog/practice/high-availability-cex/m04/lab/) 复核同一语义。下一篇将把 FOK 的关键动作放在 Accepted 之前：**只读扫描限价内全部真实流动性，足够才进入共享匹配循环，不足时任何 maker、identity 或 sequence 都不能改变。**
