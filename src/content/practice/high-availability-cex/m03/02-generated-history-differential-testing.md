---
title: "M03·02：把随机测试变成可复现的 256×64 生成历史"
description: "冻结 SplitMix64、seed 派生、四个 coverage lane 与逐命令性质顺序，让生产撮合器在 16,384 个边界上和独立参考模型精确对拍。"
date: 2026-08-28T16:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M03
lessonOrder: 20
permalink: generated-history-differential-testing
tags:
  - 撮合引擎
  - 生成式测试
  - SplitMix64
draft: false
---

> 动手时仍从 annotated [`course/m03-start`](https://github.com/lcha-reln/cex-matching/tree/course/m03-start) 建练习分支，并把本篇当作 M03 中段；教程发布的固定完成坐标则是 annotated [`course/m03-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m03-complete)，完成 commit 为 `dab4a2a1dccf06d6b9769c979a6ae5af6d1d2bdc`，`matching-0.1.0` peeled 到同一 commit。生成器与测试工具的完成源码可在 [matching-testkit](https://github.com/lcha-reln/cex-matching/tree/course/m03-complete/matching-testkit) 复核。

上一篇建立了 production candidate、linear reference 与 event-derived ledger 三条观察路径。它们在手写历史上互相校验，但命令空间仍然很窄。把 `Random` 塞进循环、跑几万次，看似就能扩大覆盖；一旦 CI 上失败，我们却可能拿不到同一条历史，甚至无法回答失败前究竟执行过哪些命令。

生成式测试的价值不来自“随机”二字，而来自一份可以复核的实验合同：**输入域、伪随机算法、seed 派生、覆盖分层、命令顺序、状态隔离和输出字节都被冻结；任意失败都能由一条完整历史重新构造。**

本篇只证明这个命题。我们会实现 repository-owned `splitmix64-v1`，由十进制 base seed `6824` 生成 256 条 fresh-engine 历史，每条恰好 64 个命令；四个 lane 各 64 条历史，总计 16,384 个逐命令边界。完成后，production control 应在全部边界上同时通过独立性质和 exact differential，但根门禁仍不能发布：长达 64 条的失败历史还没有被缩小、持久化和严格重放。

## “固定一个 seed”仍不足以得到确定性历史

下面的测试并不真正可复现：

```java
Random random = new Random(6824);
for (int i = 0; i < 16_384; i++) {
  engine.apply(randomCommand(random, currentBook));
}
```

问题至少有四层：

- JDK `Random` 的选择、调用顺序与 bounded sampling 都没有被这段代码编码成课程自己的版本化字节合同；任一调用次数变化都会改写后续命令；
- `randomCommand` 读取 `currentBook` 时，候选缺陷会反向改变未来输入，production 与 reference 不再执行同一实验；
- 一个 engine 连跑 16,384 条命令，跨历史状态泄漏无法被识别，单条失败也难以定位；
- 只记录 seed，不能证明当时使用的是哪份配置、哪个派生规则和哪组前缀。

M03 把生成器当作仓库内的版本化协议，而不是测试帮助函数。权威 fixture 位于：

```text
matching-testkit/src/test/resources/m03/fixtures/property-suite-v1.json
```

它由 `matching.m03.generator.v1` 严格校验，冻结的 UTF-8 SHA-256 是：

```text
3e051347b9bd42aac431d02949c0c1b72daa667d10a03cc8aeb09a6b5a74d24e
```

loader 还拒绝未知字段、重复 lane、缺失 modulo、非整数 JSON token、越界配置和非法命令联合。一个更宽容的 parser 可能把 `64.0`、未知命令或多余字段静默归一化，从而让“同一 fixture”在不同实现里代表不同实验。

## 冻结 SplitMix64 与 history seed 派生

生成器只允许 `splitmix64-v1`。仓库自己实现状态推进、mix 函数和 bounded integer 取样，并用 known-answer tests 固定输出；它不调用墙钟、机器信息、环境变量、JDK `Random` 或安全随机源。

第 `historyIndex` 条历史的 seed 派生规则精确为：

```text
splitmix64(baseSeed + historyIndex).nextLong
```

注意这里有两层 generator：先用 `baseSeed + historyIndex` 初始化一个 SplitMix64，取它的第一个 64-bit 输出作为 history seed；再用这个 history seed 初始化该历史自己的命令 PRNG。`historyIndex` 从 0 开始，base seed 的十进制文本是 `6824`。

这个设计让第 173 条 history seed 只由 `(algorithm, baseSeed, 173)` 定位。完整命令历史仍由**整份冻结 profile**决定：命令数、lane modulo 与 prefix、随机域、权重和非法分支都是输入。给定同一完整 profile 后，调试第 173 条历史无需先消费前 172 条 history 的随机数；并行运行或只生成这一条也不会改变它的命令。

每条历史都保存 `historyIndex`、16 位十六进制 seed、lane ID 与 64 条完整 raw command。seed 是定位线索，命令才是实际实验输入。后续反例 artifact 不会要求 replay 端重新猜生成器版本。

## 四个 lane 解决纯随机最容易遗漏的稀有前缀

纯概率生成可能产生大量无效 Cancel、非交叉挂单和重复 ID，却迟迟凑不出“三笔命令刚好暴露同价 FIFO”的前缀。M03 不用手写 expected 解决这个问题，而是只手写**输入形状**。

历史按 `historyIndex % 4` 分配 lane，每 lane 恰好 64 条：

| lane | 固定前缀的因果结构 | 守住的风险 |
| --- | --- | --- |
| `BEST_PRICE` | 先挂 Ask 101，再挂 Ask 100，随后 BUY 102×2 | 跨价成交必须先吃更优价，而不是最后价或插入顺序 |
| `SAME_PRICE_FIFO` | 同价 Ask ID 1、2，随后 BUY 一次吃完两笔 | 同价 maker 必须按 acceptance sequence FIFO |
| `MAKER_PRICE` | Ask 99 后提交 BUY 102 | 成交价必须来自 maker 99，不是 taker limit 102 |
| `CANCELED_IDENTITY` | Place ID 1、Cancel ID 1、再次 Place ID 1 | CANCELED 身份不可复活，同 payload 也必须 Duplicate |

lane prefix 不包含一行 expected event 或 expected book。它只保证每一类关键因果关系在输入里出现；expected 仍由独立 linear reference 运行得到，第三 ledger 仍从 candidate 的公开事件独立推演。

这一区分十分重要。若把前缀和预期一起写成固定 Golden，M03 就只是把 M01/M02 corpus 重复了 64 次；若完全依赖均匀随机，稀有但关键的状态又可能没有稳定样本。stratified generation 介于两者之间：固定边界族，生成族内历史。

## 后缀扩大状态组合，但绝不观察候选状态

每个前缀之后补足到 64 条命令。冻结域是：

| 维度 | 取值 |
| --- | --- |
| 命令权重 | PLACE 65 / CANCEL 35 |
| instrument | `BTC-USDT`，或独立 1/32 分支上的 `ETH-USDT` |
| orderId | `1..32`，或独立 1/32 分支上的 `0` |
| side | `BUY | SELL`，或独立 1/32 分支上的 `HOLD` |
| priceTicks | `98..102`，或独立 1/32 分支上的 `0` |
| quantityLots | `1..5`，或独立 1/32 分支上的 `0` |

“每个 raw field 独立 1/32 非法”意味着一条 Place 可能同时有多个非法字段。这样能持续回归 M00 冻结的验证优先级。orderId 域故意很小：随着历史推进，生成器自然会撞上 active duplicate、FILLED duplicate 和 CANCELED duplicate，正好施压 M02 生命周期。

生成器唯一不做的事，是问 engine：“现在有哪些订单？”下面这种代码被合同禁止：

```java
// 错误：候选的状态决定了后续输入
long orderId = engine.activeOrderIds().isEmpty()
    ? nextFreshId(random)
    : choose(engine.activeOrderIds(), random);
```

如果一个 ghost-book mutant 多保留一笔订单，它会令后续命令不同；production 和 reference 就不再是同一历史上的差分实验。正确生成器是纯函数：`profile → histories`，不持有 candidate/reference/ledger，也不读取任何执行结果。

## 把生成命令编码成 M03G1，而不是相信对象相等

两次 `List.equals` 相等只能证明当前 JVM 对象相等，不能冻结跨工具的字节身份。`M03CommandCanonicalizer` 因此把整套输入编码成 UTF-8/LF 的 `M03G1`：

```text
M03G1|algorithm=...|seedDerivation=...|baseSeed=...|histories=...|commandsPerHistory=...
M03H1|history=...|seed=...|lane=...|commands=64
M03C1|history=...|command=...|type=PLACE|instrumentId=...|orderId=...|...
```

字符串使用 UTF-8 字节长度前缀，history 与 command index 显式写入；所有 raw 字段都参与 digest。编码中不允许主机路径、时间、Git 元数据、类名和对象 `toString()`。

完成实现后，生成器门禁要执行两次完整 fresh generation，并同时断言：

```text
histories                 = 256
commands per history      = 64
command boundaries        = 16,384
each lane                 = 64 histories
first canonical bytes     = second canonical bytes
first digest              = second digest
distinct digests          = 1
```

完成阶段的权威报告已经冻结这份输入：`M03G1` digest 为 `sha256:1920d6b8a480998825c72636d446854d9e795e91b0ab29520f203b12186979ce`，共 16,641 行、1,682,592 bytes。它们是 `course/m03-complete` 上 fresh generation 的结果，不是合同开始时预猜的常量；可以在 [`generated-properties.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/generated-properties.json) 中交叉核对。

## 每条 history 都从三份 fresh state 开始

生成完成后，judge 的外层循环应保持这个形状：

```java
for (M03GeneratedHistory history : histories) {
  M03Candidate candidate = candidateFactory.create();
  ReferenceMatcher reference = new LinearReferenceModel();
  M03EventLedger ledger = new M03EventLedger();

  for (ReferenceCommand command : history.commands()) {
    SemanticOutcome expected = reference.apply(command);
    SemanticOutcome actual = candidate.apply(command);
    ledger.verifyAndApply(command, actual);
    compareExactly(expected, actual);
  }
}
```

fresh-state 有两个作用。第一，lane prefix 才能确切地从 sequence 1 开始构造目标边界；第二，history N 的失败不会污染 N+1，重放单条 history 与全量运行的语义一致。这里的“同一历史”始终指完整 profile 与 history index 的组合，不是脱离 profile 单独解释一个 seed。

不能只 fresh production、复用 reference；也不能只 fresh 两个 engine、复用 ledger。三条路径的生命周期必须同起同止。factory 构造、candidate 执行、reference 或 judge 的非预期异常都属于 `SYSTEM_ERROR`，不能偷偷跳过该 history 继续统计 PASS，也不能因为“测试变红”就冒充一个被杀死的业务 mutant。

## 性质检查必须在差分之前给出可缩小的指纹

对每条命令，裁判按固定顺序检查：

1. PLACE/CANCEL 的事件语法与字段对应；
2. Trade 正量、双方 remainder 上界和每单数量分区；
3. 价位排序、同价 sequence FIFO、非空价位、正余量和无交叉；
4. event ledger 的 RESTING 集合与 full-depth book 双射，终态不在簿且不可复活；
5. production/reference ordered events 精确相等；
6. production/reference `bookAfter` 精确相等。

为什么不是先 `assertEquals(expected, actual)`？因为 shrink 需要稳定回答“同一个错误还在不在”。若所有差异都只有 `AssertionError: objects differ`，一个删除步骤可能把“maker 顺序错”换成“生命周期复活”，shrinker 仍会把它误认为保留了错误。

M03 用 `propertyId/divergenceKind` 形成 fingerprint。例如：

```text
PRICE_TIME_PRIORITY/WRONG_MAKER_ORDER
MAKER_PRICE/TRADE_PRICE
QUANTITY_PARTITION/TRADE_EXCEEDS_REMAINDER
BOOK_LIFECYCLE_BIJECTION/ACTIVE_ID_SET
LIFECYCLE_IRREVERSIBILITY/TERMINAL_OR_ACTIVE_ID_REUSED
```

异常文本只用于诊断，不参与身份。命令 index、history ID、seed、失败 command、expected 和 actual 则组成可持久化的首次分歧上下文。

## Worked example：一条 FIFO lane 怎样穿过 64 个边界

取 `historyIndex=1`，它属于 `SAME_PRICE_FIFO`。前三条前缀先让 ID 1、2 在 Ask 100 排队，再由 ID 3 的 BUY 100×2 依次成交。第三条边界应同时得到：

| 观察者 | 关键观察 |
| --- | --- |
| production | 两条 Trade 的 maker ID 是 1、2，最后 book 为空 |
| reference | flat list 全扫描时，同价下 sequence 1 优先于 2 |
| ledger | 第一条 Trade 前最佳 maker 是 1；扣量后第二条才轮到 2 |

接下来的 61 条命令不根据空盘口“智能生成”。它们由该 history seed 继续产生，可能重新挂单、成交、撤单、重复使用 ID，或提交多个字段同时无效的输入。每个边界都保留前三条造成的历史身份，因此后缀能组合出固定 corpus 很难手写穷尽的路径。

如果 LIFO mutant 在第三条失败，judge 记录的是这条 history 到首次分歧为止的完整上下文；但原始 artifact 仍保留 64 条生成命令。下一篇的 shrink 才负责证明后面哪些命令、前面哪些铺垫和哪些 raw scalar 与同一 fingerprint 无关。

## 运行本篇门禁，并准确解释 GREEN

实现 generator、canonicalizer 与全量 property test 后运行：

```bash
./gradlew :matching-testkit:test \
  --tests '*M03GeneratorProfileTest' \
  --tests '*M03HistoryGeneratorTest' \
  --tests '*M03PropertyJudgeTest' \
  --no-daemon

./gradlew clean build --no-daemon
./gradlew m03Check --no-daemon
```

沿着教程逐篇实现时，本篇阶段的正确分层结果是：

| 门禁 | 本篇终点 |
| --- | --- |
| strict profile 与负向 Schema probes | GREEN |
| 两次 fresh generation / 256×64 / 四 lane | GREEN |
| production/reference/ledger 16,384 边界 | GREEN |
| M00～M02 累计回归 | GREEN |
| shrink、persist、one-minimal、strict replay | 留给下一阶段，此时尚未完成 |
| 完整 `m03Check` 与 release evidence | 此时仍应 RED |

16,384 次 PASS 的准确含义是：**在这一份冻结、有界、分层生成套件内**，生产公开结果与独立 reference 一致，第三 ledger 的性质也没有发现违规。它不是所有命令历史的穷尽证明，更不是形式化验证、模糊测试覆盖率、性能测试或生产就绪声明。

发布 bundle 已把生成配置与性质结果放在固定 evidence 路径：[`property-suite-v1.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/inputs/property-suite-v1.json) 与 [`generated-properties.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/generated-properties.json)。M03 Lab 只加载同一 manifest 列出的反例场景；浏览器不运行这套 Java generator，也不把前端回放冒充生成式裁判。

## 练习：改变分布，不改变可复现协议

在个人实验分支上把 Place/Cancel 权重改为 50/50，保留四个 lane prefix。你应该观察到：fixture SHA、M03G1 bytes 和 digest 全部变化，但同一新配置生成两次仍逐字节一致。随后恢复冻结 fixture；不要把实验配置提交成 M03 合同。

再写一个错误生成器，让 Cancel 优先选择 candidate 当前活动 ID。把 ghost-book mutant 放进去，比较 production 与 reference 最终收到的命令是否仍一致。这个实验会说明“更聪明地命中状态”为什么反而破坏差分的实验控制。

最后只运行某一个 history index，再从全套运行中取同一个 index 比较 64 条命令。若字节不同，检查 seed 是否依赖了全局 PRNG 消费位置，或 lane prefix 是否意外消耗随机数。

## 停止点：广泛失败可以被找到，但还不能被交付

到这里，M03 已把四个边界族扩展成 256 条确定性 fresh history，让 production、linear reference 与第三 ledger 在 16,384 个命令边界逐一交叉验证。我们获得了稳定的“发现错误”能力，却还没有把一条 64 命令失败变成读者能理解、Schema 能校验、CI 能严格重放的反例。

不要用日志截取失败附近几行，也不要只保存 seed。下一篇只解决一个新问题：**怎样在每次都重建三份 fresh state 的前提下，用 deterministic ddmin、单命令 fixed point 和 scalar simplification 保持同一 property fingerprint，并把反例完整持久化为 `matching.m03.counterexamples.v1`。**按学习过程，本篇结束时应保留阶段性 RED；整套 M03 的发布结论则以正文固定的 `course/m03-complete`、同 commit 的 `matching-0.1.0` 与 clean-tree evidence 为准。
