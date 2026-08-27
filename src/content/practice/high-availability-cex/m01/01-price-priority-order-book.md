---
title: "M01·01：让限价单第一次改变价格优先订单簿"
description: "从 M01 不可移动起点出发，建立不可变事件与盘口语义，让通过 M00 验证的非交叉 GTC 限价单按 Bid 降序、Ask 升序确定地进入内存订单簿。"
date: 2026-08-27T14:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M01
lessonOrder: 10
permalink: price-priority-order-book
tags:
  - 撮合引擎
  - 订单簿
  - Java
draft: false
---

M00 结束在 `VALID`：它证明一条候选输入能够被确定地拒绝，或者规范化为 `PlaceLimitOrder`，却故意没有保存订单。若我们现在直接写成交循环，价格排序、事件顺序、盘口所有权和剩余数量会同时进入同一段可变代码，第一盏红灯将无法指出究竟哪一层错了。

本篇只证明一个命题：**一条通过 M00 验证、且当前不会交叉的 GTC（Good-Til-Cancelled，未成交余量持续留在订单簿）限价单，必须先产生 `Accepted`，再以同一个接受序列产生 `Rested`，并进入一个 Bid（买方报价）价格降序、Ask（卖方报价）价格升序的不可变盘口快照。**

“不会交叉”是本篇的教学边界，不是 M01 最终产品边界。跨价成交、同价 FIFO 和部分成交将在后两篇逐步替换临时护栏；本篇结束时只用聚焦的 core 测试判断进度，第四篇才会安装能解释完整 M01 结果的根裁判。

## 先把起点身份和预期红灯钉死

M01 的唯一练习起点是 annotated tag [`course/m01-start`](https://github.com/lcha-reln/cex-matching/tree/course/m01-start)。从全新 clone 建立自己的练习分支：

```bash
git clone https://github.com/lcha-reln/cex-matching.git
cd cex-matching
git switch -c unit/m01 course/m01-start

test "$(git rev-parse HEAD)" \
  = "44602f4c53b7726b8f207f16852a724d1d5204be"
git cat-file -t course/m01-start
```

最后一条命令必须输出 `tag`，而不是 `commit`。随后复现一绿一红的起点：

```bash
./gradlew clean build --no-daemon
./gradlew m01Check --no-daemon
```

预期结果是：

| 观察 | 必须满足 |
| --- | --- |
| `clean build` | 退出码 `0` |
| `m01Check` | 非 `0` |
| `build/reports/m01/check.json` | `schemaVersion = matching.m01.check.v1` |
| 同一报告 | `status = GOAL_NOT_IMPLEMENTED` |
| frozen corpus | 8 个 scenario、22 条 command |
| fixture SHA-256 | `d050bc2fc029e3ac0afb5047e3030412412f3a7aecf0938a19a5953618ff9ed7` |

安装了 `jq` 时，可以额外审计报告，但 `jq` 不是课程构建依赖：

```bash
jq -e '
  .schemaVersion == "matching.m01.check.v1" and
  .unit == "M01" and
  .status == "GOAL_NOT_IMPLEMENTED" and
  .scenarioCorpus.scenarios == 8
' build/reports/m01/check.json
```

编译失败、fixture 无法解析或没有结构化报告，都不是合格红灯。公开课程已经把最终答案冻结在 annotated tag [`course/m01-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m01-complete)，但本篇只从起点演进：不要提前 checkout 完成点来替代练习，也不要创建或移动同名 tag。第四篇才会把你的工作树与这个只读坐标逐项对照。

## 先预测状态迁移，再选数据结构

考虑四条都通过 M00 验证、按表中顺序到达的命令：

| 到达顺序 | 方向 | 价格 | 数量 | 此刻是否交叉 |
| --- | --- | ---: | ---: | --- |
| 1 | BUY | 99 | 2 | 否 |
| 2 | BUY | 100 | 3 | 否 |
| 3 | SELL | 102 | 4 | 否 |
| 4 | SELL | 101 | 5 | 否 |

先写下你预测的最终价位顺序。正确答案是：

```text
bids: 100 → 99
asks: 101 → 102
```

到达顺序不能决定跨价位执行顺序。买方愿意支付更高价格的订单先执行，因此 Bid 用降序；卖方要价更低的订单先执行，因此 Ask 用升序。Java 中最小而明确的表示是两棵 `NavigableMap`：

```java
private final NavigableMap<Long, ArrayDeque<RestingOrder>> bids =
    new TreeMap<>(Collections.reverseOrder());
private final NavigableMap<Long, ArrayDeque<RestingOrder>> asks = new TreeMap<>();
```

map 的 key 是 `priceTicks`，value 是一个价位内的队列。队列在本篇只有一个职责：保留到达顺序；它还没有证明同价 FIFO。不要增加 `Map<OrderId, ...>`。M01 场景中的订单号彼此不同，但重复 ID、撤单和按 ID 寻址都没有定义，提前建立订单索引会把 M02 的生命周期问题偷渡进来。

## 事件和快照先成为不可变语义值

内部容器必然可变，但从一次命令返回的事实不能继续跟着订单簿变化。M01 因此把返回边界冻结为：

```text
ExecutionBatch
├── events: Rejected | Accepted → Trade* → Rested?
└── bookAfter: 完整、不可变、按执行优先级排序的盘口快照
```

这里会一次性抄入后续步骤需要的完整公开类型，这是为了让四篇文章共享同一套冻结 API，不是要求你现在同时学会全部撮合语义。本篇只解释 `Rejected`、`Accepted`、`Rested` 和跨价位价格排序；`Trade` 中的 maker（已在簿上的被动订单）/taker（主动穿价的到达订单）、同价 FIFO 以及批内数量守恒，分别留到第二、三、四篇。先把它们当作经过编译器约束的脚手架，不要提前为这些字段增加算法。

先新增 `AcceptanceSequence.java`。它是单写者分配的内存时间优先身份，不是订单号、时间戳、Raft log position 或公开事件序号：

```java
package io.github.lchareln.cex.matching;

/** In-memory acceptance order used only for price-time priority. */
public record AcceptanceSequence(long value) {
  public AcceptanceSequence {
    if (value <= 0) {
      throw new IllegalArgumentException("acceptance sequence must be positive");
    }
  }
}
```

再完整建立 `MatchingEvent.java`。正数量由 M00 的 `QuantityLots` 值对象守住，拒绝码与字段也不能彼此矛盾：

```java
package io.github.lchareln.cex.matching;

import java.util.Objects;

/** Ordered business events emitted for one M01 place command. */
public sealed interface MatchingEvent
    permits MatchingEvent.Rejected,
        MatchingEvent.Accepted,
        MatchingEvent.Trade,
        MatchingEvent.Rested {

  record Rejected(ValidationCode code, String field) implements MatchingEvent {
    public Rejected {
      Objects.requireNonNull(code, "code");
      Objects.requireNonNull(field, "field");
      if (!code.field().equals(field)) {
        throw new IllegalArgumentException("validation code and field do not match");
      }
    }

    public Rejected(ValidationCode code) {
      this(code, code.field());
    }
  }

  record Accepted(
      AcceptanceSequence sequence,
      OrderId orderId,
      Side side,
      PriceTicks priceTicks,
      QuantityLots quantityLots)
      implements MatchingEvent {
    public Accepted {
      Objects.requireNonNull(sequence, "sequence");
      Objects.requireNonNull(orderId, "orderId");
      Objects.requireNonNull(side, "side");
      Objects.requireNonNull(priceTicks, "priceTicks");
      Objects.requireNonNull(quantityLots, "quantityLots");
    }
  }

  record Trade(
      AcceptanceSequence makerSequence,
      OrderId makerOrderId,
      AcceptanceSequence takerSequence,
      OrderId takerOrderId,
      PriceTicks priceTicks,
      QuantityLots quantityLots)
      implements MatchingEvent {
    public Trade {
      Objects.requireNonNull(makerSequence, "makerSequence");
      Objects.requireNonNull(makerOrderId, "makerOrderId");
      Objects.requireNonNull(takerSequence, "takerSequence");
      Objects.requireNonNull(takerOrderId, "takerOrderId");
      Objects.requireNonNull(priceTicks, "priceTicks");
      Objects.requireNonNull(quantityLots, "quantityLots");
    }
  }

  record Rested(
      AcceptanceSequence sequence,
      OrderId orderId,
      Side side,
      PriceTicks priceTicks,
      QuantityLots remainingQuantityLots)
      implements MatchingEvent {
    public Rested {
      Objects.requireNonNull(sequence, "sequence");
      Objects.requireNonNull(orderId, "orderId");
      Objects.requireNonNull(side, "side");
      Objects.requireNonNull(priceTicks, "priceTicks");
      Objects.requireNonNull(remainingQuantityLots, "remainingQuantityLots");
    }
  }
}
```

`OrderBookSnapshot.java` 在构造时复制每层 list，并拒绝空价位、错边、乱序、非 FIFO 队列以及批末交叉盘口。这样错误不会被一个“看起来正常”的 DTO 带出 core：

```java
package io.github.lchareln.cex.matching;

import java.util.List;
import java.util.Objects;

/** Immutable full-depth M01 book view in execution-priority order. */
public record OrderBookSnapshot(List<PriceLevel> bids, List<PriceLevel> asks) {
  public OrderBookSnapshot {
    bids = List.copyOf(bids);
    asks = List.copyOf(asks);
    validateLevels(bids, Side.BUY, true);
    validateLevels(asks, Side.SELL, false);
    if (!bids.isEmpty()
        && !asks.isEmpty()
        && bids.getFirst().priceTicks().value() >= asks.getFirst().priceTicks().value()) {
      throw new IllegalArgumentException("snapshot must not contain a crossed book");
    }
  }

  private static void validateLevels(List<PriceLevel> levels, Side side, boolean descending) {
    long previousPrice = 0;
    boolean first = true;
    for (PriceLevel level : levels) {
      Objects.requireNonNull(level, "level");
      if (level.side() != side) {
        throw new IllegalArgumentException("price level is on the wrong side");
      }
      long price = level.priceTicks().value();
      if (!first
          && ((descending && price >= previousPrice) || (!descending && price <= previousPrice))) {
        throw new IllegalArgumentException("price levels are not in strict book order");
      }
      previousPrice = price;
      first = false;
    }
  }

  public record PriceLevel(Side side, PriceTicks priceTicks, List<RestingOrderView> orders) {
    public PriceLevel {
      Objects.requireNonNull(side, "side");
      Objects.requireNonNull(priceTicks, "priceTicks");
      orders = List.copyOf(orders);
      if (orders.isEmpty()) {
        throw new IllegalArgumentException("price level must not be empty");
      }
      long previousSequence = 0;
      for (RestingOrderView order : orders) {
        Objects.requireNonNull(order, "order");
        if (order.sequence().value() <= previousSequence) {
          throw new IllegalArgumentException("price level is not FIFO by acceptance sequence");
        }
        previousSequence = order.sequence().value();
      }
    }
  }

  public record RestingOrderView(
      AcceptanceSequence sequence, OrderId orderId, QuantityLots remainingQuantityLots) {
    public RestingOrderView {
      Objects.requireNonNull(sequence, "sequence");
      Objects.requireNonNull(orderId, "orderId");
      Objects.requireNonNull(remainingQuantityLots, "remainingQuantityLots");
    }
  }
}
```

最后用 `ExecutionBatch.java` 守住事件语法。它不负责证明订单簿算法正确，但会阻止空 batch、`Rejected` 混入其他事件、错误 taker、超量成交和有余量却遗漏 `Rested`：

```java
package io.github.lchareln.cex.matching;

import java.math.BigInteger;
import java.util.List;
import java.util.Objects;

/** Immutable ordered events and the complete book snapshot after one command. */
public record ExecutionBatch(List<MatchingEvent> events, OrderBookSnapshot bookAfter) {
  public ExecutionBatch {
    events = List.copyOf(events);
    Objects.requireNonNull(bookAfter, "bookAfter");
    validateGrammar(events);
  }

  private static void validateGrammar(List<MatchingEvent> events) {
    if (events.isEmpty()) {
      throw new IllegalArgumentException("execution batch must contain at least one event");
    }
    MatchingEvent first = events.getFirst();
    if (first instanceof MatchingEvent.Rejected) {
      if (events.size() != 1) {
        throw new IllegalArgumentException("a rejected batch must contain exactly one event");
      }
      return;
    }
    if (!(first instanceof MatchingEvent.Accepted accepted)) {
      throw new IllegalArgumentException("a valid batch must start with Accepted");
    }
    BigInteger remaining = BigInteger.valueOf(accepted.quantityLots().value());
    boolean restedSeen = false;
    for (int index = 1; index < events.size(); index++) {
      MatchingEvent event = events.get(index);
      if (event instanceof MatchingEvent.Trade trade) {
        if (!trade.takerSequence().equals(accepted.sequence())
            || !trade.takerOrderId().equals(accepted.orderId())) {
          throw new IllegalArgumentException("trade taker must be the accepted order");
        }
        remaining = remaining.subtract(BigInteger.valueOf(trade.quantityLots().value()));
        if (remaining.signum() < 0) {
          throw new IllegalArgumentException("trade quantity exceeds the accepted quantity");
        }
      } else if (event instanceof MatchingEvent.Rested rested) {
        if (index != events.size() - 1) {
          throw new IllegalArgumentException("Rested must be the final event");
        }
        if (!rested.sequence().equals(accepted.sequence())
            || !rested.orderId().equals(accepted.orderId())
            || rested.side() != accepted.side()
            || !rested.priceTicks().equals(accepted.priceTicks())
            || !remaining.equals(BigInteger.valueOf(rested.remainingQuantityLots().value()))) {
          throw new IllegalArgumentException("resting remainder must belong to the accepted order");
        }
        restedSeen = true;
      } else {
        throw new IllegalArgumentException("only Trade or final Rested may follow Accepted");
      }
    }
    if (remaining.signum() > 0 && !restedSeen) {
      throw new IllegalArgumentException("a positive taker remainder must emit Rested");
    }
  }
}
```

这里使用 `BigInteger` 只做 batch 内求和，避免多个合法 `long` 数量相加时溢出。订单自身仍使用 M00 已冻结的正 `long` 值对象。

## 用可编译骨架制造业务红灯

在写 map 之前，先建立一个只返回空快照、对有效命令明确报未实现的 `SingleInstrumentMatchingEngine.java`：

```java
package io.github.lchareln.cex.matching;

import java.util.List;
import java.util.Objects;

public final class SingleInstrumentMatchingEngine {
  private final PlaceLimitOrderValidator validator = new PlaceLimitOrderValidator();

  public ExecutionBatch place(PlaceLimitOrderInput input) {
    Objects.requireNonNull(input, "input");
    ValidationResult validation = validator.validate(input);
    if (validation instanceof ValidationResult.Invalid invalid) {
      return new ExecutionBatch(List.of(new MatchingEvent.Rejected(invalid.code())), snapshot());
    }
    throw new UnsupportedOperationException("price-priority rest is not implemented");
  }

  public OrderBookSnapshot snapshot() {
    return new OrderBookSnapshot(List.of(), List.of());
  }
}
```

现在新增完整的聚焦测试 `PricePriorityOrderBookStepTest.java`：

```java
package io.github.lchareln.cex.matching;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigInteger;
import java.util.List;
import org.junit.jupiter.api.Test;

final class PricePriorityOrderBookStepTest {
  @Test
  void aValidNonCrossingOrderEmitsAcceptedThenRested() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();

    ExecutionBatch batch = engine.place(input(10, "BUY", 100, 5));

    assertEquals(
        List.of(
            accepted(1, 10, Side.BUY, 100, 5),
            rested(1, 10, Side.BUY, 100, 5)),
        batch.events());
  }

  @Test
  void snapshotsExposeBidsDescendingAndAsksAscending() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
    engine.place(input(1, "BUY", 99, 2));
    engine.place(input(2, "BUY", 100, 3));
    engine.place(input(3, "SELL", 102, 4));

    ExecutionBatch last = engine.place(input(4, "SELL", 101, 5));

    assertEquals(List.of(100L, 99L), prices(last.bookAfter().bids()));
    assertEquals(List.of(101L, 102L), prices(last.bookAfter().asks()));
  }

  @Test
  void returnedListsCannotMutateTheEngine() {
    SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
    ExecutionBatch batch = engine.place(input(1, "BUY", 100, 2));

    assertThrows(UnsupportedOperationException.class, () -> batch.events().clear());
    assertThrows(UnsupportedOperationException.class, () -> batch.bookAfter().bids().clear());
    assertThrows(
        UnsupportedOperationException.class,
        () -> batch.bookAfter().bids().getFirst().orders().clear());
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

  private static MatchingEvent.Rested rested(
      long sequence, long orderId, Side side, long priceTicks, long quantityLots) {
    return new MatchingEvent.Rested(
        new AcceptanceSequence(sequence),
        new OrderId(orderId),
        side,
        new PriceTicks(priceTicks),
        new QuantityLots(quantityLots));
  }

  private static List<Long> prices(List<OrderBookSnapshot.PriceLevel> levels) {
    return levels.stream().map(level -> level.priceTicks().value()).toList();
  }
}
```

运行：

```bash
./gradlew :matching-core:test \
  --tests '*PricePriorityOrderBookStepTest' \
  --no-daemon
```

测试必须编译成功但执行失败，失败原因是有效订单触发了 `price-priority rest is not implemented`。若是类型不存在、import 错误或 JDK 不符，应先修复脚手架；那不是本篇要观察的业务 RED。

## 把非交叉挂单路径从红改成绿

用下面的完整阶段实现替换骨架。它在任何状态变化之前检查“是否会交叉”；交叉路径明确抛出 `UnsupportedOperationException`，留给后两篇实现。这个临时护栏很重要：未完成的路径可以显式失败，但不能先污染订单簿再失败。

```java
package io.github.lchareln.cex.matching;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.NavigableMap;
import java.util.Objects;
import java.util.TreeMap;

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

  public ExecutionBatch place(PlaceLimitOrderInput input) {
    Objects.requireNonNull(input, "input");
    ValidationResult validation = validator.validate(input);
    if (validation instanceof ValidationResult.Invalid invalid) {
      return new ExecutionBatch(List.of(new MatchingEvent.Rejected(invalid.code())), snapshot());
    }

    PlaceLimitOrder command = validator.normalize(input);
    if (wouldCross(command)) {
      throw new UnsupportedOperationException("crossing path arrives in the next lessons");
    }

    long sequenceValue = nextAcceptanceSequence;
    final long followingSequence;
    try {
      followingSequence = Math.incrementExact(sequenceValue);
    } catch (ArithmeticException exception) {
      throw new IllegalStateException(
          "acceptance sequence exhausted before state mutation", exception);
    }

    AcceptanceSequence sequence = new AcceptanceSequence(sequenceValue);
    NavigableMap<Long, ArrayDeque<RestingOrder>> ownSide =
        command.side() == Side.BUY ? bids : asks;
    ownSide
        .computeIfAbsent(command.priceTicks().value(), ignored -> new ArrayDeque<>())
        .addLast(
            new RestingOrder(
                sequence, command.orderId(), command.quantityLots().value()));

    nextAcceptanceSequence = followingSequence;
    return new ExecutionBatch(
        List.of(
            new MatchingEvent.Accepted(
                sequence,
                command.orderId(),
                command.side(),
                command.priceTicks(),
                command.quantityLots()),
            new MatchingEvent.Rested(
                sequence,
                command.orderId(),
                command.side(),
                command.priceTicks(),
                command.quantityLots())),
        snapshot());
  }

  public OrderBookSnapshot snapshot() {
    return new OrderBookSnapshot(snapshotSide(bids, Side.BUY), snapshotSide(asks, Side.SELL));
  }

  private boolean wouldCross(PlaceLimitOrder command) {
    if (command.side() == Side.BUY) {
      return !asks.isEmpty() && command.priceTicks().value() >= asks.firstKey();
    }
    return !bids.isEmpty() && command.priceTicks().value() <= bids.firstKey();
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

重新运行同一个聚焦测试，结果应为 GREEN：

```bash
./gradlew :matching-core:test \
  --tests '*PricePriorityOrderBookStepTest' \
  --no-daemon
```

这里有三个因果点：

- `TreeMap` 的比较器决定跨价位的执行优先级，插入顺序不参与价位排序；
- `computeIfAbsent(...).addLast(...)` 只负责把余量追加到一个非空价位，不建立订单索引；
- `snapshotSide` 深复制价位和订单视图，因此后续状态迁移不能回写已经返回的历史结果。

## 本篇停止在“会挂单”，不把局部 GREEN 冒充单元完成

现在可以确定地观察 `Accepted → Rested`，也能得到 Bid 降序、Ask 升序的不可变盘口。它保证的是非交叉挂单路径的状态所有权和价格顺序，不保证同价 FIFO 真正用于成交，更不保证交叉、部分成交或连续吃单。

此后不要再运行起点版根 `m01Check`。`course/m01-start` 中该任务仍依赖完整的 `matching-testkit:test`；加入订单簿后，属于 `course/m00-complete` 的“core 尚无订单簿”架构测试会在 M01 runner 之前失败，因此它不能表示当前 M01 进度，旧的 `check.json` 也可能只是上一次运行留下的报告。本阶段只以本篇聚焦的 core 测试为停止门禁；第四篇会用 v2 完整裁判替换起点任务。

不要在这个中间状态运行 `m01Evidence`，也不要在自己的练习仓库创建或移动 `course/m01-complete`；上游同名 tag 只是已经发布的只读答案坐标。更不要修改或删除 M00 的历史证明来换取绿色：M00 的完整架构门禁只属于不可移动的 `course/m00-complete`，M01 正是在有意改变这条架构事实。

下一篇只解开一个新约束：哪些有效命令可以消耗接受序列，以及同一价格内为什么必须按这个序列而不是时间戳或 `orderId` 执行。
