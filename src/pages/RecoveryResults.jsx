const columns = ["termination", "rollback", "reroute"],
  labels = {
    termination: "Termination",
    rollback: "Rollback",
    reroute: "Rerouting",
  };
export default function RecoveryResults({ runs }) {
  if (!runs?.length)
    return (
      <main className="empty-page">
        <b>NO COMPARISON RESULTS</b>
        <span>Open Recovery Comparison and run all methods.</span>
      </main>
    );
  const row = (method) => runs.find((r) => r.method === method),
    value = (method, key) => {
      const run = row(method);
      if (!run?.available) return "N/A";
      const v = run.metrics[key];
      return key === "completionRate"
        ? `${v.toFixed(0)}%`
        : typeof v === "boolean"
          ? v
            ? "YES"
            : "NO"
          : v;
    };
  const metrics = [
    ["deadlockResolved", "Deadlock Resolved"],
    ["recoverySteps", "Recovery Steps"],
    ["totalWaiting", "Total Waiting Steps"],
    ["robotsLost", "Robots Lost"],
    ["extraPathLength", "Extra Path Length"],
    ["completedRobots", "Completed Robots"],
    ["completionRate", "Completion Rate"],
    ["finalStatus", "Final Status"],
  ];
  return (
    <main className="results-page-simple">
      <small>ACTUAL HEADLESS SIMULATION VALUES</small>
      <h1>Recovery Method Comparison</h1>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            {columns.map((m) => (
              <th key={m}>{labels[m]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map(([key, label]) => (
            <tr key={key}>
              <td>{label}</td>
              {columns.map((m) => (
                <td key={m}>{value(m, key)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <Conclusion runs={runs} />
    </main>
  );
}
function Conclusion({ runs }) {
  const t = runs.find((r) => r.method === "termination")?.metrics,
    b = runs.find((r) => r.method === "rollback")?.metrics,
    r = runs.find((r) => r.method === "reroute")?.metrics,
    lines = [];
  if (t && t.robotsLost > 0)
    lines.push(
      `Termination completed in ${t.additionalSteps} additional steps but removed ${t.robotsLost} robot.`,
    );
  if (b && b.robotsLost === 0)
    lines.push(
      `Rollback preserved all robots and completed in ${b.additionalSteps} additional steps.`,
    );
  if (r && r.robotsLost === 0)
    lines.push(
      `Rerouting preserved all robots${r.extraPathLength ? ` with ${r.extraPathLength} extra path cells` : ""}.`,
    );
  return (
    <section className="results-conclusion">
      <b>FACTUAL SUMMARY</b>
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </section>
  );
}
