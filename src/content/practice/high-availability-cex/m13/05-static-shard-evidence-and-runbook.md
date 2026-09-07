---
title: "M13·05：怎样从固定标签复验静态分片的交付边界"
description: "从不可移动的课程标签和冻结 workload 出发，区分构建、有限语义资格、真实双组运行与 evidence export，并解释本地环境诊断和 M13 的发布停止点。"
date: 2026-09-07T15:02:37+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M13
lessonOrder: 50
permalink: static-shard-evidence-and-runbook
tags:
  - Evidence
  - 复验
  - 故障诊断
  - Java
draft: false
---

> 本地复验身份：annotated [`course/m13-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m13-complete)，clean commit `eb1b65d2ea2159ba607e3271f0bfd209ea4906ea`。本文结论取自该身份的一次 fresh M13 qualification；[manifest 发布入口](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/manifest.json) 随本单元教程发布提供。

一个 `status: PASS` 的 JSON、一张显示六个 JVM 的截图、一个 manifest SHA-256，哪一个单独足以证明错误路由没有修改 producer cursor？先选一个，再问：这个材料绑定了哪份源码、哪组请求，以及拒绝前后的哪两个完整状态？

三个材料都不够。**完成声明必须能从固定源码和输入，追到真实执行的业务事实，再追到公开 artifact 的完整性。** manifest 防止发布材料被静默替换，但不替程序执行测试；截图可以辅助诊断，也不替命令历史和状态比较作裁判。

M13 因而把构建、有限语义资格、双组故障实验和干净标签导出分别设为门禁。本篇给出一条可执行复验路径，同时保留本次运行环境对结论的限制。

## 起点 RED 与完成 PASS 是两种固定身份

课程起点是 annotated `course/m13-start`；其完整构建必须通过，`m13Check` 则以结构化 `GOAL_NOT_IMPLEMENTED` 非零退出。前者证明可以在继承状态上继续工作，后者明确指出本单元还没有实现。

练习时可以从起点新建自己的分支：

```bash
git clone https://github.com/lcha-reln/cex-matching.git
cd cex-matching
git switch -c unit/m13 course/m13-start
./gradlew clean build --no-daemon --max-workers=1
./gradlew m13Check --no-daemon --max-workers=1
```

最后一条在起点预期失败。不要为了消除 RED 修改冻结 workload、移动 start tag，或把脚本的非零退出码直接改成零。开发中的 `m13Check` 可以报告当前 dirty source；正式 evidence 则必须来自 clean completion identity。

复验完成版时，在新的普通 clone 上执行：

```bash
git switch --detach course/m13-complete
test "$(git cat-file -t course/m13-complete)" = tag
test "$(git rev-parse HEAD)" = "$(git rev-parse 'course/m13-complete^{commit}')"
test -z "$(git status --porcelain)"
./gradlew clean build --no-daemon --max-workers=1
./gradlew m13Check --no-daemon --max-workers=1
./gradlew m13Evidence --no-daemon --max-workers=1
```

`cat-file` 验证 annotated tag 对象，`^{commit}` 验证 peeled commit，clean-tree 检查排除标签之外的工作树修改。名称相同、能够编译或当前 branch 正好叫 M13，都不能代替这三个身份事实。

以上命令要求项目声明的 Java 25 环境；可以先用 `java -version` 与 `./gradlew --version` 核对实际运行时。首次依赖解析需要可用的仓库网络或已经准备好的缓存，不应在没有缓存时盲目添加 `--offline`。有受限 macOS 接收缓冲症状时，先应用下文已解释的本地运行条件，再执行这些门禁。

## 每一层证据只能回答自己的问题

冻结 workload 声明 seed 6313、64 条生成历史、每条 64 个 action、10 个固定场景和 6 个 semantic mutant。这些首先是资格义务。本次由完成身份生成的 [check report](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/reports/check/check.json) 为 `PASS` 且 `executed=true`：8 个局部固定场景与 2 个真实双组场景合成全部 10 项，实际执行 4096 个 generated action，6 个 semantic candidate 均被业务分歧识别。

生成报告进一步区分了 3328 次新应用、256 次 duplicate、512 次 preflight 拒绝、12288 次逐本状态比较和 128 次局部 snapshot restore。真实双组报告另有 6 个同时存活 child JVM、1 次已解决 UNKNOWN、6 份 snapshot 写入与 6 份实际加载，以及完成的 teardown。局部恢复计数和真实 snapshot 观察不互相替代。

当前 `M13CheckRunner` 依次执行局部语义、继承回归和真实双组实验，再核对场景身份、生成动作、mutant 分类与拓扑事实。它会在每次运行前清理本次报告目录，防止上一次的 PASS 被误当成新运行结果。

| 层次           | 主要报告或入口                                                        | 支持的结论                                            |
| -------------- | --------------------------------------------------------------------- | ----------------------------------------------------- |
| 完整构建与回归 | `clean build`、模块测试报告                                           | 当前源码可以构建，保留所声明回归义务                  |
| 固定语义       | `fixed.json`、`fixed-*.jsonl`                                         | 路由、独立 book、身份、追加与恢复的具体断言           |
| 生成历史       | `generated.json`、`generated-corpus.bin`、`generated-history-*.jsonl` | 固定种子有限历史上的事件与独立逐本状态比较            |
| 语义反例       | `mutants.json`、`mutant-*-control.jsonl`、`mutant-*-candidate.jsonl`  | 指定错误能被业务裁判识别，且 production control 通过  |
| 继承合同       | `inherited.json`、`m13-inherited-architecture.json`、`m12-*.json`     | 当前编译代码继续满足 M11/M12 的规定语义边界           |
| 真实双组       | `m13-cluster-faults.json`、`raw/`                                     | 六 member 同时运行、故障窗口进展、恢复与清理关系      |
| 发布绑定       | `build/lab-evidence/M13/manifest.json`                                | clean source、fresh reports 与所导出 bytes 的哈希绑定 |

这些文件位于 `build/reports/m13/`，最后一行除外。实际副本的文件列表和哈希由 `check.json` 的 `artifactBindings` 给出，每项包含 `path` 与 `sha256`；schema 身份则读取各 JSON 的 `schemaVersion` 及导出 manifest 绑定的 schema artifact。不能只照表格的通配符推断某文件一定已经生成。

局部生成裁判把各 instrument 投影到独立 reference book，以完整事件和逐本状态作比较。真实 Cluster 对照则比较每组应用结果和 Direct runtime，另加 PID、authority、snapshot 与 teardown witness。两种对照分别检查业务算法与运行边界，不能把后者称为独立撮合算法实现，也不能把前者称为真实故障注入。

源码定位：[M13CheckRunner.java](https://github.com/lcha-reln/cex-matching/blob/course/m13-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M13CheckRunner.java) 汇总实际资格，[M13EvidenceWriter.java](https://github.com/lcha-reln/cex-matching/blob/course/m13-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M13EvidenceWriter.java) 检查 clean tag 与导出一致性，[matching-testkit/build.gradle.kts](https://github.com/lcha-reln/cex-matching/blob/course/m13-complete/matching-testkit/build.gradle.kts) 声明本文的真实运行入口。

## 把一个 mutant kill 追到可解释的业务分歧

例如 `USE_SHARD_SEQUENCE_FOR_BOOK_CONTROL` 故意在 ETH 控制条件里使用 shard sequence。重放相应记录时，应当看到 BTC 的额外进展改变了 candidate 的判定，而 production control 仍按 ETH 的局部序号处理。

`mutants.json` 需要把两个观察连起来：candidate 分类为 `STUDENT_FAILURE`，对应 production control 为 PASS。throwing control 则必须是 `SYSTEM_ERROR`，并明确不计 kill。抛出异常、打不开端口或没能加载 snapshot 都不能证明某个业务错误已经被裁判击中。

可以用现有测试一次执行并检查这些分类：

```bash
./gradlew :matching-testkit:test \
  --tests '*M13SemanticSuiteTest.classifierRequiresSemanticFailureAndPassingProductionControl' \
  --tests '*M13SemanticSuiteTest.runsEveryFrozenLocalObligationAndBindsActualRawObservations' \
  --no-daemon --max-workers=1
```

这两个测试的输出目录由测试临时目录管理；需要长期保留完整资格材料时运行 `m13Check`，再从 `build/reports/m13/` 读取。本单元实际可执行的重放路径是固定 suite；它保存 control/candidate 原始记录，供读者逐项解释分歧。

同样要区分继承语义与历史源码身份。本次 [inherited report](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/reports/check/inherited.json) 如实记录 `matchingCoreUnchanged=false`、`currentCompiledClasses=true`、6 份 M11 protocol golden 通过和 M12 真实进程历史通过。M13 为 instrument 配置演进了 core 构造入口；默认 BTC、旧 M11 wire source/goldens、确定性与 callback 边界仍在当前编译代码上复验。`M13InheritedBoundary` 将当前 core 的基础设施约束与源摘要绑定到本次运行，并保留当前 M10 算法/benchmark 与 M11 架构义务；`runM13InheritedSemantics` 执行继承的真实 M12 历史。`historicalEvidenceRebound=false` 明确旧 source-identity gate 与 evidence 继续属于原 immutable tags。

## 本地 catchup 故障先查实际接收 socket

本次受限 macOS/JDK 环境出现过一个容易误判的故障：普通业务请求能够成功，旧 Leader 回来后 catchup 却始终停在原位置，稍后报 `existing publication has clashing sessionId`。直接忽略后一个错误，或者增大 deadline，都会掩盖最初的数据缺口。

诊断把路径拆开后得到：replay 的 `pub-pos` 与 `snd-pos` 已经前进，发送窗口没有耗尽；返回 Follower 的 `rcv-hwm` 前进，但 `rcv-pos`、`rec-pos` 与业务位置不变，同时持续发送 NAK。真实 Java `DatagramChannel.getOption(SO_RCVBUF)` 只有 1024，1408-byte catchup 批始终未进入数据 callback，小的 heartbeat 和尾部数据则能到达。

根因在 JDK 的 macOS 原生包装层：读取最大 socket 缓冲的 `sysctl` 被执行环境拒绝后，OpenJDK 25 将回退值缓存为 1024，并用它钳制后续 Java 设置请求。原生 Python socket 设置成功并不能否定这个 Java 特有路径；只看 Aeron 的配置值同样不够。[OpenJDK 25 的 NET_SetSockOpt](https://raw.githubusercontent.com/openjdk/jdk/jdk-25%2B36/src/java.base/unix/native/libnet/net_util_md.c)

在已确认本机默认接收缓冲为 786896、足以容纳原 128 KiB receiver window 的前提下，采用标准 Aeron 属性保留 OS 默认值：

```bash
JAVA_TOOL_OPTIONS='-Daeron.socket.so_rcvbuf=0' \
  ./gradlew m13Check --no-daemon --max-workers=1
```

这里的 0 表示不调用 setter，绝不是建立零字节接收缓冲；固定 [Aeron 1.52.2 transport 源码](https://raw.githubusercontent.com/aeron-io/aeron/1.52.2/aeron-driver/src/main/java/io/aeron/driver/media/UdpChannelTransport.java) 明确只在配置长度非零时调用 `setOption(SO_RCVBUF, ...)`。相同运行条件用于需要启动这些 child JVM 的 build/evidence 命令；`JAVA_TOOL_OPTIONS` 会传到子进程。本次 environment report 已记录 `-Daeron.socket.so_rcvbuf=0`，运行时为 Eclipse Adoptium `25.0.4.1+1-LTS`、Mac OS X `26.0.1`、`aarch64`。诊断前后已经观察到真实 socket 恢复为 786896、原先缺失的 1408-byte 数据批被接收，继承 M12 的完整故障测试通过。

这是当前受限 macOS 的环境修正，正常 Linux 无需设置。另一台机器不能借用本机的 786896；必须检查实际缓冲与需求。如果环境无法支持原传输参数，应记录 `SYSTEM_ERROR` 并修复环境，不通过减小 MTU、放宽错误断言或把失败重传算作业务反例来取得资格。

## 导出会重新执行资格，并再次检查源码与材料

但仅在结束时给所有文件重新算 hash 仍然不够：如果局部裁判已经接受原记录 A，稍后文件被换成 B，最后只绑定 B 的 hash，就失去了「裁判接受的究竟是哪份 bytes」。`M13ArtifactBindings` 因而在每个生产阶段结束时冻结已裁决的报告与原始摘要；真实 Cluster 的命令 bytes 还要经 Direct 重放，最终成员状态与 written/loaded snapshot 要匹配对应事实。补充诊断文件在该阶段末绑定，最终 inventory 必须与先前绑定完全一致，不能通过末尾重新扫描为变化后的材料取得新身份。

`m13Evidence` 不把已有目录打包后就宣布完成。`M13EvidenceWriter` 先验证 clean tree、annotated completion tag 与 `course.properties`，再 fresh-run `M13CheckRunner`。成功后，它根据报告绑定复制输入、报告、raw artifacts 和 schemas，在 staging 中重新计算各份 bytes 的 hash，复查源码身份后安装最终目录。

因此运行中或复制后的材料变化都应使 export 失败。本次在独立 clean clone 完成完整 build 与 fresh `m13Evidence` 后，逐项核对了 manifest 和它绑定的 204 份 payload；交付身份为：

| 身份                          | 本次材料                                                                 |
| ----------------------------- | ------------------------------------------------------------------------ |
| 完成标签                      | annotated `course/m13-complete`                                          |
| source commit                 | `eb1b65d2ea2159ba607e3271f0bfd209ea4906ea`                               |
| source dirty / productRelease | `false` / `null`                                                         |
| frozen workload SHA-256       | `1b958e3b51f922cc505a47d63090593a6aa69d80c23f2ef2365747cc96154dc3`       |
| manifest SHA-256              | `7a1c5b677f088ccd46b9f4e523151496910aea8874683799b347d57be819ecd7`       |
| manifest generatedAt          | `2026-09-07T07:54:35.099055Z`                                            |
| claim 与限制                  | `finite-static-shard-qualification` 为 `pass`，绑定全部 9 条 limitations |

[Manifest 发布入口](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/manifest.json) 与其相对 artifact 路径随本单元教程一同发布；这里登记的是已经核对的本地导出身份，不据此宣称远端部署或网页视觉验收已经完成。M13 没有产品 release，不能给同一 commit 顺手添加 `matching-*` 产品标签。

复验者可以在完成上述三道运行门禁后，按这条有边界的顺序记录结果：

1. 保留 `HEAD`、annotated tag 的 peeled commit、workload hash 与实际 Java/OS/JVM 参数。
2. 确认 `check.json` 为本次执行产生，场景身份与冻结 workload 一致，缺失或失败没有被部分 PASS 掩盖。
3. 沿一个路由拒绝、一个 mutant、一次真实故障恢复读取原始事实，核对其报告中的结果与状态关系。
4. 确认最终六 member 的清理 witness，再核对 manifest 中每份 artifact 的路径与摘要。

任一步失败都不发布成功材料。这里的步骤是一次可以执行和记录的复验程序，不是另一份泛化生产上线清单。Aeron 的 ClusterTool 可辅助观察本地 Cluster 状态、RecordingLog 与错误，但它也不能代替应用自己验证 snapshot 内容和业务结果。[Operating Aeron Cluster](https://aeron.io/docs/aeron-cluster/operating-aeron-cluster/)

## M13 的停止点是静态分片正确性，不是生产运营资格

本单元固定 instrument 的唯一静态归属，在各 shard 内保留独立 book、持久命令身份和完整原结果，并用有限生成历史与真实双组 fail-stop/restart 实验检查这些合同。公开证据必须同时说明单机条件、有限范围和本次显式运行参数。

M13 没有引入动态迁移、自动均衡、跨 shard 全局顺序、跨交易对事务、柜台、资金、外部副作用或网络 exactly-once；也没有为吞吐、延迟、容量、RTO/RPO、备份或混合版本升级取得资格。M14 才负责可续传输出合同，候选 M15 才负责运营发布资格与 `matching-1.0.0` 停止点。

在这些后续合同开始之前，当前材料应让读者能复验已经交付的静态分片关系，也能准确指出尚未被证明的部分。每个固定标签由此保留一个可以解释、可以重跑、范围清楚的学习起点，后续功能必须在新的合同里承担新增证明义务。
