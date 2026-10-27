const labels = {
  basic: "Basic — 1 Cell",
  fixed: "Fixed — 2 Cells",
  adaptive: "Adaptive — ALAR",
};
export default function Results({ results }) {
  const runs = Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    data: results[key],
  }));
  return (
    <main className="page">
      <div className="page-heading">
        <span>EXPERIMENT 02</span>
        <h1>Simulation Results</h1>
        <p>
          Metrics are recorded from completed or terminal runs—never fabricated.
        </p>
      </div>
      <div className="results-grid">
        {runs.map(({ key, label, data }) => (
          <section className="card result-card" key={key}>
            <div className="result-head">
              <h3>{label}</h3>
              <span className={data ? "done" : ""}>
                {data ? "Recorded" : "Not Run"}
              </span>
            </div>
            {data ? (
              <>
                <div className="result-metrics">
                  <div>
                    <b>{data.completed}</b>
                    <small>Completed</small>
                  </div>
                  <div>
                    <b>{data.deadlocks}</b>
                    <small>Deadlocks</small>
                  </div>
                  <div>
                    <b>{data.reroutes}</b>
                    <small>Reroutes</small>
                  </div>
                  <div>
                    <b>{data.steps}</b>
                    <small>Steps</small>
                  </div>
                </div>
                <p>
                  Average waiting:{" "}
                  <strong>{data.avgWait.toFixed(1)} steps</strong>
                </p>
              </>
            ) : (
              <div className="empty-result">
                Run this mode in the simulator to collect actual data.
              </div>
            )}
          </section>
        ))}
      </div>
      <section className="card comparison">
        <div className="section-title">
          <span>COMPLETION COMPARISON</span>
          <small>ACTUAL RUN DATA</small>
        </div>
        {runs.map((r) => (
          <div className="bar-row" key={r.key}>
            <label>{r.label}</label>
            <div>
              <i
                style={{
                  width: r.data ? `${(r.data.completed / 5) * 100}%` : "0%",
                }}
              />
            </div>
            <b>{r.data ? `${r.data.completed}/5` : "—"}</b>
          </div>
        ))}
      </section>
    </main>
  );
}
