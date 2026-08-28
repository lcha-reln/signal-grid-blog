---
title: "M02·03：让已成交与已撤订单永远不能复活"
description: "保留 engine 生命周期内全部已接受 orderId，让 fully-filled maker 与 taker 都进入 FILLED，并用迟到撤单、重复撤单和同 payload 重复下单证明终态不可逆。"
date: 2026-08-28T15:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M02
lessonOrder: 30
permalink: irreversible-terminal-orders
tags:
  - 撮合引擎
  - 终态
  - 确定性
draft: false
---

> 阅读基线：本文从 `course/m02-start` 的局部 RED/GREEN 推进；最终可复验结果冻结在 annotated `course/m02-complete`。

上一篇让 RESTING 订单可以被精确撤销，但如果 engine 在订单离开簿后顺手从 `ordersById` 删除它，所有结构检查依然可能通过：订单簿与活动索引都不再含该 ID。真正的错误只会在未来命令到来时显现——迟到 Cancel 被误报为 unknown，或相同 ID 的 Place 被当成新订单接受，已经发生过的身份从历史中“复活”。

本篇只证明一个命题：**第一次成功接受的 Place 永久拥有该 `orderId`，直到当前 engine 进程结束；RESTING 可以单向进入 FILLED 或 CANCELED，两个终态不可逆且仍留在唯一 registry 中。**

这里的“永久”只指一个内存 engine 生命周期。M02 没有 snapshot、WAL、恢复和 tombstone 回收策略，也不声称跨重启保留身份。第四篇才会把 10 场景 34 命令接入完整裁判；本篇结束时不要伪造 Golden、evidence 或完成状态。

## 先预测一笔成交里的两个终态

从干净 engine 执行：

```text
PLACE id=40 SELL 100 × 2
PLACE id=41 BUY  100 × 2
```

第一笔是 maker，第二笔是 taker。两者都完全成交，最终订单簿为空。现在分别执行 `CANCEL(40)` 与 `CANCEL(41)`，正确结果都是：

```text
CancelRejected(orderId, ORDER_ALREADY_FILLED)
```

maker 容易处理：它曾经 RESTING，成交循环能在 remaining 归零时把它标成 FILLED。taker 更容易漏：它在同一次 Place 内从 ACCEPTED 直接完全成交，从未进入订单簿。如果实现只为 resting order 建 registry，ID 41 会被误判成 `ORDER_NOT_FOUND`，甚至可能再次 Place 成功。

再预测撤单路径：

```text
PLACE id=42 BUY 99 × 3 → RESTING
CANCEL id=42           → Canceled(... quantity=3)
CANCEL id=42           → CancelRejected(ORDER_ALREADY_CANCELED)
CANCEL id=42           → CancelRejected(ORDER_ALREADY_CANCELED)
PLACE  id=42 原 payload → PlaceRejected(DUPLICATE_ORDER_ID)
```

第二、三次 Cancel 返回相同业务分类，但不会重放第一次 `Canceled`。相同 payload 的重复 Place 也不是幂等重放：第一次的 Accepted/Rested 不会再次返回，它只是被明确拒绝。

## 从冻结起点承接，不把实现基线当完成点

继续使用从 [`course/m02-start`](https://github.com/lcha-reln/cex-matching/tree/course/m02-start) 分出的 `unit/m02`：

```bash
test "$(git merge-base HEAD course/m02-start)" \
  = "fbaa744912147fdb1d802fb16cf4a9f9d62e8112"

./gradlew :matching-core:test \
  --tests '*SingleInstrumentOrderLifecycleTest.cancelMiddleOrderPreservesTheRelativeFifoOfItsNeighbors' \
  --tests '*SingleInstrumentOrderLifecycleTest.cancelPartiallyFilledMakerReportsAndRemovesOnlyItsCurrentRemainder' \
  --no-daemon
```

前两篇的聚焦证明应保持 GREEN。课程当前 core 实现可对照本篇描述，但它不是公开完成身份；不要据此跳过 RED，也不要把 `m02Check` 的预期失败改成通过。

## RED：同时检查 maker、taker、CANCELED 和下一个 sequence

先新增终态撤单测试：

```java
@Test
void lateAndRepeatedCancelsHaveDistinctStableTerminalResults() {
  SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();
  engine.place(place(40, "SELL", 100, 2));
  engine.place(place(41, "BUY", 100, 2));

  assertCancelRejected(
      engine, 40, CancelRejectionCode.ORDER_ALREADY_FILLED);
  assertCancelRejected(
      engine, 41, CancelRejectionCode.ORDER_ALREADY_FILLED);

  engine.place(place(42, "BUY", 99, 3));
  assertEquals(
      List.of(canceled(3, 42, Side.BUY, 99, 3)),
      engine.cancel(cancel(42)).events());
  assertCancelRejected(
      engine, 42, CancelRejectionCode.ORDER_ALREADY_CANCELED);
  assertCancelRejected(
      engine, 42, CancelRejectionCode.ORDER_ALREADY_CANCELED);
}
```

再用 active、filled、canceled 三种状态上的重复 ID 证明“第一次接受拥有身份”：

```java
@Test
void duplicateIdentityIsRejectedWhileActiveFilledOrCanceledAndNeverConsumesSequence() {
  SingleInstrumentMatchingEngine engine = new SingleInstrumentMatchingEngine();

  engine.place(place(50, "BUY", 99, 1));
  assertDuplicate(engine, place(50, "SELL", 101, 9));

  MatchingEvent.Accepted fillSequence =
      assertInstanceOf(
          MatchingEvent.Accepted.class,
          engine.place(place(51, "SELL", 99, 1)).events().getFirst());
  assertEquals(new AcceptanceSequence(2), fillSequence.sequence());
  assertDuplicate(engine, place(50, "BUY", 99, 1));
  assertDuplicate(engine, place(51, "SELL", 99, 1));

  MatchingEvent.Accepted cancelSequence =
      assertInstanceOf(
          MatchingEvent.Accepted.class,
          engine.place(place(52, "BUY", 98, 2)).events().getFirst());
  assertEquals(new AcceptanceSequence(3), cancelSequence.sequence());
  engine.cancel(cancel(52));
  assertDuplicate(engine, place(52, "BUY", 98, 2));

  MatchingEvent.Accepted next =
      assertInstanceOf(
          MatchingEvent.Accepted.class,
          engine.place(place(53, "BUY", 97, 1)).events().getFirst());
  assertEquals(new AcceptanceSequence(4), next.sequence());
}
```

这组测试故意让第一笔 duplicate 使用**不同** payload，随后又对 FILLED ID 使用**相同** payload。不同 payload 和相同 payload 都必须拒绝；M02 的键是 lifetime `orderId` ownership，不是 payload equality。

运行：

```bash
./gradlew :matching-core:test \
  --tests '*SingleInstrumentOrderLifecycleTest.lateAndRepeatedCancelsHaveDistinctStableTerminalResults' \
  --tests '*SingleInstrumentOrderLifecycleTest.duplicateIdentityIsRejectedWhileActiveFilledOrCanceledAndNeverConsumesSequence' \
  --no-daemon
```

若上一篇实现只保存 active index，fully-filled maker、taker 或成功撤单后的 duplicate 至少有一项会 RED。这盏红灯指向终态身份保留，不应通过“增加已完成订单查询 API”绕开。

## GREEN：内部状态只有四个，命令边界只有三个稳定态

`OrderState` 的内部枚举可以很小：

```java
private enum Lifecycle {
  ACCEPTED,
  RESTING,
  FILLED,
  CANCELED
}
```

`ACCEPTED` 是单条 Place 应用过程中的瞬时状态：唯一 ID 已登记，但撮合尚未决定它是挂单还是完全成交。公开命令边界只允许看到 RESTING、FILLED 或 CANCELED；`assertConsistentState()` 若在边界发现 ACCEPTED，必须失败关闭。

冻结的合法迁移是：

```text
UNSEEN  --accepted with remainder--> RESTING
UNSEEN  --accepted fully executed--> FILLED
RESTING --fully traded-------------> FILLED
RESTING --cancel-------------------> CANCELED
FILLED  ---------------------------> FILLED
CANCELED --------------------------> CANCELED
```

最后两行不是“再次执行同一个迁移”，而是后续命令观察到终态并返回稳定拒绝。不存在 `FILLED → CANCELED`、`CANCELED → RESTING` 或 `terminal → UNSEEN`。

## fully-filled maker 与 taker 必须走两条显式 markFilled 路径

maker 在成交循环中余量归零时，先从价位移除，再迁移同一个对象：

```java
if (maker.remainingQuantityLots == 0) {
  if (!level.remove(maker)) {
    throw new IllegalStateException(
        "filled maker disappeared during single-writer apply");
  }
  maker.markFilled();
  if (level.isEmpty()
      && !oppositeSide.remove(makerPrice, level)) {
    throw new IllegalStateException(
        "empty maker level disappeared during single-writer apply");
  }
}
```

taker 的迁移必须在 `match(...)` 返回后显式处理：

```java
if (taker.remainingQuantityLots > 0) {
  rest(taker);
  events.add(new MatchingEvent.Rested(/* remaining */));
} else {
  taker.markFilled();
}
```

这两个 `markFilled()` 不能合并成“清理订单簿时顺便标记”。taker 从未入簿，没有清理机会；maker 则必须在离开簿的同一命令内变成 FILLED。二者都继续保留在 `ordersById`。

`markFilled()` 自己守住前置条件：

```java
private void markFilled() {
  if ((lifecycle != Lifecycle.ACCEPTED
          && lifecycle != Lifecycle.RESTING)
      || remainingQuantityLots != 0
      || canceledQuantityLots != 0) {
    throw new IllegalStateException("invalid filled transition");
  }
  lifecycle = Lifecycle.FILLED;
}
```

这样“还有余量却标 FILLED”与“已经撤销量又标 FILLED”都会在内部失败，而不是变成未来的一次 `ORDER_ALREADY_FILLED` 假象。

## Duplicate 检查的精确位置决定旧合同是否漂移

Place 的顺序必须是：

```text
null/schema boundary
→ frozen M00 validation
→ normalize
→ ordersById duplicate lookup
→ sequence exhaustion preflight
→ register ACCEPTED
→ match/rest/fill
→ advance next sequence
```

对应代码先验证，再查 lifetime registry：

```java
ValidationResult validation = placeValidator.validate(input);
if (validation instanceof ValidationResult.Invalid invalid) {
  return singleton(new MatchingEvent.Rejected(invalid.code()));
}

PlaceLimitOrder command = placeValidator.normalize(input);
if (ordersById.containsKey(command.orderId())) {
  return singleton(
      new MatchingEvent.PlaceRejected(
          command.orderId(),
          PlaceRejectionCode.DUPLICATE_ORDER_ID));
}
```

然后才用 `Math.incrementExact` 预演下一个 sequence。Duplicate 不消耗 sequence，也不应因为 next sequence 恰为 `Long.MAX_VALUE` 而抛出耗尽错误：它根本不会被接受。

补两项次序测试：

- 已存在 ID 的新 Place 同时 `side=HOLD`、price/quantity 无效，结果仍按 M00 优先级是 `Rejected(INVALID_SIDE)`；
- 把 next sequence 置为 `Long.MAX_VALUE`，重复 ID 仍得到 Duplicate，只有全新 ID 才在状态修改前报告 sequence exhausted。

这两项防止生命周期功能悄悄改写 M00/M01。

## 同 payload duplicate：取消不是释放 orderId

冻结 corpus 的第 10 个场景专门防一个常见误解：

```text
PLACE  id=1000 SELL 100 × 3 → Accepted(sequence=1), Rested
CANCEL id=1000              → Canceled
PLACE  id=1000 SELL 100 × 3 → PlaceRejected(DUPLICATE_ORDER_ID)
PLACE  id=1001 BUY 99 × 1   → Accepted(sequence=2), Rested
```

第三条与第一条 payload 逐字段相同，仍必须 Duplicate。Cancel 只终止该订单的活动余量，不把业务身份归还给调用者；第三条也不消耗 sequence，所以新 ID 1001 连续取得 2。

这仍不是 command idempotency。若第三条是第一条的网络重试，一个幂等命令层可能重放第一次结果；M02 没有 command identity，只能把它解释成“试图再次使用已被接受的 orderId”，因此返回新拒绝。

反过来，未知 Cancel 不占用 ID：

```text
CANCEL id=2000 → ORDER_NOT_FOUND
PLACE  id=2000 → Accepted(sequence=1)
```

只有成功接受 Place 才建立 lifetime ownership。无效 Place、无效 Cancel 和 unknown Cancel 都不能预留 tombstone。

## 验证：终态结果、盘口和 sequence 一起检查

运行 core 的全部生命周期测试与上游回归：

```bash
./gradlew :matching-core:test \
  --tests '*SingleInstrumentOrderLifecycleTest' \
  --tests '*SingleInstrumentMatchingEngineTest' \
  --tests '*CancelOrderValidatorTest' \
  --no-daemon

./gradlew clean build --no-daemon
./gradlew m02Check --no-daemon
```

本篇正确终点是：

| 证明 | 结果 |
| --- | --- |
| fully-filled maker/taker 迟到 Cancel | `ORDER_ALREADY_FILLED` |
| 成功 Cancel 后重复 Cancel | 稳定 `ORDER_ALREADY_CANCELED` |
| active/filled/canceled duplicate Place | `DUPLICATE_ORDER_ID` |
| 同 payload duplicate | 仍为 Duplicate，不是旧 batch 重放 |
| unknown Cancel 后首次 Place | 可接受 |
| duplicate/Cancel 对 next sequence | 不消耗 |
| core 与 M00/M01 regression | GREEN |
| 根 `m02Check` | 仍允许保持 `GOAL_NOT_IMPLEMENTED` |

最后一行不能被前三篇局部 GREEN 覆盖。完整门禁还缺冻结 corpus 的逐命令历史、100 次 fresh replay、四个 semantic mutant、异常 control 和架构边界报告，这些都属于尚未创建的第四篇阶段。

## 反例：订单离开 book 就从 registry 删除

错误实现往往看起来很整洁：

```java
if (maker.remainingQuantityLots == 0) {
  level.remove(maker);
  ordersById.remove(maker.orderId);
}
```

它不会留下幽灵挂单，snapshot 也正确，却删除了“ID 曾被接受且已 FILLED”的事实。迟到 Cancel 只能返回 `ORDER_NOT_FOUND`；相同 ID Place 会被接受为新订单。若先把 ID 移到另一个 terminal Map，又回到两本权威账的漂移问题。

正确做法不是“永不删除任何 Java 对象”这一通用规则，而是承认 M02 尚未拥有安全回收依据。没有持久命令窗口、恢复 snapshot 和明确 retention frontier 时，按 wall clock 猜测 tombstone 过期会让重放历史的解释随时间改变。回收必须由后续单元单独设计和证明。

## 练习：用反例区分终态稳定与幂等重放

完成三组测试：

1. maker 量 5 被两笔 taker 依次成交 2、3，随后 Cancel 必须是 `ORDER_ALREADY_FILLED`；
2. taker 连续吃掉两个 maker 后余量恰好为 0，随后 Cancel taker 也必须是 `ORDER_ALREADY_FILLED`；
3. 成功 Cancel 后，用原 payload 重复 Place 两次，两次都是 Duplicate；再 Place 新 ID，sequence 只增加一次。

然后写一个“伪幂等” mutant：重复 Cancel 再次返回第一次的 `Canceled`。测试必须杀死它，因为第二次没有新的成功撤单事实。再写一个删除 terminal entry 的 mutant；迟到 Cancel 和同 payload duplicate 都应将它识别为业务错误，而不是基础设施异常。

## 停止点

到这里，内存 core 的订单生命周期已经形成闭环：唯一 registry 保留每个已接受 ID，RESTING 可精确变为 CANCELED，fully-filled maker 与 taker 都进入 FILLED，两个终态不可逆，重复结果也没有被误称为命令幂等。

现在必须停下，不要继续增加产品功能，也不要引入 Cancel/Replace、Mass Cancel、账户、预占释放、持久化、网络、线程或 Aeron。下一篇只有一个任务：用冻结的 10/34 corpus、确定性历史、结构不变量和 semantic mutants 独立证明这份 core。
