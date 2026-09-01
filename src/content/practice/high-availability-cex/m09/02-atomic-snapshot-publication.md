---
title: "M09·02：用 force、rename 与目录屏障原子发布 Snapshot"
description: "拆开 M09S1 file force、atomic rename、snapshot-directory force 与 WAL rollover，证明 final 目录项持久后 Snapshot 已权威，而 cut+1 header 只约束后续前缀退休。"
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

> 教程草稿：结构化 RED 已由 annotated [`course/m09-start`](https://github.com/lcha-reln/cex-matching/tree/course/m09-start) 冻结，正文按实现审查 HEAD `c26a613` 校准；`8f6a357` 是主体实现，后续提交补齐了 recovery-scan hard budget。M09 仍未形成 complete tag、完成 evidence 或公开通过结论。

把状态编码成一个文件，不等于这个文件已经成为权威 Snapshot。进程可能停在 body 写到一半、file force 之前、rename 之后或目录项 force 之前；每个窗口都会在下一次打开时留下不同的 namespace 观察。

这里还要避免另一个常见混淆：Snapshot 发布完成后，checkpoint 流程还会 rollover WAL、保留 generation、删除旧 segment。它们属于同一次维护调用，却不属于同一个资格。

M09 冻结的精确结论是：

> **完整 M09S1 临时文件经过 file force、atomic rename 和 snapshot-directory force 后，final generation 就已经发布并成为恢复权威。cut+1 durable WAL header 是删除旧 WAL 前缀之前必须满足的额外条件，不是 Snapshot 发布资格的一部分。**

## 先把两个状态机拆开

| 状态机 | 完成条件 | 完成后获得的权利 |
| --- | --- | --- |
| Snapshot publication | temp file force → atomic rename → snapshot directory force | recovery 可以选择 latest final Snapshot |
| WAL prefix retirement | Snapshot 已发布，且 durable cut+1 active WAL header 已形成 | 才可开始删除被完整覆盖的 closed segment，并在删除后 force WAL 目录 |

若把两者合并，会得出一个错误结论：directory force 后、rollover 前 crash 的 Snapshot “尚未发布”。真实实现和恢复合同并非如此。此时 final Snapshot 已权威，只是旧 WAL 还不能删。

反过来也不能把“old/crossing WAL 仍足以恢复”当成 retirement 授权。它只保障 publication 与 rollover 之间的 crash window；当前 checkpoint 在任何 prefix delete 之前仍必须形成并持久化 cut+1 active header。

## M09S1 final 文件怎样自描述

M09 不创建独立 `latest` 文件，也没有 recovery descriptor。每个 immutable generation 自己携带恢复身份，文件名为：

```text
snapshot-<20-digit-generation>-<20-digit-lastWalSequence>.m09s1
```

文件内容按 big-endian canonical encoding 组织：

```text
magic = M09S
version = 1
generation
shardId
lastIncludedWalSequence
lastIncludedApplicationSequence
payloadLength
complete LocalRuntimeStateImage payload
CRC32C
serialization SHA-256
```

semantic/transcript digest 在完整 state payload 内，serialization SHA-256 位于文件 trailer。recovery 同时交叉验证 filename generation/cut、header anchor、state anchor、shard、CRC、SHA-256 与 canonical re-encode；不能因为文件名排序最大就跳过内容校验。

不存在 descriptor 的直接好处，是少了一份可能与 Snapshot file 分叉的“最新指针”。代价是 discovery 必须严格：最高 final generation 若未知 version、corruption、wrong shard 或 filename/header mismatch，runtime 必须 fail closed，不能自动选择旧代。

## publication 的真实顺序

`SnapshotStore.publish` 的主路径可以抽象成：

```text
capture LocalRuntimeStateImage @ cut S
→ encode snapshot-G-S.m09s1 bytes
→ CREATE_NEW snapshot-G-S.m09s1.tmp
→ write complete bytes
→ FileChannel.force(true)
→ read back and decode canonical bytes
→ atomic rename .tmp to final .m09s1
→ force snapshot parent directory
→ mark generation G as latest in this process
```

每一步分别解决一个问题：

- `CREATE_NEW` 阻止覆盖已有 generation；
- 完整 write 与 format bounds 阻止 silent short write；
- file force 建立 JDK/OS 层面的文件内容屏障；
- forced read-back 让刚写出的 bytes 重新经过 production decoder 与 state equality 检查；
- atomic rename 阻止 recovery 看见半份 final file；
- parent-directory force 让 final 名称的 namespace 变化跨过持久屏障。

atomic move 不受支持时，M09 直接报 I/O failure；它不会退化成 copy+delete，因为那会重新引入“final 文件可见但只复制一半”的状态。

## 权威点就在 snapshot-directory force 之后

publication crash matrix 必须用“下一次 fresh open 可以相信什么”来读：

| crash point | 目录可能看到什么 | recovery 决策 |
| --- | --- | --- |
| temp write 前 | 无新文件 | 使用既有 Snapshot/WAL |
| temp body 中 | partial `.tmp` | `.tmp` 非权威，清理后 force 目录 |
| file force 后、rename 前 | complete `.tmp` | 仍非权威 |
| rename 后、directory force 前 | final 可能出现或消失 | 本次 checkpoint 未正常完成；fresh open 只按实际 durable namespace 严格发现 |
| directory force 后 | complete final | **新 generation 已发布且权威** |

`.tmp` 可以被清理，但匹配 final 命名的文件不能以“可能是 crash 残片”为理由随意删除。final 若完整可见却校验失败，就是 corruption。

注意，rename 后、directory force 前的真实 crash 在不同文件系统上可能留下或不留下 final entry。M09 的代码级 seam 和 child-process halt 只能观察具体运行环境重新打开后的结果，不能把某一种观察推广成所有文件系统保证。

## 最关键窗口：directory force 后、rollover 前

假设 WAL 还在 segment 7 中，Snapshot cut 为 `S=120`。Snapshot final 已经过 directory force，但新的 segment 8/cut+1 header 尚未创建：

```text
snapshot-...-120.m09s1    durable and authoritative
segment-...-0007.m08w1   still contains records before/through cut 120
active rollover           not started
```

这不是不可恢复状态。fresh recovery 会：

1. 选择并完整验证 latest final Snapshot@120；
2. 扫描仍存在的旧 segment chain；
3. 对 `walSequence <= 120` 的 record 做 framing、CRC、canonical envelope 与 sequence 验证，但不再次 apply；
4. 若同一 crossing segment 里已有 `121...`，只把这些 record 加入 suffix；
5. 若没有 `121`，接受 empty suffix，并继续使用当前 active segment。

因此它可以用：

```text
latest Snapshot@S + complete old/crossing WAL
```

恢复，而不要求 directory force 后立刻存在一份新的 cut+1 header。旧 WAL 此时仍是安全冗余和 suffix continuity 的载体。

当前实现中的注释也明确写着：published Snapshot 在这里停机时仍能和 old WAL 一起恢复；**只有进入 prefix retirement 之前**，才需要把 cut+1 作为 active header durable 化。

## rollover 为什么仍然必要

若 active segment 在 cut 前已有业务 record，`checkpoint()` 在 publication 后会强制 rollover：

```text
create segment-(active+1).m08w1.tmp
→ write header(firstWalSequence = S + 1)
→ force header file
→ atomic rename to final segment
→ force WAL directory
```

这个 header 给前缀回收一个明确承诺：即使所有完全被 Snapshot 覆盖的旧 closed segment 消失，仍有一条 durable segment chain 从精确 `S+1` 开始。

如果 active segment 本来就是 header-only，并且它的 `firstWalSequence` 已等于当前 cut+1，实现不需要制造一个多余 rollover。所需事实已经成立。

所以正确关系是：

```text
snapshot-directory force
    └─ Snapshot publication complete

Snapshot publication
+ intact old/crossing WAL
    └─ recovery remains possible before rollover; no retirement authority

Snapshot publication
+ durable cut+1 WAL start
    └─ retirement prerequisites may become complete
```

## `checkpoint()` 失败与 durable reality 不是一回事

`LocalMatchingRuntime.checkpoint()` 把 publication、rollover、generation retention 和 prefix retirement 放在一次同步维护调用中。后半段任何 I/O error 都会让当前实例进入 `FAILED_CLOSED`，调用方得到异常。

但异常不能反向抹掉已经越过的 durable barrier。例如 fault 发生在 Snapshot directory force 之后、rollover 之前：

- 当前实例必须 fail closed，不能猜测剩余维护动作是否完成；
- latest Snapshot 仍可能已经权威；
- 旧 WAL 尚未删除，因此 fresh open 可以据实际文件状态恢复；
- 调用方不能仅凭 checkpoint 异常就删除 final Snapshot 或重试覆盖同一 generation。

这是 Unknown Outcome 的本地维护版本：运行中的方法不知道后续动作是否完整，不代表磁盘上什么都没有发生。fresh open 才拥有重新发现 namespace 和验证 bytes 的资格。

## latest final 的选择策略必须失败关闭

`SnapshotStore.discover` 只考虑 canonical final filename，按 generation 排序，并要求保留的 generation 连续。它选择最高 generation 后才 decode：

```text
highest final generation
→ validate size
→ validate serialization SHA-256
→ validate CRC32C
→ validate magic/version
→ validate state graph
→ validate filename/header generation + cut + shard
→ canonical re-encode equality
```

任何一步失败都会阻止 runtime 打开。即使目录里还保留 previous generation，也不会自动 fallback。因为系统无法证明 previous generation 所需的 WAL prefix 仍完整，更不能把“可用性优先”建立在静默丢命令上。

保留两个 generation 是后面介绍的物理 retention 策略，不是 recovery selection 的多版本协议。M09 没有 N/N-1 reader、downgrade 或人工修复流程。

## durability 语言的边界

本文的 `force(true)` 只表示 Java API 到 OS 的持久屏障请求。它不证明：

- 所有文件系统都以同样方式处理 rename + directory fsync；
- RAID/controller/云盘兑现 flush；
- 断电后 physical media 必定保留 bytes；
- 跨目录 atomic move 或网络文件系统可用；
- ENOSPC、只读挂载和固件回退已经实测。

M09 的完成证据需要把 deterministic seam、child JVM `Runtime.halt(86)` 与真实 power-loss qualification 明确分层。本站不会用浏览器 JavaScript 模拟 `FileChannel` 后宣称通过。

## 本篇停止点

M09S1 的权威点现在已经精确：完整 temp file 经 file force、atomic rename 与 snapshot-directory force 后，latest final Snapshot 就发布完成。cut+1 durable WAL header 不是它的发布证书，而是后续删除旧 WAL 前的额外安全前提。

下一篇从这个已发布 Snapshot@S 出发，证明无论 suffix 留在旧 crossing segment，还是从新的 cut+1 segment 开始，恢复都必须与 genesis replay 得到同一个 semantic state。
