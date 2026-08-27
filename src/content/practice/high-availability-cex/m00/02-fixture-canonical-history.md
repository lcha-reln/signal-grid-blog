---
title: "M00·02：把 Fixture 冻结成 Canonical History"
description: "用严格 JSON 边界、独立期望 oracle 和字节级 golden，把一组限价单输入冻结成可比较、可哈希的确定性历史。"
date: 2026-08-27T10:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M00
lessonOrder: 20
permalink: fixture-canonical-history
tags:
  - 撮合引擎
  - 确定性
  - 测试
draft: false
---

上一阶段完成了单条 `PlaceLimitOrderInput` 的业务校验，但测试中的 Java 对象并不是可交换的历史。只要输入来自文件，我们就必须继续回答三个问题：什么字节有资格成为候选输入，fixture 中的期望能否独立检查生产代码，以及同一段业务历史能否得到字节级相同的表示。

这一篇只证明一个命题：**同一份严格合法且顺序固定的 fixture，必须得到唯一的 validation results、canonical bytes 和 SHA-256 digest。**

我们不会在这里循环重放 100 次，不会引入 semantic mutant，也不会让根 `m00Check` 变绿。那些属于下一阶段的裁判能力，而不是“如何表示一次历史”。

## 先确认输入合同仍然是唯一业务真相

继续使用上一阶段从固定 [`course/m00.2-start`](https://github.com/lcha-reln/cex-matching/tree/course/m00.2-start) 创建的 `unit/m00` 分支。不要重新从 `main` 开始，也不要为了省事直接 checkout [`course/m00-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m00-complete)。后者是全部练习完成后的只读参考坐标，不是这一篇的起点。

开始前运行：

```bash
./gradlew :matching-core:clean :matching-core:check --no-daemon
./gradlew m00Check --no-daemon
```

预期仍然一绿一红：

| 观察 | 必须满足 |
| --- | --- |
| `:matching-core:check` | 退出码 `0` |
| 根 `m00Check` | 非 `0` |
| `build/reports/m00/check.json` | `matching.m00.check.v1` |
| 同一报告 | `status = GOAL_NOT_IMPLEMENTED` |

如果 core 仍未通过，不要开始 testkit。如果根 `m00Check` 已经是 `PASS`，说明你越过了课程阶段，当前工作树不再适合跟做本篇。

先预测三个结果，再继续：

1. JSON 中的 `orderId: 1e0` 数值上等于 `1`，它能否进入业务 validator？
2. `instrumentId` 为 `交易|对` 时，canonical framing 的长度应按 Java 字符数还是 UTF-8 字节数计算？
3. fixture 中的 `caseId` 和 `expected` 是否应该进入 semantic history？

答案分别是：不能、按 UTF-8 字节数、不能。指数记法属于词法边界错误；字符串 framing 必须跨语言稳定；`caseId` 与 `expected` 是测试元数据，把它们写入 history 会让修改测试说明也改变业务摘要。

## 给 testkit 加依赖，但不污染 matching-core

严格 JSON 和 JSON Schema 属于测试与课程工具，不属于撮合业务内核。依赖只能加入 `matching-testkit`。

在 `gradle/libs.versions.toml` 增加：

```toml
[versions]
jackson = "3.2.1"
jsonSchemaValidator = "3.0.7"
slf4j = "2.0.17"

[libraries]
jackson-databind = { module = "tools.jackson.core:jackson-databind", version.ref = "jackson" }
json-schema-validator = { module = "com.networknt:json-schema-validator", version.ref = "jsonSchemaValidator" }
slf4j-nop = { module = "org.slf4j:slf4j-nop", version.ref = "slf4j" }
```

不要复制第二份 `[versions]` 或 `[libraries]` 表头，而是把条目合并到现有表中。随后把 `matching-testkit/build.gradle.kts` 改为：

```kotlin
plugins {
    `java-library`
    alias(libs.plugins.spotless)
}

dependencies {
    api(project(":matching-core"))
    implementation(libs.jackson.databind)
    implementation(libs.json.schema.validator)
    runtimeOnly(libs.slf4j.nop)
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
}

tasks.withType<Test>().configureEach {
    systemProperty(
        "m00.repositoryRoot",
        rootProject.layout.projectDirectory.asFile.absolutePath,
    )
}
```

`matching-core` 的生产依赖此时仍然只有 JDK。Jackson 没有进入业务模块，也没有获得修改 `PlaceLimitOrderValidator` 语义的资格。

本篇最终新增的主要文件是：

```text
matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/
├── CanonicalHistory.java
├── FixtureSchemaException.java
├── Hashing.java
├── JsonSupport.java
├── M00Canonicalizer.java
├── M00Fixture.java
└── M00FixtureLoader.java

matching-testkit/src/test/java/io/github/lchareln/cex/matching/testkit/
├── M00CanonicalHistoryGoldenTest.java
├── M00FixtureBoundaryTest.java
├── M00TestPaths.java
└── M00ValidationContractTest.java
```

所有这些 Java 文件都使用：

```java
package io.github.lchareln.cex.matching.testkit;
```

## 先让宽松 JSON 解析器暴露第一盏红灯

普通 `ObjectMapper` 的默认行为不是我们的 fixture 合同。先做一个小实验：复制合法 fixture 的顶层 `schemaVersion` 字段，让同一个对象里出现两个同名字段。宽松解析器可能仍然给出一棵 JSON tree，但课程边界必须拒绝这种输入，因为不同实现可能选择第一个值或最后一个值。

先建立统一路径工具：

```java
final class M00TestPaths {
  private M00TestPaths() {}

  static Path root() {
    return Path.of(System.getProperty("m00.repositoryRoot"));
  }

  static Path fixture() {
    return root().resolve(
        "matching-testkit/src/test/resources/m00/fixtures/history-v1.json");
  }

  static Path fixtureSchema() {
    return root().resolve("schemas/matching.m00.fixture.v1.schema.json");
  }
}
```

再先定义统一的系统边界异常，保证随后那盏 RED 来自 parser 过宽，而不是测试引用了一个尚不存在的类型：

```java
public final class FixtureSchemaException extends RuntimeException {
  private static final long serialVersionUID = 1L;

  public FixtureSchemaException(String message) {
    super(message);
  }

  public FixtureSchemaException(String message, Throwable cause) {
    super(message, cause);
  }
}
```

然后给 `JsonSupport` 写一个故意宽松的第一版：

```java
final class JsonSupport {
  private static final ObjectMapper MAPPER = new ObjectMapper();

  private JsonSupport() {}

  static JsonNode parse(byte[] bytes) {
    return MAPPER.readTree(bytes);
  }
}
```

在 `M00FixtureBoundaryTest` 中读取 fixture，将第一处
`"schemaVersion": "matching.m00.fixture.v1"` 替换为两个同名字段，再断言 `JsonSupport.parse(...)` 抛出 `FixtureSchemaException`。运行：

```bash
./gradlew :matching-testkit:test \
  --tests '*M00FixtureBoundaryTest' \
  --no-daemon
```

测试应该变红：宽松解析器没有拒绝重复字段，或者抛出的异常类型不是稳定的 `FixtureSchemaException`。这才是本篇第一盏业务外壳红灯。依赖下载失败和类无法编译仍然属于环境或脚手架问题。

再把 parser 收紧：

```java
static final ObjectMapper MAPPER =
    JsonMapper.builder(
            JsonFactory.builder()
                .enable(StreamReadFeature.STRICT_DUPLICATE_DETECTION)
                .build())
        .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .build();

static JsonNode parse(byte[] bytes) {
  try {
    return MAPPER.readTree(bytes);
  } catch (RuntimeException exception) {
    throw new FixtureSchemaException("fixture is not strict JSON", exception);
  }
}
```

重新运行同一个测试，重复字段与尾随第二段 JSON 都应得到 GREEN。不要把异常转换成 `INVALID_ORDER_ID` 或其他业务错误；坏 JSON 还没有产生 `PlaceLimitOrderInput`。

## 用 Schema 和词法检查关闭解析歧义

严格 JSON 只能阻止语法歧义，不能证明字段完整、类型正确或 expected 与 code 匹配。仓库起点已经提供 `schemas/matching.m00.fixture.v1.schema.json`，loader 必须在构造 Java 对象前验证它。

在 `JsonSupport` 增加：

```java
static void validate(JsonNode document, String schemaSource, boolean assertFormats) {
  try {
    Schema schema =
        SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12)
            .getSchema(schemaSource, InputFormat.JSON);
    List<com.networknt.schema.Error> errors =
        schema.validate(
            document,
            context ->
                context.executionConfig(
                    config -> config.formatAssertionsEnabled(assertFormats)));
    if (!errors.isEmpty()) {
      throw new FixtureSchemaException(
          "JSON Schema rejected document: " + errors);
    }
  } catch (FixtureSchemaException exception) {
    throw exception;
  } catch (RuntimeException exception) {
    throw new FixtureSchemaException(
        "JSON Schema validation failed", exception);
  }
}
```

fixture 的内存模型只保存有业务意义和 oracle 意义的字段：

```java
public record M00Fixture(List<Record> records) {
  public M00Fixture {
    records = List.copyOf(records);
  }

  public record Record(
      String caseId,
      PlaceLimitOrderInput input,
      Expected expected) {}

  public record Expected(
      String status,
      ValidationCode code,
      String field) {}
}
```

生产实现还应在三个 compact constructor 中复制集合、拒绝 `null`，并保证：`VALID` 不能携带 code/field，`INVALID` 必须携带二者，而且 `code.field()` 与 field 一致。这样即使以后有人绕过 JSON Schema 手工构造 fixture，也不能制造自相矛盾的 oracle。

`M00FixtureLoader.load(byte[], String)` 的顺序必须固定：

```java
JsonNode root = JsonSupport.parse(fixtureBytes);
JsonSupport.validate(root, schemaSource, false);

for (JsonNode record : root.path("records")) {
  requireLexicalInteger(record, "orderId");
  requireLexicalInteger(record, "priceTicks");
  requireLexicalInteger(record, "quantityLots");
  requireUnicodeScalarString(record.path("instrumentId"), "instrumentId");
  requireUnicodeScalarString(record.path("side"), "side");

  // 只有经过上述边界后，才构造 PlaceLimitOrderInput 与 Expected。
}
```

整数 token 检查不能依赖转换后的值：

```java
private static void requireLexicalInteger(JsonNode record, String field) {
  if (!record.path(field).isIntegralNumber()) {
    throw new FixtureSchemaException(
        field + " must use an integer JSON token");
  }
}
```

这会拒绝 `1.0` 和 `1e0`，即便它们在数学上等于整数。`integer(...)` 最后使用 `bigIntegerValue()`，因此 `9223372036854775808` 仍能原样交给业务 validator。

把边界测试扩成表驱动变体，至少覆盖：

| 变体 | 预期 |
| --- | --- |
| 重复字段 | `FixtureSchemaException` |
| `1.0` | `FixtureSchemaException` |
| `1e0` | `FixtureSchemaException` |
| 数字写成字符串 | `FixtureSchemaException` |
| 缺失 required 字段 | `FixtureSchemaException` |
| 多余字段 | `FixtureSchemaException` |
| 顶层 JSON 后再跟一个值 | `FixtureSchemaException` |
| 字符串含未配对 surrogate | `FixtureSchemaException` |

最后补一个正例，确认固定 fixture 有 17 条记录，并且 `positive-overflow-order-id` 仍保存为字符串值 `9223372036854775808`。运行边界测试应全部为绿。

## 让 fixture expected 成为独立 oracle

fixture loader 只负责把期望读出来，不能调用生产 validator 来生成 expected。否则生产代码和测试答案会共享同一个错误。

`M00ValidationContractTest` 直接逐条比较：

```java
@Test
void everyFrozenRecordMatchesTheIndependentFixtureOracle() {
  M00Fixture fixture =
      new M00FixtureLoader().load(
          M00TestPaths.fixture(),
          M00TestPaths.fixtureSchema());
  PlaceLimitOrderValidator validator = new PlaceLimitOrderValidator();

  for (M00Fixture.Record record : fixture.records()) {
    ValidationResult actual = validator.validate(record.input());
    assertEquals(record.expected().status(), actual.status(), record.caseId());
    if (actual instanceof ValidationResult.Invalid invalid) {
      assertEquals(record.expected().code(), invalid.code(), record.caseId());
      assertEquals(record.expected().field(), invalid.field(), record.caseId());
    }
  }
}
```

先故意把 fixture 中 `quantity-zero` 的整个 `expected` 对象改成下面的 Schema-valid 值：

```json
{ "status": "VALID", "code": null, "field": null }
```

测试必须在 `M00ValidationContractTest` 中因为“期望 VALID、生产结果仍为 `INVALID_QUANTITY(quantityLots)`”而 RED，而不是被 JSON Schema 提前拒绝。立即撤销这项实验，测试恢复 GREEN。这次失败才证明 oracle 独立约束了生产实现，而不是只验证“代码能运行”。

这里不要扩充新的业务规则。fixture 只能覆盖上一阶段已经冻结的五字段域和错误优先级，不能顺手加入重复订单、余额、价格带或订单状态。

## 把语义历史编码成唯一字节序列

canonical history 不是把对象 `toString()` 后拼起来。它是一个内部教学格式 `M00H1`，只表达输入顺序、规范化命令和验证结果：

```text
M00H1|records=<n>\n
M00I1|<index>|type=PLACE_LIMIT_ORDER|instrumentId=<utf8-length>:<raw>|orderId=<n>|side=<utf8-length>:<raw>|priceTicks=<n>|quantityLots=<n>\n
M00C1|<index>|type=PLACE_LIMIT_ORDER|instrumentId=<utf8-length>:<normalized>|orderId=<n>|side=<utf8-length>:<normalized>|priceTicks=<n>|quantityLots=<n>\n
M00V1|<index>|status=VALID|code=-|field=-\n
```

每条 schema-valid 输入都有一行 `M00I1`。只有 `VALID` 输入才有 `M00C1`；所有输入都有一行 `M00V1`。非法结果写入 code 与 field，不产生半条 command。

先建立不可变结果对象。byte array 在构造和读取时都必须复制：

```java
public final class CanonicalHistory {
  private final byte[] bytes;
  private final String digest;
  private final int lineCount;
  private final List<ValidationResult> validationResults;

  CanonicalHistory(
      byte[] bytes,
      String digest,
      int lineCount,
      List<ValidationResult> validationResults) {
    this.bytes = bytes.clone();
    this.digest = Objects.requireNonNull(digest, "digest");
    this.lineCount = lineCount;
    this.validationResults = List.copyOf(validationResults);
  }

  public byte[] bytes() {
    return bytes.clone();
  }

  // 为其余三个字段补只读 getter。
}
```

SHA-256 工具同时保留裸十六进制和带语义前缀的形式。后续 evidence 会复用 `sha256Hex` 计算 artifact hash，因此不要只实现眼前的 `semanticDigest`：

```java
static String sha256Hex(byte[] bytes) {
  try {
    byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
    return HexFormat.of().formatHex(digest);
  } catch (NoSuchAlgorithmException exception) {
    throw new IllegalStateException("SHA-256 is unavailable", exception);
  }
}

static String semanticDigest(byte[] bytes) {
  return "sha256:" + sha256Hex(bytes);
}
```

`M00Canonicalizer.canonicalize(...)` 的主循环如下：

```java
StringBuilder history = new StringBuilder();
List<ValidationResult> results = new ArrayList<>(inputs.size());
history.append("M00H1|records=").append(inputs.size()).append('\n');

for (int index = 0; index < inputs.size(); index++) {
  PlaceLimitOrderInput input = inputs.get(index);
  history.append(inputLine(index, input));

  ValidationResult result = validator.validate(input);
  results.add(result);
  if (result instanceof ValidationResult.Valid) {
    history.append(commandLine(index, validator.normalize(input)));
  }
  history.append(validationLine(index, result));
}

byte[] bytes = history.toString().getBytes(StandardCharsets.UTF_8);
return new CanonicalHistory(
    bytes,
    Hashing.semanticDigest(bytes),
    countLines(bytes),
    results);
```

三个行编码器都必须显式按合同字段顺序追加内容，不允许调用 record 的 `toString()`。字符串 framing 使用：

```java
private static String framed(String value) {
  return value.getBytes(StandardCharsets.UTF_8).length + ":" + value;
}
```

因此 `BTC-USDT` 是 `8:BTC-USDT`，`BUY` 是 `3:BUY`，而 `交易|对` 是 `10:交易|对`。delimiter 可以出现在值中，因为长度已经消除了边界歧义。

再增加一个小测试：输入 `instrumentId="交易|对"`、`side="BUY:NOW"` 后，history 必须包含 `instrumentId=10:交易|对` 和 `side=7:BUY:NOW`，且不能包含 `M00C1`。如果用 Java `length()` 或 delimiter split 实现 framing，这个测试会 RED。

## 先生成候选文件，再把它提升为 golden

golden 不能来自手写摘要，也不能在每次测试失败时自动覆盖。先把候选输出写到被 Git 忽略的 `build/candidates/`，人工检查后再复制到测试资源。

临时加入一个生成测试：

```java
@Test
void writesCandidateGoldenForReview() throws IOException {
  M00Fixture fixture =
      new M00FixtureLoader().load(
          M00TestPaths.fixture(),
          M00TestPaths.fixtureSchema());
  CanonicalHistory actual =
      new M00Canonicalizer().canonicalize(
          fixture.records().stream()
              .map(M00Fixture.Record::input)
              .toList());

  Path candidate =
      M00TestPaths.root().resolve(
          "build/candidates/m00/history-v1.canonical.txt");
  Files.createDirectories(candidate.getParent());
  Files.write(candidate, actual.bytes());

  assertEquals(37, actual.lineCount());
  assertEquals(3199, actual.bytes().length);
  assertEquals(
      "sha256:2d287d677d5f200f2b5bd1dd18dabbd40e865779489ce6da36d0411a3b670669",
      actual.digest());
}
```

第一次运行时，只要行格式、字段顺序、framing 或末尾 LF 有一处错误，三个冻结断言就会 RED。修正 canonicalizer，直到测试 GREEN，再检查候选文件：

```bash
wc -l -c build/candidates/m00/history-v1.canonical.txt
shasum -a 256 build/candidates/m00/history-v1.canonical.txt
sed -n '1,12p' build/candidates/m00/history-v1.canonical.txt
```

在 macOS 上，`wc` 应显示 37 行、3199 字节；`shasum` 的十六进制部分必须是：

```text
2d287d677d5f200f2b5bd1dd18dabbd40e865779489ce6da36d0411a3b670669
```

Linux 可以用 `sha256sum` 替代 `shasum -a 256`。检查有效输入同时产生 `M00I1/M00C1/M00V1`，非法输入只有 `M00I1/M00V1`，顺序与 fixture 完全一致。确认后执行：

```bash
mkdir -p matching-testkit/src/test/resources/m00/golden
cp build/candidates/m00/history-v1.canonical.txt \
  matching-testkit/src/test/resources/m00/golden/history-v1.canonical.txt
```

创建 `history-v1.sha256`，文件必须只有下面一行并以 LF 结尾：

```text
sha256:2d287d677d5f200f2b5bd1dd18dabbd40e865779489ce6da36d0411a3b670669
```

删除临时生成测试，改成不会写源码或更新 golden 的只读测试：

```java
@Test
void matchesTheCheckedInByteGoldenAndDigest() throws IOException {
  M00Fixture fixture =
      new M00FixtureLoader().load(
          M00TestPaths.fixture(),
          M00TestPaths.fixtureSchema());
  CanonicalHistory actual =
      new M00Canonicalizer().canonicalize(
          fixture.records().stream()
              .map(M00Fixture.Record::input)
              .toList());
  byte[] expected = Files.readAllBytes(
      M00TestPaths.root().resolve(
          "matching-testkit/src/test/resources/m00/golden/history-v1.canonical.txt"));

  assertArrayEquals(expected, actual.bytes());
  assertEquals(37, actual.lineCount());
  assertEquals(3199, actual.bytes().length);
  assertEquals(
      "sha256:2d287d677d5f200f2b5bd1dd18dabbd40e865779489ce6da36d0411a3b670669",
      actual.digest());
  assertEquals('\n', actual.bytes()[actual.bytes().length - 1]);
}
```

测试只能比较 golden，不能在失败时刷新 golden。否则一次错误实现就会同时改写答案，RED 永远不会出现。

## 通过阶段验收，并让根 m00Check 继续保持红色

先用仓库冻结的格式化器整理本篇新增源码，再检查 diff：

```bash
./gradlew :matching-testkit:spotlessApply --no-daemon
git diff --check
git status --short --untracked-files=all
```

确认没有修改 `matching-core` 的业务语义，也没有出现 runner、mutant、architecture 或 evidence 文件。然后运行本篇门禁：

```bash
./gradlew :matching-testkit:clean :matching-testkit:test \
  --tests '*M00FixtureBoundaryTest' \
  --tests '*M00ValidationContractTest' \
  --tests '*M00CanonicalHistoryGoldenTest' \
  --no-daemon

./gradlew clean build --no-daemon
```

两条命令都必须成功。最后再次执行：

```bash
./gradlew m00Check --no-daemon
```

它仍然必须失败，并继续写出：

```json
{
  "schemaVersion": "matching.m00.check.v1",
  "unit": "M00",
  "status": "GOAL_NOT_IMPLEMENTED"
}
```

这个红灯不是否定本篇成果。我们已经证明一份严格 fixture 能产生固定的 validation results、37 行 canonical history、3199 个 UTF-8 字节和唯一 digest；但尚未证明重复执行仍相同，也尚未证明裁判能发现错误实现。

精确停止在这里：

- 不创建 `M00DeterminismReplayTest`；
- 不循环 100 次；
- 不创建 `M00Mutants`、`M00CheckRunner` 或 `matching.m00.check.v2`；
- 不扫描 architecture boundary；
- 不生成 `build/lab-evidence`；
- 不修改 `course.properties` 生命周期；
- 不创建、移动或重新解释 `course/m00-complete`；
- 不开始订单簿、成交、持久化、网络或 Aeron。

此时你拥有的不是完整 M00，而是一段已经冻结的内部 semantic history。下一阶段才会拿这段稳定历史反复执行、注入已知错误，并回答一个更严格的问题：什么样的裁判才有资格宣布 `PASS`。
