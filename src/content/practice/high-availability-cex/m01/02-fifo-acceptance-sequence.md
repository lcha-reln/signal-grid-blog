---
title: "M01·02：用接受序列证明同价 FIFO"
description: "让有效命令才消耗单写者接受序列，以反向订单号和部分成交反例证明同一价位严格按接受顺序执行，而不是按时间戳或 orderId 排序。"
date: 2026-08-27T14:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M01
lessonOrder: 20
permalink: fifo-acceptance-sequence
tags:
  - 撮合引擎
  - FIFO
  - 确定性
draft: false
---

上一篇已经让非交叉限价单进入按价格排序的内存订单簿，但 `ArrayDeque` 本身不能证明时间优先。若订单号碰巧递增，按 `orderId` 排序、按到达顺序入队和真正的接受顺序都会给出同一个结果；一组全绿测试仍可能没有区分三种实现。

本篇只证明一个命题：**合法命令才由单写者分配严格递增的 `AcceptanceSequence`；同一价位的 maker（已经停留在订单簿上的被动订单）必须按该序列 FIFO 执行，部分成交后的 maker 仍保留原序列和队首位置。主动穿过对手价、触发成交的到达订单称为 taker。**

本篇只解开“同一价格”的成交路径。不同价格的交叉命令继续在任何状态变化前显式失败，下一篇才移除这个教学护栏并证明 maker price 与连续吃单。

## `orderId` 和时间戳都不是时间优先事实

先看三个同价 Ask，按以下顺序被撮合器接受：

| 接受顺序 | `orderId` | `priceTicks` | `quantityLots` |
| ---: | ---: | ---: | ---: |
| 1 | 42 | 100 | 1 |
| 2 | 7 | 100 | 1 |
| 3 | 21 | 100 | 1 |

随后一笔 `BUY 100 × 3` 到达。正确 maker 顺序必须是 `42 → 7 → 21`。如果结果是 `7 → 21 → 42`，实现按订单号排序；如果结果依赖 wall clock 的纳秒值、机器调度或测试执行速度，就无法确定重放。

M01 把“时间”压缩为单写者状态机内的一项事实：

```text
nextAcceptanceSequence = 1

M00 INVALID → Rejected                         → next 仍为 1
VALID #42    → Accepted(sequence=1), Rested    → next 变为 2
VALID #7     → Accepted(sequence=2), Rested    → next 变为 3
VALID #21    → Accepted(sequence=3), Rested    → next 变为 4
VALID taker  → Accepted(sequence=4), Trade × 3 → next 变为 5
```

这里没有 `Instant.now()`，没有 `System.nanoTime()`，也不接受调用者提供“可信时间”。调用者只负责串行调用 `place`；撮合器自己拥有序列。

## 承接上一篇的工作树，而不是跳到完成态

继续使用从 [`course/m01-start`](https://github.com/lcha-reln/cex-matching/tree/course/m01-start) 建立的 `unit/m01` 分支，并保留上一篇已经新增的语义值、价位 map 和聚焦测试：

```bash
test "$(git merge-base HEAD course/m01-start)" \
  = "44602f4c53b7726b8f207f16852a724d1d5204be"

./gradlew :matching-core:test \
  --tests '*PricePriorityOrderBookStepTest' \
  --no-daemon
```

第一条检查确认练习历史确实从固定起点分叉；它不要求当前 `HEAD` 仍等于起点。上游已经发布的 [`course/m01-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m01-complete) 是只读答案坐标，本篇不 checkout、不在自己的仓库重建或移动它，也不用终态源码跳过当前红灯。

开始前先回答三个问题：

1. 一条 `priceTicks = 0` 的输入之后，第一条合法命令的 sequence 是 1 还是 2？
2. maker 被部分成交后，是获得新 sequence，还是保留原 sequence？
3. sequence 已到 `Long.MAX_VALUE` 时，能否先挂单、再在返回前报告溢出？

答案是：1、保留、不能。无效输入没有进入状态机；修改余量不是重新接受；序列耗尽必须在任何订单簿修改之前失败。

## 用反向订单号制造第一盏 FIFO 红灯

上一篇的临时实现遇到任何交叉命令都会抛出 `UnsupportedOperationException`。新增完整测试 `FifoAcceptanceSequenceStepTest.java`：

```java
package io.github.lchareln.cex.matching;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigInteger;
import java.util.List;
import org.junit.jupiter.api.Test;

final class FifoAcceptanceSequenceStepTest {
  @Test
  void invalidInputDoesNotConsumeAcceptanceSequence() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();

    ExecutionBatch rejected = engine.place(input(1, "BUY", 0, 2));
    ExecutionBatch accepted = engine.place(input(2, "SELL", 100, 2));

    assertEquals(
        List.of(new MatchingEvent.Rejected(ValidationCode.INVALID_PRICE)),
        rejected.events());
    MatchingEvent.Accepted first =
        assertInstanceOf(MatchingEvent.Accepted.class, accepted.events().getFirst());
    assertEquals(new AcceptanceSequence(1), first.sequence());
  }

  @Test
  void samePriceMakersFollowAcceptanceOrderRatherThanOrderId() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
    engine.place(input(42, "SELL", 100, 1));
    engine.place(input(7, "SELL", 100, 1));
    engine.place(input(21, "SELL", 100, 1));

    ExecutionBatch batch = engine.place(input(99, "BUY", 100, 3));
    List<MatchingEvent.Trade> trades = trades(batch);

    assertEquals(List.of(42L, 7L, 21L), makerOrderIds(trades));
    assertEquals(List.of(1L, 2L, 3L), makerSequences(trades));
    assertTrue(batch.bookAfter().asks().isEmpty());
  }

  @Test
  void aPartiallyFilledMakerKeepsItsOriginalSequenceAtTheHead() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
    engine.place(input(50, "SELL", 100, 5));
    engine.place(input(51, "SELL", 100, 4));

    ExecutionBatch batch = engine.place(input(52, "BUY", 100, 2));
    OrderBookSnapshot.RestingOrderView head =
        batch.bookAfter().asks().getFirst().orders().getFirst();

    assertEquals(new AcceptanceSequence(1), head.sequence());
    assertEquals(new OrderId(50), head.orderId());
    assertEquals(new QuantityLots(3), head.remainingQuantityLots());
  }

  @Test
  void sequenceExhaustionFailsBeforeStateMutation() {
    SingleInstrumentMatchingEngine engine =
        new SingleInstrumentMatchingEngine(Long.MAX_VALUE);
    OrderBookSnapshot before = engine.snapshot();

    IllegalStateException failure =
        assertThrows(
            IllegalStateException.class,
            () -> engine.place(input(90, "SELL", 100, 1)));

    assertTrue(failure.getMessage().contains("before state mutation"));
    assertEquals(before, engine.snapshot());
  }

  private static PlaceLimitOrderInput input(
      long orderId, String side, long priceTicks, long quantityLots) {
    return new PlaceLimitOrderInput(
        "BTC-USDT",
        BigInteger.valueOf(orderId),
        side,
        BigInteger.valueOf(priceTicks),
        BigInteger.valueOf(quantityLots));
  }

  private static List<MatchingEvent.Trade> trades(ExecutionBatch batch) {
    return batch.events().stream()
        .filter(MatchingEvent.Trade.class::isInstance)
        .map(MatchingEvent.Trade.class::cast)
        .toList();
  }

  private static List<Long> makerOrderIds(List<MatchingEvent.Trade> trades) {
    return trades.stream().map(trade -> trade.makerOrderId().value()).toList();
  }

  private static List<Long> makerSequences(List<MatchingEvent.Trade> trades) {
    return trades.stream().map(trade -> trade.makerSequence().value()).toList();
  }
}
```

运行：

```bash
./gradlew :matching-core:test \
  --tests '*FifoAcceptanceSequenceStepTest' \
  --no-daemon
```

第一项与溢出项可能已经 GREEN；两项交叉测试必须因上一篇的显式护栏而 RED。这样的混合结果有诊断价值：序列分配边界已经存在，尚缺的是同价 maker 队列迁移，而不是整个 core 都不可运行。

## 在状态修改之前分配并预留序列

合法命令不能直接执行 `nextAcceptanceSequence++`。当当前值为 `Long.MAX_VALUE` 时，后缀自增会先给本次命令一个貌似合法的 sequence，再把 next 溢出成负数；订单簿可能已经改变。

安全顺序是：

```java
long sequenceValue = nextAcceptanceSequence;
final long followingSequence;
try {
  followingSequence = Math.incrementExact(sequenceValue);
} catch (ArithmeticException exception) {
  throw new IllegalStateException(
      "acceptance sequence exhausted before state mutation", exception);
}
```

只有 `followingSequence` 成功算出，才允许创建 `Accepted`、扣减 maker 或追加余量；整批完成后再把字段推进到它。无效输入甚至不会执行这段代码。

这不是持久化事务，也没有解决进程崩溃。它只关闭同一个同步方法内可预见的算术失败路径；WAL、恢复和复制仍然不属于 M01。

## 用队首完成同价 FIFO，而不是重新排序

保留上一篇 `SingleInstrumentMatchingEngine` 的字段、构造器、`snapshot()`、`snapshotSide(...)` 和内部 `RestingOrder`。用下面的完整 `place(...)` 替换原方法，并新增两个 helper。

`requireSamePriceCrossingStep(...)` 是本篇的临时支架：它在任何状态修改之前拒绝“可成交但 maker 价不同于 taker 限价”的命令。这样我们只证明同价 FIFO，不用一个半完成的多价位循环污染状态。下一篇会删除它。

```java
public ExecutionBatch place(PlaceLimitOrderInput input) {
  Objects.requireNonNull(input, "input");
  ValidationResult validation = validator.validate(input);
  if (validation instanceof ValidationResult.Invalid invalid) {
    return new ExecutionBatch(List.of(new MatchingEvent.Rejected(invalid.code())), snapshot());
  }

  PlaceLimitOrder command = validator.normalize(input);
  NavigableMap<Long, ArrayDeque<RestingOrder>> oppositeSide =
      command.side() == Side.BUY ? asks : bids;
  requireSamePriceCrossingStep(command, oppositeSide);

  long sequenceValue = nextAcceptanceSequence;
  final long followingSequence;
  try {
    followingSequence = Math.incrementExact(sequenceValue);
  } catch (ArithmeticException exception) {
    throw new IllegalStateException(
        "acceptance sequence exhausted before state mutation", exception);
  }

  AcceptanceSequence sequence = new AcceptanceSequence(sequenceValue);
  List<MatchingEvent> events = new ArrayList<>();
  events.add(
      new MatchingEvent.Accepted(
          sequence,
          command.orderId(),
          command.side(),
          command.priceTicks(),
          command.quantityLots()));

  long remaining =
      matchSamePrice(
          command,
          sequence,
          command.quantityLots().value(),
          oppositeSide,
          events);

  if (remaining > 0) {
    NavigableMap<Long, ArrayDeque<RestingOrder>> ownSide =
        command.side() == Side.BUY ? bids : asks;
    ownSide
        .computeIfAbsent(command.priceTicks().value(), ignored -> new ArrayDeque<>())
        .addLast(new RestingOrder(sequence, command.orderId(), remaining));
    events.add(
        new MatchingEvent.Rested(
            sequence,
            command.orderId(),
            command.side(),
            command.priceTicks(),
            new QuantityLots(remaining)));
  }

  nextAcceptanceSequence = followingSequence;
  return new ExecutionBatch(events, snapshot());
}

private static void requireSamePriceCrossingStep(
    PlaceLimitOrder taker,
    NavigableMap<Long, ArrayDeque<RestingOrder>> oppositeSide) {
  for (long makerPrice : oppositeSide.navigableKeySet()) {
    boolean crosses =
        taker.side() == Side.BUY
            ? taker.priceTicks().value() >= makerPrice
            : taker.priceTicks().value() <= makerPrice;
    if (!crosses) {
      return;
    }
    if (makerPrice != taker.priceTicks().value()) {
      throw new UnsupportedOperationException(
          "different-price matching arrives in the next lesson");
    }
  }
}

private static long matchSamePrice(
    PlaceLimitOrder taker,
    AcceptanceSequence takerSequence,
    long initialRemaining,
    NavigableMap<Long, ArrayDeque<RestingOrder>> oppositeSide,
    List<MatchingEvent> events) {
  if (oppositeSide.isEmpty()
      || oppositeSide.firstKey().longValue() != taker.priceTicks().value()) {
    return initialRemaining;
  }

  long makerPrice = oppositeSide.firstKey();
  ArrayDeque<RestingOrder> level = oppositeSide.firstEntry().getValue();
  long remaining = initialRemaining;
  while (remaining > 0 && !level.isEmpty()) {
    RestingOrder maker = level.getFirst();
    long traded = Math.min(remaining, maker.remainingQuantityLots);
    remaining -= traded;
    maker.remainingQuantityLots -= traded;
    events.add(
        new MatchingEvent.Trade(
            maker.sequence,
            maker.orderId,
            takerSequence,
            taker.orderId(),
            new PriceTicks(makerPrice),
            new QuantityLots(traded)));

    if (maker.remainingQuantityLots == 0) {
      level.removeFirst();
    }
  }
  if (level.isEmpty()) {
    oppositeSide.remove(makerPrice);
  }
  return remaining;
}
```

这段代码没有对队列调用 `sort`。`addLast` 冻结接受顺序，`getFirst` 只观察最老的活动 maker，`removeFirst` 只移除已经完全成交的队首。部分成交时不 remove、不重新入队，因此原 maker 自然保留原 sequence 和队首位置。

## 逐项读取 GREEN，而不是只看测试总数

重新运行前两篇的聚焦测试：

```bash
./gradlew :matching-core:test \
  --tests '*PricePriorityOrderBookStepTest' \
  --tests '*FifoAcceptanceSequenceStepTest' \
  --no-daemon
```

四类观察必须同时成立：

| 证明 | 精确观察 |
| --- | --- |
| 无效输入无序列副作用 | 拒单后的第一条 `Accepted.sequence = 1` |
| 同价 FIFO | maker order ID 为 `42, 7, 21`，sequence 为 `1, 2, 3` |
| maker 部分成交 | `orderId=50` 仍在队首，sequence 仍为 1，余量为 3 |
| 序列耗尽 | 抛错且 `snapshot()` 与调用前完全相同 |

只断言 maker ID 顺序仍不够；同时断言 sequence 可以证明测试没有靠反向 ID 恰巧得到答案。只断言剩余数量也不够；maker 若被移到队尾，下一笔 taker 的执行顺序仍会错。

## 本篇停止在同价成交，不解释不同价格的成交价

此时，同一价格内的接受顺序已经成为可观察业务事实，部分成交也不会让 maker 失去年龄。我们仍没有证明：

- 更优价格是否一定先于更早但更差的价格；
- 限价 102 的 taker 吃掉 100、101、102 三档时，每笔 Trade 应记录哪个价格；
- 一个 taker 跨多档后还有余量时，是否只产生一次 `Rested`；
- BUY 与 SELL 是否使用镜像的交叉条件。

起点版根 `m01Check` 此时仍不能表达 M01 进度：它会先撞上 M00 已冻结的“无订单簿”架构测试，甚至不会运行 M01 起点 runner。继续只运行前两篇的聚焦 core 测试，不要把旧的 `GOAL_NOT_IMPLEMENTED` 报告当作本篇结果，也不要为追求提前全绿而修改冻结 fixture、删除不同价格场景，或把临时护栏说成产品拒绝规则。

下一篇会用一笔完整 worked example 删除护栏，把同价队列扩展为真正的价格时间优先循环；第四篇才替换根裁判。
