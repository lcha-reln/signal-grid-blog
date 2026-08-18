# EVD-0009：JDK 25 安全基线刷新

- 证据 ID：`EVD-0009`
- 证明对象：`FACT-012`、`OQ-004`
- 关联控制：`REQ-QUAL-002`、`REQ-OPS-006`；不闭合任何 `INV`、Gate 或 ADR
- Observation cutoff：2026-08-19T01:27:53+08:00
- Verdict：`pass`

## 1. Verdict 的准确边界

本证据只证明在 observation cutoff 上，从官方发行说明、Oracle 安全公告、Oracle 版本化制品和 Eclipse Adoptium GA API 观察到的 JDK 25 发行事实。`pass` 表示这些有日期边界的外部事实已被核对，不表示项目已经选择或运行 Oracle JDK，不接受 `ADR-0001`，不闭合 `OQ-004`，也不使历史 Temurin runtime 获得生产安全资格。

## 2. 期望与实际

- 期望：从官方来源确定 Oracle 2026-08 安全更新的精确版本/日期/security baseline/版本化制品摘要，并检查 Eclipse Adoptium 是否已有可保持 vendor 不变的适用替代 GA；观察结果不得自动接受任何 vendor。
- 实际：Oracle 已发布 JDK 25.0.4.1+1，旧 Oracle Java SE 25.0.4 位于 August CSPU 影响范围；Adoptium API 在 cutoff 上仍返回 Temurin 25.0.4+7-LTS，未观察到同 vendor 适用替代 GA。项目因此把旧 Temurin 降为 historical-only，并仅把 Oracle 版本登记为未接受候选。

## 3. 官方观察

### Oracle JDK 25.0.4.1

- [Oracle JDK 25.0.4.1 release notes](https://www.oracle.com/java/technologies/javase/25-0-4-1-relnotes.html) 标明发布日期为 2026-08-18；
- full version string 为 `25.0.4.1+1`；
- Oracle 列出的 JDK 25 security baseline 为 `25.0.4.1+1`；
- 版本化 macOS aarch64 archive：`https://download.oracle.com/java/25/archive/jdk-25.0.4.1_macos-aarch64_bin.tar.gz`；
- 对版本化 archive 的 HTTP metadata 观察得到 `Content-Length: 209411751` bytes；
- companion checksum URL：`https://download.oracle.com/java/25/archive/jdk-25.0.4.1_macos-aarch64_bin.tar.gz.sha256`；其官方 SHA-256 为 `616fbcd6c68e4451c3ab12c0d4c5095deab67a2603125e63b0d8a46b41615e6a`。

[Oracle August 2026 CSPU](https://www.oracle.com/security-alerts/cspuaug2026.html) 的 Java SE 摘要列出 4 个新安全补丁，均可在无认证条件下远程利用，最高 CVSS 7.5；受影响版本包括 Oracle Java SE 25.0.4。该事实足以使项目停止把旧 25.0.4 runtime 描述为当前生产安全基线。

### Eclipse Temurin 25

对 [Eclipse Adoptium GA API](https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=aarch64&heap_size=normal&image_type=jdk&jvm_impl=hotspot&os=mac&vendor=eclipse) 的 observation cutoff 查询仍返回 macOS aarch64 HotSpot `25.0.4+7-LTS`：

- release name：`jdk-25.0.4+7`；
- archive：`OpenJDK25U-jdk_aarch64_mac_hotspot_25.0.4_7.tar.gz`；
- size：`136352956` bytes；
- SHA-256：`5a101c54abf5a9f16c0f70d8c38ba99e6567c1ba213378f0bb04497284f051bd`；
- 未观察到 Eclipse Temurin 25.0.4.1 或更新的同 vendor 适用 GA。

“未观察到”严格限定在本次 API 查询时间；它不是对未来发行的永久断言。

## 4. 项目解释

- Eclipse Temurin 25.0.4+7 继续保留为 `historical-reproducibility-only-security-baseline-expired`，用于复现 `EVD-0007/0008` 的本地构建观察；
- Oracle JDK 25.0.4.1+1 只登记为 `vendor-change-candidate-only-adr-not-accepted`；
- Oracle 与 Eclipse Temurin 的 vendor、许可、支持、包、完整 build、制品摘要和运行证据不能自动互换；
- 项目不得因为 Oracle 已发布安全版本就静默切换 vendor；也不得因为 Temurin 尚无同 vendor 替代 GA 就继续把旧 runtime 用作生产安全基线；
- `ADR-0001` 必须继续 `proposed`，直到明确选择 vendor/build/license/support，重新固定所有平台制品并重跑当前 P0 build-contract；后续恢复、HA 与性能证据则必须在生产资格审查前按最终 runtime 重采，不能把它们错误设成 P0 接受 ADR 的循环前置条件。

## 5. 适用性字段

- Workload：不适用——这是外部版本/安全事实观察；
- Fault schedule：不适用——没有运行应用或注入故障；
- Hardware：不适用——没有执行候选 Oracle runtime；
- Configuration：Oracle 官方发行说明/安全公告/版本化 archive 与 checksum，Eclipse Adoptium macOS aarch64 HotSpot GA API；
- Artifact URI：官方 HTTPS URL，未复制到本地或持久 artifact authority；
- 本地命令结果：未下载、未安装、未运行 Oracle candidate；因此没有把它写成 tested runtime。

## 6. 失效条件与后续

以下任一变化会使本证据 `stale`：

- Eclipse Adoptium 发布适用的同 vendor 新 GA，或撤回/重签现有制品；
- Oracle 更新、撤回或替换 25.0.4.1 release、安全 baseline、archive 或 checksum；
- 新的 Oracle/Adoptium/OpenJDK advisory 改变适用性判断；
- 项目接受、拒绝或 supersede `ADR-0001`，或实际 JDK vendor/build 发生变化；
- 发现 API 查询、制品大小、摘要或上述解释不准确。

下一步不是把本条 `pass` 当成选型完成，而是让用户/项目明确 vendor、许可与支持策略；随后固定安全有效的完整 build 和平台摘要，重新生成 lock/evidence 并重跑所有门禁。
