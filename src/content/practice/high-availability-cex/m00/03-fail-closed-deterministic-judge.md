---
title: "M00·03：让确定性裁判经得起反例"
description: "用 100 次 fresh replay、semantic mutant、SYSTEM_ERROR 对照和架构门禁，把相同摘要升级为一份失败关闭的 M00 可执行裁判。"
date: 2026-08-27T11:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M00
lessonOrder: 30
permalink: fail-closed-deterministic-judge
tags:
  - 撮合引擎
  - 确定性裁判
  - Mutation Testing
draft: false
---

前两篇已经让一条 `PlaceLimitOrder` 拥有固定业务域，也把一组输入编码成固定 canonical bytes 和 SHA-256。很容易由此得出一个过早的结论：只要再运行一次得到相同摘要，M00 就已经“确定”了。

相同摘要只能说明这两次观察相同，不能说明裁判会拒绝错误实现，更不能说明裁判自身异常时不会误报成功。本篇要证明的是更强的命题：**同一份冻结 fixture 经过 100 次全新加载和规范化后，字节、业务结果与 digest 都保持唯一；指定错误实现必须被业务断言杀死，而异常控制必须被识别为系统错误；任何一项证明缺失，根 `m00Check` 都不能返回 `PASS`。**

练习仍从不可移动的 [`course/m00.2-start`](https://github.com/lcha-reln/cex-matching/tree/course/m00.2-start) 开始，并承接前两篇已经完成的 core、fixture 和 canonicalizer。此时根 `m00Check` 仍应报告 `GOAL_NOT_IMPLEMENTED`。本篇不会生成或发布 evidence，也不会创建或移动任何 tag。

## 先冻结文件地图，不把机械代码藏在省略号里

这一篇会把多个子证明收敛成一个裁判，文件数量明显多于前两篇。正文完整展开语义分叉和安全边界；JSON report 的逐字段装配、正则列表等机械代码，以不可移动完成 tag 中的单文件作为逐行参考。它们不是新的起点，也不要求你 checkout 完成态。

本篇新增：

```text
matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/
├── AtomicFiles.java
├── M00ArchitectureGate.java
├── M00CheckMain.java
├── M00CheckRunner.java
├── M00Mutants.java
└── SafeOutputPaths.java

matching-testkit/src/test/java/io/github/lchareln/cex/matching/testkit/
├── M00ArchitectureBoundaryTest.java
├── M00DeterminismReplayTest.java
├── M00EvidenceSafetyTest.java
└── M00MutantJudgeTest.java

schemas/matching.m00.check.v2.schema.json
```

这些文件的固定完整参考分别位于：

- [`M00CheckRunner.java`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M00CheckRunner.java)、[`M00CheckMain.java`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M00CheckMain.java) 与 [`M00Mutants.java`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M00Mutants.java)；
- [`M00ArchitectureGate.java`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M00ArchitectureGate.java)、[`SafeOutputPaths.java`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/SafeOutputPaths.java) 与 [`AtomicFiles.java`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/AtomicFiles.java)；
- 四个[固定测试文件](https://github.com/lcha-reln/cex-matching/tree/course/m00-complete/matching-testkit/src/test/java/io/github/lchareln/cex/matching/testkit)与 [`matching.m00.check.v2` Schema](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/schemas/matching.m00.check.v2.schema.json)。

每写完一组，就只运行该组测试；不要一开始复制全部文件后只看最终 GREEN。固定参考的作用是消除 import、JSON serializer 和安全正则中的抄写歧义，RED→GREEN 的因果顺序仍由下面各节控制。

## 重复调用不是 fresh replay

下面两种测试看起来都运行了 100 次，证明力却不同：

```text
弱重复：同一个 fixture 对象 + 同一个 canonicalizer 实例 × 100
fresh replay：重新解析冻结字节 + 新建 canonicalizer × 100
```

弱重复可能反复读取第一次计算出的缓存，甚至反复观察同一份已被污染的对象。它能发现“同一方法偶尔返回不同值”，却不能发现解析器、实例字段或对象复用带来的历史依赖。M00 因此把一次 replay 定义为：从同一份 fixture 和 Schema 重新加载记录，再用新的 `M00Canonicalizer` 生成结果。

当前实现的测试完整写成：

```java
package io.github.lchareln.cex.matching.testkit;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.LinkedHashSet;
import java.util.Set;
import org.junit.jupiter.api.Test;

final class M00DeterminismReplayTest {
  @Test
  void performsOneHundredFreshFixtureReplays() {
    M00FixtureLoader loader = new M00FixtureLoader();
    M00Fixture first = loader.load(M00TestPaths.fixture(), M00TestPaths.fixtureSchema());
    CanonicalHistory baseline =
        new M00Canonicalizer()
            .canonicalize(first.records().stream().map(M00Fixture.Record::input).toList());
    Set<String> digests = new LinkedHashSet<>();

    for (int replay = 0; replay < 100; replay++) {
      M00Fixture fresh = loader.load(M00TestPaths.fixture(), M00TestPaths.fixtureSchema());
      CanonicalHistory actual =
          new M00Canonicalizer()
              .canonicalize(fresh.records().stream().map(M00Fixture.Record::input).toList());
      assertArrayEquals(baseline.bytes(), actual.bytes(), "replay " + replay);
      assertEquals(baseline.validationResults(), actual.validationResults(), "replay " + replay);
      assertEquals(baseline.digest(), actual.digest(), "replay " + replay);
      digests.add(actual.digest());
    }
    assertEquals(1, digests.size());
  }
}
```

这里同时比较三层事实，缺一不可：

| 比较对象 | 防止的错误结论 |
| --- | --- |
| `bytes()` | 只比较摘要，掩盖编码过程已经漂移 |
| `validationResults()` | 字节碰巧相同，却没有证明业务裁决相同 |
| `digest()` 与唯一集合 | 每次输出相同，但摘要生成规则或前缀发生变化 |

加入测试后运行：

```bash
./gradlew :matching-testkit:test \
  --tests '*M00DeterminismReplayTest' \
  --no-daemon
```

如果前一篇的 canonicalizer 已经是纯函数，这个新增证明可能第一次就是 GREEN。不要为了形式制造随机数或时钟依赖来获得一盏假红灯。真正必须出现的 RED 来自下一步：我们主动提供一个业务上错误、运行时完全正常的候选实现。

## 用 semantic mutant 证明 Oracle 真的会拒绝错误答案

普通单元测试只说明生产实现通过了当前断言。它没有回答一个更尖锐的问题：如果有人删除 `quantityLots > 0` 这条规则，裁判是否真的会发现？

M00 冻结一个 semantic mutant：当此前字段都合法且 `quantityLots == 0` 时，它错误地返回 `VALID`。这个 mutant 只存在于 `matching-testkit`，绝不能进入 `matching-core`：

```java
package io.github.lchareln.cex.matching.testkit;

import io.github.lchareln.cex.matching.PlaceLimitOrderInput;
import io.github.lchareln.cex.matching.PlaceLimitOrderValidator;
import io.github.lchareln.cex.matching.ValidationResult;
import java.math.BigInteger;
import java.util.function.Function;

public final class M00Mutants {
  public static final String QUANTITY_ZERO_ACCEPTED = "M00-QTY-ZERO-ACCEPTED";

  private M00Mutants() {}

  public static Function<PlaceLimitOrderInput, ValidationResult> quantityZeroAccepted() {
    PlaceLimitOrderValidator production = new PlaceLimitOrderValidator();
    return input -> {
      if (isEarlierFieldValid(input) && BigInteger.ZERO.equals(input.quantityLots())) {
        return new ValidationResult.Valid();
      }
      return production.validate(input);
    };
  }

  public static Function<PlaceLimitOrderInput, ValidationResult> throwingControl() {
    return input -> {
      throw new IllegalStateException("intentional harness control");
    };
  }

  private static boolean isEarlierFieldValid(PlaceLimitOrderInput input) {
    PlaceLimitOrderInput positiveQuantity =
        new PlaceLimitOrderInput(
            input.instrumentId(),
            input.orderId(),
            input.side(),
            input.priceTicks(),
            BigInteger.ONE);
    return new PlaceLimitOrderValidator().validate(positiveQuantity)
        instanceof ValidationResult.Valid;
  }
}
```

`isEarlierFieldValid` 很关键。若 mutant 对任意 `quantityLots = 0` 都返回 `VALID`，它可能首先破坏品种或订单号优先级；裁判虽然会失败，却不能证明数量规则本身被测试命中。冻结 mutant 的目的不是随便造一个坏程序，而是只改变一个业务语义。

先把 mutant 加入候选列表但暂时不比较 fixture 期望，测试应 RED：`quantity-zero` 没有被识别。GREEN 的精确判据是：

```text
id             = M00-QTY-ZERO-ACCEPTED
caseId         = quantity-zero
expected       = INVALID_QUANTITY(quantityLots)
actual         = VALID
classification = STUDENT_FAILURE
killed         = true
```

只检查 `killed = true` 仍然不够。若 mutant 抛异常、fixture 解析失败或裁判空指针，同样会表现为“没有通过”。下一节要防止这种假阳性。

## 只有业务不一致才能杀死 Mutant

`M00CheckRunner` 把候选执行结果分成三类：

| 分类 | 含义 | 是否可杀死指定 mutant |
| --- | --- | --- |
| `PASS` | 所有冻结业务期望都匹配 | 否 |
| `STUDENT_FAILURE` | 候选正常返回，但业务结果与 oracle 不同 | 是 |
| `SYSTEM_ERROR` | 候选抛异常、返回 `null`，或裁判基础设施失败 | 否，并让完整门禁失败关闭 |

先建立可注入的 runner 外壳。三个 candidate 都是字段，而不是在测试中通过全局开关替换生产实现：

```java
public final class M00CheckRunner {
  public static final String PASS = "PASS";
  public static final String STUDENT_FAILURE = "STUDENT_FAILURE";
  public static final String SYSTEM_ERROR = "SYSTEM_ERROR";

  private final Function<PlaceLimitOrderInput, ValidationResult> productionCandidate;
  private final Function<PlaceLimitOrderInput, ValidationResult> requiredMutantCandidate;
  private final Function<PlaceLimitOrderInput, ValidationResult> systemErrorControl;

  public M00CheckRunner() {
    this(
        new PlaceLimitOrderValidator()::validate,
        M00Mutants.quantityZeroAccepted(),
        M00Mutants.throwingControl());
  }

  M00CheckRunner(
      Function<PlaceLimitOrderInput, ValidationResult> productionCandidate,
      Function<PlaceLimitOrderInput, ValidationResult> requiredMutantCandidate,
      Function<PlaceLimitOrderInput, ValidationResult> systemErrorControl) {
    this.productionCandidate = productionCandidate;
    this.requiredMutantCandidate = requiredMutantCandidate;
    this.systemErrorControl = systemErrorControl;
  }

  public record Result(String status, Path reportPath) {
    public boolean passed() {
      return PASS.equals(status);
    }
  }

  private record JudgeObservation(
      String classification, String caseId, String expected, String actual, String message) {}

  private static final class StudentFailure extends RuntimeException {
    private static final long serialVersionUID = 1L;

    private StudentFailure(String message) {
      super(message);
    }
  }
}
```

先让 `M00MutantJudgeTest` 通过这个 package-private 构造器注入正确候选、指定 mutant 和 throwing candidate。这样 production 或 mutant 的异常分类测试能直接命中 runner，而不是靠修改源码再改回来。

候选函数的裁决内核如下。注意异常先被转成 `SYSTEM_ERROR` observation，只有正常返回后的业务不一致才是 `STUDENT_FAILURE`：

```java
private static JudgeObservation judge(
    M00Fixture fixture, Function<PlaceLimitOrderInput, ValidationResult> candidate) {
  for (M00Fixture.Record record : fixture.records()) {
    final ValidationResult actual;
    try {
      actual = candidate.apply(record.input());
      if (actual == null) {
        throw new IllegalStateException("candidate returned null");
      }
    } catch (RuntimeException exception) {
      return new JudgeObservation(
          SYSTEM_ERROR,
          record.caseId(),
          expectedText(record.expected()),
          exception.getClass().getSimpleName(),
          "candidate raised " + exception.getClass().getSimpleName());
    }
    if (!matches(record.expected(), actual)) {
      return new JudgeObservation(
          STUDENT_FAILURE,
          record.caseId(),
          expectedText(record.expected()),
          actualText(actual),
          "case "
              + record.caseId()
              + ": expected "
              + expectedText(record.expected())
              + ", actual "
              + actualText(actual));
    }
  }
  return new JudgeObservation(PASS, null, null, null, "all business expectations matched");
}

private static boolean matches(M00Fixture.Expected expected, ValidationResult actual) {
  if ("VALID".equals(expected.status())) {
    return actual instanceof ValidationResult.Valid;
  }
  return actual instanceof ValidationResult.Invalid invalid
      && expected.code() == invalid.code()
      && expected.field().equals(invalid.field());
}
```

runner 外层还必须区分“裁判断言失败”与普通运行时异常：

```java
public Result run(Path repositoryRoot, Path reportDirectory) {
  return run(repositoryRoot, reportDirectory, repositoryRoot);
}

Result run(Path repositoryRoot, Path reportDirectory, Path trustedOutputRoot) {
  Path root = repositoryRoot.toAbsolutePath().normalize();
  Path reports = SafeOutputPaths.resolveTrustedOutput(trustedOutputRoot, reportDirectory);
  clearPreviousOutputs(reports);
  try {
    ObjectNode report = execute(root, reports);
    writeAndValidateReport(root, reports, report);
    return new Result(PASS, reports.resolve("check.json"));
  } catch (StudentFailure exception) {
    ObjectNode report = failureReport(STUDENT_FAILURE, exception.getMessage());
    writeAndValidateReport(root, reports, report);
    return new Result(STUDENT_FAILURE, reports.resolve("check.json"));
  } catch (RuntimeException exception) {
    ObjectNode report = failureReport(SYSTEM_ERROR, stableSystemMessage(exception));
    writeAndValidateReport(root, reports, report);
    return new Result(SYSTEM_ERROR, reports.resolve("check.json"));
  }
}
```

这里的 `StudentFailure` 是 runner 内部专用异常，只由已经理解的合同断言触发；其他 `RuntimeException` 一律进入 `SYSTEM_ERROR`。随后用三个候选校准裁判：

- 正确 validator 必须为 `PASS`；
- `M00-QTY-ZERO-ACCEPTED` 必须为 `STUDENT_FAILURE`，且首个失败案例必须是 `quantity-zero`；
- `throwingControl()` 必须为 `SYSTEM_ERROR`，并且 `killed = false`。

还要反向注入两次异常：生产候选抛异常时，runner 顶层必须是 `SYSTEM_ERROR`；指定 mutant 抛异常时，也必须是 `SYSTEM_ERROR`，不能因为“mutant 没通过”就算作杀死。运行真实测试：

```bash
./gradlew :matching-testkit:test \
  --tests '*M00MutantJudgeTest' \
  --no-daemon
```

如果实现把任意异常都归为 `STUDENT_FAILURE`，两个 control 测试会保持 RED。只有业务差异和系统故障被完全分开，才得到这一轮 GREEN。

## 确定性还要防止从 Core 的旁路泄漏

100 次 replay 只能观察当前 fixture 走过的路径。有人在冷门分支加入 `Instant.now()`，测试可能仍然 100 次相同；有人给 `matching-core` 加数据库依赖，即使暂时没有调用，也已经破坏了 M00 的模块边界。因此，runner 还要执行 `M00ArchitectureGate`。

它检查三个层面：

| 层面 | M00 拒绝的内容 |
| --- | --- |
| Core 源码 | 文件、网络、SQL、时钟、随机数、线程、进程、Aeron、Agrona、JPA 等运行时能力 |
| `matching-core/build.gradle.kts` | 任意生产期 `api`、`implementation`、`compileOnly` 或 `runtimeOnly` 依赖 |
| `settings.gradle.kts` | 除 `matching-core`、`matching-testkit` 外预建 runtime、protocol、cluster、counter、rest 等未来模块 |

只扫描普通 `import` 是不够的，完全限定名和 static import 都能绕过。旁路测试显式覆盖这些写法：

```java
for (String staticImport : List.of("java.lang.Math.random", "java.lang.System.nanoTime")) {
  Files.writeString(
      source,
      "package example; import static "
          + staticImport
          + "; final class Candidate { Object value() { return "
          + staticImport.substring(staticImport.lastIndexOf('.') + 1)
          + "(); } }\n");
  M00ArchitectureGate.Report report = new M00ArchitectureGate().verify(root);
  assertFalse(report.passed(), () -> "gate accepted forbidden static import: " + staticImport);
}
```

对应的 fully-qualified 反例还包括 `new java.io.File("state")`、`java.time.Instant.now()`、`Math.random()`、`Thread.ofPlatform()`、`System.getenv("M00")`、`new ProcessBuilder()` 和 `java.nio.channels.SocketChannel.open()`。先只实现 import 检查，这组旁路测试应 RED；补齐完全限定名、static import、生产依赖和未来模块检查后再变 GREEN：

```bash
./gradlew :matching-testkit:test \
  --tests '*M00ArchitectureBoundaryTest' \
  --no-daemon
```

这是一道针对 M00 源码边界的门禁，不是通用 Java sandbox，也不是字节码级安全证明。它证明“当前 core 没有出现已冻结的违禁能力”，不证明任意第三方代码绝无副作用。这个限制必须和 `architecture.status = PASS` 一起陈述。

## 一个旧 PASS 绝不能替当前代码作证

裁判一旦开始写报告，就会遇到一个容易被忽略的状态问题：上一次运行留下的 `check.json` 是 `PASS`，这一次在写新报告前崩溃，调用方若只看到文件存在，就可能读取旧成功。

M00 用三层措施拒绝 stale report：

1. Gradle 任务用 `doNotTrackState`，每次调用都真正执行；
2. runner 在进入业务判断前清除五个稳定输出文件；
3. 每份新 `check.json` 先通过 `matching.m00.check.v2` Schema，再以临时文件加原子移动写入。

清理集合是固定的，不能只删 `check.json` 而保留与它不属于同一次运行的 canonical 或 mutant 报告：

```java
private static void clearPreviousOutputs(Path reportDirectory) {
  try {
    Files.createDirectories(reportDirectory);
    for (String name :
        List.of(
            "check.json",
            "canonical-history.utf8",
            "validation-results.json",
            "mutants.json",
            "architecture.json")) {
      Files.deleteIfExists(reportDirectory.resolve(name));
    }
  } catch (IOException exception) {
    throw new IllegalStateException("cannot clear stale M00 reports", exception);
  }
}

private static void writeAndValidateReport(
    Path root, Path reportDirectory, ObjectNode report) {
  Path schemaPath = root.resolve("schemas/matching.m00.check.v2.schema.json");
  JsonSupport.validate(report, readString(schemaPath), false);
  AtomicFiles.write(reportDirectory.resolve("check.json"), JsonSupport.prettyBytes(report));
}
```

不过，“先删除”本身也可能成为攻击面。若 `build/reports` 预先是指向仓库外部的符号链接，清理动作就可能删除或覆盖外部文件。`SafeOutputPaths.resolveTrustedOutput` 因而必须在清理之前执行：它先做词法包含检查，再用 `NOFOLLOW_LINKS` 拒绝 trusted anchor 或任一既有路径组件为 symlink，最后从 anchor 的 real path 再解析一次目标。

安全输出测试至少证明两件事：

- report 目录本身是 symlink 时，runner 在写入前失败，外部目录保持为空；
- `build/reports` 是 symlink 且外部 `m00` 已存在时，仍然失败，不能因为最终目录存在就绕过父组件检查。

运行：

```bash
./gradlew :matching-testkit:test \
  --tests '*M00EvidenceSafetyTest' \
  --no-daemon
```

这个测试类沿用了 evidence safety 的命名，但本篇只使用其中与 check report 输出有关的断言，不生成 evidence manifest。路径不安全时，runner 可以直接抛出异常而不写报告；“绝不跟随不可信 symlink”优先于“总能写出失败 JSON”。

## check.v2 把六项证明收敛成一个状态

到目前为止，我们拥有 fixture、golden、replay、mutant 和 architecture 等多组测试。如果根任务只检查“某个测试进程退出 0”，它仍然没有冻结一份机器可读的完成合同。`matching.m00.check.v2` 因此把成功报告限定为六项全部存在：

| 节点 | 固定成功条件 |
| --- | --- |
| `fixture` | 17 条记录，2 条 VALID、15 条 INVALID，严格边界 probes 通过 |
| `canonical` | `M00H1`、37 行、3199 字节、固定 digest |
| `replays` | requested 100、completed 100、distinctDigests 1 |
| `requiredMutant` | 固定 mutant 在 `quantity-zero` 被 `STUDENT_FAILURE` 杀死 |
| `architecture` | `PASS` 且 violations 为 0 |
| `assertions` | 六个命名断言全部为 `PASS` |

成功报告不能携带 `failure`；`STUDENT_FAILURE` 或 `SYSTEM_ERROR` 报告则必须携带 `failure`，并且不得夹带看似完整的成功节点。Schema 的这条互斥关系防止半份旧成功与半份新失败被拼成一个含糊结果。

先把这组互斥规则写入 [`schemas/matching.m00.check.v2.schema.json`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/schemas/matching.m00.check.v2.schema.json)，再接 `writeAndValidateReport`。至少制造两个 Schema RED：给 PASS 报告加入 `failure`，以及从失败报告删除 `failure`；两者都必须在写成权威 `check.json` 前被拒绝。完整 Schema 固定了每个节点的 required 字段、枚举和 `additionalProperties: false`，不要用一个只检查 `status` 的宽松版本替代。

runner 的执行顺序也固定：先加载并核对 fixture，再裁决生产候选、生成并核对 canonical、执行严格边界 probes、完成 100 次 fresh replay、运行 architecture gate，最后校准正确候选、semantic mutant 与异常 control。任何 `require(...)` 失败都成为 `STUDENT_FAILURE`；解析器、候选或基础设施异常保持 `SYSTEM_ERROR`。

`M00CheckMain` 只负责把结构化结果转换为进程退出码：

```java
public static void main(String[] arguments) {
  if (arguments.length != 2) {
    throw new IllegalArgumentException(
        "usage: M00CheckMain <repository-root> <report-directory>");
  }
  M00CheckRunner.Result result =
      new M00CheckRunner().run(Path.of(arguments[0]), Path.of(arguments[1]));
  System.out.println("M00 check status: " + result.status() + " (" + result.reportPath() + ")");
  if (!result.passed()) {
    System.exit(1);
  }
}
```

不要从控制台文案反推成功。权威结果是退出码和经过 v2 Schema 验证的 `build/reports/m00/check.json`。

## 只在所有子证明闭合后切换根任务

在 [`course/m00.2-start`](https://github.com/lcha-reln/cex-matching/tree/course/m00.2-start)，根 `m00Check` 由 `buildSrc` 中的 `M00StartCheck` 实现，必然写出 v1 `GOAL_NOT_IMPLEMENTED` 并返回非零。不要在 replay 或 mutant 尚未完成时提前把它改绿。

等前面所有定向测试通过后，才删除起点专用的整个 `buildSrc` 源码：`buildSrc/src/main/java/io/github/lchareln/cex/build/M00StartCheck.java` 与只为它存在的 `buildSrc/build.gradle.kts`。同时从根 `build.gradle.kts` 删除 `import io.github.lchareln.cex.build.M00StartCheck`、`m00Report` 和旧的 `tasks.register<M00StartCheck>("m00Check")`，并把根版本从 `0.0.0-m00-start` 更新为 `0.0.0-m00-complete`。只删 Java 文件却保留 import 会编译失败；只追加新任务则会得到同名 task 冲突；保留 start 版本号又会让完成构件携带错误身份。

随后在 `matching-testkit/build.gradle.kts` 注册真实任务：

```kotlin
val m00ReportDirectory = rootProject.layout.buildDirectory.dir("reports/m00")

tasks.register<JavaExec>("m00Check") {
    group = "verification"
    description = "Runs the deterministic M00 completion judge."
    dependsOn("test", ":matching-core:test", "classes")
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("io.github.lchareln.cex.matching.testkit.M00CheckMain")
    args(
        rootProject.layout.projectDirectory.asFile.absolutePath,
        m00ReportDirectory.get().asFile.absolutePath,
    )
    doNotTrackState("M00 must never reuse a stale PASS report")
}
```

根工程只做聚合，不复制裁判逻辑：

```kotlin
tasks.named("check") {
    dependsOn("spotlessCheck", ":matching-core:check", ":matching-testkit:check", "m00Check")
}

tasks.register("m00Check") {
    group = "verification"
    description = "Runs the deterministic M00 contract, goldens, replays, architecture gate, and mutants."
    dependsOn(":matching-testkit:m00Check")
}
```

同时把 `course.properties` 的预期状态改为：

```properties
m00Check.expectedStatus=PASS
```

现在按风险由小到大执行验收：

```bash
./gradlew :matching-testkit:test \
  --tests '*M00DeterminismReplayTest' \
  --tests '*M00MutantJudgeTest' \
  --tests '*M00ArchitectureBoundaryTest' \
  --tests '*M00EvidenceSafetyTest' \
  --no-daemon
```

```bash
./gradlew clean build --no-daemon
./gradlew m00Check --no-daemon
```

最后直接审计结构化结果。`jq` 只用于人工阅读，不是裁判依赖；先检查本机是否提供它：

```bash
command -v jq >/dev/null || \
  echo 'jq 未安装：m00Check 仍是权威门禁，可稍后用 Homebrew 或系统包管理器安装 jq'
```

有 `jq` 时再运行：

```bash
jq -e '
  .schemaVersion == "matching.m00.check.v2" and
  .unit == "M00" and
  .status == "PASS" and
  .replays.completed == 100 and
  .replays.distinctDigests == 1 and
  .requiredMutant.id == "M00-QTY-ZERO-ACCEPTED" and
  .requiredMutant.classification == "STUDENT_FAILURE" and
  .requiredMutant.killed == true and
  .architecture.status == "PASS" and
  .architecture.violations == 0
' build/reports/m00/check.json
```

这一次根任务变绿，不是因为把预期红灯删掉了，而是因为 v1 的教学缺口已经被 v2 的六项可证伪断言替代。完成后可以把自己的实现与只读的 [`course/m00-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m00-complete) 做最终对照；这个 ref 只是参考答案，不是开始练习的基线，也不是本篇要求读者执行的发布步骤。

到这里，M00 能保证冻结输入的业务结果、canonical bytes 和 digest 在 100 次 fresh replay 中一致；指定业务错误会被准确定位；候选或裁判异常不会冒充 mutant kill；core 的已知非确定性旁路会被架构门禁拒绝；旧报告和不安全输出路径不能替当前运行伪造成功。它仍然没有订单簿、成交、持久化、Aeron 或故障恢复。下一步可以讨论如何封装和发布证据，但那是另一条合同，不能倒灌进本篇的确定性裁判。
