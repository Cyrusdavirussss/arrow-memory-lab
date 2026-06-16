import { useEffect, useMemo, useState } from "react";
import { LineChart, PriceChart } from "../components/Charts";
import { calculateIndicator, parseCandleData } from "../indicator";
import { createSampleCandles } from "../sampleData";
import type {
  AverageType,
  CalculatedCandle,
  Candle,
  IndicatorSettings,
  ValueAvgState,
} from "../types";

type Preset = "Red" | "Pink";
type BreakLabel = "Small break" | "Medium break" | "Large break";
type SetupLabel = "Compression -> Expansion" | "Already extended" | "Choppy / unclear";

const presetConfig: Record<Preset, { memoryLength: number; accent: string }> = {
  Red: { memoryLength: 4, accent: "#ff4d61" },
  Pink: { memoryLength: 8, accent: "#ea88ff" },
};

const initialSettings: IndicatorSettings = {
  fastLength: 2,
  slowLength: 3,
  macdLength: 2,
  memoryLength: presetConfig.Red.memoryLength,
  averageType: "EMA",
};

function formatNumber(value: number | null | undefined, digits = 5) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "warming up";
  }
  return value.toFixed(digits);
}

function compactTime(time: string) {
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return time;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function signedNumber(value: number | null | undefined, digits = 5) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "warming up";
  }
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function delta(
  current: number | null | undefined,
  previous: number | null | undefined,
) {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined
  ) {
    return null;
  }
  return current - previous;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stateClass(state: ValueAvgState) {
  if (state === "Expansion") return "state-expansion";
  if (state === "Compression") return "state-compression";
  if (state === "Catch-up") return "state-catchup";
  return "state-neutral";
}

function classificationClass(classification: CalculatedCandle["classification"]) {
  if (classification === "Reinforcement") return "class-reinforcement";
  if (classification === "Defeat") return "class-defeat";
  return "class-fresh";
}

function breakLabelClass(label: BreakLabel) {
  if (label === "Large break") return "quality-large";
  if (label === "Medium break") return "quality-medium";
  return "quality-small";
}

function getBreakQuality(row: CalculatedCandle) {
  if (!row.upArrow && !row.downArrow) return null;
  const direction = row.upArrow ? "Up" : "Down";
  const thresholdName = row.upArrow ? "UpperBand" : "LowerBand";
  const threshold = row.upArrow ? row.upperBand : row.lowerBand;
  if (row.diff === null || threshold === null) return null;

  const beatAmount = row.upArrow ? row.diff - threshold : threshold - row.diff;
  const memoryValues = row.memory.map((item) => item.value);
  const memoryRange =
    memoryValues.length > 1
      ? Math.max(...memoryValues) - Math.min(...memoryValues)
      : Math.abs(threshold);
  const reference = Math.max(memoryRange, Math.abs(threshold) * 0.3, 0.000001);
  const ratio = beatAmount / reference;
  const label: BreakLabel =
    ratio >= 0.5 ? "Large break" : ratio >= 0.18 ? "Medium break" : "Small break";

  return {
    direction,
    thresholdName,
    threshold,
    beatAmount,
    label,
  };
}

function getPreArrowSetup(
  row: CalculatedCandle,
  rows: CalculatedCandle[],
  memoryLength: number,
) {
  if (!row.upArrow && !row.downArrow) return null;
  const previousRows = rows
    .slice(Math.max(0, row.index - memoryLength), row.index)
    .filter((item) => item.diff !== null && item.value !== null && item.avg !== null);
  const diffs = previousRows.map((item) => item.diff!);
  const absDiffs = diffs.map((item) => Math.abs(item));
  const avgAbsDiff = mean(absDiffs);
  const currentAbsDiff = Math.abs(row.diff ?? 0);
  const memoryRange = diffs.length
    ? Math.max(...diffs) - Math.min(...diffs)
    : currentAbsDiff;
  const previousAbsDiff = Math.abs(previousRows.at(-1)?.diff ?? 0);
  const nearZeroBefore =
    diffs.length > 0 &&
    avgAbsDiff <= Math.max(currentAbsDiff * 0.42, memoryRange * 0.38, 0.0008);
  const valueAvgCloseBefore = nearZeroBefore;
  const expandedSharply =
    currentAbsDiff >= Math.max(previousAbsDiff * 1.55, avgAbsDiff * 1.7, 0.0008);

  let label: SetupLabel = "Choppy / unclear";
  if (nearZeroBefore && valueAvgCloseBefore && expandedSharply) {
    label = "Compression -> Expansion";
  } else if (avgAbsDiff >= currentAbsDiff * 0.65 || previousAbsDiff >= currentAbsDiff * 0.65) {
    label = "Already extended";
  }

  return {
    label,
    nearZeroBefore,
    valueAvgCloseBefore,
    expandedSharply,
    avgAbsDiff,
    previousAbsDiff,
    memoryRange,
  };
}

function getEma8Context(row: CalculatedCandle, rows: CalculatedCandle[]) {
  if (row.ema8 === null) return null;
  const distance = row.close - row.ema8;
  const recentRows = rows.slice(Math.max(0, row.index - 5), row.index + 1);
  const touchedRecently = recentRows.some(
    (item) => item.ema8 !== null && item.low <= item.ema8 && item.high >= item.ema8,
  );
  const crossedRecently = recentRows.some((item, localIndex) => {
    if (localIndex === 0 || item.ema8 === null) return false;
    const previous = recentRows[localIndex - 1];
    if (previous.ema8 === null) return false;
    const previousDistance = previous.close - previous.ema8;
    const currentDistance = item.close - item.ema8;
    return previousDistance === 0 || currentDistance === 0 || Math.sign(previousDistance) !== Math.sign(currentDistance);
  });
  const averageRange = Math.max(
    mean(recentRows.map((item) => Math.max(0.0001, item.high - item.low))),
    0.0001,
  );
  const nearRoad = Math.abs(distance) <= averageRange * 0.5;

  return {
    distance,
    side: distance >= 0 ? "above EMA8" : "below EMA8",
    touchedRecently,
    crossedRecently,
    nearRoad,
  };
}

function getNoArrowExplanation(
  row: CalculatedCandle,
  previousRow: CalculatedCandle | undefined,
) {
  if (row.upArrow || row.downArrow) return null;

  const currentDiff = row.diff;
  const previousDiff = previousRow?.diff;
  const previousUpper = previousRow?.upperBand;
  const previousLower = previousRow?.lowerBand;

  if (currentDiff === null) {
    return "Diff is still warming up, so there is no threshold test yet.";
  }

  if (row.upperBand === null || row.lowerBand === null) {
    return `Not enough previous candles exist yet. Current memory has ${row.memory.length} Diff values, but the setting needs a full window.`;
  }

  const beatUpper = currentDiff >= row.upperBand;
  const beatLower = currentDiff <= row.lowerBand;
  const expanded =
    previousDiff !== null &&
    previousDiff !== undefined &&
    Math.abs(currentDiff) > Math.abs(previousDiff);

  if (!beatUpper && !beatLower) {
    return expanded
      ? "Diff was expanding, but it did not expand enough to break the remembered UpperBand or LowerBand."
      : "Diff was shrinking / compressing, so it stayed inside the remembered threshold.";
  }

  if (beatUpper) {
    return `Current Diff beat UpperBand, but the crossover rule failed. Needed previous Diff ${formatNumber(previousDiff)} < previous UpperBand ${formatNumber(previousUpper)}.`;
  }

  return `Current Diff beat LowerBand, but the crossover rule failed. Needed previous Diff ${formatNumber(previousDiff)} > previous LowerBand ${formatNumber(previousLower)}.`;
}

function buildVisibleStory(
  row: CalculatedCandle,
  previousRow: CalculatedCandle | undefined,
) {
  if (!previousRow) {
    return "This is the first candle, so the bridge is just starting. The app needs previous candles before it can compare Diff against memory.";
  }

  const closeChange = row.close - previousRow.close;
  const closeDirection =
    closeChange > 0 ? "higher" : closeChange < 0 ? "lower" : "unchanged";
  const valueChange = delta(row.value, previousRow.value);
  const ema2Change = delta(row.fastAverage, previousRow.fastAverage);
  const ema3Change = delta(row.slowAverage, previousRow.slowAverage);
  const diffChange = delta(row.diff, previousRow.diff);
  const movedAway =
    row.diff !== null &&
    previousRow.diff !== null &&
    Math.abs(row.diff) > Math.abs(previousRow.diff);
  const movedCloser =
    row.diff !== null &&
    previousRow.diff !== null &&
    Math.abs(row.diff) < Math.abs(previousRow.diff);
  const relationship = movedAway
    ? "moved away from Avg"
    : movedCloser
      ? "came closer to Avg"
      : "stayed about the same distance from Avg";
  const diffVerb = movedAway ? "expanded" : movedCloser ? "shrank" : "held steady";
  const arrowText = row.upArrow
    ? "An Up arrow printed."
    : row.downArrow
      ? "A Down arrow printed."
      : "No arrow printed.";

  return `This candle closed ${closeDirection} than the previous candle by ${signedNumber(closeChange, 4)}. EMA2 moved by ${signedNumber(ema2Change)} and EMA3 moved by ${signedNumber(ema3Change)}. This changed Value by ${signedNumber(valueChange)}. Value ${relationship}, so Diff ${diffVerb} by ${signedNumber(diffChange)}. ${arrowText}`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="setting-field">
      <span>{label}</span>
      <input
        type="number"
        min="1"
        max="100"
        value={value}
        onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))}
      />
    </label>
  );
}

function PanelHeader({
  eyebrow,
  title,
  description,
  legends,
}: {
  eyebrow: string;
  title: string;
  description: string;
  legends: Array<{ label: string; className: string }>;
}) {
  return (
    <header className="panel-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="legend">
        {legends.map((item) => (
          <span key={item.label}>
            <i className={item.className} />
            {item.label}
          </span>
        ))}
      </div>
    </header>
  );
}

function CandleImpactPanel({
  row,
  previousRow,
  settings,
}: {
  row: CalculatedCandle;
  previousRow: CalculatedCandle | undefined;
  settings: IndicatorSettings;
}) {
  const closeChange = previousRow ? row.close - previousRow.close : null;
  const valueChange = delta(row.value, previousRow?.value);
  const avgChange = delta(row.avg, previousRow?.avg);
  const diffChange = delta(row.diff, previousRow?.diff);
  const movedAway =
    row.diff !== null &&
    previousRow?.diff !== null &&
    previousRow?.diff !== undefined &&
    Math.abs(row.diff) > Math.abs(previousRow.diff);
  const movedCloser =
    row.diff !== null &&
    previousRow?.diff !== null &&
    previousRow?.diff !== undefined &&
    Math.abs(row.diff) < Math.abs(previousRow.diff);
  const closeText =
    closeChange === null
      ? "This is the first candle."
      : closeChange > 0
        ? "This candle closed higher than the previous candle."
        : closeChange < 0
          ? "This candle closed lower than the previous candle."
          : "This candle closed unchanged from the previous candle.";
  const relationshipText = movedAway
    ? "Value moved away from Avg, so Diff expanded."
    : movedCloser
      ? "Value came closer to Avg, so Diff shrank."
      : "Value stayed about the same distance from Avg, so Diff was neutral.";

  return (
    <section className="card bridge-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Visible candle impact</span>
          <h2>Candle Close Impact</h2>
        </div>
        <span className={`state-pill ${stateClass(row.valueAvgState)}`}>
          {row.valueAvgState}
        </span>
      </div>
      <div className="impact-grid">
        <Stat label="Current close" value={formatNumber(row.close, 4)} />
        <Stat label="Previous close" value={formatNumber(previousRow?.close, 4)} />
        <Stat label="Close change" value={signedNumber(closeChange, 4)} />
        <Stat
          label={`EMA2 change (${settings.fastLength})`}
          value={signedNumber(delta(row.fastAverage, previousRow?.fastAverage))}
        />
        <Stat
          label={`EMA3 change (${settings.slowLength})`}
          value={signedNumber(delta(row.slowAverage, previousRow?.slowAverage))}
        />
        <Stat label="Value change" value={signedNumber(valueChange)} />
        <Stat label="Avg change" value={signedNumber(avgChange)} />
        <Stat label="Diff change" value={signedNumber(diffChange)} />
      </div>
      <p className="simple-explainer">
        {closeText} EMA2 reacted by{" "}
        {signedNumber(delta(row.fastAverage, previousRow?.fastAverage))} and EMA3
        reacted by {signedNumber(delta(row.slowAverage, previousRow?.slowAverage))}.
        This changed Value by {signedNumber(valueChange)}. {relationshipText}
      </p>
    </section>
  );
}

function BridgeScoreboard({
  row,
  previousRow,
  rows,
  settings,
}: {
  row: CalculatedCandle;
  previousRow: CalculatedCandle | undefined;
  rows: CalculatedCandle[];
  settings: IndicatorSettings;
}) {
  const highValue =
    row.memory.length > 0 ? Math.max(...row.memory.map((item) => item.value)) : null;
  const lowValue =
    row.memory.length > 0 ? Math.min(...row.memory.map((item) => item.value)) : null;
  const beatsUpper =
    row.diff !== null && row.upperBand !== null && row.diff >= row.upperBand;
  const beatsLower =
    row.diff !== null && row.lowerBand !== null && row.diff <= row.lowerBand;
  const breakQuality = getBreakQuality(row);
  const setup = getPreArrowSetup(row, rows, settings.memoryLength);
  const noArrow = getNoArrowExplanation(row, previousRow);
  const ema8Context = getEma8Context(row, rows);

  return (
    <section className="scoreboard card bridge-scoreboard">
      <div className="scoreboard-heading">
        <div>
          <span className="eyebrow">Hovered candle trace</span>
          <h2>Candle {row.index + 1}</h2>
          <p>{compactTime(row.time)}</p>
        </div>
        <div className="result-badge">
          {row.upArrow ? "UP ARROW" : row.downArrow ? "DOWN ARROW" : "NO ARROW"}
        </div>
      </div>

      <div className="story-card">
        <span className="eyebrow">Visible Candle Story</span>
        <p>{buildVisibleStory(row, previousRow)}</p>
      </div>

      <div className="stats-grid bridge-stats">
        <Stat label="Current Diff" value={formatNumber(row.diff)} />
        <Stat label="UpperBand" value={formatNumber(row.upperBand)} tone={beatsUpper ? "up" : undefined} />
        <Stat label="LowerBand" value={formatNumber(row.lowerBand)} tone={beatsLower ? "down" : undefined} />
        <Stat label="Previous Diff" value={formatNumber(previousRow?.diff)} />
        <Stat label="Previous UpperBand" value={formatNumber(previousRow?.upperBand)} />
        <Stat label="Previous LowerBand" value={formatNumber(previousRow?.lowerBand)} />
        <Stat label="Value / Avg state" value={row.valueAvgState} />
        <Stat label="Memory size" value={`${row.memory.length} / ${settings.memoryLength}`} />
      </div>

      {breakQuality ? (
        <div className="quality-card">
          <div>
            <span className="eyebrow">Arrow quality / memory difficulty</span>
            <h3>{breakQuality.direction} arrow beat {breakQuality.thresholdName}</h3>
            <p>
              Current Diff {formatNumber(row.diff)} beat threshold{" "}
              {formatNumber(breakQuality.threshold)} by{" "}
              {formatNumber(breakQuality.beatAmount)}.
            </p>
          </div>
          <span className={`quality-badge ${breakLabelClass(breakQuality.label)}`}>
            {breakQuality.label}
          </span>
        </div>
      ) : (
        <div className="decision-box decision-no-arrow">
          <div>
            <span className="decision-icon">x</span>
          </div>
          <div>
            <h3>Why no arrow?</h3>
            <p>{noArrow}</p>
            <code>
              Current Diff {formatNumber(row.diff)} | UpperBand{" "}
              {formatNumber(row.upperBand)} | LowerBand {formatNumber(row.lowerBand)}
              <br />
              Previous Diff {formatNumber(previousRow?.diff)} | Previous UpperBand{" "}
              {formatNumber(previousRow?.upperBand)} | Previous LowerBand{" "}
              {formatNumber(previousRow?.lowerBand)}
            </code>
          </div>
        </div>
      )}

      {setup && (
        <div className="setup-card">
          <div>
            <span className="eyebrow">Pre-arrow compression detector</span>
            <h3>{setup.label}</h3>
            <p>
              Near zero before arrow: <strong>{setup.nearZeroBefore ? "YES" : "NO"}</strong>.
              Value and Avg close:{" "}
              <strong>{setup.valueAvgCloseBefore ? "YES" : "NO"}</strong>.
              Sharp expansion into arrow:{" "}
              <strong>{setup.expandedSharply ? "YES" : "NO"}</strong>.
            </p>
          </div>
          <code>
            avg previous |Diff| {formatNumber(setup.avgAbsDiff)} | previous |Diff|{" "}
            {formatNumber(setup.previousAbsDiff)} | memory range{" "}
            {formatNumber(setup.memoryRange)}
          </code>
        </div>
      )}

      <div className="memory-header">
        <div>
          <h3>Previous {settings.memoryLength} Diff values</h3>
          <p>The current candle is not included in its own threshold.</p>
        </div>
        <div className="memory-verdict">
          {breakQuality
            ? `${breakQuality.label}: beat by ${formatNumber(breakQuality.beatAmount)}`
            : beatsUpper
              ? "Beat upper, crossover failed"
              : beatsLower
                ? "Beat lower, crossover failed"
                : "Inside remembered range"}
        </div>
      </div>

      <div className="memory-strip">
        {row.memory.length === 0 && <span className="empty-memory">No previous Diff yet.</span>}
        {row.memory.map((item) => {
          const isHigh = item.value === highValue;
          const isLow = item.value === lowValue;
          const isBeaten =
            (row.upArrow && isHigh) || (row.downArrow && isLow);
          return (
            <div
              key={item.index}
              className={`memory-cell ${isHigh ? "memory-high" : ""} ${isLow ? "memory-low" : ""} ${isBeaten ? "memory-beaten" : ""}`}
              title={item.time}
            >
              <span>#{item.index + 1}</span>
              <strong>{formatNumber(item.value)}</strong>
              <small>
                {isBeaten
                  ? row.upArrow
                    ? "BEATEN UPPER"
                    : "BEATEN LOWER"
                  : isHigh
                    ? "HIGH MEMORY"
                    : isLow
                      ? "LOW MEMORY"
                      : "remembered"}
              </small>
            </div>
          );
        })}
      </div>

      {ema8Context && (
        <div className="ema8-panel">
          <span className="eyebrow">EMA8 Orange Road context</span>
          <div className="ema8-grid">
            <Stat label="Close vs EMA8" value={ema8Context.side} />
            <Stat label="Distance from EMA8" value={signedNumber(ema8Context.distance, 4)} />
            <Stat
              label="Touched EMA8 recently"
              value={ema8Context.touchedRecently ? "YES" : "NO"}
            />
            <Stat
              label="Crossed EMA8 recently"
              value={ema8Context.crossedRecently ? "YES" : "NO"}
            />
            <Stat
              label="Arrow near EMA8?"
              value={
                row.upArrow || row.downArrow
                  ? ema8Context.nearRoad
                    ? "near EMA8"
                    : "away from EMA8"
                  : "no arrow"
              }
            />
          </div>
          <p>
            EMA8 Orange Road is a visual context tool only. It is not part of
            the original arrow calculation.
          </p>
        </div>
      )}
    </section>
  );
}

function ArrowTable({
  rows,
  settings,
  activeIndex,
  onHover,
}: {
  rows: CalculatedCandle[];
  settings: IndicatorSettings;
  activeIndex: number;
  onHover: (index: number) => void;
}) {
  const arrows = rows.filter((row) => row.upArrow || row.downArrow).reverse();

  return (
    <section className="card arrow-log bridge-card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Arrow event log</span>
          <h2>Memory breaks</h2>
        </div>
        <span className="count-pill">{arrows.length} events</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Candle</th>
              <th>Direction</th>
              <th>Current Diff</th>
              <th>Threshold</th>
              <th>Beat amount</th>
              <th>Quality</th>
              <th>Setup</th>
              <th>Learning class</th>
            </tr>
          </thead>
          <tbody>
            {arrows.map((row) => {
              const breakQuality = getBreakQuality(row);
              const setup = getPreArrowSetup(row, rows, settings.memoryLength);
              const direction = row.upArrow ? "Up" : "Down";
              return (
                <tr
                  key={row.index}
                  className={row.index === activeIndex ? "active-row" : ""}
                  onMouseEnter={() => onHover(row.index)}
                  onClick={() => onHover(row.index)}
                >
                  <td>
                    <strong>#{row.index + 1}</strong>
                    <small>{compactTime(row.time)}</small>
                  </td>
                  <td>
                    <span className={`direction direction-${direction.toLowerCase()}`}>
                      {direction}
                    </span>
                  </td>
                  <td>{formatNumber(row.diff)}</td>
                  <td>{formatNumber(breakQuality?.threshold)}</td>
                  <td>{formatNumber(breakQuality?.beatAmount)}</td>
                  <td>
                    {breakQuality && (
                      <span className={`quality-badge ${breakLabelClass(breakQuality.label)}`}>
                        {breakQuality.label}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="setup-badge">{setup?.label ?? "n/a"}</span>
                  </td>
                  <td>
                    <span
                      className={`classification ${classificationClass(row.classification)}`}
                    >
                      {row.classification}
                    </span>
                  </td>
                </tr>
              );
            })}
            {arrows.length === 0 && (
              <tr>
                <td colSpan={8} className="empty-table">
                  No arrows in this dataset with the current settings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="classification-warning">
        These labels are learning classifications based on recent arrow context.
        They are not part of the original ThinkScript.
      </p>
    </section>
  );
}

export default function BridgeLab() {
  const [preset, setPreset] = useState<Preset>("Red");
  const [settings, setSettings] = useState<IndicatorSettings>(initialSettings);
  const [candles, setCandles] = useState<Candle[]>(() => createSampleCandles());
  const [activeIndex, setActiveIndex] = useState(candles.length - 1);
  const [dataInput, setDataInput] = useState("");
  const [dataError, setDataError] = useState("");
  const [showImporter, setShowImporter] = useState(false);
  const [showEma8, setShowEma8] = useState(true);

  const rows = useMemo(
    () => calculateIndicator(candles, settings),
    [candles, settings],
  );
  const accent = presetConfig[preset].accent;
  const activeRow = rows[Math.min(activeIndex, rows.length - 1)] ?? rows[0];

  useEffect(() => {
    setActiveIndex((index) => Math.min(index, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const updateSetting = <K extends keyof IndicatorSettings>(
    key: K,
    value: IndicatorSettings[K],
  ) => setSettings((current) => ({ ...current, [key]: value }));

  const selectPreset = (nextPreset: Preset) => {
    setPreset(nextPreset);
    updateSetting("memoryLength", presetConfig[nextPreset].memoryLength);
  };

  const loadData = (input: string) => {
    try {
      const parsed = parseCandleData(input);
      if (parsed.length < 3) {
        throw new Error("Please provide at least 3 candles.");
      }
      setCandles(parsed);
      setActiveIndex(parsed.length - 1);
      setDataError("");
      setShowImporter(false);
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "Could not parse candle data.");
    }
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    setDataInput(text);
    loadData(text);
  };

  if (!activeRow) return null;

  return (
    <div className="app-shell bridge-shell" style={{ "--accent": accent } as React.CSSProperties}>
      <nav className="route-nav">
        <a href="#/">Landing</a>
        <a href="#/arrow-memory-lab">V1: Arrow Memory Lab</a>
        <a className="selected" href="#/bridge-lab">V2: Bridge Lab</a>
      </nav>

      <header className="hero bridge-hero">
        <div>
          <span className="kicker">V2: visible to hidden</span>
          <h1>Hidden-to-Visible Bridge Lab</h1>
          <p>
            Follow the full chain: candle close {"->"} EMA2 / EMA3 reaction{" "}
            {"->"} Value {"->"} Avg {"->"} Diff {"->"} memory threshold{" "}
            {"->"} arrow.
          </p>
        </div>
        <div className="hero-meta">
          <div>
            <strong>{candles.length}</strong>
            <span>candles loaded</span>
          </div>
          <div>
            <strong>{rows.filter((row) => row.upArrow || row.downArrow).length}</strong>
            <span>arrows found</span>
          </div>
        </div>
      </header>

      <section className="control-deck card">
        <div className="preset-control">
          <span className="control-label">Script preset</span>
          <div className="segmented">
            {(["Red", "Pink"] as Preset[]).map((option) => (
              <button
                key={option}
                className={preset === option ? "selected" : ""}
                onClick={() => selectPreset(option)}
              >
                <i style={{ background: presetConfig[option].accent }} />
                {option}
                <small>N={presetConfig[option].memoryLength}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-grid">
          <SettingsInput
            label="Fast length"
            value={settings.fastLength}
            onChange={(value) => updateSetting("fastLength", value)}
          />
          <SettingsInput
            label="Slow length"
            value={settings.slowLength}
            onChange={(value) => updateSetting("slowLength", value)}
          />
          <SettingsInput
            label="MACD length"
            value={settings.macdLength}
            onChange={(value) => updateSetting("macdLength", value)}
          />
          <SettingsInput
            label="Memory N"
            value={settings.memoryLength}
            onChange={(value) => updateSetting("memoryLength", value)}
          />
          <label className="setting-field average-field">
            <span>Average type</span>
            <select
              value={settings.averageType}
              onChange={(event) =>
                updateSetting("averageType", event.target.value as AverageType)
              }
            >
              <option value="EMA">EMA</option>
              <option value="SMA">SMA</option>
            </select>
          </label>
        </div>

        <div className="control-actions">
          <button className="data-button" onClick={() => setShowImporter((value) => !value)}>
            {showImporter ? "Close data input" : "Upload / paste OHLC"}
          </button>
          <button
            className={`secondary-button toggle-button ${showEma8 ? "toggle-on" : ""}`}
            onClick={() => setShowEma8((value) => !value)}
          >
            EMA8 Orange Road {showEma8 ? "on" : "off"}
          </button>
        </div>
      </section>

      {showImporter && (
        <section className="data-import card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Bring your own candles</span>
              <h2>Paste CSV, TSV, or JSON</h2>
            </div>
            <label className="file-button">
              Choose file
              <input
                type="file"
                accept=".csv,.tsv,.txt,.json,application/json,text/csv"
                onChange={(event) => void loadFile(event.target.files?.[0])}
              />
            </label>
          </div>
          <p className="data-help">
            Required: <code>close</code>. Optional: <code>time, open, high, low</code>.
            Example header: <code>time,open,high,low,close</code>.
          </p>
          <textarea
            value={dataInput}
            onChange={(event) => setDataInput(event.target.value)}
            placeholder={"time,open,high,low,close\n2026-05-01 09:30,100,101,99.5,100.7"}
          />
          {dataError && <p className="data-error">{dataError}</p>}
          <div className="import-actions">
            <button className="primary-button" onClick={() => loadData(dataInput)}>
              Load candle data
            </button>
            <button
              className="secondary-button"
              onClick={() => {
                const sample = createSampleCandles();
                setCandles(sample);
                setActiveIndex(sample.length - 1);
                setDataError("");
              }}
            >
              Restore sample
            </button>
          </div>
        </section>
      )}

      <section className="formula-strip bridge-formula">
        <div><span>Candle close</span><strong>visible fuel</strong></div>
        <b>{"->"}</b>
        <div><span>EMA2 / EMA3</span><strong>fast and slow reaction</strong></div>
        <b>{"->"}</b>
        <div><span>Value</span><strong>raw gap</strong></div>
        <b>{"->"}</b>
        <div><span>Diff</span><strong>extra punch</strong></div>
        <b>{"->"}</b>
        <div><span>Memory</span><strong>previous N only</strong></div>
        <b>{"->"}</b>
        <div><span>Arrow</span><strong>fresh break</strong></div>
      </section>

      <main className="visual-stack">
        <section className="chart-panel card">
          <PanelHeader
            eyebrow="Panel 1"
            title="Price + visible context"
            description="Candles show the visible move. EMA2 and EMA3 create the hidden Value. EMA8 is optional context only."
            legends={[
              {
                label: `EMA2 / fast ${settings.averageType} (${settings.fastLength})`,
                className: "legend-fast",
              },
              {
                label: `EMA3 / slow ${settings.averageType} (${settings.slowLength})`,
                className: "legend-slow",
              },
              ...(showEma8 ? [{ label: "EMA8 Orange Road", className: "legend-ema8" }] : []),
              { label: `${preset} arrow`, className: "legend-arrow" },
            ]}
          />
          <PriceChart
            rows={rows}
            activeIndex={activeRow.index}
            accent={accent}
            onHover={setActiveIndex}
            showEma8={showEma8}
          />
          <p className="ema8-note">
            EMA8 Orange Road is a visual context tool only. It is not part of
            the original arrow calculation.
          </p>
        </section>

        <CandleImpactPanel
          row={activeRow}
          previousRow={rows[activeRow.index - 1]}
          settings={settings}
        />

        <section className="chart-panel card">
          <PanelHeader
            eyebrow="Panel 2"
            title="Value vs Avg state"
            description="Expansion means Value is pulling away from Avg. Compression means Value is moving closer. Catch-up means Avg is catching Value."
            legends={[
              { label: "Value", className: "legend-value" },
              { label: "Avg", className: "legend-avg" },
              { label: "Expansion zone", className: "legend-expansion" },
              { label: "Compression zone", className: "legend-compression" },
            ]}
          />
          <div className="value-explainer bridge-value-explainer">
            <div title="Value is the raw gap between fast EMA2 and slow EMA3.">
              <span>Value</span>
              <p>Raw EMA2 minus EMA3 gap.</p>
            </div>
            <div title="Avg is the recent normal Value baseline.">
              <span>Avg</span>
              <p>Recent normal gap.</p>
            </div>
            <div title="Diff is Value minus Avg.">
              <span>Diff</span>
              <p>Value minus Avg.</p>
            </div>
            <aside>
              <strong>Hovered state:</strong>{" "}
              <span className={`state-pill ${stateClass(activeRow.valueAvgState)}`}>
                {activeRow.valueAvgState}
              </span>
              When Value pulls away from Avg, Diff expands. When Avg catches Value,
              Diff shrinks.
            </aside>
          </div>
          <LineChart
            rows={rows}
            activeIndex={activeRow.index}
            accent={accent}
            onHover={setActiveIndex}
            showStateZones
            series={[
              { label: "Value", className: "value-line", getValue: (row) => row.value },
              { label: "Avg", className: "avg-line", getValue: (row) => row.avg },
            ]}
          />
        </section>

        <section className="chart-panel card">
          <PanelHeader
            eyebrow="Panel 3"
            title="Diff histogram + memory threshold"
            description="Diff bars show the hidden push above or below normal. UpperBand and LowerBand still use previous N Diff values only."
            legends={[
              { label: "Histogram", className: "legend-histogram" },
              { label: "Diff", className: "legend-diff" },
              { label: "UpperBand", className: "legend-upper" },
              { label: "LowerBand", className: "legend-lower" },
            ]}
          />
          <LineChart
            rows={rows}
            activeIndex={activeRow.index}
            accent={accent}
            onHover={setActiveIndex}
            showBreaks
            showHistogram
            series={[
              { label: "Diff", className: "diff-line", getValue: (row) => row.diff },
              {
                label: "UpperBand",
                className: "upper-line",
                getValue: (row) => row.upperBand,
              },
              {
                label: "LowerBand",
                className: "lower-line",
                getValue: (row) => row.lowerBand,
              },
            ]}
          />
        </section>
      </main>

      <BridgeScoreboard
        row={activeRow}
        previousRow={rows[activeRow.index - 1]}
        rows={rows}
        settings={settings}
      />
      <ArrowTable
        rows={rows}
        settings={settings}
        activeIndex={activeRow.index}
        onHover={setActiveIndex}
      />

      <section className="explanation-grid bridge-explanations">
        <article className="card teaching-box">
          <span className="eyebrow">Hidden-to-Visible Bridge</span>
          <h2>What this lab teaches</h2>
          <p>
            The visible candle close is the fuel. EMA2 and EMA3 react to that
            close. Value measures their gap. Avg measures what that gap has
            recently considered normal. Diff measures the extra punch above or
            below normal. The memory threshold checks whether this Diff beat
            previous remembered Diff values. The arrow prints only if it freshly
            crosses the threshold.
          </p>
        </article>
        <article className="card thinkscript-note">
          <span className="eyebrow">Core formula preserved</span>
          <h2>Same arrow code, more explanation</h2>
          <code>
            price = close
            <br />
            Value = EMA2 - EMA3
            <br />
            Avg = average(Value)
            <br />
            Diff = Value - Avg
            <br />
            UpperBand = Highest(previous N Diff values)
            <br />
            LowerBand = Lowest(previous N Diff values)
          </code>
        </article>
        <article className="card">
          <span className="eyebrow">Reading V2</span>
          <h2>The full chain</h2>
          <ol>
            <li>Candle close changes.</li>
            <li>EMA2 reacts faster than EMA3.</li>
            <li>Value changes because the EMA gap changed.</li>
            <li>Avg defines what that gap recently treated as normal.</li>
            <li>Diff measures how unusual the gap is now.</li>
            <li>Previous N Diff values create the memory threshold.</li>
            <li>The arrow prints only after a threshold break plus crossover rule.</li>
          </ol>
        </article>
      </section>
    </div>
  );
}
