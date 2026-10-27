import { useState } from "react";
import { FlaskConical, Play } from "lucide-react";
import {
  generateScenario,
  advanceSimulation,
  createDeadlockSnapshot,
  compareRecoveries,
  cloneRobots,
  OBSTACLES,
} from "../logic/simulation.js";

const METHODS = ["termination", "rollback", "reroute"];
const LABELS = {
  termination: "Process Termination",
  rollback: "Rollback",
  reroute: "Dynamic Rerouting",
};
const METRICS = [
  ["deadlockResolved", "Deadlock Resolved"],
  ["recoverySteps", "Recovery Steps"],
  ["additionalSteps", "Additional Simulation Steps"],
  ["totalWaiting", "Total Waiting Steps"],
  ["averageWaiting", "Average Waiting Steps"],
  ["robotsTerminated", "Robots Terminated"],
  ["resourcesReleased", "Resources Released"],
  ["reroutes", "Number of Reroutes"],
  ["extraPathLength", "Extra Path Length"],
  ["completedRobots", "Completed Robots"],
  ["completionRate", "Completion Rate"],
  ["finalStatus", "Final Status"],
];
const avg = (rows, key) =>
  rows.length
    ? rows.reduce((sum, row) => sum + Number(row[key] || 0), 0) / rows.length
    : 0;

function runToDeadlock(initial, seed, scenarioType) {
  let robots = cloneRobots(initial),
    graph = {},
    cycle = null,
    step = 0,
    events = [],
    timeline = [];
  while (
    step < 1000 &&
    !cycle &&
    !robots.every((r) => ["Completed", "Terminated"].includes(r.status))
  ) {
    const result = advanceSimulation(robots, "basic", OBSTACLES);
    step += 1;
    robots = result.robots;
    graph = result.graph;
    cycle = result.cycle;
    const frameEvents = result.notes.map((text) => ({ step, text }));
    events = [...frameEvents, ...events];
    timeline.push({ step, robots, graph, cycle, events: frameEvents });
    if (!cycle && result.movementSteps === 0 && Object.keys(graph).length === 0)
      break;
  }
  return cycle
    ? createDeadlockSnapshot({
        robots,
        graph,
        cycle,
        step,
        events,
        timeline,
        obstacles: OBSTACLES,
        seed,
        scenarioType,
      })
    : null;
}

export default function Experiments() {
  const [count, setCount] = useState(5),
    [runs, setRuns] = useState(5),
    [congestion, setCongestion] = useState("medium"),
    [results, setResults] = useState(null),
    [busy, setBusy] = useState(false);
  const execute = () => {
    setBusy(true);
    setTimeout(() => {
      const collected = Object.fromEntries(
        METHODS.map((method) => [method, []]),
      );
      let deadlocked = 0;
      for (let run = 0; run < runs; run += 1) {
        const seed = 4100 + run * 97 + count,
          type =
            congestion === "low"
              ? "normal"
              : congestion === "medium"
                ? "congested"
                : "deadlock";
        let snapshot = runToDeadlock(
          generateScenario(count, type, seed),
          seed,
          type,
        );
        // High congestion experiments guarantee analyzable deadlock samples while retaining deterministic seeds.
        if (!snapshot && congestion === "high")
          snapshot = runToDeadlock(
            generateScenario(count, "guaranteed", seed),
            seed,
            "guaranteed",
          );
        if (!snapshot) continue;
        deadlocked += 1;
        compareRecoveries(snapshot, "basic").forEach((row) => {
          if (row.available) collected[row.method].push(row);
        });
      }
      setResults({ deadlocked, collected });
      setBusy(false);
    }, 20);
  };
  const recovered = results
    ? Math.max(
        ...METHODS.map(
          (method) =>
            results.collected[method].filter((r) => r.deadlockResolved).length,
        ),
        0,
      )
    : 0;
  return (
    <main className="page experiments">
      <div className="page-heading">
        <span>RESEARCH EXPERIMENT</span>
        <h1>Same-Deadlock Recovery Comparison</h1>
        <p>
          Every strategy starts from a clone of the exact same immutable
          deadlock snapshot.
        </p>
      </div>
      <section className="card experiment-config">
        <div className="config-title">
          <FlaskConical size={20} />
          <div>
            <b>Experiment configuration</b>
            <small>
              Instant headless execution · deterministic seeds · 1000-step
              safety limit
            </small>
          </div>
        </div>
        <label>
          Robot count
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
          >
            {[3, 5, 8, 10].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Congestion
          <select
            value={congestion}
            onChange={(e) => setCongestion(e.target.value)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label>
          Runs
          <select
            value={runs}
            onChange={(e) => setRuns(Number(e.target.value))}
          >
            {[5, 10, 20].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <button onClick={execute} disabled={busy}>
          <Play size={15} />
          {busy ? "Running…" : "Run Experiment"}
        </button>
      </section>
      {!results ? (
        <div className="experiment-empty">
          <FlaskConical size={28} />
          <b>No experiment data yet</b>
          <span>Run a deterministic batch to calculate recovery metrics.</span>
        </div>
      ) : (
        <>
          <section className="card result-table">
            <div className="section-title">
              <span>EXPERIMENT SUMMARY</span>
              <small>
                {runs} RUNS · {count} ROBOTS · {congestion.toUpperCase()}
              </small>
            </div>
            <div className="table-row table-head">
              <b>Scenarios reaching deadlock</b>
              <b>
                {results.deadlocked}/{runs}
              </b>
              <b>Successfully recovered</b>
              <b>
                {recovered}/{results.deadlocked}
              </b>
            </div>
            <div className="table-row">
              <span>Average waiting</span>
              <span>
                {avg(
                  METHODS.flatMap((m) => results.collected[m]),
                  "averageWaiting",
                ).toFixed(2)}
              </span>
              <span>Average recovery steps</span>
              <span>
                {avg(
                  METHODS.flatMap((m) => results.collected[m]),
                  "recoverySteps",
                ).toFixed(2)}
              </span>
            </div>
            <div className="table-row">
              <span>Average completion rate</span>
              <span>
                {avg(
                  METHODS.flatMap((m) => results.collected[m]),
                  "completionRate",
                ).toFixed(1)}
                %
              </span>
              <span>Safety limit</span>
              <span>1000 steps</span>
            </div>
          </section>
          <section className="card result-table">
            <div className="section-title">
              <span>AVERAGED RECOVERY RESULTS</span>
              <small>REAL HEADLESS RUN VALUES</small>
            </div>
            <div className="table-row table-head">
              <b>Metric</b>
              {METHODS.map((m) => (
                <b key={m}>{LABELS[m]}</b>
              ))}
            </div>
            {METRICS.map(([key, label]) => (
              <div className="table-row" key={key}>
                <span>{label}</span>
                {METHODS.map((method) => {
                  const rows = results.collected[method];
                  let value = "N/A";
                  if (rows.length) {
                    if (key === "finalStatus")
                      value = rows.every((r) => r.finalStatus === "COMPLETED")
                        ? "COMPLETED"
                        : "MIXED";
                    else if (key === "deadlockResolved")
                      value = `${rows.filter((r) => r.deadlockResolved).length}/${rows.length}`;
                    else {
                      value =
                        avg(rows, key).toFixed(
                          key === "completionRate" ? 1 : 2,
                        ) + (key === "completionRate" ? "%" : "");
                    }
                  }
                  return <span key={method}>{value}</span>;
                })}
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
