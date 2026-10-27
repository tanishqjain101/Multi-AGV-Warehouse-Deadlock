import { useEffect, useMemo, useRef, useState } from "react";
import {
  aggregateLabResults,
  LAB_METHOD_NAMES,
  runLabCase,
} from "../logic/experimentLab.js";
import {
  EXPERIMENT_KEYS,
  loadExperiment,
  removeExperiment,
  saveExperiment,
} from "../logic/experimentStorage.js";

const defaultConfig = {
  runs: 5,
  source: "auto",
  robotCount: 5,
  gridSize: 12,
  obstacleDensity: "medium",
  congestion: "high",
  speed: "fast",
  seedMode: "fixed",
  fixedSeeds: [2026, 31415, 27182, 16180, 42424, 90210, 8080, 777, 12345, 65537],
  experimentType: "both",
};

const mean = (rows, key) =>
  rows.length
    ? rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) / rows.length
    : 0;
const format = (value, digits = 1) => Number(value || 0).toFixed(digits);

export default function ExperimentLab({ manualScenario }) {
  const [config, setConfig] = useState(
      () => loadExperiment(EXPERIMENT_KEYS.labConfig) || defaultConfig,
    ),
    [resultSet, setResultSet] = useState(
      () => loadExperiment(EXPERIMENT_KEYS.labResults) || null,
    ),
    [progress, setProgress] = useState(0),
    [running, setRunning] = useState(false),
    stopRequested = useRef(false);

  useEffect(() => saveExperiment(EXPERIMENT_KEYS.labConfig, config), [config]);
  useEffect(() => {
    if (resultSet) saveExperiment(EXPERIMENT_KEYS.labResults, resultSet);
  }, [resultSet]);
  useEffect(() => () => { stopRequested.current = true; }, []);

  const records = resultSet?.records || [],
    summary = useMemo(() => aggregateLabResults(records), [records]);

  const change = (key, value) =>
      setConfig((old) => ({ ...old, [key]: value })),
    runExperiments = () => {
      stopRequested.current = false;
      setRunning(true);
      setProgress(0);
      setResultSet(null);
      const cases = [];
      const next = (index) => {
        if (stopRequested.current || index >= config.runs) {
          const completed = cases.length;
          setResultSet({
            id: `LAB-${Date.now()}`,
            createdAt: new Date().toISOString(),
            config: { ...config },
            completedRuns: completed,
            records: cases.flatMap((item) => item.records),
            cases,
          });
          setRunning(false);
          return;
        }
        cases.push(runLabCase(config, index, manualScenario));
        setProgress(index + 1);
        window.setTimeout(() => next(index + 1), 0);
      };
      next(0);
    },
    stop = () => { stopRequested.current = true; },
    reset = () => {
      stopRequested.current = true;
      setRunning(false);
      setProgress(0);
      setResultSet(null);
      setConfig(defaultConfig);
      removeExperiment(EXPERIMENT_KEYS.labResults);
      removeExperiment(EXPERIMENT_KEYS.labConfig);
    },
    loadPrevious = () => {
      const saved = loadExperiment(EXPERIMENT_KEYS.labResults),
        savedConfig = loadExperiment(EXPERIMENT_KEYS.labConfig);
      if (saved) {
        setResultSet(saved);
        setProgress(saved.completedRuns || 0);
      }
      if (savedConfig) setConfig(savedConfig);
    };

  return (
    <main className="lab-page">
      <header className="lab-title">
        <small>BATCH RESEARCH ENVIRONMENT</small>
        <h1>Experiment Lab</h1>
        <p>Run repeated scenarios and compare recovery methods and deadlock-handling strategies using real engine outcomes.</p>
      </header>

      <section className="lab-controls">
        <Select label="Number of runs" value={config.runs} onChange={(value) => change("runs", Number(value))} options={[5, 10, 20, 50]} />
        <Select label="Scenario source" value={config.source} onChange={(value) => change("source", value)} options={[["auto", "Auto-generate random scenarios"], ["predefined", "Use predefined seeds"], ["manual", "Use current manual scenario as base"]]} />
        <Select label="Robot count" value={config.robotCount} onChange={(value) => change("robotCount", Number(value))} options={[3, 5, 8, 10]} />
        <Select label="Grid size" value={config.gridSize} onChange={(value) => change("gridSize", Number(value))} options={[[8, "8×8"], [10, "10×10"], [12, "12×12"], [15, "15×15"]]} />
        <Select label="Obstacle density" value={config.obstacleDensity} onChange={(value) => change("obstacleDensity", value)} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} />
        <Select label="Congestion level" value={config.congestion} onChange={(value) => change("congestion", value)} options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]]} />
        <Select label="Simulation speed" value={config.speed} onChange={(value) => change("speed", value)} options={[["fast", "Fast lab mode (headless)"]]} />
        <Select label="Seed mode" value={config.seedMode} onChange={(value) => change("seedMode", value)} options={[["random", "Random"], ["fixed", "Fixed seed list"]]} />
        <Select label="Experiment type" value={config.experimentType} onChange={(value) => change("experimentType", value)} options={[["recovery", "Recovery Method Comparison"], ["strategy", "Deadlock Strategy Comparison"], ["both", "Both"]]} />
      </section>

      <div className="lab-actions">
        <button className="primary" onClick={runExperiments} disabled={running || (config.source === "manual" && !manualScenario?.robots?.length)}>Run Experiments</button>
        <button onClick={stop} disabled={!running}>Stop</button>
        <button onClick={reset}>Reset Lab</button>
        <button onClick={() => resultSet && saveExperiment(EXPERIMENT_KEYS.labResults, resultSet)} disabled={!resultSet}>Save Experiment Result Set</button>
        <button onClick={loadPrevious}>Load Previous Result Set</button>
        <button onClick={() => exportJson(resultSet)} disabled={!resultSet}>Export Results</button>
        <button onClick={() => exportCsv(summary)} disabled={!summary.length}>Export Summary CSV</button>
      </div>
      <div className="lab-progress"><span style={{ width: `${(progress / config.runs) * 100}%` }} /><b>Run {progress} / {config.runs} completed</b></div>
      {config.source === "manual" && !manualScenario?.robots?.length && <p className="lab-warning">Create and validate a manual scenario in Simulator before using it as the lab baseline.</p>}

      {summary.length > 0 && <>
        <section className="lab-section">
          <h2>Experiment Dashboard</h2>
          <div className="lab-chart-grid">
            <BarChart title="Average Waiting Steps by Method" rows={summary} valueKey="averageWaiting" />
            <BarChart title="Average Completion Rate by Method" rows={summary} valueKey="averageCompletionRate" suffix="%" />
            <BarChart title="Recovery Success Rate by Method" rows={summary.filter((row) => row.family === "recovery")} valueKey="successRate" suffix="%" />
            <BarChart title="Average Extra Path Length" rows={summary.filter((row) => row.family === "recovery")} valueKey="averageExtraPathLength" />
            <TrendChart title="Performance vs Robot Count" records={records} groupKey="robotCount" />
            <TrendChart title="Performance vs Congestion Level" records={records} groupKey="congestion" />
            <OutcomeChart rows={summary} />
          </div>
        </section>
        <LabTables summary={summary} records={records} />
        <LabAnalysis summary={summary} records={records} />
      </>}
    </main>
  );
}

function Select({ label, value, onChange, options }) {
  return <label><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => {
    const [actual, text] = Array.isArray(option) ? option : [option, option];
    return <option value={actual} key={actual}>{text}</option>;
  })}</select></label>;
}

function BarChart({ title, rows, valueKey, suffix = "" }) {
  const max = Math.max(1, ...rows.map((row) => row[valueKey]));
  return <figure className="lab-chart"><figcaption>{title}</figcaption><div className="bar-chart">{rows.map((row) => <div className="bar-row" key={row.method}><span>{shortName(row.label)}</span><i><em style={{ width: `${(row[valueKey] / max) * 100}%` }} /></i><b>{format(row[valueKey])}{suffix}</b></div>)}</div></figure>;
}

function TrendChart({ title, records, groupKey }) {
  const order = groupKey === "congestion" ? ["low", "medium", "high"] : [...new Set(records.map((row) => row[groupKey]))].sort((a, b) => a - b),
    points = order.map((group) => ({ group, value: mean(records.filter((row) => row[groupKey] === group), "waitingSteps") })),
    max = Math.max(1, ...points.map((point) => point.value)),
    path = points.map((point, index) => `${index ? "L" : "M"} ${20 + index * (260 / Math.max(1, points.length - 1))} ${130 - (point.value / max) * 100}`).join(" ");
  return <figure className="lab-chart"><figcaption>{title}</figcaption><svg viewBox="0 0 300 160" role="img" aria-label={title}><path className="chart-axis" d="M20 20 V130 H285"/><path className="chart-line" d={path}/>{points.map((point, index) => <g key={point.group}><circle cx={20 + index * (260 / Math.max(1, points.length - 1))} cy={130 - (point.value / max) * 100} r="4"/><text x={20 + index * (260 / Math.max(1, points.length - 1))} y="148">{point.group}</text><text x={20 + index * (260 / Math.max(1, points.length - 1))} y={122 - (point.value / max) * 100}>{format(point.value)}</text></g>)}</svg><small>Average waiting steps</small></figure>;
}

function OutcomeChart({ rows }) {
  const colors = { completed: "#4ee59b", recovered: "#36d9ff", deadlock: "#ffb84d", failed: "#ff6b7d" };
  return <figure className="lab-chart outcome-chart"><figcaption>Method-wise Outcome Distribution</figcaption>{rows.map((row) => {
    const total = Math.max(1, Object.values(row.outcomes).reduce((sum, value) => sum + value, 0));
    return <div key={row.method}><span>{shortName(row.label)}</span><i>{Object.entries(row.outcomes).map(([key, value]) => <em key={key} title={`${key}: ${value}`} style={{ width: `${(value / total) * 100}%`, background: colors[key] }} />)}</i></div>;
  })}<small>Completed · Recovered · Deadlock · Failed</small></figure>;
}

function LabTables({ summary, records }) {
  const objectives = [
    ["Least waiting", "averageWaiting", "min"], ["Highest completion rate", "averageCompletionRate", "max"],
    ["Least robots lost", "averageRobotsLost", "min"], ["Least extra path length", "averageExtraPathLength", "min"],
    ["Highest recovery success", "successRate", "max"],
  ];
  return <section className="lab-section"><h2>Result Tables</h2><h3>Summary Table</h3><div className="table-scroll"><table><thead><tr><th>Method</th><th>Avg waiting</th><th>Avg completion</th><th>Avg recovery steps</th><th>Avg extra path</th><th>Avg robots lost</th><th>Success rate</th><th>Runs</th></tr></thead><tbody>{summary.map((row) => <tr key={row.method}><td>{row.label}</td><td>{format(row.averageWaiting)}</td><td>{format(row.averageCompletionRate)}%</td><td>{format(row.averageRecoverySteps)}</td><td>{format(row.averageExtraPathLength)}</td><td>{format(row.averageRobotsLost)}</td><td>{format(row.successRate)}%</td><td>{row.runs}</td></tr>)}</tbody></table></div>
    <h3>Best Method by Objective</h3><table><thead><tr><th>Objective</th><th>Method</th><th>Value</th></tr></thead><tbody>{objectives.map(([label, key, direction]) => {
      const target = direction === "min" ? Math.min(...summary.map((row) => row[key])) : Math.max(...summary.map((row) => row[key])), winners = summary.filter((row) => row[key] === target).map((row) => row.label).join(", ");
      return <tr key={label}><td>{label}</td><td>{winners}</td><td>{format(target)}{key.includes("Rate") || key === "successRate" ? "%" : ""}</td></tr>;
    })}</tbody></table>
    <h3>Per-Run Results</h3><div className="table-scroll detailed"><table><thead><tr><th>Run</th><th>Seed</th><th>Scenario</th><th>Robots</th><th>Congestion</th><th>Method</th><th>Waiting</th><th>Completion steps</th><th>Deadlock occurred</th><th>Resolved</th><th>Completion rate</th><th>Status</th></tr></thead><tbody>{records.map((row, index) => <tr key={`${row.runId}-${row.method}-${index}`}><td>{row.runId}</td><td>{row.seed}</td><td>{row.scenarioType}</td><td>{row.robotCount}</td><td>{row.congestion}</td><td>{LAB_METHOD_NAMES[row.method]}</td><td>{row.waitingSteps}</td><td>{row.completionSteps}</td><td>{row.deadlockOccurred ? "YES" : "NO"}</td><td>{row.deadlockResolved ? "YES" : "NO"}</td><td>{format(row.completionRate)}%</td><td>{row.status}</td></tr>)}</tbody></table></div>
  </section>;
}

function LabAnalysis({ summary, records }) {
  const leastWait = Math.min(...summary.map((row) => row.averageWaiting)),
    bestCompletion = Math.max(...summary.map((row) => row.averageCompletionRate)),
    leastLoss = Math.min(...summary.map((row) => row.averageRobotsLost)),
    highestSuccess = Math.max(...summary.map((row) => row.successRate)),
    winners = (key, value) => summary.filter((row) => row[key] === value).map((row) => row.label).join(", "),
    detection = summary.find((row) => row.method === "detection"),
    prevention = summary.find((row) => row.method === "prevention"),
    congestionRows = ["low", "medium", "high"].map((level) => ({ level, waiting: mean(records.filter((row) => row.method === "detection" && row.congestion === level), "waitingSteps") })),
    costly = congestionRows.at(-1).waiting > congestionRows[0].waiting;
  return <section className="lab-section lab-analysis"><h2>Research Analysis</h2><div className="findings-grid"><div><h3>Key Findings</h3><ul><li>Least waiting: {winners("averageWaiting", leastWait)} ({format(leastWait)} steps).</li><li>Highest completion rate: {winners("averageCompletionRate", bestCompletion)} ({format(bestCompletion)}%).</li><li>Most frequent robot preservation: {winners("averageRobotsLost", leastLoss)} ({format(leastLoss)} average loss).</li><li>Highest recovery success: {winners("successRate", highestSuccess)} ({format(highestSuccess)}%).</li>{prevention && <li>Prevention formed deadlocks in {records.filter((row) => row.method === "prevention" && row.deadlockOccurred).length} recorded runs.</li>}{detection && <li>Detection + Recovery averaged {format(detection.averageWaiting)} waiting steps and {format(detection.successRate)}% success.</li>}</ul></div><div><h3>Trade-off Analysis</h3><p>No single method is optimal for every objective. Lower waiting, task preservation, route length, and recovery success select different winners in this result set.</p><p>{costly ? "Detection + Recovery became more costly as congestion increased in the measured runs." : "The measured runs did not show Detection + Recovery waiting cost increasing with congestion."}</p><p>For task preservation, prefer {winners("averageRobotsLost", leastLoss)}. For minimum waiting, prefer {winners("averageWaiting", leastWait)}. For completion rate, prefer {winners("averageCompletionRate", bestCompletion)}.</p></div></div></section>;
}

const shortName = (name) => name.replace(" / Resource Preemption", "").replace("Process ", "");
const download = (content, type, filename) => {
  const url = URL.createObjectURL(new Blob([content], { type })), anchor = document.createElement("a");
  anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
};
const exportJson = (resultSet) => resultSet && download(JSON.stringify(resultSet, null, 2), "application/json", "agv-experiment-results.json");
const exportCsv = (summary) => {
  const columns = ["Method", "Average Waiting", "Average Completion Rate", "Average Recovery Steps", "Average Extra Path", "Average Robots Lost", "Success Rate", "Runs"],
    lines = summary.map((row) => [row.label, row.averageWaiting, row.averageCompletionRate, row.averageRecoverySteps, row.averageExtraPathLength, row.averageRobotsLost, row.successRate, row.runs].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  download([columns.join(","), ...lines].join("\n"), "text/csv", "agv-experiment-summary.csv");
};
