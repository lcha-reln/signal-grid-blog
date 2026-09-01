---
title: "M06·03：用全局 AcceptanceSequence 定义确定性 Mass Cancel"
description: "解释批量撤单为何不能依赖买卖方向、价格层或 HashMap 遍历，并用冻结集合与全局接受序列建立唯一事件顺序。"
date: 2026-08-31T15:20:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M06
lessonOrder: 30
permalink: deterministic-mass-cancel-order
tags:
  - 撮合引擎
  - Mass Cancel
  - AcceptanceSequence
draft: false
---

> 本篇按 annotated [`course/m06-start`](https://github.com/lcha-reln/cex-matching/tree/course/m06-start) 的练习合同展开，并以 annotated [`course/m06-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m06-complete) 作为权威完成坐标；complete peeled 到 `854dcf470a9ea8a2765982861b21026be1416258`，对应的[静态 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m06/evidence/manifest.json)已经封存。

把市场切到 `HALTED` 只冻结客户写操作，不会自动删除订单。接下来运维需要一个显式 `MassCancel`，终止当前单交易对内所有正余量、`RESTING` 的订单。

最容易写出的实现是“先遍历 bids，再遍历 asks”，或直接迭代 `ordersById.values()`。两者都可能得到空簿，却不是同一个确定状态机：事件顺序会被边、价格树形状、容器实现甚至哈希种子影响。

本篇证明：**Mass Cancel 的业务顺序只能是全局 `AcceptanceSequence` 升序；冻结待撤集合后，事件与终态都从这一个顺序派生。**

## 最终空簿相同，不代表历史相同

考虑四张互不成交的挂单：

| orderId | side | price | remaining | acceptance sequence |
| --- | --- | ---: | ---: | ---: |
| 101 | BUY | 95 | 2 | 1 |
| 102 | SELL | 105 | 3 | 2 |
| 103 | BUY | 96 | 4 | 3 |
| 104 | SELL | 104 | 5 | 4 |

价格簿的自然遍历可能是：

```text
bids best-first: 103(seq=3), 101(seq=1)
asks best-first: 104(seq=4), 102(seq=2)
```

若照这个顺序发撤单事件，得到 `[3,1,4,2]`。另一实现若先 asks，再 bids，会得到 `[4,2,3,1]`。两者最终 book 都为空，但下游审计、同步投影和重放 hash 不同。

`AcceptanceSequence` 在订单真正 Accepted 时全局唯一且单调，因此唯一合法结果是：

```text
1 → 2 → 3 → 4
```

它与 side、price 和当前容器布局无关，也保留了订单进入撮合核心的历史先后。

## 命令先证明自己处在正确边界

命令类型只携带三个字段：

```java
public record MassCancel(
    ApplicationSequence expectedApplicationSequence,
    MarketMode expectedMode,
    OperatorId operatorId) {
  public MassCancel {
    Objects.requireNonNull(expectedApplicationSequence, "expectedApplicationSequence");
    Objects.requireNonNull(expectedMode, "expectedMode");
    Objects.requireNonNull(operatorId, "operatorId");
  }
}
```

preflight 顺序固定为：

```text
EXPECTED_APPLICATION_SEQUENCE
→ EXPECTED_MODE
→ REQUIRE_HALTED
→ FREEZE_GLOBAL_ACCEPTANCE_ORDER
→ RESULT_AND_SEQUENCE_CAPACITY
→ ATOMIC_TERMINATION
```

前三个 guard 的结果如下：

| 第一处失败 | 事件 | book / registry / fence |
| --- | --- | --- |
| stale application sequence | `Rejected(APPLICATION_SEQUENCE_MISMATCH)` | 原样保留 |
| expected mode 与实际不同 | `Rejected(EXPECTED_MODE_MISMATCH)` | 原样保留 |
| 实际模式不是 `HALTED` | `Rejected(MARKET_NOT_HALTED)` | 原样保留 |

拒绝 batch 只有一个 `MassCancelEvent.Rejected`，消费一个确定 `ApplicationSequence`。它不能产生 `Started`，不能撤一部分订单，也不能写入 `lastMassCancelFence`。

特别注意：`CANCEL_ONLY` 虽允许客户逐单 Cancel，却不允许 operator Mass Cancel。两种能力的风险面不同；批量操作必须先通过显式 `HALTED` 边界。

## 冻结集合，而不是边遍历边删除

production 的冻结代码很短，但每个词都有合同含义：

```java
List<OrderState> frozenOrders =
    ordersById.values().stream()
        .filter(order -> order.lifecycle == Lifecycle.RESTING)
        .sorted(Comparator.comparingLong(order -> order.sequence.value()))
        .toList();
```

它做了四件事：

1. 从 registry 找到所有订单，而不是只看某一边或某个价位；
2. 只选择 `RESTING`，不会重复终止 `FILLED` 或 `CANCELED`；
3. 当前订单必须拥有正余量，这是 registry/book 一致性不变量；
4. 在任何撤销突变前按全局 acceptance sequence 排序并冻结不可变列表。

`HashMap.values()` 可以作为**集合来源**，不能作为**业务顺序来源**。排序后的 list 才是这次命令的规范目标集合。

一个错误实现是：

```java
for (OrderState order : ordersById.values()) {
  if (order.isResting()) {
    cancelAndEmit(order);
  }
}
```

除了遍历不稳定，它还把发现、事件构造和状态突变交织在一起。若中途遇到容量错误或内部不变量失败，前半本书已经被改写。

## 事件顺序由同一冻结列表派生

成功 batch 的骨架是：

```text
Started(count=N)
OrderCanceled(sequence=s1)
OrderCanceled(sequence=s2)
...
OrderCanceled(sequence=sN)
Completed(count=N)
```

其中 `s1 < s2 < ... < sN`。真实实现先按冻结列表构造所有内部事件：

```java
events.add(
    new MassCancelEvent.Started(
        applied.current(), operatorId, marketMode, modeRevision, canceledOrderCount));

for (OrderState order : frozenOrders) {
  events.add(
      new MassCancelEvent.OrderCanceled(
          applied.current(),
          operatorId,
          order.sequence,
          order.orderId,
          order.side,
          order.priceTicks,
          new QuantityLots(order.remainingQuantityLots),
          order.admissionRuleSet,
          activeRuleSet.identity()));
}

events.add(
    new MassCancelEvent.Completed(
        applied.current(), operatorId, marketMode, modeRevision, canceledOrderCount));
```

`Started.restingOrderCount`、中间事件数量与 `Completed.canceledOrderCount` 必须相等。每个中间事件记录的是冻结时的**精确正余量**，不是原始下单量；部分成交过的 maker 只撤剩余部分。

## 一条完整例子的可预测输出

对开头四张订单，若 Change Mode 占用应用边界 5，Mass Cancel 占用边界 6，则事件次序为：

| index | event | application | order sequence | canceled qty |
| ---: | --- | ---: | ---: | ---: |
| 0 | `Started` | 6 | — | count=4 |
| 1 | `OrderCanceled(101)` | 6 | 1 | 2 |
| 2 | `OrderCanceled(102)` | 6 | 2 | 3 |
| 3 | `OrderCanceled(103)` | 6 | 3 | 4 |
| 4 | `OrderCanceled(104)` | 6 | 4 | 5 |
| 5 | `Completed` | 6 | — | count=4 |

所有事件共享同一个 application sequence 和 operator ID。批量大小不会让 `ApplicationSequence` 连跳六次：这是一个命令边界、一个原子结果 batch。

同样，它不会消费或回退 `AcceptanceSequence`。如果撤单前 `nextAcceptanceSequence=5`，撤完仍是 5；以后经安全路径恢复到 `OPEN`，下一张真正 Accepted 的订单仍使用 sequence 5。

## 空簿不是拒绝，而是可审计的成功

市场已是 `HALTED`、book 为空时，合法输出是：

```text
Started(restingOrderCount=0)
Completed(canceledOrderCount=0)
```

它仍消费一个 application sequence，并记录一个 count=0、首尾 acceptance bounds 都为空的 `MassCancelFence`。将空簿返回 `NOTHING_TO_CANCEL` 会让重试语义依赖当前订单数量；直接返回空事件列表则无法证明命令已经应用。

空成功使 operator 可以安全表达“在这个序列边界，我确认全局目标集合为空并完成了 Mass Cancel”。

## 为什么不是循环调用客户 Cancel

下面的伪代码不满足合同：

```text
for each id:
  engine.cancel(id)
```

原因不止性能：

- `HALTED` 中客户 Cancel 本来就必须返回 `MARKET_NOT_CANCELABLE`；
- 每张订单会占一个 application sequence，无法表示单一运维批次；
- 中途失败会留下部分撤销；
- 遍历顺序仍未定义；
- 事件缺少同一个 operator、batch count 与首尾 fence；
- 下游无法区分客户主动撤单与 operator 全局处置。

Mass Cancel 必须是独立领域命令，不是 REST 层批量循环。

## 排序正确还不够，来源集合也必须完整

只遍历当前 price levels 再排序，表面上也能得到 acceptance order，却可能漏掉 registry/book 已经不一致的错误。production 在命令前后运行内部一致性断言：每个 `RESTING` registry entry 必须且只出现于 book，一切 price level 内部保持 FIFO，正余量和订单终态匹配。

确定性合同可以写成：

```text
targets = all registry orders where lifecycle == RESTING
ordered = sort(targets, acceptanceSequence ascending)
events  = Started + map(ordered, OrderCanceled) + Completed
```

reference model应使用独立 flat-list 扫描实现同一数学关系，不能调用 production comparator 或 snapshot helper。第三账本再从事件推导 canceled set，检查它恰好等于命令前所有 resting identity。

## 本地运行跨边、跨价位用例

完成参考坐标包含专门测试：

```bash
git switch --detach course/m06-complete
./gradlew :matching-core:test \
  --tests \
  io.github.lchareln.cex.matching.SingleInstrumentMassCancelTest.successfulMassCancelUsesGlobalAcceptanceOrderAcrossSidesAndPrices \
  --no-daemon
```

再运行整组 Mass Cancel 测试：

```bash
./gradlew :matching-core:test \
  --tests io.github.lchareln.cex.matching.SingleInstrumentMassCancelTest \
  --no-daemon
```

练习时可以故意把 comparator 改为 price 或移除排序，观察固定跨边用例与后续 semantic mutant 是否能给出同一 property fingerprint。不要把 Gradle 异常算作“测试杀死错误实现”；异常属于基础设施或候选执行失败，需要与语义反例分开。

网页 Lab 至多展示冻结 history 和事件，让读者先排出四张订单的顺序再揭示答案。它不执行 Java，也不能通过浏览器交互证明任意容器布局都安全。

## 本篇停止点

我们已经为成功 Mass Cancel 冻结了完整目标集合、全局 acceptance 顺序、一个 application 边界和空簿成功语义。但“先构造事件再逐张修改内存”仍需要严谨解释失败窗口、终态 identity 与 rule attribution。

下一篇补齐这些原子性合同。到目前为止的“原子”只针对单线程内存方法边界；没有 WAL、fsync、进程崩溃恢复、复制或跨服务事务，不能把它外推成 durable atomicity 或高可用。
