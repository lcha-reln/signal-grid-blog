# EVD-0012：历史 RFC 8785 canonicalization build-contract boundary（stale）

- 证据 ID：`EVD-0012`
- 证明对象：`TASK-P0-002`、`TASK-P0-003`、`ADR-0001`、`ADR-0002`、`REQ-QUAL-007`、`REQ-QUAL-008`、`REQ-SEC-005`、`WORKLOAD_PROFILE-001`、`HARDWARE_PROFILE-001`、`DURABILITY_PROFILE-001`、`FAILURE_PROFILE-001`、`PROFILE_SET-001`、`QUALIFICATION_SET-001`、`OQ-011`、`OQ-012`、`RISK-013`、`RISK-014`、`RISK-016`、`RISK-017`
- 关联控制：`GATE-001`；只闭合 `INTAKE-B009_RFC8785_CANONICALIZER_NOT_IMPLEMENTED`，不闭合任何业务不变量、运行时 Gate、Profile 接受或生产资格 Gate
- Observation cutoff：2026-08-19T06:52:37+08:00
- 实现对象：local-only repository commit `667a859c8dc1f3e72d4ddea1391113c3d2d1c860`，tree `34d3d97b2309f3d5dc4fd50278ba28a751e60e37`
- Verdict：`stale`

> 本 artifact 只保留实现 commit `667a859c8dc1f3e72d4ddea1391113c3d2d1c860` 的不可变历史观察。当前实现已推进到 `e4482a4ddd445cc5065af1ea9f2cac993ce80121`（tree `13f4e29a5e2a748da16bf42cbc2945baa5be47e9`），并增加 v3 source contracts、修改 validator、四个脚本、bundle 与 generated evidence，已命中本证据原失效条件。旧 `build/` 仍是 40-case revision 的 stale 输出，不得用于当前提交或发布；当前源码边界由 `EVD-0013 partial` 承接。JCS primitive 的历史结论没有因此被反证。

## 1. 该历史 revision 证明过什么

本 revision 为 Profile intake 与 change contract 增加一个受固定依赖、固定源码和固定测试向量约束的 RFC 8785/JCS canonical-byte primitive。它证明：

- build contract 使用精确坐标 `io.github.erdtman:java-json-canonicalization:1.1`，且该依赖只存在于可解析、不可消费、无继承关系的 `jcsCanonicalizer` configuration；它不进入 `clusterRuntime` 或 `sbeCodegen`；
- RFC 8785 Appendix B 的 26 个 binary64 数字行逐字节符合预期，包括 non-finite 行的默认拒绝；
- 官方 `json-canonicalization` corpus 固定到一个 upstream commit，6 组 input/output 同时核验 input digest、output digest、实际 canonical bytes 与 canonical fixed point；
- 严格包装层在调用所选 JCS engine 前拒绝非法 UTF-8、escaped 或 in-memory lone surrogate、重复对象键、负零、非有限数字以及 byte/depth/node resource limit 越界；
- Profile value、approval decision payload、change proposed payload 与 compatibility input 后续可以共享同一个可执行 canonicalization/digest primitive；生成的 manifest、dependency graph、SBOM、properties 与 readiness 精确绑定该 primitive；
- B009 从该历史 revision 的 readiness blocker 列表中移除，且 readiness 明确输出 `verified_for_build_contract` 和精确 engine/corpus tuple。

这里的“已验证”只适用于该历史 revision 的 build-contract canonical-byte primitive。它不意味着任一 source、claim、approval、Profile、Profile Set 或 Qualification Set 已具备生产 authority，也不证明 compatibility、change application、revision/stale graph 或产品运行时语义。

## 2. 固定实现与供应链边界

| 输入 | 固定值 |
| --- | --- |
| Maven coordinate | `io.github.erdtman:java-json-canonicalization:1.1` |
| 实现 tag commit | `571f10dcc0c9531164795c38b934a58cf7172722` |
| JAR SHA-256 | `ed12a01f28d147898312963a1f704e90290b67a61f34fa3a761f41c134f4e691` |
| POM SHA-256 | `37114938a89def00596ff5541b794abc6be626b4c73e988d5a5bd457a3f38477` |
| sources JAR SHA-256 | `98de9b4ee9e220da0a8b4338f0612924c36612d060ca71064a9f56422e7e2068` |
| official corpus commit | `19d51d7fe467d4706a3ff08adf8a748f29fc21e0` |

版本目录、`gradle.lockfile`、strict verification metadata、artifact checksum ledger 与 source baseline 共同固定以上输入。受审来源为 [RFC 8785](https://www.rfc-editor.org/rfc/rfc8785.html)、其已验证 erratum 7920、RFC Appendix G 指向的 Java 实现，以及固定 commit 的官方 [`json-canonicalization`](https://github.com/cyberphone/json-canonicalization/tree/19d51d7fe467d4706a3ff08adf8a748f29fc21e0) corpus。

依赖边界不是依靠文档约定。构建会重算所有可解析 configuration 的 declaration、resolved artifact 与 dependency edge，并要求：

1. `clusterRuntime`、`jcsCanonicalizer`、`sbeCodegen` 都是 resolvable、non-consumable 且 `extendsFrom` 为空；
2. JCS declaration、artifact 和 root edge 都精确出现一次，且 configuration 只能是 `jcsCanonicalizer`；
3. artifact 文件名、coordinate、版本和 JAR SHA-256 必须完全匹配；
4. manifest、CycloneDX component、root dependency edge、configuration property、contract properties 和 v2 readiness 必须给出同一精确 tuple。

SHA-256 仍只证明观察到的内容相同，不证明 publisher identity、provenance、许可证、漏洞状态或持久可取回性。该历史 revision 在观察时没有 remote、upstream、tag、签名、外部 artifact authority 或 retention 保证。

## 3. RFC 8785 与严格包装层

### Appendix B 与官方 corpus

Appendix B gate 从 64-bit hex 构造 binary64 值，对全部 26 行核对 ECMAScript/JCS 数字表示。有限值必须得到精确文本；`NaN` 和 `Infinity` 必须以稳定拒绝码失败。production scalar API 使用单元素数组包装后去除括号，因此也对 `BigDecimal("333333333.33333329") -> 333333333.3333333` 与 `BigDecimal("1E+30") -> 1e+30` 进行专门核对，避免测试 API 与实际摘要 API 分叉。

固定 corpus 覆盖 `arrays`、`french`、`structures`、`unicode`、`values` 和 `weird` 六组。每组都保留 base64 input/output 及各自 SHA-256；门禁先验证固定 bytes 的摘要，再比较 canonical output，并再次 canonicalize output 以验证 fixed point。`JCS-SELFTEST-E002`、`JCS-SELFTEST-E003` 与 `JCS-SELFTEST-E004` 分别守住 Appendix B、官方 corpus 和 production value/object wrapper 行为。

### Engine 前的 fail-closed guard

所选 1.1 engine 自身会 replacement-accept 部分非法 UTF-8/lone surrogate，并会把负零输出为零。因此库调用成功不能单独作为合规证据。仓库包装层先做严格解析和遍历，稳定拒绝：

- 非法 UTF-8：`JCS-P001`；
- escaped 或 in-memory lone surrogate：`JCS-P002`；
- 输入超过 16 MiB、值深度达到 128（公开上限为 127）或节点超过 1,000,000：`JCS-P003`；
- `NaN`、正负无穷等 non-finite 值：`JCS-P004`；
- raw 或 in-memory negative zero：`JCS-P005`；
- duplicate object key：`JCS-P006`；
- scalar wrapper 不能还原为单元素 canonical array：`JCS-P007`。

值深度 127 有正边界样例，128 必须失败。对象插入顺序、Unicode scalar bytes、ECMAScript rounding 与 exponent formatting 另有 production API 自检。

## 4. 语义门禁与对抗负例

本 revision 新增或强化以下稳定拒绝边界：

- `JCS-P008`：拒绝把 JCS resolved artifact/root edge 泄漏到 `clusterRuntime`，也拒绝新增可消费 runtime declaration；真实 configuration、declaration、artifact 和 edge 与两个模型 mutant 使用同一语义检查函数；
- `JCS-E002`：要求 SBOM 只有一个精确 JCS component、一个 SHA-256、`signalgrid:configurations=jcsCanonicalizer`，并且只有 root 指向该 component；
- `JCS-E003`：要求 `build-contract.properties` 与完整 canonical property contract 逐字节相同，不能通过删除 JCS 字段后重做局部基线绕过；
- `JCS-E004`：要求 `profile-readiness-v2.json` 的 `rfc8785` 对象精确等于 coordinate、JAR digest、official corpus commit 与 `verified_for_build_contract` 四元组。

完整串行入口在 clean implementation commit 上 exit code 为 `0`：

```bash
env \
  JAVA_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/temurin-extracted/jdk-25.0.4+7/Contents/Home \
  GRADLE_USER_HOME=/Users/reln/.gradle \
  bash scripts/verify-all.sh
```

观察到：

- online 与 offline `clean buildContractCheck` 均通过，该历史合同共 23 个任务；
- 62 个 repository-policy mutants、42 个 legacy Profile mutants、58 个 v2 intake/lifecycle mutants 与 20 个 remote-authority mutants 全部按各自稳定错误码通过；
- dependency artifact tamper gate 通过；不同绝对 checkout、独立 Gradle Home、offline 与 unpacked rebuild 的十项输出逐字节一致；
- RFC gate 报告 26 个 Appendix B rows、6 个 pinned corpus pairs，以及 strict UTF-8/surrogate/duplicate/-0/resource guards 全部通过；
- TEST_ONLY selftest 仍只有 1 个 structural positive、4 个 Profile、160 个 datum、160 个 claim 和 1 个 derivation；`productionAcceptedPathProven=false`、`profileSetAccepted=false`、`compatibilityReportGenerated=false`，但 `rfc8785ConformanceVerified=true`；
- 正常拒绝入口不因本轮变化而放宽：Profile Set acceptance 仍以 `PROFILESET-E901` 失败，Qualification assertion 仍以 `PROFILESET-E900` 失败，缺少 production authority verifier 时仍以 `INTAKE-P084` 失败。

这些 mutants 是 build-contract 与输入合同的负向测试，不是撮合、Aeron Cluster、HA、容量、故障切换或恢复实验。

## 5. 该历史 revision 的 readiness 与未闭合边界

该历史 revision 的 `profile-readiness-v2.json` 不再包含 B009，并精确记录：

```json
{
  "artifactSha256": "ed12a01f28d147898312963a1f704e90290b67a61f34fa3a761f41c134f4e691",
  "coordinate": "io.github.erdtman:java-json-canonicalization:1.1",
  "officialCorpusCommit": "19d51d7fe467d4706a3ff08adf8a748f29fc21e0",
  "status": "verified_for_build_contract"
}
```

这只关闭 B009。以下十个 blocker 必须继续存在：

1. `INTAKE-B001_POLICY_PROPOSED`
2. `INTAKE-B002_CATALOG_EMPTY`
3. `INTAKE-B003_ATOMIC_PROFILES_ABSENT`
4. `INTAKE-B004_PROFILE_SET_NOT_ACCEPTED`
5. `INTAKE-B005_VERIFICATION_ABSENT`
6. `INTAKE-B006_QUALIFICATION_NOT_PROVEN`
7. `INTAKE-B007_EXTERNAL_AUTHORITY_VERIFIER_ABSENT`
8. `INTAKE-B008_COMPATIBILITY_ALGORITHM_OPERANDS_MISSING`
9. `INTAKE-B010_CHANGE_PROTOCOL_NOT_PRODUCTION_PROVEN`
10. `INTAKE-B011_REVISION_STALENESS_NOT_PRODUCTION_PROVEN`

尤其是：

- B008 仍缺 workload↔hardware 与 durability↔failure 的受审公式、精确 operands、算法/实现摘要 registry 和可再生 compatibility report；
- B010 仍没有 production change graph 的端到端 applied-result 证明，现有 change positive 只是 TEST_ONLY 结构验证；
- B011 仍没有生产 revision chain、derived stale state 与下游消费拒绝的完整证明；
- governance policy 仍为 `proposed`，catalog 仍是 0-entry `draft`；没有真实 SOURCE、owner assignment、claim、derivation、approval、change、accepted Profile、accepted Profile Set 或 raw telemetry；
- 仓库外 trust root、identity/approval authority、artifact availability verifier 和持久 artifact authority 均不存在；
- `QUALIFICATION_SET-001` 继续保持 `draft/not_qualified`，`deployable=false`、`qualification=not_proven`、`verified=false`、`syntheticEvidencePromoted=false`。

因此，本轮不完成 `TASK-P0-003`，不解除 `TASK-P0-002 blocked`，不把 `GATE-001` 提升为 pass，也不改变 `claim_status: not_proven` 或 `qualification_profile: none`。

## 6. 双仓与观察环境

实现仓库：

- 路径 `/Users/reln/aeron-cluster-matching-engine`，分支 `main`；HEAD 与 tree 如机器字段所列；
- `git status --porcelain=v2` 无输出；remote、upstream 与 tag 均不存在；
- tracked tree 仍没有 `src/`、`services/`、`apps/`、`deploy/`、`docker/`、`k8s/`、`helm/` 或 `infra/` 产品目录；
- 该历史 commit 只交付 canonicalization/build-contract slice，没有撮合、Aeron Cluster、Gateway、容器、部署或生产数据实现。

观察环境沿用前一 revision 的冻结基线：

- macOS 26.0.1，Build `25A362`；Darwin 25；arm64；Apple M2；
- Eclipse Temurin 25.0.4+7-LTS HotSpot 与 Gradle Wrapper 9.7.0；该 Temurin 只用于历史字节复现，其生产安全基线已经过期；
- 博客门禁使用 Node 24.19.0 与 pnpm 10.30.3；博客构建只验证记录结构和站点生成，不构成 canonicalizer、Profile 或生产资格证据；
- workload 与 fault schedule 不适用；本轮没有订单流量、运行中撮合进程或 Aeron Cluster 故障实验；
- 所有实现输出都位于本地 ignored `build/`；没有下载 URI、签名、发布者身份、外部留存或可取回性保证。

## 7. 十项规范化输出

| Artifact | SHA-256 |
| --- | --- |
| `aeron-cluster-matching-engine-build-contract.zip` | `43b27abe07ff3a4f84a9eee192280718ef85e7c4b57ab7825d5d7f94d55ea9c8` |
| `qualification-v2-input-contract.zip` | `2131a971b672258478f0b24a13b5a687a98e7f9bf309266d91c68b035f38a7e1` |
| `resolved-artifact-manifest.json` | `be6dc201247c147cbe57145f5fcbcf0ced53895850bce7967ddce7c54bbfba52` |
| `dependency-graph.txt` | `6c324872cedb4c9890ea0237653e28228c3c9fe09bdef69dc8d6949424363c1c` |
| `cyclonedx-sbom.json` | `fd7ad5ac29b7170ae56bcf8b7ecf845dcb9968b5fe1552e86631a7d3b84fbfd6` |
| `build-contract.properties` | `cb1aeb92e8646dd31b5af9afbdc8d69a7accc5c96346ef94f41f139bad9031d2` |
| `profile-readiness.json` | `2cb205d2f8f13563ef6f97ff688d860a0b9ff70277463fecf021a1dbc6796493` |
| `profile-readiness-v2.json` | `98657ab671215d1e572c1e46b8e4fd2e3613801d3b4eec63617678087db653ae` |
| `qualification-v2-selftest.json` | `1a3ee090c457b543aa9ab0feafe85f51c8d94ed590da0e1cea46a9e765183704` |
| `remote-authority-readiness.json` | `1766dbd9aad124fc9cd01030456bfa1cb1f4611a19ea4455a2d6f766cf53f812` |

主 ZIP 仍为 87 个总 entries、71 个 file entries；v2 input ZIP 为 27 个总 entries、20 个 file entries。最终清单中不得包含 TEST_ONLY、raw telemetry、symlink、路径逃逸、重复条目或未声明文件。

这些摘要证明该历史 local-only commit 在上述冻结 runtime、已缓存依赖和构建语义下可逐字节复现。它们不是外部 artifact authority，也不能证明未来 JDK/Gradle/依赖、不同平台或生产环境的结果。

## 8. 失效条件与下一步

以下任一变化会使本证据 `stale`：

- 实现 HEAD、JCS coordinate/tag/JAR/source/corpus pin、wrapper guard、锁、verification metadata、artifact ledger、source baseline 或任一 JCS gate 变化；
- Appendix B/corpus bytes 或预期摘要变化，资源上限变化，或非法 UTF-8、surrogate、duplicate key、negative zero、non-finite 值能被接受；
- JCS dependency 进入其他 configuration，或 manifest、graph、SBOM、properties、readiness 与真实解析边界不再精确一致；
- v1/v2 contracts、policy/catalog、validator、scripts、bundle、generated evidence 或十项摘要变化；
- 任一外部 authority、compatibility algorithm/operand、change/revision/stale closure、真实 input/approval/Profile/Profile Set、qualification evidence、remote 或 artifact authority 被建立、修改或撤销；
- JDK、Gradle、依赖、操作系统、硬件或缓存语义变化，或 online/offline、跨路径、独立 Gradle Home、unpacked rebuild 不再逐字节一致。

下一步应保留本轮 primitive，在 B008 下实现并审计 compatibility formula/operand registry，在 B010/B011 下闭合 production change application、immutable revision chain 与 transitive stale consumption；同时按 `OQ-012` 建立仓库外 trust/identity/artifact authority，再按 `OQ-011` 分配真实 input/approval owner 并接收权威来源。四类 atomic Profile 与 `PROFILE_SET-001` 只有在这些边界和精确输入全部满足后才可进入 accepted candidate；任何 production qualification 仍留给 `TASK-P9-001`。
