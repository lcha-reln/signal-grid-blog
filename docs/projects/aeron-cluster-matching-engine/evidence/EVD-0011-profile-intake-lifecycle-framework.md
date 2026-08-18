# EVD-0011：Profile intake 与 lifecycle 默认拒绝框架

- 证据 ID：`EVD-0011`
- 证明对象：`TASK-P0-002`、`TASK-P0-003`、`ADR-0001`、`ADR-0002`、`REQ-QUAL-007`、`REQ-QUAL-008`、`REQ-SEC-005`、`WORKLOAD_PROFILE-001`、`HARDWARE_PROFILE-001`、`DURABILITY_PROFILE-001`、`FAILURE_PROFILE-001`、`PROFILE_SET-001`、`QUALIFICATION_SET-001`、`OQ-011`、`OQ-012`、`RISK-013`、`RISK-014`、`RISK-016`、`RISK-017`
- 关联控制：`GATE-001`；不闭合任何业务不变量、运行时 Gate 或生产资格 Gate
- Observation cutoff：2026-08-19T05:47:31+08:00
- 实现对象：local-only repository commit `6c1bdfc856de0681211cbd134a97cabcae13c7f5`，tree `76f4b7a4c316cfb9ecf23cdfdb5c56193b0108db`
- Verdict：`partial`

## 1. 期望与实际

### 期望

本 revision 只允许交付一个默认拒绝的采集、审批、修订与 Profile lifecycle 框架：

- 19 个 v2 合同文件必须使用固定字节和精确摘要，其中 18 个 JSON 必须 canonical 且其对象封闭；现有 14 个 legacy v1 draft 文件保持不可变 predecessor，不得原地升级；
- 生产 policy 必须保持 `proposed`，catalog 必须保持 0-entry `draft`；仓库中不得出现真实 SOURCE、owner assignment、claim、derivation、approval、change、accepted Profile、accepted Profile Set、原始 telemetry、客户数据或凭据；
- source receipt、exact datum claim、derivation、maker-checker、revision/change/stale、Profile Set 绑定和 Qualification 否定边界必须有可执行的结构门禁；
- 仓库文本、自报 URI/SHA、TEST_ONLY fixture、schema-valid document 或本地 policy 不能成为 production authority；缺少外部 verifier、受审 canonicalizer 或兼容算法时必须 fail closed；
- `QUALIFICATION_SET-001` 必须继续保持 `draft/not_qualified`，不得从孤立 approval、Profile Set、readiness 或测试 fixture 推导 `qualified`；
- 主 build-contract ZIP 与 v2 input-contract ZIP 必须由验证后的精确 allowlist 组装，不能包含 TEST_ONLY、raw telemetry、symlink、路径逃逸或未声明条目；
- online/offline、不同绝对路径、不同 Gradle Home 与解包重建必须得到逐字节一致的十项输出。

### 实际

停止所有对共享 `build/` 的并发写入后，在下述冻结环境从头串行执行完整入口，exit code 为 `0`：

```bash
env \
  JAVA_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/temurin-extracted/jdk-25.0.4+7/Contents/Home \
  GRADLE_USER_HOME=/Users/reln/.gradle \
  bash scripts/verify-all.sh
```

观察到：

- `buildContractCheck` 的 22 个任务通过；依赖解析使用 strict verification；
- 61 个 repository-policy mutants、42 个 legacy Profile mutants、58 个 v2 intake/lifecycle mutants、20 个 remote-authority mutants 与 dependency artifact tamper 全部按预期拒绝或通过；
- v2 TEST_ONLY harness 只得到 1 个 structural positive：4 个 Profile、160 个 datum、160 个 claim、1 个 derivation；`acceptedPositive=0`、`profileSetAccepted=false`、`compatibilityReportGenerated=false`、`rfc8785Claimed=false`、`productionAcceptedPathProven=false`；
- change protocol 只有 1 个 structural positive 与 8 个负例；它不是 production revision/stale closure 的证明；
- `assertProfileSetAccepted` 稳定以 `PROFILESET-E901` 拒绝，`assertQualificationSetQualified` 稳定以 `PROFILESET-E900` 拒绝，缺少 production authority verifier 时稳定以 `INTAKE-P084` 拒绝；
- 定向对抗复核确认 second bootstrap、默认端口 URI identity alias、未知 source kind、Failure scenario 全叶子 `not_applicable/null`、伪 v1 predecessor 分别由 `INTAKE-P086/P017/P020/P061/P085` 拒绝；
- 伪造 readiness 为 accepted/qualified，或向 ZIP 注入 TEST_ONLY/telemetry 后，正常 producer 会重建否定状态和精确清单；伪造内容不会进入最终 artifact；
- online/offline、两个绝对 checkout、两个 Gradle Home 和解包后离线重建的十项输出逐字节一致；独立临时副本终审未发现本轮“框架/未资格化”交付的剩余 P0/P1/P2；
- 博客记录在 Node 24.19.0 / pnpm 10.30.3 下通过 full verifier：143 definitions、9 tasks、10 gates，Astro 25 files 为 0 diagnostics，构建 76 pages，Pagefind 索引 65 pages；本轮没有公开 Astro 内容变更，不把该站点构建结果扩张为 Profile 或生产资格证据；
- 完整 gate 期间曾有一次并发共享 `clean` 造成的中间快照竞争；该次结果已全部丢弃，不计入本证据。最终结果来自停止并发写入后重新开始的单一串行运行。

## 2. 双仓与观察环境

实现仓库：

- 逻辑 ID：`aeron-cluster-matching-engine`；路径：`/Users/reln/aeron-cluster-matching-engine`；
- 分支：`main`；HEAD：`6c1bdfc856de0681211cbd134a97cabcae13c7f5`；tree：`76f4b7a4c316cfb9ecf23cdfdb5c56193b0108db`；
- `git status --porcelain=v2` 无输出；remote、upstream 与 tag 均不存在；
- tracked tree 没有 `src/`、`services/`、`apps/`、`deploy/`、`docker/`、`k8s/`、`helm/` 或 `infra/` 产品目录；
- 本 commit 只增加 qualification intake/lifecycle 合同、validator、readiness、bundle 与负向门禁，不包含撮合、Aeron Cluster、Gateway、镜像或部署实现。

博客仓库在本轮编辑前：

- 路径：`/Users/reln/signal-grid-blog`；分支：`main`；
- HEAD：`3d26f9be195637f57ade061d6de02f0e5323e819`；本轮授权差异只应为 `PROJECT_RECORD.md`、`EVD-0008` 后继说明、`EVD-0010` stale 回填和本 artifact；
- 该 SHA 是博客 reconciliation base，不是实现仓库 SHA，也不是尚未创建的博客记录 commit。

观察环境与适用性：

- OS：macOS 26.0.1，Build `25A362`；Darwin 25；arm64；Apple M2；
- Runtime：Eclipse Temurin 25.0.4+7-LTS HotSpot，只用于历史字节复现；其生产安全基线已经过期；
- Gradle：Wrapper 9.7.0；
- Workload：不适用——本轮没有订单流量、撮合进程或容量实验；
- Fault schedule：不适用——61+42+58+20 个 mutants、dependency tamper 与伪 artifact 注入是合同门禁负例，不是 Aeron Cluster/HA 故障实验；
- Configuration：精确 `JAVA_HOME`、受保护 Wrapper/locks/verification metadata、两个绝对 checkout、两个独立 Gradle Home、online 预热后 offline 与 unpacked rebuild；
- Artifact URI：`none`。所有输出位于本地 ignored `build/`，没有持久 artifact authority、下载 URI、签名或 retention 保证。

## 3. v2 合同固定输入

19 个 v2 合同文件中只有 proposed policy 与空 draft catalog 是实例；其余为 README 或 schema。所有 JSON 均为 canonical bytes：

| 文件 | SHA-256 |
| --- | --- |
| `qualification/v2/README.md` | `c1dfe49d9dc6697c362f76279af3e76a5e5da54462e28570c3c3b06e6132916a` |
| `qualification/schemas/v2/approval-record.schema.json` | `994dbd2334653ce12d8f3d01a6394a4a59bfd839875fee4de32dd588ff996744` |
| `qualification/schemas/v2/change-request.schema.json` | `d0142eaeace5f12c3d16e88d85148836105172ad0fe88571c01602161a74a2dd` |
| `qualification/schemas/v2/claim-submission.schema.json` | `7590248bdb8d71a8feee9a48ae52e6d2bc9d8a6715a21f4c9f7400a7f9dd0048` |
| `qualification/schemas/v2/common.schema.json` | `f7d62228a2445757ab8baf2522d64a055055be5ee401e0729623889b63796d13` |
| `qualification/schemas/v2/derivation-record.schema.json` | `0536e89c51ec92eab5ddd41ae0bfcf8428648241bfa41162e5491fadd1ec415c` |
| `qualification/schemas/v2/durability-profile.schema.json` | `a9545acec386f14e17845bb8b3fb23d43169d71014ce706ee53e6f5391984886` |
| `qualification/schemas/v2/failure-profile.schema.json` | `77105ca115233d2a7c4f036ce0a92b6c1171bcf1d66e0abdd0e8241dc2506750` |
| `qualification/schemas/v2/hardware-profile.schema.json` | `edfd292c7a8ec77822c3844977c674bc22552c99e601a0e57101598095bf17ab` |
| `qualification/schemas/v2/input-governance-policy.schema.json` | `ba065b1f7c8a702f3966c237fca85025c3a978ce580b03a044d5cc150f5666bc` |
| `qualification/schemas/v2/intake-catalog.schema.json` | `ed7fdc71119ff8abaf0deb6d9122aedf108af7c7799794a019caf4ebeaf770fa` |
| `qualification/schemas/v2/owner-assignment.schema.json` | `a32ef1bcd5c6a00f4079eb9f5a309ba66d4c5de9f8dca92d6a4a55c1f2cb3f87` |
| `qualification/schemas/v2/profile-compatibility-report.schema.json` | `41ac1152c0888e9310ffd774d5448746955a8ae62066ff4c031d81dc5e6b7769` |
| `qualification/schemas/v2/profile-set.schema.json` | `9dabacd4528ee487b621efb9dac4c5f1ca8f49d2988574119cb80e2e25bfa263` |
| `qualification/schemas/v2/qualification-set-draft.schema.json` | `0661ceb61f8c6b8b7498748fc4360ce8fa51b1287a1a8c5ed88eb6bbdb90390d` |
| `qualification/schemas/v2/source-receipt.schema.json` | `0b32cc8b4bb59575faee6f206e046d675497cc278802aed02ec8886d5b2e9a28` |
| `qualification/schemas/v2/workload-profile.schema.json` | `5f901c4169033652078d60869b5439d2985fdf55ef342af88bddea9d07a82da7` |
| `qualification/policies/input-governance-policy-001.proposed.json` | `a02ff4b7474437a2b991534f79ff5aae2e1473b45efc56aeec58f2fcc967381e` |
| `qualification/intake/intake-catalog-001.draft.json` | `78423adbb7bf5353a8fdd9db3189d91498ff9d4c2d06095f0a04f8099e055811` |

这套合同定义 source receipt、外部 availability evidence、derivation parameters/window、exact datum claim、owner assignment、maker-checker approval、change result subject、revision predecessor、transitive stale、catalog 与安全 bundle 投影，以及四类 Profile 和 Profile Set 的后续 accepted 路径。它没有放宽固定 production project ID，也没有把 TEST_ONLY namespace 写进生产 schema。

JSON Schema 在本轮只证明本地 shape；当前 Kotlin validator 是受摘要保护的跨文档语义子集，不是通用 Draft 2020-12 runtime，也不是完整 production acceptance verifier。所有未实现义务都必须由 readiness blocker 保持显式可见。

## 4. 当前生产图与资格边界

机器可读当前状态为：

- `INPUT_GOVERNANCE_POLICY-001`：`proposed`；principals、role bindings、identity authority、bootstrap trust 与 accepted evidence 均未配置；
- `intake-catalog-001`：`draft`、0 entries；
- real SOURCE/OWNER/DERIVATION/CLAIM/APPROVAL/CHANGE：0；
- accepted/verified atomic Profile：0；accepted Profile Set：0；
- `QUALIFICATION_SET-001`：legacy negative boundary，`claimed=false`、`not_qualified`；
- external authority verifier：不存在；production compatibility report：未生成；
- `deployable=false`、`qualification=not_proven`、`profileSetAccepted=false`、`verified=false`、`syntheticEvidencePromoted=false`。

TEST_ONLY fixture 只验证 validator 的结构分支和负例。它不在 Git tree、production catalog、主 bundle 或 v2 input bundle 中；它没有真实 authority、没有生产资格，也不能作为任何 Profile datum 的当前来源。

## 5. 十一个显式 blocker

`profile-readiness-v2.json` 必须同时保留以下 blocker，缺失任一项都属于证据错误：

1. `INTAKE-B001_POLICY_PROPOSED`
2. `INTAKE-B002_CATALOG_EMPTY`
3. `INTAKE-B003_ATOMIC_PROFILES_ABSENT`
4. `INTAKE-B004_PROFILE_SET_NOT_ACCEPTED`
5. `INTAKE-B005_VERIFICATION_ABSENT`
6. `INTAKE-B006_QUALIFICATION_NOT_PROVEN`
7. `INTAKE-B007_EXTERNAL_AUTHORITY_VERIFIER_ABSENT`
8. `INTAKE-B008_COMPATIBILITY_ALGORITHM_OPERANDS_MISSING`
9. `INTAKE-B009_RFC8785_CANONICALIZER_NOT_IMPLEMENTED`
10. `INTAKE-B010_CHANGE_PROTOCOL_NOT_PRODUCTION_PROVEN`
11. `INTAKE-B011_REVISION_STALENESS_NOT_PRODUCTION_PROVEN`

其中 RFC 8785 blocker 很重要：本 revision 没有声称现有 Groovy/JSON 输出是 RFC 8785/JCS，也没有用它授权跨实现签名。workload↔hardware 与 durability↔failure 的 reviewed formula/operand registry 同样不存在，所以 production compatibility report 必须保持未生成，Profile Set 必须保持未接受。

## 6. 固定实现输入与规范化输出

关键受保护实现输入：

| 文件 | SHA-256 |
| --- | --- |
| `build.gradle.kts` | `c0704cee140c121cfb6cb5eb1da1d447bdedddf58e5af4cc1d9265dfed5bd966` |
| `scripts/verify-build-contract.sh` | `7801644126252e747740868011e2e47abcb006a4e8f0d840b64168c08fa14c48` |
| `scripts/verify-negative-gates.sh` | `a23d21c70239cb18a620295557169bf7105667f214a7b05b90f65e052da8f1ef` |
| `scripts/verify-profile-negative-gates.sh` | `ef3eb99721c6e55a99461bf4d14628268630147578b85c4f74db95d113e1426a` |
| `scripts/verify-reproducible.sh` | `6588480e1ecc07ffc099f61ad4b12a3a47801080ec4b0ec122a7f1475f3d8c78` |

十项规范化输出：

| Artifact | SHA-256 |
| --- | --- |
| `aeron-cluster-matching-engine-build-contract.zip` | `46443abf82b7f64866146ee8abfd1bdf94356c5d14a815c2057d7ba8b80751b0` |
| `qualification-v2-input-contract.zip` | `9548b73dd449e17a1d0dbc51e457c069a965049f6e06478e76ea5f431b754656` |
| `resolved-artifact-manifest.json` | `8043e45adbcda0f75c7082a5cb0b1280dcbbc3ba1e80667e4a8ac120ebc47a71` |
| `dependency-graph.txt` | `ba0211e62e416bf6445c5c44ec9c194a933ffa844425ddba7072a7c7e50d428d` |
| `cyclonedx-sbom.json` | `8a1f7c496d7f306a8d40b1b0d4434efd7dd64d2b434f5db91053c07689caa2f8` |
| `build-contract.properties` | `a1db4f3098d60a05b84f5029b8feeac2cc2b2d9864dd48eb9277489c735fb870` |
| `profile-readiness.json` | `2cb205d2f8f13563ef6f97ff688d860a0b9ff70277463fecf021a1dbc6796493` |
| `profile-readiness-v2.json` | `5349b63b79bb8c2af33cc1701d697b6196684e249b3cebaf4768128085628f3c` |
| `qualification-v2-selftest.json` | `75e894b271efdfab107706b1115b54555a80125639b7c40d73391879799b5359` |
| `remote-authority-readiness.json` | `1766dbd9aad124fc9cd01030456bfa1cb1f4611a19ea4455a2d6f766cf53f812` |

主 ZIP 有 87 个总 entries、71 个 file entries；v2 input ZIP 有 27 个总 entries、20 个 file entries。最终清单中 TEST_ONLY、raw/telemetry、未登记 evidence、duplicate 与 unsafe path 均为 0。

这些摘要只证明该本地 commit 在上述历史 runtime 和本地缓存语义下的内容一致性。它们不证明 publisher identity、外部可取回性、不可变留存、漏洞/许可证合规、当前安全生产 JDK、目标硬件性能或生产部署资格。

## 7. Verdict、失效条件与下一步

`partial` 只证明当前 revision 的 v2 合同字节、否定 readiness、结构测试、负向门禁和本地复现结果。它不证明 production accepted graph 可达，不使任何 atomic Profile 或 Profile Set 变为 `accepted/verified`，不接受 `ADR-0001/0002`，不解除 `TASK-P0-002 blocked`，不完成 `TASK-P0-003`，不把 `GATE-001` 提升为 pass，也不改变 `claim_status: not_proven` 或 `qualification_profile: none`。

以下任一变化会使本证据 `stale`：

- 实现 HEAD、19 个 v2 合同、14 个 legacy v1 合同、policy、catalog、validator、脚本、locks、verification metadata、bundle、generated evidence 或其摘要变化；
- 外部 trust/identity/approval/artifact authority、production verifier、RFC 8785 实现、compatibility formula/operand registry、revision/change/stale closure 被建立、修改或撤销；
- 任一真实 owner、source、datum claim、derivation、approval、change、Profile、Profile Set、evidence、validity 或 catalog entry 出现或变化；
- Gradle/JDK/依赖/操作系统/硬件/构建缓存语义变化，或输出不再跨路径、offline、解包逐字节一致；
- remote、Hosted CI、license、artifact/backup authority 被建立，或发现 TEST_ONLY/raw telemetry/secret 能进入 production graph 或 bundle；
- 发现任一默认拒绝、identity、digest、revision、stale、path、symlink、catalog 或 ZIP 清单规则可绕过。

下一步不是填一组猜测值，而是先按 `OQ-012` 建立仓库外 trust root、identity/approval authority 与 artifact availability verifier，并实现受审 RFC 8785 和兼容公式；随后按 `OQ-011` 分配真实 input/approval owner、接收权威来源并创建 revision 2+ candidate。`QUALIFICATION_SET-001` 与任何 production qualification 仍留给 `TASK-P9-001`。
