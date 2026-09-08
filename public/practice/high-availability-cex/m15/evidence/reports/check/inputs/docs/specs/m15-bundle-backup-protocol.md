# M15 固定发布包、角色启动与 stopped backup 协议

本文件与 `m15.md`、`m15-process-protocol.md`、`matching-testkit/src/test/resources/m15/profile-o1.json` 一起定义 M15-O1。本文只规定发布物、CLI、持久化前验证与有限负向。业务切换序列、cut 内容、原始生命周期/进程证据见 process protocol；capacity arrival 和总体判定见主合同。开始标签前是 CONTRACTED，不能把本文件视为已实现或已通过资格。

## 1. 发布组合与可信身份

N-1 是 `course/m14-complete` 源码 `56c4ec09ddf9fcf57f1cce763ae8b451ba7f394f` 的固定原始运行时，fixture 位于 `matching-testkit/src/test/resources/m15/n-minus-one/`。`manifest.json` 绑定 11 个有序 jar，jar 合计 **6,350,332 bytes**；README 是独立 NOTICE 成员。jar 名字中的 `0.8.0` 不表示 M12 产品标签可以读取 M14 状态。

N 是干净 M15 源码的 `matching-operations` Gradle `installDist` 发布包，含真实的新 operations 功能、完整依赖、脚本和 NOTICE。N 的源码 commit、最终原始包成员 hash 在完成时观测；冻结的是生成和验证规则，不能在 start 伪填未来 hash。正式完成导出要求 `course/m15-complete` 与 `matching-1.0.0` annotated tags 均指向同一个干净 HEAD。

两组合的 matching-core/local/cluster jar 可字节相同。`applicationVersion=262144`（`0x040000`）、M14 wire/state/profile/业务合同不变。V01–V04 证明指定组合的停机切换及回退保留 N 新写入；不声称 wire/state 迁移或任意 mixed/rolling versions。

包的可信锚是控制端**单独提供的 expected manifest SHA-256**。自带清单能和自带文件相互一致仍不足以建立信任。验证器不从包内读取 expected 值，不按目录名、mtime、jar 文件名或声明的 sourceCommit 代替原始 bytes 验证。

### 1.1 严格 JSON 与 hash

bundle、backup、deployment JSON 遵循对应 `schemas/matching.m15.{bundle,backup,deployment}.v1.schema.json`，并通过本文跨字段语义校验：

1. UTF-8 无 BOM；只允许 JSON object/array/string/boolean/null/十进制整数，无小数、指数、负零、重复 key 或 unknown field。先限制输入原始 bytes 再 parse；整数有界读取，不先窄化后校验。
2. canonical 文件按对象 key 的 ASCII 字典序递归排序，array 保留合同顺序；字符串使用最少 JSON escape（控制字符用标准短转义或小写 `\u00xx`），其他字符直接 UTF-8，不转义 `/`。紧凑 `,`/`:`，无其余空白，文件末尾**一个 LF**。parse 后 canonical 重编码必须与原始 bytes 完全相等。
3. hash 为完整原始文件 bytes 的 SHA-256，64 个小写 hex，不含 `sha256:` 前缀。文件末尾 LF 也参加 hash；不以重新序列化后的等价对象或解压后内容 hash 代替所指原始文件 hash。
4. manifest 不把自己列入 files；expected hash 在 CLI/上级冻结 inventory。README 不自引用 manifest hash。bundle files 按 path ASCII 升序，backup files 按 logicalPath ASCII 升序；重复 path 即使内容相同也拒绝。

M15 profile 自身采用已冻结的原始 fixture bytes/hash，**不要求**把 profile 重写成本节 canonical 格式。O1 operations guard 是解码/打包边界，不声明每个 guard 都被真实容量工作触达：

| guard | bytes / 数量 |
| --- | ---: |
| bundle manifest / backup manifest / cut descriptor / aggregate stop receipt | 每个 1,048,576 |
| deployment / CLI result / 单 lifecycle record | 每个 65,536 |
| bundle files | 64 |
| bundle 单成员 / 总成员 bytes | 33,554,432 / 67,108,864 |
| relative path | 512 UTF-8 bytes |

所有路径枚举只接受 ASCII `[A-Za-z0-9_][A-Za-z0-9._-]*` segment，由 `/` 分隔；不允许空 segment、`.`、`..`、反斜杠、NUL、驱动器路径或 absolute path。路径长度在 resolve 前检查。配置和 CLI 的外部绝对路径另按实文件系统规范化，禁止根内任何 symlink，包括父链；不能只用字符串前缀判定 containment。目录项无业务含义，但需恰好是允许文件的父目录，禁止多余空子目录、socket/device/FIFO 和 `.lnk`。源 hardlink 允许**只读**，安装/restore 必须拷贝为新 regular bytes，不创建链接，不能让外部 inode 修改安装结果。

### 1.2 bundle manifest 的跨字段义务

- `files` 是 bundle root 的精确文件 inventory，排除 `manifest.json` 本身；每项 kind 为 `JAR`、`LAUNCHER` 或 `NOTICE`。实际缺失、额外、类型错误、长度/hash 不同均拒绝。所有总量使用 checked arithmetic。
- `classpath` 是完整有序 jar path；与所有 `kind=JAR` 项一一对应，不重复、不遗漏，不接受 `*` 或外部路径。`classpathBytes` 与 jar 总和相等，`totalFileBytes` 与全部 files 总和相等。
- N-1 必须匹配冻结 fixture 的全部 11 个 jar 的**位置、顺序、长度、hash**，不是只检查“11 个、6,350,332 bytes”。`sourceClean=true`、固定 source/ref、`operationsEntrypoint=null`。
- N 包来自当前干净源码 `:matching-operations:installDist`，`operationsEntrypoint=io.github.lchareln.cex.matching.operations.M15OperationsMain`；必须含 `bin/matching-operations`，脚本启动本包有序依赖中的该类。Gradle 产生的 `.bat` 若保留，也必须列入 LAUNCHER inventory，但 Windows 不在 O1 支持域。
- `roleEntrypoints` 固定为 member 的 `io.github.lchareln.cex.matching.cluster.M14ClusterMember` 公共 API、publisher 的 `M14PublisherProcessMain` 和 sink 的 `M14SinkProcessMain`。包装层不得替换这些类的撮合/持久化决策。
- 构建工具/Java、source、原始 bytes 策略、第三方 NOTICE 必须保留。N 原始安装包 bytes 与其 manifest 均进入正式 evidence，不能用重新打包后相同 class 的 jar 替代原件。

## 2. 部署布局与旧、新运行时隔离

`deployment.json` 的 schemaVersion 为 `matching.m15.deployment.v1`。它不含运行时绝对 root；所有 bootstrap 引用均相对 root：

```text
deployment.json
bootstrap/profile-q1.json
bootstrap/shard-1/{route.bin,genesis.bin,imported-m13.bin}
bootstrap/shard-2/{route.bin,genesis.bin,imported-m13.bin}
shard-{1,2}/node-{0,1,2}/{archive,cluster,aeron,diagnostics}/
publishers/shard-{1,2}/
sink/journal.bin
```

配置严格绑定两 shard，顺序为 1/BTC-USDT/cluster141、2/SOL-USDT/cluster142；每组三个 member，按 M14 `M13ThreeMemberConfig` 的固定 block 大小和 port offset 推导 endpoints，并使用 `M14ThreeMemberConfig.defaults` 的全部 transport timeout。每组 `portBase` 在 `[1024,65509]`，sink port 在 `[1024,65535]`；两组全部固定 UDP/TCP ports 及 sink TCP port 必须互不冲突。loopback 单主机，原、新 root 之间保留 ports/IDs。

bootstrap binding 的 bytes/hash 与实际文件相符；route ≤1 MiB、Q1 ≤8192、genesis ≤1024、imported M13 snapshot ≤256 MiB，均先 guard 再调用继承的 strict codec。验证 imported snapshot 的恢复一致性、空 resting-book genesis 条件、shard/profile/genesis/route 身份。**原始 route 必须对应 imported M13 snapshot；当前 active route 则来自恢复 cut，不能互换。** 每次 member 启动都需要这些原始 bootstrap bytes，恢复不重写它们。

O1 `socketReceiveBuffer` 只允许 `JDK_DEFAULT` 或 `OS_DEFAULT`；后者在实际 child JVM 显式添加 `-Daeron.socket.so_rcvbuf=0`。固定 Java25、`-Xms32m -Xmx512m --add-opens=java.base/jdk.internal.misc=ALL-UNNAMED`；实际 Java vendor/build、JDK path/hash、VM flags、环境/文件系统被记录。支持环境与资源门槛见 profile。清理子进程继承的 `CLASSPATH`、`JAVA_TOOL_OPTIONS`、`JDK_JAVA_OPTIONS`、`_JAVA_OPTIONS`，不得允许它们注入 current jar、agent、patch-module 或替换 VM 上限；被选择的唯一 receive-buffer override 通过显式参数还原并记录。

### 2.1 独立 lifecycle observer

实际 runtime child 的 entrypoint 是独立 tool jar 中的 `io.github.lchareln.cex.matching.operations.observer.M15RoleObserverMain`。这个 jar 以外部路径/hash 单独绑定，不属于 N-1 的 11-jar membership。observer jar 只允许：

- `META-INF/MANIFEST.MF`；无 manifest Class-Path、agent、multi-release 入口。
- `io/github/lchareln/cex/matching/operations/observer/M15RoleObserverMain.class` 及该类的 `$...class` 嵌套类；父目录项仅作为结构。不能包含任何业务、runtime、Jackson/Aeron/Agrona 类、服务 provider 或额外资源。

selected runtime jar 在前，observer jar 在后，构成唯一显式 `-cp` vector；同名可加载 class 不得存在于多个条目中。各原始依赖 jar 的根 `module-info.class` 是 classpath 模式忽略的 JPMS metadata，允许重复，不把它当业务 shadow class；除此之外不得用这个例外放行任何重复 class。observer 可调用所选版本的公开 API，不能加入当前 operations 依赖以补旧 API。启动时绑定 observer 和关键业务类/codec 的实际 ProtectionDomain code source、整个 child classpath、PID/startInstant、role、selected bundle hash；观察器字节中的业务类替身或加载来源不符使启动失败。

member observer 调用所选 `M14ClusterMember.launch(config,memberId,fresh)`，执行同一 owner-loop 的 `doOutputWork`、status/诊断、`throwIfFailed`；EOF 后调用 `close`，返回且 `componentErrors` 为空才发 `CLOSE_COMPLETED`。publisher/sink 调用所选原始 main，保留原始 bounded stdin 命令协议；observer 只通过包装原 input stream 观测实际 main 的 reader 读到 EOF，不另开一个 reader 抢走 ADMIN/action bytes。EOF 让 main 的 try-with-resources 关闭并返回后再发 close receipt。所有 metrics/文件/网络观察在 service callback 外进行；保留 M14 完整状态诊断。

父 CLI 若有 supervisor，则独立标识为 TOOL、记录其 PID/ownership；它退出不等于九个 runtime roles 退出。通过标准 input relay 向 child 转发原始 bytes，relay 工作 buffer ≤65,536、至多一个待转发块；不添加无界任务/重试队列。EOF 是唯一正常停机输入，不发送伪 STOP 业务消息，不用普通 shutdown hook 的 `join(5000)` 当 close receipt。精确 lifecycle JSONL、30s role/90s all-stop/60s startup/600s scenario 及真实资源采样见 process protocol。

## 3. 冻结 CLI

安装包命令为 `bin/matching-operations`，Java main 为 `io.github.lchareln.cex.matching.operations.M15OperationsMain`。每个 flag 恰好一次，flag/value 成对；大小写固定，无 unknown option、重复参数、隐式环境默认值或布尔简写。所有 PATH/HOME/ROOT/TARGET 参数都是用户明确给定的绝对路径；HASH 为小写 64 hex；`--java-home` 指向 Java25 Home。CLI 不下载依赖或自行寻找另一包。以下为完整参数集合：

```text
verify-bundle --bundle PATH --expected-sha256 HASH

member --bundle PATH --expected-sha256 HASH
  --deployment PATH --deployment-sha256 HASH --root ROOT
  --observer-jar PATH --observer-sha256 HASH --java-home HOME
  --run-id UUID --launch-id UUID
  --shard 1|2 --member 0|1|2 --fresh-start true|false

publisher --bundle PATH --expected-sha256 HASH
  --deployment PATH --deployment-sha256 HASH --root ROOT
  --observer-jar PATH --observer-sha256 HASH --java-home HOME
  --run-id UUID --launch-id UUID
  --shard 1|2 --publisher-id ASCII --publisher-epoch POSITIVE_LONG

sink --bundle PATH --expected-sha256 HASH
  --deployment PATH --deployment-sha256 HASH --root ROOT
  --observer-jar PATH --observer-sha256 HASH --java-home HOME
  --run-id UUID --launch-id UUID

backup --bundle PATH --expected-sha256 HASH
  --deployment PATH --deployment-sha256 HASH --root ROOT
  --stop-receipt PATH --stop-receipt-sha256 HASH
  --cut PATH --cut-sha256 HASH --target TARGET

restore --bundle PATH --expected-sha256 HASH
  --backup PATH --backup-sha256 HASH --target TARGET

inspect --backup PATH --backup-sha256 HASH
```

`verify-bundle` 和 `inspect` 严格只读，无目录创建、锁文件、journal repair、持久标记或 child spawn。`inspect` 做完整 archive hash/流式解压校验并输出结构化摘要，不能只读 manifest 就报 VERIFIED。`restore` 完整安装 bytes 后返回，**不启动任何角色**；控制端以恢复得到的 `deployment.json` hash、新 root 和 `fresh-start=false` 显式调用角色命令。`backup` 不负责关闭 fleet，必须取得且复验调用者给定的 stop/cut 证据。

controller 为本次fleet指定唯一 `run-id`，为每次role启动指定唯一 `launch-id`，两者均为小写规范UUID；不能复用旧launchId隐藏重新启动。operations据已验证参数生成并绑定process protocol的≤65,536B launch document，observer只接收 `--launch ABS --launch-sha256 HASH`。deployment.sink.instanceId固定为 `m15-sink-o1`，cut.sink.sinkId必须等于它，不能以PID代替持久接收器身份。

角色启动前完成 bundle、observer、deployment、全部 bootstrap、Java 环境及角色参数只读 preflight，**之后**才允许 staging 或调用已有入口。Java feature 检查读取指定 Home 的原始 `release` 等只读安装 metadata，不先运行一个未计数的 Java probe；成功 child 再报告其实际 Runtime.version/VM 和 executable 身份供交叉核对。`publisher-id` 按 M14 1–64 printable ASCII 规则，epoch≥1；它不是 accountRef，也不自动获取 authority，sink 仍要求受信任 ADMIN reconciliation。`fresh-start=true` 只用于该 member 的 archive/cluster 尚不存在的初次启动；即使目录空，也不得用 true 删除已有 durable tree。任何恢复/版本切换都用 false。启动旧、新角色时既有非空 root 可以使用，但不得隐式清空；“非空目标拒绝”适用于 backup/restore/install 目标。

非角色命令输出一个 canonical JSON result，≤65,536 bytes，字段恰好为 `schemaVersion:"matching.m15.operations-result.v1"`、`command`、`status`、`code`、`manifestSha256`（字符串或 null）、`target`（绝对路径或 null）、`fileCount`、`logicalBytes`、`storedBytes`、`message`（≤1024 UTF-8 bytes）。成功 status=`VERIFIED`（verify/inspect）或 `CREATED`（backup/restore），code=`OK`，退出 0；`manifestSha256` 指本次验证或生成的 bundle/backup manifest 原始 hash。verify 的 logical/stored 都为 bundle 全成员 bytes，inspect/backup/restore 分别为 backup logical/compressed totals。角色正常完成由 lifecycle receipt+child exit0 表达，错误使用同一 result；消息是诊断，不是判定依据。

退出 2 / `REJECTED` 用于有证据的拒绝，稳定 code：`INVALID_ARGUMENT`、`INVALID_JSON`、`NON_CANONICAL_JSON`、`SCHEMA_VIOLATION`、`UNTRUSTED_MANIFEST`、`INVENTORY_MISMATCH`、`UNSAFE_PATH`、`FILE_LIMIT`、`CONTENT_MISMATCH`、`UNSUPPORTED_BUNDLE`、`OBSERVER_MISMATCH`、`UNSUPPORTED_DEPLOYMENT`、`UNSUPPORTED_ENVIRONMENT`、`TARGET_NOT_EMPTY`、`SOURCE_CHANGED`、`STOP_NOT_PROVEN`、`CUT_MISMATCH`、`INVALID_GZIP`。拒绝前已知的 totals 不可伪填成功数；未完成验证时三个 count/bytes 字段均 0，manifest/target 可为 null。

退出 3 / `SYSTEM_ERROR` 用于非预期 I/O、解析器内部错误、组件故障、启动/停止/场景超时，code 为 `IO_FAILURE`、`COMPONENT_FAILURE`、`DEADLINE_EXCEEDED`、`INTERNAL_ERROR`。正常数据坏格式必须走严格 parser 的预期拒绝分支，不能广 catch 所有异常为 `INVALID_GZIP`。真正 disk write/force/read I/O 故障在 B06/R06 被观测也仍是 SYSTEM_ERROR；测试可以验证它无破坏，**不能**将它统计为 expected malformed-input rejection 或 mutant kill。

## 4. 完整 stopped backup 清单

backup directory 恰含 `manifest.json` 与 `payload/0000.gz`…，每个 manifest file 一份 gzip。`matching.m15.backup.v1` 有六个固定 members 条目，排序 `(shard,member)`；sourceRoot 是生成时规范绝对 root，仅作身份/隔离证据，restore 不读此路径。`sourceBundle` 绑定当时实际运行组合和 `evidence/source-bundle-manifest.json` 原 bytes；`deployment`、`stopReceipt`、`cut` 均指定逻辑文件长度/hash。

逻辑文件集合恰好是：

1. 六成员各自完整 `shard-S/node-M/archive/**`、`cluster/**` regular files。包括 archive.catalog、全部 `.rec`、recording.log、node-state.dat 和 archive/consensus/service mark files；有缺失/额外内容不得用 diagnostics 顶替。文件来自各自身份目录，不能复制单 member 冒充其他 member。
2. `deployment.json` 及其指定的七个原始 bootstrap files。
3. `sink/journal.bin`，含其既有 header、完整记录及停止时原 bytes；不得在 backup preflight 调用会修改 torn-tail 的 journal constructor。
4. `evidence/source-bundle-manifest.json`、`evidence/stop-receipt.json`、`evidence/cut.json`，以及 cut.refs **与 stopReceipt.refs 的并集**中所有 binding 的原始材料，逻辑路径固定在 `evidence/cut-artifacts/`。cut/stop各≤1 MiB；cut的六份实际完整 state、两份独立 expected state、sink cut，以及stop的原始lifecycle、18 marks的live/两次stopped header和双inventory均须完全闭合到这些逻辑文件。两表若引用同logicalPath，bytes/hash必须一致，只备份一份；同id跨表的含义也必须一致。不得指向源目录外的临时文件，不能漏备后声称自包含。

`aeron/`、diagnostics/controller/publisher 工作目录是可重建材料，不属于 durable tree；需要的资格原始记录作为 evidence/cut-artifacts 明确纳入，而不是递归备份整个 runtime root。manifest 的文件集合与完整 source durable trees、配置引用、cut/stop closure 做等集比较；不接受未声明的 evidence 文件。backup 的 metadata bounds 与512逻辑文件总额均包含上述 evidence 文件。

每个 backup file 字段为 logicalPath/logicalBytes/logicalSha256/compressedPath/compressedBytes/compressedSha256；compressedPath 按 files 排序索引从 `payload/0000.gz` 连续编号。所有 path/索引唯一，无缺号，实际 backup directory 的原始 compressed inventory 必须恰好等于 manifest。

### 4.1 stopped vector 的可验证条件

由 process protocol 的 `stopReceipt` 绑定实际 run、九个 runtime role 的 PID/startInstant/selected bundle、EOF、CLOSE_COMPLETED、exit0 和 no-force；父 controller 的退出不是替代。backup 重新检查相关 PID 身份已退出、全部18个 marks 的观测以及完整 durable trees 的双 inventory/hash；只提供一份自称 `allStopped=true` 的 JSON 不成立。

每成员有 archive、consensus、service0 三个 marks。pinned Aeron1.52.2 的 close 只 unmap，**不会**把磁盘 activityTimestamp 改成 CLOSED。操作前需观测其合法 header、PID、正 activity；退出后实际只读采样两次，间隔≥100ms，完整 header/activity 不变，最终 wall clock 与 activity 差值>10,000ms，且绑定 PID/startInstant 已退出。90s all-role barrier 包含这段实际检查；禁止改 mark timestamp、跳过 header 或用一次固定 sleep 假装 inactive。

先检查 stop/cut、观测无活跃 writer，再进行完整树 inventory 与流式读取；读取后再次校验全部源树 inventory/hash、marks 与 cut 绑定。双 tree inventory 的扫描对象恰为六个完整archive/cluster、deployment、七个bootstrap及sink journal；不包含随后生成的stop receipt、inventory自己或其refs文件，从而没有自引用hash。每份原始inventory是按root-relative path排序的canonical JSON array，项恰为 `{path,bytes,sha256}`；cut/stop证据文件另以refs闭包绑定。任何源内容变化为 `SOURCE_CHANGED`，停止不成立为 `STOP_NOT_PROVEN`，cut/真实 state 不符为 `CUT_MISMATCH`。副本与 marker 的闭合不能只比较最后盘口 digest；业务身份、original responses、ownership、双流 retained bytes/序号/grant/cursor/sink receipt 见 process protocol。

### 4.2 独立 gzip 文件

界限均为包含边界：≤512 logical files；每个展开≤268,435,456 bytes；总展开≤17,179,869,184 bytes；每个完整 gzip≤33,554,432 bytes；总 gzip≤134,217,728 bytes；每个流工作 buffer≤65,536 bytes。checksum、总量与剩余读取预算使用 checked long。不得把 128 MiB segment `readAllBytes` 后称 streaming。当前128 MiB segments及M13 bootstrap256 MiB decoder上限适配；M14 diagnostics runtime snapshot 的512 MiB上限不改变本备份单文件上限，因为不能用它替代 archive。

gzip 的唯一 header 为十个 bytes `1f 8b 08 00 00 00 00 00 00 ff`：DEFLATE、flags0、mtime0、xfl0、os255，无 extra/name/comment/FHCRC。写端 raw DEFLATE level6/default strategy，完整内容不稀疏化、不删零洞；尾部8 bytes为 RFC gzip little-endian CRC32 和 ISIZE。固定 header 与单 member 是本协议 envelope canonical 约束；不声称不同 JDK/zlib 的 DEFLATE bitstream 必然唯一。**每次原始 compressed bytes 独立 hash**，验证器不靠重新压缩相等来认证。

读端先 guard原始 compressed长度/hash，再 streaming inflate，解码时即时检查单项/累计展开上限；必须有正常 DEFLATE 结束、准确 CRC/ISIZE、准确展开长度/hash、准确8-byte trailer和**物理 EOF**。不接受 truncated deflate/trailer、完整但错误 checksum、第二 gzip member、trailer后任意字节、压缩字典请求或未知 header。每文件恰一member，没有 tar、额外 envelope 或 END record；“END 后数据”负向在这里就是合法 gzip trailer 后垃圾，不能发明另一个可忽略的结束标记。

## 5. 验证、staging 与新 root 安装

验证顺序固定为外部 expected manifest hash → guard/strict canonical/schema → 路径/完整inventory/总量 → 全原始文件 hash → 业务配置/支持矩阵/stop/cut 语义。读取失败是 I/O error；已读取的坏 bytes 是严格拒绝。所有原始 inputs 必须先建立绑定，再复制；运行报告不能用复制后重新计算的好数据覆盖最早 bad input 的判断。

backup/restore TARGET 不存在或是现存空目录才可接受。已有非空目录、符号链接、目标与源重叠、staging跨文件系统都拒绝；不能先删除目标再检查。用同父目录的 owned 随机 staging（名称带操作 UUID），完整写入新 regular files，关闭输出、重新逐文件读取校验全部长度/hash及metadata，完成后才通过本地同文件系统 atomic rename 生效。若目标是原空目录，只允许在最终确认仍空之后移除这个空目录；失败恢复空目录状态，不触及其中新出现的文件。目标在预检后变为非空则拒绝，不覆盖它。

restore 的两阶段是：**完整只读验证 backup**（含逐文件完整inflate、cut closure）→ staged 写入（再次核对输入原始 hash和展开hash）→ staged全库存复验 → atomic install。可以为验证解压两次；不得边未验证边写生产 root。源 backup 改动导致 SOURCE_CHANGED/CONTENT_MISMATCH，不能接受第一次读的manifest配第二次换过的payload。backup 也按源原始绑定、逐文件压缩、压缩副本复验和最后源稳定检查进行。

bundle role launch 在只读 preflight 后将选定 bundle/observer 拷贝到不依赖源 hardlink的隔离 owned staging，复验原manifest和实际使用文件，再以这个完整有序classpath启动。外部原 bundle 变化不能影响 child；N-1 sourcebytes与实际stagedloadbytes仍完全相等。staging 不含生产 durable data；结束后清理其 owned 路径，失败不删除原目录。

新 root恢复后保存**原 deployment bytes**。控制端用新 `--root` 派生所有bootstrap、member、sink路径；不配置任何 sourceRoot fallback。R02 实际执行时原runtime root 已 rename quarantine且原路径不可用，所有原roles均退出，恢复进程不获quarantine路径作为配置。保留原ports/IDs，fresh-start=false。先比较整个cut，再允许ADMIN/grant/ACK导致新状态；reconciliation新动作单列，不能拿其之后变化的hash冒充恢复前cut。

预检负向期望 zero child spawn 和所有生产 durable inventories不变；staging阶段允许创建/清理 owned staging，但目标安装生效前任何失败都不得留下可启动的半根。写入/close/fsync/rename失败不能输出CREATED。原tree、目标tree、备份payload和CLI结果原bytes均进入有限负向证据。O1只证明有序停机后copy/restore，不证明突然断电耐久性；现有Archive/Cluster sync默认0，不扩大承诺。

## 6. Canonical variant 与必执行 probe 的逐项映射

唯一 case/variant 集合来自 `matching-testkit/src/test/resources/m15/workload-v1.json`：**22 case、109 canonical variant**。下表逐项且恰好覆盖该集合；不把旧草稿的 `header-flags`、`manifest-one-byte` 等检查名继续算作 variant，也不删除这些检查。

每行的 `P01`、`P02`…是固定、全部必跑的 `probeId`，其完整身份为 `(caseId,variantId,probeId)`；禁止将多probe打包成一个无法还原结果的布尔值。每probe在原始trace中有独立BEGIN/输入原bytes或其已绑定引用/实际ATTEMPT与结果/断言/END，包含判定时hash、必要的before/after与child计数。正向probe可以引用同一实际程序不同断言窗口，且应记录所引用的实际attempt IDs；复用同次运行的原始attempt不得把它再计为一次调用，历史报告不能替用。故本合同的probe数不等于primitive attempt数或独立fleet启动次数。

下表共有 **118 个必执行 probes**。109个variant全部通过各自所有probes才可报告完整；实际额外诊断probe另列，不改变这个分母，也不能替代必执行probe。V/R正向引用的是同一个process protocol固定程序；C项引用主合同的Capacity O1；B/R负向执行同一生产preflight、gzip、staging/restore边界。任何缺probe、同身份重复、结果与原bytes绑定不符均使资格失败。

### 6.1 固定发布组合与停机切换

| caseId | canonical variantId | 必执行 probeId、具体程序与判定 |
| --- | --- | --- |
| `M15-V01` | `N_MINUS_ONE_COMPLETE_VECTOR` | `P01`：process §1–2：实际启动N-1九role，以冻结11jar向量逐项核对原bytes与实际classpath，正常退出；同一向量的所有role都须有原始记录。 |
| `M15-V01` | `N_COMPLETE_VECTOR` | `P01`：process §1–2：实际启动N九role，核对clean installDist、全部ordered jars、operations入口与实际加载来源。 |
| `M15-V01` | `ACTUAL_CODE_SOURCE_AND_OBSERVER_BINDING` | `P01`：process §2：逐child核对observer hash、role/核心/runtime/所用依赖实际code source、PID/startInstant；允许固定原jar的module-info metadata，禁止current业务jar泄露。 |
| `M15-V02` | `FULL_STATE_IDENTITY_OWNERSHIP` | `P01`：process §5 V02.1：N启动CURRENT roots，六实际成员完整恢复cut A的source/identity/ownership/control/outbox，启动后新控制前核对。 |
| `M15-V02` | `OLD_REQUEST_RESPONSE_BYTES` | `P01`：process §5 V02.2：每shard精确重试p1/p4/p23，按M14 correlation规范比较原结果与输出identity，状态不变。 |
| `M15-V02` | `PENDING_EXECUTION_AND_MARKET_STREAMS` | `P01`：process §5 V02.3：真实ADMIN后E16 durable frontier→ACK→E17..23，M2 gap→snapshot22→cursor安装，逐原语对照完整输出。 |
| `M15-V03` | `CURRENT_ROOTS_NOT_OLD_BACKUP` | `P01`：process §5 V03：选N-1直接重开N写过的CURRENT roots；逐目录/启动binding证明未装回cut A backup，先核对cut B。 |
| `M15-V03` | `N_SNAPSHOT_AND_SUFFIX` | `P01`：process §5 V02.4–6/V03：保留p24..27的N snapshot和p28..29 suffix；逐成员实际loaded snapshot及所有N新增完整响应/输出与cut B相等。 |
| `M15-V03` | `N_REQUEST_EXACT_RETRY` | `P01`：process §5 V03：旧runtime精确重试p1/p4/p23/p24/p29，覆盖N snapshot前后身份，原结果/输出identity保留且无二次应用。 |
| `M15-V03` | `POST_ROLLBACK_NEW_TRADES` | `P01`：process §5 V03：每shard真实新增t27..28，再DRAIN E/M并核对cut C与两笔跨账户成交，不把duplicate或拒绝计新成交。 |
| `M15-V04` | `MATRIX_REJECTION_BEFORE_MUTATION` | `P01`：在同次资格运行中投影B04的全部8个实际支持矩阵拒绝；本probe有独立断言与原始attempt binding，验证零child与生产root不变，不用历史报告。 |
| `M15-V04` | `ALL_STOPPED_BARRIER` | `P01`：process §7：每次vector切换前必须取得九operational及TOOL关闭/exit0/no-force、18mark实际inactive与双inventory；缺一项不进入下一vector。 |
| `M15-V04` | `FORCE_MAKES_SWITCH_FAIL` | `P01`：取既定C04实际故障终止旧leader的原始launch/kill/exit记录作为normal switch/backup stop候选，调用生产stop validation实际拒绝其缺CLOSE_COMPLETED/EXPECTED_FAULT证据；保留实际kill来源，不捏造force=true。无需新fleet；不得据该候选启动下一vector。 |

### 6.2 包、配置和使用时原bytes

| caseId | canonical variantId | 必执行 probeId、具体程序与判定 |
| --- | --- | --- |
| `M15-B01` | `MISSING_JAR` | `P01`：删一个固定jar；INVENTORY_MISMATCH；零child/生产root不变。 |
| `M15-B01` | `EXTRA_JAR` | `P01`：添加一个未登记jar；INVENTORY_MISMATCH；零child/生产root不变。 |
| `M15-B01` | `REORDERED_CLASSPATH` | `P01`：只调换N-1 classpath顺序，传该变体manifest实际hash以进入固定向量校验；UNSUPPORTED_BUNDLE。 |
| `M15-B01` | `SAME_LENGTH_BYTE_CHANGE` | `P01`：同长度改原jar一个byte而不改binding；CONTENT_MISMATCH，不看mtime。 |
| `M15-B02` | `SELF_CONSISTENT_TAMPERED_INTERNAL_MANIFEST` | `P01`：改jar并重算包内清单，仍传原trusted expected；UNTRUSTED_MANIFEST。<br>`P02`：仅改manifest一个保持合法JSON的byte，仍传原expected；UNTRUSTED_MANIFEST，保留原manifest-one-byte义务。 |
| `M15-B03` | `DUPLICATE_PATH` | `P01`：manifest重复一项path，传变体expected；SCHEMA_VIOLATION或INVENTORY_MISMATCH。 |
| `M15-B03` | `ABSOLUTE_PATH` | `P01`：将成员path改absolute，传变体expected；SCHEMA_VIOLATION或UNSAFE_PATH，外部target不访问。 |
| `M15-B03` | `PARENT_TRAVERSAL` | `P01`：成员path含.. segment，传变体expected；SCHEMA_VIOLATION或UNSAFE_PATH。 |
| `M15-B03` | `SYMLINK_FILE` | `P01`：将成员文件换为symlink；UNSAFE_PATH；不跟随链接。 |
| `M15-B03` | `SYMLINK_PARENT` | `P01`：成员父链含symlink；UNSAFE_PATH；不跟随链接。 |
| `M15-B03` | `EXTERNAL_DEPENDENCY` | `P01`：classpath指向外部jar，传变体expected；SCHEMA_VIOLATION/UNSAFE_PATH/UNSUPPORTED_BUNDLE。<br>`P02`：部署树放external mark link/.lnk；UNSAFE_PATH，保留原external-mark-lnk义务，禁止外部mark访问。 |
| `M15-B04` | `WRONG_SOURCE` | `P01`：N-1 sourceCommit换成另一40hex，变体expected；SCHEMA_VIOLATION或UNSUPPORTED_BUNDLE。 |
| `M15-B04` | `WRONG_RELEASE` | `P01`：N-1改为不匹配的releaseId（含matching-0.8.0产品身份），变体expected；SCHEMA_VIOLATION或UNSUPPORTED_BUNDLE。 |
| `M15-B04` | `WRONG_ROLE` | `P01`：roleEntrypoints替换批准类，变体expected；SCHEMA_VIOLATION或UNSUPPORTED_BUNDLE。 |
| `M15-B04` | `WRONG_APP` | `P01`：applicationVersion改成非0x040000，变体expected；SCHEMA_VIOLATION或UNSUPPORTED_BUNDLE/UNSUPPORTED_DEPLOYMENT。 |
| `M15-B04` | `WRONG_PROFILE` | `P01`：用hash自洽但不支持的output profile/deployment，保持独立genesis/cut锚；UNSUPPORTED_DEPLOYMENT。 |
| `M15-B04` | `WRONG_GENESIS` | `P01`：替换为可解析但错误shard/profile/import身份的genesis，绑定变体bytes；UNSUPPORTED_DEPLOYMENT。 |
| `M15-B04` | `WRONG_JAVA` | `P01`：实际指定非Java25的安装metadata/Java Home；UNSUPPORTED_ENVIRONMENT；不先启动Java probe。 |
| `M15-B04` | `RESTORE_FRESH_START_TRUE` | `P01`：向restore传--fresh-start true；INVALID_ARGUMENT，已有入口完全不调用。 |
| `M15-B05` | `SOURCE_REPLACED_AFTER_CHECK` | `P01`：实际只读preflight完成后替换源jar，再进入生产staging；SOURCE_CHANGED或CONTENT_MISMATCH，零child。 |
| `M15-B05` | `ISOLATED_COPY_REVALIDATED` | `P01`：合法hardlink源被拷贝成独立regular bytes后改外部inode；staged bytes/hash保持原值，selectedload绑定原bytes；正向保护probe。<br>`P02`：复制后真实改staged jar一个byte，在use前复验；CONTENT_MISMATCH或SOURCE_CHANGED，不能启动已被改的classpath。 |
| `M15-B05` | `OBSERVER_CANNOT_SHADOW_BUSINESS_CLASS` | `P01`：在observer jar加入一个真实业务同名.class，传其变体原hash；OBSERVER_MISMATCH，classpath隔离不依赖jar先后碰巧加载。 |
| `M15-B06` | `COPY_IO_FAILURE` | `P01`：preflight后破坏owned staging parent，在实际mkdir发生I/O失败；SYSTEM_ERROR/IO_FAILURE。<br>`P02`：实际write的目标channel关闭或实际中断导致write失败；SYSTEM_ERROR/IO_FAILURE，禁止预定假异常。 |
| `M15-B06` | `NONEMPTY_TARGET` | `P01`：操作前target已有哨兵文件；TARGET_NOT_EMPTY，原目录全bytes不变。 |
| `M15-B06` | `NO_HALF_INSTALL` | `P01`：preflight后、install前向target实际加入哨兵；TARGET_NOT_EMPTY，staging不被误认为有效安装且新哨兵不被删除；同时检查本family两个实际I/O probe都没有半安装。 |

### 6.3 冷备、恢复与归档边界

| caseId | canonical variantId | 必执行 probeId、具体程序与判定 |
| --- | --- | --- |
| `M15-R01` | `NONTRIVIAL_CUT_VECTOR` | `P01`：process §4 A01–A09：两shard真实cut A，business23/E23 ACK15 pending8/M22 floor7 ACK2/sinkE16M2、maker980与20跨账户成交。 |
| `M15-R01` | `CLOSE_COMPLETED_AND_EXIT_ZERO` | `P01`：process §7：记录EOF→实际close return→componentErrors空/线程结束→exit0，逐PID身份核对；普通hook或退出码143不合格。 |
| `M15-R01` | `DOUBLE_INVENTORY_STABLE` | `P01`：本协议§4.1/process §7：双完整durable inventory相等且无自引用；18marks双header与age/PID条件实际成立。 |
| `M15-R01` | `ALL_DURABLE_BYTES_RETAINED` | `P01`：本协议§4–5：六archive/cluster、原始deployment/bootstrap、sink journal及cut+stop.refs闭包逐原件压缩并复验；完整逻辑/压缩inventory闭合。 |
| `M15-R02` | `SOURCE_ROOT_UNAVAILABLE` | `P01`：process §6：原CURRENT root rename quarantine且原路径不可用；恢复child配置/参数/classpath无source/quarantine fallback，保留实际路径证据。 |
| `M15-R02` | `EMPTY_NEW_ROOT` | `P01`：本协议§5：新绝对target原为空/不存在，完整readonly校验后staging复验再atomic install；逐原始logical bytes相等。 |
| `M15-R02` | `SIX_ACTUAL_MEMBERS_AND_SINK` | `P01`：process §6：安装后以N/fresh=false启动六真实成员和sink，逐PID/load/ready确认，不用诊断复制冒充成员。 |
| `M15-R02` | `PRE_CONTROL_CUT_EQUIVALENCE` | `P01`：process §6 R02：任何新ADMIN/Grant/ACK/业务前，完整应用state与journal原bytes精确等于cut A，已允许的启动metadata变化单列。 |
| `M15-R02` | `PATH_REBIND_AND_MARK_INACTIVITY` | `P01`：原deployment原bytes不变，所有root-relative路径实际重绑定新根；18marks原字节先保存、启动重定位按真实header证据检查，保留同ports/IDs。 |
| `M15-R03` | `JOURNAL_RECOVERY` | `P01`：process §6 R02/R03.1：恢复journal完整bytes/cursor/receipt，ADMIN前真实frontier返回ADMIN_RECONCILIATION_REQUIRED，零伪authority。 |
| `M15-R03` | `TRUSTED_ADMIN_RECONCILE` | `P01`：process §6 R03.2–3：原epoch1 ADMIN精确receipt且journal不变；epoch2新Grant经真实replicated observation→ADMIN forced receipt后才生效。 |
| `M15-R03` | `PENDING_REPLAY_AND_DUPLICATE` | `P01`：process §6 R03.2/4：真实重送已durable E16得duplicate且journal/cursor不变；新publisher真实交付E17..23，不丢pending输出。 |
| `M15-R03` | `STALE_GRANT_REJECTION` | `P01`：process §6 R03.3：仍活旧publisher实际stale SEND和cached ACK均拒绝，各自原始证据独立，不改变cursor/journal/业务。 |
| `M15-R03` | `MARKET_GAP_SNAPSHOT_SUFFIX` | `P01`：process §6 R03.4–5：M2真实gap→whole snapshot22→cursor，再消费真实M23/M24 suffix并核对完整public projection。 |
| `M15-R03` | `CURSOR_CONVERGENCE` | `P01`：process §6 R03.5：最终cold cut business25/E25 ACK25/M24 ACK24、maker978、epoch2、pendingE0，service与sink所有流/digest精确收敛。 |
| `M15-R04` | `MISSING_CATALOG` | `P01`：物理删除一个catalog compressed payload，保持manifest；INVENTORY_MISMATCH。 |
| `M15-R04` | `MISSING_SEGMENT` | `P01`：物理删除一个128MiB逻辑segment的compressed payload；INVENTORY_MISMATCH。 |
| `M15-R04` | `MISSING_RECORDING_LOG` | `P01`：删除一个recording.log payload；INVENTORY_MISMATCH。 |
| `M15-R04` | `MISSING_JOURNAL` | `P01`：删除sink journal payload；INVENTORY_MISMATCH。 |
| `M15-R04` | `MISSING_BOOTSTRAP` | `P01`：删除一个原始bootstrap payload；INVENTORY_MISMATCH。 |
| `M15-R04` | `SWAPPED_MEMBER` | `P01`：交换两member不同原文件/identity，重算局部压缩binding但保留独立cut/stop锚；CUT_MISMATCH。 |
| `M15-R04` | `MIXED_CUT` | `P01`：混入另一实际cut的合法内容，保持原trusted cut锚；CUT_MISMATCH。 |
| `M15-R04` | `MIXED_PROFILE` | `P01`：混入另一profile合法文件，保持原deployment/genesis/cut锚；UNSUPPORTED_DEPLOYMENT或CUT_MISMATCH。 |
| `M15-R04` | `EXTRA_PATH` | `P01`：增加未登记payload文件；INVENTORY_MISMATCH。 |
| `M15-R05` | `WRONG_MAGIC` | `P01`：改gzip magic，更新compressed binding与变体expected以进入decoder；INVALID_GZIP。<br>`P02`：只改gzip flags为非0，保持magic合法并重绑原bytes；INVALID_GZIP，保留header-flags义务。 |
| `M15-R05` | `TRUNCATED_GZIP` | `P01`：在DEFLATE内容中截断且重绑实际bytes；INVALID_GZIP。<br>`P02`：保留完整DEFLATE但截断8-byte trailer；INVALID_GZIP；两种截断不能互相代替。 |
| `M15-R05` | `BAD_CRC` | `P01`：完整gzip仅CRC错误，重绑compressed bytes；INVALID_GZIP，不按torn-tail忽略完整坏记录。 |
| `M15-R05` | `BAD_ISIZE` | `P01`：完整gzip仅ISIZE错误，重绑compressed bytes；INVALID_GZIP。 |
| `M15-R05` | `TRAILING_DATA` | `P01`：合法完整trailer后加一个byte，重绑compressed bytes；INVALID_GZIP，不存在可忽略END后缀。 |
| `M15-R05` | `SECOND_GZIP_MEMBER` | `P01`：拼接第二个完整gzip member，重绑compressed bytes；INVALID_GZIP。 |
| `M15-R05` | `DUPLICATE_ENTRY` | `P01`：重复logicalPath/entry，传变体expected；SCHEMA_VIOLATION或INVENTORY_MISMATCH。 |
| `M15-R05` | `FILE_LENGTH_LIMIT` | `P01`：声明compressedBytes=33554433且canonical，进入长度guard；SCHEMA_VIOLATION或FILE_LIMIT。<br>`P02`：声明logicalBytes=268435457，进入长度guard；SCHEMA_VIOLATION或FILE_LIMIT；不要求真的生成超界大文件。 |
| `M15-R05` | `FILE_COUNT_LIMIT` | `P01`：canonical manifest给出513项；SCHEMA_VIOLATION或FILE_LIMIT；不得先无界分配。 |
| `M15-R05` | `TOTAL_EXPANSION_LIMIT` | `P01`：canonical manifest声明总logical bytes=17179869185；SCHEMA_VIOLATION或FILE_LIMIT，证明累计guard，不声称真实16GiB容量触达。 |
| `M15-R05` | `PATH_TRAVERSAL` | `P01`：logicalPath或compressedPath含..越出backup root；SCHEMA_VIOLATION或UNSAFE_PATH，外部文件不访问。 |
| `M15-R05` | `SYMLINK` | `P01`：将实际gzip payload换为symlink；UNSAFE_PATH；不跟随目标后仅凭hash放行。 |
| `M15-R05` | `LEGAL_EMPTY_FILE` | `P01`：用生产单文件gzip写/读路径实际roundtrip零长度regular file；展开0、原空内容hash、完整trailer/EOF均验证通过，不能将合法空文件误拒。 |
| `M15-R05` | `LOSSLESS_SPARSE_LOGICAL_BYTES` | `P01`：实际创建逻辑134217728B、首尾含非零byte的稀疏文件，经生产streaming gzip与恢复路径；逐完整逻辑bytes/hash相等，洞中零bytes不省略；记录逻辑/allocated/compressed bytes，buffer<=65536。 |
| `M15-R06` | `STAGING_WRITE_FAILURE` | `P01`：真实目标write/channel故障；SYSTEM_ERROR/IO_FAILURE，目标不出现部分恢复；不得用生产忽略写入的假实现。 |
| `M15-R06` | `PRE_INSTALL_FAILURE` | `P01`：staging完整写出并校验后、rename前触发真实owned文件系统失败；SYSTEM_ERROR/IO_FAILURE或对应SOURCE_CHANGED，未安装。<br>`P02`：只读backup校验后实际替换source gzip payload，再写入staging/复验；SOURCE_CHANGED或CONTENT_MISMATCH，保留source-payload-replaced义务。 |
| `M15-R06` | `EXISTING_TARGET` | `P01`：restore前已有非空target；TARGET_NOT_EMPTY、完整原bytes不变。<br>`P02`：preflight后在rename前实际填入target；TARGET_NOT_EMPTY，不覆盖新文件，保留target-populated-before-rename义务。 |
| `M15-R06` | `START_FAILURE_NOT_RESTORE_PASS` | `P01`：实际成功安装有效backup后，显式role启动阶段用被占用端口等真实启动故障使流程失败；保存CREATED和后续SYSTEM_ERROR/COMPONENT_FAILURE，R02/整体恢复不得PASS。此probe确实创建/尝试child，不能套预检zero-child断言。 |

### 6.4 容量与原始账本

| caseId | canonical variantId | 必执行 probeId、具体程序与判定 |
| --- | --- | --- |
| `M15-C01` | `6250_PLANNED_IDENTITIES` | `P01`：主合同Capacity O1：严格覆盖6250冻结ordinal/ID与250warmup/6000baseline/250fault，unique且无遗漏；所有额外原语分开。 |
| `M15-C01` | `COMPLETE_TWO_LEVEL_ACCOUNTING` | `P01`：主合同O1：独立重算logical arrival与primitive attempt/outcome两层账，真实exception仍计ATTEMPT，UNKNOWN原分类与resolution并存。 |
| `M15-C01` | `ACTUAL_CROSS_ACCOUNT_TRADES` | `P01`：主合同O1：每个nominal measured stage每shard至少10笔实际new跨账户IOC成交；全部new admission用独立expected对照，不把ACK/duplicate/refusal算成交。 |
| `M15-C01` | `DURABLE_OUTPUT` | `P01`：主合同O1：上述每stage/shard至少10份真实durable输出，与service original output和sink receipt逐项对照，定义延迟样本分母。 |
| `M15-C01` | `ALL_NINE_CHILD_RESOURCE_SAMPLES` | `P01`：主合同O1/process §9：nominal load九个实际child各>=3个1s采样，role/PID/VM/heap/GC/CPU/directbuffers原始值；FD unavailable明确，不用父JVM替代。 |
| `M15-C02` | `GATED_2000_ITEM_BURST` | `P01`：主合同O1：真实gate两个worker时独立producer完成2000个同计划时间到达，随后释放；不是调低rate的closed-loop。 |
| `M15-C02` | `QUEUE_64_HIGH_WATER` | `P01`：实际每shard boundedqueue占用达到64，记录实际offer/occupancy高水位；不伪填max。 |
| `M15-C02` | `QUEUE_FULL_REJECTION` | `P01`：burst实际至少一次queue full，原logical ID与NOT_SUBMITTED队列拒绝保留；不放入隐藏重试队列。 |
| `M15-C02` | `WORKER_HELD_ITEM_ACCOUNTED` | `P01`：区分queue64与每shard最多一个worker-held，截止/释放/drain账都保留held输入与attempt状态。 |
| `M15-C03` | `SHARD1_PENDING_32` | `P01`：暂停publisher1后真实apply填满Q1 Execution32 pending，不改profile或使用假满flag。 |
| `M15-C03` | `UNCHANGED_REFUSAL` | `P01`：再用固定新身份得到OUTPUT_BACKPRESSURED；完整source/identity/owner/outbox/control state不变。 |
| `M15-C03` | `SHARD2_FOUR_DURABLE_TRADES` | `P01`：同一暂停窗口shard2至少4笔真实跨账户成交与durable output，不能用窗口外进展填数。 |
| `M15-C03` | `DRAIN` | `P01`：解除暂停后通过有界独立publisher pump真实排空与复制ACK，所有内部实际controls计attempt。 |
| `M15-C03` | `SAME_ID_FIRST_APPLY_AND_EXACT_RETRY` | `P01`：以原被拒绝的相同身份first APPLIED再exact retry；至多一次业务/output新增，完整原response/output identity符合M14。 |
| `M15-C04` | `50_PER_SECOND_250_ARRIVALS` | `P01`：主合同O1：独立fault stage50/s×5s恰250计划到达，固定offset与shard交替，不因故障改schedule。 |
| `M15-C04` | `KILL_OBSERVED_LEADER_AFTER_20_NEW_RESPONSES` | `P01`：第20个相关new business response后确认当前实际leader/PID/startInstant/authority，再对该owned leader实际故障终止，保留时间原件。 |
| `M15-C04` | `INDEPENDENT_ARRIVALS_CONTINUE` | `P01`：leader故障期间schedule producer继续按计划offer并记录lateness、queue refusal与attempt，不等待worker恢复。 |
| `M15-C04` | `UNKNOWN_ACTUAL_COUNT_AND_SAME_ID_RESOLUTION` | `P01`：真实UNKNOWN按原分类计数（零允许，零不宣称新UNKNOWN覆盖）；每个存在的UNKNOWN最多3次同身份reconcile，120s内未收敛失败。 |
| `M15-C04` | `MEASURED_RECOVERY_NOT_RTO_CLAIM` | `P01`：同一controller单调域记录fault/detection/recovery/首个postkill confirmed，给实际有限观测，不推导RTO或跨JVM相减。 |
| `M15-C05` | `FULL_HISTORY_RETAINED` | `P01`：保留本次全部source identities/producers、M14业务/control operations，不prune或修改2000000历史guard，核对增长。 |
| `M15-C05` | `SNAPSHOT_AND_REAL_RESTART` | `P01`：有限负载后实际snapshot并正常关闭/真实重启六成员，使用同stop/mark/role边界；C04故障重选不替代本restart。 |
| `M15-C05` | `FULL_CUT_AND_OLD_NEW_RETRIES` | `P01`：真实恢复CAPACITY_HISTORY完整cut，核对旧、新请求exact retry和完整输出/cursors/ownership；不得仅比盘口。 |
| `M15-C05` | `ACTUAL_SIZE_AND_RECOVERY_MEASUREMENTS` | `P01`：绑定实际state/snapshot/history/diagnostics/journal/逻辑文件增长及本次恢复时间，保持完整诊断开启，无常量空间或RTO声明。 |
| `M15-C06` | `MISSING_PLANNED_ORDINAL` | `P01`：对合法原始logical ledger实际删一个planned ordinal并重算伪summary；validator拒绝缺失，不能只验count字段。 |
| `M15-C06` | `MISSING_ATTEMPT` | `P01`：对合法原始primitive ledger删一条ATTEMPT，保留outcome并重算伪summary；validator拒绝。 |
| `M15-C06` | `UNKNOWN_RELABELLED_NOT_SUBMITTED` | `P01`：加载冻结validator-controls-v1.json的UNKNOWN_ACCOUNTING_CONTROL，先正控制PASS，再实际把logical.initialOutcome改为NOT_SUBMITTED，保留attempts原事实；预期STUDENT_FAILURE，SYSTEM_ERROR不算检测成功。它是synthetic accounting control，不计6250或真实attempt/UNKNOWN进程见证。 |
| `M15-C06` | `PROFILE_REFUSAL_RELABELLED_TRADE` | `P01`：加载同fixture的PROFILE_REFUSAL_ACCOUNTING_CONTROL，先正控制PASS，再实际把logical.finalOutcome改为NEW_APPLIED，保留OUTPUT_PROFILE_LIMIT primitive事实；预期STUDENT_FAILURE。synthetic counts独立，不以真实C03的OUTPUT_BACKPRESSURED偷换这个控制。 |
| `M15-C06` | `RETRY_AS_NEW_LOGICAL_ID` | `P01`：把合法retry改成新增logical ID并重算summary；validator依据原command/producer/schedule关联拒绝双计。 |
| `M15-C06` | `WRONG_RESOURCE_ROLE_OR_PID` | `P01`：修改一项resource sample的role或PID，使它与已绑定launch/lifecycle不符并重算summary；validator拒绝。 |

### 6.5 负向边界与计数规则

C06只有这两项使用冻结 `matching-testkit/src/test/resources/m15/validator-controls-v1.json` 的合成正控制及实际记录变异；每个P01必须同时保留原件PASS和变异件STUDENT_FAILURE的原始结果。它们不计6250 arrivals、实际runtime primitive attempts或额外UNKNOWN/profile-refusal进程覆盖，单列 `SYNTHETIC_ACCOUNTING_CONTROL` 次数。其余四个C06的P01必须变异**本次真实运行**的ledger，不能用合成资料替代。

若本次真实ledger存在UNKNOWN，则 UNKNOWN_RELABELLED_NOT_SUBMITTED 还必须执行条件probe `P02`：选logical ordinal最小的对应UNKNOWN，实际改initialOutcome并保留原始primitive事实；若实际存在OUTPUT_PROFILE_LIMIT，则 PROFILE_REFUSAL_RELABELLED_TRADE 同样对logical ordinal最小的对应记录执行 `P02`。两者预期STUDENT_FAILURE；没有对应记录时记录实际数量0与不适用原因，不能伪造记录。这两个条件probe不在118个无条件必跑probe分母中，条件成立时不得省略；条件结果及实际原bytes单列，不改变109个variant。冻结control并不免除出现真实记录时的补充检查。

纯preflight拒绝要求完整生产inventory/bytes/hash前后不变、zero child spawn；staging负向允许owned staging创建/清理，要求target无半安装、不覆盖已有数据，并保留失败阶段与清理原始证据。R05的LEGAL_EMPTY_FILE、LOSSLESS_SPARSE_LOGICAL_BYTES及B05隔离hardlink的P01是正向格式保护，预期成功；不能因为属于B/R family就把任意非0算通过。R06的START_FAILURE_NOT_RESTORE_PASS是在实际安装后启动阶段发生失败，适用真实child与COMPONENT_FAILURE证据，不能要求zero child或让先前CREATED覆盖流程失败。

数据负向的预期code在各probe列明；同一变体同时触犯schema/path/semantic时，按§5验证阶段返回最先适用code，schema先行可返回SCHEMA_VIOLATION。不能把任意异常/exit非0当expected拒绝。B06/R06的真实I/O或生命周期失败仍为SYSTEM_ERROR；probe可证明失败被如实观测且无破坏，但不计expected malformed-input rejection或semantic mutant kill。这个区别必须出现在raw outcome与汇总中。

R05的gzip decoder probes应更新变体compressed binding和外部变体manifest expected，使它们真正进入gzip decoder，而非只被旧hash挡住；大小/路径专测则在最早guard拒绝。R04混装说明哪些局部hash被重算、哪些独立cut/deployment/stop锚保持原值，不连可信锚也一起改掉再要求validator猜原真相。guard probe可以用超界声明，不能把它宣称为真实16GiB或所有decoder上限的容量触达。

每probe的原始判定先绑定、复制后复验，末尾文件被篡改时不能重算新hash后接受新的PASS。variant集合、必需probe集合、结果分类与原始bytes分别校验；额外调用或重试按真实attempt独立计数，不借canonical variant/probe聚合隐藏工作。
