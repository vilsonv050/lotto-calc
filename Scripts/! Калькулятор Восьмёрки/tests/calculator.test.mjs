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
  parseTicketFile,
  parseTicketLines,
  runStrategyBacktest,
  selectDrawsByArchiveScope,
  summarizeStrategyWins,
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
  assert.equal(result.totalGrossCost, 600);
  assert.equal(result.totalDiscount, 0);
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
  const winningEntry = result.entries.find((entry) => entry.prize > 0);
  assert.deepEqual(winningEntry.drawMain, ticket.main);
  assert.equal(winningEntry.drawExtra, 1);
  assert.equal(winningEntry.winningTickets.length, 1);
  assert.deepEqual(winningEntry.winningTickets[0].ticket.main, ticket.main);
  assert.deepEqual(winningEntry.winningTickets[0].ticket.extra, ticket.extra);
  assert.equal(winningEntry.winningTickets[0].copies, 3);
  assert.equal(winningEntry.winningTickets[0].prizePerCopy, 1_000);
  assert.equal(winningEntry.winningTickets[0].totalPrize, 3_000);
  assert.equal(winningEntry.winningTickets[0].breakdown[0].category, "8 + 1");
  assert.equal(winningEntry.winningTickets[0].breakdown[0].count, 1);
});

test("applies a purchase discount to every strategy ticket", () => {
  const ticket = { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] };
  const losingMain = [9, 10, 11, 12, 13, 14, 15, 16];
  const draws = [
    { drawNum: "002", date: "2026-08-01", main: ticket.main, extra: 1 },
    { drawNum: "001", date: "2026-08-01", main: losingMain, extra: 2 },
  ];
  const result = runStrategyBacktest(
    [ticket],
    draws,
    [1_000, 0, 0, 0, 0, 0, 0, 0, 0],
    250,
    {
      mode: "real",
      baseCopies: 1,
      rule: "add",
      step: 1,
      maxCopies: 10,
      resetOnWin: true,
      trigger: "any",
      discountPercent: 20,
    },
  );

  assert.equal(result.settings.discountPercent, 20);
  assert.deepEqual(
    result.entries.map((entry) => entry.grossCost),
    [250, 500],
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.discountAmount),
    [50, 100],
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.cost),
    [200, 400],
  );
  assert.equal(result.totalGrossCost, 750);
  assert.equal(result.totalDiscount, 150);
  assert.equal(result.totalCost, 600);
  assert.equal(result.totalPrize, 2_000);
  assert.equal(result.profit, 1_400);
  assert.equal(result.startingBalance, 600);
  assert.equal(result.endingBalance, 2_000);
});

test("summarizes winning categories and keeps every major winning draw", () => {
  const statistics = summarizeStrategyWins([
    {
      drawNum: "100",
      date: "2026-08-01",
      winningTickets: [
        {
          copies: 2,
          breakdown: [
            { category: "8 + 1", count: 1, total: 5_000_000 },
          ],
        },
        {
          copies: 1,
          breakdown: [
            { category: "8 + 1", count: 1, total: 5_000_000 },
          ],
        },
      ],
    },
    {
      drawNum: "101",
      date: "2026-08-02",
      winningTickets: [
        {
          copies: 3,
          breakdown: [
            { category: "8 + 0", count: 2, total: 1_000_000 },
          ],
        },
      ],
    },
    {
      drawNum: "102",
      date: "2026-08-03",
      winningTickets: [
        {
          copies: 1,
          breakdown: [
            { category: "8 + 1", count: 1, total: 5_000_000 },
          ],
        },
      ],
    },
  ]);

  const jackpot = statistics.find((row) => row.category === "8 + 1");
  assert.equal(jackpot.drawCount, 2);
  assert.equal(jackpot.ticketCount, 3);
  assert.equal(jackpot.combinations, 3);
  assert.equal(jackpot.paidCombinations, 4);
  assert.equal(jackpot.prize, 20_000_000);
  assert.deepEqual(
    jackpot.draws.map((draw) => draw.drawNum),
    ["100", "102"],
  );
  assert.equal(jackpot.draws[0].ticketCount, 2);

  const eightWithoutExtra = statistics.find(
    (row) => row.category === "8 + 0",
  );
  assert.equal(eightWithoutExtra.drawCount, 1);
  assert.equal(eightWithoutExtra.combinations, 2);
  assert.equal(eightWithoutExtra.paidCombinations, 6);
  assert.equal(eightWithoutExtra.prize, 3_000_000);
});

test("excludes winning tickets for exactly one following draw", () => {
  const ticketA = { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] };
  const ticketB = { main: [9, 10, 11, 12, 13, 14, 15, 16], extra: [2] };
  const ticketC = { main: [13, 14, 15, 16, 17, 18, 19, 20], extra: [3] };
  const tickets = [
    ...Array.from({ length: 3 }, () => ({ ...ticketA })),
    ...Array.from({ length: 5 }, () => ({ ...ticketB })),
    ...Array.from({ length: 33 }, () => ({ ...ticketC })),
  ];
  const draws = [
    { drawNum: "003", date: "2026-08-03", main: ticketA.main, extra: 1 },
    { drawNum: "002", date: "2026-08-02", main: ticketB.main, extra: 2 },
    { drawNum: "001", date: "2026-08-01", main: ticketA.main, extra: 1 },
  ];

  const result = runStrategyBacktest(
    tickets,
    draws,
    [1_000, 0, 0, 0, 0, 0, 0, 0, 0],
    100,
    {
      mode: "real",
      baseCopies: 1,
      rule: "add",
      step: 1,
      resetOnWin: true,
      stopOnWin: true,
      trigger: "exclude_winners",
    },
  );

  assert.equal(result.settings.trigger, "exclude_winners");
  assert.equal(result.settings.stopOnWin, false);
  assert.deepEqual(
    result.entries.map((entry) => entry.purchasedTickets),
    [41, 38, 36],
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.excludedTicketIndexes),
    [[], [1, 2, 3], [4, 5, 6, 7, 8]],
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.nextExcludedTicketIndexes),
    [[1, 2, 3], [4, 5, 6, 7, 8], [1, 2, 3]],
  );
  assert.deepEqual(
    result.entries.map((entry) =>
      entry.winningTickets.map((ticket) => ticket.index),
    ),
    [[1, 2, 3], [4, 5, 6, 7, 8], [1, 2, 3]],
  );
  assert.equal(result.totalExcludedTickets, 8);
  assert.equal(result.maxExcludedTickets, 5);
  assert.equal(result.totalCost, 11_500);
  assert.equal(result.totalPrize, 11_000);
  assert.equal(result.skippedDrawCount, 0);
});

test("continues a monthly strategy after each daily stop", () => {
  const ticket = { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] };
  const losingMain = [9, 10, 11, 12, 13, 14, 15, 16];
  const draws = [
    { drawNum: "004", date: "2026-08-02", main: losingMain, extra: 2 },
    { drawNum: "003", date: "2026-08-02", main: ticket.main, extra: 1 },
    { drawNum: "002", date: "2026-08-01", main: losingMain, extra: 2 },
    { drawNum: "001", date: "2026-08-01", main: ticket.main, extra: 1 },
  ];
  const result = runStrategyBacktest(
    [ticket],
    draws,
    [1_000, 0, 0, 0, 0, 0, 0, 0, 0],
    100,
    {
      mode: "real",
      baseCopies: 1,
      stopOnWin: true,
      trigger: "any",
      stopScope: "day",
    },
  );

  assert.deepEqual(
    result.entries.filter((entry) => !entry.skipped).map((entry) => entry.drawNum),
    ["001", "003"],
  );
  assert.deepEqual(
    result.entries.filter((entry) => entry.skipped).map((entry) => entry.drawNum),
    ["002", "004"],
  );
  assert.equal(result.totalCost, 200);
  assert.equal(result.totalPrize, 2_000);
  assert.equal(result.periodDrawCount, 4);
  assert.equal(result.calculatedDrawCount, 2);
  assert.equal(result.skippedDrawCount, 2);
  assert.equal(result.dailyStops.length, 2);
  assert.deepEqual(
    result.dailyStops.map((stop) => stop.dayKey),
    ["2026-08-01", "2026-08-02"],
  );
  assert.match(result.stoppedReason, /дневных остановок: 2/);
});

test("walks all 2,964 July draws and marks rows skipped by daily stops", () => {
  const ticket = { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] };
  const losingMain = [9, 10, 11, 12, 13, 14, 15, 16];
  let drawNumber = 1;
  const draws = [];
  for (let day = 1; day <= 31; day += 1) {
    const drawsInDay = day === 31 ? 84 : 96;
    for (let index = 0; index < drawsInDay; index += 1) {
      const winningDraw = index === 0;
      draws.push({
        drawNum: String(drawNumber).padStart(5, "0"),
        date: `2026-07-${String(day).padStart(2, "0")}`,
        main: winningDraw ? ticket.main : losingMain,
        extra: winningDraw ? 1 : 2,
      });
      drawNumber += 1;
    }
  }

  const result = runStrategyBacktest(
    [ticket],
    draws,
    [1_000, 0, 0, 0, 0, 0, 0, 0, 0],
    100,
    {
      mode: "real",
      rule: "add",
      step: 1,
      baseCopies: 1,
      stopOnWin: true,
      trigger: "any",
      stopScope: "day",
    },
  );

  assert.equal(draws.length, 2_964);
  assert.equal(result.periodDrawCount, 2_964);
  assert.equal(result.entries.length, 2_964);
  assert.equal(result.calculatedDrawCount, 31);
  assert.equal(result.skippedDrawCount, 2_933);
  assert.equal(result.dailyStops.length, 31);
  assert.equal(new Set(result.entries.map((entry) => entry.date)).size, 31);
});

test("applies +1 after each loss and restarts from one on the next day", () => {
  const ticket = { main: [1, 2, 3, 4, 5, 6, 7, 8], extra: [1] };
  const losingMain = [9, 10, 11, 12, 13, 14, 15, 16];
  const draws = [
    { drawNum: "008", date: "2026-08-03", main: losingMain, extra: 2 },
    { drawNum: "007", date: "2026-08-02", main: losingMain, extra: 2 },
    { drawNum: "006", date: "2026-08-02", main: ticket.main, extra: 1 },
    { drawNum: "005", date: "2026-08-02", main: losingMain, extra: 2 },
    { drawNum: "004", date: "2026-08-01", main: losingMain, extra: 2 },
    { drawNum: "003", date: "2026-08-01", main: ticket.main, extra: 1 },
    { drawNum: "002", date: "2026-08-01", main: losingMain, extra: 2 },
    { drawNum: "001", date: "2026-08-01", main: losingMain, extra: 2 },
  ];

  const result = runStrategyBacktest(
    [ticket],
    draws,
    [1_000, 0, 0, 0, 0, 0, 0, 0, 0],
    100,
    {
      mode: "real",
      rule: "add",
      step: 1,
      baseCopies: 1,
      resetOnWin: true,
      stopOnWin: true,
      trigger: "any",
      stopScope: "day",
    },
  );

  assert.deepEqual(
    result.entries.filter((entry) => !entry.skipped).map((entry) => entry.copies),
    [1, 2, 3, 1, 2, 1],
  );
  assert.equal(result.entries.find((entry) => entry.drawNum === "004").skipped, true);
  assert.equal(result.entries.find((entry) => entry.drawNum === "007").skipped, true);
  assert.equal(result.entries.find((entry) => entry.drawNum === "008").copies, 1);
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

test("imports personal tickets with the ninth number as field two", () => {
  const parsed = parseTicketFile(`
10,15,08,20,13,19,02,06,03
01;04;07;09;11;14;17;20;04
1,2,3,4,5,6,7,7,2
`);

  assert.equal(parsed.tickets.length, 2);
  assert.deepEqual(parsed.tickets[0].main, [2, 6, 8, 10, 13, 15, 19, 20]);
  assert.deepEqual(parsed.tickets[0].extra, [3]);
  assert.deepEqual(parsed.tickets[1].main, [1, 4, 7, 9, 11, 14, 17, 20]);
  assert.deepEqual(parsed.tickets[1].extra, [4]);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0].message, /не должны повторяться/);
});

test("imports expanded personal tickets using the selected field sizes", () => {
  const parsed = parseTicketFile(
    "2,3,5,6,8,9,15,20,1,2,3,4\n1,2,3,4,5,6,7,8,1,2,2,4",
    { mainCount: 8, extraCount: 4 },
  );

  assert.equal(parsed.tickets.length, 1);
  assert.deepEqual(parsed.tickets[0].main, [2, 3, 5, 6, 8, 9, 15, 20]);
  assert.deepEqual(parsed.tickets[0].extra, [1, 2, 3, 4]);
  assert.equal(parsed.tickets[0].combinations, 4);
  assert.equal(parsed.errors.length, 1);
  assert.match(parsed.errors[0].message, /поле 2.*не должны повторяться/);

  const nineByFour = parseTicketFile(
    "1,2,3,4,5,6,7,8,9,1,2,3,4",
    { mainCount: 9, extraCount: 4 },
  );
  assert.equal(nineByFour.tickets.length, 1);
  assert.equal(nineByFour.tickets[0].combinations, 36);
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
  const html = await readFile(
    new URL("../dist/client/index.html", import.meta.url),
    "utf8",
  );
  const script = await readFile(
    new URL("../dist/client/app.js", import.meta.url),
    "utf8",
  );
  const styles = await readFile(
    new URL("../dist/client/styles.css", import.meta.url),
    "utf8",
  );
  const worker = await readFile(
    new URL("../dist/server/index.js", import.meta.url),
    "utf8",
  );
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
  assert.match(script, /Вернуть базовые выплаты/);
  assert.doesNotMatch(script, /data-action="update-draws"/);
  assert.doesNotMatch(script, /data-action="update-payouts"/);
  assert.doesNotMatch(script, /\/api\/nloto\//);
  assert.match(script, /Найдено:/);
  assert.match(script, /Простой выбор режима/);
  assert.match(script, /Дополнительные правила/);
  assert.match(script, /Итоговая стоимость/);
  assert.match(script, /Ставки и расчёт/);
  assert.match(script, /Один экран вместо трёх вкладок/);
  assert.match(script, /Рассчитать:/);
  assert.match(script, /Загрузить свои ставки/);
  assert.match(script, /data-ticket-file/);
  assert.match(script, /toggle-strategy-win/);
  assert.match(script, /Сыгравших наших ставок/);
  assert.match(script, /Скидка на покупку, %/);
  assert.match(script, /data-strategy="discountPercent"/);
  assert.match(script, /Экономия/);
  assert.match(script, /Статистика выигрышей/);
  assert.match(script, /Категории и количество выигравших комбинаций/);
  assert.match(script, /open-strategy-win-draw/);
  assert.match(script, /День и номер тиража/);
  assert.match(script, /Исключить выигрышные на 1 тираж/);
  assert.match(script, /exclude_winners/);
  assert.match(script, /Временно исключено/);
  assert.match(script, /Пропустили этот тираж/);
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
  assert.match(styles, /\.strategy-win-details/);
  assert.match(styles, /\.strategy-win-statistics/);
  assert.match(styles, /\.strategy-major-win-draws/);
  assert.match(styles, /\.strategy-exclude-winners-note/);
  assert.match(styles, /\.strategy-history-copies/);
  assert.match(styles, /\.generator-rules-toolbar/);
  assert.match(launcher, /Калькулятор Восьмёрки/);
  assert.match(
    launcher,
    /\.\/! Калькулятор Восьмёрки\/Переносная версия\/calculator\.js/,
  );
  assert.match(
    launcher,
    /\.\/! Калькулятор Восьмёрки\/Переносная версия\/styles\.css/,
  );
  assert.doesNotMatch(launcher, /window\.location|about:blank/);
  const portableHtml = await readFile(
    new URL("../Переносная версия/index.html", import.meta.url),
    "utf8",
  );
  const portableScript = await readFile(
    new URL("../Переносная версия/calculator.js", import.meta.url),
    "utf8",
  );
  assert.match(
    portableHtml,
    /<script defer src="\.\/calculator\.js\?v=20260812-1"><\/script>/,
  );
  assert.doesNotMatch(portableHtml, /type="module"/);
  assert.doesNotMatch(portableScript, /^import\s/m);
  assert.doesNotMatch(portableScript, /^export\s/m);
  assert.doesNotMatch(portableScript, /\/api\/nloto\//);
  assert.match(worker, /url\.pathname === "\/"/);
  assert.match(worker, /url\.pathname = "\/index\.html"/);
  assert.match(worker, /cache-control", "no-store"/);
  await access(new URL("../dist/_worker.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
  await access(new URL("../dist/client/og-v3.png", import.meta.url));
  await access(new URL("../dist/client/assets/hero-big8.png", import.meta.url));
  await access(new URL("../dist/client/assets/hero-super8.png", import.meta.url));
  await access(new URL("../dist/client/assets/hero-v8.png", import.meta.url));
});
