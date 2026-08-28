---
title: "M02·01：先冻结订单生命周期的结果合同"
description: "从可复现的 M02 红灯出发，区分输入验证、生命周期业务拒绝与命令幂等，用 Place/Cancel 结果代数冻结可寻址订单的状态边界。"
date: 2026-08-28T14:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M02
lessonOrder: 10
permalink: order-lifecycle-result-contract
tags:
  - 撮合引擎
  - 订单生命周期
  - Java
draft: false
---

> 阅读基线：本文从 `course/m02-start` 的局部 RED/GREEN 推进；最终可复验结果冻结在 annotated `course/m02-complete`。

M01 已经能正确地按价格时间优先撮合，却刻意没有回答一个看似简单的问题：给定 `orderId`，这笔订单现在还能不能撤？只看订单簿无法回答。订单不在簿上，可能从未存在，可能刚刚完全成交，也可能早已撤销；这三种事实会驱动三种完全不同的业务结果。

本篇只证明一个命题：**Place 与 Cancel 必须先形成封闭、可预测的结果代数，才能开始写可寻址状态；输入无效、业务拒绝和命令幂等是三件不同的事。**

我们会先冻结 `CancelOrderInput`、验证优先级、三类 M02 事件和 `ExecutionBatch` 语法。订单索引与中间撤单留给下一篇，不可逆终态留给第三篇。本篇结束时，聚焦的语义值与验证测试应当 GREEN，但完整 `m02Check` 必须仍是 `GOAL_NOT_IMPLEMENTED`。

## 先证明自己站在真正的 RED 起点

M02 的唯一练习起点是 annotated tag [`course/m02-start`](https://github.com/lcha-reln/cex-matching/tree/course/m02-start)。不要从正在变化的 `main` 猜测起点，也不要把短 SHA 当成课程身份：

```bash
git clone https://github.com/lcha-reln/cex-matching.git
cd cex-matching
git switch -c unit/m02 course/m02-start

test "$(git rev-parse HEAD)" \
  = "fbaa744912147fdb1d802fb16cf4a9f9d62e8112"
git cat-file -t course/m02-start
```

最后一条命令必须输出 `tag`。然后复现“回归为绿、目标为红”的起点：

```bash
./gradlew clean build --no-daemon
./gradlew m02Check --no-daemon
```

第二条命令预期非零退出，并生成结构化 `GOAL_NOT_IMPLEMENTED`，而不是编译错误、fixture 缺失或异常堆栈。起点还冻结了以下事实：

| 项目 | 冻结值 |
| --- | --- |
| Schema | `matching.m02.scenario.v1` |
| 命令联合 | `PLACE \| CANCEL` |
| corpus | 恰好 10 个 scenario、34 条 command |
| 命令分布 | 22 条 PLACE、12 条 CANCEL |
| Schema probes | 8 个，业务命令计数之外 |
| fixture SHA-256 | `7e0be70259dcf1b4b422d68742b5c24f1a4d11b05643e2d9e367b67733d4a90a` |

这一步很重要：`clean build` 继续证明 M00/M01 没有退化；`m02Check` 的结构化失败只说明 M02 尚未实现。二者不能相互替代。

## 预测：同一个 orderId 为什么会有四种 Cancel 结果

先不要写 Map。对下面的命令逐行预测事件、订单身份和 `nextAcceptanceSequence`：

| 当前事实 | 输入 | 结果 | 身份与 sequence |
| --- | --- | --- | --- |
| 从未接受 ID 7 | `CANCEL ETH-USDT / 0` | `Rejected(UNKNOWN_INSTRUMENT)` | 不建身份，不耗 sequence |
| 从未接受 ID 7 | `CANCEL BTC-USDT / 0` | `Rejected(INVALID_ORDER_ID)` | 不建身份，不耗 sequence |
| 从未接受 ID 7 | `CANCEL BTC-USDT / 7` | `CancelRejected(ORDER_NOT_FOUND)` | 不建身份，不耗 sequence |
| ID 7 正在簿上 | `CANCEL BTC-USDT / 7` | 一条 `Canceled(...)` | 进入 `CANCELED`，不耗 sequence |
| ID 7 已完全成交 | `CANCEL BTC-USDT / 7` | `CancelRejected(ORDER_ALREADY_FILLED)` | `FILLED` 不变 |
| ID 7 已撤销 | 再次 Cancel | `CancelRejected(ORDER_ALREADY_CANCELED)` | `CANCELED` 不变 |

第一、二行是 schema 合法但业务字段无效，由 M00 延续下来的确定性验证处理。第三行的输入完全有效，只是 engine 从未接受过 ID 7，因此它是生命周期业务拒绝。后面三行只有保留历史身份才能区分。

Place 也有两层拒绝：

```text
字段无效                         → Rejected(validationCode, field)
字段有效、orderId 曾经被接受       → PlaceRejected(orderId, DUPLICATE_ORDER_ID)
字段有效、orderId 从未被接受       → Accepted → Trade* → Rested?
```

验证必须先于重复 ID 查询。假设 ID 7 已存在，新的 payload 同时带有 `side=HOLD`、`price=0`；正确结果仍是优先级最高的 `Rejected(INVALID_SIDE)`，不是 `DUPLICATE_ORDER_ID`。否则 M00 已冻结的输入合同会因为内部状态不同而漂移。

## RED：用最小测试把三层结果拆开

从起点新增 `CancelOrderValidatorTest` 的三项断言：多字段同时无效时先报告 instrument；`orderId` 只能落在正 `long` 域；无效输入不能被 normalize。

```java
@Test
void instrumentValidationPrecedesOrderIdentityValidation() {
  ValidationResult result =
      validator.validate(new CancelOrderInput("ETH-USDT", BigInteger.ZERO));

  ValidationResult.Invalid invalid =
      assertInstanceOf(ValidationResult.Invalid.class, result);
  assertEquals(ValidationCode.UNKNOWN_INSTRUMENT, invalid.code());
  assertEquals("instrumentId", invalid.field());
}

@Test
void orderIdentityUsesTheFrozenPositiveLongDomain() {
  assertInvalid(BigInteger.ZERO);
  assertInvalid(BigInteger.valueOf(-1));
  assertInvalid(BigInteger.valueOf(Long.MAX_VALUE).add(BigInteger.ONE));

  assertInstanceOf(
      ValidationResult.Valid.class,
      validator.validate(
          new CancelOrderInput("BTC-USDT", BigInteger.valueOf(Long.MAX_VALUE))));
}
```

再给 `MatchingSemanticValuesTest` 加一项事件语法测试。四类单例结果不能与 `Accepted` 混在同一 batch：

```java
assertThrows(
    IllegalArgumentException.class,
    () -> new ExecutionBatch(List.of(placeRejected, accepted), empty));
assertThrows(
    IllegalArgumentException.class,
    () -> new ExecutionBatch(List.of(cancelRejected, accepted), empty));
assertThrows(
    IllegalArgumentException.class,
    () -> new ExecutionBatch(List.of(canceled, accepted), empty));

assertDoesNotThrow(() -> new ExecutionBatch(List.of(placeRejected), empty));
assertDoesNotThrow(() -> new ExecutionBatch(List.of(cancelRejected), empty));
assertDoesNotThrow(() -> new ExecutionBatch(List.of(canceled), empty));
```

运行聚焦测试：

```bash
./gradlew :matching-core:test \
  --tests '*CancelOrderValidatorTest' \
  --tests '*MatchingSemanticValuesTest.executionBatchEnforcesPlaceAndCancelEventGrammar' \
  --no-daemon
```

在起点上，这些测试应因类型不存在或 batch 仍只有 M01 语法而 RED。不要为了迅速变绿，在 engine 中先塞入一个 `Map<Long, Boolean>`；当前红灯只要求公开结果合同，还没有要求状态实现。

## GREEN：输入仍是 BigInteger，规范化后才成为 OrderId

外部解析得到的数字可能大于 `long`，所以 `CancelOrderInput` 与 Place 一样先保留 `BigInteger`：

```java
public record CancelOrderInput(String instrumentId, BigInteger orderId) {
  public CancelOrderInput {
    Objects.requireNonNull(instrumentId, "instrumentId");
    Objects.requireNonNull(orderId, "orderId");
  }
}
```

验证顺序只有两步，顺序本身就是合同：

```java
public ValidationResult validate(CancelOrderInput input) {
  if (!PlaceLimitOrderValidator.INSTRUMENT_ID.equals(input.instrumentId())) {
    return new ValidationResult.Invalid(ValidationCode.UNKNOWN_INSTRUMENT);
  }
  if (!isPositiveLong(input.orderId())) {
    return new ValidationResult.Invalid(ValidationCode.INVALID_ORDER_ID);
  }
  return new ValidationResult.Valid();
}
```

只有 `Valid` 才能 normalize 为内部命令：

```java
return new CancelOrder(
    input.instrumentId(),
    new OrderId(input.orderId().longValueExact()));
```

不要让 `CancelOrder` 暴露 quantity、side 或 price。撤单请求只声明“寻找哪个 instrument 中的哪个身份”；其余字段必须来自权威状态。如果客户端把旧 price 一并传回，而 engine 又用它定位，就会把一个过时提示升级成权威事实。

## GREEN：用不同事件表达验证失败和生命周期事实

在 `MatchingEvent` 中增加三种记录及两个封闭枚举：

```java
record PlaceRejected(OrderId orderId, PlaceRejectionCode code)
    implements MatchingEvent {}

record CancelRejected(OrderId orderId, CancelRejectionCode code)
    implements MatchingEvent {}

record Canceled(
    AcceptanceSequence sequence,
    OrderId orderId,
    Side side,
    PriceTicks priceTicks,
    QuantityLots canceledQuantityLots)
    implements MatchingEvent {}
```

```java
public enum PlaceRejectionCode {
  DUPLICATE_ORDER_ID
}

public enum CancelRejectionCode {
  ORDER_NOT_FOUND,
  ORDER_ALREADY_FILLED,
  ORDER_ALREADY_CANCELED
}
```

`Canceled` 带回的是被移除的**当前余量**，不是原始下单量；这项数值要到第二篇才由状态实现证明。这里先冻结字段和非空约束。

`ExecutionBatch` 的规则也很小：`Rejected`、`PlaceRejected`、`CancelRejected`、`Canceled` 都只能单独成批；只有以 `Accepted` 开头的 Place batch 才能继续跟 `Trade*` 和可选的最终 `Rested`。Cancel 永远不产生 `Accepted`，因此也不会为了撤单分配时间优先 sequence。

## 最容易混淆的点：稳定重复结果不等于命令幂等

设 ID 42 当前 RESTING：

```text
第一次 CANCEL(42) → Canceled(sequence=3, ..., canceledQuantityLots=5)
第二次 CANCEL(42) → CancelRejected(42, ORDER_ALREADY_CANCELED)
第三次 CANCEL(42) → CancelRejected(42, ORDER_ALREADY_CANCELED)
```

第二、三次结果稳定，只说明终态可重复观察。它**不是 command idempotency**，因为系统没有 `commandId`，不知道第二次调用是否为第一次调用的网络重试，也不会重放第一次的 `Canceled` batch。

真正的命令幂等至少要回答：

1. 哪个稳定身份表示“同一次命令”；
2. 相同身份但 payload 不同如何失败关闭；
3. 第一次执行结果保存多久、跨重启如何恢复；
4. 超时后查询或重试怎样收敛到同一业务效果。

M02 一项都不实现。这里的 Duplicate 也不是幂等：即使 Place payload 与第一次逐字段相同，只要 ID 已经被接受过，结果仍是新的 `PlaceRejected(DUPLICATE_ORDER_ID)`，而不是重放旧的 `Accepted/Trade/Rested`。

## 验证 GREEN，但不要越过本篇停止点

完成类型、验证器和 batch grammar 后，执行：

```bash
./gradlew :matching-core:test \
  --tests '*CancelOrderValidatorTest' \
  --tests '*MatchingSemanticValuesTest' \
  --no-daemon

./gradlew clean build --no-daemon
./gradlew m02Check --no-daemon
```

预期证据分两层：

| 门禁 | 本篇终点 |
| --- | --- |
| validator 与 semantic-value tests | GREEN |
| M00/M01 regression | GREEN |
| `m02Check` | 仍为 `GOAL_NOT_IMPLEMENTED` |

如果 `m02Check` 因空实现被强行改成 `PASS`，那不是提前完成，而是裁判失去辨别力。当前还没有证明订单能按 ID 定位、从队列中间删除或进入终态。

## 反例：一个 `boolean canceled` 为什么不够

考虑把 `Map<OrderId, Boolean>` 当索引：存在且 `false` 表示活动，存在且 `true` 表示撤销。它至少漏掉四件事：

- 订单可能已经 FILLED，迟到 Cancel 不应报告 CANCELED；
- 部分成交后要知道精确 remaining，不能从原始 quantity 猜；
- 中间撤单必须定位原 price level 中的同一个节点；
- fully-filled taker 从未 RESTING，但仍必须留下 FILLED 身份。

结果枚举并不能自动解决这些问题，不过它会迫使后续实现对每一种事实给出唯一答案。模糊状态无法偷偷穿过编译器边界。

## 练习：先补预测表，不先补实现

为以下每条命令写出唯一事件、是否改变盘口、是否占用 ID、是否消耗 sequence：

1. 未知 instrument 与 `orderId=0` 同时出现的 Cancel；
2. 对从未接受的 ID 撤单，随后用同一 ID 合法 Place；
3. 已接受 ID 的 Place，payload 与原命令完全相同；
4. 已接受 ID 的 Place，同时带无效 side；
5. 成功 Cancel 之后连续重试两次。

然后把预测写成参数化测试。若测试需要读取 engine 的私有 Map 才能判断业务结果，说明公开事件还不够明确；若测试要求第二次 Cancel 重放第一次成功事件，说明你已经越界实现命令幂等。

## 停止点

到这里我们只得到一份可编译、可预测的 Place/Cancel 结果合同：验证失败、duplicate、unknown、filled、canceled 各有明确语义，且重复结果与命令幂等已经分开。

不要在本篇加入 `ordersById`、链表节点、terminal tombstone、Golden history 或 evidence。下一篇只解决一个新的证明义务：**怎样让唯一权威 registry 与价格队列引用同一个 `OrderState`，从中间精确撤单而不破坏 FIFO。**
