import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Pause,
  Play,
  RotateCcw,
  Shuffle,
  StepForward,
} from "lucide-react";
import WarehouseGrid from "../components/WarehouseGrid.jsx";
import useScenarioBuilder from "../components/ScenarioBuilder.jsx";
import {
  OBSTACLES,
  advanceSimulation,
  applyRecovery,
  cloneRobots,
  compareRecoveries,
  createDeadlockSnapshot,
  defaultRobots,
  generateScenario,
  prepareRecovery,
} from "../logic/simulation.js";
const MAX_STEPS = 1000;
const resetRobots = (source) =>
  cloneRobots(source).map((r) => ({
    ...r,
    position: { ...r.initialPath[0] },
    path: r.initialPath.map((c) => ({ ...c })),
    status: "Moving",
    waitingSteps: 0,
    history: [],
    reservedCells: [],
    requestedCell: null,
    resourceHolder: null,
    rerouted: false,
  }));
const methodCopy = {
  termination: [
    "TERMINATE ONE ROBOT",
    "Remove one robot from the cycle and release its resource.",
  ],
  rollback: [
    "ROLLBACK ONE ROBOT",
    "Move one robot back to its previous safe cell.",
  ],
  reroute: [
    "REROUTE ONE ROBOT",
    "Give one robot a different path around the blocked area.",
  ],
};
export default function SimpleSimulator({ onDeadlock, onCompare, onScenario }) {
  const first = defaultRobots(),
    [robots, setRobots] = useState(first),
    [initial, setInitial] = useState(first),
    [obstacles, setObstacles] = useState(() => new Set(OBSTACLES)),
    [initialObstacles, setInitialObstacles] = useState(
      () => new Set(OBSTACLES),
    );
  const [scenario, setScenario] = useState("auto"),
    [editing, setEditing] = useState(false),
    [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(3000),
    [step, setStep] = useState(0),
    [graph, setGraph] = useState({}),
    [cycle, setCycle] = useState(null),
    [selected, setSelected] = useState("R1"),
    [events, setEvents] = useState([
      { step: 0, text: "Ready. Choose Manual or Auto Deadlock." },
    ]);
  const [snapshot, setSnapshot] = useState(null),
    [recoveryOpen, setRecoveryOpen] = useState(false),
    [showDeadlockPopup, setShowDeadlockPopup] = useState(false),
    [preview, setPreview] = useState(null),
    [comparison, setComparison] = useState(null),
    [resolved, setResolved] = useState(""),
    [sound, setSound] = useState(true);
  const audioRef = useRef(null),
    live = useRef({});
  live.current = { robots, obstacles, step, cycle, events };
  const beep = useCallback(() => {
    if (!sound) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = audioRef.current || new Ctx();
    audioRef.current = ctx;
    ctx.resume();
    [0, 0.35, 0.7].forEach((delay, i) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.frequency.value = i % 2 ? 620 : 850;
      gain.gain.setValueAtTime(0.06, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        ctx.currentTime + delay + 0.25,
      );
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.27);
    });
  }, [sound]);
  const tick = useCallback(() => {
    const s = live.current;
    if (s.cycle || s.step >= MAX_STEPS) return setRunning(false);
    const next = s.step + 1,
      result = advanceSimulation(s.robots, "basic", s.obstacles),
      newEvents = result.notes.map((text) => ({ step: next, text }));
    setRobots(result.robots);
    setGraph(result.graph);
    setCycle(result.cycle);
    setStep(next);
    setEvents((old) => [...old, ...newEvents]);
    if (result.cycle) {
      const snap = createDeadlockSnapshot({
        robots: result.robots,
        graph: result.graph,
        cycle: result.cycle,
        step: next,
        events: [...s.events, ...newEvents],
        obstacles: s.obstacles,
        scenarioType: scenario,
      });
      setSnapshot(snap);
      onDeadlock?.(snap);
      setRunning(false);
      setRecoveryOpen(false);
      setShowDeadlockPopup(true);
      setComparison(null);
      beep();
    } else if (
      result.robots.every((r) => ["Completed", "Terminated"].includes(r.status))
    )
      setRunning(false);
  }, [beep, scenario, onDeadlock]);
  useEffect(() => {
    if (!running || speed === 0) return;
    const id = setInterval(tick, speed);
    return () => clearInterval(id);
  }, [running, speed, tick]);
  const reset = () => {
    setRunning(false);
    setRobots(resetRobots(initial));
    setObstacles(new Set(initialObstacles));
    setStep(0);
    setGraph({});
    setCycle(null);
    setEvents([{ step: 0, text: "Scenario reset." }]);
    setSnapshot(null);
    setRecoveryOpen(false);
    setShowDeadlockPopup(false);
    setPreview(null);
    setComparison(null);
    setResolved("");
  };
  const auto = () => {
    const generated = generateScenario(5, "guaranteed", 2026);
    setScenario("auto");
    setEditing(false);
    setInitial(cloneRobots(generated));
    onScenario?.({
      robots: cloneRobots(generated),
      obstacles: new Set(OBSTACLES),
    });
    setRobots(cloneRobots(generated));
    setObstacles(new Set(OBSTACLES));
    setInitialObstacles(new Set(OBSTACLES));
    setStep(0);
    setGraph({});
    setCycle(null);
    setSnapshot(null);
    setRecoveryOpen(false);
    setShowDeadlockPopup(false);
    setPreview(null);
    setComparison(null);
    setResolved("");
    setEvents([
      {
        step: 0,
        text: "Auto deadlock scenario generated. Robots will move before contention begins.",
      },
    ]);
  };
  const chooseManual = () => {
    setScenario("manual");
    setEditing(true);
    setRunning(false);
    setRobots([]);
    setInitial([]);
    setObstacles(new Set());
    setInitialObstacles(new Set());
    setStep(0);
    setGraph({});
    setCycle(null);
    setSnapshot(null);
    setRecoveryOpen(false);
    setShowDeadlockPopup(false);
    setPreview(null);
    setComparison(null);
    setResolved("");
    setSelected("");
    setEvents([
      { step: 0, text: "Manual builder ready. Current tool: Place Robot." },
    ]);
  };
  const builder = useScenarioBuilder({
    active: editing,
    setActive: (value) => {
      setEditing(value);
      setRunning(false);
    },
    robots,
    setRobots,
    obstacles,
    setObstacles,
    selected,
    setSelected,
    onValidated: (next, nextObstacles) => {
      setInitial(cloneRobots(next));
      setInitialObstacles(new Set(nextObstacles));
      onScenario?.({
        robots: cloneRobots(next),
        obstacles: new Set(nextObstacles),
      });
      setStep(0);
      setGraph({});
      setCycle(null);
      setEvents([{ step: 0, text: "Manual scenario validated and ready." }]);
    },
  });
  const showPreview = (method) => setPreview(prepareRecovery(snapshot, method));
  const chooseRecovery = () => {
    setShowDeadlockPopup(false);
    setRecoveryOpen(true);
  };
  const apply = () => {
    if (!preview) return;
    const result = applyRecovery(snapshot, preview),
      oldHolder = snapshot.graph[preview.victim],
      message =
        preview.method === "termination"
          ? `${preview.victim} was terminated. Its resource was released and the cycle was broken.`
          : preview.method === "rollback"
            ? `${preview.victim} moved to its previous safe cell. Its blocking dependency was removed.`
            : `${preview.victim} was rerouted. Dependency ${preview.victim} → ${oldHolder} was removed. The circular wait no longer exists.`;
    setRobots(result.robots);
    setGraph(result.graph);
    setCycle(result.cycle);
    setResolved(
      result.cycle ? "RECOVERY FAILED / DEADLOCK STILL EXISTS" : message,
    );
    setEvents((old) => [
      ...old,
      { step: step + 1, text: `Recovery: ${message}` },
    ]);
    setPreview(null);
    setShowDeadlockPopup(false);
    setRecoveryOpen(Boolean(result.cycle));
    setRunning(!result.cycle && speed > 0);
  };
  const compare = () =>
    onCompare
      ? onCompare(snapshot)
      : setComparison(compareRecoveries(snapshot, "basic"));
  const waiting = robots.filter((r) => r.status === "Waiting").length,
    done = robots.every((r) => ["Completed", "Terminated"].includes(r.status)),
    status = cycle
      ? ["deadlock", "DEADLOCK"]
      : done
        ? ["completed", "COMPLETED"]
        : resolved
          ? ["recovered", "RECOVERED"]
          : waiting
            ? ["waiting", "WAITING / CONTENTION"]
            : ["normal", "NORMAL"],
    chosen = robots.find((r) => r.id === selected) || robots[0],
    lastEvent = events[events.length - 1];
  return (
    <main className={`simple-app ${cycle ? "alarm-active" : ""}`}>
      <header className="simple-header">
        <div>
          <b>WareFlow</b>
          <span>Multi-AGV Deadlock Demonstrator</span>
        </div>
        <button onClick={() => setSound((v) => !v)}>
          Sound {sound ? "On" : "Off"}
        </button>
      </header>
      <section className={`simple-status ${status[0]}`}>
        <b>{status[1]}</b>
        <span>Step {step}</span>
      </section>
      <div className="simple-layout">
        <section className="simple-stage">
          <WarehouseGrid
            robots={robots}
            cycle={cycle}
            graph={graph}
            selected={selected}
            onSelect={setSelected}
            recoveryPath={
              preview?.method === "reroute" ? preview.proposedPath : []
            }
            obstacles={obstacles}
            editMode={editing}
            onCellClick={builder.onCellClick}
          />
          {cycle && showDeadlockPopup && (
            <div className="deadlock-banner">
              <AlertTriangle size={24} />
              <b>DEADLOCK DETECTED</b>
              <span>Circular wait: {cycle.join(" → ")}</span>
              <button type="button" onClick={chooseRecovery}>
                Choose Recovery Method
              </button>
            </div>
          )}
          {chosen && (
            <div className="simple-robot">
              <b>Robot {chosen.id}</b>
              <span>
                Current Cell{" "}
                <strong>
                  ({chosen.position.row},{chosen.position.col})
                </strong>
              </span>
              <span>
                Next Requested Cell{" "}
                <strong>
                  {chosen.path[1]
                    ? `(${chosen.path[1].row},${chosen.path[1].col})`
                    : "None"}
                </strong>
              </span>
              <span>
                Waiting For <strong>{graph[chosen.id] || "—"}</strong>
              </span>
              <span>
                State <strong>{chosen.status}</strong>
              </span>
            </div>
          )}
          {resolved && (
            <div className="resolved-message">
              <b>DEADLOCK RESOLVED</b>
              <span>{resolved}</span>
            </div>
          )}
        </section>
        <aside className="simple-controls">
          <section>
            <small>SCENARIO</small>
            <div className="choice-row">
              <button
                className={scenario === "manual" ? "active" : ""}
                onClick={chooseManual}
              >
                Manual
              </button>
              <button
                className={scenario === "auto" ? "active" : ""}
                onClick={auto}
              >
                Auto Deadlock
              </button>
            </div>
            {scenario === "auto" && (
              <button className="wide primary" onClick={auto}>
                <Shuffle size={15} /> Generate Deadlock Scenario
              </button>
            )}
          </section>
          {scenario === "manual" && builder.panel}
          <section>
            <small>SIMULATION</small>
            <div className="run-row">
              <button
                className="primary"
                onClick={() => !cycle && speed > 0 && setRunning(true)}
              >
                <Play size={15} /> Start
              </button>
              <button onClick={() => setRunning(false)}>
                <Pause size={15} /> Pause
              </button>
              <button
                onClick={() => {
                  setRunning(false);
                  tick();
                }}
              >
                <StepForward size={15} /> Step
              </button>
              <button onClick={reset}>
                <RotateCcw size={15} /> Reset
              </button>
            </div>
            <label>
              Speed
              <select
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
              >
                <option value="3000">3 sec</option>
                <option value="5000">5 sec</option>
                <option value="0">Manual</option>
              </select>
            </label>
          </section>
          {cycle && (
            <section className="simple-deadlock">
              <AlertTriangle size={24} />
              <b>DEADLOCK DETECTED</b>
              <span>Circular wait: {cycle.join(" → ")}</span>
              <button
                type="button"
                className="primary wide"
                onClick={chooseRecovery}
              >
                Choose Recovery Method
              </button>
              <button type="button" className="wide" onClick={compare}>
                Compare Methods
              </button>
            </section>
          )}
          {snapshot && !cycle && (
            <section className="post-recovery-compare">
              <button type="button" className="wide" onClick={compare}>
                Compare Methods
              </button>
            </section>
          )}
          {recoveryOpen && snapshot && (
            <RecoveryPanel
              preview={preview}
              onPreview={showPreview}
              onApply={apply}
            />
          )}{" "}
          {comparison && <Comparison rows={comparison} />}
        </aside>
      </div>
      <SimpleTimeline events={events} cycle={cycle} current={lastEvent} />
    </main>
  );
}
function RecoveryPanel({ preview, onPreview, onApply }) {
  return (
    <section className="simple-recovery">
      <small>HOW DO YOU WANT TO RECOVER?</small>
      {Object.entries(methodCopy).map(([method, [title, copy]]) => (
        <article
          className={preview?.method === method ? "selected" : ""}
          key={method}
        >
          <b>{title}</b>
          <span>{copy}</span>
          <div>
              <button type="button" onClick={() => onPreview(method)}>Preview</button>
              <button
                type="button"
              className="primary"
              disabled={preview?.method !== method}
              onClick={onApply}
            >
              Apply
            </button>
          </div>
          {preview?.method === method && (
            <p>{preview.reason} The circular wait will be broken.</p>
          )}
        </article>
      ))}
    </section>
  );
}
function Comparison({ rows }) {
  const metric = (method, key) => {
    const row = rows.find((r) => r.method === method);
    if (!row?.available) return "N/A";
    if (key === "robotsLost") return row.robotsTerminated;
    if (key === "extraPath") return row.extraPathLength;
    if (key === "waiting") return row.totalWaiting;
    if (key === "completion") return `${row.completionRate.toFixed(0)}%`;
    return row.recoverySteps;
  };
  return (
    <section className="simple-comparison">
      <small>SAME DEADLOCK SNAPSHOT</small>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Termination</th>
            <th>Rollback</th>
            <th>Rerouting</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["recoverySteps", "Recovery Steps"],
            ["waiting", "Waiting Steps"],
            ["robotsLost", "Robots Lost"],
            ["extraPath", "Extra Path"],
            ["completion", "Completion Rate"],
          ].map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              {["termination", "rollback", "reroute"].map((method) => (
                <td key={method}>{metric(method, key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function SimpleTimeline({ events, cycle, current }) {
  const recent = events
    .filter((e) =>
      /moved|WAITING|waiting|requested|Recovery|Deadlock/i.test(e.text),
    )
    .slice(-7);
  return (
    <section className="simple-timeline">
      <div className="step-explanation">
        <small>STEP {current?.step || 0}</small>
        <b>{current?.text || "Ready to begin."}</b>
        {cycle && (
          <>
            <span>Wait chain: {cycle.join(" → ")}</span>
            <strong>CIRCULAR WAIT DETECTED — DEADLOCK</strong>
          </>
        )}
      </div>
      <div className="history">
        {recent.map((event, index) => (
          <div key={`${event.step}-${index}`}>
            <b>Step {event.step}</b>
            <span>{event.text}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
