import type { Candle } from "./types";

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createSampleCandles(count = 120): Candle[] {
  const random = mulberry32(74291);
  const start = new Date("2026-05-11T09:30:00Z");
  let previousClose = 101.4;

  return Array.from({ length: count }, (_, index) => {
    const wave = Math.sin(index / 5.8) * 0.38 + Math.sin(index / 15) * 0.2;
    const regime =
      index > 26 && index < 40
        ? 0.38
        : index > 63 && index < 79
          ? -0.42
          : index > 94
            ? 0.22
            : 0;
    const move = wave * 0.26 + regime + (random() - 0.5) * 0.62;
    const open = previousClose + (random() - 0.5) * 0.18;
    const close = open + move;
    const high = Math.max(open, close) + 0.12 + random() * 0.34;
    const low = Math.min(open, close) - 0.12 - random() * 0.34;
    const time = new Date(start.getTime() + index * 5 * 60 * 1000);
    previousClose = close;

    return {
      time: time.toISOString(),
      open: Number(open.toFixed(4)),
      high: Number(high.toFixed(4)),
      low: Number(low.toFixed(4)),
      close: Number(close.toFixed(4)),
    };
  });
}
