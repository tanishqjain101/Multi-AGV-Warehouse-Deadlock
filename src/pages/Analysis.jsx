import { SIZE } from "../logic/simulation.js";

const recoveryOrder = ["termination", "rollback", "reroute"],
  recoveryNames = {
    termination: "Process Termination",
    rollback: "Rollback / Resource Preemption",
    reroute: "Dynamic Rerouting",
  },
  strategyOrder = ["prevention", "avoidance", "detection"],
  strategyNames = {
    prevention: "Prevention",
    avoidance: "Avoidance",
    detection: "Detection + Recovery",
  };

const metric = (value, suffix = "") =>
  value === undefined || value === null ? "N/A" : `${value}${suffix}`;

function recoveryInterpretation(run, runs) {
  const m = run.metrics,
    all = runs.map((item) => item.metrics),
    minWait = Math.min(...all.map((item) => item.totalWaiting)),
    minSteps = Math.min(...all.map((item) => item.additionalSteps));
  const advantage =
      m.robotsLost === 0 && m.completionRate === 100
        ? "Preserved every robot and completed every task."
        : m.additionalSteps === minSteps
          ? `Used the lowest recovery overhead at ${m.additionalSteps} additional steps.`
          : `Resolved the cycle with a ${m.completionRate.toFixed(0)}% completion rate.`,
    disadvantage = m.robotsLost
      ? `Removed ${m.robotsLost} robot${m.robotsLost === 1 ? "" : "s"}, reducing completed work.`
      : m.extraPathLength
        ? `Added ${m.extraPathLength} path cell${m.extraPathLength === 1 ? "" : "s"} to the route.`
        : m.totalWaiting > minWait
          ? `Accumulated ${m.totalWaiting - minWait} more waiting steps than the lowest-wait method.`
          : "No robot loss or additional route length was recorded.",
    observation = m.robotsLost
      ? `Recovery was achieved with ${m.additionalSteps} additional steps, but task preservation fell to ${m.completionRate.toFixed(0)}%.`
      : m.extraPathLength
        ? `All robots were preserved by accepting ${m.extraPathLength} cells of extra travel.`
        : `All robots were preserved with ${m.totalWaiting} waiting steps and no added route length.`;
  return { advantage, disadvantage, observation };
}

function recoveryExplanation(run, cycle) {
  const victim = run.preview?.victim || "the selected robot",
    before = cycle?.join(" → ") || "the detected circular wait";
  if (run.method === "termination")
    return {
      happened: `${victim} was terminated and its held resource was released.`,
      resolved: `Before recovery: ${before}. Removing ${victim} removed its incoming and outgoing dependencies, so the circular chain no longer existed.`,
    };
  if (run.method === "rollback")
    return {
      happened: `${victim} was rolled back to (${run.preview?.previous?.row},${run.preview?.previous?.col}) and released its former resource.`,
      resolved: `Before recovery: ${before}. Moving ${victim} back and rebuilding occupancy removed its wait-for dependency, breaking the cycle.`,
    };
  return {
    happened: `${victim} received a new path around the contested resource.`,
    resolved: `Before recovery: ${before}. The new route removed ${victim}'s dependency from the circular chain.`,
  };
}

function strategyInterpretation(run, runs) {
  const minWait = Math.min(...runs.map((item) => item.totalWaitingSteps));
  if (run.strategy === "prevention")
    return {
      advantage: run.deadlocksFormed === 0
        ? "Prevented deadlock formation in this run."
        : "Reduced partial resource retention in shared sections.",
      limitation: run.resourceRequestsBlocked
        ? `Blocked ${run.resourceRequestsBlocked} requests before full shared segments were available.`
        : "No early blocking was recorded in this run.",
      tradeoff: `Atomic reservation exchanged earlier blocking for ${run.deadlocksFormed} formed deadlocks.`,
    };
  if (run.strategy === "avoidance")
    return {
      advantage: run.deadlocksFormed === 0
        ? `Avoided deadlock by denying ${run.unsafeRequestsDenied} unsafe requests.`
        : "Checked each projected allocation before granting it.",
      limitation: `Required a projected-cycle check for each grant and accumulated ${run.totalWaitingSteps} waiting steps.`,
      tradeoff: `Allowed safe movement while rejecting ${run.unsafeRequestsDenied} cycle-forming allocations.`,
    };
  return {
    advantage: run.resourceRequestsBlocked === 0
      ? "Allowed requests to proceed without preventive blocking."
      : `Used only ${run.resourceRequestsBlocked} blocked requests before detection.`,
    limitation: run.recoveryRequired
      ? `Allowed ${run.deadlocksFormed} deadlock event before paying the cost of recovery.`
      : "No recovery cost occurred in this run.",
    tradeoff: `${run.deadlocksFormed} deadlock event required ${run.recoverySteps} dynamic-rerouting recovery action.`,
  };
}

function StrategyWorked({ run }) {
  const denial = run.observations?.find((text) => /unsafe request denied/i.test(text));
  if (run.strategy === "prevention")
    return <>Atomic critical-section reservation required the complete shared segment before entry. {run.resourceRequestsBlocked} incomplete reservations were blocked without retaining partial segment resources.</>;
  if (run.strategy === "avoidance")
    return <>{denial || `Projected allocation checks denied ${run.unsafeRequestsDenied} unsafe requests before circular wait could complete.`}</>;
  return <>Resources were allocated normally until a real cycle formed. DFS detected {run.deadlocksFormed} deadlock event, after which Dynamic Rerouting recovery was applied.</>;
}

export default function Analysis({ snapshot, recoveryRuns, strategyRuns }) {
  if (!snapshot || !recoveryRuns?.length || !strategyRuns?.length)
    return (
      <main className="empty-page">
        <b>ANALYSIS DATA INCOMPLETE</b>
        <span>Complete both Recovery Comparison and Deadlock Strategies first.</span>
      </main>
    );

  const recovery = recoveryOrder.map((method) =>
      recoveryRuns.find((run) => run.method === method),
    ),
    strategies = strategyOrder.map((strategy) =>
      strategyRuns.find((run) => run.strategy === strategy),
    ),
    validRecovery = recovery.filter(Boolean),
    validStrategies = strategies.filter(Boolean),
    leastWait = Math.min(...validRecovery.map((run) => run.metrics.totalWaiting)),
    highestCompletion = Math.max(
      ...validRecovery.map((run) => run.metrics.completionRate),
    ),
    smallestOverhead = Math.min(
      ...validRecovery.map((run) => run.metrics.additionalSteps),
    ),
    namesFor = (predicate) =>
      validRecovery.filter(predicate).map((run) => recoveryNames[run.method]).join(", ");

  return (
    <main className="analysis-page">
      <header className="analysis-title">
        <small>EXPERIMENT ANALYSIS</small>
        <h1>Deadlock Handling Analysis</h1>
        <p>Interpretation derived from the completed simulation results.</p>
      </header>

      <section className="experiment-details">
        {[
          ["Scenario ID / Seed", snapshot.seed ?? snapshot.scenarioType],
          ["Number of Robots", snapshot.robots.length],
          ["Deadlock Cycle", snapshot.cycle.join(" → ")],
          ["Deadlock Step", snapshot.step],
          ["Grid Size", `${SIZE} × ${SIZE}`],
          ["Number of Obstacles", snapshot.obstacles.size],
        ].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}
      </section>

      <AnalysisSection title="1. Recovery Method Analysis">
        <div className="analysis-cards">
          {validRecovery.map((run) => {
            const explanation = recoveryExplanation(run, snapshot.cycle),
              insight = recoveryInterpretation(run, validRecovery),
              m = run.metrics;
            return <article className="analysis-card" key={run.method}>
              <h3>{recoveryNames[run.method]}</h3>
              <Label text="What happened" value={explanation.happened} />
              <Label text="Why the deadlock was resolved" value={explanation.resolved} />
              <MetricGrid values={[
                ["Recovery steps", m.recoverySteps], ["Waiting steps", m.totalWaiting],
                ["Robots lost", m.robotsLost], ["Completed robots", m.completedRobots],
                ["Completion rate", metric(m.completionRate.toFixed(0), "%")],
                ["Extra path length", m.extraPathLength],
              ]} />
              <Label text="Advantage" value={insight.advantage} />
              <Label text="Disadvantage" value={insight.disadvantage} />
              <Label text="Observation" value={insight.observation} />
            </article>;
          })}
        </div>
      </AnalysisSection>

      <AnalysisSection title="2. Deadlock Strategy Analysis">
        <div className="analysis-cards">
          {validStrategies.map((run) => {
            const insight = strategyInterpretation(run, validStrategies);
            return <article className="analysis-card" key={run.strategy}>
              <h3>{strategyNames[run.strategy]}</h3>
              <div className="analysis-copy"><b>How it worked in this run</b><p><StrategyWorked run={run} /></p></div>
              <MetricGrid values={[
                ["Deadlocks formed", run.deadlocksFormed], ["Blocked requests", run.resourceRequestsBlocked],
                ["Unsafe requests denied", run.unsafeRequestsDenied], ["Waiting steps", run.totalWaitingSteps],
                ["Completion steps", run.totalCompletionSteps], ["Completion rate", metric(run.completionRate.toFixed(0), "%")],
                ["Recovery required", run.recoveryRequired ? "YES" : "NO"],
              ]} />
              <Label text="Advantage" value={insight.advantage} />
              <Label text="Limitation" value={insight.limitation} />
              <Label text="Trade-off" value={insight.tradeoff} />
            </article>;
          })}
        </div>
      </AnalysisSection>

      <AnalysisSection title="3. Research Observations">
        <div className="findings-grid">
          <div><h3>Key Findings</h3><ul>
            <li>Least waiting: {namesFor((run) => run.metrics.totalWaiting === leastWait)} ({leastWait} steps).</li>
            <li>Preserved all robots: {namesFor((run) => run.metrics.robotsLost === 0) || "None"}.</li>
            <li>Required extra path length: {namesFor((run) => run.metrics.extraPathLength > 0) || "None"}.</li>
            <li>Prevented deadlock entirely: {validStrategies.filter((run) => run.deadlocksFormed === 0).map((run) => strategyNames[run.strategy]).join(", ") || "None"}.</li>
            <li>Allowed deadlock to occur: {validStrategies.filter((run) => run.deadlocksFormed > 0).map((run) => strategyNames[run.strategy]).join(", ") || "None"}.</li>
            <li>Highest completion rate: {namesFor((run) => run.metrics.completionRate === highestCompletion)} ({highestCompletion.toFixed(0)}%).</li>
            <li>Smallest recovery overhead: {namesFor((run) => run.metrics.additionalSteps === smallestOverhead)} ({smallestOverhead} steps).</li>
          </ul></div>
          <div><h3>Trade-off Summary</h3><p>No single method is optimal for every objective.</p><ul>
            {validRecovery.map((run) => <li key={run.method}>{recoveryNames[run.method]}: {recoveryInterpretation(run, validRecovery).observation}</li>)}
            {validStrategies.map((run) => <li key={run.strategy}>{strategyNames[run.strategy]}: {strategyInterpretation(run, validStrategies).tradeoff}</li>)}
          </ul></div>
        </div>
      </AnalysisSection>

      <section className="experiment-conclusion">
        <h2>Experiment Conclusion</h2>
        <p>In this experiment, {validRecovery.filter((run) => run.metrics.deadlockResolved).length} of {validRecovery.length} recovery mechanisms removed the circular wait. {namesFor((run) => run.metrics.additionalSteps === smallestOverhead)} recorded the smallest recovery overhead at {smallestOverhead} additional steps. {namesFor((run) => run.metrics.robotsLost === 0) || "No method"} preserved all robots, while {namesFor((run) => run.metrics.extraPathLength > 0) || "no method"} introduced additional path length. The measured results demonstrate a trade-off among recovery effort, waiting, route cost, and task preservation rather than a universally optimal method.</p>
      </section>
    </main>
  );
}

function AnalysisSection({ title, children }) {
  return <section className="analysis-section"><h2>{title}</h2>{children}</section>;
}
function Label({ text, value }) {
  return <div className="analysis-copy"><b>{text}</b><p>{value}</p></div>;
}
function MetricGrid({ values }) {
  return <dl className="analysis-metrics">{values.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{metric(value)}</dd></div>)}</dl>;
}
