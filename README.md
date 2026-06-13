# Arrow Memory Lab

Interactive React + TypeScript visualizer for the supplied Red and Pink ThinkScript
arrow indicators.

## What it shows

- Candlestick price chart with fast/slow averages and arrow signals
- Value versus Avg
- Diff versus UpperBand and LowerBand
- The exact previous N Diff values used for each threshold
- Arrow classifications: Fresh, Reinforcement, and Defeat
- CSV, TSV, and JSON OHLC import

## ThinkScript presets

- Red: memory length 4
- Pink: memory length 8

Both presets default to fast length 2, slow length 3, and MACD length 2.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The build creates:

- `docs/` for GitHub Pages and static hosting
- `Arrow-Memory-Lab.html` as a self-contained offline version

## Review notes

The core calculation is implemented in `src/indicator.ts`. The current candle is
excluded from the memory thresholds:

```text
UpperBand[i] = Highest(Diff[i-N ... i-1])
LowerBand[i] = Lowest(Diff[i-N ... i-1])
```
