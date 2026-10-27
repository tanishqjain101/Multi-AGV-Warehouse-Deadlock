import {
  AlertTriangle,
  ChevronDown,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";

const cell = (c) => (c ? `Cell (${c.row},${c.col})` : "Final cell");
export default function DeadlockExperience({
  cycle,
  graph,
  robots,
  events,
  step,
  open,
  minimized,
  onMinimize,
  onInspect,
  inspecting,
  onCloseInspect,
  onResolve,
  recovering,
  victim,
}) {
  if (!cycle) return null;
  const ids = cycle.slice(0, -1),
    involved = robots.filter((r) => ids.includes(r.id));
  const timeline = [...events]
    .reverse()
    .filter((e) => /moved|waiting|Deadlock/i.test(e.text))
    .slice(-9);
  return (
    <>
      <div className="alarm-wash" aria-hidden="true" />
      {!open && (
        <button className="alarm-reopen" onClick={onMinimize}>
          <AlertTriangle size={15} /> DEADLOCK ACTIVE · OPEN ALERT
        </button>
      )}
      {open && (
        <div
          className="deadlock-modal"
          role="alertdialog"
          aria-label="Deadlock detected"
        >
          <button className="modal-min" onClick={onMinimize}>
            <ChevronDown size={17} />
          </button>
          <AlertTriangle className="modal-icon" size={30} />
          <small>SYSTEM SAFETY INTERLOCK</small>
          <h2>{recovering ? "RECOVERY IN PROGRESS" : "DEADLOCK DETECTED"}</h2>
          {recovering ? (
            <div className="recovery-copy">
              <span>Selected victim</span>
              <b>{victim}</b>
              <p>
                Applying the selected recovery operation to the frozen snapshot…
              </p>
              <i />
            </div>
          ) : (
            <>
              <p>
                System execution is blocked by
                <br />a circular resource dependency.
              </p>
              <div className="modal-cycle">{cycle.join(" → ")}</div>
              <div className="modal-counts">
                <span>
                  <b>{ids.length}</b> processes involved
                </span>
                <span>
                  <b>{ids.length}</b> resources locked
                </span>
              </div>
              <div className="modal-actions">
                <button onClick={onInspect}>
                  <Search size={15} /> Inspect Deadlock
                </button>
                <button className="resolve" onClick={onResolve}>
                  <ShieldCheck size={15} /> Choose Recovery Method
                </button>
              </div>
            </>
          )}
        </div>
      )}
      <div className={`analysis-drawer ${inspecting ? "open" : ""}`}>
        <button className="drawer-close" onClick={onCloseInspect}>
          <X size={18} />
        </button>
        <div className="drawer-heading">
          <small>FORENSIC RESOURCE REPORT</small>
          <h2>Deadlock Analysis</h2>
          <p>Captured at simulation step {step}</p>
        </div>
        <section>
          <label>Processes involved</label>
          <div className="process-chips">
            {ids.map((id) => (
              <b key={id}>{id}</b>
            ))}
          </div>
        </section>
        <section className="os-analogy">
          <label>OS Analogy</label>
          <h3>DINING PHILOSOPHERS ANALOGY</h3>
          <p>
            A philosopher holds one fork and waits for another. Similarly, a
            robot holds its current cell resource while requesting the next one.
          </p>
          <p>
            If every robot does this in a circular dependency, no participant
            can proceed and the system deadlocks.
          </p>
        </section>
        <section>
          <label>Resource ownership</label>
          {involved.map((r) => {
            const requested = r.path[1],
              holder = graph[r.id];
            return (
              <div className="ownership-row" key={r.id}>
                <b>{r.id}</b>
                <dl>
                  <div>
                    <dt>Currently holds</dt>
                    <dd>{cell(r.position)}</dd>
                  </div>
                  <div>
                    <dt>Requests</dt>
                    <dd>{cell(requested)}</dd>
                  </div>
                  <div>
                    <dt>Held by</dt>
                    <dd className="danger-text">{holder}</dd>
                  </div>
                </dl>
              </div>
            );
          })}
        </section>
        <section>
          <label>Wait-for graph</label>
          <div className="drawer-graph">
            {Object.entries(graph).map(([a, b]) => (
              <span key={a}>
                <b>{a}</b> → <b>{b}</b>
              </span>
            ))}
          </div>
          <div className="cycle-found">
            CYCLE FOUND <strong>{cycle.join(" → ")}</strong>
          </div>
        </section>
        <section>
          <label>Deadlock conditions</label>
          <div className="conditions">
            <p>
              <b>✓ Mutual Exclusion</b>
              <span>Each cell is held by one robot.</span>
            </p>
            <p>
              <b>✓ Hold and Wait</b>
              <span>
                Robots keep their current cell while requesting another.
              </span>
            </p>
            <p>
              <b>✓ No Preemption</b>
              <span>A resource is not forcibly removed.</span>
            </p>
            <p>
              <b>✓ Circular Wait</b>
              <span>{cycle.join(" → ")}</span>
            </p>
          </div>
          <div className="confirmed">
            ALL FOUR CONDITIONS TRUE <b>DEADLOCK CONFIRMED</b>
          </div>
        </section>
        <section>
          <label>How did we get here?</label>
          <div className="deadlock-timeline">
            {timeline.map((e, i) => (
              <div key={`${e.step}-${i}`}>
                <b>STEP {e.step}</b>
                <span>{e.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
