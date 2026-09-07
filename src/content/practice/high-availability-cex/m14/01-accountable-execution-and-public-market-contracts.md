---
title: "M14·01：成交结果怎样成为可记账事实与公共行情"
description: "从 maker 与 taker 的账户归属出发，为 Execution 和 Market 建立两份独立输出合同，并用显式 genesis 划清 M13 历史与 M14 新输出的责任边界。"
date: 2026-09-07T18:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M14
lessonOrder: 10
permalink: accountable-execution-and-public-market-contracts
tags:
  - 业务事件
  - 行情投影
  - Java
  - 撮合系统
draft: false
---

> 完成身份：[course/m14-complete](https://github.com/lcha-reln/cex-matching/tree/course/m14-complete)，完整提交 `56c4ec09ddf9fcf57f1cce763ae8b451ba7f394f`。本文结论绑定 clean 完成树重新执行的 M14 资格；[公开 manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m14/evidence/manifest.json) 的 SHA-256 为 `7eb56335954e03a6792b8f9971b922e3bd45bf5dcbd60e47f1e5cedde3fb2081`。

账户甲先挂出卖单，账户乙随后买入。撮合结果已经准确记录 maker orderId、taker orderId、成交价格和数量，现在把这条结果同时交给柜台与行情服务，可以吗？先预测两个接收者分别缺什么，又分别多拿到了什么。

柜台还需要知道两张订单各属于谁；公开行情却不应收到账户、订单身份或客户端请求身份。**同一次成交需要保留完整业务事实，同时为不同接收者定义不同的信息边界。** M14 因此在 M13 的静态分片基础上增加 Execution 与 Market 两条输出流。本篇先确定输出应表达什么，下一篇再解决它怎样与撮合状态一起保存。

## 账户归属必须来自已接受的订单

收到买单时，只在成交结果上附加“当前请求的 accountRef”，看起来已经有了账户字段，实际却把 maker 与 taker 都归给了乙。旧卖单的账户只能来自卖单被接受时建立的绑定，无法从本次请求推断。

M14 的新 `Place` 必须携带 `accountRef`。它是 1–64 字节的严格 UTF-8 不透明标识，不做大小写转换或 Unicode 归一化；控制字符不合法。它参加 M14 请求的持久身份摘要，因此沿用相同 commandId 和 producer slot、只把甲改成乙，会构成身份冲突。

请求携带账户仍不等于订单归属已经成立。实现只在同一次 typed apply 产生 `MatchingEvent.Accepted` 时，建立 `(instrument, orderId) → accountRef`。订单被拒绝时，Execution 可以用 REQUEST 角色说明本次申请者，却不能替一张未被接受的订单建立永久归属。成交、撤单与批量撤单再从已建立的绑定查出相关账户。

同样的 orderId 可以出现在不同 instrument 中，所以绑定键含有 instrument。绑定保留到终态，使旧成交、旧撤单与精确重试仍能指向原来的账户。这里的账户标识也不替代认证：上游仍须证明调用者有权代表该账户，M14 只保证已准入字段的确定性归属。

## accountRef 不参与撮合决策，也不等于自成交组

订单的自成交组决定两张订单是否触发既定 STP 规则，accountRef 决定输出中的业务归属。两者可能由同一套上游账户系统提供，但本单元没有规定它们相等。

一个具体反例是：甲、乙使用不同 accountRef，却处在同一 self-trade group。引擎仍可能产生 `SelfTradePrevented`，Execution 应保留两个不同的账户角色。反过来，相同 accountRef 也不能让 M14 私自补上一条核心规则之外的自成交判断。

这解释了实现的放置位置。`matching-core` 的命令和撮合规则不增加 accountRef；本地 adapter 的 `applyTyped` 交回实际事件，M14 外层补充账户归属。实现没有从显示字符串解析 Trade，也没有为了生成输出再调用一次撮合。这样，价格优先、时间优先与 STP 的裁决仍由原核心负责，账户信息则与同一次裁决的结果绑定。

`M14ExecutionRecord.Matching` 组合 typed event 与角色映射。Trade 具有 MAKER、TAKER，Canceled 具有 ORDER；无法定位订单的 CancelRejected 不会随意填入一个账户。这些差异属于事件合同，不能由接收者猜测空字段的含义。

## Execution 保留业务解释，Market 只表达公开变化

Execution 为每个新准入的业务或路由转换生成一个完整 batch。业务规则拒绝也是一种已发生的业务结果，例如合法到达订单簿的撤单找不到目标；它需要被解释，也占用 Execution 顺序。外层路由错误或输出容量拒绝没有完成业务准入，因而不生成这个 batch。

Market 使用独立的 typed 白名单，当前只有三种记录：

| 记录 | 公开含义 | 数值关系 |
| --- | --- | --- |
| `Trade` | instrument、成交价格和数量、taker side | 顺序来自该次实际成交顺序 |
| `LevelSet` | 一侧某价位的最新聚合剩余数量 | 数量为零表示删除价位 |
| `BookStatus` | 当前市场模式与生效规则身份 | 不包含待生效规则内容 |

公开 Trade 没有 maker/taker orderId，公开 batch 也没有 commandId、producer slot 或 source shard sequence。LevelSet 是应用前后价位总量的差异，接收者用新值替换旧值，无须再次模拟撮合。Market snapshot 则保存整个 shard 的公开 book 状态，仍然不保存私有订单归属。

白名单必须落实在类型和编码上。先复制完整 Execution JSON，再删除几个已知私有字段，会让以后新加的私有字段默认流入行情。当前实现从 `M14MarketRecord` 出发编码；资格 oracle 还独立比较预期公开字节，避免“结构合法”掩盖字段值中的私有信息泄漏。

## 两条独立序号才能准确解释没有变化

假设第一条卖单挂入盘口，第二条请求撤销不存在的订单，第三条买单产生成交。Execution 依次得到三个 batch；第二条没有 Trade，也没有改变公开价位或 book status，所以 Market 只得到两个 batch。

这个差异不意味着行情漏发。Market 的序号只为真正产生的 Market batch 分配，因而仍连续。如果把 Execution 的序号直接借给 Market，接收者看到缺号时就无法区分“公开状态没有变化”与“传输丢失了一批数据”。

`M14StreamIdentity` 由 genesisId、shardId、kind 组成，kind 区分 EXECUTION 与 MARKET；每条流从自己的 sequence 1 开始。多个 instrument 共用所属 shard 的这条顺序，但不同 shard 没有被包装成一条全局成交序列。batch identity 再绑定 sequence 与内容摘要，确保同一位置的重发必须具有同一内容。

还可以据此预测：只准备一份尚未生效的规则，会产生解释准备结果的 Execution；只有当前公开状态实际变化时才产生 Market。接收者不能把“没有 Market”读成“命令没有执行”。

## 显式 genesis 阻止系统替旧历史补写账户

从 M13 升级时，已有历史命令没有 accountRef。给所有旧订单默认填一个账户，会制造没有来源的归属；重放旧命令并补发 Execution，还会把历史事实伪装成新输出。

M14 选择一个更窄、可以核验的切换点：导入经过完整语义验证的 M13 状态，并要求所有 resting books 为空。终态订单、命令身份、规则、模式和原计数继续保留；新输出从显式 `M14OutputGenesis` 开始。它绑定部署身份、shard、导入状态与 Q1 profile 的确切内容，不能只凭一个随意填写的版本号宣布切换完成。

当前真实 API 的初始化顺序如下，`m13State` 是已经取得的 `M13RuntimeState`：

```java
var profile = M14OutputProfile.q1();
var genesis = M14OutputGenesis.forM13(deploymentId, m13State, profile);
var runtime = DirectM14ShardRuntime.importM13(m13State, genesis, profile);
```

旧请求的精确重试沿原 M13 编码和身份比较，返回原历史响应语义，不要求请求凭空增加账户，也不补发输出。尝试为相同历史身份添加 accountRef 会被拒绝；原身份修改 payload 仍然冲突。原始 M13 ingress 也只允许已导入身份的重试，不能作为新订单绕过账户要求的入口。

## 用一笔真实成交检查这份合同

`M14ShardRuntimeTest.sameApplyRetainsActualTypedTradeAndIndependentPublicProjection` 构造 maker 与 taker 属于不同账户的成交，检查实际 Execution 角色、公开 Trade 和盘口结果。`importAndRawLegacyRetryNeverAttributeOrBackfillOldResults` 则检查迁移切点与旧请求不会生成新输出。这两个入口把开篇的问题变成了可执行断言。

完成身份绑定的本地资格中，L01 的账户成交、L03 的 STP 与批量撤单归属、L04 的历史重试，以及 L12 的全部 typed 事件变体检查均已通过。它们比较的是事件角色、公开内容和原始输出身份；只看订单簿最终数量相同，无法证明 maker 仍然属于原账户。

复验使用页首完成身份所指向的 `course/m14-complete` 源码。下面的单项测试用于定位账户与公开投影的具体断言：

```bash
./gradlew :matching-cluster-runtime:test \
  --tests '*M14ShardRuntimeTest.sameApplyRetainsActualTypedTradeAndIndependentPublicProjection' \
  --no-daemon --max-workers=1
```

独立预期来自 [M14OutputOracle.java](https://github.com/lcha-reln/cex-matching/blob/course/m14-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M14OutputOracle.java)：它从线性参考模型的 Accepted、Trade 和终态事件建立归属，不读取生产输出中的账户作为答案。同目录的 `M14ExpectedOutputCodec.java` 独立生成规范预期字节，再与实际 Execution、Market 比较。

读取断言时，先尝试把 maker 的账户换成 taker，或让撤单拒绝也推进 Market 顺序，再预测哪个比较应失败。当前语义反例 `M14-MAKER-ACCOUNT-FROM-TAKER` 和 `M14-PRIVATE-ACCOUNT-IN-MARKET` 已在各自正常实现对照通过的前提下，触发明确业务差异。单个 JUnit 入口仍不代替完整资格；本次结果的汇总与原始证据复验方式见第五篇，代码与原始证据均由页首完成身份固定。

现在可以明确说明一条输出代表什么：Execution 保留业务事实与有来源的账户归属，Market 保留公开投影，两者按各自顺序解释重复与缺口。这些输出尚不等于资金清算、余额更新或账户权限校验。下一篇依赖的正是这份确定合同：已经承诺给外部的内容，必须与产生它的撮合状态在同一次状态转换中一起保存。
