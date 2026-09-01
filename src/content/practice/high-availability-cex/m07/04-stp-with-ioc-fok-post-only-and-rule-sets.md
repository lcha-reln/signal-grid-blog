---
title: "M07·04：组合 STP、IOC/FOK/POST_ONLY 与版本化规则"
description: "冻结 FOK 的 STP-aware 只读预演、POST_ONLY 的原始盘口优先级、IOC 余量原因，以及 rule/mode guard 与 STP 的组合顺序。"
date: 2026-08-31T16:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M07
lessonOrder: 40
permalink: stp-with-ioc-fok-post-only-and-rule-sets
tags:
  - 撮合引擎
  - STP
  - ExecutionPolicy
draft: false
---

> 本篇按 annotated [`course/m07-start`](https://github.com/lcha-reln/cex-matching/tree/course/m07-start)、annotated [`course/m07-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m07-complete) 以及完成 evidence 校准。完成 tag peeled 到 `8e9c147b12bfb6b55e69ff04ecfe3aa4c510ed23`；文中的优先级已由固定/生成历史真实执行。

STP 单独看已经有三条清晰路径，和 GTC/IOC/FOK/POST_ONLY、M05 rule set、M06 market mode 组合后却会出现“两个都合理”的答案：FOK 能不能把将被取消的 self maker 算作流动性？POST_ONLY 能不能先取消 self maker 再挂单？停市时是否还要扫描盘口决定 FOK 错误？

M07 用一个完整优先级消除歧义：**rule/band/mode 仍在盘口策略预检之前；FOK 按 STP 后真实可成交路径只读模拟；POST_ONLY 永远看原始对手簿，不能借 CANCEL_MAKER 把 taker 变成 maker。**

## 完整决策链只新增一个 STP 段

冻结顺序是：

```text
M00 field validation
→ ExecutionPolicy validation
→ STP group validation
→ STP policy validation
→ group/policy pair validation
→ duplicate orderId
→ expected active RuleSet
→ active order-entry price band
→ M06 MarketMode admission
→ POST_ONLY raw-book / FOK STP-aware precheck
→ accept and execute
```

每个位置都有可观察意义：

| 同时存在的错误                              | 必须返回                    |
| ------------------------------------------- | --------------------------- |
| invalid quantity + invalid STP group        | M00 field error             |
| invalid ExecutionPolicy + invalid STP token | execution-policy error      |
| invalid STP pair + duplicate id             | `INVALID_STP_INSTRUCTION`   |
| duplicate id + stale expected rule          | `DUPLICATE_ORDER_ID`        |
| stale expected rule + out-of-band price     | `RULE_SET_MISMATCH`         |
| out-of-band + `CANCEL_ONLY`                 | `PRICE_OUTSIDE_ACTIVE_BAND` |
| valid order + `HALTED` + non-fillable FOK   | `MARKET_NOT_OPEN`           |

M07 不能为了 STP 把 mode guard 移到 rule/band 前面，也不能在 mode 拒绝前运行 FOK/Post-only/STP 的业务扫描。受限模式下的 valid Place 必须零盘口副作用地返回 M06 的 `MARKET_NOT_OPEN`；这里禁止的是策略预检和 mutation，不是否定构造返回 snapshot 或执行内部一致性断言所需的只读观察。

## GTC：由 disposition 决定是否还有 remainder

GTC 真实扫描后的收口规则是：

- `CANCEL_TAKER`：命中 self 后取消全部 taker remainder，停止且不 Rest；
- `CANCEL_BOTH`：同样取消全部 taker remainder，停止且不 Rest；
- `CANCEL_MAKER`：taker 继续扫描；结束时若仍有正余量，按原 GTC 语义 Rest；
- 未命中 STP：完全继承 M04 GTC 行为。

STP 不创建第五种 ExecutionPolicy。它是 pair 冲突时的 disposition，GTC 仍负责“正常扫描结束后正余量是否可入簿”。

## IOC：区分普通未成交余量与 STP 终止

IOC 在没有 STP 终止时继续使用 M04 冻结的 `IOC_REMAINDER`：

```text
Accepted
→ Trade / CANCEL_MAKER STP scan
→ positive non-STP remainder
→ canceled with IOC_REMAINDER
```

若 `CANCEL_TAKER` 或 `CANCEL_BOTH` 命中 self，取消原因来自 STP disposition，不得伪装成普通 IOC remainder：

```text
Accepted
→ optional prior non-self Trade
→ SelfTradePrevented(disposition, exact takerCanceled)
→ stop
```

这两种路径在数量上都可能使 taker 归零，但审计含义不同。当前普通 IOC 事件的精确 Java 形状是：

```text
MatchingEvent.RemainderCanceled(
  AcceptanceSequence sequence,
  OrderId orderId,
  Side side,
  PriceTicks priceTicks,
  QuantityLots canceledQuantityLots,
  RemainderCancelReason reason,
  RuleSetIdentity admissionRuleSet
)
```

这里 `reason` 必须为 `IOC_REMAINDER`。STP 终止则只以最后一个 `SelfTradePrevented` 表达，其中 `takerCanceledQuantityLots` 是当时完整余量；后者**不再追加** `RemainderCanceled`，否则一个余量会被终结两次。当前 execution rule 不重复放进 `RemainderCanceled`，而由 `ExecutionBatch.context.activeRuleSet` 归因。

## FOK 不能统计 raw self liquidity

FOK 的承诺是“Accepted 之后完整成交”。因此它必须在 Accepted 前只读回答：沿真实价格时间扫描、应用当前 taker 的 STP policy 后，是否还能完整成交？

### `CANCEL_TAKER` / `CANCEL_BOTH`

预演从最佳 maker 开始累计非同组成交量。只要在所需数量尚未凑满时遇到同组 maker，真实执行就会取消 taker 并停止，所以结果必须是：

```text
PlaceRejected(FOK_NOT_FILLABLE)
no Accepted
no Trade / SelfTradePrevented
no maker cancellation
no order-registry entry / AcceptanceSequence consumption
ApplicationSequence still advances once
```

如果先前非同组 maker 已经足额，真实 taker 会在到达 self maker 前 FILLED；后面的 self maker与这条命令无关，FOK 可以成功。

反例：FOK qty=5，先遇 non-self qty=2，再遇 self qty=10。raw book 有 12，但 `CANCEL_TAKER/BOTH` 真实路径在 2 后终止，因此不可填满。把 self qty=10 加进可成交量会让 Accepted 后无法兑现全成。

### `CANCEL_MAKER`

预演把同组 maker 视为“将被完整取消并继续”，只统计后续非同组流动性：

```text
self maker       → virtual skip/remove, add 0 fill
different maker  → add min(remaining need, maker remaining)
continue across levels until full or price no longer crosses
```

只有非同组流动性足额才 Accepted。Accepted 后真实扫描会在相同位置产生 `SelfTradePrevented(CANCEL_MAKER)`、终止那些 maker，并完成所有非同组成交。

若不足，整个预演是只读的：连本来会被 `CANCEL_MAKER` 终止的 maker 也必须原样保留。不能边预演边删除，再用 `FOK_NOT_FILLABLE` 返回；那是“拒绝但改簿”。

冻结的 `FOK_STP_AWARE_ATOMICITY` 用 BUY 和 SELL 两个方向钉住这个差别：

| 输入                                                                 | 正确结果                                            |
| -------------------------------------------------------------------- | --------------------------------------------------- |
| self ask 2@100 在 external ask 3@101 之前；BUY FOK 4、`CANCEL_TAKER` | `FOK_NOT_FILLABLE`，两张 maker 均不变               |
| 同一盘口；BUY FOK 3、`CANCEL_MAKER`                                  | 接受；STP 取消 self ask 2，再与 external ask 成交 3 |
| self bid 2@101 在 external bid 4@100 之前；SELL FOK 4、`CANCEL_BOTH` | `FOK_NOT_FILLABLE`，两张 maker 均不变               |

最后一行很关键：SELL 并不是另一个算法，它只是按 bid 价格从高到低执行相同的“在填满前遇 self 即失败”规则。

## FOK 预演与真实扫描必须同序

预演如果只按价位聚合数量，会漏掉同价队列里的 self maker 位置。考虑同价顺序：

```text
A non-self qty=2
B self     qty=3
C non-self qty=5
FOK need=5
```

- `CANCEL_TAKER/BOTH`：A 后遇 B，尚缺 3，因此拒绝；不能跳到 C；
- `CANCEL_MAKER`：A + virtual-cancel B + C，可满足，接受后真实执行；
- raw quantity aggregation：错误地把 10 全算作同质流动性。

production 与 independent reference 必须各自实现 maker-by-maker STP-aware simulation，再由第三账本验证 FOK rejection 零突变和 success 全成。两边复用同一个 liquidity helper 会共享同一顺序缺陷。

## POST_ONLY 永远先看原始对手簿

POST_ONLY 的问题不是“应用 STP 后还能不能 Rest”，而是“当前订单如果进入撮合，是否会触碰或穿过任一已有对手价”。因此检查对象是**原始 book**：

```text
if best opposite price touches/crosses taker limit:
  PlaceRejected(POST_ONLY_WOULD_TAKE)
```

这与 maker group 无关。即使最佳 maker 同组、taker policy=`CANCEL_MAKER`，也必须在 Accepted 前拒绝，不能先删除 maker 再把 taker Rest：

```text
wrong: raw cross → STP cancels self maker → no cross remains → Rest
right: raw cross → POST_ONLY_WOULD_TAKE, all state unchanged
```

正确拒绝没有 `SelfTradePrevented`，maker 不取消，taker 不进入 registry、不消耗 acceptance sequence；但这条被应用的命令仍占一个 application sequence。冻结 fixture 同时检查同组 BUY `CANCEL_MAKER` 触碰 ask 被拒，以及不同组 SELL 穿过 bid 被拒，防止实现只在一侧执行 raw-book guard。`M07-POST-ONLY-RUNS-STP-FIRST` mutant 专门反对把 STP 放在该 guard 前面。

## RuleSet attribution 贯穿 STP 事件

M05 允许旧 maker 在新规则激活后 grandfather。`SelfTradePrevented` record 精确携带：

```text
maker admission RuleSetIdentity
taker admission RuleSetIdentity
current execution RuleSetIdentity
```

若 maker 在 bootstrap rule 下入簿，之后激活 v1，v1 下的同组 taker 命中它：maker admission 仍应是 bootstrap，taker admission 与 execution 是 v1；`CANCEL_MAKER/BOTH` 不能改写 maker 历史。冻结的 `RULE_MODE_ATTRIBUTION_FAILURE_ATOMICITY` 则先激活 v1、再让 maker 与 taker 都在 v1 下进入，所以三个字段都为 v1；不要把“字段必须存在”误写成“这条固定 history 必须出现三个不同值”。更复杂的 grandfather witness 要由完成 coverage 报告给出后才能声称已覆盖。

rule guard 发生在 mode 与盘口预检之前：stale `expectedActive` 不扫描 STP，out-of-band price 不产生任何 self 事件。规则激活本身不重新计算已有订单 group，也不触发 STP；只有未来进入扫描的 taker 才执行 pair 判断。

## MarketMode 仍拥有既定位置

三种 mode 对 Place 的结论不因 STP 变化：

| mode          | valid STP Place                 |
| ------------- | ------------------------------- |
| `OPEN`        | 继续 policy/STP precheck 与执行 |
| `CANCEL_ONLY` | `MARKET_NOT_OPEN`               |
| `HALTED`      | `MARKET_NOT_OPEN`               |

因此 `HALTED` 中提交“必然触发 CANCEL_MAKER 的 FOK”仍只是 mode rejection，不能借 Place 清掉 self maker。运维清簿只能走 M06 `HALTED`-only Mass Cancel；STP 不是控制面入口。

## 一张组合结果表

| ExecutionPolicy | `CANCEL_TAKER/BOTH` 遇 self | `CANCEL_MAKER` 遇 self                       | Accepted 前特殊 guard       |
| --------------- | --------------------------- | -------------------------------------------- | --------------------------- |
| GTC             | 终止 taker，不 Rest         | 取消 maker、继续，可 Rest                    | 无                          |
| IOC             | STP 原因终止 taker          | 取消 maker、继续，普通余量用 `IOC_REMAINDER` | 无                          |
| FOK             | 未凑满前遇 self 即不可填满  | 只读跳过 self，只计非 self                   | STP-aware 全量预演          |
| POST_ONLY       | 不进入 STP                  | 不进入 STP                                   | raw book touch/cross 即拒绝 |

这张表不是四套独立引擎。共同的 raw/rule/mode guard 后，POST_ONLY 和 FOK分别执行自己的只读 admission，再进入同一个真实扫描状态机。

## 本地检查与待完成证据

正式 M07 仓库使用：

```bash
./gradlew clean build --no-daemon
./gradlew m07Check --no-daemon
```

冻结 16/72 history 覆盖 FOK 三 disposition、POST_ONLY 的 BUY/SELL raw-book rejection、IOC 两种终结语法，以及 v1 rule attribution 与 `CANCEL_ONLY` mode 优先级。mode 义务是“先拒绝，不进入 FOK/Post-only/STP 扫描且不改簿”，不是禁止内部 invariant/snapshot 读取。complete 裁判又完成三方 differential、24/24 witness 与 mutant replay；M07F1 digest 为 `sha256:4c0675ee77458fb10b28e3c13d48767a653a41e922f42264f8d0f76aa5644176`。

网页只展示已发布的静态边界与 evidence；它不能在远端编译学习者 Java，也不能把页面预测当作 FOK 零副作用的证明。

## 本篇停止点

现在 STP 与四种 ExecutionPolicy、M05 rule 和 M06 mode 得到唯一组合顺序：FOK 只读模拟真实 STP 路径，POST_ONLY 守原始盘口，IOC 区分普通余量与 STP 终止，旧规则归因不漂移。

最后一篇将这些合同交给独立模型、第三账本、生成 history 与八个 semantic mutants，并明确有限证据能支持和不能支持的声明。
