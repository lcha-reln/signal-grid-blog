# EVD-0014：当前 revision 构建合同完整本地验证

- 证据 ID：`EVD-0014`
- 证明对象：`TASK-P0-002`、`TASK-P0-003`、`ADR-0001`、`ADR-0002`、`REQ-QUAL-007`、`REQ-QUAL-008`、`REQ-SEC-005`、`WORKLOAD_PROFILE-001`、`HARDWARE_PROFILE-001`、`DURABILITY_PROFILE-001`、`FAILURE_PROFILE-001`、`PROFILE_SET-001`、`QUALIFICATION_SET-001`、`OQ-011`、`OQ-012`、`RISK-013`、`RISK-014`、`RISK-016`、`RISK-017`
- 关联控制：`GATE-001`；只证明当前 local-only revision 的 build/profile/revision-state 合同、默认拒绝门禁与字节复现，不闭合 B008、B010、B011、任何业务不变量、运行时 Gate、Profile 接受、远端供应链或生产资格 Gate
- Observation cutoff：2026-08-21T10:40:43+08:00
- 实现对象：local-only repository commit `e4482a4ddd445cc5065af1ea9f2cac993ce80121`，tree `13f4e29a5e2a748da16bf42cbc2945baa5be47e9`
- Artifact URI：`none`
- Verdict：`partial`

## 1. 结论

在固定 Eclipse Temurin `25.0.4+7-LTS` HotSpot 与 Gradle `9.7.0` 环境中，最终一次独立执行 `bash scripts/verify-all.sh` 以 exit code 0 完成。该单次执行覆盖 online/offline build contract、repository/Profile/v2/authority/v3 负向门禁、dependency tamper 与跨路径/缓存/解包字节复现；最终生成物与 `build/reports/reproducibility.txt` 的 13 项 SHA-256 逐项一致。

此前两次完整运行在 Maven 制品传输阶段遇到瞬时 TLS 失败并返回非零；失败尝试没有被拼接、跳过或登记为通过证据。网络恢复后，最后一次 `bash scripts/verify-all.sh` 从入口到结束独立返回 0，只有这次完整成功运行与其最终输出用于本证据。

这证明的是当前 revision 的本地构建与 qualification 合同边界，不是生产资格。使用的 Temurin 版本安全基线已经过期，只允许作历史复现输入；本地 ignored `build/` 没有外部 Artifact URI、签名、持久 retention 或独立 authority。

## 2. 命令、环境与判定合同

- Command：在 `/Users/reln/aeron-cluster-matching-engine` 执行：

  ```bash
  JAVA_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/temurin-extracted/jdk-25.0.4+7/Contents/Home \
  PATH=/private/tmp/aeron-build-bootstrap.kS9PFU/temurin-extracted/jdk-25.0.4+7/Contents/Home/bin:$PATH \
  bash scripts/verify-all.sh
  ```

- Runtime：Eclipse Temurin `25.0.4+7-LTS` HotSpot；Gradle `9.7.0`，revision `3defbfc59d757b873d787b2261de5c7f8a00970a`。
- Host：macOS `26.0.1`（Build `25A362`）、Darwin `25.0.0`、`arm64`；CPU 型号没有在本轮记录回填 sandbox 中重新观察，本证据也不承担硬件性能结论。
- Repository：clean `main`，HEAD/tree 如顶部字段；无 remote、upstream 或 HEAD tag；tracked tree 没有撮合、Cluster、Gateway、容器或部署产品源码。
- Configuration：Gradle `--no-daemon`、strict dependency verification、clean online 与 offline build-contract 路径；复现脚本使用独立 checkout/cache、offline rebuild 与 unpacked ZIP round-trip。具体执行顺序以 commit 中的 `scripts/verify-all.sh` 为准。
- Workload：构建、schema/validator、default-deny 与 reproducibility workload；未执行订单撮合、Aeron Cluster、HA、容量、延迟、耐久性或 DR workload。
- Fault schedule：74 个 repository-policy mutants、42 个 v1 Profile mutants、58 个 v2 intake mutants、20 个 authority mutants、42 个 v3 revision-state negative cases及 dependency-artifact tamper；这些是合同门禁负例，不是 Cluster fault injection。

Expected：单次完整命令返回 0；v3 self-test 精确为 2 个 structural positive、7 个 derived-state positive、42 个 negative case；主/v2/v3 ZIP 精确为 81/20/10 个 file entries；v3 ZIP 只含 9 个 source files 与 1 个 readiness；跨路径、缓存、online/offline 和解包 rebuild 的 13 项输出逐字节一致；所有生产 readiness 继续默认拒绝。

Actual：最终一次完整命令返回 0；上述 case 数、ZIP file-entry 数、v3 inventory、13 项输出摘要与默认拒绝字段全部匹配。此前两次瞬时 Maven TLS 失败只作为运行背景保留，不计入成功结果。

### 2.1 当前 revision 的构建入口字节

| Tracked build entrypoint | SHA-256 |
| --- | --- |
| `build.gradle.kts` | `2f9489e86a33b6d19c8accc4e23ed9bf8dcf462c20457308cdcb060547e392ff` |
| `scripts/verify-all.sh` | `6941dacea0ddf40aa8147ccdcf7e4d6df0d5def63fc31cb052abead025a8a425` |
| `scripts/verify-build-contract.sh` | `a944c8f31184b3edcd8c9cdba4bb78f2d50f55e4e4c0be4e7836316196124712` |
| `scripts/verify-negative-gates.sh` | `28e67e73a89668ccde607db284a072aba3144cf725508c072b5d04506e3d1ad2` |
| `scripts/verify-profile-negative-gates.sh` | `b3158c37ec24143dbb2701e7c54994adee5297c99e56113da7a9e9cdfcd18f52` |
| `scripts/verify-authority-negative-gates.sh` | `eb73ad72cd03e58cc742be25ea06c0ac0e59e79693ba49f263e740abfe4e910c` |
| `scripts/verify-dependency-tamper.sh` | `4510f1eb2d66e5f03dc4833df9cb85a2572019aa9aa3db6a1af08feb64f7714d` |
| `scripts/verify-reproducible.sh` | `b847e375e1cfa13980b497371398d67f9616cffd88695188deb846ec575cab67` |

这些摘要绑定实际执行入口，但不把 shell/Gradle 的 repo-local 自检根提升为仓库外 authority。

## 3. 已执行门禁

| 门禁 | Actual |
| --- | --- |
| Repository policy | baseline 通过；74/74 mutants 被拒绝 |
| Legacy v1 Profile | 42/42 mutants 被拒绝 |
| v2 intake/lifecycle | 58/58 mutants 被拒绝 |
| Remote authority | 20/20 mutants 被拒绝；authority 仍未建立 |
| v3 revision state | 2 structural positive、7 derived-state positive 通过；42/42 negative cases 被预期拒绝；状态为 `passed_TEST_ONLY` |
| Dependency integrity | dependency-artifact tamper 被拒绝；strict verification 保持开启 |
| Reproducibility | online/offline、独立路径/缓存与 unpacked rebuild 完成，13 项摘要一致 |

正向和负向 case 数只在其各自 build-contract/TEST_ONLY 范围内成立。它们不包含真实 source、真实 approval/application、production history、Aeron Cluster 节点故障、容量或持久性实验。

v1 的 42 个负例和 remote-authority 的 20 个负例是最终 full console/task 事实，分别由受固定摘要保护的 task 与源码 case inventory 约束；它们没有独立 self-test JSON。v2 的 58 个负例与 v3 的 2/7/42 则另有上表所列、纳入复现摘要的 self-test JSON。不得把 console/task 事实误写成某个不存在的输出字段。

## 4. 13 项最终输出摘要

| Local generated output | SHA-256 |
| --- | --- |
| `build/distributions/aeron-cluster-matching-engine-build-contract.zip` | `28b0aa1e50c00b1e26a3577d9b7477fdde077b507196d2df4c28e2a097ada712` |
| `build/distributions/qualification-v2-input-contract.zip` | `2131a971b672258478f0b24a13b5a687a98e7f9bf309266d91c68b035f38a7e1` |
| `build/distributions/qualification-v3-revision-state-contract.zip` | `6d929a7608b7e7987bc5ff8ee095dd56cc97faae688e6d437d8e613377fd1159` |
| `build/contract/resolved-artifact-manifest.json` | `be6dc201247c147cbe57145f5fcbcf0ced53895850bce7967ddce7c54bbfba52` |
| `build/contract/dependency-graph.txt` | `6c324872cedb4c9890ea0237653e28228c3c9fe09bdef69dc8d6949424363c1c` |
| `build/contract/cyclonedx-sbom.json` | `fd7ad5ac29b7170ae56bcf8b7ecf845dcb9968b5fe1552e86631a7d3b84fbfd6` |
| `build/contract/build-contract.properties` | `499b3b76118eb2040b8ab092de514f295249107ba81a874542e2a2c0379c2589` |
| `build/contract/profile-readiness.json` | `2cb205d2f8f13563ef6f97ff688d860a0b9ff70277463fecf021a1dbc6796493` |
| `build/contract/profile-readiness-v2.json` | `98657ab671215d1e572c1e46b8e4fd2e3613801d3b4eec63617678087db653ae` |
| `build/contract/qualification-v2-selftest.json` | `1a3ee090c457b543aa9ab0feafe85f51c8d94ed590da0e1cea46a9e765183704` |
| `build/contract/revision-state-readiness.json` | `b6ac26f894e9469aebb8d4a6e39310049721bbf51312ddd1a90b10a32f0bd84d` |
| `build/contract/revision-state-selftest.json` | `61a9b42dc9297e7e882558ae1598e44db878695b9cdccc34a5a5c349e0c4e8ab` |
| `build/contract/remote-authority-readiness.json` | `1766dbd9aad124fc9cd01030456bfa1cb1f4611a19ea4455a2d6f766cf53f812` |

主、v2、v3 ZIP 分别包含 81、20、10 个普通 file entries。目录项不计入这些数字。

`build/reports/reproducibility.txt` 的 SHA-256 为 `d1b8a4a282f5445f33090a812b26a5a0d6e4838f712ad46672a2a7c30df4f0ac`；文件中的 13 行与上表顺序、路径和摘要逐字一致。三个 ZIP 的排序后普通文件清单分别为：

| ZIP | Files / directories | Sorted file-list SHA-256 |
| --- | ---: | --- |
| main build contract | 81 / 18 | `f7f441107f53de926abb072bf7080cab257a112ba8e98bc6f20c5aee0a73317d` |
| v2 input contract | 20 / 7 | `58a1f3414723003d47c1f26776ab88f0e690c19807de9347a1c0f8152d879206` |
| v3 revision-state contract | 10 / 5 | `72b3cafa80be98053795cd98a0a717ce743fa4e5e2c66252438725c49051fe72` |

三个 ZIP 均通过完整性检查；普通文件路径无重复、无 symlink、无禁入项，且分别与当前源码/生成证据完成 81/81、20/20、10/10 字节比对。manifest 为 3 个 configuration、9 行 resolved artifact、8 个唯一 artifact；CycloneDX 1.6 SBOM 为 8 个 component、9 个 dependency node；build-contract properties 为 32 个精确且唯一的行；dependency graph 为 13 条 edge。

## 5. v3 ZIP 精确 10-file inventory

1. `qualification/schemas/v3/approval-decision.schema.json`
2. `qualification/schemas/v3/change-application-record.schema.json`
3. `qualification/schemas/v3/change-control-policy.schema.json`
4. `qualification/schemas/v3/change-proposal.schema.json`
5. `qualification/schemas/v3/common.schema.json`
6. `qualification/schemas/v3/effective-state-catalog.schema.json`
7. `qualification/v3/README.md`
8. `qualification/v3/change-control-policy-001.proposed.json`
9. `qualification/v3/effective-state-catalog-001.draft.json`
10. `evidence/revision-state-readiness.json`

ZIP 不含 `revision-state-selftest.json`、`TEST_ONLY` fixture、raw source artifacts、raw telemetry 或生产凭据。v3 source contract set 自身为 9 files，readiness 记录的 set SHA-256 为 `9400efdb3233a06ec4729e82e34f7c5cb3ccd9bdc7107a187c6ff949076138e7`。

## 6. 默认拒绝与资格边界

`profile-readiness-v2.json` 继续保留 B001–B008、B010、B011，其中本轮关键未闭合项是：

1. `INTAKE-B008_COMPATIBILITY_ALGORITHM_OPERANDS_MISSING`
2. `INTAKE-B010_CHANGE_PROTOCOL_NOT_PRODUCTION_PROVEN`
3. `INTAKE-B011_REVISION_STALENESS_NOT_PRODUCTION_PROVEN`

v3 production readiness 的五项布尔字段和记录计数为：

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

同一 readiness 明确记录 `deployable=false`、`verified=false`、`syntheticEvidencePromoted=false`、`qualification=not_proven`。因此本证据不完成 `TASK-P0-002` 或 `TASK-P0-003`，不接受 `ADR-0001/0002` 或任何 Profile/Profile Set，不把 `GATE-001` 提升为 pass，也不改变 `claim_status: not_proven`、`qualification_profile: none` 和 `QUALIFICATION_SET-001 draft/not_qualified`。

## 7. Artifact authority 与适用性

所有 13 项输出均是当前实现 commit 的本地 ignored build observations；`Artifact URI` 为 `none`。没有上传、签名、发布者身份、外部 retention、refetch、备份恢复、remote branch protection 或 Hosted CI observation。本地摘要可用于检验同一源码树的构建合同和后续漂移，但不能充当 production artifact authority。

首次两次 Maven TLS 失败也说明本地在线依赖路径受外部网络状态影响；最终完整成功运行证明该次输入和缓存组合可复现，不证明 Maven 服务、网络或供应链长期可用。

## 8. 失效条件与下一步

以下任一变化会使本证据 stale：

- 实现 HEAD/tree、JDK/Gradle、依赖锁/verification metadata、JCS 输入、任一 validator/script 或构建配置变化；
- 13 项输出中任一 SHA-256、主/v2/v3 ZIP file-entry 数、v3 10-file inventory、2/7/42 或 74/42/58/20 case inventory 变化；
- B008/B010/B011、五项 production integration 布尔字段、`recordCount`、`deployable/verified/syntheticEvidencePromoted/qualification`、policy/catalog/history/stale 算法变化；
- 任一真实 authority/source/owner/claim/approval/application/Profile/Profile Set/qualification、remote、Hosted CI、Artifact URI、签名或 retention 被建立、修改或撤销；
- 操作系统、硬件、缓存、网络、sandbox 或 Maven/Gradle 分发语义变化，且新结果被用于替代本 observation。

下一步不再是重复证明 TEST_ONLY/build-contract case 数，而是在 B008 下建立受审兼容公式与 operand registry，在 B010/B011 下接入仓库外 approval/application authority、真实 production history 和 recorded-catalog generator。随后才能从权威输入创建四类 atomic Profile 与 `PROFILE_SET-001` 的 revision 2+ accepted candidate；`QUALIFICATION_SET-001` 仍留到 `TASK-P9-001`。
