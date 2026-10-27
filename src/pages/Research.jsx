const mappings = [
  ["Process", "Robot"],
  ["Resource", "Grid cell / zone"],
  ["Resource Allocation", "Reserving future cells"],
  ["Blocked Process", "Waiting robot"],
  ["Mutual Exclusion", "One robot per cell"],
  ["Circular Wait", "Robot dependency cycle"],
  ["Deadlock Recovery", "Dynamic rerouting"],
];
export default function Research() {
  return (
    <main className="page research">
      <div className="page-heading">
        <span>RESEARCH OVERVIEW</span>
        <h1>Adaptive Look-Ahead Reservation</h1>
        <p>
          A lightweight resource-allocation experiment for multi-robot warehouse
          systems.
        </p>
      </div>
      <section className="card question">
        <small>RESEARCH QUESTION</small>
        <blockquote>
          “Can adaptive look-ahead resource reservation reduce deadlocks and
          waiting time compared with fixed reservation strategies in multi-robot
          warehouse systems?”
        </blockquote>
      </section>
      <div className="research-layout research-top">
        <section className="card alar">
          <div className="section-title">
            <span>PROPOSED ALGORITHM · ALAR</span>
          </div>
          <h3>Congestion controls reservation depth</h3>
          <p>
            Each robot counts nearby robots, occupied cells in its next three
            path cells, and nearby waiting robots.
          </p>
          <div>
            <span>
              <b>LOW</b>1-cell look-ahead
            </span>
            <span>
              <b>MEDIUM</b>2-cell look-ahead
            </span>
            <span>
              <b>HIGH</b>3-cell look-ahead
            </span>
          </div>
          <aside>
            Hypothesis: Adaptive reservation aims to balance deadlock safety and
            resource utilization by increasing reservation depth only when
            congestion risk rises.
          </aside>
        </section>
        <section className="card mapping">
          <div className="section-title">
            <span>OS CONCEPT → WAREHOUSE MAPPING</span>
          </div>
          {mappings.map(([a, b]) => (
            <div key={a}>
              <b>{a}</b>
              <i>→</i>
              <span>{b}</span>
            </div>
          ))}
        </section>
      </div>
      <section className="card alar-flow">
        <div className="section-title">
          <span>ALAR DECISION FLOW</span>
        </div>
        <div>
          {[
            "Robot Requests Move",
            "Calculate Congestion",
            "Select Look-Ahead Depth",
            "Check Future Resources",
            "Safe?",
            "Reserve + Move / Wait + Reroute",
          ].map((x, i) => (
            <span key={x}>
              <b>{String(i + 1).padStart(2, "0")}</b>
              {x}
              {i < 5 && <i>↓</i>}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
