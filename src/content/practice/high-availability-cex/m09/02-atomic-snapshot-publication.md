---
title: "M09·02：用 force、rename 与目录屏障原子发布 Snapshot"
description: "冻结 M09S1 header identity、临时文件、file force、atomic rename、directory force 与 cut+1 WAL header rollover 的发布资格。"
date: 2026-09-01T09:20:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 20
permalink: atomic-snapshot-publication
tags:
  - 撮合引擎
  - Snapshot
  - Crash Consistency
draft: true
---

> 合同草稿：M09 当前仅为 `CONTRACTED`。本文没有对应 start/complete tag 或公开 evidence，也不声称任何文件系统故障实验已经通过。

把状态编码进文件，不等于这个文件已经成为可恢复的 Snapshot。若 runtime 在 write、force、rename 或目录项持久化之间崩溃，recovery 必须能区分临时残片、可见但未提交的 generation 和完整发布的恢复入口。

本篇要建立的结论是：**M09 不创建独立 recovery descriptor；只有 M09S1 final header identity、final 目录项与 cut+1 durable active WAL header 全部按冻结顺序持久后，最新 generation 才形成完整恢复入口。**

## 临时文件永远不是恢复权威

正文将先区分 `.tmp` 与 final generation。临时文件可以不完整、校验失败或在 crash 后残留，但不能仅因文件名或 generation 数较大就参与恢复选择。

## file force 不能替代 directory force

冻结发布顺序为：

```text
write complete temp Snapshot
→ validate metadata and digests
→ force Snapshot file
→ atomic rename to final
→ force parent directory
→ force rollover to active WAL header at cut + 1
```

正文会逐步解释每个 barrier 拥有什么、没有拥有什么，以及为何“文件内容 durable”不等于“final 文件名 durable”。

## M09S1 final header 就是恢复身份

M09 没有独立 `latest` 或 descriptor 文件，避免出现第二份恢复真相。M09S1 final header 自带 shard、generation、last included WAL/Application sequence 与 semantic/serialization digests；已 force 的 final 目录项证明这个名称持久存在，随后 forced rollover 形成 firstWalSequence=cut+1 的 active WAL header。

recovery 从文件名确定最新 final generation，再用 header identity 与 cut+1 active header 交叉验证。通用 N/N-1 迁移不属于本篇；最新 final 的未知 version、corruption 或 anchor mismatch 必须失败关闭，不能自动选择旧 generation。

## crash timeline 决定候选资格

最终正文会覆盖以下预测点：

| crash point | 需要判断的问题 |
| --- | --- |
| temp body 未写完 | 为什么只能忽略临时残片 |
| file force 前后 | bytes 是否有资格成为 final |
| rename 后、directory force 前 | final 名称能否作为已提交事实 |
| final directory force 后、rollover 前 | Snapshot final 与 cut+1 suffix 是否已经成对 |
| cut+1 WAL header write/force 前后 | generation 是否形成完整恢复入口 |

表中的答案将在未来由命名故障点和本地文件观察校准；当前不填通过状态。

## corruption 与“不完整发布”不能混为一类

不完整 `.tmp` 可以作为非权威残片；完整 final Snapshot 的 CRC、hash、codec、shard 或 anchor 失败则是 corruption/mismatch。后者不能静默删除后回到默认状态。

## 本篇未来怎样验收

进入实现窗口后，需要让 deterministic seam 与 child-process crash 分别覆盖 publication 边界，并明确二者都不是真实断电证明。异常或 harness 故障必须保持 `SYSTEM_ERROR`，不能伪装成语义通过。

## 当前停止点

最新 Snapshot generation 现在拥有明确发布资格，而且没有独立 descriptor 文件。下一篇从 M09S1 final@S 与 cut+1 active WAL header 出发，证明只重放 WAL(S+1...) 与 genesis replay 得到同一 semantic state。
