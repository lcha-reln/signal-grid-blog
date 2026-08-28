---
title: "M04·01：先把执行策略写成一套封闭的结果合同"
description: "保持五字段限价单输入不变，在 raw String 验证后归一为 GTC、IOC、FOK、POST_ONLY 闭集，并冻结验证优先级、兼容入口与结果代数。"
date: 2026-08-28T18:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M04
lessonOrder: 10
permalink: execution-policy-result-contract
tags:
  - 撮合引擎
  - ExecutionPolicy
  - 限价单
draft: true
---

> M04 当前唯一权威起点是 annotated [`course/m04-start`](https://github.com/lcha-reln/cex-matching/tree/course/m04-start)。本单元仍处于 `IN_PROGRESS`：没有 complete tag、公开 evidence 或产品 release。本文中的代码是要从该 RED 起点实现并验证的合同形状，不应被引用成已经发布的完成事实。

M03 已经证明：一个只支持 GTC 的单交易对限价撮合器，可以在价格时间优先、撤单、终态和独立参考模型之间形成闭环。M04 不急着加入市价单、价格带、自成交保护或持久化，而只回答一个新问题：同一笔有价格保护的限价单，未成交余量究竟可以挂单、必须取消，还是连“接受”都不应发生？

容易犯的第一个错误，是把 GTC、IOC、FOK、Post-only 当成四套互不相干的订单实现。这样会复制验证、撮合循环和生命周期分支，最终让相同价格边界在四条路径上逐渐漂移。

本篇只证明一个命题：**ExecutionPolicy 是叠加在既有五字段限价单之上的单一、封闭策略轴；raw 输入必须先按固定优先级验证，只有合法值才归一为 enum，随后由一套结果代数约束“接受、成交、挂单、余量取消或策略拒绝”。**

我们会先手算同一盘口下的四种结果，再实现请求边界、兼容入口和验证顺序。本篇的停止点不是 `m04Check` 全绿，而是请求与结果合同已经能拒绝歧义；IOC、FOK、Post-only 的状态迁移将在后三篇分别证明。

## 从 M04 的结构化 RED 开始

从固定起点创建练习分支，而不是从持续变化的 `main` 猜课程状态：

```bash
git clone https://github.com/lcha-reln/cex-matching.git
cd cex-matching
git switch -c unit/m04 course/m04-start

./gradlew clean build --no-daemon
./gradlew m04Check --no-daemon
```

累计构建应守住 M00～M03 已发布能力。起点的 `m04Check` 则应以结构化 `GOAL_NOT_IMPLEMENTED` 形成 RED；不能用编译错误、缺 fixture 或异常堆栈冒充课程缺口。当前博客草稿也不会预写未来 Golden 数量、digest、manifest hash 或完成提交。

本单元冻结的唯一输入增量是 `executionPolicy`。以下能力仍明确不进入本篇：

- 不新增 `worstPriceTicks`，也不实现无价格保护的市价单；
- 不引入 price band、参考价或市场状态，它们属于 M05；
- 不引入参与者身份或 STP，它们属于 M06；
- 不引入 command idempotency、WAL、Snapshot 或 Aeron。

这条窄边界非常重要：如果请求合同同时携带价格带、STP 和持久化身份，本篇就再也无法判断一次拒绝究竟由哪条规则造成。

## 一张盘口足以手算四种策略的分歧

假设 fresh engine 已经依次接受两笔卖单：

```text
Ask 100: orderId=10, sequence=1, remaining=2
Ask 101: orderId=11, sequence=2, remaining=3
```

现在提交 `BUY 100 × 3`。`priceTicks=100` 是买方愿意支付的最高价，所以只有 Ask 100 的 2 lot 可成交；Ask 101 已越过价格边界。四种策略的结果如下：

| Policy | 是否 Accepted | 允许的成交 | 余量 1 的处理 | 最终身份 |
| --- | --- | --- | --- | --- |
| `GTC` | 是 | 2 lot @ maker price 100 | `Rested` 在 Bid 100 | `RESTING` |
| `IOC` | 是 | 2 lot @ maker price 100 | `RemainderCanceled(..., 1, IOC_REMAINDER)` | `CANCELED` |
| `FOK` | 否 | 0 | 整体 `FOK_NOT_FILLABLE` | `UNSEEN` |
| `POST_ONLY` | 否 | 0 | 因 touch Ask 100 而 `POST_ONLY_WOULD_TAKE` | `UNSEEN` |

若把价格改成 99，GTC 会挂单，IOC 会零成交后取消全部余量，FOK 仍因无可成交量而拒绝，POST_ONLY 则会被接受并完整挂单。若把数量改成 2，FOK 可以在接受后完全成交，IOC 也会完全成交且不需要余量事件。

这张表揭示了 M04 的真正维度：价格时间匹配算法没有改变，变化的是**准入时机**和**正余量的终局**。

可以把结果代数写成：

```text
GTC       = Rejected | PlaceRejected(DUPLICATE) | Accepted · Trade* · Rested?
IOC       = Rejected | PlaceRejected(DUPLICATE) | Accepted · Trade* · RemainderCanceled?
FOK       = Rejected | PlaceRejected(DUPLICATE | FOK_NOT_FILLABLE)
            | Accepted · Trade+
POST_ONLY = Rejected | PlaceRejected(DUPLICATE | POST_ONLY_WOULD_TAKE)
            | Accepted · Rested
```

这里的 `?` 只表示“存在正余量时出现一次”。完全成交的 GTC/IOC 都以最后一笔 `Trade` 结束；被接受的 FOK 必须至少有一笔 Trade 且总量恰好等于原量；被接受的 POST_ONLY 不允许出现 Trade。

## raw String 是输入事实，enum 是验证后的内部事实

不要让网络层或 JSON parser 直接构造 `ExecutionPolicy` enum。若 parser 在进入业务验证前就对 `"UNKNOWN"` 抛异常，撮合器便无法输出冻结的 `Rejected(INVALID_EXECUTION_POLICY)`，验证优先级也会被框架异常接管。

M04 因此保留两层表示。请求边界携带 schema-valid、尚未 business-valid 的 raw `String`：

```java
public record PlaceLimitOrderRequest(
    PlaceLimitOrderInput orderInput,
    String executionPolicy) {

  public PlaceLimitOrderRequest {
    Objects.requireNonNull(orderInput, "orderInput");
    Objects.requireNonNull(executionPolicy, "executionPolicy");
  }

  public PlaceLimitOrderRequest(PlaceLimitOrderInput orderInput) {
    this(orderInput, ExecutionPolicy.GTC.name());
  }
}
```

`null` 属于 schema/调用边界错误。业务层只接受精确大写的四个成员；`"UNKNOWN"`、`"gtc"`、`"Gtc"`、`" GTC"` 与 `"GTC "` 都是可确定分类的业务非法值。M04 不做大小写转换或 `trim`，因为静默归一会扩大输入协议，掩盖调用方错误。

只有验证通过后，raw String 才能进入内部闭集：

```java
public enum ExecutionPolicy {
  GTC,
  IOC,
  FOK,
  POST_ONLY
}
```

对应 validator 先做精确成员判断，再归一化：

```java
public ValidationResult validate(String rawPolicy) {
  if (!isSupported(rawPolicy)) {
    return new ValidationResult.Invalid(
        ValidationCode.INVALID_EXECUTION_POLICY);
  }
  return new ValidationResult.Valid();
}

public ExecutionPolicy normalize(String rawPolicy) {
  ValidationResult result = validate(rawPolicy);
  if (result instanceof ValidationResult.Invalid invalid) {
    throw new IllegalArgumentException(
        "cannot normalize invalid " + invalid.code()
            + " at " + invalid.field());
  }
  return ExecutionPolicy.valueOf(rawPolicy);
}
```

`normalize()` 抛异常不是第五种业务结果。正常命令路径必须先调用 `validate()`，只有程序员绕过验证时才会触发这个防御性异常。

## 旧五字段入口必须显式等价于 GTC

M00～M03 已公开的调用面是：

```java
ExecutionBatch place(PlaceLimitOrderInput input)
```

不能为了 M04 把它删除，也不能让它读取一个隐式、可变的“默认策略”。兼容入口应当机械地构造显式 GTC 请求：

```java
public ExecutionBatch place(PlaceLimitOrderInput input) {
  Objects.requireNonNull(input, "input");
  return placeRequest(new PlaceLimitOrderRequest(input));
}

public ExecutionBatch placeRequest(PlaceLimitOrderRequest request) {
  // M04 的唯一新入口；后续按固定优先级验证并应用。
}
```

这带来两个可以直接测试的等价关系：

```text
place(input)
  == placeRequest(new PlaceLimitOrderRequest(input, "GTC"))

new PlaceLimitOrderRequest(input)
  == new PlaceLimitOrderRequest(input, ExecutionPolicy.GTC.name())
```

`Accepted` 事件也携带归一后的 `ExecutionPolicy`，让事件语法能检查后续尾部是否与策略一致。为了保留旧代码的构造语义，五参数兼容构造明确补入 `GTC`；它不是从线程上下文或配置读取默认值。

这里的“兼容”必须收窄到可验证事实：旧 `place(input)` 与 `Accepted` 五参数构造仍可调用；把新增 policy 视为 GTC 后，legacy GTC 的业务 event 含义、book 与 lifecycle 语义等价；M03G1 的 command canonical lines/bytes/digest 不变。它不等于 Java 事件形状完全不变：`Accepted` record 现在有第六个 `executionPolicy` 组件，sealed `MatchingEvent` 也多了 `RemainderCanceled`，所以依赖 record 反射、Jackson 默认形状、`toString()`、sealed exhaustive switch 或旧 event bytes 的调用方必须适配。M10 前没有冻结外部 wire codec，本篇也不声称已经提供这种 wire 兼容。

## 验证优先级决定客户端看到哪个事实

一个请求可以同时有多个错误：未知 instrument、非法数量、unknown policy、重复 orderId，并且当前盘口还不足以填满 FOK。系统必须只返回一项稳定结果，因此优先级本身就是协议：

```text
instrumentId
→ orderId
→ side
→ priceTicks
→ quantityLots
→ executionPolicy
→ DUPLICATE_ORDER_ID
→ FOK_NOT_FILLABLE / POST_ONLY_WOULD_TAKE
→ 分配 acceptance sequence
```

代码形状应让顺序一眼可见：

```java
ValidationResult inputResult = placeValidator.validate(request.orderInput());
if (inputResult instanceof ValidationResult.Invalid invalid) {
  return singleton(new MatchingEvent.Rejected(invalid.code()));
}

ValidationResult policyResult =
    executionPolicyValidator.validate(request.executionPolicy());
if (policyResult instanceof ValidationResult.Invalid invalid) {
  return singleton(new MatchingEvent.Rejected(invalid.code()));
}

PlaceLimitOrder command = placeValidator.normalize(request.orderInput());
ExecutionPolicy policy =
    executionPolicyValidator.normalize(request.executionPolicy());

if (ordersById.containsKey(command.orderId())) {
  return singleton(new MatchingEvent.PlaceRejected(
      command.orderId(), PlaceRejectionCode.DUPLICATE_ORDER_ID));
}
```

注意 unknown raw policy 是字段验证失败，所以结果是 `Rejected(INVALID_EXECUTION_POLICY, "executionPolicy")`，不是 `PlaceRejected`。`PlaceRejected` 只处理**字段已经合法**之后的身份或策略准入结果。

所有 pre-Accepted 失败都必须满足同一个不变量：

```text
bookAfter == bookBefore
registryAfter == registryBefore
nextSequenceAfter == nextSequenceBefore
makerRemaindersAfter == makerRemaindersBefore
```

只有这些门都通过后，才能分配 sequence、占用 orderId 并产生 `Accepted`。若先 `nextAcceptanceSequence++` 再判断 FOK，失败请求会在 FIFO 时间线上留下不可解释的洞。

## 这套 algebra 不是任何交易所 API 的复制品

课程内部把 `GTC | IOC | FOK | POST_ONLY` 建模为互斥的 `ExecutionPolicy`，目的是让状态机和裁判具有封闭结果，而不是宣称行业 API 都使用同一字段。

真实 venue 的表示就不同：

- [Coinbase Exchange 的下单文档](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/orders/create-new-order)把 `GTC/GTT/IOC/FOK` 放在 `time_in_force`，而 Post-only 是单独布尔字段，并限制它不能与 IOC/FOK 组合；
- [OKX API v5 的下单文档](https://www.okx.com/docs-v5/en/#order-book-trading-trade-post-place-order)把 `limit/post_only/fok/ioc` 表示为 `ordType`，对应限价策略仍携带价格字段。

这两个例子只说明“外部 wire 表示需要适配”。课程 core 不支持 GTT，也不照搬 venue 的订单状态、错误码、账户语义或撤单回报。未来 Rest 项目负责把外部 API 转译成 Counter/Matching 的稳定内部命令；Matching 不应反过来被某一家交易所的 JSON 形状绑住。

## 三种看似省事的设计会破坏合同

### 直接把 request 字段声明成 enum

这样 unknown value 会在反序列化阶段失败，M04 无法证明 `executionPolicy` 在五字段之后、duplicate 之前被拒绝。框架错误也可能被错误计成业务 `STUDENT_FAILURE`。

### 给四种策略复制四个 place 方法

`placeIoc()`、`placeFok()` 和 `placePostOnly()` 很快会各自拥有不同 validator、crossing comparator 或 sequence 分配点。M04 需要的是一个 `placeRequest()` 和一个共享匹配循环。

### 把策略拒绝伪装成接受后取消

FOK 不足或 Post-only 会取单时若先产生 `Accepted`，orderId 与 sequence 已经被占用，结果不再是原子准入。它也会让 Counter 误以为订单曾进入权威生命周期。

## 练习：先写优先级矩阵，再写 switch

给定当前已有 `orderId=7`，且 Ask 100 只有 1 lot。为以下请求写出唯一首个结果，并写出它是否占用 ID/sequence：

```text
A. instrument=ETH-USDT, orderId=0, side=NO_SIDE,
   price=0, quantity=0, policy=UNKNOWN

B. instrument=BTC-USDT, orderId=7, side=BUY,
   price=100, quantity=2, policy=UNKNOWN

C. instrument=BTC-USDT, orderId=7, side=BUY,
   price=100, quantity=2, policy=FOK

D. instrument=BTC-USDT, orderId=8, side=BUY,
   price=100, quantity=2, policy=FOK
```

预期推理是：

- A 在 `instrumentId` 失败；
- B 在 `executionPolicy` 失败，不能被 duplicate 遮蔽；
- C 返回 `DUPLICATE_ORDER_ID`，不能被 FOK 不足遮蔽；
- D 才返回 `FOK_NOT_FILLABLE`。

四项都不推进 sequence，不改变盘口。然后再新增一笔合法 GTC orderId 8；它应获得紧邻上一个已接受订单的 sequence。

将这些关系写成参数化测试，而不是分别写四段互不关联的 arrange/act/assert。测试的关键观察不是错误码本身，而是错误前后的状态摘要完全一致。

还要把两类 raw-policy 证据分开。固定/生成语料里的 `UNKNOWN` 用于证明业务拒绝、五字段/policy/duplicate 优先级、拒绝后零状态变化，并为 `M04-UNKNOWN-POLICY-DEFAULTS-GTC` 提供因果历史；`gtc`、`Gtc`、` GTC`、`GTC ` 则是同一个参数化词法边界测试的四个值，只证明“不折叠大小写、不 trim”。四个词法值不能替代有状态的 `UNKNOWN` 语料，`UNKNOWN` 语料也不能证明所有大小写与空白边界。

## 本篇的可验证停止点

完成本篇后，至少应能聚焦运行兼容入口与优先级测试：

```bash
./gradlew :matching-core:test \
  --tests '*SingleInstrumentExecutionPolicyTest.legacyPlaceRemainsAnExplicitGtcRequest' \
  --tests '*SingleInstrumentExecutionPolicyTest.frozenInputValidationPrecedesPolicyAndPolicyRejectionDoesNotConsumeIdentity' \
  --tests '*SingleInstrumentExecutionPolicyTest.policyGrammarIsExactWithoutCaseFoldingOrTrimming' \
  --tests '*SingleInstrumentExecutionPolicyTest.duplicateIdentityPrecedesFokAndPostOnlyBookDependentRejections' \
  --no-daemon
```

GREEN 只证明这些局部合同：旧入口显式映射 GTC、raw policy 在正确位置被验证且精确匹配、duplicate 位于策略准入之前。它还不能证明 IOC 不挂单、FOK 不泄漏部分成交或 Post-only 在 touch 边界拒绝。

完整 `m04Check` 在这些能力、独立 reference、Golden/property corpus、八项 mutant 和 evidence writer 都完成前必须继续 RED。下一篇只推进一个结果分支：**让 aggressive IOC 在既有 `priceTicks` 内尽可能成交，并把任何正余量以独立事件原子收敛到 CANCELED。**
