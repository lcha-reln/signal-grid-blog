---
title: "M02·02：用唯一订单索引安全撤掉队列中间节点"
description: "让 ordersById 成为生命周期唯一真相，让价位队列只引用同一个 OrderState，并用中间撤单与部分成交余量证明 FIFO 和数量都没有被破坏。"
date: 2026-08-28T14:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M02
lessonOrder: 20
permalink: addressable-index-middle-cancel
tags:
  - 撮合引擎
  - 订单索引
  - FIFO
draft: true
---

上一篇冻结了 Cancel 的输入与结果，但“知道 orderId”不等于“能安全撤单”。M01 的价位队列只为撮合优化：它能迅速找到最佳价和队首 maker，却不能在不知道 side、price 与队列位置时高效找到任意订单。粗暴扫描整个订单簿虽然可能在小测试里工作，却没有建立任何身份一致性保证。

本篇只证明一个命题：**`ordersById` 必须是订单生命周期的唯一权威真相，价格价位只保存指向同一个 `OrderState` 的执行顺序引用；因此撤掉同价队列中间节点时，目标余量精确归零，幸存者仍按原 `AcceptanceSequence` FIFO。**

我们只处理 `RESTING → CANCELED` 的可寻址迁移和结构一致性。为什么 FILLED/CANCELED 身份必须永久保留、fully-filled taker 怎样进入终态，留给下一篇。

## 承接上一盏绿灯，根门禁仍然是红的

继续使用从 [`course/m02-start`](https://github.com/lcha-reln/cex-matching/tree/course/m02-start) 创建的练习分支，不要重新从 `main` 开始：

```bash
test "$(git merge-base HEAD course/m02-start)" \
  = "fbaa744912147fdb1d802fb16cf4a9f9d62e8112"

./gradlew :matching-core:test \
  --tests '*CancelOrderValidatorTest' \
  --tests '*MatchingSemanticValuesTest' \
  --no-daemon
```

这两组测试应保持 GREEN。此时运行 `./gradlew m02Check --no-daemon` 仍应得到结构化 `GOAL_NOT_IMPLEMENTED`：结果类型存在了，engine 还没有证明它们与真实状态一一对应。

## 预测：撤掉 #2 后，什么绝对不能变化

按顺序接受三个同价 Ask：

| 接受序列 | orderId | price | remaining |
| ---: | ---: | ---: | ---: |
| 1 | 20 | 100 | 1 |
| 2 | 21 | 100 | 1 |
| 3 | 22 | 100 | 1 |

执行 `CANCEL(21)` 后，正确状态不是“重新建立一个包含 20、22 的价位”，而是：

```text
ordersById:
  20 → same OrderState(sequence=1, RESTING, remaining=1)
  21 → same OrderState(sequence=2, CANCELED, remaining=0)
  22 → same OrderState(sequence=3, RESTING, remaining=1)

asks[100]: 20 → 22
nextAcceptanceSequence: 4
```

随后 `PLACE BUY 100 × 2` 必须产生成交 maker 顺序 `20 → 22`。Cancel 不能给幸存订单重新编号，不能把 #22 提升成新的 sequence 2，也不能消耗 sequence 4。`AcceptanceSequence` 表示最初被 engine 接受的时间优先身份，不是“当前队列下标”。

再预测部分成交：

```text
PLACE SELL id=30 price=100 quantity=5 → RESTING remaining=5
PLACE BUY  id=31 price=100 quantity=2 → id=30 remaining=3
CANCEL id=30                         → Canceled(... canceledQuantityLots=3)
```

若事件报告 5，说明撤单路径读了原始数量；若报告 0，说明先修改后构造事件；正确实现必须在原子迁移前读取当前 remaining=3，再把同一个对象改成 CANCELED。

## RED：测试既看结果，也看撤单后的执行顺序

新增 `SingleInstrumentOrderLifecycleTest` 的两个聚焦场景：

```java
@Test
void cancelMiddleOrderPreservesTheRelativeFifoOfItsNeighbors() {
  SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
  engine.place(place(20, "SELL", 100, 1));
  engine.place(place(21, "SELL", 100, 1));
  engine.place(place(22, "SELL", 100, 1));

  engine.cancel(cancel(21));
  assertEquals(
      List.of(20L, 22L),
      engine.snapshot().asks().getFirst().orders().stream()
          .map(order -> order.orderId().value())
          .toList());

  ExecutionBatch takeNeighbors =
      engine.place(place(23, "BUY", 100, 2));
  assertEquals(
      List.of(20L, 22L),
      trades(takeNeighbors).stream()
          .map(trade -> trade.makerOrderId().value())
          .toList());
}

@Test
void cancelPartiallyFilledMakerReportsAndRemovesOnlyItsCurrentRemainder() {
  SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
  engine.place(place(30, "SELL", 100, 5));
  engine.place(place(31, "BUY", 100, 2));

  ExecutionBatch batch = engine.cancel(cancel(30));

  assertEquals(
      List.of(canceled(1, 30, Side.SELL, 100, 3)),
      batch.events());
  assertEquals(emptyBook(), batch.bookAfter());
}
```

再加一个只有一笔订单的价位：成功撤销后 `bookAfter` 必须为空，不能留下数量为零的空 price level。

```bash
./gradlew :matching-core:test \
  --tests '*SingleInstrumentOrderLifecycleTest.cancelMiddleOrderPreservesTheRelativeFifoOfItsNeighbors' \
  --tests '*SingleInstrumentOrderLifecycleTest.cancelPartiallyFilledMakerReportsAndRemovesOnlyItsCurrentRemainder' \
  --tests '*SingleInstrumentOrderLifecycleTest.cancelOnlyRestingOrderRemovesTheEmptyPriceLevel' \
  --no-daemon
```

在上一篇终点，这三项必须 RED。红灯若只断言“撤单返回成功”，辨别力不够：一个删除错误节点、重排 FIFO 或遗留空价位的实现也能通过。

## GREEN：registry 持有身份，订单簿只持有执行引用

engine 增加唯一权威 registry：

```java
private final NavigableMap<Long, PriceLevelState> bids =
    new TreeMap<>(Collections.reverseOrder());
private final NavigableMap<Long, PriceLevelState> asks = new TreeMap<>();
private final Map<OrderId, OrderState> ordersById = new HashMap<>();
```

这里的 `HashMap` 与 `LinkedHashMap` 是当前实现选择，不是外部合同。真正被冻结的是所有权关系：

```text
ordersById[orderId] ───────────────┐
                                   ├──► 同一个 OrderState 对象
priceLevel.orders[orderId] ────────┘
```

`ordersById` 不是订单簿的缓存，也不是“活动索引”。它从订单第一次被接受起一直拥有身份。`PriceLevelState` 只在该身份处于 RESTING 时保存引用，并利用插入顺序表达 FIFO：

```java
private static final class PriceLevelState {
  private final LinkedHashMap<OrderId, OrderState> orders =
      new LinkedHashMap<>();

  private void add(OrderState order) {
    if (orders.putIfAbsent(order.orderId, order) != null) {
      throw new IllegalStateException(
          "price level already contains order identity");
    }
  }

  private boolean remove(OrderState order) {
    return orders.remove(order.orderId, order);
  }
}
```

`remove(key, value)` 比只按 key 删除多一项身份检查：即使某处错误地把相同 ID 的另一对象塞进价位，撤单也不会把矛盾状态伪装成成功。

## Place 必须在撮合前登记同一个 OrderState

Place 验证通过且 ID 未出现后，先创建完整的 `OrderState`，再同时让匹配过程和 registry 使用它：

```java
AcceptanceSequence sequence = new AcceptanceSequence(sequenceValue);
OrderState taker = new OrderState(sequence, command);

if (ordersById.putIfAbsent(command.orderId(), taker) != null) {
  throw new IllegalStateException(
      "duplicate order identity appeared during single-writer apply");
}

match(taker, oppositeSide, events, buying);
if (taker.remainingQuantityLots > 0) {
  rest(taker);
  events.add(new MatchingEvent.Rested(/* same identity and remainder */));
} else {
  taker.markFilled();
}
```

为何不是“撮合结束后，如果有余量才登记”？因为立即完全成交的 taker 也已经被接受，下一篇需要用 registry 回答它是 FILLED，而不是从未出现。提前登记会短暂产生内部 `ACCEPTED`，但这个状态不能逃出命令边界；命令结束时它必须成为 RESTING 或 FILLED。

`rest(taker)` 也不能复制一个轻量节点：

```java
private void rest(OrderState order) {
  NavigableMap<Long, PriceLevelState> side =
      order.side == Side.BUY ? bids : asks;
  PriceLevelState level =
      side.computeIfAbsent(
          order.priceTicks.value(),
          ignored -> new PriceLevelState());
  level.add(order);
  order.markResting();
}
```

这样 maker 成交、snapshot 和 Cancel 看到的是同一个 mutable aggregate，而不是三份迟早漂移的 quantity。

## Cancel 的安全顺序：定位、验证引用、构造事实、移除、迁移

验证并 normalize 后，Cancel 先从唯一 registry 查找：

```java
OrderState order = ordersById.get(command.orderId());
if (order == null) {
  return singleton(
      new MatchingEvent.CancelRejected(
          command.orderId(),
          CancelRejectionCode.ORDER_NOT_FOUND));
}
```

本篇聚焦 RESTING 分支。根据权威对象上的 side 与 price 找到价位，再验证价位引用的确是同一对象：

```java
NavigableMap<Long, PriceLevelState> side =
    order.side == Side.BUY ? bids : asks;
PriceLevelState level = side.get(order.priceTicks.value());
if (level == null || level.order(order.orderId) != order) {
  throw new IllegalStateException(
      "active order index and price level disagree");
}
```

成功事件必须在把 remaining 归零之前构造：

```java
MatchingEvent.Canceled canceled =
    new MatchingEvent.Canceled(
        order.sequence,
        order.orderId,
        order.side,
        order.priceTicks,
        new QuantityLots(order.remainingQuantityLots));

if (!level.remove(order)) {
  throw new IllegalStateException(
      "active order disappeared during single-writer cancel");
}
if (level.isEmpty()
    && !side.remove(order.priceTicks.value(), level)) {
  throw new IllegalStateException(
      "empty price level disappeared during single-writer cancel");
}
order.markCanceled();
```

构造事件不修改状态；移除只删除目标引用；只有价位确实为空才删价位；最后同一个 OrderState 才进入 CANCELED。调用方必须继续串行化 `place/cancel`，所以这里没有锁，也没有并发 Map。M02 没有借撤单引入线程模型。

## 数量分区比“remaining 非负”更强

只检查 `remaining >= 0` 无法发现已成交量与撤销量重复计算。OrderState 应保留四项量，并始终满足：

```text
original = filled + remaining + canceled
```

部分成交 2、再撤余量 3 的订单应为：

```text
original=5, filled=2, remaining=0, canceled=3
```

用 `Math.addExact` 计算三项之和；溢出也必须作为状态损坏失败关闭。RESTING 要求 remaining>0 且 canceled=0；CANCELED 要求 remaining=0 且 canceled>0。这个分区让错误的“撤原始数量 5”无法躲过结构检查。

## 结构不变量必须在命令前后都检查

`assertConsistentState()` 是 package-local correctness hook，不是公开订单查询 API。至少检查：

- 每个价位非空，方向和价格与内部 OrderState 一致；
- 同价订单的 sequence 严格递增；
- 每个 RESTING ID 只在订单簿出现一次；
- `ordersById.get(id)` 与价位节点引用对象相同；
- registry 中 `RESTING` 当且仅当 ID 在簿上；
- 每笔已接受订单 sequence 唯一且小于 next sequence；
- 命令边界没有残留瞬时 `ACCEPTED`；
- 两边批末不交叉，数量分区成立。

engine 应在每条命令进入时先检查一次，状态迁移完成后再检查一次。前置检查很关键：若 registry 和 book 已经不一致，下一条 Cancel 不能继续修改状态再报错。

可以用一个测试故意通过反射清空 registry，保留 bids，然后执行 Cancel；正确行为是抛出包含 `disagree` 的 `IllegalStateException`，并且订单簿仍保持原样。这是异常 control，不是业务拒绝。把这类结构损坏转换成 `ORDER_NOT_FOUND` 会掩盖内部故障。

## 验证：结果、快照与后继成交三份证据必须一致

运行完整聚焦类和 M01 回归：

```bash
./gradlew :matching-core:test \
  --tests '*SingleInstrumentOrderLifecycleTest' \
  --tests '*SingleInstrumentMatchingEngineTest' \
  --no-daemon

./gradlew clean build --no-daemon
```

对中间撤单场景同时观察：

1. Cancel batch 只有一条 `Canceled(sequence=2, orderId=21, quantity=1)`；
2. `bookAfter.asks[100]` 只剩 20、22，sequence 仍为 1、3；
3. 后继 taker 的两条 Trade maker 顺序为 20、22；
4. 再来的合法 Place 获得 sequence 4，而不是 5。

只比较 snapshot 不够，因为一个实现可能每次都按 orderId 重排；只比较 Trade 也不够，因为错误实现可能在撤单后临时重建队列，偶然得到正确结果。四份观察共同约束身份、结构和时间优先。

## 反例：activeOrders + terminalOrders 两本账

一个常见设计是：

```text
activeOrders[id]   = ActiveOrder(...)
terminalOrders[id] = TerminalOrder(...)
book node          = RestingOrder(...)
```

撤单时先删 active，再写 terminal，再删 book。单线程并不让这三步天然原子：中间任何断言、算术错误或遗漏都会留下两份互相矛盾的真相；maker 成交路径也要复制同样的迁移协议。

M02 的选择更小：`ordersById` 永不因正常生命周期迁移删除 entry，book node 只引用同一对象。`RESTING/FILLED/CANCELED` 是对象状态，不是三张可分别修改的表。数据库投影、Counter 用户订单表和持久化 tombstone 都不属于这一层。

## 练习：撤销队首之外，再证明价位边界

补三组独立测试：

1. 同价四单撤掉 #1、#3，后继 taker 只能按 #2、#4 成交；
2. 一个价位两单，撤掉一单后价位仍存在且 aggregate remaining 只减目标余量；
3. maker 原量 9，先成交 2、再成交 3、最后撤单，`Canceled.quantity=4`，数量分区为 `9=5+0+4`。

每次都调用 package-local `assertConsistentState()`。再写一个错误实现反例：价位节点保存 OrderState 的拷贝。让 maker 部分成交后从 registry 撤单；若事件仍报告原始 remaining，测试应稳定 RED。

## 停止点

到这里，活动订单可以按 ID 精确定位，中间撤单不重排幸存 FIFO，部分成交只撤当前余量，空价位也不会残留。最重要的是：**registry 是生命周期唯一真相，book 只是同一 OrderState 的执行顺序视图。**

不要在本篇声称生命周期已经闭合。若 fully-filled maker 或立即全成的 taker 从 registry 消失，迟到 Cancel 仍会退化为 `ORDER_NOT_FOUND`；若 CANCELED entry 被删除，同 payload Place 仍可能复活。下一篇只关闭这些终态漏洞。
