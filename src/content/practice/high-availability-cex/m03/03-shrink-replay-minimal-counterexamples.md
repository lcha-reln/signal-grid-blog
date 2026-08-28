---
title: "M03·03：把 64 条失败历史缩成可严格重放的最小反例"
description: "以稳定 property fingerprint 驱动 fresh-state ddmin、单命令 fixed point 与 scalar simplification，完整持久化并复验 one-minimal 反例。"
date: 2026-08-28T17:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M03
lessonOrder: 30
permalink: shrink-replay-minimal-counterexamples
tags:
  - 撮合引擎
  - 反例缩小
  - 确定性重放
draft: false
---

> 本篇继续在 [`course/m03-start`](https://github.com/lcha-reln/cex-matching/tree/course/m03-start) 派生的练习分支上推进；发布正文固定到 annotated [`course/m03-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m03-complete)，完成 commit 为 `dab4a2a1dccf06d6b9769c979a6ae5af6d1d2bdc`，产品 tag `matching-0.1.0` peeled 到同一 commit。shrinker、持久化与 replay 的完成源码可在 [matching-testkit](https://github.com/lcha-reln/cex-matching/tree/course/m03-complete/matching-testkit) 复核。

上一篇建立了能在 256×64 套件中定位首次业务分歧的 generator 与 judge。本单元合同还冻结了六个 required mutant；本篇先让这些命名 factory 驱动 shrink 与 replay，下一篇再汇总证明六项全都被主门禁杀死。裁判现在能回答“哪一条 history 的哪一个 command 首先破坏了哪项性质”，但直接交付一条 64 命令历史仍然很糟：大多数命令与失败无关，多个状态路径交叠，读者很难看出真正的因果前缀，未来回归也要背负大量噪声。

把日志里失败附近的三行复制出来并不等于缩小。撮合状态是路径相关的：被撤订单必须先成功接受，maker FIFO 依赖 acceptance sequence，Duplicate 依赖更早的身份历史。删掉一条看似无关的命令，后面所有 sequence、余量和终态解释都可能变化。

本篇只证明一个命题：**反例缩小必须把“从 fresh state 重放后仍得到同一个业务 fingerprint”作为唯一 predicate，并把缩小、持久化、one-minimal 验证和 strict replay 组成一条闭环；任何异常都不能被当作成功缩小。**

完成本篇后，每个 required mutant 的原始生成历史都应缩成非空、严格更短的历史，保存完整命令与 reference outcome，并经 Schema 重新读取后复现同一 `STUDENT_FAILURE` fingerprint。根发布门禁仍然不应提前通过：六项 mutant 汇总、clean-tree evidence、完成 tag 和产品 tag 留给最后一篇。

## Shrink 的目标不是“还会失败”，而是“还是这个错误”

假设原始历史首先得到：

```text
classification  = STUDENT_FAILURE
propertyId      = PRICE_TIME_PRIORITY
divergenceKind  = WRONG_MAKER_ORDER
fingerprint     = PRICE_TIME_PRIORITY/WRONG_MAKER_ORDER
```

删掉一些命令后，候选也许会在更早处因为重复 ID 复活而失败。如果 predicate 只检查 `classification == STUDENT_FAILURE`，shrinker 会接受这个更短历史，并宣称已经缩小 FIFO 错误；实际上错误种类已经换了。

正确 predicate 至少冻结三项：

```java
boolean preservesFingerprint(List<ReferenceCommand> trial) {
  Observation observation = judgeFresh(trial, mutantFactory);
  return observation.classification().equals("STUDENT_FAILURE")
      && observation.failure().fingerprint().equals(requiredFingerprint);
}
```

这里刻意不冻结原 command index。删除无关前缀后，首次失败位置理应前移；真正要保留的是业务性质与分歧类型。也不使用异常 message：文案、数字详情和 collection 输出很容易变化，它们不应成为错误身份。

`PASS` 表示当前 trial 已不再暴露目标错误，因此拒绝该缩小；`SYSTEM_ERROR` 则不是普通的 predicate false。它说明 candidate、reference、parser 或 judge 没有完成业务判断，整个 shrink 门禁必须失败关闭并报告系统问题，不能悄悄尝试下一个候选。

## 每次 trial 都必须重建 candidate、reference 与 ledger

错误做法是在已经跑到失败的 engine 上删除命令，再继续执行剩余命令：

```text
live state: 已执行 A B C D，并在 D 失败
trial:      删除 B，继续从 live state 执行 A C D
```

这不是 `A C D` 的执行。B 留下的订单、sequence 或终态仍在 live state 中，所谓“更短反例”没有任何可重放含义。

每个 trial 必须完整执行：

```text
new mutant candidate
new LinearReferenceModel
new M03EventLedger
replay trial command[0..n)
classify first divergence
discard all three states
```

factory 不能返回缓存实例；reference 与 ledger 也不能藏在 shrinker 字段里。测试要用一个带实例计数的 candidate factory，确认 trial 次数与 fresh candidate 构造次数一一对应。

这种实现更慢，却把 shrink 变成纯函数意义上的实验：同一命令列表和同一 mutant factory 总能产生同一 classification/fingerprint。M03 的范围只有六条 64 命令历史，正确性比复用状态的微小速度收益重要得多。整个 shrink（包括初始验证、缩小与 one-minimal 复验）共享一个冻结上限 `MAX_TRIALS = 50_000`；到达预算必须失败关闭，不能返回一个尚未复验的结果。

## 阶段零：先裁掉首次分歧后的后缀

judge 已经给出 first failing command index。既然 M03 只保留**首次**分歧 fingerprint，那么它之后的命令不可能反向改变这次首次分歧；真正的实现会先把 64 条历史裁成 `commands[0..firstFailure]`，再用 fresh predicate 验证该前缀仍得到同一 fingerprint。

```text
firstFailure = originalObservation.commandIndex
prefix = original[0 .. firstFailure inclusive]
current = preservesFingerprintFresh(prefix) ? prefix : original
```

这不是凭日志截取附近几行。失败命令之前的完整因果前缀仍被保留，而且裁切本身也必须重新创建 candidate、reference 与 ledger 后接受；如果连这个验证都出现 `SYSTEM_ERROR`，整个 shrink 立即停止。

## 第一阶段：deterministic chunk deletion 找到因果骨架

第一阶段使用确定性 ddmin。它不从单条命令开始，而是把当前历史按连续 chunk 切分，依次尝试删除每一块；只要某个删除后的 trial 保持同一 fingerprint，就接受它并重新开始当前粒度。

教学版伪代码如下：

```text
current = verified failing prefix
partitions = 2

while current can still be partitioned:
  chunks = contiguousChunks(current, partitions)
  accepted = false

  for chunk in chunks from left to right:
    trial = current without chunk
    if trial is non-empty and preservesFingerprintFresh(trial):
      current = trial
      partitions = max(2, partitions - 1)
      accepted = true
      break

  if not accepted:
    if partitions == current.size: break
    partitions = min(current.size, partitions * 2)
```

真正冻结的不是某篇文章里这一版循环语法，而是行为：连续 chunk、稳定的从左到右尝试顺序、fresh-state predicate、同一 fingerprint、非空结果和共享的 50,000 次 trial 预算。不要用并行 future 竞争“第一个成功删除”的块；线程调度会改变最终反例，即使多个结果都能失败。

chunk deletion 擅长一次移除大段后缀或无关交易片段。例如目标错误在 lane prefix 已经暴露，后面的生成后缀通常可以整块删除；若错误依赖后缀制造的终态，ddmin 则会保留那条因果路径。

## 第二阶段：single-command deletion 到 fixed point

ddmin 找到骨架后，再按 index 从左到右尝试删除一条命令。只要删除成功，就接受新历史并从 index 0 重新扫描：

```text
repeat:
  changed = false
  for i in 0 .. current.size-1:
    trial = current without command i
    if trial is non-empty and preservesFingerprintFresh(trial):
      current = trial
      changed = true
      break
until not changed
```

“成功后从头开始”很关键。删除后，原 index 已不再指向相同命令，而且一次删除可能让更早命令也变得冗余。只扫一遍会得到依赖初始索引的结果，不能称为 fixed point。

这一阶段结束时，没有任何**单条命令删除**能保留目标 fingerprint。它仍不保证全局最短：也许必须同时替换两条命令才能再删一条，或另一条完全不同的历史更短。M03 只声明相对于冻结 shrink 操作的 1-minimal，不宣称求解了最小程序问题。

## 第三阶段：按固定字段顺序做 scalar simplification

命令数量已经不能单删，不代表 raw 数值已经清楚。orderId 27、price 102、quantity 5 可能都能简化；无关数值会让读者误以为它们是触发条件。

M03 最后按确定性字段顺序尝试 scalar simplification：

```text
instrumentId → orderId → side → priceTicks → quantityLots
```

候选值也属于 one-minimal 的定义，不能留给实现者自由发挥：

| scalar 类型 | 冻结候选顺序 |
| --- | --- |
| 非空字符串 | 只尝试空字符串 `""`；原值已为空则没有候选 |
| 非零整数 | 先 `0`；当绝对值大于 1 时再尝试同号的 `+1/-1`；随后尝试向零截断的 `value / 2`，但只有其绝对值仍大于 1 才登记 |

整数候选使用保持插入顺序的去重集合，并移除与原值相同的项。外层先按 command index 从小到大扫描，再按上面的字段与候选顺序扫描；不能遍历无序 `HashSet`，也不能从 candidate 状态挑“当前更合适”的值。每次只修改一个 scalar，然后从 fresh 三路径完整重放；若同一 fingerprint 保留，则接受新值。

接受 scalar 后不能只继续改下一个 scalar。数值简化可能令某条更早的命令变得可删，因此真实循环会回到 single-command deletion，从 index 0 再扫；只有单删失败时才再次尝试 scalar。直到两类单步操作都无法前进，才进入 one-minimal 复验。

这里有两个容易混淆的边界：

- simplification 可以改变首次失败的 command index 和 expected/actual 详情，只要 fingerprint 相同；
- simplification 不能把 schema-valid raw command 改成 parser 根本不能表示的对象，Schema 边界必须始终保留。

完成阶段的权威报告记录每个 mutant 的 trial 数和最终 one-minimal 结果。下面会直接列出发布 evidence 的实际值；算法设计阶段不应预言这些结果，也不能把一次未绑定 tag 的本地输出写成合同。

## Worked example：用候选删除解释 ghost-book 的路径依赖

考虑一条**仅用于解释算法、不是官方最小反例**的历史片段：

```text
A: invalid PLACE，验证拒绝
B: PLACE id=7 BUY 99 × 3，进入 RESTING
C: PLACE id=8 SELL 102 × 1，进入另一侧但不成交
D: CANCEL id=7，成功 Canceled
E: CANCEL unknown id=31
```

`M03-CANCEL-GHOST-BOOK` 会把 D 的 `bookAfter` 错误地返回为撤单前盘口。shrinker 可能提出：删除 E、删除 A、删除 C、简化 B 的 quantity，或改变 B 的 price。每一个提案都必须由 fresh judge 决定；文章不能凭肉眼把其中某条宣布为可删，因为实际 fingerprint 的检查顺序和 book 内容才是权威。

尤其不能只截取 D。没有 B，ID 7 从未 RESTING，D 会变成 `ORDER_NOT_FOUND`，ghost-book mutation 根本没有触发。这个例子说明最小反例不是“失败命令”，而是**建立前置状态并触发首次分歧的最小可执行历史**。

在练习中给每次 trial 记录：候选命令列表、classification、fingerprint、是否接受、fresh candidate ordinal。最终 trace 应能解释每一步为何删除，而不是只留下一个神秘结果。

## Persist：保存可执行事实，不只保存 seed 或 stack trace

六项反例共同写入严格的 `matching.m03.counterexamples.v1`。每项至少必须完整保存：

- mutant ID、原 `historyIndex`、lane 与 seed；
- 原始 64 条 generated command，保证来源可审计；
- 缩小后的完整、非空 command history；
- original length、minimized length 与 shrink trial 数；
- 冻结的 `propertyId`、`divergenceKind` 和组合 fingerprint；
- 缩小历史每一步由 independent reference 产生的完整 ordered events 与 full-depth `bookAfter`；
- 首次失败处 candidate 的 actual outcome；
- one-minimal 检查结论和它验证的操作集合。

只保存 seed 不够：未来生成器版本变化时，seed 可能指向不同输入。只保存 exception 也不够：`STUDENT_FAILURE` 本来就不应该依赖异常。只保存最终 expected/actual 则丢失了构造前置状态的每一步。

这里要区分两层原子性。`m03Check` 开始时先清理固定输出名，在内存中收齐六项；需要从 bytes 做 strict replay 时，单个 artifact 通过临时文件原子替换。若后续 Schema、语义或 replay 失败，runner 再清掉固定输出，只留下最小三态失败 `check.json`，不能让新旧报告拼成一个看似完整的 PASS 集合。

真正的**目录级 staging + publish** 属于最后一篇的 `M03EvidenceWriter`：它在 fresh `m03Check` 通过后把输入、九份业务报告和 `check.json` 复制到 staging bundle，完成 manifest、Schema、语义与哈希复核后再发布整个 evidence 目录。不要把 runner 的逐文件 atomic write 与 evidence bundle 的目录 staging 写成同一种机制。

## Strict replay：重新过 Schema，不信内存中的对象

shrinker 刚刚返回 Java records 后立刻再调用一次 judge，只能证明同一进程内对象可重放。strict replay 要从已写出的 JSON bytes 开始：

1. 用 `matching.m03.counterexamples.v1` 严格校验并解析 artifact；
2. 按冻结 profile 重新生成 256 条历史，用 `historyIndex` 核对原始 64 条命令、lane 与 seed；
3. 检查六个 mutant 身份、顺序、长度关系和 one-minimal 字段；
4. 从文件中的 minimized commands 创建 fresh candidate/reference/ledger；
5. 重新计算 reference 的每一步 outcome，并与持久化 expected 精确一致，同时核对首次 actual outcome；
6. 重新运行对应 mutant，在同一 `propertyId/divergenceKind` 处得到 `STUDENT_FAILURE`；
7. 从持久化 original history 再执行冻结 shrink，要求最小命令、trial count 与 one-minimal 结果逐项一致；
8. 在这条反例闭环之外，runner 还会单独校准 throwing control 为 `SYSTEM_ERROR`；它不属于六项 persisted counterexample，也不能进入成功计数。

这样可以抓住序列化器漏字段、顺序漂移、宽容 parser、旧文件复用和“只在 shrink 进程的 live state 上能失败”等问题。

完成态还会把六项反例规范编码成 `M03X1`。该格式只包含版本化业务字段、显式顺序、长度框定的文本和 LF；不得写入绝对路径、Java 类名、墙钟、Git 元数据或对象 `toString()`。两次从同一 counterexample artifact canonicalize 必须逐字节相等。发布报告冻结的 `M03X1` digest 是 `sha256:3c23c1f08975d9ad57260d8a16a8201710ee7f56671824648e4e32c477afcac1`，共 513 行、54,088 bytes。

## One-minimal 是可执行声明，不是一个布尔装饰

`"oneMinimal": true` 只有在可执行门禁重新验证后才有意义。第一次枚举发生在 shrinker 交付结果前；`m03Check` 把它持久化后，strict replay 还会从 original bytes 重新运行冻结 shrink，并要求命令、trial count 与该声明一致。对最终 history，shrinker 必须枚举：

- 每一种单命令删除；
- 每一个按冻结规则注册、且确实改变值的单 scalar simplification。

每个 trial 都从 fresh state 运行；没有一个能以同一 fingerprint 得到 `STUDENT_FAILURE`。任一 trial 得到 `SYSTEM_ERROR`，检查失败关闭；不能因为“它没有返回相同 fingerprint”就把 one-minimal 记为 true。

这项声明仍有精确边界：它只覆盖登记的一步变换，不证明任意两步组合、命令重排或另一 seed 空间里不存在更短反例。报告和教程都应使用“one-minimal under the frozen shrink operators”，而不是“数学上最短”。

## 运行本篇门禁并检查反例闭环

实现 shrinker、Schema、writer 与 replay 后，先运行聚焦测试：

```bash
./gradlew :matching-testkit:test \
  --tests '*M03*Shrink*Test' \
  --tests '*M03*Counterexample*Test' \
  --tests '*M03*Replay*Test' \
  --no-daemon

./gradlew clean build --no-daemon
./gradlew m03Check --no-daemon
```

不要把示例中的测试类通配符当成证据字段；最终以仓库实际测试名与 `check.json` 为准。本篇阶段至少要能从报告交叉核对：

```text
required counterexamples = 6
each original length     = 64
each minimized           = non-empty and strictly shorter
each classification      = STUDENT_FAILURE
each fingerprint         = preserved across find/shrink/replay
each one-minimal         = true under frozen operators
strict schema replay     = completed for all six
```

发布 evidence 给出的六项结果如下，顺序与冻结 mutant 目录一致：

| mutant | minimized commands | shrink trials |
| --- | ---: | ---: |
| `M03-BEST-PRICE-LAST` | 3 | 246 |
| `M03-SAME-PRICE-LIFO` | 3 | 243 |
| `M03-TAKER-PRICE-TRADE` | 2 | 132 |
| `M03-TRADE-QUANTITY-OVERFLOW` | 2 | 72 |
| `M03-CANCEL-GHOST-BOOK` | 2 | 69 |
| `M03-CANCELED-ID-REUSE` | 3 | 148 |

六个原始 history 都是 64 条命令；最小长度依次为 `3/3/2/2/2/3`，trial 数依次为 `246/243/132/72/69/148`。[`replay.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/replay.json) 对六项都记录 `referenceOutcomesExact=true`、`actualOutcomeExact=true`、`provenanceExact=true`、`oneMinimalReverified=true`。这些布尔值分别约束 reference 结果、首次 candidate 分歧、原 history 来源和重新执行 shrink 后的 one-minimal 声明，不能互相替代。

固定 evidence 路径已经发布 [`counterexamples-v1.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/inputs/counterexamples-v1.json)、[`counterexamples.canonical.utf8`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/counterexamples.canonical.utf8) 与 [`replay.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/replay.json)。站点构建门禁验证它们被同一 manifest 列出且 SHA-256 一致；真正的来源身份仍由 `course/m03-complete`、完成 commit 与整包 manifest 共同建立，而不是由路径名建立。

## Completion problem：补全 chunk deletion 的 fresh predicate

课程练习只补 `deterministic chunk deletion` 的核心循环，接口会提供 immutable original history、required fingerprint、mutant factory 与 trial budget。你的实现需要满足：

1. 空 history 永不作为候选；
2. chunk 边界和尝试顺序固定；
3. 每个 trial 调用 fresh factory；
4. 只接受相同 fingerprint 的 `STUDENT_FAILURE`；
5. `SYSTEM_ERROR` 立即中止并保留稳定诊断；
6. 超出 trial budget 失败关闭，不返回未经验证的“最小”结果。

再做 independent variant：镜像 `CANCELED_IDENTITY` 的表面 side 和 price，但保留“先接受、成功撤销、同 ID 再 Place”的因果结构。验证 shrink 后 fingerprint 仍是生命周期不可逆，而不是价格或盘口排序错误。

[M03 Matching Lab](/signal-grid-blog/practice/high-availability-cex/m03/lab/) 已从同一反例 artifact 提供六个场景，让读者先预测首次分歧，再揭示 Java reference outcome。网页只重放已托管 corpus 和有界浏览器模型；它不会运行 shrinker，更不会把前端预测叫作 Java `PASS/STUDENT_FAILURE/SYSTEM_ERROR` 裁判。

## 停止点：反例已经可交付，产品身份仍未成立

到这里，长历史已经可以按同一业务 fingerprint 确定性缩小，完整保存，经 Schema 重新读取后从 fresh state 严格重放；one-minimal 也变成了可执行声明，而不是手写布尔值。

**沿着本篇阶段性分支学习时**，这些结果仍不足以创建 `matching-0.1.0`。最后一篇还要把六个 required mutant、throwing control、M00～M02 累计回归、reference/core 架构报告、M03X1 和 tag-first manifest 收敛成一份 release evidence。发布正文对应的这一步已经完成：annotated `course/m03-complete` 与 `matching-0.1.0` 均 peeled 到干净 commit `dab4a2a1dccf06d6b9769c979a6ae5af6d1d2bdc`。
