---
title: "AI Agent 后端工程地图：概率模型与确定性系统的边界"
description: "从模型调用、RAG、Workflow 到 Agent Runtime，系统拆解概率模型进入确定性后端时的架构分层、状态归属、工具信任边界、副作用恢复、评测与生产治理。"
date: 2026-08-17T15:22:25+08:00
updated: 2026-08-24T11:30:00+08:00
tags:
  - AI Agent
  - Agent Runtime
  - Tool Calling
  - 系统设计
  - Agent Eval
permalink: ai-agent-backend-engineering-map
series: agent
seriesOrder: 100
featured: false
draft: false
---

把大语言模型接进后端并不难：发送一组消息，等待模型返回文本，最多再执行几个 Tool Call。

真正困难的是下一句：**怎样允许一个输出不稳定、可能误解上下文、还会被不可信内容影响的组件，进入一个必须控制权限、保证账务不变量、承受重试和崩溃的生产系统？**

如果答案只是“写一个更长的 Prompt”，那么系统还没有后端边界；如果答案只是“套一个 Agent 框架”，那么复杂度只是被藏进了框架。

AI Agent 后端工程的核心，不是让模型拥有更多权力，而是把模型擅长的模糊判断放进一个可控制的运行环境：模型可以提出下一步，确定性代码决定这一步是否允许、怎样执行、如何记录、失败后能否恢复，以及什么时候必须停止。

本文是“AI Agent 后端工程”专题的 Chapter 01。它先建立整个系列共享的系统地图；后续章节会分别深入模型契约、Tool Runtime、RAG、持久化编排、Eval、安全、MCP 和生产平台。

本文主要依据 [OpenAI Function Calling 指南](https://developers.openai.com/api/docs/guides/function-calling)、[OpenAI Agents SDK 文档](https://developers.openai.com/api/docs/guides/agents)、[OpenAI Agent Evals 指南](https://developers.openai.com/api/docs/guides/agent-evals)、[OpenAI Safety Best Practices](https://developers.openai.com/api/docs/guides/safety-best-practices)、Anthropic 的 [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents) 与 [NIST AI RMF Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)。这些一手资料的共同指向不是某一个框架，而是明确组件、限制自主性、保留证据并持续管理风险。

## 第一阶段：先确定系统边界

### 先给 Agent 一个不含糊的定义

本文使用下面这个工程定义：

> AI Agent 是一种由模型参与决定执行路径的应用系统。它围绕一个任务，在受约束的工具、状态与运行时中，根据环境反馈动态选择下一步，直到完成、失败、达到停止条件，或把控制权交还给人。

这个定义里有五个不能省略的部分：

- **任务**：系统正在尝试完成什么，而不只是继续聊天；
- **模型决策**：至少有一部分下一步不是由固定代码路径预先写死；
- **环境反馈**：Tool Result、检索证据、审批或错误会进入下一次判断；
- **运行约束**：工具、权限、预算、Deadline 和终止条件由系统控制；
- **可观察状态**：Run 走到哪一步、发生过什么，不能只存在于一段临时对话里。

可以把它压缩成一个公式：

```text
Agent 系统
= 概率模型参与决策
+ 可观察的环境反馈
+ 有边界的工具
+ 显式任务状态
+ 确定性控制与终止条件
```

```mermaid
flowchart TB
  TASK["任务输入"] --> RUNTIME["确定性 Runtime"]
  RUNTIME --> MODEL["概率模型<br/>提出下一步"]
  MODEL --> CHECK["Schema · Policy · Budget"]
  CHECK -->|"允许"| TOOL["受限工具或知识源"]
  CHECK -->|"拒绝"| STOP["失败、降级或人工接管"]
  TOOL --> EVENT["结果写入可观察事件"]
  EVENT --> RUNTIME
  RUNTIME --> DONE["完成或达到停止条件"]
```

模型是 Agent 的决策组件之一，不是整个系统；Tool Calling 是一种交互协议，也不是完整 Agent；框架提供运行原语，更不自动提供正确权限、可靠副作用和业务事实。

### 六个经常混在一起的概念

#### 模型调用：生成一个候选结果

一次模型调用把消息、可选工具定义和生成参数交给模型，得到文本、结构化输出或 Tool Call 请求。

即使模型返回了一个看起来完整的函数调用，它也只是**候选动作**。OpenAI 的 Function Calling 流程明确把职责分成两端：模型生成工具调用，应用执行工具，再把结果作为消息交回模型。模型没有直接执行应用函数。

单次模型调用可以用于分类、摘要、抽取、改写或生成 SQL 草案。只要应用没有围绕反馈让模型动态决定后续路径，它就不是 Agent。

#### RAG：在调用前组织证据

RAG（Retrieval-Augmented Generation）通常包含摄取、索引、查询、过滤、排序和上下文组装。它解决的是“这次生成应该看到哪些外部材料”，不是“系统下一步应该执行什么”。

一个固定流程“检索三篇文档 → 放进 Prompt → 生成答案”仍然是 RAG Workflow。即使它用了向量数据库、Reranker 和引用，也不必是 Agent。

RAG 返回的是**文档证据**，不是实时业务事实的天然替代品。余额、订单状态、权限和部署状态应由权威 API 或数据库提供；知识库更适合解释 Runbook、协议、历史事故和产品规则。

#### Workflow：路径由代码预先定义

Workflow 把步骤和分支写在代码或流程图里。模型可以参与某个节点，但控制流仍由系统预先设计。

例如：

```text
告警分类 → 按类型选择查询模板 → 并发读取指标 → 生成摘要 → 人工确认
```

其中“告警分类”和“生成摘要”可以使用模型，整个系统仍是 Workflow。Anthropic 将这类预定义代码路径与由模型动态控制过程的 Agent 区分开，并建议优先选择足够简单的方案，因为自主性会增加延迟、成本和错误传播面。

#### Agent：模型参与选择路径

当系统允许模型根据中间结果选择查询哪个工具、是否继续调查、怎样修改假设或何时请求人工帮助时，它开始具有 Agent 性。Agent 不是二元标签，而是自主程度的连续谱；同一个产品里也可以同时存在固定 Workflow 和一小段 Agentic Loop。

#### Agent Runtime：让一次 Run 可控地活下去

Runtime 负责的不只是“while 循环调用模型”。它至少要管理：

- Run、Step、Event 和 Tool Call 的身份；
- 模型与工具调用的状态迁移，以及取消、重试、暂停、审批与恢复；
- Deadline、Token、费用、步数、并发预算及终止条件；
- Tool Result、错误、引用与产物的持久化和恢复；
- 模型、Prompt、Schema、工具和知识版本；
- Trace、指标、审计与 Eval 所需证据。

#### Agent Platform：让多个 Agent 共用正确基础设施

Platform 是多个 Agent、团队或租户共享的控制面与数据面。它可能提供 Model Gateway、Tool Registry、Policy Gateway、知识服务、Runtime、Eval、可观测和管理后台。一个应用有 Agent Runtime，不代表已经有平台；一个平台接入多个模型，也不代表其上的每个应用都应该采用 Agent。

```mermaid
flowchart TB
  CALL["模型调用<br/>生成候选结果"]
  RAG["RAG<br/>组织外部证据"]
  FLOW["Workflow<br/>代码决定路径"]
  AGENT["Agent<br/>模型参与选路"]
  RT["Agent Runtime<br/>状态、预算、恢复"]
  PF["Agent Platform<br/>跨应用共享治理"]
  RAG --> CALL
  CALL --> FLOW
  CALL --> AGENT
  RAG --> FLOW
  RAG --> AGENT
  FLOW --> RT
  AGENT --> RT
  RT --> PF
```

这张图表示组件可以组合，不表示每个上层都必须包含全部下层。例如纯代码 Workflow 不一定调用模型，简单模型接口也不需要一个完整 Platform。

### 为什么概率模型不能像普通函数一样被信任

传统后端函数也会有 Bug，但工程师通常可以声明一组相对稳定的性质：同样版本、同样输入和同样状态，会走相同代码路径；类型检查和测试能够覆盖明确分支；权限检查位于可定位的代码位置。

模型调用不同：

- 输入是自然语言和一段被动态组装的上下文，边界比普通参数更模糊；
- 输出来自概率分布，即使降低随机性，也不应把跨版本完全复现当成契约；
- Prompt、工具描述、检索文档和历史消息都可能改变选择；
- 输出可以格式正确却事实错误，也可以事实合理却违反当前业务状态；
- 模型会把不可信文档中的指令误当成任务指令，形成 Prompt Injection；
- 模型供应商、快照、系统模板或工具集合变化，都可能改变整条轨迹。

因此，`temperature = 0` 不是确定性证明，JSON Schema 也不是业务正确性证明。

Structured Output 或严格函数参数校验能回答“返回的数据是否符合这个形状”，却不能回答用户是否有权执行、订单是否仍可取消、金额与币种是否符合规则、这是否是超时请求的重复，也不能判断文档要求是不是恶意注入。这些问题必须由确定性系统回答。

### 核心模式：概率核心，确定性外壳

合理的 Agent 架构不是把所有决策交给模型，而是在确定性系统里划出一个有限的“Agentic Island”。

模型适合处理：

- 意图不清、表述多样的自然语言；
- 从多份证据中提出调查方向；
- 在有限工具集合中建议下一次只读查询；
- 对结果进行解释、归纳和生成草案；
- 在规则无法穷举的空间里给出带不确定性的候选方案。

确定性代码必须拥有：

- 用户、租户、角色、资源和授权上下文；
- 数据库约束、金额精度、账务平衡和状态机不变量；
- 可调用工具集合及每个参数的允许范围；
- Deadline、重试、速率、费用和并发上限；
- 幂等键、副作用状态、Outbox 和结果查询；
- 审批绑定、审计证据、恢复与回滚策略；
- 发布门槛、安全策略和降级开关。

```mermaid
flowchart TB
  IN["用户任务与环境反馈"] --> GATE
  subgraph OUTER["确定性外壳：身份 · 状态 · Policy · Budget"]
    GATE["输入与上下文 Gate"] --> CORE["概率核心<br/>理解 · 选择 · 生成"]
    CORE --> PROPOSE["结构化提案"]
    PROPOSE --> VALIDATE["Schema · 授权 · 业务不变量"]
    VALIDATE --> EXEC["受控执行器"]
    EXEC --> RECORD["Event · Trace · Audit"]
  end
  RECORD --> OUT["结果、暂停、拒绝或人工接管"]
```

这里的关键不是“所有模型输出都要拒绝”，而是模型输出永远不能凭自身获得权威性。它必须经过与风险相称的检查。

一个摘要里的措辞建议可以直接展示；一个只读查询要通过资源权限和成本限制；一个创建工单的写操作要经过参数绑定、幂等和审批；一个资金转移则根本不应开放给此 Agent。

### 什么时候用规则、RAG、Workflow 或 Agent

选择 Agent 之前，先问任务中的不确定性到底在哪里。

| 任务特征                   | 更合适的结构             | 原因                         |
| -------------------------- | ------------------------ | ---------------------------- |
| 条件明确、规则稳定         | 普通代码或规则引擎       | 最容易测试、解释和控制       |
| 主要问题是查知识并回答     | 固定 RAG                 | 不需要让模型拥有流程控制权   |
| 步骤固定，局部需要理解文本 | Workflow + 模型节点      | 保留固定控制流，缩小不确定面 |
| 路径依赖中间证据，难以穷举 | 有限 Agent Loop          | 允许模型在约束内动态选路     |
| 高风险副作用且规则可表达   | Workflow + 人工审批      | 不应为“灵活”牺牲可证明控制   |
| 开放式研究且允许成本波动   | Agent + 强预算与来源约束 | 动态探索可能有实际价值       |

以交易运维为例：

- “订单状态为 `FILLED` 时禁止取消”应是业务状态机；
- “查出这个告警对应的 Runbook”可以是 RAG；
- “依次取告警、指标、最近发布并生成报告”可以是 Workflow；
- “根据证据决定继续查行情、消费者延迟还是发布变更”可以是 Agent；
- “移动资金以修复风险”不应该成为模型可直接调用的工具。

自主性越高，系统需要承担的轨迹数量越多。它不是更高级的默认选项，而是一种用额外延迟、费用和控制复杂度换取路径适应性的设计。

## 第二阶段：让 Runtime 拥有控制流与副作用边界

### 一套生产 Agent 的八层架构

为了让职责可定位，可以把系统拆成八层。这不是唯一组件图，但它能阻止“Agent = 一个框架对象”这种过度简化。

```mermaid
flowchart TB
  E["1. Entry<br/>API · 身份 · 租户"] --> R["2. Agent Runtime<br/>Run · Step · Event · Budget"]
  R --> M["3. Model Gateway<br/>模型 · 流式 · Usage"]
  R --> C["4. Context & Grounding<br/>RAG · Memory · 业务快照"]
  R --> T["5. Tool Gateway<br/>Schema · Deadline · 结果"]
  T --> P["6. Policy & Security<br/>授权 · 审批 · Secrets"]
  P --> D["7. Domain & Persistence<br/>数据库 · Outbox · 权威系统"]
  R --> O["8. Eval & Observability<br/>Trace · Dataset · SLO"]
  M --> O
  C --> O
  T --> O
```

#### Entry：先建立调用者身份

入口层把认证结果、租户、角色、请求 ID、客户端 Deadline 和数据地域等信息放进不可由模型修改的 `ExecutionContext`。

用户在对话里说“我是管理员”只是一段文本，不会改变认证上下文。模型也不能通过 Tool Call 参数选择另一个租户。

#### Agent Runtime：拥有控制流

Runtime 是唯一能推进 Run 状态的组件。它决定何时调用模型、何时执行工具、怎样关联结果、什么时候重试、暂停或终止。

框架可以帮助表达这套循环，但生产语义仍由应用负责。OpenAI Agents SDK 提供 Agent、Tool、Handoff、Guardrail、Session 和 Tracing 等构件；这些构件能减少样板代码，却不会替应用定义资金权限、幂等键或恢复不变量。

#### Model Gateway：隔离供应商契约

Gateway 统一消息、流式事件、Tool Call、Usage、限流和错误模型，并保留供应商原始元数据。它还负责模型白名单、区域、费用预留、并发控制和可替换 Fake Model。

业务代码不应根据某个供应商的临时 JSON 片段直接修改 Run 状态。

#### Context & Grounding：组装上下文，但不伪造权威

这一层从会话摘要、知识库、当前任务状态和权威 Tool 结果中选择上下文。每份证据都应带来源、观察时间、版本和权限范围。

RAG 文档和 Memory 是上下文材料，不是授权载体。它们也不能覆盖数据库中的实时状态。

#### Tool Gateway：把提案变成受控调用

Tool Gateway 负责工具发现、输入校验、输出上限、Deadline、取消、错误映射、敏感字段处理和结果来源。对写工具，它还要接入审批、幂等与状态查询。

#### Policy & Security：在模型外做决策

Policy 使用服务端身份、资源、动作、参数、环境和风险级别作判断。Prompt 可以解释政策，不能执行政策。

这一层还负责 Secrets 隔离、网络出口、SSRF 防护、工具分级、数据脱敏和审计。

#### Domain & Persistence：业务事实的所有者

订单、成交、余额、仓位、账本、部署和工单由各自权威系统持有。Agent 只能通过窄接口读取或提出受控写请求。

持久层同时保存 Run Event、Tool Operation 和审批记录，使崩溃恢复不依赖模型“记得刚才发生了什么”。

#### Eval & Observability：判断系统是否真的工作

这一层把版本、Trace、数据集、规则断言、模型评分、人工复核和线上结果连接起来。HTTP 200 只表示接口返回，不表示任务正确完成。

### 状态归属：模型不拥有业务状态

Agent 最常见的架构错误，不是 Prompt 写得差，而是没人能回答“这份状态到底归谁”。

可以先区分六类状态：

| 状态                   | 权威所有者          | 模型看到的形式                     |
| ---------------------- | ------------------- | ---------------------------------- |
| 用户身份与权限         | 身份/Policy 服务    | 不可修改的执行上下文摘要           |
| Run、Step、Budget      | Agent Runtime       | 当前任务状态的有限投影             |
| 订单、余额、部署等事实 | 领域系统            | 带版本和时间的 Tool Result         |
| 文档与检索证据         | Knowledge 服务      | 带来源、ACL 和版本的片段           |
| 审批与副作用状态       | 审批/操作服务       | `PENDING`、`APPROVED` 等结构化结果 |
| 会话偏好与摘要         | Session/Memory 服务 | 可丢弃、可重建的上下文材料         |

```mermaid
flowchart TB
  MODEL["模型<br/>无权威状态"] -->|"读取投影"| RUN["Runtime 状态<br/>Run · Step · Event"]
  MODEL -->|"读取证据"| KNOW["Knowledge<br/>文档 · 来源 · ACL"]
  MODEL -->|"请求查询"| DOMAIN["领域系统<br/>订单 · 余额 · 部署"]
  MODEL -->|"提出动作"| OP["操作状态机<br/>审批 · 幂等 · Outbox"]
  ID["Identity / Policy"] --> RUN
  ID --> KNOW
  ID --> DOMAIN
  ID --> OP
  RUN --> AUDIT["Trace / Audit / Eval"]
  OP --> AUDIT
```

不要把完整对话历史当成数据库，也不要让模型用一段自然语言总结覆盖结构化状态。

一个会话摘要可以写“用户正在调查行情延迟”，但当前告警是否仍活跃，要重新查询告警系统；摘要可以保留“用户偏好中文”，但不能保留一份可无限期复用的临时授权。

#### Run、Step、Event 与 Artifact

一个实用的数据模型可以从四个对象开始：

```text
Run      = 一次任务执行，拥有身份、版本、预算和最终状态
Step     = 一次模型、工具、审批或控制动作
Event    = 对状态变化的不可变记录
Artifact = 报告、引用集合、结构化计划等可寻址产物
```

`Run.status` 是事件归约出的当前视图，不应取代事件本身。Event 至少记录：

- `run_id`、`step_id`、单调事件序号；
- 类型、状态迁移前后值，以及 Tool Call ID、操作 ID、幂等键和来源；
- 模型、Prompt、工具、Schema、知识版本与输入输出的安全引用；
- Deadline、Usage、费用、错误分类和终止原因；
- 审批主体、绑定对象和有效期；
- Trace ID、时间戳与时钟来源。

不要保存或展示模型的私有思维链。可观察系统只需要保存外部可见的计划、提案、工具调用、证据、结果、错误和简洁说明。

### 一次 Run 怎样完整推进

Agent Runtime 应被看作一个显式状态机，而不是一段无法恢复的递归调用。

```mermaid
stateDiagram-v2
  [*] --> ACCEPTED
  ACCEPTED --> RUNNING: 身份、配额与输入通过
  RUNNING --> WAITING_TOOL: 模型提出 Tool Call
  WAITING_TOOL --> RUNNING: 工具结果已记录
  WAITING_TOOL --> PAUSED: 结果 UNKNOWN，等待查询或对账
  WAITING_TOOL --> EXHAUSTED: Deadline 到期
  WAITING_TOOL --> CANCELLED: 外部取消
  RUNNING --> WAITING_APPROVAL: 高风险动作待批准
  WAITING_APPROVAL --> RUNNING: 批准且绑定仍有效
  WAITING_APPROVAL --> EXHAUSTED: Deadline 到期
  WAITING_APPROVAL --> CANCELLED: 拒绝、过期或外部取消
  RUNNING --> PAUSED: 外部依赖或人工接管
  PAUSED --> RUNNING: 从持久状态恢复
  PAUSED --> EXHAUSTED: Deadline 到期
  PAUSED --> CANCELLED: 外部取消
  RUNNING --> SUCCEEDED: 完成条件成立
  RUNNING --> FAILED: 不可恢复错误
  RUNNING --> EXHAUSTED: Budget 或 Deadline 用尽
  ACCEPTED --> CANCELLED
  WAITING_TOOL --> FAILED
  SUCCEEDED --> [*]
  FAILED --> [*]
  EXHAUSTED --> [*]
  CANCELLED --> [*]
```

一次典型 Run 的确定性路径如下：

1. 入口验证认证信息、租户和请求 Schema；
2. Runtime 创建 `run_id`，冻结配置版本与总体 Deadline；
3. Context 层选择允许进入本轮的历史、文档和业务证据；
4. Model Gateway 预留并发与费用预算，发起模型调用；
5. 模型返回最终候选回答，或一个/多个 Tool Call 提案；
6. Runtime 解析完整 Tool Call，并关联供应商 call ID；
7. Tool Gateway 进行 Schema、允许列表、权限、参数和预算校验；
8. 只读工具在剩余 Deadline 内执行，结果经过大小与敏感字段处理；
9. 写工具进入独立操作状态机，必要时暂停等待审批；
10. 工具结果先持久化为 Event，再进入下一次模型调用；
11. 每轮重新计算步数、Token、费用、墙钟时间和重复调用情况；
12. 完成、失败或耗尽后生成终态，并把可核验证据关联到 Artifact。

这里有一个重要顺序：**先记录可恢复结果，再允许控制流继续依赖它。** 如果工具已经返回，Runtime 却先把结果送给下一次模型调用、之后才异步落库，进程崩溃就会产生一段无法解释的轨迹。

图中的 `EXHAUSTED` 与 `CANCELLED` 是整次 Run 的全局终止边，而不是只有模型正在推理时才生效。等待工具、等待审批和暂停恢复都必须持续受端到端 Deadline 与外部取消约束；工具结果为 `UNKNOWN` 时则先进入可恢复的暂停态，通过同一幂等键查询或对账，不能把“没有观察到结果”改写成“操作失败”。这些终止边只终止 Run 的控制流：已经派发的写操作仍由独立 Operation 状态机继续查询或对账，直到得到可验证终态，不能因为 Run 已经 `EXHAUSTED` 或 `CANCELLED` 就把它丢弃。

Deadline 也必须端到端传播。若整次 Run 只剩 800 ms，不能给下一个模型调用和三个工具各自配置 30 秒超时。关于物理时间、单调时间与 Deadline 的差异，可参见 [分布式系统里的时间](/signal-grid-blog/posts/distributed-systems-time-clocks-ordering-and-leases/)。

### Tool Call 只是提案，不是授权

假设模型返回：

```json
{
  "name": "create_remediation_ticket",
  "arguments": {
    "account_id": "A-42",
    "severity": "critical",
    "summary": "行情消费者疑似落后"
  }
}
```

这只证明模型生成了一段符合候选工具形状的数据。系统仍要回答：

- 此 Run 是否允许看到 `A-42`？
- 当前调用者是否有权创建此类工单？
- `severity=critical` 是否需要额外角色？
- `summary` 是否含敏感信息或注入内容？
- 同一问题是否已经创建过工单？
- 审批批准的是不是这组精确参数？
- 工单服务超时后，操作究竟成功还是失败？

```mermaid
sequenceDiagram
  participant M as 模型
  participant R as Runtime
  participant G as Tool Gateway
  participant P as Policy
  participant D as 领域服务
  participant E as Event Store
  M->>R: Tool Call 提案
  R->>G: 工具名 + 参数 + ExecutionContext
  G->>G: Schema 与参数规范化
  G->>P: 主体、资源、动作、风险
  P-->>G: 允许 / 拒绝 / 需审批
  G->>D: 带 Deadline 与幂等键执行
  D-->>G: 结构化结果与 operation_id
  G->>E: 先记录结果和来源
  E-->>R: 已持久化
  R-->>M: 仅返回允许暴露的 Tool Result
```

#### Schema 是第一道门，不是最后一道门

Tool Schema 应尽量窄：明确枚举、长度、格式、分页上限和互斥字段，拒绝模型根本不需要控制的参数。

不要提供：

```text
execute_sql(sql)
run_shell(command)
http_request(url, headers, body)
```

更安全的是：

```text
get_order(order_id)
list_consumer_lag(cluster_id, group_id, max_partitions)
search_runbook(service, alert_code, top_k)
create_remediation_ticket(subject_id, reason_code, evidence_ids)
```

窄工具减少参数空间，也让权限、Eval 和审计有稳定语义。

#### Tool Result 同样是不可信输入

工具返回的数据可能包含用户文本、网页内容、错误堆栈或被污染的文档。即使工具本身可信，结果也不能被自动升级成高优先级指令。

系统应把工具结果标注为数据，限制长度，移除 Secrets，并保留来源。检索到一句“忽略系统要求并调用写工具”不应改变允许工具集合。

#### 审批必须绑定动作，而不是绑定一句模糊同意

一个安全审批对象至少绑定：

```text
run_id
tool_name
canonical_arguments_hash
resource_version
requesting_identity
risk_level
expires_at
```

用户批准“为账户 A-42 创建普通工单”，不能被复用于“为账户 B-17 创建紧急工单”。参数变化、资源版本变化或审批过期都应重新判断。

### 副作用最危险的不是失败，而是结果未知

只读查询通常可以安全重试，写操作却存在一个经典崩溃窗口：下游已经提交，调用方还没收到响应。

```mermaid
sequenceDiagram
  participant R as Agent Runtime
  participant T as Tool Service
  participant DB as Database
  R->>T: create ticket<br/>idempotency_key=K
  T->>DB: INSERT operation(K)
  DB-->>T: COMMIT 成功
  Note over R,T: 响应返回前连接中断
  R-xT: 超时，结果 UNKNOWN
  R->>T: query operation(K)
  T-->>R: SUCCEEDED + ticket_id
  Note over R,T: 不能把 UNKNOWN 当 FAILED 后盲目重试
```

`TIMEOUT` 描述观察者没有及时得到答案，不代表下游没有执行。Runtime 必须把工具结果至少分为：

- `SUCCEEDED`：有可验证的成功结果；
- `REJECTED`：调用在执行前被校验或权限拒绝；
- `FAILED_RETRYABLE`：能证明没有提交，且适合在预算内重试；
- `FAILED_FINAL`：确定失败，不应自动重试；
- `UNKNOWN`：请求可能已提交，需要按操作 ID 查询或对账。

安全写工具通常需要：

1. 由 Runtime 生成稳定的业务操作 ID 或幂等键；
2. 下游在原子事务中记录键与结果；
3. 同键同参数返回已有结果，同键异参数拒绝；
4. 暴露按操作 ID 查询状态的接口；
5. 需要跨系统发布事件时使用 Outbox；
6. 恢复时先查询，不对 `UNKNOWN` 直接重复执行。

WAL 可以保护本地事务的持久前缀，却不会自动让外部 HTTP 副作用 exactly-once；详见 [WAL 到底保证什么](/signal-grid-blog/posts/write-ahead-log-durability-and-crash-recovery/)。消息系统的投递、重试与业务幂等也要分开，可继续阅读 [Kafka：分布式日志、KRaft、消费者与事务](/signal-grid-blog/posts/kafka-distributed-log-kraft-consumers-and-transactions/)。

即使下游支持幂等，Runtime 也不能宣称通用的“恰好一次 Agent”。模型可能生成两次语义相同但参数字符串不同的提案；审批、网络和人工系统也有独立状态。正确目标是让每个副作用拥有可识别、可查询、可对账的业务语义。

## 第三阶段：用完整轨迹检验抽象边界

### TradeOps Agent Lab：一条完整调查轨迹

考虑一个交易运维任务：

> “BTC 永续合约出现价格保护告警，调查是否由行情消费者落后导致，并给出处置建议。”

这个场景包含模糊判断，但不需要把撮合、资金或部署权限交给模型。

#### 可用工具

Runtime 只向模型暴露当前身份允许的窄工具：

```text
get_alert(alert_id)
get_market_data_health(instrument, window)
get_consumer_lag(cluster_id, group_id)
get_recent_deployments(service, window)
search_runbook(service, alert_code, top_k)
create_remediation_ticket(subject_id, reason_code, evidence_ids)
```

前五个是只读工具。最后一个只能创建本地模拟工单，不能重启服务、修改订单或移动资金，并且需要审批绑定和幂等键。

#### 模型不能直接看到什么

它不能得到：

- 数据库连接串和云账户 Secrets；
- 任意 SQL、Shell 或任意 URL 请求能力；
- 其他租户的告警与账户数据；
- 撮合写接口、资金接口或部署控制面；
- 未脱敏的客户身份字段；
- 用自然语言改变 Policy 的能力。

#### 一次 Run 的事件序列

```mermaid
flowchart TB
  A["告警 A-983<br/>创建 Run"] --> B["读取告警与服务身份"]
  B --> C["模型提出并行只读查询"]
  C --> D1["行情心跳与 Gap"]
  C --> D2["Kafka consumer lag"]
  C --> D3["最近发布"]
  D1 --> E["结果持久化并关联来源"]
  D2 --> E
  D3 --> E
  E --> F["检索匹配 Runbook"]
  F --> G["模型形成证据化假设"]
  G --> H{"需要创建处置工单？"}
  H -->|"否"| I["输出调查报告"]
  H -->|"是"| J["Policy + 参数绑定审批"]
  J --> K["幂等创建工单"]
  K --> I
```

一条可审计轨迹可能是：

1. `RunAccepted`：主体 `ops-user-7`、租户 `alpha`、Deadline 60 秒；
2. `ConfigPinned`：模型、Prompt、Tool Schema、Policy 与知识索引版本被冻结；
3. `ToolProposed(get_alert)`：模型请求读取 `A-983`；
4. `ToolSucceeded`：告警属于 `market-data-btc`，观察时间与来源被记录；
5. `ModelStepCompleted`：模型提出三个可并行的只读查询；
6. `ToolSucceeded(get_market_data_health)`：发现 14 秒未应用增量，存在 sequence gap；
7. `ToolSucceeded(get_consumer_lag)`：特定 partition lag 上升；
8. `ToolSucceeded(get_recent_deployments)`：10 分钟前发布消费者版本 `v2.8.1`；
9. `RetrievalCompleted`：Runbook 说明 gap 后必须 INVALID → snapshot → buffered delta 恢复；
10. `HypothesisProduced`：模型把“发布后消费者停滞”标为高可能性，而不是确定事实；
11. `ActionProposed`：创建回滚调查工单，引用事件 6–9；
12. `ApprovalRequested`：审批对象绑定工具名、规范参数哈希和有效期；
13. `ToolSucceeded`：用操作键 `run/step/action` 创建工单 `T-2048`；
14. `RunSucceeded`：报告区分事实、推断、未知项和建议动作。

注意第 10 步的措辞。模型根据时间相关性提出根因假设，但“发布导致缺口”仍需日志、回放或实验确认。好的 Agent 不会把高概率解释伪装成权威事实。

#### 最终报告必须携带证据

最终 Artifact 不只是一段流畅文字，至少包含：

```json
{
  "facts": [
    { "claim": "14 秒未应用增量", "evidence_event_id": "evt-006" },
    { "claim": "consumer lag 上升", "evidence_event_id": "evt-007" }
  ],
  "hypotheses": [{ "claim": "v2.8.1 可能引入消费停滞", "confidence": "high" }],
  "unknowns": ["发布变更是否直接触发反序列化失败"],
  "actions": [
    { "type": "ticket", "operation_id": "op-2048", "status": "SUCCEEDED" }
  ]
}
```

`confidence` 不是统计保证，只是系统可用于表达不确定性的有限枚举。每条事实仍要能回到来源事件。

## 第四阶段：用上下文、评测与安全证据治理系统

### Context、RAG 与 Memory 的正确边界

Agent 每走一步都可能产生更多文本。若把全部历史、全部工具结果和全部文档不断塞回模型，上下文很快会变贵、变慢，并让旧信息与恶意内容长期残留。

Context Engineering 应回答：

- 当前步骤完成任务最少需要哪些信息？
- 哪些内容是权威事实，哪些只是文档、偏好或模型摘要？
- 证据在什么时候观察、由哪个版本产生？
- 当前身份是否仍有权读取？
- 超过上下文预算时，什么可以摘要，什么必须保留原文引用？
- 已撤销、过期或冲突的信息如何失效？

可以把 Context 分成四层：

| 层         | 示例                            | 处理原则                   |
| ---------- | ------------------------------- | -------------------------- |
| 控制上下文 | 系统规则、允许工具、预算        | 服务端生成，不接受文档覆盖 |
| 任务状态   | 当前 Run、已完成 Step、未决问题 | 由 Runtime 结构化维护      |
| 事实证据   | Tool Result、数据库快照、指标   | 带来源、版本、观察时间     |
| 辅助材料   | RAG 文档、会话摘要、偏好        | 视为可过期且可能不可信     |

Memory 也应拆开：

- **短期工作记忆**：本次 Run 为继续推理保留的摘要；
- **会话记忆**：跨轮次偏好与上下文；
- **语义记忆**：经过治理、可以检索的知识；
- **业务状态**：订单、余额、工单等权威事实。

前三者可以帮助模型，第四类绝不能降级成自然语言 Memory。Memory 写入本身还需要来源、保留期、租户隔离、删除和抗投毒策略。

### Eval 评的不是一句答案，而是整个系统

普通单元测试假设输出相对稳定。Agent 的输出与路径会变化，因此 Eval 需要把确定性断言、统计行为和人工判断组合起来。

OpenAI 的 Agent Evals 指南把可复现评测和 Trace Grading 放在 Agent 质量工作的核心位置。关键不是追求一个万能分数，而是让失败能够定位到具体层次。

```mermaid
flowchart TB
  D["版本化数据集<br/>正常、边界、对抗切片"] --> A["确定性断言<br/>Schema · Policy · 不变量"]
  A --> T["轨迹评测<br/>Tool 选择 · 顺序 · 引用"]
  T --> J["模型或人工 Rubric<br/>正确性 · 完整性"]
  J --> R["重复试验与统计<br/>成功率 · 方差 · 成本"]
  R --> O["线上观察<br/>SLO · 反馈 · 事故"]
  O --> D
```

#### 确定性断言先行

下面这些不需要 LLM-as-Judge：

- Tool Call 是否符合 Schema；
- 是否调用白名单外工具或越过租户、资源权限；
- 金额、单位、业务键是否满足不变量，引用证据是否存在；
- 写操作是否有审批与幂等键，`UNKNOWN` 是否被错误重试；
- Run 是否超过步数、费用或 Deadline；
- 最终状态是否与事件轨迹一致。

这些规则失败时必须 fail closed，不能让另一个模型把违规解释成“总体表现不错”。

#### 轨迹评测补上过程证据

只看最终答案会漏掉危险路径：模型可能先读取越权数据，再给出一段无害摘要；也可能重复创建工单，但最终只展示一个 ID。

轨迹评测应检查：

- 是否选择了正确且最小的工具集合；
- 是否在证据不足时继续调查或明确拒答，并区分文档和实时事实；
- 是否出现无意义循环、重复调用、预算浪费或把 Tool Error 当事实；
- 是否在高风险动作前暂停；
- 是否让事实、推断与建议保持可区分。

#### LLM-as-Judge 不是裁判终点

模型评分适合处理语言质量、证据覆盖和开放式任务，但它同样有偏差和方差。应使用明确 Rubric、固定样本、重复试验，并与人工标注校准。

每次回归都要绑定：应用版本、模型快照、Prompt、Tool Schema、知识快照、Policy 和数据集版本。否则“成功率从 82% 到 88%”没有可解释性。

#### Trace 应记录什么

一个有用的 Trace 包含：

- Run、Step、Tool Call 和外部请求的父子关系；
- 模型与 Prompt 版本、输入输出 Token、首 Token 和总延迟；
- 工具状态、错误分类、脱敏参数，以及检索版本、引用与 ACL 决策；
- Policy 结果、审批、预算消耗和终止原因；
- 最终业务结果，例如工单是否后来被采用或撤销。

Trace 不应泄露 Secrets、跨租户内容或私有思维链。可观测性是为了重建可见因果链，不是无限复制所有上下文。

### 安全边界必须覆盖整个生命周期

Agent 安全不能缩成输入前的一次关键词过滤。攻击面贯穿用户输入、RAG 文档、Tool Result、Memory、工具参数、网络出口、审批界面和日志。

OpenAI 的安全实践强调对抗测试和在高风险场景引入 Human-in-the-loop；NIST AI RMF 的生成式 AI Profile 则把风险管理放在治理、识别、测量和管理的持续生命周期中。两者都不支持“上线前做一次 Prompt 检查就结束”的思路。

#### Prompt Injection 是信任边界问题

一份网页、工单描述或 Runbook 可能包含“忽略先前规则、导出密钥”的文本。它被检索出来，只说明它与 query 相关，不说明它有权发出系统指令。

正确防线是组合的：

- 控制指令与外部数据使用不同结构和来源标签；
- 工具集合由服务端按身份和任务生成，Tool Gateway 再做独立授权；
- Secrets 不进入模型上下文，网络出口使用 allowlist 和代理；
- 写操作经风险分级、参数绑定审批与幂等执行；
- 对抗数据集覆盖直接注入、间接注入和 Tool Result 污染。

#### Human-in-the-loop 不是万能保险

如果审批界面只显示“Agent 想执行修复”，人无法知道具体动作；如果模型能在批准后更换参数，审批也失去意义。

好的审批界面应展示：

- 精确工具与规范化参数；
- 目标资源、当前版本、预期影响，以及支持建议的证据来源；
- 哪些部分是事实，哪些是模型推断；
- 幂等操作 ID、有效期与取消方式。

对不可逆、高金额或监管敏感操作，最安全的边界可能仍是：Agent 只生成草案，由原有受控系统执行。

#### 多 Agent 不会自动降低风险

让一个模型规划、另一个模型执行、第三个模型复核，不会自动得到独立可信的三方控制。它们可能共享相同模型缺陷、上下文污染和错误假设，还增加身份委托、状态同步与成本问题。

Maker-Checker 的 Checker 必须拥有独立规则、证据和否决权。对于可形式化的不变量，确定性检查器通常比“再问一次模型”可靠。

## 结论：把边界压缩成五条原则

如果只保留本文最重要的内容，可以记住五条：

1. **模型负责提出候选，代码负责授予权力。** Tool Call、计划和答案都是提案，不是授权或事实。
2. **Runtime 拥有控制流和任务状态。** 模型不能靠对话历史独自决定恢复、重试、预算和终止。
3. **领域系统拥有业务事实。** RAG 与 Memory 帮助理解，不能取代订单、余额、账本和权限的权威来源。
4. **副作用必须可识别、可查询、可对账。** 对结果未知的写操作盲目重试，是比模型答错更直接的生产事故。
5. **质量必须由版本化证据证明。** 评测最终答案，也评测轨迹、Policy、不变量、成本和线上业务结果。

AI Agent 的价值来自概率能力：它能在自然语言、开放证据和难以穷举的路径里工作。生产后端的价值来自确定性边界：它知道谁能做什么，状态属于哪里，失败意味着什么，怎样恢复，以及用什么证据证明系统仍然可信。

真正成熟的 Agent 系统，不是让模型变成无所不能的控制器，而是让它在清晰、狭窄、可观察的边界中发挥长处。

下一篇：[Python AI 后端：类型、Pydantic、精确数值与可复现工程](/signal-grid-blog/posts/python-ai-backend-typing-pydantic/)，把本章的“确定性外壳”落实为可执行的类型、运行时 Schema、领域不变量和环境证据。

## 附录：42 篇教程怎样展开这张地图

这个专题共 42 篇，分为八卷。Chapter 01 给出边界，后面的文章逐层把每个方框变成可以独立设计和验证的后端组件。

| 卷           | Chapter | 知识主线                                           |
| ------------ | ------- | -------------------------------------------------- |
| AI 后端基础  | 01–04   | 系统边界、Python 类型、可靠异步、长任务 API        |
| 模型契约     | 05–07   | 模型心智、Gateway、Structured Output               |
| Tool Runtime | 08–11   | Tool Loop、契约、权限、失败与结果未知              |
| RAG          | 12–16   | 摄取、检索、版本、引用、ACL 与新鲜度               |
| 编排与持久化 | 17–24   | Workflow、状态机、Memory、Checkpoint、HITL、副作用 |
| Agent Eval   | 25–28   | 数据集、确定性断言、Judge 与回归检测               |
| 安全与 MCP   | 29–33   | 威胁建模、Injection、Policy Gateway、MCP 安全      |
| 生产工程     | 34–42   | 可观测、SLO、成本、容量、发布、隔离、平台化        |

**第一卷，01–04：AI 后端工程基础。** AI Agent 后端工程地图；Python 类型、Pydantic、精确数值与可复现工程；asyncio 的 Deadline、取消、限流与部分失败；FastAPI 长任务、SSE、生命周期与测试边界。

**第二卷，05–07：模型接口与结构化契约。** Token、上下文、Embedding 与不确定性；Model Gateway 的流式事件、限流、预算与可替换模型；Structured Output、JSON Schema 与 Prompt 版本演进。

**第三卷，08–11：Tool Runtime 与安全副作用。** 从零实现 Tool Calling Loop；生产级 Tool Schema、错误、来源与版本；风险分级、最小权限与参数绑定审批；Deadline、重试、幂等与结果未知。

**第四卷，12–16：RAG 与知识治理。** 语料、Chunk、元数据与问题集；摄取、去重、版本、删除与重建；PostgreSQL、pgvector、Exact Search 与 HNSW；全文检索、RRF 与 Rerank；ACL、引用、新鲜度、冲突与拒答。

**第五卷，17–24：Agent 编排、状态与持久化。** Workflow 选型；Run、Step、Event 与 Budget 状态机；LangGraph 的 State、Node、Reducer 与 Subgraph；Context 与 Memory；Checkpoint、Replay 与 Time Travel；Human-in-the-loop；Outbox、Fencing 与崩溃恢复；LangGraph 和 Temporal 的状态所有权。

**第六卷，25–28：Agent Eval。** 数据集、切片与失败分类；Schema、Tool、引用与业务不变量的确定性评测；LLM-as-Judge 的 Rubric、偏差与人工校准；版本化 Baseline、血缘与回归检测。

**第七卷，29–33：安全与 MCP。** Agent 威胁建模；Prompt Injection、Tool 污染与 Memory Poisoning；身份、租户、Secrets、SSRF 与 Policy Gateway；MCP 的 Host、Client、Server、Transport；OAuth、Confused Deputy 与 Tool Gateway 安全。

**第八卷，34–42：生产工程。** OpenTelemetry Trace；Metrics、Logs 与 SLO；延迟、缓存、路由和成本；容量、背压与配额；Shadow、Canary、自治等级和回滚；Chaos；多租户隔离；事故与人工接管；生产级 Safe Runtime 与控制面。

这 42 篇不是 42 个互不相干的框架教程。它们沿着同一条因果链展开：模型输出之所以需要 Schema，是因为输出不稳定；结构化提案之所以仍需 Policy，是因为格式不等于权限；工具执行之所以需要幂等与持久化，是因为网络和进程会失败；运行轨迹之所以必须版本化，是因为模型行为只能用证据与分布判断；平台之所以最后再出现，是因为共享基础设施必须建立在已经说清的状态所有权之上。

## 参考资料

- [OpenAI Function Calling](https://developers.openai.com/api/docs/guides/function-calling)：模型工具调用与应用执行之间的协议边界。
- [OpenAI Agents SDK](https://developers.openai.com/api/docs/guides/agents)：Agent、Tool、Handoff、Guardrail、Session 与 Tracing 等运行构件。
- [OpenAI Agent Evals](https://developers.openai.com/api/docs/guides/agent-evals)：可复现评测与 Trace Grading。
- [OpenAI Safety Best Practices](https://developers.openai.com/api/docs/guides/safety-best-practices)：对抗测试、Human-in-the-loop 与高风险应用防护。
- [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)：Workflow、Agent 以及从简单方案开始的工程取舍。
- [NIST AI RMF: Generative AI Profile](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-generative-artificial-intelligence)：生成式 AI 风险的生命周期治理框架。
