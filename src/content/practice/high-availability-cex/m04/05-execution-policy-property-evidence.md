---
title: "M04·05：用性质、变异体和证据边界证明执行策略"
description: "让 production 与独立线性 reference 对拍验证优先级、IOC 数量分区、FOK/Post-only 零副作用，并用八项 semantic mutant 与 clean-tree manifest 收口 M04 evidence。"
date: 2026-08-28T20:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M04
lessonOrder: 50
permalink: execution-policy-property-evidence
tags:
  - 撮合引擎
  - 性质测试
  - Release Evidence
draft: false
---

> 练习起点是 annotated [`course/m04-start`](https://github.com/lcha-reln/cex-matching/tree/course/m04-start)；发布正文固定到 annotated [`course/m04-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m04-complete)，完成 commit 为 `9d1bca13da6b13aa97a8002baff37fbc2393abe4`。公开 evidence 从 [`manifest.json`](/signal-grid-blog/practice/high-availability-cex/m04/evidence/manifest.json) 开始复核，manifest SHA-256 为 `d036782ccdaff6b13a8e3f7f86c9c6eb5f285aa79b296485899b1a711783b52d`；M04 是普通课程单元，`productRelease=null`。

前四篇已经分别约束请求 algebra、IOC 余量、FOK 原子预检和 Post-only maker 准入。每个局部例子都能通过，仍不足以宣布 M04 完成：production 与 reference 可能共享概念错误，旧 GTC 可能被兼容构造悄悄改写，验证优先级可能只在空簿成立，或测试只能确认当前实现而不能反对 plausible fault。

本篇只证明一个命题：**ExecutionPolicy 的发布资格来自一条可反证的证据链——独立表示执行同一 raw command、逐命令检查结果 grammar 与状态不变量、让八项语义变异体得到 `STUDENT_FAILURE`、让基础设施异常保持 `SYSTEM_ERROR`，最后才在 clean complete identity 上生成可复核 evidence。**

这篇是 M04 的教学终篇。下文先按实现顺序解释发布门禁，再用最终 clean-tree artifact 给出已经取得的完成事实；规范性的“必须”仍表示未来修改不能破坏的合同。

## 证明对象不是四个 happy path

只测下面四条历史非常诱人：

```text
GTC 能挂单
IOC 能取消余量
FOK 能全成
POST_ONLY 能挂单
```

它们没有覆盖真正危险的否定路径。M04 至少要分别证明：

| 证明面 | 必须观察的事实 | 只看最终 book 会漏掉什么 |
| --- | --- | --- |
| raw validation | 五字段 → policy → duplicate → admission 的首错顺序 | 错误码随状态变化、非法 policy 占 ID |
| legacy GTC 继承 | 旧 `place(input)` 和五参数 `Accepted` 仍可调用；业务 events/book/lifecycle 语义等价；M03G1 command canonical lines/bytes/digest 不变 | 把 Java event shape 或 event bytes 漂移误写成“完全兼容” |
| IOC | 限价内 Trade、正余量独立取消、无 Rested、late Cancel 稳定 | 先挂后撤、越价成交、ID 被删除 |
| FOK | 不足路径所有状态不变；成功路径完整 Trade+ | 先部分成交再回滚、sequence 洞 |
| POST_ONLY | touch/cross pre-accept 拒绝；non-cross 完整 Rested | touch 被接受、先成交再补拒绝 |
| determinism | 同一 raw history fresh replay 得到相同 canonical bytes | 无序 Map、路径、时间混入输出 |
| architecture | core 仍无 I/O、线程、时钟、随机数和 Aeron | 用外部副作用掩盖本地状态缺陷 |

这些观察必须在**每条 command 边界**完成。只在整段历史结束比较 book，无法发现中途短暂 Rested 的 IOC、被回滚的 maker FIFO 或曾经消耗过的 sequence。

这里不冻结超出事实的 ABI/wire 承诺。`Accepted` record 已新增 `executionPolicy` 组件，sealed `MatchingEvent` 已新增 `RemainderCanceled`；依赖反射、Jackson 默认 record 形状、`toString()`、sealed exhaustive switch 或旧 event bytes 的代码需要适配。M10 前没有外部 wire codec 合同，因此 M04 只证明旧调用入口仍可用、legacy GTC 业务语义等价与 M03G1 command canonical 身份稳定。

## reference 也必须从 raw policy 开始

若 production 从 raw `String` 验证，而 reference 直接接收 `ExecutionPolicy.IOC`，两边比较就绕过了 unknown policy 和验证优先级。独立 command 应保留六字段 raw Place：

```java
public sealed interface ReferenceCommand {
  record Place(
      String instrumentId,
      BigInteger orderId,
      String side,
      BigInteger priceTicks,
      BigInteger quantityLots,
      String executionPolicy)
      implements ReferenceCommand {

    public Place(
        String instrumentId,
        BigInteger orderId,
        String side,
        BigInteger priceTicks,
        BigInteger quantityLots) {
      this(
          instrumentId,
          orderId,
          side,
          priceTicks,
          quantityLots,
          "GTC");
    }
  }
}
```

五字段兼容构造明确补 GTC，与 production 的 `place(input)` 对齐。reference 自己按相同业务顺序判断字符串，却不能调用 production `ExecutionPolicyValidator`。

中立事件也需要携带 policy 与余量原因：

```java
record Accepted(
    BigInteger sequence,
    BigInteger orderId,
    String side,
    BigInteger priceTicks,
    BigInteger quantityLots,
    String executionPolicy)
    implements SemanticEvent {}

record RemainderCanceled(
    BigInteger sequence,
    BigInteger orderId,
    String side,
    BigInteger priceTicks,
    BigInteger canceledQuantityLots,
    String reason)
    implements SemanticEvent {}
```

production adapter 必须把 `placeRequest(new PlaceLimitOrderRequest(input, rawPolicy))` 的完整公开 events 转成这些中立值；不能继续调用旧 `place(input)`，否则所有 generated policy 都会被静默降级为 GTC。即使 adapter 类已经存在，也只有它在跨模块 testkit 中被 raw-policy 语料真实调用、并与 linear reference 对拍后才算完成；“有一个类名”不是整仓门禁证据。

## event-derived ledger 应先检查代数，再做 exact differential

M03 引入的“第三事件账本”观察模式，在 M04 不能只给旧 `M03EventLedger` 增加一个 switch case。M04 需要独立的 `M04EventLedger`，把 policy 变成逐命令 proof obligation：

```text
1. Rejected / PlaceRejected 是否发生在 Accepted 之前且为 singleton
2. Accepted 携带的 normalized policy 是否与合法 raw policy 一致
3. Trade 是否只发生在 priceTicks 内、按 maker price 和 price-time 顺序
4. GTC 正余量是否且只是否 Rested
5. IOC 正余量是否且只是否 RemainderCanceled(IOC_REMAINDER)
6. FOK 一旦 Accepted 是否恰好完整成交且无其他尾部
7. POST_ONLY 一旦 Accepted 是否零 Trade 且完整 Rested
8. event-derived identity/lifecycle/quantity 是否与 full-depth book 双向一致
9. 最后才比较 production 与 linear reference 的完整 ordered outcome
```

每笔已接受订单都应保持数量分区：

```text
original = filled + remaining + canceled
```

其中：

- `FILLED`：`filled=original, remaining=0, canceled=0`；
- `RESTING`：`remaining>0, canceled=0`；
- IOC `CANCELED`：`remaining=0, canceled>0`；
- pre-accept policy rejection：根本没有订单分区或 lifecycle entry。

ledger 只能从 raw command、public events 与待核对的 `bookAfter` 推导，不能读取 production `ordersById` 或 reference flat list。否则“独立观察”会退化成内部状态自证。

## 生成 corpus 先冻结输入合同，再产生结果证据

M04 同时包含定向场景与有界 generated histories。`course/m04-start` 已经把输入数字冻结为：

```text
fixed scenarios        = 14
fixed commands         = 48 (44 PLACE + 4 CANCEL)
generated histories    = 192
commands per history   = 64
generated boundaries   = 12,288
base seed              = 4404
lanes                   = 6 (32 histories per lane)
fixed corpus SHA-256   = a8bf834828847a24d316bf6f760d008809901d8e3e2ff132276225b0aa79f596
generator SHA-256      = 33a24417d56b565fe9b25868e70c1faa1637a7997d92486c5d6f30113e00575d
```

这些数字只回答“要重放哪些输入”，不能回答 production 是否正确。定向场景的职责是：

```text
validation precedence
legacy GTC compatibility
IOC zero / partial / full / multi-level / exact limit
FOK empty / one-lot-short / exact / multi-level / outside limit
POST_ONLY empty / non-cross / touch / cross / BUY-SELL mirror
representative late Cancel / duplicate / rejected-ID reuse paths
bounded-quantity FOK preflight across exact, insufficient, multi-level and outside-limit liquidity
```

固定与生成语料的 `quantityLots` 上限都是 5，所以它们不能证明 `Long.MAX_VALUE` 防溢出。这个边界由 core 与独立 reference 各自的一条确定性单元测试证明：预检逐笔扣减剩余需求，而不先累计总深度；最终 [`boundaries.json`](/signal-grid-blog/practice/high-availability-cex/m04/evidence/reports/boundaries.json) 冻结 `longMaxFokDeductionPaths=2`。同理，14/48 Golden 只提供有代表性的 late Cancel、duplicate 与被拒 ID 复用路径；完整的终态/拒绝矩阵由 core/reference 测试、生成式 ledger 和 23 项 coverage 共同承担。

输入合同冻结时已经评审 strict Schema、scenario ID、命令数、PRNG/seed 与 lane。只有执行器、事件账本与对拍完成后，才能生成 expected outcome、canonical output format/digest 和反例结果。这些**结果数字**来自最终 clean run 的 artifact，而不是从设计稿复制预期值。

一个合格 fixture 还要保留 raw `executionPolicy`，并提供未知字段、policy 缺失或放错 command、非整数数字 token 与 command union 的负向 Schema probes。`UNKNOWN` 则刻意保持 Schema-valid，再由业务层稳定拒绝；Schema 失败属于 `SYSTEM_ERROR`，不能被算作“业务成功拒绝 unknown policy”。

raw policy 还有两个不能合并的证明面：固定/生成语料中的 `UNKNOWN` 负责业务级 `INVALID_EXECUTION_POLICY`、优先级、零状态变化和 unknown-default mutant；core 的参数化边界测试用 `gtc`、`Gtc`、` GTC`、`GTC ` 四个值证明精确大小写与空白语法。前者需要有状态因果历史，后者只守词法闭集，任何一组通过都不能替代另一组。

最终 [`check.json`](/signal-grid-blog/practice/high-availability-cex/m04/evidence/reports/check.json) 与 manifest 现在给出完整结果：14 个固定场景、48 条命令全部通过，M04F1 为 63 行、47,104 bytes、`sha256:68de35e41358ea72c9852fdf3fd652db116774964360f0b526f43612576bfa77`；192×64 共 12,288 个生成边界全部与 reference 对拍，M04H1 为 12,481 行、1,496,773 bytes、`sha256:6005c674d0c42927989f1c8c4d1ddce224d06ceff0b95bf58615d23c4496ba51`。这些值分别由固定场景、event batch、canonical bytes、生成报告和 manifest artifact hash 交叉约束。

## 八项 semantic mutant 定义裁判必须会反对什么

M04 合同冻结八个 required mutant；最终门禁已经把它们全部杀死：

| Mutant ID | 注入错误 | 首要被破坏的性质 |
| --- | --- | --- |
| `M04-IOC-REMAINDER-RESTS` | IOC 正余量进入 book | IOC event grammar / no-rest invariant |
| `M04-IOC-BEHAVES-LIKE-FOK` | 不能全成的 IOC 整体拒绝 | IOC partial-execution contract |
| `M04-FOK-PARTIAL-STATE-LEAK` | 不足 FOK 留下 maker/sequence/identity 变化 | pre-accept state immutability |
| `M04-FOK-BEST-LEVEL-ONLY` | 预检只统计最佳档 | multi-level fillability |
| `M04-FOK-IGNORES-LIMIT-PRICE` | 把限价外深度计入 preflight | protected limit boundary |
| `M04-POST-ONLY-TOUCH-ACCEPTED` | 等价 touch 被允许进入 match | maker-only admission |
| `M04-POLICY-REJECT-CONSUMES-IDENTITY` | 策略拒绝仍占 ID/sequence | admission atomicity / late Cancel |
| `M04-UNKNOWN-POLICY-DEFAULTS-GTC` | unknown raw value 静默变 GTC | fail-closed validation |

每个 mutant 都由 production control 使用的同一 scenario/property judge 分类为 `STUDENT_FAILURE`。专门写一个“检测 mutant 名称”的测试仍不合格；裁判只观察业务 outcome。

还要保留 throwing control：candidate 在 apply 时抛异常，结果必须是 `SYSTEM_ERROR`，不能计入八项 killed。否则一个完全不可运行的实现会因为让所有测试都红而得到最漂亮的 mutant 分数。

稳定失败记录保存 property ID、divergence kind、首次失败 command、完整因果前缀和 expected/actual outcome。shrink 从 fresh production/reference/ledger 重放，并保持同一 fingerprint；不能在已经失败的 live engine 上删除命令。最终八项 one-minimal 反例长度为 `1/1/2/4/2/2/2/1`，共 15 条命令；M04X1 为 544 行、166,483 bytes、`sha256:60076a395fe365ba9eaa6bf91ae148dc42120ddb95ad01cac988ab90dd8550cb`。每项都由 [`replay.json`](/signal-grid-blog/practice/high-availability-cex/m04/evidence/reports/replay.json) 重新验证 reference outcome、actual outcome、provenance 与 one-minimal 声明。

## 错误证据设计比没有报告更危险

### 从旧 PASS 输出拼新结果

runner 开始时若不清理固定输出，某次 reference 失败可能仍与上次成功的 mutant 报告共存。`check.json` 必须由本次 fresh run 的完整报告集合生成；失败时只保留最小、明确的三态失败事实。

### 用一个最终 digest 替代逐命令性质

digest 相同能证明 canonical bytes 未漂移，不能解释 IOC 是否短暂入簿、FOK 是否回滚或 Post-only 是否在 touch 成交。逐命令报告和 digest 回答不同问题。

### 把局部 module test 写成 release evidence

production core 与 linear reference 各自 GREEN，只证明两份局部实现。在阶段性分支上，adapter、ledger、Golden/property、mutant、architecture 和累计 M00～M03 回归没有闭合前，不得创建 complete identity。

### 先写 complete tag 或 manifest hash

来源 identity 必须来自最终干净提交。提前猜 commit、hash 或报告计数会让正文成为第二份不可验证真相；修正实现后这些数字必然漂移。

## 练习：为每项策略写一个最短反例

不运行 generator，先手工设计四条尽可能短的历史：

1. 杀死 `IOC-REMAINDER-RESTS`；
2. 杀死 `FOK-BEST-LEVEL-ONLY`；
3. 杀死 `POST-ONLY-TOUCH-ACCEPTED`；
4. 杀死 `POLICY-REJECT-CONSUMES-IDENTITY`。

每条历史写出：

- fresh 初始状态需要哪些 maker；
- 首次分歧发生在哪条 command；
- stable property fingerprint；
- 为什么删除任一前置命令后不再暴露同一个错误；
- 要比较哪些 pre/post 状态，而不是只看错误码。

一个可行方向是：

```text
IOC rests:
  Ask 100×1
  BUY 100×2 IOC

FOK best level only:
  Ask 100×1
  Ask 101×1
  BUY 101×2 FOK

Post-only touch accepted:
  Ask 100×1
  BUY 100×1 POST_ONLY

Policy rejection consumes identity:
  BUY 100×1 FOK on empty book
  GTC Place same orderId
```

对当前 `M04-POLICY-REJECT-CONSUMES-IDENTITY` mutant，最后一条的 one-minimal 历史只有两条命令：第一条 FOK 在空簿拒绝，第二条用同 ID 提交 GTC。正确实现会把 GTC 当作首次接受，mutant 则返回 `DUPLICATE_ORDER_ID`，稳定 fingerprint 是 `POLICY_REJECTION_ATOMICITY/REJECTED_ID_RESERVED`。在两条命令之间插入 Cancel 是冗余的：删掉它仍会暴露同一 fingerprint，所以它不得出现在 one-minimal 反例里。

Cancel 仍可作为**扩展观察**，但要与最小证明分开：拒绝后立即 Cancel 应是 `ORDER_NOT_FOUND`；同 ID GTC 被接受并 RESTING 后再 Cancel，应产生正常 `Canceled`。若只断言第一条 `FOK_NOT_FILLABLE`，仍然杀不死“拒绝码正确但偷偷预留身份”的 mutant。

## evidence 的生成顺序与完成身份

最终发布严格按下面的顺序完成：

```text
clean build
→ m04Check fresh PASS
→ 独立复核 reports 与 limitations
→ 创建 annotated complete tag
→ 在同一 clean commit 上生成 tag-bound evidence
→ 博客复制并逐 hash 校验公开 bundle
→ 五篇教程与 Matching Lab 原子转为公开
```

对应的复核命令是：

```bash
./gradlew m04Check --no-daemon

# complete tag 必须已真实存在并指向当前 clean HEAD：
./gradlew m04Evidence \
  -Pm04.unitTag=course/m04-complete \
  --no-daemon
```

M04 不是命名产品停止点，所以没有新的 `matching-*` product release。evidence 的 limitations 至少要继续声明：单交易对、内存、无持久化/网络/Aeron、无账户资产、无 price band/STP、市价单和性能保证；有界 property suite 也不能被称为形式化证明。

## M04 的可验证停止点已经闭合

最终 evidence 证明下面的单元停止条件同时满足：

- 旧 `place(input)` 与五参数 `Accepted` 构造仍可调用，legacy GTC 的业务 events/book/lifecycle 语义等价，M03G1 command canonical lines/bytes/digest 不变；同时明确不承诺 Java event shape、反射/Jackson/`toString()`、sealed exhaustive switch 或 event bytes 完全兼容；
- raw policy 验证和所有 pre-accept 优先级稳定；
- IOC/FOK/Post-only 的 BUY/SELL、价格边界、数量与生命周期性质逐命令通过；
- production 与结构独立的 linear reference exact differential；
- 八项 semantic mutant 均为 `STUDENT_FAILURE`，throwing control 为 `SYSTEM_ERROR`；
- fresh replay、M03 语义/canonical 回归与 M04 自己的 architecture gate 通过，不用当前源码清单伪装 M03 历史架构身份；
- clean complete identity、manifest、artifact hashes 和 limitations 真实生成并复核；
- 五篇教程与 [M04 Matching Lab](/signal-grid-blog/practice/high-availability-cex/m04/lab/) 只消费同一份已发布 Golden/evidence，不另造前端权威语义。

现在，M04 能准确声称的是：**单交易对内存撮合器在原有 GTC 基线上，增加了有价格保护的 IOC、原子 FOK 与 maker-only Post-only，并用可反证的性质门禁约束其结果。**它仍不拥有 price band、STP、持久化、网络、性能或高可用保证。

这条窄结论正是本单元的价值：先把一个执行策略轴做成可证明的状态机，再进入 M05 的版本化市场控制，而不是让下一个功能替尚未闭合的语义背书。
