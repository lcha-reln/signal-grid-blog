---
title: "M05·05：用性质、变异体与发布原子性证明版本化价格带"
description: "以固定语料、独立 flat-list reference、第三事件账本、生成历史和八个 semantic mutants 收口 M05，并只在 clean complete identity 上发布 evidence。"
date: 2026-08-31T13:40:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M05
lessonOrder: 50
permalink: versioned-price-band-property-evidence
tags:
  - 撮合引擎
  - 性质测试
  - Release Evidence
draft: false
---

> M05 已完成原子发布。练习起点 annotated [`course/m05-start`](https://github.com/lcha-reln/cex-matching/tree/course/m05-start) peeled 到 `d66659a408514ba9091f3e882197ba692e2460e7`；完成坐标 annotated [`course/m05-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m05-complete) peeled 到 `e593c13292c0f97665f90239a4c8d4a1ca40f579`。[公开 evidence manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m05/evidence/manifest.json) 的 SHA-256 为 `d5ee9a4c278d204bfbb8df90feae570302339fb8028849b7ab44f39fc090a69a`；本单元没有产品 release，最新命名产品停止点仍是 `matching-0.1.0`。

前四篇已经得到 artifact identity、Prepare/Activate 栅栏、Place 决策链与 grandfather attribution。要把它们称为一个完成的工程单元，还需要回答：测试是否独立于 production、失败能否产生最小可重放反例、旧 M04 证明是否原样保留、公开 evidence 是否真的绑定同一个完成提交。

本篇证明：**M05 的发布资格来自逐命令的三方一致性与可反证证据，而不是几个 happy path；完成坐标、报告和博客已经作为同一个原子发布集合出现。**

## 先区分冻结输入与完成输出

`course/m05-start` 已冻结两份输入：

| 输入 | 固定事实 |
| --- | --- |
| `versioned-price-band-v1.json` | schema `matching.m05.scenario.v1`，12 场景、54 命令，SHA-256 `cd56fbbb0bc56dc809f741ed15ac53c7e8e41162745db7841cb853fc2768c53e` |
| `property-suite-v1.json` | schema `matching.m05.generator.v1`，splitmix64-v1、base seed 5505、160 × 64，SHA-256 `52dba5c70152eac7ae41464ec7e669526845ca7460deda160de3d9d614c69d57` |

这些 hash 证明裁判读到的是哪份**测试输入**。它们不能冒充 production 输出证据。

完成实现已经生成并冻结固定结果历史与生成命令历史。start artifact 不知道这些值；它们只能来自 complete identity 上的裁判输出：M05F1 为 67 行、109,974 bytes、`sha256:45be63337da83103a45040f5f73e9b996018d76f6d91f77e27cd5b2d9dbb8f7b`，M05H1 为 10,401 行、2,553,580 bytes、`sha256:e742e53e1846730a0f242447b3065e23e352059807d8593dcc3e489498d453f5`。

## 12 个固定场景建立可读的论证链

固定语料按具体故障组织：

| 场景组 | 要证明的合同 |
| --- | --- |
| legacy unbounded | v0 `[1, Long.MAX_VALUE]` 保持 M04 业务结果 |
| prepare / hash / conflict | claimed hash 重算、精确幂等、同 version 不得换内容、更高 version supersede |
| activation matrix | 无 prepared、错 target、stale application fence 都 fail closed，随后可在下一边界重试 |
| governed Place | stale expected rule 不占身份；边界包含；BUY/SELL 对称 |
| priority composition | duplicate 先于 fence/band；band 先于 FOK/Post-only precheck |
| grandfather | 旧越界 maker 保持 FIFO，并与新规则 taker 跨版本成交 |

每条命令边界都比较 event/control batch 与完整状态。只比较最终 book 会漏掉：失败 Activate 短暂清空 prepared、越界 Place 先占 sequence 后回滚、老 maker 在激活时被取消又用相同数量重建等历史错误。

固定例子适合人类复核，却不能覆盖交错空间。它们必须与生成历史、semantic mutants 共同构成证据，任何一层失败都不能发布 PASS。

## independent reference 不能调用 production helper

M05 reference 使用 flat-list 表示订单簿，并拥有自己的 artifact、identity、command、event 与 state 类型。它不能复用 production 的 comparator、band helper、canonical hash helper、事件 record 或 snapshot 生成器，否则同一缺陷可能被两边共同接受。

独立性不仅是放在另一个 package：

- reference price-time 顺序用平铺列表扫描表达，不复用 production price-level 数据结构；
- canonical `M05RS1` 在 testkit/reference 边界独立构造并与 test vector 比较；
- raw command 保留 legacy/governed、expected identity 与完整 artifact，不能预先归一成 production value；
- BigInteger 可作为参考域，避免照搬 production signed-long 溢出行为；
- 每条生成历史创建 fresh production、fresh reference、fresh ledger，状态绝不跨 history 泄漏。

production 与 reference 同时抛异常不是一致通过。候选、参考模型、generator、parser、shrinker 或文件系统控制抛错都归类 `SYSTEM_ERROR`。

## 第三本 ledger 不相信双方 snapshot

若裁判只断言 `productionSnapshot == referenceSnapshot`，两边可能都遗漏某类状态。第三本事件/状态 ledger 从命令与返回事件独立推导：

```text
order lifecycle
accepted identity + AcceptanceSequence
remaining quantity conservation
active / prepared RuleSetIdentity
ApplicationSequence continuity
controlRevision + ActivationFence
full-depth resting book with admission identity
```

它逐条检查事件语法：

- 拒绝是 singleton，且 application sequence 连续；
- Accepted 后的 `Trade*`、`Rested?`、`RemainderCanceled?` 满足 M04 policy grammar；
- 每个 Trade 的 maker 确实是当时最优价、同价最早序列；
- maker/taker admission 与 execution rule attribution 不漂移；
- Activate 前后 book 与 registry 不变；
- failed Activate 只推进应用序列，不改变控制状态；
- accepted sequence 不出现洞，拒绝与 Cancel 不占用它。

三者关系是：production 给出候选结果，reference 给出独立预期，ledger 验证双方都不能伪造的跨边界守恒事实。

## 10,240 条命令覆盖五条交错 lane

生成配置固定 160 条 fresh history，每条 64 条命令，共 10,240 个命令边界。`historyIndex % 5` 决定 lane，每条 lane 恰好 32 条 history：

1. `RULE_SET_LIFECYCLE_AND_HASH`；
2. `ACTIVATION_AND_PLACE_FENCE`；
3. `INCLUSIVE_BAND_BUY_SELL`；
4. `GRANDFATHERED_CROSS_VERSION`；
5. `MIXED_M04_POLICY_AND_CONTROL`。

每条 history 先放入对应的固定前缀，保证关键性质可达，再由 repository-owned splitmix64-v1 生成剩余命令。生成域包含 Place 65%、Cancel 15%、Prepare 12%、Activate 8%，以及非法字段、stale rule、越界价格与四种 M04 policy 的确定权重。

完成报告至少要让这 20 项 coverage obligation 全部命中：legacy bootstrap、hash mismatch、Prepare 幂等/冲突/supersession、无 Prepare 激活、stale activation、失败激活原子性、stale Place、上下界 touch、上下越界、BUY/SELL 对称、duplicate priority、band-before-FOK、band-before-Post-only、grandfathered maker、cross-version trade、rejection sequence continuity。

有限生成语料比固定例子更强，但它不是穷尽证明、形式化验证或生产容量证明。证据文字必须准确写成“在冻结输入与 profile 下逐边界一致”。

## 八个 mutant 让测试能够反对可信错误

completion judge 必须让以下精确故障都得到 `STUDENT_FAILURE`：

```text
M05-HASH-MISMATCH-PREPARED
M05-SAME-VERSION-DIFFERENT-HASH-ACCEPTED
M05-ACTIVATE-WITHOUT-PREPARE
M05-STALE-ACTIVATION-FENCE-ACCEPTED
M05-FAILED-ACTIVATION-CHANGES-ACTIVE
M05-OUT-OF-BAND-PLACE-ACCEPTED
M05-STALE-PLACE-RULE-ACCEPTED
M05-ACTIVATION-REVALIDATES-RESTING
```

每个 mutant 从 fresh engine 开始，找到失败历史后进行确定性 shrink。持久化的 counterexample 必须：

- 非空且严格短于发现时历史；
- one-minimal，删除任一剩余命令都会失去同一 property fingerprint；
- 保存完整 JSON 命令历史，而不是只保存随机 seed；
- fresh replay 仍得到相同 fingerprint；
- 只杀死语义 mutant，不能把异常、超时或写盘失败算作 kill。

额外 throwing control 必须稳定归为 `SYSTEM_ERROR`。否则裁判可以通过“所有错误实现都抛异常”伪造 100% mutant score。

## 本地 gate 与 evidence gate 承担不同职责

实现循环使用：

```bash
git switch -c unit/m05 course/m05-start
./gradlew clean build --no-daemon
./gradlew m05Check --no-daemon
```

`clean build` 守住累计 M00～M04；`m05Check` 在 start 上先给结构化 RED，在完成实现上才有资格写 `matching.m05.check.v2` PASS。不能用 `|| true`、删除测试或改弱 Schema 把 RED 染绿。

课程发布者只能在完整实现、干净工作树和完成 identity 已冻结后生成 evidence。读者复核已经发布的完成身份时直接使用现有 annotated tag：

```bash
git switch --detach course/m05-complete
git status --short
./gradlew clean build m05Evidence -Pm05.unitTag=course/m05-complete --no-daemon
```

发布流程验证了 annotated tag 确实 peel 到 `e593c13292c0f97665f90239a4c8d4a1ca40f579`，而不是同名 lightweight tag 或其他提交。以后若 evidence 反过来要求修改源码，发布者必须用新的补丁 identity 重新生成；不能移动现有 tag，也不能手改 manifest 的 source commit。

## completion evidence 已绑定同一个发布集合

完成提交的 `build/lab-evidence/M05/` 已由 manifest 间接或直接绑定：

- `matching.m05.check.v2` PASS 报告；
- 两份冻结输入及其 schema/digest；
- 固定结果历史与生成命令历史的 exact bytes/lines/SHA-256；
- coverage、逐边界 differential/ledger 结果；
- 八个 one-minimal counterexample 与 replay fingerprint；
- architecture gate 与 M04 regression/digest 结果；
- source commit、annotated `course/m05-complete`、`planVersion=0.7`、`dirty=false`；
- `productRelease=null`；
- persistence、recovery、networking、performance、Aeron、replication、HA 等明确 limitations。

实际发布事实如下，摘要均可从[公开 manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m05/evidence/manifest.json)继续追到原始 artifact：

| 发布事实 | 冻结结果 |
| --- | --- |
| completion peeled commit | `e593c13292c0f97665f90239a4c8d4a1ca40f579` |
| M05F1 fixed result | 12 场景 / 54 命令；67 行 / 109,974 bytes；`sha256:45be63337da83103a45040f5f73e9b996018d76f6d91f77e27cd5b2d9dbb8f7b` |
| M05H1 generated history | 160×64 = 10,240 边界；10,401 行 / 2,553,580 bytes；`sha256:e742e53e1846730a0f242447b3065e23e352059807d8593dcc3e489498d453f5` |
| coverage / mutants | 20/20 obligation；8/8 mutant 被杀死且 8/8 最小反例 fresh replay |
| M05X1 counterexamples | 57 条最小化命令；586 行 / 366,110 bytes；`sha256:ea4aa501053d8bf11d8c31a4ba2f2b590b7b69d2c68d7c06cfaa7bf2c7c85a25` |
| architecture | core 39 类 / reference 15 类 / 0 条 forbidden dependency |
| evidence manifest | `d5ee9a4c278d204bfbb8df90feae570302339fb8028849b7ab44f39fc090a69a` |

[M05 Matching Lab](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m05/lab/) 只读取已经发布的静态 Java Golden 与 evidence，让读者预测某条命令的 guard、事件与状态，再点击揭示 frozen expected result。它不上传任意 Java、不编译执行 Java，也不声称浏览器结果等价于本地裁判。

## 原子发布顺序

一次可信发布按依赖顺序推进：

1. matching 实现、测试与 `m05Check` 全绿；
2. clean commit 与 annotated `course/m05-complete` 形成同一 identity；
3. 在该 identity 上生成 evidence，逐文件复算 manifest 引用与顶层 digest；
4. 博客机械复制完整 evidence tree，不摘抄几个数字；
5. 教程填入 completion commit、tag、真实链接与 digest，解除 `draft`；
6. `units.ts` 同时切为完成、注册五篇 exact permalink；
7. 若 Lab schema 已冻结且 verifier 能证明 outcome 对齐，再注册 Lab；否则保持无 Lab；
8. Node 24 clean gate 通过后，才提交并部署；
9. 线上复核 manifest、文章、课程页、搜索与 sitemap 都来自同一次博客提交。

这次发布按上述顺序完成后才把 M05 切到 `PUBLISHED`；规则仍然适用于后续单元：不能先上线正文再补 evidence，也不能先把 unit 标成完成、让读者点进空链接。

## M05 的诚实停止点

M05 最终证明：单交易对、caller-serialized、内存撮合器可以内容寻址地 Prepare 与原子 Activate 一个版本化绝对入场价格带；新订单按 inclusive band 确定准入，旧订单 grandfather，结果具备跨版本规则归因。

它不证明行情参考价与百分比计算、operating mode、Mass Cancel、STP、持久化、恢复、网络协议、Aeron、复制、故障切换、吞吐或生产 readiness。下一单元 M06 只新增 operating modes + deterministic Mass Cancel，继续遵守“一次只引入一个可归因复杂度”的演进方法。
