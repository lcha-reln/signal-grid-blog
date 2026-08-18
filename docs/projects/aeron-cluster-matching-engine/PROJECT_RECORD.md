---
record_schema: signal-grid-project-record/v1
project_id: SG-PRODUCTION-AERON-MATCHING-001
title: Aeron Cluster 生产级高可用撮合实战
record_health: current
project_status: active
claim_status: not_proven
qualification_profile: none
current_phase: P0
current_task: TASK-P0-002
created_at: 2026-08-18T21:03:38+08:00
updated_at: 2026-08-19T01:27:53+08:00
last_reconciled_at: 2026-08-19T01:27:53+08:00
reconciliation_base_git_sha: f7676184c702b72ae4fa4293dbc83642c869943f
next_review_due: 2026-08-25T21:03:38+08:00
---

# Aeron Cluster 生产级高可用撮合实战：项目总记录

> 这是 Project 01 的唯一 canonical 工程控制账本。它记录需求、不变量、版本、架构决策、风险、任务、证据和生产门禁，而不是一篇对外教程。
>
> 当前结论：项目以生产上线为目标，但还没有产品实现，更没有获得生产上线资格。`claim_status: not_proven` 在全部生产 Gate 有效通过以前不得提升。

## 0. Resume Capsule

### 当前目标

沿同一个版本化代码库，逐步交付一套以 Aeron Cluster 为复制和高可用核心的中央限价订单簿撮合系统。系统必须先冻结业务与故障合同，再通过确定性、恢复、容量、安全、升级和灾备证据判断是否具备上线资格；不能用“三个进程能启动”替代生产证明。

### 当前阶段与唯一主任务

- 当前阶段：`P0`——项目合同、边界、工作负载、SLO、故障模型和生产定义。
- 唯一主任务：`TASK-P0-002`——选择实现仓库并冻结可复现构建合同。
- 当前代码状态：已在 `/Users/reln/aeron-cluster-matching-engine` 建立 local-only provisional bootstrap 仓库，当前固定提交为 `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`；仓库只含 `deployable=false` 的构建/供应链合同与 proposed remote-authority readiness 合同，没有撮合、Cluster、Gateway、镜像或其他产品实现。本博客仓库仍只承载项目记录和教程。
- 当前生产声明：`not_proven`。

### 已确认事实

- `FACT-001`：用户已明确选择 Aeron Cluster 作为 Project 01 高可用撮合核心技术。
- `FACT-002`：Aeron 官方将 Cluster 定位为按确定顺序复制命令的状态机容器，并把中央限价订单簿列为典型用途。
- `FACT-003`：Aeron Cluster 业务逻辑必须确定性执行；业务状态机不应直接访问数据库、文件、HTTP、Kafka 或其他外部 I/O。
- `FACT-004`：Aeron 官方推荐通过 Gateway 连接外部协议；`AeronCluster` 客户端不是供多线程共享的通用连接池。
- `FACT-005`：Aeron `1.52.2` 是 2026-08-18 已复核的最新正式发行版；它只是候选项目基线，仍需 ADR 接受并锁定制品摘要。
- `FACT-006`：SBE `1.39.0`、Agrona `2.5.0` 是 2026-08-18 已复核的最新正式发行版；它们仍是候选项目基线。
- `FACT-007`：开源 `ClusterBackup` 复制已提交日志和快照，可用于冷灾备或节点重建；它不是 active voter，也不是自动热切换节点。
- `FACT-011`：Project 01 最终框架 release 是 `70ee0bca3bba8975c45c1f06c314b907bba498b2`；GitHub Pages run `32148371343` 的 build 与 deploy 均成功，生产 URL 已完成轻量在线复验。
- `FACT-012`：Oracle JDK 25.0.4.1+1 已于 2026-08-18 发布；截至 2026-08-19 的官方查询，Eclipse Adoptium API 返回的 macOS aarch64 HotSpot 最新 GA 仍为 25.0.4+7-LTS，尚无适用的同 vendor 替代 GA。

### 最近完成

- 审计现有 Aeron、交易、可靠性和性能专题，确定实战篇只负责集成与交付，不复制概念文章。
- 设计 `production` 顶层专题及 Project 01 的 `seriesOrder` 空间。
- 从官方文档和固定发行页复核 Aeron Cluster 的 Gateway、确定性、容量、客户端一致性、分片和 Backup 边界。
- 建立本记录的封闭 ID、状态、证据和变更协议。
- 让 `production` 专题按显式 `seriesStage` 隔离 Project，Project 内独立编号与导航；缺失、未知或越界配置会使构建失败。
- 用恶意变异验证项目记录 linter 会拒绝伪 SHA、空 ADR、错绑 EVD、未闭合任务和无证据的生产资格声明。
- 完成 Node 24 full verifier 与 1440/621/620/390 明暗主题、Mermaid 大图及键盘交互验收，并把本地结果固化到 `EVD-0002` artifact。
- 发布初始框架 commit `afe7e6cafe8d716d9f6e12751d3b8beb33ab1fb9` 并完成完整线上矩阵；随后发布最终审计 release `70ee0bca3bba8975c45c1f06c314b907bba498b2`，观察 Pages build/deploy 成功并复验长期稳定文案、总账链接、canonical 和 Mermaid。
- 建立独立的 local-only bootstrap 仓库，锁定 Aeron/SBE/Agrona/Gradle 与当时的 JDK 输入，提交依赖锁、verification metadata、SBOM、依赖图和 fail-closed policy；该旧 revision 的本地观察保留在 `EVD-0007 stale`。
- 在 commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea` 增加 proposed remote-authority readiness 合同，以 39 个 repository mutants、20 个 authority semantic mutants、依赖篡改、双路径/双缓存 online/offline 与解包 round-trip 验证当前构建合同；缺少外部 observation 时精确拒绝 `AUTHORITY-E900`，记录为 `EVD-0008 partial`。
- 复核 Oracle 2026-08-18 CSPU 与 JDK 25.0.4.1+1，并确认 observation cutoff 上尚无适用的同 vendor Temurin 替代 GA；旧 Temurin 25.0.4+7 只保留为历史复现输入，Oracle 版本只登记为未接受的 vendor-change candidate，记录为 `EVD-0009 pass`。

### 阻塞项

- `OQ-001`：独立本地路径、`main` 与 proposed `RAP-0001` readiness 已确定；private 仍只是候选，remote URI、实际 owner/principals/visibility、license、provider ruleset、Hosted CI observation、备份恢复和 artifact authority 尚未建立或接受。
- `OQ-002`：V1 的目标业务流量、产品数、订单簿深度、消息尺寸和峰值形态尚未由用户输入或真实数据证明。
- `OQ-003`：目标部署是裸机、专用虚拟机还是云实例，硬件、网卡、NVMe 和故障域尚未冻结。
- `OQ-004`：Temurin 25.0.4+7 仅作为安全基线已过期的历史复现输入；Oracle JDK 25.0.4.1+1 是未接受的 vendor-change candidate，observation cutoff 上没有同 vendor Temurin 替代 GA；最终 vendor/build/license/support、GC、Aeron sync profile 和线程/CPU 拓扑尚未闭合。
- `OQ-005`：交易前风险预占属于同一 Cluster bounded context，还是独立权威服务返回凭证，尚待 ADR。
- `OQ-009`：双 Gateway 采用 active/passive 还是 active/active、外部会话由谁拥有和 fencing、状态从哪里恢复，尚待 ADR。
- `OQ-010`：业务 engine/stream generation 的转换触发、predecessor/cutover/rebuild 合同与 DR fork 语义尚待 ADR。

### 接下来三个动作

1. 由用户确认 owner、访问模型、license 和 principals 并授权后建立受保护 remote（private 为默认候选，尚未接受）、provider ruleset、真实 Hosted CI、备份恢复和 artifact authority；采集外部 observation 后再评审 `ADR-0002`。
2. 明确安全有效的 JDK vendor/build/license/support；若等待同 vendor Temurin 替代 GA或接受 Oracle vendor 变化，都必须重新固定平台制品摘要并重跑完整合同，再评审 `ADR-0001`。
3. 收集 `WORKLOAD_PROFILE-001`、`HARDWARE_PROFILE-001`、`DURABILITY_PROFILE-001`、`FAILURE_PROFILE-001` 的第一版输入；在此以前不接受任何 TPS、延迟、RPO 或 RTO 目标。

### 最近可信证据

| 项目 | 当前值 |
| --- | --- |
| 博客框架 release | `70ee0bca3bba8975c45c1f06c314b907bba498b2` |
| EVD-0002 框架验收 | `pass`；Node 24 full、linter 变异、本地浏览器矩阵、Pages run `32148371343` 与最终线上烟测均通过 |
| 项目实现 commit | local-only bootstrap `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`；`main`、clean、无 remote、无产品源码 |
| 历史 bootstrap 证据 | `EVD-0007 stale`；仅保留 commit `9dbe8e9f8578ad8fa27da54ca494c8e9a092c379` 的历史观察，不适用于当前 HEAD/JDK 状态 |
| 当前构建与 authority readiness | `EVD-0008 partial`；39+20 个负例、篡改、双路径/双缓存 online/offline 与解包 round-trip 通过；ZIP SHA-256 `12707bef7348ccb8e5c8fec972d55df9038a5afcbb23d006dc66e3f5bb751f1f`；remote 与 artifact authority 为 `not_established`，Hosted CI 为 `not_observed` |
| JDK 安全发行观察 | `EVD-0009 pass`；只证明 Oracle/Temurin 有日期边界的官方事实，不代表选定 Oracle 或接受 `ADR-0001` |
| 确定性测试 | 不存在 |
| 三节点故障测试 | 不存在 |
| 容量报告 | 不存在 |
| DR 演练 | 不存在 |
| 生产资格 | 未证明 |

### 预期工作树

本次记录回填只应修改本记录、把 `EVD-0007` artifact 标为历史 stale，并新增 `EVD-0008` 与 `EVD-0009` artifact；实现仓库必须保持在 clean commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea` 且无 remote。该仓库不得出现撮合/Cluster/Gateway 产品源码，博客仓库不得出现实现源码。若发现密钥、真实客户数据、生产系统地址、未登记源码或外部制品，立即停止并把 `record_health` 改为 `needs_reconciliation`。

### 恢复工作前必须阅读

- `REQ-QUAL-001`、`REQ-QUAL-002`、`REQ-OPS-001`
- `INV-001` 至 `INV-015`
- `ADR-0001` 至 `ADR-0010`
- `RISK-001` 至 `RISK-015`，尤其是证据漂移 `RISK-012`、local-only authority `RISK-013`、readiness 误读 `RISK-014` 与 JDK 安全/vendor 漂移 `RISK-015`
- 当前 `TASK-*` 与所有关联 `EVD-*`，尤其是 `EVD-0007/0008/0009`

### 不得当成事实的事项

- 尚无生产 TPS、p99、p99.9、最大延迟、RPO 或 RTO 观察值。
- 尚未证明三节点能在目标峰值下无 Gap 切主。
- 尚未证明 sync level、文件系统、控制器与 NVMe 能满足整站断电合同。
- 尚未证明快照、恢复、升级、回滚、Outbox、账本和行情边界闭环。
- “Aeron Cluster 很快”不能替代本项目在目标硬件和开放负载下的证据。
- 本地 readiness、candidate Workflow/CODEOWNERS 和 clean commit 不等于 remote enforcement、provider-hosted CI、branch protection 或持久 artifact authority。
- 在安全基线已过期的历史 JDK 上完成字节复现，不等于该 JDK 可用于生产；Oracle candidate 也没有被自动选择或验证。

## 1. Canonicality 与记录协议

### 1.1 唯一职责

本文件是项目状态的唯一权威来源。其他文件只能引用这里的 ID：

- `docs/LEARNING_PATHS.md` 只记录已发布文章顺序；
- `docs/AERON_SOURCE_MAP.md` 只记录官方知识覆盖；
- `MAINTENANCE.md` 只记录博客编辑与发布规则；
- 对外文章解释某个阶段，不替代需求、ADR、风险或证据注册表；
- 未来代码仓库的 README 负责构建入口，但必须反向引用本记录和固定版本。

### 1.2 新上下文恢复协议

每次上下文压缩、换人、换机器或长时间中断后，按顺序执行：

1. 读取本节和 Resume Capsule。
2. 读取真实分支、HEAD、工作树、最近 release/tag 和 CI 状态。
3. 确认 `reconciliation_base_git_sha` 是当前 HEAD 的祖先，然后同时审计 `base..HEAD`、暂存区、未暂存区和未跟踪文件。
4. 将 base 之后的每项变化映射到 Change Log、当前任务或已登记证据；出现无法解释的 commit/文件时，把 `record_health` 改为 `needs_reconciliation`。这个字段是审计起点，不是要求等于包含本文件的当前 commit，因此不会形成“把自身 commit SHA 写进自身”的不可能循环。
5. 若当前时间晚于 `next_review_due`，同样把 `record_health` 改为 `needs_reconciliation`；逐条复核有时效性的 FACT、版本账本和 EVD，不能让日期到期后仍自动保持 current/pass。
6. 只读取当前任务关联的 REQ、INV、ADR、RISK 和 EVD。
7. 核验证据的版本、硬件、配置和有效期；失配时改为 `stale`。
8. 完成核对以前，不得把任务标为 `done`，也不得提升 `claim_status`。

### 1.3 ID 规则

ID 永不重排、删除或复用。语义发生实质变化时创建新 ID，并以 `supersedes`/`superseded_by` 关联旧项。

| 类型 | 格式 |
| --- | --- |
| 事实 | `FACT-001` |
| 假设 | `ASM-001` |
| 开放问题 | `OQ-001` |
| 功能需求 | `REQ-FUNC-001` |
| 质量需求 | `REQ-QUAL-001` |
| 运维需求 | `REQ-OPS-001` |
| 安全需求 | `REQ-SEC-001` |
| 不变量 | `INV-001` |
| 决策 | `ADR-0001` |
| 风险 | `RISK-001` |
| 证据 | `EVD-0001` |
| Gate | `GATE-001` |
| 任务 | `TASK-P{phase}-{nnn}`，例如 `TASK-P0-001` |
| Profile | `WORKLOAD_PROFILE-001`、`HARDWARE_PROFILE-001`、`DURABILITY_PROFILE-001`、`FAILURE_PROFILE-001` |
| 变更 | `CHG-20260818-001` |

### 1.4 封闭状态集合

- Requirement：`draft / accepted / implemented / verified / deferred / rejected / superseded`
- Invariant：`proposed / accepted / enforced / verified / broken / superseded`
- ADR：`proposed / accepted / rejected / superseded`
- Evidence：`planned / pass / fail / partial / stale / invalid`
- Risk：`open / mitigating / accepted / closed`
- Task：`todo / doing / blocked / done / dropped`
- Gate：`not_started / partial / pass / fail / stale`
- Assumption：`open / validated / invalidated / superseded`
- Version baseline：`proposed / accepted / deprecated / superseded`
- Profile：`missing / draft / accepted / verified / stale / superseded`
- Record health：`current / needs_reconciliation / archived`
- Project status：`proposed / active / paused / blocked / completed / cancelled / archived`
- Claim status：`not_proven / qualified_for_named_profile / suspended / withdrawn`
- Open question：`open / resolved / deferred / superseded`

任务只有同时满足“交付物存在、验收条件满足、证据登记、失败未隐藏、Resume Capsule 更新”才能标为 `done`。

### 1.5 事实、目标与观察必须分开

- `FACT` 是经一手来源或可复现实物确认的事实。
- `REQ` 是必须满足的目标，不代表已经实现。
- `ADR` 是工程选择记录；只有状态为 `accepted` 的 ADR 才是当前约束，`proposed` 只是待评审候选，且接受也不代表已经验证有效。
- `EVD` 是指定版本、环境和时间下的观察，不自动外推。
- `ASM` 是推动工作所需但尚未证明的假设。
- 性能目标写进 REQ；吞吐和延迟观察只写进 EVD。

## 2. 项目合同

### 2.1 中心命题

项目交付的不是 Auction Demo、单节点订单簿、Docker Compose 展示或“能启动的 Raft 服务”，而是一套可持续演进的生产参考实现：它拥有明确的业务语义和故障模型，能在目标硬件上用可复现实验回答正确性、容量、恢复、升级和运维问题。

### 2.2 生产资格定义

只有以下条件同时成立，才能把 `claim_status` 从 `not_proven` 提升：

- 所有尚未 rejected/superseded 的 `priority=must` 需求均为 `verified`；
- 所有尚未 superseded 的不变量均为 `verified`，并保留强制点、Oracle 和最新 pass 证据；
- 所有尚未 rejected/superseded 的 ADR 均为 `accepted`，全部当前 workload/hardware/durability/failure profile 均为 `verified`，且 `qualification_profile` 指向其中一个已验证 profile；
- `GATE-001` 至 `GATE-010` 都是 pass，分别追踪到“证明对象包含该 Gate”的 pass EVD，且未因版本、硬件或配置变化变 stale；
- 未关闭风险都有明确 owner、检测和上线接受理由；
- 目标硬件上的开放负载、故障、soak、恢复、DR、升级和回滚报告可复现；
- 生产 Runbook、安全、凭据、监控、审计、容量和人工演练已完成；
- 对外声明同时写清适用的 workload、hardware、durability 与 failure profile。

### 2.3 V1 候选业务边界

以下是 `ASM-001`，不是最终产品承诺：

- 单一连续竞价市场中的价格时间优先 CLOB；
- 价格为整数 tick，数量为整数 lot；
- New、Cancel、Cancel/Replace；
- GTC、IOC、FOK；
- 带显式价格保护的市价语义；
- STP、Trading Halt、Kill Switch；
- 权威交易前准入凭证；
- 私有执行事件、L2 行情事件和账本/Trade Capture 事件的可靠出口。

以下不在 V1 偷渡实现：Auction、Iceberg、Pegged、组合订单、期权策略、跨品种撮合、衍生品保证金、强平、清算、托管、法定报表和跨地域 active-active。它们需要新 REQ/ADR/Gate。

除用户已明确接受“Aeron Cluster 是高可用核心”外，本记录中的版本、V1 语义、身份模型、Outbox、三节点拓扑、风险边界和部署方式都仍是 `proposed` 候选设计。正文使用“必须”时表达候选设计一旦被接受后的约束，不表示对应 ADR 已经 accepted 或实现已经存在。

### 2.4 非目标

- 不把 Aeron Cluster 包装成通用业务数据库。
- 不把所有交易系统职责塞进同一个 replicated state machine。
- 不通过终端用户一对一 Cluster session 扩展连接数。
- 不承诺跨系统 exactly-once；外部副作用以至少一次、幂等和对账闭环表达。
- 不以隐藏的 Premium 能力作为开源教程的必要前提。
- 不把复制、Backup 和备份/PITR 混为同一保证。
- 不使用未经证据支持的 TPS 或延迟营销数字。

## 3. 用户、场景与系统边界

### 3.1 目标使用者

- 交易系统后端和低延迟 Java 工程师；
- 负责撮合、OMS、交易前风控、行情、账本或平台可靠性的架构师；
- 需要把 Aeron Cluster 从知识点推进到真实交付的团队。

### 3.2 权威状态所有权

| 组件 | 权威职责 | 不拥有的职责 |
| --- | --- | --- |
| Matching Cluster | 已准入命令的确定顺序、订单簿、活动订单、撮合状态、业务 ID/sequence、命令规范结果、影响撮合的版本化管理状态、有界事件 Outbox | 外部协议会话、会计账、客户总资产、行情客户连接、身份认证 |
| OMS/Gateway | FIX/WebSocket/REST 会话、外部订单状态、连接恢复、协议翻译、认证授权、边缘限流 | 最终撮合顺序和成交事实 |
| Pre-trade Risk | 资金、信用、账户/产品限额、预占与释放 | 订单簿优先级和成交顺序 |
| Ledger | 分录、余额、费用、结算、冲正和对账 | 订单簿和 Aeron 日志 |
| Market Data | 行情协议、snapshot/delta、订阅、扇出与客户端 Gap 恢复 | 撮合权威状态 |
| Identity/Policy | 客户、机构、凭据、权限和策略 | 订单和成交状态 |
| Data Platform | 查询、分析、监管归档和报表 | 在线交易权威写入 |

### 3.3 信任边界

- 外部输入一律不可信；Gateway 先做协议、身份、权限和结构校验。
- Gateway 的“已校验”不是 Cluster 跳过权威业务不变量的理由；所有影响状态的检查必须在确定性边界再次成立。
- ClusteredService 不直接调用外部 I/O。外部输入以有序 command 进入，副作用以可恢复 event/outbox 离开。
- 查询投影可以过期；任何用于写入决策的 projection 必须声明 freshness/read-barrier 合同。

## 4. 事实、假设、开放问题与版本账本

### 4.1 事实注册表

| ID | 事实 | 来源 | 核对日期 | 失效触发条件 |
| --- | --- | --- | --- | --- |
| FACT-001 | 用户选择 Aeron Cluster 作为核心 HA 技术 | 用户请求 | 2026-08-18 | 用户改变项目目标 |
| FACT-002 | Cluster 复制排序日志并承载确定性状态机 | Aeron Cluster Overview | 2026-08-18 | 运行时大版本变化 |
| FACT-003 | Cluster 业务逻辑必须确定性，不直接做外部 I/O | Efficient Business Logic | 2026-08-18 | 官方合同变化 |
| FACT-004 | 官方推荐 Gateway；`AeronCluster` 不供多线程共享 | Gateway Design/Javadoc | 2026-08-18 | 选定版本/API 变化 |
| FACT-005 | Aeron 1.52.2 为最新正式 release；master 是开发线 | 官方 Releases | 2026-08-18 | 新正式 release |
| FACT-006 | SBE 1.39.0、Agrona 2.5.0 为最新正式 release | 官方 Releases | 2026-08-18 | 新正式 release |
| FACT-007 | ClusterBackup 是冷 DR/节点重建材料，不是投票副本 | Cluster Backup | 2026-08-18 | 使用不同产品/profile |
| FACT-008 | Cluster 业务逻辑稳定吞吐上界受单一有序执行的平均命令成本制约 | Performance Limits | 2026-08-18 | 架构模型变化 |
| FACT-009 | 跨 symbol 的强信用约束使按 symbol 分片不再是局部决定 | On Sharding | 2026-08-18 | 风险边界改变 |
| FACT-010 | Cluster 客户端本地视图一致性必须由应用协议建立 | Client Consistency | 2026-08-18 | API/协议变化 |
| FACT-011 | Project 01 最终框架 release `70ee0bca3bba8975c45c1f06c314b907bba498b2` 已由 Pages run `32148371343` 成功部署并通过线上烟测 | [GitHub Actions](https://github.com/lcha-reln/signal-grid-blog/actions/runs/32148371343)、GitHub Pages | 2026-08-18 | 被验收 release 的语义/运行行为被后续版本改变，或线上结果出现无法解释的差异 |
| FACT-012 | Oracle JDK 25.0.4.1+1 已于 2026-08-18 发布；截至 2026-08-19 的官方查询，Eclipse Adoptium API 返回的 macOS aarch64 HotSpot 最新 GA 仍为 25.0.4+7-LTS，尚无同 vendor 的 25.0.4.1 或更新适用替代 GA | Oracle JDK 25.0.4.1 release notes、Oracle August 2026 CSPU、Eclipse Adoptium GA API；`EVD-0009` | 2026-08-19 | 新的 Oracle/Temurin 适用发行版或 advisory、上游元数据变化 |

### 4.2 假设注册表

| ID | 假设 | 验证方法 | 状态 |
| --- | --- | --- | --- |
| ASM-001 | V1 采用前述 CLOB 范围 | 用户/产品合同评审 | open |
| ASM-002 | 初始不分片能覆盖首个目标容量档位 | P6 固定 profile benchmark | open |
| ASM-003 | 三个 voting members 位于一个低延迟站点的三个独立故障域 | 基础设施设计和 RTT/故障验证 | open |
| ASM-004 | 至少两个 Gateway 能承担连接、协议和扇出负载 | 开放负载和故障测试 | open |
| ASM-005 | 有界 Cluster Outbox 可以覆盖下游短时中断 | outage budget 与容量模型 | open |

### 4.3 开放问题注册表

| ID | 问题 | Owner | 决策截止点 | 关联项 | Resolution | Updated | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OQ-001 | 实现仓库位置与访问模型 | unassigned | P1 开始前 | ADR-0002 | local path `/Users/reln/aeron-cluster-matching-engine`、`main` 与 proposed `RAP-0001` readiness 已确定；private 只是默认候选，remote URI、实际 owner/principals/visibility、license、provider ruleset、Hosted CI observation、backup/recovery 与 artifact authority 均未建立或接受 | 2026-08-19 | open |
| OQ-002 | 真实 workload profile | unassigned | 接受 SLO 前 | REQ-QUAL-001 | — | 2026-08-18 | open |
| OQ-003 | 目标硬件、网络、磁盘、故障域 | unassigned | P4/P6 前 | HARDWARE_PROFILE-001 | — | 2026-08-18 | open |
| OQ-004 | JDK/GC/线程与 sync profile | unassigned | P3 前初选，P6 定稿 | ADR-0001 | Temurin 25.0.4+7 HotSpot 仅为安全基线已过期的历史复现输入；Oracle 25.0.4.1+1 只是未接受的 vendor-change candidate，observation cutoff 上没有同 vendor Temurin 替代 GA；最终 vendor/build/license/support、GC、线程与 sync profile 未定 | 2026-08-19 | open |
| OQ-005 | 风险预占与 Cluster 的原子边界 | unassigned | P2 前 | ADR-0005 | — | 2026-08-18 | open |
| OQ-006 | Outbox ACK 粒度、保留窗口和慢消费者策略 | unassigned | P5 前 | ADR-0008 | — | 2026-08-18 | open |
| OQ-007 | 生产认证、传输加密和密钥轮换方案 | unassigned | P7 前 | REQ-SEC-001 | — | 2026-08-18 | open |
| OQ-008 | 单站点 active quorum 之外的 DR 目标 | unassigned | P7 前 | ADR-0009 | — | 2026-08-18 | open |
| OQ-009 | 双 Gateway active 模式、外部会话 owner/fencing 与恢复来源 | unassigned | P4 前 | ADR-0005 | — | 2026-08-18 | open |
| OQ-010 | engine/stream generation 转换、predecessor/cutover/rebuild 与 DR fork 语义 | unassigned | P2 前 | ADR-0004/0007/0008 | — | 2026-08-18 | open |

### 4.4 版本账本

| 组件 | 候选版本 | 当前状态 | 证据 | 接受前必须完成 |
| --- | --- | --- | --- | --- |
| Aeron | 1.52.2 | proposed | `EVD-0008`：current lock、artifact SHA、tag `5b62f21d917af027cdf5a3241aa5f355149b04fa`；`EVD-0007` 只保留旧 revision 历史 | hosted CI、兼容/故障回归、供应链 authority |
| SBE | 1.39.0 | proposed | `EVD-0008`：current 独立 `sbeCodegen` lock、artifact SHA、tag `e773b57cac6b2008ce30dd219a33de49766c6013`；`EVD-0007` 为历史 | generator/runtime fixture、hosted CI、供应链 authority |
| Agrona | 2.5.0 | proposed | `EVD-0008`：current 显式 runtime dependency、lock、artifact SHA、tag `eaaa178c2bc47d7c03ab45403e24d95d83c89152`；`EVD-0007` 为历史 | API/性能核对、hosted CI、供应链 authority |
| JDK | Temurin 25.0.4+7-LTS historical-only；Oracle 25.0.4.1+1 vendor-change candidate | proposed | `EVD-0008`：旧 Temurin exact historical runtime gate；`EVD-0009`：Oracle release/security baseline 与同 vendor 缺口观察 | 选择并接受 vendor/build/license/support，重锁完整平台制品，在安全有效 runtime 上重跑构建、兼容、GC/JIT/故障矩阵 |
| Gradle | 9.7.0，revision `3defbfc59d757b873d787b2261de5c7f8a00970a` | proposed | `EVD-0008`：current distribution/wrapper SHA、strict locks、offline/repro/round-trip；`EVD-0007` 为历史 | hosted CI、远端保护与持久 artifact authority |
| Linux | TBD | proposed | 目标镜像 | kernel/NIC/NVMe/clock/NUMA 证据 |

禁止 SNAPSHOT、浮动版本和未登记的 transitive override 进入 release 构建。每次升级都让依赖该版本的 EVD 变为 `stale`，直到完整回归。

实现仓库恢复账本：

- 逻辑仓库 ID：`aeron-cluster-matching-engine`；绝对路径：`/Users/reln/aeron-cluster-matching-engine`。
- 默认分支：`main`；最近核对 HEAD：`ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`；工作树：`clean`；核对时间：2026-08-19T01:27:53+08:00。
- Remote：`none`；可见性：`local-only provisional`；`RAP-0001`：`proposed`；hosted CI：`not_observed`；license：`undecided`；持久 artifact/backup authority：`not_established`；qualification：`not_proven`。
- 当前制品只是一份 `deployable=false` 的 build-contract ZIP；它不是撮合实现、部署包或生产 release。

## 5. 术语、候选身份、数值、时间与顺序模型

### 5.1 身份域

| 名称 | 作用域 | 分配者 | 可否重用 | 说明 |
| --- | --- | --- | --- | --- |
| `commandId` | 认证主体内的永久业务命令域 | Gateway/外部调用方 | 否 | 128-bit 稳定键；与 tenant/venue/client principal 共同构成 dedup identity |
| `clusterSessionId` | 一次 Cluster 连接 | Aeron Cluster | 会变化 | 禁止作客户身份或幂等键 |
| `clientOrderId` | 客户/profile 定义域 | 客户/OMS | 按协议 | 不是内部全局订单 ID |
| `orderId` | Matching authority | Cluster | 否 | 由已排序状态机确定性分配 |
| `tradeId` | Matching authority | Cluster | 否 | 可重放生成，稳定引用成交 |
| `engineSeq` | 一个 logical engine generation | Cluster | 仅显式 epoch transition 后可重置 | 命令/事件全序锚点 |
| `bookSeq` | instrument/book generation | Cluster | 仅显式 epoch transition 后可重置 | 单簿事件连续性 |
| `eventSeq` | 业务事件流 generation | Cluster | 仅显式 epoch transition 后可重置 | 下游 Gap、重放和 ACK 锚点 |
| `riskReservationId` | 风险权威域 | Risk service/同域状态机 | 否 | 接受、消耗、释放必须可对账 |

最低安全约束不等待 `OQ-010` 的最终编码决定：业务 generation 不等于 Aeron leadership term，leader election、Gateway 重连和普通进程重启不得改变 generation 或重置序列。任何 generation 转换都必须由日志排序的权威命令完成，记录 predecessor、cutover position、rebuild anchor 和原因；旧 generation 的 ingress/ACK 必须 fail closed。允许转换的业务场景、DR fork 与编号格式仍由 `ADR-0004/0007/0008` 决定。

### 5.2 数值模型

- 价格只用整数 tick，数量只用整数 lot。
- 协议层携带 scale、instrument metadata version 和显式单位。
- 所有乘法、累计和 ID 自增显式检查溢出；溢出确定性拒绝并产生可审计结果。
- Cluster 状态机内禁止 `float`/`double` 表达价格、数量、金额或风险。
- 舍入规则属于版本化业务配置，必须经日志排序；不得读节点本地配置。

### 5.3 时间模型

- 日志顺序给出命令的唯一执行全序，并决定订单进入状态机后的时间优先序；最优价格仍由撮合规则选择，客户时间戳只用于审计。
- 状态机时间只来自 Cluster 提供的时间/Timer 回调。
- 禁止在状态机调用 `System.currentTimeMillis()`、`Instant.now()` 或 `nanoTime()` 决定业务结果。
- Gateway 的 elapsed timeout 使用本地 monotonic clock，但 timeout 只产生 `outcome_unknown`，不证明命令未提交。
- 持久业务时间、交易日和 session 状态都以有序管理命令进入 Cluster。

### 5.4 顺序模型

- Ingress 命令经 Cluster 排序后形成唯一执行序。
- 撮合先选择最优价格，再在同价格以订单获得的已提交 `engineSeq`/内部 priority sequence 严格 FIFO。
- 外部到达时间、TCP 顺序、Gateway 接收顺序和 wall-clock timestamp 都不能越过 Cluster 排序。
- 下游各流只在自己的 `(streamId, generation, eventSeq)` 域内连续；不同流没有隐含全序。

## 6. 需求注册表

### 6.1 功能需求

| ID | 规范性陈述 | 优先级 | 验收条件 | 状态 |
| --- | --- | --- | --- | --- |
| REQ-FUNC-001 | V1 必须实现确定性的 New/Cancel/Replace 订单状态机 | must | 参考模型、属性测试、重放哈希一致 | draft |
| REQ-FUNC-002 | V1 必须实现 GTC/IOC/FOK、价格保护和 STP 的版本化规则 | must | 每条规则有反例、模型和回归 fixture | draft |
| REQ-FUNC-003 | Trading Halt 与 Kill Switch 必须有明确的边缘动作和有序状态动作 | must | 已入日志命令不被“越权撤销”，恢复后状态一致 | draft |
| REQ-FUNC-004 | 每个 `(tenant/venue/client principal, commandId)` 必须产生唯一规范结果，同主体/ID 异 canonical digest 拒绝 | must | 跨 Gateway crash/retry/leader-change 测试 effectCount<=1，结果查询鉴权 | draft |
| REQ-FUNC-005 | Cluster 必须确定性分配 order/trade/event/engine/book sequence | must | snapshot/replay 后 ID 与事件完全一致 | draft |
| REQ-FUNC-006 | Cluster 必须校验并原子消费有效风险预占 | must | 无凭证/重复/过期/错 payload 均 fail closed | draft |
| REQ-FUNC-007 | 私有回报、行情和账本事件必须通过可恢复出口交付 | must | 任意 crash window 后连续或显式 Gap/重建 | draft |
| REQ-FUNC-008 | 查询必须声明 authoritative/read-barrier 或 projection staleness 合同 | must | API contract 与一致性测试 | draft |

### 6.2 质量需求

| ID | 规范性陈述 | 优先级 | 验收条件 | 状态 |
| --- | --- | --- | --- | --- |
| REQ-QUAL-001 | 容量和延迟只能对固定 workload/hardware/durability profile 声明 | must | 报告完整记录 profile、CO 处理和原始 histogram | accepted |
| REQ-QUAL-002 | 相同 snapshot 与 committed suffix 必须产生相同最终状态哈希、retained delivery state 和 suffix 规范事件，且不重发 snapshot 前已清理事件 | must | 多 seed、多 JVM 冷重放一致 | draft |
| REQ-QUAL-003 | 峰值目标下 backlog 不持续增长，并保留候选 30% 容量余量 | must | open-loop load sweep；目标值经产品接受 | draft |
| REQ-QUAL-004 | 所有内部队列、缓存、去重、订单池和 Outbox 都必须有界 | must | 容量模型、满载策略、故障注入 | draft |
| REQ-QUAL-005 | Leader failover、snapshot、replay、catch-up 和 backup 不得破坏不变量 | must | 峰值下故障矩阵 | draft |
| REQ-QUAL-006 | 运行 24–72 小时 soak 期间不得出现不变量、Gap、对账或资源泄漏违例 | must | 固定 profile soak 报告 | draft |

### 6.3 运维需求

| ID | 规范性陈述 | 优先级 | 验收条件 | 状态 |
| --- | --- | --- | --- | --- |
| REQ-OPS-001 | 三个 voter 必须位于独立故障域；同宿主部署不得宣称 HA | must | 拓扑清单、故障域证明、单域失效演练 | accepted |
| REQ-OPS-002 | quorum 丢失时必须停止写准入，禁止 follower 单机写 | must | 网络分区和双节点失效实验 | draft |
| REQ-OPS-003 | Snapshot 必须完整覆盖权威状态，并先在 staging 校验再安装 | must | 截断/损坏/未知版本/不变量测试 | draft |
| REQ-OPS-004 | ClusterBackup、备份、恢复、节点重建和 DR 必须分别定义 RPO/RTO | must | 四类演练分别出证据 | draft |
| REQ-OPS-005 | Archive 清理必须服从 snapshot、replay、Outbox、Backup 和恢复游标保留地板 | must | retention proof + destructive test | draft |
| REQ-OPS-006 | 混合版本升级、快照迁移和安全回滚必须先于生产发布验证 | must | 带流量升级/回滚矩阵 | draft |
| REQ-OPS-007 | 监控必须覆盖 quorum、role、commit/recording positions、queue、backpressure、disk、snapshot、backup、egress Gap 和业务不变量 | must | dashboard/alert fault injection | draft |

### 6.4 安全需求

| ID | 规范性陈述 | 优先级 | 验收条件 | 状态 |
| --- | --- | --- | --- | --- |
| REQ-SEC-001 | 生产必须使用明确的身份认证和授权，禁止默认放行 Authenticator | must | 未授权/过期/降权/轮换测试 | draft |
| REQ-SEC-002 | 不可信网络不得暴露明文凭据或未保护的业务流 | must | threat model、传输保护和抓包验证 | draft |
| REQ-SEC-003 | 管理命令、Kill Switch、快照、恢复和升级必须具备最小权限和审计 | must | maker-checker/审计/越权测试 | draft |
| REQ-SEC-004 | 日志、快照、证据和教程不得包含真实客户数据或密钥 | must | secret/PII scan | accepted |

## 7. 不变量与证明义务

| ID | 精确谓词 | 强制点 | Oracle/测试 | 状态 |
| --- | --- | --- | --- | --- |
| INV-001 | 对每个订单：`0 <= leavesQty <= orderQty` 且 `cumQty + leavesQty = acceptedQty`，除非版本化 replace 规则明确重建基数 | command apply | 参考模型、属性测试 | proposed |
| INV-002 | 每笔成交买卖数量相等，所有数量均为正整数 lot | match commit | 事件平衡 Oracle | proposed |
| INV-003 | 连续竞价 LIVE 状态下不存在 `bestBid >= bestAsk` 的 resting crossed book | batch commit | book invariant | proposed |
| INV-004 | 同一价格按已提交 priority sequence 严格 FIFO；Replace 是否失去优先级由规则版本决定 | matching core | model trace | proposed |
| INV-005 | 一个 `(tenant/venue/client principal, commandId, canonicalPayloadDigest)` 只有一个规范结果；同主体/ID 不同 digest 永不执行，其他主体不能读取该结果 | dedup/authz gate | 跨 Gateway retry/crash/collision tests | proposed |
| INV-006 | `orderId`、`tradeId`、`eventSeq` 在其 generation/domain 内唯一且只由有序状态机推进；选举/重启不改变业务 generation | state transition | replay/hash/epoch fencing | proposed |
| INV-007 | 无有效且未消费的风险预占，订单不得进入 ACTIVE/成交状态 | admission apply | token lifecycle model | proposed |
| INV-008 | 相同 snapshot 与 committed suffix 产生相同最终 canonical state hash、retained delivery control state 和 suffix 规范事件；snapshot 前已清理事件不重新投递 | restore/replay | deterministic replay | proposed |
| INV-009 | 读者只能看到完整 command transition 前或后的 immutable view，不能看到半批状态 | publish boundary | concurrent reader test | proposed |
| INV-010 | 对每个下游 lossless stream：事件连续，或消费者收到显式 discontinuity 并从 snapshot/cursor 重建；Outbox GC 对每个 required consumer 都满足 cursor 或 committed detach/rebuild 谓词，永不静默跳洞 | outbox/fanout | gap/GC injection | proposed |
| INV-011 | quorum 不存在时，不产生新的 committed business result | ingress/leadership gate | partition test | proposed |
| INV-012 | accepted snapshot 必须通过 magic/version/EOS/count/checksum/state-hash/全部业务不变量验证 | snapshot install | corruption matrix | proposed |
| INV-013 | Outbox、dedup、订单池和所有队列均不超过已接受容量；达到边界执行显式 backpressure/degrade/halt | allocation/admission | saturation test | proposed |
| INV-014 | 任何 acknowledged-as-committed 的命令在 active quorum 可恢复前缀中不丢失 | ACK boundary | crash/failover replay | proposed |
| INV-015 | 外部副作用可重复投递但不能因同一稳定业务 ID 重复生效；无法证明时状态为 unknown/inconclusive | adapters | inbox/ledger reconciliation | proposed |

不变量状态不能仅因单元测试通过升为 `verified`。必须记录适用版本、fault schedule、workload、环境、Oracle 和 EVD。

## 8. 系统上下文、状态所有权与目标拓扑

### 8.1 候选生产拓扑

- 三个 voting members 分别位于三个真实故障域；稳定运行时恰有一个 leader、另外两个是 followers，同一 leadership term 至多一个 leader，选举期可以没有 leader并出现 candidate。容忍一个 member 故障的前提是剩余两个成员彼此可达并形成健康 quorum；没有 quorum 时不产生新的 committed business result。
- 每个 member 至少包含专属 Media Driver、本地 Archive、Consensus Module 和一个 Matching `ClusteredService`。
- Driver/Archive/Consensus Module 与业务 Service 是否分进程由 `ADR-0009` 和实验证据决定。
- 每节点独立企业级 NVMe、独立目录、固定 owner/mode；生产禁止 `deleteDirOnStart`。
- 至少两个不拥有撮合权威状态且可替换的 Gateway；它们仍拥有外部协议会话、FIX/client sequence、待确认请求和可恢复投影。Active/passive 或 active/active、会话 owner、fencing 与恢复来源由 `OQ-009/ADR-0005` 决定。
- 每个 Gateway 由单一 duty-cycle agent 独占一个 `AeronCluster` client；不能用“两个进程存在”替代 Gateway failover 合同。
- 私有回报、行情、Event Journal、Ledger/Trade Capture 分成独立下游适配器，不能阻塞 Cluster hot path。
- 另一故障域部署开源 `ClusterBackup`，只作为异步冷备/节点重建材料。

### 8.2 为什么初始不分片

初始采用一个 authority domain。原因不是“永远不需要分片”，而是：

- 价格时间优先只在单个簿内局部，但客户/机构信用和 Kill Switch 可能跨 symbol；
- 把风险移到 Gateway 会引入短时超限窗口；
- 把风险放独立 cluster 会增加往返、故障和恢复协议；
- 分片会改变 order/trade/event sequence、下游对账和 DR 单元。

只有 `EVD` 证明单状态机无法满足已接受 profile，且新的业务一致性合同被明确接受后，才能打开 `ADR-0006`。

### 8.3 线程与 Agent 所有权

- Matching state 只由 ClusteredService duty cycle 修改。
- Gateway 的 `AeronCluster` 实例只由所属 agent 使用并持续 poll egress/state changes。
- 网络 I/O 回调只解帧、打接收元数据、执行有界 enqueue；不在 callback 做阻塞业务。
- 下游 adapter 各自拥有 cursor、重试、连接和持久化；不得反向阻塞权威状态机。

## 9. 协议、Schema 与兼容性

### 9.1 三套独立 SBE schema

1. ingress command schema；
2. business event/egress schema；
3. snapshot schema。

不能让 snapshot 直接复用 command flyweight，也不能把外部 FIX/JSON 当作 Cluster 内部协议。

### 9.2 编码规则

- 固定 `schemaId`；`templateId` 和 field ID 永不复用。
- 演进使用 append-only、`sinceVersion` 和明确 null/default 语义。
- generator 与 runtime 锁同一已验证版本。
- 解码前验证 frame/message length、schema/template、acting version 和 block length。
- group/varData 严格按 schema 顺序读写。
- 未知 enum、非法长度、溢出和畸形字段产生确定性 reject；不能让 poison message 在所有副本重放时共同崩溃。
- CI 保存黄金二进制 fixture，覆盖 old-reader/new-writer、new-reader/old-writer 和 unknown-field 行为。

### 9.3 Ingress envelope 候选字段

`schemaVersion | commandType | commandId(128) | payloadDigest | tenant/venue/client identity | clientSequence | deadlineBudget | instrumentId | instrumentMetadataVersion | riskReservationId | command payload`

Gateway 负责外部协议解析、认证授权、结构校验、基础 tick/lot 检查、有界 admission 和 SBE 规范化。Cluster 仍必须重验所有权威业务不变量。

候选 dedup identity 是 `(tenant/venue/client principal, commandId)`。`payloadDigest` 必须使用已登记算法，覆盖 canonical command type、认证主体、schema/规则版本和规范化 payload；结果查询按同一主体鉴权。外部协议有稳定 request key 时必须保留映射；若由 Gateway 生成 `commandId`，则必须从稳定 client key/sequence 确定性派生，或把映射耐久化并供接管 Gateway 恢复，禁止跨 Gateway 重试时重新分配。

### 9.4 Event envelope 候选字段

`eventSchemaVersion | streamId | generation | eventSeq | engineSeq | bookSeq | tenant/venue/client identity | commandId | orderId | tradeId | clusterTimestamp | eventType | payload`

即时 egress 只用于低延迟响应，不是耐久业务日志。可靠下游基于 Cluster 内有界 Outbox、稳定 event identity、消费者 ACK 高水位和必要的 snapshot/catch-up 协议。

Event `generation` 是有序业务 stream epoch，不是 leadership term。任何转换都必须记录 predecessor、cutover position 和 rebuild anchor；选举、重连与普通重启不改变 generation，旧 generation ACK 被 fencing。具体转换条件仍由 `OQ-010` 决定。

候选 ACK envelope 至少是 `(logicalConsumerId, consumerEpoch, streamId, generation, highestContiguousEventSeq)`。`logicalConsumerId` 是稳定业务身份，不能使用 `clusterSessionId`；同一 consumer 的 cursor 只能单调推进，不能越过已发布高水位或跨过 Gap。多实例接管前必须由权威控制面推进 `consumerEpoch`，最终资源以该 epoch fencing 旧实例。对每个 required consumer 和候选 GC 位置，必须逐一满足：同一 `streamId/generation` 的连续 cursor 已越过该位置；或有序控制命令已将其从 required set detach 并固定 snapshot/rebuild anchor。只有该谓词对全部 required consumers 成立才能 GC；不同 generation 的 cursor 不得直接比较。

### 9.5 兼容与功能 Gate

- 二进制兼容不等于语义兼容。
- feature activate 必须是有序状态变更，绑定 membership/build/capability 证据。
- snapshot manifest 必须写 minReader/app version/feature set。
- 旧 binary 是否能回滚，取决于激活后是否产生旧模型无法表示的状态和本地存储变化。
- 任何升级先跑 mixed-version、cold-open、snapshot restore、leader failover 和 rollback matrix。

## 10. 候选正常、失败与过载路径

### 10.1 正常 Ingress

1. 外部客户向 Gateway 提交命令和稳定 request key/`commandId`；Gateway 接管后仍能恢复同一映射。
2. Gateway 验证身份、权限、协议、基础精度、deadline 和本地 admission。
3. Gateway 将规范 SBE 命令交给其单 owner `AeronCluster` client。
4. `offer() > 0` 仅表示交给 publication，不是 commit。
5. Cluster 排序、去重、校验预占并原子执行撮合状态转移。
6. Cluster 记录规范结果和业务事件，推进 Outbox。
7. 应用 ACK 到达 Gateway 后，外部 API 才能返回确定结果。
8. ACK 丢失时，同一认证主体以同一稳定业务身份查询或重试。

### 10.2 结果未知

- `offer` 成功但未收到应用 ACK：unknown。
- leader 切换、Gateway crash、响应丢失或 deadline 到期：unknown。
- unknown 不等于失败，也不等于未执行。
- 重试必须使用相同认证主体、`commandId` 和 canonical payload digest；切换 Gateway 不得重新分配。
- 规范结果的保留期必须覆盖所有合法重试、断线恢复、DR 和人工重放入口；GC 需要逐入口 safe-to-forget 证明。

### 10.3 外部副作用

- Cluster 不同步写数据库、Kafka、账本或行情网络。
- Event adapter 先完成自己的 durable handoff，再通过 ingress ACK 已消费 cursor。
- Crash 发生在 publish/commit/ACK 任一边界时允许重复，不允许静默丢失。
- Ledger、OMS、Market Data 分别维护独立 stream cursor，不共享一个含糊高水位。
- 同一 `eventSeq`/`tradeId` 的幂等结果和 payload digest 必须可查询。

### 10.4 过载

- 所有队列有容量、年龄、owner 和满载动作。
- Gateway admission 满时优先拒绝尚未 durable accepted 的新请求，并返回结构化 retry advice；不能静默丢。
- Cluster ingress backpressure 不得转换成无限本地堆积。
- Outbox/slow consumer 到边界时，按业务合同选择断开重建、降级非关键流、背压新订单或受控停盘。
- retry budget、deadline propagation、优先级和 brownout 进入 workload/fault profile。
- 任何“继续服务”都必须说明哪些语义被降级；不能用 stale/不完整状态继续交易而只打日志。

## 11. Snapshot、日志、恢复、Backup 与 DR

### 11.1 Snapshot 覆盖范围

- 所有订单簿、活动订单和优先级结构；
- order/trade/engine/book/event sequence 水位；
- subject-bound command dedup identity、canonical payload digest、规范结果和保留元数据；
- 风险预占消费状态；
- 产品/交易状态/价格带/Kill Switch 等版本化权威状态；
- 未 ACK 的 Outbox 内容和各 stream 已发布/GC floor；
- required consumer registry、`logicalConsumerId`、`consumerEpoch`、stream generation、连续 ACK cursor；
- committed detach 状态、predecessor/cutover position、snapshot/rebuild anchor；
- feature/config/schema state；
- canonical state hash 所需全部数据。

### 11.2 Snapshot envelope

`magic | snapshotSchemaVersion | applicationVersion | minReaderVersion | featureSet | build/git SHA | sourceLogPosition | leadershipTermId | engine/stream generations + predecessor/cutover metadata | record counts | chunk checksums | canonicalStateHash | EOS`

### 11.3 安装协议

1. 读入 staging state，不覆盖 active state。
2. 验证 magic、版本、长度、上限、EOS 和分块校验和。
3. 验证 record count、ID/sequence 水位和 canonical state hash。
4. 运行全部适用业务不变量。
5. 只有全部通过才原子替换；失败时 fail closed 或按明确规则回退上一有效快照。
6. 未知版本不能“尽力解析”。

### 11.4 恢复证明

恢复证明分开比较三类结果：

1. `stateHash(restore(snapshot@S) + replay((S,C])) == stateHash(replay((0,C]))`；
2. 两条路径在 `C` 处得到相同 retained delivery state，包括尚未 GC 的 Outbox、required consumer registry、epoch/generation/cursor、detach/rebuild anchor 和 GC floor；
3. 恢复路径只生成 `(S,C]` suffix 的规范事件，并与 full replay 中同一 suffix 的事件字节等价。

读取可以从 Aeron position `S` 建立，但 snapshot 已代表的 command transition 不得再次应用，`S` 之前已经 ACK 并清理的事件不得作为新事件重新投递。未提交尾部可存在也可不存在，但不得改变已 ACK 事实。

### 11.5 Durability profile

- 三副本 quorum 只证明 active cluster 的复制提交，不自动证明整站断电 RPO=0。
- Archive、catalog、Consensus Module 的 sync level、文件系统、驱动、控制器和设备 cache 共同决定掉电边界。
- 应用 ACK 的第一层语义是命令已经 quorum commit 并由状态机应用；它是否能在进程崩溃、内核崩溃或整站断电后物理存活，另由明确的 durability profile 决定。
- Aeron 1.52.2 中 Archive `fileSyncLevel`、catalog sync level 与 Consensus Module `fileSyncLevel` 默认均为 0；Archive 还要求 `catalogFileSyncLevel >= fileSyncLevel`，否则配置在启动时失败。这些默认值不可作为生产掉电合同。
- 候选 profile 可以从 Archive/catalog/CM 的同步写模式开始测量，但最终选择必须同时通过掉电、延迟和吞吐实验。
- 每个 ACK 合同都绑定明确的 `DURABILITY_PROFILE-*`。

### 11.6 Backup 与 DR

- active member 副本不是独立备份。
- ClusterBackup 是异步冷备材料；其 lag、完整性和重建步骤必须观测。
- 节点重建、全 cluster 恢复、站点 DR 和误操作/PITR 是不同 Runbook 与 Gate。
- 恢复必须包含配置、schema、应用制品、密钥引用、权限、网络和下游 cursor，而不只是 archive 文件。
- DR 后旧站点必须被 fencing，随后重新对账再开放 canary。

### 11.7 Retention floor

Archive segment 只有在所有引用者都越过它之后才可清理：active replay、有效 snapshot、ClusterBackup、节点重建、DR、下游重放、审计/监管保留。各 cursor 不在同一域时不得直接取数值最小值，必须逐入口证明。

## 12. SLO、容量与性能证据

### 12.1 必须先冻结的 profile

| ID | 类型 | 状态 | Owner | 当前来源 | 下一动作 |
| --- | --- | --- | --- | --- | --- |
| WORKLOAD_PROFILE-001 | 业务到达、产品和消息组合 | missing | unassigned | 无真实输入 | 收集目标流量与历史分布，形成可审计 v1 |
| HARDWARE_PROFILE-001 | 主机、CPU、NUMA、NIC、网络、NVMe、OS | missing | unassigned | 无目标环境 | 冻结首个多机验收环境与镜像 |
| DURABILITY_PROFILE-001 | ACK、sync、snapshot、backup 与故障承诺 | missing | unassigned | 无已接受配置 | 设计候选 profile 并做 crash/power-loss 实验 |
| FAILURE_PROFILE-001 | 故障范围、持续时间、组合方式与环境假设 | missing | unassigned | 无已接受故障模型 | 冻结 crash/partition/stall/corruption/site-loss 边界与恢复目标 |

`WORKLOAD_PROFILE-001` 至少包含：

- instrument 数、活跃 instrument 比例和每簿深度分布；
- 并发连接/机构/账户数；
- New/Cancel/Replace/Fill/Reject 比例；
- SBE 消息尺寸和 event fan-out；
- 平稳到达率、burst 形状、持续时间和日内峰谷；
- STP、FOK、价格保护、Kill Switch 等分支比例；
- 下游消费速度、断线时长和重放量。

`HARDWARE_PROFILE-001` 至少包含：

- CPU 型号、socket/NUMA/SMT、频率策略和隔离；
- 内存、NIC/队列/IRQ、交换网络和 RTT；
- NVMe/RAID/controller/cache、文件系统和 mount；
- OS/kernel/container/cgroup；
- JDK/vendor/patch、GC、Aeron/Agrona/SBE、idle strategies；
- 每个进程和线程的 CPU/NUMA ownership。

`DURABILITY_PROFILE-001` 至少包含：

- Archive/catalog/Consensus Module sync 配置；
- ACK 定义；
- snapshot/backup 周期与 retention；
- 进程崩溃、内核崩溃、整站断电、设备损坏分别承诺什么。

`FAILURE_PROFILE-001` 至少包含：

- 进程、主机、故障域、网络分区、磁盘与整站失效的组合边界；
- 最大网络/存储延迟、GC/STW、CPU starvation 与 clock anomaly 假设；
- 哪些故障要求继续服务、受控拒绝、停盘、人工接管或 DR；
- 每种故障下允许的 RPO、RTO、unknown 结果与对账义务。

### 12.2 测量方法

- 外部独立到达使用 open-loop，延迟从 scheduled arrival 计时，记录 generator lag、drop/reject 和 queue age。
- 同时报告 offered/admitted/committed/goodput、p50/p99/p99.9/max、错误、超时、unknown 和 backlog。
- 不平均各窗口 p99；先合并可比 histogram。
- 环境、预热、持续时间、样本数、协调遗漏处理和原始 artifact 必须登记。
- active failover、client reconnect、node rebuild、cold DR 分开计时。
- snapshot/replay/catch-up/backup 必须在目标负载下测，不只空载测。

### 12.3 尚未接受的候选 Gate

- 峰值目标下稳定且保留不少于 30% 容量余量；
- 24–72 小时 soak；
- 峰值流量中 leader failure 无已提交命令丢失、无业务事件静默 Gap；
- 从最新有效 snapshot 恢复满足目标 RTO；
- 全部观察值必须等 workload/hardware/durability/failure profile 冻结后才接受。

## 13. 安全、审计与运维

### 13.1 安全模型

- Gateway 是外部身份和协议边界；Cluster 网络不直接暴露给终端客户。
- 使用显式 Authenticator/AuthorisationService 或等价受控机制；默认放行不得进入生产 profile。
- 管理、交易和恢复凭据分离，最小权限，轮换可演练。
- 管理命令携带 actor、reason、approval、requestId 和审计关联。
- Kill Switch、恢复、升级、删除和清理属于高风险操作，需要 maker-checker 或等价控制。
- 不在本记录或证据中保存 secret、真实客户数据、内部地址或生产 token。

### 13.2 最低监控面

- Cluster role、leadership term、business generation、election state、commit/append/recording position；
- cluster session、ingress/egress backpressure、queue depth/age、duty-cycle stall；
- Archive recording、disk capacity/latency/error、snapshot duration/result；
- Backup state/lag/snapshot age；
- Gateway connection/reconnect/unknown/retry/admission/reject；
- order/trade/event sequence、Outbox depth/age、consumer cursor/Gap；
- business invariant violations、duplicate/conflicting payload、reconciliation differences；
- GC/JIT/safepoint/CPU/NUMA/IRQ/network drop；
- SLO burn、capacity headroom 和 recovery phase timing。

### 13.3 Runbook 最小集合

- 单 member 故障与重建；
- leader failover 与 Gateway 重连；
- quorum 丢失；
- disk full、I/O error、Archive/CM 故障；
- snapshot 失败/损坏；
- ClusterBackup lag/损坏；
- full-cluster restore 与 site DR；
- private/report/market/ledger Gap 与重建；
- poison command、schema incompatibility、升级中断和 rollback；
- slow consumer、Outbox 满、过载、Kill Switch 与受控恢复。

## 14. 生产红线

1. ClusteredService 内禁止数据库、文件、HTTP、Kafka、系统时间、随机数、本地可变配置和依赖无序遍历的结果。
2. 价格、数量、金额禁止浮点数和未检查溢出。
3. 禁止把 `offer()` 成功、UDP 可靠传输、egress 响应或三副本称为 exactly-once。
4. 禁止没有 subject-bound 稳定 `commandId`、canonical payload digest、跨 Gateway 可恢复映射和耐久规范结果的自动重试。
5. 禁止把 `clusterSessionId` 当业务身份。
6. 禁止终端客户一对一直连 Cluster，禁止多线程共享同一 `AeronCluster`。
7. 禁止无界 ingress、订单池、去重表、Outbox、重放缓存或下游队列。
8. 禁止默认放行 Authenticator 进入生产。
9. 禁止在不可信网络上传明文凭据或裸业务流。
10. 禁止以默认/未验证 sync profile 宣称整站断电 RPO=0。
11. 禁止同宿主三个进程宣称高可用。
12. 禁止未测量 WAN RTT/抖动/丢包就部署跨地域 active quorum。
13. 禁止生产使用 `deleteDirOnStart`、固定 appointed leader 等测试配置。
14. 禁止为了演示秒级切换而无证据降低 heartbeat/election timeout。
15. 禁止在任何 snapshot/replay/Backup/DR/downstream cursor 仍可能引用时清理 Archive。
16. 禁止安装未验证完整性、版本、state hash 和业务不变量的 snapshot。
17. 禁止无 mixed-version、cold-open、snapshot 和 rollback 证据的滚动升级。
18. 禁止在跨品种风险正确性未解决前按 symbol 草率分片。
19. 禁止用 laptop/demo 的数字作生产 TPS/延迟宣传。
20. 禁止把 ClusterBackup 描述为 active standby 或 voter。
21. 禁止只凭 build/单元测试通过宣布 production-ready。
22. 禁止认为 HA 能修复确定性软件缺陷；poison command 可复制到全部副本。
23. 禁止让下游慢消费者无限阻塞 Cluster hot path。
24. 禁止以 wall-clock timestamp 替代 Cluster 顺序或重建 Gap。

## 15. 生产就绪 Gate

| ID | Gate | 必须证明 | 当前状态 |
| --- | --- | --- | --- |
| GATE-001 | 项目合同 | workload/hardware/durability/failure/业务边界无含糊保证 | partial |
| GATE-002 | 确定性与撮合正确性 | 参考模型、属性测试、相同 trace/state hash、全部 INV | not_started |
| GATE-003 | 协议与兼容 | SBE fixture、fuzz、old/new matrix、poison fail closed | not_started |
| GATE-004 | HA 与 committed-prefix recovery | 三故障域、leader failover、snapshot/replay/catch-up | not_started |
| GATE-005 | 跨系统副作用 | OMS/行情/Ledger/Journal 的 Gap、幂等和对账 | not_started |
| GATE-006 | 容量与尾延迟 | 固定 profile、open-loop、headroom、峰值故障 | not_started |
| GATE-007 | 持久性、Backup 与 DR | crash/power-loss、node rebuild、cold DR、RPO/RTO | not_started |
| GATE-008 | 安全与运维 | authn/z、secrets、audit、alerts、runbooks、演练 | not_started |
| GATE-009 | 升级与回滚 | mixed-version、snapshot migration、feature gate、rollback | not_started |
| GATE-010 | 生产资格 | 24–72h soak、全矩阵、所有关键风险闭环 | not_started |

任何 Gate 的关联版本、配置、硬件或工作负载发生变化后，状态必须降为 `stale` 或重新验证。

### 15.1 Gate 追踪矩阵

| Gate | 主要需求 | 主要不变量 | 计划证据 |
| --- | --- | --- | --- |
| `GATE-001` | REQ-QUAL-001、REQ-OPS-001、REQ-SEC-004 | INV-011、INV-013 | EVD-0002；后续 profile/合同评审证据 |
| `GATE-002` | REQ-FUNC-001–005、REQ-QUAL-002 | INV-001–009 | EVD-0003 |
| `GATE-003` | REQ-OPS-003、REQ-OPS-006 | INV-005、INV-008、INV-012 | 后续 SBE fixture/fuzz/兼容报告 |
| `GATE-004` | REQ-QUAL-005、REQ-OPS-001/002 | INV-008、INV-011、INV-014 | EVD-0004 |
| `GATE-005` | REQ-FUNC-006–008 | INV-007、INV-010、INV-015 | 后续副作用 crash/reconcile 报告 |
| `GATE-006` | REQ-QUAL-001/003/004/006 | INV-009、INV-013 | EVD-0005 |
| `GATE-007` | REQ-OPS-003–005 | INV-008、INV-012、INV-014 | EVD-0006 |
| `GATE-008` | REQ-OPS-007、REQ-SEC-001–004 | INV-011、INV-013 | 后续安全/告警/Runbook 演练证据 |
| `GATE-009` | REQ-OPS-006 | INV-005、INV-008、INV-012 | 后续 mixed-version/rollback 报告 |
| `GATE-010` | 全部 accepted must requirements | 全部 accepted invariants | GATE-001–009 的最新证据与 soak 报告 |

## 16. 验证计划、故障矩阵与证据注册表

### 16.1 最小故障矩阵

- 每个 command apply 前/中/后 crash；
- 结果写入 dedup 前后、egress 前后、Gateway 返回前后 crash；
- leader、follower、Gateway、adapter、Backup 单独退出；
- 少数派/多数派网络分区、延迟、乱序、丢包、端口不可达；
- disk full、quota、I/O error、fsync stall、catalog/snapshot/segment 损坏；
- snapshot 分块中断、EOS 缺失、hash mismatch、未知版本；
- Outbox 满、下游 ACK 丢失、慢消费者、重放期间再次崩溃；
- duplicate/conflicting subject-bound command identity、跨 Gateway ID 漂移、stale generation ACK、sequence Gap、Gateway reconnect；
- GC/STW、CPU starvation、线程误绑、NUMA/IRQ 干扰；
- mixed-version election、restart、snapshot restore、feature activate、rollback；
- poison command 和相同确定性 bug 在多副本复现；
- Backup 落后、损坏、节点重建和 full-site restore；
- 10x burst、retry storm、热点 instrument、FOK 大簿扫描。

### 16.2 Oracle

- 朴素参考撮合模型与优化实现差分；
- 事件守恒、订单状态、不变量和 canonical state hash；
- committed prefix 与 ACK 记录对照；
- OMS/Market/Ledger 各 stream cursor 和业务对账；
- live vs replay；full replay 与 snapshot+suffix 在最终 state hash、retained delivery state 和 `(S,C]` suffix 事件上等价，且不重发 pre-S 已清理事件；
- 目标状态前后哨兵、RPO/RTO 时间线和 fault trace replay。

### 16.3 证据注册表

| ID | 证明对象 | Artifact/命令 | 环境/版本 | 结果 | 状态 | 失效触发条件 |
| --- | --- | --- | --- | --- | --- | --- |
| EVD-0001 | FACT-005/006 版本复核 | 官方 Releases/Javadoc 链接 | 2026-08-18 | Aeron 1.52.2、SBE 1.39.0、Agrona 2.5.0 | pass | 新正式 release |
| EVD-0002 | TASK-P0-001/GATE-001 项目框架 | [本地与发布验收 artifact](./evidence/EVD-0002-local-validation.md)；release `70ee0bca3bba8975c45c1f06c314b907bba498b2`；[Pages run 32148371343](https://github.com/lcha-reln/signal-grid-blog/actions/runs/32148371343) | Node 24.19.0；pnpm 10.30.3；本地与 GitHub Pages 真实浏览器 | linter 变异、full verifier、5 组视口/主题、4/4 Mermaid、Project 导航、Pages build/deploy 与最终线上烟测通过 | pass | 被验收 release 的技术合同或运行行为实质变化；发布事实及其派生的控制账本审计元数据不失效 |
| EVD-0003 | GATE-002 确定性 | 实现仓库 deterministic replay report | 不存在 | 未执行 | planned | 核心/schema/JDK 变化 |
| EVD-0004 | GATE-004 HA | 三主机 leader failure trace | 不存在 | 未执行 | planned | 拓扑/Aeron/config 变化 |
| EVD-0005 | GATE-006 容量 | open-loop workload + histograms | 不存在 | 未执行 | planned | profile/实现/硬件变化 |
| EVD-0006 | GATE-007 DR | immutable artifacts + restore drill | 不存在 | 未执行 | planned | backup/schema/key/runtime 变化 |
| EVD-0007 | TASK-P0-002/ADR-0001/ADR-0002 本地实现仓库 bootstrap 与构建合同 | [历史 bootstrap 验收 artifact](./evidence/EVD-0007-implementation-repository-bootstrap.md)；实现 commit `9dbe8e9f8578ad8fa27da54ca494c8e9a092c379` | Eclipse Temurin 25.0.4+7-LTS HotSpot；Gradle 9.7.0；macOS 26.0.1 (25A362)、Darwin 25.0.0、arm64/Apple M2；local-only repo | 旧 revision 的 33 个负向变异、依赖篡改和字节复现观察仍作为历史事实保留；实现 HEAD、policy/脚本与 JDK 安全状态已经变化，不能用于当前 revision | stale | 已于 2026-08-19 命中原失效条件；当前构建与安全事实分别由 `EVD-0008/0009` 承接 |
| EVD-0008 | TASK-P0-002/ADR-0001/ADR-0002/RISK-013/RISK-014 当前构建与 remote-authority readiness | [当前 readiness 验收 artifact](./evidence/EVD-0008-remote-authority-readiness.md)；实现 commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea` | Temurin 25.0.4+7 historical-reproduction runtime；Gradle 9.7.0；macOS 26.0.1 (25A362)、Darwin 25.0.0、arm64/Apple M2；local-only repo | 本地 full gate、39 个 repository mutants、20 个 authority mutants、artifact tamper、双路径/双缓存 online/offline 与解包 round-trip 通过；RAP 状态为 remote/artifact authority=`not_established`、Hosted CI=`not_observed`，readiness 对应布尔值均为 `false`、qualification=`not_proven`；Artifact URI `none` | partial | 实现 HEAD、policy/schema、Workflow/CODEOWNERS/Dependabot、JDK/依赖/脚本、remote/provider observation、artifact/backup authority 或环境变化 |
| EVD-0009 | FACT-012/OQ-004 JDK 25 安全基线刷新 | [JDK 安全刷新 artifact](./evidence/EVD-0009-jdk-security-refresh.md)；Oracle release notes/CSPU；Eclipse Adoptium GA API | 2026-08-19 official-source observation；未下载或运行 Oracle candidate | 确认 Oracle 25.0.4.1+1、安全 baseline、版本化 archive size/SHA；确认 cutoff 上尚无同 vendor Temurin 替代 GA；只通过外部事实观察，不接受 JDK 选型 | pass | 新 Oracle/Temurin/OpenJDK 发行或 advisory、制品元数据变化、`ADR-0001` 状态或实际 runtime 变化 |

证据记录必须包含：关联 REQ/INV/GATE、artifact URI/sha256、命令、workload、fault schedule、硬件、配置、版本/commit、期望、实际、时间、verdict 和失效条件。大日志不粘进本文件。

`EVD-0002` 绑定实际被验收并发布的 release `70ee0bca3bba8975c45c1f06c314b907bba498b2`，而不是要求本次纯审计回填 commit 自我引用。该 release 已包含派生任务/章节/Resume 状态和首篇的长期稳定表述；本次只回填它的 SHA、Pages run 与生产观察，不改变技术合同或站点运行行为，因此不会让该 release evidence 自动 stale。一旦记录、文章、站点行为或依赖发生实质语义变化，新 revision 必须重新验证并登记新的证据关系。

#### EVD-0002 当前详细记录

- Artifact：[Project 01 框架本地与发布验收](./evidence/EVD-0002-local-validation.md)。
- 本地结论：项目记录结构、11 类正反变异、Node 24 full gate、响应式明暗主题、Mermaid 渲染/放大/Esc 关闭、Project 锚点与 base-aware 回链均通过。
- 发布结论：被验收 release 为 `70ee0bca3bba8975c45c1f06c314b907bba498b2`；[Pages run `32148371343`](https://github.com/lcha-reln/signal-grid-blog/actions/runs/32148371343) 的 build 34 秒、deploy 5 分 11 秒，均成功；[专题](https://lcha-reln.github.io/signal-grid-blog/series/production/)和[首篇文章](https://lcha-reln.github.io/signal-grid-blog/posts/production-aeron-cluster-matching-engine-project/)已完成最终线上烟测，长期稳定文案、总账链接、canonical、4/4 Mermaid 与页面宽度均正确。
- 最终 release 本地证据：Node 24 full verifier 为 119 definitions、8 tasks、10 gates，Astro 0 diagnostics，76 pages 与 65 个 Pagefind 页面；`CHG-20260818-004` 回填当时，记录以 120 definitions、8 tasks、10 gates 再次通过同一 Node 24 full verifier。
- 当前 verdict：`pass`，只闭合 `TASK-P0-001` 并为 `GATE-001` 提供项目框架这一局部证据；`GATE-001` 仍是 `partial`，`claim_status` 仍是 `not_proven`。
- 当前边界：已有 local-only `deployable=false` build-contract 仓库，但没有撮合实现、Aeron Cluster 运行证据、HA/容量/持久性/DR 证据，也没有任何生产资格声明。

#### EVD-0007 历史详细记录（stale）

- Artifact：[实现仓库 bootstrap 与可复现构建合同](./evidence/EVD-0007-implementation-repository-bootstrap.md)。
- 证明对象：`TASK-P0-002`、`ADR-0001`、`ADR-0002`；原 verdict 为 `partial`，当前 verdict 为 `stale`，从未闭合任务或接受 ADR。
- 实现仓库：`/Users/reln/aeron-cluster-matching-engine`，`main`，commit `9dbe8e9f8578ad8fa27da54ca494c8e9a092c379`，工作树 clean，无 remote。
- 本地结论：精确 runtime/self-test、依赖锁与 verification metadata、源码/tag/制品摘要、规范化 graph/SBOM、33 个负向变异、依赖篡改、两条绝对路径/两套独立 Gradle Home 的 online/offline 构建，以及解包 ZIP 后的 offline byte-for-byte round-trip 均通过。
- 不可变输出：build-contract ZIP SHA-256 `e8e83fbafd36671f4205534476943d7a16a962823f3cff180683aac91ade6db5`；resolved manifest `8043e45adbcda0f75c7082a5cb0b1280dcbbc3ba1e80667e4a8ac120ebc47a71`；dependency graph `ba0211e62e416bf6445c5c44ec9c194a933ffa844425ddba7072a7c7e50d428d`；CycloneDX SBOM `8a1f7c496d7f306a8d40b1b0d4434efd7dd64d2b434f5db91053c07689caa2f8`；contract properties `c62c40f2d69c7fab4d11bfaa99a5b835c798e06103bd318f6af05f4b8bd0be9c`。
- 失效事实：实现仓库已推进到 `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`，policy/schema/验证脚本与规范化输出均变化；Oracle 2026-08-18 CSPU/JDK 25.0.4.1+1 也改变了旧 JDK 的安全适用性。这些变化命中了本证据原先列出的失效条件。
- 结论：本证据只保留旧 commit 的不可变历史观察；当前构建/readiness 由 `EVD-0008 partial` 承接，当前 JDK 外部事实由 `EVD-0009 pass` 承接。任何一份都不证明远端供应链信任、撮合正确性、Cluster HA、容量、持久性、DR 或生产资格。

#### EVD-0008 当前详细记录

- Artifact：[Remote authority readiness 与当前 revision 构建合同](./evidence/EVD-0008-remote-authority-readiness.md)。
- 证明对象：`TASK-P0-002`、`ADR-0001`、`ADR-0002`、`RISK-013`、`RISK-014`；verdict 为 `partial`。
- 实现仓库：`/Users/reln/aeron-cluster-matching-engine`，`main`，commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`，工作树 clean，无 remote、upstream 或 tag。
- 本地结论：39 个 repository mutants、20 个 authority semantic mutants、dependency artifact tamper、两条绝对路径/两套独立 Gradle Home 的 online/offline 构建，以及解包 ZIP 后的 offline byte-for-byte round-trip 均通过；ZIP 的 `evidence/` 子树严格只有五个声明文件。
- Authority 结论：`RAP-0001` 仍为 `proposed`；`remoteAuthorityEstablished=false`、`hostedCiObserved=false`、`artifactAuthorityEstablished=false`、`authorityQualification=not_proven`。缺少 observation 时以 `AUTHORITY-E900` 拒绝；普通文件加 proposed policy 以 `AUTHORITY-E902` 拒绝；完整 observation validator 尚未实现。
- Validator 边界：两个 JSON Schema 文件作为固定摘要制品进入合同，但当前没有通用 JSON Schema runtime；实际执行的是 canonical JSON 与更窄的 exact proposed-policy Kotlin validator。
- 当前摘要：ZIP `12707bef7348ccb8e5c8fec972d55df9038a5afcbb23d006dc66e3f5bb751f1f`；manifest `8043e45adbcda0f75c7082a5cb0b1280dcbbc3ba1e80667e4a8ac120ebc47a71`；graph `ba0211e62e416bf6445c5c44ec9c194a933ffa844425ddba7072a7c7e50d428d`；SBOM `8a1f7c496d7f306a8d40b1b0d4434efd7dd64d2b434f5db91053c07689caa2f8`；properties `33e2cb9af7435d8a68047e6a4f70763f1691e707cd26085d6e266e0b6f9686cf`；readiness `1766dbd9aad124fc9cd01030456bfa1cb1f4611a19ea4455a2d6f766cf53f812`；policy `61d67c86c9417d660e23c3b12cf3dbd48337d875cc6f9185231d873c76532f67`。
- 未闭合边界：没有 remote、provider enforcement、Hosted CI observation、license、持久 artifact/backup authority、外部 observation verifier、产品源码或安全有效的生产 JDK；它不闭合任务或接受 ADR。

#### EVD-0009 当前详细记录

- Artifact：[JDK 25 安全基线刷新](./evidence/EVD-0009-jdk-security-refresh.md)。
- 证明对象：`FACT-012`、`OQ-004`；verdict 为 `pass`，只证明 observation cutoff 上的官方发行事实。
- Oracle 观察：JDK `25.0.4.1+1` 于 2026-08-18 发布，JDK 25 security baseline 为 `25.0.4.1+1`；macOS aarch64 versioned archive 为 `209411751` bytes，SHA-256 `616fbcd6c68e4451c3ab12c0d4c5095deab67a2603125e63b0d8a46b41615e6a`。
- Temurin 观察：Eclipse Adoptium GA API 在 cutoff 上仍返回 macOS aarch64 HotSpot `25.0.4+7-LTS`，未观察到 25.0.4.1 或更新的同 vendor 适用 GA。
- 项目边界：旧 Temurin 只作历史复现；Oracle 只是未接受、未下载、未运行的 vendor-change candidate。本条 `pass` 不接受 `ADR-0001`，不闭合 `OQ-004`，也不证明生产安全性。

#### EVD-0001 详细记录

- 证明对象：`FACT-005`、`FACT-006`；只证明 2026-08-18 官方 release 列表中的最新正式 tag，不接受运行时选型，也不证明下载制品完整性。
- Aeron artifact：[release 1.52.2](https://github.com/aeron-io/aeron/releases/tag/1.52.2)，tag commit `5b62f21d917af027cdf5a3241aa5f355149b04fa`。
- SBE artifact：[release 1.39.0](https://github.com/aeron-io/simple-binary-encoding/releases/tag/1.39.0)，tag commit `e773b57cac6b2008ce30dd219a33de49766c6013`。
- Agrona artifact：[release 2.5.0](https://github.com/aeron-io/agrona/releases/tag/2.5.0)，tag commit `eaaa178c2bc47d7c03ab45403e24d95d83c89152`。
- 核对方法：分别打开三个官方 Releases 页面，检查 `Latest` 标记、版本号和 tag commit；同时确认没有把 master/SNAPSHOT 当作正式基线。
- 期望：找到各组件最新、非 SNAPSHOT、可固定 tag 的 release。
- 实际：Aeron 1.52.2、SBE 1.39.0、Agrona 2.5.0 满足该范围内的期望。
- 核对时间：2026-08-18T20:30:00+08:00。
- Verdict：`pass`；新 release、tag 删除/重指、官方安全公告或 ADR-0001 状态变化时立即 `stale`。
- 后续：当前下载、checksum、SBOM 与 resolved dependency graph 由 `EVD-0008 partial` 记录；JDK 安全发行观察由 `EVD-0009 pass` 记录。最终 vendor/build 仍未选择，`ADR-0001` 接受前还需在安全有效 runtime 上重跑合同、建立 hosted CI/远端保护与持久 artifact authority，并补齐兼容和故障验证。本 EVD 不替代这些证据。

## 17. ADR 决策日志

下列条目目前只是 proposal 摘要。任何 ADR 从 `proposed` 变为 `accepted` 前，必须扩展并冻结：日期与决策人、上下文、关联 REQ/INV、全部可行候选、最终决定、排除理由、正负后果、运维/恢复/兼容影响、关联 RISK、验证计划/EVD、重开触发、`supersedes` 与 `superseded_by`。字段不全时，结构 linter 和人工审校都应拒绝状态提升。

### ADR-0001：依赖与运行时版本基线

- 状态：`proposed`
- 候选：`EVD-0008` 已在本地锁定 Aeron 1.52.2、SBE 1.39.0、Agrona 2.5.0 与 Gradle 9.7.0；Temurin 25.0.4+7 只保留为安全基线已过期的历史复现 runtime。`EVD-0009` 已观察到 Oracle 25.0.4.1+1，但它只是 vendor-change candidate，observation cutoff 上没有同 vendor Temurin 替代 GA。
- 必须满足：REQ-QUAL-002、REQ-OPS-006。
- 接受前证据：明确 JDK vendor/build/license/support，固定安全有效的所有平台制品摘要并重跑依赖锁、制品 SHA、fixed-tag 源码审计、hosted CI、兼容/故障测试计划；`EVD-0007 stale` 只是旧 revision 历史，`EVD-0008 partial` 与 `EVD-0009 pass` 也不等于选型接受。
- 重开触发：新正式 release、安全修复、JDK 生命周期、不可接受缺陷。

### ADR-0002：实现代码仓库与博客边界

- 状态：`proposed`
- 候选决定：实现放独立代码仓库；当前 local-only provisional authority 为 `/Users/reln/aeron-cluster-matching-engine` 的 `main`/`ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`，博客只放项目控制记录和教程。`RAP-0001` 冻结 private-first 的 proposed readiness 候选，但不声称远端已存在或 enforcement 已生效。
- 原因：生产代码需要独立 CI、release/tag、镜像、权限和大体积证据；静态站点不应混入运行密钥与部署状态。
- 待决定：remote URI、实际 owner/principals/visibility、license、访问/审核/provider ruleset、backup/recovery、release/tag、Hosted CI observation、artifact authority/retention 和跨仓链接；本地 readiness 不能替代这些控制或接受本 ADR。
- 重开触发：用户指定已有仓库或组织策略。

### ADR-0003：权威状态、单写者与确定性模型

- 状态：`proposed`
- 候选决定：一个 Matching Cluster authority；纯撮合核心与 Aeron adapter 分离；全部影响结果的输入经日志排序。
- 排除：状态机直接数据库读、系统时钟、随机数、节点本地配置。
- 证据：相同 trace 的 byte/canonical hash 等价。

### ADR-0004：命令、订单、成交和事件身份

- 状态：`proposed`
- 候选决定：认证主体 + 128-bit commandId + canonical payload digest；Cluster 分配 order/trade/engine/book/event 序列；session ID 不作业务身份；选举/重启不改变业务 generation。
- 待决定：具体编码和 digest 算法、Gateway 外部 key 映射、generation 转换/DR fork、溢出和 retention（`OQ-010`）。

### ADR-0005：Gateway、交易前风险、幂等和 Unknown

- 状态：`proposed`
- 候选：风险同 bounded context；或独立权威预占服务并以 reservation token 原子消费。
- 必须明确：offer 非 commit、timeout=unknown、跨 Gateway 同 key 重试/查询、主体绑定、Gateway 会话 owner/fencing/恢复和 dedup 生命周期（`OQ-009`）。
- 风险：跨服务原子性、预占泄漏、Gateway 局部状态过期。

### ADR-0006：分片与扩容边界

- 状态：`proposed`
- 初始倾向：不分片。
- 开启条件：固定 profile 的 EVD 证明单状态机容量不足，且跨 shard 风险/身份/顺序/恢复合同获业务接受。
- 禁止：先按 symbol 分片再补信用正确性。

### ADR-0007：Snapshot、日志、状态哈希与恢复

- 状态：`proposed`
- 候选决定：独立 snapshot schema，完整权威状态，staging 验证，canonical hash，snapshot+suffix 等价。
- 待决定：chunk size、周期、hash、retention 和 fallback。

### ADR-0008：执行回报、行情、账本与外部副作用

- 状态：`proposed`
- 候选决定：Cluster 内有界 Outbox；各 stream 独立 cursor；至少一次 + 幂等 + Gap/rebuild + 对账。
- 待决定：Outbox ACK/GC、snapshot 协议、停盘阈值和 durable handoff。

### ADR-0009：生产拓扑、故障域、Backup 与灾备

- 状态：`proposed`
- 候选决定：单站点三独立故障域 active quorum + 远端开源 ClusterBackup；不把 Backup 当 voter。
- 待决定：进程隔离、主机/NIC/NVMe、sync、RPO/RTO、跨站恢复和 fencing。

### ADR-0010：协议兼容、升级与回滚

- 状态：`proposed`
- 候选决定：schema/app/feature/snapshot/local-storage 版本分离；committed feature gate；capability-aware snapshot；mixed-version evidence。
- 禁止：只因旧 decoder 能读字节就声称可回滚语义。

已接受 ADR 不重写；改变决定时新增 ADR 并 supersede 旧项。

## 18. 风险注册表

| ID | 场景 | 影响 | 检测 | 缓解 | Owner | 接受理由 | 复核日期 | 状态 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| RISK-001 | 非确定性逻辑/无序遍历/本地输入导致副本分叉 | 数据损坏、全局不可恢复 | replay hash、双实现差分 | API 隔离、lint、固定数据结构、fault replay | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-002 | poison command 在所有副本确定性崩溃 | HA 同时失效 | fuzz、schema/length gates | deterministic reject、隔离与修复 Runbook | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-003 | `offer`/timeout 被误当 commit/failure，或 Gateway 接管重新分配 ID | 重复或丢单 | unknown/retry/cross-Gateway fault matrix | subject-bound stable ID、可恢复映射、result query、dedup | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-004 | 下游慢或断线填满 Outbox | 撮合内存耗尽/停滞 | depth/age/SLO | 有界容量、replay、降级/停盘 | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-005 | sync profile 性能好但掉电丢已 ACK 数据 | 违反耐久合同 | power-cut test | 明确 profile、强制 barrier、硬件验证 | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-006 | 三节点同宿主/同故障域 | 伪 HA | topology audit | 独立 host/rack/power/network | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-007 | snapshot 漏 dedup/outbox/config/consumer registry/epoch/generation/cursor/detach anchor | 恢复后重复、stale ACK、提前 GC、Gap 或语义漂移 | state hash + retained delivery state + fault restore | 完整 manifest、staging invariant | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-008 | 跨 symbol 分片破坏信用和 Kill Switch 原子性 | 超限/不一致 | cross-shard model | 初始不分片、业务接受后再设计 | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-009 | Gateway projection 过期参与写决策 | 接受非法订单 | read-barrier/freshness metrics | Cluster authoritative recheck | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-010 | 降低 election timeout 遇到 GC/CPU/network stall | 选举抖动、不可用 | JFR/OS/network + chaos | 从最坏 stall 推导，留裕量 | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-011 | 版本升级产生旧模型不可表达状态 | 无法回滚 | mixed-version/state migration tests | committed gate、dual format、pre-activation baseline | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-012 | 证据因版本/硬件/profile 漂移仍被当有效 | 虚假生产声明 | linter/review due | 自动 stale、artifact lineage | unassigned | 未接受；生产前必须关闭或显式升级 | 2026-08-25 | open |
| RISK-013 | local-only provisional implementation authority 没有远端保护且可能丢失或漂移 | 源码/证据不可恢复，或出现多个互相冲突的 authority | 对照双仓恢复账本、固定 commit、工作树与备份恢复演练 | 用户确认访问模型并授权后建立受保护 remote、最小权限/ruleset、独立备份和持久 artifact authority | unassigned | 未接受；`TASK-P0-002` 闭合前必须缓解 | 2026-08-26 | open |
| RISK-014 | 把本地 proposed readiness、candidate Workflow/CODEOWNERS 或规范化摘要误当作远端 enforcement、Hosted CI 或 artifact authority | 在没有独立 trust root 时错误接受 ADR/任务或发布资格声明 | readiness 否定字段、外部 observation 缺失时 `AUTHORITY-E900`、provider API/restore 交叉核对 | policy 与 observation 分离；只有 accepted policy、真实 provider-hosted run、外部 artifact/backup restore 证据才能进入资格门禁 | unassigned | 未接受；`TASK-P0-002` 闭合前必须缓解 | 2026-08-26 | open |
| RISK-015 | 继续把 Temurin 25.0.4+7 当当前生产安全基线，或未经 ADR 自动切换到 Oracle vendor | 带已知安全适用性缺口上线，或引入未经评审的许可/支持/兼容变化 | `EVD-0009`、JDK baseline gate、vendor/build/license 审计 | 旧 runtime 只作历史复现；明确选择安全有效 vendor/build，重锁平台制品并重跑全部合同与运行证据 | unassigned | 未接受；`ADR-0001` 接受前必须缓解 | 2026-08-26 | open |

## 19. 阶段、任务与里程碑

### 19.1 实施阶段

| Phase | 目标 | 核心 Gate | 文章订单空间 |
| --- | --- | --- | ---: |
| P0 | 项目边界、生产定义、版本、SLO profile、故障与威胁模型 | GATE-001 | 1000–1090 |
| P1 | 可复现工程骨架、纯确定性内核、参考模型 | GATE-002 | 1100–1190 |
| P2 | 命令/事件/snapshot SBE、身份和兼容 | GATE-003 | 1200–1290 |
| P3 | 单节点真实 Cluster、log replay、snapshot restore | GATE-002/003 的运行时证明 | 1300–1390 |
| P4 | 三节点 HA、双 Gateway、切主与重连 | GATE-004 | 1400–1490 |
| P5 | OMS/风险/私有回报/行情/Ledger 边界 | GATE-005 | 1500–1590 |
| P6 | 性能、容量、JVM/Linux、慢客户端和过载 | GATE-006 | 1600–1690 |
| P7 | 安全、运维、Backup、DR 与恢复演练 | GATE-007/008 | 1700–1790 |
| P8 | mixed-version、snapshot migration、rollback、poison recovery | GATE-009 | 1800–1890 |
| P9 | soak、全矩阵、发布报告和生产资格审查 | GATE-010 | 1900–1990 |

若 P6 证据证明单状态机不够，分片只作为新的 P10/Project 变更，不在 P0 偷渡。

### 19.2 当前任务注册表

| ID | Phase | 交付物 | 验收 | 证据 | 状态 | 下一动作 |
| --- | --- | --- | --- | --- | --- | --- |
| TASK-P0-001 | P0 | production 专题、PROJECT_RECORD、结构 linter、首篇地图 | 独立技术/记录/集成审校，Node24 full，浏览器、链接/SEO/路由 | EVD-0002 | done | 已由 release `70ee0bca3bba8975c45c1f06c314b907bba498b2` 发布并验收 |
| TASK-P0-002 | P0 | 实现仓库与可复现构建合同 | ADR-0001/0002 accepted，wrapper/lock/verification、hosted CI、远端权限与 artifact retention 闭合 | EVD-0007、EVD-0008、EVD-0009 | doing | 用户确认并授权 remote；建立 provider enforcement、Hosted CI、artifact/backup authority；选择安全有效 JDK 后评审两项 ADR |
| TASK-P0-003 | P0 | WORKLOAD/HARDWARE/DURABILITY/FAILURE profiles v1 | 所有单位、来源、owner、版本明确 | 待分配 | todo | 收集真实目标和限制 |
| TASK-P0-004 | P0 | V1 订单、TIF、STP、风险和错误语义 | 产品合同+状态机表 | 待分配 | todo | 业务语义评审 |
| TASK-P1-001 | P1 | 纯 Java 参考撮合模型 | trace/属性/差分 Oracle | EVD-0003 | todo | 等 P0 Gate |
| TASK-P2-001 | P2 | 三 schema 与黄金 fixture | 兼容/fuzz | 待分配 | todo | 等领域模型 |
| TASK-P3-001 | P3 | 单节点 Cluster adapter | restart/replay/snapshot 等价 | 待分配 | todo | 明确仍非 HA |
| TASK-P4-001 | P4 | 三节点多主机拓扑 | 峰值 leader fault | EVD-0004 | todo | 等硬件 profile |

## 20. 教程与连续代码演进映射

### 20.1 已发布/当前文章

| Chapter | `seriesOrder` | 文章 | 代码里程碑 | 状态 |
| ---: | ---: | --- | --- | --- |
| 01 | 1000 | 生产级 Aeron Cluster 高可用撮合实战：项目合同、系统边界与交付路线 | 无代码；冻结项目总账和交付 Gate | published |

### 20.2 未发布路线（只在本记录维护）

以下标题是 working title，可由后续证据调整；不提前加入 `LEARNING_PATHS.md`。

| order | Phase | working title | 连续代码交付 | 关键 REQ/INV/EVD |
| ---: | --- | --- | --- | --- |
| 1010 | P0 | 生产合同：工作负载、SLO、故障模型与验收环境 | profile schemas + config validation | REQ-QUAL-001, GATE-001 |
| 1100 | P1 | 从参考模型开始：确定性订单状态机与价格时间优先 | domain/reference-model module | INV-001–004 |
| 1110 | P1 | Cancel/Replace、TIF、STP 与 Kill Switch 的状态语义 | model traces/properties | REQ-FUNC-002/003 |
| 1200 | P2 | SBE 命令协议：身份、精确数值、拒绝与兼容 | protocol module + fixtures | ADR-0004, GATE-003 |
| 1210 | P2 | 事件与 Snapshot Schema：版本、哈希和恢复边界 | event/snapshot codecs | INV-008/012 |
| 1300 | P3 | 第一个真实 Cluster：Service、Adapter、Timer 与单节点恢复 | node launcher + service | TASK-P3-001 |
| 1310 | P3 | Snapshot 与 committed suffix：从 crash 恢复等价状态 | snapshot/replay harness | REQ-OPS-003 |
| 1400 | P4 | 三节点生产拓扑：Gateway、选举、Catch-up 与结果未知 | 3-node environment | REQ-OPS-001/002 |
| 1410 | P4 | Leader 切换中的订单：幂等、查询和客户端重连 | gateway protocol | INV-005/014 |
| 1500 | P5 | 交易前风险与预占凭证：跨边界仍能守住准入 | risk adapter | INV-007 |
| 1510 | P5 | 私有回报与 Event Journal：可靠 Outbox、Cursor 与 Gap | event journal | INV-010/015 |
| 1520 | P5 | 行情与账本投影：Snapshot、重放、对账和慢消费者 | projectors/adapters | GATE-005 |
| 1600 | P6 | 测真实容量：open-loop、队列、尾延迟和容量信封 | load generator/report | REQ-QUAL-003 |
| 1610 | P6 | JVM 与 Linux 生产调优：线程、GC、NUMA、IRQ、磁盘 | runtime profiles | EVD-0005 |
| 1620 | P6 | 过载中的正确性：Admission、Retry Budget 与受控停盘 | overload policies | INV-013 |
| 1700 | P7 | ClusterBackup、节点重建与整站灾备 | backup/restore tooling | EVD-0006 |
| 1710 | P7 | 认证、授权、审计、监控与 Runbook | ops/security bundle | GATE-008 |
| 1800 | P8 | 带流量升级：协议、快照、Feature Gate 与回滚 | compatibility lab | GATE-009 |
| 1810 | P8 | Poison Pill 与确定性故障：HA 修不了的软件错误 | failure lab | RISK-002 |
| 1900 | P9 | 生产资格审查：soak、全故障矩阵、RPO/RTO 与证据包 | release candidate | GATE-010 |

Chapter 01 只绑定博客框架 release、项目记录和验收证据。从开始交付实现代码的章节起，每章必须绑定同一个实现仓库的 commit/tag、配置摘要、测试证据和未关闭风险；不得另起互不相干的 demo。

## 21. Artifact 与 Traceability Matrix

| Artifact | 未来位置 | Authority | 必须反向索引 |
| --- | --- | --- | --- |
| 项目总记录 | 本文件 | 项目控制面 | 全部 ID |
| 对外教程 | `src/content/posts/` | 已发布叙述 | Chapter/REQ/INV/EVD/commit |
| 实现仓库（当前仅构建合同） | local provisional `/Users/reln/aeron-cluster-matching-engine`；remote none/TBD | local-only commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`，RAP-0001 proposed，尚非持久 authority | ADR、release tag、build SHA、`EVD-0007/0008/0009` |
| Protocol schema/fixtures | 实现仓库 | wire contract | schema version/compat report |
| Test trace/seed | artifact store TBD | 故障复现 | commit/config/fault schedule |
| Benchmark histogram/report | artifact store TBD | 性能观察 | workload/hardware/durability profile |
| Snapshot/restore/DR report | artifact store TBD | 恢复观察 | backup generation/manifest/digest |
| Container/package | registry TBD | 可部署制品 | immutable digest/SBOM/signature |
| Runbook/dashboard/alerts | ops repo TBD | 运维执行 | release/config/environment |

从“需求 → 不变量/ADR → 代码 → 测试 → EVD → Gate → 文章”的链条缺一环，就不能把章节或阶段标为完成。

## 22. 当前交接点

### 工作已停在哪里

Phase 0 的记录和站点框架已由 release `70ee0bca3bba8975c45c1f06c314b907bba498b2` 发布并验收。当前停在 `TASK-P0-002`：commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea` 的 local-only 构建与 proposed authority-readiness 合同由 `EVD-0008 partial` 记录，JDK 外部事实由 `EVD-0009 pass` 记录，旧 `EVD-0007` 已 stale；但仍没有 remote、provider enforcement、Hosted CI observation、license、持久 artifact/backup authority 或产品实现，版本/仓库 ADR 仍为 `proposed`，也没有任何撮合、Cluster 或性能代码。

### 下一位执行者应做什么

1. 先核对 `reconciliation_base_git_sha`、双仓恢复账本、当前任务和 `EVD-0002/0007/0008/0009`；框架 release、本地 readiness 与历史 JDK 复现都不得误读为撮合实现或生产资格。
2. 由用户确认 owner、访问模型、license 和 principals 并授权后建立受保护 remote、provider ruleset、Hosted CI、artifact/backup authority 并采集外部 observation；同时决定安全有效的 JDK vendor/build，重跑合同后再评审 `ADR-0002` 与 `ADR-0001`。
3. 收集首个 workload/hardware/durability/failure profile；没有 profile 时不要直接开始写“高性能”撮合代码或声明容量目标。

### 绝对不要做什么

- 不要在没有 profile 时拍脑袋写 TPS/p99 目标。
- 不要先搭三节点，再把单线程 Map 示例称为生产内核。
- 不要让状态机直接连数据库/Kafka。
- 不要跳过参考模型、协议 fixture 和 snapshot 恢复证明。
- 不要让项目细节只存在于对话；任何新决定先登记 ID。

## 23. Append-only Change Log

| ID | 时间 | 修改 | 原因 | 影响 | Artifact/Commit | 后续 |
| --- | --- | --- | --- | --- | --- | --- |
| CHG-20260818-001 | 2026-08-18T21:03:38+08:00 | 创建 canonical 项目记录、初始需求/不变量/ADR/风险/Gate/路线 | 防止长期项目在上下文压缩后丢失技术细节 | 全项目 | pending first framework commit | 完成 EVD-0002 |
| CHG-20260818-002 | 2026-08-18T22:06:45+08:00 | 完成技术/记录/集成终审，显式 Project 归属、linter 变异门禁、Pages build 强制校验、Node 24 full 与浏览器矩阵 | 让长期控制账本和站点框架在首发前 fail closed | TASK-P0-001、EVD-0002、GATE-001 | [本地验收 artifact](./evidence/EVD-0002-local-validation.md)；release SHA 待提交 | 发布后用审计 follow-up 回填 release/Pages 证据 |
| CHG-20260818-003 | 2026-08-18T22:17:10+08:00 | 回填首个框架 release、Pages run 与生产 URL，把 EVD-0002 升为 pass，将唯一主任务推进到 TASK-P0-002，并把首篇进度句改成不随时间漂移的等义表述 | 让长期记录准确反映已经观察到的发布事实，同时保持生产资格边界和教程的长期可读性 | TASK-P0-001、TASK-P0-002、EVD-0002、GATE-001、FACT-011、Chapter 01 | release `afe7e6cafe8d716d9f6e12751d3b8beb33ab1fb9`；[Pages run 32146500240](https://github.com/lcha-reln/signal-grid-blog/actions/runs/32146500240)；[验收 artifact](./evidence/EVD-0002-local-validation.md) | 接受或修改 ADR-0001/0002，创建可复现实现仓库 |
| CHG-20260818-004 | 2026-08-18T22:34:56+08:00 | 回填包含最终总账状态与长期稳定文章表述的审计 release、Pages run 和线上轻量烟测 | 让 canonical 记录绑定最终被部署 revision，而不是停在初始框架 release | FACT-011、EVD-0002、TASK-P0-001、Chapter 01 | release `70ee0bca3bba8975c45c1f06c314b907bba498b2`；[Pages run 32148371343](https://github.com/lcha-reln/signal-grid-blog/actions/runs/32148371343)；[验收 artifact](./evidence/EVD-0002-local-validation.md) | 进入 TASK-P0-002，接受或修改 ADR-0001/0002 |
| CHG-20260819-005 | 2026-08-19T00:25:53+08:00 | 建立 local-only 实现仓库 bootstrap，固定版本/依赖/源码摘要，加入严格 policy、33 个负向变异、篡改与双路径离线复现，并登记 EVD-0007、RISK-013、版本账本与 Resume | 把可复现构建从计划变成可审计的本地局部证据，同时显式保留远端 authority、hosted CI 和 JDK 安全响应缺口 | TASK-P0-002、ADR-0001、ADR-0002、OQ-001、OQ-004、RISK-013、EVD-0007 | implementation commit `9dbe8e9f8578ad8fa27da54ca494c8e9a092c379`；[EVD-0007 artifact](./evidence/EVD-0007-implementation-repository-bootstrap.md) | 用户确认访问模型并授权后建立 remote，复核适用 JDK security release并在 hosted CI 重跑；任务保持 doing |
| CHG-20260819-006 | 2026-08-19T01:27:53+08:00 | 在实现 commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea` 加入 proposed remote-authority readiness、39+20 个负向门禁和显式 authority 否定状态；复核 Oracle/Temurin JDK 安全事实；把旧 EVD-0007 降为 stale并新增 EVD-0008/0009 | 让当前构建 revision、远端信任缺口与 JDK 安全适用性各由独立证据承载，防止本地 readiness、历史 runtime 或 vendor candidate 被误写成生产资格 | TASK-P0-002、ADR-0001、ADR-0002、FACT-012、OQ-001、OQ-004、RISK-014、RISK-015、EVD-0007、EVD-0008、EVD-0009 | implementation commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`；[EVD-0008 artifact](./evidence/EVD-0008-remote-authority-readiness.md)；[EVD-0009 artifact](./evidence/EVD-0009-jdk-security-refresh.md) | 用户确认并授权 remote 治理与 license/principals，建立外部 observation；选择安全有效 JDK 并重跑后再评审 ADR，任务保持 doing |

## 24. 一手资料索引

- [Aeron 1.52.2 release](https://github.com/aeron-io/aeron/releases/tag/1.52.2)
- [Aeron 1.52.2 Javadoc](https://javadoc.io/doc/io.aeron/aeron-all/1.52.2)
- [Gradle 9.7.0 release notes](https://docs.gradle.org/9.7.0/release-notes.html)
- [Gradle release checksums](https://gradle.org/release-checksums/)
- [Eclipse Temurin 25.0.4+7 release](https://github.com/adoptium/temurin25-binaries/releases/tag/jdk-25.0.4%2B7)
- [Eclipse Adoptium JDK 25 macOS aarch64 HotSpot GA API](https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=aarch64&heap_size=normal&image_type=jdk&jvm_impl=hotspot&os=mac&vendor=eclipse)
- [Oracle Java 安全更新节奏公告](https://blogs.oracle.com/java/transitioning-java-to-more-frequent-security-updates)
- [Oracle JDK 25.0.4 release notes](https://www.oracle.com/java/technologies/javase/25-0-4-relnotes.html)
- [Oracle JDK 25.0.4.1 release notes](https://www.oracle.com/java/technologies/javase/25-0-4-1-relnotes.html)
- [Oracle August 2026 CSPU](https://www.oracle.com/security-alerts/cspuaug2026.html)
- [Aeron Cluster Overview](https://aeron.io/docs/aeron-cluster/overview/)
- [Gateway Design](https://aeron.io/docs/aeron-cluster/gateway-design/)
- [Efficient Business Logic](https://aeron.io/docs/aeron-cluster/efficient-business-logic/)
- [Cluster Clients](https://aeron.io/docs/aeron-cluster/cluster-clients/)
- [Client Consistency](https://aeron.io/docs/aeron-cluster/client-consistency/)
- [Performance Limits](https://aeron.io/docs/aeron-cluster/performance-limits/)
- [On Sharding](https://aeron.io/docs/aeron-cluster/on-sharding/)
- [Cluster Backup](https://aeron.io/docs/aeron-cluster/cluster-backup/)
- [Operating Aeron Cluster](https://aeron.io/docs/aeron-cluster/operating-aeron-cluster/)
- [Cluster Errors](https://aeron.io/docs/aeron-cluster/cluster-errors/)
- [Cluster Counters](https://aeron.io/docs/aeron-cluster/understanding-cluster-counters/)
- [Application Protocols](https://aeron.io/docs/cluster-quickstart/application-protocols/)
- [SBE 1.39.0 release](https://github.com/aeron-io/simple-binary-encoding/releases/tag/1.39.0)
- [SBE Overview](https://aeron.io/docs/simple-binary-encoding/overview/)
- [SBE Warnings](https://aeron.io/docs/simple-binary-encoding/warnings/)
- [Agrona 2.5.0 release](https://github.com/aeron-io/agrona/releases/tag/2.5.0)
- [Raft extended paper](https://raft.github.io/raft.pdf)

以上在线资料用于解释当前版本；真正实现开始后，所有 API/default/thread/protocol 结论还必须固定到具体 tag/commit，并把核对结果登记为 EVD。
