---
title: "M00·01：完成一条 PlaceLimitOrder 输入合同"
description: "从不可移动起点出发，用一个固定品种、一种命令和一组反例，完成撮合课程第一条可运行、可证伪的业务输入边界。"
date: 2026-08-26T16:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M00
lessonOrder: 10
permalink: place-limit-order-input-contract
tags:
  - 撮合引擎
  - 输入合同
  - Java
draft: true
---

许多撮合项目的第一步，是直接写买卖盘、价格档位和成交循环。这样很快能“撮合出一笔交易”，却同时引入订单状态、时间优先级、可变数据结构和事件输出。测试一旦失败，我们很难判断错的是输入、规则，还是状态迁移。

M00 选择相反的起点。第一篇只证明一个命题：**给定一条 Schema 已合法、业务尚未校验的候选限价单，纯业务代码必须确定地返回第一个字段错误，或者把它规范化为类型明确的 `PlaceLimitOrder`。**

这里的 `VALID` 只表示字段落在当前合同的业务域内。它不等于订单已被接受，更不等于订单已经入簿或成交。

## 先冻结这篇要证明的唯一命题

一条真实请求进入撮合状态机之前，至少会跨过四层边界：

```text
外部 JSON 字节
  → Schema / 词法边界
  → 业务校验与规范化
  → 状态机应用
```

这一篇只实现中间的“业务校验与规范化”。我们直接构造 `PlaceLimitOrderInput`，所以不处理坏 JSON、缺失字段、重复字段、浮点数、指数记法或非法 Unicode；这些属于 M00 后续的严格 fixture 边界。我们同样不应用命令，因此没有订单集合、余额、成交或持久化。

本篇完成时，每条候选输入只能得到两种业务结果：

- `VALID`，随后可以规范化为 `PlaceLimitOrder`；
- `INVALID(code, field)`，并且只能返回固定优先级中的第一个错误。

先不要往下看规则。请为下面四条输入写下预测：

| 候选输入 | 你预测的结果 |
| --- | --- |
| 其他字段合法，`quantityLots = 0` | ？ |
| 其他字段合法，`side = "buy"` | ？ |
| 同一个合法 `orderId` 连续校验两次 | ？ |
| `priceTicks` 与 `quantityLots` 都等于 `Long.MAX_VALUE` | ？ |

后面的边界矩阵会揭示答案。这个预测不是热身题，它用来检查我们是否偷偷把订单状态、字符串修复或名义价值计算带进了输入校验。

本篇只要求 Java record、enum、JUnit、Git 和 Gradle Wrapper 的基础使用。不需要 Docker、Aeron、数据库，也不要求先会写订单簿。

## 固定一个品种和一种命令，才能只验证一个变量

如果第一版就允许动态品种，撮合模块必须回答更多问题：品种由谁发布，规则版本何时生效，重放历史命令时读取哪个版本，以及停牌或下线如何影响已有订单。把这些问题藏在一个 `Map<String, Instrument>` 里，并没有消除复杂度，只是让合同变得含糊。

M00 因此把品种固定为 `BTC-USDT`，把命令类型固定为 `PlaceLimitOrder`。这不是产品承诺，而是实验控制变量：动态品种目录、撤单、改单和市价单都会在各自拥有独立不变量时再加入。

五个业务字段的域如下：

| 字段 | M00 允许的值 | 本篇明确不做 |
| --- | --- | --- |
| `instrumentId` | 精确等于 `BTC-USDT` | 不查询动态品种目录 |
| `orderId` | `1..Long.MAX_VALUE` 的整数 | 不判断是否重复 |
| `side` | 精确等于 `BUY` 或 `SELL` | 不 trim，不折叠大小写 |
| `priceTicks` | `1..Long.MAX_VALUE` 的整数 | 不换算小数价格 |
| `quantityLots` | `1..Long.MAX_VALUE` 的整数 | 不冻结资产或仓位 |

候选模型使用 `BigInteger` 保存三个数值字段。这样 `Long.MAX_VALUE + 1` 仍能原样进入业务校验，而不会先被 `long` 截断。只有确认数值位于正 `long` 范围内以后，规范化步骤才能调用 `longValueExact()`。

现在可以核对刚才的预测：

- `quantityLots = 0` 是 `INVALID_QUANTITY(quantityLots)`；
- `side = "buy"` 是 `INVALID_SIDE(side)`；
- 重复校验同一个 `orderId`，两次都应为 `VALID`，因为校验器没有订单状态；
- 两个字段都等于 `Long.MAX_VALUE` 仍为 `VALID`，因为本篇不计算 `price × quantity`。

最后一条尤其重要。如果校验器计算名义价值，它既可能溢出，也说明 Counter 的资产准入职责已经泄漏进 Matching 的输入边界。

## 从不可移动起点复现预期红灯

课程起点是固定 tag [`course/m00.2-start`](https://github.com/lcha-reln/cex-matching/tree/course/m00.2-start)，不要从浮动的 `main` 开始：

```bash
git clone https://github.com/lcha-reln/cex-matching.git
cd cex-matching
git switch -c unit/m00 course/m00.2-start
git rev-parse HEAD
```

最后一条命令必须输出：

```text
78e82c27c23e6a3e475c83353ca5ea2b0a4b4a4f
```

先运行脚手架的两个基线命令：

```bash
./gradlew clean build --no-daemon
./gradlew m00Check --no-daemon
```

两个结果必须一绿一红：

| 证据 | 预期 |
| --- | --- |
| `clean build` | 退出码 `0` |
| `m00Check` | 非 `0` |
| `build/reports/m00/check.json` | `schemaVersion = matching.m00.check.v1` |
| 同一报告 | `status = GOAL_NOT_IMPLEMENTED` |

`GOAL_NOT_IMPLEMENTED` 是课程刻意留下的红灯。编译错误、依赖下载错误或没有生成结构化报告，都不是合格起点。若第一条命令失败，应先修复 JDK/网络环境；若第二条命令意外成功，则说明并未处在固定起点。

仓库要求 Java 25。Gradle Wrapper 已冻结版本和校验值，工具链可以使用本机 JDK，也可以通过仓库配置的 resolver 获取；不要改成别的 Java 版本来绕过环境问题。

## 先建立可编译骨架，再制造第一个业务红灯

本篇只允许修改 `matching-core`。先在 `matching-core/build.gradle.kts` 中加入测试依赖：

```kotlin
dependencies {
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}
```

最终最小文件树应为：

```text
matching-core/
├── build.gradle.kts
└── src/
    ├── main/java/io/github/lchareln/cex/matching/
    │   ├── package-info.java
    │   ├── OrderId.java
    │   ├── PlaceLimitOrder.java
    │   ├── PlaceLimitOrderInput.java
    │   ├── PlaceLimitOrderValidator.java
    │   ├── PriceTicks.java
    │   ├── QuantityLots.java
    │   ├── Side.java
    │   ├── ValidationCode.java
    │   └── ValidationResult.java
    └── test/java/io/github/lchareln/cex/matching/
        └── PlaceLimitOrderValidatorTest.java
```

所有 Java 文件都使用同一个包：

```java
package io.github.lchareln.cex.matching;
```

下面的代码还会用到 `java.math.BigInteger` 与 `java.util.Objects`。请在对应文件中显式导入它们，不要依赖默认包、默认字符集或 IDE 生成的其他框架代码。

候选输入必须保留业务校验前的字符串和任意精度整数，同时拒绝 Java 层面的 `null`：

```java
public record PlaceLimitOrderInput(
    String instrumentId,
    BigInteger orderId,
    String side,
    BigInteger priceTicks,
    BigInteger quantityLots) {

  public PlaceLimitOrderInput {
    Objects.requireNonNull(instrumentId, "instrumentId");
    Objects.requireNonNull(orderId, "orderId");
    Objects.requireNonNull(side, "side");
    Objects.requireNonNull(priceTicks, "priceTicks");
    Objects.requireNonNull(quantityLots, "quantityLots");
  }
}
```

规范化命令则使用受约束的值对象。先完整实现一个 `OrderId`：

```java
public record OrderId(long value) {
  public OrderId {
    if (value <= 0) {
      throw new IllegalArgumentException("orderId must be positive");
    }
  }
}
```

再用同样模式实现 `PriceTicks` 和 `QuantityLots`；两者都只接受正数。方向是只有 `BUY` 与 `SELL` 的 enum：

```java
public enum Side {
  BUY,
  SELL
}
```

`PlaceLimitOrder` 必须同时守住固定品种和非空值对象。不要让调用者绕过 validator 直接构造一个非法“规范化命令”：

```java
public record PlaceLimitOrder(
    String instrumentId,
    OrderId orderId,
    Side side,
    PriceTicks priceTicks,
    QuantityLots quantityLots) {

  public PlaceLimitOrder {
    if (!PlaceLimitOrderValidator.INSTRUMENT_ID.equals(instrumentId)) {
      throw new IllegalArgumentException("instrumentId must be BTC-USDT");
    }
    Objects.requireNonNull(orderId, "orderId");
    Objects.requireNonNull(side, "side");
    Objects.requireNonNull(priceTicks, "priceTicks");
    Objects.requireNonNull(quantityLots, "quantityLots");
  }
}
```

在 validator 引用结果类型之前，先把错误码和结果代数完整写出来。错误码自己持有对应字段，因而不能构造 `INVALID_PRICE(orderId)` 这种自相矛盾的结果：

```java
public enum ValidationCode {
  UNKNOWN_INSTRUMENT("instrumentId"),
  INVALID_ORDER_ID("orderId"),
  INVALID_SIDE("side"),
  INVALID_PRICE("priceTicks"),
  INVALID_QUANTITY("quantityLots");

  private final String field;

  ValidationCode(String field) {
    this.field = field;
  }

  public String field() {
    return field;
  }
}
```

`ValidationResult` 必须给单参数 `Invalid` 构造器，否则后面的 `new ValidationResult.Invalid(code)` 无法编译：

```java
import java.util.Objects;

public sealed interface ValidationResult
    permits ValidationResult.Valid, ValidationResult.Invalid {

  String status();

  record Valid() implements ValidationResult {
    @Override
    public String status() {
      return "VALID";
    }
  }

  record Invalid(ValidationCode code, String field) implements ValidationResult {
    public Invalid {
      Objects.requireNonNull(code, "code");
      Objects.requireNonNull(field, "field");
      if (!code.field().equals(field)) {
        throw new IllegalArgumentException("validation code and field do not match");
      }
    }

    public Invalid(ValidationCode code) {
      this(code, code.field());
    }

    @Override
    public String status() {
      return "INVALID";
    }
  }
}
```

现在建立 `PlaceLimitOrderValidator`，但先让两个行为显式未完成：

```java
public final class PlaceLimitOrderValidator {
  public static final String INSTRUMENT_ID = "BTC-USDT";

  public ValidationResult validate(PlaceLimitOrderInput input) {
    throw new UnsupportedOperationException("complete validation contract");
  }

  public PlaceLimitOrder normalize(PlaceLimitOrderInput input) {
    throw new UnsupportedOperationException("complete normalization contract");
  }
}
```

在测试类中写第一个最小正例。下面给出完整骨架，而不是只给一个悬空的测试方法：

```java
package io.github.lchareln.cex.matching;

import static org.junit.jupiter.api.Assertions.assertInstanceOf;

import java.math.BigInteger;
import org.junit.jupiter.api.Test;

final class PlaceLimitOrderValidatorTest {
  private final PlaceLimitOrderValidator validator = new PlaceLimitOrderValidator();

  @Test
  void acceptsTheFrozenMinimumDomain() {
    var input = new PlaceLimitOrderInput(
        "BTC-USDT",
        BigInteger.ONE,
        "BUY",
        BigInteger.ONE,
        BigInteger.ONE);

    assertInstanceOf(
        ValidationResult.Valid.class,
        validator.validate(input));
  }
}
```

运行：

```bash
./gradlew :matching-core:test \
  --tests '*PlaceLimitOrderValidatorTest' \
  --no-daemon
```

这次应该因为 `UnsupportedOperationException` 失败。它是第一盏业务红灯：类、包名、JUnit 和 Gradle 已经可以工作，失败原因只剩尚未实现的合同。

## 完整示范 instrumentId，再补完同构规则

前一阶段已经冻结了错误码、字段映射和稳定状态字符串。现在只实现第一条品种规则，并暂时把其余输入当作合法，让每次新增规则都能形成独立红绿循环：

```java
public ValidationResult validate(PlaceLimitOrderInput input) {
  if (!INSTRUMENT_ID.equals(input.instrumentId())) {
    return new ValidationResult.Invalid(ValidationCode.UNKNOWN_INSTRUMENT);
  }
  return new ValidationResult.Valid();
}
```

在现有测试类中补上 `assertEquals` 的静态导入，再加入下面的测试和帮助方法：

```java
@Test
void rejectsNonCanonicalInstrumentIds() {
  assertInvalid(instrument("ETH-USDT"), ValidationCode.UNKNOWN_INSTRUMENT);
  assertInvalid(instrument("btc-usdt"), ValidationCode.UNKNOWN_INSTRUMENT);
  assertInvalid(instrument("BTC-USDT "), ValidationCode.UNKNOWN_INSTRUMENT);
}

private PlaceLimitOrderInput instrument(String instrumentId) {
  return new PlaceLimitOrderInput(
      instrumentId,
      BigInteger.ONE,
      "BUY",
      BigInteger.ONE,
      BigInteger.ONE);
}

private void assertInvalid(
    PlaceLimitOrderInput input,
    ValidationCode expected) {
  ValidationResult.Invalid invalid =
      assertInstanceOf(
          ValidationResult.Invalid.class,
          validator.validate(input));
  assertEquals(expected, invalid.code());
  assertEquals(expected.field(), invalid.field());
}
```

这里不能 `trim()`，也不能 `equalsIgnoreCase()`。输入边界只能判断调用者提供的事实，不能擅自修复事实；否则不同入口对“同一条命令”的字节表示和业务含义可能不再一致。

再次运行定向测试。最小合法输入与三个非法品种现在都必须通过：

```bash
./gradlew :matching-core:test \
  --tests '*PlaceLimitOrderValidatorTest' \
  --no-daemon
```

这是第一轮 GREEN。然后严格重复同一个节奏：先为 `orderId` 的 `0` 写测试，此时临时的 `Valid` fallback 会令测试变红；实现 `orderId` 分支后跑绿。再依次对 `side`、`priceTicks`、`quantityLots` 各做一轮 RED → GREEN。不要一次写完所有分支，否则某个断言通过时，我们无法知道它真正约束了哪段代码。

接下来按固定顺序补完四条同构规则：

```text
instrumentId -> orderId -> side -> priceTicks -> quantityLots
```

三个数值字段共享同一个判定：

```java
private static final BigInteger MINIMUM = BigInteger.ONE;
private static final BigInteger MAXIMUM = BigInteger.valueOf(Long.MAX_VALUE);

private static boolean isPositiveLong(BigInteger value) {
  return value.compareTo(MINIMUM) >= 0
      && value.compareTo(MAXIMUM) <= 0;
}
```

方向只接受精确字符串 `BUY` 或 `SELL`。所有字段通过后才返回 `new ValidationResult.Valid()`。

不要直接使用 `BigInteger.longValue()`。它会静默截断超范围值；测试本来想证明“溢出值被拒绝”，结果却可能在校验之前把输入改成另一个数。

## 用边界矩阵和 normalize 关闭所有逃生口

单个正例只能证明 happy path。下面的矩阵才是本篇合同：

| 场景 | 预期结果 | 它防止的错误实现 |
| --- | --- | --- |
| 三个数值都为 `1` | `VALID` | 错误下界 |
| 三个数值都为 `Long.MAX_VALUE` | `VALID` | 不必要的名义价值计算 |
| 任一数值为 `0` | 对应 `INVALID_*` | 把零当成有效值 |
| 任一数值为负数 | 对应 `INVALID_*` | 只检查非空 |
| 任一数值为 `Long.MAX_VALUE + 1` | 对应 `INVALID_*` | 提前 `longValue()` 截断 |
| `side = buy`、` BUY` 或空串 | `INVALID_SIDE` | trim 或大小写折叠 |
| 多字段同时错误 | 返回最靠前字段 | 校验顺序漂移 |
| 同一合法 `orderId` 校验两次 | 两次都是 `VALID` | validator 偷偷持有状态 |

多错测试应直接锁住优先级。例如，下面这条输入只能返回 `UNKNOWN_INSTRUMENT`：

```java
new PlaceLimitOrderInput(
    "ETH-USDT",
    BigInteger.ZERO,
    "HOLD",
    BigInteger.ZERO,
    BigInteger.ZERO)
```

接着实现 `normalize`。它必须先复用同一个 `validate`，不能维护第二套规则：

```java
public PlaceLimitOrder normalize(PlaceLimitOrderInput input) {
  ValidationResult result = validate(input);
  if (result instanceof ValidationResult.Invalid invalid) {
    throw new IllegalArgumentException(
        "cannot normalize invalid " + invalid.code() + " at " + invalid.field());
  }

  return new PlaceLimitOrder(
      input.instrumentId(),
      new OrderId(input.orderId().longValueExact()),
      Side.valueOf(input.side()),
      new PriceTicks(input.priceTicks().longValueExact()),
      new QuantityLots(input.quantityLots().longValueExact()));
}
```

最后增加两组独立变体：

- 合法输入规范化后，五个字段必须逐一保持原值；
- 无效输入调用 `normalize` 必须抛出 `IllegalArgumentException`，不能产生部分命令。

先让仓库冻结的格式化器只整理代码排版：

```bash
./gradlew :matching-core:spotlessApply --no-daemon
```

检查格式化后的 diff，确认它没有改变测试语义。然后运行本篇门禁：

```bash
./gradlew :matching-core:clean :matching-core:check --no-daemon
```

它必须以退出码 `0` 结束。`check` 同时覆盖编译、JUnit 和 Spotless，因此不要用跳过格式检查的命令冒充完成。

## 通过本篇验收，然后在 VALID 处停止

先确认改动仍被限制在 `matching-core`：

```bash
git status --short --untracked-files=all matching-core
git status --short matching-testkit schemas buildSrc
```

第一条只应列出前面约定的 11 个文件；第二条不应有输出。然后运行双层验收：

```bash
./gradlew clean build --no-daemon
./gradlew m00Check --no-daemon
```

最终结果仍然必须一绿一红：

| 验收项 | 必须满足 |
| --- | --- |
| `:matching-core:check` | 成功 |
| 根 `clean build` | 成功 |
| 根 `m00Check` | 以非零退出 |
| `check.json` | 仍为 `GOAL_NOT_IMPLEMENTED` |
| 生产依赖 | `matching-core` 仍只依赖 JDK |
| 状态 | 没有订单簿、订单集合或成交 |
| 运行时 | 没有文件、网络、线程、时钟、随机数、数据库或 Aeron |

本篇对最后两项的证据，是变更文件清单与源码 diff 的人工核对；自动化架构门禁属于 M00 后续课程。这里不把一次人工检查包装成已经实现的自动证明。

不要为了让最后一条命令变绿而修改 `buildSrc`、根 Gradle 任务、fixture、Schema 或 `matching-testkit`。那会跳过本篇尚未实现的 canonical history、确定性重放、semantic mutant、架构门禁和 evidence，而不是完成它们。

到这里，我们已经证明：单条 Schema-valid 候选输入的字段域明确，错误码与错误优先级明确，通过校验的值可以转换成类型化 `PlaceLimitOrder`，并且整个过程不依赖外部状态。

我们仍未证明订单被接受、落入订单簿、产生撮合、冻结资产或能够故障恢复。此时最重要的工程动作是停止：不要添加 `OrderBook`、`Trade`、数据库表或 Aeron 通道，也不要把 `Valid` 改名成 `Accepted`。下一阶段只有在这条输入合同不再漂移之后，才有资格把它编码成可重放、可哈希的确定性历史。

等四篇全部完成后，可以用不可移动的 [`course/m00-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m00-complete) 对照完整单元；它不是本篇起点，也不改变这里“根 `m00Check` 仍为红灯”的阶段验收。
