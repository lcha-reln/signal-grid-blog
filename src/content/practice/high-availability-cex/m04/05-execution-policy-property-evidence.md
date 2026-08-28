---
title: "M04·05：用性质、变异体和证据边界证明执行策略"
description: "让 production 与独立线性 reference 对拍验证优先级、IOC 数量分区、FOK/Post-only 零副作用，并用八项 semantic mutant 约束未来 M04 evidence。"
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
draft: true
---

> M04 当前仍是 `IN_PROGRESS`，唯一固定源码起点是 annotated [`course/m04-start`](https://github.com/lcha-reln/cex-matching/tree/course/m04-start)。截至本稿，production core 与独立 reference 只有局部实现和局部测试；跨模块 testkit、Golden/property corpus、mutant runner、evidence writer、complete tag 与公开 evidence 都尚未闭合。因此本文只冻结证明方法和通过条件，不填写尚未生成的 seed、场景数、digest、反例长度、hash 或完成提交。

前四篇已经分别约束请求 algebra、IOC 余量、FOK 原子预检和 Post-only maker 准入。每个局部例子都能通过，仍不足以宣布 M04 完成：production 与 reference 可能共享概念错误，旧 GTC 可能被兼容构造悄悄改写，验证优先级可能只在空簿成立，或测试只能确认当前实现而不能反对 plausible fault。

本篇只证明一个命题：**ExecutionPolicy 的发布资格来自一条可反证的证据链——独立表示执行同一 raw command、逐命令检查结果 grammar 与状态不变量、让八项语义变异体得到 `STUDENT_FAILURE`、让基础设施异常保持 `SYSTEM_ERROR`，最后才在 clean complete identity 上生成可复核 evidence。**

这篇是 M04 的教学终篇，但目前仍是草稿。所有“应当”“必须”都表示发布门禁，而不是已取得的完成事实。

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
| GTC 兼容 | 旧 `place(input)` 与显式 GTC 的 events/book/lifecycle 一致 | Accepted policy 或 canonical bytes 漂移 |
| IOC | 限价内 Trade、正余量独立取消、无 Rested、late Cancel 稳定 | 先挂后撤、越价成交、ID 被删除 |
| FOK | 不足路径所有状态不变；成功路径完整 Trade+ | 先部分成交再回滚、sequence 洞 |
| POST_ONLY | touch/cross pre-accept 拒绝；non-cross 完整 Rested | touch 被接受、先成交再补拒绝 |
| determinism | 同一 raw history fresh replay 得到相同 canonical bytes | 无序 Map、路径、时间混入输出 |
| architecture | core 仍无 I/O、线程、时钟、随机数和 Aeron | 用外部副作用掩盖本地状态缺陷 |

这些观察必须在**每条 command 边界**完成。只在整段历史结束比较 book，无法发现中途短暂 Rested 的 IOC、被回滚的 maker FIFO 或曾经消耗过的 sequence。

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

production adapter 必须把 `placeRequest(new PlaceLimitOrderRequest(input, rawPolicy))` 的完整公开 events 转成这些中立值；不能继续调用旧 `place(input)`，否则所有 generated policy 都会被静默降级为 GTC。当前跨模块 testkit 尚未完成这条适配，正是整仓门禁仍应保持 RED 的原因之一。

## event-derived ledger 应先检查代数，再做 exact differential

M03 的第三事件账本不能只增加一个 switch case。它要把 policy 变成逐命令 proof obligation：

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

## 生成 corpus 先冻结输入合同，再产生数字

M04 需要同时包含定向 Golden 场景与有界 generated histories，但现在不应提前猜数量。先冻结场景职责：

```text
validation precedence
legacy GTC compatibility
IOC zero / partial / full / multi-level / exact limit
FOK empty / one-lot-short / exact / multi-level / outside limit
POST_ONLY empty / non-cross / touch / cross / BUY-SELL mirror
late Cancel and duplicate identity after each terminal or rejection path
large-quantity preflight without cumulative overflow
```

随后才能评审 strict Schema、scenario ID、命令数、PRNG/seed、lane、canonical format 与 digest。发布数字必须来自最终 clean run 的 artifact，而不是从设计稿复制预期值。

一个合格 fixture 还要保留 raw `executionPolicy`，并提供未知字段、非法 policy、数字 token 和 command union 的负向 Schema probes。Schema 失败属于 `SYSTEM_ERROR`，不能被算作“业务成功拒绝 unknown policy”。

在数据冻结前，本篇不会写类似“共 N 场景、M 条命令、digest 为 X”的句子。将来补充这些完成事实时，必须同时给出 artifact 路径、Schema、来源 commit 与 SHA-256，且正文值能从报告交叉核对。

## 八项 semantic mutant 定义裁判必须会反对什么

M04 合同冻结八个 required mutant；它们目前是门禁目标，不是已被杀死的结果：

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

每个 mutant 必须由 production control 使用的同一 scenario/property judge 分类为 `STUDENT_FAILURE`。专门写一个“检测 mutant 名称”的测试不合格；裁判必须只观察业务 outcome。

还要保留 throwing control：candidate 在 apply 时抛异常，结果必须是 `SYSTEM_ERROR`，不能计入八项 killed。否则一个完全不可运行的实现会因为让所有测试都红而得到最漂亮的 mutant 分数。

稳定失败记录应保存 property ID、divergence kind、首次失败 command、完整因果前缀和 expected/actual outcome。若后续加入 shrink，它必须从 fresh production/reference/ledger 重放，并保持同一 fingerprint；不能在已经失败的 live engine 上删除命令。

## 错误证据设计比没有报告更危险

### 从旧 PASS 输出拼新结果

runner 开始时若不清理固定输出，某次 reference 失败可能仍与上次成功的 mutant 报告共存。`check.json` 必须由本次 fresh run 的完整报告集合生成；失败时只保留最小、明确的三态失败事实。

### 用一个最终 digest 替代逐命令性质

digest 相同能证明 canonical bytes 未漂移，不能解释 IOC 是否短暂入簿、FOK 是否回滚或 Post-only 是否在 touch 成交。逐命令报告和 digest 回答不同问题。

### 把局部 module test 写成 release evidence

production core 与 linear reference 各自 GREEN，只证明两份局部实现。adapter、ledger、Golden/property、mutant、architecture 和累计 M00～M03 回归没有闭合前，不得创建 complete identity。

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
  Cancel same orderId
  GTC Place same orderId
```

最后一条应同时观察：拒绝后的 Cancel 是 `ORDER_NOT_FOUND`，同 ID GTC 可以首次接受，sequence 连续。若只断言第一条 `FOK_NOT_FILLABLE`，就杀不死“拒绝码正确但偷偷写状态”的 mutant。

## 未来 evidence 的生成顺序必须保持诚实

在 testkit 合同、实现、累计回归与所有 required mutant 真正完成后，发布流程才允许进入：

```text
clean build
→ m04Check fresh PASS
→ 独立复核 reports 与 limitations
→ 创建未来的 annotated complete tag
→ 在同一 clean commit 上生成 tag-bound evidence
→ 博客复制并逐 hash 校验公开 bundle
→ 五篇 draft 原子转为公开
```

目标命令形状可以预先登记，但现在不得执行它来伪造完成：

```bash
./gradlew m04Check --no-daemon

# 只有未来 complete tag 已真实存在、指向当前 clean HEAD 后才允许：
./gradlew m04Evidence \
  -Pm04.unitTag=course/m04-complete \
  --no-daemon
```

M04 不是命名产品停止点，所以没有新的 `matching-*` product release。evidence 的 limitations 至少要继续声明：单交易对、内存、无持久化/网络/Aeron、无账户资产、无 price band/STP、市价单和性能保证；有界 property suite 也不能被称为形式化证明。

## M04 的可验证停止点仍然是 RED 边界

在当前草稿阶段，可以运行局部 production 与 reference tests，检查 API 与手算语义是否一致；不能声称整仓 M04 通过。真正的单元停止点必须同时满足：

- 旧五字段入口与显式 GTC 的公开 outcome 完全兼容；
- raw policy 验证和所有 pre-accept 优先级稳定；
- IOC/FOK/Post-only 的 BUY/SELL、价格边界、数量与生命周期性质逐命令通过；
- production 与结构独立的 linear reference exact differential；
- 八项 semantic mutant 均为 `STUDENT_FAILURE`，throwing control 为 `SYSTEM_ERROR`；
- fresh replay、canonical output、累计 M00～M03 回归和 architecture gate 通过；
- clean complete identity、manifest、artifact hashes 和 limitations 真实生成并复核；
- 五篇教程与可能的 Matching Lab 只消费同一份已发布 Golden/evidence，不另造前端权威语义。

到那时，M04 能准确声称的是：**单交易对内存撮合器在原有 GTC 基线上，增加了有价格保护的 IOC、原子 FOK 与 maker-only Post-only，并用可反证的性质门禁约束其结果。**它仍不拥有 price band、STP、持久化、网络、性能或高可用保证。

这条窄结论正是本单元的价值：先把一个执行策略轴做成可证明的状态机，再进入 M05 的版本化市场控制，而不是让下一个功能替尚未闭合的语义背书。
