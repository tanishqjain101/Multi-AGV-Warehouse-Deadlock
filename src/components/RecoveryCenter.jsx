import { RotateCcw, Rewind, Route, Trash2, ShieldAlert, X } from "lucide-react";
const names = {
  termination: "A. PROCESS TERMINATION",
  rollback: "B. ROLLBACK / RESOURCE PREEMPTION",
  reroute: "C. DYNAMIC REROUTING",
};
const icons = { termination: Trash2, rollback: Rewind, reroute: Route };
const path = (p) =>
  (p || []).map((c) => `(${c.row},${c.col})`).join(" → ") || "Released";
export default function RecoveryCenter({
  open,
  onClose,
  snapshot,
  preview,
  onPreview,
  onApply,
  onCancel,
  summary,
  onReplay,
  comparison,
  onCompare,
}) {
  if (!open || !snapshot) return null;
  const ids = snapshot.cycle.slice(0, -1);
  return (
    <div className="recovery-center">
      <button className="recovery-close" onClick={onClose}>
        <X size={18} />
      </button>
      {summary ? (
        <>
          <small>DEADLOCK RESOLUTION SUMMARY</small>
          <h2>Before / After Recovery</h2>
          <div className="before-after">
            <section>
              <b>BEFORE</b>
              <p>{snapshot.cycle.join(" → ")}</p>
              <strong>Deadlock: YES</strong>
            </section>
            <section>
              <b>AFTER</b>
              <p>
                {Object.entries(summary.graph)
                  .map(([a, b]) => `${a} → ${b}`)
                  .join(" · ") || "No active dependencies"}
              </p>
              <strong>Deadlock: {summary.cycle ? "YES" : "NO"}</strong>
              <em>{summary.change}</em>
            </section>
          </div>
          <div className="recovery-actions">
            <button onClick={onReplay}>
              <RotateCcw size={15} /> Replay Deadlock
            </button>
            <button onClick={onCompare}>
              <ShieldAlert size={15} /> Compare Recovery Methods
            </button>
          </div>
          {comparison && <Comparison rows={comparison} />}
        </>
      ) : preview ? (
        <>
          <small>RECOVERY PREVIEW</small>
          <h2>{names[preview.method]}</h2>
          <div className="preview-victim">
            <span>Selected victim</span>
            {preview.method !== "reroute" ? (
              <select
                value={preview.victim}
                onChange={(e) => onPreview(preview.method, e.target.value)}
              >
                {ids.map((id) => (
                  <option key={id}>{id}</option>
                ))}
              </select>
            ) : (
              <b>{preview.victim}</b>
            )}
            <p>{preview.reason}</p>
          </div>
          <div className="route-compare">
            <section>
              <b>CURRENT ROUTE</b>
              <p>{path(preview.currentPath)}</p>
            </section>
            <section>
              <b>PROPOSED STATE</b>
              <p>{path(preview.proposedPath)}</p>
            </section>
          </div>
          <div className="preview-effect">
            <b>Expected effect</b>
            <span>
              The edge from {preview.victim} is released. The proposed wait-for
              graph has no circular wait.
            </span>
          </div>
          <div className="recovery-actions">
            <button onClick={onCancel}>Cancel</button>
            <button className="apply" onClick={onApply}>
              Apply Recovery
            </button>
          </div>
        </>
      ) : (
        <>
          <small>DEADLOCK RECOVERY CONTROL</small>
          <h2>How would you like to handle this deadlock?</h2>
          <p className="recovery-intro">
            Choose a method to preview. No state changes until you apply it.
          </p>
          <div className="recovery-options">
            {[
              [
                "termination",
                "Select one circular-wait robot as victim and release its resources.",
                "Terminate one process.",
              ],
              [
                "rollback",
                "Move one robot to its previous safe cell and release its current resource.",
                "Preempt resources / rollback process.",
              ],
              [
                "reroute",
                "Keep every robot active but change one resource request sequence.",
                "Dynamic deadlock recovery.",
              ],
            ].map(([id, text, map]) => {
              const Icon = icons[id];
              return (
                <button onClick={() => onPreview(id)} key={id}>
                  <Icon size={21} />
                  <b>{names[id]}</b>
                  <span>{text}</span>
                  <em>OS mapping: {map}</em>
                </button>
              );
            })}
          </div>
          <button className="compare-link" onClick={onCompare}>
            Compare all methods on this exact snapshot
          </button>
          {comparison && <Comparison rows={comparison} />}
        </>
      )}
    </div>
  );
}
function Comparison({ rows }) {
  const metrics = [
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
  return (
    <div className="recovery-comparison">
      <h3>Same-Deadlock Method Comparison</h3>
      <div className="compare-row head">
        <b>Metric</b>
        {rows.map((r) => (
          <b key={r.method}>{r.method}</b>
        ))}
      </div>
      {metrics.map(([key, label]) => (
        <div className="compare-row" key={key}>
          <span>{label}</span>
          {rows.map((r) => (
            <span key={r.method}>
              {r.available
                ? typeof r[key] === "number"
                  ? `${r[key].toFixed(1)}${key === "completionRate" ? "%" : ""}`
                  : String(r[key]).toUpperCase()
                : `N/A${r.reason ? ` — ${r.reason}` : ""}`}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
