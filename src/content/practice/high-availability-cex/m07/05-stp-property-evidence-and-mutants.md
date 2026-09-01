---
title: "M07·05：用三方账本与八个变异体证明 STP 会拒绝错误"
description: "组织 16/72 固定语料、160×64 生成历史、24 项覆盖义务和八个 semantic mutants，并划清有限证据与生产声明边界。"
date: 2026-08-31T16:35:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M07
lessonOrder: 50
permalink: stp-property-evidence-and-mutants
tags:
  - 撮合引擎
  - STP
  - 性质测试
draft: false
---

> annotated [`course/m07-start`](https://github.com/lcha-reln/cex-matching/tree/course/m07-start) 冻结输入；annotated [`course/m07-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m07-complete) peeled 到 `8e9c147b12bfb6b55e69ff04ecfe3aa4c510ed23`。下列数字来自该干净提交生成的[公开 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m07/evidence/manifest.json)，不是计划值或浏览器模拟值。

手写三个“同组订单”用例，很容易得到一个看似工作的 STP；它仍可能让不同组被取消、只扫 best level、把 FOK 的 self liquidity 算进去，或让 POST_ONLY 先删 maker 再入簿。测试价值不在于能证明正确实现会通过，而在于能否稳定反对这些可信错误。

M07 的完成论证是：**production、独立 flat-list reference 和第三事件账本逐命令一致；固定语料与冻结生成 profile 命中明确义务；八个 semantic mutants 各有 one-minimal、可 fresh replay 的 `STUDENT_FAILURE`。这仍是有限工程证据，不是形式证明或生产验收。**

## start 冻结输入，complete 才能发现输出

M07 start 应冻结三类声明：

```text
strict fixed-scenario schema + input fixture
strict generator schema + profile fixture
course declaration + five exact tutorial permalinks
```

固定规格要求 16 个 scenario / 72 条 command。这里不只写主题名，而是对照冻结文件列出 exact ID 与各自命令数：

```text
RAW_GROUP_VALIDATION                         3
RAW_POLICY_VALIDATION                        4
GROUP_POLICY_PAIR_VALIDATION                 5
LEGACY_NONE_REGRESSION                       4
DIFFERENT_GROUP_TRADES                       4
CANCEL_TAKER_SAME_GROUP                      3
CANCEL_MAKER_SAME_GROUP                      3
CANCEL_BOTH_SAME_GROUP                       3
SAME_PRICE_FIFO_INTERLEAVE                   6
CANCEL_MAKER_CROSS_LEVEL                     6
PARTIAL_BEFORE_STP                           5
GTC_REMAINDER_AFTER_STP                      4
IOC_STP_REMAINDER                            4
FOK_STP_AWARE_ATOMICITY                      7
POST_ONLY_RAW_BOOK_PRIORITY                  4
RULE_MODE_ATTRIBUTION_FAILURE_ATOMICITY      7
------------------------------------------------
TOTAL                                       72
```

这些 history 同时覆盖 BUY/SELL taker：例如 `CANCEL_MAKER_CROSS_LEVEL` 是 SELL 跨 bid 价位，FOK 的 `CANCEL_BOTH` 分支也是 SELL，POST_ONLY 也有 SELL crossing rejection。不能拿一组 BUY 单测宣称方向对称。

`16/72` 在 start 只是冻结**输入规模**，不等于命令已经通过；complete 才真实生成 fixed result、generated history 与 counterexample。最终 M07F1 为 10,128 bytes / 73 lines / `sha256:4c0675ee77458fb10b28e3c13d48767a653a41e922f42264f8d0f76aa5644176`。

## 三方逐边界比较，而不是两份 snapshot 相等

三个观察者承担不同责任：

| 观察者                | 表示                                                                                                     | 不允许复用                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| production            | `SingleInstrumentMatchingEngine` 的 price levels、registry、真实 event batch                             | —                                                      |
| independent reference | `M07LinearReferenceModel` 的 flat-list orders 与自有 `M07ReferenceCommand`/`M07SemanticEvent`/book state | production type、matcher、STP helper、policy preflight |
| third ledger          | 从 raw command 与归一化事件重新推导生命周期及不变量                                                      | 任一方的 snapshot 作为真相                             |

当前 reference 源文件没有导入 production matching type，但“没有 import”只是结构独立的必要条件。它仍必须自己实现：

```text
best-price + earliest-sequence scan
positive group equality
taker-side disposition
FOK STP-aware read-only simulation
POST_ONLY raw-book guard
rule/mode decision priority
```

若 reference 调用 production 的 `sameParticipant()` 或 `canFillWithStp()`，两边可能一起接受同一错误。放在另一个 package 不等于算法独立。

第三 ledger 则在每条命令后推导：

```text
ApplicationSequence / AcceptanceSequence continuity
orderId + group + lifecycle + quantity partition
price-time selected maker
Trade / SelfTradePrevented real order
maker/taker canceled remainder
active/admission/execution RuleSet attribution
MarketMode + rule/mode fences
full-depth resting book
```

它还维护最重要的不变量：

```text
no Trade event may pair equal positive participant groups
```

只比较最终 book 会漏掉“先 self Trade、再回滚数量”；ledger 必须在事件出现的那个瞬间拒绝它。

## 生成 profile 扩展五类交错

冻结 generator 使用 repository-owned `splitmix64-v1`、decimal base seed `5707`：

```text
160 fresh histories × 64 commands
= 10,240 deterministic command boundaries
```

`historyIndex % 5` 把它们平均分成五条 lane，每 lane 32 条 history：

| exact lane id                  | 主要目标                                                  |
| ------------------------------ | --------------------------------------------------------- |
| `VALIDATION_AND_LEGACY`        | raw priority、0/NONE、不同组回归、旧入口                  |
| `CANCEL_TAKER`                 | prior non-self fills、完整 taker remainder、stop          |
| `CANCEL_MAKER_AND_CROSS_LEVEL` | 连续 self makers、同价与跨价位 continue                   |
| `CANCEL_BOTH`                  | 双终态、双方 exact remainder、stop                        |
| `POLICY_RULE_MODE_MIXED`       | IOC/FOK/Post-only、versioned rule 与 restricted mode 交错 |

每条 history 必须 fresh，不能从上一条残留 book、group 或 active rule。lane 应先插入可达关键性质的确定前缀，再生成剩余命令；纯随机流量很可能长期停在 legacy `0/NONE` 或 OPEN/GTC happy path。

## 24 项 obligation 要有语义 witness

start fixture 已经冻结以下 24 个 exact ID：

```text
INVALID_STP_GROUP_ID
INVALID_STP_POLICY
INVALID_STP_INSTRUCTION
VALIDATION_FAILURE_ATOMIC
LEGACY_ZERO_NONE_COMPATIBILITY
GROUP_ZERO_NEVER_SELF
DIFFERENT_GROUP_TRADE
SAME_GROUP_NO_TRADE
CANCEL_TAKER_CANCELS_FULL_REMAINDER
CANCEL_TAKER_PRESERVES_MAKER
CANCEL_MAKER_CANCELS_MAKER
CANCEL_MAKER_CONTINUES_SAME_LEVEL
CANCEL_MAKER_CONTINUES_CROSS_LEVEL
CANCEL_BOTH_CANCELS_BOTH
PRICE_TIME_EVENT_INTERLEAVING
PARTIAL_TRADE_BEFORE_STP
GTC_REMAINDER_RESTS
IOC_STP_AND_REMAINDER_REASONS
FOK_TAKER_OR_BOTH_PRECHECK
FOK_CANCEL_MAKER_PRECHECK
FOK_FAILURE_ATOMIC
POST_ONLY_RAW_BOOK_FIRST
RULE_SET_ATTRIBUTION
MARKET_MODE_BEFORE_STP
```

exact ID 已知并不自动产生 witness。completion runner 已把每项绑定到可重放的 history index/command boundary，公开报告因此可以写成真实的 `24/24`。

代码行覆盖率不能替代这些 witness。执行过 `CANCEL_MAKER` 分支，不代表测试真的观察到同价下一单和后续价位；看到 `FOK_NOT_FILLABLE`，也不代表 maker、identity 与 sequence 保持不变。

每个 obligation 应指向可重放的 history index/command boundary，而不是一个运行时自增计数器。

## 八个 mutant 是裁判的反对清单

completion judge 必须让以下精确 fault id 得到 `STUDENT_FAILURE`：

```text
M07-SAME-GROUP-TRADE-ALLOWED
M07-DIFFERENT-GROUP-CANCELED
M07-CANCEL-TAKER-SKIPS-SELF
M07-CANCEL-MAKER-CANCELS-TAKER
M07-CANCEL-BOTH-LEAVES-MAKER
M07-FOK-COUNTS-RAW-SELF-LIQUIDITY
M07-POST-ONLY-RUNS-STP-FIRST
M07-CANCEL-MAKER-BEST-LEVEL-ONLY
```

它们分别反对：

| mutant                        | 最小可观察差异                               |
| ----------------------------- | -------------------------------------------- |
| same-group trade allowed      | 同一正 group 出现 `Trade`                    |
| different-group canceled      | 不同 group 的 maker/taker 被 STP 终止        |
| cancel-taker skips self       | self maker 被绕过，后续 maker 被成交         |
| cancel-maker cancels taker    | taker 没有继续扫描                           |
| cancel-both leaves maker      | maker 仍 RESTING 或可再次成交                |
| FOK counts raw self liquidity | 不可兑现的 FOK 被 Accepted，或拒绝时改 maker |
| Post-only runs STP first      | raw cross maker 被删，taker 错误 Rest        |
| cancel-maker best-level only  | 后续同价/跨价位 maker 未被继续扫描           |

一组只断言“最终没有 self Trade”的测试杀不死所有 mutant：它可能允许不同组误取消，也可能完全停止交易。必须同时证明 safety（同组不 Trade）与 non-interference（不同组、legacy 和既有策略不被破坏）。

## shrink 必须保留同一性质指纹

发现失败 history 后，shrinker 从 fresh engine 开始确定性删命令。合法 counterexample 必须：

1. 非空且短于发现历史；
2. one-minimal：删除任何剩余命令都会失去同一 property fingerprint；
3. 保存完整 canonical command history，而不只保存 seed；
4. production/reference/ledger 用 fresh state 严格 replay；
5. replay 得到相同 fault id、边界与观察差异。

例如 `POST_ONLY-RUNS-STP-FIRST` 的最小结构通常需要：先建立同组可成交 maker，再提交同 group、`CANCEL_MAKER` 的 crossing POST_ONLY。预期是 Accepted 前 `POST_ONLY_WOULD_TAKE` 且 maker 不变；mutant 则取消 maker并让 taker Rest。若 shrink 删除 maker，这个性质就不可观察。

`CANCEL-MAKER-BEST-LEVEL-ONLY` 则必须保留至少一个需要继续观察的后继价位；只剩 best maker 的 history 无法证明跨价位缺陷。

## `SYSTEM_ERROR` 永远不是 mutant kill

候选、reference、generator、parser、shrinker、replay 或文件系统若抛异常，结果是 `SYSTEM_ERROR`。它不能计为“错误实现已被测试发现”，原因很直接：一个对所有输入都 `throw` 的候选不应获得 8/8。

`STUDENT_FAILURE` 必须包含稳定语义差异，例如：

```text
expected event/state
actual event/state
property fingerprint
canonical minimal history
fresh replay result
```

基础设施错误 fail closed，修复后重跑；不能用 retry 直到偶然得到想要的 mutant score。

## 本地 gate 的合同

M07 start 已从 M06 complete 的不可移动基线创建。正式课程入口是：

```bash
./gradlew clean build --no-daemon
./gradlew m07Check --no-daemon
```

start 上，`clean build` 保持 M00～M06 GREEN；`m07Check` 验证 strict schemas、16/72 input、seed 5707、160×64、五 lane、24 obligation id、八 mutant id 与五篇 permalink 后，以结构化 `GOAL_NOT_IMPLEMENTED` 非零退出。

complete 上，同一入口已经验证 production/reference/event-ledger、fixed/generated differential、24 项 coverage witness、八个 one-minimal strict replay、architecture gate 与继承回归。M07H1 为 1,709,692 bytes / 10,241 lines / `sha256:c2576f10a77c320ec4a9ad75e3dc3c03494f636feabdcc7157ee10e74812718f`；M07X1 为 18 commands / 2,778 bytes / 19 lines / `sha256:97504762c7f6349ac6bb02c26457d608dae6e0ad0231a19b10cf5c998a9c69ee`。

## Lab 与 evidence 的只读边界

本站可以读取完成发布后的静态 Java evidence，展示 history、Trade/STP/终态和 frozen expected result。它不能：

- 上传或编译学习者 Java；
- 调用远程 Judge；
- 根据浏览器模型重新生成权威 expected；
- 把 corpus/schema 自洽称为课程 PASS；
- 用动画冒充本地 FOK side-effect 或 mutant replay。

Java 编译和确定性裁判由读者在独立 matching 仓库本地执行，不需要新增外部服务。

## 有限证据允许说什么

| 已通过的完成 gate        | 可以说                          | 不能说                          |
| ------------------------ | ------------------------------- | ------------------------------- |
| 16/72 fixed              | 冻结场景逐边界一致              | 覆盖所有 STP 历史               |
| 160×64 generated         | seed/profile 下 10,240 边界一致 | 穷尽或形式证明                  |
| 24/24 obligations        | 每项声明有真实 witness          | 等同生产流量覆盖                |
| 8/8 mutants + replay     | 裁判能反对八类精确错误          | 能发现任意未知缺陷              |
| architecture gate        | 当前 core 守住禁依赖            | 已有账户、WAL、网络或 HA        |
| clean tag-bound evidence | artifact 绑定一个完成身份       | 已创建产品 release 或部署交易所 |

结果语言必须与证据强度相同。任何缺失 witness、unstable replay、dirty evidence 或 `SYSTEM_ERROR` 都不能降级成警告后发布 PASS。

## M07 的诚实停止点

M07 完成时可以描述为：确定性、单交易对、caller-serialized 的内存撮合器消费 opaque positive group 与 taker-side STP disposition；旧入口保持 `0/NONE`，同组 pair 不产生 Trade，三种取消策略与四种 ExecutionPolicy、rule/mode guard 组合唯一。

它仍不拥有账户/母子账户关系，不做资产风控、节点本地策略热切换、`DECREMENT_AND_CANCEL`、WAL、Snapshot、网络、性能、Aeron、复制或 failover。证据不是 production-ready 或高可用声明；下一单元 M08 才开始本地 WAL、ACK 与 durable idempotency。
