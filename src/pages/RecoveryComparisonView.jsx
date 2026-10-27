import { useEffect, useState } from "react";
import WarehouseGrid from "../components/WarehouseGrid.jsx";
import {
  cloneDeadlockState,
  initializeRecoveryClone,
  stepRecoveryClone,
} from "../logic/recoveryComparison.js";
const methods = ["termination", "rollback", "reroute"],
  names = {
    termination: "PROCESS TERMINATION",
    rollback: "ROLLBACK / RESOURCE PREEMPTION",
    reroute: "DYNAMIC REROUTING",
  };
export default function RecoveryComparisonView({
  snapshot,
  savedRuns,
  onResults,
  onViewResults,
}) {
  const fresh = () =>
      snapshot
        ? methods.map((method) => ({
            method,
            ...cloneDeadlockState(snapshot),
            available: true,
            status: "DEADLOCK",
            action: "Awaiting recovery",
          }))
        : [],
    [runs, setRuns] = useState(() =>
      savedRuns?.length === 3 ? savedRuns : fresh(),
    ),
    [runningMethods, setRunningMethods] = useState(() => new Set());
  useEffect(() => {
    setRuns(savedRuns?.length === 3 ? savedRuns : fresh());
    setRunningMethods(new Set());
  }, [snapshot, savedRuns]);
  const terminal = (run) =>
      ["COMPLETED", "FAILED", "TIMEOUT"].includes(run.status),
    advance = (run) =>
      terminal(run)
        ? run
        : run.status === "DEADLOCK"
          ? initializeRecoveryClone(snapshot, run.method)
          : stepRecoveryClone(run),
    stepAll = () => {
      setRunningMethods(new Set());
      setRuns((old) => old.map(advance));
    };
  useEffect(() => {
    if (!runningMethods.size) return undefined;
    const timer = window.setInterval(
      () =>
        setRuns((old) =>
          old.map((run) =>
            runningMethods.has(run.method) ? advance(run) : run,
          ),
        ),
      2000,
    );
    return () => window.clearInterval(timer);
  }, [runningMethods, snapshot]);
  useEffect(() => {
    setRunningMethods((active) => {
      const next = new Set(
        [...active].filter((method) => {
          const run = runs.find((entry) => entry.method === method);
          return run && !terminal(run);
        }),
      );
      return next.size === active.size ? active : next;
    });
  }, [runs]);
  const ready = runs.length === 3 && runs.every(terminal);
  useEffect(() => {
    if (ready) onResults(runs);
  }, [ready]);
  if (!snapshot)
    return (
      <main className="empty-page">
        <b>NO DEADLOCK SNAPSHOT</b>
        <span>Run the simulator until a deadlock is detected.</span>
      </main>
    );
  const runAll = () => {
      setRuns((old) => old.map(advance));
      setRunningMethods(new Set(methods));
    },
    runOne = (method) => {
      setRuns((old) =>
        old.map((run) => (run.method === method ? advance(run) : run)),
      );
      setRunningMethods((active) => new Set(active).add(method));
    },
    pauseAll = () => setRunningMethods(new Set());
  return (
    <main className="comparison-page">
      <div className="comparison-heading">
        <div>
          <small>ORIGINAL DEADLOCK SUMMARY</small>
          <h1>Recovery Comparison</h1>
          <p>
            Cycle: <b>{snapshot.cycle.join(" → ")}</b> · Captured at step{" "}
            {snapshot.step}
          </p>
        </div>
        <div>
          <button className="primary" onClick={runAll}>
            Run All Methods
          </button>
          <button onClick={stepAll}>Step</button>
          <button onClick={pauseAll}>Pause All</button>
          <button
            onClick={() => {
              pauseAll();
              setRuns(fresh());
            }}
          >
            Reset Comparison
          </button>
          {ready && (
            <button
              onClick={() => {
                onResults(runs);
                onViewResults();
              }}
            >
              View Results
            </button>
          )}
        </div>
      </div>
      <section className="recovery-grids">
        {runs.map((run) => (
          <RecoveryGrid
            key={run.method}
            run={run}
            snapshot={snapshot}
            onStep={stepAll}
            onRun={() => runOne(run.method)}
          />
        ))}
      </section>
    </main>
  );
}
function RecoveryGrid({ run, snapshot, onStep, onRun }) {
  const robots = run.robots || snapshot.robots,
    graph = run.graph || snapshot.graph,
    cycle = run.cycle,
    latest = run.events?.[run.events.length - 1];
  return (
    <article className="recovery-grid-card">
      <header>
        <small>
          GRID{" "}
          {run.method === "termination"
            ? "A"
            : run.method === "rollback"
              ? "B"
              : "C"}
        </small>
        <h2>{names[run.method]}</h2>
        <span>{run.status || "DEADLOCK"}</span>
        <div className="branch-controls">
          <button onClick={onStep}>Step</button>
          <button onClick={onRun}>Run</button>
        </div>
      </header>
      <WarehouseGrid
        robots={robots}
        graph={graph}
        cycle={cycle}
        obstacles={run.obstacles || snapshot.obstacles}
        recoveryPath={
          (run.method === "reroute" && run.preview?.proposedPath) || []
        }
      />
      <div className="recovery-grid-action">
        <b>ACTION</b>
        <span>{run.action}</span>
        {run.method === "reroute" && run.preview && (
          <small>
            Old path:{" "}
            {run.preview.currentPath
              .map((c) => `(${c.row},${c.col})`)
              .join(" → ")}
            <br />
            New path:{" "}
            {run.preview.proposedPath
              .map((c) => `(${c.row},${c.col})`)
              .join(" → ")}
          </small>
        )}
      </div>
      <dl>
        <div>
          <dt>Steps</dt>
          <dd>{terminalRun(run) ? run.metrics?.additionalSteps ?? 0 : "—"}</dd>
        </div>
        <div>
          <dt>Waiting</dt>
          <dd>
            {terminalRun(run) ? run.metrics?.totalWaiting ?? 0 : "—"}
          </dd>
        </div>
        <div>
          <dt>Completed</dt>
          <dd>
            {terminalRun(run) ? run.metrics?.completedRobots ?? 0 : "—"}/
            {robots.length}
          </dd>
        </div>
      </dl>
      <div className="grid-step">
        <b>STEP {latest?.step ?? snapshot.step}</b>
        <span>
          {latest?.text || `Circular wait: ${snapshot.cycle.join(" → ")}`}
        </span>
      </div>
    </article>
  );
}
const terminalRun = (run) =>
  ["COMPLETED", "FAILED", "TIMEOUT"].includes(run.status);
