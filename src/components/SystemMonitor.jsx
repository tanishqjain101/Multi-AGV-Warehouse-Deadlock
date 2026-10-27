import { AlertTriangle, Route } from "lucide-react";
const modeNames = {
  basic: "Basic · L1",
  fixed: "Fixed · L2",
  adaptive: "Adaptive · ALAR",
};
export default function SystemMonitor({
  robots,
  deadlocks,
  mode,
  cycle,
  rerouteMessage,
  onResolve,
}) {
  const count = (s) => robots.filter((r) => r.status === s).length;
  return (
    <section className="monitor card">
      <div className="section-title">
        <span>SYSTEM MONITOR</span>
        <b>LIVE</b>
      </div>
      <div className="metrics">
        <div>
          <small>Total robots</small>
          <strong>{robots.length}</strong>
        </div>
        <div>
          <small>Moving</small>
          <strong className="cyan">
            {count("Moving") + count("Rerouted")}
          </strong>
        </div>
        <div>
          <small>Waiting</small>
          <strong className="amber">
            {count("Waiting") + count("Deadlocked")}
          </strong>
        </div>
        <div>
          <small>Completed</small>
          <strong className="green">{count("Completed")}</strong>
        </div>
        <div>
          <small>Deadlocks</small>
          <strong className="red">{deadlocks}</strong>
        </div>
        <div>
          <small>Mode</small>
          <em>{modeNames[mode]}</em>
        </div>
      </div>
      {cycle && (
        <div className="deadlock-alert">
          <div>
            <AlertTriangle size={19} />
            <strong>DEADLOCK DETECTED</strong>
          </div>
          <p>{cycle.join(" → ")}</p>
          {rerouteMessage && <small>{rerouteMessage}</small>}
          <button onClick={onResolve}>
            <Route size={15} /> Choose Recovery Method
          </button>
        </div>
      )}
      {!cycle && (
        <div className="healthy">
          <span /> System operating normally
        </div>
      )}
      <div className="robot-list">
        {robots.map((r) => (
          <div key={r.id}>
            <i style={{ background: r.color }} />
            <b>{r.id}</b>
            <span>
              {r.status} ·{" "}
              {r.pathMode === "Manual" ? "Manual Path" : "Auto Path"}
            </span>
            <small>
              ({r.position.row},{r.position.col})
            </small>
          </div>
        ))}
      </div>
    </section>
  );
}
