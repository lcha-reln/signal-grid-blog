---
title: "保证金风险引擎：权益、维持保证金与标记价格"
description: "从版本化风险快照出发，拆开权益、保证金与价格口径，并建立 Index/Mark 质量状态机、输入降级、增量重算和模型版本的恢复不变量。"
date: 2026-03-10T01:00:00+08:00
updated: 2026-08-28T11:25:00+08:00
categories:
  - 交易系统
tags:
  - 保证金
  - 风险引擎
  - 标记价格
  - 指数价格
  - 强平
  - 账户权益
permalink: margin-metrics-and-mark-price
series: trading
seriesOrder: 80
featured: false
draft: false
---

保证金风险最容易在术语层出错。同一个“保证金率”，有的平台用 `maintenance requirement / effective equity`，数值上升到 100% 触发清算；另一些资料用相反的 `effective equity / maintenance requirement`，数值下降到 100% 才触发。钱包余额、权益、保证金余额和可用保证金也不是可互换的名字。

因此，风险引擎不能先背一个公式再套所有产品。它必须先确定**账户作用域、抵押品规则、价格快照、持仓模式和比率方向**，再计算当前规则版本下的 IM、MM 与风险动作。更重要的是，结果必须说明“这次计算用了哪一组输入、这些输入是否仍有资格驱动权威动作，以及增量计算能否由同一切点重放出来”。

本文是交易系统学习路径的 Chapter 19。[Chapter 15：永续资金费用](/signal-grid-blog/posts/perpetual-funding-rate/) 会改变账户现金与风险缓冲，[Chapter 17：交易账本与双重记账](/signal-grid-blog/posts/trading-ledger-double-entry-accounting-and-reconciliation/) 已把现金流拆成 posted、pending 与 available 等可审计状态，[Chapter 18：数字资产托管与充提](/signal-grid-blog/posts/digital-asset-custody-deposits-withdrawals-reconciliation/) 又划清内部权益与外部资产控制的边界；这里再把账本余额和仓位估值接入同一风险快照。

> 本文讨论风险模型和实现边界，不构成交易建议。所有公式中的费率、档位、价格源和清算步骤都必须以目标平台当期规则为准。

## 任何风险数字都必须绑定同一个快照

在计算任何指标前，应把上下文写成一个版本化输入：

```text
RiskSnapshot {
  accountId,
  accountMode,
  marginMode,
  productVersions,
  collateralRuleVersion,
  riskModelVersion,
  accountSequence,
  priceSnapshotId,
  priceQualityState,
  evaluationId,
  calculatedAt,
  effectiveAt
}
```

同一用户可能同时有 isolated position、按结算币分组的 cross margin，以及跨产品的 portfolio margin。把这些余额全部相加后再套一个公式，会破坏真实的清算边界。

至少要明确：

- 风险是按单仓位、结算币、underlying risk unit 还是全账户计算；
- 哪些资产是合格抵押品，各自 haircut / collateral ratio 是多少；
- 未实现盈亏是否、何时可以计入可开仓额度；
- 活动订单占用多少 IM，是否还产生 order loss；
- 借贷负债、利息、费用和期权价值如何进入分母；
- IM/MM 档位由入场名义还是当前 mark notional 决定。

快照还要固定金额、数量、价格和比率的精度及舍入规则。`calculatedAt` 是系统完成计算的时间，`effectiveAt` 是这组输入在业务时间线上生效的切点，两者不能互换。只有账户序列、价格版本、规则版本与数值口径同时可追溯，重启后的风险引擎才可能从同一输入恢复出同一判断。

`riskModelVersion` 也不能只是一个可覆盖的配置名。一个可回放版本至少要绑定公式实现或制品摘要、输入 schema、参数集、舍入规则、风险单元定义和生效边界。历史事件只保存“当前版本”而不保留旧制品，日后即使找回相同余额和价格，也无法证明得到了当时的风险结果。

## 五个常被混用的量

下面先用一个简化记号建立概念。平台字段名可能不同，不能把示例公式当作 API 标准。

### Wallet Balance

钱包余额 `B` 是已入账现金流的累计结果，例如充值、成交已实现 PnL、手续费和 funding。它通常不包含当前开放仓位随价格变化的未实现 PnL。

### Unrealized PnL

未实现盈亏 `U(P)` 是用指定参考价格 `P` 对开放仓位估值的结果。它可能按 last 显示、按 mark 进入风险，或由 UI 允许切换。

### Equity

在简单单币合约账户中，可先理解为：

```text
equity = walletBalance + unrealizedPnL
```

多资产和期权账户还会加入期权价值、负债与其他调整。重点是：如果 `equity` 已经包含未实现亏损，就不能在“保证金余额”公式里再次减去同一笔亏损。

### Margin Balance / Effective Equity

这是平台认定可以支撑风险的调整后权益。多抵押品账户常见思路是：

```text
adjustedCollateral
  = Σ(assetQuantity × assetIndexPrice × collateralRatio)

effectiveEquity
  = adjustedCollateral
  + eligibleDerivativeValue
  - liabilities
  - haircutLoss
  - orderLoss
  - reservedCharges
```

究竟哪些项已包含在 `marginBalance` 字段中要看平台定义。例如 Bybit UTA 当前将 equity、margin balance、haircut loss、order loss 分开定义，并为 cross 与 portfolio 模式给出不同分母。

### Available Balance

可用保证金回答“还能为新订单占用多少”，而不是“账户总价值是多少”。简化形式可能是：

```text
available = effectiveEquity - totalInitialMargin - frozenOrReserved
```

活动订单、借贷 IM、价格偏离造成的 order loss、手续费缓冲和风控限额都可能继续减少可用值。钱包里看到 1,000 USDT，不代表 1,000 USDT 全都能下单。

```mermaid
flowchart TB
  B["Wallet assets<br/>realized ledger"] --> E["Raw equity"]
  U["Unrealized PnL<br/>under price snapshot"] --> E
  B --> A["Eligible collateral<br/>index value × ratio"]
  A --> X["Effective equity / margin balance"]
  U --> X
  H["Liability · haircut · order loss<br/>reserved charges"] --> X
  X --> AV["Available balance"]
  IM["Initial margin<br/>positions + orders + borrowing"] --> AV
  X --> R["Maintenance-risk ratio"]
  MM["Maintenance margin<br/>tiers + fee buffers"] --> R
```

## IM 与 MM 回答不同问题

### Initial Margin

初始保证金 IM 用于限制新风险的建立。最简单的线性仓位近似为：

```text
positionIM ≈ currentNotional × initialMarginRate
```

但生产计算还可能包含开/平仓费用、活动订单、风险档位和已有对冲。IM 降低到 `notional / leverage` 只在明确的产品假设下成立。

### Maintenance Margin

维持保证金 MM 是维持既有风险所需的最低资源。常见结构是：

```text
totalMM
  = Σ(positionNotional × tierMMR)
  + orderMM
  + borrowingMM
  + liquidationOrCloseFeeBuffer
  + platformAddOns
```

“维持保证金率为 0.5%”通常表示某档位按名义价值计算 0.5% 的维持要求，不表示仓位“最多只能承受 0.5% 的价格波动”或“0.5% 的保证金损耗”。实际缓冲还取决于初始保证金、方向、价格、费用和账户中可共享的权益。

## 先写比率方向，再写 100%

两类常见展示方式互为倒数：

```mermaid
flowchart LR
  E["effectiveEquity"] --> A["Risk consumption<br/>MM / effectiveEquity"]
  M["maintenanceRequirement"] --> A
  E --> B["Margin level<br/>effectiveEquity / MM"]
  M --> B
  A -->|"rises toward threshold"| LA["danger when high"]
  B -->|"falls toward threshold"| LB["danger when low"]
```

若平台定义：

```text
riskRatio = totalMM / effectiveEquity
```

那么比率越高越危险，达到或超过 100% 可能触发清算。若定义为：

```text
marginLevel = effectiveEquity / totalMM
```

则越低越危险，达到或低于 100% 可能触发清算。

接口、监控和文章都应同时记录 numerator、denominator、单位与 comparator。只保存字段名 `MMR=80%`，换平台后几乎必然产生歧义。

## Index、Mark 与 Last 是三种事实，质量状态决定它们能做什么

### Last Price

Last 是本交易场所最近一笔成交价。它适合描述刚刚发生的交易，却可能因单笔小额成交、流动性不足或局部异常快速跳动。

### Index Price

Index 尝试表示外部现货市场中的基础资产价格。一个稳健指数通常需要：

- 明确的成分交易对和权重；
- 报价币换算；
- stale source 检测；
- outlier bounding 或剔除；
- 数据源不足时的降级规则；
- 成分与方法变更的版本记录。

指数不必然“按成交量加权”。OKX 当前公开说明通常使用指定来源的加权价格，并会排除维护或超时来源；其精确成分和算法按指数页面为准。

### Mark Price

Mark 是衍生品风险估值使用的参考价格，目标是减少单个场所短暂异常成交直接触发大规模清算的概率。它不是 index 的别名，也不等于买一卖一中间价。

OKX 当前对期货和永续的公开模型可概括为：

```text
markPrice = indexPrice + movingAverageBasis

movingAverageBasis
  = MA(contractMidPrice - indexPrice)
```

其他平台可能使用不同的 fair-basis、funding basis、边界和取中值算法。不能仅凭算法名称给交易所贴“更安全”或“更危险”的标签；需要按具体产品检验异常源、响应速度、边界和历史变更。

生产系统不应只发布一个 `price`，而应发布带证据的价格事实：

```text
PriceSnapshot {
  instrumentId,
  indexPrice,
  markPrice,
  constituentSetVersion,
  acceptedConstituents,
  rejectedConstituentsAndReasons,
  basisModelVersion,
  sourceWatermarks,
  qualityState,
  validUntil
}
```

其中 `qualityState` 是会约束后续动作的状态机，而不是监控标签：

```mermaid
stateDiagram-v2
  [*] --> Warming
  Warming --> Healthy: 足够成分且时间水位一致
  Healthy --> Degraded: 少量来源 stale / outlier
  Degraded --> Healthy: 连续满足恢复窗口
  Healthy --> Frozen: 无法形成新权威价格
  Degraded --> Frozen: 低于最小来源或偏离上界
  Frozen --> Recovering: 来源恢复并完成回补
  Recovering --> Healthy: 新快照通过连续性校验
  Frozen --> Invalid: 超过最大冻结期限或完整性失败
  Invalid --> Recovering: 人工或协议化恢复
```

状态转移要带原因、观察窗口和恢复滞回，避免某个成分源抖动时在 `Healthy` 与 `Degraded` 之间频繁切换。Index 仍然健康而衍生品盘口 stale 时，系统也许还能发布 index，却不能假装 basis 与 mark 同样健康。

### 输入降级必须改变准入和清算权限

降级策略不能概括成“继续使用上一次价格”。风险增加和风险减少的不可逆性不同，因而需要一张显式决策表：

| 价格状态   | 展示与估值                 | 新增风险                       | 降低风险               | 权威清算                                     |
| ---------- | -------------------------- | ------------------------------ | ---------------------- | -------------------------------------------- |
| `Healthy`  | 发布当前快照               | 按正常限额                     | 允许                   | 按当前模型执行                               |
| `Degraded` | 标记来源缺失并缩短有效期   | 收紧限额、缩量或拒绝高风险请求 | 优先保留               | 仅按预先批准的保守规则与证据执行             |
| `Frozen`   | 显示冻结时间与最后健康版本 | 拒绝                           | 允许可验证的撤单、减仓 | 不得把陈旧价格伪装成新触发；进入专门处置协议 |
| `Invalid`  | 不发布权威估值             | 拒绝                           | 由人工或隔离通道处理   | 暂停自动决策并保全证据                       |

“冻结时绝不清算”同样不是普适答案：若市场已经长时间不可用，继续保留无限风险也可能更危险。正确做法是预先定义保守价格、可用外部证据、人工权限和最大冻结时间，并把进入该分支记录成独立规则版本，而不是在事故中临时挑一个对平台有利的价格。

```mermaid
flowchart LR
  S["Spot constituents"] --> Q["Validate · normalize<br/>stale / outlier policy"]
  Q --> I["Index price"]
  O["Derivative order book"] --> B["Basis / premium model"]
  I --> B
  I --> M["Mark price"]
  B --> M
  M --> U["Risk UPL"]
  M --> N["Current notional + tiers"]
  U --> E["Effective equity"]
  N --> MM["Maintenance requirement"]
  E --> R["Risk decision"]
  MM --> R
```

Bybit 当前还明确区分 UI 默认按 last 展示的未实现 PnL 与悬停时按 mark 查看、并以 mark 参与清算判断的数值。这再次说明“未实现盈亏使用什么价格”也必须标注用途。

## 增量重算只有与全量结果等价才可信

风险引擎不可能在每个行情 tick 上扫描全账户、重估所有期权和重新聚合全部订单。常见实现会把依赖关系显式化：价格变化先标记受影响的 instrument，再传播到 position、risk unit、collateral bucket，最后只重算相关账户。

```mermaid
flowchart LR
  P["PriceSnapshot v42"] --> I["Dirty instruments"]
  E["Account event seq 918"] --> X["Dirty positions / orders"]
  I --> U["Affected risk units"]
  X --> U
  M["RiskModel v17"] --> U
  U --> C["Revalue cached components"]
  C --> A["Re-aggregate account"]
  A --> D["RiskDecision evaluationId"]
```

性能优化不能改变语义。增量路径必须满足：

```text
incrementalEvaluate(snapshot, priorState, dirtySet)
  == fullEvaluate(snapshot)
```

这里的相等包括金额、阈值比较结果、舍入、约束情景和解释分解，而不只是最终的 `Healthy/Liquidate` 标签。以下情况应使缓存失效并退回全量计算：模型或抵押品规则换版、风险单元成员关系改变、事件序列缺口、价格快照跨过未消费水位、非线性产品超过近似有效区间，以及恢复后无法证明缓存基线来自同一快照。

实现上可以维护 instrument-to-account 反向索引与风险单元局部缓存，但索引只是加速器，不是权威状态。它必须能由仓位、订单和模型定义重建；属性测试则应随机生成事件顺序和脏集合，持续比较增量与全量结果，专门覆盖部分成交、撤单与成交交叉、档位跃迁和参数切换。

### 风险快照切点要消除 torn read

账户事件和价格事件来自不同序列域，没有天然的“同时”。读取了 `accountSequence=918` 的仓位、`priceSnapshot=42` 的 mark，却遗漏本应在 918 之前生效的资金费用，就是一次 torn read。

可行的实现包括由单线程 reducer 串行消费两类输入、在事件日志中插入 barrier，或用 MVCC 读取各来源不超过某个协调水位的版本。无论选择哪一种，决策都要记录输入向量，例如：

```text
RiskCut {
  accountSequence: 918,
  priceSnapshotId: 42,
  fundingSequence: 77,
  modelVersion: 17
}
```

恢复时先恢复到 checkpoint 中声明的输入向量，再从各自下一位置重放；不能先加载最新价格、后加载旧账户快照，再让中间结果触发清算。风险快照保证的是**这次判断内部自洽且可重放**，不保证分布式世界在物理上同时停在这一刻。

## 简化强平价公式只适用于窄场景

考虑一个 isolated、线性、单向 long：

- 基础数量固定为 `q`；
- 入场价为 `P0`；
- 独立保证金为 `M`；
- 维持保证金率 `m` 固定；
- 没有 funding、费用、额外保证金、活动订单和档位变化；
- 清算条件简化为 position equity 等于 maintenance margin。

则：

```text
M + q × (Pliq - P0) = q × Pliq × m

Pliq = (P0 - M / q) / (1 - m)
```

若再假设 `M = q × P0 / L`：

```text
Pliq = P0 × (1 - 1/L) / (1 - m)
```

对同样假设下的 short：

```text
Pliq = (P0 + M / q) / (1 + m)
```

这些公式用于展示变量关系，不应用来复刻任何平台的生产清算价。真实计算会加入：

- mark notional 随价格变化；
- 分档 MMR 和档位切换；
- 预计平仓费或清算费；
- funding 与已实现账本变化；
- 追加或自动追加保证金；
- 交叉抵押品价格和 haircut；
- cross/portfolio 中其他仓位、订单与期权风险。

在 cross 或 portfolio 模式下，显示的“某仓位强平价”往往只是保持其他变量不变的估算。其他资产和仓位变化后，它会立即失效。

## 风险动作通常是状态机，不是一刀切

达到风险阈值不必然意味着“所有仓位同时全部强平”。平台可能先限制新增风险、撤销占用保证金的订单，再按风险档位部分减仓，最后才接管剩余仓位。

```mermaid
flowchart LR
  H["Healthy"] --> W["Warning / restrict risk"]
  W --> C["Cancel risk-increasing orders"]
  C --> T{"Requirement restored?"}
  T -->|"yes"| H
  T -->|"no"| P["Partial reduction / tier down"]
  P --> U{"Requirement restored?"}
  U -->|"yes"| W
  U -->|"no"| L["Liquidation engine takeover"]
```

OKX 当前公开清算说明就包含先撤活动订单、较高档位先部分减仓的路径。其他平台的先后顺序、触发阈值、清算价格和保险基金处理可能不同，所以这张图只能作为参考状态机。

每一次状态迁移都应以 `evaluationId + actionType + actionOrdinal` 组成稳定的幂等键；服务重启后，必须能从同一 RiskCut、price quality state 和 model version 恢复到相同阶段。当更新的 RiskCut 启动了更高 risk-action epoch 时，OMS 或清算命令接收端必须原子拒绝旧 epoch，防止旧 evaluator 在延迟恢复后继续产生效果；只在 evaluator 本地把 token 标成失效并不构成 fencing。

验证时应重点覆盖边界值、档位跃迁、价格跳空、多资产联动，以及 equity、haircut、liability、order loss 和费用缓冲是否各只应用一次。还应保留影子计算结果：新模型在生效前用相同历史输入与旧模型双跑，比较阈值翻转、保证金差异和解释项；只有差异被批准后，才能在一个明确账户序列或业务时间边界切换。UI 展示的估算值可以使用不同刷新节奏，但必须与权威 liquidation decision 明确分开。

## 结论：风险判断是绑定版本的快照决策

保证金风险不是某一个百分比，而是对明确账户作用域、账本余额、仓位与订单位置、价格质量和模型版本的一次联合判断。Equity、available balance、IM、MM 和风险比率各自回答不同问题，任何重复计入或口径混用都会改变清算边界。

风险动作也不是由一个显示价格直接触发的一刀切操作。系统必须在每一步重新计算同一个可解释约束；增量路径要证明与全量路径等价，降级路径要显式收缩权限，最终把估算、权威决定和恢复输入向量分别记录下来。

下一章进入 [期权估值与波动率曲面](/signal-grid-blog/posts/options-valuation-greeks-volatility-surface/)：保证金快照中的期权价格和 Greeks 不是静态主数据，而是绑定市场输入、模型、曲面版本与质量状态的风险事实。

## 官方参考

- [OKX：Mark price and Last price](https://www.okx.com/help/ii-mark-price-and-last-price)——Mark/Last 用途及 `index + moving-average basis` 模型。
- [OKX：Index Prices](https://www.okx.com/en-gb/help/i-spot-index-prices)——指数来源、异常数据与计算规则。
- [OKX：Liquidation in futures trading](https://www.okx.com/en-eu/help/frequently-issues-of-contracts-for-compulsory-liquidation)——风险比率、Mark 触发、撤单和分档减仓流程。
- [Bybit：Key Terms and Formulas in UTA](https://www.bybit.com/en/help-center/article/?id=000001912)——Equity、Margin Balance、Available Balance、IM/MM、haircut 与 order loss 的当前字段关系。
- [Bybit：FAQ — Unified Trading Account](https://www.bybit.com/en/help-center/article/?id=000001901)——MMR 方向、抵押品折价和清算边界。
- [Bybit：Margin calculation adjustment](https://www.bybit.com/en/help-center/article/Understanding-the-Adjustment-and-Impact-of-the-New-Margin-Calculation?category=cd60af6303161fd598)——证明 IM/MM 的价格基准与档位逻辑会版本化更新。
