---
title: "M09·03：证明 Snapshot 加连续 WAL suffix 等价于 genesis replay"
description: "冻结 Snapshot anchor、suffix 的精确起点、逐条一次 apply，以及完整状态和 original result 的恢复等价。"
date: 2026-09-01T09:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M09
lessonOrder: 30
permalink: snapshot-suffix-recovery-equivalence
tags:
  - 撮合引擎
  - Snapshot Recovery
  - WAL Replay
draft: true
---

> 合同草稿：M09 当前仅为 `CONTRACTED`。本文描述待证明的等价关系，不引用不存在的 M09 digest、scenario 或完成报告。

Snapshot 的价值不是“启动时少读几个文件”，而是替换 genesis replay 的起点且不改变任何业务结论。如果 included record 被重复 apply、suffix 第一条被跳过，或只恢复 book 而漏掉 original result，运行时仍可能启动，却已经不是同一个状态机。

本篇要证明的命题是：

```text
restore(completeSnapshot@S)
+ replay(continuousWalSuffixFromS+1)
== genesisReplay(allDurableRecords)
```

等号比较 semantic state，不比较临时路径、generation 名称等 runtime metadata。

## Snapshot anchor 规定 suffix 的唯一第一条

Snapshot 必须同时冻结 last included WAL sequence 与 ApplicationSequence。恢复后的第一条 record 只能是精确下一序号，并且其 expected application position 必须与恢复出的 state 一致。

gap、duplicate、wrong shard、wrong generation 或 anchor mismatch 都不能通过“扫描下一条看起来合法的 record”修复。

## install 必须恢复完整状态而不是重新执行历史猜状态

正文将沿第一篇的 state contract 逐域检查：book、registry、RuleSet、mode、sequence、producer cursor、durable identity 和 original canonical result。安装 Snapshot 不产生业务事件，也不推进 sequence。

## included record 不得二次 apply

若 recovery 从 S 而不是 S+1 开始，Place、Mass Cancel 或 Activate RuleSet 可能重复改变状态。即便某条 duplicate 被 identity index 拦住，也不能借此掩盖错误的恢复游标；恢复日志本身必须精确一次 apply。

## suffix 每条 record 都必须连续重放

结构合法但业务拒绝的命令同样属于 WAL suffix，并推进 ApplicationSequence。跳过一条 rejection 可能暂时不改变 book，却会让后续 activation/mode fence 错位，因此“最终盘口相同”不是合格等价判据。

## 三条观察路径必须结构独立

未来 judge 至少比较：

1. M08 genesis replay；
2. 不解析 production Snapshot bytes 的独立 semantic model；
3. M09 Snapshot+suffix recovery。

每个 operation boundary 都要比较 sequence、book/control state、durable binding、original result 与 semantic digest。production serializer 与 deserializer 互相同意不是独立证据。

## corruption 或不等价必须失败关闭

恢复不得把 `HALTED` 改成 `OPEN`，不得丢 prepared RuleSet，不得重新接受 terminal orderId，也不得为旧 duplicate 计算新结果。任何无法证明的字段、suffix 洞或 digest 分叉都阻止 runtime 进入 OPEN。

## 当前停止点

Snapshot@S 与连续 suffix 的等价合同已经闭合，但 WAL 仍可能保留 genesis 前缀。下一篇加入 records+bytes 双重 RecoveryBudget，并说明何时才有资格删除旧前缀。
