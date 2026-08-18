# EVD-0008：Remote authority readiness 历史构建合同

- 证据 ID：`EVD-0008`
- 证明对象：`TASK-P0-002`、`ADR-0001`、`ADR-0002`、`RISK-013`、`RISK-014`
- 关联控制：`REQ-QUAL-002`、`REQ-OPS-006`、`GATE-001`；不闭合任何业务 `INV` 或 Gate
- Observation cutoff：2026-08-19T01:27:53+08:00
- 实现对象：local-only repository commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`
- Verdict：`stale`

## 0. 失效记录

本 artifact 的观察对象固定为实现 commit `ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`。2026-08-19，项目在新 commit 中加入 qualification Profile/schema/Set、validator、门禁与 bundle 内容，命中了本证据声明的 HEAD、policy、脚本和 bundle 失效条件。因此本证据当前 verdict 为 `stale`，以下结果只保留为旧 revision 的不可变历史观察；后继 revision 曾由 `EVD-0010`（现为 `stale`）承接，当前 revision 由 `EVD-0011 partial` 承接。

## 1. Verdict 的准确边界

本证据曾证明上述旧 revision 的 `deployable=false` 构建合同和 proposed remote-authority readiness 合同能够在固定的历史复现运行时上通过本地 fail-closed 门禁。该 revision 的 `RAP-0001` 状态词是 remote/artifact authority=`not_established`、Hosted CI=`not_observed`；readiness 对应的 `remoteAuthorityEstablished`、`hostedCiObserved`、`artifactAuthorityEstablished` 三个布尔值均为 `false`，qualification 为 `not_proven`。

本证据从未证明远端 enforcement、provider-hosted CI、branch/ruleset 保护、许可证、持久 artifact authority、备份恢复、完整 observation validator、当前安全生产 JDK，或任何撮合、Aeron Cluster、Gateway、性能和生产资格。它也不能证明当前实现 revision；`ADR-0001/0002` 从未因此被接受。

## 2. 双仓与环境观察

实现仓库：

- 逻辑 ID：`aeron-cluster-matching-engine`；
- 绝对路径：`/Users/reln/aeron-cluster-matching-engine`；
- 分支：`main`；
- HEAD：`ad461b3bd0cfdeddedac2fa93a37c5cba1c203ea`；tree：`f1601e96ba8a227c4b5064552eb721131d3306f5`；
- `git status --porcelain`：无输出，工作树 clean；
- remote、upstream 与 tag：均不存在；
- 产品源码：不存在；tracked tree 没有 `src/`、`services/`、`apps/`、`deploy/`、`docker/`、`k8s/`、`helm/` 或 `infra/` 产品目录；
- 本轮新增的是本地治理候选、readiness 输出、policy validator 和负向门禁，不是可部署系统。

博客仓库在本轮编辑前：

- 路径：`/Users/reln/signal-grid-blog`；分支：`main`；
- HEAD：`f7676184c702b72ae4fa4293dbc83642c869943f`，工作树 clean；
- 该 SHA 是本轮 `reconciliation_base_git_sha`，不是实现仓库 SHA，也不是尚未产生的记录回填 commit。

观察环境与适用性：

- OS：macOS 26.0.1，Build `25A362`；Darwin 25.0.0；arm64；Apple M2；
- Runtime：Eclipse Temurin 25.0.4+7-LTS HotSpot，仅用于历史字节复现，安全基线已经过期；
- Gradle：Wrapper 9.7.0；
- Workload：不适用——本轮只有 build-contract 和治理合同，没有订单流量；
- Fault schedule：不适用——39 个 repository mutants、20 个 authority semantic mutants 与一次 dependency artifact tamper 属门禁负例，不是 Cluster/HA 故障实验；
- Configuration：精确 `JAVA_HOME`、Gradle Wrapper、隔离的 Gradle Home、online 预热后 offline 重建；
- Artifact URI：`none`。输出位于本地 ignored `build/`，没有持久 artifact authority。

## 3. 验收入口与结果

### 期望

被观察的旧 revision 当时必须在精确历史复现 runtime 上通过 build-contract；全部 repository/authority 负例必须由各自稳定错误码拒绝；online、offline、不同路径/缓存与解包重建必须得到相同规范化输出；bundle 不得夹带未声明 evidence；`RAP-0001` 状态必须保持 remote/artifact authority=`not_established`、Hosted CI=`not_observed`，readiness 对应三个布尔值必须均为 `false`，qualification 必须为 `not_proven`。

### 实际

最终入口：

```bash
env \
  JAVA_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/temurin-extracted/jdk-25.0.4+7/Contents/Home \
  GRADLE_USER_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/wrapper-home \
  ./scripts/verify-all.sh
```

观察到 exit code `0`，并且：

- online 与 offline `buildContractCheck` 均通过；
- 39 个 repository-policy mutants 均由其预期的稳定错误码拒绝；
- 20 个 remote-authority semantic mutants 均由其预期的 `AUTH-Pxxx` 错误码拒绝；
- dependency artifact tamper gate 通过；
- 两个不同绝对 checkout 路径、两套独立 Gradle Home，以及解包 ZIP 后的离线重建均得到逐字节一致的规范化输出；
- ZIP 的 `evidence/` 子树严格只有五个文件：`build-contract.properties`、`cyclonedx-sbom.json`、`dependency-graph.txt`、`remote-authority-readiness.json`、`resolved-artifact-manifest.json`；
- filesystem allowlist 会看见 Git ignore/exclude 隐藏的输入；`buildSrc`、未知 Gradle 入口、额外 repository/workflow、symlink、binary secret、properties 重复键和关键摘要漂移都会 fail closed；
- policy/schema、Workflow、CODEOWNERS、Dependabot 和验证脚本都进入当前精确输入合同。

## 4. Remote authority 的机器可读真相

`RAP-0001` 当前只是 proposed policy：

```text
policyStatus=proposed
remoteAuthorityEstablished=false
hostedCiObserved=false
artifactAuthorityEstablished=false
authorityQualification=not_proven
deployable=false
```

补充边界：

- `visibilityCandidate=private` 是候选，不是已观察到的 private remote；
- `remoteUri`、owner、license、artifact authority URI 和 backup authority URI 仍未建立；
- candidate Workflow/CODEOWNERS/Dependabot 的摘要只证明候选字节，不证明 provider 执行或 enforcement；
- 缺少外部 observation 时，qualification 入口以 `AUTHORITY-E900` 拒绝；
- 即使提供普通 regular file，当前 proposed-only 路径仍以 `AUTHORITY-E902` 拒绝；它尚未解析 observation 内容；
- 当前 HEAD 不存在可到达的 `AUTHORITY-E903` qualification 分支，不得声称已经验证 accepted policy 或 observation cross-field；
- 两个 Draft 2020-12 schema 是固定摘要的合同制品；当前没有执行通用 JSON Schema 引擎，实际执行的是更窄的 canonical JSON + exact proposed-policy Kotlin validator。

## 5. 规范化输出摘要

| Artifact | SHA-256 |
| --- | --- |
| `aeron-cluster-matching-engine-build-contract.zip` | `12707bef7348ccb8e5c8fec972d55df9038a5afcbb23d006dc66e3f5bb751f1f` |
| `resolved-artifact-manifest.json` | `8043e45adbcda0f75c7082a5cb0b1280dcbbc3ba1e80667e4a8ac120ebc47a71` |
| `dependency-graph.txt` | `ba0211e62e416bf6445c5c44ec9c194a933ffa844425ddba7072a7c7e50d428d` |
| `cyclonedx-sbom.json` | `8a1f7c496d7f306a8d40b1b0d4434efd7dd64d2b434f5db91053c07689caa2f8` |
| `build-contract.properties` | `33e2cb9af7435d8a68047e6a4f70763f1691e707cd26085d6e266e0b6f9686cf` |
| `remote-authority-readiness.json` | `1766dbd9aad124fc9cd01030456bfa1cb1f4611a19ea4455a2d6f766cf53f812` |
| `RAP-0001 remote-authority-policy.json` | `61d67c86c9417d660e23c3b12cf3dbd48337d875cc6f9185231d873c76532f67` |

这些摘要只证明旧 revision 当时的本地规范化输出内容，不证明当前 revision、publisher identity、外部可取回性、不可变留存、漏洞/许可证合规或生产部署资格。

## 6. 信任边界与失效条件

本地仓库中的 policy、validator、Workflow 和 negative gates 仍处于同一个未受远端 ruleset 保护的信任域。它们能让本地候选合同 fail closed，却不能自己创造独立 trust root。完整资格仍需要 provider API observation、真实 `pull_request`/`push` Hosted CI run、外部 artifact 下载复核、独立仓库/制品恢复和 accepted policy。

以下任一变化会使本证据 `stale`：

- 实现 HEAD、policy/schema、Workflow、CODEOWNERS、Dependabot、Gradle/JDK baseline、锁、verification metadata、artifact ledger、验证脚本或 bundle 内容变化；
- remote URI、visibility、owner/principal、ruleset、required check 或 provider 状态变化；
- Hosted CI、artifact authority、retention、backup/restore 或外部 observation 被建立、修改、过期或撤销；
- Aeron/SBE/Agrona/Gradle/JDK 版本或运行环境变化；
- 发现本地输出不可复现、含未登记输入，或 readiness 的否定字段被错误提升。

下一步必须由用户确认 owner、访问模型、license 和 principals 并授权建立 remote；随后由外部只读审计采集 provider/CI/artifact/restore observation。安全有效的 JDK 选择还必须单独由 `ADR-0001` 决定并重跑完整门禁。
