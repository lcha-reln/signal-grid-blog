---
title: "M05·01：先把价格带做成可寻址的不可变规则制品"
description: "把绝对 tick 上下界编码为 MarketRuleSetArtifact，用 M05RS1 canonical bytes 和重算 SHA-256 建立版本、内容与身份的一一对应。"
date: 2026-08-31T11:00:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M05
lessonOrder: 10
permalink: market-rule-set-artifact-hash
tags:
  - 撮合引擎
  - RuleSet
  - SHA-256
draft: false
---

> 本文从 annotated [`course/m05-start`](https://github.com/lcha-reln/cex-matching/tree/course/m05-start) 的结构化 RED 起步；该 tag peeled 到 `d66659a408514ba9091f3e882197ba692e2460e7`。已完成实现冻结在 annotated [`course/m05-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m05-complete)，peeled commit 为 `e593c13292c0f97665f90239a4c8d4a1ca40f579`；[公开 evidence manifest](https://lcha-reln.github.io/signal-grid-blog/practice/high-availability-cex/m05/evidence/manifest.json) 的 SHA-256 为 `d5ee9a4c278d204bfbb8df90feae570302339fb8028849b7ab44f39fc090a69a`。

M04 已经让同一张五字段限价单在 GTC、IOC、FOK、POST_ONLY 下得到确定结果，但它默认任何正 `priceTicks` 都可以进入策略准入。真实交易场所还需要回答另一件事：即使客户愿意在某个价格成交，场所此刻是否允许这个报价进入订单簿？

最直接的实现往往是把 `minPrice`、`maxPrice` 放进配置文件，再让撮合线程定时刷新。这种写法能快速演示，却无法回答三个商用系统必须回答的问题：某张订单究竟被哪一版规则判断、不同进程读到的内容是否完全一致、更新在命令序列的哪一个边界生效。

本篇只证明一个命题：**撮合器消费的价格带必须是不可变、带版本且由内容寻址的 artifact；同一 `RuleSetIdentity` 必须唯一对应同一组 canonical bytes，Prepare 必须重算 hash，不能相信调用方声称的值。**

## 从结构化 RED 读取真正的任务边界

先从固定起点创建练习分支：

```bash
git clone https://github.com/lcha-reln/cex-matching.git
cd cex-matching
git switch -c unit/m05 course/m05-start
./gradlew clean build --no-daemon
./gradlew m05Check --no-daemon
```

在历史起点上，前一条命令必须保持 M00～M04 回归为 GREEN；后一条命令会校验 M05 的规范、fixture 与 Schema，然后以结构化 `GOAL_NOT_IMPLEMENTED` 非零退出。若它因为编译器、文件系统、JSON 解析或测试运行器异常失败，那不是预期 RED，而是 `SYSTEM_ERROR`。完成练习后切到 `course/m05-complete`，同一命令应产生 `matching.m05.check.v2 / PASS`，不能把起点 RED 当作最终验收结果。

起点的 [`docs/specs/m05.md`](https://github.com/lcha-reln/cex-matching/blob/course/m05-start/docs/specs/m05.md) 已经冻结唯一新增轴：

```text
absolute tick interval
→ immutable MarketRuleSetArtifact
→ content-addressed RuleSetIdentity
→ Prepare
→ Activate at one serialized application boundary
→ govern later Place commands
```

这里没有 operating mode、Mass Cancel、STP、WAL 或 Aeron。即使这些能力未来也会使用规则版本，它们仍属于不同的状态机，不能借 `RuleSet` 这个名字提前塞进 M05。

## 可变配置无法形成可审计的业务事实

假设配置中心先后出现两行：

```text
09:30:00  BTC-USDT band = [90, 110]
09:30:01  BTC-USDT band = [95, 105]
```

如果撮合线程只保存当前两个数字，那么历史订单 `#42` 被接受后，系统最多知道“当时大概使用了某份配置”。它不知道读取发生在更新前还是更新后，也不知道另一台重放进程是否拿到了相同内容。

把版本单独加上仍然不够：

```text
version = 7, band = [90, 110]
version = 7, band = [95, 105]  // 操作错误或节点漂移
```

两个内容共享同一版本时，`version=7` 不再是身份。相反，只保存 hash 也不够，因为系统还需要版本的单调关系来拒绝回退、表达 prepared/active 生命周期，并让操作人员理解演进顺序。

所以 M05 使用二元身份：

```text
RuleSetIdentity(version, contentHash)
```

`version` 表达有序代际，`contentHash` 绑定精确内容。两者缺一不可。

## Artifact 只携带 Matching 已经能确定执行的事实

M05 的权威类型是：

```java
public record MarketRuleSetArtifact(
    String schemaVersion,
    String instrumentId,
    RuleSetVersion version,
    PriceTicks lowerInclusive,
    PriceTicks upperInclusive,
    String contentHash) {}
```

字段域很窄：

| 字段 | 冻结含义 | 不承担的职责 |
| --- | --- | --- |
| `schemaVersion` | 固定为 `matching.market-rule-set.v1` | 不做运行时 Schema 自动迁移 |
| `instrumentId` | M05 只有 `BTC-USDT` | 不实现多交易对路由 |
| `version` | `0..Long.MAX_VALUE` 的代际 | 不代表时间戳、数据库 revision 或 Cluster position |
| `lowerInclusive` | 正 long tick，下边界包含 | 不携带百分比或舍入公式 |
| `upperInclusive` | 正 long tick，上边界包含 | 不携带行情来源 |
| `contentHash` | lowercase `sha256:<64 hex>` | 不接受大写、缺少前缀或其他算法拼写 |

构造器先证明 `lowerInclusive <= upperInclusive`。两个边界都使用已有 `PriceTicks` value object，因此零和负值在 artifact 形成前已经被拒绝。

注意这里故意没有 `referencePrice` 与 `bandPercentage`。未来控制面可以用指数价、标记价或其他政策计算绝对 tick 区间，但舍入、数据新鲜度与异常行情处理必须由那个上游边界证明。Matching 只消费已经确定的整数事实，才能保持纯函数式、可重放的状态迁移。

## M05RS1 把相同含义收敛成相同字节

直接对 JSON 文本做 hash 会把无关差异带进身份：键顺序、空格、换行、数字表示甚至序列化库升级都可能改变摘要。M05 因此拥有一份极小的 canonical 格式 `M05RS1`：

```text
M05RS1\n
schemaVersion=matching.market-rule-set.v1\n
instrumentId=BTC-USDT\n
version=<decimal long>\n
lowerInclusive=<decimal long>\n
upperInclusive=<decimal long>\n
```

Java 实现可以保持同样直接：

```java
public byte[] canonicalBytes() {
  String canonical =
      "M05RS1\n"
          + "schemaVersion=" + schemaVersion + "\n"
          + "instrumentId=" + instrumentId + "\n"
          + "version=" + version.value() + "\n"
          + "lowerInclusive=" + lowerInclusive.value() + "\n"
          + "upperInclusive=" + upperInclusive.value() + "\n";
  return canonical.getBytes(StandardCharsets.UTF_8);
}
```

这个格式有四个重要性质：

- 字段顺序写死，不遍历 `Map`；
- 数字用十进制 long，不经过 locale；
- 行尾固定 LF，不跟随平台；
- claimed `contentHash` 不进入被 hash 的 bytes，避免自引用。

hash 的计算也只接受一个结果拼写：

```java
byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonicalBytes());
return "sha256:" + HexFormat.of().formatHex(digest);
```

`RuleSetIdentity` 先验证词法形状，`MarketRuleSetArtifact.contentHashMatches()` 再比较 claimed 与 recomputed hash。这是两道不同的门：格式合法不代表内容匹配。

## Version 0 是显式兼容规则，不是绕过价格带

为了让 M04 的 legacy `place` 保持原业务结果，新 engine 引导到：

```text
version = 0
lowerInclusive = 1
upperInclusive = Long.MAX_VALUE
contentHash = SHA-256(M05RS1 bootstrap bytes)
```

它不是“没有规则”，而是一份真实、可寻址的 unbounded entry-band artifact。这样每张 M04 订单仍通过 `[1, Long.MAX_VALUE]`，同时 M05 的快照和 attribution 从第一条命令开始就拥有 active identity。

这种做法比 `activeRuleSet == null` 时跳过检查更稳健：null fallback 会制造一条未版本化的隐藏语义，重放者必须猜测“没有规则”到底等于允许全部、拒绝全部还是读取默认配置。

兼容只承诺业务投影。M05 可以给 event 与 snapshot 增加规则归因，但旧 M04F1/M04H1/M04X1 canonical projection 必须主动忽略新字段，继续生成历史冻结 bytes。不能为了让新 Java record 看起来兼容而回写旧 evidence。

## Prepare 必须先证明 artifact 自洽

Prepare 的输入同时携带 `expectedActive` 与完整 artifact：

```java
public record PrepareRuleSet(
    RuleSetIdentity expectedActive,
    MarketRuleSetArtifact artifact) {}
```

校验顺序必须让每个拒绝都停在业务状态之外：

```text
读取当前 active identity
→ expectedActive 必须精确相等
→ claimed hash 必须是 canonical lowercase 形状
→ recomputed hash 必须等于 claimed hash
→ candidate version 必须高于 active version
→ 处理 prepared slot 的幂等、冲突或 supersession
→ 产生一个控制结果与 detached snapshot
```

关键不是返回哪个错误字符串，而是下面这条状态不变量：

```text
PrepareRejected
=> activeAfter == activeBefore
&& preparedAfter == preparedBefore
&& bookAfter == bookBefore
&& registryAfter == registryBefore
&& nextAcceptanceSequenceAfter == before
```

精确重复当前 prepared identity 是业务幂等，返回 `ALREADY_PREPARED`；同一 version 对应不同 content 则是身份冲突，绝不能被“最后一次写入获胜”覆盖。更高且合法的 candidate 可以 supersede 单一 prepared slot，但更旧 candidate 不能让待激活代际倒退。

## 用独立例子完成 artifact 边界

不要只复制 fixture 中的 `[90, 110]`。独立练习可以构造 version 7、`[95, 105]`：

1. 手工写出精确 M05RS1 bytes；
2. 用 `MarketRuleSetArtifact.canonicalBytes()` 比较每一个 UTF-8 byte；
3. 重算 SHA-256，构造合法 artifact；
4. 分别把 hash 改成大写、去掉前缀、改一个 hex、保持 version 但改变 upper；
5. 对每个失败保存 Prepare 前后的完整 `MarketControlSnapshot` 与 book；
6. 证明只有合法 artifact 能占用 prepared slot，而且 active identity 始终还是旧值。

至少保留这些边界：

| 输入 | 预期性质 |
| --- | --- |
| `lower == upper` | 合法的单 tick inclusive band |
| `lower > upper` | artifact 构造失败，不进入 core command |
| version 与 active 相同、hash 相同 | 非递增 candidate，不能 Prepare |
| prepared identity 精确重复 | `ALREADY_PREPARED`，状态语义幂等 |
| prepared version 相同、内容不同 | conflict，旧 prepared 保留 |
| 更高合法 version | 可 supersede prepared，但仍不激活 |
| claimed hash 合法但内容不匹配 | 拒绝，不能部分复制 artifact |

固定语料中的 `hash-mismatch-and-retry` 与 `idempotent-prepare-and-version-conflict` 提供了已签约示例；complete identity 上的 independent reference 与 semantic mutant 又证明它们不是 production 自证。

## 本篇停止在“可以安全准备”，不提前激活

到这里，M05 只获得一个可靠候选：artifact 的字段域明确，canonical bytes 唯一，identity 同时绑定版本与内容，Prepare 的失败不会污染状态。它还没有获得生效时刻。

下一篇会引入 `ApplicationSequence`、`controlRevision` 与 `firstAcceptanceSequence` 三条不同的顺序轴，证明 Prepare 不改变准入，而 Activate 只在调用方声明的精确串行边界切换 active rule。那条 fence 仍是内存业务顺序，不是 WAL、Raft log 或 Aeron position。
