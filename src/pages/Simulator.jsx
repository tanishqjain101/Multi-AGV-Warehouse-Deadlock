import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Radio, SkipBack, SkipForward } from "lucide-react";
import WarehouseGrid from "../components/WarehouseGrid.jsx";
import ControlPanel from "../components/ControlPanel.jsx";
import SystemMonitor from "../components/SystemMonitor.jsx";
import WaitForGraph from "../components/WaitForGraph.jsx";
import EventLog from "../components/EventLog.jsx";
import DeadlockExperience from "../components/DeadlockExperience.jsx";
import RecoveryCenter from "../components/RecoveryCenter.jsx";
import useScenarioBuilder from "../components/ScenarioBuilder.jsx";
import {
  defaultRobots,
  generateScenario,
  advanceSimulation,
  advanceByStrategy,
  createDeadlockSnapshot,
  prepareRecovery,
  applyRecovery,
  compareRecoveries,
  compareHandlingStrategies,
  cloneRobots,
  OBSTACLES,
} from "../logic/simulation.js";

const fresh = (source) =>
  cloneRobots(source).map((r) => ({
    ...r,
    position: { ...r.initialPath[0] },
    path: r.initialPath.map((c) => ({ ...c })),
    status: "Moving",
    waitingSteps: 0,
    rerouted: false,
    reservedCells: [],
    history: [],
    congestionScore: 0,
    congestionLabel: "Low",
    reservationDepth: 1,
  }));
const MAX_STEPS = 1000;
export default function Simulator({ onResult }) {
  const initial = defaultRobots();
  const [robots, setRobots] = useState(initial),
    [original, setOriginal] = useState(initial),
    [obstacles, setObstacles] = useState(() => new Set(OBSTACLES)),
    [originalObstacles, setOriginalObstacles] = useState(
      () => new Set(OBSTACLES),
    );
  const [running, setRunning] = useState(false),
    [speed, setSpeed] = useState(3000),
    [mode, setModeState] = useState("basic"),
    [selected, setSelected] = useState("R1"),
    [editMode, setEditMode] = useState(false),
    [randomType, setRandomType] = useState("normal"),
    [seed, setSeed] = useState(2026),
    [scenarioType, setScenarioType] = useState("built-in"),
    [stalled, setStalled] = useState(false);
  const [handlingStrategy, setHandlingStrategy] = useState("detection"),
    [strategyMetrics, setStrategyMetrics] = useState({
      blocked: 0,
      denied: 0,
      reserved: 0,
    }),
    [strategyComparison, setStrategyComparison] = useState(null),
    [inspectedCell, setInspectedCell] = useState(null);
  const [step, setStep] = useState(0),
    [graph, setGraph] = useState({}),
    [cycle, setCycle] = useState(null),
    [deadlocks, setDeadlocks] = useState(0),
    [reroutes, setReroutes] = useState(0),
    [message, setMessage] = useState("");
  const [events, setEvents] = useState([
      { step: 0, text: "Deterministic five-step deadlock demo loaded" },
    ]),
    [sound, setSound] = useState(true),
    [presentation, setPresentation] = useState(false),
    [popup, setPopup] = useState(false),
    [inspecting, setInspecting] = useState(false),
    [recovering, setRecovering] = useState(false),
    [recoveryPath, setRecoveryPath] = useState([]),
    [toast, setToast] = useState("");
  const [snapshot, setSnapshot] = useState(null),
    [recoveryOpen, setRecoveryOpen] = useState(false),
    [recoveryPreview, setRecoveryPreview] = useState(null),
    [summary, setSummary] = useState(null),
    [comparison, setComparison] = useState(null),
    [replay, setReplay] = useState(false),
    [replayIndex, setReplayIndex] = useState(0),
    [timeline, setTimeline] = useState([]);
  const audioRef = useRef(null),
    state = useRef({});
  state.current = {
    robots,
    step,
    mode,
    cycle,
    deadlocks,
    reroutes,
    events,
    obstacles,
    timeline,
    seed,
    scenarioType,
  };
  const log = (items, n) =>
    setEvents((old) =>
      [...items.map((text) => ({ step: n, text })), ...old].slice(0, 24),
    );
  const unlockAudio = () => {
    if (!audioRef.current) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioRef.current = new AudioContext();
    }
    audioRef.current?.resume();
  };
  const playAlarm = useCallback(() => {
    if (!sound || !audioRef.current) return;
    const ctx = audioRef.current,
      now = ctx.currentTime;
    [0, 0.45, 0.9, 1.35, 1.8].forEach((delay, i) => {
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.frequency.value = i % 2 ? 620 : 880;
      gain.gain.setValueAtTime(0.08, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.32);
    });
  }, [sound]);
  const tick = useCallback(() => {
    const s = state.current;
    if (s.cycle || recovering || editMode || replay) {
      setRunning(false);
      return;
    }
    if (s.step >= MAX_STEPS) {
      setRunning(false);
      setStalled(true);
      log(["Simulation exceeded maximum steps without completion."], s.step);
      return;
    }
    const n = s.step + 1,
      result = advanceByStrategy(
        s.robots,
        handlingStrategy,
        s.mode,
        s.obstacles,
      );
    setStrategyMetrics((old) => ({
      blocked: old.blocked + (result.blockedRequests || 0),
      denied: old.denied + (result.unsafeDenied || 0),
      reserved: result.reservedResources || 0,
    }));
    let ds = s.deadlocks;
    const newEvents = result.notes.map((text) => ({ step: n, text })),
      frame = {
        step: n,
        robots: result.robots,
        graph: result.graph,
        cycle: result.cycle,
        events: newEvents,
      },
      nextTimeline = [...s.timeline, frame];
    setTimeline(nextTimeline);
    if (result.cycle && handlingStrategy === "detection") {
      ds++;
      setDeadlocks(ds);
      setRunning(false);
      setPopup(true);
      setSnapshot(
        createDeadlockSnapshot({
          robots: result.robots,
          graph: result.graph,
          cycle: result.cycle,
          step: n,
          events: [...newEvents, ...s.events],
          timeline: nextTimeline,
          obstacles: s.obstacles,
          seed: s.seed,
          scenarioType: s.scenarioType,
          metrics: {
            deadlocks: ds,
            waitingSteps: result.robots.reduce((a, r) => a + r.waitingSteps, 0),
          },
        }),
      );
      setSummary(null);
      setComparison(null);
      playAlarm();
    }
    setRobots(result.robots);
    setGraph(result.graph);
    setCycle(result.cycle);
    setStep(n);
    log(result.notes, n);
    if (
      !result.cycle &&
      result.robots.every((r) => ["Completed", "Terminated"].includes(r.status))
    ) {
      setRunning(false);
      onResult(s.mode, {
        completed: result.robots.filter((r) => r.status === "Completed").length,
        deadlocks: ds,
        reroutes: s.reroutes,
        steps: n,
        avgWait:
          result.robots.reduce((a, r) => a + r.waitingSteps, 0) /
          result.robots.length,
      });
    }
  }, [onResult, playAlarm, recovering, editMode, replay, handlingStrategy]);
  useEffect(() => {
    if (!running || speed === 0) return;
    const id = setInterval(tick, speed);
    return () => clearInterval(id);
  }, [running, speed, tick]);
  const chooseRecovery = () => {
    setPopup(false);
    setRecoveryOpen(true);
    setRecoveryPreview(null);
  };
  const previewMethod = (method, victim) => {
    const p = prepareRecovery(snapshot, method, victim);
    if (!p) {
      setToast(`${method.toUpperCase()} unavailable for this snapshot`);
      return;
    }
    setRecoveryPreview(p);
    setRecoveryPath(p.proposedPath || []);
  };
  const applySelected = () => {
    if (!recoveryPreview) return;
    setRecovering(true);
    setTimeout(() => {
      const applied = applyRecovery(snapshot, recoveryPreview);
      const change =
        recoveryPreview.method === "termination"
          ? `${recoveryPreview.victim} terminated and released Cell (${snapshot.robots.find((r) => r.id === recoveryPreview.victim).position.row},${snapshot.robots.find((r) => r.id === recoveryPreview.victim).position.col}).`
          : recoveryPreview.method === "rollback"
            ? `${recoveryPreview.victim} rolled back to Cell (${recoveryPreview.previous.row},${recoveryPreview.previous.col}).`
            : `${recoveryPreview.victim} was rerouted and its former dependency was removed.`;
      setRobots(applied.robots);
      setGraph(applied.graph);
      setCycle(applied.cycle);
      setReroutes((x) => x + (recoveryPreview.method === "reroute" ? 1 : 0));
      setSummary({ ...applied, change });
      setRecoveryPreview(null);
      setRecoveryPath([]);
      setRecovering(false);
      setToast("DEADLOCK RESOLVED — System operation resumed");
      log(
        [
          `Recovery selected: ${recoveryPreview.method}. Victim: ${recoveryPreview.victim}`,
          change,
          "Circular wait no longer exists — deadlock resolved",
        ],
        step + 1,
      );
      setRunning(speed > 0);
      setTimeout(() => setToast(""), 3500);
    }, 600);
  };
  const compare = () => setComparison(compareRecoveries(snapshot, mode));
  const startReplay = () => {
    setReplay(true);
    setReplayIndex(0);
    setRecoveryOpen(false);
    setRunning(false);
  };
  const reset = () => {
    setRunning(false);
    setRobots(fresh(original));
    setObstacles(new Set(originalObstacles));
    setStep(0);
    setGraph({});
    setCycle(null);
    setDeadlocks(0);
    setReroutes(0);
    setMessage("");
    setRecovering(false);
    setRecoveryPath([]);
    setPopup(false);
    setInspecting(false);
    setRecoveryOpen(false);
    setSnapshot(null);
    setSummary(null);
    setReplay(false);
    setTimeline([]);
    setStalled(false);
    setStrategyMetrics({ blocked: 0, denied: 0, reserved: 0 });
    setStrategyComparison(null);
    setEvents([{ step: 0, text: "Scenario reset to initial state" }]);
  };
  const changeHandlingStrategy = (strategy) => {
    reset();
    setHandlingStrategy(strategy);
  };
  const compareStrategies = () =>
    setStrategyComparison(
      compareHandlingStrategies(
        fresh(original),
        mode,
        new Set(originalObstacles),
        MAX_STEPS,
      ),
    );
  const resetToDeadlock = () => {
    if (!snapshot) return;
    setRunning(false);
    setRobots(cloneRobots(snapshot.robots));
    setObstacles(new Set(snapshot.obstacles));
    setStep(snapshot.step);
    setGraph({ ...snapshot.graph });
    setCycle([...snapshot.cycle]);
    setEvents(snapshot.events.map((e) => ({ ...e })));
    setTimeline(snapshot.timeline.map((f) => ({ ...f })));
    setSummary(null);
    setComparison(null);
    setRecoveryPreview(null);
    setRecoveryPath([]);
    setPopup(true);
    setRecoveryOpen(false);
    setReplay(false);
    setStalled(false);
  };
  const generate = () => {
    const value = Number(seed) >>> 0,
      rs = generateScenario(5, randomType, value);
    setOriginal(cloneRobots(rs));
    setRobots(cloneRobots(rs));
    setObstacles(new Set(OBSTACLES));
    setOriginalObstacles(new Set(OBSTACLES));
    setScenarioType(randomType);
    setRunning(false);
    setStep(0);
    setGraph({});
    setCycle(null);
    setSnapshot(null);
    setSummary(null);
    setPopup(false);
    setTimeline([]);
    setStalled(false);
    setStrategyMetrics({ blocked: 0, denied: 0, reserved: 0 });
    setStrategyComparison(null);
    setEvents([
      { step: 0, text: `${randomType} scenario generated from seed ${value}` },
    ]);
  };
  const builder = useScenarioBuilder({
    active: editMode,
    setActive: (v) => {
      setEditMode(v);
      setRunning(false);
    },
    robots,
    setRobots,
    obstacles,
    setObstacles,
    selected,
    setSelected,
    onValidated: (rs, obs) => {
      setOriginal(cloneRobots(rs));
      setOriginalObstacles(new Set(obs));
      setStep(0);
      setGraph({});
      setCycle(null);
    },
  });
  const waiting = robots.filter((r) =>
      ["Waiting", "Avoidance Blocked"].includes(r.status),
    ).length,
    allDone = robots.every((r) =>
      ["Completed", "Terminated"].includes(r.status),
    ),
    simState = stalled
      ? "STALLED / TIMEOUT"
      : editMode
        ? "EDITING"
        : recovering
          ? "RECOVERY"
          : cycle
            ? "DEADLOCK"
            : allDone
              ? "COMPLETED"
              : waiting
                ? "CONTENTION"
                : running
                  ? "RUNNING"
                  : replay
                    ? "REPLAY"
                    : step === 0
                      ? "IDLE"
                      : "PAUSED";
  const status = cycle
    ? [
        "critical",
        "CRITICAL — DEADLOCK",
        `${cycle.length - 1} processes locked in circular wait`,
      ]
    : waiting
      ? [
          "contention",
          "RESOURCE CONTENTION",
          `${waiting} ROBOT${waiting === 1 ? "" : "S"} WAITING`,
        ]
      : allDone
        ? ["complete", "SYSTEM COMPLETE", "All robot tasks finished"]
        : [
            "operational",
            editMode ? "SCENARIO EDIT MODE" : "OPERATIONAL",
            running ? "Autonomous execution active" : "System ready",
          ];
  const replayFrame = snapshot?.timeline?.[replayIndex];
  const viewRobots = replay ? replayFrame?.robots || snapshot.robots : robots,
    viewGraph = replay ? replayFrame?.graph || snapshot.graph : graph,
    viewCycle = replay ? replayFrame?.cycle || null : cycle,
    chosen = viewRobots.find((r) => r.id === selected) || viewRobots[0],
    interact = (fn) => () => {
      unlockAudio();
      fn();
    };
  const replayEvents = snapshot?.timeline || [];
  return (
    <div
      className={`simulator-page ${presentation ? "presentation-mode" : ""} ${cycle ? "alarm-active" : ""}`}
    >
      <div className={`system-status ${status[0]}`}>
        <div>
          <Radio size={14} />
          <b>SYSTEM STATUS: {status[1]}</b>
          <span>{status[2]}</span>
        </div>
        <strong>
          STATE <em>{simState}</em>
        </strong>
      </div>
      <section className="handling-strategy card">
        <div>
          <small>DEADLOCK HANDLING STRATEGY</small>
          <div className="strategy-buttons">
            {[
              ["prevention", "Critical-Section Hold-and-Wait Prevention"],
              ["avoidance", "Cycle-Aware One-Step Deadlock Avoidance"],
              ["detection", "Detection + Recovery"],
            ].map(([id, label]) => (
              <button
                className={handlingStrategy === id ? "active" : ""}
                onClick={() => changeHandlingStrategy(id)}
                key={id}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="strategy-description">
          <b>
            {handlingStrategy === "prevention"
              ? "Critical-Section Hold-and-Wait Prevention"
              : handlingStrategy === "avoidance"
                ? "Cycle-Aware One-Step Deadlock Avoidance"
                : "STRATEGY: DEADLOCK DETECTION + RECOVERY"}
          </b>
          <span>
            {handlingStrategy === "prevention"
              ? "Before entering a shared critical section, the robot must atomically reserve the complete required shared segment. If the complete set is unavailable, it waits outside without retaining partial reservations in that segment."
              : handlingStrategy === "avoidance"
                ? "Before granting the current resource request, the system projects the allocation and checks whether it would create a circular wait. If so, the request is temporarily denied. This is not Banker's Algorithm and does not perform full future safe-sequence analysis."
                : "Resources are granted normally. A real wait-for cycle triggers detection, an immutable snapshot, and recovery."}
          </span>
          {handlingStrategy === "prevention" && (
            <em>
              Hold-and-Wait is prevented within the shared critical section; it
              is not claimed to be globally eliminated from every warehouse
              resource.
            </em>
          )}
          <small>
            Blocked: {strategyMetrics.blocked} · Unsafe denied:{" "}
            {strategyMetrics.denied} · Reserved now: {strategyMetrics.reserved}
          </small>
        </div>
        <button className="compare-strategies" onClick={compareStrategies}>
          Compare Deadlock Handling Strategies
        </button>
      </section>
      {strategyComparison && <StrategyComparison rows={strategyComparison} />}
      {builder.panel}
      <div className="random-type">
        <label>
          Random Type
          <select
            value={randomType}
            onChange={(e) => setRandomType(e.target.value)}
          >
            <option value="normal">Normal Random</option>
            <option value="congested">Congested Random</option>
            <option value="deadlock">Deadlock-Prone Random</option>
            <option value="guaranteed">Guaranteed Deadlock Demo</option>
          </select>
        </label>
        <label>
          Random Seed
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
          />
        </label>
        {snapshot && (
          <button onClick={resetToDeadlock}>Reset to Deadlock State</button>
        )}
      </div>
      <ControlPanel
        running={running}
        onStart={interact(
          () =>
            !cycle && speed > 0 && !editMode && !stalled && setRunning(true),
        )}
        onPause={() => setRunning(false)}
        onStep={interact(() => {
          setRunning(false);
          tick();
        })}
        onReset={reset}
        onGenerate={generate}
        speed={speed}
        setSpeed={setSpeed}
        mode={mode}
        setMode={(m) => {
          setModeState(m);
          setRunning(false);
        }}
        sound={sound}
        setSound={setSound}
        presentation={presentation}
        setPresentation={setPresentation}
      />
      <main className="sim-layout">
        <div className="sim-left">
          <div className="sim-label">
            <div>
              <span>
                {editMode
                  ? "EDIT MODE · CLICK CELLS TO BUILD"
                  : "ZONE A · AUTONOMOUS FLOOR"}
              </span>
              <h2>Warehouse Resource Map</h2>
            </div>
            <p>
              TICK{" "}
              <b>
                {String(replay ? replayFrame?.step || 0 : step).padStart(
                  3,
                  "0",
                )}
              </b>
            </p>
          </div>
          <WarehouseGrid
            robots={viewRobots}
            cycle={viewCycle}
            graph={viewGraph}
            adaptive={mode === "adaptive"}
            selected={selected}
            onSelect={setSelected}
            recoveryPath={recoveryPath}
            obstacles={replay ? snapshot.obstacles : obstacles}
            editMode={editMode}
            onCellClick={builder.onCellClick}
            onInspectCell={setInspectedCell}
          />
          {replay && (
            <div className="replay-bar">
              <button onClick={() => setReplayIndex((i) => Math.max(0, i - 1))}>
                <SkipBack size={14} /> Previous Event
              </button>
              <div>
                <b>REPLAY DEADLOCK</b>
                <span>
                  {replayFrame?.events
                    ?.map((event) => event.text)
                    .join(" · ") || "Initial scenario state"}
                </span>
              </div>
              <button
                onClick={() =>
                  setReplayIndex((i) =>
                    Math.min(replayEvents.length - 1, i + 1),
                  )
                }
              >
                Next Event <SkipForward size={14} />
              </button>
              <button onClick={() => setReplay(false)}>Exit Replay</button>
            </div>
          )}
          {chosen && (
            <div className="robot-inspector">
              <div>
                <i style={{ background: chosen.color }} />
                <b>Robot {chosen.id}</b>
                <span>{chosen.status}</span>
              </div>
              <dl>
                <div>
                  <dt>Current cell</dt>
                  <dd>
                    ({chosen.position.row},{chosen.position.col})
                  </dd>
                </div>
                <div>
                  <dt>Next request</dt>
                  <dd>
                    {chosen.path[1]
                      ? `(${chosen.path[1].row},${chosen.path[1].col})`
                      : "None"}
                  </dd>
                </div>
                <div>
                  <dt>Resource holder</dt>
                  <dd>{viewGraph[chosen.id] || "Free"}</dd>
                </div>
                <div>
                  <dt>Path mode</dt>
                  <dd>{chosen.pathMode || "Automatic"}</dd>
                </div>
                <div>
                  <dt>Past cells</dt>
                  <dd>{chosen.history?.length || 0}</dd>
                </div>
                <div>
                  <dt>Future cells</dt>
                  <dd>{Math.max(0, chosen.path.length - 1)}</dd>
                </div>
                <div>
                  <dt>Waiting</dt>
                  <dd>{chosen.waitingSteps} steps</dd>
                </div>
              </dl>
            </div>
          )}
          {inspectedCell && (
            <SemaphoreInspector
              cell={inspectedCell}
              robots={viewRobots}
              graph={viewGraph}
            />
          )}
        </div>
        <aside>
          <OSMapping />
          <SystemMonitor
            robots={viewRobots}
            deadlocks={deadlocks}
            mode={mode}
            cycle={viewCycle}
            rerouteMessage={message}
            onResolve={chooseRecovery}
          />
          <WaitForGraph graph={viewGraph} cycle={viewCycle} />
          <EventLog events={replay ? snapshot.events : events} />
        </aside>
      </main>
      {toast && (
        <div className="resolved-toast">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}
      <DeadlockExperience
        cycle={cycle}
        graph={graph}
        robots={robots}
        events={events}
        step={step}
        open={popup}
        minimized={!popup}
        onMinimize={() => setPopup((x) => !x)}
        onInspect={() => setInspecting(true)}
        inspecting={inspecting}
        onCloseInspect={() => setInspecting(false)}
        onResolve={chooseRecovery}
        recovering={recovering}
        victim={recoveryPreview?.victim}
      />
      <RecoveryCenter
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        snapshot={snapshot}
        preview={recoveryPreview}
        onPreview={previewMethod}
        onApply={applySelected}
        onCancel={() => {
          setRecoveryPreview(null);
          setRecoveryPath([]);
        }}
        summary={summary}
        onReplay={startReplay}
        comparison={comparison}
        onCompare={compare}
      />
    </div>
  );
}

function StrategyComparison({ rows }) {
  const labels = {
      prevention: "Critical-Section Hold-and-Wait Prevention",
      avoidance: "Cycle-Aware One-Step Deadlock Avoidance",
      detection: "Detection + Dynamic Rerouting Recovery",
    },
    metrics = [
      ["deadlocksFormed", "Deadlocks Formed"],
      ["resourceRequestsBlocked", "Resource Requests Blocked"],
      ["unsafeRequestsDenied", "Unsafe Requests Denied"],
      ["recoveryRequired", "Recovery Required"],
      ["recoverySteps", "Recovery Steps"],
      ["totalWaitingSteps", "Total Waiting Steps"],
      ["averageWaitingSteps", "Average Waiting Steps"],
      ["totalCompletionSteps", "Total Completion Steps"],
      ["robotsTerminated", "Robots Terminated"],
      ["reroutes", "Number of Reroutes"],
      ["extraPathLength", "Extra Path Length"],
      ["completedRobots", "Completed Robots"],
      ["completionRate", "Completion Rate"],
      ["finalStatus", "Final Status"],
    ];
  return (
    <section className="card strategy-comparison">
      <div className="section-title">
        <span>SAME-SCENARIO STRATEGY COMPARISON</span>
        <small>IDENTICAL POSITIONS · PATHS · OBSTACLES · ORDER</small>
      </div>
      <p className="methodology-note">
        All strategies start from the same initial scenario, robot paths,
        destinations, obstacles, processing order, and seed. Only the
        deadlock-handling strategy differs. The Detection + Recovery column uses
        Dynamic Rerouting as its fixed recovery policy.
      </p>
      <div className="strategy-row head">
        <b>Metric</b>
        {rows.map((r) => (
          <b key={r.strategy}>{labels[r.strategy]}</b>
        ))}
      </div>
      {metrics.map(([key, label]) => (
        <div className="strategy-row" key={key}>
          <span>{label}</span>
          {rows.map((r) => (
            <span key={r.strategy}>
              {typeof r[key] === "boolean"
                ? r[key]
                  ? "YES"
                  : "NO"
                : typeof r[key] === "number"
                  ? `${r[key].toFixed(key === "averageWaitingSteps" || key === "completionRate" ? 1 : 0)}${key === "completionRate" ? "%" : ""}`
                  : r[key]}
            </span>
          ))}
        </div>
      ))}
    </section>
  );
}

function OSMapping() {
  return (
    <section className="card compact os-mapping">
      <div className="section-title">
        <span>OPERATING SYSTEM MAPPING</span>
        <small>CONCURRENCY MODEL</small>
      </div>
      {[
        ["Robot / AGV", "Process"],
        ["Grid Cell / Zone", "Shared Resource"],
        ["Cell Ownership", "Resource Allocation / Lock"],
        ["Free Cell", "Available Resource"],
        ["Robot Waiting", "Blocked Process"],
        ["One Robot Per Cell", "Mutual Exclusion"],
        ["Requesting Next Cell", "Resource Request"],
        ["Wait-For Graph", "Process Dependency Graph"],
        ["Cycle", "Circular Wait / Deadlock"],
      ].map(([a, b]) => (
        <div key={a}>
          <span>{a}</span>
          <b>→</b>
          <span>{b}</span>
        </div>
      ))}
    </section>
  );
}

function SemaphoreInspector({ cell, robots, graph }) {
  const owner = robots.find(
      (r) =>
        !["Completed", "Terminated"].includes(r.status) &&
        r.position.row === cell.row &&
        r.position.col === cell.col,
    ),
    reserved = robots.find((r) =>
      (r.reservedCells || []).some(
        (c) => c.row === cell.row && c.col === cell.col,
      ),
    ),
    holder = owner || reserved,
    queue = robots
      .filter(
        (r) =>
          r.path[1]?.row === cell.row &&
          r.path[1]?.col === cell.col &&
          ["Waiting", "Avoidance Blocked", "Deadlocked"].includes(r.status),
      )
      .map((r) => r.id);
  return (
    <section className="card semaphore-inspector">
      <small>BINARY SEMAPHORE VISUALIZATION</small>
      <h3>
        Resource: Cell ({cell.row},{cell.col})
      </h3>
      <dl>
        <div>
          <dt>Semaphore State</dt>
          <dd className={holder ? "locked" : "available"}>
            {holder ? "0 — Locked" : "1 — Available"}
          </dd>
        </div>
        <div>
          <dt>Owner</dt>
          <dd>{holder?.id || "None"}</dd>
        </div>
        <div>
          <dt>Waiting Queue</dt>
          <dd>{queue.join(", ") || "Empty"}</dd>
        </div>
      </dl>
    </section>
  );
}
