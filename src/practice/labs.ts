export const MATCHING_LAB_MODES = [
  "JAVA_GOLDEN_REPLAY",
  "BROWSER_MODEL",
] as const;
export const MATCHING_LAB_COMMANDS = ["PLACE", "CANCEL"] as const;
export const MATCHING_EXECUTION_POLICIES = [
  "GTC",
  "IOC",
  "FOK",
  "POST_ONLY",
] as const;
export const GOLDEN_REPLAY_PRESENTATIONS = [
  "GOLDEN_HISTORY",
  "COUNTEREXAMPLE",
] as const;
export const GOLDEN_REPLAY_SUPPORT_ROLES = ["REPLAY", "MUTANTS"] as const;

export type MatchingLabMode = (typeof MATCHING_LAB_MODES)[number];
export type MatchingLabCommand = (typeof MATCHING_LAB_COMMANDS)[number];
export type MatchingExecutionPolicy =
  (typeof MATCHING_EXECUTION_POLICIES)[number];
export type GoldenReplayPresentation =
  (typeof GOLDEN_REPLAY_PRESENTATIONS)[number];
export type GoldenReplaySupportRole =
  (typeof GOLDEN_REPLAY_SUPPORT_ROLES)[number];

export interface GoldenReplayScenario {
  id: string;
  title: string;
  focus: string;
  commands: number;
}

export interface GoldenReplayMetric {
  label: string;
  value: string;
  note: string;
}

export interface GoldenReplayCheckBindings {
  digestField: string;
  scenarioCountField: string;
  commandCountField: string;
}

export interface GoldenReplaySupportReport {
  role: GoldenReplaySupportRole;
  path: string;
}

export interface GoldenReplayDefinition {
  presentation: GoldenReplayPresentation;
  manifestPath: string;
  scenarioPackPath: string;
  eventBatchesPath: string;
  canonicalHistoryPath: string;
  checkBindings: GoldenReplayCheckBindings;
  supportingReports: readonly GoldenReplaySupportReport[];
  digest: string;
  metrics: readonly GoldenReplayMetric[];
  scenarios: readonly GoldenReplayScenario[];
}

export interface BrowserModelSeedOrder {
  orderId: string;
  side: "BUY" | "SELL";
  priceTicks: string;
  quantityLots: string;
}

export interface BrowserModelDefinition {
  instrumentId: string;
  supportedExecutionPolicies: readonly MatchingExecutionPolicy[];
  defaultExecutionPolicy: MatchingExecutionPolicy;
  requireAcceptedExecutionPolicy: boolean;
  minPriceTicks: string;
  maxPriceTicks: string;
  minQuantityLots: string;
  maxQuantityLots: string;
  maxOrderId: string;
  maxCommands: number;
  firstGeneratedOrderId: string;
  supportedCommands: readonly MatchingLabCommand[];
  showLifecycleRegistry: boolean;
  seedOrders: readonly BrowserModelSeedOrder[];
}

export interface MatchingLabDefinition {
  kind: "MATCHING";
  projectSlug: string;
  unitCode: string;
  title: string;
  summary: string;
  modes: readonly MatchingLabMode[];
  goldenReplay: GoldenReplayDefinition;
  browserModel: BrowserModelDefinition;
}

export const PRACTICE_LABS: readonly MatchingLabDefinition[] = [
  {
    kind: "MATCHING",
    projectSlug: "high-availability-cex",
    unitCode: "M01",
    title: "价格时间优先 Matching Lab",
    summary:
      "先逐步回放固定 Java evidence，再在隔离的浏览器模型中预测一条有界 GTC 限价单会产生的事件与盘口。",
    modes: MATCHING_LAB_MODES,
    goldenReplay: {
      presentation: "GOLDEN_HISTORY",
      manifestPath: "practice/high-availability-cex/m01/evidence/manifest.json",
      scenarioPackPath:
        "practice/high-availability-cex/m01/evidence/inputs/price-time-v1.json",
      eventBatchesPath:
        "practice/high-availability-cex/m01/evidence/reports/event-batches.json",
      canonicalHistoryPath:
        "practice/high-availability-cex/m01/evidence/reports/canonical-history.utf8",
      checkBindings: {
        digestField: "canonical.digest",
        scenarioCountField: "scenarioCorpus.scenarios",
        commandCountField: "scenarioCorpus.cases",
      },
      supportingReports: [],
      digest:
        "sha256:74585489c50e81cc3e6a10044263186ce66a7f1b20e1f45015fed68614c3e5a1",
      metrics: [
        { label: "SCENARIOS", value: "08", note: "固定价格时间场景" },
        { label: "COMMANDS", value: "22", note: "逐命令事件与盘口" },
        { label: "FRESH REPLAYS", value: "100 / 100", note: "唯一历史摘要" },
        { label: "FORMAT", value: "M01H1", note: "canonical UTF-8 历史" },
      ],
      scenarios: [
        {
          id: "invalid-does-not-consume-sequence",
          title: "拒单不消耗序列",
          focus: "非法价格只产生拒绝事件，第一笔合法订单仍取得 sequence 1。",
          commands: 2,
        },
        {
          id: "empty-and-noncrossing-rest",
          title: "空盘口与不交叉挂单",
          focus: "双边未触价时分别进入 Bid 与 Ask，盘口保持不交叉。",
          commands: 2,
        },
        {
          id: "exact-touch-maker-price",
          title: "恰好触价与 maker price",
          focus: "买价等于最佳卖价时成交，成交价来自先挂在簿上的 maker。",
          commands: 2,
        },
        {
          id: "better-price-before-time",
          title: "更优价格先于时间",
          focus: "后到的更优 Ask 先成交，再轮到较早但更差的价位。",
          commands: 3,
        },
        {
          id: "same-price-fifo-three-makers",
          title: "同价三笔 FIFO",
          focus: "同一价位严格按 acceptedSequence 依次成为 maker。",
          commands: 4,
        },
        {
          id: "maker-partially-filled",
          title: "maker 部分成交",
          focus: "maker 的剩余数量保留原 sequence 并留在队首。",
          commands: 2,
        },
        {
          id: "taker-sweeps-three-levels-and-rests",
          title: "连续吃三档后挂余量",
          focus: "taker 从最佳价开始连续成交，未成交余量只入队一次。",
          commands: 4,
        },
        {
          id: "sell-side-mirror",
          title: "SELL taker 镜像",
          focus: "卖单从最高 Bid 向下成交，验证双边规则对称。",
          commands: 3,
        },
      ],
    },
    browserModel: {
      instrumentId: "BTC-USDT",
      supportedExecutionPolicies: ["GTC"],
      defaultExecutionPolicy: "GTC",
      requireAcceptedExecutionPolicy: false,
      minPriceTicks: "1",
      maxPriceTicks: "1000000000000",
      minQuantityLots: "1",
      maxQuantityLots: "1000000000000",
      maxOrderId: "9223372036854775807",
      maxCommands: 24,
      firstGeneratedOrderId: "10001",
      supportedCommands: ["PLACE"],
      showLifecycleRegistry: false,
      seedOrders: [
        { orderId: "9001", side: "BUY", priceTicks: "99", quantityLots: "2" },
        { orderId: "9002", side: "SELL", priceTicks: "101", quantityLots: "2" },
        { orderId: "9003", side: "SELL", priceTicks: "102", quantityLots: "1" },
      ],
    },
  },
  {
    kind: "MATCHING",
    projectSlug: "high-availability-cex",
    unitCode: "M02",
    title: "可寻址订单生命周期 Matching Lab",
    summary:
      "先逐条回放固定 Java lifecycle evidence，再在隔离的浏览器模型中预测 PLACE 或 CANCEL 对事件、盘口与终态身份的影响。",
    modes: MATCHING_LAB_MODES,
    goldenReplay: {
      presentation: "GOLDEN_HISTORY",
      manifestPath: "practice/high-availability-cex/m02/evidence/manifest.json",
      scenarioPackPath:
        "practice/high-availability-cex/m02/evidence/inputs/order-lifecycle-v1.json",
      eventBatchesPath:
        "practice/high-availability-cex/m02/evidence/reports/cancel-event-batches.json",
      canonicalHistoryPath:
        "practice/high-availability-cex/m02/evidence/reports/canonical-history.utf8",
      checkBindings: {
        digestField: "canonical.digest",
        scenarioCountField: "scenarioCorpus.scenarios",
        commandCountField: "scenarioCorpus.commands",
      },
      supportingReports: [],
      digest:
        "sha256:32054d63accba99b19db823c41f74bda73dc3b8a009b528f2834d2bc70839d16",
      metrics: [
        { label: "SCENARIOS", value: "10", note: "固定生命周期场景" },
        { label: "COMMANDS", value: "22 + 12", note: "PLACE + CANCEL" },
        { label: "FRESH REPLAYS", value: "100 / 100", note: "唯一历史摘要" },
        { label: "FORMAT", value: "M02H1", note: "181 行 canonical 历史" },
      ],
      scenarios: [
        {
          id: "invalid-cancel-does-not-mutate-or-consume-sequence",
          title: "非法撤单不污染状态",
          focus:
            "错误交易对与非正 orderId 只产生 Rejected，下一笔 Place 仍取得连续 sequence。",
          commands: 4,
        },
        {
          id: "cancel-only-resting-order-removes-level",
          title: "撤掉价位唯一订单",
          focus: "成功撤销精确余量，并在最后一笔离开时删除空价位。",
          commands: 2,
        },
        {
          id: "cancel-middle-preserves-fifo",
          title: "中间撤单保留 FIFO",
          focus:
            "从同价三笔订单中移除中间节点，随后成交顺序仍为第一笔到第三笔。",
          commands: 5,
        },
        {
          id: "cancel-partially-filled-remainder",
          title: "撤销部分成交余量",
          focus: "Canceled 报告当前 remaining，而不是原始委托量或零。",
          commands: 3,
        },
        {
          id: "cancel-unknown-order",
          title: "未知撤单不建 tombstone",
          focus: "ORDER_NOT_FOUND 不占用身份，之后同 ID 首次 Place 仍可接受。",
          commands: 2,
        },
        {
          id: "late-cancel-filled-order",
          title: "迟到撤单识别 FILLED",
          focus: "完全成交的 maker 与立即完全成交的 taker 都保留 FILLED 终态。",
          commands: 4,
        },
        {
          id: "repeat-cancel-stable",
          title: "重复撤单结果稳定",
          focus:
            "首次返回 Canceled，之后稳定返回 ORDER_ALREADY_CANCELED；这不是命令幂等。",
          commands: 3,
        },
        {
          id: "duplicate-active-order-id",
          title: "活动 ID 不可重复",
          focus:
            "重复 Place 只产生 DUPLICATE_ORDER_ID，原挂单和 sequence 都不变。",
          commands: 3,
        },
        {
          id: "duplicate-filled-order-id-does-not-resurrect",
          title: "FILLED ID 不复活",
          focus: "完全成交身份不能被同 ID Place 重建，迟到撤单仍看到 FILLED。",
          commands: 4,
        },
        {
          id: "duplicate-canceled-order-id-does-not-resurrect",
          title: "CANCELED ID 不复活",
          focus:
            "逐字节相同的 Place 仍是重复身份，新 ID 才取得下一个 acceptance sequence。",
          commands: 4,
        },
      ],
    },
    browserModel: {
      instrumentId: "BTC-USDT",
      supportedExecutionPolicies: ["GTC"],
      defaultExecutionPolicy: "GTC",
      requireAcceptedExecutionPolicy: false,
      minPriceTicks: "1",
      maxPriceTicks: "1000000000000",
      minQuantityLots: "1",
      maxQuantityLots: "1000000000000",
      maxOrderId: "9223372036854775807",
      maxCommands: 24,
      firstGeneratedOrderId: "10001",
      supportedCommands: ["PLACE", "CANCEL"],
      showLifecycleRegistry: true,
      seedOrders: [
        { orderId: "9001", side: "BUY", priceTicks: "99", quantityLots: "2" },
        { orderId: "9002", side: "SELL", priceTicks: "101", quantityLots: "2" },
        { orderId: "9003", side: "SELL", priceTicks: "102", quantityLots: "1" },
      ],
    },
  },
  {
    kind: "MATCHING",
    projectSlug: "high-availability-cex",
    unitCode: "M03",
    title: "最小反例与缺陷证明 Matching Lab",
    summary:
      "先沿独立参考模型缩出的六条最小反例定位首次分歧，再用同一有界浏览器模型探索 PLACE / CANCEL 对事件、盘口与终态身份的影响。",
    modes: MATCHING_LAB_MODES,
    goldenReplay: {
      presentation: "COUNTEREXAMPLE",
      manifestPath: "practice/high-availability-cex/m03/evidence/manifest.json",
      scenarioPackPath:
        "practice/high-availability-cex/m03/evidence/inputs/counterexamples-v1.json",
      eventBatchesPath:
        "practice/high-availability-cex/m03/evidence/reports/counterexamples.json",
      canonicalHistoryPath:
        "practice/high-availability-cex/m03/evidence/reports/counterexamples.canonical.utf8",
      checkBindings: {
        digestField: "counterexamples.canonical.digest",
        scenarioCountField: "counterexamples.required",
        commandCountField: "counterexamples.minimizedCommands",
      },
      supportingReports: [
        {
          role: "REPLAY",
          path: "practice/high-availability-cex/m03/evidence/reports/replay.json",
        },
        {
          role: "MUTANTS",
          path: "practice/high-availability-cex/m03/evidence/reports/mutants.json",
        },
      ],
      digest:
        "sha256:3c23c1f08975d9ad57260d8a16a8201710ee7f56671824648e4e32c477afcac1",
      metrics: [
        { label: "COUNTEREXAMPLES", value: "06", note: "六类独立语义错误" },
        { label: "MINIMIZED", value: "15 / 384", note: "最小命令 / 原始命令" },
        { label: "PROPERTIES", value: "16,384", note: "逐命令性质边界" },
        { label: "MUTANTS", value: "06 / 06", note: "严格重放并杀死" },
      ],
      scenarios: [
        {
          id: "best-price-last",
          title: "错误选择最差价格",
          focus: "同一 taker 横跨两档时，缺陷实现先选择更差 maker，首次分歧落在成交顺序。",
          commands: 3,
        },
        {
          id: "same-price-lifo",
          title: "同价队列退化为 LIFO",
          focus: "两个同价 maker 的先后次序被翻转，参考模型在第三条命令揭示 FIFO 破坏。",
          commands: 3,
        },
        {
          id: "taker-price-trade",
          title: "错误使用 taker 价格",
          focus: "买方跨价成交时错误地采用 taker limit，而不是簿上 maker 的价格。",
          commands: 2,
        },
        {
          id: "trade-quantity-overflow",
          title: "成交量越过剩余量",
          focus: "缺陷实现报告超过 maker/taker 剩余量的成交，直接破坏数量分区。",
          commands: 2,
        },
        {
          id: "cancel-ghost-book",
          title: "撤单后盘口残留幽灵节点",
          focus: "撤单事件已经成功，但活动身份与 full-depth book 不再保持双向一致。",
          commands: 2,
        },
        {
          id: "canceled-id-reuse",
          title: "已撤订单 ID 被复活",
          focus: "CANCELED 终态被同 ID 的新 Place 重用，破坏生命周期不可逆性。",
          commands: 3,
        },
      ],
    },
    browserModel: {
      instrumentId: "BTC-USDT",
      supportedExecutionPolicies: ["GTC"],
      defaultExecutionPolicy: "GTC",
      requireAcceptedExecutionPolicy: false,
      minPriceTicks: "1",
      maxPriceTicks: "1000000000000",
      minQuantityLots: "1",
      maxQuantityLots: "1000000000000",
      maxOrderId: "9223372036854775807",
      maxCommands: 24,
      firstGeneratedOrderId: "10001",
      supportedCommands: ["PLACE", "CANCEL"],
      showLifecycleRegistry: true,
      seedOrders: [
        { orderId: "9001", side: "BUY", priceTicks: "99", quantityLots: "2" },
        { orderId: "9002", side: "SELL", priceTicks: "101", quantityLots: "2" },
        { orderId: "9003", side: "SELL", priceTicks: "102", quantityLots: "1" },
      ],
    },
  },
];

export function getPracticeLab(
  projectSlug: string,
  unitCode: string,
): MatchingLabDefinition | undefined {
  const normalizedUnitCode = unitCode.toUpperCase();
  return PRACTICE_LABS.find(
    (lab) =>
      lab.projectSlug === projectSlug && lab.unitCode === normalizedUnitCode,
  );
}
