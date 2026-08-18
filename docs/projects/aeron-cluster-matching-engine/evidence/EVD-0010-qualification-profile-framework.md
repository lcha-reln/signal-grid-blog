# EVD-0010：历史构建与 Qualification Profile 合同框架

- 证据 ID：`EVD-0010`
- 证明对象：`TASK-P0-002`、`TASK-P0-003`、`ADR-0001`、`ADR-0002`、`WORKLOAD_PROFILE-001`、`HARDWARE_PROFILE-001`、`DURABILITY_PROFILE-001`、`FAILURE_PROFILE-001`、`PROFILE_SET-001`、`QUALIFICATION_SET-001`、`RISK-013`、`RISK-014`、`RISK-016`
- 关联控制：`REQ-QUAL-001`、`REQ-QUAL-002`、`REQ-OPS-006`、`GATE-001`；不闭合任何业务 `INV` 或生产 Gate
- Observation cutoff：2026-08-19T02:35:35+08:00
- 实现对象：local-only repository commit `bca54470699d69dc609686927c46563492ff7c47`，tree `c7ace600668756cbf0cfee3e4406874d48211fde`
- Verdict：`stale`

## 0. 失效记录

本 artifact 的观察对象固定为实现 commit `bca54470699d69dc609686927c46563492ff7c47`。2026-08-19，项目在后继 commit `6c1bdfc856de0681211cbd134a97cabcae13c7f5` 中加入 19 个 v2 intake/lifecycle 合同、外部 authority 与 production acceptance 的默认拒绝边界、更多门禁及新的 bundle/evidence 输出，命中了本证据声明的 HEAD、schema、validator、脚本、policy、bundle 和 generated evidence 失效条件。因此本证据当前 verdict 为 `stale`，以下结果只保留为旧 revision 的不可变历史观察；当前 revision 由 `EVD-0011 partial` 承接。

## 1. 期望与实际

### 期望

被观察的旧 revision 当时必须同时满足以下条件：

- 四类 atomic Profile、`PROFILE_SET-001` 与 `QUALIFICATION_SET-001` 使用 canonical JSON、固定相对路径和精确 SHA-256 绑定；
- 未知 owner、source、目标、决策、证据与有效期只能保持 `null` 或空集合，并由 `unresolved` JSON Pointer 覆盖，不得从笔记本、产品默认值或示例推导生产数值；
- Profile Set 必须恰好绑定 workload/hardware/durability/failure 四个成员；Qualification Set 必须独立绑定 Profile Set，并保持 `claimed=false`、`not_qualified`；
- 本地 build-contract、仓库策略、Profile、remote authority、依赖篡改和可复现门禁全部通过；生产资格入口必须对 draft 合同 fail closed；
- bundle 只能包含显式声明的完整相对路径，不得有重复、路径逃逸或陈旧 evidence。

### 实际

在下述冻结环境中执行完整入口，exit code 为 `0`：

```bash
env \
  JAVA_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/temurin-extracted/jdk-25.0.4+7/Contents/Home \
  GRADLE_USER_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/wrapper-home \
  ./scripts/verify-all.sh
```

观察到：

- `buildContractCheck` online/offline 均通过；
- 50 个 repository-policy mutants、42 个 qualification Profile exact-code mutants、20 个 remote-authority mutants 均按预期被拒绝；dependency artifact tamper gate 通过；
- 两个绝对 checkout 路径、两套独立 Gradle Home、online 预热后的 offline 重建和解包 ZIP 后重建得到逐字节一致的七项输出；
- `assertQualificationSetQualified` 对当前 draft 以 `PROFILESET-E900` 精确拒绝；缺少 remote observation 的 authority 入口仍以 `AUTHORITY-E900` 拒绝；
- ZIP 精确包含 51 个文件，其中 14 个 qualification source、6 个 evidence；无 duplicate、unsafe path 或额外 evidence；
- 独立对抗复核再次验证 Profile symlink、未登记 Profile、Qualification Set 摘要漂移和合同 README 漂移会分别由稳定策略错误码拒绝；解包后的 14 个核心 Gradle tasks 通过。

## 2. 双仓与观察环境

实现仓库：

- 逻辑 ID：`aeron-cluster-matching-engine`；路径：`/Users/reln/aeron-cluster-matching-engine`；
- 分支：`main`；HEAD：`bca54470699d69dc609686927c46563492ff7c47`；tree：`c7ace600668756cbf0cfee3e4406874d48211fde`；
- `git status --porcelain=v2` 无输出；remote、upstream 与 tag 均不存在；
- tracked tree 没有 `src/`、`services/`、`apps/`、`deploy/`、`docker/`、`k8s/`、`helm/` 或 `infra/` 产品目录；
- 本 commit 只新增/强化构建合同、qualification 合同和门禁，不包含撮合、Cluster、Gateway、镜像或部署实现。

博客仓库在本轮编辑前：

- 路径：`/Users/reln/signal-grid-blog`；分支：`main`；
- HEAD：`5f940da2736d1de9dd3f690d0ba45c7a36a0ad49`；本轮授权差异仅为 `PROJECT_RECORD.md`、本 artifact、`EVD-0008` 历史状态和项目记录 linter；
- 该 SHA 是 `reconciliation_base_git_sha`，不是实现仓库 SHA，也不是尚未创建的博客 commit。

环境与适用性：

- OS：macOS 26.0.1，Build `25A362`；Darwin 25.0.0；arm64；Apple M2；
- Runtime：Eclipse Temurin 25.0.4+7-LTS HotSpot，仅用于历史字节复现，其生产安全基线已过期；
- Gradle：Wrapper 9.7.0；
- Workload：不适用——本轮是 build/qualification contract，没有订单流量；
- Fault schedule：不适用——50+42+20 个变异和一次 dependency artifact tamper 是门禁负例，不是 Aeron Cluster/HA 故障实验；
- Configuration：精确 `JAVA_HOME`、受保护 Wrapper、两套独立 Gradle Home、两个 checkout 路径、online 预热后 offline；
- Artifact URI：`none`。输出位于本地 ignored `build/`，没有持久 artifact authority。

## 3. Profile 与 Set 的机器真相

| 对象 | 状态 | SHA-256 | 未闭合边界 |
| --- | --- | --- | --- |
| `WORKLOAD_PROFILE-001` | `draft` | `7302149581d3bf5edc99ae357fbf2e5dec6de4744b05782a1633b85c151e1b5a` | owner/source/目标流量、消息大小、burst 和分支比例 |
| `HARDWARE_PROFILE-001` | `draft` | `2ea4949caeda315825aef30b8c23a4b3b563f6e59a226e0dc58ff9436fe41d73` | owner/source/主机、CPU/NUMA、NIC、NVMe 与角色线程映射 |
| `DURABILITY_PROFILE-001` | `draft` | `5cdb5c5d6380cd90e0c28f20651563a7ace87e550813d3bacd884893f1340d97` | owner/source/ACK、sync、retention、node/full-cluster/site-DR 目标 |
| `FAILURE_PROFILE-001` | `draft` | `2aabd771556738c3ca7df58e772a603bf425a8b577b1a9d88c0cc214da36fbec` | owner/source/故障范围、时长、组合 scenario 与恢复 disposition |
| `PROFILE_SET-001` | `draft` | `43c063422def2c3c19e7209b31a6922de83df96377bae38eeaf4c03b66e1b45e` | 只绑定上述四个精确 revision/path/SHA，不是资格证据 |
| `QUALIFICATION_SET-001` | `draft` | `e2d00150b2374e5556078754842a1443245479feab4d10a590c8ba97ee842aca` | `claimed=false`、`not_qualified`，decision/evidence/validity 均未建立 |

四类 Profile 共 152 个 datum；当前 `value` 与 `sourceRef` 均为 `null`，所有 `null` 和语义为空的集合均由唯一、排序的 `unresolved` 指针或其祖先覆盖。`profile-readiness.json` 明确输出 `allProfilesVerified=false`、`claimed=false`、`qualificationStatus=not_qualified` 与 `deployable=false`。

当前执行的是针对 draft revision 的 Kotlin canonical/semantic validator。锁定的 Draft 2020-12 Schema 是设计 artifact；本轮没有运行通用 JSON Schema 引擎。未来第一次把任一对象提升为 `accepted` 或 `verified` 之前，必须新增版本化的非 draft validator，严格校验非空 datum、sourceRef、owner、决策、证据和有效期；不得把本次 draft pass 直接复用成资格证明。

## 4. 规范化输出摘要

| Artifact | SHA-256 |
| --- | --- |
| `aeron-cluster-matching-engine-build-contract.zip` | `c1a16c132d2065c2bd46f678a1b62d30b35d5dbcdc42d387b3097820c588b631` |
| `resolved-artifact-manifest.json` | `8043e45adbcda0f75c7082a5cb0b1280dcbbc3ba1e80667e4a8ac120ebc47a71` |
| `dependency-graph.txt` | `ba0211e62e416bf6445c5c44ec9c194a933ffa844425ddba7072a7c7e50d428d` |
| `cyclonedx-sbom.json` | `8a1f7c496d7f306a8d40b1b0d4434efd7dd64d2b434f5db91053c07689caa2f8` |
| `build-contract.properties` | `4d77dfd9e6bf336de2e232491e37128c55d2533048c34229d4a0cc76e9486889` |
| `profile-readiness.json` | `2cb205d2f8f13563ef6f97ff688d860a0b9ff70277463fecf021a1dbc6796493` |
| `remote-authority-readiness.json` | `1766dbd9aad124fc9cd01030456bfa1cb1f4611a19ea4455a2d6f766cf53f812` |

这些摘要只证明该旧 revision 当时的本地规范化输出内容一致性，不证明当前 revision、publisher identity、外部可取回性、不可变留存、漏洞/许可证合规、目标硬件性能或生产部署资格。

## 5. Verdict 边界与失效条件

本证据原先的 `partial` 只表示旧 revision 的 draft 合同、否定资格状态和本地 fail-closed 门禁曾被观察；当前已因后继实现变化转为 `stale`。它从未使任何 atomic Profile、Profile Set 或 Qualification Set 变为 `accepted/verified`，从未接受 `ADR-0001/0002`、解除 `TASK-P0-002 blocked`、完成 `TASK-P0-003`，也从未把 `GATE-001` 或 `claim_status` 提升。

以下任一变化会使本证据 `stale`：

- 实现 HEAD、qualification schema/profile/set/path/SHA/binding、validator、脚本、policy、bundle 或 generated evidence 变化；
- 任一真实 Profile owner、source、datum、scenario、审批、decision、evidence 或 validity 变化；
- Gradle/JDK/依赖/锁/verification metadata、操作系统、硬件或复现配置变化；
- remote/provider observation、Hosted CI、artifact/backup authority 被建立、修改、撤销或过期；
- 发现 canonical/unresolved/digest/path/bundle 规则可绕过，或 readiness/资格否定字段被错误提升。

下一步是按 `OQ-011` 分配真实 input/approval owner并从权威来源填充四类 Profile；同时保留 remote/JDK 的独立用户决策边界。没有真实输入、目标环境和独立证据以前，不能发布任何 TPS、尾延迟、RPO、RTO 或“生产级”结论。
