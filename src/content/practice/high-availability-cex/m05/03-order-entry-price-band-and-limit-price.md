---
title: "M05·03：入场价格带不是用户限价，决策优先级必须唯一"
description: "把 active order-entry band 插入 Place 决策链，固定 stale rule、越界、FOK 与 Post-only 的先后，并保留 maker-price 限价保护。"
date: 2026-08-31T13:20:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M05
lessonOrder: 30
permalink: order-entry-price-band-and-limit-price
tags:
  - 撮合引擎
  - PriceBand
  - 限价单
draft: false
---

> M05 仍然只有 `BTC-USDT`、整数 tick 与 M04 的四种执行策略。本篇实现的是冻结合同中的 order-entry absolute band，不引入参考价、百分比公式、market order、operating mode 或 Mass Cancel。完成坐标是 annotated [`course/m05-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m05-complete)（`e593c13292c0f97665f90239a4c8d4a1ca40f579`），逐命令结果见[公开 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m05/evidence/manifest.json)。

规则已经能在精确栅栏切换，接下来必须回答 Place 的两个不同问题：

1. 用户愿意接受的最差成交价是什么？
2. 交易场所当前是否允许这个 limit price 进入撮合器？

前者是 M00 起就存在的订单 `priceTicks`；后者是 M05 的 active entry band。把它们混成一个“价格保护”概念，会在越界、成交价与老订单处理上制造不一致。

本篇证明：**每条 Place 先通过唯一的决定优先级，再由 active artifact 判断报价是否处于 inclusive band；通过 band 绝不放松订单限价，拒绝 band 也不占用订单身份或 acceptance sequence。**

## 两个价格约束保护的主体不同

以 active band `[95,105]` 为例：

- BUY @ 100 表示用户最多愿意支付 100，同时场所允许 100 入场；
- SELL @ 100 表示用户最低愿意接受 100，同时场所也允许 100 入场；
- BUY @ 110 可能是用户主动追价，但场所仍应以 `PRICE_OUTSIDE_ACTIVE_BAND` 拒绝；
- SELL @ 90 可能是用户主动降价，但同样不能绕过场所入场规则。

entry band 对 BUY 与 SELL 使用同一个绝对区间，不根据 side 反转。包含性也完全对称：`95` 与 `105` 都合法，`94` 与 `106` 都拒绝。

它不是执行价 band。通过准入后，撮合继续采用 M01 的 maker-price 规则：成交价来自 resting maker，并且仍满足 taker 的 limit protection。下一篇会看到，一个在旧规则下合法入簿、后来落在新 band 外的 maker 仍可按原价格成交。

## 先冻结决定树，再写 if 分支

M05 的 governed Place 必须遵守完整顺序：

```text
1. M00_FIELD_VALIDATION
2. EXECUTION_POLICY_VALIDATION
3. DUPLICATE_ORDER_ID
4. EXPECTED_ACTIVE_RULE_SET
5. ACTIVE_ORDER_ENTRY_PRICE_BAND
6. POLICY_STATE_PRECHECK
7. ACCEPTANCE_SEQUENCE_CAPACITY
8. ACCEPT_AND_EXECUTE
```

这不是代码风格建议，而是可观察业务合同。同一输入可能同时触犯多个条件，排在前面的原因必须唯一。

例如，一个已存在的 `orderId=40` 再次用 bootstrap v0 identity、`priceTicks=1` 提交。在 active v1 `[90,110]` 下，它同时 duplicate、stale 且越界。正确结果只能是 `DUPLICATE_ORDER_ID`，因为订单身份优先级来自 M02/M04，M05 不得重写历史语义。

再比如，active band 是 `[95,105]`，一张 BUY FOK @ 90 同时越界且无法完全成交。正确结果是 `PRICE_OUTSIDE_ACTIVE_BAND`，而不是 `FOK_NOT_FILLABLE`：场所准入发生在流动性策略预检之前。

## Governed 与 legacy 入口只差一个调用方 fence

新增入口表达调用方对规则版本的显式预期：

```java
public record GovernedPlaceLimitOrderRequest(
    PlaceLimitOrderRequest order,
    RuleSetIdentity expectedRuleSet) {}

ExecutionBatch placeGoverned(GovernedPlaceLimitOrderRequest request);
```

`placeGoverned` 在 duplicate 后比较 `expectedRuleSet` 与 active identity。若不相等，返回 singleton `PlaceRejected(RULE_SET_MISMATCH)`，不继续读取 band 或流动性。

M00～M04 的 `place` 与 `placeRequest` 仍可调用。为了保持 source compatibility，它们没有 expected identity，因此不执行第 4 步；但它们**仍然遵守当前 active band**。只有启动时的 v0 band `[1, Long.MAX_VALUE]` 让既有回归观察到与 M04 相同的结果。若把 legacy 入口永久写成 bypass，新规则就会出现一条未审计的绕过通道。

在 REST 项目中，OpenAPI 可要求客户端回传最近读取到的 rule identity；matching-core 只负责比较完整的 `(version, contentHash)`，不猜“版本一样大概就行”。

## 拒绝是一条结果，但不是一张已接受订单

每个 governed Place 进入 core 后先取得 `ApplicationSequence`。业务拒绝也占用该序列，因为它是可重放命令历史的一部分。但 stale rule 与 out-of-band 都必须满足：

```text
exactly one PlaceRejected
no Accepted / Rested / Trade / RemainderCanceled
no orderId reservation
no AcceptanceSequence consumption
no maker quantity change
no book / registry / market-control mutation
```

“不保留 orderId”很重要。固定场景先用旧 rule identity 提交 `orderId=10`，得到 `RULE_SET_MISMATCH`；随后用当前 identity 重用同一个 id，应被正常接受。若第一次拒绝已经登记身份，第二次会错误地变成 duplicate。

同理，越界 Place 也不能先分配 acceptance sequence 再回滚。回滚看似恢复计数，却容易让 event、registry 与快照看到过一个幽灵序列。正确顺序是：所有准入与策略预检通过，证明 sequence 尚有容量，最后一次性接受并执行。

## Inclusive band 要测四个点，而不是只测中间值

对于 `[90,110]`，BUY 与 SELL 都至少覆盖：

| limit price | 结果 | 原因 |
| ---: | --- | --- |
| 89 | 拒绝 | 低于 lower 一个 tick |
| 90 | 准入 | lowerInclusive 包含 |
| 110 | 准入 | upperInclusive 包含 |
| 111 | 拒绝 | 高于 upper 一个 tick |

实现应保持整数比较：

```java
boolean inside =
    priceTicks.compareTo(active.lowerInclusive()) >= 0
        && priceTicks.compareTo(active.upperInclusive()) <= 0;
```

不要把 tick 转成 `double`，不要在 Matching 内重新计算百分比，也不要根据行情临时移动边界。artifact 已经是上游完成舍入后冻结的绝对整数事实；重放时只能读取它。

`lower == upper` 代表合法的单 tick band，只允许这个精确报价入场。`upper == Long.MAX_VALUE` 也必须安全比较，不能通过 `price <= upper + 1` 这种会溢出的技巧实现。

## stale fence、band 与策略如何组合

可以把核心路径写成显式的 guard chain，每个 guard 只观察它负责的事实：

```java
validateM00Fields(order);
validateExecutionPolicy(order.executionPolicy());

if (registry.contains(order.orderId())) reject(DUPLICATE_ORDER_ID);
if (!expectedRuleSet.equals(active.identity())) reject(RULE_SET_MISMATCH);
if (!active.admits(order.priceTicks())) reject(PRICE_OUTSIDE_ACTIVE_BAND);

precheckFokOrPostOnly(order, book);
ensureAcceptanceSequenceCapacity();
acceptAndExecute(order, active.identity());
```

这个示意省略结果构造，不代表用异常表达业务拒绝。每个 reject 都应形成普通确定结果，并携带本 batch 的 active identity 与 control revision。

M04 的策略语义保持不动：

- GTC 通过 band 后可成交，剩余量入簿；
- IOC 通过 band 后可成交，剩余量取消；
- FOK 先通过 band，再对当前簿做全量可成交预检；
- POST_ONLY 先通过 band，再判断是否会立即成交。

因此 out-of-band FOK 与 POST_ONLY 都不能探测订单簿。一个候选实现若先运行流动性预检，虽然单个例子可能也拒绝，但拒绝原因与可观察顺序已经错误。

## 限价保护在入场后继续成立

假设簿上有 SELL maker @ 98：

- BUY taker @ 100 通过 `[95,105]`，可以在 maker price 98 成交；
- BUY taker @ 97 即使通过 band，也不能越过自己的 limit 去吃 98；
- BUY taker @ 106 即使簿上有更便宜 maker，也先因场所 band 拒绝。

这三个例子分别证明：entry band 不决定执行价、entry band 不替代 taker limit、便宜流动性也不能反向豁免越界入场。

对 SELL 完全镜像：SELL @ 100 可以与 BUY maker @ 102 在 maker price 102 成交；SELL @ 103 不能吃 102；SELL @ 94 在 `[95,105]` 下先被场所拒绝。

## 独立验收矩阵

固定语料已经包含边界、双边对称、duplicate priority 与 band-before-policy 场景。自己的实现还应再构造一组不重复数值，例如 active v7 `[97,103]`：

1. 对 BUY/SELL 分别测试 96、97、103、104；
2. 用 stale v6 identity 提交合法中间价，必须得到 `RULE_SET_MISMATCH`；
3. 用同一个 orderId 以 current v7 重试，必须接受，证明 stale 拒绝未保留身份；
4. 先接受一张 id，再用该 id 提交 stale 且越界请求，必须只得到 duplicate；
5. 对越界 FOK 与 POST_ONLY 保存 book 前后快照，证明没有策略侧观察或变更；
6. 对入场后发生交易的 BUY/SELL 检查 maker price 与各自 limit protection；
7. 每步比较 production 与 independent reference 的 event batch、registry、book、active identity、application/acceptance sequence。

浏览器练习只能让读者选择命令并预测“优先命中哪个 guard”，再揭示仓库内冻结的预期结果；它不在网页里编译 Java，也不能替代本地 `./gradlew m05Check --no-daemon`。

## 本篇停止在新订单准入

价格带现在能确定地约束每张新 Place，但 active 切换时我们还没有扫描旧订单。这不是遗漏，而是 M05 的关键产品选择：entry band 只管入场，不持续重判订单有效性。

下一篇会用跨版本 maker 场景证明 grandfather 语义，并把 maker admission、taker admission 与 active execution identity 同时写入结果，让异步柜台与审计系统能解释一笔跨规则成交。
