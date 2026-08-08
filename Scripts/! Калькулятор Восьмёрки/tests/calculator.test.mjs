import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyzeTicketPortfolio,
  analyzeTicketsAgainstArchive,
  buildAdvancedArchiveAnalysis,
  buildArchiveCalendar,
  buildArchiveStats,
  buildDailyArchiveBreakdown,
  choose,
  estimateEconomics,
  evaluateSystemTicket,
  evaluateTickets,
  generateTickets,
  jackpotChance,
  mergeDrawArchives,
  normaliseHistoryResponse,
  normalisePayoutRules,
  parseTextArchive,
  parseTicketLines,
  runStrategyBacktest,
  selectDrawsByArchiveScope,
  systemCombinations,
  validateImportedDraws,
} from "../public/lottery-core.js";

const sampleDraws = [
  {
    drawNum: "103",
    date: "2026-08-06",
    main: [1, 2, 3, 4, 5, 6, 7, 8],
    extra: 1,
  },
  {
    drawNum: "102",
    date: "2026-08-05",
    main: [1, 2, 3, 9, 10, 11, 12, 13],
    extra: 2,
  },
  {
    drawNum: "101",
    date: "2026-08-04",
    main: [1, 2, 4, 10, 14, 15, 16, 17],
    extra: 3,
  },
];

test("calculates systems, odds and economics", () => {
  assert.equal(choose(20, 8), 125_970);
  assert.equal(systemCombinations(8, 1), 1);
  assert.equal(systemCombinations(9, 2), 18);
  assert.equal(systemCombinations(10, 4), 180);
  assert.equal(systemCombinations(7, 1), 0);
  assert.equal(jackpotChance(8, 1), 1 / 503_880);
  assert.deepEqual(estimateEconomics(18, 250, 25_000, 1), {
    cost: 4_500,
    gross: 25_000,
    profit: 20_500,
    roi: (20_500 / 4_500) * 100,
    breakEven: 1,
  });
});

test("generates deterministic unique tickets with constraints and coverage", () => {
  const settings = {
    count: 12,
    mainCount: 8,
    extraCount: 1,
    requiredMain: "3",
    excludedMain: "20",
    requiredExtra: "",
    excludedExtra: "",
    evenMin: 3,
    evenMax: 5,
    lowerMin: 3,
    lowerMax: 5,
    maxOverlap: 8,
    coverAll: true,
    strategy: "mixed",
    seed: "repeatable-seed",
  };
  const first = generateTickets(settings, sampleDraws);
  const second = generateTickets(settings, sampleDraws);
  assert.deepEqual(first.rows, second.rows);
  assert.equal(first.rows.length, 12);
  assert.equal(new Set(first.rows.map((row) => `${row.main}|${row.extra}`)).size, 12);
  assert.ok(first.rows.every((row) => row.main.includes(3)));
  assert.ok(first.rows.every((row) => !row.main.includes(20)));
  assert.ok(
    first.rows.every((row) => {
      const even = row.main.filter((number) => number % 2 === 0).length;
      const lower = row.main.filter((number) => number <= 10).length;
      return even >= 3 && even <= 5 && lower >= 3 && lower <= 5;
    }),
  );
  assert.equal(first.coverage.length, 19);
});

test("keeps every mandatory number when the include count is empty", () => {
  const result = generateTickets(
    {
      count: 20,
      mainCount: 8,
      extraCount: 1,
      requiredMain: "1 2 3",
      requiredMainCount: "",
      excludedMain: "18 19 20",
      excludedMainCount: "",
      requiredExtra: "",
      excludedExtra: "",
      evenMin: "",
      evenMax: "",
      lowerMin: "",
      lowerMax: "",
      maxOverlap: "",
      coverAll: false,
      strategy: "random",
      seed: "strict-mandatory",
    },
    sampleDraws,
  );
  assert.equal(result.rows.length, 20);
  assert.ok(
    result.rows.every(
      (row) =>
        [1, 2, 3].every((number) => row.main.includes(number)) &&
        [18, 19, 20].every((number) => !row.main.includes(number)),
    ),
  );
});

test("takes an exact random amount from include and exclude pools", () => {
  const includePool = [1, 2, 3, 4, 5, 6, 7, 8];
  const result = generateTickets(
    {
      count: 30,
      mainCount: 8,
      extraCount: 2,
      requiredMain: includePool.join(" "),
      requiredMainCount: 4,
      excludedMain: "13 14 15 16 17 18 19 20",
      excludedMainCount: 4,
      requiredExtra: "1 2 3 4",
      requiredExtraCount: 2,
      excludedExtra: "",
      excludedExtraCount: "",
      evenMin: "",
      evenMax: "",
      lowerMin: "",
      lowerMax: "",
      maxOverlap: "",
      coverAll: false,
      strategy: "random",
      seed: "pool-counts",
    },
    sampleDraws,
  );
  assert.equal(result.rows.length, 30);
  assert.ok(
    result.rows.every((row) => {
      const includedFromPool = row.main.filter((number) =>
        includePool.includes(number),
      );
      return (
        includedFromPool.length === 4 &&
        row.appliedRules.includedMain.length === 4 &&
        row.appliedRules.excludedMain.length === 4 &&
        row.appliedRules.excludedMain.every(
          (number) => !row.main.includes(number),
        ) &&
        row.extra.length === 2 &&
        row.appliedRules.includedExtra.length === 2 &&
        row.extra.every((number) =>
          row.appliedRules.includedExtra.includes(number),
        )
      );
    }),
  );
});

test("does not apply optional generator filters when their fields are empty", () => {
  const result = generateTickets(
    {
      count: 2,
      mainCount: 20,
      extraCount: 1,
      requiredMain: "",
      excludedMain: "",
      priorityMain: "",
      requiredExtra: "",
      excludedExtra: "",
      evenMin: "",
      evenMax: "",
      lowerMin: "",
      lowerMax: "",
      maxOverlap: "",
      coverAll: false,
      strategy: "random",
      seed: "empty-filters",
    },
    sampleDraws,
  );
  assert.equal(result.rows.length, 2);
  assert.ok(result.rows.every((row) => row.main.length === 20));
  assert.equal(new Set(result.rows.map((row) => row.extra.join("-"))).size, 2);
});

test("builds frequency, overdue, pair and triple statistics", () => {
  const stats = buildArchiveStats(sampleDraws);
  assert.equal(stats.drawCount, 3);
  assert.equal(stats.frequency[1], 3);
  assert.equal(stats.frequency[20], 0);
  assert.deepEqual(stats.hot.slice(0, 2).sort((a, b) => a - b), [1, 2]);
  assert.ok(stats.overdueNumbers.includes(20));
  assert.ok(stats.topPairs.some((pair) => pair.numbers.join("-") === "1-2"));
  assert.ok(stats.topTriples.length > 0);
});

test("builds windowed trends, gaps and distribution analysis", () => {
  const analysis = buildAdvancedArchiveAnalysis(sampleDraws, 2);
  assert.equal(analysis.drawCount, 2);
  assert.equal(analysis.previousDrawCount, 1);
  assert.equal(analysis.frequency[1], 2);
  assert.equal(analysis.mainGaps.current[20], 2);
  assert.ok(analysis.mainGaps.maximum[20] >= 2);
  assert.equal(analysis.cooccurrence["1-2"], 2);
  assert.equal(analysis.distribution.averageEven, 3.5);
});

test("groups archive statistics by calendar day", () => {
  const breakdown = buildDailyArchiveBreakdown([
    ...sampleDraws,
    {
      drawNum: "100",
      date: "06.08.2026",
      main: [1, 3, 5, 7, 9, 11, 13, 15],
      extra: 4,
    },
  ]);
  assert.equal(breakdown.dayCount, 3);
  assert.equal(breakdown.days[0].key, "2026-08-06");
  assert.equal(breakdown.days[0].drawCount, 2);
  assert.equal(breakdown.days[0].frequency[1], 2);
  assert.equal(breakdown.days[0].extraFrequency[4], 1);

  const ordered = buildAdvancedArchiveAnalysis(
    [
      { ...sampleDraws[0], drawNum: "1", date: "31.07.2026" },
      { ...sampleDraws[1], drawNum: "2", date: "01.08.2026" },
    ],
    "all",
  );
  assert.equal(ordered.draws[0].drawNum, "2");
});

test("builds a year, month and day archive calendar", () => {
  const draws = [
    ...sampleDraws,
    {
      drawNum: "099",
      date: "31.12.2025",
      main: [2, 4, 6, 8, 10, 12, 14, 16],
      extra: 4,
    },
    {
      drawNum: "098",
      date: "",
      main: [1, 3, 5, 7, 9, 11, 13, 15],
      extra: 2,
    },
  ];
  const calendar = buildArchiveCalendar(draws);
  assert.equal(calendar.yearCount, 2);
  assert.equal(calendar.monthCount, 2);
  assert.equal(calendar.dayCount, 4);
  assert.equal(calendar.undatedCount, 1);
  assert.equal(calendar.years[0].key, "2026");
  assert.equal(calendar.years[0].months[0].key, "2026-08");
  assert.equal(calendar.years[0].months[0].days.length, 3);
  assert.equal(selectDrawsByArchiveScope(draws, "year", "2026").length, 3);
  assert.equal(selectDrawsByArchiveScope(draws, "month", "2026-08").length, 3);
  assert.equal(selectDrawsByArchiveScope(draws, "day", "2026-08-06").length, 1);
});

test("analyses coverage, duplicates and overlap of a ticket portfolio", () => {
  const tickets = [
    { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] },
    { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] },
    { main: [9, 10, 11, 12, 13, 14, 15, 16], extra: [2] },
  ];
  const portfolio = analyzeTicketPortfolio(tickets);
  assert.equal(portfolio.ticketCount, 3);
  assert.equal(portfolio.coveredMain.length, 16);
  assert.equal(portfolio.coveredExtra.length, 2);
  assert.equal(portfolio.duplicateCount, 1);
  assert.equal(portfolio.maxOverlap, 8);
  assert.ok(portfolio.pairCoverage > 0);
});

test("runs an archive strategy with automatic add step and reset trigger", () => {
  const ticket = { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] };
  const draws = [
    {
      drawNum: "003",
      date: "2026-08-03",
      main: [1, 2, 3, 4, 5, 6, 7, 8],
      extra: 1,
    },
    {
      drawNum: "002",
      date: "2026-08-02",
      main: [9, 10, 11, 12, 13, 14, 15, 16],
      extra: 2,
    },
    {
      drawNum: "001",
      date: "2026-08-01",
      main: [9, 10, 11, 12, 13, 14, 15, 16],
      extra: 2,
    },
  ];
  const result = runStrategyBacktest(
    [ticket],
    draws,
    [1_000, 0, 0, 0, 0, 0, 0, 0, 0],
    100,
    {
      mode: "real",
      baseCopies: 1,
      rule: "add",
      step: 1,
      maxCopies: 10,
      resetOnWin: true,
      trigger: "any",
    },
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.copies),
    [1, 2, 3],
  );
  assert.equal(result.totalCost, 600);
  assert.equal(result.totalPrize, 3_000);
  assert.equal(result.profit, 2_400);
  assert.equal(result.startingBalance, 600);
  assert.equal(result.endingBalance, 3_000);
  assert.deepEqual(
    result.entries.map((entry) => entry.balance),
    [500, 300, 3_000],
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.netBalance),
    [-100, -300, 2_400],
  );
  assert.equal(result.maxCopiesUsed, 3);
});

test("checks every simple combination inside an expanded ticket", () => {
  const payouts = [5_000_000, 500_000, 25_000, 5_000, 2_000, 1_250, 800, 750, 750];
  const ticket = {
    main: [1, 2, 3, 4, 5, 6, 7, 8, 9],
    extra: [1, 2],
  };
  const result = evaluateSystemTicket(ticket, sampleDraws[0], payouts);
  assert.equal(result.combinations, 18);
  assert.equal(result.mainMatches, 8);
  assert.equal(result.extraMatched, true);
  assert.equal(result.breakdown.find((row) => row.category === "8 + 1").count, 1);
  assert.equal(result.breakdown.find((row) => row.category === "8 + 0").count, 1);
  assert.equal(result.breakdown.find((row) => row.category === "7 + 1").count, 8);
  assert.equal(result.breakdown.find((row) => row.category === "7 + 0").count, 8);
  assert.equal(
    result.prize,
    5_000_000 + 500_000 + 8 * 25_000 + 8 * 5_000,
  );

  const summary = evaluateTickets([ticket], sampleDraws[0], payouts, 250);
  assert.equal(summary.cost, 18 * 250);
  assert.equal(summary.prize, result.prize);
});

test("analyses generated tickets against the complete archive", () => {
  const tickets = [
    { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] },
  ];
  const report = analyzeTicketsAgainstArchive(
    tickets,
    sampleDraws,
    [5_000_000, 500_000, 25_000, 5_000, 2_000, 1_250, 800, 750, 750],
    250,
  );
  assert.equal(report.drawCount, 3);
  assert.equal(report.ticketChecks, 3);
  assert.equal(report.combinationsPerDraw, 1);
  assert.equal(report.totalCost, 750);
  assert.equal(report.winningDrawCount, 1);
  assert.equal(report.categoryTotals[0].count, 1);
  assert.equal(report.totalPrize, 5_000_000);
  assert.equal(report.bestDraws[0].drawNum, "103");
  assert.equal(report.dailyResults.length, 3);
  assert.equal(report.dailyResults[0].key, "2026-08-06");
  assert.equal(report.dailyResults[0].totalPrize, 5_000_000);
  assert.equal(report.drawResults.length, 3);
});

test("archive analysis matches direct evaluation for expanded tickets", () => {
  const payouts = [5_000_000, 500_000, 25_000, 5_000, 2_000, 1_250, 800, 750, 750];
  const tickets = [
    {
      main: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      extra: [1, 2],
    },
  ];
  const report = analyzeTicketsAgainstArchive(
    tickets,
    sampleDraws,
    payouts,
    250,
  );
  const directPrize = sampleDraws.reduce(
    (sum, draw) => sum + evaluateTickets(tickets, draw, payouts, 250).prize,
    0,
  );
  assert.equal(report.combinationsPerDraw, 18);
  assert.equal(report.totalPrize, directPrize);
  assert.equal(
    report.categoryTotals.reduce((sum, row) => sum + row.total, 0),
    directPrize,
  );
});

test("parses simple, expanded and exported ticket rows", () => {
  const parsed = parseTicketLines(
    "1 2 3 4 5 6 7 8 | 4\n2;1 2 3 4 5 6 7 8 9;1 2;18\nbad row",
  );
  assert.equal(parsed.tickets.length, 2);
  assert.equal(parsed.tickets[0].combinations, 1);
  assert.equal(parsed.tickets[1].combinations, 18);
  assert.equal(parsed.errors.length, 1);
});

test("validates draw imports, duplicates, gaps and merge modes", () => {
  const rows = [
    { drawNum: "101", date: "", main: [1, 2, 3, 4, 5, 6, 7, 8], extra: 1 },
    { drawNum: "103", date: "", main: [2, 3, 4, 5, 6, 7, 8, 9], extra: 2 },
    { drawNum: "103", date: "", main: [3, 4, 5, 6, 7, 8, 9, 10], extra: 3 },
    { drawNum: "104", date: "", main: [1, 1, 2, 3, 4, 5, 6, 7], extra: 9 },
  ];
  const report = validateImportedDraws(rows, sampleDraws);
  assert.equal(report.valid.length, 2);
  assert.equal(report.duplicates.length, 3);
  assert.equal(report.errors.length, 1);
  assert.equal(report.gaps[0].missing, 1);
  assert.equal(mergeDrawArchives(sampleDraws, report.valid, "add").length, 3);
  assert.equal(mergeDrawArchives(sampleDraws, report.valid, "replace").length, 2);
});

test("normalises NLOTO history, file archives and payout rules", () => {
  const history = normaliseHistoryResponse({
    content: [
      {
        drawNum: "001",
        drawDate: "2026-08-06T12:00:00",
        winningCombination: [[1, 2, 3, 4, 5, 6, 7, 8], [4]],
      },
    ],
  });
  assert.equal(history.length, 1);
  assert.equal(history[0].extra, 4);

  const csvRows = parseTextArchive(
    "тираж;дата;числа;джекпот\n071493;2026-08-06;1 2 3 4 5 6 7 8 4;5000000",
  );
  assert.equal(csvRows.length, 1);
  assert.deepEqual(csvRows[0].main, [1, 2, 3, 4, 5, 6, 7, 8]);

  const columnCsvRows = parseTextArchive(
    "58255,20.03.2026,18,20,08,02,13,16,05,04,02",
  );
  assert.deepEqual(columnCsvRows, [
    {
      drawNum: "58255",
      date: "20.03.2026",
      main: [18, 20, 8, 2, 13, 16, 5, 4],
      extra: 2,
      jackpot: 0,
    },
  ]);

  const columnTxtRows = parseTextArchive(
    "58254 19.03.2026 01 03 05 07 09 11 13 15 04",
  );
  assert.deepEqual(columnTxtRows, [
    {
      drawNum: "58254",
      date: "19.03.2026",
      main: [1, 3, 5, 7, 9, 11, 13, 15],
      extra: 4,
      jackpot: 0,
    },
  ]);

  const rules = normalisePayoutRules({
    data: [
      {
        drawNum: "071493",
        basePrice: 250,
        drawRuleInfo: Array.from({ length: 9 }, (_, index) => ({
          order: index + 1,
          fixedPrize: index === 0 ? 5_000_000 : 1_000 - index,
        })),
      },
    ],
  });
  assert.equal(rules.drawNum, "071493");
  assert.equal(rules.price, 250);
  assert.equal(rules.payouts.length, 9);
});

test("imports the requested column format from a TXT archive", async () => {
  const text = await readFile(
    new URL("./fixtures/archive-columns.txt", import.meta.url),
    "utf8",
  );
  const rows = parseTextArchive(text);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].drawNum, "58255");
  assert.deepEqual(rows[0].main, [18, 20, 8, 2, 13, 16, 5, 4]);
  assert.equal(rows[0].extra, 2);
  assert.equal(rows[1].drawNum, "58254");
  assert.equal(rows[1].extra, 4);
});

test("build contains every version-three surface and visual asset", async () => {
  const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
  const script = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
  const styles = await readFile(new URL("../dist/styles.css", import.meta.url), "utf8");
  const launcher = await readFile(
    new URL("../../! Калькулятор Восьмерки.html", import.meta.url),
    "utf8",
  );
  assert.match(html, /стратегии v3/i);
  assert.match(script, /Продвинутый комбогенератор/);
  assert.match(script, /Цветовая карта чисел/);
  assert.match(script, /Слои стратегий/);
  assert.match(script, /Рассчитать все слои по архиву/);
  assert.match(script, /data-strategy-scope/);
  assert.match(script, /Какой именно период/);
  assert.match(script, /Начальный баланс/);
  assert.match(script, /Старт периода/);
  assert.match(script, /data-strategy-history-size/);
  assert.match(script, /strategy-history-page/);
  assert.match(script, /Тиражей на странице/);
  assert.match(script, /clear-generator-rules/);
  assert.match(script, /archive-clear-btn/);
  assert.match(script, /confirm-clear-draws/);
  assert.match(script, /cancel-clear-draws/);
  assert.doesNotMatch(script, /window\.confirm/);
  assert.match(script, /Очистить все/);
  assert.match(script, /requiredMainCount/);
  assert.match(script, /excludedMainCount/);
  assert.match(script, /Сколько включать 1–20/);
  assert.match(script, /Сколько исключать 1–20/);
  assert.match(script, /Если поле пустое, этот фильтр не применяется/);
  assert.match(script, /stripBundledDemoDraws/);
  assert.match(script, /drawsAreDemo/);
  assert.match(script, /Проверка билетов/);
  assert.match(script, /Предварительный просмотр/);
  assert.match(script, /Вернуть данные сайта/);
  assert.match(script, /Найдено:/);
  assert.match(script, /Простой выбор режима/);
  assert.match(script, /Дополнительные правила/);
  assert.match(script, /Итоговая стоимость/);
  assert.match(script, /Ставки и расчёт/);
  assert.match(script, /Один экран вместо трёх вкладок/);
  assert.match(script, /Рассчитать:/);
  assert.match(script, /Архив по годам, месяцам и дням/);
  assert.match(script, /Тиражи за/);
  assert.match(script, /select-archive-day/);
  assert.match(script, /select-archive-year/);
  assert.match(script, /select-archive-month/);
  assert.match(script, /Все годы видны сразу/);
  assert.match(script, /96 · весь день/);
  assert.match(script, /Рассчитать месяц/);
  assert.match(script, /activateLatestArchiveDay/);
  assert.match(script, /Результат по дням/);
  assert.match(script, /Подсказка:/);
  assert.match(styles, /body\[data-theme="super8"\]/);
  assert.match(styles, /body\[data-theme="v8"\]/);
  assert.match(styles, /\.workbench-columns/);
  assert.match(styles, /\.fortune-day-tabs/);
  assert.match(styles, /\.fortune-month-tabs/);
  assert.match(styles, /max-height: none/);
  assert.match(styles, /\.fortune-draw-grid/);
  assert.match(styles, /\.help-tip-text/);
  assert.match(styles, /\.help-tip-text\.visible/);
  assert.match(styles, /\.strategy-period-controls/);
  assert.match(styles, /\.strategy-history-tools/);
  assert.match(styles, /\.generator-rules-toolbar/);
  assert.match(launcher, /Калькулятор Восьмёрки/);
  assert.match(launcher, /\.\/! Калькулятор Восьмёрки\/public\/index\.html/);
  await access(new URL("../dist/_worker.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
  await access(new URL("../dist/og-v3.png", import.meta.url));
  await access(new URL("../dist/assets/hero-big8.png", import.meta.url));
  await access(new URL("../dist/assets/hero-super8.png", import.meta.url));
  await access(new URL("../dist/assets/hero-v8.png", import.meta.url));
});
