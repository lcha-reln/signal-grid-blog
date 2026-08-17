---
title: "订单簿做市：价差、库存、逆向选择与合规边界"
description: "从订单簿双边报价出发，解释价差收益、库存偏移、逆向选择、Delta 与 VaR 的边界，并区分自成交、洗售交易和合规交叉交易。"
date: 2026-03-10T10:00:00+08:00
updated: 2026-08-17T14:10:00+08:00
categories:
  - 交易系统
tags:
  - 做市
  - 订单簿
  - 库存风险
  - 逆向选择
  - 合规
series: trading
seriesOrder: 120
permalink: market-making-mechanics-and-strategies
featured: false
draft: false
---

订单簿做市不是“同时挂一个买单和一个卖单，就稳定赚到中间价差”。报价成交后，做市商获得库存；在下一次对冲或反向成交前，库存会暴露在价格、基差、波动率、延迟和流动性风险中。主动吃单者还可能比报价方更早知道价格即将变化，这就是逆向选择。

本文是交易系统学习路径的 Chapter 14，也是系统综合章。它会用到 [订单簿与自成交保护](/signal-grid-blog/posts/order-book-and-self-trade-prevention/)、[行情数据管线与订单簿重建](/signal-grid-blog/posts/market-data-pipeline-and-order-book-reconstruction/)、[订单委托与执行策略](/signal-grid-blog/posts/order-types-and-execution-strategies/) 以及 [仓位生命周期与盈亏](/signal-grid-blog/posts/position-lifecycle-and-pnl/) 中的概念。

> 本文讨论市场结构、系统控制与合规边界，不构成投资、交易、收益或策略建议。任何做市安排都必须服从适用法律、交易场所规则、客户授权和内部风险限额。

## 1. 先区分“Maker 角色”和注册做市商

在连续限价订单簿中，预先挂在簿上的限价单是 resting order；后来到达并与其成交的订单是 aggressor。前者在这笔成交里扮演 maker，后者扮演 taker。这个撮合角色不等于法律或交易所规则中的“注册做市商”。

注册做市商可能承担持续双边报价、最小数量、最大报价距离或异常状态报告等义务。义务由市场和产品规则决定。普通参与者偶尔提供流动性，并不会自动获得做市商身份或同样的权利义务。

```mermaid
flowchart LR
  BID2["买价 99.94"] --> BID1["最优买价 99.95"]
  BID1 --> SPREAD["买卖价差"]
  SPREAD --> ASK1["最优卖价 100.05"]
  ASK1 --> ASK2["卖价 100.06"]
  SELL["主动卖单"] -->|"击中 resting bid"| BID1
  BUY["主动买单"] -->|"击中 resting ask"| ASK1
  BID1 -. "成交后库存增加" .-> INV["做市库存"]
  ASK1 -. "成交后库存减少" .-> INV
```

在价格—时间优先的订单簿里，成交价通常是簿上 resting order 的价格，而不是最优买卖价的中点。做市系统首先要正确维护订单状态、队列位置和成交回报，之后才能谈报价策略。

## 2. 价差是毛收入来源，不是无风险利润

一次完整的买低卖高可以获得实现价差，但真实 PnL 更接近：

```text
做市 PnL
  = 已实现价差
  + 手续费返还
  + 库存盯市盈亏
  - 交易费用
  - 逆向选择损失
  - 对冲与融资成本
  - 滑点和运行损失
```

如果买单成交后价格立刻继续下跌，账面上的半个价差可能远小于库存损失。反过来，库存也可能因价格有利变动产生收益，但那是方向暴露的结果，不能全部归因于做市能力。

报价宽度通常需要覆盖：短期波动、订单到达强度、撤改单延迟、对冲成本、手续费、库存容量以及知情交易概率。市场压力上升时扩大价差、缩小数量或暂停某些层级，是风险响应；是否允许暂停以及持续报价比例，则受做市协议约束。

## 3. 库存 skew：报价中心应朝减仓方向移动

设参考中间价为 `m`，目标库存为 `q*`，当前库存为 `q`。一个教学化的报价中心可以写成：

```text
reservationPrice = m - k × (q - q*)
bid = reservationPrice - halfSpread
ask = reservationPrice + halfSpread
```

其中 `k > 0` 表示库存惩罚强度。这个式子不是生产策略，却能清楚说明 skew 的方向：

- `q > q*`，库存偏多：报价中心下移。Bid 变低，降低继续买入的吸引力；Ask 也变低，更积极地卖出库存。
- `q < q*`，库存偏空：报价中心上移。Bid 变高，更积极地买回库存；Ask 也变高，降低继续卖出的概率。

例如中间价 100.00、半价差 0.05：中性报价是 `99.95 / 100.05`。若库存偏多使 reservation price 下移到 99.98，报价变为 `99.93 / 100.03`——两边都下移，而不是一边提高、一边降低。真实系统还会分别改变两侧数量、价差和层数。

```mermaid
flowchart TD
  FEED["行情与成交回报"] --> FAIR["参考价与短期风险"]
  POS["当前库存 q"] --> SKEW["库存偏移"]
  TARGET["目标库存 q*"] --> SKEW
  FAIR --> QUOTE["报价中心 + 半价差"]
  SKEW --> QUOTE
  LIMIT["头寸 · Delta · 损失 · 消息率限额"] --> QUOTE
  QUOTE --> ORDERS["双边价格与数量"]
  ORDERS --> EX["交易场所"]
  EX --> FILL["成交 / 撤单 / 拒单"]
  FILL --> POS
  FILL --> FEED
```

库存控制必须使用**已确认成交后的真实仓位**，不能只根据本地挂单推测。断线重连、部分成交和重复回报都可能让本地库存漂移，所以订单、成交与仓位需要可重放的状态机。

## 4. 逆向选择与延迟决定“赚到的价差”是否真实

当主动买方在价格即将上涨前击中 Ask，或主动卖方在价格即将下跌前击中 Bid，做市商虽然获得名义价差，却在随后价格变化中处于不利一侧。这种成交后的不利价格移动可用于衡量 adverse selection。

系统可按固定时间窗记录 markout：

```text
买入成交 markout(Δt) = referencePrice(t + Δt) - buyFillPrice
卖出成交 markout(Δt) = sellFillPrice - referencePrice(t + Δt)
```

正负号定义可以调整，但必须全系统一致，并区分 100 毫秒、1 秒、10 秒等不同时间窗。单看成交时的 spread capture，会把稍后发生的逆向选择损失藏起来。

延迟风险来自行情到达、策略计算、订单发送、撮合排队和撤单生效之间的时间差。行情陈旧时，最危险的动作往往不是“没抢到队列”，而是旧报价仍可被别人执行。因而风控需要在本地行情过期、仓位回报缺口、交易所限流或时钟漂移时撤销报价并阻止自动恢复。

## 5. Delta 为零不等于无风险，VaR 也不是最大损失

Delta 描述组合价值对标的价格小幅变化的一阶敏感度。期权组合在某一时刻 `Delta ≈ 0`，只表示局部一阶方向暴露较小，并不消除：

- Gamma：价格变化后 Delta 自身改变；
- Vega 与波动率曲面风险；
- Theta 与持有成本；
- 跳跃、基差与相关性风险；
- 离散对冲、滑点和流动性不足；
- 模型、行情、执行和操作风险。

VaR（Value at Risk）也不应定义为“一天内最大潜在损失”。它是在给定持有期、置信水平和模型假设下的损失分位数。例如“一日 99% VaR 为 100 万”表示模型估计约有 1% 的情形损失会超过 100 万，并不表示损失上限是 100 万。

因此，做市风险面板至少要同时观察：

| 指标 | 回答的问题 | 不能替代什么 |
| --- | --- | --- |
| 净库存与名义价值 | 当前方向敞口有多大 | 期权非线性风险 |
| Delta / Gamma / Vega | 局部敏感度如何变化 | 跳跃和流动性压力 |
| 实现价差与 markout | 成交质量和逆向选择如何 | 极端尾部损失 |
| VaR | 模型分布下的损失分位数 | 最大损失与压力测试 |
| 压力情景 | 价格跳跃、基差和流动性枯竭下会怎样 | 日常限额与实时阻断 |

生产限额应包含硬头寸上限、单边成交速率、累计损失、行情新鲜度、订单消息率和 kill switch；VaR 只是其中一个聚合视角。

## 6. 自成交、洗售交易与交叉交易不是同义词

三个术语的交集很大，但法律和系统含义不同：

| 概念 | 核心事实 | 是否当然违法 | 系统控制 |
| --- | --- | --- | --- |
| 自成交 / self-match | 同一实益所有人或同一识别组的买卖订单相互成交 | 不应只靠一次机械匹配下结论；意图、频率与市场规则重要 | STP ID、账户所有权映射、撤单策略、监控 |
| 洗售交易 / wash trade | 缺乏真实市场头寸或价格竞争意图，制造交易外观；常伴随实益所有权未变化 | 在适用的证券、期货和交易所规则下通常被禁止 | 行为监控、关联账户分析、调查与审计证据 |
| 交叉交易 / cross trade | 经纪商或场所在买卖客户订单之间直接匹配 | 不当然等于洗售；可能受定价、优先权、最佳执行、报告与授权规则约束 | 合规工作流、价格校验、客户与订单隔离、报告 |

```mermaid
flowchart TD
  BUY["买订单"] --> OWNER["实益所有权与策略组映射"]
  SELL["卖订单"] --> OWNER
  OWNER --> SAME{"是否属于同一 STP 范围"}
  SAME -->|"是"| PREVENT["撮合前取消新单、旧单或双方"]
  SAME -->|"否"| MATCH["按价格与时间规则继续撮合"]
  PREVENT --> LOG["记录触发原因与订单关联"]
  MATCH --> SURV["成交后行为监控"]
  LOG --> SURV
  SURV --> REVIEW{"是否存在反复自匹配、虚假量或预先安排迹象"}
  REVIEW -->|"是"| CASE["合规调查与证据留存"]
  REVIEW -->|"否"| KEEP["持续监控"]
```

STP 是撮合前的机械保护，不是完整的合规结论。若不同账户、不同通道或不同清算关系没有映射到共同所有权，STP 可能漏掉关联订单；反过来，独立决策者的偶发自匹配也需要结合规则和事实判断。系统必须同时保留订单意图、操作者、策略实例、所有权映射版本和成交上下文。

## 7. 一个可运营的做市系统

最小生产闭环至少包含：

1. **行情状态机**：从快照和增量恢复可验证的订单簿，检测序列缺口与陈旧行情；
2. **参考价模块**：组合盘口、外部参考和质量标记，不在输入缺失时静默沿用旧值；
3. **报价引擎**：计算价格、数量、层级、库存 skew 和撤改优先级；
4. **订单状态机**：以交易所回报为准处理 pending、open、partial fill、cancel 和 reject；
5. **实时风控**：在报价前和成交后检查库存、Greek、损失、消息率及信用限额；
6. **对冲执行**：把对冲成本、基差和失败状态反馈给报价，而不是假设立即无成本成交；
7. **合规监控**：STP、关联账户、异常撤单、虚假量和 cross-trade 工作流；
8. **审计与回放**：保留输入行情、模型版本、决策原因、订单因果链和人工操作。

关键验收场景包括：单边连续成交后 skew 方向正确；行情断流时全部报价在时限内失效；撤单与成交交叉时库存不丢失；Delta 为零但 Gamma/Vega 超限时仍被阻断；STP ID 缺失或所有权映射过期时默认拒绝高风险报价。

## 8. 核心结论

- Maker 是一笔成交中的流动性角色，注册做市商则可能承担市场规则义务。
- 价差只是毛收入来源；库存、逆向选择、费用和对冲成本决定最终 PnL。
- 库存偏多时报价中心下移，库存偏空时上移；不能用相反方向同时“吸引买卖双方”。
- `Delta = 0` 只是局部一阶中性，VaR 是给定持有期和置信水平下的分位数，都不代表无风险或最大损失。
- 自成交是机械事实，wash trade 涉及非真实交易意图，cross trade 可以是受规则约束的合法撮合；三者不能混用。

## 官方参考

- [Coinbase Exchange：价格—时间优先、resting order 成交价与 STP](https://docs.cdp.coinbase.com/exchange/concepts/matching-engine)
- [Nasdaq Rulebook：注册股票做市商的双边报价义务](https://listingcenter.nasdaq.com/rulebook/nasdaq/rules/Nasdaq%20Equity%202)
- [CME Group：Rule 534 Wash Trade FAQ 与自成交判断](https://www.cmegroup.com/tools-information/lookups/advisories/market-regulation/CMEGroup_RA1308-5.html)
- [CME Group：Globex Self-Match Prevention FAQ](https://www.cmegroup.com/solutions/market-access/globex/trade-on-globex/faq-self-match.html)
- [SEC：Investment Company Cross Trading 的规则边界](https://www.sec.gov/newsroom/speeches-statements/investment-management-statement-investment-company-cross-trading-031121)
- [Federal Reserve：Value-at-Risk 的监管定义](https://www.federalreserve.gov/frrs/regulations/section-217202-definitions.htm)
