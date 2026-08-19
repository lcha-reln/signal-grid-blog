# EVD-0013：change/revision/effective-state 源码结构边界

- 证据 ID：`EVD-0013`
- 证明对象：`TASK-P0-002`、`TASK-P0-003`、`ADR-0001`、`ADR-0002`、`REQ-QUAL-007`、`REQ-QUAL-008`、`REQ-SEC-005`、`WORKLOAD_PROFILE-001`、`HARDWARE_PROFILE-001`、`DURABILITY_PROFILE-001`、`FAILURE_PROFILE-001`、`PROFILE_SET-001`、`QUALIFICATION_SET-001`、`OQ-011`、`OQ-012`、`RISK-013`、`RISK-014`、`RISK-016`、`RISK-017`
- 关联控制：`GATE-001`；只提供 B010/B011 的版本化源码合同、静态实现与默认拒绝边界，不闭合 B008、B010、B011、任何业务不变量、运行时 Gate、Profile 接受或生产资格 Gate
- Observation cutoff：2026-08-19T09:14:09+08:00
- 实现对象：local-only repository commit `e4482a4ddd445cc5065af1ea9f2cac993ce80121`，tree `13f4e29a5e2a748da16bf42cbc2945baa5be47e9`
- Artifact URI：`none`
- Verdict：`partial`

## 1. 本 revision 静态证明什么

本 revision 在现有 v1/v2 Profile intake 与 RFC 8785/JCS build-only primitive 之上，增加独立的 v3 change/revision/effective-state 源码合同。静态审计确认：

- v3 精确包含 9 个 source files：6 个 JSON Schema、2 个 canonical JSON 否定实例和 1 个 README；8 个 JSON 均保持 canonical `jq -S` 形式；
- change proposal、approval decision、application record、revision chain、current decision head、effective dependency edge、同步固定点 stale propagation 与 recorded-catalog 否定边界都有版本化字段和稳定拒绝码；
- TEST_ONLY fixture 的源码期望是 2 个 structural positive、7 个 derived-state positive 与 42 个 negative case，其中 20 个是必需语义 mutant、22 个是补充 mutant；
- readiness 源码要求 B010/B011 blocker 精确存在，五项生产集成布尔值均为 false、`recordCount=0`，并把 production authority/history/catalog 与 TEST_ONLY self-test 分离；
- v3 ZIP 源码 allowlist 只允许 9 个 source files 加 `evidence/revision-state-readiness.json`，明确排除 self-test、TEST_ONLY、raw 和 telemetry；
- proposed policy 没有外部 authority 或 accepted algorithm，draft effective-state catalog 为 0-entry、`not_qualified`，并永久保留 `B011_QUALIFICATION_GRANT_OUT_OF_SCOPE`。

这些是源码结构、摘要和静态 case inventory 的证明，不是当前 revision 的 Gradle 执行证明。不得把“源码声明 2/7/42”写成“2/7/42 已执行通过”。

## 2. 精确 source inventory

| Source | SHA-256 |
| --- | --- |
| `qualification/schemas/v3/approval-decision.schema.json` | `25bc33155a5f132465df6445df94a8c765116104766482016d9b44cadec5a183` |
| `qualification/schemas/v3/change-application-record.schema.json` | `a0bbfdc64178a73f7ac3467901b2d47f30d2db287c135ed912cc318a1df96e2d` |
| `qualification/schemas/v3/change-control-policy.schema.json` | `8172dc8970845a3cc32debe08ad53b6775000dbd4dd7f93d36897ae7263c3e13` |
| `qualification/schemas/v3/change-proposal.schema.json` | `defa840092ffa3d872ef52bea7f27d922fc8f6f799b055ccc06d8d2405374f5a` |
| `qualification/schemas/v3/common.schema.json` | `d6fc0ec86600b7b07ac43d5443d575f1e268738eed4deaa1cc69521b4f0d4428` |
| `qualification/schemas/v3/effective-state-catalog.schema.json` | `15386b893a92a3c7a4ea197c97faf2792b21a9e0947f8e97911bb3555899f043` |
| `qualification/v3/README.md` | `f9e3ce445aeaff7a73f6094aceb0425c4a198bd49eeb177716a74b8348b2acbd` |
| `qualification/v3/change-control-policy-001.proposed.json` | `894c8f4d46c5b24bb6e71031813453ad7ba1ae0a445ba70580637eb1605a095e` |
| `qualification/v3/effective-state-catalog-001.draft.json` | `e2af44c579d7901d21ef7af35ed40baf97cc94a4e7df4c7572500848df369a2f` |

实现和入口摘要：

| Source | SHA-256 |
| --- | --- |
| `build.gradle.kts` | `2f9489e86a33b6d19c8accc4e23ed9bf8dcf462c20457308cdcb060547e392ff` |
| `scripts/verify-build-contract.sh` | `a944c8f31184b3edcd8c9cdba4bb78f2d50f55e4e4c0be4e7836316196124712` |
| `scripts/verify-negative-gates.sh` | `28e67e73a89668ccde607db284a072aba3144cf725508c072b5d04506e3d1ad2` |
| `scripts/verify-profile-negative-gates.sh` | `b3158c37ec24143dbb2701e7c54994adee5297c99e56113da7a9e9cdfcd18f52` |
| `scripts/verify-reproducible.sh` | `b847e375e1cfa13980b497371398d67f9616cffd88695188deb846ec575cab67` |

## 3. 结构与派生状态边界

v3 把原 v2 无法表达的 application authority/history 分开：proposal、第一项 approval、application、successor revision 与第二项 approval 都是不同的不可变节点。application 绑定当前 decision head；successor 和下游 result 绑定 application，而不是复用旧 approval 作为授权输入。第二项 decision 若在 apply cutoff 前已经撤销则拒绝 application；若在 apply 后才撤销，则 application 及其依赖者通过同步固定点传播转为 stale。

派生状态不是 catalog 中可自行声明的任意字符串。源码要求先确定 revision head，再计算每个 head 的 local state，然后在完整 dependency graph 上逐轮同步传播 stale，直到固定点不再变化。排序、去重、iteration count、input-set digest 和 result digest 都是确定性的。当前实现只把这套算法用于 TEST_ONLY self-test；production resolver、authority verifier、完整 schema runtime、history 与 recorded-catalog generator 均未接入。

## 4. 已执行与未执行的检查

期望：最终 commit 应在固定 Gradle/JDK 环境完成 contract/profile/repro/full gate，执行并核对 2 个 structural positive、7 个 derived-state positive、42 个 negative case，以及仅含 9 个 source files 与 readiness 的 10-file v3 ZIP；所有当前生成物摘要应来自该最终运行。

实际：本轮只完成下列不依赖最终 Gradle 执行的检查；Gradle contract/profile/repro/full 没有完成，因此没有当前生成物摘要，也没有 2/7/42 的执行结论。

已执行并通过：

- `bash scripts/verify-build-contract.sh`（final repository policy baseline）；
- `bash scripts/verify-negative-gates.sh`（74 个 repository-policy mutants）；
- 对 `scripts/verify-build-contract.sh`、`scripts/verify-negative-gates.sh`、`scripts/verify-profile-negative-gates.sh` 与 `scripts/verify-reproducible.sh` 分别执行 `bash -n`；
- `git diff --check`；
- clean `main`、commit/tree、无 remote/upstream/tag 与无产品目录的只读核对。

最终 Gradle contract/profile/repro/full gate 本轮未能重跑。sandbox 拒绝 Gradle FileLock socket，后续 escalation 又达到 usage limit；因此本证据不登记任何当前 ZIP、readiness、self-test、manifest、dependency graph、SBOM 或 properties 摘要，也不声称 2/7/42 case 已执行通过。

本地 ignored `build/` 仍来自前一个 40-case revision。它与当前 42-case 源码和修改后的脚本不一致，已经 stale，不可作为当前证据、不可进入 bundle、不可发布。

## 5. 默认拒绝与资格边界

当前源码要求生产字段保持：

```json
{
  "acceptedResolverIntegrated": false,
  "authorityVerifierIntegrated": false,
  "fullSchemaRuntimeIntegrated": false,
  "historyIntegrated": false,
  "recordCount": 0,
  "recordedCatalogGeneratorIntegrated": false
}
```

同时保留：

1. `INTAKE-B008_COMPATIBILITY_ALGORITHM_OPERANDS_MISSING`
2. `INTAKE-B010_CHANGE_PROTOCOL_NOT_PRODUCTION_PROVEN`
3. `INTAKE-B011_REVISION_STALENESS_NOT_PRODUCTION_PROVEN`

因此本轮不完成 `TASK-P0-003`，不解除 `TASK-P0-002 blocked`，不把 `GATE-001` 提升为 pass，不改变 `claim_status: not_proven`，也不改变四类 atomic Profile 和 `PROFILE_SET-001` 的 `draft`、`QUALIFICATION_SET-001` 的 `draft/not_qualified`。没有任何真实 source、owner、claim、approval、application、history、accepted Profile、accepted Profile Set、raw telemetry、外部 production authority 或 qualification grant。

## 6. 双仓与环境边界

实现仓库 `/Users/reln/aeron-cluster-matching-engine` 在 observation cutoff 上为 clean `main`，HEAD/tree 如顶部字段；remote、upstream 和 HEAD tag 均不存在。tracked tree 没有撮合、Aeron Cluster、Gateway、容器、部署或基础设施产品实现。

- 观察环境：macOS 26.0.1 (Build 25A362)、Darwin 25.0.0、arm64；CPU model 在当前 sandbox 中未能重新观察，且本证据不依赖 CPU 型号。
- Workload：不适用；本证据仅覆盖 source/build contract，不执行撮合、Cluster、HA 或性能 workload。
- Fault schedule：不适用；没有 Cluster fault injection。74 个 repository mutants 是门禁负例，不是运行时故障计划。
- Configuration：local-only clean commit；repository policy、shell syntax、canonical JSON 与 Git identity 检查；最终 Gradle/JDK/profile/repro/full configuration 未执行，旧 ignored `build/` 不作为输入或证据。

博客仓库只承载 canonical 项目记录与本 evidence artifact。博客的结构/build gate只能证明记录和站点可生成，不构成 v3 validator、Profile 或生产资格证据。本 artifact 没有外部下载 URI、签名、发布者身份、artifact retention 或可取回性保证。

## 7. 失效条件与下一步

以下任一变化会使本证据 stale：

- 实现 HEAD/tree、9-file v3 inventory、任一 source/build/script digest、case inventory 或拒绝码变化；
- policy/catalog 状态、B010/B011 blocker、五项生产集成布尔字段或 `recordCount`、history、dependency/stale 算法或 bundle allowlist 变化；
- 最终 Gradle/profile/repro/full gate 在可运行环境产生新的可审计结果；
- 任一外部 authority、真实 source/owner/claim/approval/application/history/Profile/Profile Set、recorded catalog、qualification、remote 或 artifact authority 被建立、修改或撤销；
- JDK、Gradle、依赖、操作系统、硬件、缓存或 sandbox 语义变化。

下一步先在允许 Gradle FileLock socket 的隔离环境重跑完整 contract/profile/repro/full gate，核对 2/7/42 与 exact 10-file v3 ZIP，并登记新生成物摘要或具体失败。随后在 B008 下建立受审兼容公式/operand registry，在 B010/B011 下接入仓库外 approval/application authority、完整 production history 和 recorded-catalog generator；只有这些边界与真实 Profile 输入全部闭合后，才可评审四类 atomic Profile 与 `PROFILE_SET-001` 的 accepted candidate。
