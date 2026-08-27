---
title: "Vector API 与 SIMD：数据布局、自动向量化、边界条件与基准证据"
description: 从 lane 独立性与连续数据布局出发，解释 JDK 25 Vector API 的 species、mask、尾部和标量 fallback，区分 C2 SuperWord 与显式向量程序，并用正确性、JMH、机器码和 PMU 建立可证伪的 SIMD 性能证据。
date: 2026-08-27T20:01:21+08:00
updated: 2026-08-27T20:01:21+08:00
tags:
  - Java 性能
  - Vector API
  - SIMD
  - HotSpot
  - JIT
  - JMH
  - 低延迟
permalink: java-vector-api-simd-data-layout-auto-vectorization-benchmarks
series: performance
seriesOrder: 45
featured: false
draft: false
---

把一个逐元素循环改写成 `IntVector`，并不等于 CPU 一定执行了 SIMD；看到更短的 benchmark 时间，也不等于收益来自向量指令。数据可能在进入算术单元之前就被对象布局和内存带宽限制，尾部可能悄悄越界，C2 可能把不受支持的操作退回标量实现，而浮点重排还可能改变程序结果。

本文的主张是：**Vector API 的价值，是显式表达稳定的数据并行语义，而不是承诺固定指令或固定加速比。** 只有数据布局提供连续且互不依赖的 lane，尾部与数值行为仍满足标量合同，HotSpot 在目标 ISA 上确实生成 SIMD，并且正确性、JMH、机器码与 PMU 证据相互支持时，才能说一次向量化优化成立。

这是“Java 低延迟工程”的 Chapter 05。上一章 [HotSpot 如何执行你的代码](/signal-grid-blog/posts/hotspot-execution-tlab-escape-analysis-jit-deoptimization-safepoint/) 已解释 C2 如何依据运行时事实生成和撤销优化；本文把这个模型落实到数据并行循环。下一章 [Java 低延迟 GC](/signal-grid-blog/posts/java-low-latency-gc-allocation-live-set-g1-zgc-shenandoah/) 会继续追踪对象分配、Live Set 和回收余量。这里不重讲 CPU cache、JIT 预热或 JMH 基础操作，只回答：**怎样建立一个语义正确、能够 lowering、并且有充分证据支持的 SIMD 主张。**

版本边界是 **OpenJDK JDK 25**。Vector API 在 JDK 25 由 [JEP 508](https://openjdk.org/jeps/508) 继续第十次孵化，位于 `jdk.incubator.vector` 模块；它既不是最终标准 API，也不是 preview language feature。下文使用 JDK 25 API 与 HotSpot C2 为参考实现，其他 JVM、后续孵化版本和不同 CPU 后端都可能改变可用 shape、lowering 与性能。

## 1. SIMD 优化首先要证明 lane 独立，而不是先选择向量宽度

考虑一个逐元素的 affine-and-clamp kernel：`y[i] = min(max(x[i] * scale + bias, low), high)`。

当 `scale`、`bias`、`low` 与 `high` 在一次调用中不变，并且第 i 个输出只依赖第 i 个输入时，不同下标可以作为独立 lane 同时计算。这里真正允许向量化的不是“循环很短”，而是三个合同：

1. **依赖合同**：一个 lane 不读取另一个 lane 尚未写完的结果；
2. **内存合同**：输入输出的重叠方式已定义，迭代次序不是隐藏语义；
3. **数值合同**：向量实现与标量实现采用相同的溢出、舍入和特殊值规则。

前缀和、递推滤波、逐元素状态机和提前退出搜索看起来也有循环，却可能带有循环携带依赖。反过来，一个表达式即使包含多次乘加，只要 lane 间没有信息流，仍可能适合 SIMD。是否“每轮处理四个或八个元素”是合同成立之后的实现选择，不能反过来替代正确性证明。

还要先定义性能主张。这个 kernel 每个元素至少读取 4 B、写入 4 B，因此不计 write allocate、缓存一致性和额外元数据时，处理 N 个元素的数据流量下界已经是约 8N B。小工作集可能受算术吞吐和固定调用成本限制；越过末级缓存后，瓶颈可能变成可持续内存带宽。即使机器码把四次标量乘法合成一次向量乘法，也不能突破已经饱和的内存通路。

所以本文要检验的不是抽象命题“SIMD 比标量快”，而是一个带边界的命题：**在给定 JDK、CPU、输入分布、数组规模和调用形状下，显式 Vector API 是否保持语义，并相对默认 HotSpot 能生成的最佳标量源码获得可重复收益。**

## 2. 数据布局决定 SIMD 在进入算术单元之前已经损失多少

`IntVector.fromArray(species, array, offset)` 表达的是从连续的 primitive array 读取单位步长 lane。它恰好对应 CPU 最容易合并的连续 load。若业务数据是对象数组，每个元素先保存对象引用，字段再散落在不同对象中，CPU 必须先追逐引用，才能找到真正参与计算的字段。

| 数据形状                           | 访问路径                          | 对向量化的直接影响                                  |
| ---------------------------------- | --------------------------------- | --------------------------------------------------- |
| `int[] prices`、`int[] quantities` | 每个字段分别连续，即 SoA          | 容易形成单位步长 load/store，也容易估算字节流量     |
| `Quote[]`，每个 `Quote` 是对象     | 数组连续的是引用，不是对象字段    | 字段读取包含间接寻址，可能被延迟和 cache miss 主导  |
| 一个交错的 primitive buffer        | 地址连续，但目标字段带固定 stride | 可能需要重排、shuffle 或先转换布局                  |
| 索引数组驱动的离散读取             | 需要 indexed load/gather          | API 能表达不等于目标 ISA 上成本低，更不等于一条指令 |

[JDK 25 `IntVector` API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/IntVector.html) 同时提供连续数组访问与带索引映射的访问重载。这个能力边界不应被读成性能等价：连续单位步长 load 是基线，gather 是否有硬件支持、需要多少地址计算、会触发多少 cache line，都必须在目标平台重新证明。

### 对齐是地址属性，不是性能保证

Java SE 没有承诺普通堆数组的数据区按某个 cache line 或 SIMD 宽度对齐。HotSpot 的对象对齐参数描述对象布局约束，不能直接升级为“数组首元素满足 32 B 或 64 B 对齐”的跨 JVM 合同。C2 可以在特定循环中使用 peel、版本化或运行时检查处理对齐，但这是当前编译结果，不是源码语义。

如果确实需要显式的 native 地址对齐，Foreign Function & Memory API 的 `Arena.allocate(byteSize, byteAlignment)` 可以请求满足给定对齐约束的 `MemorySegment`；[JDK 25 `Arena` API](https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/lang/foreign/Arena.html) 规定的是地址合法性和生命周期，不承诺 HotSpot 必然选择某条 aligned load，也不承诺这样一定更快。对齐、cache line 使用和生成指令仍要分别观测。

### alias 必须成为 API 合同的一部分

如果 `src` 与 `dst` 是不同数组，逐元素 kernel 的所有权最清楚。如果二者是同一个数组、读取和写入完全相同的范围，下面的实现也安全：每一组 lane 会先完成 load，再写回同一组位置。

但只要 API 增加 `srcOffset` 和 `dstOffset`，错位重叠就可能改变含义。例如向右平移写入时，前向迭代会覆盖后续尚未读取的数据。此时必须禁止重叠、根据方向选择迭代顺序，或先把输入暂存到独立区域。不能一边依赖标量循环的顺序语义，一边又要求编译器自由并行这些迭代。

## 3. Species 提供可移植 shape，但不会承诺最快机器码

JDK 25 的 classpath 示例需要显式解析孵化模块：

```bash
javac --release 25 \
  --add-modules jdk.incubator.vector \
  -Xlint:all \
  VectorAffineClampDemo.java

java --add-modules jdk.incubator.vector \
  VectorAffineClampDemo
```

运行时出现 `WARNING: Using incubator modules: jdk.incubator.vector` 是正常的孵化模块提示；这里不需要 `--enable-preview`。模块化项目还需在 `module-info.java` 中声明 `requires jdk.incubator.vector;`，但编译和运行仍要让目标 JDK 包含这个孵化模块。

向量 shape 由 lane 类型和 species 共同描述。本文使用的四个入口承担不同职责：

| API                                   | 它回答的问题                            | 不应从中推导什么                   |
| ------------------------------------- | --------------------------------------- | ---------------------------------- |
| `IntVector.SPECIES_PREFERRED`         | 当前平台偏好的 `int` species 是什么     | 该 shape 对所有 kernel 都最快      |
| `species.length()`                    | 一次逻辑向量包含多少个 `int` lane       | CPU 必然执行同样数量的单条硬件操作 |
| `species.loopBound(length)`           | 不超过 `length` 的最大完整向量边界      | 尾部已经自动处理                   |
| `species.indexInRange(offset, limit)` | 哪些 lane 的 `offset + lane` 落在范围内 | mask 本身没有执行和寄存器成本      |

`SPECIES_PREFERRED` 让代码不必硬编码 AVX2、AVX-512、NEON 或 SVE 的宽度，但“preferred”仍是平台级默认 shape，不是 workload benchmark 的结论。[JDK 25 `VectorSpecies` API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/VectorSpecies.html) 提供了 `length`、`loopBound` 与 `indexInRange` 的精确定义。

Vector API 的运行时会尝试把向量操作编译为目标平台的向量指令；[JDK 25 package specification](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/package-summary.html) 同时明确保留每个操作的默认标量实现。如果程序在只适合较窄向量的平台强行请求过宽 shape，或者某个 operator/shape 组合没有合适的后端 lowering，语义仍可由 fallback 保持，但性能主张已经失效。固定 512-bit species 既不是“自动拆成最优原生向量”的保证，也不是跨机器可移植的调优策略。

## 4. 显式主循环必须把完整向量与尾部写成同一份语义

下面的 JDK 25 程序包含标量 oracle、显式 Vector API kernel、masked tail，以及独立数组和原地更新验证。它故意使用会发生 `int` 溢出的乘加，因为“为了方便验证而改用 `long`”会改变要证明的 Java 语义。

```java
import java.util.Arrays;
import java.util.SplittableRandom;

import jdk.incubator.vector.IntVector;
import jdk.incubator.vector.VectorMask;
import jdk.incubator.vector.VectorOperators;
import jdk.incubator.vector.VectorSpecies;

public final class VectorAffineClampDemo {
    private static final VectorSpecies<Integer> SPECIES =
            IntVector.SPECIES_PREFERRED;

    private static void scalar(
            int[] src,
            int[] dst,
            int scale,
            int bias,
            int low,
            int high) {

        for (int i = 0; i < src.length; i++) {
            int value = src[i] * scale + bias;
            value = Math.max(value, low);
            value = Math.min(value, high);
            dst[i] = value;
        }
    }

    private static void vector(
            int[] src,
            int[] dst,
            int scale,
            int bias,
            int low,
            int high) {

        IntVector vScale = IntVector.broadcast(SPECIES, scale);
        IntVector vBias = IntVector.broadcast(SPECIES, bias);
        IntVector vLow = IntVector.broadcast(SPECIES, low);
        IntVector vHigh = IntVector.broadcast(SPECIES, high);

        int i = 0;
        int upper = SPECIES.loopBound(src.length);

        for (; i < upper; i += SPECIES.length()) {
            IntVector value = IntVector.fromArray(SPECIES, src, i)
                    .lanewise(VectorOperators.MUL, vScale)
                    .lanewise(VectorOperators.ADD, vBias)
                    .lanewise(VectorOperators.MAX, vLow)
                    .lanewise(VectorOperators.MIN, vHigh);

            value.intoArray(dst, i);
        }

        if (i < src.length) {
            VectorMask<Integer> tail =
                    SPECIES.indexInRange(i, src.length);

            IntVector value = IntVector.fromArray(
                            SPECIES, src, i, tail)
                    .lanewise(VectorOperators.MUL, vScale)
                    .lanewise(VectorOperators.ADD, vBias)
                    .lanewise(VectorOperators.MAX, vLow)
                    .lanewise(VectorOperators.MIN, vHigh);

            value.intoArray(dst, i, tail);
        }
    }

    private static void verifyLength(int length) {
        SplittableRandom random = new SplittableRandom(42 + length);
        int[] src = new int[length];

        for (int i = 0; i < length; i++) {
            src[i] = random.nextInt();
        }

        if (length > 0) {
            src[0] = Integer.MIN_VALUE;
        }
        if (length > 1) {
            src[1] = Integer.MAX_VALUE;
        }

        int[] expected = new int[length];
        int[] actual = new int[length];

        scalar(src, expected, 31, 17, -1_000_000, 1_000_000);
        vector(src, actual, 31, 17, -1_000_000, 1_000_000);

        if (!Arrays.equals(expected, actual)) {
            throw new AssertionError("length=" + length);
        }

        int[] expectedInPlace = src.clone();
        int[] actualInPlace = src.clone();

        scalar(expectedInPlace, expectedInPlace,
                31, 17, -1_000_000, 1_000_000);
        vector(actualInPlace, actualInPlace,
                31, 17, -1_000_000, 1_000_000);

        if (!Arrays.equals(expectedInPlace, actualInPlace)) {
            throw new AssertionError("in-place length=" + length);
        }
    }

    public static void main(String[] args) {
        int lanes = SPECIES.length();

        int[] lengths = {
                0,
                1,
                Math.max(0, lanes - 1),
                lanes,
                lanes + 1,
                Math.max(0, 2 * lanes - 1),
                2 * lanes,
                2 * lanes + 1,
                1025
        };

        for (int length : lengths) {
            verifyLength(length);
        }

        System.out.printf(
                "species=%s lanes=%d verified=%d lengths%n",
                SPECIES, lanes, lengths.length);
    }
}
```

主循环中的 `fromArray` 先把完整 lane 读入向量，再通过 `lanewise` 表达逐 lane 的乘、加、最大值和最小值，最后由 `intoArray` 写回。这里显式表达了计算 shape，却仍由 C2 决定怎样映射到寄存器和指令。

`loopBound` 返回不大于数组长度的最大 species lane 数倍数，因此完整 load/store 不会跨过数组尾部。余数部分由 `indexInRange` 生成 mask：masked load 只对选中 lane 做边界检查和读取，未选中 lane 以零填充；计算仍可覆盖所有逻辑 lane，但 masked store 只写选中位置。只给 load 加 mask、最后执行完整 store，仍然会越界；先执行完整 load 再生成 mask，也无法补救已经发生的非法访问。

这个尾部分支不是“性能清理代码”，而是同一个函数合同的第二条执行路径。长度小于 species 时，整个调用都走 masked path；长度正好是整倍数时，分支完全不执行；`L - 1`、`L`、`L + 1` 因而是比单个大数组更有信息量的边界样本。

## 5. 正确性矩阵必须覆盖数值语义、尾部与 alias

示例中的标量 oracle 和向量 kernel 都先以 Java `int` 完成乘法和加法，溢出按二进制补码低 32 位回绕，再执行 clamp。[JLS 25 §15.17.1](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.17.1) 与 [§15.18.2](https://docs.oracle.com/javase/specs/jls/se25/html/jls-15.html#jls-15.18.2) 给出了整数乘法和加法的溢出边界。若 oracle 使用 `long` 计算后才截断，或者使用 `Math.multiplyExact`，它验证的是另一份程序。

测试矩阵不是为了增加用例数量，而是让每个容易分叉的语义都有反例：

| 维度    | 代表样本                                            | 证明义务                                                |
| ------- | --------------------------------------------------- | ------------------------------------------------------- |
| 长度    | `0`、`1`、`L-1`、`L`、`L+1`、`2L±1`、大型非整倍数   | 空输入、全 mask、无尾部、单 lane 尾部和多轮主循环都合法 |
| 整数值  | `0`、负数、`MIN_VALUE`、`MAX_VALUE`、固定种子随机值 | 回绕、clamp 顺序和符号处理与 oracle 一致                |
| alias   | 独立数组、同数组同范围、错位重叠                    | 前两者输出一致；错位重叠必须被 API 拒绝或有独立算法     |
| species | preferred shape、一个目标平台不擅长的固定 shape     | 输出不随 shape 改变；性能结论允许因 fallback 改变       |
| ISA/JDK | 目标生产 CPU、至少一个不同 ISA 或构建（若有）       | 语义可移植；机器码与加速比明确绑定环境                  |

浮点 kernel 不能直接沿用“逐 bit 相等”的证明规则。[JDK 25 `FloatVector` API](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/FloatVector.html) 与 [`VectorOperators`](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/VectorOperators.html) 暴露了几个必须提前选择的语义：

- `fma` 逐 lane 使用融合乘加语义，只舍入一次，结果可以不同于先 `mul` 再 `add`；
- `reduceLanes(ADD)` 不承诺按标量循环从左到右的固定结合顺序，舍入误差可能随归约树改变；
- `MIN`、`MAX`、比较与默认值判断必须覆盖 NaN、正负无穷和 `+0.0/-0.0`；
- 如果业务依赖 NaN payload、signed zero 或 subnormal，合同必须精确到 bit pattern，不能只给普通有限数设置一个模糊 epsilon。

因此浮点测试要先说明哪些操作要求 exact equivalence，哪些允许 absolute、relative 或 ULP 误差，以及 NaN 和 signed zero 怎样比较。Java 的严格浮点求值规则不会把一个允许重排的向量 reduction 自动变回标量左折叠。

## 6. SuperWord 与 Vector API 的区别，在于谁负责表达并行性

默认 HotSpot 的标量源码并不等于标量机器码。C2 的 SuperWord 会分析循环里的内存依赖和标量操作，尝试把相邻、独立的节点组成 pack，再检查后端是否支持目标向量操作。JDK 25 HotSpot 的 [`superword.cpp`](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/superword.cpp) 可以看到内存依赖图、pack 构造、后端支持检查以及运行时 alias/alignment 检查等实现路径。

两条路线的责任边界不同：

| 路线                 | 并行关系由谁表达                             | 主要失败方式                                           | 语义 fallback             |
| -------------------- | -------------------------------------------- | ------------------------------------------------------ | ------------------------- |
| 标量循环 + SuperWord | C2 从标量 IR 推断                            | 循环形状、控制流、alias、调用或后端能力阻断 pack       | 保持原标量循环            |
| Vector API           | 程序显式给出 species、lane operation 与 mask | operator/shape 未有效 lowering，或数据移动成本压过算术 | Vector API 的默认标量实现 |

显式 Vector API 减少了“编译器能否从源码猜出作者意图”的不确定性，却没有绕过 C2，也没有给任何 operator 绑定固定机器指令。同一条 `lanewise` 可能成为一条硬件指令、多条指令、运行时 stub，或标量展开。调用 API 只能证明意图进入了 IR，不能证明 lowering 的结果。

这也决定了公平基线。生产比较应保留默认启用的 `UseSuperWord`，让普通标量实现获得 HotSpot 本来就会做的优化。另开一个 fork 使用 `-XX:-UseSuperWord`，可以回答“标量基线的收益有多少来自自动向量化”，却不能拿这个故意限制的结果宣称显式 API 对正常 Java 获得相同加速。

下面这些诊断分别回答不同问题：

```bash
java -XX:+PrintFlagsFinal -version

java --add-modules jdk.incubator.vector \
  -XX:+PrintCompilation \
  VectorAffineClampDemo

java --add-modules jdk.incubator.vector \
  -XX:+UnlockDiagnosticVMOptions \
  -XX:+PrintAssembly \
  VectorAffineClampDemo
```

`PrintCompilation` 只能证明哪些方法进入了哪些编译层级，不能证明存在 SIMD。`PrintAssembly` 还依赖当前 JDK 能获得可用反汇编器；即使输出出现 `vpmulld`、`vpaddd` 或 NEON 指令，也要确认它们位于 benchmark 的热 kernel，而不是数组初始化、校验或其他库代码。

## 7. 基准必须把“更快”拆成正确性、编译与硬件三层证据

一个可信实验至少包含三组实现：

- 标量源码，保持默认 SuperWord，代表正常 HotSpot 基线；
- 同一标量源码，在独立 fork 禁用 SuperWord，只用于归因；
- 显式 Vector API，使用相同输入、输出与数值合同。

长度不能只选一个恰好整除 species 的大数组。应同时测 `L-1/L/L+1` 等尾部占比高的短输入，以及多个 cache/内存工作集；这些层级必须按目标机器的实际 cache 容量分类，不能把固定的“1 MiB”跨机器命名成 L2。对大数组报告 elements/s 或 bytes/s，比跨长度直接比较 `ns/op` 更能表达真实吞吐。

### JMH 负责隔离测量，但不会替你定义正确性

[OpenJDK JMH](https://github.com/openjdk/jmh) 建议把 benchmark 放进独立生成的工程。这里的关键不是注解数量，而是避免三种会直接改变结论的混杂：

1. benchmark 结果必须返回给 harness 或交给 `Blackhole`，否则未被观察的 kernel 可能被 dead-code elimination 删除；[JMH dead-code sample](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_08_DeadCode.java) 展示了这种差异；
2. 标量、禁用 SuperWord 和 Vector API 应使用独立 fork，避免前一个实验留下的 profile、编译代码和 JVM 参数污染后一个实验；[JMH forking sample](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_12_Forking.java) 解释了原因；
3. warmup、measurement 和 fork 数要作为实验记录保存，而不是只保留最终均值；[JMH annotation sample](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_20_Annotations.java) 给出相应配置入口。

Vector benchmark 的 fork 也必须携带 `--add-modules=jdk.incubator.vector`。输入数组应在 trial 或 iteration setup 中按固定种子构造，不能在 timed body 里分配和随机填充；正确性矩阵应在计时之外先运行。若 timed body 通过返回 `dst` 防止 DCE，要确保三组实现采取同样方式，不能只有一组额外计算 checksum。

### 每种观测只证明证据链的一层

| 证据                                   | 可以支持的主张                             | 不能单独支持的主张                           |
| -------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| 标量 oracle 与边界矩阵                 | 两个实现满足已定义语义                     | 热路径使用 SIMD                              |
| JMH score 与分布                       | 指定实验条件下吞吐或耗时不同               | 差异由哪条指令造成                           |
| `PrintCompilation` 或 JMH `-prof comp` | 目标方法已编译及其层级                     | C2 已生成向量机器码                          |
| assembly 或 JMH `-prof perfasm`        | 热地址附近出现目标 ISA 的向量指令          | 采样地址归因绝对精确，或所有输入都走同一路径 |
| JMH `-prof perf` / `perfnorm`          | cycles、instructions、cache/TLB 等计数趋势 | 程序正确，或某个计数变化单独构成因果证明     |

[JMH profiler sample](https://github.com/openjdk/jmh/blob/master/jmh-samples/src/main/java/org/openjdk/jmh/samples/JMHSample_35_Profilers.java) 特别提醒：PMU 对指令地址的归因存在采样偏差，热点可能落到邻近指令。反汇编适合证明“目标热路径确实 lowering 为 SIMD”，PMU 适合判断“瓶颈更像指令、前端、cache 还是带宽”，二者都不能替代语义 oracle。

最终判定规则应当可证伪：如果输出不一致，优化直接失败；如果输出一致但机器码没有 SIMD，只能说 API fallback 正确；如果有 SIMD 但 relevant workload 没有稳定收益，说明数据移动、尾部或其他瓶颈吞掉了并行算术；只有正确性成立、热代码完成预期 lowering、收益在业务相关规模上重复出现，并且 PMU 趋势没有与解释冲突时，才接受“这次 Vector API 优化有效”。

## 8. 能被接受的不是一段向量代码，而是一条闭合的因果链

SIMD 首先要求 lane 间没有隐藏依赖，数据布局再决定这些 lane 能否以足够低的成本进入寄存器。Species 让同一份源码适配平台偏好的 shape，却不保证每个操作都映射成硬件向量指令；mask 保持尾部访问合法，也不会自动消除短输入的固定成本。

显式 Vector API 和 SuperWord 不是“手写优化”与“完全没有优化”的对照。前者由程序声明并行结构，后者由 C2 从标量循环推断并行结构，两者最终都受 HotSpot IR、后端 ISA、alias 和数据通路约束。公平实验必须让默认标量基线保留自动向量化能力，再用禁用 SuperWord 的独立 fork 做归因。

因此，Vector API 能保证的是孵化 API 所定义的 lane、mask 与 fallback 语义；它不能保证固定指令、固定宽度或固定加速比。真正让性能主张可信的，是从标量合同、边界矩阵、JIT 编译、热区反汇编到 PMU 和业务规模结果都没有断裂。建立这条证据链之后，才能把“CPU 一次算更多元素”与下一章的资源问题区分开：向量化可以减少算术指令，却不会消除对象分配、Live Set、回收工作或内存带宽上限。

### 官方一手资料

- [JEP 508：Vector API（Tenth Incubator）](https://openjdk.org/jeps/508)
- [JDK 25 Vector API package specification](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/package-summary.html)
- [JDK 25 VectorSpecies](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/VectorSpecies.html)
- [JDK 25 IntVector](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/IntVector.html)
- [JDK 25 FloatVector](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/FloatVector.html)
- [JDK 25 VectorOperators](https://docs.oracle.com/en/java/javase/25/docs/api/jdk.incubator.vector/jdk/incubator/vector/VectorOperators.html)
- [OpenJDK 25 HotSpot SuperWord implementation](https://github.com/openjdk/jdk/blob/jdk-25-ga/src/hotspot/share/opto/superword.cpp)
- [OpenJDK JMH](https://github.com/openjdk/jmh)
