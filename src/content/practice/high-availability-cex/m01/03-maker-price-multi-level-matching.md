---
title: "M01·03：按 Maker Price 连续吃穿多个价位"
description: "删除同价教学护栏，用一笔跨三档的 taker 完成价格优先撮合循环，并在固定 worked example 中核对逐 maker 成交、余量归宿、单次 Rested 与 BUY/SELL 镜像语义。"
date: 2026-08-27T15:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M01
lessonOrder: 30
permalink: maker-price-multi-level-matching
tags:
  - 撮合引擎
  - Maker Taker
  - 价格时间优先
draft: false
---

前两篇已经建立价格排序的盘口和同价 FIFO。已经停留在订单簿上的被动订单称为 maker；主动穿过对手价并触发成交的到达订单称为 taker。当双方限价恰好相等时称为 exact-touch，此时“成交价取 maker 还是 taker”无法被观察。一个错误实现即使永远写入 taker 限价，也能通过所有 exact-touch 测试。

本篇只证明一个命题：**一条 GTC taker 必须按对手盘的价格优先、同价 FIFO 连续执行；每个 resting maker 产生一条以其自身价格计价的正数量 `Trade`，taker 的正余量最终只以原接受序列产生一次 `Rested`。**

这会完成 M01 的 core 撮合循环，但不会让根 `m01Check` 变绿。冻结 scenario 的严格加载、独立期望、100 次 fresh replay、semantic mutant 与 evidence 属于下一篇，不应混入这段业务算法。

## 一笔三档订单同时暴露四种常见错误

先把下面四条命令手算一遍。前三笔都是 Ask，故意让最早接受的订单拥有最差价格：

| sequence | `orderId` | side | price | quantity |
| ---: | ---: | --- | ---: | ---: |
| 1 | 60 | SELL | 102 | 1 |
| 2 | 61 | SELL | 100 | 1 |
| 3 | 62 | SELL | 101 | 1 |
| 4 | 63 | BUY | 102 | 5 |

第四笔是 taker。正确 event batch 是：

```text
Accepted(sequence=4, orderId=63, side=BUY, priceTicks=102, quantityLots=5)
Trade(makerSequence=2, makerOrderId=61, takerSequence=4, takerOrderId=63, priceTicks=100, quantityLots=1)
Trade(makerSequence=3, makerOrderId=62, takerSequence=4, takerOrderId=63, priceTicks=101, quantityLots=1)
Trade(makerSequence=1, makerOrderId=60, takerSequence=4, takerOrderId=63, priceTicks=102, quantityLots=1)
Rested(sequence=4, orderId=63, side=BUY, priceTicks=102, remainingQuantityLots=2)
```

这个例子同时区分四条规则：

- 价格优先高于跨价位的时间优先，所以 sequence 2、3 先于 sequence 1；
- 每笔 Trade 使用当前 resting maker 的价格，不把三笔都写成 taker 限价 102；
- 三个 maker 各自产生一条 Trade，不能聚合为 `price=101, quantity=3` 之类的虚构成交；
- `5 = 1 + 1 + 1 + 2`，taker 余量只挂一次并保留 sequence 4。

执行后 Ask 为空，Bid 只剩 `102 × 2`。若旧 Ask 价位仍在、余量为零的订单仍在队列中，或同时留下 `bestBid >= bestAsk`，这批状态迁移就没有完成。

## 用不同的 maker 价格让临时护栏变红

继续承接前两篇从 [`course/m01-start`](https://github.com/lcha-reln/cex-matching/tree/course/m01-start) 演进出的工作树。上游 annotated [`course/m01-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m01-complete) 已作为答案坐标发布；现在仍不 checkout、不在练习仓库创建或移动它，也不拿终态结果替代本篇业务反例。

新增完整测试 `MakerPriceMultiLevelStepTest.java`：

```java
package io.github.lchareln.cex.matching;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigInteger;
import java.util.List;
import org.junit.jupiter.api.Test;

final class MakerPriceMultiLevelStepTest {
  @Test
  void aBuyTakerSweepsBetterPricesFirstAtEachMakerPriceThenRests() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
    engine.place(input(60, "SELL", 102, 1));
    engine.place(input(61, "SELL", 100, 1));
    engine.place(input(62, "SELL", 101, 1));

    ExecutionBatch batch = engine.place(input(63, "BUY", 102, 5));

    assertEquals(
        List.of(
            accepted(4, 63, Side.BUY, 102, 5),
            trade(2, 61, 4, 63, 100, 1),
            trade(3, 62, 4, 63, 101, 1),
            trade(1, 60, 4, 63, 102, 1),
            rested(4, 63, Side.BUY, 102, 2)),
        batch.events());
    assertTrue(batch.bookAfter().asks().isEmpty());
    assertEquals(List.of(102L), prices(batch.bookAfter().bids()));
    assertEquals(
        new QuantityLots(2),
        batch.bookAfter().bids().getFirst().orders().getFirst().remainingQuantityLots());
  }

  @Test
  void aFullyExecutedTakerHasNoRestedEvent() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
    engine.place(input(20, "SELL", 101, 3));

    ExecutionBatch batch = engine.place(input(21, "BUY", 102, 3));

    assertEquals(
        List.of(
            accepted(2, 21, Side.BUY, 102, 3),
            trade(1, 20, 2, 21, 101, 3)),
        batch.events());
    assertEquals(new OrderBookSnapshot(List.of(), List.of()), batch.bookAfter());
  }

  @Test
  void sellTakerMirrorsBuyAndConsumesHighestBidFirst() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
    engine.place(input(70, "BUY", 99, 1));
    engine.place(input(71, "BUY", 101, 2));

    ExecutionBatch batch = engine.place(input(72, "SELL", 99, 4));
    List<MatchingEvent.Trade> trades = trades(batch);

    assertEquals(List.of(71L, 70L), makerOrderIds(trades));
    assertEquals(List.of(101L, 99L), tradePrices(trades));
    MatchingEvent.Rested remainder =
        assertInstanceOf(MatchingEvent.Rested.class, batch.events().getLast());
    assertEquals(new AcceptanceSequence(3), remainder.sequence());
    assertEquals(new QuantityLots(1), remainder.remainingQuantityLots());
    assertTrue(batch.bookAfter().bids().isEmpty());
    assertEquals(List.of(99L), prices(batch.bookAfter().asks()));
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

  private static MatchingEvent.Accepted accepted(
      long sequence, long orderId, Side side, long priceTicks, long quantityLots) {
    return new MatchingEvent.Accepted(
        new AcceptanceSequence(sequence),
        new OrderId(orderId),
        side,
        new PriceTicks(priceTicks),
        new QuantityLots(quantityLots));
  }

  private static MatchingEvent.Trade trade(
      long makerSequence,
      long makerOrderId,
      long takerSequence,
      long takerOrderId,
      long priceTicks,
      long quantityLots) {
    return new MatchingEvent.Trade(
        new AcceptanceSequence(makerSequence),
        new OrderId(makerOrderId),
        new AcceptanceSequence(takerSequence),
        new OrderId(takerOrderId),
        new PriceTicks(priceTicks),
        new QuantityLots(quantityLots));
  }

  private static MatchingEvent.Rested rested(
      long sequence,
      long orderId,
      Side side,
      long priceTicks,
      long remainingQuantityLots) {
    return new MatchingEvent.Rested(
        new AcceptanceSequence(sequence),
        new OrderId(orderId),
        side,
        new PriceTicks(priceTicks),
        new QuantityLots(remainingQuantityLots));
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

  private static List<Long> tradePrices(List<MatchingEvent.Trade> trades) {
    return trades.stream().map(trade -> trade.priceTicks().value()).toList();
  }

  private static List<Long> prices(List<OrderBookSnapshot.PriceLevel> levels) {
    return levels.stream().map(level -> level.priceTicks().value()).toList();
  }
}
```

先运行这一篇的测试：

```bash
./gradlew :matching-core:test \
  --tests '*MakerPriceMultiLevelStepTest' \
  --no-daemon
```

它必须因 `different-price matching arrives in the next lesson` 而 RED。上一阶段显式拒绝了尚未证明的路径，所以订单簿不会在失败前被部分扣减。这盏红灯精确指出：同价 FIFO 已经存在，但不同价位还没有进入同一个完整状态迁移。

## 外层循环负责价位，内层队首负责时间

价格时间优先不需要把所有活动订单放进一个全局排序集合。两层结构已经分别拥有两个维度：

```text
oppositeSide.firstEntry()
  → 当前最佳价格
  → level.getFirst()
    → 该价格最早的活动 maker
```

BUY 的对手盘是升序 Ask，只要 `limit >= bestAsk` 就继续；SELL 的对手盘是降序 Bid，只要 `limit <= bestBid` 就继续。每次 maker 完全成交就移除队首，每个价位为空就移除 map entry，然后重新读取新的 `firstKey()`。

这意味着外层循环不能缓存“最初最佳价位”并一直使用，也不能先遍历所有价位后再统一删除。状态和下一次优先选择必须在每笔 Trade 后保持一致。

## 用完整撮合器替换阶段实现

现在完整替换 `SingleInstrumentMatchingEngine.java`，删除上一篇的 `requireSamePriceCrossingStep(...)`、`matchSamePrice(...)` 和更早的 `wouldCross(...)`。下面是本单元 core 的完整实现，不含省略分支：

```java
package io.github.lchareln.cex.matching;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.NavigableMap;
import java.util.Objects;
import java.util.TreeMap;

/** Single-writer, in-memory price-time matcher for the fixed M01 instrument. */
public final class SingleInstrumentMatchingEngine {
  private final PlaceLimitOrderValidator validator = new PlaceLimitOrderValidator();
  private final NavigableMap<Long, ArrayDeque<RestingOrder>> bids =
      new TreeMap<>(Collections.reverseOrder());
  private final NavigableMap<Long, ArrayDeque<RestingOrder>> asks = new TreeMap<>();

  private long nextAcceptanceSequence;

  public SingleInstrumentMatchingEngine() {
    this(1);
  }

  SingleInstrumentMatchingEngine(long nextAcceptanceSequence) {
    if (nextAcceptanceSequence <= 0) {
      throw new IllegalArgumentException("next acceptance sequence must be positive");
    }
    this.nextAcceptanceSequence = nextAcceptanceSequence;
  }

  /** Applies one command. The caller must serialize calls to this method. */
  public ExecutionBatch place(PlaceLimitOrderInput input) {
    Objects.requireNonNull(input, "input");
    ValidationResult validation = validator.validate(input);
    if (validation instanceof ValidationResult.Invalid invalid) {
      return new ExecutionBatch(List.of(new MatchingEvent.Rejected(invalid.code())), snapshot());
    }

    long sequenceValue = nextAcceptanceSequence;
    final long followingSequence;
    try {
      followingSequence = Math.incrementExact(sequenceValue);
    } catch (ArithmeticException exception) {
      throw new IllegalStateException(
          "acceptance sequence exhausted before state mutation", exception);
    }

    PlaceLimitOrder command = validator.normalize(input);
    AcceptanceSequence sequence = new AcceptanceSequence(sequenceValue);
    List<MatchingEvent> events = new ArrayList<>();
    events.add(
        new MatchingEvent.Accepted(
            sequence,
            command.orderId(),
            command.side(),
            command.priceTicks(),
            command.quantityLots()));

    long remaining = command.quantityLots().value();
    if (command.side() == Side.BUY) {
      remaining = match(command, sequence, remaining, asks, events, true);
    } else {
      remaining = match(command, sequence, remaining, bids, events, false);
    }

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

  /** Returns a detached immutable full-depth snapshot. */
  public OrderBookSnapshot snapshot() {
    return new OrderBookSnapshot(snapshotSide(bids, Side.BUY), snapshotSide(asks, Side.SELL));
  }

  private static long match(
      PlaceLimitOrder taker,
      AcceptanceSequence takerSequence,
      long initialRemaining,
      NavigableMap<Long, ArrayDeque<RestingOrder>> oppositeSide,
      List<MatchingEvent> events,
      boolean buying) {
    long remaining = initialRemaining;
    while (remaining > 0 && !oppositeSide.isEmpty()) {
      long makerPrice = oppositeSide.firstKey();
      boolean crosses =
          buying
              ? taker.priceTicks().value() >= makerPrice
              : taker.priceTicks().value() <= makerPrice;
      if (!crosses) {
        break;
      }

      ArrayDeque<RestingOrder> level = oppositeSide.firstEntry().getValue();
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
        if (level.isEmpty()) {
          oppositeSide.remove(makerPrice);
        }
      }
    }
    return remaining;
  }

  private static List<OrderBookSnapshot.PriceLevel> snapshotSide(
      NavigableMap<Long, ArrayDeque<RestingOrder>> side, Side sideName) {
    List<OrderBookSnapshot.PriceLevel> levels = new ArrayList<>(side.size());
    side.forEach(
        (price, orders) -> {
          List<OrderBookSnapshot.RestingOrderView> views = new ArrayList<>(orders.size());
          for (RestingOrder order : orders) {
            views.add(
                new OrderBookSnapshot.RestingOrderView(
                    order.sequence,
                    order.orderId,
                    new QuantityLots(order.remainingQuantityLots)));
          }
          levels.add(
              new OrderBookSnapshot.PriceLevel(
                  sideName, new PriceTicks(price), List.copyOf(views)));
        });
    return List.copyOf(levels);
  }

  private static final class RestingOrder {
    private final AcceptanceSequence sequence;
    private final OrderId orderId;
    private long remainingQuantityLots;

    private RestingOrder(
        AcceptanceSequence sequence, OrderId orderId, long remainingQuantityLots) {
      this.sequence = sequence;
      this.orderId = orderId;
      this.remainingQuantityLots = remainingQuantityLots;
    }
  }
}
```

成交价来自循环刚选中的 `makerPrice`。不能用 `taker.priceTicks()`，也不能用某个批末统一价；否则 taker 的价格保护与真实 execution price 会混成一个字段。

`traded = min(takerRemaining, makerRemaining)` 保证每笔 Trade 为正，因为循环只处理两个正余量。两个减法都不会下溢。批内更一般的数量守恒仍需要用任意精度求和验证，留给下一篇 testkit 做独立检查，不能把“这段代码看起来对”当作证明。

## 让 worked example 和镜像变体一起转绿

运行三篇累积的 core 测试：

```bash
./gradlew :matching-core:spotlessApply --no-daemon

./gradlew :matching-core:test \
  --tests '*PricePriorityOrderBookStepTest' \
  --tests '*FifoAcceptanceSequenceStepTest' \
  --tests '*MakerPriceMultiLevelStepTest' \
  --no-daemon

./gradlew :matching-core:check --no-daemon
```

第一条命令应用仓库冻结的 formatter；第二条证明教学切片没有互相破坏；第三条执行格式检查和全部 core 单元测试。重点不是“3 个测试类通过”，而是这些可区分的观察同时成立：

| 错误实现 | 哪个观察会失败 |
| --- | --- |
| 跨价位仍按 sequence | sequence 1 的 102 会错误地先于 sequence 2 的 100 |
| 所有成交写 taker price | 前两笔 Trade 会错误地写成 102 |
| 同价使用 LIFO | 上一篇反向订单号场景的 maker sequence 变成 3、2、1 |
| 跳过首个 maker | 第一笔预期 Trade 缺失，数量与盘口同时不一致 |
| 每个价位后都挂一次 taker | batch 出现多个 `Rested`，且可能留下交叉盘口 |
| 只实现 BUY taker | SELL 镜像场景不会先吃 101 的最高 Bid |

这些是业务反例，还不是完整 deterministic judge。下一篇要把它们交给冻结 scenario 的独立期望，并要求指定错误只能以 `STUDENT_FAILURE` 被杀死；候选抛异常不能冒充证明。

## Core 已能撮合，但 M01 还没有获得完成身份

到这里，单写者内存 core 已经能处理固定 `BTC-USDT` 的 GTC 限价单：价格优先、同价 FIFO、maker price、部分成交、完全成交、多档连续吃单和余量挂单都有可运行例子。它仍明确不包含：

- 撤单、改单、订单 ID 索引、重复命令处理或幂等；
- IOC、FOK、Post-only、市价单、STP、市场状态或价格带；
- 账户、资产、仓位、手续费、结算和交易前风控；
- WAL、持久化快照/checkpoint、数据库、网络、线程、Aeron、性能或高可用保证。

此时仍不要运行起点版根 `m01Check`。它会先执行完整的旧 testkit，而 M00 已冻结的“无订单簿”架构测试与现在的合法 M01 core 必然冲突；看到旧 `check.json` 里的 `GOAL_NOT_IMPLEMENTED` 也不能证明当前状态。原因不是 core 没有示例，而是课程还缺独立 oracle、canonical history、100 次 fresh replay、数量与盘口不变量、三个 semantic mutant、架构报告和可发布 evidence。不要修改 v1 起点报告来伪造 `PASS`，也不要在自己的练习仓库创建或移动上游只读的 `course/m01-complete`。

本篇停止点是一台**可运行但尚未被完整裁判证明**的单交易对 GTC 内存撮合器。下一篇才回答“我们如何知道这些示例不是碰巧通过”，并把 M01 从局部 GREEN 收敛为可核验的单元结果。
