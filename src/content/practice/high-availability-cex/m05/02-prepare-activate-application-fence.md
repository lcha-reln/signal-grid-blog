---
title: "M05·02：Prepare、Activate 与精确的应用序列栅栏"
description: "把规则发布拆成可审计的准备与激活命令，并用 ApplicationSequence、controlRevision、firstAcceptanceSequence 定义唯一生效边界。"
date: 2026-08-31T13:10:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M05
lessonOrder: 20
permalink: prepare-activate-application-fence
tags:
  - 撮合引擎
  - 状态机
  - 确定性
draft: false
---

> 本文保留从 annotated [`course/m05-start`](https://github.com/lcha-reln/cex-matching/tree/course/m05-start)（peeled commit `d66659a408514ba9091f3e882197ba692e2460e7`）开始的练习路径；起点的 `GOAL_NOT_IMPLEMENTED` 是历史教学状态。完成实现位于 annotated [`course/m05-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m05-complete)（peeled commit `e593c13292c0f97665f90239a4c8d4a1ca40f579`），最终结果可在[公开 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m05/evidence/manifest.json)中复核。

上一篇把价格带封装成了内容可寻址的不可变 artifact。现在还有一个更危险的问题：**这份 artifact 究竟从哪一条命令开始生效？**

如果答案只是“配置刷新完成以后”，那么两个副本可能在不同订单之间切换，线上事故也无法准确重放。M05 把发布拆成 `PrepareRuleSet` 与 `ActivateRuleSet`，并把 Activate 成功返回的 method boundary 定义为唯一生效栅栏。

本篇要证明的命题是：**Prepare 只保存候选，Activate 只能在调用方声明的下一条 `ApplicationSequence` 上原子切换；失败的业务命令仍占用应用序列，但不得偷偷改变 active、prepared、订单簿或订单身份。**

## 为什么不能把 Prepare 当成“写配置并立即使用”

运维面向一个交易对发布新规则，通常会经历上传、校验、预热与切换。如果 `prepareRuleSet` 在校验成功后顺手改了 `activeRuleSet`，就会产生三个问题：

- 上传动作与生效动作无法独立审批；
- 不同调用者无法知道候选是否已经影响新订单；
- hash 校验、版本冲突或切换失败时，状态可能只更新一半。

因此 engine 显式保存两个槽位：

```text
activeRuleSet   // 当前所有新 Place 的准入依据，启动时为 version 0
preparedRuleSet // 至多一个通过完整校验、尚未生效的候选
```

Prepare 的成功结果只能是首次占用、精确幂等重放或更高版本 supersession。无论哪一种，`activeRuleSet` 都不变，订单簿也不变。真正的状态切换只有 Activate 一条路径。

## 三条序列各自回答不同问题

M05 同时出现三条递增轴，不能为了“简单”把它们合并：

| 轴 | 什么时候递增 | 回答的问题 |
| --- | --- | --- |
| `ApplicationSequence` | 每个产生确定业务/控制结果的 core command | 这次判断位于串行历史的第几个边界？ |
| `controlRevision` | 成功 Activate | active 控制状态成功切换过几次？ |
| `AcceptanceSequence` | Place 真正被接受 | 已接受订单的 price-time 先后是什么？ |

拒绝的 Place、Prepare 或 Activate 有确定结果，因此消费 `ApplicationSequence`；它们没有产生已接受订单，所以不消费 `AcceptanceSequence`。Cancel 同样需要应用序列，却不能占用订单接受序列。只有成功 Activate 才递增 `controlRevision`。

构造参数不合法、null 调用以及测试基础设施抛出的 `SYSTEM_ERROR` 没有完成一条确定的状态机命令，所以三条序列都不能前进。

这一划分让每条证据都只承担一种语义。若复用 `AcceptanceSequence` 作为激活栅栏，连续拒单或 Cancel 会在历史中消失；若复用 `controlRevision` 排 Place，绝大多数业务命令又没有位置。

## ApplicationSequence 必须在所有业务分支之前安全分配

可以先把 engine 的命令入口收敛到一个小骨架：

```java
private <T> T apply(CoreCommand<T> command) {
  ApplicationSequence applied = nextApplicationSequenceOrThrow();
  return command.applyAt(applied);
}
```

这不是让调用者并发执行的 sequencer。M05 继续要求 caller-serialized：同一 engine 的调用已经由上层串行化，core 不创建线程、不读时钟、不使用随机数。

序列耗尽必须在任何领域状态变更前检测。若当前值已经无法安全加一，命令整体失败，不能出现“订单先成交，返回结果时才发现 sequence overflow”。相反，一旦成功取得应用序列，后来发现 expected active 不匹配也属于确定业务拒绝，该序列已经成为历史边界，不能回收。

## Activate 同时比较三个事实

Activate 输入至少包含：

```java
public record ActivateRuleSet(
    ApplicationSequence expectedApplicationSequence,
    RuleSetIdentity expectedActive,
    RuleSetIdentity target) {}
```

三项比较分别防止不同的竞态：

1. `expectedApplicationSequence` 必须等于这次调用刚取得的应用序列，防止“本来想在 S 生效”的操作跨过了其他业务命令；
2. `expectedActive` 必须精确等于当前 active identity，防止在旧控制视图上覆盖已经生效的新版本；
3. `target` 必须精确等于当前 prepared identity，且 prepared artifact 重新计算的 hash 仍然匹配，防止激活不存在、被 supersede 或已损坏的候选。

任何一项失败都返回控制拒绝。它消费本次 `ApplicationSequence`，但必须保持：

```text
activeAfter == activeBefore
preparedAfter == preparedBefore
controlRevisionAfter == controlRevisionBefore
bookAfter == bookBefore
registryAfter == registryBefore
nextAcceptanceSequenceAfter == before
```

特别注意 prepared 不能因一次失败激活而被清空。保留候选，操作员才能读取快照、修正 expected boundary，并在下一条精确序列重试。

## 成功切换是一个不可拆开的状态迁移

通过全部比较后，同一方法边界原子完成：

```text
active := prepared
prepared := empty
controlRevision := controlRevision + 1
activationFence := (
  appliedCommandSequence,
  controlRevision,
  firstAcceptanceSequence = nextAcceptanceSequence
)
```

假设 Activate 消费应用序列 `S`：所有在它之前完成的命令观察旧规则，下一条命令是 `S + 1`，后续 Place 观察新规则。这里的“原子”来自 caller-serialized 状态机的方法边界，不来自数据库事务、WAL、Raft 或 Aeron。

`firstAcceptanceSequence` 则记录当时尚未分配的下一个接受序列。它不等于 `S + 1`：两条轴的增量条件根本不同。历史 accepted sequence 小于它的订单是在旧规则下进入；激活后新接受的订单从该值开始，并携带新的 admission identity。

## 用固定语料手算一次正确边界

固定场景 `prepare-activate-current-fence` 从全新 engine 开始：

| 应用序列 | 命令 | 关键结果 |
| ---: | --- | --- |
| 1 | Prepare v1 `[90,110]` | prepared=v1，active 仍为 v0 |
| 2 | Activate，expected=2 | active=v1，prepared 清空，revision+1 |
| 3 | governed BUY @ 90 | 下界包含，接受 |
| 4 | governed SELL @ 110 | 上界包含，接受 |
| 5 | Cancel 第一个订单 | 取消成功，不消费 acceptance sequence |

这里 Activate 的 expected 值是 `2`，不是 Prepare 返回后的“当前最大值 1”。合同表达的是**本次 Activate 必须正好应用在第 2 个边界**。

再看 `activation-rejection-matrix`：

| 应用序列 | 命令 | 结果与状态 |
| ---: | --- | --- |
| 1 | 未 Prepare 就 Activate | 拒绝；仍是 active v0、prepared empty |
| 2 | Prepare v1 | 成功；prepared=v1 |
| 3 | Activate 错误 target hash | 拒绝；prepared=v1 保留 |
| 4 | Activate 仍声称 expected=3 | stale fence 拒绝；prepared=v1 保留 |
| 5 | Activate 声称 expected=5 | 成功切换到 v1 |

第 3 次失败不能让第 4 次继续使用 `expected=3`，这正是“拒绝也占用应用边界”的意义。若实现只在成功时递增，两个不同历史会塌缩成同一个 sequence，操作者就无法证明中间发生过什么。

## 返回 batch，而不是让调用者拼接状态

`prepareRuleSet` 与 `activateRuleSet` 返回 `MarketControlBatch`，它应当一次性携带：

- 本次确定结果与已应用 `ApplicationSequence`；
- 返回时的 active identity、prepared identity 与 `controlRevision`；
- 成功 Activate 时形成的 `ActivationFence`；
- detached `MarketControlSnapshot`，之后的 engine 变更不会回写旧结果。

不要先返回状态码，再让 REST 层额外调用三次 getter 拼视图。中间只要穿过另一条串行命令，调用者拿到的就不再是同一个应用边界的事实。REST、OpenAPI 与 WebSocket 如何表达它们属于独立 `rest` 项目；matching-core 只冻结确定的领域结果。

## 独立练习：证明失败可重试而不是回滚序列

不要照抄固定语料的 version 1。可以从 bootstrap v0 开始准备 version 7、`[95,105]`，依次执行：

1. 在应用序列 1 用错误 target 激活，证明失败且没有 prepared；
2. 在序列 2 Prepare v7；
3. 在序列 3 用错误 expected active 激活，证明 v7 仍 prepared；
4. 在序列 4 用 stale `expectedApplicationSequence=3` 重试，再次失败；
5. 在序列 5 使用完整正确三元组，成功激活；
6. 比较每个 batch 的 detached snapshot，证明旧 batch 没被后续切换修改。

建议给 production engine 与 independent reference 同时喂入命令，并逐边界比较下面的投影：

```text
applicationSequence
control result
active identity
prepared identity / empty
controlRevision
activationFence / empty
nextAcceptanceSequence
book + registry
```

若一个实现抛异常，不能把它当作“拒绝结果一致”。异常属于 `SYSTEM_ERROR`，没有资格消费序列，更不能杀死语义 mutant。

## 本篇停止在内存串行栅栏

到这里，我们已经能准确回答“新规则从哪条 core command 开始生效”，但不能回答进程崩溃后怎样恢复这条历史，也不能回答三节点怎样复制同一个边界。那些分别需要后续 WAL、snapshot 与 Aeron Cluster 单元。

下一篇会把 active artifact 接到 Place 决策链中，区分场所的 entry band 与用户限价，并固定 duplicate、stale fence、band、FOK/Post-only 之间的优先级。
