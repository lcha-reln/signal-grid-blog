# M15：固定发布组合、停机切换与新根恢复进程协议

本文件与 `m15.md`、`m15-bundle-backup-protocol.md`、M15 workload/profile/schema 共同冻结 M15 有限进程资格。本文定义实际角色、业务程序、切点与观测边界；包与归档的路径、编码、安装和拒绝规则以 bundle/backup 协议为准。M14 业务、wire、state codec、Q1 和 `appVersion=0x040000` 保持不变。本文中的步骤是待执行合同，开始标签不包含虚构的成功结果或 N 二进制 hash。

## 1. 固定运行组合与作用域

N−1 是 `course/m14-complete` 的 `56c4ec09ddf9fcf57f1cce763ae8b451ba7f394f`：冻结完整、有序的 11 个原始 jar，共 6,350,332 bytes。它们的 `0.8.0` 文件名不代表产品标签 `matching-0.8.0`。N 是当前干净 M15 源码构建的 operations `installDist`，其源码、文件、classpath、role entrypoints 和实际加载来源在完成阶段绑定。允许业务 jar 相同；资格证明实际发布组合切换与新写入保留，不宣称发生了格式迁移。

一次正向 fleet 包含 6 个 member JVM、2 个 publisher JVM 和 1 个 sink JVM。每 shard 三个 voter，memberId 为 0、1、2，shardId 为 1、2，clusterId 为 141、142；分别只交易 `BTC-USDT`、`SOL-USDT`。controller 不在服务 callback 中执行。若 operations CLI 为 operational child 保留 supervisor，supervisor 的 TOOL 身份、PID、startInstant、子进程和退出也进入所有权账，但不能充当上述九个角色之一。

所有 operational child 使用 Java 25、`-Xms32m -Xmx512m`、`--add-opens=java.base/jdk.internal.misc=ALL-UNNAMED`。允许冻结 profile 所述 OS 默认 receive-buffer 参数，必须记录实际参数。支持单机 macOS/aarch64 或 Linux/amd64，至少 4 logical CPUs、8 GiB RAM。不得以改 MTU、Q1、历史上限、诊断开关或 business jar 替换来通过本程序。

端口由受 hash 绑定的 deployment 显式给出。每个 member 使用 `portBase + memberId*10`，UDP offsets 1/2/3/4/5 分别用于 Archive/ingress/consensus/log/catchup，TCP offset 6 用于 M14 只读 adapter。controller 在启动任何角色前实际检查两个 shard 的全部固定 UDP/TCP 端口和 sink TCP 端口：无重复、无越界、当前可绑定。端口冲突是 SYSTEM_ERROR，不能私下选另一组端口。之后每次恢复保持相同端口与 member 身份。

## 2. 实际 role launch 和 EOF 生命周期

对外命令采用 bundle/backup 协议中的 `verify-bundle`、`member`、`publisher`、`sink`、`backup`、`restore`、`inspect`。正常角色入口必须先完成只读包与 deployment 检查，随后验证隔离的实际使用 bytes，才调用已有 runtime。不能先调用 `M14ClusterMember.launch` 或打开 journal 再声称验证失败没有修改 root。

独立观察器的入口冻结为：

```text
io.github.lchareln.cex.matching.operations.observer.M15RoleObserverMain
```

观察器 jar 仅包含 `META-INF/MANIFEST.MF`、该 class 及其 `$` nested classes；不打包业务类、Aeron、Agrona、Jackson 或当前 operations 实现。该工具有单独原始 bytes/hash。N−1 的 child classpath 顺序为完整原 11-jar 向量在前、此观察器在后；N 的 child 同样使用批准 runtime 向量在前、观察器在后。不得使用 wildcard、当前 testkit 的 runtimeClasspath 或 ClassLoader fallback。

观察器参数是已验证 launch document 的绝对路径及独立 hash：

```text
M15RoleObserverMain --launch /absolute/isolated-launch.json --launch-sha256 <64-lowercase-hex>
```

launch document 是严格 UTF-8 canonical JSON（编码同 bundle/backup 协议§1.1）、最多 65,536 bytes，遵循 `schemas/matching.m15.role-launch.v1.schema.json`，拒绝未知和重复字段。它精确包含：`schemaVersion="matching.m15.role-launch.v1"`、`runId`、`launchId`、`role`、`shardId`、`memberId`、`root`、`freshStart`、`deploymentSha256`、`bundleManifestSha256`、`observerSha256`、`roleMainClass`、`roleArguments`、`classpath`、`resourceSampleIntervalMillis=1000`。role 为 MEMBER/PUBLISHER/SINK；不适用的 shardId/memberId 为 null；publisher/sink的freshStart为false。runId/launchId分别由角色CLI的`--run-id`/`--launch-id`传入规范UUID，同fleet同runId、每次launch唯一。`classpath` 按实际顺序列 `{path,bytes,sha256}`；路径必须是已验证隔离包里的绝对 regular files。launch document hash 从独立控制参数获得。roleArguments 是字符串数组，不经过 shell 拼接。

roleArguments 的唯一派生规则如下，不能增加另一个未冻结业务入口：

| role | 实际业务入口及参数 |
| --- | --- |
| MEMBER | 观察器直接调用所选 jar 的 `M14ThreeMemberConfig`、`M14ClusterMember.launch(config, memberId, freshStart)`；参数值等同 `M14ThreeMemberConfig.memberProcessArguments` 的完整成对参数。每次 owner loop 调用 `doOutputWork(now)`、按原 100 ms 周期 `publishStatus()`、`throwIfFailed()`。 |
| PUBLISHER | 调用所选 jar 的 `M14PublisherProcessMain.main`，8 项：publisher root、Q1 path、该 shard genesis path、publisherId、epoch、3 个 read ports 的逗号列表、3 个 ingress endpoints、sink port。 |
| SINK | 调用所选 jar 的 `M14SinkProcessMain.main`，5 项：sink root、Q1 path、genesis1 path、genesis2 path、sink port。 |

MEMBER 的 roleMainClass 为 `io.github.lchareln.cex.matching.cluster.M14ClusterMember`，另外两项分别为同包的 `M14PublisherProcessMain`、`M14SinkProcessMain`。观察器记录关键类的 ProtectionDomain code source、原始 jar bytes/hash 和完整 `java.class.path`；其来源必须逐项落在 launch 批准的向量中。member至少记录该role class、`DirectM14ShardRuntime`、`M14SnapshotCodec`、`M14OutputCodec`、核心`io.github.lchareln.cex.matching.SingleInstrumentMatchingEngine`；publisher至少记录其role class、`M14MatchingClusterClient`、`M14OutputCodec`；sink至少记录其role class、`M14SinkJournal`、`M14OutputCodec`。记录实际使用的Aeron/Agrona/Jackson关键类来源；不存在或未加载的无关库类不能伪填为已加载。STARTED先绑定已验证launch/classpath，READY再绑定上述实际加载来源。

MEMBER 观察器只有一个读取 EOF 的线程；EOF 通知 owner 停止，owner 在 finally 调用实际 `member.close()`，随后检查 `componentErrors()` 为空。PUBLISHER/SINK 的 stdin 仍直接供原 M14 action/ADMIN inbox 消费：观察器只能用透明输入包装记录实际读到 EOF，不能并行读取而窃取命令。只有原 main 正常返回，才能声明这些角色的 try-with-resources 关闭完成。所有资源采样、stdin 观察线程由观察器拥有并在退出前结束；这些工作均在 callback 外。

生命周期原始 JSONL 由观察器 stdout 发出，与原 M14 输出按 schema/type 区分。每行最多 65,536 UTF-8 bytes，须有 LF，不允许未知/重复字段。记录共同字段为 `schemaVersion="matching.m15.lifecycle.v1"`、`runId`、`launchId`、`role`、`shardId`、`memberId`、`pid`、`processStartInstant`、`ordinal`、`event`、`details`。event 依次是 `STARTED`、`READY`、`EOF_OBSERVED`、`CLOSE_COMPLETED`；失败用 `FAILED` 并非零退出。STARTED.details 绑定 launch hash、观察器 hash、classpath/codeSources；READY.details 绑定实际角色状态来源；EOF_OBSERVED.details 仅有 `reason="STDIN_EOF"`；CLOSE_COMPLETED.details 必须含 `componentErrors=[]` 和 `ownedThreadsTerminated=true`。close 调用抛错、被中断、component errors 或线程未结束均不得发成功 CLOSE_COMPLETED。

controller 在同一个自身单调时钟域记录 launch 请求、收到各行、stop 请求、实际进程退出、force cleanup。child 的 nanoTime 不与 controller 相减。PID 必须同时绑定 ProcessHandle startInstant，避免 PID 复用。READY 不能只因 JVM 已存在：member 要观察到真实状态与服务加载；fleet ready 要确认每组一个 leader、三个 voter 和完整 state 收敛；publisher/sink 要完成实际构造并有对应 PID 状态。

正常停机唯一触发为 controller 关闭被拥有 child 的 stdin。每角色从请求 EOF 到 CLOSE_COMPLETED 且 exit 0 最多 30 s；全角色 barrier 最多 90 s；role startup 最多 60 s；单 aggregate scenario 最多 600 s。SIGTERM、exit 143、PID 消失、未打印 ERROR、原 `M14ClusterMemberMain` 的 5 s join 都不能代替 CLOSE_COMPLETED。超时先使场景失败，再允许仅对已证明属于本运行的 PID 强制清理；最终 teardownComplete 不能抹去该失败。

## 3. Bootstrap、请求身份与业务原语

固定 route 由 `M13RouteArtifact.create(1,"ops-m15",Map.of("BTC-USDT",1L,"SOL-USDT",2L))` 产生。两 shard 的 original route bytes 相同。每 shard 从 `new DirectM13ShardRuntime(shard, route).stateImage()` 产生原始 M13 snapshot，再以冻结 Q1 创建 M14 OutputGenesis。genesis UUID 由下述 ID 函数对 `m15/ops-v1/genesis/<shard>` 生成。import 严格为空 resting book；后续 maker 必须是真实新请求。完整 original bootstrap 与恢复时 active route 分别绑定；本程序不变 route，不能因此删除该区分或在备份时重造 bootstrap。

`id(text)` 是 Java `UUID.nameUUIDFromBytes(text.getBytes(UTF_8))`，使用大小写敏感 ASCII 文本和无末尾 LF。下文 `s` 为十进制 shard，`p` 为该 shard 连续新业务 ordinal。两个 shard 的每个步骤按 s=1 再 s=2 执行，步骤完成后再进入下一步；本程序没有跨 publisher 同 shard 并发控制。transport request/message UUID 可以由原 M14 实现随机生成，但必须保留实际原始 bytes；不能将其当作业务身份种子。

| 身份 | 规则 |
| --- | --- |
| source producer | `m15-ops-shard-<s>`，epoch=1，shardId=s，sequence=p；exact retry 保留原 slot |
| commandId（CURRENT 分支） | `id("m15/ops-v1/current/shard/"+s+"/command/"+p)` |
| commandId（冷恢复后新命令） | `id("m15/ops-v1/cold/shard/"+s+"/command/"+p)`；不修改 backup 已有身份 |
| correlationId | `id("m15/ops-v1/"+phase+"/shard/"+s+"/invoke/"+invocationOrdinal)`；每次实际 submit 唯一，invocationOrdinal 从 1 连续增长 |
| controller controlId | `id("m15/ops-v1/"+phase+"/shard/"+s+"/controller-control/"+controlOrdinal)`；每次新的显式控制唯一，精确控制重试保留原 id/request |
| publisher action requestId | `id("m15/ops-v1/"+phase+"/shard/"+s+"/launch/"+launchGeneration+"/action/"+actionOrdinal)` |
| publisher identityPrefix | `m15/ops-v1/<phase>/shard/<s>/launch/<launchGeneration>/action/<actionOrdinal>`；传给原 M14 publisher，实际内部 controlId 仍由原实现的该 prefix + `/control/` + invocation ordinal 生成 |
| ADMIN requestId | `id("m15/ops-v1/"+phase+"/shard/"+s+"/admin/"+adminOrdinal)` |
| publisher grants | `m15-publisher-<s>-epoch-1`，初次 `expectedEpoch=0` 得 epoch 1；冷恢复 takeover 用 `m15-publisher-<s>-epoch-2`、expectedEpoch=1 得 epoch 2 |

phase 只取 `base`、`upgrade`、`rollback`、`cold`，launchGeneration/各请求 ordinal 都从 1 计数并进入原始 trace。controller 与 publisher 的控制 namespace 不重叠。每条 M13 source 使用当时已验证 active route；每条 M14 request 包含固定 genesisId。hash、canonical encoding、账户归属规则沿用 M14。

业务原语只用已有 `M08Command`：

* `MAKER(s)`：orderId=`10000*s+1`，SELL、price=100、quantity=1000、GTC、participantGroupId=0、stpPolicy=NONE、expectedActive absent，account=`m15-maker-<s>`。
* `PREPARE(s)`：`PrepareRuleSet(bootstrapIdentity(instrument), artifact)`；artifact 为现有 `MarketRuleSetArtifact` version=1、price band [90,110]，contentHash 按原 M05 canonical bytes 计算。
* `ACTIVATE(s)`：`ActivateRuleSet(3, bootstrapIdentity(instrument), artifact.identity())`。它是 book 第三次 application，必须产生真实 RuleSetActivated；PREPARE 不产生 Market batch，ACTIVATE 产生 BookStatus。
* `TRADE(s,t)`：orderId=`10000*s+100+t`，BUY、price=100、quantity=1、IOC、participantGroupId=0、stpPolicy=NONE、expectedActive=version1 artifact.identity，account=`m15-taker-<s>`，与 maker account 不同。
* 冷恢复新业务用 `COLD_TRADE(s,t)`，t=1,2，orderId=`10000*s+200+t`，其余与 TRADE 相同。maker quantity=1000 仅用于 V/R 程序；独立 capacity root 的 maker quantity=1000000 不混用。

每个新 TRADE 必须恰好有一笔 price100/quantity1 的真实成交，maker 为原 SELL，taker 为本 IOC；该 taker 终结、maker 继续 resting。Execution 的 MAKER/TAKER account 精确不同，Market 不含 private account。matching rejection、外层拒绝、duplicate 或仅收到相关 ACK 不能算这笔成交。

每次新业务的完整 correlated response 与完整 Execution/可选 Market canonical bytes，都在判定时绑定并与独立 expected model 对照；不得仅比较最终盘口摘要。可以复用 M14 独立输出模型与 M07 线性 reference，再用 DirectM14 mirror 交叉核对 runtime 包装、控制与 snapshot。原始 typed 事实是对比依据，格式化字符串不是事件解析接口。

## 4. 固定 cut A：N−1 非平凡状态与 R01 冷备来源

首次在空 root 以 N−1、freshStart=true 启动完整 fleet；创建角色所需路径和 bootstrap 属于已通过只读 preflight 后的启动阶段。分别对两 shard 的 EXECUTION、MARKET 提交 epoch1 GrantPublisher（E 在前，M 在后），验证真实 replicated response 及三个当前 member 相同 grant/revision，再向 sink 发原 M14 trusted ADMIN。每条 ADMIN 使用原 grant response hash、原提交 revision；当前三个 member revision 可以更高，但 grant 必须相同。只有收到真实 forced journal `ADMIN_OK` 才允许 DATA。

每 shard 固定执行下列程序，表中 E/M 均为各自独立 stream sequence：

| 顺序 | 操作 | 必须达到的业务事实 |
| --- | --- | --- |
| A01 | p1 MAKER、p2 PREPARE、p3 ACTIVATE | source business cut=3；E tip=3；M tip=2；active band v1[90,110]；maker1000 resting |
| A02 | 原 M14 publisher `DRAIN(EXECUTION)`，再 `DRAIN(MARKET)` | E sink/replicated ACK=3；初始 Market drain 按原实现安装 cut2 whole-shard snapshot，sink/replicated M cursor=2，digestKind=MARKET_SNAPSHOT |
| A03 | TRADE t1..12，即 p4..15；只 DRAIN Execution | 12 跨账户成交；E sink/replicated ACK=15；M sink/ACK 仍2；此后不再复制 Execution ACK |
| A04 | TRADE t13..16，即 p16..19 | E19/M18，maker984；pending E16..19 |
| A05 | 每 shard 发一次实际 Cluster snapshot admin request | 三个成员各自新的 service0 与 consensus snapshot completion；实际写出 M14 state 等于本次快照 cut；原始 recording IDs/positions 被记录 |
| A06 | TRADE t17..20，即 p20..23；无 drain | service snapshot 后四条新业务 suffix；E23/M22；maker980；20 terminal takers；E pending16..23 正好8 |
| A07 | publisher `FETCH(MARKET,afterSequence=2)` | 真实 adapter 返回 MARKET_SNAPSHOT_REQUIRED；M retained 为7..22，floor7、tip22，不能伪造 gap 标志 |
| A08 | publisher `FETCH(EXECUTION,afterSequence=15)`，`SEND(EXECUTION)`，不发 ACK | 实际发送并 fsync E16；sink E=16、service ACK仍15；未确认8批保持不变。缓存17..19可以随停机丢弃，原字节从replicated outbox重读 |
| A09 | 精确重试 p1、p4、p23，各一次 | 三条均 DUPLICATE_REPLAYED；业务/producer/ownership/output/control 状态全不变 |

cut A 的硬性向量对两个 shard 都是：business=23，E tip23/ACK15/floor16/retained16..23，M tip22/ACK2/floor7/retained7..22，sink E16、sink M2，两个 epoch1 grant，active rule v1，非空 maker980。E ACK digest 为 E15 batch digest，sink E digest 为 E16 batch digest；M ACK/sink digest 为 cut2 snapshot digest。完整 state、每个 pending payload、原始业务/控制身份及 journal receipt 必须一起比较。controlRevision 由实际控制历史计算，不用一个人为硬编码 revision 代替该历史。

A01..A09 每 shard 固定 23 个新业务请求、3 个 exact replay、2 个显式 GrantPublisher、2 个 ADMIN、6 个 publisher action、1 个 Cluster snapshot admin request。DRAIN 内的真实 TCP/ACK 调用另按每次原语计数；它可能合法重复确认已 durable 的同一 cursor，也会在 Market snapshot cut 已改变时得到预期控制拒绝。额外轮次不能隐身，也不能误报新业务。

达到 cut A 后按 §7 全停，绑定停止向量、mark 观测和两次不变 inventory，R01 仅备份这个明确命名的 cut A。R02 后来恢复 cut A，明确不包含 N 在之后写入的事实；V03 对 CURRENT roots 的回退单独证明那些写入保留。

## 5. V02/V03：CURRENT roots 上 N−1 → N → N−1

R01 备份完成后，保持原 CURRENT durable roots 的完整 bytes，在确认全停 barrier 后切换选择为 N，freshStart=false。先仅启动六 members 和 sink，完成 cut A 比较；publisher 即便先构造也必须没有任何 action，sink 在比较前不能收到新 ADMIN。启动本身产生的新 PID、Aeron counters、diagnostics 文件、mark paths 不属于业务 state 相等；完整 M14 snapshot/state 与恢复 journal 的语义和原始字节必须满足 §8。

V02 按顺序执行：

1. 比较完整 cut A；所有三 member 的 actual loaded service snapshot 等于 A05 写入的 state，并通过 Archive log replay 达到 A06 的 suffix cut23。
2. exact replay p1、p4、p23 各一次。按 M14 exact retry 规则，outer status 改为 DUPLICATE_REPLAYED，outer/inner correlation 替换为新 correlation；original inner result/status、shard sequence、Execution/Market identity 和其他字段逐字节保留。重试前后完整状态相等。
3. 每 shard 重新发送两个原 grant 的 trusted ADMIN（保持原 grant 提交 revision/hash），确认 recovered sink grant receipt 精确重试；再启动/使用 epoch1 publisher，DRAIN E 后 DRAIN M。E16 已 durable 的事实先用真实 frontier receipt 复制 ACK，再交付17..23；M2 的真实 retention gap 要通过 whole-shard snapshot22 和 InstallMarketSnapshotCursor 收敛。
4. TRADE t21..24（p24..27），每 shard恰4新成交；DRAIN E、M，确认两流 durable output 与 replicated cursors；此时 E27/M26、maker976。
5. 每 shard 发一次真实 Cluster snapshot request，确认六成员各自 service+consensus 新 recording completion 和 snapshot state。
6. TRADE t25..26（p28..29），每 shard恰2个 snapshot 后新成交；DRAIN E、M；记录 cut B：business29、E29/ACK29、M28/ACK28、maker974，以及完整 N 新身份/结果/输出/journal。然后全停。

V02 每 shard固定6个新业务、3个exact replay、2个 ADMIN、6个publisher DRAIN action、1个 Cluster snapshot request。新控制的实际完整请求与响应逐原语入账。不可把 N 首次启动后的控制变化倒填进 cut A。

V03 选择 N−1，**直接重开产生 cut B 的 CURRENT roots**，freshStart=false。此步骤不能读取 R01 的 cut A backup，也不能替换 archive/cluster/journal 为升级前版本。先完整比较 cut B；实际加载 V02 第5步 N snapshot，再 replay 第6步 N suffix。比较至少包括全部 p24..29 的 original response 和输出 bytes，不能只挑一条结果代替完整切点。

比较后 exact replay p1、p4、p23、p24、p29，各一次；前3个是旧事实，后2个分别来自 N snapshot 前/后。随后重新安装两个原 epoch1 ADMIN，DRAIN E、M 核对空后缀的真实 durable frontier reconciliation；TRADE t27..28（p30..31）各产生新成交，再 DRAIN E、M，记录 cut C：business31、E31/ACK31、M30/ACK30、maker972。V03 每 shard固定2个新业务、5个exact replay、2个ADMIN和4个DRAIN action。全停后才能将这组 CURRENT roots 隔离供后续 cold restore。

## 6. R02/R03：只从 cut A backup 恢复到新绝对 root

把原 CURRENT runtime root rename 到 controller 明确拥有的 quarantine sibling，旧配置路径不得再解析为可用 runtime；记录 rename 前后目录 identity 和原配置路径不存在事实。恢复 child 的配置/参数/classpath 不得引用 source 或 quarantine。权限/参数隔离支持本机受控测试，不宣称能阻止恶意同用户绕过。原 source 的 diagnostics、临时 client、publisher cache 都不得用作恢复输入。

R02 使用固定 N bundle、cut A backup、可信 manifest hash、明确 deployment 和新的空绝对 root；保持原端口/IDs，freshStart=false。恢复完整六成员各自 archive/cluster、bootstrap 与 sink journal。先证明安装后的每个 logical file 与 backup hash/length 相同，再启动六 members 和 sink；比较 cut A 的完整业务/控制/ownership/outbox 与恢复 journal。**这次比较发生在任何新的 ADMIN、GrantPublisher、ACK、snapshot cursor 或业务调用之前。** 单独的 read-only 对比不得打开一个可能截断 journal 的 mutating 恢复入口代替文件检查。

R03 每 shard固定进行以下真实操作：

1. exact replay p1、p4、p23，各一次，状态不变。恢复后的 sink 在 ADMIN 前必须拒绝 DATA/FRONTIER，保留实际返回 ADMIN_RECONCILIATION_REQUIRED 的原始网络证据；使用只含已有 stream/grant 的零 payload frontier request，不冒造业务 DATA。
2. 对 E/M 重发原 epoch1 ADMIN，核对返回原 grant install receipt、journal bytes不变。epoch1 publisher FETCH E after15，SEND cached E16；sink 必须承认已有原始 E16 为 duplicate，durable cursor/hash/journal长度不变，不复制服务 ACK。
3. controller 为 E/M 分别真实复制 epoch2 GrantPublisher，再向 sink 安装对应 ADMIN 并收到 forced receipt。旧 epoch1 publisher 仍然存活且保有 E16，实际 SEND 一次必须 STALE_GRANT；再对步骤2缓存的 durable ACK 发 ACK action，也必须由 Cluster 以 STALE_GRANT 拒绝。两次拒绝不得改变 cursor、业务状态或 journal；新 epoch2 grant 及其提交控制本身的合法变化单列。
4. 正常 EOF 关闭两个旧 publishers，验证各自 CLOSE_COMPLETED+exit0；同 N runtime 组合启动两个 epoch2 replacement publishers。它们 DRAIN E、M：先将 sink E16 ACK 复制，再重放 E17..23；M2→snapshot22→InstallMarketSnapshotCursor。精确比较最终 sink projection 与 service whole-shard snapshot。
5. COLD_TRADE t1..2，即冷分支 p24..25，恰2新跨账户成交；DRAIN E、M，从 snapshot22 后应用真实 M23、M24 suffix。最终冷分支 business25/E25 ACK25/M24 ACK24、maker978；grant epoch2、pending E=0。对完整 journal、两流原始 bytes、所有账户归属与 final state 再核对，然后全停。

R02/R03 每 shard固定2个新业务、3个exact replay、2个takeover GrantPublisher、4个ADMIN、8个publisher action（FETCH、duplicate SEND、stale SEND、stale ACK、4次DRAIN），以及1个ADMIN前 frontier probe。stale ACK 是实际额外控制调用，不能藏在两个显式 GrantPublisher 计数里。这里的 publisher 替换是同组合内 fencing 见证；切换任何 binary vector 与执行 backup/copy 仍要求全九角色停止。

## 7. 全停向量、mark 和备份屏障

controller 先停止 arrival 调度并等待本程序全部已发业务得到相关响应；V/R 正向程序不把 UNKNOWN 当成功，未决调用或组件错误即 SYSTEM_ERROR。随后停止 publisher pump，等待最后一个已发 action 完成，固定预定 output gap；不为“清空”而擅自补 ACK。捕获 cut 中所有业务状态、sink receipt、原始日志摘要和进程身份，再依序：

1. 两个 publisher 同时请求 EOF，均在各自30s内完成正常关闭并退出。
2. sink 请求 EOF，完成journal/server/trace关闭并退出。
3. controller 关闭两个业务 client；六个 members 同时请求 EOF，分别观测实际 close completion 与exit0。客户端是 controller 所有工具资源，不得留嵌入式 MediaDriver 或后台线程。
4. 对全部 owned PIDs（含可选 TOOL supervisors）验证已退出；九个 operational role 均有匹配launchId/PID/startInstant的原始receipt。整个过程连同mark检测必须在首次publisher EOF后的90s内完成。

每 member 必须保留并观测三种 mark：`archive/archive-mark.dat`、`cluster/cluster-mark.dat`、`cluster/cluster-mark-service-0.dat`，共18个。live时先读取完整有效 header、组件身份、PID、positive activityTimestamp，绑定其原始bytes；PID与当前owned member相符。

已核对的 Aeron1.52.2 `ArchiveMarkFile.close()` 与 `ClusterMarkFile.close()` 并不在磁盘写一个 CLOSED enum；对象关闭后的 accessor 返回值也不能代替磁盘读取。其更新周期为1000ms，liveness timeout为10000ms。全部角色exit0后，只读读取18个文件的header两次，样本间隔至少100ms：两个实际header/活动时间戳相同，最终控制端实际 `wallNowMillis - activityTimestamp > 10000`，owned PID/startInstant已退出。过期时间戳与关闭receipt共同成立才通过；不能改写timestamp使其过期，不能只sleep固定时间然后假定inactive。采样记录actual wall time和controller monotonic observation time。

随后对持久源树做两次只读排序inventory/length/SHA256，第二次扫描在第一次完成后开始；两次完全相同。扫描对象精确为六份完整archive/cluster、deployment.json、七个bootstrap文件和sink/journal.bin。inventory原件是canonical JSON array `[{path,bytes,sha256}]`，path按root-relative ASCII排序。扫描不含后来产生的stop-receipt、inventory自身或任何evidence refs，避免自引用；cut/stop原材料另按完整refs闭包绑定。它不是跨shard原子性证明：实际cut是两个明确分量的已停止向量。诊断资料用于比较，不替代Archive catalog/segments/recording.log/node-state/marks。

整个 stopped-backup 的资源边界、单gzip容器、logical file bytes与compressed artifact bytes、staging/rename和拒绝行为由 bundle/backup 协议冻结。Aeron瞬时`aeron/`、client Aeron、publishertransport cache可以重建；不得把持久mark一并删除。文件sync默认值与未覆盖power-loss范围必须如实报告。

## 8. cut/stop 交换材料与相等语义

cut与stop-receipt均为严格UTF-8 JSON、唯一键、末尾LF，最多1,048,576 bytes；字段及枚举由相应schema收紧，未知字段拒绝。64位纳秒时刻用无前导零十进制字符串；计数/序号用JSON integer并检查范围，禁止浮点截断。SHA256为小写64hex，只有继承M05 rule identity保留原`sha256:`前缀。

cut文件逻辑路径为`evidence/cut.json`。顶层精确字段：`schemaVersion="matching.m15.cut.v1"`、`cutId`、`runId`、`deploymentSha256`、`sourceBundleManifestSha256`、`rootAtCapture`、`shards`、`sink`、`refs`。cutId取`A_N_MINUS_ONE`、`B_N_CURRENT`、`C_ROLLBACK_CURRENT`、`D_COLD_RECONCILED`；容量自己的cut取`CAPACITY_HISTORY`。shards按1/2排序，元素含：`shardId`、`clusterId`、`businessSequence`、`controlRevision`、`genesisId`、`profileHash`、`originalRouteHash`、`activeRouteHash`、`expectedStateRef`、`members`、`streams`、`retryLedgerRef`、`outputLedgerRef`。members按0/1/2排序，含`memberId`、`launchId`、`pid`、`processStartInstant`、`stateRef`、`snapshotWrittenRef`、`snapshotReceiptRef`；streams按EXECUTION/MARKET排序，包含`kind`、`tip`、`floor`、`acknowledgedSequence`、`acknowledgedDigestKind`、`acknowledgedDigest`、`grant`、`retainedCount`、`retainedEncodedBytes`、`retainedPayloadRefs`、`marketSnapshotRef`（E为null）。

sink含`sinkId`、`launchId`、`pid`、`processStartInstant`、`journalBytes`、`journalSha256`、`journalRevision`、`journalHeadSha256`、`stateRef`和按shard/kind排序的4项`streams`；每项包含`shardId`、`kind`、`sequence`、`digestKind`、`contentHash`、`grant`、`grantReceiptRef`、`durableReceiptRef`、`marketProjectionRef`（E为null）。sinkId取deployment的`sink.instanceId="m15-sink-o1"`，不能以某次PID充当持久身份。

refs是完整引用表，每项`{id,logicalPath,bytes,sha256,purpose}`，id符合`[A-Za-z0-9][A-Za-z0-9.-]{0,127}`且唯一，logicalPath固定在`evidence/cut-artifacts/`下，使用只含ASCII字母/数字/点/连字符的单个`.bin`或`.json`文件名。purpose只取MEMBER_STATE、EXPECTED_STATE、SNAPSHOT_WRITTEN、SNAPSHOT_RECEIPT、RETRY_LEDGER、OUTPUT_LEDGER、EXECUTION_PAYLOAD、MARKET_PAYLOAD、MARKET_SNAPSHOT、SINK_STATE、GRANT_RECEIPT、DURABLE_RECEIPT、MARKET_PROJECTION、LIFECYCLE、MARK_LIVE_HEADER、MARK_STOPPED_HEADER、TREE_INVENTORY。raw业务/输出ledger可在此用严格JSON封装base64原始bytes；必须包含实际原始payload，不能只有hash。cut中每个`*Ref`都准确解析到该表，表中每项恰有实际用途；缺失、额外、重名、路径别名或hash变更均拒绝。R01 backup必须将cut.refs与stop-receipt.refs两个表引用的所有原始bytes一起压缩纳入logical backup files。不能让restore仍需访问原runtime或reports旁路文件。

为让实际原始材料在既定512-artifact总界内闭合，固定以下有限packing，不改变每份原始bytes的比较义务：

* 每stream的`retainedPayloadRefs`只引用一个canonical JSON ledger；即使空stream也保留该ledger的空batches数组。对象字段恰为`genesisId`、`shardId`、`kind`、`batches`，batches按sequence递增，每项恰为`sequence`、`contentHash`、`payloadBytes`、`payloadSha256`、`payloadBase64`。base64是标准带padding、无空白编码；解码后须canonical重编码相同，并按原M14 codec验证完整payload及stream/sequence/business contentHash。payloadSha256是包含末尾business digest的完整payload hash。ledger长度≤1MiB、batch数量/原始bytes受原Q1各stream界约束，数组必须恰好覆盖state.retained，不能把retainedPayloadRefs数组长度误当batch数量。purpose仍分别为EXECUTION_PAYLOAD、MARKET_PAYLOAD。
* LIFECYCLE使用一个canonical JSON array保存本次barrier所有role原始stdout lifecycle行，每项恰为`launchId`、`ordinal`、`bytes`、`sha256`、`base64`；按launchId/ordinal排序，解码保留原始LF和完整行，逐launchId重新验证事件序列和PID绑定。不同role的lifecycleRef可以引用这一相同集合；不允许缺项、重复键值或用重建的摘要代替实际行。
* GRANT_RECEIPT、DURABLE_RECEIPT、SNAPSHOT_RECEIPT各可使用同purpose的一个canonical JSON原始集合，元素恰为`key`、`bytes`、`sha256`、`base64`，按key ASCII排序。grant/durable的key固定`shard-<s>-EXECUTION`或`shard-<s>-MARKET`，snapshot receipt的key固定`shard-<s>-member-<m>`；引用上下文必须准确找到唯一元素并比较其完整原件。集合受1MiB原始JSON界约束，每份原始receipt仍执行自身更小的codec/record界。不能按成功状态文字补造receipt。
* 每个mark两次stopped header须独立实际读取并各自建立source-stage hash；两份原始bytes相同时可以复用同一MARK_STOPPED_HEADER ref，独立采样时刻仍在18项mark观测里保留。相同purpose的member-state/snapshot-written原件经逐PID独立读取、hash和bytes比较之后也可共享同一个原始bytes ref；各自PID、采样事实和snapshot recording receipt仍分别存在。不得先读leader一份再替其他member填观测。

共享的是一个已验证原始对象的显式ref，不创建多个logicalPath指向同一外部文件。不能对完整六member archive/cluster durable trees作这种证据packing或身份合并；它们仍各自逐logical file无损保存。

full state比较是实际`M14SnapshotCodec`原始canonical bytes与独立预期bytes的精确相等，并解码核对source books/rules/mode、所有业务身份/producer slots及original responses、ownership、全部M14 operations/controlRevision、genesis/Q1、两流seq/grant/ACK/digest/retained bytes和whole Market snapshot。六个成员都要比较，不能复制leader诊断冒充其他member证据。expectedStateRef是controller真实独立预期来源；member stateRef是该PID实际外部diagnostics来源。

恢复启动会合法改变process/supervisor PID、Aeron控制日志/session、mark中的绝对路径与活动时间、diagnostics文件。cut相等不要求这些启动观察字段不变，也不能据此豁免业务state或journal变化。R02安装前先比较backup所列所有原始文件；启动后再比较完整应用state、loaded snapshot+suffix及sink journal恢复内容。ADMIN前journal bytes/hash必须仍等于cut；新ADMIN或grant后的合法journal/control变化归入新的阶段，逐原语mirror，而不是重新定义原cut。

stop-receipt逻辑路径为`evidence/stop-receipt.json`，精确顶层字段：`schemaVersion="matching.m15.stop-receipt.v1"`、`runId`、`cutId`、`cutSha256`、`deploymentSha256`、`root`、`startedAtControllerNanos`、`completedAtControllerNanos`、`allStopped`、`forceCleanupUsed`、`roles`、`marks`、`inventories`、`refs`。roles为本次全停barrier九个operational role及0..9个TOOL supervisors，每项含`launchId`、`role`、`shardId`、`memberId`、`pid`、`processStartInstant`、`stopRequestedAtControllerNanos`、`closeObservedAtControllerNanos`、`exitObservedAtControllerNanos`、`exitCode`、`forceUsed`、`lifecycleRef`；TOOL另有`operationalChildLaunchId`。同场景此前retired publisher另保留实际receipt，整个owned-PID账仍须验证其已退出。marks恰18项，包含`shardId`、`memberId`、root-relative `relativePath`、`liveHeaderRef`、`firstStoppedHeaderRef`、`secondStoppedHeaderRef`、`firstStoppedWallMillis`、`secondStoppedWallMillis`、`firstStoppedControllerNanos`、`secondStoppedControllerNanos`、`activityTimestamp`、`pid`。inventories包含两项实际扫描的`startedAtControllerNanos`、`completedAtControllerNanos`、`inventoryRef`。refs编码与cut相同且必须实际闭合。通过值须allStopped=true、forceCleanupUsed=false、全部exitCode=0，无缺失receipt。

roles顺序固定六MEMBER按(shard,member)、两PUBLISHER按shard、SINK、可选TOOL按launchId；marks按(shard,member)、Archive/Consensus/Service0排序。cut/stop schema是上述对象的结构边界，refs用途、真实bytes、成员身份、时间及相等关系还须按本文跨字段验证。

原始文件在产生/读取判定时绑定SHA256，复制进入证据后复验已绑定bytes；末尾重新hash并接受被修改文件不合格。压缩trace必须是严格单gzip member、严格UTF-8/JSONL、展开/单行有界且有完整BEGIN/END；各阶段独立purpose和成功断言，不允许用一个空归档指代全部场景。

## 9. capacity harness 接缝与共同证据

容量C01–C06使用独立N root，不沿用上述maker1000、business序号或cut。其6250 logical arrivals、6阶段输入、每shard queue64+worker-held1、1s资源采样、120s drain/reconcile、真实leader故障与C03背压程序由M15 workload/profile冻结，本文不另造吞吐阈值。

bundle-based harness必须提供以下可复用能力，内部Java命名可组织在`M15BundleProcessHarness`，不得通过另一套当前classpath启动绕过同一生产role命令：

| hook | 必须实际完成的工作 |
| --- | --- |
| launch(selectedBundle, deployment, root, freshStart) | 只读预检、隔离bytes复验、全端口preflight、九角色所有权和binary来源；支持首次空root、已有CURRENTroot、已恢复新root三种明确模式 |
| status(shard, member) / awaitReady | 读取对应PID的真实M14状态；获取当前leader/member authority，完整三副本state收敛 |
| connectClient(shard) | 返回调用原`M14MatchingClusterClient.connect`的独立single-owner client；每shard一个同步worker，controller不得跨线程同时submit/control同一client |
| publisherAction / pausePump / resumePump | 使用实际独立publisher stdin动作与TCP/sink链；pump每publisher最多一个在途action，暂停等在途action结束才确认，不以暂停flag伪造fulloutbox |
| grant / installAdmin / mirrorControls | 保留实际M14请求、响应、grantreceipt和member复核；按实际action/调用顺序mirror每次publisher控制，不能只按revision排序猜并发顺序 |
| requestSnapshotAndAwaitAll | 真实Cluster admin request；所有六member service+consensus记录完成、原始written state/recording ID/position绑定；新启动检查loaded state与suffix |
| stopFleet / startCurrent / startRestored | 共用EOF/30s/90s/all-owned退出和mark规则；capacity C05也是实际重启与全cut比较 |
| killObservedLeader | 仅C04显式故障调用，先记录当前实际leader的shard/member/PID/startInstant和authority，再终止这个owned进程；与正常停止不同分类，不能用此路径完成备份或V/R正常关闭 |
| resourceSamples | 每个实际child自己采集heap used/committed/max、GC count/time、process CPU、direct buffers，controller绑定role/PID与收到时刻；FD可明确unavailable；不可把controller的ManagementFactory值冒充child |

C04的killed leader旧launch永久标为`EXPECTED_FAULT`，记录实际kill请求、退出码/退出观测、PID/startInstant、最后authority和该member三个mark实际inactive观测。它不具备正常CLOSE_COMPLETED，不能塞入allStopped正常receipt、不能填exit0，也不能抹掉杀进程的动作。fault arrival阶段结束及有界请求收敛之后，固定以**同N bundle、同durable root、同端口/member身份、freshStart=false、新launchId**重启该member；60s启动界内重新加入原group，核对新PID/mark paths与全部六member完整state收敛。重入失败是SYSTEM_ERROR，不能带五个member进入C05。

C05只能在上述恢复为六member、两publisher、一sink后执行实际snapshot与九个当前live launches的正常EOF全停/重启。正常stop receipt仅包含这九个当前launch及其可选TOOL supervisors；C04旧EXPECTED_FAULT launch的永久所有权记录、kill/exit/mark证据另行保留。C05真实恢复后再次比较完整history cut与old/new retries；C04的故障恢复不能替代C05独立snapshot/正常重启见证。只有明确C04计划内kill属于EXPECTED_FAULT；其他正常停止中的force cleanup仍先使资格失败。

持续publisher pump由独立controller工作线程驱动，独立arrival producer不得等待response或publisher。动作inbox、publisher batchqueue/cache、snapshot image、TCP reassembly和worker-held对象分别按Q1/O1报告，不把queue count当全部驻留内存。保留现有full-state diagnostics，记录目录logical bytes、journal、history/producer/operations与snapshot增长。component error导致流程失败，不归类成正常capacity refusal。

V/R阶段每个business/control/action/ADMIN/snapshot/stop原语先记ATTEMPT，再记实际结果。每次成功新control使controlRevision恰+1；exact control retry不前进；任何预期拒绝无绑定/业务状态变化。DRAIN的内部ACK和frontier探测全部纳入实际调用账；不冻结受空页/分页影响的静态control总数，亦不能删除这些原语来让汇总平衡。V/R业务请求固定计数按§4–6重算；capacity逻辑6250与所有额外prelude/controls/retries/overload单列。

V01–V04、B01–B06、R01–R06、C01–C06共22个aggregate IDs，实际负向变体由workload及bundle/backup协议列全。缺原始bytes、未预期parser/schema内部故障、IO/deadline/未关闭PID/组件失败均为SYSTEM_ERROR；冻结畸形输入经实际production validator返回REJECTED及指定稳定code，才可计预期验证拒绝。完整继承M14（含本次fresh M13）与M15自身的bound artifacts共同满足512项/384MiB/单项32MiB总门禁。R01实际compressed backup payload必须公开可取，不能只有hash或不可访问本机路径。

本资格覆盖受控全停、同机同端口、固定N−1/N发布组合、明确cut备份与新根恢复。它不覆盖rolling/mixed version、任意历史reader、换机换端口、在线迁移、突然断电耐久性、通用TPS/RTO/RPO/SLO或历史常量空间。
