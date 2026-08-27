---
title: "M00·04：把一次 PASS 绑定到可发布证据"
description: "把本地 m00Check PASS 提升为绑定 clean commit、五项声明、产物哈希、限制和 annotated tag CI 身份的 M00 可发布证据。"
date: 2026-08-27T11:30:00+08:00
project: high-availability-cex
profileVersion: SPOT-CEX-1.0
unitCode: M00
lessonOrder: 40
permalink: publish-verifiable-evidence
tags:
  - 撮合引擎
  - 证据链
  - GitHub Actions
draft: false
---

前三篇已经把 M00 的输入合同、规范历史、确定性重放、semantic mutant 和架构边界收进同一个 `m00Check`。运行结束时看到 `PASS`，说明当前工作目录里的代码通过了这一次裁判；但如果我们稍后继续改代码、替换报告，或者把 tag 指向另一笔提交，这个终端输出就无法回答“当时究竟验证了什么”。

本篇解决的不是另一条撮合规则，而是发布身份问题：**课程发布者必须把五项通过声明绑定到一笔 clean commit、每个原始产物的 SHA-256 和一个不可移动的课程完成 tag；其中 tag、manifest 与 commit 的同一性，只能由 tag 事件中的 CI 证明。**

学习者仍以 `m00Check` 获得快速、确定的实现反馈。`m00Evidence` 是课程发布门禁，不是让每位学习者给自己的分支冒充官方完成版本，更不是要求读者创建或移动 `course/m00-complete`。

## PASS 是一次裁判结果，还不是发布身份

先区分两个任务各自拥有的权力：

| 任务 | 使用者 | 回答的问题 | 明确不回答 |
| --- | --- | --- | --- |
| `m00Check` | 学习者、维护者、CI | 当前源码能否通过 M00 的确定性合同 | 工作树是否 clean、哪个 tag 指向它 |
| `m00Evidence` | 课程发布者、完成态 CI | 能否把当前 clean commit 的 PASS 包装成可核验 manifest | tag 是否真的存在、是否为 annotated tag、是否指向该 commit |
| tag CI | GitHub Actions 的 tag 事件 | tag 名、tag 类型、peeled commit 与 manifest 身份是否一致 | M00 是否已经成为可上线交易系统 |

学习者的正常停止点仍是根任务本身：

```bash
./gradlew m00Check --no-daemon
```

它已经在内部验证 v2 Schema。`jq` 只用于额外人工审计；安装了 `jq` 时再运行：

```bash
jq -e '
  .schemaVersion == "matching.m00.check.v2" and
  .unit == "M00" and
  .status == "PASS"
' build/reports/m00/check.json
```

这两条命令都成功，就可以继续修改自己的实现、补测试或比较历史摘要。不要因为看到了官方 tag 名，就在个人 clone 中执行 `git tag -f`、删除远端 tag 或把自己的提交推到同名 ref。

发布者还要证明一件不同的事：裁判读取的源码，在生成 manifest 前后都没有改变。这个要求会先制造本篇的第一盏红灯。

## 先接入 evidence 任务，再让真实改动触发红灯

承接第三篇时，`m00Evidence` 还不存在；直接运行它只会得到 `Task not found`，那不是有教学意义的 RED。先把第三篇的裁判成果收成一个本地 checkpoint：

```bash
./gradlew clean build m00Check --no-daemon
git diff --check
git status --short --untracked-files=all

git add build.gradle.kts course.properties gradle matching-core matching-testkit schemas buildSrc
git commit -m 'feat: complete M00 deterministic judge'
test -z "$(git status --porcelain --untracked-files=normal)"
```

只提交你已经逐项审阅的文件；如果 `git status` 还列出与 M00 无关的改动，先停下来处理归属，不要用 `git add -A` 把它们一起吞进去。

本篇新增两个生产 testkit 文件，并修改两级 Gradle、课程控制面和 CI：

```text
matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/
├── M00EvidenceMain.java
└── M00EvidenceWriter.java

matching-testkit/build.gradle.kts
build.gradle.kts
course.properties
.github/workflows/ci.yml
```

完整机械实现固定在 [`M00EvidenceWriter.java`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M00EvidenceWriter.java)、[`M00EvidenceMain.java`](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M00EvidenceMain.java) 和[完成态 CI](https://github.com/lcha-reln/cex-matching/blob/course/m00-complete/.github/workflows/ci.yml)。它们是不可移动的逐行参考，不是要求你 checkout 完成态。writer 的 `write(...)` 必须按下面顺序开始：校验 tag 名、`requireClean(root)`、读取完整 `HEAD`，然后才验证 `course.properties` 和报告；这样 dirty tree 不会被其他失败原因遮住。

在 `matching-testkit/build.gradle.kts` 增加：

```kotlin
val m00EvidenceDirectory = rootProject.layout.buildDirectory.dir("lab-evidence/M00")
val m00UnitTag = providers.gradleProperty("m00.unitTag").orElse("course/m00-complete")

tasks.register<JavaExec>("m00Evidence") {
    group = "verification"
    description = "Generates and validates the clean-tree M00 evidence manifest."
    dependsOn("m00Check")
    classpath = sourceSets.main.get().runtimeClasspath
    mainClass.set("io.github.lchareln.cex.matching.testkit.M00EvidenceMain")
    args(
        rootProject.layout.projectDirectory.asFile.absolutePath,
        m00ReportDirectory.get().asFile.absolutePath,
        m00EvidenceDirectory.get().asFile.absolutePath,
        m00UnitTag.get(),
    )
    doNotTrackState("Evidence must re-check HEAD and working-tree cleanliness on every invocation")
}
```

根工程只聚合该任务：

```kotlin
tasks.register("m00Evidence") {
    group = "verification"
    description = "Generates and validates the clean-tree M00 evidence manifest."
    dependsOn(":matching-testkit:m00Evidence")
}
```

把下面几节描述的 writer、main、`course.properties` 与 CI 改动全部写入工作树，并先运行 `./gradlew :matching-testkit:classes --no-daemon`。只有 classes 成功、根任务可被解析后，才进入 dirty-tree 反例。

## dirty tree 必须让发布门禁变红

`m00Check` 应该允许未提交修改，因为它承担开发反馈；`m00Evidence` 必须拒绝未提交修改，因为未提交字节没有稳定的 Git 身份。此刻新增的 writer、Gradle、控制面和 CI 正好是一组真实未提交改动，不需要伪造第二个错误源：

```bash
git status --short --untracked-files=all
./gradlew m00Check --no-daemon
```

`m00Check` 仍应输出 `M00 check status: PASS`。接着单独运行发布门禁：

```bash
./gradlew m00Evidence \
  -Pm00.unitTag=course/m00-complete \
  --no-daemon
```

这次必须失败，并包含稳定原因：

```text
m00Evidence requires a clean working tree
```

失败发生在发布 evidence 之前。`m00Evidence` 虽然依赖 `m00Check` 并重新生成报告，但 evidence writer 会调用：

```text
git status --porcelain --untracked-files=normal
```

只要输出不为空，它就不能把当前 `HEAD` 写成 source identity。不要删除这些真实实现改动，也不要用 `git reset --hard` 或 `git clean -fd` 获得“干净”结果。下一节会把它们审阅、测试并提交；这一次失败只证明门禁能拒绝尚无 Git 身份的实现。

这盏红灯证明了角色差异：业务裁判可以在迭代中的源码上运行，发布证据只能属于一笔可寻址的提交。

## course.properties 先冻结课程身份，再允许生成 evidence

clean tree 只是必要条件。发布者还必须把课程控制面从起点状态切换为完成状态。M00 完成提交中的 `course.properties` 是：

```properties
case=high-availability-cex
profile=SPOT-CEX-1.0
planVersion=0.1
project=matching
unit=M00
lifecycle=CODE_VERIFIED
designDepth=CONTRACT
startRef=course/m00.2-start
supersededStartRefs=course/m00-start,course/m00.1-start
completeRef=course/m00-complete
m00Check.expectedStatus=PASS
evidencePath=build/lab-evidence/M00/manifest.json
```

这些字段不是页面装饰。`m00Evidence` 会逐项验证案例、Profile、计划版本、项目、单元、生命周期、设计深度、起点、完成 ref、预期裁判状态和固定 evidence 路径。任一字段漂移都要失败，不能由命令行临时覆盖一个看起来差不多的值。

`startRef` 仍是不可移动的 [`course/m00.2-start`](https://github.com/lcha-reln/cex-matching/tree/course/m00.2-start)，完成发布不会回写或移动它。`completeRef` 声明课程发布者准备创建的身份；此时它仍只是配置中的字符串，不能证明 Git 对象已经存在。

发布者应先让完整实现、测试、Schema、workflow 与这份控制面进入同一提交，再记录 source commit：

```bash
git diff --check
./gradlew clean build m00Check --no-daemon
git status --short

# 只暂存本篇约定的完成态文件：
git add \
  .github/workflows/ci.yml \
  build.gradle.kts \
  course.properties \
  matching-testkit/build.gradle.kts \
  matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M00EvidenceMain.java \
  matching-testkit/src/main/java/io/github/lchareln/cex/matching/testkit/M00EvidenceWriter.java
git diff --cached --check
git commit -m 'feat: bind M00 PASS to publishable evidence'

test -z "$(git status --porcelain --untracked-files=normal)"
git rev-parse HEAD
```

官方 M00 的 clean source commit 是：

```text
2aa9f344cf1b57dd84b622362ecc0c6866121145
```

在个人 fork 中复现实验时，manifest 必须记录你自己的 clean `HEAD`，不要把上面的 SHA 手工复制进去。source identity 来自 Git，而不是作者填写的常量。

## clean commit 让 m00Evidence 从红转绿

只有工作树干净、`course.properties` 与完成合同一致、`m00Check` 确实为 `PASS` 时，课程发布者才运行：

```bash
./gradlew clean build m00Evidence \
  -Pm00.unitTag=course/m00-complete \
  --no-daemon
```

这条命令会重新完成构建和 M00 裁判，然后把 evidence 写入固定目录：

```text
build/lab-evidence/M00/
├── inputs/history-v1.json
├── reports/architecture.json
├── reports/canonical-history.utf8
├── reports/check.json
├── reports/mutants.json
├── reports/validation-results.json
└── manifest.json
```

GREEN 不是“目录存在”，而是下面四个条件同时成立：

1. `check.json` 通过 `matching.m00.check.v2` Schema，顶层状态为 `PASS`；
2. 生成 manifest 前读取的 `HEAD` 是完整 40 位 commit SHA；
3. staging 完成后再次读取 `HEAD`，值没有变化，工作树仍然 clean；
4. manifest 通过 `cex.lab-evidence.v1` Schema、语义检查和全部 artifact hash 复算。

`m00Evidence` 已在内部执行 manifest Schema、语义与 artifact hash 校验。安装了 `jq` 时，再用下面的命令人工核对关键身份，而不是只读 Gradle 最后一行：

```bash
jq -e '
  .schemaVersion == "cex.lab-evidence.v1" and
  .case == "high-availability-cex" and
  .project == "matching" and
  .unit == "M00" and
  .unitTag == "course/m00-complete" and
  .productRelease == null and
  .source.dirty == false and
  (.source.commit | test("^[a-f0-9]{40}$"))
' build/lab-evidence/M00/manifest.json

test "$(jq -r '.source.commit' build/lab-evidence/M00/manifest.json)" \
  = "$(git rev-parse HEAD)"
test -z "$(git status --porcelain --untracked-files=normal)"
```

`generatedAt` 和运行环境会随复现环境变化，所以整个 `manifest.json` 的 SHA-256 不是跨机器 golden。真正需要逐字节复核的是 claims 引用的原始产物；manifest 负责携带这些产物各自的 hash、source commit、环境和限制。

## 安全路径和 staging 阻止 evidence 写到仓库外

验证器会删除旧报告并写入新报告。如果 `build/reports` 或 evidence 内的 `reports` 被预先替换成符号链接，普通的 `normalize()` 与 `startsWith()` 仍可能把文件写到仓库之外。因此输出路径安全不是部署附属项，而是“证据没有污染其他位置”的一部分。

`SafeOutputPaths` 对可信锚点和目标执行三层约束：目标在词法上必须位于锚点内；锚点和所有已存在路径组件都不得是 symlink；锚点转为 real path 后再重建目标并复查。evidence writer 还会拒绝已有 evidence tree 内的任意 symlink，并对每个 artifact 做 real-path confinement 检查。

不要在真实 `build/lab-evidence/M00` 上手工制造链接。仓库已经用 JUnit `@TempDir` 隔离这个反例，核心形状如下：

```java
Path outside = Files.createDirectories(root.resolve("outside"));
Path evidenceRoot = root.resolve("build/lab-evidence/M00");
Files.createDirectories(evidenceRoot);
Files.createSymbolicLink(evidenceRoot.resolve("reports"), outside);

assertThrows(
    IllegalStateException.class,
    () -> SafeOutputPaths.requireNoSymlinkComponents(
        root, evidenceRoot.resolve("reports/check.json")));
```

运行专用安全回归：

```bash
./gradlew :matching-testkit:test \
  --tests 'io.github.lchareln.cex.matching.testkit.M00EvidenceSafetyTest' \
  --no-daemon
```

测试不仅要求抛错，还验证外部目标保持为空。这样才能证明失败发生在第一次危险写入之前，而不是写完以后才发现路径不对。

通过路径门禁后，writer 先在 `build/lab-evidence/` 下创建同文件系统的 `.M00-staging-*` 目录，在其中复制产物、生成并验证 manifest；只有 `HEAD` 和 clean tree 二次检查都通过，才把 staging 移到最终目录。单文件写入同样使用同目录临时文件，再尝试 `ATOMIC_MOVE`。

这里要保留一个诚实边界：文件系统不支持原子移动时，代码会退化为普通 move；替换已有 evidence 目录前也要先删除旧目录。因此 staging 能避免把“尚未验证的半成品”当成最终证据，却不等于跨所有文件系统的崩溃一致事务。

## manifest 用五项声明、hash 和 limitations 组成证明包

manifest 不是把所有报告拼成一个大 JSON。它先声明要证明的事实，再为每项事实绑定观测值和最小原始产物：

| Claim | 关键观测 | 绑定产物 |
| --- | --- | --- |
| `input-contract` | 17 条记录，2 valid、15 invalid，fixture hash | fixture、validation results |
| `canonical-history` | `M00H1`、37 行、3199 UTF-8 bytes、固定 digest | canonical history bytes |
| `deterministic-replay` | 100/100 完成，distinct digest = 1 | `check.json` |
| `semantic-mutant` | `M00-QTY-ZERO-ACCEPTED` 被 `STUDENT_FAILURE` 杀死 | `mutants.json` |
| `architecture-boundary` | 10 个 core source files，0 violation | `architecture.json` |

每个 claim 的 `status` 必须为 `pass`，claim 集合与顺序必须精确等于上面五项；artifact 路径必须是 evidence 根目录内不含 `..` 的相对路径，不能重复，并且每个 SHA-256 必须与实际字节一致。

在 Ubuntu CI 的 Bash 中，hash 复算使用；变量刻意不用 `path`，避免它在 zsh 中与 `PATH` 绑定：

```bash
manifest=build/lab-evidence/M00/manifest.json
while IFS=$'\t' read -r artifact_path expected; do
  actual="$(sha256sum "build/lab-evidence/M00/$artifact_path" | cut -d ' ' -f 1)"
  test "$actual" = "$expected"
done < <(
  jq -r '.claims[].artifacts[] | [.path, .sha256] | @tsv' "$manifest"
)
```

macOS 默认 zsh 没有 `sha256sum` 时，使用独立版本：

```bash
manifest=build/lab-evidence/M00/manifest.json
while IFS=$'\t' read -r artifact_path expected; do
  actual="$(shasum -a 256 "build/lab-evidence/M00/$artifact_path" | cut -d ' ' -f 1)"
  test "$actual" = "$expected"
done < <(
  jq -r '.claims[].artifacts[] | [.path, .sha256] | @tsv' "$manifest"
)
```

只列 PASS 会制造虚假安全感，所以 manifest 同时冻结五条 limitations：当前只有 BTC-USDT 的一条 `PlaceLimitOrder` 输入合同；`VALID` 不代表 Accepted、Rested 或 Trade；没有撤单、改单、市价单、TIF、STP、手续费、资产或账户逻辑；没有持久化、网络、数据库、线程、Aeron 或高可用；也没有吞吐、延迟、恢复和生产就绪声明。

这些限制不是免责声明。它们限定了读者可以从五项 claim 推导什么，也阻止课程完成 tag 被误读成产品发布。

## annotated tag 的身份只能由 tag CI 证明

本地 `m00Evidence` 接收 `-Pm00.unitTag=course/m00-complete`，验证命名格式与 `course.properties.completeRef`，然后把这个字符串和当前 `HEAD` 写入 manifest。它刻意不要求 tag 已经存在，否则发布者会陷入“先有 tag 还是先有 evidence”的循环。

因此，本地 GREEN 仍不能证明三个命题：这个 tag 是 annotated tag；它 peel 后指向 manifest 的 source commit；触发 workflow 的 ref 名就是 manifest 的 `unitTag`。这三项只能在 tag 已创建并推送后，由 tag 事件的 GitHub Actions 环境联合验证。

官方发布者首次创建 M00 完成 ref 时使用 annotated tag。下面是发布流程记录，不是要求学习者再次执行的练习：

```bash
git tag -a course/m00-complete \
  -m 'M00 complete: executable PlaceLimitOrder contract' \
  2aa9f344cf1b57dd84b622362ecc0c6866121145
```

官方 [`course/m00-complete`](https://github.com/lcha-reln/cex-matching/tree/course/m00-complete) 已经存在。学习者只能获取和核验，不能重建或移动它：

```bash
git fetch origin tag course/m00-complete
git cat-file -t course/m00-complete
git rev-list -n 1 course/m00-complete
```

输出必须依次包含对象类型 `tag` 和 peeled commit：

```text
tag
2aa9f344cf1b57dd84b622362ecc0c6866121145
```

完成提交被三个 ref 触发的 CI 从不同角度检查：

| Ref | 成功运行 | 它增加的证据 |
| --- | --- | --- |
| `unit/m00` | [33032428721](https://github.com/lcha-reln/cex-matching/actions/runs/33032428721) | 实现分支能生成 PASS 与 evidence |
| `course/m00-complete` | [33032428741](https://github.com/lcha-reln/cex-matching/actions/runs/33032428741) | 额外验证 annotated tag、peeled commit、manifest source 与 unitTag 同一 |
| `main` | [33032644868](https://github.com/lcha-reln/cex-matching/actions/runs/33032644868) | 同一完成提交已进入默认集成分支 |

只有 tag run 会执行 identity step。它要求：

```bash
test "$(git cat-file -t "$GITHUB_REF_NAME")" = tag
peeled="$(git rev-list -n 1 "$GITHUB_REF_NAME")"
test "$peeled" = "$(jq -r '.source.commit' build/lab-evidence/M00/manifest.json)"
test "$GITHUB_REF_NAME" = "$(jq -r '.unitTag' build/lab-evidence/M00/manifest.json)"
```

真实成功运行 [33032428741](https://github.com/lcha-reln/cex-matching/actions/runs/33032428741) 的 `headSha` 正是 `2aa9f344cf1b57dd84b622362ecc0c6866121145`，其中 “Verify annotated complete tag identity” 和 “Upload M00 evidence” 都成功。分支 CI 即使在相同 commit 上全绿，也不能替代这一步。

## course complete 不是产品 release，M00 到此停止

`course/m00-complete` 冻结的是一个教学单元的完成合同：从哪个 start ref 出发、哪笔源码通过、五项 claim 绑定哪些字节、边界有哪些。它没有创建 `matching-*` 语义版本 tag，manifest 中的 `productRelease` 也必须为 `null`。

这意味着 M00 可以保证：固定 fixture 的业务结果与规范字节可复现；100 次新鲜重放摘要一致；指定 semantic mutant 被业务断言杀死；`matching-core` 没有越过当前架构边界；官方 annotated tag、manifest 与完成提交的身份已经由 tag CI 对齐。

它仍不能保证订单已被接受、进入订单簿、产生交易、持久化或在节点故障后恢复，也没有任何吞吐与延迟结论。不要新增 `matching-0.0.1` 来“庆祝”课程完成，不要把 CI artifact 当成已部署服务，更不要把 `CODE_VERIFIED` 改写成 production ready。

M00 在这里停止。下一单元可以引用不可移动的完成 ref 和五项证据继续增加一个复杂度维度，但不能回写这个 tag、删除 limitations，或用一次新的本地 PASS 改写已经发布的身份历史。
