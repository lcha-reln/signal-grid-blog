---
title: "M09·04：在双重 RecoveryBudget 内安全回收 WAL 前缀"
description: "冻结 64 records、1,048,576 encoded bytes 的 replay 上限，以及后继 generation、prefix retirement 与目录持久化顺序。"
date: 2026-09-01T09:40:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 40
permalink: wal-prefix-retirement-and-replay-bound
tags:
  - 撮合引擎
  - WAL Retention
  - Recovery Budget
draft: true
---

> 合同草稿：M09 当前仅为 `CONTRACTED`。RecoveryBudget 是已签约输入，不是已经测得的性能数字；本文没有完成 evidence 或恢复耗时结论。

Snapshot 存在并不自动带来有界恢复。若 suffix 可以无限增长，启动仍可能重放任意多 record；若为了缩短恢复直接删除旧 WAL，又可能在 Snapshot 尚未真正可恢复时删掉唯一权威历史。

本篇要建立的结论是：**M09 同时冻结 records 与 encoded bytes 两个上限；任一维度将越界前必须发布后继恢复 generation，旧前缀只能在新恢复集合完整持久后回收。**

## RecoveryBudget 同时限制 records 与 bytes

合同值为：

```text
maxReplayRecords = 64
maxReplayBytes   = 1_048_576
```

records 从 Snapshot cut 后第一条 suffix record 开始计数；bytes 按完整 M08W1 encoded record bytes 累加。任一维度达到上限都视为预算耗尽，避免少量超大 record 绕过 record count。

这两个值只证明恢复工作量的结构上限，不是 RTO、p99 或毫秒承诺。

## 下一条命令不能把 suffix 推过预算

runtime 在接受会让任一维度越界的新命令前，必须在同一 caller-serialized 维护边界形成后继 Snapshot 与 suffix anchor。若 Snapshot publication 失败，新命令不能获得 ACK，也不能继续让 WAL 无界增长后仍声称“有界”。

正文完成时将精确区分“达到上限仍合法”与“下一条会越界”的边界，避免 off-by-one。

## 前缀回收以完整恢复集合为前置

删除旧 WAL 前必须同时成立：

```text
latest M09S1 final header identity durable
final Snapshot directory entry durable
cut + 1 active WAL header durable
old WAL prefix retained until all three facts hold
```

M09 没有独立 recovery descriptor；M09S1 final header、已 force 的 final 目录项与 cut+1 active WAL header 是唯一恢复描述。这是一条可证明的所有权转移，不是“Snapshot 文件看起来存在就删旧日志”。

## unlink 与 namespace 变化也需要持久屏障

prefix segment 删除、generation 切换和目录清理都改变 namespace。相应 parent-directory force 失败时，runtime 不能假定旧文件已消失或新集合已完整提交。

最终 crash matrix 会覆盖 delete 前、delete 中、delete 后和 directory force 前后，并要求每个窗口要么保留至少一套完整 recovery set，要么明确 fail closed。

## 最新 final 无效时不能自动回退旧代

recovery 始终选择最新 M09S1 final generation。若它 corruption、anchor 不匹配、cut+1 active header 无效或 suffix 有洞，必须失败关闭；不能自动选择旧 generation，也不能删除坏文件后创建空 engine。crash 后残留的旧 prefix 只是可忽略冗余，不是第二套自动 fallback 真相。

## 本篇未来怎样验收

结构化 RED 需要冻结 records/bytes 的边界样本、M09S1 final-directory/cut+1 rollover/prefix-retirement fault points 和预算相关 semantic mutants。完整实现还要保存最新 final header identity、suffix counts/bytes、删除集合和目录持久化观察。

## 当前停止点

合同已经把“Snapshot 可以恢复”推进到“恢复工作量受 64 records / 1,048,576 encoded bytes 双重上限约束，且回收不丢权威历史”。最后一篇设计能反对过早发布、错误回放和过早回收的证据体系。
