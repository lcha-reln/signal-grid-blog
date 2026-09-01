---
title: "M08·04：用 M08W1 分段 WAL、目录 force 与 genesis replay 恢复"
description: "冻结 segment/frame 连续性、rollover 持久顺序、目录独占锁，以及 torn final tail 可截断而完整 corruption 必须失败关闭。"
date: 2026-08-31T16:39:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M08
lessonOrder: 40
permalink: segmented-wal-rollover-and-recovery
tags:
  - 撮合引擎
  - WAL Recovery
  - CRC32C
draft: false
---

> 本篇按 annotated [`course/m08-start`](https://github.com/lcha-reln/cex-matching/tree/course/m08-start) 到 annotated [`course/m08-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m08-complete) 的真实 M08W1 实现校准；segment、rollover、torn/corruption 与 genesis recovery 结论由[完成 evidence](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m08/evidence/manifest.json)绑定。
>
> 完成身份：`course/m08-complete` peeled commit `5c8d8f6a5356f6ebbdf87d83745d8e8bd0861199`；本站 manifest SHA-256 `19a5c93e618ef5d9430719b135ca95aa7db6513c7389e0cfb50eb80c430e2923`。

单个不断增长的文件也能 append，却很难精确演练 rollover、目录项持久化和损坏定位。分段之后，新的风险不是少了，而是多了：header 写到一半、rename 可见但目录未 force、旧 segment 尾部 torn、新 segment 只有 header、两个 segment 的 sequence 断裂。

M08 的恢复结论是：**M08W1 把 segment chain 与 record chain 都做成正且连续的权威前缀；rollover 先持久 header 与目录项，再写第一条业务 record；恢复从 genesis 对 fresh core 严格重放。只有最后 segment 最后一条不完整 frame 是可截断 torn tail，完整 frame 的任何校验失败都是 corruption。**

## header 与 record 各自证明什么

M08W1 segment header 至少包含：

```text
magic / version
shardId
segmentId
firstWalSequence
header CRC32C
```

每条 record 至少包含：

```text
record length / record version
walSequence
expectedApplicationSequence
M08C1 envelope bytes
record CRC32C
```

冻结不变量：

- segmentId、first WAL sequence、record WAL sequence 与 expected application sequence 都是正数；
- segment chain 和 WAL record sequence 连续，无重复、无 gap；
- record 不跨 segment；
- 单 record 与 envelope 有明确上限；
- header/record length 必须能在溢出安全的算术中验证；
- shardId 与 runtime 打开的 shard 一致。

当前 `M08WalFormat` 已冻结 big-endian 编码：magic 为 `0x4D303857`（`M08W`）、version 为 `1`、segment header 为 36 bytes、record 固定 overhead 为 32 bytes。可变的只有 M08C1 envelope 长度；这些常量必须同 codec 测试和发布 evidence 一起审查，不能由网页重新定义。

## CRC32C 与 payload SHA-256 不能互换

两种校验服务不同层：

| 校验 | 覆盖 | 主要证明 |
| --- | --- | --- |
| frame/header CRC32C | M08W1 framing bytes | torn write、bit corruption 与 frame 完整性 |
| M08C1 payload SHA-256 | canonical command payload bytes | commandId/Slot 与业务 payload 的稳定绑定 |

CRC 正确不能证明 commandId 没换 payload：攻击者或错误程序可能重算 CRC。payload hash 正确也不能证明 record length/WAL sequence 没损坏：这些是 frame 字段。recovery 必须依次验证 framing、CRC、canonical re-encode、payload hash 与 identity/index 关系。

两者都不是数字签名或权限证明；M08 不引入密钥和防恶意磁盘篡改协议。

## rollover 必须先让新文件名 durable

冻结过程是：

```text
create temp segment
→ write complete header
→ force temp segment
→ atomic rename temp to final
→ force parent directory
→ append first business record
```

规则附带两个重要限制：

```text
.tmp files never contain business records
header-only final last segment is valid
```

如果在 temp 文件里写业务 record，rename/directory force 之前就会出现“命令字节存在但 segment 不是权威链成员”的暧昧状态。只写 header 后 rename，则 orphan `.tmp` 可以明确视为非权威，final header-only segment 也能作为合法 crash 结果恢复。

新 segment 第一条命令的 ACK 还要等待：header force、atomic rename、parent-directory force、record force 和 core apply 全部成功。只 force 文件内容而不 force 目录，crash 后 final 文件名可能消失。

## rollover crash 的四种目录观察

| crash point | recovery 应观察 |
| --- | --- |
| temp header 未完整/未 force | orphan temp 非权威，不进入 segment chain |
| temp 已 force、rename 前 | orphan temp 非权威 |
| rename 后、directory force 前 | 未 ACK；final entry 是否留存不能假定 |
| directory force 后、first record 前 | 合法 header-only final segment |
| first record append/force 后 | 按普通 record tail 规则验证 |

recovery 不应把 `.tmp` 按文件名排序后当成正式 segment，也不应因为 header-only 就删除最后 segment。当前实现取得目录锁后会删除匹配命名规则的 orphan temp，并在有删除时 force 目录，再发现 final segment；`.tmp` 永远不能贡献权威业务 record。

## 恢复先取得目录独占锁

部署侧必须先创建 WAL 目录，并保证它是一个真实目录而不是符号链接；目录项本身也要在 runtime 首次打开前由部署流程完成持久化。`LocalMatchingRuntime` 不替调用方执行 `createDirectories`，配置路径不存在或是 symlink 时直接拒绝打开。这样，第一条 record 的 ACK 合同不会暗中依赖一个尚未持久化的祖先目录项。

打开 runtime 的第一项权威动作是取得 WAL directory exclusive lock。失败必须拒绝打开，不能让两个本地进程分别认为自己是 single writer。

锁成功后，恢复顺序是：

```text
discover final segments only
→ sort/validate segment chain
→ validate every header
→ scan records in exact WAL order
→ validate length/version/CRC/sequence
→ validate M08C1 canonical bytes/hash/shard
→ validate commandId/Slot/epoch bindings
→ force active segment after any tail repair
→ force WAL directory namespace
→ apply every durable command to a fresh matching-core
→ rebuild original results + all durable indexes
→ recompute final semantic digest/state for callers and evidence
```

既有 WAL 每次成功打开都会保守地 force active segment，再 force 目录，之后才 replay 并进入 `OPEN`；这样可以收口上一次可见但 force 结果未知的 truncate/rename 窗口。M08W1 并不额外持久一份“expected final semantic digest”供 runtime 自证；恢复只从 canonical command 重算状态与 transcript digest。课程裁判可以把这个重算结果同独立 ledger 的合法 durable prefix 预期比较，但 production 不能拿自己刚算出的值与自己比较后宣称完成校验。

recovery 不能载入一个默认 engine 后只恢复订单簿。它必须从 genesis 重放 Place、Cancel、RuleSet Prepare/Activate、MarketMode、MassCancel 与 M07 STP 字段，包括 core 业务拒绝；这样 active rule、mode、terminal identity、application sequence 和 original duplicate result 才完整。

M08 没有 Snapshot，所以恢复时间随完整 WAL 增长。它不承诺 bounded recovery，也不做边恢复边接流量。

## expected application sequence 是恢复交叉检查

每条 M08W1 record 带 `expectedApplicationSequence`，recovery 在 apply 前应验证 fresh core 当前 next application 与 record 声明一致。若上一条业务拒绝没有 journal，或某条 record 被跳过，这个检查会在下一条明确失败。

WAL sequence 与 application sequence 是不同字段，但对 M08 的一 record/一 core command，它们都必须各自连续。不能因为数值暂时相同就省掉其中一个：未来日志元数据和 core 业务序列仍是不同 owner 的合同。

exact duplicate、identity conflict、gap 与 structural invalid 不进入 WAL，因此 recovery 不会为它们调用 core。只有新 durable command—including business Reject—形成 record。

## torn tail 只有一种合法位置

可截断条件非常窄：

```text
location = final segment, final record candidate
and
(
  record length prefix itself is incomplete
  or complete declared record length extends beyond EOF
)
```

这表示 append 在 frame 完整前中断，无法形成一条可验证 record。恢复可截断到上一条完整 record 的末尾，但**截断后必须 force**，再允许接受新命令；否则下一次 crash 可能又看见旧 torn bytes。

header-only final segment不属于 torn record；它本来就是合法 chain tail。

## 字节数完整就不能称为 torn

一旦 length 声明范围内的全部 bytes 都存在，frame 就是“完整候选”。此时任何失败都是 corruption：

```text
CRC mismatch
payload hash mismatch
non-canonical codec bytes
wrong shard/version
invalid identity binding
duplicate/gap WAL or application sequence
```

即使它恰好是 final segment 的最后一条，也不能截断后继续。否则攻击者或硬件损坏只需发生在尾 record，runtime 就会静默遗忘一个可能已经 ACK 的命令。

同理，非最后 segment 的 incomplete frame、任何中段损坏、segment chain gap/duplicate 都必须 fail closed。恢复不能：

- 跳过坏 record 继续；
- 扫描下一个“看起来像 magic”的位置；
- 自动重写 CRC/hash；
- 删除坏 segment 后回到空状态；
- 用当前 book snapshot 掩盖历史洞。

## torn 与 corruption 的决策表

| 位置/形态 | 分类 | 动作 |
| --- | --- | --- |
| final segment final length prefix 不完整 | torn tail | truncate to prior boundary + force |
| final declared length exceeds EOF | torn tail | truncate to prior boundary + force |
| final complete frame CRC mismatch | corruption | fail closed |
| final complete frame non-canonical/hash mismatch | corruption | fail closed |
| non-final segment incomplete frame | corruption | fail closed |
| middle record CRC/sequence failure | corruption | fail closed |
| orphan `.tmp` header | non-authoritative | 不加入 chain |
| final header-only segment | valid | 保留并可继续 append |

这张表让“自动修复”有明确边界：只移除不可能成为完整 record 的最终 suffix，不猜测任何完整 bytes 的意图。

## WAL 不做 retention 或墙钟淘汰

M08 保留从 genesis 恢复所需的全部旧 segment，不按天数、文件大小或 producer inactivity 删除 identity/result。否则一个很晚到达的 exact duplicate 可能丢失 binding，被重新 apply。

Snapshot、compaction、WAL retention 与格式演进属于后续单元。M08 也不把数据库当恢复源，不做 WAL/数据库双写，不允许从 query projection 重建 core。

## 已完成的本地恢复演练

M08 仓库通过本地命令生成真实临时目录、rollover 与 restart history：

```bash
./gradlew clean build --no-daemon
./gradlew m08Check --no-daemon
```

complete gate 已逐字节区分 final torn、complete tail corruption 与 mid-log corruption，并验证 truncate 后 active-segment force、directory force，再以 fresh core 从 genesis 重放。三个 child JVM `Runtime.halt(86)` window 还分别验证 length-only tail 修复后 exact retry 为 new，以及 record force/apply-before-ACK 后 exact retry 为 duplicate；它们只是 process-crash smoke，不是物理断电证明。

网页只读取发布的静态 hex/frame 解释，不能写用户文件、执行恢复或用 JavaScript parser 冒充权威 codec。

## 本篇停止点

M08W1 现在有了严格的 segment/header/record chain、目录持久顺序和 genesis recovery；只有最后 incomplete frame 可截断，任何完整或中段损坏都 fail closed，业务拒绝和 durable identity 随重放恢复。

最后一篇将这些故障变成可归因证据：确定性 seam 能证明程序顺序，child JVM crash 只能做真实文件 smoke，两者都不能冒充真断电或任意硬件保证。
