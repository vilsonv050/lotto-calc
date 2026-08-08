export const PAYOUT_CATEGORIES = [
  "8 + 1",
  "8 + 0",
  "7 + 1",
  "7 + 0",
  "6 + 1",
  "6 + 0",
  "5 + 1",
  "5 + 0",
  "4 + 1",
];

export function choose(n, k) {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) {
    return 0;
  }
  const r = Math.min(k, n - k);
  let result = 1;
  for (let i = 1; i <= r; i += 1) {
    result = (result * (n - r + i)) / i;
  }
  return Math.round(result);
}

export function systemCombinations(mainCount, extraCount) {
  if (mainCount < 8 || extraCount < 1) return 0;
  return choose(mainCount, 8) * extraCount;
}

export function jackpotChance(mainCount, extraCount) {
  const covered = Math.min(systemCombinations(mainCount, extraCount), 503_880);
  return covered ? covered / 503_880 : 0;
}

export function estimateEconomics(combinations, price, payout, winningLines = 1) {
  const cost = Math.max(0, Number(combinations) * Number(price));
  const activeWinningLines = cost > 0 ? Math.max(0, Number(winningLines)) : 0;
  const gross = Math.max(0, Number(payout) * activeWinningLines);
  const profit = gross - cost;
  const roi = cost > 0 ? (profit / cost) * 100 : 0;
  const breakEven = Number(payout) > 0 ? Math.ceil(cost / Number(payout)) : null;
  return { cost, gross, profit, roi, breakEven };
}

export function parseNumberList(value, min = 1, max = 20) {
  const numbers = String(value ?? "")
    .match(/\d+/g)
    ?.map(Number)
    .filter((number) => number >= min && number <= max) ?? [];
  return [...new Set(numbers)].sort((a, b) => a - b);
}

function asNumbers(value) {
  if (!Array.isArray(value)) return [];
  return value.map(Number).filter(Number.isFinite);
}

function findNumberGroups(value, groups = []) {
  if (!value || groups.length > 16) return groups;
  if (Array.isArray(value)) {
    const numeric = asNumbers(value);
    if (numeric.length === value.length && numeric.length) groups.push(numeric);
    for (const item of value) findNumberGroups(item, groups);
  } else if (typeof value === "object") {
    for (const item of Object.values(value)) findNumberGroups(item, groups);
  }
  return groups;
}

export function normaliseDraw(draw, index = 0) {
  if (!draw || typeof draw !== "object") return null;
  const groups = findNumberGroups(
    draw.winningCombination ??
      draw.winningNumbers ??
      draw.combination ??
      draw.numbers ??
      draw.result,
  );
  const explicitMain = asNumbers(
    draw.mainNumbers ?? draw.main ?? draw.field1,
  ).slice(0, 8);
  const inferredMain =
    explicitMain.length === 8
      ? explicitMain
      : groups.find((group) => group.length >= 8)?.slice(0, 8);
  const inferredExtra =
    Number(draw.additionalNumber ?? draw.extra ?? draw.field2) ||
    groups.find(
      (group) => group.length === 1 && group[0] >= 1 && group[0] <= 4,
    )?.[0] ||
    groups.find((group) => group.length >= 9)?.[8];

  if (!inferredMain || inferredMain.length !== 8) return null;
  return {
    drawNum: String(
      draw.drawNum ?? draw.drawNumber ?? draw.number ?? draw.id ?? `FILE-${index + 1}`,
    ),
    date: String(draw.drawDate ?? draw.date ?? draw.drawTime ?? ""),
    main: inferredMain.map(Number),
    extra: Number(inferredExtra || 0),
    jackpot: Number(draw.jackpot ?? draw.superPrize ?? draw.jackpotAmount ?? 0),
  };
}

export function normaliseHistoryResponse(payload) {
  const rows = Array.isArray(payload)
    ? payload
    : payload?.content ??
      payload?.draws ??
      payload?.items ??
      payload?.data ??
      [];
  return rows.map(normaliseDraw).filter(Boolean);
}

export function parseTextArchive(text) {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return normaliseHistoryResponse(JSON.parse(trimmed));
  }

  const rows = [];
  for (const [index, line] of trimmed.split(/\r?\n/).entries()) {
    if (!line.trim() || (/(?:тираж|draw)/i.test(line) && index === 0)) continue;
    const parts = line.includes(";")
      ? line.split(";")
      : line.includes("\t")
        ? line.split("\t")
        : line.includes(",")
          ? line.split(",")
          : line.trim().split(/\s+/);
    if (parts.length < 3) continue;

    const isColumnArchive = !line.includes(";") && !line.includes("\t");
    const columnNumbers = isColumnArchive
      ? parts.slice(2, 11).map((value) => {
          const cell = value.trim();
          return /^\d{1,2}$/.test(cell) ? Number(cell) : Number.NaN;
        })
      : [];
    if (
      parts.length >= 11 &&
      columnNumbers.length === 9 &&
      columnNumbers.every(Number.isFinite)
    ) {
      rows.push({
        drawNum: parts[0].trim() || `FILE-${index + 1}`,
        date: parts[1].trim(),
        main: columnNumbers.slice(0, 8),
        extra: columnNumbers[8],
        jackpot:
          parts.length > 11
            ? Number(parts[11].replace(/[^\d]/g, "")) || 0
            : 0,
      });
      continue;
    }

    const numbers =
      parts
        .slice(2)
        .join(" ")
        .match(/\d+/g)
        ?.map(Number)
        .filter((number) => number >= 1 && number <= 20) ?? [];
    if (numbers.length < 9) continue;
    rows.push({
      drawNum: parts[0].trim() || `FILE-${index + 1}`,
      date: parts[1].trim(),
      main: numbers.slice(0, 8),
      extra: numbers[8],
      jackpot: Number(parts.at(-1)?.replace(/[^\d]/g, "")) || 0,
    });
  }
  return rows;
}

export function validateImportedDraws(rows, existing = []) {
  const valid = [];
  const errors = [];
  const duplicates = [];
  const seen = new Set();
  const existingNumbers = new Set(existing.map((row) => String(row.drawNum)));

  rows.forEach((row, index) => {
    const drawNum = String(row?.drawNum ?? "").trim();
    const main = asNumbers(row?.main);
    const extra = Number(row?.extra);
    const problems = [];

    if (!drawNum) problems.push("нет номера тиража");
    if (
      main.length !== 8 ||
      new Set(main).size !== 8 ||
      main.some((number) => number < 1 || number > 20)
    ) {
      problems.push("нужно 8 уникальных чисел 1–20");
    }
    if (extra < 1 || extra > 4) problems.push("дополнительное число должно быть 1–4");

    if (seen.has(drawNum)) {
      duplicates.push({ drawNum, type: "в файле" });
      return;
    }
    seen.add(drawNum);
    if (existingNumbers.has(drawNum)) {
      duplicates.push({ drawNum, type: "в архиве" });
    }
    if (problems.length) {
      errors.push({ row: index + 1, drawNum, message: problems.join("; ") });
      return;
    }
    valid.push({
      drawNum,
      date: String(row.date ?? ""),
      main: [...main],
      extra,
      jackpot: Number(row.jackpot ?? 0),
    });
  });

  const numeric = valid
    .map((row) => Number(row.drawNum))
    .filter(Number.isInteger)
    .sort((a, b) => a - b);
  const gaps = [];
  for (let index = 1; index < numeric.length && gaps.length < 30; index += 1) {
    if (numeric[index] - numeric[index - 1] > 1) {
      gaps.push({
        after: numeric[index - 1],
        before: numeric[index],
        missing: numeric[index] - numeric[index - 1] - 1,
      });
    }
  }

  return { valid, errors, duplicates, gaps };
}

export function mergeDrawArchives(existing, incoming, mode = "add") {
  const rows = mode === "replace" ? [] : [...existing];
  const byNumber = new Map(rows.map((row) => [String(row.drawNum), row]));
  for (const row of incoming) byNumber.set(String(row.drawNum), row);
  return [...byNumber.values()]
    .map((row, index) => {
      const text = String(row.drawNum);
      return {
        row,
        index,
        text,
        numeric: /^\d+$/.test(text) ? Number(text) : Number.NaN,
      };
    })
    .sort((left, right) => {
      if (Number.isFinite(left.numeric) && Number.isFinite(right.numeric)) {
        return right.numeric - left.numeric || left.index - right.index;
      }
      return (
        right.text.localeCompare(left.text, "ru", { numeric: true }) ||
        left.index - right.index
      );
    })
    .map(({ row }) => row);
}

export function normalisePayoutRules(payload) {
  const queue = [payload];
  const visited = new Set();

  while (queue.length) {
    const candidate = queue.shift();
    if (!candidate || typeof candidate !== "object" || visited.has(candidate)) continue;
    visited.add(candidate);
    const rows =
      candidate.drawRuleInfo ??
      candidate.prizeCategories ??
      candidate.winnings ??
      candidate.payouts;

    if (Array.isArray(rows) && rows.length >= 9) {
      const payouts = rows
        .slice()
        .sort((a, b) => Number(a?.order ?? 0) - Number(b?.order ?? 0))
        .slice(0, 9)
        .map((row) =>
          Number(
            row?.fixedPrize ??
              row?.prizeValue ??
              row?.prize ??
              row?.amount ??
              row?.winAmount ??
              row?.superPrize ??
              0,
          ),
        );
      if (payouts[0] <= 0) {
        payouts[0] = Number(
          candidate.superPrize ?? candidate.jackpot ?? candidate.jackpotAmount ?? 0,
        );
      }
      return {
        payouts,
        price: Number(
          candidate.basePrice ??
            candidate.ticketPrice ??
            candidate.price ??
            candidate.betPrice ??
            0,
        ),
        drawNum: String(
          candidate.drawNum ?? candidate.drawNumber ?? candidate.number ?? "",
        ),
      };
    }

    if (Array.isArray(candidate)) queue.push(...candidate);
    else queue.push(...Object.values(candidate));
  }
  return null;
}

function hashSeed(seed) {
  let value = 2166136261;
  for (const char of String(seed || "eight-lab")) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

export function createSeededRandom(seed) {
  let state = hashSeed(seed);
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumberOr(value, fallback) {
  if (value === "" || value === null || value === undefined) return fallback;
  return numberOr(value, fallback);
}

function listTakeCount(value, listLength) {
  if (value === "" || value === null || value === undefined) return listLength;
  return Math.max(0, Math.floor(numberOr(value, listLength)));
}

function combinations(values, size, limit = Number.POSITIVE_INFINITY) {
  const result = [];
  const walk = (start, selected) => {
    if (result.length >= limit) return;
    if (selected.length === size) {
      result.push([...selected]);
      return;
    }
    for (let index = start; index < values.length; index += 1) {
      selected.push(values[index]);
      walk(index + 1, selected);
      selected.pop();
    }
  };
  walk(0, []);
  return result;
}

export function buildArchiveStats(draws) {
  const frequency = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [index + 1, 0]),
  );
  const extraFrequency = Object.fromEntries(
    Array.from({ length: 4 }, (_, index) => [index + 1, 0]),
  );
  const lastSeen = {};
  const stride = 21;
  const pairCounts = new Uint32Array(stride * stride);
  const tripleCounts = new Uint32Array(stride * stride * stride);

  draws.forEach((draw, drawIndex) => {
    const main = [...new Set(asNumbers(draw.main))].sort((a, b) => a - b);
    main.forEach((number) => {
      if (frequency[number] !== undefined) frequency[number] += 1;
      if (lastSeen[number] === undefined) lastSeen[number] = drawIndex;
    });
    if (extraFrequency[draw.extra] !== undefined) extraFrequency[draw.extra] += 1;
    for (let left = 0; left < main.length; left += 1) {
      const first = main[left];
      for (let middle = left + 1; middle < main.length; middle += 1) {
        const second = main[middle];
        pairCounts[first * stride + second] += 1;
        for (let right = middle + 1; right < main.length; right += 1) {
          const third = main[right];
          tripleCounts[(first * stride + second) * stride + third] += 1;
        }
      }
    }
  });

  const overdue = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [
      index + 1,
      lastSeen[index + 1] ?? draws.length + 1,
    ]),
  );
  const ascendingFrequency = Object.keys(frequency)
    .map(Number)
    .sort((a, b) => frequency[a] - frequency[b] || a - b);
  const descendingFrequency = [...ascendingFrequency].reverse();
  const overdueNumbers = Object.keys(overdue)
    .map(Number)
    .sort((a, b) => overdue[b] - overdue[a] || a - b);
  const pairs = [];
  const triples = [];
  for (let first = 1; first <= 20; first += 1) {
    for (let second = first + 1; second <= 20; second += 1) {
      const pairCount = pairCounts[first * stride + second];
      if (pairCount) {
        pairs.push({ numbers: [first, second], count: pairCount });
      }
      for (let third = second + 1; third <= 20; third += 1) {
        const tripleCount =
          tripleCounts[(first * stride + second) * stride + third];
        if (tripleCount) {
          triples.push({
            numbers: [first, second, third],
            count: tripleCount,
          });
        }
      }
    }
  }
  const byCountThenNumbers = (left, right) =>
    right.count - left.count ||
    left.numbers[0] - right.numbers[0] ||
    left.numbers[1] - right.numbers[1] ||
    (left.numbers[2] ?? 0) - (right.numbers[2] ?? 0);
  const topPairs = pairs.sort(byCountThenNumbers).slice(0, 20);
  const topTriples = triples.sort(byCountThenNumbers).slice(0, 20);

  return {
    frequency,
    extraFrequency,
    overdue,
    hot: descendingFrequency.slice(0, 8),
    cold: ascendingFrequency.slice(0, 8),
    overdueNumbers: overdueNumbers.slice(0, 8),
    topPairs,
    topTriples,
    drawCount: draws.length,
  };
}

function drawTimestamp(draw) {
  const rawDate = String(draw?.date ?? "");
  const day = archiveDay(rawDate);
  if (day) {
    if (/^\d{4}-\d{1,2}-\d{1,2}T/.test(rawDate)) {
      const timestamp = new Date(rawDate).getTime();
      if (Number.isFinite(timestamp)) return timestamp;
    }
    return day.timestamp;
  }
  const numeric = Number(String(draw?.drawNum ?? "").replace(/\D/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
}

function archiveDay(value) {
  const text = String(value ?? "").trim();
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const russian = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  const parts = iso
    ? { year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]) }
    : russian
      ? {
          year: Number(russian[3]),
          month: Number(russian[2]),
          day: Number(russian[1]),
        }
      : null;
  if (!parts) return null;
  const timestamp = Date.UTC(parts.year, parts.month - 1, parts.day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== parts.year ||
    date.getUTCMonth() !== parts.month - 1 ||
    date.getUTCDate() !== parts.day
  ) {
    return null;
  }
  const pad = (number) => String(number).padStart(2, "0");
  return {
    key: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    label: `${pad(parts.day)}.${pad(parts.month)}.${parts.year}`,
    timestamp,
  };
}

export function buildDailyArchiveBreakdown(draws) {
  const groups = new Map();
  let undatedCount = 0;

  for (const draw of draws) {
    const day = archiveDay(draw?.date);
    if (!day) {
      undatedCount += 1;
      continue;
    }
    let group = groups.get(day.key);
    if (!group) {
      group = {
        ...day,
        drawCount: 0,
        frequency: new Uint32Array(21),
        extraFrequency: new Uint32Array(5),
      };
      groups.set(day.key, group);
    }
    group.drawCount += 1;
    for (const number of new Set(asNumbers(draw?.main))) {
      if (number >= 1 && number <= 20) group.frequency[number] += 1;
    }
    const extra = Number(draw?.extra);
    if (extra >= 1 && extra <= 4) group.extraFrequency[extra] += 1;
  }

  const days = [...groups.values()]
    .sort((left, right) => right.timestamp - left.timestamp)
    .map((group) => {
      const rank = (frequency, maxNumber) =>
        Array.from({ length: maxNumber }, (_, index) => index + 1).sort(
          (left, right) =>
            frequency[right] - frequency[left] || left - right,
        );
      return {
        ...group,
        hot: rank(group.frequency, 20),
        extraHot: rank(group.extraFrequency, 4),
      };
    });

  return {
    days,
    dayCount: days.length,
    undatedCount,
  };
}

const ARCHIVE_MONTH_NAMES = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
];

export function buildArchiveCalendar(draws) {
  const years = new Map();
  let undatedCount = 0;

  for (const draw of draws) {
    const day = archiveDay(draw?.date);
    if (!day) {
      undatedCount += 1;
      continue;
    }
    const [yearKey, monthNumber] = day.key.split("-");
    const monthKey = `${yearKey}-${monthNumber}`;
    let year = years.get(yearKey);
    if (!year) {
      year = {
        key: yearKey,
        label: yearKey,
        drawCount: 0,
        dayKeys: new Set(),
        months: new Map(),
      };
      years.set(yearKey, year);
    }
    let month = year.months.get(monthKey);
    if (!month) {
      const monthIndex = Number(monthNumber) - 1;
      month = {
        key: monthKey,
        yearKey,
        monthNumber,
        label: `${ARCHIVE_MONTH_NAMES[monthIndex] || monthNumber} ${yearKey}`,
        shortLabel: ARCHIVE_MONTH_NAMES[monthIndex] || monthNumber,
        drawCount: 0,
        days: new Map(),
      };
      year.months.set(monthKey, month);
    }
    let dayGroup = month.days.get(day.key);
    if (!dayGroup) {
      dayGroup = {
        key: day.key,
        label: day.label,
        drawCount: 0,
        timestamp: day.timestamp,
      };
      month.days.set(day.key, dayGroup);
    }
    dayGroup.drawCount += 1;
    month.drawCount += 1;
    year.drawCount += 1;
    year.dayKeys.add(day.key);
  }

  const calendarYears = [...years.values()]
    .sort((left, right) => Number(right.key) - Number(left.key))
    .map((year) => ({
      key: year.key,
      label: year.label,
      drawCount: year.drawCount,
      dayCount: year.dayKeys.size,
      months: [...year.months.values()]
        .sort((left, right) => right.key.localeCompare(left.key))
        .map((month) => ({
          key: month.key,
          yearKey: month.yearKey,
          monthNumber: month.monthNumber,
          label: month.label,
          shortLabel: month.shortLabel,
          drawCount: month.drawCount,
          dayCount: month.days.size,
          days: [...month.days.values()].sort(
            (left, right) => right.timestamp - left.timestamp,
          ),
        })),
    }));

  return {
    years: calendarYears,
    yearCount: calendarYears.length,
    monthCount: calendarYears.reduce(
      (sum, year) => sum + year.months.length,
      0,
    ),
    dayCount: calendarYears.reduce((sum, year) => sum + year.dayCount, 0),
    datedDrawCount: draws.length - undatedCount,
    undatedCount,
    totalDrawCount: draws.length,
  };
}

export function selectDrawsByArchiveScope(
  draws,
  rawType = "all",
  rawKey = "all",
) {
  const type = ["all", "year", "month", "day"].includes(rawType)
    ? rawType
    : "all";
  const key = String(rawKey || "");
  if (type === "all") return draws;
  return draws.filter((draw) => {
    const day = archiveDay(draw?.date);
    if (!day) return false;
    if (type === "year") return day.key.startsWith(`${key}-`);
    if (type === "month") return day.key.startsWith(`${key}-`);
    return day.key === key;
  });
}

function sortDrawsNewest(draws) {
  return draws
    .map((draw, index) => ({
      draw,
      index,
      timestamp: drawTimestamp(draw),
      drawNum: String(draw?.drawNum ?? ""),
      numericDrawNum: /^\d+$/.test(String(draw?.drawNum ?? ""))
        ? Number(draw.drawNum)
        : Number.NaN,
    }))
    .sort(
      (left, right) =>
        right.timestamp - left.timestamp ||
        (Number.isFinite(left.numericDrawNum) &&
        Number.isFinite(right.numericDrawNum)
          ? right.numericDrawNum - left.numericDrawNum
          : 0) ||
        right.drawNum.localeCompare(left.drawNum, "ru", { numeric: true }) ||
        left.index - right.index,
    )
    .map(({ draw }) => draw);
}

function gapSeries(draws, maxNumber, field) {
  const chronological = [...draws].reverse();
  const current = {};
  const maximum = {};
  const lastIndex = new Int32Array(maxNumber + 1);
  lastIndex.fill(-1);
  const maxGap = new Uint32Array(maxNumber + 1);

  chronological.forEach((draw, index) => {
    const values =
      field === "extra"
        ? [Number(draw.extra)]
        : [...new Set(asNumbers(draw.main))];
    values.forEach((number) => {
      if (number < 1 || number > maxNumber) return;
      maxGap[number] = Math.max(
        maxGap[number],
        index - lastIndex[number] - 1,
      );
      lastIndex[number] = index;
    });
  });

  for (let number = 1; number <= maxNumber; number += 1) {
    maxGap[number] = Math.max(
      maxGap[number],
      chronological.length - lastIndex[number] - 1,
    );
    maximum[number] = maxGap[number];
    current[number] =
      lastIndex[number] < 0
        ? draws.length
        : chronological.length - lastIndex[number] - 1;
  }
  return { current, maximum };
}

export function buildAdvancedArchiveAnalysis(draws, rawWindow = "all") {
  const newest = sortDrawsNewest(draws);
  const parsedWindow = Number(rawWindow);
  const windowSize =
    rawWindow === "all" || !Number.isFinite(parsedWindow) || parsedWindow <= 0
      ? newest.length
      : Math.min(newest.length, Math.floor(parsedWindow));
  const recent = newest.slice(0, windowSize);
  const previous = newest.slice(windowSize, windowSize * 2);
  const stats = buildArchiveStats(recent);
  const previousStats = buildArchiveStats(previous);
  const mainGaps = gapSeries(recent, 20, "main");
  const extraGaps = gapSeries(recent, 4, "extra");
  const trend = {};
  const cooccurrence = {};
  const recentDenominator = Math.max(1, recent.length);
  const previousDenominator = Math.max(1, previous.length);

  for (let number = 1; number <= 20; number += 1) {
    trend[number] =
      (stats.frequency[number] / recentDenominator -
        previousStats.frequency[number] / previousDenominator) *
      100;
  }

  for (const draw of recent) {
    const main = [...new Set(asNumbers(draw.main))].sort((a, b) => a - b);
    combinations(main, 2).forEach(([left, right]) => {
      const key = `${left}-${right}`;
      cooccurrence[key] = (cooccurrence[key] || 0) + 1;
    });
  }

  const distributionRows = recent.map((draw, index) => {
    const main = [...new Set(asNumbers(draw.main))];
    const olderMain = new Set(asNumbers(recent[index + 1]?.main));
    return {
      even: main.filter((number) => number % 2 === 0).length,
      lower: main.filter((number) => number <= 10).length,
      sum: main.reduce((total, number) => total + number, 0),
      repeats: main.filter((number) => olderMain.has(number)).length,
    };
  });
  const average = (field) =>
    distributionRows.length
      ? distributionRows.reduce((sum, row) => sum + row[field], 0) /
        distributionRows.length
      : 0;

  return {
    ...stats,
    draws: recent,
    previousDrawCount: previous.length,
    trend,
    mainGaps,
    extraGaps,
    cooccurrence,
    distribution: {
      averageEven: average("even"),
      averageLower: average("lower"),
      averageSum: average("sum"),
      averageRepeats: average("repeats"),
    },
  };
}

export function analyzeTicketPortfolio(tickets) {
  const mainUsage = Object.fromEntries(
    Array.from({ length: 20 }, (_, index) => [index + 1, 0]),
  );
  const extraUsage = Object.fromEntries(
    Array.from({ length: 4 }, (_, index) => [index + 1, 0]),
  );
  const pairCoverage = new Set();
  const keys = new Map();
  let totalCombinations = 0;
  let totalEven = 0;
  let totalLower = 0;

  tickets.forEach((ticket) => {
    const main = [...new Set(asNumbers(ticket.main))].sort((a, b) => a - b);
    const extra = [...new Set(asNumbers(ticket.extra))].sort((a, b) => a - b);
    main.forEach((number) => {
      if (mainUsage[number] !== undefined) mainUsage[number] += 1;
    });
    extra.forEach((number) => {
      if (extraUsage[number] !== undefined) extraUsage[number] += 1;
    });
    combinations(main, 2).forEach((pair) => pairCoverage.add(pair.join("-")));
    totalEven += main.filter((number) => number % 2 === 0).length;
    totalLower += main.filter((number) => number <= 10).length;
    totalCombinations += systemCombinations(main.length, extra.length);
    const key = `${main.join("-")}|${extra.join("-")}`;
    keys.set(key, (keys.get(key) || 0) + 1);
  });

  let overlapTotal = 0;
  let overlapPairs = 0;
  let maxOverlap = 0;
  let nearDuplicates = 0;
  for (let left = 0; left < tickets.length; left += 1) {
    for (let right = left + 1; right < tickets.length; right += 1) {
      const overlap = overlapCount(tickets[left].main, tickets[right].main);
      overlapTotal += overlap;
      overlapPairs += 1;
      maxOverlap = Math.max(maxOverlap, overlap);
      const smaller = Math.min(tickets[left].main.length, tickets[right].main.length);
      if (overlap >= Math.max(7, smaller - 1)) nearDuplicates += 1;
    }
  }

  const duplicateCount = [...keys.values()].reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  const coveredMain = Object.keys(mainUsage)
    .map(Number)
    .filter((number) => mainUsage[number] > 0);
  const coveredExtra = Object.keys(extraUsage)
    .map(Number)
    .filter((number) => extraUsage[number] > 0);

  return {
    ticketCount: tickets.length,
    totalCombinations,
    mainUsage,
    extraUsage,
    coveredMain,
    coveredExtra,
    missingMain: Object.keys(mainUsage)
      .map(Number)
      .filter((number) => !mainUsage[number]),
    missingExtra: Object.keys(extraUsage)
      .map(Number)
      .filter((number) => !extraUsage[number]),
    duplicateCount,
    nearDuplicates,
    maxOverlap,
    averageOverlap: overlapPairs ? overlapTotal / overlapPairs : 0,
    pairCoverage: pairCoverage.size,
    pairCoveragePercent: (pairCoverage.size / choose(20, 2)) * 100,
    averageEven: tickets.length ? totalEven / tickets.length : 0,
    averageLower: tickets.length ? totalLower / tickets.length : 0,
  };
}

function strategyTriggered(evaluation, balance, settings) {
  if (settings.trigger === "profit") return evaluation.profit > 0;
  if (settings.trigger === "recovery") {
    return evaluation.prize > 0 && balance >= 0;
  }
  if (settings.trigger === "category") {
    return evaluation.results.some((result) =>
      result.breakdown.some(
        (row) =>
          row.count > 0 &&
          PAYOUT_CATEGORIES.indexOf(row.category) <= settings.categoryIndex,
      ),
    );
  }
  return evaluation.prize > 0;
}

function nextCopies(copies, settings) {
  if (settings.rule === "multiply") {
    return Math.min(settings.maxCopies, copies * settings.step);
  }
  return Math.min(settings.maxCopies, copies + settings.step);
}

export function runStrategyBacktest(
  tickets,
  draws,
  payouts,
  price,
  rawSettings = {},
) {
  const settings = {
    mode: rawSettings.mode === "independent" ? "independent" : "real",
    baseCopies: Math.max(1, Math.floor(numberOr(rawSettings.baseCopies, 1))),
    rule: rawSettings.rule === "multiply" ? "multiply" : "add",
    step: Math.max(1, numberOr(rawSettings.step, 1)),
    maxCopies: Math.max(1, Math.floor(numberOr(rawSettings.maxCopies, 32))),
    resetOnWin: rawSettings.resetOnWin !== false,
    stopOnWin: Boolean(rawSettings.stopOnWin),
    trigger: ["any", "profit", "recovery", "category"].includes(
      rawSettings.trigger,
    )
      ? rawSettings.trigger
      : "any",
    categoryIndex: Math.min(
      PAYOUT_CATEGORIES.length - 1,
      Math.max(0, Math.floor(numberOr(rawSettings.categoryIndex, 4))),
    ),
    budget: Math.max(0, numberOr(rawSettings.budget, 0)),
  };
  const orderedDraws = sortDrawsNewest(draws).reverse();
  const entries = [];
  let totalCost = 0;
  let totalPrize = 0;
  let balance = 0;
  let maxDrawdown = 0;
  let maxCopiesUsed = settings.baseCopies;
  let currentLossStreak = 0;
  let longestLossStreak = 0;
  let stoppedReason = "";

  if (!tickets.length || !orderedDraws.length) {
    return {
      settings,
      entries,
      totalCost,
      totalPrize,
      profit: 0,
      roi: 0,
      startingBalance: 0,
      endingBalance: 0,
      maxDrawdown,
      maxCopiesUsed,
      longestLossStreak,
      stoppedReason: !tickets.length ? "Нет ставок" : "Нет тиражей",
      activeTickets: tickets.length,
    };
  }

  if (settings.mode === "real") {
    let copies = settings.baseCopies;
    let active = true;
    for (const draw of orderedDraws) {
      if (!active) break;
      const evaluation = evaluateTickets(tickets, draw, payouts, price);
      const drawCost = evaluation.cost * copies;
      if (settings.budget && totalCost + drawCost > settings.budget) {
        stoppedReason = "Достигнут лимит затрат";
        break;
      }
      const drawPrize = evaluation.prize * copies;
      const drawProfit = drawPrize - drawCost;
      totalCost += drawCost;
      totalPrize += drawPrize;
      balance += drawProfit;
      maxDrawdown = Math.min(maxDrawdown, balance);
      maxCopiesUsed = Math.max(maxCopiesUsed, copies);
      const triggered = strategyTriggered(
        { ...evaluation, profit: drawProfit, prize: drawPrize },
        balance,
        settings,
      );
      entries.push({
        drawNum: draw.drawNum,
        date: draw.date,
        copies,
        cost: drawCost,
        prize: drawPrize,
        profit: drawProfit,
        balance,
        triggered,
        activeTickets: tickets.length,
      });
      if (drawProfit < 0) {
        currentLossStreak += 1;
        longestLossStreak = Math.max(longestLossStreak, currentLossStreak);
      } else {
        currentLossStreak = 0;
      }
      if (triggered) {
        if (settings.stopOnWin) {
          active = false;
          stoppedReason = "Стратегия остановлена по условию выигрыша";
        } else if (settings.resetOnWin) {
          copies = settings.baseCopies;
        }
      } else {
        copies = nextCopies(copies, settings);
      }
    }
  } else {
    const ticketStates = tickets.map(() => ({
      copies: settings.baseCopies,
      balance: 0,
      active: true,
    }));
    for (const draw of orderedDraws) {
      let drawCost = 0;
      let drawPrize = 0;
      let triggeredCount = 0;
      const copiesUsed = [];
      for (let index = 0; index < tickets.length; index += 1) {
        const ticketState = ticketStates[index];
        if (!ticketState.active) continue;
        const evaluation = evaluateTickets([tickets[index]], draw, payouts, price);
        const ticketCost = evaluation.cost * ticketState.copies;
        if (settings.budget && totalCost + drawCost + ticketCost > settings.budget) {
          ticketState.active = false;
          continue;
        }
        const ticketPrize = evaluation.prize * ticketState.copies;
        const ticketProfit = ticketPrize - ticketCost;
        drawCost += ticketCost;
        drawPrize += ticketPrize;
        ticketState.balance += ticketProfit;
        copiesUsed.push(ticketState.copies);
        maxCopiesUsed = Math.max(maxCopiesUsed, ticketState.copies);
        const triggered = strategyTriggered(
          {
            ...evaluation,
            profit: ticketProfit,
            prize: ticketPrize,
          },
          ticketState.balance,
          settings,
        );
        if (triggered) {
          triggeredCount += 1;
          if (settings.stopOnWin) ticketState.active = false;
          else if (settings.resetOnWin) ticketState.copies = settings.baseCopies;
        } else {
          ticketState.copies = nextCopies(ticketState.copies, settings);
        }
      }
      if (!copiesUsed.length) {
        stoppedReason = settings.budget
          ? "Достигнут лимит затрат"
          : "Все ставки остановлены";
        break;
      }
      const drawProfit = drawPrize - drawCost;
      totalCost += drawCost;
      totalPrize += drawPrize;
      balance += drawProfit;
      maxDrawdown = Math.min(maxDrawdown, balance);
      if (drawProfit < 0) {
        currentLossStreak += 1;
        longestLossStreak = Math.max(longestLossStreak, currentLossStreak);
      } else {
        currentLossStreak = 0;
      }
      entries.push({
        drawNum: draw.drawNum,
        date: draw.date,
        copies:
          copiesUsed.length === 1
            ? copiesUsed[0]
            : `${Math.min(...copiesUsed)}–${Math.max(...copiesUsed)}`,
        cost: drawCost,
        prize: drawPrize,
        profit: drawProfit,
        balance,
        triggered: triggeredCount,
        activeTickets: ticketStates.filter((item) => item.active).length,
      });
    }
    if (!stoppedReason && !ticketStates.some((item) => item.active)) {
      stoppedReason = "Все ставки остановлены";
    }
  }

  const startingBalance = totalCost;
  let fundedBalance = startingBalance;
  entries.forEach((entry) => {
    entry.netBalance = entry.balance;
    fundedBalance += entry.profit;
    entry.balance = fundedBalance;
  });

  return {
    settings,
    entries,
    totalCost,
    totalPrize,
    profit: totalPrize - totalCost,
    roi: totalCost > 0 ? ((totalPrize - totalCost) / totalCost) * 100 : 0,
    startingBalance,
    endingBalance: fundedBalance,
    maxDrawdown,
    maxCopiesUsed,
    longestLossStreak,
    stoppedReason,
    activeTickets:
      entries.at(-1)?.activeTickets ??
      (settings.mode === "real" ? tickets.length : 0),
  };
}

function weightedPick(candidates, weights, random) {
  const total = candidates.reduce(
    (sum, number) => sum + Math.max(0.0001, Number(weights[number] ?? 1)),
    0,
  );
  let target = random() * total;
  for (const number of candidates) {
    target -= Math.max(0.0001, Number(weights[number] ?? 1));
    if (target <= 0) return number;
  }
  return candidates.at(-1);
}

function weightedSample(candidates, count, weights, random) {
  const pool = [...candidates];
  const selected = [];
  while (pool.length && selected.length < count) {
    const number = weightedPick(pool, weights, random);
    selected.push(number);
    pool.splice(pool.indexOf(number), 1);
  }
  return selected;
}

function strategyWeights(strategy, stats) {
  const weights = {};
  const maxFrequency = Math.max(1, ...Object.values(stats.frequency));
  const maxOverdue = Math.max(1, ...Object.values(stats.overdue));
  for (let number = 1; number <= 20; number += 1) {
    if (strategy === "hot") weights[number] = 1 + stats.frequency[number] * 3;
    else if (strategy === "cold") {
      weights[number] = 1 + (maxFrequency - stats.frequency[number]) * 3;
    } else if (strategy === "overdue") {
      weights[number] = 1 + stats.overdue[number] * 3;
    } else if (strategy === "mixed") {
      weights[number] =
        1 +
        (stats.frequency[number] / maxFrequency) * 2 +
        (stats.overdue[number] / maxOverdue) * 2;
    } else weights[number] = 1;
  }
  return weights;
}

function overlapCount(left, right) {
  const rightSet = new Set(right);
  return left.reduce((count, number) => count + (rightSet.has(number) ? 1 : 0), 0);
}

function isTicketWithinLimits(main, settings) {
  const even = main.filter((number) => number % 2 === 0).length;
  const lower = main.filter((number) => number <= 10).length;
  return (
    even >= settings.evenMin &&
    even <= settings.evenMax &&
    lower >= settings.lowerMin &&
    lower <= settings.lowerMax
  );
}

function balancedExtraSelection(allowed, required, count, usage, random) {
  const result = [...required];
  const rest = allowed.filter((number) => !result.includes(number));
  rest.sort(
    (a, b) =>
      (usage[a] || 0) - (usage[b] || 0) ||
      (random() > 0.5 ? 1 : -1),
  );
  result.push(...rest.slice(0, count - result.length));
  result.forEach((number) => {
    usage[number] = (usage[number] || 0) + 1;
  });
  return result.sort((a, b) => a - b);
}

export function generateTickets(rawSettings, draws = [], precomputedStats = null) {
  const requiredMain = parseNumberList(rawSettings.requiredMain, 1, 20);
  const excludedMain = parseNumberList(rawSettings.excludedMain, 1, 20);
  const requiredExtra = parseNumberList(rawSettings.requiredExtra, 1, 4);
  const excludedExtra = parseNumberList(rawSettings.excludedExtra, 1, 4);
  const settings = {
    count: Math.min(500, Math.max(1, numberOr(rawSettings.count, 1))),
    mainCount: Math.min(20, Math.max(8, numberOr(rawSettings.mainCount, 8))),
    extraCount: Math.min(4, Math.max(1, numberOr(rawSettings.extraCount, 1))),
    requiredMain,
    requiredMainCount: listTakeCount(rawSettings.requiredMainCount, requiredMain.length),
    excludedMain,
    excludedMainCount: listTakeCount(rawSettings.excludedMainCount, excludedMain.length),
    priorityMain: parseNumberList(rawSettings.priorityMain, 1, 20),
    requiredExtra,
    requiredExtraCount: listTakeCount(rawSettings.requiredExtraCount, requiredExtra.length),
    excludedExtra,
    excludedExtraCount: listTakeCount(rawSettings.excludedExtraCount, excludedExtra.length),
    evenMin: Math.max(0, optionalNumberOr(rawSettings.evenMin, 0)),
    evenMax: Math.min(20, optionalNumberOr(rawSettings.evenMax, 20)),
    lowerMin: Math.max(0, optionalNumberOr(rawSettings.lowerMin, 0)),
    lowerMax: Math.min(20, optionalNumberOr(rawSettings.lowerMax, 20)),
    maxOverlap: Math.min(
      20,
      Math.max(0, optionalNumberOr(rawSettings.maxOverlap, 20)),
    ),
    coverAll: Boolean(rawSettings.coverAll),
    strategy: String(rawSettings.strategy || "random"),
    seed: String(rawSettings.seed || "eight-lab"),
  };
  const warnings = [];
  const resolveStats = () => precomputedStats ?? buildArchiveStats(draws);
  const invalidListCounts = [
    [settings.requiredMainCount, settings.requiredMain.length, "включения 1–20"],
    [settings.excludedMainCount, settings.excludedMain.length, "исключения 1–20"],
    [settings.requiredExtraCount, settings.requiredExtra.length, "включения 1–4"],
    [settings.excludedExtraCount, settings.excludedExtra.length, "исключения 1–4"],
  ].filter(([count, length]) => count > length);
  if (invalidListCounts.length) {
    return {
      rows: [],
      warnings: invalidListCounts.map(
        ([count, length, label]) =>
          `Для ${label} указано ${count}, но в списке только ${length}.`,
      ),
      coverage: [],
      stats: resolveStats(),
      attempts: 0,
    };
  }
  const requiredSet = new Set(settings.requiredMain);
  const conflictMain = settings.excludedMain.filter((number) => requiredSet.has(number));
  const requiredExtraSet = new Set(settings.requiredExtra);
  const conflictExtra = settings.excludedExtra.filter((number) =>
    requiredExtraSet.has(number),
  );

  if (conflictMain.length || conflictExtra.length) {
    return {
      rows: [],
      warnings: ["Обязательные и исключённые числа пересекаются."],
      coverage: [],
      stats: resolveStats(),
      attempts: 0,
    };
  }

  const mainPoolUnavailablePerRow =
    settings.requiredMain.length - settings.requiredMainCount;
  const extraPoolUnavailablePerRow =
    settings.requiredExtra.length - settings.requiredExtraCount;
  const availableMainPerRow =
    20 - mainPoolUnavailablePerRow - settings.excludedMainCount;
  const availableExtraPerRow =
    4 - extraPoolUnavailablePerRow - settings.excludedExtraCount;
  if (
    settings.requiredMainCount > settings.mainCount ||
    availableMainPerRow < settings.mainCount ||
    settings.requiredExtraCount > settings.extraCount ||
    availableExtraPerRow < settings.extraCount
  ) {
    return {
      rows: [],
      warnings: ["Ограничения не оставляют достаточно чисел для одной ставки."],
      coverage: [],
      stats: resolveStats(),
      attempts: 0,
    };
  }

  settings.evenMax = Math.max(settings.evenMin, settings.evenMax);
  settings.lowerMax = Math.max(settings.lowerMin, settings.lowerMax);
  const random = createSeededRandom(settings.seed);
  const stats = resolveStats();
  const weights = strategyWeights(settings.strategy, stats);
  const globallyUnavailableMain = new Set([
    ...(settings.requiredMainCount === 0 ? settings.requiredMain : []),
    ...(settings.excludedMainCount === settings.excludedMain.length
      ? settings.excludedMain
      : []),
  ]);
  const coverageCandidates = Array.from(
    { length: 20 },
    (_, index) => index + 1,
  ).filter((number) => !globallyUnavailableMain.has(number));
  settings.priorityMain
    .filter((number) => coverageCandidates.includes(number))
    .forEach((number) => {
      weights[number] = Math.max(1, weights[number] || 1) * 4;
    });
  const rows = [];
  const keys = new Set();
  const coverage = new Set();
  const extraUsage = {};
  let attempts = 0;
  const attemptLimit = Math.max(5_000, settings.count * 1_500);

  while (rows.length < settings.count && attempts < attemptLimit) {
    attempts += 1;
    const includedMain = weightedSample(
      settings.requiredMain,
      settings.requiredMainCount,
      {},
      random,
    );
    const excludedFromMainPool = settings.requiredMain.filter(
      (number) => !includedMain.includes(number),
    );
    const excludedMain = weightedSample(
      settings.excludedMain,
      settings.excludedMainCount,
      {},
      random,
    );
    const rowExcludedMain = new Set([
      ...excludedFromMainPool,
      ...excludedMain,
    ]);
    const allowedMain = Array.from(
      { length: 20 },
      (_, index) => index + 1,
    ).filter((number) => !rowExcludedMain.has(number));
    const selected = new Set(includedMain);

    if (settings.coverAll) {
      const uncovered = allowedMain.filter((number) => !coverage.has(number));
      const remainingRows = Math.max(1, settings.count - rows.length);
      const coverageTarget = Math.min(
        settings.mainCount - selected.size,
        Math.max(1, Math.ceil(uncovered.length / remainingRows)),
      );
      weightedSample(
        uncovered.filter((number) => !selected.has(number)),
        coverageTarget,
        weights,
        random,
      ).forEach((number) => selected.add(number));
    }

    const patternPool =
      settings.strategy === "pairs"
        ? stats.topPairs
        : settings.strategy === "triples"
          ? stats.topTriples
          : [];
    if (patternPool.length) {
      const pattern =
        patternPool[Math.floor(random() * Math.min(12, patternPool.length))];
      pattern?.numbers.forEach((number) => {
        if (
          selected.size < settings.mainCount &&
          allowedMain.includes(number)
        ) {
          selected.add(number);
        }
      });
    }

    const remaining = allowedMain.filter((number) => !selected.has(number));
    weightedSample(
      remaining,
      settings.mainCount - selected.size,
      weights,
      random,
    ).forEach((number) => selected.add(number));

    const main = [...selected].sort((a, b) => a - b);
    if (!isTicketWithinLimits(main, settings)) continue;
    if (
      rows.some(
        (row) => overlapCount(row.main, main) > settings.maxOverlap,
      )
    ) {
      continue;
    }

    const includedExtra = weightedSample(
      settings.requiredExtra,
      settings.requiredExtraCount,
      {},
      random,
    );
    const excludedFromExtraPool = settings.requiredExtra.filter(
      (number) => !includedExtra.includes(number),
    );
    const appliedExcludedExtra = weightedSample(
      settings.excludedExtra,
      settings.excludedExtraCount,
      {},
      random,
    );
    const rowExcludedExtra = new Set([
      ...excludedFromExtraPool,
      ...appliedExcludedExtra,
    ]);
    const allowedExtra = Array.from(
      { length: 4 },
      (_, index) => index + 1,
    ).filter((number) => !rowExcludedExtra.has(number));
    const extra = balancedExtraSelection(
      allowedExtra,
      includedExtra,
      settings.extraCount,
      extraUsage,
      random,
    );
    const key = `${main.join("-")}|${extra.join("-")}`;
    if (keys.has(key)) continue;
    keys.add(key);
    main.forEach((number) => coverage.add(number));
    rows.push({
      main,
      extra,
      combinations: systemCombinations(main.length, extra.length),
      appliedRules: {
        includedMain,
        excludedMain,
        includedExtra,
        excludedExtra: appliedExcludedExtra,
      },
    });
  }

  if (rows.length < settings.count) {
    warnings.push(
      `Создано ${rows.length} из ${settings.count}: ослабьте ограничения пересечений, чётности или диапазонов.`,
    );
  }
  if (settings.coverAll && coverage.size < coverageCandidates.length) {
    warnings.push(
      `Покрыто ${coverage.size} из ${coverageCandidates.length} доступных основных чисел.`,
    );
  }
  if (!draws.length && ["hot", "cold", "overdue", "pairs", "triples", "mixed"].includes(settings.strategy)) {
    warnings.push("Архив пуст: статистическая стратегия работает как равномерная случайная.");
  }

  return {
    rows,
    warnings,
    coverage: [...coverage].sort((a, b) => a - b),
    stats,
    attempts,
  };
}

export function parseTicketLines(text) {
  const tickets = [];
  const errors = [];
  String(text ?? "")
    .split(/\r?\n/)
    .forEach((rawLine, index) => {
      const line = rawLine.trim();
      if (!line || /(?:основн|main|комбинац)/i.test(line)) return;
      const parts = line.includes("|")
        ? line.split("|")
        : line.includes(";")
          ? line.split(";")
          : [line];
      let mainPart = parts[0];
      let extraPart = parts[1] ?? "";
      if (parts.length >= 3 && parseNumberList(parts[1], 1, 20).length >= 8) {
        mainPart = parts[1];
        extraPart = parts[2];
      }

      let main = parseNumberList(mainPart, 1, 20);
      let extra = parseNumberList(extraPart, 1, 4);
      if (parts.length === 1) {
        const all = String(line).match(/\d+/g)?.map(Number) ?? [];
        if (all.length >= 9) {
          main = [...new Set(all.slice(0, -1))].sort((a, b) => a - b);
          extra = [all.at(-1)].filter((number) => number >= 1 && number <= 4);
        }
      }

      const problems = [];
      if (main.length < 8 || main.length > 20) {
        problems.push("основных чисел должно быть 8–20");
      }
      if (extra.length < 1 || extra.length > 4) {
        problems.push("дополнительных чисел должно быть 1–4");
      }
      if (problems.length) {
        errors.push({ line: index + 1, message: problems.join("; "), source: line });
      } else {
        tickets.push({
          main,
          extra,
          combinations: systemCombinations(main.length, extra.length),
          sourceLine: index + 1,
        });
      }
    });
  return { tickets, errors };
}

function categoryIndex(mainHits, extraHits) {
  return PAYOUT_CATEGORIES.indexOf(`${mainHits} + ${extraHits}`);
}

export function evaluateSystemTicket(ticket, draw, payouts) {
  const selectedWinningMain = ticket.main.filter((number) =>
    draw.main.includes(number),
  ).length;
  const selectedLosingMain = ticket.main.length - selectedWinningMain;
  const hasWinningExtra = ticket.extra.includes(Number(draw.extra));
  const winningExtraChoices = hasWinningExtra ? 1 : 0;
  const losingExtraChoices = ticket.extra.length - winningExtraChoices;
  const breakdown = [];
  let prize = 0;

  for (let mainHits = 8; mainHits >= 4; mainHits -= 1) {
    const mainWays =
      choose(selectedWinningMain, mainHits) *
      choose(selectedLosingMain, 8 - mainHits);
    for (const extraHits of [1, 0]) {
      const index = categoryIndex(mainHits, extraHits);
      if (index < 0) continue;
      const extraWays = extraHits ? winningExtraChoices : losingExtraChoices;
      const count = mainWays * extraWays;
      if (!count) continue;
      const amount = Number(payouts[index] || 0);
      breakdown.push({
        category: PAYOUT_CATEGORIES[index],
        count,
        amount,
        total: amount * count,
      });
      prize += amount * count;
    }
  }

  return {
    mainMatches: selectedWinningMain,
    extraMatched: hasWinningExtra,
    combinations: systemCombinations(ticket.main.length, ticket.extra.length),
    breakdown,
    prize,
  };
}

export function evaluateTickets(tickets, draw, payouts, price) {
  const results = tickets.map((ticket, index) => ({
    index: index + 1,
    ticket,
    ...evaluateSystemTicket(ticket, draw, payouts),
  }));
  const combinations = results.reduce((sum, row) => sum + row.combinations, 0);
  const cost = combinations * Number(price || 0);
  const prize = results.reduce((sum, row) => sum + row.prize, 0);
  return {
    results,
    combinations,
    cost,
    prize,
    profit: prize - cost,
    roi: cost > 0 ? ((prize - cost) / cost) * 100 : 0,
  };
}

function numberMask(values, maxNumber) {
  let mask = 0;
  for (const value of values) {
    const number = Number(value);
    if (number >= 1 && number <= maxNumber) {
      mask |= 1 << (number - 1);
    }
  }
  return mask;
}

function bitCount(value) {
  let bits = value >>> 0;
  bits -= (bits >>> 1) & 0x55555555;
  bits = (bits & 0x33333333) + ((bits >>> 2) & 0x33333333);
  return (((bits + (bits >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

export function analyzeTicketsAgainstArchive(
  tickets,
  draws,
  payouts,
  price,
) {
  const combinationsPerDraw = tickets.reduce(
    (sum, ticket) =>
      sum + systemCombinations(ticket.main.length, ticket.extra.length),
    0,
  );
  const costPerDraw = combinationsPerDraw * Number(price || 0);
  const categoryTotals = PAYOUT_CATEGORIES.map((category, index) => ({
    category,
    count: 0,
    amount: Number(payouts[index] || 0),
    total: 0,
  }));
  const matchDistribution = {};
  const drawResults = [];
  const preparedTickets = tickets.map((ticket) => ({
    mainMask: numberMask(ticket.main, 20),
    extraMask: numberMask(ticket.extra, 4),
    mainLength: new Set(ticket.main.map(Number)).size,
    extraLength: new Set(ticket.extra.map(Number)).size,
  }));
  const outcomeCache = new Map();
  const outcomeFor = (ticket, mainMatches, extraMatched) => {
    const key = `${ticket.mainLength}|${ticket.extraLength}|${mainMatches}|${Number(extraMatched)}`;
    const cached = outcomeCache.get(key);
    if (cached) return cached;
    const categoryCounts = new Uint32Array(PAYOUT_CATEGORIES.length);
    const losingMain = ticket.mainLength - mainMatches;
    const winningExtraChoices = extraMatched ? 1 : 0;
    const losingExtraChoices =
      ticket.extraLength - winningExtraChoices;
    let prize = 0;
    for (let mainHits = 8; mainHits >= 4; mainHits -= 1) {
      const mainWays =
        choose(mainMatches, mainHits) *
        choose(losingMain, 8 - mainHits);
      for (const extraHits of [1, 0]) {
        const index = categoryIndex(mainHits, extraHits);
        if (index < 0) continue;
        const extraWays = extraHits
          ? winningExtraChoices
          : losingExtraChoices;
        const count = mainWays * extraWays;
        if (!count) continue;
        categoryCounts[index] += count;
        prize += count * Number(payouts[index] || 0);
      }
    }
    const outcome = { prize, categoryCounts };
    outcomeCache.set(key, outcome);
    return outcome;
  };
  let totalPrize = 0;
  let winningDrawCount = 0;
  let ticketChecks = 0;
  const dailyGroups = new Map();

  for (const draw of draws) {
    const drawMainMask = numberMask(draw.main, 20);
    const drawExtraMask = numberMask([draw.extra], 4);
    let drawPrize = 0;
    let winningTickets = 0;
    let maxMainMatches = 0;
    let extraMatched = false;

    for (const ticket of preparedTickets) {
      const mainMatches = bitCount(ticket.mainMask & drawMainMask);
      const hasExtraMatch = Boolean(ticket.extraMask & drawExtraMask);
      const outcome = outcomeFor(ticket, mainMatches, hasExtraMatch);
      ticketChecks += 1;
      maxMainMatches = Math.max(maxMainMatches, mainMatches);
      extraMatched ||= hasExtraMatch;
      const matchKey = `${mainMatches}+${hasExtraMatch ? 1 : 0}`;
      matchDistribution[matchKey] =
        (matchDistribution[matchKey] || 0) + 1;
      if (outcome.prize > 0) winningTickets += 1;
      drawPrize += outcome.prize;

      for (let index = 0; index < categoryTotals.length; index += 1) {
        const count = outcome.categoryCounts[index];
        if (!count) continue;
        categoryTotals[index].count += count;
        categoryTotals[index].total +=
          count * categoryTotals[index].amount;
      }
    }

    if (drawPrize > 0) winningDrawCount += 1;
    totalPrize += drawPrize;
    const day = archiveDay(draw.date);
    const drawResult = {
      drawNum: draw.drawNum,
      numericDrawNum: /^\d+$/.test(String(draw.drawNum))
        ? Number(draw.drawNum)
        : Number.NaN,
      date: draw.date,
      dayKey: day?.key || "",
      dayLabel: day?.label || "Без даты",
      dayTimestamp: day?.timestamp || 0,
      prize: drawPrize,
      profit: drawPrize - costPerDraw,
      maxMainMatches,
      extraMatched,
      winningTickets,
    };
    drawResults.push(drawResult);

    const dayKey = day?.key || "undated";
    let daily = dailyGroups.get(dayKey);
    if (!daily) {
      daily = {
        key: dayKey,
        label: day?.label || "Без даты",
        timestamp: day?.timestamp || 0,
        drawCount: 0,
        winningDrawCount: 0,
        totalCost: 0,
        totalPrize: 0,
        profit: 0,
      };
      dailyGroups.set(dayKey, daily);
    }
    daily.drawCount += 1;
    daily.winningDrawCount += drawPrize > 0 ? 1 : 0;
    daily.totalCost += costPerDraw;
    daily.totalPrize += drawPrize;
    daily.profit += drawPrize - costPerDraw;
  }

  const totalCost = costPerDraw * draws.length;
  const profit = totalPrize - totalCost;
  const bestDraws = [...drawResults]
    .sort(
      (left, right) =>
        right.prize - left.prize ||
        right.maxMainMatches - left.maxMainMatches ||
        Number(right.extraMatched) - Number(left.extraMatched) ||
        (Number.isFinite(left.numericDrawNum) &&
        Number.isFinite(right.numericDrawNum)
          ? right.numericDrawNum - left.numericDrawNum
          : String(right.drawNum).localeCompare(String(left.drawNum), "ru", {
              numeric: true,
            })),
    )
    .slice(0, 100)
    .map(
      ({ numericDrawNum: _numericDrawNum, dayTimestamp: _dayTimestamp, ...draw }) =>
        draw,
    );
  const dailyResults = [...dailyGroups.values()]
    .sort(
      (left, right) =>
        right.timestamp - left.timestamp ||
        right.label.localeCompare(left.label, "ru", { numeric: true }),
    )
    .map((day) => ({
      ...day,
      roi: day.totalCost > 0 ? (day.profit / day.totalCost) * 100 : 0,
    }));
  const recentDraws = drawResults
    .sort(
      (left, right) =>
        right.dayTimestamp - left.dayTimestamp ||
        (Number.isFinite(left.numericDrawNum) &&
        Number.isFinite(right.numericDrawNum)
          ? right.numericDrawNum - left.numericDrawNum
          : String(right.drawNum).localeCompare(String(left.drawNum), "ru", {
              numeric: true,
            })),
    )
    .map(
      ({ numericDrawNum: _numericDrawNum, dayTimestamp: _dayTimestamp, ...draw }) =>
        draw,
    );

  return {
    drawCount: draws.length,
    ticketCount: tickets.length,
    ticketChecks,
    combinationsPerDraw,
    costPerDraw,
    totalCost,
    totalPrize,
    profit,
    roi: totalCost > 0 ? (profit / totalCost) * 100 : 0,
    winningDrawCount,
    losingDrawCount: draws.length - winningDrawCount,
    categoryTotals,
    matchDistribution,
    bestDraws,
    dailyResults,
    drawResults: recentDraws,
  };
}
