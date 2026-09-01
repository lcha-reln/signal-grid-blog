---
title: "M09·05：用独立模型与故障窗口验证 Snapshot 恢复"
description: "设计 fixed/generated history、三方等价、publication/retirement 故障窗口、semantic mutants 与诚实 limitations。"
date: 2026-09-01T09:50:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 50
permalink: snapshot-fault-injection-and-recovery-evidence
tags:
  - 撮合引擎
  - 故障注入
  - Release Evidence
draft: true
---

> 合同草稿：M09 当前仅为 `CONTRACTED`。下文列出必须形成的证据类别，不填造 scenario 数、digest、mutant kill、complete commit、manifest hash 或通过状态。

Snapshot happy path 很容易自证：保存、重启、看到相同盘口。真正危险的实现往往也能通过这个测试——遗漏 HALTED、included record 重放一次、suffix 跳过一条 rejection、Snapshot 未 directory force 就被选中，或在新恢复集合提交前删除旧 WAL。

本篇要建立的证据结论是：**fixed/generated history、独立 semantic model、实际 Snapshot/WAL 文件账本和 executable mutants 必须共同约束 state cut、publication、suffix equivalence、RecoveryBudget 与 prefix retirement；意外异常不能冒充语义反例。**

## 先把主张拆成可观察事实

未来 evidence 至少需要分别回答：

- M00～M08 累计语义是否回归；
- Snapshot 是否包含完整已 apply state；
- publication 是否跨过正确的 file/final-directory barrier，并形成 cut+1 durable active WAL header；
- Snapshot+suffix 是否与 genesis replay 等价；
- records/bytes 两个预算是否都被执行；
- prefix retirement 后是否仍有完整 recovery set；
- corruption、gap 与 mismatch 是否失败关闭；
- local-runtime 架构是否仍无 Aeron、网络、数据库与后台线程。

一个总布尔值不能替代这些独立 claim。

## fixed history 要覆盖状态丰富度与 crash 窗口

READY 前将冻结可寻址 scenario，而不是完成时临时补样例。场景必须覆盖非空 book、terminal identity、durable business rejection、prepared/active RuleSet、HALTED/CANCEL_ONLY、duplicate result、Snapshot cut 前后、publication 各 barrier、suffix replay、预算边界、prefix delete 和 corruption/mismatch。

当前合同不预写 scenario 数或通过比例；这些数字必须随结构化 RED fixture 一起冻结。

## generated history 的 operation 不只是 submit

生成域需要包含 submit、exact/conflicting retry、Snapshot、restart、generation cutover、prefix retirement、corruption fixture 与命名故障注入。每条 history 使用 fresh runtime/model/ledger，保存 seed、operation grammar 和 shrink 后最小历史。

RecoveryBudget 的 `64 records / 1,048,576 encoded bytes` 必须在生成器中分别出现临界值、等于上限和下一条越界 witness。

## 三方裁判避免 production 自证

三条路径为：

```text
M08 genesis replay
independent semantic model without production Snapshot parser
M09 Snapshot + suffix recovery with actual files
```

第三个 durability ledger 另行观察 M09S1 header identity、write/force/rename/final-directory force、cut+1 WAL header rollover/force、prefix unlink、ACK、runtime state 与 latest-final recovery eligibility。M09 不创建独立 descriptor 文件；相同 production codec 不能同时充当被测实现和 reference。

## semantic mutants 必须改变真实恢复行为

至少要能反对这些错误族：

- 省略 book、control state 或 durable identity；
- 在 apply 前取 cut；
- directory force 前选择 Snapshot；
- 重放已 included record；
- 跳过第一条或中间 suffix record；
- 新 recovery set 提交前回收旧前缀；
- 最新 final corruption 后自动选旧 generation 或回默认状态；
- 只检查 records 或只检查 bytes；
- 预算耗尽后继续 ACK。

每个 candidate 都要真实改变 state、file、selection 或返回结果，并从 fresh runtime strict replay 得到同一 property fingerprint。

## `SYSTEM_ERROR` 与受控 fault 分开分类

reference/parser/fixture/shrinker 意外异常、临时目录故障或 candidate 直接抛错都不是 `STUDENT_FAILURE`。受控 fault 本身也不是通过条件；必须观察禁止 ACK、合法 recovery set、sequence/digest 和 fail-closed 结果。

deterministic injection 与 child JVM crash 证明的层次不同，两者都不能声称真实断电、真实 ENOSPC、特定文件系统或硬件 cache 已合格。

## 静态 evidence 的公开边界

只有达到 `CODE_VERIFIED` 后，注册表才允许冻结 complete ref、完整 commit、仓库 evidence path、claim/limitation、`reportFacts` 与 manifest SHA-256；达到 `PUBLISHED` 时才把完整 evidence 和五篇教程原子公开。

M09 不登记浏览器 L2 Lab。网页未来只读取同源静态报告，提供 state-field 预测、crash timeline 与 generation 选择；Java、真实文件 I/O、故障注入和 judge 均由读者本地运行。

## 当前停止点

当前交付只是可执行证据的设计合同，不是证据本身。即使未来全部有限门禁通过，M09 仍只是单进程、单 shard、caller-serialized 的本地 Snapshot 恢复；它不证明通用格式迁移、性能、Aeron、复制、故障切换、真实断电或 production readiness。
