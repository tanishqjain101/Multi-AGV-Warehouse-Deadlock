export default function WaitForGraph({ graph, cycle }) {
  const entries = Object.entries(graph),
    involved = new Set(cycle || []);
  return (
    <section className="card compact">
      <div className="section-title">
        <span>WAIT-FOR GRAPH</span>
        <small>{entries.length} dependencies</small>
      </div>
      <div className="graph">
        {entries.length ? (
          entries.map(([a, b]) => (
            <div
              className={involved.has(a) && involved.has(b) ? "cycle-edge" : ""}
              key={a}
            >
              <span>{a}</span>
              <i>→</i>
              <span>{b}</span>
            </div>
          ))
        ) : (
          <p>No active dependencies</p>
        )}
      </div>
    </section>
  );
}
