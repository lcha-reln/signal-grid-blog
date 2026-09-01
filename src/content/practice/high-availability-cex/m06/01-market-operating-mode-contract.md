---
title: "M06·01：把交易开关写成可复制的市场运行模式合同"
description: "从 OPEN、CANCEL_ONLY、HALTED 三态出发，冻结客户动作矩阵、上游授权边界与 M05 规则状态的正交关系。"
date: 2026-08-31T15:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M06
lessonOrder: 10
permalink: market-operating-mode-contract
tags:
  - 撮合引擎
  - 运行模式
  - 确定性
draft: false
---

> 本单元的练习起点是 annotated [`course/m06-start`](https://github.com/lcha-reln/cex-matching/tree/course/m06-start)，权威完成点是 annotated [`course/m06-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m06-complete)，peeled commit 为 `854dcf470a9ea8a2765982861b21026be1416258`。本站保存同一提交生成的[完成 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m06/evidence/manifest.json)，manifest SHA-256 为 `f4a6f90ea5b92eddd8444e7bbe0764fbca963e2c598cb04c04f7c33db5cdd44d`。

M05 已经让规则集的 Prepare/Activate 拥有独立的应用边界，但撮合器仍默认“随时可以下单和撤单”。真实交易系统在异常行情、规则切换或人工处置期间，必须精确回答：现在还能新增风险吗、客户还能主动减掉挂单吗、运维能否一次终止整本挂单？

本篇只证明一件事：**运行状态不是外围网关里的布尔开关，而是撮合状态机内、随命令顺序确定演进的业务状态。** M06 用 `OPEN`、`CANCEL_ONLY`、`HALTED` 三态冻结客户权限；它不在撮合核心里实现账号鉴权，也不把停市偷偷等同于清空订单簿。

## 一个 `tradingEnabled` 为什么不够

若只有 `tradingEnabled=false`，至少有三个问题没有答案：

1. “不能交易”到底只禁止 Place，还是连客户 Cancel 也禁止？
2. 从停市恢复时，是否必须先给客户一个只撤单窗口？
3. 关闭开关时，已有订单是继续保留、自动撤销，还是等待显式 Mass Cancel？

这些不是 UI 文案差异，而是不同的可观察状态转换。把它们散落在 REST、风控和撮合分支里，同一条命令经过不同入口就可能得到不同结果；重放也无法仅凭有序命令恢复当时权限。

M06 因而把模式放进 `matching-core`：

```java
/** Replicated-ready operating mode for the single instrument. */
public enum MarketMode {
  OPEN,
  CANCEL_ONLY,
  HALTED
}
```

`replicated-ready` 只表示这个值可以成为未来复制状态机的一部分。当前单元仍是 caller-serialized、单进程、内存实现，没有 Aeron、Raft 或故障切换。

## 三态只表达业务权限，不夹带副作用

撮合器启动状态固定为：

```text
marketMode                   = OPEN
modeRevision                 = 0
lastModeTransitionFence      = empty
lastMassCancelFence          = empty
```

三种模式的精确定义如下：

| 模式 | 新 Place | 客户 Cancel | 含义 |
| --- | --- | --- | --- |
| `OPEN` | 允许 | 允许 | 正常接收客户新增和撤销 |
| `CANCEL_ONLY` | 拒绝 | 允许 | 不增加新风险，但允许客户主动退出挂单 |
| `HALTED` | 拒绝 | 拒绝 | 冻结客户写操作，等待显式运维处置 |

进入 `CANCEL_ONLY` 或 `HALTED` **都不会自动清簿**。已有订单、价格时间优先级、订单终态、规则归因、`AcceptanceSequence` 全部保留。需要清簿时，必须在 `HALTED` 后再提交独立的 `MassCancel` 命令；这样审计历史才能区分“改变权限”和“终止订单”两个事实。

一个危险反例是：

```text
OPEN --(operator halt)--> HALTED --(implementation clears book implicitly)--> empty book
```

这条实现把两项操作压成一个不可拆分副作用。调用方无法只冻结客户流量而保留现场，事件流也无法说明每张订单为何终止。M06 明确把它判为错误。

## 完整动作矩阵

模式作用于客户动作，但不阻断 M05 的规则控制：

| 动作 | `OPEN` | `CANCEL_ONLY` | `HALTED` | 拒绝结果 |
| --- | --- | --- | --- | --- |
| Customer Place | 允许 | 拒绝 | 拒绝 | `PlaceRejected(MARKET_NOT_OPEN)` |
| Customer Cancel | 允许 | 允许 | 拒绝 | `CancelRejected(MARKET_NOT_CANCELABLE)` |
| Prepare Rule Set | 允许 | 允许 | 允许 | 保留 M05 合同 |
| Activate Rule Set | 允许 | 允许 | 允许 | 保留 M05 栅栏 |
| Change Market Mode | 按转换图 | 按转换图 | 按转换图 | 稳定的 mode rejection code |
| Operator Mass Cancel | 拒绝 | 拒绝 | 允许 | `MassCancelEvent.Rejected(MARKET_NOT_HALTED)` |
| Book / control snapshot | 允许 | 允许 | 允许 | 无 |

这里特意没有“管理员 Place”或“绕过模式的内部 Cancel”。M06 只有已列出的公开命令；额外入口会制造无法被固定语料与 reference model 共同解释的第四套权限。

## 客户拒绝必须由撮合器自己给出

Place 的新模式检查出现在 M00～M05 已冻结的检查之后、FOK/Post-only 状态预检之前：

```text
M00 field validation
→ execution-policy validation
→ duplicate order id
→ expected active rule set
→ active order-entry price band
→ market-mode permission
→ FOK / Post-only state precheck
→ acceptance-sequence capacity
→ accept and execute
```

因此在 `CANCEL_ONLY` 中：

- 非法价格仍返回 M00 `INVALID_PRICE`；
- 重用旧订单号仍返回 `DUPLICATE_ORDER_ID`；
- 其余 schema-valid Place 返回 `MARKET_NOT_OPEN`；
- 不读取 FOK 可成交量，不用 Post-only 探测对手盘，也不占用订单身份或 `AcceptanceSequence`。

Cancel 的顺序更短：

```text
field validation → market-mode permission → order lookup / lifecycle → cancel
```

所以 `HALTED` 中对不存在、已成交、已撤销订单的 schema-valid Cancel，统一返回 `MARKET_NOT_CANCELABLE`。若先查生命周期，攻击者可以在停市期间用不同错误码探测订单存在性；更重要的是，production 与 reference 会因内部 registry 差异暴露出不属于这个边界的状态。

## `OperatorId` 是归因，不是权限证明

控制命令使用一个严格但不解释业务含义的值对象：

```java
public record OperatorId(String value) {
  public OperatorId {
    Objects.requireNonNull(value, "value");
    if (value.isBlank() || value.length() > 128) {
      throw new IllegalArgumentException(
          "operator id must contain 1 to 128 non-blank characters");
    }
  }
}
```

它只回答“上游已经授权的调用者以什么稳定字符串写入审计事件”，不回答“这个人是否有停市权限”。成功和业务拒绝事件都原样携带同一个 `OperatorId`，但以下能力明确在 M06 之外：

- API key、角色、签名和令牌校验；
- 双人复核、审批流和撤权；
- 管理后台与审计数据库；
- 从账号或组织关系反查 operator。

这条边界很关键：把授权查询放进确定性核心，会引入数据库、时钟和外部状态；把 `OperatorId` 当成权限凭证，又会让任何非空字符串看起来像通过了授权。

## 模式与规则是两条正交状态轴

`MarketControlSnapshot` 同时保留 M05 规则状态与 M06 模式状态：

```java
public record MarketControlSnapshot(
    MarketRuleSetArtifact activeRuleSet,
    Optional<MarketRuleSetArtifact> preparedRuleSet,
    long controlRevision,
    Optional<ActivationFence> lastActivationFence,
    ApplicationSequence nextApplicationSequence,
    AcceptanceSequence nextAcceptanceSequence,
    MarketMode marketMode,
    long modeRevision,
    Optional<ModeTransitionFence> lastModeTransitionFence,
    Optional<MassCancelFence> lastMassCancelFence) {}
```

正交意味着：

- Change Mode 不激活、不丢弃 prepared artifact；
- Activate Rule Set 不改变 mode，也不清理旧订单；
- Prepare/Activate 在三个模式都可用；
- Mass Cancel 不改变 active/prepared rule state；
- `controlRevision` 与 `modeRevision` 各自只由自己的成功转换推进。

一个可操作的停市流程因此由多条显式命令组成：

```text
HALTED
→ Prepare(new rule)
→ Activate(new rule)
→ MassCancel
→ inspect snapshots / evidence
→ CANCEL_ONLY
→ OPEN
```

顺序可以被日志、reference 和第三账本逐边界复核；没有任何“换规则顺便清簿并自动开市”的复合魔法。

## 在本地真正编译并观察合同

这门课不把 Java 发给外部服务。进入 matching 仓库后，本地运行：

```bash
git switch -c unit/m06 course/m06-start
./gradlew clean build --no-daemon
./gradlew m06Check --no-daemon
```

在 start 坐标，`clean build` 用来守住已完成的 M00～M05；`m06Check` 会验证冻结声明并以结构化 `GOAL_NOT_IMPLEMENTED` 非零退出。这是教学 RED，不应追加 `|| true` 抹掉。实现循环中可聚焦运行真实核心测试：

```bash
./gradlew :matching-core:test \
  --tests io.github.lchareln.cex.matching.SingleInstrumentMarketModeTest \
  --no-daemon
```

建议先预测这三条断言，再查看测试：

| 输入边界 | 应有结果 | 绝不能发生 |
| --- | --- | --- |
| `CANCEL_ONLY` + valid Place | `MARKET_NOT_OPEN` | 接受、成交或 Rest |
| `HALTED` + Cancel(unseen id) | `MARKET_NOT_CANCELABLE` | 暴露 `ORDER_NOT_FOUND` |
| `OPEN → HALTED` | mode revision +1 | 自动清空 book |

## Lab 只能帮助读事件，不能替代裁判

博客没有为 M06 伪造浏览器撮合器；教程只读取本站同源发布的静态 Java Golden/evidence，让读者先预测 guard、事件与状态，再对照冻结结果。它不会上传源码、不会在浏览器或远端编译 Java，也不会调用外部 Judge。

因此“我在网页里把预测选对了”只证明理解了一个已发布边界；真正实现仍要由本地 Gradle 编译、核心测试、独立 reference、第三账本与变异测试共同裁决。单独验证语料文件自洽也不能算课程 PASS。

## 本篇停止点

到这里，我们只获得了三态合同、精确动作矩阵、审计归因边界，以及与 M05 规则状态正交的模型。还没有证明安全转换、批量撤单顺序和失败原子性；它们分别留给后续三篇。

更不能声称已经拥有持久化、恢复、网络协议、operator 鉴权、多交易对、性能、Aeron、复制、故障切换或生产高可用。M06 的目标是把未来复制必须共享的业务决定先做成确定状态，而不是提前搭分布式外壳。
