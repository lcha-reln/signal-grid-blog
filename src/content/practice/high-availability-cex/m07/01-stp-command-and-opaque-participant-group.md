---
title: "M07·01：把 STP 身份收窄为不透明参与方组"
description: "冻结 participantGroupId、taker-side STP policy、0/NONE 兼容映射与原始输入校验，同时守住撮合核心不查询账户关系的边界。"
date: 2026-08-31T16:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M07
lessonOrder: 10
permalink: stp-command-and-opaque-participant-group
tags:
  - 撮合引擎
  - STP
  - 输入合同
draft: false
---

> 权威起点是 annotated [`course/m07-start`](https://github.com/lcha-reln/cex-matching/tree/course/m07-start)，权威完成点是 annotated [`course/m07-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m07-complete)，peeled commit 为 `8e9c147b12bfb6b55e69ff04ecfe3aa4c510ed23`。本站保存同一提交生成的[完成 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m07/evidence/manifest.json)，manifest SHA-256 为 `32bd580d135bea58ea5e12c61639b8c0935be622df89cd8023c0bed39cf8b0a3`。

自成交保护（Self-Trade Prevention，STP）看似只是“maker 和 taker 是同一个用户就别成交”，真正困难却从“同一个”开始：现货账户、子账户、做市席位、策略实例和机构主体都可能拥有不同关系。若撮合器自己查询账户数据库，它就会把外部可变关系、网络故障和授权逻辑引入确定状态机。

M07 只增加一个轴：**上游把已经解析好的 opaque participant group 与 taker-side disposition 放进 Place；撮合器只比较组号，不解释账户含义，也不把策略放进节点本地热配置。**

## 撮合器只回答“组号是否相同”

M07 的责任分界如下：

| 问题                             | 负责人                   | matching-core 是否解释 |
| -------------------------------- | ------------------------ | ---------------------- |
| 哪些账户应归为同一自成交主体     | 柜台/账户与合规域        | 否                     |
| 调用者是否有权选择某种 STP 策略  | REST/鉴权/风控域         | 否                     |
| 当前 Place 携带哪个 group/policy | 有序业务命令             | 是，作为原始输入       |
| 可成交 maker 的 group 是否相等   | matching-core            | 是，只做数值相等       |
| 命中后取消 maker、taker 还是双方 | matching-core            | 是，按 taker policy    |
| 是否产生过同组 `Trade`           | matching-core 与证据裁判 | 必须保证没有           |

这使账户关系可以在上游演进，而不让一次 replay 重新查询“今天的关系”。同一条 M07 命令携带的 group/policy 在任何节点、任何重放中都必须相同。

`participantGroupId` 不是账户 ID、用户 ID 或权限令牌。原始字段覆盖非负 `long`：`0` 是 legacy sentinel，`1..Long.MAX_VALUE` 才是不透明等价类标签；matching 不能从数字大小、范围或编码推导组织层级。冻结 fixture 也专门提交 `Long.MAX_VALUE`，防止适配层把它误窄化成 32 位整数或 JavaScript `number`。

## 冻结组合入口，而不是给旧输入偷偷加全局配置

PLAN v0.9 冻结两个组合请求：

```text
StpPlaceLimitOrderRequest(
  PlaceLimitOrderRequest orderRequest,
  long participantGroupId,
  String stpPolicy
)

GovernedStpPlaceLimitOrderRequest(
  StpPlaceLimitOrderRequest request,
  RuleSetIdentity expectedActive
)

engine.placeStp(...)
engine.placeGovernedStp(...)
```

组合而非复制 M00～M05 字段有两个作用：

- `PlaceLimitOrderRequest` 继续拥有五字段限价单与 ExecutionPolicy；
- governed 入口继续拥有 M05 的 expected active rule identity；
- M07 只包一层 STP 数据，不创建另一套价格、数量或规则语义。

通过准入后，group/policy 不只存在于请求对象。当前 core 把它们写入三处可审计状态：

```text
MatchingEvent.Accepted(
  sequence, orderId, side, priceTicks, quantityLots,
  executionPolicy, admissionRuleSet,
  participantGroupId, selfTradePreventionPolicy
)

MatchingEvent.Rested(
  sequence, orderId, side, priceTicks, remainingQuantityLots,
  admissionRuleSet, participantGroupId, selfTradePreventionPolicy
)

OrderBookSnapshot.RestingOrderView(
  sequence, orderId, remainingQuantityLots,
  admissionRuleSet, participantGroupId, selfTradePreventionPolicy
)
```

`ExecutionBatch.context.applicationSequence` 记录这次业务命令占用的应用序列，`context.activeRuleSet` 则记录批次的当前执行规则。不要在 JSON/adapter 层漏掉 group/policy，否则 core 虽然正确，恢复、审计和 Lab 仍会看到一个伪 legacy 订单。

这里的 disposition 是 **taker-side**：当前进入扫描的订单决定命中同组 maker 时怎么处置。一个订单未来成为 maker 时，不读取它当年作为 taker 携带的 policy；新的 taker policy 才是当前决定来源。maker 必须保留 participant group，才能进行相等判断。

## `0/NONE` 是明确的 legacy 语义

旧入口按以下方式进入同一内部路径：

```text
place(...)          ┐
placeRequest(...)   ├─→ participantGroupId = 0, stpPolicy = NONE
placeGoverned(...)  ┘
```

`0` 表示“命令没有提供可比较的 STP 身份”，不是一个真实共享组。规则固定为：

```text
group 0 never participates in self equality
```

因此两张 legacy order 即便都映射为 `0/NONE`，仍按 M00～M06 的价格时间优先正常成交。若把 `0 == 0` 当成 self，升级 M07 会突然阻止所有旧入口相互成交，累计回归全部失真。

这也是一个诚实兼容边界：未携带 group 的流量**没有获得 STP 保证**。系统不能猜它属于谁；需要保护的入口必须显式提交正 group 与非 `NONE` policy。

## 原始 policy 只有四个 token

raw string 的允许集合精确为：

```text
NONE
CANCEL_TAKER
CANCEL_MAKER
CANCEL_BOTH
```

没有大小写折叠、trim 后别名、数字枚举或 venue-specific 缩写。`cancel_maker`、`CancelMaker`、空串都不是悄悄归一化的合法策略，而是 `INVALID_STP_POLICY`。

M07 也不加入 `DECREMENT_AND_CANCEL`。该策略会引入“双方各减多少、是否保留优先级、数量如何归因”的另一组状态机，应作为独立复杂度评审，不能混进三种取消 disposition。

## group、policy 与 pair 分三层校验

输入校验顺序固定为：

```text
M00 field validation
→ ExecutionPolicy validation
→ STP group validation
→ STP policy validation
→ group/policy pair validation
→ duplicate orderId
→ expected active RuleSet
→ active price band
→ M06 MarketMode
→ policy/STP state precheck
→ accept and execute
```

三道 STP 校验各自回答不同问题：

| 条件                           | `MatchingEvent.Rejected.code` | `field`              |
| ------------------------------ | ----------------------------- | -------------------- |
| `participantGroupId < 0`       | `INVALID_STP_GROUP_ID`        | `participantGroupId` |
| raw token 不在四值集合         | `INVALID_STP_POLICY`          | `stpPolicy`          |
| group 与合法 policy 组合不一致 | `INVALID_STP_INSTRUCTION`     | `stpInstruction`     |

合法 pair 只有：

| group | `NONE`      | `CANCEL_TAKER` | `CANCEL_MAKER` | `CANCEL_BOTH` |
| ----- | ----------- | -------------- | -------------- | ------------- |
| `0`   | 合法 legacy | 非法           | 非法           | 非法          |
| `> 0` | 非法        | 合法           | 合法           | 合法          |
| `< 0` | group 非法  | group 非法     | group 非法     | group 非法    |

分层很重要。若 group=-1 且 policy token 也非法，先返回 `INVALID_STP_GROUP_ID`；若 group=0 且 policy=`CANCEL_MAKER`，token 本身合法但 pair 非法，应返回 `INVALID_STP_INSTRUCTION`。production、reference 与第三账本才能为每个 raw input 得到唯一结果。

## raw 失败不能占订单身份

schema-valid 业务拒绝会按既有合同占用一个 `ApplicationSequence`，但 STP raw 校验失败发生在 duplicate、rule、band、mode 与 Accepted 之前，必须满足：

```text
no Accepted
no Trade / SelfTradePrevented
no order registry entry
no AcceptanceSequence consumption
no maker or book mutation
```

修正同一个 orderId 的 group/policy 后，调用者仍可在下一应用边界提交；它不应被前一次 raw rejection 误判为 duplicate。

反过来，一旦输入通过 STP 校验，duplicate 必须早于 rule/mode 和盘口预检。不能为了判断 self trade 先扫描 book，再发现 orderId 已存在。

## 命令携带策略才能确定重放

一个诱人的实现是把 market-wide STP policy 放进本地配置：

```text
node A: CANCEL_TAKER
node B: CANCEL_MAKER
same ordered Place → different state/events
```

这会让同一有序输入在不同节点产生不同 maker/taker 终态，无法进入未来复制状态机。M07 明确不实现节点本地策略热切换；需要变更 disposition，就由下一条 Place 携带新的 policy。

同理，matching 不能在扫描时查询“group 7 现在是否还包含 maker account”。replay 的业务事实来自命令，不来自重放时刻的外部数据库。

## 用三个反例检查边界

| 输入                                  | 正确观察                  | 常见错误                        |
| ------------------------------------- | ------------------------- | ------------------------------- |
| legacy taker 0/NONE 遇 legacy maker 0 | 正常按价格时间成交        | 把 0 当真实组，全部阻止         |
| group 7/NONE                          | `INVALID_STP_INSTRUCTION` | 当作“关闭 STP”并接受            |
| group 7/CANCEL_MAKER 遇 group 8 maker | 正常 Trade                | 看到任意非零 group 就取消 maker |

最后一行说明 STP 判断是“同一正 group”，不是“双方都启用了 STP”。不同 group 的价格时间行为必须与 M06 完全相同。

## 本地练习入口与当前交付状态

从冻结起点建立自己的分支：

```bash
git switch -c unit/m07 course/m07-start
```

仓库的统一入口是：

```bash
./gradlew clean build --no-daemon
./gradlew m07Check --no-daemon
```

start 坐标的 `m07Check` 会先验证冻结 schema、fixture、permalink 和累计 M00～M06，再以结构化 `GOAL_NOT_IMPLEMENTED` 非零退出；这是预期 RED，不能为让命令变绿而追加 `|| true`。complete 坐标上的同一入口已经运行 production/reference/event-ledger、24 项 coverage 和八项变异裁判，并输出 `matching.m07.check.v2 / PASS`。

本站只托管完成后发布的同源静态 evidence；它不会上传源码、编译 Java 或调用外部 Judge。Java 构建、确定性裁判和反例重放仍由读者在本地 matching 仓库运行。

## 本篇停止点

本篇只冻结了 STP 输入身份与验证：正 group 是 matching 不解释的等价类，policy 是 taker-side 命令事实，旧入口明确映射 `0/NONE`，三层 raw 校验发生在任何状态读取之前。

本篇刻意不展开三种 disposition 怎样改变 maker/taker 余量和终态，下一篇再进入那条状态机。整个 M07 更没有账户查询、资产风控、动态策略配置、WAL、网络、复制或 HA；这些不能从一个 group 字段推导出来。
