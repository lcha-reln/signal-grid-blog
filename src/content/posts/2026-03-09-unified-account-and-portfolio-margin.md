---
title: "统一账户与组合保证金：抵押品折扣、净额与压力测试"
description: "区分统一账户结构与组合保证金模型，深入 Scenario Engine、风险单元、增量估值、异常曲面降级、解释性分解和版本化历史回放。"
date: 2026-03-09T22:00:00+08:00
updated: 2026-08-28T11:25:00+08:00
categories:
  - 交易系统
tags:
  - 统一账户
  - 组合保证金
  - 抵押品折扣
  - 压力测试
  - 风险引擎
series: trading
seriesOrder: 110
permalink: unified-account-and-portfolio-margin
featured: false
draft: false
---

“统一账户”和“组合保证金”经常同时出现，容易被当成同一个功能。实际上，前者首先回答**资产、负债、订单和仓位放在哪个账户里结算**，后者回答**这些头寸合在一起需要多少保证金**。一个账户可以统一，却仍采用逐仓或普通全仓计算；采用组合保证金时，也必须先明确可纳入哪个风险单元。

真正的工程难点不是把几条腿送进一个定价公式，而是让 Scenario Engine 在同一输入切点上重估、聚合和解释整个风险单元；当仓位、曲面或模型变化时，增量路径仍要等价于全量计算，异常输入则必须触发确定的保守降级，而不是产生一个看似精确却不可重放的保证金数字。

本文是交易系统学习路径的 Chapter 24，承接 [Chapter 23：强平风险瀑布](/signal-grid-blog/posts/liquidation-and-adl/)，把单仓和账户级风险进一步扩展到多资产、多产品组合。

> 本文用于解释账户与风险模型，不构成投资、交易或平台选择建议。文中情景均为教学抽象；抵押品率、压力幅度、净额规则和清算顺序会随平台、产品与时间变化。

## 1. 两个正交维度：账户结构与风险算法

统一账户（Unified Account）通常提供一套共同的资产与结算视图，让现货、保证金、永续、交割合约和期权在规则允许时共享抵押品、处理负债并结算盈亏。它减少了子账户之间的手工划转，但也扩大了风险传播范围。

组合保证金（Portfolio Margin, PM）是一种风险计量方式。它在明确的风险单元内把相关头寸放进同一组价格、波动率和基差情景，识别可验证的对冲关系，再以最不利结果和附加项确定保证金。

```mermaid
flowchart TB
  subgraph ACCOUNT["统一账户 · 账户结构"]
    ASSET["多币种资产"] --> LEDGER["共同账本与负债"]
    SPOT["现货"] --> LEDGER
    PERP["永续 / 交割"] --> LEDGER
    OPT["期权"] --> LEDGER
  end

  subgraph RISK["组合保证金 · 风险算法"]
    LEDGER --> UNIT["按标的与规则组成风险单元"]
    UNIT --> SCENARIO["价格 · 波动率 · 基差压力情景"]
    SCENARIO --> REQ["最不利损失 + 附加项 + 最低收费"]
  end

  LEDGER --> SIMPLE["也可以使用逐仓或普通全仓规则"]
```

| 问题             | 统一账户                                   | 组合保证金                             |
| ---------------- | ------------------------------------------ | -------------------------------------- |
| 核心对象         | 余额、抵押品、负债、订单、结算             | 风险单元、情景损益、净额与附加项       |
| 主要价值         | 减少资金搬运，形成统一资产视图             | 识别组合对冲，按净风险而非简单相加计量 |
| 主要风险         | 一个产品的亏损或借贷可能传播到更大账户范围 | 模型、相关性、基差、流动性和集中度风险 |
| 是否必然同时启用 | 否                                         | 否；具体准入和账户承载方式由平台决定   |

因此，不应声称某个平台“首创了统一账户”，也不应把“统一账户 = 组合保证金”写进数据模型。产品演进和命名会变化，可验证的是当前账户规则与风险算法，而不是营销标签的先后顺序。

## 2. 账户余额不等于可用抵押品价值

统一账户需要把不同资产折算到共同计价单位。最简单的正余额模型是：

```text
认可抵押品价值
  = Σ(资产数量 × 指数价格 × 抵押品率)
```

抵押品率（Collateral Value Ratio，也常被称为 haircut 后的认可比例）反映流动性、价格波动和集中度等约束。它不是固定汇率，也不是对资产价格设置止损。

例如，某资产有 10 个单位，教学用指数价格为 2,000 USD，平台参数把抵押品率设为 80%：

```text
市场名义价值 = 10 × 2,000 = 20,000 USD
认可抵押品价值 = 20,000 × 80% = 16,000 USD
```

这 4,000 USD 差额是风险折扣，不代表资产被出售或发生了已实现损失。指数价格或抵押品率变化时，认可价值会同步变化，从而影响账户风险率。

```mermaid
flowchart LR
  BAL["资产数量"] --> VALUE["数量 × 指数价格"]
  INDEX["指数价格"] --> VALUE
  VALUE --> HAIRCUT["× 抵押品率"]
  POLICY["流动性 · 波动 · 集中度参数"] --> HAIRCUT
  HAIRCUT --> COLL["认可抵押品价值"]
  COLL --> EQUITY["账户折算权益"]
  DEBT["借贷与应计费用"] -->|"扣减"| EQUITY
```

实现时还必须区分正余额与负债。部分平台只对正抵押品应用折扣，而负余额按更严格比例计入；还可能设置单币种上限、阶梯折扣、借贷限额和稳定币脱锚附加项。把所有币种简单乘一个固定折扣后相加，会低估账户风险。

## 3. 净额只发生在明确的风险单元内

组合保证金不会因为两笔资产“历史上相关”就无限抵消。风险引擎先定义风险单元，例如同一底层资产下的现货、永续、不同到期日合约与期权，再规定哪些 Delta、Vega 或基差风险可以净额。

一个 BTC 风险单元可能包含：

- BTC 现货或被认可的现货订单；
- BTC-USDT、BTC-USDC 等永续与交割合约；
- 不同行权价、不同到期日的 BTC 期权；
- 平台明确允许纳入的抵押品或借贷暴露。

ETH 仓位通常进入另一个风险单元。即使 BTC 与 ETH 在某段历史里高度相关，也不代表两个单元能获得一比一抵扣。跨标的抵扣若存在，必须由明确参数和上限约束。

净额也不是“多头名义价值减空头名义价值”这么简单：

- 现货与永续可能有基差和资金费风险；
- 不同到期日合约有期限基差；
- 期权 Delta 会随价格变化，Gamma 和 Vega 不能被静态 Delta 覆盖；
- 抵押品自身可能和仓位在压力情景中同时下跌；
- 大仓位清算需要考虑市场深度和冲击成本。

风险单元本身是版本化主数据，而不是运行时临时 `groupBy(underlying)`：

```text
RiskUnitDefinition {
  riskUnitId,
  underlyingFamily,
  eligibleProductPatterns,
  settlementAndCollateralRules,
  crossProductOffsetRules,
  concentrationLimits,
  modelVersion,
  effectiveFrom
}
```

一笔产品换了结算币、合约乘数或底层映射，可能就不再满足原净额规则。定义变更必须在明确账户序列边界生效，并使相关缓存全部失效；否则订单准入可能按新分组抵扣，清算却仍按旧分组追缴。

## 4. Scenario Engine 计算的是一组可重放的反事实

一个教学化的组合保证金流程如下：

1. 取得一致时点的账户、价格和风险参数快照；
2. 按底层资产把头寸映射到风险单元；
3. 对价格、隐含波动率、时间衰减和基差施加离散压力；
4. 在每个情景下对全部头寸重估，得到组合净损益；
5. 取规则定义的最不利损失，再叠加集中度、流动性、借贷和最低收费；
6. 汇总各风险单元与不可净额项目，形成 IM、MM 与账户风险率。

```mermaid
flowchart TD
  SNAP["一致的账户与参数快照"] --> GROUP["按标的组成风险单元"]
  GROUP --> S1["情景 A<br/>标的下跌 + 波动率上升"]
  GROUP --> S2["情景 B<br/>标的上涨 + 波动率上升"]
  GROUP --> S3["情景 C<br/>时间衰减 + 基差扩大"]
  GROUP --> S4["情景 D<br/>极端价格移动"]
  S1 --> WORST["规则定义的最不利组合损失"]
  S2 --> WORST
  S3 --> WORST
  S4 --> WORST
  WORST --> ADD["+ 集中度 · 流动性 · 借贷附加项"]
  ADD --> FLOOR["与最低收费或地板值取规则结果"]
  FLOOR --> MARGIN["组合 IM / MM"]
```

假设某风险单元在四个教学情景下分别得到 `-12,000`、`-8,000`、`-1,000` 和 `-25,000 USD` 的组合损益，那么情景扫描暴露的是 25,000 USD 最不利损失。真实引擎可能把不同风险项相加、取最大值或应用权重，并继续加上最低收费；不能仅凭这个数字宣称最终保证金恰好是 25,000 USD。

一次可审计求值至少需要以下输入和输出：

```text
ScenarioEvaluation {
  evaluationId,
  accountSequence,
  marketSnapshotId,
  riskUnitDefinitionVersion,
  valuationModelVersion,
  scenarioSetVersion,
  positionResults[scenarioId],
  unitResults[scenarioId],
  addOnBreakdown,
  bindingScenarioIds,
  im,
  mm
}
```

其中 scenario 不是一句“BTC 下跌 15%”，而是对 spot、forward、波动率曲面、时间、基差和抵押品价格的联合变换，还要说明 bump 是绝对值还是相对值、先后顺序以及边界处理。同一 scenario ID 在历史上指向可变配置，会让回放失去意义；所以配置和定价实现都需要不可变版本或内容摘要。

Scenario Engine 可以分成四层：

1. **事实层**固定仓位、订单、负债、市场和模型输入，不夹带风控决定；
2. **投影层**在每个 scenario 下对产品重估，不直接做跨产品净额；
3. **聚合层**只按 RiskUnitDefinition 应用净额、上限、最低收费和 add-on；
4. **决策层**把 IM/MM 与认可权益比较，并输出允许、降额或清算等动作。

这四层分开后，才能判断差异来自行情、定价、净额规则还是最终比较，而不是只留下一个总保证金。

### SPAN 是参照系，不是所有 PM 的同义词

CME SPAN 是重要的组合保证金方法论。经典 SPAN 在 combined commodity 层面使用 risk array 评估扫描风险，并处理跨月价差、交割风险和跨品种抵扣。它很好地展示了“以情景损失计量组合，而不是逐腿保证金相加”的思想。

还要区分经典 SPAN 与正在分阶段落地的 SPAN 2。CME 当前公开的 SPAN 2 框架以历史 VaR 和压力风险为市场风险主体，再加入流动性与集中度费用；迁移期内，不同产品仍可能分别使用 SPAN 或 SPAN 2，并通过明确规则提供跨模型抵扣。于是，“SPAN 永远等于固定 16 个情景”和“CME 所有产品已经切到同一新模型”都不准确。

但加密交易平台的 PM 可能使用自己的风险单元、价格与波动率冲击、极端移动、稳定币脱锚、借贷和最低收费模块。文章可以把 SPAN 作为方法论参照，不能把任一平台的实现直接称为 SPAN，也不能拿一组自设情景算出“节省 78%”后当作平台承诺。

## 5. 增量估值是执行优化，不是另一套风险模型

订单预检查可能每秒触发数万次，不能每次重估全账户所有 scenario。引擎通常缓存每个 `position × scenario` 的价值，并从行情或账户变化反向定位受影响的 risk unit：

```mermaid
flowchart LR
  E["Position / order delta"] --> D["Dirty products"]
  P["Spot · forward · surface update"] --> D
  D --> V["Revalue affected product × scenario"]
  V --> U["Re-aggregate dirty risk units"]
  U --> A["Recompute account add-ons and floors"]
  A --> R["ScenarioEvaluation"]
```

增量路径的权威不变量是：给定完全相同的账户、市场和版本快照，其 `positionResults`、binding scenario、add-on 与最终 IM/MM 必须等于从空状态执行的全量路径。模型换版、风险单元成员变化、市场序列缺口、缓存校验失败或非线性产品跨过近似区间时，都应使缓存失效并回退全量求值。

Greeks 可用于定位影响范围和给出快速预估，却不能自动替代 scenario 下的完整重估。尤其在大幅价格移动、临近到期和曲面形状改变时，一阶 Delta 或局部 Vega 近似可能翻转最不利情景。订单准入若先用近似快速拒绝可以较保守；若要用近似批准风险增加，则必须有明确误差上界和后续权威复核，不能把延迟目标变成隐性放宽保证金。

验证不应只比较一组固定样例。可随机生成仓位、订单与市场事件，交错执行增量更新和周期性全量重算；只要任一解释项或舍入结果不同，就保留 seed、事件轨迹和版本制品，作为缓存依赖遗漏的反例。

## 6. 异常曲面必须收缩权限，而不是静默插值

期权组合保证金依赖 spot、利率、期限和波动率曲面。某个行权价缺报价不等于整张曲面不可用，但跨期限套利约束破坏、时间戳倒退、bid 大于 ask、关键期限完全缺失或校准器不收敛，都会改变 scenario 估值是否有资格驱动权威动作。

曲面服务应输出 `Healthy / Degraded / Frozen / Invalid` 等质量状态、缺失节点、校准残差、输入水位、模型版本和有效期。处置策略可以是：

| 质量状态   | 估值策略                                           | 风险增加             | 风险减少与清算                   |
| ---------- | -------------------------------------------------- | -------------------- | -------------------------------- |
| `Healthy`  | 使用当前批准曲面                                   | 正常准入             | 正常执行                         |
| `Degraded` | 使用有界插值或批准的保守 bump，并增加 model add-on | 收紧或拒绝受影响产品 | 保留减仓能力，记录降级依据       |
| `Frozen`   | 固定最后健康曲面并随时间扩大 add-on                | 拒绝                 | 进入有截止时间的专门处置协议     |
| `Invalid`  | 不产出权威 PM 数字                                 | 拒绝                 | 隔离受影响风险单元并升级人工控制 |

“沿用最后价格”若没有持续时间、额外压力和最大冻结边界，只是在隐藏陈旧输入。另一方面，输入异常也不应自动把所有仓位标成零价值；降级函数必须事先审批、单调保守并可回放。曲面构建与 Greeks 的细节见[期权估值与波动率曲面](/signal-grid-blog/posts/options-valuation-greeks-volatility-surface/)，这里关注的是质量状态如何限制风险决策。

## 7. 保证金降低不等于风险消失

组合保证金识别对冲后，要求可能低于逐腿简单相加。这表示模型认为在给定压力集合中，部分损失可以被其他头寸抵消；它不表示组合没有风险。

风险仍可能来自：

- **对冲漂移**：期权 Delta 随价格和时间变化；
- **基差扩张**：现货、永续和交割合约不再同步；
- **相关性破裂**：跨资产抵扣在极端行情中失效；
- **波动率曲面变化**：不同期限和行权价的 Vega 不能完全抵消；
- **抵押品共振**：抵押品和风险仓位同时贬值；
- **流动性缺口**：模型价格可得，但真实减仓深度不足；
- **参数跳变**：平台调整折扣率、压力幅度、档位或借贷上限。

这也是为什么成熟实现同时需要情景保证金、集中度附加、最低收费、实时风险率、参数版本和独立压力测试，而不是只展示一个“节省保证金”百分比。

## 8. 解释性分解和历史回放共同约束模型

统一账户与 PM 最容易出错的地方，是不同服务在不同时间看到不同资产、价格和参数版本。一次风险计算应绑定：

```text
accountSnapshotId
valuationTimestamp
priceIndexVersion
collateralPolicyVersion
portfolioModelVersion
riskUnitDefinitionVersion
scenarioSetVersion
riskUnitDefinitions
openOrdersAndPositions
borrowingsAndAccruals
```

输出不仅要有总 IM、MM，还要给出可解释分解：每个资产的名义与认可价值、每个风险单元的情景损益、使用的净额、各项附加收费，以及哪个情景成为约束。订单预检查和清算判断必须使用兼容的模型版本，否则“下单时通过、落账即越线”会成为系统性竞态。

解释项不能假装所有风险都可线性分摊。最不利情景是组合级 max，集中度费用和最低收费也可能是非线性的；把每条腿独立保证金相加再按比例分配，往往不能还原总数。更可靠的输出分三层：可直接相加的估值 PnL、规则明确分配的 add-on，以及只在组合层成立的 binding scenario/floor。若提供 leave-one-out 或边际贡献，应明确它是诊断视角，不是唯一会计归属。

参数更新也应当事件化：先以影子计算评估影响，再发布带生效时间的新版本，最后让订单网关、风险引擎和清算服务在同一边界切换。历史重放必须仍能取到当时版本。

一次历史回放需要的不只是账户成交，还包括当时的抵押品政策、RiskUnitDefinition、scenario set、市场输入或其可重建位置、曲面制品、定价实现摘要和舍入规则。回放有两个不同目标：

- **确定性复现**：同一 evaluation 输入得到逐字段相同的输出，用于审计一次准入或清算决定；
- **反事实比较**：把旧输入交给候选新模型，量化保证金变化、阈值翻转和风险集中，用于模型发布。

两类结果不能混在同一个“重跑成功”指标里。前者不同意味着历史证据断裂；后者不同可能正是模型变更的目的，但必须解释和审批。

## 9. 结论：净额是模型承诺，不是相关性猜测

- 统一账户是资产、负债与结算的组织方式；组合保证金是风险计量方法。
- 资产市值要经过指数价格、抵押品率、上限和负债规则后，才成为认可权益。
- 净额只在规则定义的风险单元和上限内发生，不能由历史相关性随意推导。
- PM 的核心是版本化 Scenario Engine；风险单元、曲面和 scenario set 共同限定哪些反事实有资格成为保证金证据。
- 增量估值必须与同一快照上的全量求值等价，异常曲面则要显式收缩准入权限并保留可回放的降级规则。
- SPAN 是重要参照，但不能代替平台自己的模型说明与参数版本。

下一章进入 [市场微观结构与成交质量](/signal-grid-blog/posts/market-microstructure-execution-quality/)：风险预算只说明能承受多大敞口，成交质量还要用明确基准、时间切点和反事实边界解释订单实际付出了什么成本。

## 官方参考

- [Bybit：Unified Trading Account 概览](https://www.bybit.com/en/help-center/article/Introduction-to-Bybit-Unified-Trading-Account?category=dc8a1e795293636335)
- [Bybit：统一账户中的抵押品价值率](https://www.bybit.com/en/help-center/article/?id=000001879&language=en_US)
- [OKX：Portfolio Margin 的 Risk Unit Merge 与压力项](https://www.okx.com/en-us/help/portfolio-margin-mode-cross-margin-trading-risk-unit-merge)
- [CME Group：SPAN Methodology Overview](https://www.cmegroup.com/solutions/risk-management/performance-bonds-margins/span-methodology-overview.html)
- [CME Group：SPAN 2 Methodology](https://www.cmegroup.com/clearing/risk-management/span-overview/span-2-methodology.html)
- [CME Group：SPAN 2 分阶段迁移范围](https://www.cmegroup.com/solutions/risk-management/performance-bonds-margins/span-methodology-overview/launching-span-2.html)
