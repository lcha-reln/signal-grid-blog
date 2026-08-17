# AI Agent 后端工程博客系列规划

> 状态：专题已建立，Chapter 01 已发布
>
> 规划日期：2026-08-17
>
> 来源：`AI Agent 后端工程师一年学习计划`
>
> 读者画像：已有后端开发经验，希望系统掌握非研究型 AI Agent 后端与平台工程。

## 1. 最终规划结论

本系列规划为 **42 篇核心教程，分为 8 卷**。

它不会机械地把 52 周学习计划改成 52 篇文章，也不会把周目标、复盘、缓冲周、阶段 Gate、作品集整理或面试准备写成独立教程。原计划中的这些内容只用于安排学习节奏，不属于知识主线。

系列真正要回答的是一个工程问题：

> 怎样把概率性的模型能力，放进一个类型明确、权限受控、可以暂停恢复、能够评测、便于观察并且可安全运行的后端系统？

42 篇文章共享一个交易运维场景 `TradeOps Agent Lab`，但它只是解释知识的连续案例，不是每隔几篇就出现一次的“项目验收”。每篇文章都应能单独阅读，同时又会给下一篇留下明确的知识接口。

### 1.1 八卷结构

| 卷 | 范围 | 文章数 | 主题 |
| --- | ---: | ---: | --- |
| 第一卷 | 01–04 | 4 | AI 后端工程基础 |
| 第二卷 | 05–07 | 3 | 模型接口与结构化契约 |
| 第三卷 | 08–11 | 4 | Tool Runtime 与安全副作用 |
| 第四卷 | 12–16 | 5 | RAG、检索与知识治理 |
| 第五卷 | 17–24 | 8 | Agent 编排、状态与持久化 |
| 第六卷 | 25–28 | 4 | Agent Eval 与回归判断 |
| 第七卷 | 29–33 | 5 | Agent 安全与 MCP |
| 第八卷 | 34–42 | 9 | 可观测、性能、生产与平台化 |
| 合计 | 01–42 | **42** | 完整知识体系 |

### 1.2 站点专题信息

专题已经按下列信息接入博客。此表是后续文章继续沿用的稳定配置，不应随单篇文章临时改名或更换路径。

| 字段 | 当前值 |
| --- | --- |
| `key` | `agent` |
| 专题名 | AI Agent 后端工程 |
| `eyebrow` | `AGENT SYSTEMS` |
| 说明 | 从概率模型与确定性系统的边界出发，逐步进入模型契约、工具运行时、RAG、持久化编排、评测、安全、可观测与生产治理。 |
| 前置知识 | 具备一门后端语言、HTTP、数据库和异步编程基础；Python 可随前几章补齐。 |
| 学完后的能力 | 能够设计可回放、可评测、可审计、可审批，并能安全执行受限副作用的生产级 Agent 后端。 |
| 颜色 | `violet` |
| 路径 | `/signal-grid-blog/series/agent/` |

## 2. 写作原则

### 2.1 知识优先

每篇文章围绕一个清晰的知识边界展开，不使用“本周目标”“阶段复盘”“完成打卡”作为结构。实战代码只用于证明和解释概念，不喧宾夺主。

### 2.2 先原理，再框架

- 先理解模型调用、Tool Loop、状态机、幂等和恢复，再使用 LangGraph。
- 先理解检索模型、数据版本和权限，再安装 RAG 框架。
- 先建立 Agent Runtime 的状态所有权，再讨论 Temporal 是否适合接管长任务。
- 先建立内部 Tool 契约，再讨论 MCP 如何把能力发布给外部 Host。

### 2.3 确定性边界必须由代码承担

以下职责不能交给 Prompt：

- 身份、租户和权限；
- 金额、订单、持仓和账务不变量；
- 超时、预算、并发和重试上限；
- 工具白名单、审批和参数绑定；
- 幂等、Outbox、结果查询和崩溃恢复；
- 评测门槛、安全策略和审计记录。

### 2.4 不保存或展示私有思维链

文章只讨论可观察的计划、Tool Call、状态迁移、证据、结果和错误，不把隐藏 chain-of-thought 当成可持久化数据或调试接口。

### 2.5 版本敏感内容单独标注

OpenAI API、LangGraph、Temporal、MCP、OpenTelemetry GenAI 语义约定和 OWASP Agentic 指南变化较快。正式写每篇文章时必须重新核对官方一手资料，并在正文记录核对日期和测试版本；稳定原理与当前 API 实现要分开表述。

## 3. 贯穿全系列的示例边界

`TradeOps Agent Lab` 提供订单、成交、余额、持仓、账本、告警、部署、事故和 Runbook 等模拟数据，用来解释 Tool、RAG、状态、Eval 和安全问题。

模型可以：

- 理解调查问题；
- 选择只读工具；
- 生成结构化调查计划；
- 整理证据并提出根因假设；
- 生成处置草案。

模型不能直接：

- 修改订单、资金、持仓或账本；
- 执行任意 SQL、Shell 或网络请求；
- 自行扩大权限；
- 把 RAG 文档或会话记忆当作实时业务事实；
- 绕过审批、幂等和业务不变量。

系列中唯一用来解释受限副作用的操作是本地模拟工具 `create_remediation_ticket`。它必须具备稳定业务键、状态查询、审批绑定、幂等写入和 Outbox；这让文章可以完整讲清副作用，而不把真实交易操作暴露给模型。

## 4. Canonical 文章目录

`seriesOrder` 按卷分段，每篇间隔 10，便于将来在局部插入新章节，而不重排全部文章。

| Chapter | 卷 | `seriesOrder` | 标题 | `permalink` | 来源周次 |
| ---: | --- | ---: | --- | --- | --- |
| 01 | AI 后端基础 | 100 | AI Agent 后端工程地图：概率模型与确定性系统的边界 | `ai-agent-backend-engineering-map` | 总论、1–4 |
| 02 | AI 后端基础 | 110 | Python AI 后端：类型、Pydantic、精确数值与可复现工程 | `python-ai-backend-typing-pydantic` | 1–2 |
| 03 | AI 后端基础 | 120 | asyncio 可靠并发：Deadline、取消、限流与部分失败 | `python-asyncio-deadlines-cancellation-backpressure` | 3 |
| 04 | AI 后端基础 | 130 | FastAPI 长任务接口：SSE、生命周期与可测试边界 | `fastapi-long-running-tasks-sse-testing` | 4 |
| 05 | 模型契约 | 200 | LLM 后端心智模型：Token、上下文、Embedding 与不确定性 | `llm-backend-token-context-embeddings-uncertainty` | 5 |
| 06 | 模型契约 | 210 | Model Gateway：流式事件、限流、预算与可替换模型 | `model-gateway-streaming-rate-limits-fake-model` | 6 |
| 07 | 模型契约 | 220 | Prompt 不是接口：Structured Output、JSON Schema 与版本演进 | `structured-outputs-json-schema-prompt-versioning` | 7 |
| 08 | Tool Runtime | 300 | 从零实现 Tool Calling Loop：选择、执行、观察与终止 | `tool-calling-loop-from-scratch` | 8 |
| 09 | Tool Runtime | 310 | 生产级 Tool 契约：Schema、错误模型、来源与版本 | `production-tool-contracts-errors-provenance` | 9 |
| 10 | Tool Runtime | 320 | Agent 权限模型：风险分级、最小权限与参数绑定审批 | `agent-permissions-risk-approval-binding` | 10 |
| 11 | Tool Runtime | 330 | Tool 失败语义：Deadline、重试、幂等与结果未知 | `tool-retries-idempotency-unknown-results` | 11–12 |
| 12 | RAG | 400 | RAG 的正确边界：语料、Chunk、元数据与评测问题集 | `rag-boundaries-corpus-chunking-metadata` | 14 |
| 13 | RAG | 410 | RAG 摄取管线：解析、去重、版本、删除与重建 | `rag-ingestion-versioning-deletion-reindexing` | 14–17 补强 |
| 14 | RAG | 420 | PostgreSQL 与 pgvector：从 Exact Search 到 HNSW | `postgresql-pgvector-exact-hnsw-search` | 15 |
| 15 | RAG | 430 | Hybrid Search：全文检索、RRF 与 Rerank | `hybrid-search-fts-rrf-reranking` | 16 |
| 16 | RAG | 440 | 安全 RAG：ACL、引用、新鲜度、冲突与拒答 | `secure-rag-acl-citations-freshness-refusal` | 17 |
| 17 | 编排与持久化 | 500 | 什么时候不该用 Agent：Workflow 模式与选型边界 | `workflow-patterns-and-when-not-to-use-agents` | 18 |
| 18 | 编排与持久化 | 510 | Agent Runtime 是状态机：Run、Step、Event 与 Budget | `agent-runtime-run-step-event-budget-state-machine` | 19 |
| 19 | 编排与持久化 | 520 | LangGraph：State、Node、Reducer 与 Subgraph | `langgraph-state-nodes-reducers-subgraphs` | 20 |
| 20 | 编排与持久化 | 530 | Context Engineering 与 Memory：上下文不是业务事实 | `agent-context-engineering-memory-boundaries` | 21 |
| 21 | 编排与持久化 | 540 | Checkpoint、Replay 与 Time Travel：恢复不等于重放副作用 | `agent-checkpoints-replay-time-travel` | 21–23 |
| 22 | 编排与持久化 | 550 | Human-in-the-loop：Interrupt、Maker-Checker 与安全恢复 | `human-in-the-loop-interrupt-approval-resume` | 22 |
| 23 | 编排与持久化 | 560 | Agent 副作用与崩溃恢复：Outbox、Fencing 与幂等 | `agent-side-effects-outbox-fencing-crash-recovery` | 23 |
| 24 | 编排与持久化 | 570 | LangGraph 还是 Temporal：两种持久化模型的状态所有权 | `langgraph-vs-temporal-state-ownership` | 24–25 |
| 25 | Agent Eval | 600 | Agent Eval 从哪里开始：数据集、切片与失败分类 | `agent-eval-datasets-slices-failure-taxonomy` | 27 |
| 26 | Agent Eval | 610 | 确定性 Agent 评测：Schema、Tool、引用与业务不变量 | `deterministic-agent-evaluation` | 28 |
| 27 | Agent Eval | 620 | LLM-as-Judge：Rubric、偏差、重复试验与人工校准 | `llm-as-judge-rubrics-bias-calibration` | 29 |
| 28 | Agent Eval | 630 | 版本化评测与回归检测：Baseline、血缘与关键切片 | `agent-eval-versioning-regression-detection` | 30 |
| 29 | 安全与 MCP | 700 | Agent 威胁建模：数据流、信任边界与后果分析 | `agent-threat-modeling-trust-boundaries` | 31 |
| 30 | 安全与 MCP | 710 | Prompt Injection：不可信内容、工具污染与 Memory Poisoning | `prompt-injection-tool-output-memory-poisoning` | 32 |
| 31 | 安全与 MCP | 720 | Policy Gateway：身份、租户、最小权限、Secrets 与 SSRF | `agent-policy-gateway-identity-least-privilege-ssrf` | 33 |
| 32 | 安全与 MCP | 730 | MCP 从第一性原理理解：Host、Client、Server 与 Transport | `mcp-host-client-server-tools-resources-prompts` | 34 |
| 33 | 安全与 MCP | 740 | 生产级 MCP 安全：OAuth、Confused Deputy 与 Tool Gateway | `mcp-oauth-confused-deputy-tool-gateway-security` | 34 |
| 34 | 生产工程 | 800 | 用 OpenTelemetry 看清一次 Agent Run | `opentelemetry-agent-run-tracing` | 35 |
| 35 | 生产工程 | 810 | Agent 的成功率不是 HTTP 200：Metrics、Logs 与 SLO | `agent-metrics-logs-slo-task-success` | 36 |
| 36 | 生产工程 | 820 | Agent 延迟和成本花在哪里：分解、缓存、路由与预算 | `agent-latency-cost-routing-caching-budget` | 37 |
| 37 | 生产工程 | 830 | Agent 容量与背压：队列、准入、配额与 Load Shedding | `agent-capacity-backpressure-admission-quotas` | 40–41 |
| 38 | 生产工程 | 840 | 安全发布 Agent：Shadow、Canary、自治等级与回滚 | `agent-shadow-canary-autonomy-rollback` | 38–39 |
| 39 | 生产工程 | 850 | Agent 故障实验：模型、Tool、数据库与知识库 Chaos | `agent-chaos-testing-model-tools-data` | 40 |
| 40 | 生产工程 | 860 | 多租户 Agent 隔离：数据库、向量、缓存、Trace 与 Eval | `multi-tenant-agent-isolation` | 42 |
| 41 | 生产工程 | 870 | Agent 事故处理：降级、人工接管、Runbook 与 Postmortem | `agent-incident-response-human-handoff-postmortem` | 43 |
| 42 | 生产工程 | 880 | 生产级 Agent 平台：Safe Runtime、控制面与状态所有权 | `production-agent-platform-runtime-control-plane` | 44–52 |

## 5. 每篇文章的具体内容

### 第一卷：AI 后端工程基础

#### Chapter 01｜AI Agent 后端工程地图：概率模型与确定性系统的边界

**核心问题**

AI Agent 到底比普通 LLM API 多了什么？哪些能力应该由模型完成，哪些必须留在确定性后端？

**具体内容**

- 区分模型调用、RAG、Workflow、Agent、Agent Runtime 和 Agent Platform。
- 用“输入不确定、选择不确定、输出不确定”解释为什么 Agent 需要更强的工程边界。
- 拆解 Model Gateway、Tool Gateway、Runtime、Policy、Knowledge、Eval 和 Observability 七个层次。
- 说明交易撮合、资金、持仓和账本为什么不能被模型直接接管。
- 给出规则、普通 API、RAG、固定 Workflow 和 Agent 的选型决策树。

**主要图解与示例**

- 一张 Agent 系统分层总图。
- 一张“概率能力进入确定性系统”的信任边界图。
- 用十个交易运维问题比较规则、RAG、Workflow 和 Agent。

#### Chapter 02｜Python AI 后端：类型、Pydantic、精确数值与可复现工程

**核心问题**

有 Java、Go 或 C++ 后端经验的人，怎样避免把 Python 写成缺少边界的脚本？

**具体内容**

- Python 包、虚拟环境、依赖锁定、异常和 Context Manager。
- type hints、Protocol、Generic、Literal、Enum 与静态检查。
- Pydantic 的运行时校验、序列化和 JSON Schema 生成。
- `Decimal`、UTC、不可变数据和固定随机种子的意义。
- 区分静态类型、运行时 Schema、业务不变量和数据库约束。

**主要图解与示例**

- Java Interface、Python Protocol 与 Pydantic Model 的职责对照。
- 建模 Order、Trade、Balance、Position，并展示非法精度和非法状态如何失败关闭。

#### Chapter 03｜asyncio 可靠并发：Deadline、取消、限流与部分失败

**核心问题**

Agent 会并发访问模型、检索和多个 Tool；怎样保证超时或取消后不泄漏任务，也不掩盖部分结果？

**具体内容**

- Coroutine、Task、TaskGroup 与结构化并发。
- 单次调用 Timeout、端到端 Deadline 与剩余预算传播。
- Cancellation 的传播、清理、shield 边界和常见误用。
- Semaphore、Queue、连接池和有界并发。
- 区分 I/O 并发、CPU 并行、部分失败和整体失败。

**主要图解与示例**

- 三个并发 Tool 查询的正常、超时和取消时序图。
- 一个“父任务取消后子任务仍运行”的反例及修正。

#### Chapter 04｜FastAPI 长任务接口：SSE、生命周期与可测试边界

**核心问题**

Agent Run 可能持续数十秒甚至更久，HTTP API 应怎样表达创建、查询、流式进度、取消和重连？

**具体内容**

- FastAPI 请求模型、依赖注入、错误映射和生命周期。
- 同步请求、异步任务资源和 Run 状态查询的区别。
- SSE 的事件 ID、业务事件类型、断线和重连语义。
- 客户端断开是否应该取消后端任务，以及何时不应该。
- TestClient、异步集成测试和 Fake 依赖。

**主要图解与示例**

- `POST /runs`、`GET /runs/{id}`、`GET /runs/{id}/events` 的协议图。
- 断线重连后从 `Last-Event-ID` 继续读取的示例。

### 第二卷：模型接口与结构化契约

#### Chapter 05｜LLM 后端心智模型：Token、上下文、Embedding 与不确定性

**核心问题**

后端工程师需要理解哪些模型概念，才能正确判断延迟、成本、上下文和输出可靠性？

**具体内容**

- Token、上下文窗口、输入输出预算和截断。
- Sampling、temperature、概率输出与不可重复性。
- Embedding 表达相似度而不是事实真伪。
- Hallucination、知识截止、工具事实和文档事实的边界。
- 为什么 Attention、Reasoning 等概念应以工程影响而不是模型训练细节来讲。

**主要图解与示例**

- 一次请求从消息到 Token、生成和 Usage 的路径图。
- 同一问题多次调用产生不同结果的分布示例。

#### Chapter 06｜Model Gateway：流式事件、限流、预算与可替换模型

**核心问题**

怎样让业务代码不依赖某一家模型供应商，同时保留流式、Usage、错误和限流信息？

**具体内容**

- `ModelClient` 抽象与 Provider Adapter。
- 统一 Message、Tool Definition、Stream Event、Usage 和 Error 模型。
- 首 Token、增量文本、Tool Call 片段和完成事件的区别。
- Rate Limit、Retry-After、Deadline、并发限制和预算预留。
- Fake Model、Recorded Replay 和真实模型在测试中的分工。

**主要图解与示例**

- 业务层通过 Model Gateway 切换 Provider 的组件图。
- 流式 Tool Call 参数从片段到完整 JSON 的状态图。

#### Chapter 07｜Prompt 不是接口：Structured Output、JSON Schema 与版本演进

**核心问题**

为什么“要求模型输出 JSON”仍然不是可靠接口？怎样让格式、语义和版本分别受控？

**具体内容**

- System、Developer、User 和 Tool Message 的职责边界。
- JSON Mode、Structured Output 与 Schema 校验的差异。
- 格式合法、字段合法和业务语义正确是三层不同检查。
- Schema 兼容性、枚举演进、可选字段和版本化 Prompt。
- 对失败输出进行修复、重试或拒绝时的边界。

**主要图解与示例**

- `InvestigationPlan`、`Evidence`、`Hypothesis`、`ActionDraft` 四个模型。
- 一个“JSON 合法但金额单位错误”的语义失败例子。

### 第三卷：Tool Runtime 与安全副作用

#### Chapter 08｜从零实现 Tool Calling Loop：选择、执行、观察与终止

**核心问题**

不用 Agent 框架时，一个最小但完整的 Tool Loop 应该怎样运行并停止？

**具体内容**

- 模型请求、Tool Definition、Tool Call、Tool Result 和下一轮模型请求。
- Tool Call ID、并行调用、结果关联和消息顺序。
- `tool_choice`、Allowed Tools 和动态工具集合。
- max steps、Deadline、Token、费用和重复调用终止条件。
- 为什么运行轨迹可以保存，私有思维链不应保存。

**主要图解与示例**

- 原生 Tool Loop 状态机。
- 查询订单、成交和余额后生成调查摘要的完整时序。

#### Chapter 09｜生产级 Tool 契约：Schema、错误模型、来源与版本

**核心问题**

Tool 为什么不是“给模型暴露一个 Python 函数”，而是一份长期维护的协议？

**具体内容**

- 窄 Tool 与万能 Tool 的差异。
- 输入 Schema、分页、输出上限、Deadline 和取消。
- `NOT_FOUND`、`DENIED`、`STALE`、`PARTIAL`、`RETRYABLE` 等错误语义。
- 数据来源、`observed_at`、业务键、版本和新鲜度。
- Tool Result 也是不可信输入，需要 Schema 和敏感字段处理。

**主要图解与示例**

- `get_order`、`list_trades`、`get_balance`、`get_position` 的契约对照。
- 一个部分结果被误当完整事实的故障例子。

#### Chapter 10｜Agent 权限模型：风险分级、最小权限与参数绑定审批

**核心问题**

怎样防止模型通过伪造参数、重放审批或改变上下文来扩大工具权限？

**具体内容**

- READ、DRAFT、HIGH_RISK 等风险等级。
- 身份、租户和授权上下文必须来自可信通道。
- Allowlist、作用域、资源边界和最小权限。
- 审批要绑定规范化业务意图、工具版本、参数哈希、主体、租户、策略版本和有效期。
- TOCTOU、撤权、审批过期和 Maker-Checker。

**主要图解与示例**

- 模型、Policy、Approval 和 Tool Executor 的信任边界。
- 审批后修改工单内容被拒绝的例子。

#### Chapter 11｜Tool 失败语义：Deadline、重试、幂等与结果未知

**核心问题**

调用超时究竟说明什么？工具已经执行但响应丢失时，为什么不能简单重试一个新的请求？

**具体内容**

- Timeout、Cancellation、Retryable Error 与 Unknown Outcome。
- 模型级重试、传输级重试和业务级重试的区别。
- 幂等键必须绑定业务意图，不能只绑定一次 HTTP 请求。
- 指数退避、抖动、Retry Budget 和 Retry Storm。
- 结果查询、唯一业务约束与部分成功。

**主要图解与示例**

- `create_remediation_ticket` 提交成功但 ACK 丢失的时序图。
- 同一幂等键不同 Payload 必须拒绝的例子。

### 第四卷：RAG、检索与知识治理

#### Chapter 12｜RAG 的正确边界：语料、Chunk、元数据与评测问题集

**核心问题**

什么应该进入向量库，什么必须通过权威 Tool 查询？为什么 RAG 项目不应从“调 Chunk 大小”开始？

**具体内容**

- 结构化业务事实、知识文档、会话上下文和模型参数知识的区别。
- Corpus、Document、Version、Chunk 和 Metadata 的数据模型。
- Chunk 边界、标题继承、表格、代码块和跨段语义。
- 先建立 Query、Expected Document、Refusal Case，再调检索参数。
- Retrieval Recall、Answer Correctness 和 Citation Support 是不同指标。

**主要图解与示例**

- 订单事实走 Tool、Runbook 走 RAG 的路由图。
- 同一文档不同 Chunk 策略造成召回差异的例子。

#### Chapter 13｜RAG 摄取管线：解析、去重、版本、删除与重建

**核心问题**

文档更新、删除、解析失败或 Embedding 模型升级后，怎样保证检索结果来自可解释的数据版本？

**具体内容**

- Source、Canonical Document ID、Content Hash 和 Version。
- 解析、规范化、去重、切分、Embedding、索引和发布。
- `effective_from`、`valid_to`、Tombstone 与删除传播。
- 双写新索引、离线回填、校验和原子切换。
- 解析失败、半批发布和旧向量残留的处理。

**主要图解与示例**

- 摄取状态机与版本发布流程。
- Runbook v1/v2 原子切换并删除旧 Chunk 的例子。

#### Chapter 14｜PostgreSQL 与 pgvector：从 Exact Search 到 HNSW

**核心问题**

向量相似度如何落到数据库执行计划？Exact、HNSW 和 IVFFlat 各自牺牲了什么？

**具体内容**

- Embedding 维度、距离函数、归一化和模型版本。
- PostgreSQL 表结构、过滤条件与向量列。
- Exact Search 的基线意义。
- HNSW、IVFFlat 的索引构建、Recall、内存和延迟权衡。
- 为什么不同 Embedding 模型或维度不能静默混在同一索引中。

**主要图解与示例**

- Exact 与 ANN 候选搜索路径图。
- 在固定查询集上比较 Recall@K、P95 延迟和索引体积。

#### Chapter 15｜Hybrid Search：全文检索、RRF 与 Rerank

**核心问题**

为什么订单号、错误码适合关键词检索，而自然语言问题更适合向量检索？怎样把两路结果合并？

**具体内容**

- PostgreSQL Full Text Search、分词、词典与字段权重。
- Keyword 与 Vector 的互补性。
- Reciprocal Rank Fusion 的公式和稳定性。
- Rerank 的输入规模、成本、超时和失败降级。
- Query Rewrite 也属于概率步骤，必须纳入 Eval。

**主要图解与示例**

- Keyword、Vector、Fusion、Rerank 四阶段管线。
- 错误码查询与自然语言故障描述的对照。

#### Chapter 16｜安全 RAG：ACL、引用、新鲜度、冲突与拒答

**核心问题**

检索到了文档，为什么仍不能直接把它交给模型并相信答案？

**具体内容**

- 检索前 ACL、租户隔离和 PostgreSQL RLS。
- 来源优先级、文档新鲜度、as-of 查询和冲突文档。
- 引用存在不等于引用支持结论。
- 删除、缓存失效、索引延迟和过期数据。
- 证据不足、权限不足或来源冲突时的拒答策略。

**主要图解与示例**

- ACL 必须在候选召回前生效的查询图。
- 恶意 Runbook 指令和过期规则被隔离的例子。

### 第五卷：Agent 编排、状态与持久化

#### Chapter 17｜什么时候不该用 Agent：Workflow 模式与选型边界

**核心问题**

哪些任务应该使用固定 Workflow，哪些才需要模型动态决定下一步？

**具体内容**

- Prompt Chain、Routing、Parallel、Orchestrator-Workers 和 Evaluator-Optimizer。
- 固定流程与动态决策在可预测性、延迟、成本和可测试性上的差异。
- Agent 适合开放式路径，不代表所有步骤都应动态。
- Hybrid Workflow：确定性骨架中只开放少数决策点。
- Multi-Agent 的 Supervisor/Worker、委派契约、共享状态、身份与预算传播。
- 为什么多 Agent 会放大循环、重复工作、权限扩散和部分失败，因此不是默认升级方向。

**主要图解与示例**

- 五种 Workflow 模式图。
- 同一交易调查任务的固定流程和 Agent 版本对比。
- 一个 Supervisor 并行委派两个只读调查 Worker，并在超时或冲突结果下收敛的例子。

#### Chapter 18｜Agent Runtime 是状态机：Run、Step、Event 与 Budget

**核心问题**

为什么生产 Agent 的核心不是一个 `while` 循环，而是一套可恢复的状态机和事件协议？

**具体内容**

- Run、Step、Attempt、Tool Call、Artifact、Approval 和 Event。
- Run ID、Thread ID、Attempt ID、Tool Call ID 与业务幂等键的区别。
- 状态迁移、取消、Deadline、Step Budget、Token Budget 和 Cost Budget。
- Event Log、当前状态投影和审计历史。
- Worker Lease、旧 Worker 回写和 Fencing。

**主要图解与示例**

- Agent Run 状态机。
- 两个 Worker 同时恢复同一 Run 时如何拒绝旧写。

#### Chapter 19｜LangGraph：State、Node、Reducer 与 Subgraph

**核心问题**

LangGraph 解决了哪些编排问题？怎样使用它而不让框架类型污染领域模型？

**具体内容**

- Graph、Node、Edge、Conditional Edge、State 与 Reducer。
- Reducer 为什么必须满足明确的合并语义。
- Command、Subgraph、Streaming 和错误边界。
- Tool、Policy、Model、Persistence 通过 Adapter 接入。
- 原生 Runtime 概念如何映射到 LangGraph，又有哪些不完全相同之处。

**主要图解与示例**

- 一个调查 Graph 的状态和节点图。
- 同一逻辑的原生状态机与 LangGraph 映射表。

#### Chapter 20｜Context Engineering 与 Memory：上下文不是业务事实

**核心问题**

当前请求上下文、会话记忆、用户偏好、长期知识和权威业务事实应该怎样区分？

**具体内容**

- Working Context、Conversation History、Semantic Memory 和 Business Facts。
- 上下文选择、裁剪、摘要和 Token 预算。
- 长期记忆的写入条件、可信度、有效期和删除。
- Memory Poisoning、隐私和租户隔离。
- 为什么订单、余额和权限不能从 Memory 恢复。

**主要图解与示例**

- 四类状态的所有者与生命周期图。
- 一条错误记忆如何污染后续决策，以及如何隔离。

#### Chapter 21｜Checkpoint、Replay 与 Time Travel：恢复不等于重放副作用

**核心问题**

Checkpoint 保存了什么？从历史状态继续运行、重看事件和重新执行到底有什么区别？

**具体内容**

- Checkpoint、Event History、State Snapshot 和 Derived View。
- Replay 用于重建状态，不代表可以再次调用外部 Tool。
- Time Travel 应创建派生 Run，不能修改旧审计链。
- Checkpoint Schema 和迁移策略。
- 恢复点、模型版本、Tool 版本和 Policy 版本的关系。

**主要图解与示例**

- 原 Run、Checkpoint 和派生 Run 的时间线。
- 旧版本状态迁移后恢复的例子。

#### Chapter 22｜Human-in-the-loop：Interrupt、Maker-Checker 与安全恢复

**核心问题**

Agent 暂停等待人工时，怎样保证恢复后执行的仍是审批人看到的那一件事？

**具体内容**

- Interrupt、Pending Approval、Resume 和 Reject。
- Maker-Checker 与单人确认的适用边界。
- 审批绑定参数、身份、租户、权限快照、Policy 和 Tool 版本。
- 审批过期、用户撤权、内容编辑和重新提交。
- 人工队列、长时间等待和取消。

**主要图解与示例**

- 提案、暂停、审批、恢复和执行的时序图。
- 审批后参数被修改而触发重新审批的例子。

#### Chapter 23｜Agent 副作用与崩溃恢复：Outbox、Fencing 与幂等

**核心问题**

Checkpoint 已保存但副作用尚未执行，或副作用已执行但 Checkpoint 未保存时，系统如何恢复？

**具体内容**

- “Exactly Once”口号下的真实崩溃窗口。
- 数据库事务、业务唯一键、Outbox、Inbox 和结果查询。
- Pending、Sent、Confirmed、Unknown 等副作用状态。
- Worker Lease、Fencing Token 和旧执行者回写。
- 重启后是重试、查询实际状态还是转人工。

**主要图解与示例**

- Checkpoint 与副作用之间的四个崩溃点。
- `create_remediation_ticket` 在重复执行下仍只生成一张工单。

#### Chapter 24｜LangGraph 还是 Temporal：两种持久化模型的状态所有权

**核心问题**

LangGraph Checkpoint 与 Temporal History 都能恢复长任务，它们解决的是同一个问题吗？

**具体内容**

- LangGraph 的图状态、Checkpoint、Interrupt 和 Store。
- Temporal 的 Workflow、Activity、History、Timer、Signal 和确定性重放。
- 单服务 Agent 编排与跨服务长事务的差异。
- 两者组合时必须明确谁拥有最终状态解释权。
- Workflow 版本、Activity 幂等和迁移中的运行实例。

**主要图解与示例**

- 两种恢复模型的对照图。
- 等待数小时审批的任务分别如何实现。

### 第六卷：Agent Eval 与回归判断

#### Chapter 25｜Agent Eval 从哪里开始：数据集、切片与失败分类

**核心问题**

Agent 输出是概率性的，应该怎样构造可重复、能解释失败来源的评测体系？

**具体内容**

- Case、Dataset、Expected Behavior、Slice 和 Baseline。
- Retrieval、Planning、Tool、Policy、Answer 与 System Failure 分类。
- 正常、边界、拒答、攻击和故障样本。
- 调参集、开发集和保留集，避免数据污染。
- 概率系统需要重复运行并报告方差，而不是只跑一次。

**主要图解与示例**

- 从用户问题到六层失败分类的 Eval 分解图。
- 同一总分掩盖关键安全切片退化的例子。

#### Chapter 26｜确定性 Agent 评测：Schema、Tool、引用与业务不变量

**核心问题**

哪些 Agent 行为可以用代码精确判断，而不应该交给另一个模型打分？

**具体内容**

- Schema 合法性、Tool 名称、参数、调用次数和顺序。
- 禁止动作、权限边界和审批约束。
- 引用存在、文档版本、来源权限和证据覆盖。
- 业务不变量、幂等结果和恢复后状态。
- Trace/Event 与最终答案的联合断言。

**主要图解与示例**

- 一个 Eval Case 从输入、轨迹到断言的结构图。
- 错答案与正确答案但越权调用的差异。

#### Chapter 27｜LLM-as-Judge：Rubric、偏差、重复试验与人工校准

**核心问题**

开放式答案无法完全用代码判断时，怎样使用 Judge 而不把它当成绝对真相？

**具体内容**

- Rubric、Pairwise、Pointwise 和 Reference-based Judge。
- 顺序偏差、长度偏差、自我偏好和模型漂移。
- 盲评、顺序随机化、重复试验和一致率。
- 人工标注、分歧分析和 Judge 校准。
- Judge 适合评估哪些维度，哪些安全不变量绝不能委托给 Judge。

**主要图解与示例**

- Candidate、Reference、Evidence 与 Judge 的数据流。
- 同一对答案交换顺序后分数变化的例子。

#### Chapter 28｜版本化评测与回归检测：Baseline、血缘与关键切片

**核心问题**

Prompt、模型、Tool、Policy 或 Corpus 改动后，怎样判断系统是真的变好，而不是总体平均分掩盖局部退化？

**具体内容**

- Prompt、Model、Tool、Policy、Corpus、Dataset 的版本血缘。
- Baseline 与 Candidate 的可比条件。
- 质量、安全、延迟和成本不能压成单一总分。
- 关键切片、统计波动、置信区间和回归阈值。
- 线上失败样本如何回流，但不能污染保留集。

**主要图解与示例**

- 一次变更影响多个制品版本的血缘图。
- 总分上升但越权切片退化的反例。

### 第七卷：Agent 安全与 MCP

#### Chapter 29｜Agent 威胁建模：数据流、信任边界与后果分析

**核心问题**

Agent 的攻击面为什么不只是 Prompt Injection？怎样系统地找出真正危险的后果路径？

**具体内容**

- 资产、主体、数据流、信任边界和攻击者能力。
- Goal Hijacking、Tool Misuse、Privilege Escalation、Exfiltration 和 Supply Chain。
- 模型、RAG、Tool、Memory、MCP、Trace 和审批面。
- 预防、检测、响应和残余风险。
- 将安全不变量转成可以运行的攻击测试。

**主要图解与示例**

- TradeOps Agent 的数据流威胁图。
- 从恶意文档到高风险 Tool 的攻击链。

#### Chapter 30｜Prompt Injection：不可信内容、工具污染与 Memory Poisoning

**核心问题**

为什么在 System Prompt 中写“不要听从恶意指令”不能解决 Prompt Injection？

**具体内容**

- Direct、Indirect Prompt Injection 和 Instruction/Data 混淆。
- 网页、文档、日志、Tool Result 和 Memory 都是不可信内容。
- Prompt 防御的局限，真正目标是限制攻击后果。
- 最小上下文、结构化数据、Tool Allowlist、审批和输出过滤。
- Memory 写入审查、来源和撤销。

**主要图解与示例**

- 恶意 Runbook 通过检索进入上下文的攻击时序。
- 模型被诱导调用未授权 Tool，但 Policy 拒绝的例子。

#### Chapter 31｜Policy Gateway：身份、租户、最小权限、Secrets 与 SSRF

**核心问题**

怎样建立一个模型无法绕过的确定性控制面，统一处理身份、权限、出网和敏感数据？

**具体内容**

- Workload Identity、Delegated Authorization 和 Capability Credential。
- Tenant Context、Subject、Audience、Scope 和短期凭证。
- Tool Policy、Egress Allowlist、DNS/IP 重绑定与 SSRF。
- Secrets 隔离、DLP、敏感字段脱敏和代码沙箱。
- Policy 决策记录与业务审计的区别。

**主要图解与示例**

- Model、Policy Gateway、Credential Broker 和 Tool 的调用图。
- URL 看似合法但解析到内网地址的 SSRF 例子。

#### Chapter 32｜MCP 从第一性原理理解：Host、Client、Server 与 Transport

**核心问题**

MCP 解决的是什么互操作问题？它为什么不替代 Agent Runtime、业务 Tool 契约或鉴权？

**具体内容**

- Host、Client、Server 的职责。
- 生命周期、初始化、能力协商和协议版本。
- Tools、Resources、Prompts 的不同语义。
- JSON-RPC 消息、错误和取消。
- stdio 与远程 HTTP Transport 的运行和信任边界。

**主要图解与示例**

- MCP Host/Client/Server 关系图。
- 内部 Tool 通过 MCP Adapter 发布的边界图。

#### Chapter 33｜生产级 MCP 安全：OAuth、Confused Deputy 与 Tool Gateway

**核心问题**

远程 MCP Server 如何认证、授权和传递用户意图，又怎样避免 Token Passthrough 与 Confused Deputy？

**具体内容**

- OAuth 中 Authorization Server、Resource Server、Client 和 User。
- Issuer、Audience、Scope、PKCE 和动态客户端注册边界。
- Token Passthrough、Confused Deputy 和错误 Audience。
- Server Allowlist、工具名称冲突、恶意升级、撤销和供应链。
- MCP Catalog 只是发布边界，不能机械导出全部内部函数。

**主要图解与示例**

- 远程 MCP 授权时序图。
- 一个错误复用下游 Token 导致权限扩大的反例。

### 第八卷：可观测、性能、生产与平台化

#### Chapter 34｜用 OpenTelemetry 看清一次 Agent Run

**核心问题**

一次 Agent Run 跨模型、检索、Tool、Policy 和审批，怎样建立能够串联全路径的 Trace？

**具体内容**

- Trace、Span、Context、Baggage 和异步传播。
- Run Span 与 Model、Retrieval、Tool、Policy、Approval 子 Span。
- Queue Time、TTFT、完整响应和恢复时间。
- 高基数、Sampling、Prompt/参数泄漏和脱敏。
- 可观测 Trace 与不可变审计日志的职责区别。

**主要图解与示例**

- 一次调查 Run 的完整 Trace 树。
- HTTP 与 asyncio 边界丢失 Trace Context 的反例。

#### Chapter 35｜Agent 的成功率不是 HTTP 200：Metrics、Logs 与 SLO

**核心问题**

HTTP 请求成功并不代表 Agent 调查正确，应该怎样定义任务成功和服务目标？

**具体内容**

- Transport Success、Run Completion、Task Success、Evidence Quality 和 Safety Success。
- RED、USE 与 Agent 特有指标。
- Tool 成功率、审批等待、Token、成本、重试和恢复。
- SLI、SLO、Error Budget 和多窗口告警。
- Logs、Metrics、Trace、Eval 和 Audit 如何互相引用。

**主要图解与示例**

- 从 HTTP 200 到业务成功的分层漏斗。
- 一个“Run 完成但证据不足”的 SLO 失败案例。

#### Chapter 36｜Agent 延迟和成本花在哪里：分解、缓存、路由与预算

**核心问题**

Agent 为什么慢、为什么贵？怎样优化而不破坏正确性、隔离或 Eval 结果？

**具体内容**

- 排队、Prompt 构造、TTFT、生成、检索、Tool 和审批等待。
- 输入、缓存输入、输出 Token 与工具基础设施成本。
- 模型路由、并行调用、Context 压缩和结果缓存。
- 缓存键必须包含租户、模型、Prompt、Tool、Policy、Corpus 和数据版本。
- 优化前后的质量、延迟和成本必须一起比较。

**主要图解与示例**

- 单次 Run 的延迟火焰图和成本树。
- 缓存命中但 Corpus 版本变化导致陈旧答案的反例。

#### Chapter 37｜Agent 容量与背压：队列、准入、配额与 Load Shedding

**核心问题**

单次 Run 已经优化后，系统在高并发下为什么仍可能崩溃？怎样让过载变得可控？

**具体内容**

- Little's Law、并发上限、Queue Age 和可持续吞吐。
- Request/min、Token/min、连接池和 Tool 并发池。
- Admission Control、Priority、Tenant Quota 和 Retry Budget。
- 有界队列、Backpressure、Circuit Breaker 和 Load Shedding。
- Retry Amplification 与 noisy neighbor。

**主要图解与示例**

- 请求从入口到模型和 Tool 资源池的排队图。
- 无限队列导致延迟雪崩的负载曲线。

#### Chapter 38｜安全发布 Agent：Shadow、Canary、自治等级与回滚

**核心问题**

模型、Prompt、Tool 和 Policy 都可能独立变化，怎样让变更逐步获得真实流量而又随时可回退？

**具体内容**

- Offline Eval、Shadow、Canary 和正式流量的关系。
- 只读、建议、草案、审批后执行四级自治。
- Model、Prompt、Tool、Policy、Corpus 的独立版本和回滚。
- 流量切分、黏性分组和可比性。
- 安全指标、质量指标、成本指标和自动停止条件。

**主要图解与示例**

- 一项变更从 Shadow 到 Canary 的状态图。
- 模型可回滚但 Tool Schema 不兼容造成失败的例子。

#### Chapter 39｜Agent 故障实验：模型、Tool、数据库与知识库 Chaos

**核心问题**

怎样用可重复的故障实验验证超时、恢复、降级和安全不变量，而不是只在生产事故中学习？

**具体内容**

- 模型超时、限流、截断、坏 Schema 和内容污染。
- Tool 部分失败、Unknown Outcome、重复响应和慢调用。
- 数据库断连、锁等待、Checkpoint 失败和 Outbox 堆积。
- 检索陈旧、索引缺失、权限错误和恶意文档。
- 固定 Seed、可重放故障脚本和不变量断言。

**主要图解与示例**

- 故障注入点与预期系统状态矩阵。
- 失败后系统是恢复、降级、拒绝还是转人工的决策树。

#### Chapter 40｜多租户 Agent 隔离：数据库、向量、缓存、Trace 与 Eval

**核心问题**

为什么给业务表加了 `tenant_id` 仍远远不够？Tenant Context 应怎样穿过整条 Agent 链路？

**具体内容**

- Tenant Context 缺失时必须失败关闭。
- 业务表、RLS、向量索引、对象存储和知识文档。
- 缓存键、连接池会话、Prompt、Provider Key 和预算。
- Trace、Log、Eval Dataset 和人工支持访问。
- Break-glass、管理员代查和完整审计。

**主要图解与示例**

- Tenant Context 在 API、Runtime、RAG、Tool 和 Telemetry 中的传播图。
- 连接池复用导致上一个租户上下文残留的例子。

#### Chapter 41｜Agent 事故处理：降级、人工接管、Runbook 与 Postmortem

**核心问题**

Agent Run 卡住、错误率升高或安全策略触发时，生产团队怎样恢复服务并保留可调查证据？

**具体内容**

- Stuck Run、Dead Letter、审批堆积和 Tool 故障告警。
- Disable Tool、切只读、关闭自动执行和转人工队列。
- 人工接管不能通过直接修改数据库绕过状态机。
- Runbook 的前置条件、操作步骤、回滚和证据保留。
- Postmortem 区分模型、数据、工具、策略和平台根因。

**主要图解与示例**

- 从告警、降级、接管到恢复的事故时序。
- 一次错误知识版本导致批量误判的因果链。

#### Chapter 42｜生产级 Agent 平台：Safe Runtime、控制面与状态所有权

**核心问题**

当多个 Agent、租户和团队共享基础设施时，哪些能力应该抽成平台，哪些仍属于单个业务 Agent？

**具体内容**

- Model、Tool、Runtime、Checkpoint、Policy、Approval、Eval 和 Trace 的稳定接口。
- Control Plane 与 Data Plane：配置发布不能与单次 Run 状态混在一起。
- Policy、Budget、Audit、Tool Catalog 和 MCP 发布边界。
- 状态所有权、Schema 演进和正在运行实例的迁移。
- 替换模型或编排框架时，领域契约和 Eval 如何保持稳定。
- 内部 Tool、MCP 与 A2A 的边界；Multi-Agent 只作为高级模式，不作为平台默认身份。

**主要图解与示例**

- 生产级 Agent Platform 总体架构图。
- 从单一 TradeOps Agent 演进到多 Agent、多租户平台的边界变化图。

## 6. 容易重复的主题如何划界

| 容易混淆的文章 | 明确边界 |
| --- | --- |
| Chapter 08 与 18 | 08 只讲一次模型与 Tool 的调用协议；18 讲跨步骤、可持久化的运行状态。 |
| Chapter 10、22、31 | 10 讲风险模型和审批绑定；22 讲人工暂停与恢复；31 讲生产环境统一身份、出网和凭证策略。 |
| Chapter 11 与 23 | 11 讲单次 Tool 调用的超时、重试和 Unknown Outcome；23 讲跨 Checkpoint 的副作用一致性与崩溃恢复。 |
| Chapter 12–16 与 25–28 | 12–16 讲知识与检索系统；25–28 讲完整 Agent 行为评测。 |
| Chapter 16 与 40 | 16 讲知识库 ACL 与引用安全；40 讲数据库、缓存、Telemetry、Eval 在内的全链路租户隔离。 |
| Chapter 19 与 24 | 19 讲图编排 API；24 讲跨时间、跨服务的 Durable Execution 与状态所有权。 |
| Chapter 25–28 与 34–35 | 前者是离线质量判断；后者是线上运行证据和服务目标。 |
| Chapter 32 与 33 | 32 讲 MCP 协议和能力模型；33 讲远程 MCP 的身份、授权和供应链安全。 |
| Chapter 36 与 37 | 36 优化单次 Run 的延迟与成本；37 保护整个系统在过载下仍可控。 |
| Chapter 39 与 41 | 39 是主动故障实验；41 是真实生产事故的响应和恢复。 |
| Chapter 42 与前文 | 只有经过前文验证并趋于稳定的接口，才在 42 中抽成平台能力。 |

## 7. 每篇文章统一采用的知识型结构

每篇文章建议使用以下结构，但不必机械地显示为八个固定标题：

1. 用一个真实问题或失败现象引出概念。
2. 给出术语、状态和不变量的精确定义。
3. 解释正确工作路径。
4. 分析至少一个失败路径或常见误区。
5. 用架构图、状态机或时序图呈现关键关系。
6. 在 TradeOps 场景中给出最小可运行示例。
7. 说明与相邻章节的边界，不重复展开。
8. 列出官方一手资料与核对日期。

不单独设置“本周目标”“复盘问题”“打卡清单”“阶段 Gate”。如果某个知识点需要代码验证，直接把实验放在对应概念之后。

## 8. 内容完整性映射

原 52 周路线中的知识已经按主题重新组织：

- 第 1–4 周 → Chapter 02–04；
- 第 5–7 周 → Chapter 05–07；
- 第 8–12 周 → Chapter 08–11；
- 第 14–17 周 → Chapter 12–16；
- 第 18–25 周 → Chapter 17–24；
- 第 27–30 周 → Chapter 25–28；
- 第 31–34 周 → Chapter 29–33；
- 第 35–43 周 → Chapter 34–41；
- 第 44–47 周的平台化内容与第 48–52 周的综合理解 → Chapter 42。

第 13、26、39、52 周的缓冲复盘不成文；作品集、简历和面试准备不进入技术主线。原计划中的 TradeOps 阶段项目也不再单独占文章编号，而是拆成贯穿各章的示例。

## 9. 正式写作时的资料规则

- 优先使用官方文档、规范、论文、源码和维护者资料。
- OpenAI 相关内容以当前官方 API 文档为准，尤其是 [Function Calling](https://developers.openai.com/api/docs/guides/function-calling)、Structured Outputs、Agents 与 [Agent Evals](https://developers.openai.com/api/docs/guides/agent-evals)。
- LangGraph、Temporal、MCP 和 OpenTelemetry 文章在动笔当天重新核对版本。
- 对快速变化的 API 给出精确测试版本；对稳定原理使用与供应商无关的表述。
- 不引用旧教程中的过期 API，不照抄厂商示例，不用 UI 截图代替协议解释。
- 每篇尽量使用原创 Mermaid：一张结构图、一张关键时序或状态图即可；复杂关系需要时再增加，不为了“图文并茂”堆图。

## 10. 后续落地顺序

专题配置、Schema、CMS 选项与 Chapter 01 随首发提交一起上线。后续按以下规则继续：

1. 从 Chapter 02 开始按 canonical 顺序逐篇写作；已经发布的 `permalink` 保持稳定。
2. 只有文章达到完整知识密度后才发布，不为了凑周更拆成短篇。
3. `docs/LEARNING_PATHS.md` 只记录已经发布的章节；未发布规划继续以本文件为准。
4. 官方 API、框架或规范变化时，优先更新对应文章，不为了追新整体重写系列。
