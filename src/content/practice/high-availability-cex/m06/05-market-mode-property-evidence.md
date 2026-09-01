---
title: "M06·05：用独立模型、第三账本与变异体收口运行模式证据"
description: "把固定场景、五类生成历史、26 项覆盖义务和十个 semantic mutants 组织为可重放的有限证据，并划清 Lab 与发布声明边界。"
date: 2026-08-31T15:40:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M06
lessonOrder: 50
permalink: market-mode-property-evidence
tags:
  - 撮合引擎
  - 性质测试
  - Release Evidence
draft: false
---

> annotated [`course/m06-start`](https://github.com/lcha-reln/cex-matching/tree/course/m06-start) 冻结输入；annotated [`course/m06-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m06-complete) peeled 到 `854dcf470a9ea8a2765982861b21026be1416258`。下列数字来自该干净提交生成的[公开 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m06/evidence/manifest.json)，不是计划值或浏览器模拟值。

前四篇已经给出模式、转换栅栏、客户权限与 Mass Cancel 合同。现在的问题不是“再写几个单元测试”，而是如何证明裁判能够反对一批可信错误，同时又不夸大有限语料的结论。

本篇的核心论点是：**M06 的完成资格来自 production、独立 flat-list reference 与第三事件账本逐命令一致，再加固定语料、冻结生成 profile、可最小化 semantic mutants 和严格 fresh replay；这些是有限工程证据，不是形式证明、容量测试或生产高可用认证。**

## 先分清冻结输入与完成输出

start 坐标冻结的是裁判输入与结构声明：

| 输入 | 路径 | 冻结合同 |
| --- | --- | --- |
| fixed scenarios | `matching-testkit/src/test/resources/m06/fixtures/market-mode-mass-cancel-v1.json` | schema `matching.m06.scenario.v1` |
| generated profile | `matching-testkit/src/test/resources/m06/fixtures/property-suite-v1.json` | schema `matching.m06.generator.v1` |
| course declaration | `course.properties` | unit、状态、permalink、evidence path |

它们的 input hash 用来防止测试配置漂移，却不能冒充完成输出。start 不知道 production 执行后会产生哪些 fixed result bytes、generated history bytes、coverage witness 或最小反例，因此不能预写所谓 M06F1/M06H1/M06X1 摘要。

只有在完整实现、reference、ledger、judge 与回归都通过后，complete identity 才能生成并冻结真实输出。若 evidence 反过来要求修改源码，就必须创建新的完成身份重新生成，不能手改 manifest 或移动旧 tag。

## 固定语料负责让人读懂合同

冻结规格声明 15 个场景、64 条命令，其命令分布是：

```text
PLACE                 21
CANCEL                 6
PREPARE_RULE_SET       2
ACTIVATE_RULE_SET      2
CHANGE_MARKET_MODE    24
MASS_CANCEL            9
```

这些数字首先是 start 冻结的**输入 profile**；complete 上的 M06F1 已真实执行并得到 8,113 bytes / 65 lines / `sha256:2f9126e7100581020d2a56dd7da4736ab026a7f9533b051bde4490cda210855b`。fixed corpus 覆盖：

- bootstrap 仍为 `OPEN / modeRevision=0`，M00～M05 行为保持兼容；
- 客户 Place/Cancel 的完整三态权限矩阵；
- stale application fence、wrong expected mode、same-mode 与非法直开；
- mode 失败原子性，以及转换不清簿；
- Prepare/Activate 在受限模式仍合法；
- `OPEN`、`CANCEL_ONLY` 中 Mass Cancel 拒绝；
- `HALTED` 中 empty、bid-only、ask-only 与跨边跨价位成功；
- 全局 acceptance 顺序、终态 identity 与规则归因。

固定场景适合 code review 和教程推演，却不可能覆盖 64 条以外的交错。它只能回答“这些明确边界得到冻结结果”，不能回答“所有可能历史都正确”。

## reference 必须在结构上独立

production 使用 price-level maps、addressable registry 与真实事件 records。M06 reference 则用 flat list 表示订单状态，拥有独立的 command、artifact、identity、event、book 和 market state 类型。

独立性至少要求：

- 不复用 production 的 mode transition helper；
- 不复用 production 的 `Comparator` 或 Mass Cancel target builder；
- 不调用 production snapshot 生成 expected state；
- 不把 raw command 预先归一成 production value object；
- 用自己的生命周期扫描实现 Place、Cancel、rule control、mode 与 Mass Cancel；
- 每条 history 创建 fresh reference，不跨历史残留状态。

若测试写成：

```text
expected = production.snapshot()
actual   = production.snapshot()
```

当然永远一致。稍隐蔽的同源错误，是 reference 直接调用 production 的 `isPermittedTransition` 或按 production 的 map 顺序构造取消事件；这会让“HALTED 可直开”或“非 acceptance 顺序”同时出现在两边而不被发现。

## 第三账本不信任任一方 snapshot

即使 production 与 reference 独立，两者仍可能共同遗漏某类状态。第三本 ledger 从输入命令与返回事件逐边界推导：

```text
ApplicationSequence continuity
AcceptanceSequence allocation
market mode + modeRevision + transition fence
active/prepared rule + controlRevision + activation fence
order identity + lifecycle + exact remaining quantity
admission/execution rule attribution
Mass Cancel grammar + fence + global order
full-depth resting book
```

对 mode rejection，ledger 检查只有 application sequence 推进；对 `HALTED` Cancel，它检查生命周期没有被探测或修改；对 Mass Cancel，它先从命令前账本冻结所有 resting identity，再验证：

```text
Started.count
== number of OrderCanceled
== Completed.count
== size(pre-command resting set)
```

同时要求中间 acceptance sequence 严格升序，最终 book 为空，registry 中每张 target 成为不可逆 CANCELED，active/prepared rules 与 mode revision 不变。

production/reference 同时抛异常不是“双方一致”。候选、reference、generator、parser、shrinker 或文件系统控制异常都应分类为 `SYSTEM_ERROR`，不能算课程通过。

## 生成 profile 扩展交错空间

冻结 profile 使用 repository-owned `splitmix64-v1`，decimal base seed `6606`。它声明 160 条 fresh histories，每条 64 个命令边界，并平均分为五条 lane，每 lane 32 条 history：

| lane | 主要交错 |
| --- | --- |
| transition / fence | 五条合法边、直开拒绝、stale sequence 与 mode revision |
| permission matrix | Place/Cancel 在三态中的优先级与零突变 |
| global cancellation order | 两边、多价位、部分余量、empty success |
| failure atomicity | 各 preflight 失败后全状态保留 |
| rule attribution / legacy regression | M05 Prepare/Activate、grandfathered identity 与 M00～M04 行为 |

每条 history 先放入能到达该性质的固定前缀，再由确定 generator 补齐。只“随机调用 API”通常大部分时间停在 `OPEN`，看不到 `HALTED → CANCEL_ONLY → OPEN`、stale fence 或跨规则 Mass Cancel。

profile 还冻结 26 个 exact coverage obligation。coverage 不是普通代码行覆盖率，而是可观察的语义 witness；例如必须真实出现：

```text
CANCEL_ONLY Place rejected
HALTED customer Cancel rejected before lifecycle lookup
HALTED → OPEN rejected
failed mode change retained book
non-HALTED Mass Cancel rejected without partial cancel
cross-side cancellation in acceptance order
empty Mass Cancel successful
terminal order id remains duplicate
historical admission + current execution attribution retained
```

运行了若干命令不等于覆盖义务满足；每个 obligation 都应指向可重放的具体 history 边界。

## 十个 mutant 证明裁判会说“不”

completion judge 必须针对以下精确 fault id 寻找 `STUDENT_FAILURE`：

```text
M06-CANCEL-ONLY-PLACE-ACCEPTED
M06-HALTED-CUSTOMER-CANCEL-ACCEPTED
M06-HALTED-DIRECTLY-REOPENED
M06-STALE-MODE-FENCE-ACCEPTED
M06-MODE-CHANGE-IMPLICITLY-CLEARS-BOOK
M06-FAILED-MODE-CHANGE-RESETS-OPEN
M06-MASS-CANCEL-WITHOUT-HALT
M06-MASS-CANCEL-NON-ACCEPTANCE-ORDER
M06-FAILED-MASS-CANCEL-PARTIALLY-CLEARS
M06-MASS-CANCEL-DROPS-TERMINAL-ATTRIBUTION
```

这些 fault 分别攻击权限、转换、failure atomicity、排序和终态历史。只测最终 book 是否为空，会漏掉至少“非 acceptance 顺序”和“丢失 terminal attribution”；只测返回码，又会漏掉失败后暗中清簿或重置 `OPEN`。

每个 mutant 必须：

1. 从 fresh engine 与 fresh reference 开始；
2. 找到具有稳定 property fingerprint 的失败 history；
3. 确定性 shrink；
4. 达到 one-minimal：删除任一剩余命令都不再得到同一 fingerprint；
5. 持久化完整命令 history，而不只是 seed；
6. 在 fresh process/state 中严格 replay 到同一 fingerprint。

若 mutant 只是让候选抛异常，judge 应报告 `SYSTEM_ERROR`；不能把“程序炸了”包装为精确语义反例。课程要证明的是裁判能指出哪条合同被违反。

## 一个最小反例应该长什么样

以 `M06-HALTED-DIRECTLY-REOPENED` 为例，发现时 history 可能有几十条无关 Place/Cancel。shrinker 的目标不是简单缩到两条命令，而是保留能复现**同一性质指纹**的最短必要历史，例如：

```text
1. ChangeMarketMode(expectedApp=1, expected=OPEN, target=HALTED)
2. ChangeMarketMode(expectedApp=2, expected=HALTED, target=OPEN)
```

预期第二条 `INVALID_TRANSITION` 且 mode 仍为 `HALTED`。faulty candidate 若返回 `ModeChanged` 或 snapshot 变成 `OPEN`，reference 与 ledger 都应在同一边界反对它。

对 `FAILED-MASS-CANCEL-PARTIALLY-CLEARS`，最小 history 还需要至少建立 resting order、进入合适 mode、触发拒绝，并证明 book/registry 未变化。不能为了缩短而删掉使 fault 可观察的前置状态。

## 本地 gate：RED 与 PASS 是不同坐标的事实

从 start 开始练习：

```bash
git switch -c unit/m06 course/m06-start
./gradlew clean build --no-daemon
./gradlew m06Check --no-daemon
```

`clean build` 守住已完成的 M00～M05。start 上的 `m06Check` 校验 course declaration、两份 strict schema、冻结输入、场景/命令分布、generator profile、lane、coverage id、mutant id 与五篇 permalink，然后写结构化 `matching.m06.check.v1`，以 `GOAL_NOT_IMPLEMENTED` 非零退出。

这个 RED 不是坏掉的构建，也不能用 `|| true`、删除校验或放宽 schema 伪装成绿。完成实现应在同一命令入口下额外证明 production/reference/ledger、fixed/generated differential、coverage witness、十个最小反例 fresh replay、architecture gate 与所有继承回归；是否 PASS 必须以当前 checkout 实际输出为准。

复核完成参考时运行：

```bash
git switch --detach course/m06-complete
git status --short
./gradlew clean build --no-daemon
./gradlew m06Check --no-daemon
```

不要从本文抄一个期待中的 digest 去“对答案”。应从该 tag 的真实报告和 manifest 逐文件复算；若工作树非 clean，先查明本地改动，不能把它混入已冻结 evidence。

## 浏览器 Lab 的只读边界

M06 教程页面可以读取同源静态 history、expected event/state 与 evidence 索引，支持：

```text
选择一条命令边界
→ 先预测 guard / event / state
→ reveal 冻结结果
→ 跳到对应 coverage 或最小反例
```

它明确不会：

- 上传用户 Java；
- 在浏览器或外部服务编译 Java；
- 启动远程 Judge；
- 接触私有仓库或账号数据；
- 把 corpus/schema 自洽检查称为课程 PASS。

真正的 Java 编译、确定性裁判和变异 replay 都由读者在本地运行。未来 Aeron 三节点与故障注入也应由本地环境承担，而不是为了交互页面引入一个难维护的远程执行平台。

## 证据允许说什么

| 已通过的真实 gate | 可以声称 | 仍不能声称 |
| --- | --- | --- |
| fixed differential | 冻结 fixed inputs 下逐边界一致 | 覆盖全部可能输入 |
| generated differential | 冻结 seed/profile 下 histories 一致 | 形式证明或穷尽验证 |
| coverage witnesses | 26 项声明义务都有可重放 witness | 生产流量分布已覆盖 |
| semantic mutants | judge 能反对这十类精确 fault | 能发现任意未知缺陷 |
| architecture gate | 当前 core 未引入被禁依赖 | 已具有持久化/复制能力 |
| clean evidence manifest | artifact 与一个完成身份绑定 | 产品 release 或生产部署 |

有限 corpus 的价值在于可复现、可审查、可反证，不在于制造“证明完毕”的语气。任何缺失 witness、mutant replay 不稳定或基础设施异常都必须 fail closed。

## 已封存的完成摘要

`course/m06-complete` 上的真实输出是：

```text
M06F1  15 scenarios / 64 commands
       8,113 bytes / 65 lines
       sha256:2f9126e7100581020d2a56dd7da4736ab026a7f9533b051bde4490cda210855b

M06H1  160 histories × 64 commands = 10,240 boundaries
       1,670,049 bytes / 10,241 lines
       sha256:b74dd3a6bad6048dcaaceaaeb8fe0c81d1e8d2272d352fe15ea921738f73e6c4

M06X1  10 one-minimal counterexamples / 22 commands
       3,210 bytes / 23 lines
       sha256:f55d1d7feabe527706a9974dbaf1a894c1420ea6b09bc9e1f7b9563032fca93b
```

两次 fresh generation 字节完全一致；10,240 个 production/reference differential、event-ledger check 与 reference-ledger check 全部执行。26/26 obligation 有具体 witness，10/10 mutant 以 `STUDENT_FAILURE` 被杀死，抛错 control 保持 `SYSTEM_ERROR` 且不计 kill。架构报告为 49 个 core source、23 个 reference source、0 个 forbidden finding。

manifest 绑定 18 个 evidence artifact，每个文件只归属于一个 claim；`productRelease` 为 `null`。外层 manifest SHA-256 是 `f4a6f90ea5b92eddd8444e7bbe0764fbca963e2c598cb04c04f7c33db5cdd44d`。这些数字说明冻结语料与裁判在该提交上通过，不把 M06 扩大成持久化、高可用或生产资格证明。

## M06 的诚实停止点

完成 M06 后，系统可以被准确描述为：单交易对、caller-serialized、内存撮合器拥有显式 `OPEN/CANCEL_ONLY/HALTED` 模式、安全转换图、独立 mode fence，以及 `HALTED`-only、全局 acceptance 顺序、方法边界原子的 Mass Cancel；规则与订单终态归因保留。

它仍然非持久化、单进程，不包含 STP/participant identity、Snapshot、协议、网络、数据库、operator 鉴权、管理 UI、性能证明、Aeron、复制、failover、多交易对、自动 reopen 或隐式规则清簿。`productRelease` 仍应为空；“高可用 CEX”是整个长篇的终局方向，不是 M06 已经获得的标签。

下一单元 M07 只引入同参与方自成交保护；本地 WAL、ack 与恢复要到 M08 才开始。继续坚持一次新增一个可归因复杂度，才能知道哪条证据真正证明了什么。
