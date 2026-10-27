import { useEffect, useMemo, useState } from "react";
import WarehouseGrid from "../components/WarehouseGrid.jsx";
import {
  OBSTACLES,
  advanceByStrategy,
  applyRecovery,
  cloneRobots,
  createDeadlockSnapshot,
  generateScenario,
  prepareRecovery,
} from "../logic/simulation.js";

const strategies = ["prevention", "avoidance", "detection"],
  names = {
    prevention: "PREVENTION",
    avoidance: "AVOIDANCE",
    detection: "DETECTION + RECOVERY",
  },
  terminal = (run) =>
    ["COMPLETED", "DEADLOCK", "UNRECOVERABLE", "STALLED", "TIMEOUT"].includes(
      run.status,
    );

const initialRuns = (source) =>
  strategies.map((strategy) => ({
    strategy,
    robots: cloneRobots(source.robots),
    graph: {},
    cycle: null,
    step: 0,
    status: "READY",
    explanation: "Ready to run from the shared initial scenario.",
    observations: [],
    deadlocksFormed: 0,
    resourceRequestsBlocked: 0,
    unsafeRequestsDenied: 0,
    recoveryRequired: false,
    recoverySteps: 0,
    robotsTerminated: 0,
    reroutes: 0,
    extraPathLength: 0,
  }));

const summarize = (notes, fallback) => {
  const important = [...notes]
    .reverse()
    .find((note) => /blocked|denied|deadlock|cycle|reserved/i.test(note));
  return important || notes.at(-1) || fallback;
};

const advanceRun = (run, source, maxSteps = 1000) => {
  if (terminal(run)) return run;
  const result = advanceByStrategy(
    run.robots,
    run.strategy,
    "basic",
    source.obstacles,
  );
  let robots = result.robots,
    graph = result.graph,
    cycle = result.cycle,
    status = "RUNNING",
    explanation = summarize(
      result.notes,
      `No state change during strategy step ${run.step + 1}.`,
    ),
    deadlocksFormed = run.deadlocksFormed + (cycle ? 1 : 0),
    recoverySteps = run.recoverySteps,
    reroutes = run.reroutes,
    extraPathLength = run.extraPathLength,
    recoveryRequired = run.recoveryRequired;

  if (cycle && run.strategy === "detection") {
    const cycleText = cycle.join(" → "),
      snapshot = createDeadlockSnapshot({
        robots,
        graph,
        cycle,
        step: run.step + 1,
        events: [],
        obstacles: source.obstacles,
      }),
      preview = prepareRecovery(snapshot, "reroute");
    explanation = `${cycleText}. Deadlock detected.`;
    if (!preview) status = "UNRECOVERABLE";
    else {
      const applied = applyRecovery(snapshot, preview);
      robots = applied.robots;
      graph = applied.graph;
      cycle = applied.cycle;
      recoveryRequired = true;
      recoverySteps += 1;
      reroutes += 1;
      extraPathLength += preview.extraPathLength || 0;
      explanation += ` ${preview.victim} received a dynamic reroute.`;
    }
  } else if (cycle) status = "DEADLOCK";

  const step = run.step + 1,
    finished = robots.every((robot) =>
      ["Completed", "Terminated"].includes(robot.status),
    );
  if (finished) status = "COMPLETED";
  else if (step >= maxSteps) status = "TIMEOUT";
  else if (
    result.movementSteps === 0 &&
    !result.cycle &&
    run.strategy === "detection" &&
    Object.keys(result.graph).length === 0
  )
    status = "STALLED";

  return {
    ...run,
    robots,
    graph,
    cycle,
    step,
    status,
    explanation,
    observations: [...run.observations, explanation],
    deadlocksFormed,
    resourceRequestsBlocked:
      run.resourceRequestsBlocked + (result.blockedRequests || 0),
    unsafeRequestsDenied:
      run.unsafeRequestsDenied + (result.unsafeDenied || 0),
    recoveryRequired,
    recoverySteps,
    reroutes,
    extraPathLength,
  };
};

const completedMetrics = (run) => {
  const completed = run.robots.filter((robot) => robot.status === "Completed").length;
  return {
    ...run,
    totalWaitingSteps: run.robots.reduce(
      (sum, robot) => sum + robot.waitingSteps,
      0,
    ),
    totalCompletionSteps: run.step,
    completedRobots: completed,
    completionRate: run.robots.length
      ? (completed / run.robots.length) * 100
      : 0,
  };
};

export default function DeadlockStrategies({
  initialScenario,
  savedRuns,
  onResults,
}) {
  const source = useMemo(
      () =>
        initialScenario?.robots?.length
          ? {
              robots: cloneRobots(initialScenario.robots),
              obstacles: new Set(initialScenario.obstacles),
            }
          : {
              robots: generateScenario(5, "guaranteed", 2026),
              obstacles: new Set(OBSTACLES),
            },
      [initialScenario],
    ),
    [runs, setRuns] = useState(() =>
      savedRuns?.length === 3 ? savedRuns : initialRuns(source),
    ),
    [running, setRunning] = useState(false);

  useEffect(() => {
    setRunning(false);
    setRuns(savedRuns?.length === 3 ? savedRuns : initialRuns(source));
  }, [source, savedRuns]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(
      () => setRuns((old) => old.map((run) => advanceRun(run, source))),
      2000,
    );
    return () => window.clearInterval(timer);
  }, [running, source]);

  const ready = runs.every(terminal);
  useEffect(() => {
    if (ready) {
      setRunning(false);
      onResults(runs.map(completedMetrics));
    }
  }, [ready]);

  const runComparison = () => {
      setRuns((old) => old.map((run) => advanceRun(run, source)));
      setRunning(true);
    },
    stepAll = () => {
      setRunning(false);
      setRuns((old) => old.map((run) => advanceRun(run, source)));
    },
    reset = () => {
      setRunning(false);
      setRuns(initialRuns(source));
    },
    rows = ready ? runs.map(completedMetrics) : null;

  return (
    <main className="comparison-page">
      <div className="comparison-heading">
        <div>
          <small>SAME INITIAL SCENARIO</small>
          <h1>Deadlock Strategies</h1>
          <p>
            Prevention, avoidance, and detection use identical robots, paths,
            obstacles, and ordering.
          </p>
        </div>
        <div>
          <button className="primary" onClick={runComparison}>
            Run Comparison
          </button>
          <button onClick={() => setRunning(false)}>Pause</button>
          <button onClick={stepAll}>Step</button>
          <button onClick={reset}>Reset</button>
        </div>
      </div>
      <section className="strategy-grids-simple">
        {runs.map((run) => (
          <article key={run.strategy}>
            <h2>{names[run.strategy]}</h2>
            <WarehouseGrid
              robots={run.robots}
              graph={run.graph}
              cycle={run.cycle}
              obstacles={source.obstacles}
            />
            <p>
              <b>STEP {run.step}</b> · {run.explanation}
            </p>
          </article>
        ))}
      </section>
      {rows && (
        <table className="strategy-table-simple">
          <thead>
            <tr>
              <th>Metric</th>
              {strategies.map((strategy) => (
                <th key={strategy}>{names[strategy]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              ["deadlocksFormed", "Deadlocks"],
              ["resourceRequestsBlocked", "Blocked Requests"],
              ["unsafeRequestsDenied", "Unsafe Denials"],
              ["totalWaitingSteps", "Waiting Steps"],
              ["totalCompletionSteps", "Completion Steps"],
              ["completionRate", "Completion Rate"],
            ].map(([key, label]) => (
              <tr key={key}>
                <td>{label}</td>
                {strategies.map((strategy) => {
                  const value = rows.find(
                    (row) => row.strategy === strategy,
                  )?.[key];
                  return (
                    <td key={strategy}>
                      {key === "completionRate"
                        ? `${value.toFixed(0)}%`
                        : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
