---
title: "M15·03：原目录已经不可用，冷备还能够恢复什么"
description: "从完整停机切点出发，保存六成员数据、bootstrap 与 sink journal；用严格 gzip 和隔离安装证明新根恢复没有偷偷依赖原目录。"
date: 2026-09-08T08:20:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M15
lessonOrder: 30
permalink: cold-backup-and-relocated-restore
tags:
  - 冷备恢复
  - 持久化
  - gzip
  - 撮合系统
draft: false
---

> 完成身份：[course/m15.1-complete](https://github.com/lcha-reln/cex-matching/tree/course/m15.1-complete) 与 [matching-1.0.1](https://github.com/lcha-reln/cex-matching/tree/matching-1.0.1) 同指干净提交 `73cbc6524bb14adeb5639f97cb4dc1358f893961`。本文结论来自该身份重新执行的累计资格；[公开 manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m15/evidence/manifest.json) 的 SHA-256 为 `42e1c2d65bd8e11eb8f47a89c4ca01ad92e50b3bbb6821cd5c1b3e1ab40f8aab`。

停止服务后复制几个目录，再用原目录启动成功，能证明备份可用吗？这次启动可能仍读取原来的配置、旧 archive 或 journal。备份里缺失的内容没有参与实验，自然也不会暴露。

**M15 要求恢复进程只依赖完整备份和明确选定的运行制品，在原运行根路径不可用时安装到空的新绝对根。** 端口与身份仍保持不变，范围是同主机有序停服后的冷备恢复。上一篇回滚保留 N 的当前后缀；本篇有意恢复之前命名的 A 切点，两个承诺的数据边界不同。

## 备份对象由恢复责任决定

只备份最后一个业务 snapshot，会漏掉 snapshot 后的日志、Aeron Archive/Cluster 的恢复元数据以及 sink 已持久接收但上游尚未确认的输出。诊断文件虽然能展示当前状态，也没有因此成为可启动的数据格式。

M15 的冷备集合由四组责任共同确定：

| 责任           | 必须保留的原始内容                                                                                     | 缺失时可能出现的错误                     |
| -------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------- |
| 六成员各自恢复 | 每个成员完整 archive/cluster regular files，包括 catalog、segments、recording.log、node-state 与 marks | 只恢复某一成员，或只能恢复旧前缀         |
| 解释启动身份   | deployment 与七个原始 bootstrap 文件                                                                   | 将当前 active route 错当成导入时 route   |
| 解释输出接收   | sink 身份及完整 journal                                                                                | 重放时再次接收已经持久保存的 batch       |
| 证明备份切点   | source bundle manifest、cut、stop receipt 及二者引用的原材料闭包                                       | 文件自洽，却无法证明来自所命名的停止状态 |

bootstrap 的 route、genesis、imported M13 snapshot 有历史对应关系。恢复保存原 deployment bytes，用新 root 解析相对路径，不能为了“适应当前状态”重写原 route。当前 active route 来自恢复 cut；混用两者会让启动来源与恢复状态互相矛盾。

publisher 的临时目录、`aeron/` 与普通 diagnostics 可以重建，不递归塞进 durable backup。资格确实需要的诊断原材料，通过 cut/stop refs 明确纳入。这样备份的文件集合可以做等集比较，不依赖操作者猜哪些文件“看起来重要”。

完整文件集合还受冻结的路径语法约束。实际 leader 故障后，固定版本 Aeron 会把先前的告警保存为带时间戳的 `CONSENSUS_MODULE-…-error.log`；时区中的 `+` 不在当前备份路径语法内。运行目录准入能够识别并保留这种原生日志，备份则仍会拒绝不符合路径合同的 durable tree。不能删除、改名或漏掉日志来制造成功。本单元的冷备资格对应明确命名的 A 切点，不能扩展为任意故障后目录都可备份的承诺。

## 停机证明和双 inventory 限定了这份副本的时间

`backup` 不负责停止 fleet。调用者先取得上一篇的九角色 EOF/close/exit 证明、18 个 marks 的真实停止观察和完整 cut，再把它们的路径与独立 hash 传给备份命令。

[mark 终止判据勘误 1](https://github.com/lcha-reln/cex-matching/blob/course/m15-errata-1/docs/operations/m15-mark-termination-errata-1.md) 将新产生的停止回执明确为 v2。正常 Aeron 终止后的 mark 可以是 `-1`，但必须绑定先前正值的 `lastLiveActivityTimestamp`，并满足真实超过 10,000ms 的时间条件和至少相隔 100ms 的两次相同完整 header 读取。backup 的 v1 envelope 不变，继续按长度/hash 保存 cut 与 v2 stop 原 bytes；包括原 stop v1 Schema 在内的 31 个起点文件不被改写，也不拿 v1 Schema 验证 v2。

生产入口需要重新核对停止是否成立。它不能打开带修复行为的 journal 构造器来“检查”备份源，也不能在仍有 writer 时边复制边接受内容变化。读取前建立完整源 inventory，流式读取后再核对全部文件与 marks。源变化应报告 `SOURCE_CHANGED`，停止证据不足应报告 `STOP_NOT_PROVEN`，真实状态与 cut 不符应报告 `CUT_MISMATCH`。

inventory 本身与随后产生的 receipt 不参加对自身的递归扫描。它扫描的对象是六套完整 archive/cluster、deployment、七个 bootstrap 与 sink journal；cut/stop 的材料另外通过 refs 闭合。同一路径被两张 refs 表引用时，长度与 hash 必须一致，原 bytes 只需保存一份。

这也解释了为什么“两个文件的 hash 都合法”仍可能不能恢复：一个 member mark 被另一成员的合法 mark 替换，或者 A 的备份混入 B 的真实 state 材料，单文件完整性并未破坏，整体身份与切点却已经错误。

## 压缩限制必须同时约束存储量和展开量

Archive segment 可以很大，其中又可能含大量零字节。小压缩包不代表小输入。M15 同时限制逻辑文件数、展开大小、压缩大小和工作 buffer：最多 512 个逻辑文件，每项展开不超过 256 MiB、总展开不超过 16 GiB；每项完整 gzip 不超过 32 MiB、合计不超过 128 MiB；流式 buffer 为 65,536 bytes。

每个逻辑文件对应一个 gzip，没有 tar 或额外 envelope。写端固定十字节 header、raw DEFLATE level 6/default strategy、CRC32 和 ISIZE。这个 envelope 约束没有声称不同 JDK 的 DEFLATE bitstream 必然相同；每次产生的原始压缩 bytes 都单独计算并保存 hash。

读端先检查原 compressed 长度和 hash，再流式展开。它必须验证正常 DEFLATE 结束、展开长度/hash、CRC、ISIZE、准确 trailer 和物理 EOF。第二个 gzip member、trailer 后垃圾、截断或未知 header 都不能被忽略。只用一个“能解出前半段”的通用解压结果，很容易把这些异常当作合法备份。

[M15Gzip](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-operations/src/main/java/io/github/lchareln/cex/matching/operations/M15Gzip.java) 的正向边界包括空文件和 128 MiB 稀疏源文件。稀疏指的是实际文件系统分配少于逻辑长度，需要真实 `stat` 观测；压缩与恢复仍处理全部逻辑 bytes，不能删零洞或只比较首尾标记。测试应同时保留实际分配量、完整逻辑 hash 和原 compressed bytes。

## 只读验证通过后，才写入隔离 staging

`inspect` 应完整检查 archive、逐文件展开和切点闭包，保持只读；只读了 manifest 不能报 `VERIFIED`。`restore` 先完成同样的只读验证，再向目标同父目录的 owned staging 写入，写完复验全部 staged bytes，最后用同文件系统的 atomic rename 安装。

目标只能不存在或为空。目标在预检后出现文件，也必须在安装边界重新拒绝，不能先删除再宣布安全。源与目标重叠、符号链接或 staging 跨文件系统均不属于允许的路径。

下面是恢复命令形状；路径与 hash 来自本次批准的 bundle 和备份记录：

```bash
"$m15_bundle/bin/matching-operations" inspect \
  --backup "$m15_backup" \
  --backup-sha256 "$m15_backup_manifest_sha256"

"$m15_bundle/bin/matching-operations" restore \
  --bundle "$m15_bundle" \
  --expected-sha256 "$m15_bundle_manifest_sha256" \
  --backup "$m15_backup" \
  --backup-sha256 "$m15_backup_manifest_sha256" \
  --target "$m15_new_root"
```

安装成功返回 `CREATED`，但 `restore` 不启动任何角色。真实 write/force/rename 失败仍是 `SYSTEM_ERROR`，必须留下可解释的失败记录与未破坏的原 root，不能把一个可启动的半根当作成功结果。B06/R06 的资格直接在生产写入边界关闭真实 channel，观察实际 I/O 失败；预先安排一个假异常不能证明这条路径。

## 新根启动后，先比较 A，再进行输出对账

独立冷备实验会将原 runtime root 改名隔离，使原配置路径不可用。恢复操作只得到新 root、备份和选定制品，不得到隔离目录作为备用配置。新角色使用相同 ports/IDs，并明确 `fresh-start=false`。

第一项业务检查发生在任何新 ADMIN、grant 或 ACK 之前：六成员完整状态和 sink journal/cut 必须对应 A。A 的 Execution 复制 ACK 为 15，而 sink 已保存 16；Market ACK 为 2，保留窗口已从 7 开始。没有 authority reconciliation 时，恢复不能擅自信任 publisher 自报的 epoch，应明确要求 `ADMIN_RECONCILIATION_REQUIRED`。

随后用旧 epoch 1 完成明确的 ADMIN 对账，重发 Execution 16 时 journal 不增加重复记录；再取得 epoch 2 的 committed grant 并完成 trusted ADMIN 安装。旧 publisher 仍活着时，实际旧 DATA 与缓存 ACK 要被 fencing 拒绝。完成这些观察后，旧 publisher 正常 EOF，新的 publisher 才继续接管工作。

最后 drain Execution 16–23，Market 通过完整 snapshot 22 弥补缺口，再每 shard 新成交两笔，形成独立 D：business 25、Execution 25、Market 24，maker 剩余 978，pending 为 0。这个 D 来自 A 的冷备，不能与上一篇保留 N 后缀的 C 混为同一次恢复结果。

## 原 bytes 让失败也可以重新检查

冻结依据见 [bundle/备份协议](https://github.com/lcha-reln/cex-matching/blob/course/m15-start/docs/specs/m15-bundle-backup-protocol.md) 与 [进程协议](https://github.com/lcha-reln/cex-matching/blob/course/m15-start/docs/specs/m15-process-protocol.md)。当前 [M15Gzip](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-operations/src/main/java/io/github/lchareln/cex/matching/operations/M15Gzip.java)、`M15Operations.execute` 的生产接缝与 [M15OperationsNegativeSuite](https://github.com/lcha-reln/cex-matching/blob/course/m15.1-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M15OperationsNegativeSuite.java) 共同承担 R04–R06：缺失/混合材料、严格 gzip、真实恢复 I/O 和安装后启动失败都要分别验收。

启动失败不能倒改前面真实的 `CREATED` 事实，也不能让整体恢复资格通过。报告应同时保留安装后的完整 inventory、实际 child 启动与后续 `COMPONENT_FAILURE`。负向坏 payload 的原 compressed bytes 与未变来源 refs 都要闭合到可还原内容；gzip 分块与内容引用可以节省重复存储，不能把内容缩减成 hash。

本次 R 系列正向与负向结果均通过；[原备份 manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m15/evidence/reports/check/backup/manifest.json)、完整压缩原件和 D 切点由页首 manifest 绑定。有序停服、完整原字节和原根不可用的新根实验共同支持这一份冷备承诺；当前 Archive/Cluster sync 默认配置与实验范围没有提供突然断电、磁盘毁损或跨主机恢复保证。
