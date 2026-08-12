import {
  PAYOUT_CATEGORIES,
  analyzeTicketPortfolio,
  analyzeTicketsAgainstArchive,
  buildAdvancedArchiveAnalysis,
  buildArchiveCalendar,
  buildArchiveStats,
  buildDailyArchiveBreakdown,
  estimateEconomics,
  evaluateTickets,
  generateTickets,
  jackpotChance,
  mergeDrawArchives,
  parseNumberList,
  parseTextArchive,
  parseTicketFile,
  parseTicketLines,
  runStrategyBacktest,
  selectDrawsByArchiveScope,
  summarizeStrategyWins,
  systemCombinations,
  validateImportedDraws,
} from "./lottery-core.js?v=20260812-1";

const STORAGE_KEY = "eight-lab-v3-final-state";
const ARCHIVE_DB_NAME = "eight-lab-v3-archives";
const ARCHIVE_DB_VERSION = 1;
const ARCHIVE_STORE_NAME = "draw-archives";
const jackpotUniverse = 503_880;
let archiveStorageFailed = false;

const games = {
  big8: {
    key: "big8",
    short: "Б8",
    name: "Большая 8",
    productId: "103151",
    theme: "big8",
    motif: "Золотая восьмёрка",
    heroLine: "Выбирайте удачную комбинацию в один клик",
    jackpot: 5_000_000,
    price: 250,
    generation: "Текущий архив + поколение до 12.07.2024",
    payouts: [5_000_000, 500_000, 25_000, 5_000, 2_000, 1_250, 800, 750, 750],
    draws: [
      {
        drawNum: "071493",
        date: "2026-08-06T14:36:00",
        main: [15, 5, 12, 16, 8, 13, 14, 7],
        extra: 4,
        jackpot: 5_000_000,
      },
      {
        drawNum: "071492",
        date: "2026-08-06T14:21:00",
        main: [10, 3, 7, 18, 20, 8, 13, 6],
        extra: 2,
        jackpot: 5_000_000,
      },
      {
        drawNum: "071491",
        date: "2026-08-06T14:06:00",
        main: [18, 17, 19, 5, 12, 3, 20, 16],
        extra: 4,
        jackpot: 5_000_000,
      },
      {
        drawNum: "071490",
        date: "2026-08-06T13:51:00",
        main: [9, 6, 2, 1, 17, 13, 18, 11],
        extra: 1,
        jackpot: 5_000_000,
      },
      {
        drawNum: "071489",
        date: "2026-08-06T13:36:00",
        main: [4, 11, 5, 16, 20, 10, 14, 1],
        extra: 4,
        jackpot: 5_000_000,
      },
    ],
  },
  super8: {
    key: "super8",
    short: "С8",
    name: "Супер 8",
    productId: "108031",
    theme: "super8",
    motif: "Поле удачи",
    heroLine: "Соберите несколько точных ставок на одном поле",
    jackpot: 10_000_000,
    price: 250,
    generation: "Текущий архив + поколение до 31.07.2026",
    payouts: [10_000_000, 500_000, 25_000, 7_500, 3_000, 1_500, 750, 500, 500],
    draws: [
      {
        drawNum: "002871",
        date: "2026-08-06T14:34:00",
        main: [1, 4, 6, 9, 11, 14, 17, 20],
        extra: 3,
        jackpot: 10_000_000,
      },
      {
        drawNum: "002870",
        date: "2026-08-06T14:19:00",
        main: [2, 5, 7, 10, 12, 13, 16, 19],
        extra: 1,
        jackpot: 10_000_000,
      },
      {
        drawNum: "002869",
        date: "2026-08-06T14:04:00",
        main: [3, 6, 8, 9, 15, 17, 18, 20],
        extra: 4,
        jackpot: 10_000_000,
      },
    ],
  },
  v8: {
    key: "v8",
    short: "В8",
    name: "Великолепная 8",
    productId: "109031",
    theme: "v8",
    motif: "Бильярдная восьмёрка",
    heroLine: "В погоне за суперпризом — рассчитайте каждый удар",
    jackpot: 1_000_000,
    price: 10,
    generation: "Текущий архив + поколение до 31.07.2026",
    payouts: [1_000_000, 12_500, 500, 400, 125, 60, 30, 15, 10],
    draws: [
      {
        drawNum: "003145",
        date: "2026-08-06T14:35:00",
        main: [2, 4, 7, 8, 11, 13, 16, 19],
        extra: 2,
        jackpot: 1_000_000,
      },
      {
        drawNum: "003144",
        date: "2026-08-06T14:20:00",
        main: [1, 5, 6, 10, 12, 15, 17, 20],
        extra: 4,
        jackpot: 1_000_000,
      },
      {
        drawNum: "003143",
        date: "2026-08-06T14:05:00",
        main: [3, 7, 9, 11, 14, 16, 18, 20],
        extra: 1,
        jackpot: 1_000_000,
      },
    ],
  },
};

function bundledDrawSignature(draw) {
  return [
    String(draw?.drawNum ?? ""),
    String(draw?.date ?? ""),
    Array.isArray(draw?.main) ? draw.main.join("-") : "",
    String(draw?.extra ?? ""),
  ].join("|");
}

function stripBundledDemoDraws(gameKey, draws) {
  const bundled = new Set(
    (games[gameKey]?.draws || []).map(bundledDrawSignature),
  );
  return draws.filter((draw) => !bundled.has(bundledDrawSignature(draw)));
}

const views = [
  ["workspace", "Ставки и расчёт"],
  ["analysis", "Анализ"],
  ["draws", "Архив"],
  ["payouts", "Выплаты"],
];

function defaultGenerator() {
  return {
    count: 12,
    mainCount: 8,
    extraCount: 1,
    requiredMain: "",
    requiredMainCount: "",
    excludedMain: "",
    excludedMainCount: "",
    priorityMain: "",
    requiredExtra: "",
    requiredExtraCount: "",
    excludedExtra: "",
    excludedExtraCount: "",
    evenMin: "",
    evenMax: "",
    lowerMin: "",
    lowerMax: "",
    maxOverlap: "",
    coverAll: false,
    strategy: "random",
    seed: "",
    archiveWindow: "all",
    archiveDailyLimit: "30",
    archiveScopeType: "all",
    archiveScopeKey: "all",
  };
}

function defaultAnalysis() {
  return {
    window: "25",
    section: "days",
    dailyDate: "",
    dailyLimit: "14",
    requiredMain: [],
    excludedMain: [],
    priorityMain: [],
    requiredExtra: [],
    excludedExtra: [],
  };
}

function defaultStrategyLayer(id = 1) {
  return {
    id,
    name: `Слой ${id}`,
    ticketsText: "",
    mode: "real",
    baseCopies: 1,
    rule: "add",
    step: 1,
    maxCopies: 32,
    resetOnWin: true,
    stopOnWin: false,
    trigger: "any",
    categoryIndex: 4,
    budget: 0,
    discountPercent: 0,
  };
}

function defaultProfile(game) {
  return {
    price: game.price,
    sitePrice: game.price,
    main: [],
    extra: [],
    systemMainTarget: 10,
    systemExtraTarget: 2,
    scenarioIndex: 0,
    winningLines: 1,
    generator: defaultGenerator(),
    generatorResults: [],
    generatorWarnings: [],
    generatorCoverage: [],
    draws: game.draws,
    drawsUpdated: "Демонстрационный архив",
    drawsAreDemo: true,
    archiveSeedFixVersion: 1,
    optionalRulesDefaultsVersion: 1,
    selectedDraw: game.draws[0]?.drawNum || "",
    importMode: "add",
    sitePayouts: [...game.payouts],
    siteMeta: {
      source: "Базовая таблица выплат",
      drawNum: "—",
      date: "06.08.2026",
    },
    customPayouts: [...game.payouts],
    payoutDraft: [...game.payouts],
    customMeta: {
      source: "Пользовательская версия не изменялась",
      date: "—",
    },
    ticketsText: "",
    analysis: defaultAnalysis(),
    strategyLayers: [defaultStrategyLayer(1)],
    activeStrategyLayerId: 1,
    strategyLayerCounter: 1,
    strategyArchiveScopeType: "day",
    strategyArchiveScopeKey: game.draws[0]?.date || "",
  };
}

function initialState() {
  return {
    version: 3,
    gameKey: "big8",
    view: "workspace",
    profiles: Object.fromEntries(
      Object.entries(games).map(([key, game]) => [key, defaultProfile(game)]),
    ),
  };
}

function hydrateState() {
  const base = initialState();
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (!stored || stored.version !== 3) return base;
    base.gameKey = games[stored.gameKey] ? stored.gameKey : "big8";
    const legacyWorkspaceViews = new Set(["calculator", "generator", "checker"]);
    base.view = legacyWorkspaceViews.has(stored.view)
      ? "workspace"
      : views.some(([key]) => key === stored.view)
        ? stored.view
        : "workspace";
    for (const key of Object.keys(games)) {
      const saved = stored.profiles?.[key];
      if (!saved) continue;
      base.profiles[key] = {
        ...base.profiles[key],
        ...saved,
        generator: {
          ...base.profiles[key].generator,
          ...(saved.generator || {}),
        },
        analysis: {
          ...base.profiles[key].analysis,
          ...(saved.analysis || {}),
        },
        siteMeta: {
          ...base.profiles[key].siteMeta,
          ...(saved.siteMeta || {}),
        },
        customMeta: {
          ...base.profiles[key].customMeta,
          ...(saved.customMeta || {}),
        },
        strategyLayers:
          Array.isArray(saved.strategyLayers) && saved.strategyLayers.length
            ? saved.strategyLayers
            : base.profiles[key].strategyLayers,
      };
      if (saved.drawsAreDemo === undefined) {
        base.profiles[key].drawsAreDemo =
          base.profiles[key].drawsUpdated === "Демонстрационный архив";
      }
      if (saved.archiveSeedFixVersion === undefined) {
        base.profiles[key].archiveSeedFixVersion = 0;
      }
      if (saved.optionalRulesDefaultsVersion === undefined) {
        const generator = base.profiles[key].generator;
        const usesLegacyOptionalDefaults =
          generator.evenMin === 3 &&
          generator.evenMax === 5 &&
          generator.lowerMin === 3 &&
          generator.lowerMax === 5 &&
          generator.maxOverlap === 8 &&
          generator.coverAll === true &&
          generator.seed === "eight-lab-2026";
        if (usesLegacyOptionalDefaults) {
          generator.evenMin = "";
          generator.evenMax = "";
          generator.lowerMin = "";
          generator.lowerMax = "";
          generator.maxOverlap = "";
          generator.coverAll = false;
          generator.seed = "";
        }
        base.profiles[key].optionalRulesDefaultsVersion = 1;
      }
    }
  } catch {
    return base;
  }
  return base;
}

const state = hydrateState();
const runtime = {
  importPreview: { big8: null, super8: null, v8: null },
  archiveClearConfirm: { big8: false, super8: false, v8: false },
  ticketEvaluation: { big8: null, super8: null, v8: null },
  strategyResults: { big8: {}, super8: {}, v8: {} },
  strategyHistory: { big8: {}, super8: {}, v8: {} },
  expandedStrategyDraw: { big8: "", super8: "", v8: "" },
  archiveStats: { big8: null, super8: null, v8: null },
  advancedAnalysis: { big8: null, super8: null, v8: null },
  dailyBreakdown: { big8: null, super8: null, v8: null },
  archiveCalendar: { big8: null, super8: null, v8: null },
  generatorArchiveAnalysis: { big8: null, super8: null, v8: null },
  selectedArchiveResultDay: { big8: "", super8: "", v8: "" },
  archiveTree: {
    big8: { year: "", month: "", day: "", drawLimit: 96 },
    super8: { year: "", month: "", day: "", drawLimit: 96 },
    v8: { year: "", month: "", day: "", drawLimit: 96 },
  },
  drawBrowser: {
    big8: { query: "", date: "", page: 1, pageSize: 100 },
    super8: { query: "", date: "", page: 1, pageSize: 100 },
    v8: { query: "", date: "", page: 1, pageSize: 100 },
  },
  openDetails: {
    big8: { calculatorRules: false, calculatorProfit: false, generatorRules: false, manualTicket: false },
    super8: { calculatorRules: false, calculatorProfit: false, generatorRules: false, manualTicket: false },
    v8: { calculatorRules: false, calculatorProfit: false, generatorRules: false, manualTicket: false },
  },
};

const root = document.querySelector("#app");
const floatingHelpTip = document.createElement("div");
floatingHelpTip.id = "floating-help-tip";
floatingHelpTip.className = "help-tip-text floating-help-tip";
floatingHelpTip.setAttribute("role", "tooltip");
document.body.appendChild(floatingHelpTip);
let activeHelpAnchor = null;

function supportsArchiveDatabase() {
  return typeof indexedDB !== "undefined" && !archiveStorageFailed;
}

function stateForStorage() {
  if (!supportsArchiveDatabase()) return state;
  return {
    ...state,
    profiles: Object.fromEntries(
      Object.entries(state.profiles).map(([key, profile]) => {
        const { draws: _draws, ...settings } = profile;
        return [key, settings];
      }),
    ),
  };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateForStorage()));
    return true;
  } catch (error) {
    console.warn("Не удалось сохранить настройки приложения", error);
    return false;
  }
}

function openArchiveDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(ARCHIVE_DB_NAME, ARCHIVE_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ARCHIVE_STORE_NAME)) {
        database.createObjectStore(ARCHIVE_STORE_NAME, { keyPath: "gameKey" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      reject(new Error("Хранилище архивов заблокировано другой вкладкой"));
  });
}

async function readDrawArchive(gameKey) {
  const database = await openArchiveDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(ARCHIVE_STORE_NAME, "readonly");
      const request = transaction.objectStore(ARCHIVE_STORE_NAME).get(gameKey);
      request.onsuccess = () => resolve(request.result?.draws);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function writeDrawArchive(gameKey, draws) {
  const database = await openArchiveDatabase();
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(ARCHIVE_STORE_NAME, "readwrite");
      transaction
        .objectStore(ARCHIVE_STORE_NAME)
        .put({ gameKey, draws, updatedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
    return true;
  } finally {
    database.close();
  }
}

async function persistDrawArchive(gameKey = state.gameKey) {
  if (!supportsArchiveDatabase()) return save();
  try {
    await writeDrawArchive(gameKey, state.profiles[gameKey].draws);
    return true;
  } catch (error) {
    archiveStorageFailed = true;
    console.warn("Не удалось сохранить отдельный архив тиражей", error);
    return save();
  }
}

function invalidateArchiveCaches(gameKey = state.gameKey) {
  runtime.archiveStats[gameKey] = null;
  runtime.advancedAnalysis[gameKey] = null;
  runtime.dailyBreakdown[gameKey] = null;
  runtime.archiveCalendar[gameKey] = null;
}

function getArchiveStats(gameKey = state.gameKey) {
  const draws = state.profiles[gameKey].draws;
  const cached = runtime.archiveStats[gameKey];
  if (cached?.draws === draws) return cached.value;
  const value = buildArchiveStats(draws);
  runtime.archiveStats[gameKey] = { draws, value };
  return value;
}

function getAdvancedArchiveAnalysis(gameKey = state.gameKey) {
  const profile = state.profiles[gameKey];
  const window = String(profile.analysis.window);
  const cached = runtime.advancedAnalysis[gameKey];
  if (cached?.draws === profile.draws && cached.window === window) {
    return cached.value;
  }
  const value = buildAdvancedArchiveAnalysis(profile.draws, window);
  runtime.advancedAnalysis[gameKey] = { draws: profile.draws, window, value };
  return value;
}

function getDailyArchiveBreakdown(gameKey = state.gameKey) {
  const draws = state.profiles[gameKey].draws;
  const cached = runtime.dailyBreakdown[gameKey];
  if (cached?.draws === draws) return cached.value;
  const value = buildDailyArchiveBreakdown(draws);
  runtime.dailyBreakdown[gameKey] = { draws, value };
  return value;
}

function getArchiveCalendar(gameKey = state.gameKey) {
  const draws = state.profiles[gameKey].draws;
  const cached = runtime.archiveCalendar[gameKey];
  if (cached?.draws === draws) return cached.value;
  const value = buildArchiveCalendar(draws);
  runtime.archiveCalendar[gameKey] = { draws, value };
  return value;
}

async function initialiseDrawArchives() {
  if (!supportsArchiveDatabase()) return;
  try {
    for (const gameKey of Object.keys(games)) {
      const profile = state.profiles[gameKey];
      const storedDraws = await readDrawArchive(gameKey);
      if (Array.isArray(storedDraws)) {
        profile.draws = storedDraws;
      } else {
        await writeDrawArchive(gameKey, profile.draws);
      }
      const archiveOutgrewDemo =
        profile.drawsAreDemo &&
        profile.draws.length > (games[gameKey]?.draws.length || 0);
      if (
        (profile.archiveSeedFixVersion < 1 &&
          profile.drawsUpdated !== "Демонстрационный архив") ||
        archiveOutgrewDemo
      ) {
        const cleanedDraws = stripBundledDemoDraws(gameKey, profile.draws);
        if (cleanedDraws.length !== profile.draws.length) {
          profile.draws = cleanedDraws;
          await writeDrawArchive(gameKey, profile.draws);
        }
        profile.archiveSeedFixVersion = 1;
        profile.drawsAreDemo = false;
        if (archiveOutgrewDemo) profile.drawsUpdated = "Сохранённый пользовательский архив";
      }
      if (
        !profile.draws.some(
          (draw) => String(draw.drawNum) === String(profile.selectedDraw),
        )
      ) {
        profile.selectedDraw = profile.draws[0]?.drawNum || "";
      }
      invalidateArchiveCaches(gameKey);
    }
    save();
  } catch (error) {
    archiveStorageFailed = true;
    console.warn("Не удалось открыть отдельное хранилище архивов", error);
    save();
  }
}

function currentGame() {
  return games[state.gameKey];
}

function currentProfile() {
  return state.profiles[state.gameKey];
}

function formatMoney(value) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 2,
  }).format(Number(value || 0))} ₽`;
}

function formatDate(value) {
  if (!value) return "Дата не указана";
  const russianDate = String(value).match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/,
  );
  if (russianDate) {
    return `${russianDate[1].padStart(2, "0")}.${russianDate[2].padStart(2, "0")}.${russianDate[3]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatArchiveDate(value) {
  const source = String(value || "").trim();
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(source)) return source;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return source;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(Number(value || 0))}%`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function helpTip(text) {
  return `
    <span class="help-tip" tabindex="0" data-help="${escapeHtml(text)}" aria-label="Подсказка: ${escapeHtml(text)}">
      <span aria-hidden="true">?</span>
    </span>`;
}

function positionFloatingHelpTip(anchor) {
  if (!anchor || !document.documentElement.contains(anchor)) return;
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipWidth = Math.min(340, Math.max(0, window.innerWidth - 24));
  const rightSpace = window.innerWidth - anchorRect.right - 12;
  const leftSpace = anchorRect.left - 12;
  const side = rightSpace >= Math.min(tooltipWidth, 260) || rightSpace >= leftSpace
    ? "right"
    : "left";
  floatingHelpTip.dataset.side = side;
  const desiredLeft =
    side === "right"
      ? anchorRect.right + 8
      : anchorRect.left - tooltipWidth - 8;
  const maxLeft = Math.max(8, window.innerWidth - tooltipWidth - 8);
  floatingHelpTip.style.left = `${Math.min(maxLeft, Math.max(8, desiredLeft))}px`;
  floatingHelpTip.style.top = `${anchorRect.top + anchorRect.height / 2}px`;
  requestAnimationFrame(() => {
    if (activeHelpAnchor !== anchor) return;
    const tooltipRect = floatingHelpTip.getBoundingClientRect();
    let top = Number.parseFloat(floatingHelpTip.style.top) || anchorRect.top;
    if (tooltipRect.top < 8) top += 8 - tooltipRect.top;
    if (tooltipRect.bottom > window.innerHeight - 8) {
      top -= tooltipRect.bottom - (window.innerHeight - 8);
    }
    floatingHelpTip.style.top = `${top}px`;
  });
}

function showFloatingHelpTip(anchor) {
  activeHelpAnchor = anchor;
  floatingHelpTip.textContent = anchor.dataset.help || "";
  anchor.setAttribute("aria-describedby", floatingHelpTip.id);
  positionFloatingHelpTip(anchor);
  floatingHelpTip.classList.add("visible");
}

function hideFloatingHelpTip(anchor = activeHelpAnchor) {
  if (anchor) anchor.removeAttribute("aria-describedby");
  activeHelpAnchor = null;
  floatingHelpTip.classList.remove("visible");
}

function fieldTitle(label, help) {
  return `<span class="field-title"><span>${label}</span>${helpTip(help)}</span>`;
}

function sampleRange(max, count) {
  const values = Array.from({ length: max }, (_, index) => index + 1);
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values.slice(0, count).sort((a, b) => a - b);
}

function ticketSummary(profile = currentProfile()) {
  const combinations = systemCombinations(profile.main.length, profile.extra.length);
  const cost = combinations * Number(profile.price || 0);
  return { combinations, cost };
}

function gameLogo(game) {
  if (game.key === "big8") {
    return `<span class="logo-script">Большая</span><span class="logo-eight">8</span>`;
  }
  if (game.key === "super8") {
    return `<span class="logo-script">Супер</span><span class="logo-eight">8</span>`;
  }
  return `<span class="logo-script logo-condensed">ВЕЛИКОЛЕПНАЯ</span><span class="logo-eight ball-eight">8</span>`;
}

function heroArt(game) {
  return `<div class="hero-art hero-photo hero-photo-${game.key}" aria-hidden="true"></div>`;
}

function gameSwitch() {
  return `
    <section class="game-switch" aria-label="Выбор лотереи">
      ${Object.values(games)
        .map((game) => {
          const profile = state.profiles[game.key];
          return `
            <button class="game-card ${game.key === state.gameKey ? "active" : ""}"
              data-action="switch-game" data-game="${game.key}">
              <span class="game-card-mark">${game.short}</span>
              <span>
                <strong>${game.name}</strong>
                <small>${formatMoney(profile.price)} · от ${formatMoney(game.jackpot)}</small>
              </span>
            </button>`;
        })
        .join("")}
    </section>`;
}

function topSummary() {
  const profile = currentProfile();
  if (profile.generatorResults.length) {
    const combinations = profile.generatorResults.reduce(
      (sum, row) => sum + row.combinations,
      0,
    );
    return `
      <section class="ticket-summary" aria-label="Сводка готового набора">
        <div><span>Ставок в наборе</span><strong>${profile.generatorResults.length}</strong></div>
        <div><span>Простых комбинаций</span><strong>${combinations}</strong></div>
        <div><span>Цена комбинации</span><strong>${formatMoney(profile.price)}</strong></div>
        <div class="summary-total"><span>Набор за тираж</span><strong>${formatMoney(combinations * profile.price)}</strong></div>
      </section>`;
  }
  const summary = ticketSummary(profile);
  return `
    <section class="ticket-summary" aria-label="Сводка текущей ставки">
      <div><span>Выбрано</span><strong>${profile.main.length} + ${profile.extra.length}</strong></div>
      <div><span>Комбинаций</span><strong>${summary.combinations}</strong></div>
      <div><span>Цена комбинации</span><strong>${formatMoney(profile.price)}</strong></div>
      <div class="summary-total"><span>Стоимость системы</span><strong>${formatMoney(summary.cost)}</strong></div>
    </section>`;
}

function navigation() {
  return `
    <nav class="section-nav" aria-label="Разделы программы">
      ${views
        .map(
          ([key, label]) => `
            <button data-action="switch-view" data-view="${key}"
              class="${state.view === key ? "active" : ""}">${label}</button>`,
        )
        .join("")}
    </nav>`;
}

function numberGrid(values, selected, field) {
  return `
    <div class="number-grid ${field === "extra" ? "extra-grid" : ""}">
      ${values
        .map(
          (number) => `
            <button class="number-ball ${selected.includes(number) ? "selected" : ""}"
              data-action="toggle-number" data-field="${field}" data-number="${number}"
              aria-pressed="${selected.includes(number)}">${number}</button>`,
        )
        .join("")}
    </div>`;
}

function calculatorView() {
  const game = currentGame();
  const profile = currentProfile();
  const combinations = systemCombinations(profile.main.length, profile.extra.length);
  const payout = Number(profile.customPayouts[profile.scenarioIndex] || 0);
  const economics = estimateEconomics(
    combinations,
    profile.price,
    payout,
    profile.winningLines,
  );
  const chance = jackpotChance(profile.main.length, profile.extra.length);
  const chanceText = chance
    ? `1 к ${new Intl.NumberFormat("ru-RU").format(Math.ceil(1 / chance))}`
    : "—";

  return `
    <section class="view-grid calculator-layout">
      <div class="stack">
        <article class="panel selection-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">Поле 1</span><h2>Выберите минимум 8 из 20</h2></div>
            <span class="counter">${profile.main.length}/8</span>
          </div>
          ${numberGrid(Array.from({ length: 20 }, (_, index) => index + 1), profile.main, "main")}
        </article>
        <article class="panel selection-panel">
          <div class="panel-heading">
            <div><span class="eyebrow">Поле 2</span><h2>Выберите минимум 1 из 4</h2></div>
            <span class="counter">${profile.extra.length}/1</span>
          </div>
          ${numberGrid([1, 2, 3, 4], profile.extra, "extra")}
          <div class="button-row">
            <button class="primary-btn" data-action="random-simple">Случайные 8 + 1</button>
            <button class="ghost-btn" data-action="clear-ticket">Очистить</button>
          </div>
        </article>
      </div>

      <aside class="stack">
        <article class="panel system-builder">
          <div class="panel-heading compact">
            <div><span class="eyebrow">Расширенная ставка</span><h2>Собрать систему</h2></div>
            <span class="status-pill">${combinations > 1 ? "Система" : "Обычная"}</span>
          </div>
          <div class="two-inputs">
            <label>Основных
              <input type="number" min="8" max="20" value="${profile.systemMainTarget}"
                data-input="systemMainTarget">
            </label>
            <label>Дополнительных
              <input type="number" min="1" max="4" value="${profile.systemExtraTarget}"
                data-input="systemExtraTarget">
            </label>
          </div>
          <button class="primary-btn wide" data-action="random-system">Случайная расширенная ставка</button>
          <div class="formula-box">
            <span>Расчёт</span>
            <strong>C(${profile.main.length}, 8) × ${profile.extra.length} = ${combinations}</strong>
          </div>
          <label class="price-control">Цена простой комбинации
            <span><input type="number" min="1" step="1" value="${profile.price}" data-input="price"> ₽</span>
          </label>
          <p class="help-text">Текущая цена сайта: ${formatMoney(profile.sitePrice)}. Ручная цена хранится отдельно для ${game.name}.</p>
          <dl class="calculation-list">
            <div><dt>Простых комбинаций</dt><dd>${combinations}</dd></div>
            <div><dt>Полная стоимость</dt><dd>${formatMoney(economics.cost)}</dd></div>
            <div><dt>Шанс главной категории</dt><dd>${chanceText}</dd></div>
          </dl>
        </article>

        <article class="panel economics-panel">
          <div class="panel-heading compact">
            <div><span class="eyebrow">Сценарий выигрыша</span><h2>Прибыль и окупаемость</h2></div>
          </div>
          <label>Категория
            <select data-input="scenarioIndex">
              ${PAYOUT_CATEGORIES.map(
                (category, index) =>
                  `<option value="${index}" ${index === Number(profile.scenarioIndex) ? "selected" : ""}>${category} · ${formatMoney(profile.customPayouts[index])}</option>`,
              ).join("")}
            </select>
          </label>
          <label>Выигрышных простых комбинаций
            <input type="number" min="0" value="${profile.winningLines}" data-input="winningLines">
          </label>
          <div class="metric-grid">
            <div><span>Возможный выигрыш</span><strong>${formatMoney(economics.gross)}</strong></div>
            <div class="${economics.profit < 0 ? "negative" : "positive"}"><span>Чистая прибыль</span><strong>${formatMoney(economics.profit)}</strong></div>
            <div class="${economics.roi < 0 ? "negative" : "positive"}"><span>ROI</span><strong>${formatPercent(economics.roi)}</strong></div>
            <div><span>Безубыточность</span><strong>${economics.breakEven ?? "—"} выигр.</strong></div>
          </div>
          <p class="help-text">Расчёт использует активную пользовательскую таблицу выплат ${game.name}.</p>
        </article>
      </aside>
    </section>`;
}

function simpleCalculatorView() {
  const game = currentGame();
  const profile = currentProfile();
  const combinations = systemCombinations(
    profile.main.length,
    profile.extra.length,
  );
  const payout = Number(profile.customPayouts[profile.scenarioIndex] || 0);
  const economics = estimateEconomics(
    combinations,
    profile.price,
    payout,
    profile.winningLines,
  );
  const chance = jackpotChance(profile.main.length, profile.extra.length);
  const chanceText = chance
    ? `1 к ${new Intl.NumberFormat("ru-RU").format(Math.ceil(1 / chance))}`
    : "—";

  return `
    <section class="simple-calculator">
      <article class="panel simple-number-picker">
        <div class="panel-heading">
          <div><span class="eyebrow">Шаг 1</span><h2>Выберите числа ставки</h2></div>
          <span class="status-pill">${profile.main.length} + ${profile.extra.length}</span>
        </div>
        <div class="simple-field-heading"><span>Поле 1</span><strong>минимум 8 из 20</strong></div>
        ${numberGrid(Array.from({ length: 20 }, (_, index) => index + 1), profile.main, "main")}
        <div class="simple-field-heading extra"><span>Поле 2</span><strong>минимум 1 из 4</strong></div>
        ${numberGrid([1, 2, 3, 4], profile.extra, "extra")}
        <div class="button-row">
          <button class="primary-btn" data-action="random-simple">Случайные 8 + 1</button>
          <button class="ghost-btn" data-action="clear-ticket">Очистить</button>
        </div>
      </article>

      <aside class="stack calculator-summary-column">
        <article class="panel ticket-total-panel">
          <div><span class="eyebrow">Шаг 2</span><h2>Расчёт ставки</h2></div>
          <div class="ticket-total-price">
            <span>Итоговая стоимость</span>
            <strong>${formatMoney(economics.cost)}</strong>
          </div>
          <div class="ticket-total-grid">
            <div><span>Простых комбинаций</span><strong>${combinations}</strong></div>
            <div><span>Шанс главной категории</span><strong>${chanceText}</strong></div>
          </div>
          <label class="price-control">Цена одной комбинации
            <span><input type="number" min="1" step="1" value="${profile.price}" data-input="price"> ₽</span>
          </label>
          <small class="help-text">Цена сайта: ${formatMoney(profile.sitePrice)}. Ручная цена сохраняется только для ${game.name}.</small>
        </article>

        <details class="panel collapsible-panel calculator-rules"
          data-details="calculatorRules" ${runtime.openDetails[state.gameKey].calculatorRules ? "open" : ""}>
          <summary>
            <span class="step-heading"><b>+</b><span><strong>Расширенная ставка</strong><small>Больше 8 основных или больше 1 дополнительного</small></span></span>
            <span class="details-action">Открыть</span>
          </summary>
          <div class="calculator-details-body">
            <div class="two-inputs">
              <label>Основных
                <input type="number" min="8" max="20" value="${profile.systemMainTarget}" data-input="systemMainTarget">
              </label>
              <label>Дополнительных
                <input type="number" min="1" max="4" value="${profile.systemExtraTarget}" data-input="systemExtraTarget">
              </label>
            </div>
            <button class="primary-btn wide" data-action="random-system">Создать расширенную ставку</button>
            <div class="formula-box"><span>Расчёт</span><strong>C(${profile.main.length}, 8) × ${profile.extra.length} = ${combinations}</strong></div>
          </div>
        </details>

        <details class="panel collapsible-panel calculator-profit"
          data-details="calculatorProfit" ${runtime.openDetails[state.gameKey].calculatorProfit ? "open" : ""}>
          <summary>
            <span class="step-heading"><b>₽</b><span><strong>Возможный выигрыш</strong><small>Прибыль, ROI и безубыточность</small></span></span>
            <span class="details-action">Открыть</span>
          </summary>
          <div class="calculator-details-body">
            <label>Категория
              <select data-input="scenarioIndex">
                ${PAYOUT_CATEGORIES.map(
                  (category, index) =>
                    `<option value="${index}" ${index === Number(profile.scenarioIndex) ? "selected" : ""}>${category} · ${formatMoney(profile.customPayouts[index])}</option>`,
                ).join("")}
              </select>
            </label>
            <label>Выигрышных простых комбинаций
              <input type="number" min="0" value="${profile.winningLines}" data-input="winningLines">
            </label>
            <div class="metric-grid">
              <div><span>Выигрыш</span><strong>${formatMoney(economics.gross)}</strong></div>
              <div class="${economics.profit < 0 ? "negative" : "positive"}"><span>Прибыль</span><strong>${formatMoney(economics.profit)}</strong></div>
              <div><span>ROI</span><strong>${formatPercent(economics.roi)}</strong></div>
              <div><span>Безубыточность</span><strong>${economics.breakEven ?? "—"}</strong></div>
            </div>
          </div>
        </details>
      </aside>
    </section>`;
}

function generatorField(label, field, value, options = {}) {
  const {
    min,
    max,
    type = "number",
    hint = "",
    placeholder = "",
    help = hint || "Настройка используется при создании нового набора ставок.",
  } = options;
  const optionalFilter = [
    "evenMin",
    "evenMax",
    "lowerMin",
    "lowerMax",
    "maxOverlap",
  ].includes(field);
  const effectiveHelp = optionalFilter
    ? `${help} Если поле пустое, этот фильтр не применяется.`
    : help;
  const effectivePlaceholder =
    placeholder ||
    (optionalFilter
      ? "Не применять"
      : field === "seed"
        ? "Случайный при каждом запуске"
        : "");
  return `
    <label>${fieldTitle(label, effectiveHelp)}
      <input type="${type}" ${min !== undefined ? `min="${min}"` : ""} ${max !== undefined ? `max="${max}"` : ""}
        ${effectivePlaceholder ? `placeholder="${escapeHtml(effectivePlaceholder)}"` : ""}
        value="${escapeHtml(value)}" data-generator="${field}">
      ${hint ? `<small>${hint}</small>` : ""}
    </label>`;
}

function statisticsStrip(stats) {
  const show = (numbers) =>
    numbers.length ? numbers.map((number) => `<b>${number}</b>`).join("") : "<span>Нет данных</span>";
  return `
    <div class="stats-strip">
      <div><span>Частые</span><div class="mini-numbers">${show(stats.hot.slice(0, 6))}</div></div>
      <div><span>Редкие</span><div class="mini-numbers">${show(stats.cold.slice(0, 6))}</div></div>
      <div><span>Давно не выпадали</span><div class="mini-numbers">${show(stats.overdueNumbers.slice(0, 6))}</div></div>
      <div><span>Тиражей в анализе</span><strong>${stats.drawCount}</strong></div>
    </div>`;
}

function generatorView() {
  const profile = currentProfile();
  const settings = profile.generator;
  const stats = getArchiveStats();
  const rowCombinations = systemCombinations(settings.mainCount, settings.extraCount);
  const resultCost = profile.generatorResults.reduce(
    (sum, row) => sum + row.combinations * profile.price,
    0,
  );

  return `
    <section class="stack">
      <article class="panel generator-intro">
        <div class="panel-heading">
          <div><span class="eyebrow">Продвинутый комбогенератор</span><h2>Уникальные ставки по вашим правилам</h2></div>
          <span class="status-pill">${profile.generatorResults.length} готово</span>
        </div>
        ${statisticsStrip(stats)}
      </article>

      <section class="generator-settings">
        <article class="panel">
          <h3>Размер набора</h3>
          <div class="form-grid">
            ${generatorField("Количество ставок", "count", settings.count, { min: 1, max: 500 })}
            ${generatorField("Основных в ставке", "mainCount", settings.mainCount, { min: 8, max: 20 })}
            ${generatorField("Дополнительных", "extraCount", settings.extraCount, { min: 1, max: 4 })}
            ${generatorField("Фиксированный seed", "seed", settings.seed, { type: "text", hint: "Одинаковый seed — одинаковый результат" })}
          </div>
          <div class="inline-summary">
            <span>Одна ставка</span><strong>${rowCombinations} ком. · ${formatMoney(rowCombinations * profile.price)}</strong>
          </div>
        </article>

        <article class="panel">
          <h3>Обязательные и исключённые</h3>
          <div class="form-grid">
            ${generatorField("Обязательные 1–20", "requiredMain", settings.requiredMain, { type: "text", hint: "Например: 3 8 17" })}
            ${generatorField("Исключённые 1–20", "excludedMain", settings.excludedMain, { type: "text" })}
            ${generatorField("Приоритетные 1–20", "priorityMain", settings.priorityMain, { type: "text", hint: "Получают повышенный вес, но не обязательны" })}
            ${generatorField("Обязательные 1–4", "requiredExtra", settings.requiredExtra, { type: "text" })}
            ${generatorField("Исключённые 1–4", "excludedExtra", settings.excludedExtra, { type: "text" })}
          </div>
        </article>

        <article class="panel">
          <h3>Баланс комбинаций</h3>
          <div class="form-grid compact-fields">
            ${generatorField("Чётных от", "evenMin", settings.evenMin, { min: 0, max: 20 })}
            ${generatorField("Чётных до", "evenMax", settings.evenMax, { min: 0, max: 20 })}
            ${generatorField("Чисел 1–10 от", "lowerMin", settings.lowerMin, { min: 0, max: 20 })}
            ${generatorField("Чисел 1–10 до", "lowerMax", settings.lowerMax, { min: 0, max: 20 })}
            ${generatorField("Макс. повторов между строками", "maxOverlap", settings.maxOverlap, { min: 0, max: 20 })}
          </div>
          <label class="check-control">
            <input type="checkbox" data-generator="coverAll" ${settings.coverAll ? "checked" : ""}>
            <span>Стремиться покрыть все доступные числа 1–20</span>
          </label>
          <p class="help-text">Дополнительные числа 1–4 распределяются между строками максимально равномерно.</p>
        </article>

        <article class="panel">
          <h3>Стратегия отбора</h3>
          <label>Режим
            <select data-generator="strategy">
              ${[
                ["random", "Равномерно случайная"],
                ["hot", "Частые числа"],
                ["cold", "Редкие числа"],
                ["overdue", "Давно не выпадавшие"],
                ["mixed", "Смешанная статистика"],
                ["pairs", "Частые пары"],
                ["triples", "Частые тройки"],
              ]
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${settings.strategy === value ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
          </label>
          <p class="help-text">Статистика строится только по архиву выбранной лотереи. Она не повышает математическую вероятность будущего тиража.</p>
          <button class="primary-btn wide" data-action="generate">Сгенерировать набор</button>
        </article>
      </section>

      <article class="panel results-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">Результат</span><h2>${profile.generatorResults.length ? `${profile.generatorResults.length} уникальных ставок` : "Набор ещё не создан"}</h2></div>
          <div class="button-row">
            <button class="ghost-btn" data-action="send-generator-to-checker" ${profile.generatorResults.length ? "" : "disabled"}>Проверить билеты</button>
            <button class="secondary-btn" data-action="export-generator" ${profile.generatorResults.length ? "" : "disabled"}>Скачать CSV</button>
          </div>
        </div>
        ${
          profile.generatorWarnings.length
            ? `<div class="warning-list">${profile.generatorWarnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>`
            : ""
        }
        ${
          profile.generatorResults.length
            ? `
              <div class="coverage-line">
                <span>Покрытие основных чисел</span>
                <strong>${profile.generatorCoverage.length}/20</strong>
                <div class="mini-numbers">${profile.generatorCoverage.map((number) => `<b>${number}</b>`).join("")}</div>
                <span class="result-cost">Общая стоимость: ${formatMoney(resultCost)}</span>
              </div>
              <div class="ticket-table">
                ${profile.generatorResults
                  .map(
                    (row, index) => `
                      <div class="ticket-row">
                        <span class="row-index">${String(index + 1).padStart(2, "0")}</span>
                        <div class="ticket-numbers main-ticket">${row.main.map((number) => `<b>${number}</b>`).join("")}</div>
                        <span class="ticket-separator">+</span>
                        <div class="ticket-numbers extra-ticket">${row.extra.map((number) => `<b>${number}</b>`).join("")}</div>
                        <span class="row-combinations">${row.combinations} ком.</span>
                      </div>`,
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state">Настройте ограничения и нажмите «Сгенерировать набор».</div>`
        }
      </article>
    </section>`;
}

function commandWithHelp(button, help) {
  return `<span class="command-with-help">${button}${helpTip(help)}</span>`;
}

function archiveScopeDetails(profile = currentProfile()) {
  const calendar = getArchiveCalendar();
  const requestedType = ["all", "year", "month", "day"].includes(
    profile.generator.archiveScopeType,
  )
    ? profile.generator.archiveScopeType
    : "all";
  const requestedKey = String(profile.generator.archiveScopeKey || "all");
  let label = `Весь архив · ${profile.draws.length.toLocaleString("ru-RU")} тиражей`;
  let valid = requestedType === "all";
  if (requestedType === "year") {
    const year = calendar.years.find((item) => item.key === requestedKey);
    if (year) {
      label = `${year.label} год · ${year.drawCount.toLocaleString("ru-RU")} тиражей`;
      valid = true;
    }
  } else if (requestedType === "month") {
    const month = calendar.years
      .flatMap((year) => year.months)
      .find((item) => item.key === requestedKey);
    if (month) {
      label = `${month.label} · ${month.drawCount.toLocaleString("ru-RU")} тиражей`;
      valid = true;
    }
  } else if (requestedType === "day") {
    const day = calendar.years
      .flatMap((year) => year.months)
      .flatMap((month) => month.days)
      .find((item) => item.key === requestedKey);
    if (day) {
      label = `${day.label} · ${day.drawCount.toLocaleString("ru-RU")} тиражей`;
      valid = true;
    }
  }
  const type = valid ? requestedType : "all";
  const key = valid ? requestedKey : "all";
  const draws = selectDrawsByArchiveScope(profile.draws, type, key);
  return { type, key, label, draws, calendar };
}

function strategyArchiveScopeDetails(profile = currentProfile()) {
  const calendar = getArchiveCalendar();
  const requestedType = ["all", "year", "month", "day"].includes(
    profile.strategyArchiveScopeType,
  )
    ? profile.strategyArchiveScopeType
    : "day";
  const options =
    requestedType === "year"
      ? calendar.years.map((year) => ({
          key: year.key,
          label: `${year.label} год`,
          count: year.drawCount,
        }))
      : requestedType === "month"
        ? calendar.years.flatMap((year) =>
            year.months.map((month) => ({
              key: month.key,
              label: month.label,
              count: month.drawCount,
            })),
          )
        : requestedType === "day"
          ? calendar.years.flatMap((year) =>
              year.months.flatMap((month) =>
                month.days.map((day) => ({
                  key: day.key,
                  label: day.label,
                  count: day.drawCount,
                })),
              ),
            )
          : [];
  const requestedKey = String(profile.strategyArchiveScopeKey || "");
  const selected = options.find((option) => option.key === requestedKey) || options[0];
  const type = requestedType === "all" || selected ? requestedType : "all";
  const key = type === "all" ? "all" : selected.key;
  const draws = selectDrawsByArchiveScope(profile.draws, type, key);
  const label =
    type === "all"
      ? `Весь архив · ${draws.length.toLocaleString("ru-RU")} тиражей`
      : `${selected.label} · ${draws.length.toLocaleString("ru-RU")} тиражей`;
  return { type, key, label, draws, options };
}

function archiveScopeButton(type, key, label, count, active, className = "") {
  return `
    <button class="archive-scope-choice ${className} ${active ? "active" : ""}"
      data-action="select-archive-scope" data-scope="${type}" data-key="${escapeHtml(key)}"
      title="Рассчитать ставки за ${escapeHtml(label)}">
      <span class="scope-choice-mark">${active ? "✓" : "○"}</span>
      <span><strong>${escapeHtml(label)}</strong><small>${Number(count).toLocaleString("ru-RU")} тиражей</small></span>
    </button>`;
}

function applyArchiveScopeSelection(profile, type, key) {
  const treeState = runtime.archiveTree[state.gameKey];
  profile.generator.archiveScopeType = type;
  profile.generator.archiveScopeKey = key;
  if (type === "year") {
    treeState.year = key;
    const year = getArchiveCalendar().years.find((item) => item.key === key);
    const month = year?.months.find((item) => item.key === treeState.month) || year?.months[0];
    treeState.month = month?.key || "";
    if (!month?.days.some((item) => item.key === treeState.day)) {
      treeState.day = month?.days[0]?.key || "";
    }
  } else if (type === "month") {
    treeState.year = key.slice(0, 4);
    treeState.month = key;
    const month = getArchiveCalendar().years
      .flatMap((year) => year.months)
      .find((item) => item.key === key);
    if (!month?.days.some((item) => item.key === treeState.day)) {
      treeState.day = month?.days[0]?.key || "";
    }
  } else if (type === "day") {
    treeState.year = key.slice(0, 4);
    treeState.month = key.slice(0, 7);
    treeState.day = key;
    const day = getArchiveCalendar().years
      .flatMap((year) => year.months)
      .flatMap((month) => month.days)
      .find((item) => item.key === key);
    if (day?.drawCount > 24) treeState.drawLimit = 96;
  }
  runtime.generatorArchiveAnalysis[state.gameKey] = null;
  runtime.ticketEvaluation[state.gameKey] = null;
  runtime.selectedArchiveResultDay[state.gameKey] = "";
  runtime.drawBrowser[state.gameKey] = {
    ...runtime.drawBrowser[state.gameKey],
    query: "",
    date: "",
    page: 1,
  };
}

function activateLatestArchiveDay(profile = currentProfile()) {
  const year = getArchiveCalendar().years[0];
  const month = year?.months[0];
  const day = month?.days[0];
  if (!day) return;
  runtime.archiveTree[state.gameKey] = {
    ...runtime.archiveTree[state.gameKey],
    year: year.key,
    month: month.key,
    day: day.key,
    drawLimit: day.drawCount > 24 ? 96 : 24,
  };
  applyArchiveScopeSelection(profile, "day", day.key);
}

function archiveTreeContext(profile = currentProfile()) {
  const scope = archiveScopeDetails(profile);
  const treeState = runtime.archiveTree[state.gameKey];
  const firstYear = scope.calendar.years[0];
  const scopeYearKey =
    scope.type === "year"
      ? scope.key
      : scope.type === "month" || scope.type === "day"
        ? scope.key.slice(0, 4)
        : "";
  const requestedYear = treeState.year || scopeYearKey;
  const openYearData =
    scope.calendar.years.find((year) => year.key === requestedYear) || firstYear;
  const openYear = openYearData?.key || "";
  const scopeMonthKey =
    scope.type === "month"
      ? scope.key
      : scope.type === "day"
        ? scope.key.slice(0, 7)
        : "";
  const requestedMonth = treeState.month || scopeMonthKey;
  const openMonthData =
    openYearData?.months.find((month) => month.key === requestedMonth) ||
    openYearData?.months[0];
  const openMonth = openMonthData?.key || "";
  const activeDayData =
    openMonthData?.days.find((day) => day.key === treeState.day) ||
    (scope.type === "day"
      ? openMonthData?.days.find((day) => day.key === scope.key)
      : null) ||
    openMonthData?.days[0];
  return { scope, treeState, openYear, openYearData, openMonth, openMonthData, activeDayData };
}

function archiveCalculationToggle(type, key, label, count, active) {
  return `
    <button class="fortune-calc-toggle ${active ? "active" : ""}"
      data-action="select-archive-scope" data-scope="${type}" data-key="${escapeHtml(key)}"
      title="Выбрать ${escapeHtml(label.toLocaleLowerCase("ru-RU"))} для расчёта ставок">
      <span class="fortune-checkbox">${active ? "✓" : ""}</span>
      <span><strong>${escapeHtml(label)}</strong><small>${Number(count).toLocaleString("ru-RU")} тир.</small></span>
    </button>`;
}

function archiveCalendarTree(profile = currentProfile(), options = {}) {
  const { compact = false } = options;
  const {
    scope,
    openYear,
    openYearData,
    openMonth,
    openMonthData,
    activeDayData,
  } = archiveTreeContext(profile);

  return `
    <div class="archive-calendar-tree fortune-period-navigator ${compact ? "compact" : ""}">
      <section class="fortune-period-level">
        <div class="fortune-level-heading">
          <span><b>1</b><span><strong>Год</strong><small>Все годы видны сразу</small></span></span>
          ${openYearData ? archiveCalculationToggle("year", openYear, "Рассчитать год", openYearData.drawCount, scope.type === "year" && scope.key === openYear) : ""}
        </div>
        <div class="fortune-year-tabs">
          ${scope.calendar.years
            .map(
              (year) => `
                <button class="fortune-nav-tab ${year.key === openYear ? "active" : ""}"
                  data-action="select-archive-year" data-year="${year.key}">
                  <strong>${year.label}</strong><small>${year.drawCount.toLocaleString("ru-RU")} тир.</small>
                </button>`,
            )
            .join("")}
        </div>
      </section>

      <section class="fortune-period-level">
        <div class="fortune-level-heading">
          <span><b>2</b><span><strong>Месяц ${escapeHtml(openYear)}</strong><small>Выберите любой месяц без прокрутки дерева</small></span></span>
          ${openMonthData ? archiveCalculationToggle("month", openMonth, "Рассчитать месяц", openMonthData.drawCount, scope.type === "month" && scope.key === openMonth) : ""}
        </div>
        <div class="fortune-month-tabs">
          ${(openYearData?.months || [])
            .map(
              (month) => `
                <button class="fortune-nav-tab ${month.key === openMonth ? "active" : ""}"
                  data-action="select-archive-month" data-month="${month.key}" data-year="${openYear}">
                  <strong>${escapeHtml(month.shortLabel)}</strong><small>${month.dayCount} дн. · ${month.drawCount.toLocaleString("ru-RU")} тир.</small>
                </button>`,
            )
            .join("")}
        </div>
      </section>

      <section class="fortune-period-level">
        <div class="fortune-level-heading day-heading">
          <span><b>3</b><span><strong>День</strong><small>Нажатие загружает тиражи в сетку ниже</small></span></span>
          ${archiveScopeButton("all", "all", "Весь архив", profile.draws.length, scope.type === "all", "fortune-all-scope")}
        </div>
        <div class="fortune-day-tabs" role="list" aria-label="Дни ${escapeHtml(openMonthData?.label || "")}">
          ${(openMonthData?.days || [])
            .map(
              (day) => `
                <button class="fortune-day-tab ${activeDayData?.key === day.key ? "active" : ""} ${scope.type === "day" && scope.key === day.key ? "calculation" : ""}"
                  data-action="select-archive-day" data-day="${day.key}"
                  data-month="${openMonth}" data-year="${openYear}"
                  title="Показать ${day.drawCount.toLocaleString("ru-RU")} тиражей за ${escapeHtml(day.label)}">
                  ${escapeHtml(day.label)} <small>(${day.drawCount.toLocaleString("ru-RU")})</small>
                </button>`,
            )
            .join("")}
        </div>
      </section>
      ${
        scope.calendar.undatedCount
          ? `<div class="archive-undated-note">Без корректной даты: <strong>${scope.calendar.undatedCount.toLocaleString("ru-RU")}</strong> тиражей. Они входят только в расчёт всего архива.</div>`
          : ""
      }
    </div>`;
}

function archiveDayDrawWorkspace(profile = currentProfile()) {
  const { scope, treeState, activeDayData } = archiveTreeContext(profile);
  if (!activeDayData) {
    return `<div class="empty-state">В открытом месяце нет тиражей.</div>`;
  }
  const dayDraws = selectDrawsByArchiveScope(profile.draws, "day", activeDayData.key)
    .slice()
    .sort((left, right) => {
      const leftNumber = Number(left.drawNum);
      const rightNumber = Number(right.drawNum);
      if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
        return leftNumber - rightNumber;
      }
      return String(left.drawNum).localeCompare(String(right.drawNum), "ru", {
        numeric: true,
      });
    });
  const drawLimit = Number(treeState.drawLimit) === 24 ? 24 : 96;
  const visibleDraws = dayDraws.slice(0, drawLimit);
  const cards = visibleDraws
    .map(
      (draw, index) => `
        <div class="fortune-draw-card">
          <span class="fortune-draw-order">T${index + 1}</span>
          <span class="fortune-draw-number">№${escapeHtml(draw.drawNum)}</span>
          <span class="ticket-numbers main-ticket">${draw.main.map((number) => `<b>${number}</b>`).join("")}</span>
          <span class="fortune-draw-plus">+</span>
          <span class="ticket-numbers extra-ticket"><b>${draw.extra}</b></span>
        </div>`,
    )
    .join("");

  return `
    <section class="fortune-draw-workspace" aria-live="polite">
      <div class="fortune-draw-toolbar">
        <div>
          <span class="eyebrow">Выбранный день</span>
          <h3>Тиражи (${visibleDraws.length} из ${dayDraws.length}) <span class="calc-scope ${scope.type === "day" ? "day" : "period"}">${escapeHtml(scope.label)}</span></h3>
          <p>${escapeHtml(activeDayData.label)} · тиражи расположены по порядку, как в «Сумме Фортуны»</p>
        </div>
        <div class="fortune-draw-modes" aria-label="Количество показываемых тиражей">
          <button class="${drawLimit === 24 ? "active" : ""}" data-action="archive-draw-limit" data-limit="24">24</button>
          <button class="${drawLimit === 96 ? "active" : ""}" data-action="archive-draw-limit" data-limit="96">96 · весь день</button>
        </div>
      </div>
      <div class="fortune-draw-grid">${cards || `<div class="empty-state">За этот день тиражи не найдены.</div>`}</div>
      ${dayDraws.length > drawLimit ? `<p class="fortune-draw-note">Показаны первые ${drawLimit} тиражей. Выберите режим «96 · весь день», чтобы увидеть остальные.</p>` : ""}
    </section>`;
}

function generatorArchiveReportView(report) {
  const profile = currentProfile();
  const categoryRows = report.categoryTotals.filter((row) => row.count > 0);
  const dailyLimit = [7, 14, 30, 60, 90].includes(
    Number(profile.generator.archiveDailyLimit),
  )
    ? Number(profile.generator.archiveDailyLimit)
    : 30;
  const selectedDayKey =
    runtime.selectedArchiveResultDay[state.gameKey] ||
    report.dailyResults?.[0]?.key ||
    "";
  const selectedDay = report.dailyResults?.find(
    (day) => day.key === selectedDayKey,
  );
  const selectedDraws = selectedDay
    ? report.drawResults.filter((draw) => draw.dayKey === selectedDay.key)
    : [];

  return `
    <div class="archive-report compact-archive-report">
      <div class="report-scope-banner"><span>Рассчитанный период</span><strong>${escapeHtml(report.scope?.label || "Весь выбранный архив")}</strong></div>
      <div class="metric-grid archive-report-metrics">
        <div><span>Тиражей</span><strong>${report.drawCount}</strong></div>
        <div><span>Ставок в каждом</span><strong>${report.ticketCount}</strong></div>
        <div><span>Тиражей с выплатой</span><strong>${report.winningDrawCount}</strong></div>
        <div><span>Затраты</span><strong>${formatMoney(report.totalCost)}</strong></div>
        <div class="positive"><span>Выплаты</span><strong>${formatMoney(report.totalPrize)}</strong></div>
        <div class="${report.profit >= 0 ? "positive" : "negative"}"><span>Итог / ROI</span><strong>${formatMoney(report.profit)} · ${formatPercent(report.roi)}</strong></div>
      </div>

      <section class="result-days-section">
        <div class="result-section-head">
          <div>
            <span class="eyebrow">Как в «Цветных шарах»</span>
            <h3>Результат по дням ${helpTip("Каждая строка объединяет все тиражи календарного дня: затраты, выплаты и итог по вашему набору ставок.")}</h3>
          </div>
          <label>${fieldTitle("Показать", "Ограничивает только список дней на экране. Сам расчёт выполняется по выбранному периоду полностью.")}
            <select data-generator="archiveDailyLimit">
              ${[7, 14, 30, 60, 90]
                .map(
                  (value) =>
                    `<option value="${value}" ${value === dailyLimit ? "selected" : ""}>${value} дней</option>`,
                )
                .join("")}
            </select>
          </label>
        </div>
        <div class="result-day-table">
          <div class="result-day-head"><span>День</span><span>Тиражи</span><span>Затраты</span><span>Выплаты</span><span>Итог</span></div>
          ${(report.dailyResults || [])
            .slice(0, dailyLimit)
            .map(
              (day) => `
                <button class="result-day-row ${day.key === selectedDayKey ? "active" : ""}"
                  data-action="select-result-day" data-day="${escapeHtml(day.key)}">
                  <span><strong>${escapeHtml(day.label)}</strong><small>${day.winningDrawCount} с выплатой</small></span>
                  <span>${day.drawCount}</span>
                  <span>${formatMoney(day.totalCost)}</span>
                  <span>${formatMoney(day.totalPrize)}</span>
                  <strong class="${day.profit >= 0 ? "positive-text" : "negative-text"}">${formatMoney(day.profit)}</strong>
                </button>`,
            )
            .join("") || `<div class="empty-state">В выбранном периоде нет тиражей с корректной датой.</div>`}
        </div>
      </section>

      ${
        selectedDay
          ? `<section class="selected-result-day">
              <div class="result-section-head">
                <div><span class="eyebrow">Выбранный день</span><h3>${escapeHtml(selectedDay.label)} · ${selectedDay.drawCount} тиражей</h3></div>
                <span class="status-pill">Нажмите «Открыть» для подробной проверки</span>
              </div>
              <div class="selected-day-draws">
                ${selectedDraws
                  .map(
                    (draw) => `
                      <div>
                        <span><strong>№${escapeHtml(draw.drawNum)}</strong><small>${formatDate(draw.date)}</small></span>
                        <span><b>${draw.maxMainMatches}</b> осн. ${draw.extraMatched ? "+ поле 2" : ""}</span>
                        <strong class="${draw.profit >= 0 ? "positive-text" : "negative-text"}">${formatMoney(draw.prize)}</strong>
                        <button class="ghost-btn" title="Показать результат каждой ставки в этом тираже"
                          data-action="open-archive-draw-check" data-draw="${escapeHtml(draw.drawNum)}">Открыть</button>
                      </div>`,
                  )
                  .join("")}
              </div>
            </section>`
          : ""
      }

      <details class="report-details">
        <summary>Таблица совпадений и лучшие тиражи ${helpTip("Здесь можно увидеть, сколько выигрышных комбинаций получилось в каждой категории и в каких тиражах результат был максимальным.")}</summary>
        <div class="archive-report-grid">
          <section>
            <div class="panel-heading compact"><div><span class="eyebrow">По таблице выплат</span><h3>Категории выигрышей</h3></div></div>
            <div class="archive-category-table">
              <div class="archive-category-head"><span>Категория</span><span>Количество</span><span>Выплата</span><span>Всего</span></div>
              ${
                categoryRows.length
                  ? categoryRows
                      .map(
                        (row) => `<div><strong>${row.category}</strong><span>${row.count}</span><span>${formatMoney(row.amount)}</span><strong>${formatMoney(row.total)}</strong></div>`,
                      )
                      .join("")
                  : `<div class="empty-state">Выигрышных категорий нет.</div>`
              }
            </div>
          </section>
          <section>
            <div class="panel-heading compact"><div><span class="eyebrow">Лучший результат</span><h3>Лучшие тиражи</h3></div></div>
            <div class="archive-best-draws">
              ${report.bestDraws
                .slice(0, 12)
                .map(
                  (draw) => `<div><span><strong>№${escapeHtml(draw.drawNum)}</strong><small>${formatDate(draw.date)}</small></span><span><b>${draw.maxMainMatches}</b> осн. ${draw.extraMatched ? "+ поле 2" : ""}</span><strong>${formatMoney(draw.prize)}</strong><button class="ghost-btn" title="Подробно проверить этот тираж" data-action="open-archive-draw-check" data-draw="${escapeHtml(draw.drawNum)}">Открыть</button></div>`,
                )
                .join("")}
            </div>
          </section>
        </div>
      </details>
      <p class="help-text">Расчёт считает, что весь набор участвовал в каждом тираже. Используются текущая цена и активная таблица выплат выбранной лотереи.</p>
    </div>`;
}

function simpleGeneratorView() {
  const profile = currentProfile();
  const settings = profile.generator;
  const stats = getArchiveStats();
  const archiveReport = runtime.generatorArchiveAnalysis[state.gameKey];
  const rowCombinations = systemCombinations(
    settings.mainCount,
    settings.extraCount,
  );
  const resultCost = profile.generatorResults.reduce(
    (sum, row) => sum + row.combinations * profile.price,
    0,
  );

  return `
    <section class="stack simple-generator">
      <article class="panel generator-simple-head">
        <div>
          <span class="eyebrow">Генератор по правилам</span>
          <h2>Настройте главное — остальное можно не трогать</h2>
          <p>Архив ${currentGame().name}: ${stats.drawCount} тиражей. Статистический режим использует только архив выбранной игры.</p>
        </div>
        <span class="status-pill">${profile.generatorResults.length} ставок готово</span>
      </article>

      <article class="panel generator-main-settings">
        <div class="step-heading"><b>1</b><div><span>Основные настройки</span><h2>Что нужно сгенерировать</h2></div></div>
        <div class="generator-primary-grid">
          ${generatorField("Количество ставок", "count", settings.count, { min: 1, max: 500 })}
          ${generatorField("Чисел поля 1", "mainCount", settings.mainCount, { min: 8, max: 20 })}
          ${generatorField("Чисел поля 2", "extraCount", settings.extraCount, { min: 1, max: 4 })}
          <label>Принцип отбора
            <select data-generator="strategy">
              ${[
                ["random", "Случайно"],
                ["mixed", "Смешанная статистика"],
                ["hot", "Частые числа"],
                ["cold", "Редкие числа"],
                ["overdue", "Давно не выпадали"],
                ["pairs", "Частые пары"],
                ["triples", "Частые тройки"],
              ]
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${settings.strategy === value ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
          </label>
        </div>
        <div class="generator-action-line">
          <div><span>Одна ставка</span><strong>${rowCombinations} комбинаций · ${formatMoney(rowCombinations * profile.price)}</strong></div>
          <div><span>Ориентировочная стоимость набора</span><strong>${formatMoney(rowCombinations * profile.price * settings.count)}</strong></div>
          <button class="primary-btn" data-action="generate">Сгенерировать</button>
        </div>
      </article>

      <details class="panel collapsible-panel generator-rules"
        data-details="generatorRules" ${runtime.openDetails[state.gameKey].generatorRules ? "open" : ""}>
        <summary>
          <span class="step-heading"><b>2</b><span><strong>Дополнительные правила</strong><small>Обязательные числа, исключения, баланс и повторы</small></span></span>
          <span class="details-action">Открыть</span>
        </summary>
        <div class="generator-rule-sections">
          <section>
            <h3>Числа</h3>
            <div class="form-grid">
              ${generatorField("Обязательные 1–20", "requiredMain", settings.requiredMain, { type: "text", hint: "Например: 3 8 17" })}
              ${generatorField("Исключённые 1–20", "excludedMain", settings.excludedMain, { type: "text" })}
              ${generatorField("Приоритетные 1–20", "priorityMain", settings.priorityMain, { type: "text" })}
              ${generatorField("Обязательные 1–4", "requiredExtra", settings.requiredExtra, { type: "text" })}
              ${generatorField("Исключённые 1–4", "excludedExtra", settings.excludedExtra, { type: "text" })}
              ${generatorField("Повторяемый seed", "seed", settings.seed, { type: "text" })}
            </div>
          </section>
          <section>
            <h3>Баланс</h3>
            <div class="form-grid compact-fields">
              ${generatorField("Чётных от", "evenMin", settings.evenMin, { min: 0, max: 20 })}
              ${generatorField("Чётных до", "evenMax", settings.evenMax, { min: 0, max: 20 })}
              ${generatorField("Чисел 1–10 от", "lowerMin", settings.lowerMin, { min: 0, max: 20 })}
              ${generatorField("Чисел 1–10 до", "lowerMax", settings.lowerMax, { min: 0, max: 20 })}
              ${generatorField("Макс. общих чисел", "maxOverlap", settings.maxOverlap, { min: 0, max: 20 })}
            </div>
            <label class="check-control">
              <input type="checkbox" data-generator="coverAll" ${settings.coverAll ? "checked" : ""}>
              <span>Покрывать все доступные числа 1–20</span>
            </label>
          </section>
        </div>
      </details>

      <article class="panel results-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">3 · Готовый набор</span><h2>${profile.generatorResults.length ? `${profile.generatorResults.length} уникальных ставок` : "Нажмите «Сгенерировать»"}</h2></div>
          <div class="button-row">
            <button class="ghost-btn" data-action="send-generator-to-checker" ${profile.generatorResults.length ? "" : "disabled"}>Проверить</button>
            <button class="secondary-btn" data-action="export-generator" ${profile.generatorResults.length ? "" : "disabled"}>Скачать CSV</button>
          </div>
        </div>
        ${
          profile.generatorWarnings.length
            ? `<div class="warning-list">${profile.generatorWarnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>`
            : ""
        }
        ${
          profile.generatorResults.length
            ? `
              <div class="coverage-line">
                <span>Покрытие поля 1</span>
                <strong>${profile.generatorCoverage.length}/20</strong>
                <div class="mini-numbers">${profile.generatorCoverage.map((number) => `<b>${number}</b>`).join("")}</div>
                <span class="result-cost">Стоимость: ${formatMoney(resultCost)}</span>
              </div>
              <div class="ticket-table">
                ${profile.generatorResults
                  .map(
                    (row, index) => `
                      <div class="ticket-row">
                        <span class="row-index">${String(index + 1).padStart(2, "0")}</span>
                        <div class="ticket-numbers main-ticket">${row.main.map((number) => `<b>${number}</b>`).join("")}</div>
                        <span class="ticket-separator">+</span>
                        <div class="ticket-numbers extra-ticket">${row.extra.map((number) => `<b>${number}</b>`).join("")}</div>
                        <span class="row-combinations">${row.combinations} ком.</span>
                      </div>`,
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state">Основных настроек достаточно. Дополнительные правила открывайте только при необходимости.</div>`
        }
      </article>

      <article class="panel generator-archive-check">
        <div class="panel-heading">
          <div><span class="eyebrow">4 · Проверка результата</span><h2>Как эти ставки сыграли бы по архиву?</h2></div>
          <span class="status-pill">${profile.draws.length} тиражей доступно</span>
        </div>
        <p>Выберите период и нажмите одну кнопку. Программа проверит весь созданный набор по каждому тиражу выбранной лотереи.</p>
        <div class="generator-archive-controls">
          <label>Период проверки
            <select data-generator="archiveWindow">
              ${[
                ["100", "Последние 100 тиражей"],
                ["500", "Последние 500 тиражей"],
                ["1000", "Последние 1 000 тиражей"],
                ["5000", "Последние 5 000 тиражей"],
                ["10000", "Последние 10 000 тиражей"],
                ["all", `Весь архив · ${profile.draws.length}`],
              ]
                .map(
                  ([value, label]) =>
                    `<option value="${value}" ${String(settings.archiveWindow) === value ? "selected" : ""}>${label}</option>`,
                )
                .join("")}
            </select>
          </label>
          <button class="primary-btn" data-action="analyze-generator-archive"
            ${profile.generatorResults.length && profile.draws.length ? "" : "disabled"}>
            Проверить ${profile.generatorResults.length || 0} ставок по архиву
          </button>
        </div>
        ${
          archiveReport
            ? generatorArchiveReportView(archiveReport)
            : `<div class="archive-check-empty"><strong>Отчёта пока нет</strong><span>Сначала сгенерируйте ставки, затем запустите проверку.</span></div>`
        }
      </article>
    </section>`;
}

function generatedTicketList(profile) {
  const resultCost = profile.generatorResults.reduce(
    (sum, row) => sum + row.combinations * profile.price,
    0,
  );
  if (!profile.generatorResults.length) {
    return `<div class="empty-state workbench-empty"><strong>Ставок пока нет</strong><span>Задайте количество и нажмите «Сгенерировать». Либо откройте «Своя ставка» и добавьте выбранные числа.</span></div>`;
  }
  return `
    <div class="coverage-line compact-coverage">
      <span>Покрытие поля 1</span>
      <strong>${profile.generatorCoverage.length}/20</strong>
      <div class="mini-numbers">${profile.generatorCoverage.map((number) => `<b>${number}</b>`).join("")}</div>
      <span class="result-cost">Один тираж: ${formatMoney(resultCost)}</span>
    </div>
    <div class="ticket-table workbench-ticket-table">
      ${profile.generatorResults
        .map(
          (row, index) => `
            <div class="ticket-row">
              <span class="row-index">${String(index + 1).padStart(2, "0")}</span>
              <div class="ticket-numbers main-ticket">${row.main.map((number) => `<b>${number}</b>`).join("")}</div>
              <span class="ticket-separator">+</span>
              <div class="ticket-numbers extra-ticket">${row.extra.map((number) => `<b>${number}</b>`).join("")}</div>
              <span class="row-combinations">${row.combinations} ком.</span>
            </div>`,
        )
        .join("")}
    </div>`;
}

function manualTicketBuilder(profile) {
  const combinations = systemCombinations(profile.main.length, profile.extra.length);
  const ready = combinations > 0;
  return `
    <details class="panel collapsible-panel manual-ticket-panel" data-details="manualTicket"
      ${runtime.openDetails[state.gameKey].manualTicket ? "open" : ""}>
      <summary>
        <span class="step-heading"><b>+</b><span><strong>Своя ставка</strong><small>Выбрать числа вручную или собрать расширенную ставку</small></span></span>
        <span class="summary-help">${helpTip("Откройте этот блок, если хотите добавить в общий набор собственные числа вместо автоматической генерации.")}</span>
      </summary>
      <div class="manual-ticket-body">
        <div class="simple-field-heading"><span>Поле 1 ${helpTip("Выберите от 8 до 20 основных чисел. При выборе больше восьми программа проверит все простые комбинации внутри системы.")}</span><strong>${profile.main.length} выбрано</strong></div>
        ${numberGrid(Array.from({ length: 20 }, (_, index) => index + 1), profile.main, "main")}
        <div class="simple-field-heading extra"><span>Поле 2 ${helpTip("Выберите от 1 до 4 дополнительных чисел. Каждое участвует в системном разложении ставки.")}</span><strong>${profile.extra.length} выбрано</strong></div>
        ${numberGrid([1, 2, 3, 4], profile.extra, "extra")}
        <div class="manual-ticket-summary">
          <span>Простых комбинаций: <strong>${combinations}</strong></span>
          <span>Стоимость: <strong>${formatMoney(combinations * profile.price)}</strong></span>
        </div>
        <div class="button-row command-row">
          ${commandWithHelp(`<button class="primary-btn" data-action="add-current-to-generator" ${ready ? "" : "disabled"}>Добавить в набор</button>`, "Добавляет выбранную ставку к готовому набору слева. Дубликат повторно не добавится.")}
          ${commandWithHelp(`<button class="secondary-btn" data-action="random-simple">Случайные 8 + 1</button>`, "Случайно выбирает восемь основных и одно дополнительное число, но пока не добавляет их в набор.")}
          ${commandWithHelp(`<button class="ghost-btn" data-action="clear-ticket">Очистить числа</button>`, "Снимает только текущий ручной выбор. Уже добавленные ставки сохраняются.")}
        </div>
      </div>
    </details>`;
}

function workbenchView() {
  const game = currentGame();
  const profile = currentProfile();
  const settings = profile.generator;
  const stats = getArchiveStats();
  const report = runtime.generatorArchiveAnalysis[state.gameKey];
  const evaluation = runtime.ticketEvaluation[state.gameKey];
  const archiveScope = archiveScopeDetails(profile);
  const rowCombinations = systemCombinations(settings.mainCount, settings.extraCount);
  const setCost = profile.generatorResults.reduce(
    (sum, row) => sum + row.combinations * profile.price,
    0,
  );

  return `
    <section class="workbench-view">
      <article class="panel workflow-guide">
        <div>
          <span class="eyebrow">Один экран вместо трёх вкладок</span>
          <h2>Создайте ставки → выберите архив → посмотрите результат</h2>
        </div>
        <div class="workflow-steps" aria-label="Порядок работы">
          <span class="done"><b>1</b> Создать ставки</span>
          <span class="${profile.generatorResults.length ? "done" : ""}"><b>2</b> Проверить архив</span>
          <span class="${report ? "done" : ""}"><b>3</b> Изучить дни</span>
        </div>
      </article>

      <div class="workbench-columns">
        <div class="workbench-left stack">
          <article class="panel workbench-generator">
            <div class="panel-heading">
              <div><span class="eyebrow">Шаг 1</span><h2>Создайте набор ставок ${helpTip("Сначала создайте одну или несколько ставок. Готовый набор останется отдельным для выбранной лотереи.")}</h2></div>
              <span class="status-pill">${profile.generatorResults.length} готово</span>
            </div>
            <div class="generator-primary-grid workbench-primary-grid">
              ${generatorField("Количество ставок", "count", settings.count, { min: 1, max: 500, help: "Сколько уникальных строк создать. Для быстрой проверки начните с 5–20 ставок." })}
              ${generatorField("Чисел поля 1", "mainCount", settings.mainCount, { min: 8, max: 20, help: "8 — обычная ставка. 9–20 — расширенная система из нескольких простых комбинаций." })}
              ${generatorField("Чисел поля 2", "extraCount", settings.extraCount, { min: 1, max: 4, help: "Количество выбранных дополнительных чисел 1–4. Больше одного увеличивает число простых комбинаций и стоимость." })}
              <label>${fieldTitle("Принцип отбора", "Определяет, как выбирать числа. Статистические режимы используют только архив текущей лотереи и не предсказывают будущий тираж.")}
                <select data-generator="strategy">
                  ${[
                    ["random", "Случайно"],
                    ["mixed", "Смешанная статистика"],
                    ["hot", "Частые числа"],
                    ["cold", "Редкие числа"],
                    ["overdue", "Давно не выпадали"],
                    ["pairs", "Частые пары"],
                    ["triples", "Частые тройки"],
                  ]
                    .map(
                      ([value, label]) => `<option value="${value}" ${settings.strategy === value ? "selected" : ""}>${label}</option>`,
                    )
                    .join("")}
                </select>
              </label>
              <label>${fieldTitle("Цена комбинации, ₽", `Можно ввести фактическую цену вручную. Цена с сайта для ${game.name}: ${formatMoney(profile.sitePrice)}.`)}
                <input type="number" min="1" step="1" value="${profile.price}" data-input="price">
              </label>
            </div>
            <div class="generator-action-line workbench-generate-line">
              <div><span>Одна строка</span><strong>${rowCombinations} ком. · ${formatMoney(rowCombinations * profile.price)}</strong></div>
              <div><span>Весь набор за тираж</span><strong>${formatMoney(rowCombinations * profile.price * settings.count)}</strong></div>
              ${commandWithHelp(`<button class="primary-btn" data-action="generate">Сгенерировать</button>`, "Создаёт новый уникальный набор по указанным настройкам. Предыдущий готовый набор будет заменён.")}
            </div>
          </article>

          <details class="panel collapsible-panel generator-rules" data-details="generatorRules"
            ${runtime.openDetails[state.gameKey].generatorRules ? "open" : ""}>
            <summary>
              <span class="step-heading"><b>⚙</b><span><strong>Дополнительные правила</strong><small>Все поля по умолчанию пустые: пустое поле не включает фильтр</small></span></span>
              <span class="summary-help">${helpTip("Все правила внутри необязательны. Без них генератор уже готов к работе.")}</span>
            </summary>
            <div class="generator-rules-toolbar">
              <span>Заполняйте только нужные ограничения</span>
              ${commandWithHelp(`<button class="ghost-btn" data-action="clear-generator-rules">Очистить все</button>`, "Сбрасывает все дополнительные фильтры и seed, но сохраняет количество ставок, размеры полей и уже созданный набор.")}
            </div>
            <div class="generator-rule-sections">
              <section>
                <h3>Числа</h3>
                <div class="form-grid">
                  ${generatorField("Включить / обязательные 1–20", "requiredMain", settings.requiredMain, { type: "text", hint: "Например: 1 2 3", help: "Если количество рядом пустое, все введённые числа обязательно попадут в каждую ставку." })}
                  ${generatorField("Сколько включать 1–20", "requiredMainCount", settings.requiredMainCount, { min: 0, max: 20, placeholder: "Все", help: "Пусто — включать весь список в каждую ставку. Число N — случайно брать ровно N значений из списка; остальные значения этого списка в данную ставку не попадут." })}
                  ${generatorField("Исключить 1–20", "excludedMain", settings.excludedMain, { type: "text", help: "Если количество рядом пустое, все введённые числа исключаются из каждой ставки." })}
                  ${generatorField("Сколько исключать 1–20", "excludedMainCount", settings.excludedMainCount, { min: 0, max: 20, placeholder: "Все", help: "Пусто — исключать весь список. Число N — для каждой ставки случайно выбирать и исключать ровно N значений из списка." })}
                  ${generatorField("Приоритетные 1–20", "priorityMain", settings.priorityMain, { type: "text", help: "Повышает шанс выбора указанных чисел, но не делает их обязательными." })}
                  ${generatorField("Включить / обязательные 1–4", "requiredExtra", settings.requiredExtra, { type: "text", help: "Пустое количество рядом означает, что все введённые дополнительные числа обязательны для каждой ставки." })}
                  ${generatorField("Сколько включать 1–4", "requiredExtraCount", settings.requiredExtraCount, { min: 0, max: 4, placeholder: "Все", help: "Пусто — включать весь список. Число N — брать ровно N дополнительных чисел из указанного списка." })}
                  ${generatorField("Исключить 1–4", "excludedExtra", settings.excludedExtra, { type: "text", help: "Пустое количество рядом означает полное исключение всех введённых дополнительных чисел." })}
                  ${generatorField("Сколько исключать 1–4", "excludedExtraCount", settings.excludedExtraCount, { min: 0, max: 4, placeholder: "Все", help: "Пусто — исключать весь список. Число N — случайно исключать ровно N дополнительных чисел из списка для каждой ставки." })}
                  ${generatorField("Повторяемый seed", "seed", settings.seed, { type: "text", help: "Одинаковое значение вместе с одинаковыми правилами создаёт тот же набор повторно." })}
                </div>
              </section>
              <section>
                <h3>Баланс</h3>
                <div class="form-grid compact-fields">
                  ${generatorField("Чётных от", "evenMin", settings.evenMin, { min: 0, max: 20, help: "Минимальное число чётных основных чисел в каждой ставке." })}
                  ${generatorField("Чётных до", "evenMax", settings.evenMax, { min: 0, max: 20, help: "Максимальное число чётных основных чисел в каждой ставке." })}
                  ${generatorField("Чисел 1–10 от", "lowerMin", settings.lowerMin, { min: 0, max: 20, help: "Минимальное количество основных чисел из нижней половины 1–10." })}
                  ${generatorField("Чисел 1–10 до", "lowerMax", settings.lowerMax, { min: 0, max: 20, help: "Максимальное количество основных чисел из нижней половины 1–10." })}
                  ${generatorField("Макс. общих чисел", "maxOverlap", settings.maxOverlap, { min: 0, max: 20, help: "Ограничивает сходство двух строк. Например, 6 означает не более шести одинаковых основных чисел." })}
                </div>
                <label class="check-control">
                  <input type="checkbox" data-generator="coverAll" ${settings.coverAll ? "checked" : ""}>
                  <span>Покрывать все числа 1–20</span>
                  ${helpTip("Генератор постарается распределить ставки так, чтобы каждое доступное основное число встретилось хотя бы один раз.")}
                </label>
              </section>
            </div>
          </details>

          ${manualTicketBuilder(profile)}

          <article class="panel workbench-ticket-set">
            <div class="panel-heading">
              <div><span class="eyebrow">Готовый набор</span><h2>${profile.generatorResults.length ? `${profile.generatorResults.length} ставок для проверки` : "Здесь появятся ваши ставки"}</h2></div>
              <div class="button-row command-row">
                ${commandWithHelp(`<button class="secondary-btn" data-action="choose-generator-ticket-file">Загрузить свои ставки</button>`, `Загружает TXT или CSV по настройкам выше. Сейчас в каждой строке ожидается ${settings.mainCount} чисел поля 1, затем ${settings.extraCount} чисел поля 2. Расширенная ставка будет рассчитана по всем простым комбинациям внутри неё.`)}
                ${commandWithHelp(`<button class="secondary-btn" data-action="export-generator" ${profile.generatorResults.length ? "" : "disabled"}>Скачать CSV</button>`, "Сохраняет готовый набор ставок в файл для дальнейшего использования.")}
                ${commandWithHelp(`<button class="ghost-btn" data-action="clear-generator-results" ${profile.generatorResults.length ? "" : "disabled"}>Очистить набор</button>`, "Удаляет только готовый набор выбранной лотереи. Архив тиражей и настройки сохраняются.")}
              </div>
              <input class="visually-hidden" type="file" accept=".csv,.txt,text/csv,text/plain" data-ticket-file="generator">
            </div>
            ${profile.generatorWarnings.length ? `<div class="warning-list">${profile.generatorWarnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : ""}
            ${generatedTicketList(profile)}
          </article>
        </div>

        <aside class="workbench-right stack">
          <article class="panel archive-ready-card">
            <div class="panel-heading compact">
              <div><span class="eyebrow">Архив ${escapeHtml(game.name)}</span><h2>${profile.draws.length.toLocaleString("ru-RU")} тиражей готово ${helpTip("Для каждой лотереи хранится собственный архив. При переключении игры автоматически выбирается её архив.")}</h2></div>
              <span class="archive-ready-dot" aria-label="Архив доступен"></span>
            </div>
            <p>${escapeHtml(profile.drawsUpdated)}</p>
            <div class="button-row command-row archive-command-row">
              ${commandWithHelp(`<button class="secondary-btn" data-action="choose-import-file">Загрузить CSV/TXT</button>`, "Открывает файл формата: номер, дата, восемь чисел поля 1 и число поля 2.")}
              ${commandWithHelp(`<button class="ghost-btn" data-action="switch-view" data-view="draws">Открыть архив</button>`, "Показывает поиск, даты, все загруженные тиражи и управление импортом.")}
            </div>
            <input id="draw-file" class="visually-hidden" type="file" accept=".csv,.txt,text/csv,text/plain">
          </article>

          <article class="panel archive-run-card">
            <div class="panel-heading">
              <div><span class="eyebrow">Шаг 2</span><h2>Проверьте набор по архиву ${helpTip("Программа как будто ставит весь готовый набор в каждом тираже периода и суммирует затраты и выплаты.")}</h2></div>
            </div>
            <div class="archive-scope-heading">
              <span>${fieldTitle("Выберите период в архиве", "Сначала выберите год, затем месяц и день. Все уровни видны без внутренней прокрутки; выбранный период используется при расчёте.")}</span>
              <strong>${escapeHtml(archiveScope.label)}</strong>
            </div>
            ${archiveCalendarTree(profile, { compact: true })}
            <div class="archive-run-summary">
              <span>Набор: <strong>${profile.generatorResults.length} ставок</strong></span>
              <span>Тиражей в периоде: <strong>${archiveScope.draws.length.toLocaleString("ru-RU")}</strong></span>
              <span>Цена набора за тираж: <strong>${formatMoney(setCost)}</strong></span>
              <span>Полные затраты: <strong>${formatMoney(setCost * archiveScope.draws.length)}</strong></span>
            </div>
            ${commandWithHelp(`<button class="primary-btn wide archive-run-button" data-action="analyze-generator-archive" ${profile.generatorResults.length && archiveScope.draws.length ? "" : "disabled"}>Рассчитать: ${escapeHtml(archiveScope.label)}</button>`, "Запускает проверку всех готовых ставок по каждому тиражу выбранного года, месяца, дня или всего архива.")}
            ${!profile.generatorResults.length ? `<p class="inline-instruction">Сначала создайте хотя бы одну ставку слева.</p>` : ""}
          </article>

          ${report ? `<article class="panel workbench-report"><div class="panel-heading"><div><span class="eyebrow">Шаг 3</span><h2>Результат расчёта</h2></div><span class="status-pill">${report.ticketChecks.toLocaleString("ru-RU")} проверок</span></div>${generatorArchiveReportView(report)}</article>` : `<article class="panel result-placeholder"><span class="result-placeholder-icon">↗</span><h2>Результат появится здесь</h2><p>После расчёта вы увидите общие суммы, разбивку по дням и сможете открыть любой отдельный тираж.</p></article>`}
        </aside>
      </div>

      ${
        evaluation
          ? `<article class="panel inline-draw-result">
              <div class="panel-heading"><div><span class="eyebrow">Подробная проверка</span><h2>Тираж №${escapeHtml(evaluation.draw.drawNum)}</h2></div>${commandWithHelp(`<button class="ghost-btn" data-action="close-draw-result">Закрыть</button>`, "Скрывает подробности этого тиража и оставляет общий архивный отчёт.")}</div>
              ${checkerResults(evaluation)}
            </article>`
          : ""
      }

      <aside class="workbench-totals" aria-label="Итог расчёта">
        <div><small>Набор за тираж</small><strong>${formatMoney(setCost)}</strong></div>
        <div><small>Проверено тиражей</small><strong>${report?.drawCount || 0}</strong></div>
        <div><small>Выплаты</small><strong>${formatMoney(report?.totalPrize || 0)}</strong></div>
        <div class="${report?.profit >= 0 ? "positive" : "negative"}"><small>Итог</small><strong>${formatMoney(report?.profit || 0)}</strong></div>
      </aside>
    </section>`;
}

function activeStrategyLayer(profile = currentProfile()) {
  return (
    profile.strategyLayers.find(
      (layer) => Number(layer.id) === Number(profile.activeStrategyLayerId),
    ) || profile.strategyLayers[0]
  );
}

const STRATEGY_HISTORY_PAGE_SIZES = [50, 120, 250, 500, 1000, 2000];

function strategyHistoryState(layerId) {
  const bucket = runtime.strategyHistory[state.gameKey];
  const key = String(layerId || "default");
  if (!bucket[key]) bucket[key] = { page: 1, pageSize: 120 };
  if (!STRATEGY_HISTORY_PAGE_SIZES.includes(Number(bucket[key].pageSize))) {
    bucket[key].pageSize = 120;
  }
  return bucket[key];
}

function analysisBallState(analysis, field, number) {
  if (field === "extra") {
    if (analysis.requiredExtra.includes(number)) return "required";
    if (analysis.excludedExtra.includes(number)) return "excluded";
    return "neutral";
  }
  if (analysis.requiredMain.includes(number)) return "required";
  if (analysis.excludedMain.includes(number)) return "excluded";
  if (analysis.priorityMain.includes(number)) return "priority";
  return "neutral";
}

function analysisBall(number, analysis, archive, field = "main") {
  const stateName = analysisBallState(analysis, field, number);
  const frequency =
    field === "main"
      ? archive.frequency[number]
      : archive.extraFrequency[number];
  const gap =
    field === "main"
      ? archive.mainGaps.current[number]
      : archive.extraGaps.current[number];
  const maximum =
    field === "main"
      ? Math.max(1, ...Object.values(archive.frequency))
      : Math.max(1, ...Object.values(archive.extraFrequency));
  const heat = Math.max(0.08, frequency / maximum);
  const trend = field === "main" ? archive.trend[number] : 0;
  const trendText =
    field === "main" && Math.abs(trend) >= 0.1
      ? `${trend > 0 ? "+" : ""}${trend.toFixed(1)} п.п.`
      : "—";
  const stateLabel = {
    neutral: "обычное",
    priority: "приоритетное",
    required: "обязательное",
    excluded: "исключённое",
  }[stateName];
  return `
    <button class="analysis-ball ${stateName}" style="--heat:${heat.toFixed(3)}"
      data-action="cycle-analysis-number" data-field="${field}" data-number="${number}"
      title="Число ${number}: выпадений ${frequency}, текущий пропуск ${gap}, тренд ${trendText}, состояние ${stateLabel}">
      <b>${number}</b>
      <span>${frequency} раз</span>
      <small>пропуск ${gap}</small>
    </button>`;
}

function portfolioSource(profile) {
  if (profile.generatorResults.length) {
    return {
      label: "Последний набор комбогенератора",
      tickets: profile.generatorResults,
    };
  }
  const layer = activeStrategyLayer(profile);
  const parsedLayer = parseTicketLines(layer?.ticketsText || "");
  if (parsedLayer.tickets.length) {
    return {
      label: `Активный слой «${layer.name}»`,
      tickets: parsedLayer.tickets,
    };
  }
  if (profile.main.length >= 8 && profile.extra.length >= 1) {
    return {
      label: "Текущая ставка калькулятора",
      tickets: [{ main: profile.main, extra: profile.extra }],
    };
  }
  return { label: "Нет набора для анализа", tickets: [] };
}

function strategyComparison(profile) {
  const results = runtime.strategyResults[state.gameKey] || {};
  const rows = profile.strategyLayers
    .map((layer) => ({ layer, result: results[layer.id] }))
    .filter((item) => item.result);
  if (!rows.length) return "";
  return `
    <article class="panel strategy-comparison">
        <div class="panel-heading compact">
          <div><span class="eyebrow">Сравнение</span><h2>Результаты слоёв · ${escapeHtml(rows[0].result.scopeLabel || "выбранный период")}</h2></div>
      </div>
      <div class="comparison-table">
        <div class="comparison-head"><span>Слой</span><span>Затраты</span><span>Выигрыш</span><span>Прибыль</span><span>ROI</span><span>Просадка</span></div>
        ${rows
          .map(
            ({ layer, result }) => `
              <div class="comparison-row">
                <strong>${escapeHtml(layer.name)}</strong>
                <span>${formatMoney(result.totalCost)}</span>
                <span>${formatMoney(result.totalPrize)}</span>
                <span class="${result.profit >= 0 ? "positive-text" : "negative-text"}">${formatMoney(result.profit)}</span>
                <span>${formatPercent(result.roi)}</span>
                <span>${formatMoney(result.maxDrawdown)}</span>
              </div>`,
          )
          .join("")}
      </div>
    </article>`;
}

function strategyDrawDetailKey(layerId, entry) {
  return `${layerId}|${entry.drawNum}|${entry.date}`;
}

function strategyDetailBalls(values, matchedValues = [], extra = false) {
  const matches = new Set(matchedValues.map(Number));
  return `
    <span class="strategy-detail-balls ${extra ? "extra" : "main"}">
      ${values
        .map(
          (number) =>
            `<b class="${matches.has(Number(number)) ? "hit" : ""}">${escapeHtml(number)}</b>`,
        )
        .join("")}
    </span>`;
}

function strategyWinningDrawDetails(entry) {
  const winningTickets = Array.isArray(entry.winningTickets)
    ? entry.winningTickets
    : [];
  const drawMain = Array.isArray(entry.drawMain) ? entry.drawMain : [];
  const drawExtra = Number(entry.drawExtra || 0);
  const winningCombinationCount = winningTickets.reduce(
    (total, ticket) =>
      total +
      ticket.breakdown
        .filter((row) => row.total > 0)
        .reduce((sum, row) => sum + row.count * ticket.copies, 0),
    0,
  );

  return `
    <div class="strategy-win-details">
      <div class="strategy-win-details-head">
        <div>
          <span class="eyebrow">Результат тиража №${escapeHtml(entry.drawNum)}</span>
          <strong>${escapeHtml(formatDate(entry.date))}</strong>
        </div>
        <div class="strategy-win-summary">
          <span>Сыгравших наших ставок <strong>${winningTickets.length.toLocaleString("ru-RU")}</strong></span>
          <span>Оплаченных выигрышных комбинаций <strong>${winningCombinationCount.toLocaleString("ru-RU")}</strong></span>
          <span>Куплено ставок в тираже <strong>${Number(entry.purchasedTickets ?? entry.activeTickets ?? 0).toLocaleString("ru-RU")}</strong></span>
          ${entry.excludedTicketIndexes?.length ? `<span>Пропустили этот тираж <strong>${entry.excludedTicketIndexes.length.toLocaleString("ru-RU")}</strong></span>` : ""}
          ${entry.nextExcludedTicketIndexes?.length ? `<span>Исключаются на следующий тираж <strong>${entry.nextExcludedTicketIndexes.length.toLocaleString("ru-RU")}</strong></span>` : ""}
          ${entry.discountAmount > 0 ? `<span>Экономия на покупке <strong>${formatMoney(entry.discountAmount)}</strong></span>` : ""}
          <span>Выплата тиража <strong>${formatMoney(entry.prize)}</strong></span>
        </div>
      </div>

      <div class="strategy-drawn-combination">
        <span>Выпавшая комбинация</span>
        <div>
          ${strategyDetailBalls(drawMain)}
          <i>+</i>
          ${strategyDetailBalls(drawExtra ? [drawExtra] : [], [], true)}
        </div>
      </div>

      <div class="strategy-winning-ticket-list">
        ${winningTickets
          .map((ticket) => {
            const paidBreakdown = ticket.breakdown.filter(
              (row) => row.total > 0,
            );
            const ticketWinningCombinations = paidBreakdown.reduce(
              (sum, row) => sum + row.count,
              0,
            );
            const mainMatches = ticket.ticket.main.filter((number) =>
              drawMain.includes(Number(number)),
            );
            const extraMatches = ticket.extraMatched ? [drawExtra] : [];
            return `
              <article class="strategy-winning-ticket">
                <div class="strategy-winning-ticket-head">
                  <div>
                    <span class="eyebrow">Наша ставка №${ticket.index}</span>
                    <strong>${ticket.mainMatches} + ${ticket.extraMatched ? 1 : 0} совпадений</strong>
                  </div>
                  <strong>${formatMoney(ticket.totalPrize)}</strong>
                </div>
                <div class="strategy-ticket-combination">
                  ${strategyDetailBalls(ticket.ticket.main, mainMatches)}
                  <i>+</i>
                  ${strategyDetailBalls(ticket.ticket.extra, extraMatches, true)}
                </div>
                <div class="strategy-ticket-facts">
                  <span>Простых комбинаций в ставке <strong>${Number(ticket.combinations).toLocaleString("ru-RU")}</strong></span>
                  <span>Выигрышных на 1 копию <strong>${ticketWinningCombinations.toLocaleString("ru-RU")}</strong></span>
                  <span>Копий в этом тираже <strong>×${ticket.copies}</strong></span>
                  <span>Выигрыш 1 копии <strong>${formatMoney(ticket.prizePerCopy)}</strong></span>
                </div>
                <div class="strategy-win-breakdown">
                  <div class="strategy-win-breakdown-head"><span>Категория</span><span>Комбинаций</span><span>За одну</span><span>Копий</span><span>Оплачено</span><span>Сумма</span></div>
                  ${paidBreakdown
                    .map(
                      (row) => `
                        <div class="strategy-win-breakdown-row">
                          <strong>${escapeHtml(row.category)}</strong>
                          <span>${Number(row.count).toLocaleString("ru-RU")}</span>
                          <span>${formatMoney(row.amount)}</span>
                          <span>×${ticket.copies}</span>
                          <span>${(row.count * ticket.copies).toLocaleString("ru-RU")}</span>
                          <strong>${formatMoney(row.total * ticket.copies)}</strong>
                        </div>`,
                    )
                    .join("")}
                </div>
              </article>`;
          })
          .join("")}
      </div>
    </div>`;
}

function strategyWinStatisticsPanel(entries, layerId) {
  const statistics = summarizeStrategyWins(entries);
  const winningDrawCount = entries.filter(
    (entry) =>
      !entry.skipped &&
      entry.winningTickets?.some((ticket) =>
        ticket.breakdown?.some((row) => row.total > 0),
      ),
  ).length;
  const totalPaidCombinations = statistics.reduce(
    (sum, row) => sum + row.paidCombinations,
    0,
  );

  return `
    <section class="strategy-win-statistics">
      <div class="strategy-win-statistics-head">
        <div>
          <span class="eyebrow">Статистика выигрышей</span>
          <h3>Категории и количество выигравших комбинаций</h3>
        </div>
        <div>
          <span>Выигрышных тиражей <strong>${winningDrawCount.toLocaleString("ru-RU")}</strong></span>
          <span>Оплаченных комбинаций <strong>${totalPaidCombinations.toLocaleString("ru-RU")}</strong></span>
        </div>
      </div>
      <div class="strategy-win-stat-grid">
        ${statistics
          .map((row) => {
            const showDrawLinks = ["8 + 1", "8 + 0"].includes(row.category);
            return `
              <article class="strategy-win-stat-card ${showDrawLinks ? "major" : ""} ${row.drawCount ? "has-wins" : "empty"}">
                <div class="strategy-win-stat-card-head">
                  <strong>${escapeHtml(row.category)}</strong>
                  <span>${row.drawCount.toLocaleString("ru-RU")} тир.</span>
                </div>
                <div class="strategy-win-stat-values">
                  <span>Сработавших ставок <strong>${row.ticketCount.toLocaleString("ru-RU")}</strong></span>
                  <span>Комбинаций без копий <strong>${row.combinations.toLocaleString("ru-RU")}</strong></span>
                  <span>Оплачено с копиями <strong>${row.paidCombinations.toLocaleString("ru-RU")}</strong></span>
                  <span>Сумма <strong>${formatMoney(row.prize)}</strong></span>
                </div>
                ${
                  showDrawLinks
                    ? `
                      <div class="strategy-major-win-draws">
                        <span>${row.drawCount ? "День и номер тиража — нажмите для просмотра" : "В выбранном периоде таких выигрышей нет"}</span>
                        ${row.draws
                          .slice()
                          .reverse()
                          .map(
                            (draw) => `
                              <button type="button" data-action="open-strategy-win-draw" data-entry-index="${draw.entryIndex}" data-result-key="${escapeHtml(strategyDrawDetailKey(layerId, draw))}">
                                <strong>№${escapeHtml(draw.drawNum)}</strong>
                                <small>${escapeHtml(formatArchiveDate(draw.date))}</small>
                                <span>${draw.paidCombinations.toLocaleString("ru-RU")} ком. · ${formatMoney(draw.prize)}</span>
                              </button>`,
                          )
                          .join("")}
                      </div>`
                    : ""
                }
              </article>`;
          })
          .join("")}
      </div>
    </section>`;
}

function strategyPanel(profile) {
  const layer = activeStrategyLayer(profile);
  const parsed = parseTicketLines(layer?.ticketsText || "");
  const result = runtime.strategyResults[state.gameKey]?.[layer?.id];
  const resultEntries = result?.entries || [];
  const periodDrawCount = result?.periodDrawCount ?? resultEntries.length;
  const calculatedDrawCount =
    result?.calculatedDrawCount ?? resultEntries.filter((entry) => !entry.skipped).length;
  const skippedDrawCount =
    result?.skippedDrawCount ?? resultEntries.filter((entry) => entry.skipped).length;
  const strategyScope = strategyArchiveScopeDetails(profile);
  const historyState = strategyHistoryState(layer?.id);
  const historyPageSize = Number(historyState.pageSize);
  const historyPageCount = Math.max(
    1,
    Math.ceil(resultEntries.length / historyPageSize),
  );
  const historyPage = Math.min(
    historyPageCount,
    Math.max(1, Number(historyState.page) || 1),
  );
  historyState.page = historyPage;
  const historyStart = (historyPage - 1) * historyPageSize;
  const historyEnd = Math.min(
    historyStart + historyPageSize,
    resultEntries.length,
  );
  const ruleLabel = layer?.rule === "multiply" ? "×" : "+";
  const strategyDiscountPercent = Math.min(
    100,
    Math.max(0, Number(layer?.discountPercent) || 0),
  );
  const strategyDiscountedPrice =
    Math.round(
      Number(profile.price || 0) *
        (1 - strategyDiscountPercent / 100) *
        100,
    ) / 100;
  const excludeWinningTickets = layer?.trigger === "exclude_winners";
  return `
    <section class="stack strategy-section">
      <article class="panel">
        <div class="panel-heading">
          <div><span class="eyebrow">Как в «Цветных шарах»</span><h2>Слои стратегий ${helpTip("Слой — отдельный набор ставок со своими правилами изменения количества после проигрыша и выигрыша.")}</h2></div>
          ${commandWithHelp(`<button class="secondary-btn" data-action="add-strategy-layer">+ Новый слой</button>`, "Создаёт ещё один независимый набор ставок и правил для сравнения стратегий.")}
        </div>
        <div class="strategy-tabs">
          ${profile.strategyLayers
            .map(
              (item) => `
                <button class="${item.id === layer.id ? "active" : ""}" data-action="switch-strategy-layer" data-layer="${item.id}">
                  ${escapeHtml(item.name)}
                  <small>${parseTicketLines(item.ticketsText).tickets.length} став.</small>
                </button>`,
            )
            .join("")}
        </div>
      </article>

      <section class="strategy-grid">
        <article class="panel strategy-editor">
          <div class="panel-heading compact">
            <div><span class="eyebrow">Активный слой</span><h2>${escapeHtml(layer.name)}</h2></div>
            ${commandWithHelp(`<button class="danger-btn" data-action="delete-strategy-layer" ${profile.strategyLayers.length === 1 ? "disabled" : ""}>Удалить слой</button>`, "Удаляет только активный слой стратегии. Готовый набор основного рабочего экрана сохраняется.")}
          </div>
          <label>${fieldTitle("Название слоя", "Помогает различать несколько вариантов стратегии в сравнении.")}
            <input type="text" data-strategy="name" value="${escapeHtml(layer.name)}">
          </label>
          <label>${fieldTitle("Ставки слоя", "Каждая строка — отдельная ставка: восемь или больше основных чисел, затем символ | и числа поля 2.")}
            <textarea data-strategy="ticketsText" rows="9" placeholder="1 2 3 4 5 6 7 8 | 1">${escapeHtml(layer.ticketsText)}</textarea>
          </label>
          <div class="button-row command-row">
            ${commandWithHelp(`<button class="secondary-btn" data-action="choose-strategy-ticket-file">Загрузить свои ставки</button>`, `Заменяет ставки активного слоя строками из TXT или CSV. Формат берётся из настроек генератора: сейчас ${profile.generator.mainCount} чисел поля 1 и ${profile.generator.extraCount} чисел поля 2.`)}
            ${commandWithHelp(`<button class="ghost-btn" data-action="strategy-add-current" ${profile.main.length >= 8 && profile.extra.length ? "" : "disabled"}>Добавить текущую ставку</button>`, "Копирует ручную ставку из блока «Своя ставка» в активный слой.")}
            ${commandWithHelp(`<button class="ghost-btn" data-action="strategy-use-generator" ${profile.generatorResults.length ? "" : "disabled"}>Взять готовый набор</button>`, "Копирует все ставки с рабочего экрана в активный слой стратегии.")}
            ${commandWithHelp(`<button class="ghost-btn" data-action="strategy-clear-tickets">Очистить</button>`, "Удаляет ставки только из активного слоя.")}
          </div>
          <input class="visually-hidden" type="file" accept=".csv,.txt,text/csv,text/plain" data-ticket-file="strategy">
          <div class="parsed-preview">
            <span>Ставок: <strong>${parsed.tickets.length}</strong></span>
            <span>Ошибок: <strong>${parsed.errors.length}</strong></span>
            <span>Простых комбинаций: <strong>${parsed.tickets.reduce((sum, ticket) => sum + ticket.combinations, 0)}</strong></span>
          </div>
        </article>

        <article class="panel strategy-rules">
          <div class="panel-heading compact">
            <div><span class="eyebrow">Автостратегия</span><h2>Правило ${ruleLabel}${layer.step}</h2></div>
          </div>
          <div class="form-grid">
            <label>${fieldTitle("Режим расчёта", "«Реальный комплект» меняет количество всего набора. «Независимые ставки» ведёт отдельный счётчик для каждой строки.")}
              <select data-strategy="mode">
                <option value="real" ${layer.mode === "real" ? "selected" : ""}>Реальный комплект</option>
                <option value="independent" ${layer.mode === "independent" ? "selected" : ""}>Независимые ставки</option>
              </select>
            </label>
            <label>${fieldTitle("Правило после проигрыша", "После каждого проигранного тиража количество увеличивается на N или умножается на N. После выигрыша остаток дня можно остановить отдельной настройкой.")}
              <select data-strategy="rule">
                <option value="add" ${layer.rule === "add" ? "selected" : ""}>Добавлять +N</option>
                <option value="multiply" ${layer.rule === "multiply" ? "selected" : ""}>Умножать ×N</option>
              </select>
            </label>
            <label>${fieldTitle("Шаг N", "Шаг применяется после каждого проигранного тиража: ×1, затем ×2, ×3 и далее для правила +1.")}
              <input type="number" min="1" max="100" data-strategy="step" value="${layer.step}">
            </label>
            <label>${fieldTitle("Начальное количество", "Сколько копий ставки или комплекта покупать в начале расчёта и после сброса.")}
              <input type="number" min="1" max="1000" data-strategy="baseCopies" value="${layer.baseCopies}">
            </label>
            <label>${fieldTitle("Максимальное количество", "Защитный потолок: стратегия не поднимет количество выше этого значения.")}
              <input type="number" min="1" max="100000" data-strategy="maxCopies" value="${layer.maxCopies}">
            </label>
            <label>${fieldTitle("Скидка на покупку, %", "Уменьшает фактическую стоимость всех билетов этого слоя. Выплаты не уменьшаются. При значении 0% скидка не применяется.")}
              <input type="number" min="0" max="100" step="0.1" data-strategy="discountPercent" value="${strategyDiscountPercent}">
              <small class="help-text">Цена комбинации: ${formatMoney(profile.price)} → <strong>${formatMoney(strategyDiscountedPrice)}</strong></small>
            </label>
            <label>${fieldTitle("Лимит затрат, ₽", "Если значение больше нуля, расчёт дня остановится при достижении заданного расхода. В расчёте месяца, года или всего архива лимит начинается заново для каждого дня.")}
              <input type="number" min="0" step="1" data-strategy="budget" value="${layer.budget}">
            </label>
            <label>${fieldTitle("Условие выигрыша", "Определяет, когда считать цикл выигранным. Режим «Исключить выигрышные» вместо остановки временно убирает сыгравшие ставки только из одного следующего тиража.")}
              <select data-strategy="trigger">
                <option value="any" ${layer.trigger === "any" ? "selected" : ""}>Любая выплата</option>
                <option value="profit" ${layer.trigger === "profit" ? "selected" : ""}>Прибыльный тираж</option>
                <option value="recovery" ${layer.trigger === "recovery" ? "selected" : ""}>Закрыта накопленная просадка</option>
                <option value="category" ${layer.trigger === "category" ? "selected" : ""}>Категория не ниже выбранной</option>
                <option value="exclude_winners" ${excludeWinningTickets ? "selected" : ""}>Исключить выигрышные на 1 тираж</option>
              </select>
            </label>
            <label>${fieldTitle("Порог категории", "Используется только для условия «Категория не ниже выбранной».")}
              <select data-strategy="categoryIndex" ${layer.trigger === "category" ? "" : "disabled"}>
                ${PAYOUT_CATEGORIES.map(
                  (category, index) =>
                    `<option value="${index}" ${Number(layer.categoryIndex) === index ? "selected" : ""}>${category}</option>`,
                ).join("")}
              </select>
            </label>
          </div>
          <div class="check-row">
            <label class="check-control"><input type="checkbox" data-strategy="resetOnWin" ${layer.resetOnWin ? "checked" : ""}><span>Сбросить к начальному количеству после выигрыша</span>${helpTip("После выигрыша следующий рассчитанный тираж начинается с начального количества. Если включена остановка дня, это будет первый тираж следующего дня.")}</label>
            <label class="check-control"><input type="checkbox" data-strategy="stopOnWin" ${layer.stopOnWin && !excludeWinningTickets ? "checked" : ""} ${excludeWinningTickets ? "disabled" : ""}><span>Остановить ставку или слой после выигрыша</span>${helpTip(excludeWinningTickets ? "В режиме исключения остановка отключена: выигравшие ставки пропускают только следующий рассчитанный тираж, затем возвращаются." : "В расчёте одного дня ставка останавливается до его конца. При выборе месяца, года или всего архива следующий день начинается заново, поэтому расчёт проходит весь выбранный период.")}</label>
          </div>
          ${excludeWinningTickets ? `<div class="strategy-exclude-winners-note"><strong>Исключить выигрышные</strong><span>После каждого тиража выигравшие строки не покупаются ровно в одном следующем рассчитанном тираже. Затем они автоматически возвращаются в исходный набор.</span></div>` : ""}
          <p class="help-text">${layer.mode === "independent" ? "Каждая строка имеет собственный счётчик, баланс, сброс и остановку." : "Один счётчик применяется ко всему реально приобретаемому комплекту ставок."}</p>
          <div class="strategy-period-controls">
            <label>${fieldTitle("Период расчёта", "Выберите масштаб архива: один день, месяц, год или весь загруженный архив.")}
              <select data-strategy-scope="type">
                <option value="day" ${strategyScope.type === "day" ? "selected" : ""}>Конкретный день</option>
                <option value="month" ${strategyScope.type === "month" ? "selected" : ""}>Конкретный месяц</option>
                <option value="year" ${strategyScope.type === "year" ? "selected" : ""}>Конкретный год</option>
                <option value="all" ${strategyScope.type === "all" ? "selected" : ""}>Весь архив</option>
              </select>
            </label>
            <label>${fieldTitle("Какой именно период", "Список формируется только из дат, которые действительно есть в архиве текущей лотереи.")}
              <select data-strategy-scope="key" ${strategyScope.type === "all" ? "disabled" : ""}>
                ${strategyScope.type === "all"
                  ? '<option value="all">Весь архив</option>'
                  : strategyScope.options
                      .map(
                        (option) =>
                          `<option value="${escapeHtml(option.key)}" ${option.key === strategyScope.key ? "selected" : ""}>${escapeHtml(option.label)} · ${option.count.toLocaleString("ru-RU")}</option>`,
                      )
                      .join("")}
              </select>
            </label>
            <div class="strategy-period-summary">
              <span>Будет рассчитано</span>
              <strong>${escapeHtml(strategyScope.label)}</strong>
            </div>
          </div>
          ${commandWithHelp(`<button class="primary-btn wide" data-action="run-strategies" ${strategyScope.draws.length ? "" : "disabled"}>Рассчитать все слои по архиву: ${escapeHtml(strategyScope.label)}</button>`, "Прогоняет все слои только по выбранному дню, месяцу, году или всему архиву и сравнивает затраты, выплаты, просадку и итог.")}
        </article>
      </section>

      ${
        result
          ? `
            <article class="panel strategy-result">
              <div class="panel-heading">
                <div><span class="eyebrow">Прогон «${escapeHtml(layer.name)}» · ${escapeHtml(result.scopeLabel || strategyScope.label)}</span><h2>${periodDrawCount.toLocaleString("ru-RU")} тиражей периода пройдено</h2></div>
                <span class="status-pill">${result.stoppedReason || "Архив рассчитан полностью"}</span>
              </div>
              <div class="metric-grid strategy-metrics">
                <div><span>Затраты</span><strong>${formatMoney(result.totalCost)}</strong></div>
                <div><span>Без скидки</span><strong>${formatMoney(result.totalGrossCost ?? result.totalCost)}</strong></div>
                <div class="positive"><span>Экономия ${formatPercent(result.settings?.discountPercent || 0)}</span><strong>${formatMoney(result.totalDiscount || 0)}</strong></div>
                <div><span>Выигрыш</span><strong>${formatMoney(result.totalPrize)}</strong></div>
                <div class="${result.profit >= 0 ? "positive" : "negative"}"><span>Прибыль</span><strong>${formatMoney(result.profit)}</strong></div>
                <div><span>ROI</span><strong>${formatPercent(result.roi)}</strong></div>
                <div><span>Начальный баланс</span><strong>${formatMoney(result.startingBalance)}</strong></div>
                <div class="${result.endingBalance >= result.startingBalance ? "positive" : "negative"}"><span>Баланс после периода</span><strong>${formatMoney(result.endingBalance)}</strong></div>
                <div class="negative"><span>Макс. просадка</span><strong>${formatMoney(result.maxDrawdown)}</strong></div>
                <div><span>Макс. количество</span><strong>×${result.maxCopiesUsed}</strong></div>
                <div><span>Серия убыточных</span><strong>${result.longestLossStreak}</strong></div>
                <div><span>Активных ставок</span><strong>${result.activeTickets}</strong></div>
                <div><span>Рассчитано до остановок</span><strong>${calculatedDrawCount.toLocaleString("ru-RU")}</strong></div>
                <div><span>Пропущено после остановок</span><strong>${skippedDrawCount.toLocaleString("ru-RU")}</strong></div>
                <div><span>Дневных остановок</span><strong>${(result.dailyStops?.length || 0).toLocaleString("ru-RU")}</strong></div>
                <div><span>Временно исключено</span><strong>${(result.totalExcludedTickets || 0).toLocaleString("ru-RU")}</strong></div>
                <div><span>Макс. исключено за тираж</span><strong>${(result.maxExcludedTickets || 0).toLocaleString("ru-RU")}</strong></div>
              </div>
              ${strategyWinStatisticsPanel(resultEntries, layer.id)}
              <div class="strategy-history">
                <div class="strategy-history-tools">
                  <label>${fieldTitle("Тиражей на странице", "Меняет только количество видимых строк. Расчёт и итоговые суммы всегда охватывают весь выбранный период.")}
                    <select data-strategy-history-size>
                      ${STRATEGY_HISTORY_PAGE_SIZES.map(
                        (size) =>
                          `<option value="${size}" ${size === historyPageSize ? "selected" : ""}>${size.toLocaleString("ru-RU")}</option>`,
                      ).join("")}
                    </select>
                  </label>
                  <span>Показаны <strong>${resultEntries.length ? historyStart + 1 : 0}–${historyEnd}</strong> из <strong>${periodDrawCount.toLocaleString("ru-RU")}</strong></span>
                </div>
                <div class="strategy-history-head"><span>Тираж</span><span>× / ставки</span><span>Затраты</span><span>Выигрыш</span><span>Итог</span><span>Баланс ${helpTip("Перед первым тиражом в баланс вносится полная сумма купленных билетов за выбранный период. Затем после каждого тиража вычитаются его затраты и добавляется выигрыш.")}</span></div>
                ${historyPage === 1 ? `<div class="strategy-history-row strategy-history-start-row">
                    <strong>Старт периода</strong>
                    <span>—</span>
                    <span>—</span>
                    <span>—</span>
                    <span>Внесено</span>
                    <span>${formatMoney(result.startingBalance)}</span>
                  </div>` : ""}
                ${resultEntries
                  .slice(historyStart, historyEnd)
                  .map((entry) => {
                    if (entry.skipped) {
                      return `
                          <div class="strategy-history-row strategy-history-skipped" title="${escapeHtml(entry.skipReason || "Остановлено правилами дня")}">
                            <strong>№${escapeHtml(entry.drawNum)}<small>${escapeHtml(formatDate(entry.date))}</small></strong>
                            <span class="strategy-history-copies">—${entry.excludedTicketIndexes?.length ? `<small>исключено ${entry.excludedTicketIndexes.length}</small>` : ""}</span>
                            <span>—</span>
                            <span>—</span>
                            <span class="skip-label">Пропущен</span>
                            <span>${formatMoney(entry.balance)}</span>
                          </div>`;
                    }
                    const canExpand =
                      entry.prize > 0 && entry.winningTickets?.length;
                    if (canExpand) {
                      const detailKey = strategyDrawDetailKey(layer.id, entry);
                      const expanded =
                        runtime.expandedStrategyDraw[state.gameKey] === detailKey;
                      return `
                        <div class="strategy-history-entry ${expanded ? "expanded" : ""}">
                          <button type="button" class="strategy-history-row strategy-history-win" data-action="toggle-strategy-win" data-result-key="${escapeHtml(detailKey)}" aria-expanded="${expanded}">
                            <strong>№${escapeHtml(entry.drawNum)}<small>${escapeHtml(formatDate(entry.date))}</small></strong>
                            <span class="strategy-history-copies">×${entry.copies}<small>${Number(entry.purchasedTickets ?? entry.activeTickets ?? 0).toLocaleString("ru-RU")} став.${entry.excludedTicketIndexes?.length ? ` · исключено ${entry.excludedTicketIndexes.length}` : ""}</small></span>
                            <span>${formatMoney(entry.cost)}</span>
                            <span>${formatMoney(entry.prize)}</span>
                            <span class="positive-text strategy-win-outcome">${formatMoney(entry.profit)}<small>${expanded ? "Скрыть" : "Показать выигрыш"}</small></span>
                            <span>${formatMoney(entry.balance)}</span>
                          </button>
                          ${expanded ? strategyWinningDrawDetails(entry) : ""}
                        </div>`;
                    }
                    return `
                          <div class="strategy-history-row">
                            <strong>№${escapeHtml(entry.drawNum)}<small>${escapeHtml(formatDate(entry.date))}</small></strong>
                            <span class="strategy-history-copies">×${entry.copies}<small>${Number(entry.purchasedTickets ?? entry.activeTickets ?? 0).toLocaleString("ru-RU")} став.${entry.excludedTicketIndexes?.length ? ` · исключено ${entry.excludedTicketIndexes.length}` : ""}</small></span>
                            <span>${formatMoney(entry.cost)}</span>
                            <span>${formatMoney(entry.prize)}</span>
                            <span class="${entry.profit >= 0 ? "positive-text" : "negative-text"}">${formatMoney(entry.profit)}</span>
                            <span>${formatMoney(entry.balance)}</span>
                          </div>`;
                  })
                  .join("")}
                <div class="archive-pagination strategy-history-pagination">
                  <button class="ghost-btn" data-action="strategy-history-page" data-page="1" ${historyPage <= 1 ? "disabled" : ""}>Первая</button>
                  <button class="ghost-btn" data-action="strategy-history-page" data-page="${historyPage - 1}" ${historyPage <= 1 ? "disabled" : ""}>Назад</button>
                  <span>Страница <strong>${historyPage}</strong> из ${historyPageCount}</span>
                  <button class="ghost-btn" data-action="strategy-history-page" data-page="${historyPage + 1}" ${historyPage >= historyPageCount ? "disabled" : ""}>Вперёд</button>
                  <button class="ghost-btn" data-action="strategy-history-page" data-page="${historyPageCount}" ${historyPage >= historyPageCount ? "disabled" : ""}>Последняя</button>
                </div>
              </div>
            </article>`
          : ""
      }
    </section>`;
}

function dailyBreakdownPanel(profile, breakdown) {
  const requestedLimit = Number(profile.analysis.dailyLimit);
  const limit = [7, 14, 30, 60, 90].includes(requestedLimit)
    ? requestedLimit
    : 14;
  const latestDay = breakdown.days[0] || null;
  const requestedDate = profile.analysis.dailyDate || latestDay?.key || "";
  const selectedDay =
    breakdown.days.find((day) => day.key === requestedDate) || null;
  const recentDays = breakdown.days.slice(0, limit);
  const visibleDays =
    selectedDay && !recentDays.some((day) => day.key === selectedDay.key)
      ? [selectedDay, ...recentDays.slice(0, Math.max(0, limit - 1))]
      : recentDays;
  const mainMaximum = selectedDay
    ? Math.max(1, ...selectedDay.frequency.slice(1))
    : 1;
  const mainMinimum = selectedDay
    ? Math.min(...selectedDay.frequency.slice(1))
    : 0;
  const extraMaximum = selectedDay
    ? Math.max(1, ...selectedDay.extraFrequency.slice(1))
    : 1;
  const extraMinimum = selectedDay
    ? Math.min(...selectedDay.extraFrequency.slice(1))
    : 0;

  return `
    <article class="panel daily-breakdown-panel">
      <div class="panel-heading">
        <div><span class="eyebrow">Архив по календарным датам</span><h2>Разбивка по дням ${helpTip("Показывает частоту каждого числа отдельно за выбранный календарный день.")}</h2></div>
        <div class="daily-controls">
          <label>${fieldTitle("Выбранный день", "Дата, для которой нужно показать частоту чисел поля 1 и поля 2.")}
            <input type="date" data-analysis="dailyDate" value="${escapeHtml(requestedDate)}">
          </label>
          <label>${fieldTitle("Последние дни", "Количество последних календарных дней, показываемых в списке ниже.")}
            <select data-analysis="dailyLimit">
              ${[7, 14, 30, 60, 90]
                .map(
                  (value) =>
                    `<option value="${value}" ${value === limit ? "selected" : ""}>${value}</option>`,
                )
                .join("")}
            </select>
          </label>
        </div>
      </div>
      <div class="daily-overview">
        <div><span>Дней в архиве</span><strong>${breakdown.dayCount}</strong></div>
        <div><span>Тиражей без даты</span><strong>${breakdown.undatedCount}</strong></div>
        <div><span>День анализа</span><strong>${selectedDay?.label || "Нет тиражей"}</strong></div>
        <div><span>Тиражей за день</span><strong>${selectedDay?.drawCount || 0}</strong></div>
      </div>
      ${
        selectedDay
          ? `
            <div class="daily-selected">
              <div class="daily-field">
                <div><span class="eyebrow">Поле 1</span><h3>Частота чисел за ${selectedDay.label}</h3></div>
                <div class="daily-frequency-grid">
                  ${Array.from({ length: 20 }, (_, index) => {
                    const number = index + 1;
                    const count = selectedDay.frequency[number];
                    const heatLevel = Math.round(
                      ((count - mainMinimum) /
                        Math.max(1, mainMaximum - mainMinimum)) *
                        5,
                    );
                    return `<span class="daily-frequency-ball heat-${heatLevel}" title="${number}: ${count} раз"><b>${number}</b><small>×${count}</small></span>`;
                  }).join("")}
                </div>
              </div>
              <div class="daily-field daily-extra-field">
                <div><span class="eyebrow">Поле 2</span><h3>Дополнительное число</h3></div>
                <div class="daily-frequency-grid extra">
                  ${Array.from({ length: 4 }, (_, index) => {
                    const number = index + 1;
                    const count = selectedDay.extraFrequency[number];
                    const heatLevel = Math.round(
                      ((count - extraMinimum) /
                        Math.max(1, extraMaximum - extraMinimum)) *
                        5,
                    );
                    return `<span class="daily-frequency-ball extra heat-${heatLevel}" title="${number}: ${count} раз"><b>${number}</b><small>×${count}</small></span>`;
                  }).join("")}
                </div>
              </div>
            </div>`
          : `<div class="empty-state">За выбранную дату тиражей в архиве нет. Выберите один из дней ниже.</div>`
      }
      <div class="daily-day-list">
        ${visibleDays
          .map(
            (day) => `
              <button class="daily-day-card ${day.key === selectedDay?.key ? "active" : ""}"
                data-action="select-analysis-day" data-day="${day.key}">
                <span><strong>${day.label}</strong><small>${day.drawCount} тиражей</small></span>
                <span class="daily-hot-row">
                  ${day.hot
                    .slice(0, 8)
                    .map(
                      (number) =>
                        `<b title="${number}: ${day.frequency[number]} раз">${number}<small>${day.frequency[number]}</small></b>`,
                    )
                    .join("")}
                </span>
                <span class="daily-extra-row">Поле 2: ${day.extraHot
                  .map(
                    (number) =>
                      `<b>${number}<small>${day.extraFrequency[number]}</small></b>`,
                  )
                  .join("")}</span>
              </button>`,
          )
          .join("") || `<div class="empty-state">В архиве пока нет тиражей с корректной датой.</div>`}
      </div>
    </article>`;
}

function analysisView() {
  const profile = currentProfile();
  const analysis = profile.analysis;
  const archive = getAdvancedArchiveAnalysis();
  const dailyBreakdown = getDailyArchiveBreakdown();
  const source = portfolioSource(profile);
  const portfolio = analyzeTicketPortfolio(source.tickets);
  const maxMatrix = Math.max(1, ...Object.values(archive.cooccurrence));
  const lastDraw = archive.draws[0];

  return `
    <section class="stack analysis-view">
      <article class="panel analysis-intro">
        <div class="panel-heading">
          <div><span class="eyebrow">История выбранной лотереи</span><h2>Цветовая карта чисел и стратегический анализ</h2></div>
          <div class="analysis-controls">
            <label>Период
              <select data-analysis="window">
                ${[
                  ["10", "10 тиражей"],
                  ["25", "25 тиражей"],
                  ["50", "50 тиражей"],
                  ["100", "100 тиражей"],
                  ["all", "Весь архив"],
                ]
                  .map(
                    ([value, label]) =>
                      `<option value="${value}" ${String(analysis.window) === value ? "selected" : ""}>${label}</option>`,
                  )
                  .join("")}
              </select>
            </label>
            <button class="secondary-btn" data-action="analysis-to-generator">Передать в генератор</button>
            <button class="ghost-btn" data-action="analysis-clear">Сбросить метки</button>
          </div>
        </div>
        <div class="analysis-summary">
          <div><span>Тиражей в периоде</span><strong>${archive.drawCount}</strong></div>
          <div><span>Предыдущий период</span><strong>${archive.previousDrawCount}</strong></div>
          <div><span>Последний тираж</span><strong>${lastDraw ? `№${escapeHtml(lastDraw.drawNum)}` : "—"}</strong></div>
          <div><span>Обновление архива</span><strong>${escapeHtml(profile.drawsUpdated)}</strong></div>
        </div>
      </article>

      ${dailyBreakdownPanel(profile, dailyBreakdown)}

      <article class="panel ball-analysis-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">Нажимайте на шары</span><h2>Основные числа 1–20</h2></div>
          <div class="analysis-legend">
            <span><i class="priority"></i>Приоритет</span>
            <span><i class="required"></i>Обязательно</span>
            <span><i class="excluded"></i>Исключить</span>
          </div>
        </div>
        <p class="help-text">Цвет и интенсивность показывают частоту в выбранном периоде. Последовательные нажатия меняют состояние: приоритет → обязательно → исключить → обычное.</p>
        <div class="analysis-ball-grid">
          ${Array.from({ length: 20 }, (_, index) =>
            analysisBall(index + 1, analysis, archive, "main"),
          ).join("")}
        </div>
        <div class="extra-analysis">
          <div><span class="eyebrow">Дополнительное поле</span><h3>Числа 1–4</h3></div>
          <div class="analysis-extra-grid">
            ${[1, 2, 3, 4]
              .map((number) => analysisBall(number, analysis, archive, "extra"))
              .join("")}
          </div>
        </div>
      </article>

      <section class="analysis-cards">
        <article class="panel">
          <span class="eyebrow">Распределение</span><h3>Средний тираж периода</h3>
          <div class="analysis-stat-list">
            <div><span>Чётных чисел</span><strong>${archive.distribution.averageEven.toFixed(2)}</strong></div>
            <div><span>Чисел 1–10</span><strong>${archive.distribution.averageLower.toFixed(2)}</strong></div>
            <div><span>Сумма восьми чисел</span><strong>${archive.distribution.averageSum.toFixed(1)}</strong></div>
            <div><span>Повторов прошлого тиража</span><strong>${archive.distribution.averageRepeats.toFixed(2)}</strong></div>
          </div>
        </article>
        <article class="panel">
          <span class="eyebrow">Совместные выпадения</span><h3>Частые пары</h3>
          <div class="pattern-list">
            ${archive.topPairs
              .slice(0, 10)
              .map(
                (pair) =>
                  `<span><b>${pair.numbers.join(" · ")}</b><small>${pair.count} раз</small></span>`,
              )
              .join("") || "<p>Недостаточно данных</p>"}
          </div>
        </article>
        <article class="panel">
          <span class="eyebrow">Связки</span><h3>Частые тройки</h3>
          <div class="pattern-list">
            ${archive.topTriples
              .slice(0, 10)
              .map(
                (triple) =>
                  `<span><b>${triple.numbers.join(" · ")}</b><small>${triple.count} раз</small></span>`,
              )
              .join("") || "<p>Недостаточно данных</p>"}
          </div>
        </article>
      </section>

      <article class="panel matrix-panel">
        <div class="panel-heading compact">
          <div><span class="eyebrow">Матрица пар</span><h2>Совместная частота чисел</h2></div>
          <span class="status-pill">Чем ярче — тем чаще</span>
        </div>
        <div class="matrix-scroll">
          <div class="pair-matrix">
            <span class="matrix-corner"></span>
            ${Array.from({ length: 20 }, (_, index) => `<b>${index + 1}</b>`).join("")}
            ${Array.from({ length: 20 }, (_, row) => {
              const left = row + 1;
              return `<b>${left}</b>${Array.from({ length: 20 }, (_, column) => {
                const right = column + 1;
                if (left === right) return `<span class="matrix-diagonal"></span>`;
                const key = [left, right].sort((a, b) => a - b).join("-");
                const count = archive.cooccurrence[key] || 0;
                return `<span class="matrix-cell" style="--matrix:${(count / maxMatrix).toFixed(3)}" title="${left} + ${right}: ${count} раз"><i>${count || ""}</i></span>`;
              }).join("")}`;
            }).join("")}
          </div>
        </div>
      </article>

      <article class="panel portfolio-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">Качество набора</span><h2>${escapeHtml(source.label)}</h2></div>
          <span class="status-pill">${portfolio.ticketCount} ставок</span>
        </div>
        ${
          portfolio.ticketCount
            ? `
              <div class="metric-grid portfolio-metrics">
                <div><span>Основные покрыты</span><strong>${portfolio.coveredMain.length}/20</strong></div>
                <div><span>Дополнительные</span><strong>${portfolio.coveredExtra.length}/4</strong></div>
                <div><span>Покрытие пар</span><strong>${formatPercent(portfolio.pairCoveragePercent)}</strong></div>
                <div><span>Среднее пересечение</span><strong>${portfolio.averageOverlap.toFixed(2)}</strong></div>
                <div><span>Макс. пересечение</span><strong>${portfolio.maxOverlap}</strong></div>
                <div><span>Дубликаты</span><strong>${portfolio.duplicateCount}</strong></div>
                <div><span>Почти одинаковые</span><strong>${portfolio.nearDuplicates}</strong></div>
                <div><span>Простых комбинаций</span><strong>${portfolio.totalCombinations}</strong></div>
              </div>
              <div class="usage-bars">
                ${Object.entries(portfolio.mainUsage)
                  .map(([number, count]) => {
                    const maximum = Math.max(1, ...Object.values(portfolio.mainUsage));
                    return `<div title="Число ${number}: ${count} ставок"><b>${number}</b><span><i style="width:${(count / maximum) * 100}%"></i></span><small>${count}</small></div>`;
                  })
                  .join("")}
              </div>`
            : `<div class="empty-state">Сначала создайте набор в комбогенераторе, добавьте ставку калькулятора или заполните активный слой.</div>`
        }
      </article>

      ${strategyComparison(profile)}
      ${strategyPanel(profile)}
    </section>`;
}

function analysisNumberMode(profile, archive) {
  const analysis = profile.analysis;
  return `
    <article class="panel ball-analysis-panel">
      <div class="panel-heading">
        <div><span class="eyebrow">Нажимайте на шары</span><h2>Основные числа 1–20</h2></div>
        <div class="analysis-legend">
          <span><i class="priority"></i>Приоритет</span>
          <span><i class="required"></i>Обязательно</span>
          <span><i class="excluded"></i>Исключить</span>
        </div>
      </div>
      <p class="help-text">Яркость показывает частоту. Нажатие меняет состояние числа: приоритет → обязательно → исключить → обычное.</p>
      <div class="analysis-ball-grid">
        ${Array.from({ length: 20 }, (_, index) =>
          analysisBall(index + 1, analysis, archive, "main"),
        ).join("")}
      </div>
      <div class="extra-analysis">
        <div><span class="eyebrow">Поле 2</span><h3>Числа 1–4</h3></div>
        <div class="analysis-extra-grid">
          ${[1, 2, 3, 4]
            .map((number) => analysisBall(number, analysis, archive, "extra"))
            .join("")}
        </div>
      </div>
    </article>
    <article class="panel compact-analysis-card">
      <div class="panel-heading compact">
        <div><span class="eyebrow">Распределение</span><h2>Средний тираж периода</h2></div>
      </div>
      <div class="analysis-stat-list horizontal">
        <div><span>Чётных</span><strong>${archive.distribution.averageEven.toFixed(2)}</strong></div>
        <div><span>Чисел 1–10</span><strong>${archive.distribution.averageLower.toFixed(2)}</strong></div>
        <div><span>Сумма</span><strong>${archive.distribution.averageSum.toFixed(1)}</strong></div>
        <div><span>Повторов</span><strong>${archive.distribution.averageRepeats.toFixed(2)}</strong></div>
      </div>
    </article>`;
}

function analysisPatternMode(archive) {
  const maxMatrix = Math.max(1, ...Object.values(archive.cooccurrence));
  return `
    <section class="analysis-cards">
      <article class="panel">
        <span class="eyebrow">Совместные выпадения</span><h3>Частые пары</h3>
        <div class="pattern-list">
          ${archive.topPairs
            .slice(0, 15)
            .map(
              (pair) =>
                `<span><b>${pair.numbers.join(" · ")}</b><small>${pair.count} раз</small></span>`,
            )
            .join("") || "<p>Недостаточно данных</p>"}
        </div>
      </article>
      <article class="panel">
        <span class="eyebrow">Связки</span><h3>Частые тройки</h3>
        <div class="pattern-list">
          ${archive.topTriples
            .slice(0, 15)
            .map(
              (triple) =>
                `<span><b>${triple.numbers.join(" · ")}</b><small>${triple.count} раз</small></span>`,
            )
            .join("") || "<p>Недостаточно данных</p>"}
        </div>
      </article>
    </section>
    <article class="panel matrix-panel">
      <div class="panel-heading compact">
        <div><span class="eyebrow">Матрица пар</span><h2>Совместная частота чисел</h2></div>
        <span class="status-pill">Чем ярче — тем чаще</span>
      </div>
      <div class="matrix-scroll">
        <div class="pair-matrix">
          <span class="matrix-corner"></span>
          ${Array.from({ length: 20 }, (_, index) => `<b>${index + 1}</b>`).join("")}
          ${Array.from({ length: 20 }, (_, row) => {
            const left = row + 1;
            return `<b>${left}</b>${Array.from({ length: 20 }, (_, column) => {
              const right = column + 1;
              if (left === right) return `<span class="matrix-diagonal"></span>`;
              const key = [left, right].sort((a, b) => a - b).join("-");
              const count = archive.cooccurrence[key] || 0;
              return `<span class="matrix-cell" style="--matrix:${(count / maxMatrix).toFixed(3)}" title="${left} + ${right}: ${count} раз"><i>${count || ""}</i></span>`;
            }).join("")}`;
          }).join("")}
        </div>
      </div>
    </article>`;
}

function analysisStrategyMode(profile) {
  const source = portfolioSource(profile);
  const portfolio = analyzeTicketPortfolio(source.tickets);
  return `
    <article class="panel portfolio-panel">
      <div class="panel-heading">
        <div><span class="eyebrow">Качество набора</span><h2>${escapeHtml(source.label)}</h2></div>
        <span class="status-pill">${portfolio.ticketCount} ставок</span>
      </div>
      ${
        portfolio.ticketCount
          ? `
            <div class="metric-grid portfolio-metrics">
              <div><span>Основные покрыты</span><strong>${portfolio.coveredMain.length}/20</strong></div>
              <div><span>Дополнительные</span><strong>${portfolio.coveredExtra.length}/4</strong></div>
              <div><span>Покрытие пар</span><strong>${formatPercent(portfolio.pairCoveragePercent)}</strong></div>
              <div><span>Среднее пересечение</span><strong>${portfolio.averageOverlap.toFixed(2)}</strong></div>
              <div><span>Макс. пересечение</span><strong>${portfolio.maxOverlap}</strong></div>
              <div><span>Дубликаты</span><strong>${portfolio.duplicateCount}</strong></div>
              <div><span>Почти одинаковые</span><strong>${portfolio.nearDuplicates}</strong></div>
              <div><span>Простых комбинаций</span><strong>${portfolio.totalCombinations}</strong></div>
            </div>
            <div class="usage-bars">
              ${Object.entries(portfolio.mainUsage)
                .map(([number, count]) => {
                  const maximum = Math.max(
                    1,
                    ...Object.values(portfolio.mainUsage),
                  );
                  return `<div title="Число ${number}: ${count} ставок"><b>${number}</b><span><i style="width:${(count / maximum) * 100}%"></i></span><small>${count}</small></div>`;
                })
                .join("")}
            </div>`
          : `<div class="empty-state">Сначала создайте набор в генераторе или заполните активный слой стратегии.</div>`
      }
    </article>
    ${strategyComparison(profile)}
    ${strategyPanel(profile)}`;
}

function simpleAnalysisView() {
  const profile = currentProfile();
  const validSections = ["days", "numbers", "patterns", "strategies"];
  const section = validSections.includes(profile.analysis.section)
    ? profile.analysis.section
    : "days";
  const archive =
    section === "numbers" || section === "patterns"
      ? getAdvancedArchiveAnalysis()
      : null;
  const dailyBreakdown =
    section === "days" ? getDailyArchiveBreakdown() : null;
  const lastDraw = profile.draws[0];

  const content = {
    days: () => dailyBreakdownPanel(profile, dailyBreakdown),
    numbers: () => analysisNumberMode(profile, archive),
    patterns: () => analysisPatternMode(archive),
    strategies: () => analysisStrategyMode(profile),
  }[section]();

  return `
    <section class="stack analysis-view">
      <article class="panel analysis-hub">
        <div class="panel-heading">
          <div><span class="eyebrow">Простой выбор режима</span><h2>Что анализируем?</h2></div>
          ${
            section === "numbers" || section === "patterns"
              ? `<label class="compact-period">${fieldTitle("Период", "Количество последних тиражей, используемых для частот, пар, троек и цветовой карты.")}
                  <select data-analysis="window">
                    ${[
                      ["10", "10 тиражей"],
                      ["25", "25 тиражей"],
                      ["50", "50 тиражей"],
                      ["100", "100 тиражей"],
                      ["all", "Весь архив"],
                    ]
                      .map(
                        ([value, label]) =>
                          `<option value="${value}" ${String(profile.analysis.window) === value ? "selected" : ""}>${label}</option>`,
                      )
                      .join("")}
                  </select>
                </label>`
              : ""
          }
        </div>
        <div class="analysis-mode-switch">
          ${[
            ["days", "По дням", "Частоты за выбранную дату"],
            ["numbers", "По числам", "Цветные шары 1–20 и 1–4"],
            ["patterns", "Пары и тройки", "Связки и матрица"],
            ["strategies", "Стратегии", "Наборы и прогон по архиву"],
          ]
            .map(
              ([value, label, hint]) => `
                <button class="${section === value ? "active" : ""}" title="${escapeHtml(hint)}"
                  data-action="select-analysis-section" data-section="${value}">
                  <strong>${label}</strong><small>${hint}</small><i class="inline-question" aria-hidden="true">?</i>
                </button>`,
            )
            .join("")}
        </div>
        <div class="analysis-quick-line">
          <span>Архив: <strong>${profile.draws.length} тиражей</strong></span>
          <span>Последний: <strong>${lastDraw ? `№${escapeHtml(lastDraw.drawNum)}` : "—"}</strong></span>
          <span>${escapeHtml(profile.drawsUpdated)}</span>
          ${
            section === "numbers"
              ? `${commandWithHelp(`<button class="secondary-btn" data-action="analysis-to-generator">Передать метки в генератор</button>`, "Переносит приоритетные, обязательные и исключённые числа в дополнительные правила рабочего генератора.")}
                 ${commandWithHelp(`<button class="ghost-btn" data-action="analysis-clear">Сбросить метки</button>`, "Возвращает всем числам нейтральное состояние, не удаляя архив.")}`
              : ""
          }
        </div>
      </article>
      ${content}
    </section>`;
}

function checkerView() {
  const profile = currentProfile();
  const evaluation = runtime.ticketEvaluation[state.gameKey];
  const parsed = parseTicketLines(profile.ticketsText);

  return `
    <section class="view-grid checker-layout">
      <article class="panel">
        <div class="panel-heading">
          <div><span class="eyebrow">Ручной ввод или вставка</span><h2>Проверка билетов</h2></div>
          <span class="status-pill">${parsed.tickets.length} распознано</span>
        </div>
        <label>Комбинации
          <textarea data-input="ticketsText" rows="12" placeholder="Каждая ставка с новой строки:
1 2 3 4 5 6 7 8 | 4
2 5 7 9 10 13 16 20 | 1

Для системы можно указать 8–20 основных и 1–4 дополнительных.">${escapeHtml(profile.ticketsText)}</textarea>
        </label>
        <div class="button-row">
          <button class="primary-btn" data-action="evaluate-tickets">Проверить по тиражу</button>
          ${commandWithHelp(`<button class="secondary-btn" data-action="choose-checker-ticket-file">Загрузить свои ставки</button>`, `Формат файла берётся из настроек генератора: сначала ${profile.generator.mainCount} чисел поля 1, затем ${profile.generator.extraCount} чисел поля 2. Расширенные ставки проверяются по всем входящим в них комбинациям.`)}
          <button class="ghost-btn" data-action="insert-generator" ${profile.generatorResults.length ? "" : "disabled"}>Вставить результат генератора</button>
          <button class="ghost-btn" data-action="clear-checker">Очистить</button>
        </div>
        <input class="visually-hidden" type="file" accept=".csv,.txt,text/csv,text/plain" data-ticket-file="checker">
        ${
          parsed.errors.length
            ? `<div class="error-list">${parsed.errors.slice(0, 8).map((error) => `<p>Строка ${error.line}: ${escapeHtml(error.message)}</p>`).join("")}</div>`
            : ""
        }
        <div class="parsed-preview">
          <span>Распознано: <strong>${parsed.tickets.length}</strong></span>
          <span>Ошибок: <strong>${parsed.errors.length}</strong></span>
          <span>Простых комбинаций: <strong>${parsed.tickets.reduce((sum, ticket) => sum + ticket.combinations, 0)}</strong></span>
        </div>
      </article>

      <article class="panel">
        <div class="panel-heading compact">
          <div><span class="eyebrow">Контрольный тираж</span><h2>Выберите результат</h2></div>
        </div>
        <label>Номер тиража
          <input type="text" inputmode="numeric" data-input="selectedDraw"
            value="${escapeHtml(profile.selectedDraw)}"
            placeholder="Например, 58255">
          <small>Введите номер из загруженного архива. Полный список не создаётся на странице, поэтому проверка остаётся быстрой при любом размере файла.</small>
        </label>
        ${
          evaluation
            ? checkerResults(evaluation)
            : `<div class="empty-state tall">Вставьте ставки, выберите тираж и запустите проверку. Для расширенной ставки программа рассчитает все простые комбинации внутри системы.</div>`
        }
      </article>
    </section>`;
}

function checkerResults(evaluation) {
  const summary = evaluation.summary;
  return `
    <div class="metric-grid checker-metrics">
      <div><span>Проверено комбинаций</span><strong>${summary.combinations}</strong></div>
      <div><span>Стоимость</span><strong>${formatMoney(summary.cost)}</strong></div>
      <div class="positive"><span>Выплаты</span><strong>${formatMoney(summary.prize)}</strong></div>
      <div class="${summary.profit < 0 ? "negative" : "positive"}"><span>Итог / ROI</span><strong>${formatMoney(summary.profit)} · ${formatPercent(summary.roi)}</strong></div>
    </div>
    <div class="draw-result">
      <span>Тираж № ${escapeHtml(evaluation.draw.drawNum)}</span>
      <div class="ticket-numbers main-ticket">${evaluation.draw.main.map((number) => `<b>${number}</b>`).join("")}</div>
      <span>+</span>
      <div class="ticket-numbers extra-ticket"><b>${evaluation.draw.extra}</b></div>
    </div>
    <div class="checker-results">
      ${summary.results
        .map(
          (row) => `
            <details class="check-row" ${row.prize ? "open" : ""}>
              <summary>
                <span>Ставка ${row.index}</span>
                <span>${row.mainMatches} осн. ${row.extraMatched ? "+ доп." : ""}</span>
                <strong>${formatMoney(row.prize)}</strong>
              </summary>
              <div class="breakdown">
                ${
                  row.breakdown.length
                    ? row.breakdown.map((item) => `<span>${item.category}: ${item.count} × ${formatMoney(item.amount)} = <b>${formatMoney(item.total)}</b></span>`).join("")
                    : "<span>Выигрышных категорий нет</span>"
                }
              </div>
            </details>`,
        )
        .join("")}
    </div>`;
}

function archiveDateKey(value) {
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  const russian = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (russian) {
    return `${russian[3]}-${russian[2].padStart(2, "0")}-${russian[1].padStart(2, "0")}`;
  }
  return "";
}

function drawBrowserRows(profile) {
  const browserState = runtime.drawBrowser[state.gameKey];
  const query = browserState.query.trim().toLocaleLowerCase("ru-RU");
  const scopedDraws = archiveScopeDetails(profile).draws;
  return scopedDraws.filter((draw) => {
    if (browserState.date && archiveDateKey(draw.date) !== browserState.date) {
      return false;
    }
    if (!query) return true;
    return (
      String(draw.drawNum).toLocaleLowerCase("ru-RU").includes(query) ||
      String(draw.date).toLocaleLowerCase("ru-RU").includes(query)
    );
  });
}

function archiveBrowser(profile) {
  const browserState = runtime.drawBrowser[state.gameKey];
  const archiveScope = archiveScopeDetails(profile);
  const filtered = drawBrowserRows(profile);
  const pageSize = [50, 100, 250].includes(Number(browserState.pageSize))
    ? Number(browserState.pageSize)
    : 100;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(pageCount, Math.max(1, Number(browserState.page) || 1));
  browserState.page = page;
  const start = (page - 1) * pageSize;
  const pageRows = filtered.slice(start, start + pageSize);
  let previousDate = "";
  const rows = pageRows
    .map((draw) => {
      const date = formatDate(draw.date);
      const separator =
        date !== previousDate
          ? `<div class="draw-day-separator"><strong>${date}</strong><span>Тиражи за день</span></div>`
          : "";
      previousDate = date;
      return `${separator}
        <div class="draw-row">
          <div><strong>Тираж ${escapeHtml(draw.drawNum)}</strong><small>${date}</small></div>
          <div class="ticket-numbers main-ticket">${draw.main.map((number) => `<b>${number}</b>`).join("")}</div>
          <span>+</span>
          <div class="ticket-numbers extra-ticket"><b>${draw.extra}</b></div>
          <span class="draw-jackpot">${draw.jackpot ? formatMoney(draw.jackpot) : "—"}</span>
        </div>`;
    })
    .join("");

  return `
    <div class="archive-browser-tools">
      <label>${fieldTitle("Номер тиража или дата", "Ищет совпадение в номере тиража или в записанной дате.")}
        <input type="search" data-draw-filter="query"
          value="${escapeHtml(browserState.query)}" placeholder="Например, 58255">
      </label>
      <label>${fieldTitle("Только дата", "Оставляет в списке только тиражи выбранного календарного дня.")}
        <input type="date" data-draw-filter="date" value="${escapeHtml(browserState.date)}">
      </label>
      <label>${fieldTitle("Строк на странице", "Меняет количество отображаемых строк. Сам архив при этом не обрезается.")}
        <select data-draw-filter="pageSize">
          ${[50, 100, 250]
            .map(
              (value) =>
                `<option value="${value}" ${value === pageSize ? "selected" : ""}>${value}</option>`,
            )
            .join("")}
        </select>
      </label>
      ${commandWithHelp(`<button class="primary-btn" data-action="apply-draw-filters">Показать</button>`, "Применяет введённый номер, дату и размер страницы к списку архива.")}
      ${commandWithHelp(`<button class="ghost-btn" data-action="clear-draw-filters" ${browserState.query || browserState.date ? "" : "disabled"}>Сбросить</button>`, "Очищает поиск и снова показывает весь архив.")}
    </div>
    <div class="archive-browser-status">
      <span>Период: <strong>${escapeHtml(archiveScope.label)}</strong></span>
      <span>Найдено: <strong>${filtered.length}</strong> из ${archiveScope.draws.length}</span>
      <span>Показаны ${filtered.length ? start + 1 : 0}–${Math.min(start + pageSize, filtered.length)}</span>
    </div>
    ${
      pageRows.length
        ? `<div class="draw-list">${rows}</div>`
        : `<div class="empty-state">По заданному номеру или дате тиражи не найдены.</div>`
    }
    <div class="archive-pagination">
      <button class="ghost-btn" data-action="archive-page" data-page="1" ${page <= 1 ? "disabled" : ""}>Первая</button>
      <button class="ghost-btn" data-action="archive-page" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Назад</button>
      <span>Страница <strong>${page}</strong> из ${pageCount}</span>
      <button class="ghost-btn" data-action="archive-page" data-page="${page + 1}" ${page >= pageCount ? "disabled" : ""}>Вперёд</button>
      <button class="ghost-btn" data-action="archive-page" data-page="${pageCount}" ${page >= pageCount ? "disabled" : ""}>Последняя</button>
    </div>`;
}

function drawsView() {
  const game = currentGame();
  const profile = currentProfile();
  const preview = runtime.importPreview[state.gameKey];
  const stats = getArchiveStats();
  const calendar = getArchiveCalendar();
  const archiveScope = archiveScopeDetails(profile);

  return `
    <section class="stack">
      <section class="view-grid draws-tools">
        <article class="panel">
          <div class="panel-heading">
            <div><span class="eyebrow">Архив ${game.name}</span><h2>Загрузка тиражей ${helpTip("Архив выбранной лотереи загружается из CSV/TXT-файла и хранится отдельно от архивов других игр.")}</h2></div>
            <span class="status-pill">${profile.draws.length} тиражей</span>
          </div>
          <p>${game.generation}. Архив и статистика изолированы от других лотерей.</p>
          <div class="button-row command-row">
            ${commandWithHelp(`<button class="primary-btn" data-action="choose-import-file">Импорт из файла</button>`, "Читает JSON, CSV или TXT и сначала показывает предварительную проверку строк.")}
            <input id="draw-file" type="file" accept=".json,.csv,.txt" hidden>
            ${commandWithHelp(`<button class="ghost-btn" data-action="export-draws" ${profile.draws.length ? "" : "disabled"}>Сохранить CSV</button>`, "Выгружает текущий архив выбранной лотереи в файл.")}
            ${
              runtime.archiveClearConfirm[state.gameKey]
                ? `<div class="archive-clear-confirm" role="group" aria-label="Подтверждение очистки архива">
                    <span><strong>Удалить ${profile.draws.length.toLocaleString("ru-RU")} тиражей?</strong><small>Только «${escapeHtml(game.name)}»</small></span>
                    ${commandWithHelp(`<button class="danger-btn" data-action="confirm-clear-draws">Да, удалить архив</button>`, "Безвозвратно удаляет все локальные тиражи выбранной лотереи. Архивы остальных игр сохраняются.")}
                    ${commandWithHelp(`<button class="ghost-btn" data-action="cancel-clear-draws">Отмена</button>`, "Отменяет очистку. Все тиражи остаются на месте.")}
                  </div>`
                : commandWithHelp(`<button class="danger-btn archive-clear-btn" data-action="clear-draws" ${profile.draws.length ? "" : "disabled"}>Очистить архив</button>`, `Показывает подтверждение удаления локального архива только лотереи «${game.name}». Архивы двух других игр сохраняются.`)
            }
          </div>
          <div class="archive-format">
            <span>Формат CSV или TXT: номер, дата, 8 чисел поля 1, число поля 2</span>
            <code>58255,20.03.2026,18,20,08,02,13,16,05,04,02</code>
            <code>TXT также можно записать через пробелы: 58255 20.03.2026 18 20 08 02 13 16 05 04 02</code>
          </div>
          <div class="source-box">
            <span>Текущий источник</span><strong>${escapeHtml(profile.drawsUpdated)}</strong>
          </div>
        </article>
        <article class="panel">
          <div class="panel-heading compact">
            <div><span class="eyebrow">Статистика архива</span><h2>Частоты и связки</h2></div>
          </div>
          ${statisticsStrip(stats)}
          <div class="pattern-grid">
            <div><span>Частые пары</span>${stats.topPairs.slice(0, 5).map((item) => `<b>${item.numbers.join("–")} <small>×${item.count}</small></b>`).join("") || "Нет данных"}</div>
            <div><span>Частые тройки</span>${stats.topTriples.slice(0, 5).map((item) => `<b>${item.numbers.join("–")} <small>×${item.count}</small></b>`).join("") || "Нет данных"}</div>
          </div>
        </article>
      </section>

      ${preview ? importPreviewPanel(preview, profile) : ""}

      <article class="panel archive-calendar-panel">
        <div class="panel-heading">
          <div><span class="eyebrow">Механика «Суммы Фортуны»</span><h2>Архив по годам, месяцам и дням ${helpTip("Годы, месяцы и дни показаны отдельными уровнями без вложенной прокрутки. Нажатие на день загружает его тиражи в прокручиваемую сетку ниже.")}</h2></div>
          <span class="status-pill">${calendar.yearCount} г. · ${calendar.monthCount} мес. · ${calendar.dayCount} дн.</span>
        </div>
        <div class="archive-selected-period"><span>Выбран период</span><strong>${escapeHtml(archiveScope.label)}</strong></div>
        ${archiveCalendarTree(profile)}
        ${archiveDayDrawWorkspace(profile)}
      </article>

      <details class="panel archive-panel archive-search-panel">
        <summary class="archive-search-summary">
          <span><span class="eyebrow">Дополнительный инструмент</span><strong>Поиск по номеру или дате</strong></span>
          <span>${profile.draws.length.toLocaleString("ru-RU")} тиражей · раскрыть</span>
        </summary>
        <div class="archive-search-content">
          <div class="panel-heading compact">
            <div><span class="eyebrow">Общий список</span><h2>Поиск во всём архиве</h2></div>
          </div>
          ${
            profile.draws.length
              ? archiveBrowser(profile)
              : `<div class="empty-state">Импортируйте архив из файла CSV или TXT.</div>`
          }
        </div>
      </details>
    </section>`;
}

function importPreviewPanel(preview, profile) {
  const report = preview.report;
  return `
    <article class="panel import-preview-panel">
      <div class="panel-heading">
        <div><span class="eyebrow">Предварительный просмотр</span><h2>${escapeHtml(preview.fileName)}</h2></div>
        ${commandWithHelp(`<button class="ghost-btn" data-action="cancel-import">Закрыть</button>`, "Закрывает предварительный просмотр без изменения текущего архива.")}
      </div>
      <div class="import-report">
        <div><span>Корректных строк</span><strong>${report.valid.length}</strong></div>
        <div class="${report.errors.length ? "negative" : ""}"><span>Ошибок</span><strong>${report.errors.length}</strong></div>
        <div class="${report.duplicates.length ? "warning" : ""}"><span>Дубликатов</span><strong>${report.duplicates.length}</strong></div>
        <div class="${report.gaps.length ? "warning" : ""}"><span>Пропусков</span><strong>${report.gaps.reduce((sum, gap) => sum + gap.missing, 0)}</strong></div>
      </div>
      ${
        report.errors.length
          ? `<div class="error-list">${report.errors.slice(0, 10).map((error) => `<p>Строка ${error.row}: ${escapeHtml(error.message)}</p>`).join("")}</div>`
          : ""
      }
      ${
        report.duplicates.length
          ? `<div class="warning-list"><p>Дубликаты: ${report.duplicates.slice(0, 20).map((item) => `${item.drawNum} (${item.type})`).join(", ")}</p></div>`
          : ""
      }
      ${
        report.gaps.length
          ? `<div class="warning-list">${report.gaps.slice(0, 10).map((gap) => `<p>Между ${gap.after} и ${gap.before} пропущено: ${gap.missing}</p>`).join("")}</div>`
          : ""
      }
      <div class="preview-table">
        ${report.valid.slice(0, 8).map((draw) => `<span>№ ${escapeHtml(draw.drawNum)}</span><span>${draw.main.join(" ")}</span><span>+ ${draw.extra}</span>`).join("")}
      </div>
      <div class="import-actions">
        <label class="radio-card">
          <input type="radio" name="import-mode" value="add" data-input="importMode" ${profile.importMode === "add" ? "checked" : ""}>
          <span><strong>Добавить ${helpTip("Объединяет файл с текущим архивом. Совпавшие номера тиражей обновляются данными файла.")}</strong><small>Объединить с архивом, совпадающие номера обновить</small></span>
        </label>
        <label class="radio-card">
          <input type="radio" name="import-mode" value="replace" data-input="importMode" ${profile.importMode === "replace" ? "checked" : ""}>
          <span><strong>Заменить ${helpTip("Полностью заменяет архив выбранной лотереи корректными строками из файла.")}</strong><small>Использовать только корректные строки файла</small></span>
        </label>
        ${commandWithHelp(`<button class="primary-btn" data-action="confirm-import" ${report.valid.length ? "" : "disabled"}>Применить импорт</button>`, "Сохраняет в архив только корректные строки согласно выбранному режиму «Добавить» или «Заменить».")}
      </div>
    </article>`;
}

function payoutsView() {
  const game = currentGame();
  const profile = currentProfile();
  const changed = profile.payoutDraft.some(
    (amount, index) => Number(amount) !== Number(profile.customPayouts[index]),
  );
  const siteDiff = profile.sitePayouts.filter(
    (amount, index) => Number(amount) !== Number(profile.customPayouts[index]),
  ).length;

  return `
    <section class="stack">
      <section class="view-grid payout-meta-grid">
        <article class="panel source-version">
          <span class="eyebrow">Базовые данные</span>
          <h2>${game.name}</h2>
          <dl>
            <div><dt>Источник</dt><dd>${escapeHtml(profile.siteMeta.source)}</dd></div>
            <div><dt>Версия</dt><dd>${escapeHtml(profile.siteMeta.drawNum)}</dd></div>
            <div><dt>Дата</dt><dd>${escapeHtml(profile.siteMeta.date)}</dd></div>
            <div><dt>Базовая цена</dt><dd>${formatMoney(profile.sitePrice)}</dd></div>
          </dl>
          <p class="help-text">Это исходная таблица выбранной лотереи. Активные выплаты и цену можно менять вручную.</p>
        </article>
        <article class="panel source-version">
          <span class="eyebrow">Активная пользовательская версия</span>
          <h2>${siteDiff ? `${siteDiff} отличий от базовой таблицы` : "Совпадает с базовой таблицей"}</h2>
          <dl>
            <div><dt>Состояние</dt><dd>${escapeHtml(profile.customMeta.source)}</dd></div>
            <div><dt>Сохранено</dt><dd>${escapeHtml(profile.customMeta.date)}</dd></div>
            <div><dt>Несохранённые правки</dt><dd>${changed ? "Есть" : "Нет"}</dd></div>
          </dl>
          ${commandWithHelp(`<button class="secondary-btn wide" data-action="restore-base-payouts">Вернуть базовые выплаты</button>`, "Заменяет пользовательскую таблицу исходными выплатами выбранной лотереи. Действие выполняется только по этой кнопке.")}
          <p class="help-text">Это действие выполняется только по кнопке и заменяет пользовательскую версию.</p>
        </article>
      </section>

      <article class="panel payouts-editor">
        <div class="panel-heading">
          <div><span class="eyebrow">Редактируемая таблица</span><h2>Выплаты за одну простую комбинацию ${helpTip("Эти суммы используются во всех проверках архива, отдельных тиражей и стратегий выбранной лотереи.")}</h2></div>
          <div class="button-row command-row">
            ${commandWithHelp(`<button class="ghost-btn" data-action="discard-payout-draft" ${changed ? "" : "disabled"}>Отменить правки</button>`, "Возвращает поля к последней сохранённой пользовательской версии.")}
            ${commandWithHelp(`<button class="primary-btn" data-action="save-payouts" ${changed ? "" : "disabled"}>Сохранить мою версию</button>`, "Сохраняет введённые суммы отдельно для выбранной лотереи и применяет их к последующим расчётам.")}
          </div>
        </div>
        <div class="payout-table">
          <div class="table-head"><span>Совпадение</span><span>Данные сайта</span><span>Моя версия</span><span>Разница</span></div>
          ${PAYOUT_CATEGORIES.map((category, index) => {
            const diff = Number(profile.payoutDraft[index]) - Number(profile.sitePayouts[index]);
            return `
              <div class="payout-row">
                <strong>${category}</strong>
                <span>${formatMoney(profile.sitePayouts[index])}</span>
                <label title="Введите выплату для категории ${category}. Это значение будет использоваться в расчётах.">
                  <input type="number" min="0" step="1" value="${profile.payoutDraft[index]}"
                    data-payout-index="${index}" aria-label="${category} пользовательская выплата">
                  <span>₽</span><i class="payout-question" aria-hidden="true">?</i>
                </label>
                <span class="${diff < 0 ? "negative-text" : diff > 0 ? "positive-text" : ""}">${diff ? `${diff > 0 ? "+" : ""}${formatMoney(diff)}` : "—"}</span>
              </div>`;
          }).join("")}
        </div>
      </article>
    </section>`;
}

function viewContent() {
  if (state.view === "workspace") return workbenchView();
  if (state.view === "analysis") return simpleAnalysisView();
  if (state.view === "draws") return drawsView();
  if (state.view === "payouts") return payoutsView();
  return workbenchView();
}

function render() {
  hideFloatingHelpTip();
  const game = currentGame();
  document.body.dataset.theme = game.theme;
  document.title = `${game.name} · Лаборатория Восьмёрок v3`;
  root.innerHTML = `
    <header class="app-header">
      <a class="brand" href="#" data-action="switch-view" data-view="workspace">
        <span class="brand-mark">8</span>
        <span><strong>Лаборатория Восьмёрок</strong><small>анализ и стратегии · версия 3</small></span>
      </a>
      <span class="local-badge"><i></i> Локальная программа</span>
    </header>
    <main>
      <section class="lottery-hero">
        <div class="hero-content">
          <div class="breadcrumb">Выбранная лотерея · ${game.motif}</div>
          <div class="lottery-logo">${gameLogo(game)}</div>
          <h1>${game.name}</h1>
          <p>${game.heroLine}</p>
          <div class="hero-jackpot"><span>Суперприз от</span><strong>${formatMoney(game.jackpot)}</strong><small>тиражи каждые 15 минут</small></div>
        </div>
        ${heroArt(game)}
      </section>
      <div class="workspace">
        ${gameSwitch()}
        ${topSummary()}
        ${navigation()}
        ${viewContent()}
        <footer>Аналитический инструмент. Прошлые тиражи не меняют вероятность будущего результата.</footer>
      </div>
    </main>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
}

function toast(message, type = "info") {
  const element = document.querySelector("#toast");
  if (!element) return;
  element.textContent = message;
  element.dataset.type = type;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 4_000);
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve, 0));
  });
}

function download(name, text, type = "text/csv;charset=utf-8") {
  const blob = new Blob(["\ufeff", text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function generatorToText(rows) {
  return rows.map((row) => `${row.main.join(" ")} | ${row.extra.join(" ")}`).join("\n");
}

async function loadTicketFile(file, target) {
  const profile = currentProfile();
  try {
    const mainCount = Number(profile.generator?.mainCount) || 8;
    const extraCount = Number(profile.generator?.extraCount) || 1;
    const parsed = parseTicketFile(await file.text(), {
      mainCount,
      extraCount,
    });
    if (!parsed.tickets.length) {
      toast("В файле не найдено корректных ставок", "error");
      return;
    }

    const rows = parsed.tickets.map((ticket) => ({
      main: [...ticket.main],
      extra: [...ticket.extra],
      combinations: ticket.combinations,
    }));
    const text = generatorToText(rows);

    if (target === "strategy") {
      const layer = activeStrategyLayer(profile);
      layer.ticketsText = text;
      delete runtime.strategyResults[state.gameKey][layer.id];
      runtime.strategyHistory[state.gameKey][String(layer.id)] = {
        page: 1,
        pageSize: 120,
      };
    } else if (target === "checker") {
      profile.ticketsText = text;
      runtime.ticketEvaluation[state.gameKey] = null;
    } else {
      profile.generatorResults = rows;
      profile.generatorCoverage = [
        ...new Set(rows.flatMap((row) => row.main)),
      ].sort((left, right) => left - right);
      profile.generatorWarnings = parsed.errors.length
        ? [`Пропущено некорректных строк: ${parsed.errors.length}`]
        : [];
      runtime.generatorArchiveAnalysis[state.gameKey] = null;
      runtime.ticketEvaluation[state.gameKey] = null;
      runtime.selectedArchiveResultDay[state.gameKey] = "";
    }

    save();
    render();
    toast(
      `Загружено ставок: ${rows.length} · формат ${mainCount} + ${extraCount}${parsed.errors.length ? ` · пропущено строк: ${parsed.errors.length}` : ""}`,
      parsed.errors.length ? "error" : "success",
    );
  } catch (error) {
    toast(error.message || "Не удалось прочитать файл ставок", "error");
  }
}

function clearStrategyResults(gameKey = state.gameKey) {
  runtime.strategyResults[gameKey] = {};
  runtime.strategyHistory[gameKey] = {};
  runtime.expandedStrategyDraw[gameKey] = "";
  runtime.generatorArchiveAnalysis[gameKey] = null;
}

function handleSimpleAction(action, button) {
  const profile = currentProfile();
  if (action === "switch-game") {
    state.gameKey = button.dataset.game;
    runtime.ticketEvaluation[state.gameKey] = null;
  } else if (action === "switch-view") {
    state.view = button.dataset.view;
  } else if (action === "toggle-number") {
    const field = button.dataset.field;
    const number = Number(button.dataset.number);
    const max = field === "main" ? 20 : 4;
    const values = profile[field];
    if (values.includes(number)) {
      profile[field] = values.filter((value) => value !== number);
    } else if (values.length < max) {
      profile[field] = [...values, number].sort((a, b) => a - b);
    }
  } else if (action === "random-simple") {
    profile.main = sampleRange(20, 8);
    profile.extra = sampleRange(4, 1);
  } else if (action === "random-system") {
    profile.main = sampleRange(
      20,
      Math.min(20, Math.max(8, Number(profile.systemMainTarget) || 8)),
    );
    profile.extra = sampleRange(
      4,
      Math.min(4, Math.max(1, Number(profile.systemExtraTarget) || 1)),
    );
  } else if (action === "clear-ticket") {
    profile.main = [];
    profile.extra = [];
  } else if (action === "add-current-to-generator") {
    const combinations = systemCombinations(
      profile.main.length,
      profile.extra.length,
    );
    if (!combinations) {
      render();
      toast("Выберите минимум 8 основных и 1 дополнительное число", "error");
      return true;
    }
    const key = `${profile.main.join("-")}|${profile.extra.join("-")}`;
    const duplicate = profile.generatorResults.some(
      (row) => `${row.main.join("-")}|${row.extra.join("-")}` === key,
    );
    if (duplicate) {
      render();
      toast("Такая ставка уже есть в готовом наборе", "error");
      return true;
    }
    profile.generatorResults = [
      ...profile.generatorResults,
      {
        main: [...profile.main],
        extra: [...profile.extra],
        combinations,
      },
    ];
    profile.generatorCoverage = [
      ...new Set(profile.generatorResults.flatMap((row) => row.main)),
    ].sort((left, right) => left - right);
    profile.generatorWarnings = [];
    runtime.generatorArchiveAnalysis[state.gameKey] = null;
    runtime.ticketEvaluation[state.gameKey] = null;
  } else if (action === "clear-generator-results") {
    profile.generatorResults = [];
    profile.generatorCoverage = [];
    profile.generatorWarnings = [];
    runtime.generatorArchiveAnalysis[state.gameKey] = null;
    runtime.ticketEvaluation[state.gameKey] = null;
    runtime.selectedArchiveResultDay[state.gameKey] = "";
  } else if (action === "clear-generator-rules") {
    Object.assign(profile.generator, {
      requiredMain: "",
      requiredMainCount: "",
      excludedMain: "",
      excludedMainCount: "",
      priorityMain: "",
      requiredExtra: "",
      requiredExtraCount: "",
      excludedExtra: "",
      excludedExtraCount: "",
      evenMin: "",
      evenMax: "",
      lowerMin: "",
      lowerMax: "",
      maxOverlap: "",
      coverAll: false,
      seed: "",
    });
  } else if (action === "cycle-analysis-number") {
    const analysis = profile.analysis;
    const field = button.dataset.field;
    const number = Number(button.dataset.number);
    const collections =
      field === "extra"
        ? ["requiredExtra", "excludedExtra"]
        : ["priorityMain", "requiredMain", "excludedMain"];
    const current = analysisBallState(analysis, field, number);
    const order =
      field === "extra"
        ? ["neutral", "required", "excluded"]
        : ["neutral", "priority", "required", "excluded"];
    collections.forEach((key) => {
      analysis[key] = analysis[key].filter((value) => value !== number);
    });
    const next = order[(order.indexOf(current) + 1) % order.length];
    const targetKey = {
      priority: "priorityMain",
      required: field === "extra" ? "requiredExtra" : "requiredMain",
      excluded: field === "extra" ? "excludedExtra" : "excludedMain",
    }[next];
    if (targetKey) {
      analysis[targetKey] = [...analysis[targetKey], number].sort(
        (left, right) => left - right,
      );
    }
  } else if (action === "select-analysis-day") {
    profile.analysis.dailyDate = button.dataset.day;
  } else if (action === "select-analysis-section") {
    profile.analysis.section = button.dataset.section;
  } else if (action === "select-result-day") {
    runtime.selectedArchiveResultDay[state.gameKey] = button.dataset.day || "";
  } else if (action === "select-archive-year") {
    const year = button.dataset.year || "";
    const calendarYear = getArchiveCalendar().years.find(
      (item) => item.key === year,
    );
    const month = calendarYear?.months[0];
    const day = month?.days[0];
    runtime.archiveTree[state.gameKey].year = year;
    runtime.archiveTree[state.gameKey].month = month?.key || "";
    runtime.archiveTree[state.gameKey].day = day?.key || "";
    if (day) applyArchiveScopeSelection(profile, "day", day.key);
  } else if (action === "select-archive-month") {
    const month = button.dataset.month || "";
    const calendarMonth = getArchiveCalendar().years
      .flatMap((year) => year.months)
      .find((item) => item.key === month);
    const day = calendarMonth?.days[0];
    runtime.archiveTree[state.gameKey].year = button.dataset.year || month.slice(0, 4);
    runtime.archiveTree[state.gameKey].month = month;
    runtime.archiveTree[state.gameKey].day = day?.key || "";
    if (day) applyArchiveScopeSelection(profile, "day", day.key);
  } else if (action === "select-archive-day") {
    const day = button.dataset.day || "";
    runtime.archiveTree[state.gameKey].year = button.dataset.year || day.slice(0, 4);
    runtime.archiveTree[state.gameKey].month = button.dataset.month || day.slice(0, 7);
    applyArchiveScopeSelection(profile, "day", day);
  } else if (action === "select-archive-scope") {
    const type = ["all", "year", "month", "day"].includes(button.dataset.scope)
      ? button.dataset.scope
      : "all";
    const key = type === "all" ? "all" : button.dataset.key || "";
    applyArchiveScopeSelection(profile, type, key);
  } else if (action === "close-draw-result") {
    runtime.ticketEvaluation[state.gameKey] = null;
  } else if (action === "apply-draw-filters") {
    runtime.drawBrowser[state.gameKey].page = 1;
  } else if (action === "clear-draw-filters") {
    runtime.drawBrowser[state.gameKey] = {
      ...runtime.drawBrowser[state.gameKey],
      query: "",
      date: "",
      page: 1,
    };
  } else if (action === "archive-page") {
    runtime.drawBrowser[state.gameKey].page = Number(button.dataset.page) || 1;
  } else if (action === "strategy-history-page") {
    const layer = activeStrategyLayer(profile);
    strategyHistoryState(layer?.id).page = Number(button.dataset.page) || 1;
  } else if (action === "toggle-strategy-win") {
    const detailKey = button.dataset.resultKey || "";
    runtime.expandedStrategyDraw[state.gameKey] =
      runtime.expandedStrategyDraw[state.gameKey] === detailKey
        ? ""
        : detailKey;
  } else if (action === "open-strategy-win-draw") {
    const layer = activeStrategyLayer(profile);
    const entries = runtime.strategyResults[state.gameKey]?.[layer?.id]?.entries;
    const entryIndex = Number(button.dataset.entryIndex);
    if (!Array.isArray(entries) || !entries[entryIndex]) return true;
    const history = strategyHistoryState(layer?.id);
    history.page = Math.floor(entryIndex / Number(history.pageSize)) + 1;
    const detailKey = button.dataset.resultKey || "";
    runtime.expandedStrategyDraw[state.gameKey] = detailKey;
    requestAnimationFrame(() => {
      const target = [...document.querySelectorAll('[data-action="toggle-strategy-win"]')]
        .find((row) => row.dataset.resultKey === detailKey);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  } else if (action === "archive-draw-limit") {
    runtime.archiveTree[state.gameKey].drawLimit =
      Number(button.dataset.limit) === 24 ? 24 : 96;
  } else if (action === "open-archive-draw-check") {
    const draw = profile.draws.find(
      (row) => String(row.drawNum) === String(button.dataset.draw),
    );
    if (!draw || !profile.generatorResults.length) return true;
    profile.ticketsText = generatorToText(profile.generatorResults);
    profile.selectedDraw = draw.drawNum;
    runtime.ticketEvaluation[state.gameKey] = {
      draw,
      summary: evaluateTickets(
        profile.generatorResults,
        draw,
        profile.customPayouts,
        profile.price,
      ),
    };
    state.view = "workspace";
  } else if (action === "switch-strategy-layer") {
    profile.activeStrategyLayerId = Number(button.dataset.layer);
  } else {
    return false;
  }
  save();
  render();
  return true;
}

function runGenerator() {
  const profile = currentProfile();
  const generationSettings = {
    ...profile.generator,
    seed:
      String(profile.generator.seed || "").trim() ||
      (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`),
  };
  const result = generateTickets(
    generationSettings,
    profile.draws,
    getArchiveStats(),
  );
  profile.generatorResults = result.rows;
  profile.generatorWarnings = result.warnings;
  profile.generatorCoverage = result.coverage;
  runtime.generatorArchiveAnalysis[state.gameKey] = null;
  runtime.ticketEvaluation[state.gameKey] = null;
  runtime.selectedArchiveResultDay[state.gameKey] = "";
  save();
  render();
  toast(
    result.rows.length
      ? `Создано уникальных ставок: ${result.rows.length}`
      : "Не удалось создать ставки с такими ограничениями",
    result.rows.length ? "success" : "error",
  );
}

async function runGeneratorArchiveAnalysis() {
  const profile = currentProfile();
  if (!profile.generatorResults.length || !profile.draws.length) {
    toast("Сначала сгенерируйте ставки и загрузите архив", "error");
    return;
  }
  const scope = archiveScopeDetails(profile);
  const draws = scope.draws;
  if (!draws.length) {
    toast("В выбранном периоде нет тиражей", "error");
    return;
  }
  toast(
    `Проверяю ${profile.generatorResults.length} ставок по ${draws.length} тиражам…`,
  );
  await yieldToBrowser();
  const report = analyzeTicketsAgainstArchive(
    profile.generatorResults,
    draws,
    profile.customPayouts,
    profile.price,
  );
  report.scope = { type: scope.type, key: scope.key, label: scope.label };
  runtime.generatorArchiveAnalysis[state.gameKey] = report;
  runtime.selectedArchiveResultDay[state.gameKey] =
    report.dailyResults?.[0]?.key || "";
  runtime.ticketEvaluation[state.gameKey] = null;
  render();
  toast(
    `Готово: проверено ${report.ticketChecks} сочетаний «ставка × тираж»`,
    "success",
  );
}

function exportGenerator() {
  const profile = currentProfile();
  const rows = [
    "номер;основные;дополнительные;простых комбинаций",
    ...profile.generatorResults.map(
      (row, index) =>
        `${index + 1};${row.main.join(" ")};${row.extra.join(" ")};${row.combinations}`,
    ),
  ];
  download(`${state.gameKey}-generator.csv`, rows.join("\n"));
}

function evaluateCurrentTickets() {
  const profile = currentProfile();
  const parsed = parseTicketLines(profile.ticketsText);
  if (!parsed.tickets.length) {
    toast("Не найдено ни одной корректной ставки", "error");
    render();
    return;
  }
  const draw = profile.draws.find(
    (row) => String(row.drawNum) === String(profile.selectedDraw),
  );
  if (!draw) {
    toast("Сначала загрузите и выберите тираж", "error");
    return;
  }
  runtime.ticketEvaluation[state.gameKey] = {
    draw,
    summary: evaluateTickets(
      parsed.tickets,
      draw,
      profile.customPayouts,
      profile.price,
    ),
  };
  render();
  toast(`Проверено ставок: ${parsed.tickets.length}`, "success");
}

async function loadImportFile(file) {
  const profile = currentProfile();
  try {
    toast(`Читаю ${file.name}…`);
    await yieldToBrowser();
    const rows = parseTextArchive(await file.text());
    const report = validateImportedDraws(
      rows,
      profile.drawsAreDemo ? [] : profile.draws,
    );
    runtime.importPreview[state.gameKey] = {
      fileName: file.name,
      report,
    };
    render();
    toast(`Файл прочитан: корректных строк ${report.valid.length}`);
  } catch (error) {
    toast(error.message || "Не удалось прочитать файл", "error");
  }
}

async function confirmImport() {
  const profile = currentProfile();
  const preview = runtime.importPreview[state.gameKey];
  if (!preview?.report.valid.length) return;
  toast(`Добавляю ${preview.report.valid.length} тиражей…`);
  await yieldToBrowser();
  const existingDraws = profile.drawsAreDemo ? [] : profile.draws;
  profile.draws = mergeDrawArchives(
    existingDraws,
    preview.report.valid,
    profile.importMode,
  );
  profile.drawsUpdated = `Файл ${preview.fileName} · ${new Date().toLocaleString("ru-RU")}`;
  profile.drawsAreDemo = false;
  profile.archiveSeedFixVersion = 1;
  profile.selectedDraw = profile.draws[0]?.drawNum || "";
  runtime.drawBrowser[state.gameKey] = {
    ...runtime.drawBrowser[state.gameKey],
    query: "",
    date: "",
    page: 1,
  };
  runtime.importPreview[state.gameKey] = null;
  clearStrategyResults();
  invalidateArchiveCaches();
  activateLatestArchiveDay(profile);
  const stored = await persistDrawArchive();
  save();
  render();
  toast(
    stored
      ? `Импортировано тиражей: ${preview.report.valid.length}`
      : "Архив загружен, но браузеру не удалось сохранить его для следующего запуска",
    stored ? "success" : "error",
  );
}

async function clearDrawArchive() {
  const profile = currentProfile();
  const drawCount = profile.draws.length;
  if (!drawCount) return;
  runtime.archiveClearConfirm[state.gameKey] = false;
  profile.draws = [];
  profile.selectedDraw = "";
  profile.drawsUpdated = "Архив очищен пользователем";
  profile.drawsAreDemo = false;
  profile.archiveSeedFixVersion = 1;
  runtime.drawBrowser[state.gameKey] = {
    ...runtime.drawBrowser[state.gameKey],
    query: "",
    date: "",
    page: 1,
  };
  runtime.ticketEvaluation[state.gameKey] = null;
  clearStrategyResults();
  invalidateArchiveCaches();
  profile.generator.archiveScopeType = "all";
  profile.generator.archiveScopeKey = "all";
  runtime.archiveTree[state.gameKey] = {
    year: "",
    month: "",
    day: "",
    drawLimit: 96,
  };
  await persistDrawArchive();
  save();
  render();
  toast(`Архив «${currentGame().name}» очищен`, "success");
}

function exportDraws() {
  const padNumber = (number) => String(number).padStart(2, "0");
  const rows = [
    "номер тиража,дата тиража,поле1_1,поле1_2,поле1_3,поле1_4,поле1_5,поле1_6,поле1_7,поле1_8,поле2",
    ...currentProfile().draws.map(
      (draw) =>
        `${draw.drawNum},${formatArchiveDate(draw.date)},${draw.main
          .map(padNumber)
          .join(",")},${padNumber(draw.extra)}`,
    ),
  ];
  download(`${state.gameKey}-draws.csv`, rows.join("\n"));
}

function handleExtendedAction(action) {
  const profile = currentProfile();
  if (action === "generate") {
    runGenerator();
  } else if (action === "analyze-generator-archive") {
    runGeneratorArchiveAnalysis();
  } else if (action === "export-generator") {
    exportGenerator();
  } else if (action === "send-generator-to-checker" || action === "insert-generator") {
    profile.ticketsText = generatorToText(profile.generatorResults);
    state.view = "workspace";
    save();
    render();
  } else if (action === "evaluate-tickets") {
    evaluateCurrentTickets();
  } else if (action === "clear-checker") {
    profile.ticketsText = "";
    runtime.ticketEvaluation[state.gameKey] = null;
    save();
    render();
  } else if (action === "analysis-to-generator") {
    profile.generator.requiredMain = profile.analysis.requiredMain.join(" ");
    profile.generator.excludedMain = profile.analysis.excludedMain.join(" ");
    profile.generator.priorityMain = profile.analysis.priorityMain.join(" ");
    profile.generator.requiredExtra = profile.analysis.requiredExtra.join(" ");
    profile.generator.excludedExtra = profile.analysis.excludedExtra.join(" ");
    state.view = "workspace";
    save();
    render();
    toast("Метки анализа переданы в настройки генератора", "success");
  } else if (action === "analysis-clear") {
    profile.analysis = {
      ...profile.analysis,
      requiredMain: [],
      excludedMain: [],
      priorityMain: [],
      requiredExtra: [],
      excludedExtra: [],
    };
    save();
    render();
  } else if (action === "add-strategy-layer") {
    profile.strategyLayerCounter += 1;
    const layer = defaultStrategyLayer(profile.strategyLayerCounter);
    profile.strategyLayers.push(layer);
    profile.activeStrategyLayerId = layer.id;
    save();
    render();
  } else if (action === "delete-strategy-layer") {
    if (profile.strategyLayers.length <= 1) return;
    const layer = activeStrategyLayer(profile);
    profile.strategyLayers = profile.strategyLayers.filter(
      (item) => item.id !== layer.id,
    );
    delete runtime.strategyResults[state.gameKey][layer.id];
    profile.activeStrategyLayerId = profile.strategyLayers[0].id;
    save();
    render();
  } else if (action === "strategy-add-current") {
    const layer = activeStrategyLayer(profile);
    const row = `${profile.main.join(" ")} | ${profile.extra.join(" ")}`;
    layer.ticketsText = [layer.ticketsText.trim(), row]
      .filter(Boolean)
      .join("\n");
    delete runtime.strategyResults[state.gameKey][layer.id];
    save();
    render();
  } else if (action === "strategy-use-generator") {
    const layer = activeStrategyLayer(profile);
    layer.ticketsText = generatorToText(profile.generatorResults);
    delete runtime.strategyResults[state.gameKey][layer.id];
    save();
    render();
  } else if (action === "strategy-clear-tickets") {
    const layer = activeStrategyLayer(profile);
    layer.ticketsText = "";
    delete runtime.strategyResults[state.gameKey][layer.id];
    save();
    render();
  } else if (action === "run-strategies") {
    const results = {};
    const strategyScope = strategyArchiveScopeDetails(profile);
    profile.strategyLayers.forEach((layer) => {
      const parsed = parseTicketLines(layer.ticketsText);
      const result = runStrategyBacktest(
        parsed.tickets,
        strategyScope.draws,
        profile.customPayouts,
        profile.price,
        {
          ...layer,
          stopScope: strategyScope.type === "day" ? "scope" : "day",
        },
      );
      result.scopeLabel = strategyScope.label;
      result.scopeType = strategyScope.type;
      result.scopeKey = strategyScope.key;
      results[layer.id] = result;
    });
    runtime.strategyResults[state.gameKey] = results;
    runtime.strategyHistory[state.gameKey] = {};
    runtime.expandedStrategyDraw[state.gameKey] = "";
    render();
    const calculated = Object.values(results).filter(
      (result) => result.entries.length,
    ).length;
    toast(
      calculated
        ? `Рассчитано слоёв: ${calculated}`
        : "Добавьте корректные ставки хотя бы в один слой",
      calculated ? "success" : "error",
    );
  } else if (action === "choose-generator-ticket-file") {
    document.querySelector('[data-ticket-file="generator"]')?.click();
  } else if (action === "choose-strategy-ticket-file") {
    document.querySelector('[data-ticket-file="strategy"]')?.click();
  } else if (action === "choose-checker-ticket-file") {
    document.querySelector('[data-ticket-file="checker"]')?.click();
  } else if (action === "choose-import-file") {
    document.querySelector("#draw-file")?.click();
  } else if (action === "cancel-import") {
    runtime.importPreview[state.gameKey] = null;
    render();
  } else if (action === "confirm-import") {
    confirmImport();
  } else if (action === "export-draws") {
    exportDraws();
  } else if (action === "clear-draws") {
    if (!profile.draws.length) return;
    runtime.archiveClearConfirm[state.gameKey] = true;
    render();
  } else if (action === "cancel-clear-draws") {
    runtime.archiveClearConfirm[state.gameKey] = false;
    render();
  } else if (action === "confirm-clear-draws") {
    clearDrawArchive();
  } else if (action === "save-payouts") {
    profile.customPayouts = profile.payoutDraft.map(Number);
    profile.customMeta = {
      source: "Пользовательская версия",
      date: new Date().toLocaleString("ru-RU"),
    };
    clearStrategyResults();
    save();
    render();
    toast("Пользовательская таблица сохранена", "success");
  } else if (action === "discard-payout-draft") {
    profile.payoutDraft = [...profile.customPayouts];
    render();
  } else if (action === "restore-base-payouts") {
    profile.customPayouts = [...profile.sitePayouts];
    profile.payoutDraft = [...profile.sitePayouts];
    profile.customMeta = {
      source: "Применены базовые выплаты",
      date: new Date().toLocaleString("ru-RU"),
    };
    clearStrategyResults();
    save();
    render();
    toast("Пользовательская версия заменена базовыми выплатами", "success");
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled) return;
  event.preventDefault();
  const action = button.dataset.action;
  if (handleSimpleAction(action, button)) return;
  handleExtendedAction(action);
});

document.addEventListener("pointerover", (event) => {
  const anchor = event.target.closest?.(".help-tip");
  if (anchor) showFloatingHelpTip(anchor);
});

document.addEventListener("pointerout", (event) => {
  const anchor = event.target.closest?.(".help-tip");
  if (anchor && !anchor.contains(event.relatedTarget)) hideFloatingHelpTip(anchor);
});

document.addEventListener("focusin", (event) => {
  const anchor = event.target.closest?.(".help-tip");
  if (anchor) showFloatingHelpTip(anchor);
});

document.addEventListener("focusout", (event) => {
  const anchor = event.target.closest?.(".help-tip");
  if (anchor && !anchor.contains(event.relatedTarget)) hideFloatingHelpTip(anchor);
});

window.addEventListener("resize", () => {
  if (activeHelpAnchor) positionFloatingHelpTip(activeHelpAnchor);
});

document.addEventListener(
  "scroll",
  () => {
    if (activeHelpAnchor) positionFloatingHelpTip(activeHelpAnchor);
  },
  true,
);

document.addEventListener("input", (event) => {
  const profile = currentProfile();
  const target = event.target;
  if (target.matches("[data-draw-filter]")) {
    const field = target.dataset.drawFilter;
    runtime.drawBrowser[state.gameKey][field] =
      field === "pageSize" ? Number(target.value) : target.value;
    if (field !== "query") runtime.drawBrowser[state.gameKey].page = 1;
    return;
  }
  if (target.matches("[data-generator]")) {
    const field = target.dataset.generator;
    profile.generator[field] =
      target.type === "checkbox"
        ? target.checked
        : target.type === "number"
          ? target.value === ""
            ? ""
            : Number(target.value)
          : target.value;
    save();
    return;
  }
  if (target.matches("[data-analysis]")) {
    profile.analysis[target.dataset.analysis] = target.value;
    save();
    return;
  }
  if (target.matches("[data-strategy-scope]")) {
    const field = target.dataset.strategyScope;
    if (field === "type") {
      profile.strategyArchiveScopeType = target.value;
      profile.strategyArchiveScopeKey = "";
    } else {
      profile.strategyArchiveScopeKey = target.value;
    }
    clearStrategyResults();
    save();
    render();
    return;
  }
  if (target.matches("[data-strategy]")) {
    const layer = activeStrategyLayer(profile);
    const field = target.dataset.strategy;
    const numericFields = new Set([
      "step",
      "baseCopies",
      "maxCopies",
      "budget",
      "discountPercent",
      "categoryIndex",
    ]);
    const fieldValue =
      target.type === "checkbox"
        ? target.checked
        : numericFields.has(field)
          ? Number(target.value)
          : target.value;
    layer[field] =
      field === "discountPercent"
        ? Math.min(100, Math.max(0, Number(fieldValue) || 0))
        : fieldValue;
    if (field === "trigger" && fieldValue === "exclude_winners") {
      layer.stopOnWin = false;
    }
    delete runtime.strategyResults[state.gameKey][layer.id];
    save();
    return;
  }
  if (target.matches("[data-payout-index]")) {
    profile.payoutDraft[Number(target.dataset.payoutIndex)] = Number(target.value);
    save();
    const saveButton = document.querySelector('[data-action="save-payouts"]');
    const discardButton = document.querySelector(
      '[data-action="discard-payout-draft"]',
    );
    if (saveButton) saveButton.disabled = false;
    if (discardButton) discardButton.disabled = false;
    return;
  }
  if (!target.matches("[data-input]")) return;
  const field = target.dataset.input;
  const value =
    target.type === "number" || field === "scenarioIndex"
      ? Number(target.value)
      : target.value;
  profile[field] = value;
  if (field === "price") {
    runtime.generatorArchiveAnalysis[state.gameKey] = null;
  }
  save();
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target.matches("[data-strategy-history-size]")) {
    const layer = activeStrategyLayer();
    const history = strategyHistoryState(layer?.id);
    const requestedSize = Number(target.value);
    history.pageSize = STRATEGY_HISTORY_PAGE_SIZES.includes(requestedSize)
      ? requestedSize
      : 120;
    history.page = 1;
    render();
    return;
  }
  if (target.id === "draw-file" && target.files?.[0]) {
    loadImportFile(target.files[0]);
    target.value = "";
    return;
  }
  if (target.matches("[data-ticket-file]") && target.files?.[0]) {
    loadTicketFile(target.files[0], target.dataset.ticketFile);
    target.value = "";
    return;
  }
  if (
    target.matches(
      "[data-input], [data-generator], [data-analysis], [data-strategy], [data-strategy-scope], [data-payout-index], [data-draw-filter]",
    )
  ) {
    if (target.dataset.input === "selectedDraw") {
      runtime.ticketEvaluation[state.gameKey] = null;
    }
    render();
  }
});

document.addEventListener(
  "toggle",
  (event) => {
    const details = event.target.closest?.("[data-details]");
    if (!details) return;
    runtime.openDetails[state.gameKey][details.dataset.details] = details.open;
  },
  true,
);

render();
initialiseDrawArchives().finally(() => render());
