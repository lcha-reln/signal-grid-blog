import { parseJsonPreservingIntegers } from "./lossless-json.ts";

type Side = "BUY" | "SELL";
type CommandType =
  "PLACE" | "CANCEL" | "PREPARE_RULE_SET" | "ACTIVATE_RULE_SET";
type BrowserCommandType = Extract<CommandType, "PLACE" | "CANCEL">;
type ExecutionPolicy = "GTC" | "IOC" | "FOK" | "POST_ONLY";
type LabMode = "JAVA_GOLDEN_REPLAY" | "BROWSER_MODEL" | "EVIDENCE_PREDICTION";
type GoldenReplayPresentation = "GOLDEN_HISTORY" | "COUNTEREXAMPLE";
type GoldenReplaySupportRole = "REPLAY" | "MUTANTS";
type Prediction =
  | "RESTS_ONLY"
  | "TRADES_ONLY"
  | "TRADES_AND_RESTS"
  | "POLICY_REJECTED"
  | "REMAINDER_CANCELED_ONLY"
  | "TRADES_AND_REMAINDER_CANCELED"
  | "CANCEL_SUCCEEDS"
  | "CANCEL_REJECTED";
type Lifecycle = "RESTING" | "FILLED" | "CANCELED";

interface GoldenScenarioSummary {
  id: string;
  title: string;
  focus: string;
  commands: number;
}

interface GoldenPlaceInput {
  instrumentId: string;
  orderId: number | string;
  side: Side;
  priceTicks: number | string;
  quantityLots: number | string;
  executionPolicy?: string;
}

interface GoldenCancelInput {
  instrumentId: string;
  orderId: number | string;
}

interface GoldenRuleSetIdentity {
  version: number | string;
  contentHash: string;
}

interface GoldenRuleSetArtifact extends GoldenRuleSetIdentity {
  schemaVersion: string;
  instrumentId: string;
  lowerInclusive: number | string;
  upperInclusive: number | string;
}

interface GoldenPrepareRuleSetInput {
  expectedActive: GoldenRuleSetIdentity;
  artifact: GoldenRuleSetArtifact;
}

interface GoldenActivateRuleSetInput {
  expectedApplicationSequence: number | string;
  expectedActive: GoldenRuleSetIdentity;
  target: GoldenRuleSetIdentity;
}

type GoldenInput =
  | GoldenPlaceInput
  | GoldenCancelInput
  | GoldenPrepareRuleSetInput
  | GoldenActivateRuleSetInput;

interface GoldenBookOrder {
  sequence?: number | string;
  acceptanceSequence?: number | string;
  orderId: number | string;
  remainingQuantityLots: number | string;
  admissionRuleSet?: GoldenRuleSetIdentity;
}

interface GoldenBookLevel {
  side?: Side;
  priceTicks: number | string;
  orders: GoldenBookOrder[];
}

interface GoldenBook {
  bids: GoldenBookLevel[];
  asks: GoldenBookLevel[];
}

interface GoldenEvent {
  type: string;
  code?: string;
  field?: string;
  sequence?: number | string;
  acceptanceSequence?: number | string;
  orderId?: number | string;
  side?: Side;
  priceTicks?: number | string;
  quantityLots?: number | string;
  makerSequence?: number | string;
  makerOrderId?: number | string;
  takerSequence?: number | string;
  takerOrderId?: number | string;
  remainingQuantityLots?: number | string;
  canceledQuantityLots?: number | string;
  executionPolicy?: string;
  reason?: string;
  status?: string;
  identity?: GoldenRuleSetIdentity;
  supersededIdentity?: GoldenRuleSetIdentity;
  previousActive?: GoldenRuleSetIdentity;
  active?: GoldenRuleSetIdentity;
  fence?: GoldenActivationFence;
  admissionRuleSet?: GoldenRuleSetIdentity;
  makerAdmissionRuleSet?: GoldenRuleSetIdentity;
  takerAdmissionRuleSet?: GoldenRuleSetIdentity;
  executionRuleSet?: GoldenRuleSetIdentity;
}

interface GoldenLegacyOutcome {
  events: GoldenEvent[];
  bookAfter: GoldenBook;
}

interface GoldenActivationFence {
  applicationSequence: number | string;
  controlRevision: number | string;
  firstAcceptanceSequence: number | string;
}

interface GoldenMarketState {
  nextApplicationSequence: number | string;
  nextAcceptanceSequence: number | string;
  controlRevision: number | string;
  activeRuleSet: GoldenRuleSetArtifact;
  preparedRuleSet?: GoldenRuleSetArtifact;
  lastActivationFence?: GoldenActivationFence;
  book: GoldenBook;
}

interface GoldenGovernedOutcome {
  applicationSequence: number | string;
  events: GoldenEvent[];
  stateAfter: GoldenMarketState;
}

type GoldenOutcome = GoldenLegacyOutcome | GoldenGovernedOutcome;

interface GoldenCommand {
  caseId: string;
  type?: CommandType;
  entrypoint?: "LEGACY" | "GOVERNED";
  expectedRuleSet?: GoldenRuleSetIdentity;
  input: GoldenInput;
  expected: GoldenOutcome;
}

interface GoldenScenario {
  scenarioId: string;
  commands: GoldenCommand[];
  mutantId?: string;
  classification?: string;
  propertyId?: string;
  divergenceKind?: string;
  historyIndex?: number;
  lane?: string;
  seed?: string;
  originalCommandCount?: number;
  minimizedCommandCount?: number;
  firstFailingCommandIndex?: number;
  oneMinimal?: boolean;
  shrinkTrials?: number;
  originalCommands?: unknown[];
  actualAtFailure?: GoldenOutcome;
}

interface GoldenScenarioPack {
  schemaVersion: string;
  scenarios: GoldenScenario[];
}

interface BrowserSeedOrder {
  orderId: string;
  side: Side;
  priceTicks: string;
  quantityLots: string;
}

interface BrowserModelConfig {
  instrumentId: string;
  supportedExecutionPolicies: ExecutionPolicy[];
  defaultExecutionPolicy: ExecutionPolicy;
  requireAcceptedExecutionPolicy: boolean;
  minPriceTicks: string;
  maxPriceTicks: string;
  minQuantityLots: string;
  maxQuantityLots: string;
  maxOrderId: string;
  maxCommands: number;
  firstGeneratedOrderId: string;
  supportedCommands: BrowserCommandType[];
  showLifecycleRegistry: boolean;
  seedOrders: BrowserSeedOrder[];
}

interface ClientConfig {
  modes: LabMode[];
  goldenReplay: {
    presentation: GoldenReplayPresentation;
    scenarioPackUrl: string;
    eventBatchesUrl: string;
    supportingReports: Array<{
      role: GoldenReplaySupportRole;
      url: string;
    }>;
    scenarios: GoldenScenarioSummary[];
  };
  browserModel?: BrowserModelConfig;
}

interface RestingOrder {
  orderId: bigint;
  sequence: bigint;
  side: Side;
  priceTicks: bigint;
  remainingQuantityLots: bigint;
}

interface LifecycleEntry extends RestingOrder {
  originalQuantityLots: bigint;
  filledQuantityLots: bigint;
  canceledQuantityLots: bigint;
  lifecycle: Lifecycle;
}

interface ModelState {
  acceptedSequence: bigint;
  nextOrderId: bigint;
  commandCount: number;
  orders: RestingOrder[];
  registry: Map<string, LifecycleEntry>;
}

interface ModelEvent {
  type:
    | "REJECTED"
    | "PLACE_REJECTED"
    | "CANCEL_REJECTED"
    | "ACCEPTED"
    | "TRADE"
    | "RESTED"
    | "REMAINDER_CANCELED"
    | "CANCELED";
  code?: string;
  field?: string;
  sequence?: bigint;
  orderId?: bigint;
  side?: Side;
  priceTicks?: bigint;
  quantityLots?: bigint;
  makerSequence?: bigint;
  makerOrderId?: bigint;
  takerSequence?: bigint;
  takerOrderId?: bigint;
  remainingQuantityLots?: bigint;
  canceledQuantityLots?: bigint;
  executionPolicy?: ExecutionPolicy;
  reason?: "IOC_REMAINDER";
}

const EXECUTION_POLICIES: readonly ExecutionPolicy[] = [
  "GTC",
  "IOC",
  "FOK",
  "POST_ONLY",
];

function requiredElement<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Matching Lab is missing ${selector}`);
  return element;
}

function makeElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function replaceChildren(target: Element, ...children: Node[]): void {
  target.replaceChildren(...children);
}

function formatGoldenEvent(event: GoldenEvent): string {
  const execution = event.executionRuleSet
    ? `, execution=${formatRuleSetIdentity(event.executionRuleSet)}`
    : "";
  const admission = event.admissionRuleSet
    ? `, admission=${formatRuleSetIdentity(event.admissionRuleSet)}`
    : "";
  switch (event.type) {
    case "REJECTED":
      return `Rejected(code=${event.code}, field=${event.field})`;
    case "ACCEPTED":
      return `Accepted(seq=${event.acceptanceSequence ?? event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, qty=${event.quantityLots}${event.executionPolicy ? `, policy=${event.executionPolicy}` : ""}${admission}${execution})`;
    case "TRADE":
      return `Trade(maker=${event.makerOrderId}/seq${event.makerSequence}${event.makerAdmissionRuleSet ? `/${formatRuleSetIdentity(event.makerAdmissionRuleSet)}` : ""}, taker=${event.takerOrderId}/seq${event.takerSequence}${event.takerAdmissionRuleSet ? `/${formatRuleSetIdentity(event.takerAdmissionRuleSet)}` : ""}, price=${event.priceTicks}, qty=${event.quantityLots}${execution})`;
    case "RESTED":
      return `Rested(seq=${event.acceptanceSequence ?? event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, remaining=${event.remainingQuantityLots}${admission}${execution})`;
    case "REMAINDER_CANCELED":
      return `RemainderCanceled(seq=${event.acceptanceSequence ?? event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, canceled=${event.canceledQuantityLots}, reason=${event.reason}${admission}${execution})`;
    case "PLACE_REJECTED":
      return `PlaceRejected(orderId=${event.orderId}, code=${event.code}${execution})`;
    case "CANCEL_REJECTED":
      return `CancelRejected(orderId=${event.orderId}, code=${event.code}${execution})`;
    case "CANCELED":
      return `Canceled(seq=${event.acceptanceSequence ?? event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, canceled=${event.canceledQuantityLots}${admission}${execution})`;
    case "RULE_SET_PREPARED":
      return `RuleSetPrepared(identity=${event.identity ? formatRuleSetIdentity(event.identity) : "?"}, status=${event.status}${event.supersededIdentity ? `, superseded=${formatRuleSetIdentity(event.supersededIdentity)}` : ""})`;
    case "PREPARE_RULE_SET_REJECTED":
      return `PrepareRuleSetRejected(code=${event.code})`;
    case "RULE_SET_ACTIVATED":
      return `RuleSetActivated(previous=${event.previousActive ? formatRuleSetIdentity(event.previousActive) : "?"}, active=${event.active ? formatRuleSetIdentity(event.active) : "?"}, fence=${event.fence ? `${event.fence.applicationSequence}/${event.fence.controlRevision}/${event.fence.firstAcceptanceSequence}` : "?"})`;
    case "ACTIVATE_RULE_SET_REJECTED":
      return `ActivateRuleSetRejected(code=${event.code})`;
    default:
      throw new Error(`unknown golden event type: ${event.type}`);
  }
}

function commandType(command: GoldenCommand): CommandType {
  return command.type ?? "PLACE";
}

function isGoldenPlaceInput(input: GoldenInput): input is GoldenPlaceInput {
  return "side" in input && "priceTicks" in input && "quantityLots" in input;
}

function isGoldenPrepareInput(
  input: GoldenInput,
): input is GoldenPrepareRuleSetInput {
  return "artifact" in input && "expectedActive" in input;
}

function isGoldenActivateInput(
  input: GoldenInput,
): input is GoldenActivateRuleSetInput {
  return "target" in input && "expectedApplicationSequence" in input;
}

function formatRuleSetIdentity(identity: GoldenRuleSetIdentity): string {
  return `v${identity.version}@${identity.contentHash}`;
}

function formatGoldenInput(command: GoldenCommand): string {
  const type = commandType(command);
  if (type === "CANCEL") {
    const input = command.input as GoldenCancelInput;
    return `CancelOrder(${input.instrumentId}, #${input.orderId})`;
  }
  if (type === "PREPARE_RULE_SET") {
    if (!isGoldenPrepareInput(command.input)) {
      throw new Error(
        `PREPARE_RULE_SET command ${command.caseId} is incomplete`,
      );
    }
    const { artifact, expectedActive } = command.input;
    return `PrepareRuleSet(expected=${formatRuleSetIdentity(expectedActive)}, artifact=${artifact.schemaVersion}/${artifact.instrumentId}/v${artifact.version}/[${artifact.lowerInclusive},${artifact.upperInclusive}]/${artifact.contentHash})`;
  }
  if (type === "ACTIVATE_RULE_SET") {
    if (!isGoldenActivateInput(command.input)) {
      throw new Error(
        `ACTIVATE_RULE_SET command ${command.caseId} is incomplete`,
      );
    }
    const { expectedApplicationSequence, expectedActive, target } =
      command.input;
    return `ActivateRuleSet(appSeq=${expectedApplicationSequence}, expected=${formatRuleSetIdentity(expectedActive)}, target=${formatRuleSetIdentity(target)})`;
  }
  if (!isGoldenPlaceInput(command.input)) {
    throw new Error(
      `PLACE command ${command.caseId} has no limit-order fields`,
    );
  }
  return `PlaceLimitOrder(${command.entrypoint ?? "LEGACY"}, ${command.input.instrumentId}, #${command.input.orderId}, ${command.input.side}, price=${command.input.priceTicks}, qty=${command.input.quantityLots}${command.input.executionPolicy ? `, policy=${command.input.executionPolicy}` : ""}${command.expectedRuleSet ? `, expected=${formatRuleSetIdentity(command.expectedRuleSet)}` : ""})`;
}

function createGoldenBookSide(
  title: string,
  levels: GoldenBookLevel[],
): HTMLElement {
  const section = makeElement("section", "matching-golden-book-side");
  section.append(makeElement("h4", undefined, title));
  if (levels.length === 0) {
    section.append(makeElement("p", "matching-book-empty", "EMPTY"));
    return section;
  }

  const list = makeElement("ol");
  for (const level of levels) {
    const item = makeElement("li");
    item.append(makeElement("code", undefined, `@ ${level.priceTicks}`));
    const queue = makeElement("span");
    queue.textContent = level.orders
      .map(
        (order) =>
          `#${order.orderId} · seq ${order.acceptanceSequence ?? order.sequence} · qty ${order.remainingQuantityLots}${order.admissionRuleSet ? ` · admitted ${formatRuleSetIdentity(order.admissionRuleSet)}` : ""}`,
      )
      .join("  →  ");
    item.append(queue);
    list.append(item);
  }
  section.append(list);
  return section;
}

function isGovernedOutcome(
  outcome: GoldenOutcome,
): outcome is GoldenGovernedOutcome {
  return "stateAfter" in outcome && "applicationSequence" in outcome;
}

function governedArtifactSummary(artifact: GoldenRuleSetArtifact): string {
  return `v${artifact.version} · [${artifact.lowerInclusive}, ${artifact.upperInclusive}] · ${artifact.contentHash}`;
}

function createGoldenControlState(outcome: GoldenGovernedOutcome): HTMLElement {
  const section = makeElement("section", "matching-governed-state");
  section.append(
    makeElement("h4", undefined, "APPLICATION / CONTROL STATE AFTER"),
  );
  const facts = makeElement("dl");
  const fact = (label: string, value: string, detail?: string): void => {
    const item = makeElement("div");
    item.append(
      makeElement("dt", undefined, label),
      makeElement("dd", undefined, value),
    );
    if (detail) item.append(makeElement("small", undefined, detail));
    facts.append(item);
  };
  fact(
    "APPLIED",
    String(outcome.applicationSequence),
    "本条命令取得的 ApplicationSequence",
  );
  fact(
    "NEXT APPLICATION",
    String(outcome.stateAfter.nextApplicationSequence),
    "下一条确定性 core command 的边界",
  );
  fact(
    "NEXT ACCEPTANCE",
    String(outcome.stateAfter.nextAcceptanceSequence),
    "下一笔成功接受订单的 sequence",
  );
  fact("CONTROL REVISION", String(outcome.stateAfter.controlRevision));
  section.append(facts);

  const rules = makeElement("div", "matching-governed-rules");
  const rule = (
    label: string,
    artifact: GoldenRuleSetArtifact | undefined,
  ): HTMLElement => {
    const article = makeElement("article");
    article.append(makeElement("span", undefined, label));
    if (artifact) {
      article.append(
        makeElement("strong", undefined, governedArtifactSummary(artifact)),
        makeElement(
          "small",
          undefined,
          `${artifact.schemaVersion} · ${artifact.instrumentId}`,
        ),
      );
    } else {
      article.append(makeElement("strong", undefined, "EMPTY"));
    }
    return article;
  };
  rules.append(
    rule("ACTIVE RULE SET", outcome.stateAfter.activeRuleSet),
    rule("PREPARED RULE SET", outcome.stateAfter.preparedRuleSet),
  );
  const fence = makeElement("article");
  fence.append(makeElement("span", undefined, "LAST ACTIVATION FENCE"));
  const value = outcome.stateAfter.lastActivationFence;
  fence.append(
    makeElement(
      "strong",
      undefined,
      value
        ? `app ${value.applicationSequence} · control ${value.controlRevision} · first acceptance ${value.firstAcceptanceSequence}`
        : "NONE",
    ),
  );
  rules.append(fence);
  section.append(rules);
  return section;
}

function createGoldenOutcome(
  title: string,
  outcome: GoldenOutcome,
  tone: "REFERENCE" | "MUTANT",
): HTMLElement {
  const article = makeElement(
    "article",
    `matching-counterexample-outcome matching-counterexample-outcome-${tone.toLowerCase()}`,
  );
  const heading = makeElement("header");
  heading.append(
    makeElement("span", undefined, tone),
    makeElement("strong", undefined, title),
  );
  article.append(heading);

  const events = makeElement("section");
  events.append(makeElement("h4", undefined, "EVENT BATCH"));
  const eventList = makeElement("ol");
  for (const event of outcome.events) {
    const item = makeElement("li");
    item.append(makeElement("code", undefined, formatGoldenEvent(event)));
    eventList.append(item);
  }
  events.append(eventList);
  article.append(events);

  if (isGovernedOutcome(outcome)) {
    article.append(createGoldenControlState(outcome));
  }

  const book = makeElement("section");
  book.append(makeElement("h4", undefined, "BOOK AFTER"));
  const sides = makeElement("div");
  const bookAfter = isGovernedOutcome(outcome)
    ? outcome.stateAfter.book
    : outcome.bookAfter;
  sides.append(
    createGoldenBookSide("BID · HIGH → LOW", bookAfter.bids),
    createGoldenBookSide("ASK · LOW → HIGH", bookAfter.asks),
  );
  book.append(sides);
  article.append(book);
  return article;
}

function createCounterexampleContext(scenario: GoldenScenario): HTMLElement {
  const context = makeElement("section", "matching-counterexample-context");
  const heading = makeElement("header");
  heading.append(
    makeElement("span", undefined, "MINIMAL COUNTEREXAMPLE"),
    makeElement("code", undefined, scenario.mutantId ?? "UNKNOWN MUTANT"),
  );
  context.append(heading);

  const facts = makeElement("dl");
  const addFact = (label: string, value: string): void => {
    const item = makeElement("div");
    item.append(
      makeElement("dt", undefined, label),
      makeElement("dd", undefined, value),
    );
    facts.append(item);
  };
  addFact(
    "SHRINK",
    `${scenario.originalCommandCount ?? "?"} → ${scenario.minimizedCommandCount ?? "?"} · ${scenario.shrinkTrials ?? "?"} trials`,
  );
  addFact(
    "PROVENANCE",
    `${scenario.lane ?? "UNKNOWN"} · history ${scenario.historyIndex ?? "?"} · seed ${scenario.seed ?? "?"}`,
  );
  context.append(facts);
  return context;
}

function createCounterexampleComparison(
  scenario: GoldenScenario,
  expected: GoldenOutcome,
  actual: GoldenOutcome,
): HTMLElement {
  const comparison = makeElement(
    "section",
    "matching-counterexample-comparison",
  );
  const comparisonHeading = makeElement("header");
  comparisonHeading.append(
    makeElement(
      "span",
      undefined,
      `FIRST DIVERGENCE · COMMAND ${(scenario.firstFailingCommandIndex ?? -1) + 1} / ${scenario.commands.length}`,
    ),
    makeElement(
      "strong",
      undefined,
      `${scenario.propertyId} / ${scenario.divergenceKind}`,
    ),
  );
  comparison.append(comparisonHeading);
  const outcomes = makeElement("div");
  outcomes.append(
    createGoldenOutcome("独立参考结果", expected, "REFERENCE"),
    createGoldenOutcome("缺陷实现实际结果", actual, "MUTANT"),
  );
  comparison.append(outcomes);
  return comparison;
}

function createCounterexampleReveal(
  scenario: GoldenScenario,
  command: GoldenCommand,
  commandIndex: number,
): HTMLElement {
  const reveal = makeElement("section", "matching-counterexample-reveal");
  const heading = makeElement("header");
  heading.append(
    makeElement("span", undefined, "PREDICT BEFORE REVEAL"),
    makeElement(
      "strong",
      undefined,
      "缺陷实现会在这条命令第一次偏离参考模型吗？",
    ),
  );
  reveal.append(heading);

  const controls = makeElement("div", "matching-counterexample-prediction");
  const label = makeElement("label");
  label.append(makeElement("span", undefined, "你的判断"));
  const select = makeElement("select");
  select.setAttribute("aria-label", "预测本条命令是否首次分歧");
  const placeholder = makeElement("option", undefined, "请选择…");
  placeholder.value = "";
  const before = makeElement("option", undefined, "尚未出现首次分歧");
  before.value = "BEFORE";
  const first = makeElement("option", undefined, "本条就是首次分歧");
  first.value = "FIRST";
  select.append(placeholder, before, first);
  label.append(select);

  const button = makeElement("button", undefined, "锁定预测并揭示对照");
  button.type = "button";
  button.disabled = true;
  controls.append(label, button);
  reveal.append(controls);

  const feedback = makeElement("p", "matching-counterexample-feedback");
  feedback.setAttribute("aria-live", "polite");
  feedback.textContent = "提交预测前，参考事件、盘口与缺陷结果保持隐藏。";
  reveal.append(feedback);

  const result = makeElement("div", "matching-counterexample-result");
  result.hidden = true;
  reveal.append(result);

  select.addEventListener("change", () => {
    button.disabled = select.value !== "BEFORE" && select.value !== "FIRST";
  });
  button.addEventListener("click", () => {
    const firstFailure = commandIndex === scenario.firstFailingCommandIndex;
    const predictedFirst = select.value === "FIRST";
    feedback.textContent = `${predictedFirst ? "你预测本条首次分歧" : "你预测本条尚未分歧"}；固定证据显示${firstFailure ? "分歧从本条开始" : "本条仍与参考结果一致"}。`;
    if (firstFailure && scenario.actualAtFailure) {
      replaceChildren(
        result,
        createCounterexampleComparison(
          scenario,
          command.expected,
          scenario.actualAtFailure,
        ),
      );
    } else {
      const outcome = createGoldenOutcome(
        "参考与缺陷实现的共同结果",
        command.expected,
        "REFERENCE",
      );
      outcome.classList.add("matching-counterexample-outcome-single");
      replaceChildren(result, outcome);
    }
    result.hidden = false;
    select.disabled = true;
    button.disabled = true;
  });
  return reveal;
}

function comparable(value: unknown): unknown {
  if (typeof value === "bigint" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(comparable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, comparable(entry)]),
    );
  }
  return value;
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(comparable(left)) === JSON.stringify(comparable(right));
}

export function verifyPublishedEventBatches(
  pack: GoldenScenarioPack,
  report: unknown,
): void {
  if (!report || typeof report !== "object")
    throw new Error("event-batches is not an object");
  const publishedScenarios = (report as { scenarios?: unknown }).scenarios;
  const expectedScenarios = pack.scenarios.map((scenario) => ({
    scenarioId: scenario.scenarioId,
    cases: scenario.commands.map((command) => {
      const common = {
        caseId: command.caseId,
        ...(command.type ? { type: command.type } : {}),
        ...(command.entrypoint ? { entrypoint: command.entrypoint } : {}),
        input: command.input,
        ...(command.expectedRuleSet
          ? { expectedRuleSet: command.expectedRuleSet }
          : {}),
      };
      return isGovernedOutcome(command.expected)
        ? {
            ...common,
            applicationSequence: command.expected.applicationSequence,
            events: command.expected.events,
            stateAfter: command.expected.stateAfter,
          }
        : {
            ...common,
            events: command.expected.events,
            bookAfter: command.expected.bookAfter,
          };
    }),
  }));
  if (!sameValue(publishedScenarios, expectedScenarios)) {
    throw new Error("scenario pack and event-batches differ");
  }
  const metadata = report as {
    status?: unknown;
    required?: unknown;
    minimizedCommands?: unknown;
  };
  if (metadata.status !== undefined && metadata.status !== "PASS") {
    throw new Error("event-batches report is not PASS");
  }
  if (
    metadata.required !== undefined &&
    metadata.required !== pack.scenarios.length
  ) {
    throw new Error("event-batches scenario count differs");
  }
  const commands = pack.scenarios.reduce(
    (total, scenario) => total + scenario.commands.length,
    0,
  );
  if (
    metadata.minimizedCommands !== undefined &&
    metadata.minimizedCommands !== commands
  ) {
    throw new Error("event-batches command count differs");
  }
}

function requiredRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is not an object`);
  }
  return value as Record<string, unknown>;
}

function requiredRecords(
  value: unknown,
  label: string,
): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} is not an array`);
  return value.map((entry, index) =>
    requiredRecord(entry, `${label}[${index}]`),
  );
}

function isGoldenUnsignedInteger(value: unknown): value is number | string {
  return (
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) ||
    (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/.test(value))
  );
}

function assertGoldenIdentity(value: unknown, label: string): void {
  const identity = requiredRecord(value, label);
  if (
    !isGoldenUnsignedInteger(identity.version) ||
    typeof identity.contentHash !== "string" ||
    !/^sha256:[0-9a-f]{64}$/.test(identity.contentHash)
  ) {
    throw new Error(`${label} is not a content-addressed rule identity`);
  }
}

function assertGoldenArtifact(value: unknown, label: string): void {
  const artifact = requiredRecord(value, label);
  assertGoldenIdentity(value, label);
  if (
    typeof artifact.schemaVersion !== "string" ||
    typeof artifact.instrumentId !== "string" ||
    !isGoldenUnsignedInteger(artifact.lowerInclusive) ||
    !isGoldenUnsignedInteger(artifact.upperInclusive) ||
    BigInt(artifact.lowerInclusive) <= 0n ||
    BigInt(artifact.lowerInclusive) > BigInt(artifact.upperInclusive)
  ) {
    throw new Error(`${label} is not a complete rule-set artifact`);
  }
}

function assertGoldenBook(value: unknown, label: string): void {
  const book = requiredRecord(value, label);
  for (const side of ["bids", "asks"] as const) {
    for (const [levelIndex, level] of requiredRecords(
      book[side],
      `${label}.${side}`,
    ).entries()) {
      if (
        !isGoldenUnsignedInteger(level.priceTicks) ||
        BigInt(level.priceTicks) <= 0n ||
        !Array.isArray(level.orders)
      ) {
        throw new Error(`${label}.${side}[${levelIndex}] is incomplete`);
      }
      for (const [orderIndex, rawOrder] of level.orders.entries()) {
        const order = requiredRecord(
          rawOrder,
          `${label}.${side}[${levelIndex}].orders[${orderIndex}]`,
        );
        if (
          !isGoldenUnsignedInteger(order.orderId) ||
          BigInt(order.orderId) <= 0n ||
          !isGoldenUnsignedInteger(order.remainingQuantityLots) ||
          BigInt(order.remainingQuantityLots) <= 0n ||
          (!isGoldenUnsignedInteger(order.sequence) &&
            !isGoldenUnsignedInteger(order.acceptanceSequence))
        ) {
          throw new Error(`${label} contains an incomplete resting order`);
        }
        if (order.admissionRuleSet !== undefined) {
          assertGoldenIdentity(
            order.admissionRuleSet,
            `${label}.${side}[${levelIndex}].orders[${orderIndex}].admissionRuleSet`,
          );
        }
      }
    }
  }
}

function assertGoldenOutcome(
  value: unknown,
  label: string,
): "LEGACY" | "GOVERNED" {
  const outcome = requiredRecord(value, label);
  if (!Array.isArray(outcome.events)) {
    throw new Error(`${label}.events is not an array`);
  }
  for (const [eventIndex, event] of outcome.events.entries()) {
    const eventRecord = requiredRecord(event, `${label}.events[${eventIndex}]`);
    if (typeof eventRecord.type !== "string" || !eventRecord.type) {
      throw new Error(`${label}.events[${eventIndex}] has no type`);
    }
  }
  if (
    outcome.stateAfter !== undefined ||
    outcome.applicationSequence !== undefined
  ) {
    if (
      !isGoldenUnsignedInteger(outcome.applicationSequence) ||
      !outcome.stateAfter
    ) {
      throw new Error(`${label} has a partial governed result`);
    }
    const state = requiredRecord(outcome.stateAfter, `${label}.stateAfter`);
    for (const field of [
      "nextApplicationSequence",
      "nextAcceptanceSequence",
      "controlRevision",
    ]) {
      if (!isGoldenUnsignedInteger(state[field])) {
        throw new Error(`${label}.stateAfter.${field} is missing`);
      }
    }
    assertGoldenArtifact(
      state.activeRuleSet,
      `${label}.stateAfter.activeRuleSet`,
    );
    if (state.preparedRuleSet !== undefined) {
      assertGoldenArtifact(
        state.preparedRuleSet,
        `${label}.stateAfter.preparedRuleSet`,
      );
    }
    if (state.lastActivationFence !== undefined) {
      const fence = requiredRecord(
        state.lastActivationFence,
        `${label}.stateAfter.lastActivationFence`,
      );
      for (const field of [
        "applicationSequence",
        "controlRevision",
        "firstAcceptanceSequence",
      ]) {
        if (!isGoldenUnsignedInteger(fence[field])) {
          throw new Error(
            `${label}.stateAfter.lastActivationFence.${field} is missing`,
          );
        }
      }
    }
    assertGoldenBook(state.book, `${label}.stateAfter.book`);
    return "GOVERNED";
  }
  assertGoldenBook(outcome.bookAfter, `${label}.bookAfter`);
  return "LEGACY";
}

export function parseGoldenScenarioPack(value: unknown): GoldenScenarioPack {
  const document = requiredRecord(value, "scenario pack");
  if (typeof document.schemaVersion !== "string") {
    throw new Error("scenario pack has no schemaVersion");
  }
  const scenarios = requiredRecords(
    document.scenarios,
    "scenario pack scenarios",
  );
  let outcomeKind: "LEGACY" | "GOVERNED" | undefined;
  for (const [scenarioIndex, scenario] of scenarios.entries()) {
    if (typeof scenario.scenarioId !== "string" || !scenario.scenarioId) {
      throw new Error(`scenario ${scenarioIndex} has no scenarioId`);
    }
    const commands = requiredRecords(
      scenario.commands,
      `${scenario.scenarioId}.commands`,
    );
    for (const [commandIndex, command] of commands.entries()) {
      const label = `${scenario.scenarioId}.commands[${commandIndex}]`;
      const type = command.type ?? "PLACE";
      if (
        type !== "PLACE" &&
        type !== "CANCEL" &&
        type !== "PREPARE_RULE_SET" &&
        type !== "ACTIVATE_RULE_SET"
      ) {
        throw new Error(
          `${label} has unsupported command type ${String(type)}`,
        );
      }
      if (typeof command.caseId !== "string" || !command.caseId) {
        throw new Error(`${label} has no caseId`);
      }
      const input = requiredRecord(command.input, `${label}.input`);
      if (type === "PLACE") {
        if (
          typeof input.instrumentId !== "string" ||
          (input.side !== "BUY" && input.side !== "SELL") ||
          input.orderId === undefined ||
          input.priceTicks === undefined ||
          input.quantityLots === undefined
        ) {
          throw new Error(`${label} has an incomplete PLACE input`);
        }
        if (command.entrypoint === "GOVERNED") {
          assertGoldenIdentity(
            command.expectedRuleSet,
            `${label}.expectedRuleSet`,
          );
        }
      } else if (type === "CANCEL") {
        if (
          typeof input.instrumentId !== "string" ||
          input.orderId === undefined
        ) {
          throw new Error(`${label} has an incomplete CANCEL input`);
        }
      } else if (type === "PREPARE_RULE_SET") {
        assertGoldenIdentity(
          input.expectedActive,
          `${label}.input.expectedActive`,
        );
        assertGoldenArtifact(input.artifact, `${label}.input.artifact`);
      } else {
        assertGoldenIdentity(
          input.expectedActive,
          `${label}.input.expectedActive`,
        );
        assertGoldenIdentity(input.target, `${label}.input.target`);
        if (!isGoldenUnsignedInteger(input.expectedApplicationSequence)) {
          throw new Error(`${label} has no expectedApplicationSequence`);
        }
      }
      const currentKind = assertGoldenOutcome(
        command.expected,
        `${label}.expected`,
      );
      if (outcomeKind && outcomeKind !== currentKind) {
        throw new Error(
          "scenario pack mixes legacy and governed outcome shapes",
        );
      }
      outcomeKind = currentKind;
      if (
        (type === "PREPARE_RULE_SET" || type === "ACTIVATE_RULE_SET") &&
        currentKind !== "GOVERNED"
      ) {
        throw new Error(`${label} control command has no governed stateAfter`);
      }
    }
  }
  return value as GoldenScenarioPack;
}

function verifyCounterexampleSupportingReports(
  pack: GoldenScenarioPack,
  reports: ReadonlyMap<GoldenReplaySupportRole, unknown>,
): void {
  const replay = requiredRecord(reports.get("REPLAY"), "replay report");
  const mutants = requiredRecord(reports.get("MUTANTS"), "mutant report");
  const replayScenarios = requiredRecords(replay.scenarios, "replay scenarios");
  const mutantScenarios = requiredRecords(mutants.mutants, "mutants");

  if (
    replay.status !== "PASS" ||
    replay.requested !== pack.scenarios.length ||
    replay.completed !== pack.scenarios.length ||
    replayScenarios.length !== pack.scenarios.length
  ) {
    throw new Error("replay report does not cover the strict counterexamples");
  }
  if (
    mutants.status !== "PASS" ||
    mutants.required !== pack.scenarios.length ||
    mutants.killed !== pack.scenarios.length ||
    mutantScenarios.length !== pack.scenarios.length
  ) {
    throw new Error("mutant report does not cover the strict counterexamples");
  }

  const mutantIds = new Set<string>();
  for (const [index, scenario] of pack.scenarios.entries()) {
    const fingerprint = `${scenario.propertyId}/${scenario.divergenceKind}`;
    const failureIndex = scenario.firstFailingCommandIndex;
    const originalCommandCount = scenario.originalCommandCount;
    const minimizedCommandCount = scenario.minimizedCommandCount;
    const expectedAtFailure =
      Number.isInteger(failureIndex) && failureIndex !== undefined
        ? scenario.commands[failureIndex]?.expected
        : undefined;
    if (
      !scenario.mutantId ||
      mutantIds.has(scenario.mutantId) ||
      !scenario.classification ||
      !scenario.propertyId ||
      !scenario.divergenceKind ||
      !scenario.lane ||
      !scenario.seed ||
      !Number.isInteger(scenario.historyIndex) ||
      !Number.isInteger(originalCommandCount) ||
      originalCommandCount !== scenario.originalCommands?.length ||
      !Number.isInteger(minimizedCommandCount) ||
      minimizedCommandCount !== scenario.commands.length ||
      (minimizedCommandCount ?? 0) >= (originalCommandCount ?? 0) ||
      !Number.isInteger(failureIndex) ||
      failureIndex === undefined ||
      failureIndex < 0 ||
      failureIndex >= scenario.commands.length ||
      scenario.oneMinimal !== true ||
      !Number.isInteger(scenario.shrinkTrials) ||
      (scenario.shrinkTrials ?? 0) <= 0 ||
      !expectedAtFailure ||
      !scenario.actualAtFailure ||
      sameValue(expectedAtFailure, scenario.actualAtFailure)
    ) {
      throw new Error(
        `counterexample metadata is incomplete for ${scenario.scenarioId}`,
      );
    }
    mutantIds.add(scenario.mutantId);

    const replayed = replayScenarios[index];
    if (
      replayed.scenarioId !== scenario.scenarioId ||
      replayed.mutantId !== scenario.mutantId ||
      replayed.commands !== scenario.commands.length ||
      replayed.expectedFingerprint !== fingerprint ||
      replayed.actualFingerprint !== fingerprint ||
      replayed.classification !== scenario.classification ||
      replayed.referenceOutcomesExact !== true ||
      replayed.actualOutcomeExact !== true ||
      replayed.provenanceExact !== true ||
      replayed.oneMinimalReverified !== true ||
      replayed.passed !== true
    ) {
      throw new Error(`strict replay differs for ${scenario.scenarioId}`);
    }

    const mutant = mutantScenarios[index];
    if (
      mutant.id !== scenario.mutantId ||
      mutant.classification !== scenario.classification ||
      mutant.killed !== true ||
      mutant.propertyId !== scenario.propertyId ||
      mutant.divergenceKind !== scenario.divergenceKind ||
      mutant.historyIndex !== scenario.historyIndex ||
      mutant.seed !== scenario.seed ||
      mutant.originalCommands !== scenario.originalCommandCount ||
      mutant.minimizedCommands !== scenario.minimizedCommandCount ||
      mutant.shrinkTrials !== scenario.shrinkTrials ||
      mutant.oneMinimal !== true ||
      mutant.replayed !== true
    ) {
      throw new Error(`mutant proof differs for ${scenario.scenarioId}`);
    }
  }
}

async function initializeGoldenReplay(
  root: HTMLElement,
  config: ClientConfig["goldenReplay"],
): Promise<GoldenScenarioPack> {
  const select = requiredElement<HTMLSelectElement>(
    root,
    "[data-golden-scenario]",
  );
  const stage = requiredElement<HTMLElement>(root, "[data-golden-stage]");
  const progress = requiredElement<HTMLElement>(root, "[data-golden-progress]");
  const previous = requiredElement<HTMLButtonElement>(
    root,
    "[data-golden-previous]",
  );
  const next = requiredElement<HTMLButtonElement>(root, "[data-golden-next]");
  const reset = requiredElement<HTMLButtonElement>(root, "[data-golden-reset]");
  let pack: GoldenScenarioPack | undefined;
  let commandIndex = 0;

  const setCatalogSelection = (scenarioId: string): void => {
    root
      .querySelectorAll<HTMLElement>("[data-golden-catalog-item]")
      .forEach((item) => {
        item.toggleAttribute(
          "data-current",
          item.dataset.goldenCatalogItem === scenarioId,
        );
      });
  };

  const render = (): void => {
    if (!pack) return;
    const scenario = pack.scenarios.find(
      (candidate) => candidate.scenarioId === select.value,
    );
    const summary = config.scenarios.find(
      (candidate) => candidate.id === select.value,
    );
    if (!scenario || scenario.commands.length === 0) {
      progress.textContent = "静态场景缺少命令";
      replaceChildren(
        stage,
        makeElement("p", undefined, "无法显示这个固定场景。"),
      );
      previous.disabled = true;
      next.disabled = true;
      return;
    }

    commandIndex = Math.min(commandIndex, scenario.commands.length - 1);
    const command = scenario.commands[commandIndex];
    progress.textContent = `${summary?.title ?? scenario.scenarioId} · COMMAND ${commandIndex + 1} / ${scenario.commands.length}`;
    previous.disabled = commandIndex === 0;
    next.disabled = commandIndex === scenario.commands.length - 1;
    setCatalogSelection(scenario.scenarioId);

    const fragment = document.createDocumentFragment();
    const heading = makeElement("header", "matching-golden-command-head");
    heading.append(
      makeElement("span", undefined, command.caseId),
      makeElement("code", undefined, pack.schemaVersion),
    );
    fragment.append(heading);

    if (config.presentation === "COUNTEREXAMPLE") {
      fragment.append(createCounterexampleContext(scenario));
    }

    const input = makeElement("section", "matching-golden-command");
    input.append(makeElement("h3", undefined, "FIXED INPUT"));
    input.append(makeElement("code", undefined, formatGoldenInput(command)));
    fragment.append(input);

    if (config.presentation === "COUNTEREXAMPLE") {
      fragment.append(
        createCounterexampleReveal(scenario, command, commandIndex),
      );
    } else if (isGovernedOutcome(command.expected)) {
      const outcome = createGoldenOutcome(
        "固定事件、控制状态与盘口",
        command.expected,
        "REFERENCE",
      );
      outcome.classList.add("matching-counterexample-outcome-single");
      fragment.append(outcome);
    } else {
      const events = makeElement("section", "matching-golden-events");
      events.append(makeElement("h3", undefined, "EXPECTED EVENT BATCH"));
      const eventList = makeElement("ol");
      for (const event of command.expected.events) {
        const item = makeElement("li");
        item.append(makeElement("code", undefined, formatGoldenEvent(event)));
        eventList.append(item);
      }
      events.append(eventList);
      fragment.append(events);

      const book = makeElement("section", "matching-golden-book");
      book.append(makeElement("h3", undefined, "BOOK AFTER"));
      const sides = makeElement("div");
      sides.append(
        createGoldenBookSide(
          "BID · HIGH → LOW",
          command.expected.bookAfter.bids,
        ),
        createGoldenBookSide(
          "ASK · LOW → HIGH",
          command.expected.bookAfter.asks,
        ),
      );
      book.append(sides);
      fragment.append(book);
    }
    replaceChildren(stage, fragment);
  };

  select.addEventListener("change", () => {
    commandIndex = 0;
    render();
  });
  previous.addEventListener("click", () => {
    if (commandIndex > 0) commandIndex -= 1;
    render();
  });
  next.addEventListener("click", () => {
    commandIndex += 1;
    render();
  });
  reset.addEventListener("click", () => {
    commandIndex = 0;
    render();
  });

  const scenarioUrl = new URL(config.scenarioPackUrl, document.baseURI);
  const eventBatchesUrl = new URL(config.eventBatchesUrl, document.baseURI);
  const supporting = config.supportingReports.map((report) => ({
    role: report.role,
    url: new URL(report.url, document.baseURI),
  }));
  const supportingRoles = supporting.map((report) => report.role);
  const requiredCounterexampleRoles: GoldenReplaySupportRole[] = [
    "REPLAY",
    "MUTANTS",
  ];
  if (
    new Set(supportingRoles).size !== supportingRoles.length ||
    (config.presentation === "GOLDEN_HISTORY" && supporting.length !== 0) ||
    (config.presentation === "COUNTEREXAMPLE" &&
      supportingRoles.join("\n") !== requiredCounterexampleRoles.join("\n"))
  ) {
    progress.textContent = "静态证明报告配置不完整";
    return Promise.reject(new Error("supporting report roles differ"));
  }
  if (
    [
      scenarioUrl,
      eventBatchesUrl,
      ...supporting.map((report) => report.url),
    ].some((url) => url.origin !== window.location.origin)
  ) {
    progress.textContent = "只允许读取本站静态 evidence";
    return Promise.reject(new Error("cross-origin evidence is forbidden"));
  }

  const readJson = async (url: URL): Promise<unknown> => {
    const response = await fetch(url, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseJsonPreservingIntegers(await response.text());
  };

  return Promise.all([
    readJson(scenarioUrl),
    readJson(eventBatchesUrl),
    ...supporting.map((report) => readJson(report.url)),
  ])
    .then(([scenarioDocument, eventDocument, ...supportingDocuments]) => {
      const loaded = parseGoldenScenarioPack(scenarioDocument);
      const actualIds = loaded.scenarios.map((scenario) => scenario.scenarioId);
      const configuredIds = config.scenarios.map((scenario) => scenario.id);
      if (actualIds.join("\n") !== configuredIds.join("\n")) {
        throw new Error("scenario catalog differs from the published registry");
      }
      if (
        loaded.scenarios.some(
          (scenario, index) =>
            scenario.commands.length !== config.scenarios[index]?.commands,
        )
      ) {
        throw new Error(
          "per-scenario command count differs from the published registry",
        );
      }
      const commandCount = loaded.scenarios.reduce(
        (total, scenario) => total + scenario.commands.length,
        0,
      );
      const configuredCommandCount = config.scenarios.reduce(
        (total, scenario) => total + scenario.commands,
        0,
      );
      if (commandCount !== configuredCommandCount) {
        throw new Error("command count differs from the published registry");
      }
      verifyPublishedEventBatches(loaded, eventDocument);
      if (config.presentation === "COUNTEREXAMPLE") {
        verifyCounterexampleSupportingReports(
          loaded,
          new Map(
            supporting.map((report, index) => [
              report.role,
              supportingDocuments[index],
            ]),
          ),
        );
      }
      pack = loaded;
      commandIndex = 0;
      render();
      return loaded;
    })
    .catch((error: unknown) => {
      const detail =
        error instanceof Error ? error.message : "unknown read error";
      progress.textContent = "静态场景暂时无法读取";
      replaceChildren(
        stage,
        makeElement(
          "p",
          undefined,
          `场景目录仍可阅读；请直接打开静态 JSON 或稍后重试（${detail}）。`,
        ),
      );
      previous.disabled = true;
      next.disabled = true;
      reset.disabled = true;
      throw error;
    });
}

function parseBoundedBigInt(
  value: string,
  minimum: bigint,
  maximum: bigint,
  label: string,
): bigint {
  if (!/^[0-9]+$/.test(value)) throw new Error(`${label} 只能包含十进制数字`);
  const parsed = BigInt(value);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${label} 必须在 ${minimum} 到 ${maximum} 之间`);
  }
  return parsed;
}

function chooseMaker(
  orders: RestingOrder[],
  takerSide: Side,
  limitPrice: bigint,
): RestingOrder | undefined {
  const opposite: Side = takerSide === "BUY" ? "SELL" : "BUY";
  return orders
    .filter((order) => {
      if (order.side !== opposite) return false;
      return takerSide === "BUY"
        ? order.priceTicks <= limitPrice
        : order.priceTicks >= limitPrice;
    })
    .sort((left, right) => {
      if (left.priceTicks !== right.priceTicks) {
        if (takerSide === "BUY")
          return left.priceTicks < right.priceTicks ? -1 : 1;
        return left.priceTicks > right.priceTicks ? -1 : 1;
      }
      return left.sequence < right.sequence
        ? -1
        : left.sequence > right.sequence
          ? 1
          : 0;
    })[0];
}

interface ModelPlaceInput {
  instrumentId: string;
  orderId: bigint;
  side: string;
  priceTicks: bigint;
  quantityLots: bigint;
  executionPolicy: string;
}

interface ModelCancelInput {
  instrumentId: string;
  orderId: bigint;
}

function rejected(code: string, field: string): ModelEvent[] {
  return [{ type: "REJECTED", code, field }];
}

function normalizeExecutionPolicy(value: string): ExecutionPolicy | undefined {
  return EXECUTION_POLICIES.find((policy) => policy === value);
}

function hasCrossingMaker(
  state: ModelState,
  side: Side,
  limitPrice: bigint,
): boolean {
  return chooseMaker(state.orders, side, limitPrice) !== undefined;
}

function isFullyExecutable(
  state: ModelState,
  side: Side,
  limitPrice: bigint,
  quantityLots: bigint,
): boolean {
  const opposite: Side = side === "BUY" ? "SELL" : "BUY";
  const makers = state.orders
    .filter(
      (maker) =>
        maker.side === opposite &&
        (side === "BUY"
          ? maker.priceTicks <= limitPrice
          : maker.priceTicks >= limitPrice),
    )
    .sort((left, right) => {
      if (left.priceTicks !== right.priceTicks) {
        if (side === "BUY") return left.priceTicks < right.priceTicks ? -1 : 1;
        return left.priceTicks > right.priceTicks ? -1 : 1;
      }
      return left.sequence < right.sequence
        ? -1
        : left.sequence > right.sequence
          ? 1
          : 0;
    });
  let required = quantityLots;
  for (const maker of makers) {
    if (maker.remainingQuantityLots >= required) return true;
    required -= maker.remainingQuantityLots;
  }
  return false;
}

function executePlaceCommand(
  state: ModelState,
  input: ModelPlaceInput,
  config: BrowserModelConfig,
): ModelEvent[] {
  if (input.instrumentId !== config.instrumentId)
    return rejected("UNKNOWN_INSTRUMENT", "instrumentId");
  if (input.orderId <= 0n || input.orderId > BigInt(config.maxOrderId))
    return rejected("INVALID_ORDER_ID", "orderId");
  if (input.side !== "BUY" && input.side !== "SELL")
    return rejected("INVALID_SIDE", "side");
  if (input.priceTicks <= 0n || input.priceTicks > BigInt(config.maxPriceTicks))
    return rejected("INVALID_PRICE", "priceTicks");
  if (
    input.quantityLots <= 0n ||
    input.quantityLots > BigInt(config.maxQuantityLots)
  )
    return rejected("INVALID_QUANTITY", "quantityLots");
  const executionPolicy = normalizeExecutionPolicy(input.executionPolicy);
  if (!executionPolicy)
    return rejected("INVALID_EXECUTION_POLICY", "executionPolicy");
  if (state.registry.has(input.orderId.toString())) {
    return [
      {
        type: "PLACE_REJECTED",
        orderId: input.orderId,
        code: "DUPLICATE_ORDER_ID",
      },
    ];
  }

  const side = input.side;
  if (
    executionPolicy === "FOK" &&
    !isFullyExecutable(state, side, input.priceTicks, input.quantityLots)
  ) {
    return [
      {
        type: "PLACE_REJECTED",
        orderId: input.orderId,
        code: "FOK_NOT_FILLABLE",
      },
    ];
  }
  if (
    executionPolicy === "POST_ONLY" &&
    hasCrossingMaker(state, side, input.priceTicks)
  ) {
    return [
      {
        type: "PLACE_REJECTED",
        orderId: input.orderId,
        code: "POST_ONLY_WOULD_TAKE",
      },
    ];
  }

  const acceptedSequence = state.acceptedSequence + 1n;
  let remaining = input.quantityLots;
  const accepted: LifecycleEntry = {
    orderId: input.orderId,
    sequence: acceptedSequence,
    side,
    priceTicks: input.priceTicks,
    originalQuantityLots: input.quantityLots,
    filledQuantityLots: 0n,
    remainingQuantityLots: input.quantityLots,
    canceledQuantityLots: 0n,
    lifecycle: "RESTING",
  };
  state.registry.set(input.orderId.toString(), accepted);
  const batch: ModelEvent[] = [
    {
      type: "ACCEPTED",
      sequence: acceptedSequence,
      orderId: input.orderId,
      side,
      priceTicks: input.priceTicks,
      quantityLots: input.quantityLots,
      executionPolicy,
    },
  ];

  while (remaining > 0n) {
    const maker = chooseMaker(state.orders, side, input.priceTicks);
    if (!maker) break;
    const traded =
      remaining < maker.remainingQuantityLots
        ? remaining
        : maker.remainingQuantityLots;
    maker.remainingQuantityLots -= traded;
    const makerLifecycle = state.registry.get(maker.orderId.toString());
    if (!makerLifecycle)
      throw new Error("resting maker is absent from lifecycle registry");
    makerLifecycle.filledQuantityLots += traded;
    remaining -= traded;
    accepted.filledQuantityLots += traded;
    accepted.remainingQuantityLots = remaining;
    batch.push({
      type: "TRADE",
      makerSequence: maker.sequence,
      makerOrderId: maker.orderId,
      takerSequence: acceptedSequence,
      takerOrderId: input.orderId,
      priceTicks: maker.priceTicks,
      quantityLots: traded,
    });
    if (maker.remainingQuantityLots === 0n) {
      state.orders = state.orders.filter((candidate) => candidate !== maker);
      makerLifecycle.lifecycle = "FILLED";
    }
  }

  if (remaining > 0n && executionPolicy === "IOC") {
    accepted.remainingQuantityLots = 0n;
    accepted.canceledQuantityLots = remaining;
    accepted.lifecycle = "CANCELED";
    batch.push({
      type: "REMAINDER_CANCELED",
      sequence: acceptedSequence,
      orderId: input.orderId,
      side,
      priceTicks: input.priceTicks,
      canceledQuantityLots: remaining,
      reason: "IOC_REMAINDER",
    });
  } else if (remaining > 0n) {
    if (executionPolicy === "FOK")
      throw new Error("fillable FOK retained an unexpected remainder");
    accepted.remainingQuantityLots = remaining;
    state.orders.push(accepted);
    batch.push({
      type: "RESTED",
      sequence: acceptedSequence,
      orderId: input.orderId,
      side,
      priceTicks: input.priceTicks,
      remainingQuantityLots: remaining,
    });
  } else {
    accepted.lifecycle = "FILLED";
  }

  state.acceptedSequence = acceptedSequence;
  return batch;
}

function executeCancelCommand(
  state: ModelState,
  input: ModelCancelInput,
  config: BrowserModelConfig,
): ModelEvent[] {
  if (input.instrumentId !== config.instrumentId)
    return rejected("UNKNOWN_INSTRUMENT", "instrumentId");
  if (input.orderId <= 0n || input.orderId > BigInt(config.maxOrderId))
    return rejected("INVALID_ORDER_ID", "orderId");

  const order = state.registry.get(input.orderId.toString());
  if (!order) {
    return [
      {
        type: "CANCEL_REJECTED",
        orderId: input.orderId,
        code: "ORDER_NOT_FOUND",
      },
    ];
  }
  if (order.lifecycle === "FILLED") {
    return [
      {
        type: "CANCEL_REJECTED",
        orderId: input.orderId,
        code: "ORDER_ALREADY_FILLED",
      },
    ];
  }
  if (order.lifecycle === "CANCELED") {
    return [
      {
        type: "CANCEL_REJECTED",
        orderId: input.orderId,
        code: "ORDER_ALREADY_CANCELED",
      },
    ];
  }

  const canceledQuantityLots = order.remainingQuantityLots;
  order.remainingQuantityLots = 0n;
  order.canceledQuantityLots = canceledQuantityLots;
  order.lifecycle = "CANCELED";
  state.orders = state.orders.filter((candidate) => candidate !== order);
  return [
    {
      type: "CANCELED",
      sequence: order.sequence,
      orderId: order.orderId,
      side: order.side,
      priceTicks: order.priceTicks,
      canceledQuantityLots,
    },
  ];
}

function formatModelEvent(
  event: ModelEvent,
  showExecutionPolicy: boolean,
): string {
  switch (event.type) {
    case "REJECTED":
      return `Rejected(code=${event.code}, field=${event.field})`;
    case "ACCEPTED":
      return `Accepted(seq=${event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, qty=${event.quantityLots}${showExecutionPolicy ? `, policy=${event.executionPolicy}` : ""})`;
    case "TRADE":
      return `Trade(maker=${event.makerOrderId}/seq${event.makerSequence}, taker=${event.takerOrderId}/seq${event.takerSequence}, price=${event.priceTicks}, qty=${event.quantityLots})`;
    case "RESTED":
      return `Rested(seq=${event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, remaining=${event.remainingQuantityLots})`;
    case "REMAINDER_CANCELED":
      return `RemainderCanceled(seq=${event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, canceled=${event.canceledQuantityLots}, reason=${event.reason})`;
    case "PLACE_REJECTED":
      return `PlaceRejected(orderId=${event.orderId}, code=${event.code})`;
    case "CANCEL_REJECTED":
      return `CancelRejected(orderId=${event.orderId}, code=${event.code})`;
    case "CANCELED":
      return `Canceled(seq=${event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, canceled=${event.canceledQuantityLots})`;
  }
}

function predictionFor(
  events: ModelEvent[],
  command: BrowserCommandType,
): Prediction {
  if (command === "CANCEL") {
    return events[0]?.type === "CANCELED"
      ? "CANCEL_SUCCEEDS"
      : "CANCEL_REJECTED";
  }
  if (
    events[0]?.type === "PLACE_REJECTED" &&
    (events[0].code === "FOK_NOT_FILLABLE" ||
      events[0].code === "POST_ONLY_WOULD_TAKE")
  ) {
    return "POLICY_REJECTED";
  }
  const traded = events.some((event) => event.type === "TRADE");
  const rested = events.some((event) => event.type === "RESTED");
  const remainderCanceled = events.some(
    (event) => event.type === "REMAINDER_CANCELED",
  );
  if (remainderCanceled) {
    return traded ? "TRADES_AND_REMAINDER_CANCELED" : "REMAINDER_CANCELED_ONLY";
  }
  if (!traded) return "RESTS_ONLY";
  return rested ? "TRADES_AND_RESTS" : "TRADES_ONLY";
}

function predictionLabel(prediction: Prediction): string {
  switch (prediction) {
    case "RESTS_ONLY":
      return "只挂单";
    case "TRADES_ONLY":
      return "全部成交";
    case "TRADES_AND_RESTS":
      return "成交后挂余量";
    case "POLICY_REJECTED":
      return "策略准入拒绝";
    case "REMAINDER_CANCELED_ONLY":
      return "只取消 IOC 余量";
    case "TRADES_AND_REMAINDER_CANCELED":
      return "成交后取消 IOC 余量";
    case "CANCEL_SUCCEEDS":
      return "撤单成功";
    case "CANCEL_REJECTED":
      return "撤单被稳定拒绝";
  }
}

function groupModelLevels(
  orders: RestingOrder[],
  side: Side,
): RestingOrder[][] {
  const levels = new Map<string, RestingOrder[]>();
  for (const order of orders.filter((candidate) => candidate.side === side)) {
    const key = order.priceTicks.toString();
    const queue = levels.get(key) ?? [];
    queue.push(order);
    levels.set(key, queue);
  }

  return [...levels.values()]
    .map((queue) =>
      queue.sort((left, right) => (left.sequence < right.sequence ? -1 : 1)),
    )
    .sort((left, right) => {
      const leftPrice = left[0].priceTicks;
      const rightPrice = right[0].priceTicks;
      if (leftPrice === rightPrice) return 0;
      if (side === "BUY") return leftPrice > rightPrice ? -1 : 1;
      return leftPrice < rightPrice ? -1 : 1;
    });
}

function modelBook(state: ModelState): GoldenBook {
  const levels = (side: Side): GoldenBookLevel[] =>
    groupModelLevels(state.orders, side).map((queue) => ({
      priceTicks: queue[0].priceTicks.toString(),
      orders: queue.map((order) => ({
        sequence: order.sequence.toString(),
        orderId: order.orderId.toString(),
        remainingQuantityLots: order.remainingQuantityLots.toString(),
      })),
    }));
  return { bids: levels("BUY"), asks: levels("SELL") };
}

function eventsMatchGoldenCorpus(
  actualEvents: ModelEvent[],
  expectedEvents: GoldenEvent[],
  requireAcceptedExecutionPolicy: boolean,
): boolean {
  if (
    requireAcceptedExecutionPolicy &&
    expectedEvents.some(
      (event) => event.type === "ACCEPTED" && !event.executionPolicy,
    )
  ) {
    throw new Error("Accepted event is missing required executionPolicy");
  }
  const comparableActual = actualEvents.map((event, index) => {
    if (
      event.type !== "ACCEPTED" ||
      requireAcceptedExecutionPolicy ||
      expectedEvents[index]?.executionPolicy !== undefined
    ) {
      return event;
    }
    const { executionPolicy: _executionPolicy, ...legacyAccepted } = event;
    return legacyAccepted;
  });
  return sameValue(comparableActual, expectedEvents);
}

function verifyBrowserModelAgainstCorpus(
  pack: GoldenScenarioPack,
  config: BrowserModelConfig,
): number {
  let checkedCommands = 0;
  for (const scenario of pack.scenarios) {
    const state: ModelState = {
      acceptedSequence: 0n,
      nextOrderId: BigInt(config.firstGeneratedOrderId),
      commandCount: 0,
      orders: [],
      registry: new Map(),
    };
    for (const command of scenario.commands) {
      const type = commandType(command);
      if (type !== "PLACE" && type !== "CANCEL") {
        throw new Error(
          `browser model cannot self-check ${type} at ${scenario.scenarioId}/${command.caseId}`,
        );
      }
      if (!config.supportedCommands.includes(type)) {
        throw new Error(
          `unsupported command ${type} at ${scenario.scenarioId}/${command.caseId}`,
        );
      }
      let actualEvents: ModelEvent[];
      if (type === "CANCEL") {
        const input = command.input as GoldenCancelInput;
        actualEvents = executeCancelCommand(
          state,
          {
            instrumentId: input.instrumentId,
            orderId: BigInt(input.orderId),
          },
          config,
        );
      } else {
        if (!isGoldenPlaceInput(command.input)) {
          throw new Error(
            `PLACE input is incomplete at ${scenario.scenarioId}/${command.caseId}`,
          );
        }
        actualEvents = executePlaceCommand(
          state,
          {
            instrumentId: command.input.instrumentId,
            orderId: BigInt(command.input.orderId),
            side: command.input.side,
            priceTicks: BigInt(command.input.priceTicks),
            quantityLots: BigInt(command.input.quantityLots),
            executionPolicy: command.input.executionPolicy ?? "GTC",
          },
          config,
        );
      }
      if (
        !eventsMatchGoldenCorpus(
          actualEvents,
          command.expected.events,
          config.requireAcceptedExecutionPolicy,
        )
      ) {
        throw new Error(
          `event mismatch at ${scenario.scenarioId}/${command.caseId}`,
        );
      }
      if (isGovernedOutcome(command.expected)) {
        throw new Error(
          `browser model received governed evidence at ${scenario.scenarioId}/${command.caseId}`,
        );
      }
      if (!sameValue(modelBook(state), command.expected.bookAfter)) {
        throw new Error(
          `book mismatch at ${scenario.scenarioId}/${command.caseId}`,
        );
      }
      checkedCommands += 1;
    }
  }
  return checkedCommands;
}

function renderModelBook(target: HTMLElement, levels: RestingOrder[][]): void {
  if (levels.length === 0) {
    replaceChildren(target, makeElement("p", "matching-book-empty", "EMPTY"));
    return;
  }

  const list = makeElement("ol", "matching-book-levels");
  for (const queue of levels) {
    const item = makeElement("li");
    item.append(
      makeElement(
        "code",
        "matching-book-price",
        queue[0].priceTicks.toString(),
      ),
    );
    const orders = makeElement("ol", "matching-book-queue");
    for (const order of queue) {
      const resting = makeElement("li");
      resting.append(
        makeElement("strong", undefined, `#${order.orderId}`),
        makeElement("span", undefined, `seq ${order.sequence}`),
        makeElement("code", undefined, `qty ${order.remainingQuantityLots}`),
      );
      orders.append(resting);
    }
    item.append(orders);
    list.append(item);
  }
  replaceChildren(target, list);
}

function renderLifecycleRegistry(
  target: HTMLElement,
  registry: Map<string, LifecycleEntry>,
  visible: boolean,
): void {
  target.hidden = !visible;
  if (!visible) {
    replaceChildren(target);
    return;
  }
  const entries = [...registry.values()].sort((left, right) =>
    left.sequence < right.sequence
      ? -1
      : left.sequence > right.sequence
        ? 1
        : 0,
  );
  if (entries.length === 0) {
    replaceChildren(
      target,
      makeElement("p", "matching-book-empty", "NO ACCEPTED ORDER"),
    );
    return;
  }
  const list = makeElement("ol", "matching-registry-entries");
  for (const entry of entries) {
    const item = makeElement("li");
    item.dataset.lifecycle = entry.lifecycle;
    item.append(
      makeElement(
        "strong",
        undefined,
        `#${entry.orderId} · ${entry.lifecycle}`,
      ),
      makeElement("code", undefined, `seq ${entry.sequence}`),
      makeElement(
        "span",
        undefined,
        `original ${entry.originalQuantityLots} = filled ${entry.filledQuantityLots} + remaining ${entry.remainingQuantityLots} + canceled ${entry.canceledQuantityLots}`,
      ),
    );
    list.append(item);
  }
  replaceChildren(target, list);
}

function initializeBrowserModel(
  root: HTMLElement,
  config: BrowserModelConfig,
  corpus: Promise<GoldenScenarioPack>,
): void {
  const form = requiredElement<HTMLFormElement>(root, "[data-model-form]");
  const commandTypeInput = requiredElement<HTMLSelectElement>(
    root,
    "[data-model-command-type]",
  );
  const sideInput = requiredElement<HTMLSelectElement>(
    root,
    "[data-model-side]",
  );
  const executionPolicyInput = root.querySelector<HTMLSelectElement>(
    "[data-model-execution-policy]",
  );
  const priceInput = requiredElement<HTMLInputElement>(
    root,
    "[data-model-price]",
  );
  const quantityInput = requiredElement<HTMLInputElement>(
    root,
    "[data-model-quantity]",
  );
  const cancelOrderIdInput = requiredElement<HTMLInputElement>(
    root,
    "[data-model-cancel-order-id]",
  );
  const placeFields = requiredElement<HTMLElement>(
    root,
    "[data-model-place-fields]",
  );
  const cancelFields = requiredElement<HTMLElement>(
    root,
    "[data-model-cancel-fields]",
  );
  const predictionInput = requiredElement<HTMLSelectElement>(
    root,
    "[data-model-prediction]",
  );
  const submit = requiredElement<HTMLButtonElement>(
    root,
    "[data-model-submit]",
  );
  const reset = requiredElement<HTMLButtonElement>(root, "[data-model-reset]");
  const empty = requiredElement<HTMLButtonElement>(root, "[data-model-empty]");
  const readiness = requiredElement<HTMLElement>(
    root,
    "[data-model-readiness]",
  );
  const error = requiredElement<HTMLElement>(root, "[data-model-error]");
  const orderId = requiredElement<HTMLElement>(root, "[data-model-order-id]");
  const commandCount = requiredElement<HTMLElement>(
    root,
    "[data-model-command-count]",
  );
  const reveal = requiredElement<HTMLElement>(root, "[data-model-reveal]");
  const comparison = requiredElement<HTMLElement>(
    root,
    "[data-model-comparison]",
  );
  const command = requiredElement<HTMLElement>(root, "[data-model-command]");
  const events = requiredElement<HTMLOListElement>(root, "[data-model-events]");
  const bids = requiredElement<HTMLElement>(root, "[data-model-bids]");
  const asks = requiredElement<HTMLElement>(root, "[data-model-asks]");
  const registry = requiredElement<HTMLElement>(root, "[data-model-registry]");
  const minPrice = BigInt(config.minPriceTicks);
  const maxPrice = BigInt(config.maxPriceTicks);
  const minQuantity = BigInt(config.minQuantityLots);
  const maxQuantity = BigInt(config.maxQuantityLots);
  const maxOrderId = BigInt(config.maxOrderId);
  const firstOrderId = BigInt(config.firstGeneratedOrderId);
  const showExecutionPolicy = config.supportedExecutionPolicies.length > 1;
  if (
    !config.supportedExecutionPolicies.includes(
      config.defaultExecutionPolicy,
    ) ||
    (showExecutionPolicy && !executionPolicyInput)
  ) {
    throw new Error("Matching Lab execution-policy configuration is invalid");
  }
  let state: ModelState;
  let modelReady = false;

  const seededState = (): ModelState => {
    const entries = config.seedOrders.map((seed, index): LifecycleEntry => {
      const quantityLots = parseBoundedBigInt(
        seed.quantityLots,
        minQuantity,
        maxQuantity,
        "seed quantityLots",
      );
      return {
        orderId: BigInt(seed.orderId),
        sequence: BigInt(index + 1),
        side: seed.side,
        priceTicks: parseBoundedBigInt(
          seed.priceTicks,
          minPrice,
          maxPrice,
          "seed priceTicks",
        ),
        originalQuantityLots: quantityLots,
        filledQuantityLots: 0n,
        remainingQuantityLots: quantityLots,
        canceledQuantityLots: 0n,
        lifecycle: "RESTING",
      };
    });
    return {
      acceptedSequence: BigInt(entries.length),
      nextOrderId: firstOrderId,
      commandCount: 0,
      orders: entries,
      registry: new Map(
        entries.map((entry) => [entry.orderId.toString(), entry]),
      ),
    };
  };

  const emptyState = (): ModelState => ({
    acceptedSequence: 0n,
    nextOrderId: firstOrderId,
    commandCount: 0,
    orders: [],
    registry: new Map(),
  });

  const renderState = (): void => {
    orderId.textContent = `next Place orderId = ${state.nextOrderId}`;
    commandCount.textContent = String(state.commandCount);
    submit.disabled = !modelReady || state.commandCount >= config.maxCommands;
    renderModelBook(bids, groupModelLevels(state.orders, "BUY"));
    renderModelBook(asks, groupModelLevels(state.orders, "SELL"));
    renderLifecycleRegistry(
      registry,
      state.registry,
      config.showLifecycleRegistry,
    );
  };

  const renderCommandFields = (): void => {
    const type = commandTypeInput.value as BrowserCommandType;
    placeFields.hidden = type !== "PLACE";
    cancelFields.hidden = type !== "CANCEL";
    for (const option of predictionInput.options) {
      option.hidden =
        Boolean(option.dataset.command) && option.dataset.command !== type;
    }
    predictionInput.value = "";
  };

  const clearFeedback = (): void => {
    error.hidden = true;
    error.textContent = "";
    reveal.hidden = true;
    replaceChildren(events);
  };

  const replaceState = (nextState: ModelState): void => {
    state = nextState;
    predictionInput.value = "";
    clearFeedback();
    renderState();
  };

  commandTypeInput.addEventListener("change", () => {
    renderCommandFields();
    clearFeedback();
  });
  executionPolicyInput?.addEventListener("change", clearFeedback);

  form.addEventListener("submit", (formEvent) => {
    formEvent.preventDefault();
    try {
      if (!modelReady)
        throw new Error("corpus 自检尚未一致，浏览器模型保持禁用");
      if (state.commandCount >= config.maxCommands) {
        throw new Error(`本轮最多执行 ${config.maxCommands} 条命令，请先重置`);
      }
      if (!predictionInput.value) throw new Error("请先选择 event batch 预测");
      const prediction = predictionInput.value as Prediction;
      const type = commandTypeInput.value as BrowserCommandType;
      if (!config.supportedCommands.includes(type))
        throw new Error(`本单元不支持 ${type}`);
      let batch: ModelEvent[];
      let commandText: string;
      if (type === "CANCEL") {
        const targetOrderId = parseBoundedBigInt(
          cancelOrderIdInput.value,
          1n,
          maxOrderId,
          "cancel orderId",
        );
        batch = executeCancelCommand(
          state,
          { instrumentId: config.instrumentId, orderId: targetOrderId },
          config,
        );
        commandText = `CancelOrder(${config.instrumentId}, #${targetOrderId})`;
      } else {
        const side = sideInput.value as Side;
        if (side !== "BUY" && side !== "SELL")
          throw new Error("side 必须是 BUY 或 SELL");
        const priceTicks = parseBoundedBigInt(
          priceInput.value,
          minPrice,
          maxPrice,
          "priceTicks",
        );
        const quantityLots = parseBoundedBigInt(
          quantityInput.value,
          minQuantity,
          maxQuantity,
          "quantityLots",
        );
        const generatedOrderId = state.nextOrderId;
        const executionPolicy =
          executionPolicyInput?.value ?? config.defaultExecutionPolicy;
        batch = executePlaceCommand(
          state,
          {
            instrumentId: config.instrumentId,
            orderId: generatedOrderId,
            side,
            priceTicks,
            quantityLots,
            executionPolicy,
          },
          config,
        );
        if (batch[0]?.type === "ACCEPTED") state.nextOrderId += 1n;
        commandText = `PlaceLimitOrder(${config.instrumentId}, #${generatedOrderId}, ${side}, price=${priceTicks}, qty=${quantityLots}, ${executionPolicy})`;
      }
      state.commandCount += 1;
      const revealed = predictionFor(batch, type);
      comparison.textContent =
        prediction === revealed
          ? `你的预测“${predictionLabel(prediction)}”与模型揭示一致。`
          : `你的预测是“${predictionLabel(prediction)}”，模型揭示为“${predictionLabel(revealed)}”。`;
      command.textContent = commandText;
      replaceChildren(
        events,
        ...batch.map((event) => {
          const item = makeElement("li");
          item.append(
            makeElement(
              "code",
              undefined,
              formatModelEvent(event, showExecutionPolicy),
            ),
          );
          return item;
        }),
      );
      error.hidden = true;
      reveal.hidden = false;
      predictionInput.value = "";
      renderState();
    } catch (caught: unknown) {
      error.textContent =
        caught instanceof Error ? caught.message : "输入无法解析";
      error.hidden = false;
      reveal.hidden = true;
    }
  });

  reset.addEventListener("click", () => replaceState(seededState()));
  empty.addEventListener("click", () => replaceState(emptyState()));
  state = seededState();
  renderCommandFields();
  renderState();
  corpus
    .then((pack) => {
      const checkedCommands = verifyBrowserModelAgainstCorpus(pack, config);
      modelReady = true;
      readiness.textContent = `${pack.scenarios.length} 场景 / ${checkedCommands} 命令 corpus 重放一致，浏览器模型已解锁。`;
      readiness.dataset.ready = "true";
      renderState();
    })
    .catch((caught: unknown) => {
      modelReady = false;
      const detail =
        caught instanceof Error ? caught.message : "unknown self-check error";
      readiness.textContent = `corpus 自检不一致，浏览器模型保持禁用（${detail}）。`;
      readiness.dataset.ready = "false";
      renderState();
    });
}

type EvidencePredictionAnswer =
  | "ORDER_ACCEPTED"
  | "ORDER_REJECTED"
  | "ORDER_CANCELED"
  | "RULE_PREPARED"
  | "RULE_ACTIVATED"
  | "CONTROL_REJECTED";

const EVIDENCE_PREDICTION_LABELS: Readonly<
  Record<EvidencePredictionAnswer, string>
> = {
  ORDER_ACCEPTED: "订单被接受",
  ORDER_REJECTED: "订单被拒绝",
  ORDER_CANCELED: "订单撤销成功",
  RULE_PREPARED: "规则集准备成功或幂等命中",
  RULE_ACTIVATED: "规则集激活成功",
  CONTROL_REJECTED: "Prepare / Activate 被拒绝",
};

function evidencePredictionFor(
  command: GoldenCommand,
): EvidencePredictionAnswer {
  const first = command.expected.events[0];
  if (!first) throw new Error(`${command.caseId} has an empty event batch`);
  switch (first.type) {
    case "ACCEPTED":
      return "ORDER_ACCEPTED";
    case "CANCELED":
      return "ORDER_CANCELED";
    case "RULE_SET_PREPARED":
      return "RULE_PREPARED";
    case "RULE_SET_ACTIVATED":
      return "RULE_ACTIVATED";
    case "PREPARE_RULE_SET_REJECTED":
    case "ACTIVATE_RULE_SET_REJECTED":
      return "CONTROL_REJECTED";
    case "REJECTED":
      return commandType(command) === "PREPARE_RULE_SET" ||
        commandType(command) === "ACTIVATE_RULE_SET"
        ? "CONTROL_REJECTED"
        : "ORDER_REJECTED";
    case "PLACE_REJECTED":
    case "CANCEL_REJECTED":
      return "ORDER_REJECTED";
    default:
      throw new Error(
        `${command.caseId} starts with unsupported event ${first.type}`,
      );
  }
}

function initializeEvidencePrediction(
  root: HTMLElement,
  corpus: Promise<GoldenScenarioPack>,
): void {
  const panel = requiredElement<HTMLElement>(
    root,
    "[data-evidence-prediction]",
  );
  const scenarioSelect = requiredElement<HTMLSelectElement>(
    panel,
    "[data-evidence-prediction-scenario]",
  );
  const previous = requiredElement<HTMLButtonElement>(
    panel,
    "[data-evidence-prediction-previous]",
  );
  const next = requiredElement<HTMLButtonElement>(
    panel,
    "[data-evidence-prediction-next]",
  );
  const progress = requiredElement<HTMLElement>(
    panel,
    "[data-evidence-prediction-progress]",
  );
  const type = requiredElement<HTMLElement>(
    panel,
    "[data-evidence-prediction-type]",
  );
  const commandText = requiredElement<HTMLElement>(
    panel,
    "[data-evidence-prediction-command]",
  );
  const answer = requiredElement<HTMLSelectElement>(
    panel,
    "[data-evidence-prediction-answer]",
  );
  const reveal = requiredElement<HTMLButtonElement>(
    panel,
    "[data-evidence-prediction-reveal]",
  );
  const feedback = requiredElement<HTMLElement>(
    panel,
    "[data-evidence-prediction-feedback]",
  );
  const result = requiredElement<HTMLElement>(
    panel,
    "[data-evidence-prediction-result]",
  );
  let pack: GoldenScenarioPack | undefined;
  let commandIndex = 0;

  const currentScenario = (): GoldenScenario | undefined =>
    pack?.scenarios.find(
      (scenario) => scenario.scenarioId === scenarioSelect.value,
    );

  const render = (): void => {
    const scenario = currentScenario();
    if (!scenario || scenario.commands.length === 0) {
      progress.textContent = "固定场景没有可预测命令";
      previous.disabled = true;
      next.disabled = true;
      answer.disabled = true;
      reveal.disabled = true;
      return;
    }
    commandIndex = Math.min(commandIndex, scenario.commands.length - 1);
    const command = scenario.commands[commandIndex];
    if (!isGovernedOutcome(command.expected)) {
      throw new Error("evidence prediction requires governed stateAfter");
    }
    progress.textContent = `${scenario.scenarioId} · QUESTION ${commandIndex + 1} / ${scenario.commands.length}`;
    type.textContent = `${commandType(command)} · ${command.caseId} · applicationSequence ?`;
    commandText.textContent = formatGoldenInput(command);
    previous.disabled = commandIndex === 0;
    next.disabled = commandIndex === scenario.commands.length - 1;
    answer.value = "";
    answer.disabled = false;
    reveal.disabled = true;
    feedback.textContent =
      "揭示前先检查 expected rule、application boundary 与当前 active / prepared。";
    result.hidden = true;
    replaceChildren(result);
  };

  scenarioSelect.addEventListener("change", () => {
    commandIndex = 0;
    render();
  });
  previous.addEventListener("click", () => {
    if (commandIndex > 0) commandIndex -= 1;
    render();
  });
  next.addEventListener("click", () => {
    const scenario = currentScenario();
    if (scenario && commandIndex < scenario.commands.length - 1)
      commandIndex += 1;
    render();
  });
  answer.addEventListener("change", () => {
    reveal.disabled = !answer.value;
    result.hidden = true;
    replaceChildren(result);
  });
  reveal.addEventListener("click", () => {
    const scenario = currentScenario();
    const command = scenario?.commands[commandIndex];
    if (!command || !isGovernedOutcome(command.expected)) return;
    const actual = evidencePredictionFor(command);
    const predicted = answer.value as EvidencePredictionAnswer;
    feedback.textContent =
      predicted === actual
        ? `你的预测“${EVIDENCE_PREDICTION_LABELS[predicted]}”与固定 evidence 一致。`
        : `你的预测是“${EVIDENCE_PREDICTION_LABELS[predicted]}”，固定 evidence 显示“${EVIDENCE_PREDICTION_LABELS[actual]}”。`;
    const outcome = createGoldenOutcome(
      `applicationSequence ${command.expected.applicationSequence} 的固定结果`,
      command.expected,
      "REFERENCE",
    );
    outcome.classList.add("matching-counterexample-outcome-single");
    replaceChildren(result, outcome);
    result.hidden = false;
    answer.disabled = true;
    reveal.disabled = true;
  });

  corpus
    .then((loaded) => {
      if (
        loaded.scenarios.some((scenario) =>
          scenario.commands.some(
            (command) => !isGovernedOutcome(command.expected),
          ),
        )
      ) {
        throw new Error("prediction corpus contains a legacy outcome");
      }
      pack = loaded;
      render();
    })
    .catch((caught: unknown) => {
      const detail =
        caught instanceof Error ? caught.message : "unknown evidence error";
      progress.textContent = `同源 evidence 未通过结构自检（${detail}）`;
      previous.disabled = true;
      next.disabled = true;
      answer.disabled = true;
      reveal.disabled = true;
    });
}

function initializeModeTabs(root: HTMLElement): void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-lab-mode]")];
  const panels = [...root.querySelectorAll<HTMLElement>("[data-lab-panel]")];
  const activate = (tab: HTMLButtonElement, focus: boolean): void => {
    const mode = tab.dataset.labMode;
    for (const candidate of tabs) {
      const selected = candidate === tab;
      candidate.setAttribute("aria-selected", String(selected));
      candidate.tabIndex = selected ? 0 : -1;
    }
    for (const panel of panels) {
      panel.hidden = panel.dataset.labPanel !== mode;
    }
    if (focus) tab.focus();
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => activate(tab, false));
    tab.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(tab);
      let nextIndex: number | undefined;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft")
        nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === "Home") nextIndex = 0;
      if (event.key === "End") nextIndex = tabs.length - 1;
      if (nextIndex !== undefined) {
        event.preventDefault();
        activate(tabs[nextIndex], true);
      }
    });
  }
}

function initializeMatchingLab(root: HTMLElement): void {
  if (root.dataset.matchingLabReady === "true") return;
  const configNode = requiredElement<HTMLScriptElement>(
    root,
    "[data-matching-lab-config]",
  );
  const config = JSON.parse(configNode.textContent ?? "") as ClientConfig;
  if (
    config.modes.length !== 2 ||
    config.modes[0] !== "JAVA_GOLDEN_REPLAY" ||
    (config.modes[1] !== "BROWSER_MODEL" &&
      config.modes[1] !== "EVIDENCE_PREDICTION")
  ) {
    throw new Error("Matching Lab mode configuration is invalid");
  }
  initializeModeTabs(root);
  const corpus = initializeGoldenReplay(root, config.goldenReplay);
  if (config.modes[1] === "BROWSER_MODEL") {
    if (!config.browserModel) {
      throw new Error("BROWSER_MODEL has no browserModel configuration");
    }
    initializeBrowserModel(root, config.browserModel, corpus);
  } else {
    if (config.browserModel) {
      throw new Error("EVIDENCE_PREDICTION must not carry a browser model");
    }
    initializeEvidencePrediction(root, corpus);
  }
  root.dataset.matchingLabReady = "true";
}

if (typeof document !== "undefined") {
  document
    .querySelectorAll<HTMLElement>("[data-matching-lab]")
    .forEach((root) => {
      try {
        initializeMatchingLab(root);
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "unknown initialization error";
        root.dataset.matchingLabError = message;
      }
    });
}
