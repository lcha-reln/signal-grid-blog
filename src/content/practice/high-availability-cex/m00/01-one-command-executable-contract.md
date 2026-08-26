---
title: "M00：为什么第一版只固定 BTC-USDT 和一条 PlaceLimitOrder"
description: "用一个固定品种和一条限价单输入合同，把撮合课程的第一个正确性边界做成可运行、可证伪的工程基线。"
date: 2026-08-26T16:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M00
lessonOrder: 10
permalink: one-command-executable-contract
tags:
  - 撮合引擎
  - 输入合同
  - Java
draft: true
---

许多撮合项目的第一步，是直接写买卖盘、价格档位和成交循环。这样很快能“撮合出一笔交易”，却同时引入了订单状态、时间优先级、可变数据结构和事件输出。测试一旦失败，我们很难判断错的是输入、规则，还是状态迁移。

M00 选择相反的起点：先让一条候选 `PlaceLimitOrder` 只能得到两类确定结果——成为类型明确的命令，或者被一个明确的字段错误拒绝。我们暂时把品种固定为 `BTC-USDT`，把命令类型固定为 `PlaceLimitOrder`，目的不是做一个只能交易单一币对的 Demo，而是先建立一条能够独立证明的输入边界。

这一篇只完成这条边界。`VALID` 不等于订单已被接受，更不等于订单已经入簿或成交。

## 第一项交付不是订单簿，而是可证伪的输入合同

“接收限价单”这句话至少混合了三个不同动作：

- 把不可信的外部数据解析为候选输入；
- 判断每个字段是否属于本单元允许的业务域；
- 把通过校验的输入交给后续状态机处理。

M00 只负责前两步。它的输出可以称为“已规范化命令”，却不能称为“已接受订单”。后一个说法意味着系统已经执行了准入、幂等、余额或仓位检查，并拥有可以恢复的订单状态；这些能力在本单元都不存在。

因此，本单元的正确性命题很窄，也很具体：**给定同一条候选输入，纯业务代码必须得到同一个校验结果；只有通过校验的输入才能被规范化为 `PlaceLimitOrder`。** 这个命题可以由单元测试反驳，也能在没有数据库、网络和集群的情况下独立复现。

## 固定 BTC-USDT，是控制变量而不是产品承诺

如果第一版就允许动态品种，撮合模块必须回答更多问题：品种由谁发布，规则版本何时生效，重放历史命令时读取哪个版本，以及停牌或下线如何影响已有订单。把这些问题藏在一个 `Map<String, Instrument>` 里，并没有消除复杂度，只是让合同变得含糊。

M00 把 `instrumentId` 的业务域冻结为精确字符串 `BTC-USDT`。`btc-usdt`、前后带空格的字符串和 `ETH-USDT` 都不在这个域内。这样做带来一个重要效果：当品种校验失败时，原因只可能来自当前输入，而不是某个尚未定义的配置快照。

这也给后续演进留下了清晰的替换点。等课程真正引入品种公共数据时，我们要替换的是“品种规则的权威来源”，而不是悄悄放宽 `instrumentId` 为任意非空字符串。固定值先证明调用边界，动态目录再承担版本、恢复与一致性责任。

## 一条 PlaceLimitOrder 已经足够暴露完整边界

本单元的候选输入只有五个业务字段：

| 字段 | M00 允许的值 | 不在本单元内推导的含义 |
| --- | --- | --- |
| `instrumentId` | 精确等于 `BTC-USDT` | 不查询动态品种目录 |
| `orderId` | `1..Long.MAX_VALUE` 的整数 | 不检查是否重复 |
| `side` | 精确等于 `BUY` 或 `SELL` | 不做大小写折叠或去空格 |
| `priceTicks` | `1..Long.MAX_VALUE` 的整数 | 不计算名义价值 |
| `quantityLots` | `1..Long.MAX_VALUE` 的整数 | 不冻结资产或仓位 |

这里的整数先以任意精度读取，再判断是否落在 `long` 的正数范围内。否则，`Long.MAX_VALUE + 1` 可能在进入业务校验之前溢出，测试看到的就不再是原始输入。

为什么现在不同时加入撤单、改单或市价单？因为它们不是多几个字段而已。撤单依赖已有订单，改单需要定义身份与优先级是否保留，市价单需要明确保护价格或资金约束。只保留 `PlaceLimitOrder`，我们才能在没有订单状态的前提下完整回答“这条命令是否属于合法输入域”。

## 从不可移动的起点开始

课程起点是固定 tag [`course/m00.2-start`](https://github.com/lcha-reln/cex-matching/tree/course/m00.2-start)，不要从浮动的 `main` 开始。新目录可以这样准备：

```bash
git clone https://github.com/lcha-reln/cex-matching.git
cd cex-matching
git switch -c unit/m00 course/m00.2-start
git rev-parse HEAD
```

最后一条命令应输出起点提交：

```text
78e82c27c23e6a3e475c83353ca5ea2b0a4b4a4f
```

先记录脚手架的两种预期结果：

```bash
./gradlew clean build --no-daemon
./gradlew m00Check --no-daemon
```

第一条命令应成功，证明 Java 25、Gradle Wrapper 和项目边界能够正常工作。第二条命令此时**应当失败**，并把 `GOAL_NOT_IMPLEMENTED` 写入 `build/reports/m00/check.json`。这不是环境故障，而是课程刻意保留的实现缺口；若第一条命令失败，或第二条命令没有产生结构化报告，应先修复环境，而不是开始写业务代码。

## 用两种类型隔离“不可信输入”和“可用命令”

不要让 JSON 解析器直接构造最终命令。候选输入需要保留越界值，以便业务校验给出确定结果；最终命令则只允许已经满足约束的值。最小结构可以写成：

```java
public record PlaceLimitOrderInput(
    String instrumentId,
    BigInteger orderId,
    String side,
    BigInteger priceTicks,
    BigInteger quantityLots) {}
```

```java
public record PlaceLimitOrder(
    String instrumentId,
    OrderId orderId,
    Side side,
    PriceTicks priceTicks,
    QuantityLots quantityLots) {}
```

这不是重复建模。`PlaceLimitOrderInput` 回答“调用方实际给了什么”，所以数字不能提前截断；`PlaceLimitOrder` 回答“哪些值已经满足 M00 的合同”，所以可以使用受约束的值对象。两者之间只能通过显式校验与规范化跨越。

`matching-core` 里的这些类型应保持为纯业务代码：不读文件、不记录时间、不访问数据库，也不依赖网络或 Aeron。这样，任意运行环境都能对同一个输入作出相同判断。

## 让失败结果和校验顺序成为合同

布尔值只能说明“失败了”，却无法证明哪个规则先失败。M00 使用带字段的结果：

```java
public sealed interface ValidationResult
    permits ValidationResult.Valid, ValidationResult.Invalid {

  record Valid() implements ValidationResult {}

  record Invalid(ValidationCode code, String field)
      implements ValidationResult {}
}
```

校验器按固定顺序短路：

```text
instrumentId -> orderId -> side -> priceTicks -> quantityLots
```

实现时先写一个判断正数 `long` 范围的辅助函数，再按上面的顺序返回 `UNKNOWN_INSTRUMENT`、`INVALID_ORDER_ID`、`INVALID_SIDE`、`INVALID_PRICE` 或 `INVALID_QUANTITY`。只有 `validate(input)` 返回 `Valid`，`normalize(input)` 才能把 `BigInteger` 精确转换为值对象；无效输入调用 `normalize` 必须失败，不能产生“半合法”命令。

固定顺序不是为了美观。当一条输入同时包含未知品种、零订单号和非法方向时，不同节点若各自返回不同错误，调用方观察到的系统行为就已经不确定。把顺序写进合同，才有资格在后续把这段逻辑放入可重放的状态机之前。

## 正例和反例要证明同一条边界

先用直接单元测试验证最小正例。它只能证明输入属于业务域，测试名不要写成 `acceptsOrder`：

```java
var input = new PlaceLimitOrderInput(
    "BTC-USDT",
    BigInteger.ONE,
    "BUY",
    BigInteger.ONE,
    BigInteger.ONE);

assertInstanceOf(
    ValidationResult.Valid.class,
    validator.validate(input));
```

随后至少补齐三类反例：

1. **固定值反例**：把品种改成 `ETH-USDT`，结果必须是 `UNKNOWN_INSTRUMENT(instrumentId)`；
2. **边界反例**：把任一整数改成 `0`、负数或 `Long.MAX_VALUE + 1`，结果必须指向对应字段；
3. **多错反例**：同时传入未知品种、`orderId = 0` 和 `side = HOLD`，结果仍只能是优先级最高的 `UNKNOWN_INSTRUMENT(instrumentId)`。

还应调用两次同一个 `orderId`。两次都得到 `Valid` 才符合 M00，因为本单元只校验单条输入，没有订单集合，也没有资格判断重复。若第二次变成拒绝，说明校验器偷偷持有了状态，已经越过本单元边界。

完成这一篇的实现和测试后运行：

```bash
./gradlew :matching-core:test --no-daemon
```

这条命令应成功，证明输入合同、边界值和错误优先级已经闭合。此时再次运行 `./gradlew m00Check --no-daemon`，顶层状态仍应是 `GOAL_NOT_IMPLEMENTED`；不要在本篇里把它改成 `PASS`。完整门禁还缺少严格 fixture、canonical history、100 次重放、semantic mutant、架构边界和 evidence，这些会在 M00 后续教程中逐项实现。

## 在“合法命令”处停止，而不是继续写撮合循环

到这一篇的停止点，`matching-core` 能保证：单条候选输入的字段域明确，错误码与错误优先级明确，通过校验的值可以转换成类型化 `PlaceLimitOrder`，并且该过程不依赖外部状态。它还不代表整个 M00 已完成。

它不能保证订单被接受、落入订单簿、产生撮合、冻结资产或在故障后恢复。此时最重要的工程动作是停止：不要顺手添加 `OrderBook`、`Trade`、数据库表或 Aeron 通道，也不要把 `Valid` 改名成 `Accepted`。那些名称都会承诺本单元没有证明的事实。

维护者当前使用本地完成 ref `course/m00-complete` 标记通过门禁的实现，但该 ref 在本文撰写时**尚未远端发布**，不能作为读者可获取的依赖。练习应始终从远端不可移动的 `course/m00.2-start` 创建自己的分支；等完成 ref 与证据正式发布后，课程页会再提供可核验的对照入口。

这一停止点留下的不是一个“残缺撮合器”，而是一条已经闭合的输入合同：下一步无论增加确定性表示、订单簿还是集群复制，都必须建立在同一个、不会偷偷改变含义的 `PlaceLimitOrder` 之上。
