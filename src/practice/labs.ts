export const MATCHING_LAB_MODES = ["JAVA_GOLDEN_REPLAY", "BROWSER_MODEL"] as const;

export type MatchingLabMode = (typeof MATCHING_LAB_MODES)[number];

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

export interface GoldenReplayDefinition {
  manifestPath: string;
  scenarioPackPath: string;
  eventBatchesPath: string;
  canonicalHistoryPath: string;
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
  timeInForce: "GTC";
  minPriceTicks: string;
  maxPriceTicks: string;
  minQuantityLots: string;
  maxQuantityLots: string;
  maxCommands: number;
  firstGeneratedOrderId: string;
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
      manifestPath: "practice/high-availability-cex/m01/evidence/manifest.json",
      scenarioPackPath: "practice/high-availability-cex/m01/evidence/inputs/price-time-v1.json",
      eventBatchesPath:
        "practice/high-availability-cex/m01/evidence/reports/event-batches.json",
      canonicalHistoryPath:
        "practice/high-availability-cex/m01/evidence/reports/canonical-history.utf8",
      digest: "sha256:74585489c50e81cc3e6a10044263186ce66a7f1b20e1f45015fed68614c3e5a1",
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
      timeInForce: "GTC",
      minPriceTicks: "1",
      maxPriceTicks: "1000000000000",
      minQuantityLots: "1",
      maxQuantityLots: "1000000000000",
      maxCommands: 24,
      firstGeneratedOrderId: "10001",
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
    (lab) => lab.projectSlug === projectSlug && lab.unitCode === normalizedUnitCode,
  );
}
