# Signal Grid 学习路径

这份文件记录专题的 canonical 阅读顺序。页面中的连续 Chapter 编号由 `seriesOrder` 排序后生成；修改标题或文件名时，不应同时改变已经发布的 `permalink`。

## 交易系统

| 阶段 | Chapter | `seriesOrder` | 标题 | `permalink` |
| --- | ---: | ---: | --- | --- |
| 市场地图 | 01 | 10 | CEX 交易系统全景：从产品、订单到清算账本 | `cex-trading-system-overview` |
| 市场地图 | 02 | 20 | 现货、期货与永续合约：基差、收敛与对冲 | `derivatives-contracts-and-basis` |
| 订单与撮合 | 03 | 30 | 撮合机制：价格时间优先、连续竞价与集合竞价 | `matching-engine-and-auctions` |
| 订单与撮合 | 04 | 40 | 订单簿与自成交保护：从队列结构到 STP | `order-book-and-self-trade-prevention` |
| 订单与撮合 | 05 | 50 | 交易订单语义：Market、Limit、TIF、Post-Only 与条件单 | `order-types-and-execution-strategies` |
| 仓位与定价 | 06 | 60 | 合约仓位生命周期：开仓、减仓、平仓与盈亏 | `position-lifecycle-and-pnl` |
| 仓位与定价 | 07 | 70 | 永续合约资金费率：溢价、结算与基差交易 | `perpetual-funding-rate` |
| 仓位与定价 | 08 | 80 | 保证金风险引擎：权益、维持保证金与标记价格 | `margin-metrics-and-mark-price` |
| 风险与资本 | 09 | 90 | 逐仓与全仓：风险隔离、共享权益与风险传播 | `isolated-and-cross-margin` |
| 风险与资本 | 10 | 100 | 强平风险瀑布：部分清算、保险基金与 ADL | `liquidation-and-adl` |
| 风险与资本 | 11 | 110 | 统一账户与组合保证金：抵押品折扣、净额与压力测试 | `unified-account-and-portfolio-margin` |
| 综合应用 | 12 | 120 | 订单簿做市：价差、库存、逆向选择与合规边界 | `market-making-mechanics-and-strategies` |

阶段边界和首页主线维护在 `src/config.ts`。新增或移动章节时，应同时检查：

- 同一专题的 `seriesOrder` 不重复；
- 文章落入且只落入一个阶段；
- 文章前后导航与本表一致；
- 首页只展示主路径前六章，完整路径仍在专题页；
- 新链接包含 `/signal-grid-blog/` base。

## 高性能组件

| Chapter | `seriesOrder` | 标题 | `permalink` |
| ---: | ---: | --- | --- |
| 01 | 10 | LMAX Disruptor 4：Ring Buffer、消费拓扑与 Batch Rewind | `lmax-disruptor-ring-buffer-and-sequencing` |

本路径从进程内事件管线开始，后续再补充 Agrona、内存布局、基准方法与低分配组件。新增章节时保持 `seriesOrder` 以 10 为间隔，并用真实依赖关系决定顺序，不按发布日期倒排。
