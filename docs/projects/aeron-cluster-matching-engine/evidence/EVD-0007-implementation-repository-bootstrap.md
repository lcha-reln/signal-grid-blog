# EVD-0007：实现仓库 bootstrap 与可复现构建合同

- 证据 ID：`EVD-0007`
- 证明对象：`TASK-P0-002`、`ADR-0001`、`ADR-0002`
- Observation cutoff：2026-08-19T00:25:53+08:00
- 实现对象：local-only repository commit `9dbe8e9f8578ad8fa27da54ca494c8e9a092c379`
- Verdict：`partial`

## 1. Verdict 的准确边界

本证据证明一个独立的本地实现仓库已经建立，并且其中的 `deployable=false` 构建合同能在已固定的本地工具链上通过完整性、负向变异、离线构建和字节复现门禁。它没有闭合 `TASK-P0-002`，也没有接受 `ADR-0001` 或 `ADR-0002`。

以下条件仍不存在或尚未被接受：remote、hosted CI、branch protection、review/ruleset、license、独立备份、持久 artifact authority、最终 JDK 安全补丁，以及任何撮合、Aeron Cluster、Gateway、镜像或部署实现。因此，本证据不得用来声明高可用、真实流量能力或生产资格。

## 2. 双仓与工作树观察

实现仓库：

- 逻辑 ID：`aeron-cluster-matching-engine`；
- 绝对路径：`/Users/reln/aeron-cluster-matching-engine`；
- 分支：`main`；
- HEAD：`9dbe8e9f8578ad8fa27da54ca494c8e9a092c379`；
- `git status --short`：无输出，工作树 clean；
- `git remote -v`：无输出，没有 remote；
- repository visibility：`local-only provisional`；
- 产品源码：不存在；当前提交只含构建、依赖、policy、文档和本地 Workflow 定义；
- `gradle/source-baseline.properties` 已进入该不可变提交，`gradlew` 与所有验证脚本均以 executable mode 保存。

博客仓库在本次记录修改前的 reconciliation base 为 `11eeeedc1793f633dd9861036e5bdda2e93f62f8`。实现仓库 SHA 与博客仓库 SHA 属于两个独立 Git identity domain，不能互相替代。

博客仓库的对称恢复观察：

- 绝对路径：`/Users/reln/signal-grid-blog`；分支：`main`；
- 本次修改前 HEAD 与 `origin/main` 均为 `11eeeedc1793f633dd9861036e5bdda2e93f62f8`，工作树 clean；
- 本次授权 diff 只允许 `PROJECT_RECORD.md` 与本文件；
- 该 SHA 是本次记录的 reconciliation base，不是尚未产生的记录回填 commit，也不与实现仓库 SHA 混用。

## 3. 观察环境与适用性

- OS：macOS 26.0.1，Build `25A362`；kernel：Darwin 25.0.0；architecture：arm64；chip：Apple M2。未记录 hostname、serial、UUID 或用户身份。
- Workload：不适用——本轮只运行 build-contract 与供应链门禁，没有订单流量、撮合 workload 或延迟采样。
- Fault schedule：不适用——没有 Cluster fault；33 个 repository mutants 与 1 次缓存 artifact tamper 是门禁负例，不是 HA 故障实验。
- Configuration：`JAVA_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/temurin-extracted/jdk-25.0.4+7/Contents/Home`，exact Temurin runtime gate，Gradle Wrapper 9.7.0，两套由复现脚本创建的独立临时 Gradle Home；先 online 解析并固定输入，再在各自预热缓存上 offline 重建。
- Artifact URI：`none`。生成输出位于本地 ignored `build/`，没有持久 artifact authority；本文件只固化输入、观察和摘要，不能让摘要本身变成可取回制品。

## 4. 固定输入

| 组件 | 固定值 | 完整性/来源锚点 |
| --- | --- | --- |
| Aeron | `1.52.2` | tag `5b62f21d917af027cdf5a3241aa5f355149b04fa`；strict lock、verification metadata、artifact ledger |
| SBE Tool | `1.39.0` | tag `e773b57cac6b2008ce30dd219a33de49766c6013`；独立 `sbeCodegen` 解析域 |
| Agrona | `2.5.0` | tag `eaaa178c2bc47d7c03ab45403e24d95d83c89152`；显式 runtime dependency |
| Gradle | [`9.7.0`](https://docs.gradle.org/9.7.0/release-notes.html) | revision `3defbfc59d757b873d787b2261de5c7f8a00970a`；[官方 checksums](https://gradle.org/release-checksums/)中的 distribution SHA-256 `84fbba45c7f4c64abc77460e1c00f541e9f960e3c7ed2538f1ede19eacd873ae`；wrapper JAR SHA-256 `7a9ce74cff467ca1bf60a4fcd9f05185acceda4d0f382434d393e17864262c5d` |
| JDK | Eclipse Temurin [`25.0.4+7-LTS` HotSpot，macOS aarch64](https://github.com/adoptium/temurin25-binaries/releases/tag/jdk-25.0.4%2B7) | [官方 artifact](https://github.com/adoptium/temurin25-binaries/releases/download/jdk-25.0.4%2B7/OpenJDK25U-jdk_aarch64_mac_hotspot_25.0.4_7.tar.gz) SHA-256 `5a101c54abf5a9f16c0f70d8c38ba99e6567c1ba213378f0bb04497284f051bd`；仅为 provisional observation input |

Oracle 的 [Java 安全更新节奏公告](https://blogs.oracle.com/java/transitioning-java-to-more-frequent-security-updates)和 [JDK 25.0.4 release notes](https://www.oracle.com/java/technologies/javase/25-0-4-relnotes.html)把 2026-08-18 标为 CSPU 窗口；这个日期不等于 Eclipse Temurin/OpenJDK 已发布一个可直接采用的新 GA，也不能用日期预判厂商版本号。出现适用的 vendor security release 或 advisory 后，必须重新固定 vendor、完整 build、平台 archive digest，并重跑本证据的全部门禁。

## 5. 验收命令与观察

在实现仓库执行的最终入口：

```bash
env \
  JAVA_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/temurin-extracted/jdk-25.0.4+7/Contents/Home \
  GRADLE_USER_HOME=/private/tmp/aeron-build-bootstrap.kS9PFU/wrapper-home \
  ./scripts/verify-all.sh
```

最终观察：

- exact repository policy 通过；
- exact JDK/Gradle runtime self-test 通过；
- online `buildContractCheck` 通过；
- 同一已预热且隔离的 dependency cache 上，offline `buildContractCheck` 通过；
- 33 个负向变异全部被自己的稳定错误码拒绝，而不是只接受任意 non-zero；
- 缓存中的 Aeron JAR 被篡改后，strict dependency verification 按预期失败；
- 两个不同绝对 checkout 路径、两套独立 `GRADLE_USER_HOME` 的 online 与 offline 输出逐字节一致；
- build-contract ZIP 解包到空目录后，可以离线重建，并与原始 offline 输出逐字节一致；
- 生成 graph 排除了 lock constraint 假边，SBOM 保留真实传递依赖和 `clusterRuntime`/`sbeCodegen` 两个域；
- 源码树与解包 bundle 使用不同 allowlist，symlink、hardlink、额外 Gradle 入口、`buildSrc`、未知 workflow、secret marker、动态版本、额外仓库和锁/verification 漂移均 fail closed。

## 6. 规范化输出摘要

| Artifact | SHA-256 |
| --- | --- |
| `aeron-cluster-matching-engine-build-contract.zip` | `e8e83fbafd36671f4205534476943d7a16a962823f3cff180683aac91ade6db5` |
| `resolved-artifact-manifest.json` | `8043e45adbcda0f75c7082a5cb0b1280dcbbc3ba1e80667e4a8ac120ebc47a71` |
| `dependency-graph.txt` | `ba0211e62e416bf6445c5c44ec9c194a933ffa844425ddba7072a7c7e50d428d` |
| `cyclonedx-sbom.json` | `8a1f7c496d7f306a8d40b1b0d4434efd7dd64d2b434f5db91053c07689caa2f8` |
| `build-contract.properties` | `c62c40f2d69c7fab4d11bfaa99a5b835c798e06103bd318f6af05f4b8bd0be9c` |

ZIP manifest 明确写入 `deployable=false`。这些摘要证明本轮规范化内容相同，不证明 artifact publisher identity、漏洞/许可证合规、远端不可变留存或生产部署资格。

## 7. 已知信任边界

- 本地 repository policy、Workflow 和验证脚本仍位于同一个未受远端 ruleset 保护的仓库；本地自校验不能替代独立 review 或 hosted CI trust root。
- 本地 Workflow 文件存在不等于 GitHub Actions/其他 hosted CI 已运行。
- SHA-256 能检测内容变化，但不等于 PGP、Sigstore/SLSA provenance 或发布者身份验证。
- local-only 仓库仍有单机丢失和 canonical drift 风险，对应 `RISK-013`。
- 依赖可解析和构建可复现不等于撮合语义正确、Aeron Cluster 能运行、三节点能切主，或给定负载下满足 SLO。

## 8. 失效条件与后续

以下任一项变化，本证据必须改为 `stale` 或重新采集：

- 实现 commit、Gradle wrapper/launcher、lock、verification metadata、artifact ledger、版本目录、JDK/source baseline、policy 或验证脚本变化；
- JDK vendor、完整 build、OS/arch、Gradle 版本、Aeron/SBE/Agrona 版本或执行环境变化；
- 出现适用的 JDK vendor security release/advisory；
- repository authority、remote、CI、权限、license、备份或 artifact retention 边界变化；
- 发现输出含未登记输入、绝对路径、时间、UUID、secret、错误依赖边或不完整 SBOM。

下一步必须由用户确认访问模型并授权后建立受保护 remote（private 是默认候选，尚未接受），确定 license、备份恢复和持久 artifact authority；随后在适用 JDK 安全版本与 hosted CI 上重跑同一门禁。只有这些条件与 ADR 的完整字段一起闭合，`TASK-P0-002` 才能从 `doing` 变为 `done`。
