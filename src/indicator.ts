import type {
  ArrowClassification,
  AverageType,
  CalculatedCandle,
  Candle,
  Direction,
  IndicatorSettings,
  ValueAvgState,
} from "./types";

function ema(values: Array<number | null>, length: number): Array<number | null> {
  const alpha = 2 / (length + 1);
  let previous: number | null = null;

  return values.map((value) => {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    previous = previous === null ? value : alpha * value + (1 - alpha) * previous;
    return previous;
  });
}

function sma(values: Array<number | null>, length: number): Array<number | null> {
  return values.map((_, index) => {
    const start = index - length + 1;
    if (start < 0) {
      return null;
    }

    const window = values.slice(start, index + 1);
    if (window.some((value) => value === null)) {
      return null;
    }

    return window.reduce<number>((sum, value) => sum + (value ?? 0), 0) / length;
  });
}

function movingAverage(
  values: Array<number | null>,
  length: number,
  averageType: AverageType,
): Array<number | null> {
  return averageType === "EMA" ? ema(values, length) : sma(values, length);
}

function classifyArrow(
  direction: Direction,
  index: number,
  memoryLength: number,
  arrows: Array<{ index: number; direction: Direction }>,
): ArrowClassification {
  const remembered = arrows.filter(
    (arrow) => arrow.index >= index - memoryLength && arrow.index < index,
  );

  if (remembered.some((arrow) => arrow.direction !== direction)) {
    return "Defeat";
  }

  if (remembered.some((arrow) => arrow.direction === direction)) {
    return "Reinforcement";
  }

  return "Fresh / after forgotten memory";
}

function classifyValueAvgState(
  index: number,
  values: Array<number | null>,
  avgs: Array<number | null>,
  diffs: Array<number | null>,
): ValueAvgState {
  const currentDiff = diffs[index];
  const previousDiff = diffs[index - 1];
  const currentValue = values[index];
  const previousValue = values[index - 1];
  const currentAvg = avgs[index];
  const previousAvg = avgs[index - 1];

  if (
    currentDiff === null ||
    previousDiff === null ||
    currentValue === null ||
    previousValue === null ||
    currentAvg === null ||
    previousAvg === null
  ) {
    return "Neutral";
  }

  const currentDistance = Math.abs(currentDiff);
  const previousDistance = Math.abs(previousDiff);
  const distanceChange = currentDistance - previousDistance;
  const reference = Math.max(currentDistance, previousDistance, 0.000001);
  const materialChange = reference * 0.08;
  const valueChange = currentValue - previousValue;
  const avgChange = currentAvg - previousAvg;
  const avgMovedTowardValue =
    previousDiff !== 0 && Math.sign(avgChange) === Math.sign(previousDiff);

  if (
    distanceChange < -materialChange &&
    avgMovedTowardValue &&
    Math.abs(avgChange) >= Math.abs(valueChange) * 0.45
  ) {
    return "Catch-up";
  }

  if (distanceChange > materialChange) {
    return "Expansion";
  }

  if (distanceChange < -materialChange) {
    return "Compression";
  }

  return "Neutral";
}

export function calculateIndicator(
  candles: Candle[],
  settings: IndicatorSettings,
): CalculatedCandle[] {
  const closes = candles.map((candle) => candle.close);
  const closeValues = closes.map((value) => value as number | null);
  const fast = movingAverage(closeValues, settings.fastLength, settings.averageType);
  const slow = movingAverage(closeValues, settings.slowLength, settings.averageType);
  const ema8 = ema(closeValues, 8);
  const value = closes.map((_, index) => {
    if (fast[index] === null || slow[index] === null) {
      return null;
    }
    return fast[index]! - slow[index]!;
  });
  const avg = movingAverage(value, settings.macdLength, settings.averageType);
  const diff = value.map((item, index) => {
    if (item === null || avg[index] === null) {
      return null;
    }
    return item - avg[index]!;
  });

  const rows: CalculatedCandle[] = [];
  const arrows: Array<{ index: number; direction: Direction }> = [];

  candles.forEach((candle, index) => {
    const memoryStart = index - settings.memoryLength;
    const memoryDiffs = diff
      .slice(Math.max(0, memoryStart), index)
      .map((item, offset) => ({
        index: Math.max(0, memoryStart) + offset,
        time: candles[Math.max(0, memoryStart) + offset].time,
        value: item,
      }))
      .filter(
        (item): item is { index: number; time: string; value: number } =>
          item.value !== null,
      );
    const hasFullMemory =
      index >= settings.memoryLength && memoryDiffs.length === settings.memoryLength;
    const upperBand = hasFullMemory
      ? Math.max(...memoryDiffs.map((item) => item.value))
      : null;
    const lowerBand = hasFullMemory
      ? Math.min(...memoryDiffs.map((item) => item.value))
      : null;

    const previousRow = rows[index - 1];
    const currentDiff = diff[index];
    const upArrow =
      currentDiff !== null &&
      upperBand !== null &&
      previousRow?.diff !== null &&
      previousRow?.diff !== undefined &&
      previousRow.upperBand !== null &&
      currentDiff >= upperBand &&
      previousRow.diff < previousRow.upperBand;
    const downArrow =
      currentDiff !== null &&
      lowerBand !== null &&
      previousRow?.diff !== null &&
      previousRow?.diff !== undefined &&
      previousRow.lowerBand !== null &&
      currentDiff <= lowerBand &&
      previousRow.diff > previousRow.lowerBand;

    const direction: Direction | null = upArrow ? "up" : downArrow ? "down" : null;
    const classification = direction
      ? classifyArrow(direction, index, settings.memoryLength, arrows)
      : null;

    rows.push({
      ...candle,
      index,
      fastAverage: fast[index],
      slowAverage: slow[index],
      ema8: ema8[index],
      value: value[index],
      avg: avg[index],
      diff: currentDiff,
      valueAvgState: classifyValueAvgState(index, value, avg, diff),
      upperBand,
      lowerBand,
      upArrow,
      downArrow,
      memory: memoryDiffs,
      classification,
    });

    if (direction) {
      arrows.push({ index, direction });
    }
  });

  return rows;
}

function parseNumber(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}: "${String(value)}"`);
  }
  return parsed;
}

function normalizeCandle(
  row: Record<string, unknown>,
  index: number,
): Candle {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.toLowerCase().trim(), value]),
  );
  const close = parseNumber(normalized.close ?? normalized.c, "close");
  const open = parseNumber(normalized.open ?? normalized.o ?? close, "open");
  const high = parseNumber(
    normalized.high ?? normalized.h ?? Math.max(open, close),
    "high",
  );
  const low = parseNumber(
    normalized.low ?? normalized.l ?? Math.min(open, close),
    "low",
  );
  const timeValue =
    normalized.time ??
    normalized.timestamp ??
    normalized.date ??
    normalized.datetime ??
    `Candle ${index + 1}`;

  return {
    time: String(timeValue),
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close,
  };
}

export function parseCandleData(input: string): Candle[] {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Paste CSV or JSON candle data first.");
  }

  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as unknown;
    const rows = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed !== null && "candles" in parsed
        ? (parsed as { candles: unknown }).candles
        : null;
    if (!Array.isArray(rows)) {
      throw new Error("JSON must be an array of candles or an object with a candles array.");
    }
    return rows.map((row, index) => {
      if (typeof row !== "object" || row === null) {
        throw new Error(`JSON row ${index + 1} is not an object.`);
      }
      return normalizeCandle(row as Record<string, unknown>, index);
    });
  }

  const lines = trimmed.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    throw new Error("CSV data needs a header and at least one candle.");
  }

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(delimiter).map((header) => header.trim());
  const hasHeader = headers.some((header) =>
    ["open", "high", "low", "close", "time", "date", "timestamp"].includes(
      header.toLowerCase(),
    ),
  );
  if (!hasHeader) {
    throw new Error("CSV must include a header row with at least a close column.");
  }

  return lines.slice(1).map((line, index) => {
    const values = line.split(delimiter);
    const row = Object.fromEntries(
      headers.map((header, columnIndex) => [header, values[columnIndex] ?? ""]),
    );
    return normalizeCandle(row, index);
  });
}
