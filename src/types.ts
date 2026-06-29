export type AverageType = "EMA" | "SMA";
export type Direction = "up" | "down";
export type ValueAvgState =
  | "Bullish expansion"
  | "Bearish expansion"
  | "Compression / catch-up"
  | "Snap-through"
  | "Neutral";
export type ArrowClassification =
  | "Fresh / after forgotten memory"
  | "Reinforcement"
  | "Defeat";

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface IndicatorSettings {
  fastLength: number;
  slowLength: number;
  macdLength: number;
  memoryLength: number;
  averageType: AverageType;
}

export interface MemoryValue {
  index: number;
  time: string;
  value: number;
}

export interface CalculatedCandle extends Candle {
  index: number;
  fastAverage: number | null;
  slowAverage: number | null;
  ema8: number | null;
  value: number | null;
  avg: number | null;
  diff: number | null;
  valueAvgState: ValueAvgState;
  upperBand: number | null;
  lowerBand: number | null;
  upArrow: boolean;
  downArrow: boolean;
  memory: MemoryValue[];
  classification: ArrowClassification | null;
}
