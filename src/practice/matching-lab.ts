type Side = "BUY" | "SELL";
type Prediction = "RESTS_ONLY" | "TRADES_ONLY" | "TRADES_AND_RESTS";

interface GoldenScenarioSummary {
  id: string;
  title: string;
  focus: string;
  commands: number;
}

interface GoldenInput {
  instrumentId: string;
  orderId: number | string;
  side: Side;
  priceTicks: number | string;
  quantityLots: number | string;
}

interface GoldenBookOrder {
  sequence: number | string;
  orderId: number | string;
  remainingQuantityLots: number | string;
}

interface GoldenBookLevel {
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
  orderId?: number | string;
  side?: Side;
  priceTicks?: number | string;
  quantityLots?: number | string;
  makerSequence?: number | string;
  makerOrderId?: number | string;
  takerSequence?: number | string;
  takerOrderId?: number | string;
  remainingQuantityLots?: number | string;
}

interface GoldenCommand {
  caseId: string;
  input: GoldenInput;
  expected: {
    events: GoldenEvent[];
    bookAfter: GoldenBook;
  };
}

interface GoldenScenario {
  scenarioId: string;
  commands: GoldenCommand[];
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
  timeInForce: "GTC";
  minPriceTicks: string;
  maxPriceTicks: string;
  minQuantityLots: string;
  maxQuantityLots: string;
  maxCommands: number;
  firstGeneratedOrderId: string;
  seedOrders: BrowserSeedOrder[];
}

interface ClientConfig {
  goldenReplay: {
    scenarioPackUrl: string;
    eventBatchesUrl: string;
    scenarios: GoldenScenarioSummary[];
  };
  browserModel: BrowserModelConfig;
}

interface RestingOrder {
  orderId: bigint;
  sequence: bigint;
  side: Side;
  priceTicks: bigint;
  remainingQuantityLots: bigint;
}

interface ModelState {
  acceptedSequence: bigint;
  nextOrderId: bigint;
  commandCount: number;
  orders: RestingOrder[];
}

interface ModelEvent {
  type: "REJECTED" | "ACCEPTED" | "TRADE" | "RESTED";
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
}

function requiredElement<T extends Element>(root: ParentNode, selector: string): T {
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
  switch (event.type) {
    case "REJECTED":
      return `Rejected(code=${event.code}, field=${event.field})`;
    case "ACCEPTED":
      return `Accepted(seq=${event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, qty=${event.quantityLots})`;
    case "TRADE":
      return `Trade(maker=${event.makerOrderId}/seq${event.makerSequence}, taker=${event.takerOrderId}/seq${event.takerSequence}, price=${event.priceTicks}, qty=${event.quantityLots})`;
    case "RESTED":
      return `Rested(seq=${event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, remaining=${event.remainingQuantityLots})`;
    default:
      return `Unknown event type: ${event.type}`;
  }
}

function createGoldenBookSide(title: string, levels: GoldenBookLevel[]): HTMLElement {
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
          `#${order.orderId} · seq ${order.sequence} · qty ${order.remainingQuantityLots}`,
      )
      .join("  →  ");
    item.append(queue);
    list.append(item);
  }
  section.append(list);
  return section;
}

function comparable(value: unknown): unknown {
  if (typeof value === "bigint" || typeof value === "number") return String(value);
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

function verifyPublishedEventBatches(pack: GoldenScenarioPack, report: unknown): void {
  if (!report || typeof report !== "object") throw new Error("event-batches is not an object");
  const publishedScenarios = (report as { scenarios?: unknown }).scenarios;
  const expectedScenarios = pack.scenarios.map((scenario) => ({
    scenarioId: scenario.scenarioId,
    cases: scenario.commands.map((command) => ({
      caseId: command.caseId,
      input: command.input,
      events: command.expected.events,
      bookAfter: command.expected.bookAfter,
    })),
  }));
  if (!sameValue(publishedScenarios, expectedScenarios)) {
    throw new Error("scenario pack and event-batches differ");
  }
}

async function initializeGoldenReplay(
  root: HTMLElement,
  config: ClientConfig["goldenReplay"],
): Promise<GoldenScenarioPack> {
  const select = requiredElement<HTMLSelectElement>(root, "[data-golden-scenario]");
  const stage = requiredElement<HTMLElement>(root, "[data-golden-stage]");
  const progress = requiredElement<HTMLElement>(root, "[data-golden-progress]");
  const previous = requiredElement<HTMLButtonElement>(root, "[data-golden-previous]");
  const next = requiredElement<HTMLButtonElement>(root, "[data-golden-next]");
  const reset = requiredElement<HTMLButtonElement>(root, "[data-golden-reset]");
  let pack: GoldenScenarioPack | undefined;
  let commandIndex = 0;

  const setCatalogSelection = (scenarioId: string): void => {
    root.querySelectorAll<HTMLElement>("[data-golden-catalog-item]").forEach((item) => {
      item.toggleAttribute("data-current", item.dataset.goldenCatalogItem === scenarioId);
    });
  };

  const render = (): void => {
    if (!pack) return;
    const scenario = pack.scenarios.find((candidate) => candidate.scenarioId === select.value);
    const summary = config.scenarios.find((candidate) => candidate.id === select.value);
    if (!scenario || scenario.commands.length === 0) {
      progress.textContent = "静态场景缺少命令";
      replaceChildren(stage, makeElement("p", undefined, "无法显示这个固定场景。"));
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

    const input = makeElement("section", "matching-golden-command");
    input.append(makeElement("h3", undefined, "FIXED INPUT"));
    input.append(
      makeElement(
        "code",
        undefined,
        `PlaceLimitOrder(${command.input.instrumentId}, #${command.input.orderId}, ${command.input.side}, price=${command.input.priceTicks}, qty=${command.input.quantityLots})`,
      ),
    );
    fragment.append(input);

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
      createGoldenBookSide("BID · HIGH → LOW", command.expected.bookAfter.bids),
      createGoldenBookSide("ASK · LOW → HIGH", command.expected.bookAfter.asks),
    );
    book.append(sides);
    fragment.append(book);
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
  if (
    scenarioUrl.origin !== window.location.origin ||
    eventBatchesUrl.origin !== window.location.origin
  ) {
    progress.textContent = "只允许读取本站静态 evidence";
    return Promise.reject(new Error("cross-origin evidence is forbidden"));
  }

  const readJson = (url: URL): Promise<unknown> =>
    fetch(url, { credentials: "same-origin" }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json() as Promise<unknown>;
    });

  return Promise.all([readJson(scenarioUrl), readJson(eventBatchesUrl)])
    .then(([scenarioDocument, eventDocument]) => {
      const loaded = scenarioDocument as GoldenScenarioPack;
      if (!Array.isArray(loaded.scenarios)) throw new Error("scenarios is not an array");
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
        throw new Error("per-scenario command count differs from the published registry");
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
      pack = loaded;
      commandIndex = 0;
      render();
      return loaded;
    })
    .catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : "unknown read error";
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

function chooseMaker(orders: RestingOrder[], takerSide: Side, limitPrice: bigint): RestingOrder | undefined {
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
        if (takerSide === "BUY") return left.priceTicks < right.priceTicks ? -1 : 1;
        return left.priceTicks > right.priceTicks ? -1 : 1;
      }
      return left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0;
    })[0];
}

interface ModelInput {
  instrumentId: string;
  orderId: bigint;
  side: string;
  priceTicks: bigint;
  quantityLots: bigint;
}

function rejected(code: string, field: string): ModelEvent[] {
  return [{ type: "REJECTED", code, field }];
}

function executeModelCommand(
  state: ModelState,
  input: ModelInput,
  instrumentId: string,
): ModelEvent[] {
  if (input.instrumentId !== instrumentId) return rejected("UNKNOWN_INSTRUMENT", "instrumentId");
  if (input.orderId <= 0n) return rejected("INVALID_ORDER_ID", "orderId");
  if (input.side !== "BUY" && input.side !== "SELL") return rejected("INVALID_SIDE", "side");
  if (input.priceTicks <= 0n) return rejected("INVALID_PRICE", "priceTicks");
  if (input.quantityLots <= 0n) return rejected("INVALID_QUANTITY", "quantityLots");

  const side = input.side;
  const acceptedSequence = state.acceptedSequence + 1n;
  let remaining = input.quantityLots;
  const batch: ModelEvent[] = [
    {
      type: "ACCEPTED",
      sequence: acceptedSequence,
      orderId: input.orderId,
      side,
      priceTicks: input.priceTicks,
      quantityLots: input.quantityLots,
    },
  ];

  while (remaining > 0n) {
    const maker = chooseMaker(state.orders, side, input.priceTicks);
    if (!maker) break;
    const traded = remaining < maker.remainingQuantityLots
      ? remaining
      : maker.remainingQuantityLots;
    maker.remainingQuantityLots -= traded;
    remaining -= traded;
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
    }
  }

  if (remaining > 0n) {
    state.orders.push({
      orderId: input.orderId,
      sequence: acceptedSequence,
      side,
      priceTicks: input.priceTicks,
      remainingQuantityLots: remaining,
    });
    batch.push({
      type: "RESTED",
      sequence: acceptedSequence,
      orderId: input.orderId,
      side,
      priceTicks: input.priceTicks,
      remainingQuantityLots: remaining,
    });
  }

  state.acceptedSequence = acceptedSequence;
  return batch;
}

function formatModelEvent(event: ModelEvent): string {
  switch (event.type) {
    case "REJECTED":
      return `Rejected(code=${event.code}, field=${event.field})`;
    case "ACCEPTED":
      return `Accepted(seq=${event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, qty=${event.quantityLots})`;
    case "TRADE":
      return `Trade(maker=${event.makerOrderId}/seq${event.makerSequence}, taker=${event.takerOrderId}/seq${event.takerSequence}, price=${event.priceTicks}, qty=${event.quantityLots})`;
    case "RESTED":
      return `Rested(seq=${event.sequence}, orderId=${event.orderId}, side=${event.side}, price=${event.priceTicks}, remaining=${event.remainingQuantityLots})`;
  }
}

function predictionFor(events: ModelEvent[]): Prediction {
  const traded = events.some((event) => event.type === "TRADE");
  const rested = events.some((event) => event.type === "RESTED");
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
  }
}

function groupModelLevels(orders: RestingOrder[], side: Side): RestingOrder[][] {
  const levels = new Map<string, RestingOrder[]>();
  for (const order of orders.filter((candidate) => candidate.side === side)) {
    const key = order.priceTicks.toString();
    const queue = levels.get(key) ?? [];
    queue.push(order);
    levels.set(key, queue);
  }

  return [...levels.values()]
    .map((queue) => queue.sort((left, right) => (left.sequence < right.sequence ? -1 : 1)))
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
    };
    for (const command of scenario.commands) {
      const input: ModelInput = {
        instrumentId: command.input.instrumentId,
        orderId: BigInt(command.input.orderId),
        side: command.input.side,
        priceTicks: BigInt(command.input.priceTicks),
        quantityLots: BigInt(command.input.quantityLots),
      };
      const actualEvents = executeModelCommand(state, input, config.instrumentId);
      if (!sameValue(actualEvents, command.expected.events)) {
        throw new Error(`event mismatch at ${scenario.scenarioId}/${command.caseId}`);
      }
      if (!sameValue(modelBook(state), command.expected.bookAfter)) {
        throw new Error(`book mismatch at ${scenario.scenarioId}/${command.caseId}`);
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
    item.append(makeElement("code", "matching-book-price", queue[0].priceTicks.toString()));
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

function initializeBrowserModel(
  root: HTMLElement,
  config: BrowserModelConfig,
  corpus: Promise<GoldenScenarioPack>,
): void {
  const sideInput = requiredElement<HTMLSelectElement>(root, "[data-model-side]");
  const priceInput = requiredElement<HTMLInputElement>(root, "[data-model-price]");
  const quantityInput = requiredElement<HTMLInputElement>(root, "[data-model-quantity]");
  const predictionInput = requiredElement<HTMLSelectElement>(root, "[data-model-prediction]");
  const submit = requiredElement<HTMLButtonElement>(root, "[data-model-submit]");
  const reset = requiredElement<HTMLButtonElement>(root, "[data-model-reset]");
  const empty = requiredElement<HTMLButtonElement>(root, "[data-model-empty]");
  const readiness = requiredElement<HTMLElement>(root, "[data-model-readiness]");
  const error = requiredElement<HTMLElement>(root, "[data-model-error]");
  const orderId = requiredElement<HTMLElement>(root, "[data-model-order-id]");
  const commandCount = requiredElement<HTMLElement>(root, "[data-model-command-count]");
  const reveal = requiredElement<HTMLElement>(root, "[data-model-reveal]");
  const comparison = requiredElement<HTMLElement>(root, "[data-model-comparison]");
  const command = requiredElement<HTMLElement>(root, "[data-model-command]");
  const events = requiredElement<HTMLOListElement>(root, "[data-model-events]");
  const bids = requiredElement<HTMLElement>(root, "[data-model-bids]");
  const asks = requiredElement<HTMLElement>(root, "[data-model-asks]");
  const minPrice = BigInt(config.minPriceTicks);
  const maxPrice = BigInt(config.maxPriceTicks);
  const minQuantity = BigInt(config.minQuantityLots);
  const maxQuantity = BigInt(config.maxQuantityLots);
  const firstOrderId = BigInt(config.firstGeneratedOrderId);
  let state: ModelState;
  let modelReady = false;

  const seededState = (): ModelState => ({
    acceptedSequence: BigInt(config.seedOrders.length),
    nextOrderId: firstOrderId,
    commandCount: 0,
    orders: config.seedOrders.map((seed, index) => ({
      orderId: BigInt(seed.orderId),
      sequence: BigInt(index + 1),
      side: seed.side,
      priceTicks: parseBoundedBigInt(seed.priceTicks, minPrice, maxPrice, "seed priceTicks"),
      remainingQuantityLots: parseBoundedBigInt(
        seed.quantityLots,
        minQuantity,
        maxQuantity,
        "seed quantityLots",
      ),
    })),
  });

  const emptyState = (): ModelState => ({
    acceptedSequence: 0n,
    nextOrderId: firstOrderId,
    commandCount: 0,
    orders: [],
  });

  const renderState = (): void => {
    orderId.textContent = `orderId = ${state.nextOrderId}`;
    commandCount.textContent = String(state.commandCount);
    submit.disabled = !modelReady || state.commandCount >= config.maxCommands;
    renderModelBook(bids, groupModelLevels(state.orders, "BUY"));
    renderModelBook(asks, groupModelLevels(state.orders, "SELL"));
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

  submit.addEventListener("click", () => {
    try {
      if (!modelReady) throw new Error("corpus 自检尚未一致，浏览器模型保持禁用");
      if (state.commandCount >= config.maxCommands) {
        throw new Error(`本轮最多执行 ${config.maxCommands} 条命令，请先重置`);
      }
      if (!predictionInput.value) throw new Error("请先选择 event batch 预测");
      const prediction = predictionInput.value as Prediction;
      const side = sideInput.value as Side;
      if (side !== "BUY" && side !== "SELL") throw new Error("side 必须是 BUY 或 SELL");
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
      const batch = executeModelCommand(
        state,
        {
          instrumentId: config.instrumentId,
          orderId: generatedOrderId,
          side,
          priceTicks,
          quantityLots,
        },
        config.instrumentId,
      );
      if (batch[0]?.type === "REJECTED") {
        throw new Error("有界输入意外被模型拒绝");
      }
      state.nextOrderId += 1n;
      state.commandCount += 1;
      const revealed = predictionFor(batch);
      comparison.textContent =
        prediction === revealed
          ? `你的预测“${predictionLabel(prediction)}”与模型揭示一致。`
          : `你的预测是“${predictionLabel(prediction)}”，模型揭示为“${predictionLabel(revealed)}”。`;
      command.textContent = `PlaceLimitOrder(${config.instrumentId}, #${generatedOrderId}, ${side}, price=${priceTicks}, qty=${quantityLots}, ${config.timeInForce})`;
      replaceChildren(
        events,
        ...batch.map((event) => {
          const item = makeElement("li");
          item.append(makeElement("code", undefined, formatModelEvent(event)));
          return item;
        }),
      );
      error.hidden = true;
      reveal.hidden = false;
      predictionInput.value = "";
      renderState();
    } catch (caught: unknown) {
      error.textContent = caught instanceof Error ? caught.message : "输入无法解析";
      error.hidden = false;
      reveal.hidden = true;
    }
  });

  reset.addEventListener("click", () => replaceState(seededState()));
  empty.addEventListener("click", () => replaceState(emptyState()));
  state = seededState();
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
      const detail = caught instanceof Error ? caught.message : "unknown self-check error";
      readiness.textContent = `corpus 自检不一致，浏览器模型保持禁用（${detail}）。`;
      readiness.dataset.ready = "false";
      renderState();
    });
}

function initializeModeTabs(root: HTMLElement): void {
  const tabs = [...root.querySelectorAll<HTMLButtonElement>("[data-lab-mode]")];
  const panels = [...root.querySelectorAll<HTMLElement>("[data-lab-panel]")];
  for (const tab of tabs) {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.labMode;
      for (const candidate of tabs) {
        candidate.setAttribute("aria-selected", String(candidate === tab));
      }
      for (const panel of panels) {
        panel.hidden = panel.dataset.labPanel !== mode;
      }
    });
  }
}

function initializeMatchingLab(root: HTMLElement): void {
  if (root.dataset.matchingLabReady === "true") return;
  const configNode = requiredElement<HTMLScriptElement>(root, "[data-matching-lab-config]");
  const config = JSON.parse(configNode.textContent ?? "") as ClientConfig;
  initializeModeTabs(root);
  const corpus = initializeGoldenReplay(root, config.goldenReplay);
  initializeBrowserModel(root, config.browserModel, corpus);
  root.dataset.matchingLabReady = "true";
}

document.querySelectorAll<HTMLElement>("[data-matching-lab]").forEach((root) => {
  try {
    initializeMatchingLab(root);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "unknown initialization error";
    root.dataset.matchingLabError = message;
  }
});
