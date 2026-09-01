---
title: "M09·01：冻结 Snapshot 的完整状态与一致性切点"
description: "说明为什么 Snapshot 不是订单簿 dump，并冻结完整已 apply state、sequence anchor 与 caller-serialized cut 的边界。"
date: 2026-09-01T09:10:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 10
permalink: snapshot-state-and-consistent-cut
tags:
  - 撮合引擎
  - Snapshot
  - 状态恢复
draft: true
---

> 合同草稿：M09 当前仅为 `CONTRACTED`。尚无 `course/m09-start`、实现、完成 evidence 或通过结论；本文只冻结未来教程的论证顺序，不能作为代码已经交付的证明。

M08 已能从 genesis WAL 重建状态，却必须重放全部历史。加入 Snapshot 时最容易犯的错，是只保存“当前盘口看起来是什么”。订单簿相同并不代表撮合运行时相同：market mode、prepared RuleSet、terminal order identity、producer cursor 和 original duplicate result 都可能改变下一条命令的答案。

本篇要建立的结论是：**M09 Snapshot 必须冻结一个完整已 apply 的 semantic state cut；cut 位于两条 caller-serialized 命令之间，不存在并发 apply 或半完成控制动作。**

## 订单簿相同不代表恢复状态相同

正文完成时将用最小反例比较两份盘口相同、但控制状态或 durable identity 不同的运行时，并让读者先预测下一条 Place、Activate RuleSet 或 duplicate retry 的结果。

需要区分的状态域包括：

- 订单簿、同价 FIFO identity 与剩余量；
- lifecycle/terminal registry 与 AcceptanceSequence；
- prepared/active RuleSet、activation fence 与规则归因；
- `OPEN/CANCEL_ONLY/HALTED`、mode revision 与 transition fence；
- producer epoch/next sequence 与 commandId/Slot 双向 binding；
- 业务拒绝和 duplicate replay 所需的 original canonical result；
- last included WAL/Application sequence 与下一恢复位置。

## Snapshot state contract 必须覆盖完整已 apply 状态

这一节将把每个字段映射到“遗漏后哪条后续命令会分叉”，而不是只列 Java 类名。Snapshot schema 是内部恢复合同，不是 REST、Aeron 或对外公开协议。

特别需要证明：从 `HALTED` 恢复不能默认回 `OPEN`；prepared 但未激活的 RuleSet 仍是完整状态；terminal order identity 不能因订单已离开 book 就被丢弃；durable business rejection 不能在 duplicate retry 时重新计算。

## 一致性 cut 位于两条命令之间

M09 仍是 caller-serialized 单写者。冻结切点为：

```text
previous command fully append/force/apply/result-complete
→ capture Snapshot cut
→ next command has not started
```

Snapshot 动作本身不消耗 ApplicationSequence，也不与 apply 并发。正文会解释 last-included WAL/Application sequence 为什么必须与 state bytes 同属一个 cut。

## 当前没有“半完成控制动作”需要保存

Prepare RuleSet、Activate RuleSet、Change MarketMode 和 Mass Cancel 都是 M08 中同步、确定性的完整命令。Snapshot cut 只会看到命令 apply 前或 apply 后，不会看到“执行到一半”。

prepared RuleSet 是一份完整已 apply 状态，不是 in-flight 操作。M09 不为未来后台任务虚构 pending queue、线程状态或异步 continuation 字段。

## semantic digest 与 serialization digest 证明不同事情

semantic digest 用于比较恢复后的业务含义；serialization digest/CRC 用于校验某个 Snapshot 文件的 bytes。正文将给出同语义不同编码与同字节校验但漏业务字段的反例，阻止两类证明互相冒充。

## 本篇未来怎样验收

进入 `READY` 后，本篇将绑定结构化 RED 中的 state schema、遗漏字段 mutants、fixed scenario 与独立 semantic model。当前不引用不存在的 runner、tag、报告或数字。

## 当前停止点

合同已经说明 Snapshot 应保存什么、cut 在哪里，以及为什么当前没有半完成控制动作。下一篇只处理“这些完整 bytes 怎样原子成为可选恢复 generation”，不提前讨论 suffix 回放或前缀回收。
