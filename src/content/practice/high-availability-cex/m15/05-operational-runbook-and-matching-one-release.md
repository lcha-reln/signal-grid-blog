---
title: "M15·05：把部署、停止与恢复承诺交付为 matching-1.0.1"
description: "将固定制品准入、真实角色生命周期、停服切换和冷备恢复编成可执行 runbook，并把 matching-1.0.1 的范围绑定到完整原始证据。"
date: 2026-09-08T08:40:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M15
lessonOrder: 50
permalink: operational-runbook-and-matching-one-release
tags:
  - Runbook
  - 发布资格
  - 可复验性
  - 撮合系统
draft: false
---

> 完成身份：[course/m15.1-complete](https://github.com/lcha-reln/cex-matching/tree/course/m15.1-complete) 与 [matching-1.0.1](https://github.com/lcha-reln/cex-matching/tree/matching-1.0.1) 同指干净提交 `73cbc6524bb14adeb5639f97cb4dc1358f893961`。本文结论来自该身份重新执行的累计资格；[公开 manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m15/evidence/manifest.json) 的 SHA-256 为 `42e1c2d65bd8e11eb8f47a89c4ca01ad92e50b3bbb6821cd5c1b3e1ab40f8aab`。

前四篇分别建立了制品身份、保留新成交的回滚、独立冷备和可信的过载计量。值班人员面对一次实际切换时，需要把这些条件按操作顺序用起来：先检查什么，什么回执允许继续，失败后保留哪些数据。

**这份 runbook 把每一步的输入身份、执行者和完成证据写在一起。** M15 交付目标是批准制品组合在明确环境内的有限运行资格；完成验收后，`matching-1.0.1` 才能代表这里描述的操作范围。本文不引入柜台、资金结算或新的撮合规则。

## 操作记录先固定环境、制品和根目录

M15-O1 允许单主机 macOS/aarch64 或 Linux/amd64、Java 25、至少 4 个逻辑 CPU 和 8 GiB RAM。每个 runtime child 固定 `-Xms32m -Xmx512m` 与所需 Aeron opens；若环境选择 OS 默认 receive buffer，实际 child 参数明确记录 `-Daeron.socket.so_rcvbuf=0`。运行记录还要保存 Java vendor/build、可执行文件身份、VM 参数、OS、文件系统和实际资源观察。

操作者为本次 fleet 分配一个 canonical runId，为每次角色启动分配独立 launchId；重启同一 member 也要换 launchId。deployment 使用两个 shard、每组三 member 的固定身份和无冲突端口，sink 的持久身份是 `m15-sink-o1`。端口可在首次部署时从批准配置选择，版本切换和新根恢复保持原值。

准备材料时分别记录 N 操作包、待选择的 runtime bundle、独立 observer、deployment 的绝对路径与外部批准的 hash。N 的操作程序可以选择原始 N−1 runtime jar；不能把“运行 operations 的 classpath”自动当成“运行业务 child 的 classpath”。

| 准入对象             | 继续条件                                         | 失败时保留什么                        |
| -------------------- | ------------------------------------------------ | ------------------------------------- |
| bundle 与 observer   | 原始 inventory/hash、支持组合和 class 来源均有效 | 原始文件与拒绝结果；不启动角色        |
| deployment/bootstrap | 原 route、genesis、profile、导入状态与身份一致   | 原配置与校验结果；不修写输入          |
| Java/端口/路径       | 属于 O1 环境，显式参数完整，无不安全路径         | 实际环境与拒绝原因                    |
| 新安装目标           | 不存在或为空，且与源不重叠                       | 当前 target inventory；不删除已有文件 |

所有 flag/value 必须完整且各出现一次；不接受未知参数、隐式布尔值或环境变量注入依赖。角色恢复使用既有非空 durable root 是合法操作，不能误套“新安装目标必须为空”的规则。

## 用显式角色命令启动，再核对实际 child

下面展示 member 的完整参数形状。所有变量先从批准的制品和部署记录赋值，均不通过脚本猜测；`m15_fresh_start` 只有该 member 的 archive/cluster 尚不存在时才可为 `true`，任何恢复或版本切换都为 `false`。

```bash
"$m15_operations_bundle/bin/matching-operations" member \
  --bundle "$m15_selected_bundle" \
  --expected-sha256 "$m15_selected_manifest_sha256" \
  --deployment "$m15_deployment" \
  --deployment-sha256 "$m15_deployment_sha256" \
  --root "$m15_runtime_root" \
  --observer-jar "$m15_observer_jar" \
  --observer-sha256 "$m15_observer_sha256" \
  --java-home "$m15_java_home" \
  --run-id "$m15_run_id" \
  --launch-id "$m15_member_launch_id" \
  --shard "$m15_shard_id" \
  --member "$m15_member_id" \
  --fresh-start "$m15_fresh_start"
```

控制端持有该进程 stdin，不能因启动脚本结束而意外发送 EOF。六个 member 分别执行，publisher/sink 则使用同一组公共身份参数和各自独立的 launchId。角色特有参数的完整差异如下；可执行定义见[冻结 CLI](https://github.com/lcha-reln/cex-matching/blob/course/m15-start/docs/specs/m15-bundle-backup-protocol.md)。

| 角色命令    | 公共参数之外的参数                   | 需要核对的业务入口               |
| ----------- | ------------------------------------ | -------------------------------- |
| `member`    | shard、member、fresh-start           | 所选 `M14ClusterMember` 公共 API |
| `publisher` | shard、publisher-id、publisher-epoch | 所选 `M14PublisherProcessMain`   |
| `sink`      | 无额外角色 flag                      | 所选 `M14SinkProcessMain`        |

角色启动界限为 60 秒。父 CLI 的成功创建先记为 TOOL；operations 在实际 child 创建后同步写入 stderr 的 `matching.m15.child-started.v1 / CHILD_STARTED` 记录绑定 runtime PID/startInstant。观察器随后用正常 lifecycle 的 `STARTED` 报告 selected bundle、实际 classpath 与关键类 code source，资格工具核对它们与输入选择一致。这两个阶段分别证明进程已创建与所选运行入口已启动。publisher 的 epoch 参数不授予 sink authority；只有 committed grant 与 trusted ADMIN reconciliation 才建立输出权限。

新启动的普通运行按协议完成必要对账；恢复实验则先比较完整 cut，之后才执行 ADMIN。这个先后顺序应写在本次操作记录中，避免一次“帮助恢复”的控制动作改变了待验证对象。

## 全停服屏障完成后，才允许切换或冷备

停止由控制端关闭自己拥有的九个 runtime role 的输入。每个角色依次保留 EOF、实际 `CLOSE_COMPLETED`、component errors 为空、exit 0 和 no-force。父 CLI 的退出不能代替 child 回执，强杀清理也不能作为正常关闭。

控制端在 90 秒全停服界限内完成 18 个 marks 的真实停止观察与 durable tree 双 inventory，形成 source-bound stop receipt。若角色仍活跃、活动时间仍变化或文件继续变化，切换和备份都不能继续。原根继续保留，失败诊断也保留，直到能解释写者状态。

停止回执按 [mark 终止判据勘误 1](https://github.com/lcha-reln/cex-matching/blob/course/m15-errata-1/docs/operations/m15-mark-termination-errata-1.md) 使用 v2，并逐项保存正值 `lastLiveActivityTimestamp` 与 `inactiveReason`。对正值 stopped heartbeat，最终 wall clock 须晚于该值严格超过 10,000ms；对 `TERMINATED_SENTINEL`，两次 stopped 值都须为 `-1`，同一时间条件改用已绑定的正值 lastLive。两次完整 header 原 bytes 相同、实际读取至少相隔 100ms，身份一致且已有正常关闭证明，才允许继续。不能用 `-1` 自身计算过期，不能改 mark，也不能只因看到哨兵值就复制或恢复活动根。

要保留 N 的新增成交，按照第二篇从全停服的 CURRENT N roots 用原 N−1 启动，检查 B 再推进到 C。要保存命名 cut，则给 `backup` 传入已经取得的 stop/cut 原 bytes 与独立 hash：

```bash
"$m15_operations_bundle/bin/matching-operations" backup \
  --bundle "$m15_selected_bundle" \
  --expected-sha256 "$m15_selected_manifest_sha256" \
  --deployment "$m15_deployment" \
  --deployment-sha256 "$m15_deployment_sha256" \
  --root "$m15_runtime_root" \
  --stop-receipt "$m15_stop_receipt" \
  --stop-receipt-sha256 "$m15_stop_receipt_sha256" \
  --cut "$m15_cut" \
  --cut-sha256 "$m15_cut_sha256" \
  --target "$m15_backup_target"
```

`backup` 重新验证来源与停止证据；返回 `CREATED / OK` 才表示完整备份安装完成。新根恢复再按第三篇执行 `inspect`、`restore`，并显式启动角色。恢复安装、角色启动、完整 cut 对比、输出 reconciliation 和新成交是分别可失败的阶段，不能只看最后一个 exit code。

## 失败分类决定能否重试和怎样保全现场

运营工具有意拒绝坏输入，与执行环境出错，后续处理不同。操作结果中的稳定 code 负责判定，`message` 只供诊断，不能按一段异常文本决定成功。

| 结果                    | 已知事实                          | runbook 的下一步                                        |
| ----------------------- | --------------------------------- | ------------------------------------------------------- |
| exit 2 / `REJECTED`     | 已读输入违反明确合同              | 按 code 修正批准材料，保留坏输入与未变 inventory        |
| exit 3 / `SYSTEM_ERROR` | I/O、组件或期限使操作未按合同完成 | 保留原 bytes、进程与清理证据，解释故障后重新执行        |
| `CREATED` 后角色失败    | 安装曾成功，但运行资格失败        | 保留已安装目标与后续实际 child 失败，不伪称整体恢复成功 |
| 请求 `UNKNOWN`          | 是否应用仍不能确认                | 在冻结界限内用原身份 reconciliation，不能当作未成交     |

对同一生产入口关闭实际 write channel，可以验证 I/O 失败没有损坏目标。这项测试通过的是保护性断言，原操作分类仍为 SYSTEM_ERROR，不计 malformed-input rejection 或 semantic mutant kill。反过来，合法读取到坏 gzip bytes 应被严格 parser 明确拒绝，不能靠一个无关 IOException 冒充识别了坏数据。

有限历史也需要进入操作解释。M14 保留身份与输出历史，M15 没有新增裁剪；2,000,000 条 operation guard 包含 ACK 等控制操作。精确旧 retry 可读，不代表新业务或 drain 控制永远还有准入空间。容量报告必须保存历史增长和实际 guard 条件，不能用定期重启暗示它释放了永久身份历史。

## 资格交付的是可以重新计算的有限证据

本单元冻结 V01–V04、B01–B06、R01–R06、C01–C06 共 22 个 case family、109 个 named variant 和 118 个无条件 probe。容量计划为 seed 6515 的6250个逻辑到达，真实条件触发的额外 probe 另记；这些数字是完整执行义务，不是覆盖所有故障的证明。

原始证据至少要让复验者回答四组问题：选定并实际加载的是哪套制品；当前数据与冷备分别命名哪个 cut；每次实际操作如何分类；九个角色最终怎样退出。原 bundle bytes、完整压缩 backup、logical/attempt 账、生命周期、资源与诊断以及 fresh M14/M13 继承证据都参加绑定。

证据预算为最多512个 artifact、总量384 MiB、单项32 MiB，manifest 单独计算。[M15RawTrace](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15RawTrace.java) 将原 bytes 分块保存到 gzip；[M15RawReader](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15RawReader.java) 必须检查每份引用、长度、hash、顺序与完整结束。完整继承报告另用带索引的 DEFLATED ZIP 无损保存，逐项记录原路径、长度、hash 和所在分块，再有界解压核对全部原文件恰好出现一次。报告打包不改变第三篇的冷备 envelope。

成员状态仍每次完整读取。同阶段的 `MEMBER_STATE` 若 hash 与完整字节都相同，可以引用此前原件，同时为这次复读记录时间与来源。缓存同时受16项和16 MiB约束，独立读取器会拒绝不存在、错阶段、错类型或内容不符的引用。其他请求、响应、资源和生命周期原件分别保存。负向报告在执行时绑定原 bytes，最终按 JSON 整数值核对结构，并要求持久化文件与原件逐字节相同。重新排版或替换文件后计算出的新 hash 不能代替执行时的绑定。

完成源码中，`M15Operations.execute` 是 CLI 和真实边界负例共同调用的生产入口；[M15OperationsNegativeSuite](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15OperationsNegativeSuite.java)、[M15OperationsNegativeSuiteTest](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/test/java/io/github/lchareln/cex/matching/testkit/M15OperationsNegativeSuiteTest.java) 检查 B/R 的坏输入与真实 I/O，[M15BundleProcessHarness](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15BundleProcessHarness.java) 执行选定制品的真实角色。总体入口 [M15CheckRunner](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15CheckRunner.java) 重新执行全部阶段，再由独立读取器核对原始记录。下列汇总来自页首完成身份导出的实际报告。

本次累计资格通过 22 个 case family、109 个变体、118 个无条件 probe 与 1 个实际条件 probe；6,250 个逻辑到达、完整历史重启与最终正常停止均已核验。正式导出包含 363 个 artifact、共 226,753,110 bytes、1 项有限资格 claim 与 15 条 limitation。原件集合、两层账本和完整继承报告均可从页首 manifest 逐项取得。

`matching-1.0.0` 的同提交候选 CI 和本地导出曾通过，随后三次发布 CI 分别在继承重启、B05 启停和容量目录采样中失败，网站没有发布这一版。[发布修订契约](https://github.com/lcha-reln/cex-matching/blob/course/m15-errata-2/docs/operations/m15-publication-revision-1.md)单独冻结在 `course/m15-errata-2`，提交为 `02e083a31953aa983d893af2222f4fde1197ea96`。修订只调整资格工具，五个生产模块的源码树保持不变。原失败标签和 SYSTEM_ERROR 分类保留；本次 manifest 中的精选失败原件用于解释修订，不是旧运行的完整归档或本次通过结果。

继承 M14 的重启仍检查原 Archive mark，并要求从实际观察到旧进程退出起，严格超过原生 10 秒 liveness 界限。Cluster 的 heartbeat 可能比 Archive 更新，所以 Archive 先失活不能单独授权重启。工具不改写 mark，也不忽略原生准入失败。

## 完成身份与产品标签必须指向同一次干净资格

发布顺序从 clean candidate 开始：完整 build、当前累计 M14/M13 和 M15 资格都通过，再由对应源码 CI 验证。`course/m15.1-complete` 与 `matching-1.0.1` 两个 annotated tag 应指向相同干净 HEAD；`m15Evidence` 在这个身份重新执行并导出原始证据。

单独的 `m15Check` 保持 `productRelease: null`，并用 `releaseTarget` 命名预定停止点。它证明这次运行通过资格，不负责发布产品。`m15Evidence` 核对两个完成标签及声明后，才在最终 manifest 的 `productRelease` 中登记 `matching-1.0.1`；内含的原检查报告仍保留自己的字段值。

原 `course/m15-start` 的 31 文件 inventory、`course/m15-errata-1` 的 47 文件 inventory，以及 `course/m15-errata-2` 的 14 文件 inventory 都要进入这次核验。当前检查 schema 为 `matching.m15.check.v3`，另外绑定发布修订 inventory 的原始 hash。第一份勘误修正停止 mark 的解释，发布修订则约束重启等待、B05 输入顺序与目录采样。两者均未更换 N−1 jar、业务/持久格式、A/B/C/D 程序或容量分母；勘误 CI 通过也没有把原失败运行改成 M15 PASS。完成复验仍须重新执行，入口按实际阶段使用：

```bash
./gradlew clean build --no-daemon --max-workers=1
./gradlew m15Check --no-daemon --max-workers=1
# 只有完成与产品 tag 已正确绑定 clean HEAD 后才执行正式导出：
./gradlew m15Evidence --no-daemon --max-workers=1
```

页首完成身份的累计资格与正式导出已通过；五篇教程和全部 manifest-bound 原件一同登记。复验时仍需核对实际下载内容的 hash，再检查文章导航、搜索和浏览器呈现。起点的预期 RED 保留为历史材料。

`matching-1.0.1` 的操作边界到这里为止：批准版本组合、同主机同端口、正常全停服、完整冷备新根恢复以及 M15-O1 有限到达下的运行资格。它没有承诺滚动混版本、任意迁移、跨主机或断电恢复、全历史常数内存，也没有给出通用 TPS/RTO/RPO/SLO。只有这些实际证据和发布步骤完成后，Matching 才达到进入 Counter 仓库门禁的停止点。
