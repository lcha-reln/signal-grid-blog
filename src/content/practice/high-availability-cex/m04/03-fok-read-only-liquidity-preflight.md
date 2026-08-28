---
title: "M04·03：FOK 的原子性从只读流动性预检开始"
description: "在 Accepted 之前按真实价格时间顺序扣减需求，证明限价内流动性足够；不足时保持盘口、身份、sequence 与 maker 余量逐字段不变。"
date: 2026-08-28T19:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M04
lessonOrder: 30
permalink: fok-read-only-liquidity-preflight
tags:
  - 撮合引擎
  - FOK
  - 原子准入
draft: true
---

> M04 仍从 annotated [`course/m04-start`](https://github.com/lcha-reln/cex-matching/tree/course/m04-start) 的结构化 RED 演进。本篇只建立 FOK 的实现与证明义务；尚不存在可引用的 M04 complete ref、Golden digest 或 evidence manifest。

IOC 接受“能成交多少就成交多少”，FOK 则要求“现在立即全部成交，否则没有这笔订单”。这句话看似只需在撮合后检查 remaining 是否为零，却隐藏着最危险的实现诱惑：先修改真实订单簿，发现不足后再把变化回滚。

回滚很难恢复所有可观察事实。maker 的 remaining、生命周期、价位节点、队列位置、taker identity、acceptance sequence 和已经生成的 Trade event 都必须逐项还原；任何遗漏都会制造幽灵成交或 FIFO 漂移。

本篇只证明一个命题：**FOK 必须在 Accepted 之前完成只读 liquidity preflight；预检按真实价格时间顺序、只统计 `priceTicks` 内流动性，并用“逐笔扣减剩余需求”避免累计深度溢出。只有足够时才进入一次正常匹配，失败时状态逐字段不变。**

## FOK 拒绝发生在订单身份诞生之前

合法 raw 输入归一后，FOK 的顺序是：

```text
五字段验证
→ executionPolicy 验证
→ duplicate 检查
→ read-only FOK preflight
→ 若不足：PlaceRejected(FOK_NOT_FILLABLE)
→ 若足够：分配 sequence、登记 identity、Accepted、Trade+
```

`FOK_NOT_FILLABLE` 不是 Cancel，也不是 Accepted 后的终态。失败请求保持 `UNSEEN`，所以：

```text
late Cancel  → ORDER_NOT_FOUND
same ID Place → 仍可作为首次合法接受
```

这与 IOC 形成刻意对照：零成交 IOC 已 Accepted，终态是 CANCELED；不足 FOK 从未 Accepted，身份仍未出现。

## 两次手算揭示“限价内全部流动性”的含义

准备两个 Ask：

```text
sequence=1  SELL orderId=10  price=100  remaining=2
sequence=2  SELL orderId=11  price=101  remaining=3
```

### BUY 100 × 3：盘口总量够，限价内总量不够

Ask 两档合计 5 lot，但 BUY limit 100 只能访问 Ask 100 的 2 lot。预检过程是：

```text
required = 3
maker @100 remaining=2  → required = 1
next price=101 > limit  → stop
required > 0            → FOK_NOT_FILLABLE
```

结果只有一条：

```text
PlaceRejected(orderId=20, FOK_NOT_FILLABLE)
```

没有 Accepted、Trade、Rested 或 RemainderCanceled。两笔 maker remaining 仍是 2 和 3，next sequence 仍是 3，orderId 20 未占用。

### BUY 101 × 5：跨价位恰好满足

把 limit 改成 101，预检可以继续访问第二档：

```text
required = 5
maker @100 remaining=2  → required = 3
maker @101 remaining=3  → fillable
```

现在才分配 sequence 3，并执行共享匹配循环：

```text
Accepted(sequence=3, orderId=20, BUY, 101, 5, FOK)
Trade(maker=10, taker=20, price=100, quantity=2)
Trade(maker=11, taker=20, price=101, quantity=3)
```

FOK 的成交仍按更优价、同价 FIFO 和 maker price；“必须全成”不允许跳过更优 maker，也不允许把所有 Trade 聚合成 taker limit 101。

## 预检应扣减需求，不应累加深度

一个直觉实现是把所有可成交 maker quantity 相加，再比较 `available >= requested`：

```java
long available = 0;
for (OrderState maker : fillableMakers) {
  available += maker.remainingQuantityLots; // 可能溢出
}
return available >= command.quantityLots().value();
```

两笔合法 `long` 数量的总和可能超过 `Long.MAX_VALUE`。溢出后 `available` 变成负数或较小正数，使实际充足的 FOK 被错误拒绝；更糟的是，不同语言或优化路径可能给出不同结果。

生产实现只需维护“还差多少”，并在某笔 maker 单独满足剩余需求时立即成功：

```java
private boolean canFillCompletely(PlaceLimitOrder command) {
  NavigableMap<Long, PriceLevelState> opposite =
      command.side() == Side.BUY ? asks : bids;
  long required = command.quantityLots().value();

  for (Map.Entry<Long, PriceLevelState> levelEntry
      : opposite.entrySet()) {
    if (!crosses(
        command.side(),
        command.priceTicks().value(),
        levelEntry.getKey())) {
      break;
    }
    for (OrderState maker : levelEntry.getValue().values()) {
      if (maker.remainingQuantityLots >= required) {
        return true;
      }
      required -= maker.remainingQuantityLots;
    }
  }
  return false;
}
```

`required` 从一个合法正 `long` 开始，只在 `maker.remaining < required` 时做减法，因此始终保持正值且不会下溢。遍历 `NavigableMap` 与价位内 FIFO 的只读 view，顺序和真实匹配循环一致。

独立 reference 刻意不用生产的 TreeMap 结构。它在线性订单列表上筛选 RESTING、对侧且 crossing 的 maker，再用 `BigInteger` 做同样的逐笔需求扣减：

```java
private boolean isFullyExecutable(ReferenceCommand.Place taker) {
  BigInteger required = taker.quantityLots();
  for (ReferenceOrder candidate : orders) {
    if (candidate.lifecycle != Lifecycle.RESTING
        || candidate.side.equals(taker.side())
        || !crosses(taker.side(), taker.priceTicks(), candidate)) {
      continue;
    }
    if (candidate.remaining.compareTo(required) >= 0) {
      return true;
    }
    required = required.subtract(candidate.remaining);
  }
  return false;
}
```

reference 与 production 共享业务合同，但不共享 book node、价位集合或累计变量类型。两条表示路径能共同发现“只看最佳一档”“忽略 limit”或“深度累加溢出”等错误。

## 策略门必须位于所有状态写入之前

在 production `placeRequest()` 中，FOK 检查应出现在 sequence 和 `ordersById` 写入之前：

```java
if (ordersById.containsKey(command.orderId())) {
  return singleton(new MatchingEvent.PlaceRejected(
      command.orderId(), PlaceRejectionCode.DUPLICATE_ORDER_ID));
}

if (policy == ExecutionPolicy.FOK
    && !canFillCompletely(command)) {
  return singleton(new MatchingEvent.PlaceRejected(
      command.orderId(), PlaceRejectionCode.FOK_NOT_FILLABLE));
}

long sequenceValue = nextAcceptanceSequence;
AcceptanceSequence sequence = new AcceptanceSequence(sequenceValue);
OrderState taker = new OrderState(sequence, command, policy);
ordersById.put(command.orderId(), taker);
```

拒绝时 `singleton()` 只返回当前 detached snapshot，不得偷偷建 terminal tombstone。测试应在 FOK 前后比较：

- full-depth book；
- 所有 maker 的 remaining 和相对 FIFO；
- lifecycle registry 的 active/terminal identity；
- next acceptance sequence；
- 同 ID 后续合法 Place 的可接受性。

“盘口看起来一样”还不够。先成交再回滚可能恢复数量，却把 maker 从队尾重新插入、改变内部 sequence，或留下 FOK 的 terminal identity。

## 接受后的 FOK grammar 不需要补偿分支

只读预检与真实匹配使用相同 crossing 边界和当前单写者状态。它们之间没有另一个 command 插入，因此足够的 FOK 在接受后必须完全成交：

```text
Accepted(FOK) → Trade+
```

以下尾部全部非法：

```text
Accepted(FOK) → Rested
Accepted(FOK) → Trade* → RemainderCanceled
Accepted(FOK) 且无 Trade
```

engine 在共享 match 后可以保留防御性断言：

```java
if (taker.remainingQuantityLots == 0) {
  taker.markFilled();
} else if (policy == ExecutionPolicy.FOK) {
  throw new IllegalStateException(
      "FOK preflight and execution disagreed");
}
```

这个异常不是正常业务拒绝，而是内部不变量破坏，应被裁判分类为 `SYSTEM_ERROR` 并失败关闭。不要在这里生成 `FOK_NOT_FILLABLE`；一旦 Accepted 已经发生，再退回 pre-accept rejection 就会制造自相矛盾的历史。

## 五种错误设计分别破坏什么

### 先成交，不足再回滚

会泄漏 Trade、改变 maker FIFO 或终态，并让异常窗口暴露部分业务效果。FOK 原子性不能靠补偿模拟。

### 只看最佳价位

最佳档不够但第二、第三档仍在 limit 内时会错误拒绝。手算中的 BUY 101×5 正是跨两档才满足。

### 统计整本对手盘

把 Ask 101 计入 BUY 100，会接受后在真实 match 中留下余量，触发 preflight/execute 不一致。

### 用 `long` 累加总深度

合法单笔数量相加会溢出。逐笔扣减 required 才能把中间值保持在请求数量范围内。

### 先占用 ID 或 sequence 再预检

不足 FOK 的晚到 Cancel 会变成 terminal，或同 ID 无法作为首次合法请求；后续订单的 acceptance sequence 也会出现洞。

## 练习：构造一个会击穿累计深度的边界

设：

```text
maker A remaining = Long.MAX_VALUE / 2 + 1
maker B remaining = Long.MAX_VALUE / 2 + 1
FOK quantity       = Long.MAX_VALUE
```

两笔 maker 都在同一可成交价位。回答：

1. `A + B` 用 `long` 求和会发生什么；
2. 逐笔扣减 `required` 的每一步是多少；
3. 实际成交后哪笔 maker 还有多少余量；
4. 为什么 reference 使用 BigInteger 仍不应复制 production 的 TreeMap 遍历。

预期：先用 A 后，required 变为 `Long.MAX_VALUE / 2`；B 单独已经足够，因此预检成功。真实成交消耗 A 全部，再从 B 消耗 `Long.MAX_VALUE / 2`，B 剩 1。这个 case 同时证明不会溢出、不会跳过 FIFO，也不会多吃一个 lot。

再写 SELL 镜像：Bid 100×1、Bid 99×5，SELL limit100 quantity2 必须拒绝，因为 Bid 99 低于卖方最低限价；把 limit 改成99、quantity6 才能全成。

## 本篇的可验证停止点

聚焦运行 production 的 FOK 测试：

```bash
./gradlew :matching-core:test \
  --tests '*SingleInstrumentExecutionPolicyTest.insufficientFokHasNoBusinessEffectAndDoesNotReserveSequenceOrIdentity' \
  --tests '*SingleInstrumentExecutionPolicyTest.fokPreflightSpansLevelsWithoutOverflowAndThenFillsExactly' \
  --no-daemon
```

再运行独立 reference 的 M04 测试，确认线性表示对跨价位、SELL 镜像和大数量给出相同公开 outcome：

```bash
./gradlew :matching-reference:test \
  --tests '*M04LinearReferenceModelTest' \
  --no-daemon
```

当前整仓 testkit 尚未完成 M04 adapter、Golden/property judge 与 evidence 合同，因此这些局部测试不能被称为 `m04Check` 完成，更不能据此创建 complete tag。

本篇停止时，FOK 只有两种合法业务效果：pre-Accepted `FOK_NOT_FILLABLE` 且零状态变化，或 `Accepted → Trade+` 且完整 FILLED。下一篇会处理另一种 pre-Accepted 策略门：**Post-only 只要在命令开始时会 touch/cross 最佳对手价，就必须在占用身份前拒绝；不成交时则完整挂单。**
