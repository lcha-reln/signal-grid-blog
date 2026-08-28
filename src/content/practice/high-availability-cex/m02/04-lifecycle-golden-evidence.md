---
title: "M02·04：用 Golden、独立账本与变异体证明订单不会幽灵化"
description: "把 10 场景 34 命令冻结为 M02H1 历史，以独立生命周期账本、100 次 fresh replay、四个 semantic mutant 和 tag-first evidence 为可寻址订单生命周期收口。"
date: 2026-08-28T15:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M02
lessonOrder: 40
permalink: lifecycle-golden-evidence
tags:
  - 撮合引擎
  - Golden Test
  - Mutation Testing
draft: false
---

前三篇已经分别让结果合同、可寻址撤单和不可逆终态变成了可运行实现，但“测试是绿的”还不是 M02 的完成定义。一个实现可能只在手写样例上撤对了订单，可能在撤掉中间节点后重排幸存者，也可能把异常当成变异体被杀死，甚至可能每次运行都输出一份看似合理、字节却不稳定的历史。

本篇只证明一个命题：**M02 只有在冻结输入、独立状态推演、确定性字节历史、语义变异和来源绑定五层证据同时闭合时，才有资格从“能运行”升级为“可复核”；任意一层都不能替另一层作证。**

教学顺序仍然是 `predict → inspect → run → falsify`。先预测一个有缺陷的实现会在哪条命令暴露，再检查裁判观察了什么，随后运行官方完成点，最后主动注入能骗过浅测试的错误。公开完成身份是 annotated [`course/m02-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m02-complete)，它 peeled 到完整提交 `b54b4dfb51b61a5041d60c50dc1ff3404d73b27d`。本篇引用的 [manifest](/signal-grid-blog/practice/high-availability-cex/m02/evidence/manifest.json)、[check.json](/signal-grid-blog/practice/high-availability-cex/m02/evidence/reports/check.json) 与 [M02H1 history](/signal-grid-blog/practice/high-availability-cex/m02/evidence/reports/canonical-history.utf8) 都绑定在这个完成点，而不是会继续变化的 `main`。

## 先预测：什么样的 PASS 才能回答“订单没有幽灵化”

在运行命令前，先给下面五个问题写出你认为需要的观察。不要回答“加一个单元测试”，要回答测试必须看见的业务事实：

| 风险                    | 只看成功返回为什么不够           | M02 必须留下的反证能力                                             |
| ----------------------- | -------------------------------- | ------------------------------------------------------------------ |
| 撤错同价节点            | `Canceled` 事件仍可能写着目标 ID | `bookAfter` 与后继 maker FIFO 都要精确一致                         |
| 撤单后留下幽灵节点      | 生命周期可能已标 CANCELED        | 终态 ID 必须从公开 resting book 消失，空价位也必须消失             |
| FILLED/CANCELED ID 复活 | 当前盘口可能仍为空               | 后续同 ID Place 必须稳定 Duplicate，且不消耗 sequence              |
| 重复 Cancel 再次成功    | 两次盘口都可能为空               | 第二次必须是 `ORDER_ALREADY_CANCELED`，不能重放成功事件            |
| 裁判自身崩溃            | 非零退出很像“抓到了错误”         | 业务不一致与基础设施异常必须分成 `STUDENT_FAILURE`、`SYSTEM_ERROR` |

这张表也解释了为何最终裁判不能只比较“最后一个 snapshot”。生命周期是路径相关事实：同一个空盘口既可能来自从未下单、完全成交，也可能来自成功撤单。只有逐命令输入、顺序事件、命令后完整盘口与独立历史身份一起被观察，才能区分这些路径。

再预测一次完成报告的形状。正确的 `m02Check` 至少要同时回答：冻结 corpus 是否还是原来的 10/34；M00/M01 是否回归；每条 Cancel 的 batch grammar 是否封闭；终态与数量分区是否成立；相同历史是否逐字节稳定；四个有意注入的业务错误是否都被业务断言杀死；异常 control 是否仍被识别为系统错误；core 是否继续留在无 I/O、无线程、无 Aeron 的架构边界内。

如果某份报告只有一个顶层 `"status": "PASS"`，却没有这些可交叉核对的事实，那么它只是结论，不是证据。

## 冻结 10/34 corpus：有限输入必须覆盖一条完整因果链

M02 的输入不是测试代码里临时拼出的对象，而是严格的 `matching.m02.scenario.v1` 文档。它恰好包含 10 个 fresh-engine scenario、34 条业务命令，其中 22 条 PLACE、12 条 CANCEL。每条命令同时冻结输入、顺序事件和 `bookAfter`；scenario 之间重新创建 engine，scenario 内则保留完整路径状态。

先检查 [冻结 fixture](/signal-grid-blog/practice/high-availability-cex/m02/evidence/inputs/order-lifecycle-v1.json)，再给每个场景写一句它能够杀死的错误：

| 顺序 | scenario                                             | 命令数 | 主要证明义务                                                     |
| ---: | ---------------------------------------------------- | -----: | ---------------------------------------------------------------- |
|    1 | `invalid-cancel-does-not-mutate-or-consume-sequence` |      4 | 非法 Cancel 不读写生命周期，也不消耗 acceptance sequence         |
|    2 | `cancel-only-resting-order-removes-level`            |      2 | 撤掉唯一挂单后不遗留空价位或幽灵订单                             |
|    3 | `cancel-middle-preserves-fifo`                       |      5 | 中间撤单只删目标，两个幸存 maker 保持原相对顺序                  |
|    4 | `cancel-partially-filled-remainder`                  |      3 | 成交一部分后只撤当前余量，而不是原量或零                         |
|    5 | `cancel-unknown-order`                               |      2 | unknown Cancel 返回 NOT_FOUND，却不为该 ID 建 tombstone          |
|    6 | `late-cancel-filled-order`                           |      4 | fully-filled maker 与立即全成 taker 都保留 FILLED 身份           |
|    7 | `repeat-cancel-stable`                               |      3 | 首次成功后，重复 Cancel 稳定观察 CANCELED 终态                   |
|    8 | `duplicate-active-order-id`                          |      3 | 活动 ID 的重复 Place 不改原订单，也不跳 sequence                 |
|    9 | `duplicate-filled-order-id-does-not-resurrect`       |      4 | FILLED ID 不能被重建，迟到 Cancel 仍看到 FILLED                  |
|   10 | `duplicate-canceled-order-id-does-not-resurrect`     |      4 | 与原 payload 逐字节相同也仍是 Duplicate，新 ID 才取下个 sequence |

这些场景不是十个平行功能点，而是一条递进因果链。前四个先证明“目标余量能从执行视图中正确消失”；第五个划清“未知”与“曾经接受”的身份边界；第六、七个建立两个终态；最后三个再用未来命令证明终态不会被遗忘。若删掉最后一次 Place 或 Cancel，前一条命令形成的错误可能暂时没有可见后果，测试就只证明了当下盘口，没有证明历史身份。

fixture 自身也需要失败关闭。完成裁判先校验 JSON Schema、固定 SHA-256、scenario/case 身份与精确计数，再运行 8 个负向 schema probe。这 8 个 probe 分别尝试：重复 `schemaVersion`、未知命令 `REPLACE`、Cancel 多余字段、Cancel 缺失 `orderId`、command 多余字段、把公开拼写改成 `CANCELLED`、把事件数组变空，以及把整数改成 `4.0`。它们不计入 34 条业务命令；它们证明 loader 不会在边界上静默宽容。

冻结值是：

```text
fixture sha256 = 7e0be70259dcf1b4b422d68742b5c24f1a4d11b05643e2d9e367b67733d4a90a
scenarios      = 10
commands       = 34
PLACE          = 22
CANCEL         = 12
schema probes  = 8
```

这里要区分两种“Golden”。fixture 中的 `expected.events` 与 `expected.bookAfter` 是人工冻结的业务 oracle；稍后生成的 M02H1 是实际运行历史的规范字节编码。若用生产 engine 现场生成 fixture expectation，再拿同一个 engine 比较，错误会同时出现在答案和实现里。M02 的 loader 读取已签入 expectation，生产 adapter 只负责把公开 Java 结果转成 testkit 语义值，两条路径不能合并。

## 独立账本证明可观察不变量，但不假装看见内部 Map

这是本篇最需要克制的证据边界。`M02ProductionCandidate` 只暴露两个方法：

```java
interface M02Candidate {
  Outcome place(PlaceLimitOrderInput input);
  Outcome cancel(CancelOrderInput input);

  record Outcome(List<Event> events, Book bookAfter) {}
}
```

adapter 调用真实 `SingleInstrumentMatchingEngine`，然后把 `MatchingEvent` 与 `OrderBookSnapshot` 完整转换为不可变 testkit 值。裁判没有通过反射读取生产 `ordersById`，也没有拿到生产 `OrderState` 对象引用。它只看一个真实调用者能看见的输入、事件和命令后盘口。

在每个 fresh scenario 中，`M02Assertions` 自己建立一份 `Ledger`。当 `Accepted` 出现时，它记录 sequence、ID、side、price 与 original quantity；每条 Trade 根据 maker/taker 更新 filled 与 remaining；合法 `Canceled` 把当前 remaining 转进 canceled；拒绝事件则必须与账本中“未知、FILLED、CANCELED”的事实相符。每条命令后都重新从返回盘口收集 active order，再检查：

```text
original = filled + remaining + canceled

ledger 中 RESTING ID 集合 = bookAfter 中全部 resting ID 集合
ledger 中 RESTING 字段    = bookAfter 中 sequence/side/price/remaining
ledger 中 FILLED/CANCELED = bookAfter 中不存在
```

它还用一份独立 `MutableBook` 从上一条 `bookAfter` 推演当前 Place 或 Cancel 的正确执行：最佳价、FIFO maker、maker price、`min(takerRemaining, makerRemaining)`、空价位删除和未成交余量入簿都由 testkit 自己计算。生产结果必须先逐字段等于 fixture expectation，再等于这条独立状态迁移的结果。

最终 [registry-invariants.json](/signal-grid-blog/practice/high-availability-cex/m02/evidence/reports/registry-invariants.json) 记录：

| 检查                      | 次数 | 它实际证明什么                                              |
| ------------------------- | ---: | ----------------------------------------------------------- |
| `registryBookBijection`   |   34 | 每条冻结命令后，独立账本 RESTING 集合与返回盘口节点一一对应 |
| `quantityPartition`       |   52 | corpus 中 52 个已接受订单时点都满足数量分区                 |
| `terminalAbsentFromBook`  |   26 | 被独立账本判为终态的观察时点没有公开挂单节点                |
| `bookStructureAndNoCross` |   68 | 命令前后盘口顺序、正余量、非空价位和不交叉保持成立          |

`lifecycleAuthority` 明确写成 `INDEPENDENT_TESTKIT_LEDGER`。这能证明：在冻结历史范围内，生产 engine 的可观察行为与“唯一生命周期账本 + resting book 视图”模型一致。它**不能单独证明**生产内部一定使用某种 `HashMap`、价位节点一定与 registry 保存同一个 Java 对象、平均撤单复杂度一定是 O(1)，也不能证明未进入 corpus 的任意历史。

源码架构门禁是另一层证据。它确认 20 个 `matching-core` source file 仍满足继承的无 I/O、无运行时适配器、无持久化、无 Aeron 边界，并检查 M02 所需的 Cancel surface 与当前实现入口存在；[architecture.json](/signal-grid-blog/practice/high-availability-cex/m02/evidence/reports/architecture.json) 的 `violations` 为空。但源码 token 门禁也不是对象别名证明，更不是性能测试。行为账本、源码边界和 core 自身 `assertConsistentState()` 各自回答不同问题，不应拼成一个超过观察能力的结论。

从 [lifecycle.json](/signal-grid-blog/practice/high-availability-cex/m02/evidence/reports/lifecycle.json) 还能核对 corpus 的业务总量：34 条命令中，19 次 Accepted、2 次字段验证拒绝、3 次重复 Place 拒绝、5 次 CancelRejected、5 次 Canceled 和 5 次 Trade；event-batch grammar、独立盘口迁移与生命周期迁移各检查 34 次。计数不是正确性的替代品，但它能防止“删掉困难 case 后报告仍 PASS”。

## 四个 history 外探针专门守住验证优先级

10/34 corpus 已经冻结，不能每发现一个边界风险就改 fixture、改 digest、再把过去称为同一份合同。但有一类风险必须与真实状态组合才能检查：输入同时无效且 orderId 已经存在时，engine 会先验证，还是先窥探生命周期？因此完成裁判增加 4 个 **out-of-history validation-priority probe**。它们参与 PASS，却不进入 M02H1：

1. 先接受 ID 9100，再提交同 ID、`side=HOLD`、price/quantity 为零的 Place；必须仍是 `Rejected(INVALID_SIDE, side)`，盘口不变，下一笔合法 Place 取得 sequence 2。
2. 先让 ID 9200 RESTING，再用 `ETH-USDT` Cancel 它；必须先报 `UNKNOWN_INSTRUMENT`，活动订单仍可被随后合法 Cancel 精确撤掉。
3. 先把 ID 9300 撤成 CANCELED，再用错误 instrument Cancel；必须仍先报输入错误，之后合法重复 Cancel 继续是 `ORDER_ALREADY_CANCELED`。
4. 先挂一笔订单，再用 `Long.MAX_VALUE + 1` 作为 Cancel ID；必须在 normalize 前报 `INVALID_ORDER_ID`，盘口和下一个 sequence 都不变。

这四项说明“验证先于生命周期”不是一行代码风格，而是状态独立性合同。假如 duplicate lookup 或 terminal lookup 先执行，同一份无效 payload 会因为内部是否曾见过该 ID 而得到不同结果；外部调用者便能用非法输入探测状态，M00 已冻结的验证优先级也会漂移。

为什么它们不写进 10/34？因为 10/34 是 M02 的稳定教学历史与可公开回放资源，任何增删都会改变 181 行 Golden；四个探针是裁判对冻结合同边缘的额外防线，它们不应该伪装成历史中的第 35 至 38 条命令。`check.json` 把两者分开记录：`scenarioCorpus.commands=34`，`lifecycle.validationPriorityProbes=4`。这让读者能准确知道摘要覆盖了什么，没有覆盖什么。

## M02H1 把语义变成字节，而不是把对象 toString 当历史

业务结果完全正确，仍可能因为不稳定遍历顺序、平台换行、默认字符集或对象 `toString()` 变化而无法复现。M02H1 因此不序列化 Java 类名、Map、主机路径或时间，而是逐层写入固定记录：

```text
M02H1  整份历史头，冻结 scenario/command 总数
M02S1  scenario 顺序与长度前缀 scenarioId
M02C1  command 索引、caseId、PLACE/CANCEL 及完整输入
M02E1  event 索引、精确事件类型与字段
M02B1  命令后 bids/asks 价位数
M02L1  side、level 索引、price 与订单数
M02O1  queue 索引、sequence、orderId 与 remaining
```

文本字段使用 UTF-8 字节长度前缀。例如第一条 scenario 是：

```text
M02S1|scenario=0|scenarioId=50:invalid-cancel-does-not-mutate-or-consume-sequence
```

`50:` 不是装饰。若以后字段允许分隔符或非 ASCII 字符，长度框定能让解析边界保持明确。每条记录固定使用 LF，最后一行也必须有 LF；UTF-8 BOM 被拒绝。事件顺序、价位顺序与队内顺序全部显式带 index，不能被集合默认遍历掩盖。

完整 Golden 的冻结事实是：

```text
format = M02H1
lines  = 181
bytes  = 17160
digest = sha256:32054d63accba99b19db823c41f74bda73dc3b8a009b528f2834d2bc70839d16
```

裁判首先把生产运行得到的字节与仓内 checked-in Golden 逐字节比较，同时检查 digest、行数、字节数、末尾 LF 和无 BOM。随后循环 100 次；每次都重新解析 fixture、重新创建每个 scenario 的 engine、重新执行命令并重新 canonicalize。100 次必须全部完成，字节必须与首轮完全相同，最终 `distinctDigests` 必须等于 1。

这比“同一个 engine 调 100 次 snapshot”严格得多。fresh parse 能暴露 loader 残留状态，fresh engine 能暴露跨 scenario 泄漏，逐字节比较能暴露顺序和编码漂移。另一方面，它仍然只证明这一个冻结 corpus 在当前受检实现与环境中的确定性；它不证明所有可能订单流，不证明 JVM 崩溃后可恢复，也不证明另一种语言实现天然得到相同业务状态。M03 才会引入独立生成式参考模型与更广的性质空间。

完成 evidence 生成后，可以先做一次不重新运行 Java 的静态检查：

```bash
wc -lc build/lab-evidence/M02/reports/canonical-history.utf8
shasum -a 256 \
  build/lab-evidence/M02/reports/canonical-history.utf8
```

在课程仓库本地，文件位于 `build/lab-evidence/M02/reports/`；发布后它被本站托管到固定的 `practice/high-availability-cex/m02/evidence/reports/` 路径。两边 artifact SHA-256 必须与 manifest 一致，而不是仅仅文件名相同。

## 四个 semantic mutant 回答“裁判真的会反对吗”

一个只会让正确实现 PASS 的裁判还没有证明辨别力。我们需要把“看起来很合理、业务上却错误”的实现送进去，确认共享断言能在预定命令第一次抓到它。M02 冻结四个 required mutant：

| mutant                         | 注入的错误                                         | 预期首个失败位置                                                                     | 为什么浅测试可能漏掉               |
| ------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------ | ---------------------------------- |
| `M02-CANCEL-WRONG-FIFO-ORDER`  | 撤掉中间节点后反转两个幸存 maker                   | `cancel-middle-preserves-fifo / cancel-middle-maker-only`                            | Canceled 事件和订单数量都仍正确    |
| `M02-GHOST-RESTING-ORDER`      | 成功 Cancel 后返回撤前盘口                         | `cancel-only-resting-order-removes-level / cancel-only-ask-removes-level`            | 只断言成功事件看不见幽灵节点       |
| `M02-TERMINAL-ID-REUSE`        | 把 CANCELED ID 的 Duplicate 改成新 Accepted/Rested | `duplicate-canceled-order-id-does-not-resurrect / duplicate-canceled-place-rejected` | 当前盘口曾为空，看似可以“重新下单” |
| `M02-REPEATED-CANCEL-SUCCEEDS` | 重复 Cancel 重放第一次 Canceled                    | `repeat-cancel-stable / repeat-cancel-reports-canceled-terminal`                     | 两次命令后盘口同样为空             |

每个 required mutant 必须被分类为 `STUDENT_FAILURE`，并且必须在表中冻结的 scenario/case 首次失败。只要求“最终有某个测试失败”不够：如果 FIFO mutant 到很久后的无关命令才失败，裁判可能没有直接观察中间撤单的结构；如果 terminal reuse 因异常崩溃，说明它不是被业务断言杀死。

因此还有一个故意抛 `IllegalStateException` 的 throwing control。它必须得到 `SYSTEM_ERROR`，不能计入 killed。最终 [mutants.json](/signal-grid-blog/practice/high-availability-cex/m02/evidence/reports/mutants.json) 同时保存 production control、四个 mutant 的分类与首个失败位置，以及 throwing control：

```text
production control = PASS
required           = 4
killed             = 4
each classification= STUDENT_FAILURE
throwing control   = SYSTEM_ERROR
```

这条三态分类是 fail-closed 的核心。`PASS` 说明所有业务观察一致；`STUDENT_FAILURE` 说明候选输出可执行但违背合同；`SYSTEM_ERROR` 说明编译、adapter、parser、文件系统或候选运行异常，裁判没有获得业务结论。把后两者都折叠成“红灯”在学习阶段看似省事，却会让一个总是抛异常的实现杀死所有 mutant，产生最危险的假阳性。

## 运行完成点：先核对 tag，再执行累计门禁

如果你只想复核官方完成点，从干净 clone 开始。不要在前三篇的练习分支上直接执行 evidence 生成，也不要把 `main` 当成版本身份：

```bash
git clone https://github.com/lcha-reln/cex-matching.git
cd cex-matching
git switch --detach course/m02-complete

test "$(git cat-file -t course/m02-complete)" = "tag"
test "$(git rev-parse HEAD)" \
  = "b54b4dfb51b61a5041d60c50dc1ff3404d73b27d"
test -z "$(git status --porcelain)"
```

然后依次运行：

```bash
./gradlew clean build --no-daemon
./gradlew m02Check --no-daemon
./gradlew m02Evidence \
  -Pm02.unitTag=course/m02-complete \
  --no-daemon
```

`clean build` 会编译、格式检查和运行模块测试；根 `check` 已累计依赖 M02 门禁。单独再运行 `m02Check` 是为了得到清晰的课程报告。它会先清理固定输出名，拒绝复用陈旧 PASS，再生成到 `build/reports/m02/`。你应看到 `matching.m02.check.v2`、`unit=M02`、`status=PASS`，以及 7 个业务报告 artifact。

可以用 `jq` 核对关键字段：

```bash
jq '{status, scenarioCorpus, lifecycle, registryInvariants,
     canonical, replays, mutants, architecture}' \
  build/reports/m02/check.json
```

预期至少包括：

```text
status                         PASS
scenarioCorpus                 10 / 34 / 22 PLACE / 12 CANCEL / 8 probes
lifecycle                      5 Canceled / 5 CancelRejected / 4 priority probes
registryInvariants.checks      34
canonical                      M02H1 / 181 lines / 17160 bytes / frozen digest
replays                        100 requested / 100 completed / 1 digest
mutants                        4 required / 4 killed / SYSTEM_ERROR control
architecture                   PASS / 20 source files
```

如果你正在从 `course/m02-start` 完成自己的实现，日常终点是 `m02Check`，不是伪造官方 evidence 身份。官方 `course/m02-complete` 已经存在且不可移动；不要改写它指向个人提交。你可以在自己的分支上运行测试与裁判、比较输出，再回到官方 tag 复核发布证据。

## tag-first evidence：manifest 不是跑完测试后随手复制的目录

正式发布时，顺序必须是“完成实现并提交 → 创建 annotated complete tag → 在干净 HEAD 运行 evidence”。原因写在 `M02EvidenceWriter` 的前置条件中：

```text
unitTag 必须匹配 course/m02(?:.<revision>)-complete
working tree 必须 clean
HEAD 必须是完整 Git commit
course.properties.completeRef 必须等于 unitTag
tag object type 必须是 tag
tag peeled commit 必须等于 HEAD
check.json 必须是 matching.m02.check.v2 / PASS / plan 0.4
```

也就是说，evidence 不是先生成、以后再决定绑定哪个 commit。tag 必须已经存在，writer 在复制前、生成后和发布 staging directory 后反复检查 HEAD、tag 与 clean tree，防止生成过程中源码身份变化。输出先写入 `build/lab-evidence/.M02-staging-*`，manifest 通过 schema 与语义检查后才原子发布到 `build/lab-evidence/M02/`；失败时不能留下半份新 evidence 冒充完成结果。

完成 manifest 的来源字段是：

```json
{
  "unitTag": "course/m02-complete",
  "productRelease": null,
  "planVersion": "0.4",
  "source": {
    "commit": "b54b4dfb51b61a5041d60c50dc1ff3404d73b27d",
    "dirty": false
  }
}
```

`productRelease` 为 `null` 是有意设计。M02 是课程完成点，不是产品命名停止点；`matching-0.1.0` 保留给候选 M03 在更强参考模型与性质证据闭合后决定。把每个教学单元都包装成产品 release，会让版本号错误地暗示稳定性边界。

manifest 自身 SHA-256 是：

```text
5a62371a0da181778aa5c7675dc10c3ca8dd38601f6a3e48be326c7db8c85663
```

它列出 9 个被托管 artifact：一份输入 fixture、`check.json`、M00/M01 regression、Cancel event batches、lifecycle、registry invariants、M02H1 history、mutants 与 architecture。每个路径必须是 evidence root 内的普通文件，不能是 symlink、绝对路径或 `..` 逃逸；每个 SHA-256 都会重新计算。站点发布门禁随后再次检查 manifest 哈希、claim 顺序、限制文本、报告字段和 artifact 哈希，所以“同时改报告和哈希”仍无法把失败状态包装为公开 PASS。

## 读 manifest 时，claim 与 limitation 必须成对出现

M02 manifest 按固定顺序发布 8 项 claim：

1. `m00-m01-regression`：M00 输入合同与 M01 的 8 场景 22 命令仍为 PASS；
2. `cancel-event-batches`：34 条命令中的每个 Cancel 都只产生一种冻结的单例结果；
3. `addressable-order-cancellation`：10/34 corpus 证明按已接受 orderId 精确撤单；
4. `irreversible-terminal-states`：FILLED/CANCELED 保持终态，unknown Cancel 不建 tombstone；
5. `order-registry-book-invariants`：独立账本与返回 resting book 在冻结历史内保持双射和 FIFO-safe；
6. `deterministic-lifecycle-history`：100 次 fresh parse/engine 得到同一 M02H1 字节与 digest；
7. `semantic-mutants`：四个 required mutant 都被业务断言杀死，系统异常不算；
8. `architecture-boundary`：matching-core 继续保持确定性、无 I/O、无持久化和无 Aeron。

claim 不能脱离 observation 阅读。例如 `order-registry-book-invariants` 的 observation 只有 `status=PASS`、artifact 与 34 次检查；更细的 52/26/68 计数来自对应报告。`deterministic-lifecycle-history` 只陈述 100 次冻结 corpus replay，不应被扩写成任意输入空间的形式化证明。`architecture-boundary` 也只约束本单元 core 源码边界，不等于系统已经具备生产拓扑。

同一 manifest 冻结以下 8 条原文 limitation。发布者不能为了让结果更“商用”而删掉它们：

```text
Only one in-memory BTC-USDT GTC limit-order book with place and cancel is implemented.
Accepted order IDs are unique for the lifetime of one engine process; terminal identity records are retained without pruning.
A repeated place command is rejected as a duplicate order ID; command-level idempotency and prior-result replay are not implemented.
There is no Cancel/Replace, amendment, mass cancel, IOC, FOK, post-only, market order, STP, market state, or price band.
There is no account, asset, position, fee, settlement, reservation-release, or risk logic.
Fixed scenarios and semantic mutants are not the independent generated reference model or property proof deferred to M03.
The unit has no persistence, networking, database, threads, Aeron, or high availability.
The evidence makes no throughput, latency, recovery, durable-idempotency, or production-readiness claim.
```

它们共同给出 M02 的精确外沿：单交易对、GTC、内存、调用方串行化；终态身份在一个 engine 进程内不回收；重复 Place 是业务拒绝而非旧结果重放；账户、资产、手续费、结算和预占释放属于 Counter；网络、持久化与 Aeron 仍未进入 Matching；固定场景和变异体也尚未成为生成式参考模型。

这不是给完成结果“泼冷水”，而是让 PASS 可以被正确使用。一个商用系统的长期课程必须允许早期单元只完成一个窄而真实的性质；若 M02 的证据顺手声称吞吐、崩溃恢复或高可用，后续单元就失去了可证伪的增量边界。

## Falsify：不要再加 happy path，主动让裁判说不

现在从 `course/m02-start` 建立自己的练习分支，按前三篇完成实现。先让 `m02Check` PASS，再在独立实验 commit 中逐项注入错误；每次只改一个语义，运行裁判，记录 `check.json` 的分类和首个失败 case。

### 练习一：制造幸存者重排

在成功撤掉同价中间订单后，把价位剩余两个节点反转。预测：Cancel 事件仍正确，订单数也正确，但裁判应在 `cancel-middle-maker-only` 立刻给出 `STUDENT_FAILURE`，而不是等后继 taker 才发现 Trade 顺序错误。

运行：

```bash
./gradlew m02Check --no-daemon
jq '{status, failure}' build/reports/m02/check.json
```

如果它仍 PASS，检查你的断言是否只比较集合而忽略 queue index 与 acceptance sequence。

### 练习二：让终态身份被回收

在成功 Cancel 或 fully-filled maker 路径中删除 lifecycle entry。分别预测 unknown、duplicate 与迟到 Cancel 的结果。至少要观察：CANCELED ID 的同 payload Place 被错误接受时，裁判在 `duplicate-canceled-place-rejected` 杀死它；FILLED ID 被删除时，`duplicate-filled-place-rejected` 或随后的迟到 Cancel 也必须失败。

不要只增加一个“Map size 应为 N”的白盒断言。真正要保留的是未来命令对历史身份的可观察解释；内部集合布局以后可以变化。

### 练习三：交换验证与 lifecycle lookup

把 Duplicate/terminal lookup 移到字段验证之前。构造一个已存在 ID，再提交错误 side 或错误 instrument。10/34 history 可能仍全部匹配，但四个 out-of-history probe 必须使根裁判失败。这项练习证明额外探针与 Golden 不是重复覆盖。

### 练习四：把异常错误地算作 killed

阅读 `M02MutantJudgeTest`，然后让一个 candidate 在第一条 Place 直接抛异常。正确观察是 `SYSTEM_ERROR`，不是 `STUDENT_FAILURE`。运行聚焦测试：

```bash
./gradlew :matching-testkit:test \
  --tests '*M02MutantJudgeTest' \
  --tests '*M02OutputSafetyTest' \
  --no-daemon
```

最后恢复你的实验改动，再运行完整三条完成命令。验收记录至少保留：当前完整 commit、`m02Check` status、fixture SHA、M02H1 digest、100/100/1 replay、4/4 mutant、throwing control 分类，以及 clean-tree 状态。不要把一次 IDE 测试绿灯替代这组累计证据。

完成这些反例后，再进入 [M02 Matching Lab](/signal-grid-blog/practice/high-availability-cex/m02/lab/)：先逐条预测事件和盘口，再揭示本站托管的 Java Golden；浏览器模型只用于有界 PLACE/CANCEL 状态探索，不编译 Java，也不冒充课程裁判。

## 停止点：M02 证明的是闭合生命周期，不是高可用交易所

到这里，M02 的完成链条已经闭合：10 场景 34 命令冻结了地址化撤单与终态路径；独立账本从公开结果推演数量、身份与盘口不变量；四个 history 外探针守住验证优先级；181 行、17,160 字节的 M02H1 经 100 次 fresh replay 保持唯一 digest；四个 semantic mutant 以 `STUDENT_FAILURE` 被杀死，而 throwing control 保持 `SYSTEM_ERROR`；最后，annotated complete tag、干净提交和 artifact 哈希把结论绑定到可复核来源。

这组证据保证的是：在冻结 corpus 与声明边界内，活动或部分成交订单能按 ID 精确撤销，FILLED/CANCELED 身份不会复活，事件、盘口与独立生命周期推演一致。它不保证任意历史上的性质完备，不提供命令幂等、终态回收、账户资产、持久化、性能、网络、Aeron 或高可用。

M02 因此必须在这里停下。下一候选单元 M03 的依赖不是“再加一种订单类型”，而是把固定例子提升为独立生成式参考模型和更广的性质证明；它尚未签约，也没有可点击的课程入口。课程地图可以在 [高可用 CEX 实战驾驶舱](/signal-grid-blog/practice/high-availability-cex/) 查看，但不要把候选地图当作已经冻结的实现合同。

上一篇：[让已成交与已撤订单永远不能复活](/signal-grid-blog/practice/high-availability-cex/m02/irreversible-terminal-orders/)
