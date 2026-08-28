---
title: "M03·04：用六个性质变异体把 matching-0.1.0 绑定到证据"
description: "让六类 plausible business fault 都以 STUDENT_FAILURE 被生成套件发现、缩小和重放，同时保留 SYSTEM_ERROR control，并用双 annotated tag 与 clean-tree manifest 收口首个撮合产品停止点。"
date: 2026-08-28T17:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M03
lessonOrder: 40
permalink: property-mutants-release-evidence
tags:
  - 撮合引擎
  - Mutation Testing
  - Release Evidence
draft: false
---

> M03 的发布坐标已经固定：annotated [`course/m03-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m03-complete) 与 annotated [`matching-0.1.0`](https://github.com/lcha-reln/cex-matching/tree/matching-0.1.0) 都 peeled 到 commit `dab4a2a1dccf06d6b9769c979a6ae5af6d1d2bdc`。完整源码从 [完成坐标下的仓库树](https://github.com/lcha-reln/cex-matching/tree/course/m03-complete) 复核，发布 evidence 从站内 [`manifest.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/manifest.json) 开始复核。

前三篇已经建立了独立线性 reference、256×64 确定性历史、第三事件账本和可严格重放的 one-minimal 反例。现在 production control 可以 PASS，若干人工错误也会失败；但“测试很多”仍不是一个产品 release 的身份。

一个可信停止点还必须回答：裁判是否真能反对六类业务上 plausible 的错误；异常是否被正确区分；M00～M02 是否累计回归；输入、报告和反例是否来自同一提交；`course/m03-complete` 与 `matching-0.1.0` 是否都不可移动且指向同一份源码；最后，证据有没有明确写出自己**不**证明什么。

本篇只证明一个命题：**`matching-0.1.0` 只有在正向性质、负向变异、严格重放、架构边界和来源身份同时闭合时才成立；release tag 不是对“商用完备”的宣言，而是对一个窄而可复核停止点的命名。**

这些完成值不是从计划文档抄来的，而是从最终 clean-tree evidence 读取：manifest SHA-256 为 `14ea367d5f08029679b22a5efd2a9c0a34b16f97bb28273771b3c5125c851b52`；`M03G1` 为 `sha256:1920d6b8a480998825c72636d446854d9e795e91b0ab29520f203b12186979ce`（16,641 行、1,682,592 bytes）；`M03X1` 为 `sha256:3c23c1f08975d9ad57260d8a16a8201710ee7f56671824648e4e32c477afcac1`（513 行、54,088 bytes）。

## 一个裁判必须证明自己既会说“是”，也会说“不”

production control 在 16,384 个边界全部 PASS，只能说明裁判与当前实现相容。若 judge 忘了检查同价顺序，正确实现照样 PASS；若 reference 和 production 共享了错误 comparator，双方也会一致。

M03 因此冻结六个 required semantic mutant。它们不是随机改一行代码，而是六种浅测试很可能放过、业务后果却明确的错误：

| mutant | 注入错误 | 首先应破坏的 fingerprint | 只看最终状态为什么可能漏掉 |
| --- | --- | --- | --- |
| `M03-BEST-PRICE-LAST` | 跨多个成交价时反转 maker 处理顺序 | `PRICE_TIME_PRIORITY/WRONG_MAKER_ORDER` | 最终两档都被吃完，空盘口完全相同 |
| `M03-SAME-PRICE-LIFO` | 同价 maker 从后到先成交 | `PRICE_TIME_PRIORITY/WRONG_MAKER_ORDER` | 成交总量与价格都正确，只有身份顺序错误 |
| `M03-TAKER-PRICE-TRADE` | Trade 价格写成 taker limit | `MAKER_PRICE/TRADE_PRICE` | 双方余量和最终盘口都可能正确 |
| `M03-TRADE-QUANTITY-OVERFLOW` | 第一笔 Trade 数量多写一个 lot | `QUANTITY_PARTITION/TRADE_EXCEEDS_REMAINDER` | 若只看最后 book，错误事件可能没有被累计 |
| `M03-CANCEL-GHOST-BOOK` | 成功 Cancel 却返回撤单前盘口 | `BOOK_LIFECYCLE_BIJECTION/ACTIVE_ID_SET` | Canceled 事件本身仍然正确 |
| `M03-CANCELED-ID-REUSE` | 把已撤 ID 的 Duplicate 改成新 Accepted/Rested | `LIFECYCLE_IRREVERSIBILITY/TERMINAL_OR_ACTIVE_ID_REUSED` | 撤单后盘口曾为空，看起来可以重新挂单 |

每个 mutant 必须经过同一条链：

```text
generated suite finds first failure
  → classification = STUDENT_FAILURE
  → deterministic fresh-state shrink
  → persist complete counterexample
  → one-minimal verification
  → strict Schema replay
  → same property fingerprint
```

只在一个定制单元测试里杀死 mutant 不够。它必须被 production control 使用的同一 generator、reference、ledger 和 judge 发现；否则变异测试证明的是专用断言，不是主门禁的辨别力。

## throwing control 守住 fail-closed 的最后一条线

再加一个候选，让第一条命令直接抛出 `IllegalStateException`。candidate apply 因而没有形成业务 outcome，judge 必须捕获它并分类，但它绝不能进入 `killed=6`：

```text
M03-THROWING-CONTROL → SYSTEM_ERROR
```

为什么这项 control 与六个 business mutant 同等重要？如果 judge 把所有异常都包装成 `STUDENT_FAILURE`，一个完全不可运行的 candidate 会“杀死”所有 mutant，并得到最漂亮的负向覆盖数据。真正的三态语义是：

| 分类 | 含义 | release 处理 |
| --- | --- | --- |
| `PASS` | 所有业务观察完成且一致 | production control 才允许 |
| `STUDENT_FAILURE` | candidate 给出可观察结果，但违背冻结性质 | required mutant 的预期 |
| `SYSTEM_ERROR` | 没有形成可靠业务结论 | 除 throwing control 校准外，一律失败关闭 |

parser、Schema、文件系统、reference、judge、报告写入或 candidate 的非预期异常都属于第三类。required business mutant 得到 `SYSTEM_ERROR` 会让完整门禁失败；唯独 throwing control 的**预期分类恰好是** `SYSTEM_ERROR`，所以校准正确时总 gate 仍可 PASS。不要用 `catch (Exception) { return STUDENT_FAILURE; }` 抹平边界。

## M03 是累计门禁，不是用新测试替换旧证据

生成式 reference 能覆盖更广历史，不代表 M00～M02 的固定合同可以删除。固定 corpus 仍有独立价值：它们冻结了精确 Schema、人工 Golden、验证优先级和发布过的历史字节；生成套件则检验更大的组合空间。

完成态 `m03Check` 必须重新运行 M02 权威门禁，并通过它累计证明 M00/M01。摘要至少交叉核对：M02 `matching.m02.check.v2` 仍为 PASS、10 个 scenario、34 条 command 和冻结 M02H1 digest 不变。M03 不能复制一份“预计回归通过”的 JSON；它要真正调用累计检查，再把权威报告压缩成 `m00-m02-regression.json`。

同理，`matching-core` 的架构边界必须延续：20 个 source file 仍无 I/O、数据库、网络、线程、墙钟、随机数和 Aeron。M03 新增复杂度只能落在 test-only `matching-reference` 与 testkit；若为了让 generator 工作而把 PRNG 放进生产 core，门禁应失败。

## check.json 是报告索引，不是一个孤立 PASS 字段

完整 `matching.m03.check.v2` 的 `status=PASS` 必须由九份业务报告支撑：

```text
m00-m02-regression.json
reference-model.json
generated-properties.json
invariants.json
counterexamples.json
counterexamples.canonical.utf8
replay.json
mutants.json
architecture.json
```

`check.json` 自身还应冻结这些可交叉核对的摘要：

- generator fixture 路径、Schema、SHA、算法、seed 派生、256×64、四 lane 与六个 probes；
- 16,384 次 differential、ledger 和 book check；
- 两次 fresh generation、唯一 M03G1 command digest；
- 六项 counterexample 均已 shrink、persist、replay、one-minimal；
- 六项 mutant 均为 `STUDENT_FAILURE`，throwing control 为 `SYSTEM_ERROR`；
- reference 依赖与表示独立，core/reference 源码边界无 violation；
- `releaseTarget.unitTag=course/m03-complete`、`releaseTarget.productRelease=matching-0.1.0`，且验证权威明确标为 `M03_EVIDENCE_ONLY`。

最后一项只是**声明发布目标**。普通 `m03Check` 不要求 tag 已存在，也不伪造 `sameCommit=true`；只有 clean-tree `m03Evidence` 有权读取 Git object、验证两个 annotated tag 并把真实来源身份写入 manifest。

若任何阶段失败，输出应只保留最小的三态失败报告与稳定 message，不能把上一轮成功的 generator、mutants 或 release 字段残留在同一个 JSON 中。runner 开始时先清理固定输出名，PASS 报告使用逐文件临时写与原子替换；中途失败会再次清理，并重写最小 `check.json`。目录级 staging 与整包发布属于后面的 EvidenceWriter，不属于 `m03Check`。

## tag-first：产品身份必须先于 evidence 生成

正式 evidence 的顺序和普通“跑测试、再打 tag”不同：

1. 完成实现与 `course.properties`，提交最终源码；
2. 确认工作树干净；
3. 在该 commit 创建 annotated `course/m03-complete`；
4. 在同一 commit 创建 annotated `matching-0.1.0`；
5. 运行累计构建、`m03Check` 和 `m03Evidence`；
6. writer 在同一进程 fresh 重跑 `m03Check`，让 runner 重新建立跨报告语义；随后验证 HEAD、两个 tag、clean tree、`check.json` Schema、manifest 语义与 artifact hashes。

学习者在阶段性实现尚未完成、双 tag 尚未创建时，不应提前执行下面的发布命令；官方完成坐标已经创建，复验形状是：

```bash
test "$(git cat-file -t course/m03-complete)" = "tag"
test "$(git cat-file -t matching-0.1.0)" = "tag"
test "$(git rev-list -n 1 course/m03-complete)" \
  = "$(git rev-list -n 1 matching-0.1.0)"
test "$(git rev-list -n 1 course/m03-complete)" \
  = "$(git rev-parse HEAD)"
test -z "$(git status --porcelain)"

./gradlew clean build --no-daemon
./gradlew m03Check --no-daemon
./gradlew m03Evidence \
  -Pm03.unitTag=course/m03-complete \
  -Pm03.productRelease=matching-0.1.0 \
  --no-daemon
```

`m03Evidence` 还把 product release 参数冻结为 `matching-0.1.0`，拒绝把同一份 evidence 改绑到其他名字。writer 在开始和目录发布前验证两个 ref 都是 annotated tag 且 peeled 到当前 HEAD；发布后再次确认 HEAD 与工作树没有变化。它还拒绝 dirty working tree、symlink artifact、绝对路径和 `..` 逃逸。`m03Check` 中的 release target 文本不能替代这些 Git 检查。

为什么不能先生成 evidence 再提交？因为 manifest 的 `source.commit`、完整 commit tag 与 artifact 来源会形成循环：提交 evidence 又改变 HEAD，原 tag 不再指向最终来源。课程采用 build 产物作为源仓 evidence，再由博客托管固定副本，避免把生成目录提交回代码仓库。

## Manifest 把八项 claim 与十二个 artifact 逐一绑定

发布的 `cex.lab-evidence.v1` manifest 包含八项有序 claim：

1. `m00-m02-regression`：前三个单元的冻结合同仍 PASS；
2. `independent-reference-model`：flat-list linear-scan reference 不依赖 core/testkit；
3. `generated-property-suite`：SplitMix64 冻结套件在全部 16,384 边界与 reference 一致且可重新生成；
4. `quantity-lifecycle-invariants`：第三事件账本逐命令检查数量、生命周期、盘口、FIFO 与双射；
5. `minimal-counterexamples`：六个 required mutant 都有持久化、稳定 fingerprint 的 one-minimal 反例；
6. `counterexample-replay`：从持久 bytes 严格重放六项 `STUDENT_FAILURE`；
7. `semantic-mutants`：6/6 business mutant 被杀，throwing control 保持 `SYSTEM_ERROR`；
8. `architecture-boundary`：core 边界与 reference 独立性保持，双 annotated ref 绑定同 commit。

它们共同引用十二个唯一 artifact：两份 input、九份业务报告和 `check.json`。每个 artifact 都带现场计算的 SHA-256；同一路径不能在多个 claim 中重复登记，manifest 之外的文件也不能冒充证据。

站点发布时，这个 bundle 被复制到：

```text
/signal-grid-blog/practice/high-availability-cex/m03/evidence/
```

博客门禁会重新计算 manifest SHA 与全部 artifact SHA，并冻结关键 report facts。发布 bundle 的 [`check.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/check.json)、[`generated-properties.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/generated-properties.json)、[`counterexamples.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/counterexamples.json)、[`replay.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/replay.json)、[`mutants.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/mutants.json) 与 [`architecture.json`](/signal-grid-blog/practice/high-availability-cex/m03/evidence/reports/architecture.json) 因而是可点击、可哈希复核的完成事实。

最终数据与正文叙述逐项对齐：production control 在 16,384 个命令边界全部 PASS；reference/core source file 分别是 7/20，architecture violation 为 0；六项 minimized length 是 `3/3/2/2/2/3`，shrink trials 是 `246/243/132/72/69/148`。六个 replay 的 `referenceOutcomesExact`、`actualOutcomeExact`、`provenanceExact`、`oneMinimalReverified` 四项都为 `true`。

## Limitation 与 claim 必须一起读

八项 claim 不允许被扩写成“撮合已经商用完备”。manifest 同时冻结八条限制：

```text
Only one in-memory BTC-USDT GTC limit-order book with place and cancel is implemented.
The generated suite is frozen at 256 histories by 64 commands and is bounded testing, not exhaustive or formal verification.
Accepted order IDs are unique for one engine lifetime; terminal identity records are retained without pruning.
A repeated Place is rejected as a duplicate order ID; durable command idempotency and prior-result replay are not implemented.
There is no Cancel/Replace, amendment, mass cancel, IOC, FOK, post-only, market order, STP, market state, price band, or multi-instrument routing.
There is no account, asset, position, fee, settlement, reservation, or risk logic.
The unit has no persistence, networking, database, threads, Aeron, cluster replication, or high availability.
The evidence makes no throughput, latency, recovery, durability, or production-readiness claim.
```

这些限制不是免责声明附件，而是 release 语义的一半。`matching-0.1.0` 可以被准确描述为：**经过独立线性 reference 与有界 generated-property gate 验证的单交易对 GTC 限价撮合器，支持可寻址撤单。**

它不能被描述为：能接真实交易流量、具备低延迟指标、能够崩溃恢复、已经接入账户资产、支持多品种，或已经通过 Aeron Cluster 高可用验证。这些能力会在后续单元逐个引入，并各自承担新的失败模型和证据。

## Matching Lab 只消费 evidence，不建立第四个权威撮合器

M03 复用 M01–M03 的通用 Matching Lab 壳，而不是复制一份新的前端 engine。它从 manifest 列出的 `counterexamples-v1.json` 和 counterexample 报告读取六个场景：

```text
选择 mutant
  → fresh-state 展示最小命令历史
  → 读者逐步预测 events 与 bookAfter
  → 揭示 Java linear reference Golden
  → 在首次分歧处解释 property fingerprint
```

这条信任链分成构建时与运行时两层：站点构建门禁读取 manifest，重新计算 scenario pack、counterexample report 与 canonical artifact 的 SHA-256，并交叉核对 `check.json` 摘要；hash 漂移会直接阻止部署。浏览器 runtime 本身不重新计算 manifest hash，它只同源读取已发布 scenario/report，核对场景目录、逐场命令数与 expected events/book 语义，再让有界模型从 fresh state 重放全部公开 scenario。文件缺失、跨域或语义漂移时保持禁用。网页反馈只叫“预测”“揭示”或“corpus 自检”，不能输出 Java 裁判三态，也不上传用户源码。

Lab 的教学价值在于把 shrink 后的因果链可视化：读者不必先运行 Java，也能看懂为何 maker 顺序、成交价、余量或终态在某一步首次违规。真正的 Java 编译、性质门禁、反例缩小和 evidence 生成仍由读者在本地课程仓库执行。

## Falsify：逐项证明门禁会拒绝伪 release

在独立实验分支完成以下反证，每次只改变一个条件：

### 让 business mutant 抛异常

把 `M03-SAME-PRICE-LIFO` 改成在第一条命令抛异常。预期从 `STUDENT_FAILURE` 变成 `SYSTEM_ERROR`，`killed` 不得计数，完整门禁失败。若仍显示 6/6，三态分类被绕过了。

### 让 shrink 保留另一个 fingerprint

放宽 predicate 为“任意 STUDENT_FAILURE”，观察某项反例是否换成另一类更短错误。one-minimal 或 strict replay 应拒绝 fingerprint 漂移。恢复后再运行完整门禁。

### 复用旧 PASS 报告

先生成成功报告，再破坏 reference 架构并重新运行。runner 必须清理旧输出，不能让新失败与旧 `architecture.json` 拼接成 PASS。

### 创建 lightweight product tag

删掉本地实验 tag，改用 lightweight `git tag matching-0.1.0`。evidence writer 必须因 object type 不是 `tag` 而拒绝；恢复时只能在个人实验 ref 上操作，不移动正式已发布 tag。

### 让两个 annotated tag 指向不同 commit

在临时 clone 中制造这种状态。`m03Check` 仍只能报告 `M03_EVIDENCE_ONLY` 的 release target，不能把目标文本升级为已验证身份；`m03Evidence` 必须因 peeled commit 不一致而失败，manifest 不能只相信 `course.properties` 或 `check.json` 文本。

### 修改已复制 artifact

生成 staging bundle 后改一个 JSON 字节。artifact SHA 校验与站点 evidence gate 都必须拒绝。仅同步更新 manifest hash 也不够，因为博客端还会冻结报告状态、计数、claim observation 与 limitation 原文。

这些练习共同证明发布门禁不是“顺利路径脚本”，而是能辨别错误来源、身份漂移与证据篡改的可执行合同。

## 停止点：matching-0.1.0 是正确性基线，不是终局

最终实现已经通过全部门禁，M03 的因果链由此闭合：M00～M02 累计回归保持稳定；独立 flat-list reference、production adapter 与第三 ledger 在 256×64 边界交叉验证；六个 plausible mutant 都被定位、缩小、持久化和严格重放；throwing control 没有被误算为业务失败；双 annotated tag、干净 commit 和十二个 artifact hashes 把结论绑定到可复核来源。

这时 `matching-0.1.0` 才是一个有意义的命名停止点。它保证冻结边界内的单交易对 GTC Place/Cancel 撮合语义，不能保证穷尽正确性、性能、durability、networking、账户资金或高可用。

M03 已完整发布，下一单元可以进入独立实施窗口。仍不要把新订单类型、第二交易对、WAL、SBE 或 Aeron 反向塞回本篇；课程的长期价值来自每次只增加一个复杂度维度，并让新的 claim 与新的 failure model 一起获得证据。

上一篇：[把失败历史缩成可严格重放的最小反例](/signal-grid-blog/practice/high-availability-cex/m03/shrink-replay-minimal-counterexamples/)
