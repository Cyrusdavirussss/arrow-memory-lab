import { useEffect, useMemo, useState } from "react";
import { LineChart, PriceChart } from "./components/Charts";
import { calculateIndicator, parseCandleData } from "./indicator";
import { createSampleCandles } from "./sampleData";
import type {
  AverageType,
  CalculatedCandle,
  Candle,
  IndicatorSettings,
} from "./types";

type Preset = "Red" | "Pink";

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

function formatNumber(value: number | null, digits = 5) {
  if (value === null || !Number.isFinite(value)) return "warming up";
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

function signedNumber(value: number, digits = 5) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;
}

function classificationClass(classification: CalculatedCandle["classification"]) {
  if (classification === "Reinforcement") return "class-reinforcement";
  if (classification === "Defeat") return "class-defeat";
  return "class-fresh";
}

interface ArrowDecision {
  heading: string;
  summary: string;
  detail: string;
  kind: "arrow" | "no-arrow" | "warming";
}

function getArrowDecision(
  row: CalculatedCandle,
  previousRow: CalculatedCandle | undefined,
): ArrowDecision {
  if (row.diff === null) {
    return {
      heading: "Why no arrow?",
      summary: "Diff is still warming up.",
      detail: "The selected averages do not yet have enough valid values.",
      kind: "warming",
    };
  }

  if (row.upperBand === null || row.lowerBand === null) {
    return {
      heading: "Why no arrow?",
      summary: `Only ${row.memory.length} previous Diff values are available.`,
      detail: "A complete memory window is required before either threshold exists.",
      kind: "warming",
    };
  }

  const beatsUpper = row.diff >= row.upperBand;
  const beatsLower = row.diff <= row.lowerBand;
  const previousDiff = previousRow?.diff;
  const previousUpper = previousRow?.upperBand;
  const previousLower = previousRow?.lowerBand;

  if (row.upArrow) {
    return {
      heading: "Why the Up arrow printed",
      summary: `Diff ${formatNumber(row.diff)} ≥ UpperBand ${formatNumber(row.upperBand)}.`,
      detail: `The crossover also passed: previous Diff ${formatNumber(previousDiff ?? null)} < previous UpperBand ${formatNumber(previousUpper ?? null)}.`,
      kind: "arrow",
    };
  }

  if (row.downArrow) {
    return {
      heading: "Why the Down arrow printed",
      summary: `Diff ${formatNumber(row.diff)} ≤ LowerBand ${formatNumber(row.lowerBand)}.`,
      detail: `The crossover also passed: previous Diff ${formatNumber(previousDiff ?? null)} > previous LowerBand ${formatNumber(previousLower ?? null)}.`,
      kind: "arrow",
    };
  }

  if (!beatsUpper && !beatsLower) {
    return {
      heading: "Why no arrow?",
      summary: `Diff ${formatNumber(row.diff)} stayed between LowerBand ${formatNumber(row.lowerBand)} and UpperBand ${formatNumber(row.upperBand)}.`,
      detail: `Upper test: ${formatNumber(row.diff)} ≥ ${formatNumber(row.upperBand)} is FALSE. Lower test: ${formatNumber(row.diff)} ≤ ${formatNumber(row.lowerBand)} is FALSE.`,
      kind: "no-arrow",
    };
  }

  if (beatsUpper) {
    return {
      heading: "Why no arrow?",
      summary: `Diff ${formatNumber(row.diff)} beat UpperBand ${formatNumber(row.upperBand)}, but the crossover condition failed.`,
      detail: `Required: previous Diff ${formatNumber(previousDiff ?? null)} < previous UpperBand ${formatNumber(previousUpper ?? null)}. This is FALSE.`,
      kind: "no-arrow",
    };
  }

  return {
    heading: "Why no arrow?",
    summary: `Diff ${formatNumber(row.diff)} beat LowerBand ${formatNumber(row.lowerBand)}, but the crossover condition failed.`,
    detail: `Required: previous Diff ${formatNumber(previousDiff ?? null)} > previous LowerBand ${formatNumber(previousLower ?? null)}. This is FALSE.`,
    kind: "no-arrow",
  };
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

function MemoryScoreboard({
  row,
  previousRow,
  settings,
}: {
  row: CalculatedCandle;
  previousRow: CalculatedCandle | undefined;
  settings: IndicatorSettings;
}) {
  const memoryLength = settings.memoryLength;
  const highValue =
    row.memory.length > 0 ? Math.max(...row.memory.map((item) => item.value)) : null;
  const lowValue =
    row.memory.length > 0 ? Math.min(...row.memory.map((item) => item.value)) : null;
  const beatsUpper =
    row.diff !== null && row.upperBand !== null && row.diff >= row.upperBand;
  const beatsLower =
    row.diff !== null && row.lowerBand !== null && row.diff <= row.lowerBand;
  const decision = getArrowDecision(row, previousRow);
  const closeMove = previousRow ? row.close - previousRow.close : null;
  const diffMovement =
    row.diff !== null && previousRow?.diff !== null && previousRow?.diff !== undefined
      ? Math.abs(row.diff) >= Math.abs(previousRow.diff)
        ? "expanded"
        : "shrank"
      : "is establishing its first comparison";

  return (
    <section className="scoreboard card">
      <div className="scoreboard-heading">
        <div>
          <span className="eyebrow">Live calculation trace</span>
          <h2>Candle {row.index + 1}</h2>
          <p>{compactTime(row.time)}</p>
        </div>
        <div className="result-badge">
          {row.upArrow ? "UP ARROW" : row.downArrow ? "DOWN ARROW" : "NO ARROW"}
        </div>
      </div>

      <div className="stats-grid">
        <Stat label="Close" value={formatNumber(row.close, 4)} />
        <Stat
          label={`Fast ${settings.averageType} (${settings.fastLength})`}
          value={formatNumber(row.fastAverage)}
        />
        <Stat
          label={`Slow ${settings.averageType} (${settings.slowLength})`}
          value={formatNumber(row.slowAverage)}
        />
        <Stat label="Value" value={formatNumber(row.value)} />
        <Stat label="Avg" value={formatNumber(row.avg)} />
        <Stat label="Diff" value={formatNumber(row.diff)} />
        <Stat label="UpperBand" value={formatNumber(row.upperBand)} tone={beatsUpper ? "up" : undefined} />
        <Stat label="LowerBand" value={formatNumber(row.lowerBand)} tone={beatsLower ? "down" : undefined} />
      </div>

      <div className="calculation-story">
        <div className="story-heading">
          <span className="eyebrow">Hovered candle</span>
          <h3>Calculation story</h3>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Price moved.</strong>
              <p>
                Close is {formatNumber(row.close, 4)}
                {closeMove === null
                  ? "; this is the first candle."
                  : `, a ${signedNumber(closeMove, 4)} move from the previous close.`}
              </p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Fast and slow averages created Value.</strong>
              <p>
                {settings.averageType}({settings.fastLength}) {formatNumber(row.fastAverage)}
                {" − "}
                {settings.averageType}({settings.slowLength}) {formatNumber(row.slowAverage)}
                {" = Value "}
                {formatNumber(row.value)}.
              </p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Avg shows the recent normal Value.</strong>
              <p>
                {settings.averageType}({settings.macdLength}) of Value = Avg{" "}
                {formatNumber(row.avg)}.
              </p>
            </div>
          </li>
          <li>
            <span>4</span>
            <div>
              <strong>Diff measures Value versus normal.</strong>
              <p>
                Value {formatNumber(row.value)} − Avg {formatNumber(row.avg)} = Diff{" "}
                {formatNumber(row.diff)}; its magnitude {diffMovement}.
              </p>
            </div>
          </li>
          <li>
            <span>5</span>
            <div>
              <strong>Previous Diff values created memory.</strong>
              <p>
                The previous {settings.memoryLength} values set LowerBand{" "}
                {formatNumber(row.lowerBand)} and UpperBand {formatNumber(row.upperBand)}.
              </p>
            </div>
          </li>
          <li>
            <span>6</span>
            <div>
              <strong>An arrow needs a threshold break and crossover.</strong>
              <p>{decision.summary}</p>
            </div>
          </li>
        </ol>
      </div>

      <div className={`decision-box decision-${decision.kind}`}>
        <div>
          <span className="decision-icon">
            {decision.kind === "arrow" ? "✓" : decision.kind === "warming" ? "…" : "×"}
          </span>
        </div>
        <div>
          <h3>{decision.heading}</h3>
          <p>{decision.summary}</p>
          <code>{decision.detail}</code>
        </div>
      </div>

      <div className="memory-header">
        <div>
          <h3>Previous {memoryLength} Diff values</h3>
          <p>The current candle is excluded from this remembered threshold.</p>
        </div>
        <div className="memory-verdict">
          {row.memory.length < memoryLength
            ? `Need ${memoryLength - row.memory.length} more`
            : beatsUpper
              ? `Upper record beaten by ${formatNumber(row.diff! - row.upperBand!)}`
              : beatsLower
                ? `Lower record beaten by ${formatNumber(row.lowerBand! - row.diff!)}`
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
                    ? "BEATEN UPPER RECORD"
                    : "BEATEN LOWER RECORD"
                  : isHigh
                    ? "HIGH"
                    : isLow
                      ? "LOW"
                      : "remembered"}
              </small>
            </div>
          );
        })}
      </div>

      <div className="boolean-row">
        <span>
          Current Diff beat upper: <strong>{beatsUpper ? "TRUE" : "FALSE"}</strong>
        </span>
        <span>
          Current Diff beat lower: <strong>{beatsLower ? "TRUE" : "FALSE"}</strong>
        </span>
        <span>
          UpArrow: <strong>{row.upArrow ? "TRUE" : "FALSE"}</strong>
        </span>
        <span>
          DownArrow: <strong>{row.downArrow ? "TRUE" : "FALSE"}</strong>
        </span>
      </div>
    </section>
  );
}

function ArrowTable({
  rows,
  activeIndex,
  onHover,
}: {
  rows: CalculatedCandle[];
  activeIndex: number;
  onHover: (index: number) => void;
}) {
  const arrows = rows.filter((row) => row.upArrow || row.downArrow).reverse();

  return (
    <section className="card arrow-log">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Classification column</span>
          <h2>Arrow event log</h2>
        </div>
        <span className="count-pill">{arrows.length} events</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Candle</th>
              <th>Direction</th>
              <th>Diff</th>
              <th>Threshold beaten</th>
              <th>Classification</th>
            </tr>
          </thead>
          <tbody>
            {arrows.map((row) => {
              const direction = row.upArrow ? "Up" : "Down";
              const threshold = row.upArrow ? row.upperBand : row.lowerBand;
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
                      {direction === "Up" ? "↑" : "↓"} {direction}
                    </span>
                  </td>
                  <td>{formatNumber(row.diff)}</td>
                  <td>{formatNumber(threshold)}</td>
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
                <td colSpan={5} className="empty-table">
                  No arrows in this dataset with the current settings.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="classification-note">
        Defeat = an opposite arrow remains inside the last N candles. Reinforcement = a
        same-direction arrow remains. Fresh / after forgotten memory = neither is
        remembered.
      </p>
      <p className="classification-warning">
        These labels are learning classifications based on recent arrow context. They are
        not part of the original ThinkScript.
      </p>
    </section>
  );
}

export default function App() {
  const [preset, setPreset] = useState<Preset>("Red");
  const [settings, setSettings] = useState<IndicatorSettings>(initialSettings);
  const [candles, setCandles] = useState<Candle[]>(() => createSampleCandles());
  const [activeIndex, setActiveIndex] = useState(candles.length - 1);
  const [dataInput, setDataInput] = useState("");
  const [dataError, setDataError] = useState("");
  const [showImporter, setShowImporter] = useState(false);

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
    <div className="app-shell" style={{ "--accent": accent } as React.CSSProperties}>
      <header className="hero">
        <div>
          <span className="kicker">ThinkScript, made visible</span>
          <h1>Arrow Memory Lab</h1>
          <p>
            See the gap, its normal baseline, the leftover momentum, and the exact
            remembered record each arrow had to beat.
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

        <button className="data-button" onClick={() => setShowImporter((value) => !value)}>
          {showImporter ? "Close data input" : "Upload / paste OHLC"}
        </button>
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

      <section className="formula-strip">
        <div>
          <span>Value</span>
          <strong>raw fast/slow gap</strong>
        </div>
        <b>−</b>
        <div>
          <span>Avg</span>
          <strong>recent normal gap</strong>
        </div>
        <b>=</b>
        <div>
          <span>Diff</span>
          <strong>gap minus normal</strong>
        </div>
        <b>→</b>
        <div>
          <span>Arrow</span>
          <strong>Diff broke memory</strong>
        </div>
      </section>

      <main className="visual-stack">
        <section className="chart-panel card">
          <PanelHeader
            eyebrow="Panel 1"
            title="Price + arrows"
            description="Candles show where the signal landed. The fast and slow averages reveal the gap that created it."
            legends={[
              {
                label: `Fast ${settings.averageType} (${settings.fastLength})`,
                className: "legend-fast",
              },
              {
                label: `Slow ${settings.averageType} (${settings.slowLength})`,
                className: "legend-slow",
              },
              { label: `${preset} arrow`, className: "legend-arrow" },
            ]}
          />
          <PriceChart
            rows={rows}
            activeIndex={activeRow.index}
            accent={accent}
            onHover={setActiveIndex}
          />
        </section>

        <section className="chart-panel card">
          <PanelHeader
            eyebrow="Panel 2"
            title="Value vs Avg"
            description="Value is the raw fast/slow gap. Avg is what that gap has recently considered normal."
            legends={[
              { label: "Value", className: "legend-value" },
              { label: "Avg", className: "legend-avg" },
            ]}
          />
          <div className="value-explainer">
            <div title="Value is the raw gap between the fast EMA2 and slow EMA3 at the default settings.">
              <span>Value</span>
              <p>Raw EMA2 minus EMA3 gap.</p>
            </div>
            <div title="Avg is an average of Value and represents the gap's recent normal baseline.">
              <span>Avg</span>
              <p>Recent normal gap.</p>
            </div>
            <div title="Diff is the raw Value gap minus its recent Avg baseline.">
              <span>Diff</span>
              <p>Value minus Avg.</p>
            </div>
            <aside>
              <strong>Pulling away:</strong> when Value moves away from Avg, Diff expands.
              <strong>Catching up:</strong> when Avg catches Value, Diff shrinks.
            </aside>
          </div>
          <LineChart
            rows={rows}
            activeIndex={activeRow.index}
            accent={accent}
            onHover={setActiveIndex}
            series={[
              { label: "Value", className: "value-line", getValue: (row) => row.value },
              { label: "Avg", className: "avg-line", getValue: (row) => row.avg },
            ]}
          />
        </section>

        <section className="chart-panel card">
          <PanelHeader
            eyebrow="Panel 3"
            title="Diff histogram + remembered thresholds"
            description="Bars show Diff above or below zero. Bright bars are expanding; muted bars are shrinking. UpperBand and LowerBand still use only the previous N Diff values."
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

      <MemoryScoreboard
        row={activeRow}
        previousRow={rows[activeRow.index - 1]}
        settings={settings}
      />
      <ArrowTable rows={rows} activeIndex={activeRow.index} onHover={setActiveIndex} />

      <section className="explanation-grid">
        <article className="card teaching-box">
          <span className="eyebrow">What this app teaches</span>
          <h2>From EMA gap to remembered break</h2>
          <p>
            An arrow is not just an EMA gap. First, the app checks whether the EMA2/EMA3
            gap is unusual compared with its recent normal baseline. That creates Diff.
            Then Diff is compared against previous N Diff values. An arrow appears only
            when the current Diff breaks the remembered Diff threshold.
          </p>
        </article>
        <article className="card">
          <span className="eyebrow">Reading the indicator</span>
          <h2>The calculation story</h2>
          <ol>
            <li>Fast average minus slow average creates <strong>Value</strong>.</li>
            <li>Average that gap again to create its recent normal, <strong>Avg</strong>.</li>
            <li>Subtract normal from raw to create <strong>Diff</strong>.</li>
            <li>Compare Diff with the previous N Diffs, never the current one.</li>
            <li>An arrow requires both a record break and the ThinkScript crossover condition.</li>
          </ol>
        </article>
        <article className="card thinkscript-note">
          <span className="eyebrow">Faithful details</span>
          <h2>How the source maps here</h2>
          <p>
            EMA mode uses exponential averages for fast, slow, and Avg. SMA mode mirrors
            the source switch by using simple averages for all three.
          </p>
          <p>
            Because uploaded data has no unseen history, EMA mode seeds from the first
            uploaded close. Include warm-up candles before the period you want to inspect.
          </p>
          <code>
            UpperBand[i] = Highest(Diff[i-N ... i-1])
            <br />
            LowerBand[i] = Lowest(Diff[i-N ... i-1])
          </code>
        </article>
      </section>

      <footer>
        Hover any candle or event row to synchronize all panels. Arrow hovers shade the
        exact memory window used for that decision.
      </footer>
    </div>
  );
}
