---
title: "M13·03：恢复多张订单簿，也要恢复路由与原始结果"
description: "把只追加的路由激活、全部本地 book、持久身份和完整原结果纳入同一 snapshot，通过从初始路由重演保留前缀，拒绝 checksum 正确但语义不一致的镜像。"
date: 2026-09-07T15:02:37+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M13
lessonOrder: 30
permalink: multi-book-snapshot-and-route-addition
tags:
  - Snapshot
  - 状态恢复
  - 静态路由
  - Java
draft: false
---

> 本地复验身份：annotated [`course/m13-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m13-complete)，clean commit `eb1b65d2ea2159ba607e3271f0bfd209ea4906ea`。本文结论取自该身份的一次 fresh M13 qualification；[manifest 发布入口](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/manifest.json) 随本单元教程发布提供。

一份 snapshot 保存了 BTC、ETH 的全部订单，却漏掉了旧 commandId 对应的原结果。恢复后的盘口看起来完全正确，原请求再次到达时却可能被重新执行。再进一步：保留全部身份，只把第一条原结果换成另一条合法结果，然后重新计算整个镜像的 SHA-256，这份 snapshot 应当被接受吗？

**恢复的对象是 shard 对历史作出的完整承诺，既包括当前状态，也包括过去每个身份已经得到的结果。** M13 把初始路由、活动路由、全部本地 book、完整身份绑定和下一 shard sequence 一起保存；安装恢复状态之前，从初始路由重演保留前缀，逐条重新计算并核对原 response。

这条实现路径强化了语义验收，也明确增加了恢复成本。它不是只读取盘口后重放 snapshot 之后的 suffix，更没有在本单元获得恢复时间或容量资格。

## 路由追加必须和业务命令共用一条有序历史

如果管理员直接替换成员机器上的路由文件，两个成员可能在不同命令之间看到新版本。即使两份文件最终相同，同一条请求也可能在一个成员上合法、在另一个成员上 stale。静态配置仍然需要定义演进次序。

M13 使用 `activateRoute(...)` 构造有序路由命令。它带上 expected route identity 和 successor artifact，通过 shard 的正常身份及 producer 准入边界后安装。后继必须同时满足：owner 不变、版本严格增加、至少新增一个绑定、每个已有绑定保持原值。

下面的关系是合法追加：

```text
v1: BTC→1, ETH→1, SOL→2
v2: BTC→1, ETH→1, SOL→2, XRP→1
```

下面的关系即使版本增加、hash 正确，也不是合法后继：

```text
v2: BTC→2, ETH→1, SOL→2, XRP→1
```

第二例把已存在的 BTC 移到另一组；本单元没有转移订单、身份历史、输出位置或权威所有者的协议，不能靠改一个 Map 项目把迁移变成已完成操作。`ALLOW_EXISTING_ROUTE_MOVE` 的反例直接针对这条边界。

路由激活占用一个 shard sequence 和 durable identity，不推进任何 book sequence。响应仍是 `NEW_APPLIED`，带本次 shard sequence，`result` 为空；它是明确的路由结果，不需要伪造一条某张 book 的 `CanonicalResult`。两组各自激活同一个 successor，也不意味着两组在同一原子时刻切版。

## Snapshot 要保存能够解释当前状态的全部内容

`M13SnapshotCodec` 的格式由 M13 自己的 magic/version 标识，主体按固定次序写入：

| 内容                                  | 恢复时回答的问题                             |
| ------------------------------------- | -------------------------------------------- |
| shardId、nextShardSequence            | 这是哪一组，下一次新应用在哪个位置           |
| initialRoute                          | 保留历史从哪份权威路由开始                   |
| active route                          | 路由演进后当前使用哪一版                     |
| 按 instrument 排序的 book state       | 每张本地簿的订单、规则、模式与局部顺序是什么 |
| 按 apply 顺序保留的 identity bindings | 哪个请求已经得到哪个完整原 response          |
| 整体 SHA-256 checksum                 | 这些规范字节是否完整一致                     |

同时保存 initialRoute 与 active route 不是重复。前者为恢复重演提供起点；后者是重演结束时必须得到的状态。比如 v2 新增了一张 book，恢复既要知道它现在存在，也要确认它是经由合法的有序路由命令加入的。

`M13IdentityBinding` 对请求和响应中的 correlation 归零再保存。重试时 correlation 会变化，但这种传输变化不应改变 snapshot 或身份摘要。binding 保存的是完整 response，而不是只保存“成功”标签；此前向客户端承诺的事件、序号和原 digest 都是恢复验证的一部分。

状态图提供的两种派生摘要各有作用：semantic digest 绑定当前 shard、route、next sequence 与各 book digest；identity-table digest 绑定保留的请求/原结果记录。它们由状态内容计算，codec 顶层写入的摘要字段是全镜像 checksum。最终盘口相同不能单独证明旧结果表没有被替换。

源码定位：[M13SnapshotCodec.java](https://github.com/lcha-reln/cex-matching/blob/course/m13-complete/matching-cluster-runtime/src/main/java/io/github/lchareln/cex/matching/cluster/M13SnapshotCodec.java) 定义字节格式，[DirectM13ShardRuntime.java](https://github.com/lcha-reln/cex-matching/blob/course/m13-complete/matching-cluster-runtime/src/main/java/io/github/lchareln/cex/matching/cluster/DirectM13ShardRuntime.java) 的 `restore` 定义安装之前的语义验收。

## Checksum 之后还要重新检验每一条历史承诺

checksum 能发现未经重算的字节损坏，却不能证明内容符合协议。一个错误程序完全可以先删掉身份记录，再把新内容编码成 checksum 正确的镜像。

当前恢复实现采用更直接的交叉检验。以下为 `DirectM13ShardRuntime.restore(M13RuntimeState)` 的核心节选：

```java
DirectM13ShardRuntime restored =
    new DirectM13ShardRuntime(state.shardId(), state.initialRoute());
for (M13IdentityBinding binding : state.identityBindings()) {
  M13CommandResponse reconstructed = restored.submit(binding.request());
  if (!reconstructed.equals(binding.response())) {
    throw new IllegalArgumentException(
        "snapshot original response disagrees with reconstructed prefix at shard sequence "
            + binding.response().shardSequence().orElseThrow());
  }
}
if (!restored.stateImage().equals(state)) {
  throw new IllegalArgumentException(
      "snapshot books, routes, identities or next sequence disagree with reconstructed prefix");
}
```

每一步重演都经过同一个纯 Direct 准入边界，因此路由后继、双向身份、producer fencing、book 控制条件、两层 sequence 和撮合结果会一起重新计算。保留记录必须与本次重算得到的 `NEW_APPLIED` response 完整相等；突然出现 duplicate、rejection、改变过的事件或历史 digest 都无法通过。

最后再比较整个 state image，把 active route、book 集合、每张 book 的完整状态、全部绑定和 next sequence 连接起来。这样才能拒绝“只替换早期原结果、最后盘口和最后结果都没有变化”的镜像。只核对每本最后一条结果会漏掉这个反例。

重演在新的局部 runtime 中进行，完成校验后才返回给调用方；它不访问外部系统，也不发布业务副作用。`M13SnapshotCodec.decodeCanonical` 还会检查长度、checksum、规范字节、重复键和版本，再触发语义校验。格式合法与语义可恢复是相继成立的两层条件。

## 前缀校验的成本随保留历史增长

这份实现为每个已准入身份保留请求和完整结果，恢复需要重新执行这些请求。成本随保留前缀长度，以及每条命令的撮合、状态摘要和序列化工作增长；不能只用“snapshot 有几张 book”估算。

这也是为什么本文不把它称为常数时间恢复、只重放 suffix，或只按未成交订单量付出成本。编码上限是输入边界，不是已经测出的承载容量。压缩历史、裁剪结果或引入检查点，都会改变“旧身份还能取回完整原结果”的承诺，必须另设合同与反例，不能作为一次无害优化插入。

M13 仍需保持 M11 的既有 wire goldens 和 BTC 默认行为。新 instrument 的 book codec 使用显式 instrument 路径，M11 旧入口不会因此自动接受 ETH。新增格式和严格版本字段也不构成 N/N-1 滚动升级资格。

应用要在 `onTakeSnapshot` 写出完整状态，并在 `onStart` 收到 snapshot Image 时恢复；Aeron 负责生命周期和传输，快照业务内容由应用定义。这两个职责不能相互代替。[Aeron 1.52.2 ClusteredService](https://github.com/aeron-io/aeron/blob/1.52.2/aeron-cluster/src/main/java/io/aeron/cluster/service/ClusteredService.java)

## 用重新计算过 checksum 的坏镜像检验恢复

复验完成版时，运行实际恢复测试：

```bash
git switch --detach course/m13-complete
./gradlew :matching-cluster-runtime:test \
  --tests '*M13ShardRuntimeTest.snapshotRejectsChecksumCorruptionAndRehashedInconsistentIdentityOrBooks' \
  --tests '*M13ShardRuntimeTest.rejectsRehashedSnapshotWithReplacedEarlierOriginalFullResult' \
  --tests '*M13ShardRuntimeTest.rejectsRehashedSnapshotWithReplacedEarlierShardDigest' \
  --tests '*M13ShardRuntimeTest.shardIdentitySpansBooksAndDuplicateSurvivesRouteChangeAndRestart' \
  --no-daemon --max-workers=1
```

先预测三类结果：翻转一个字节；删除早期 identity 后重新编码；把早期原结果替换为另一条具有合法结果摘要、相同 book sequence 的结果，再重新编码。三类都应拒绝，但第一类主要验证 checksum，后两类才触及跨字段历史一致性。

完整后缀实验则从同一前缀建立两条路径：一条继续 Direct 执行，另一条从 snapshot 恢复后执行相同 suffix。要求每条完整结果与最终 snapshot 都相同，再重试 snapshot 之前的身份，要求返回它的原结果。这样才同时检验当前状态和历史结果表。

本次 [fixed report](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/reports/check/fixed.json) 的多 book snapshot/suffix 场景执行 10 次提交并通过 19 个断言；[生成报告](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m13/evidence/reports/check/generated.json) 记录 128 次局部 snapshot restore。`DROP_SNAPSHOT_IDENTITY` candidate 恢复后不能重放原结果，因这项业务分歧被判为 `STUDENT_FAILURE`，production control 为 PASS。128 次局部恢复不是 128 次 Aeron snapshot；真实双组报告另外保存六份 WRITTEN 与六份 LOADED 观察，下一篇将逐项解释它们。此次真实追加使用 ADA-USDT→shard 1，本篇 XRP 示例只是同一 append-only 规则的说明。

## 可恢复性包含过去的结果，也包含当前实现的成本边界

M13 的 snapshot 既保存当前 book，也保存路由演进和旧身份的完整承诺。规范字节和 checksum 阻止格式损坏，从初始路由重演保留前缀则把每一条原 response 与最终状态重新连接起来。

这种恢复校验不提供备份、主机丢失恢复或滚动升级证明，成本也没有获得性能资格。它建立的是后续真实故障实验所需的确定性恢复入口：成员从 Archive 载入镜像后，必须继续沿同一条 shard 历史走下去。
