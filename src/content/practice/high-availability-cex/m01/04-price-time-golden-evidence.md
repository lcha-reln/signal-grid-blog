---
title: "M01·04：用独立 Golden 与失败关闭裁判发布完成证据"
description: "把可运行的价格时间优先撮合器交给独立 scenario oracle、BigInteger 不变量、100 次确定性重放和三个 semantic mutant，并将结果绑定到 clean commit、annotated tag 与七项可核验证据。"
date: 2026-08-27T15:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M01
lessonOrder: 40
permalink: price-time-golden-evidence
tags:
  - 撮合引擎
  - 确定性裁判
  - 证据链
draft: false
---

前三篇已经得到一台可运行的单写者内存撮合器，但几个 worked example 全绿，只能说明实现通过了作者亲手写出的例子。若期望值由生产撮合器自己生成，数量求和仍用 `long`，或者候选一抛异常就算“mutant 已被杀死”，这套测试会把同一个错误同时复制到答案和实现中。

本篇只完成 M01 的证明与发布闭环：**固定 scenario 中的有序事件和批末盘口必须由独立 oracle 给出；裁判再用任意精度不变量、规范字节、fresh replay 和 semantic mutant 证明自己既能接受正确实现，也能拒绝已知错误；最后把这次 `PASS` 绑定到 clean commit 和 annotated complete tag。**

这不是让读者手敲近五千行完成态 testkit。完整机械实现已经冻结在 [`course/m01-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m01-complete)；本篇要求你能解释关键裁判合同、用它验证自己的 core，并读懂发布证据。撤单、生成式参考模型、持久化、Aeron 与高可用都不在这里展开。

## 先固定起点、完成坐标与两种学习身份

M01 的起点和官方完成态已经成为两个不可移动坐标：

| 身份       | Git ref               | peeled commit                              | 用途                                         |
| ---------- | --------------------- | ------------------------------------------ | -------------------------------------------- |
| 练习起点   | `course/m01-start`    | `44602f4c53b7726b8f207f16852a724d1d5204be` | 保留 `GOAL_NOT_IMPLEMENTED` 与冻结 scenario  |
| 官方完成态 | `course/m01-complete` | `be2e3b8e5db4959c5639d7aa3e7314dbac45d82b` | 固定 core、裁判、Schema、CI 与 evidence 合同 |

先在课程仓库中只读核对对象身份：

```bash
git fetch origin --tags

test "$(git rev-parse 'course/m01-start^{}')" \
  = "44602f4c53b7726b8f207f16852a724d1d5204be"
test "$(git rev-parse 'course/m01-complete^{}')" \
  = "be2e3b8e5db4959c5639d7aa3e7314dbac45d82b"

test "$(git cat-file -t course/m01-start)" = tag
test "$(git cat-file -t course/m01-complete)" = tag
```

`cat-file` 输出 `tag`，证明 ref 指向 annotated tag object；`rev-parse <tag>^{}` 才读取其 peeled commit。不要删除、重建或强制移动这两个官方 tag。

接下来要区分两种身份：

- 学习者在自己的 `unit/m01` 分支上运行 `m01Check`，证明当前 core 满足合同；
- 课程发布者才运行 `m01Evidence`、创建完成 tag，并让 tag CI 证明 tag、manifest 与 commit 同一。

个人分支通过裁判，不会自动变成官方 `course/m01-complete`。反过来，checkout 官方完成 tag 只能复核参考实现，也不能替你的工作树作证。

## 导入冻结裁判，让真正的合同差异先变成 RED

第三篇停止时，根任务仍是起点版 v1 runner；它与 M00 已冻结的“core 不含订单簿”历史测试绑在一起，不能判断已经合法增加订单簿的 M01 工作树。现在要替换的是裁判基础设施，不是把参考撮合器覆盖到自己的 core。

先把前三篇的工作收成一个可恢复 checkpoint，并确认没有混入无关文件：

```bash
./gradlew :matching-core:check --no-daemon
git diff --check
git status --short --untracked-files=all

# 只暂存你在前三篇实际修改过的 core 与聚焦测试。
git add matching-core
git commit -m 'feat: implement M01 price-time core walkthrough'
test -z "$(git status --porcelain --untracked-files=normal)"
```

然后从固定 complete ref 导入 testkit、v2 Schema 和根任务接线。这个操作刻意不包含 `matching-core`：

```bash
git restore --source=course/m01-complete -- \
  build.gradle.kts \
  course.properties \
  matching-testkit \
  schemas/matching.m01.check.v2.schema.json

git diff --check
./gradlew :matching-testkit:classes --no-daemon
./gradlew m01Check --no-daemon
```

冻结实现相对起点增加约 4,866 行、涉及 47 个文件；机械地重新键入这些 loader、adapter、report writer 和 safety test，既没有额外学习价值，也容易制造抄写差异。导入后必须重点阅读下面五个固定文件，而不是把它们当黑盒：

- [`M01ScenarioLoader.java`](https://github.com/lcha-reln/cex-matching/blob/course/m01-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M01ScenarioLoader.java)：谁有权加载冻结输入与期望；
- [`M01Assertions.java`](https://github.com/lcha-reln/cex-matching/blob/course/m01-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M01Assertions.java)：事件语法、优先级、数量和盘口不变量；
- [`M01CheckRunner.java`](https://github.com/lcha-reln/cex-matching/blob/course/m01-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M01CheckRunner.java)：执行顺序、重放、mutant 与失败关闭；
- [`M01Canonicalizer.java`](https://github.com/lcha-reln/cex-matching/blob/course/m01-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M01Canonicalizer.java)：规范字节如何排除环境噪声；
- [`M01EvidenceWriter.java`](https://github.com/lcha-reln/cex-matching/blob/course/m01-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M01EvidenceWriter.java)：clean source、artifact hash 与 tag 字符串边界。

如果你的公开类型、事件顺序、maker price、FIFO 或批末盘口仍有差异，这次 `m01Check` 应当是 RED。编译错误说明公开语义形状尚未对齐；结构化 `STUDENT_FAILURE` 则说明候选正常返回了错误业务结果。不要改 fixture 或 Golden 去迎合实现，应回到前三篇修改自己的 `matching-core`。

若第一次就 GREEN，不需要人为破坏 core。后文的三个内置 mutant 会用同一 oracle 给出三盏可复核的语义红灯，证明裁判不是“永远 PASS”。

## 独立 Golden 先规定答案，再观察生产候选

冻结 corpus 是 `matching.m01.scenario.v1` 文档，共 8 个 scenario、22 条 command。其原始 SHA-256 为：

```text
d050bc2fc029e3ac0afb5047e3030412412f3a7aecf0938a19a5953618ff9ed7
```

每条 case 同时记录输入、期望的有序 event batch 和完整 `bookAfter`。关键所有权方向是：

```text
checked-in scenario expectations
              │
              ▼
        independent oracle ────── compare ────── production candidate output
              │                                      │
              └──── reconstruct transition/invariants┘
```

生产撮合器只能通过 `M01ProductionCandidate` 被适配为 testkit 的不可变语义值；它没有写 fixture、Golden 或期望盘口的入口。若测试先调用生产实现生成 expected，再用同一实现生成 actual，即使二者字节相同，也只是自我比较。

loader 还要拒绝“JSON 看起来能读，合同却已经漂移”的输入。完成态固定执行 5 个边界 probe：重复字段、把整数改成小数、加入未知字段、删除必填字段、重复 `caseId`。任一 probe 被接受都归为裁判基础设施失败，不能继续宣告业务 `PASS`。

先核对 scenario 身份与报告中的 shape：

```bash
jq -e '
  .schemaVersion == "matching.m01.check.v2" and
  .scenarioCorpus.scenarios == 8 and
  .scenarioCorpus.cases == 22 and
  .scenarioCorpus.schemaProbes == 5 and
  .scenarioCorpus.sha256 ==
    "d050bc2fc029e3ac0afb5047e3030412412f3a7aecf0938a19a5953618ff9ed7"
' build/reports/m01/check.json
```

`jq` 是额外的只读审计工具，不是 Gradle 课程依赖。权威门禁已经在 Java runner 内验证 v2 Schema 和冻结常量。

## BigInteger 不变量防止正确公式败给 long 溢出

逐 case 比对期望仍不够。fixture 可能漏写某个错误，或者期望与实现恰好以同一种方式错。`M01Assertions` 因此根据“前一盘口 + 当前输入 + 当前事件”独立重建下一盘口，并在每批之后验证：

- 无效输入只产生一个 `Rejected`，盘口不变、序列不消耗；
- 有效批严格满足 `Accepted, Trade*, Rested?`，且 `Rested` 至多一次并只能在末尾；
- Bid 降序、Ask 升序，同价队列按 acceptance sequence 递增；
- 每笔 Trade 数量为正、使用当前最佳 maker 价格，不能跳过队首；
- 零余量订单和空价位被移除，批末不存在 `bestBid >= bestAsk`；
- taker 原数量等于所有 Trade 数量之和加最终 resting 余量；
- maker 的批后余量等于批前余量减去属于它的成交量。

总量检查不能继续用 `long`。单笔合法数量最多可到 `Long.MAX_VALUE`，多个价位求和时很容易在断言内部溢出，甚至绕回一个貌似相等的负数。裁判把所有聚合项提升为 `BigInteger`，检查双边活动数量：

```text
bookBefore + incomingTaker
  = bookAfter + 2 × tradedQuantity
```

右侧乘 2 是因为一次成交会同时消耗 maker 与 taker 的活动数量。公式中的每个单值仍来自已验证的正 `long`，只有聚合算术提升为任意精度；这不会改变业务 core 的值对象边界。

官方 `invariants.json` 记录了 21 个 accepted、1 个 rejected、12 笔 Trade，以及 22 次批序检查、22 次守恒检查、12 次 maker-price/priority 检查和 44 次批前批后盘口结构检查；`aggregateArithmetic` 必须为 `BigInteger`。

## M00 回归只继承仍然成立的合同

M01 没有重新定义输入。完成裁判会复核 M00 的 17 条记录、2 条 valid、15 条 invalid、`M00H1` 规范历史、固定 digest 和 100 次 fresh replay；还会把 15 种无效输入全部送进 M01 engine，在空盘口和已播种的非空盘口上验证：

```text
Rejected
bookAfter == bookBefore
next valid acceptance sequence 没有出现缺口
```

官方 `m00-regression.json` 因而记录：

```text
engineInvalidCases = 15
engineInvalidOutcome = REJECTED_WITHOUT_BOOK_OR_SEQUENCE_MUTATION
firstValidSequenceAfterInvalids = 1
completedReplays = 100
distinctDigests = 1
```

这里必须避免一个错误表述：M01 只继承 M00 的 input、validation、canonical history 与 digest 合同，**没有**在 M01 HEAD 重跑 M00 的完整门禁。M00 的架构证明曾要求 core 尚无订单簿，M01 正是有意改变这条事实；其 `M00-QTY-ZERO-ACCEPTED` mutant 和 no-order-book architecture 证据继续冻结在 `course/m00-complete`（可从 [M00 单元](/signal-grid-blog/practice/high-availability-cex/m00/) 进入核验），不能删掉历史测试后再声称“整个 M00 在 M01 上重新通过”。

## 三个 mutant 把已知错误校准为业务 RED

一个能接受正确实现的 oracle 仍可能太宽。M01 固定三个 testkit-only semantic mutant，它们不进入生产 core：

| Mutant                 | 注入错误                         | 必须首次失败的位置                                        | 正确分类          |
| ---------------------- | -------------------------------- | --------------------------------------------------------- | ----------------- |
| `M01-SAME-PRICE-LIFO`  | 反转同价 Trade 顺序              | `same-price-fifo-three-makers / fifo-taker`               | `STUDENT_FAILURE` |
| `M01-TAKER-PRICE`      | 把每笔成交价改成 taker 限价      | `better-price-before-time / buy-takes-better-price-first` | `STUDENT_FAILURE` |
| `M01-SKIP-FIRST-MAKER` | 多笔成交时删除第一笔 maker Trade | `better-price-before-time / buy-takes-better-price-first` | `STUDENT_FAILURE` |

三者都正常返回了结构完整但业务错误的结果，所以它们必须被独立期望或不变量识别为 `STUDENT_FAILURE`。这三项就是本篇的语义 RED：若某个 mutant 返回 `PASS`，oracle 没有区分那种错误；若它抛异常或返回 `null`，也不能算被业务断言杀死。

分类边界固定为：

| classification    | 含义                                            | 能否计作 killed mutant |
| ----------------- | ----------------------------------------------- | ---------------------- |
| `PASS`            | 候选事件、盘口与全部不变量匹配                  | 否                     |
| `STUDENT_FAILURE` | 候选正常返回，但业务语义不匹配                  | 是                     |
| `SYSTEM_ERROR`    | 候选抛异常、返回空值，或 parser/runner/环境失败 | 否，并让总门禁失败关闭 |

完成裁判还运行 `M01-SYSTEM-ERROR-CONTROL`。它故意抛出 `IllegalStateException`，报告必须是 `SYSTEM_ERROR`。runner 在每次运行开始先清除固定的旧产物；如果生产候选、必需 mutant 或基础设施失败，最终只写符合 `matching.m01.check.v2` 的失败 `check.json`，不能让上一次 `PASS` 伪装成本次结果。

现在执行真正的 GREEN：

```bash
./gradlew spotlessApply clean build m01Check \
  --no-daemon \
  --rerun-tasks

jq -e '
  .status == "PASS" and
  ([.requiredMutants[].id] == [
    "M01-SAME-PRICE-LIFO",
    "M01-TAKER-PRICE",
    "M01-SKIP-FIRST-MAKER"
  ]) and
  all(.requiredMutants[];
    .classification == "STUDENT_FAILURE" and .killed == true) and
  .mutants.systemErrorControl == "SYSTEM_ERROR"
' build/reports/m01/check.json
```

`spotlessApply` 会修改不符合格式的源文件；它属于开发阶段命令。进入 evidence 阶段以后只能在已经格式化并提交的 clean tree 上运行发布门禁。

## M01H1 把 22 次状态迁移压成可复核字节

业务 GREEN 之后，`M01Canonicalizer` 依 fixture 顺序编码每条输入、有序事件和完整 `bookAfter`。规范历史固定为 UTF-8、LF、无 BOM、末尾带 LF，并排除路径、时间戳、JDK、Git 元数据和对象 identity。

官方 Golden 的精确身份是：

| 字段   | 固定值                                                                    |
| ------ | ------------------------------------------------------------------------- |
| format | `M01H1`                                                                   |
| lines  | `155`                                                                     |
| bytes  | `14256`                                                                   |
| digest | `sha256:74585489c50e81cc3e6a10044263186ce66a7f1b20e1f45015fed68614c3e5a1` |

一次重复调用同一个 engine 不是 fresh replay，因为它继承了上次盘口和接受序列。完成态每轮都重新解析 scenario pack、创建全新候选和全新 engine，再比较事件、盘口、规范字节和 digest。只有 `requested = 100`、`completed = 100`、`distinctDigests = 1` 同时满足，确定性子证明才闭合。

```bash
jq -e '
  .canonical == {
    "format": "M01H1",
    "digest": "sha256:74585489c50e81cc3e6a10044263186ce66a7f1b20e1f45015fed68614c3e5a1",
    "lines": 155,
    "bytes": 14256,
    "artifact": "canonical-history.utf8"
  } and
  .replays == {
    "requested": 100,
    "completed": 100,
    "distinctDigests": 1
  }
' build/reports/m01/check.json
```

100 次相同不是随机性质证明。固定 scenario 和三个 mutant 仍不等于 M03 才会加入的独立生成式参考模型、property generation 与 shrinking；这项限制必须随 digest 一起保留。

## clean evidence 把 GREEN 绑定到提交，但不替 tag 作证

`m01Check` 可以在 dirty tree 中提供开发反馈；`m01Evidence` 只能属于一笔可寻址的 clean commit。完成态 writer 依次验证：

1. tag 名字符串匹配 `course/m01-complete` 或合法 patch complete 形式；
2. `git status --porcelain --untracked-files=normal` 为空；
3. `HEAD` 是完整 40 位 commit；
4. `course.properties` 的 case、Profile、plan、unit、lifecycle、start/complete ref 与 evidence path 精确匹配；
5. `m01Check` 重新生成 v2 `PASS`；
6. 固定报告路径与 evidence tree 没有 symlink、`..` 或越界 real path；
7. staging 中的 manifest 通过 Schema、七项声明顺序、七项限制顺序和全部 artifact SHA-256 校验；
8. 发布 staging 前后 `HEAD` 不变且工作树仍 clean。

这会先制造一个发布 RED：刚导入的 testkit 还没有提交，`m01Check` 可以 GREEN，但 `m01Evidence` 必须失败并报告 `m01Evidence requires a clean working tree`。不要删除改动来追求 clean，而是先完成审阅、测试与一次范围明确的 commit。

在课程发布流程中，clean commit 上运行：

```bash
./gradlew clean build m01Evidence \
  -Pm01.unitTag=course/m01-complete \
  --no-daemon \
  --rerun-tasks
```

本地 writer 只验证 **tag 名字符串** 与 `course.properties.completeRef`，然后把字符串和当前 `HEAD` 写入 manifest。它刻意不要求 tag 已存在，也不解析 tag 指向，否则会产生“先有 evidence 还是先有 tag”的循环。因此本地 GREEN 不能证明 tag 是 annotated object，更不能证明 tag peel 后等于 manifest source。

官方发布按 branch CI → annotated tag → tag CI → main CI 的顺序完成。同一完成提交的三次成功运行是：

| Ref                   | GitHub Actions                                                                    | 增加的证据                                                                          |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `unit/m01`            | [33050505968](https://github.com/lcha-reln/cex-matching/actions/runs/33050505968) | 完成分支可从 clean checkout 生成 M01 PASS 与 evidence                               |
| `course/m01-complete` | [33050595109](https://github.com/lcha-reln/cex-matching/actions/runs/33050595109) | 验证 annotated tag、peeled commit、manifest source 与 unitTag 同一，并上传 evidence |
| `main`                | [33050722993](https://github.com/lcha-reln/cex-matching/actions/runs/33050722993) | 同一 SHA 已进入默认集成分支                                                         |

tag run 的 `headSha` 是 `be2e3b8e5db4959c5639d7aa3e7314dbac45d82b`，其中 “Verify annotated M01 complete tag identity” 与 “Upload M01 evidence” 均为成功。只有 tag 事件会联合执行下面的身份检查：

```bash
test "$(git cat-file -t "$GITHUB_REF_NAME")" = tag
peeled="$(git rev-list -n 1 "$GITHUB_REF_NAME")"
test "$peeled" = "$(jq -r '.source.commit' build/lab-evidence/M01/manifest.json)"
test "$GITHUB_REF_NAME" = "$(jq -r '.unitTag' build/lab-evidence/M01/manifest.json)"
```

## 七项 claim 必须和七项 limitation 一起发布

M01 的 manifest 不是一张笼统的“测试通过”截图。它把七项声明分别绑定到最小原始产物：

| Claim ID                       | 它能证明什么                                   | 关键产物                      |
| ------------------------------ | ---------------------------------------------- | ----------------------------- |
| `m00-input-regression`         | M00-invalid 仍拒绝，且不改盘口、不耗序列       | `m00-regression.json`         |
| `price-time-priority`          | 8/22 corpus 符合最佳价、接受序列与 maker price | fixture、`price-time.json`    |
| `matching-event-batches`       | 每条命令符合冻结事件语法                       | `event-batches.json`          |
| `quantity-and-book-invariants` | 正成交、守恒、队列、价位和不交叉盘口成立       | `invariants.json`             |
| `deterministic-event-history`  | 100 个 fresh engine 得到唯一 `M01H1`           | canonical bytes、`check.json` |
| `semantic-mutants`             | 三个指定错误被业务断言杀死，异常不算           | `mutants.json`                |
| `architecture-boundary`        | core 仍是无 I/O/运行时依赖的双模块确定性业务核 | `architecture.json`           |

声明集合和顺序必须精确匹配，不能只保留对发布叙事有利的几项。与之相邻的七项 limitation 同样是合同：

1. 只有一个内存 `BTC-USDT` GTC 限价订单簿；
2. scenario 中 order ID 唯一，重复 ID、重复命令和可寻址生命周期不在 M01；
3. 没有撤单、改单、订单索引、IOC、FOK、post-only、市价单、STP、市场状态或价格带；
4. 没有账户、资产、仓位、手续费、结算或风险逻辑；
5. 固定场景与 mutant 不是 M03 的独立生成式参考模型或性质证明；
6. 没有持久化、网络、数据库、线程、Aeron 或高可用；
7. evidence 不声明吞吐、延迟、恢复或生产就绪。

官方 tag CI 产出的静态 `manifest.json` SHA-256 是：

```text
a9cfe568883c02c9b4816095cf1bbc11fbd6166f19936141d7bdad46cd942dc2
```

你本地重新运行 `m01Evidence` 时，整个 manifest hash **预期会不同**，因为其中的 `generatedAt` 和 Java/OS/arch 环境是本次运行事实。应固定比较的是 claim 指向的原始 artifact hash、source commit、claim/limitation 集合以及 tag CI 身份；上面的 manifest hash 专指博客托管的那一份 CI evidence，不是跨机器 Golden。

## 浏览器 Lab 负责解释，Java judge 才负责裁决

[M01 Matching Lab](/signal-grid-blog/practice/high-availability-cex/m01/lab/) 把两个模式隔离开：

- `JAVA_GOLDEN_REPLAY` 只读取已发布的 scenario、事件报告、canonical history 和 manifest，逐命令解释固定 Java evidence；
- `BROWSER_MODEL` 在页面内用有界 `BigInt` 状态做预测练习，最多执行固定数量的 GTC 限价命令。

网页不会上传源码，不编译或执行 Java，不连接远程 Judge、账户或外部服务。浏览器模型即使给出了与固定示例相同的事件，也只说明这次推演结果；它没有 core 架构门禁、fresh JVM、semantic mutant、clean Git identity 或 tag CI，因此绝不能输出或冒充 `PASS`、`STUDENT_FAILURE`、`SYSTEM_ERROR`。

真正的验收路径始终在读者本地：Java 25 编译 → Gradle 测试 → `m01Check` → 课程发布者的 clean-tree evidence。Lab 的作用是让你能逐步解释证据，不是把 TypeScript 动画伪装成撮合器。

## 停止点：复核官方结果，不越过 M01 的保证边界

若要复核已发布参考实现，使用一个全新 clone 或 clean worktree，避免让本地课程练习污染证据身份：

```bash
git clone https://github.com/lcha-reln/cex-matching.git cex-matching-m01-audit
cd cex-matching-m01-audit
git switch --detach course/m01-complete

test "$(git rev-parse HEAD)" \
  = "be2e3b8e5db4959c5639d7aa3e7314dbac45d82b"
test "$(git cat-file -t course/m01-complete)" = tag

./gradlew spotlessCheck clean build m01Check \
  --no-daemon \
  --rerun-tasks

test -z "$(git status --porcelain --untracked-files=normal)"
```

课程发布者还可以在这个 clean checkout 中重新生成一份**本地环境 evidence**：

```bash
./gradlew m01Evidence \
  -Pm01.unitTag=course/m01-complete \
  --no-daemon \
  --rerun-tasks

jq -e '
  .source.commit == "be2e3b8e5db4959c5639d7aa3e7314dbac45d82b" and
  .source.dirty == false and
  .unitTag == "course/m01-complete" and
  ([.claims[].id] | length) == 7 and
  (.limitations | length) == 7
' build/lab-evidence/M01/manifest.json
```

最后对博客托管的 CI evidence 做只读复核。macOS 使用 `shasum`：

```bash
curl -fsS \
  https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m01/evidence/manifest.json \
  -o /tmp/m01-ci-manifest.json

test "$(shasum -a 256 /tmp/m01-ci-manifest.json | cut -d ' ' -f 1)" \
  = "a9cfe568883c02c9b4816095cf1bbc11fbd6166f19936141d7bdad46cd942dc2"

jq -e '
  .source.commit == "be2e3b8e5db4959c5639d7aa3e7314dbac45d82b" and
  .unitTag == "course/m01-complete" and
  .productRelease == null and
  ([.claims[].id] == [
    "m00-input-regression",
    "price-time-priority",
    "matching-event-batches",
    "quantity-and-book-invariants",
    "deterministic-event-history",
    "semantic-mutants",
    "architecture-boundary"
  ]) and
  (.limitations | length) == 7
' /tmp/m01-ci-manifest.json
```

到这里，M01 的 GREEN 可以精确解释为：固定 `BTC-USDT` GTC scenario 的价格时间优先事件、批末盘口和 BigInteger 不变量全部匹配；100 次 fresh replay 只有一个 `M01H1`；三个指定 semantic mutant 被 `STUDENT_FAILURE` 杀死；系统异常失败关闭；官方 annotated tag、manifest 与完成提交由 tag CI 对齐。

它仍不是可撤单订单生命周期，不是生成式模型证明，不是持久化撮合器，也不是 Aeron 三节点高可用系统。`course/m01-complete` 是课程单元完成身份，manifest 的 `productRelease` 仍为 `null`。本篇就在这条边界停止，不提前实现 M02 或 M03。
