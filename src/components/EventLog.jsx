function explain(text) {
  if (
    text.includes("Hold-and-Wait prevented") ||
    text.includes("partial segment reservations") ||
    text.includes("critical shared segment")
  )
    return {
      what: text.includes("blocked")
        ? "Critical-section request blocked."
        : text,
      why: "Not all required resources in the shared segment were atomically available.",
      os: "Partial Hold-and-Wait prevented within the shared critical section.",
    };
  if (text.includes("unsafe request denied"))
    return {
      what: "Unsafe resource request denied.",
      why: text,
      os: "Cycle-Aware One-Step Deadlock Avoidance delayed an unsafe allocation; this is not Banker's Algorithm.",
    };
  if (text.includes("waiting for")) {
    const [robot, owner] = text.match(/R\d+/g) || [];
    return {
      what: `${robot} cannot enter its requested cell.`,
      why: `That resource is currently allocated to ${owner}.`,
      os: `Process ${robot} is blocked waiting for a resource held by process ${owner}.`,
    };
  }
  if (text.includes("Deadlock"))
    return {
      what: "A circular wait was detected.",
      why: "Every process in the cycle requests a resource held by the next process.",
      os: "All four Coffman conditions are simultaneously true.",
    };
  if (text.includes("moved"))
    return {
      what: text,
      why: "The requested cell was free and reserved successfully.",
      os: "The process acquired an exclusive resource.",
    };
  if (text.includes("Recovery") || text.includes("resolved"))
    return {
      what: text,
      why: "The selected recovery operation removed a wait-for dependency.",
      os: "The operating system broke circular wait.",
    };
  return {
    what: text,
    why: "Simulation state changed.",
    os: "Resource allocation event.",
  };
}
export default function EventLog({ events }) {
  const meaningful = events
    .filter((e) =>
      /moved|waiting|waited|blocked|denied|reserved|Deadlock|Recovery|resolved|released/i.test(
        e.text,
      ),
    )
    .slice(0, 10);
  return (
    <section className="card compact log-card">
      <div className="section-title">
        <span>SIMULATION TIMELINE</span>
        <small>EXPAND EVENTS</small>
      </div>
      <div className="structured-timeline">
        {meaningful.map((e, i) => {
          const x = explain(e.text);
          return (
            <details key={`${e.step}-${i}`} open={i === 0}>
              <summary>
                <b>STEP {e.step}</b>
                <span>{x.what}</span>
              </summary>
              <dl>
                <div>
                  <dt>Why it happened</dt>
                  <dd>{x.why}</dd>
                </div>
                <div>
                  <dt>OS concept</dt>
                  <dd>{x.os}</dd>
                </div>
              </dl>
            </details>
          );
        })}
      </div>
    </section>
  );
}
