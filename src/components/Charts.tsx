import type { CalculatedCandle } from "../types";

const WIDTH = 1200;
const LEFT = 58;
const RIGHT = 18;
const TOP = 28;
const BOTTOM = 26;

interface SharedChartProps {
  rows: CalculatedCandle[];
  activeIndex: number;
  accent: string;
  onHover: (index: number) => void;
}

interface Scale {
  min: number;
  max: number;
  y: (value: number) => number;
}

function createScale(values: number[], height: number): Scale {
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const span = rawMax - rawMin || Math.max(Math.abs(rawMax) * 0.05, 1);
  const padding = span * 0.12;
  const min = rawMin - padding;
  const max = rawMax + padding;
  const chartHeight = height - TOP - BOTTOM;

  return {
    min,
    max,
    y: (value) => TOP + ((max - value) / (max - min)) * chartHeight,
  };
}

function formatAxis(value: number) {
  if (Math.abs(value) >= 100) return value.toFixed(1);
  if (Math.abs(value) >= 1) return value.toFixed(2);
  return value.toFixed(4);
}

function pathFor(
  rows: CalculatedCandle[],
  getValue: (row: CalculatedCandle) => number | null,
  x: (index: number) => number,
  y: (value: number) => number,
) {
  let path = "";
  let drawing = false;
  rows.forEach((row, index) => {
    const value = getValue(row);
    if (value === null || !Number.isFinite(value)) {
      drawing = false;
      return;
    }
    path += `${drawing ? "L" : "M"} ${x(index).toFixed(2)} ${y(value).toFixed(2)} `;
    drawing = true;
  });
  return path.trim();
}

function ChartGrid({ scale, height }: { scale: Scale; height: number }) {
  const ticks = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const value = scale.max - (scale.max - scale.min) * ratio;
    return { value, y: TOP + (height - TOP - BOTTOM) * ratio };
  });

  return (
    <g className="chart-grid">
      {ticks.map((tick) => (
        <g key={tick.y}>
          <line x1={LEFT} x2={WIDTH - RIGHT} y1={tick.y} y2={tick.y} />
          <text x={LEFT - 9} y={tick.y + 4} textAnchor="end">
            {formatAxis(tick.value)}
          </text>
        </g>
      ))}
    </g>
  );
}

function SharedHighlights({
  rows,
  activeIndex,
  height,
  x,
  cellWidth,
}: {
  rows: CalculatedCandle[];
  activeIndex: number;
  height: number;
  x: (index: number) => number;
  cellWidth: number;
}) {
  const active = rows[activeIndex];
  if (!active) return null;
  const isArrow = active.upArrow || active.downArrow;
  const memoryStart = active.memory[0]?.index;
  const memoryWidth =
    memoryStart === undefined ? 0 : x(activeIndex) - x(memoryStart);

  return (
    <g className="shared-highlights">
      {memoryStart !== undefined && (
        <>
          <rect
            className={isArrow ? "memory-window arrow-memory" : "memory-window"}
            x={x(memoryStart) - cellWidth / 2}
            y={TOP}
            width={memoryWidth}
            height={height - TOP - BOTTOM}
          />
          <text
            className="memory-label"
            x={x(memoryStart) - cellWidth / 2 + 8}
            y={TOP + 15}
          >
            previous {active.memory.length} Diff values
          </text>
        </>
      )}
      <line
        className="active-crosshair"
        x1={x(activeIndex)}
        x2={x(activeIndex)}
        y1={TOP}
        y2={height - BOTTOM}
      />
    </g>
  );
}

function HoverTargets({
  rows,
  height,
  x,
  cellWidth,
  onHover,
}: {
  rows: CalculatedCandle[];
  height: number;
  x: (index: number) => number;
  cellWidth: number;
  onHover: (index: number) => void;
}) {
  return (
    <g className="hover-targets">
      {rows.map((row, index) => (
        <rect
          key={row.index}
          x={x(index) - cellWidth / 2}
          y={TOP}
          width={cellWidth}
          height={height - TOP - BOTTOM}
          onMouseEnter={() => onHover(index)}
          onPointerMove={() => onHover(index)}
          onClick={() => onHover(index)}
        />
      ))}
    </g>
  );
}

export function PriceChart({
  rows,
  activeIndex,
  accent,
  onHover,
}: SharedChartProps) {
  const height = 340;
  const plotWidth = WIDTH - LEFT - RIGHT;
  const cellWidth = plotWidth / rows.length;
  const bodyWidth = Math.max(2, Math.min(7, cellWidth * 0.62));
  const x = (index: number) => LEFT + (index + 0.5) * cellWidth;
  const scale = createScale(
    rows.flatMap((row) => [row.high, row.low, row.fastAverage ?? row.close, row.slowAverage ?? row.close]),
    height,
  );
  const active = rows[activeIndex];

  return (
    <svg
      className="chart"
      role="img"
      aria-label="Price candlesticks with fast and slow averages and arrow signals"
      viewBox={`0 0 ${WIDTH} ${height}`}
    >
      <ChartGrid scale={scale} height={height} />
      <SharedHighlights
        rows={rows}
        activeIndex={activeIndex}
        height={height}
        x={x}
        cellWidth={cellWidth}
      />
      <g className="candles">
        {rows.map((row, index) => {
          const rising = row.close >= row.open;
          const top = scale.y(Math.max(row.open, row.close));
          const bottom = scale.y(Math.min(row.open, row.close));
          return (
            <g key={row.index} className={rising ? "candle-up" : "candle-down"}>
              <line x1={x(index)} x2={x(index)} y1={scale.y(row.high)} y2={scale.y(row.low)} />
              <rect
                x={x(index) - bodyWidth / 2}
                y={top}
                width={bodyWidth}
                height={Math.max(1.4, bottom - top)}
                rx="0.8"
              />
            </g>
          );
        })}
      </g>
      <path
        className="series-line fast-line"
        d={pathFor(rows, (row) => row.fastAverage, x, scale.y)}
      />
      <path
        className="series-line slow-line"
        d={pathFor(rows, (row) => row.slowAverage, x, scale.y)}
      />
      <g className="arrows" style={{ color: accent }}>
        {rows.map((row, index) => {
          if (row.upArrow) {
            const y = scale.y(row.low) + 16;
            return (
              <path
                key={`up-${row.index}`}
                className="arrow-marker"
                d={`M ${x(index)} ${y - 12} L ${x(index) - 7} ${y} L ${x(index) + 7} ${y} Z`}
              />
            );
          }
          if (row.downArrow) {
            const y = scale.y(row.high) - 16;
            return (
              <path
                key={`down-${row.index}`}
                className="arrow-marker"
                d={`M ${x(index)} ${y + 12} L ${x(index) - 7} ${y} L ${x(index) + 7} ${y} Z`}
              />
            );
          }
          return null;
        })}
      </g>
      {active && (
        <text className="active-time" x={WIDTH - RIGHT} y={height - 7} textAnchor="end">
          {active.time}
        </text>
      )}
      <HoverTargets rows={rows} height={height} x={x} cellWidth={cellWidth} onHover={onHover} />
    </svg>
  );
}

interface LineSeries {
  label: string;
  className: string;
  getValue: (row: CalculatedCandle) => number | null;
}

interface LineChartProps extends SharedChartProps {
  height?: number;
  series: LineSeries[];
  showBreaks?: boolean;
  showHistogram?: boolean;
}

export function LineChart({
  rows,
  activeIndex,
  accent,
  onHover,
  series,
  showBreaks = false,
  showHistogram = false,
  height = 220,
}: LineChartProps) {
  const plotWidth = WIDTH - LEFT - RIGHT;
  const cellWidth = plotWidth / rows.length;
  const x = (index: number) => LEFT + (index + 0.5) * cellWidth;
  const values = rows.flatMap((row) =>
    series
      .map((item) => item.getValue(row))
      .filter((value): value is number => value !== null),
  );
  const scale = createScale(values.length ? [...values, 0] : [0, 1], height);
  const zeroY = scale.y(0);
  const histogramWidth = Math.max(2, Math.min(8, cellWidth * 0.72));
  const active = rows[activeIndex];
  const beatenMemory =
    active?.upArrow && active.memory.length
      ? active.memory.reduce((highest, item) =>
          item.value > highest.value ? item : highest,
        )
      : active?.downArrow && active.memory.length
        ? active.memory.reduce((lowest, item) =>
            item.value < lowest.value ? item : lowest,
          )
        : null;

  return (
    <svg
      className="chart"
      role="img"
      aria-label={`${series.map((item) => item.label).join(", ")} chart`}
      viewBox={`0 0 ${WIDTH} ${height}`}
    >
      <ChartGrid scale={scale} height={height} />
      {scale.min < 0 && scale.max > 0 && (
        <line
          className="zero-line"
          x1={LEFT}
          x2={WIDTH - RIGHT}
          y1={scale.y(0)}
          y2={scale.y(0)}
        />
      )}
      {showHistogram && (
        <g className="diff-histogram">
          {rows.map((row, index) => {
            if (row.diff === null) return null;
            const previousDiff = rows[index - 1]?.diff;
            const expanding =
              previousDiff === null ||
              previousDiff === undefined ||
              Math.abs(row.diff) >= Math.abs(previousDiff);
            const direction = row.diff >= 0 ? "positive" : "negative";
            const movement = expanding ? "growing" : "shrinking";
            const barY = scale.y(row.diff);

            return (
              <rect
                key={`histogram-${row.index}`}
                className={`histogram-bar histogram-${direction}-${movement} ${
                  row.index === activeIndex ? "histogram-active" : ""
                }`}
                x={x(index) - histogramWidth / 2}
                y={Math.min(zeroY, barY)}
                width={histogramWidth}
                height={Math.max(1, Math.abs(zeroY - barY))}
                rx="1"
              >
                <title>
                  Diff {row.diff.toFixed(5)} · {direction} and {movement}
                </title>
              </rect>
            );
          })}
        </g>
      )}
      <SharedHighlights
        rows={rows}
        activeIndex={activeIndex}
        height={height}
        x={x}
        cellWidth={cellWidth}
      />
      {series.map((item) => (
        <path
          key={item.label}
          className={`series-line ${item.className}`}
          d={pathFor(rows, item.getValue, x, scale.y)}
        />
      ))}
      {showHistogram && beatenMemory && active.diff !== null && (
        <g className="beaten-record">
          <line
            x1={x(beatenMemory.index)}
            y1={scale.y(beatenMemory.value)}
            x2={x(active.index)}
            y2={scale.y(active.diff)}
          />
          <circle
            className="beaten-record-source"
            cx={x(beatenMemory.index)}
            cy={scale.y(beatenMemory.value)}
            r="7"
          />
          <circle
            className="beaten-record-current"
            cx={x(active.index)}
            cy={scale.y(active.diff)}
            r="6"
            style={{ color: accent }}
          />
          <text
            x={x(beatenMemory.index) + 9}
            y={scale.y(beatenMemory.value) - 9}
          >
            {active.upArrow ? "beaten UpperBand" : "beaten LowerBand"}
          </text>
        </g>
      )}
      {showBreaks && (
        <g className="break-markers" style={{ color: accent }}>
          {rows.map((row, index) => {
            if (!row.upArrow && !row.downArrow) return null;
            const value = row.diff;
            if (value === null) return null;
            return (
              <circle
                key={row.index}
                cx={x(index)}
                cy={scale.y(value)}
                r={row.index === activeIndex ? 7 : 4.5}
              />
            );
          })}
        </g>
      )}
      <HoverTargets rows={rows} height={height} x={x} cellWidth={cellWidth} onHover={onHover} />
    </svg>
  );
}
