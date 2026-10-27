import {
  advanceSimulation,
  applyRecovery,
  cloneRobots,
  prepareRecovery,
} from "./simulation.js";
export function cloneDeadlockState(snapshot) {
  return {
    robots: cloneRobots(snapshot.robots),
    graph: { ...snapshot.graph },
    cycle: [...snapshot.cycle],
    step: snapshot.step,
    events: snapshot.events.map((e) => ({ ...e })),
    obstacles: new Set(snapshot.obstacles),
  };
}
const finished = (robots) =>
  robots.every((r) => ["Completed", "Terminated"].includes(r.status));
const metricsFor = (state) => {
  const completed = state.robots.filter((r) => r.status === "Completed").length,
    totalWaiting =
      state.robots.reduce((s, r) => s + r.waitingSteps, 0) -
      state.baselineWaiting;
  return {
    deadlockResolved: !state.cycle,
    recoverySteps: 1,
    totalWaiting,
    additionalSteps: state.additionalSteps,
    robotsLost: state.method === "termination" ? 1 : 0,
    resourcesReleased: 1,
    extraPathLength: state.preview?.extraPathLength || 0,
    completedRobots: completed,
    completionRate: state.robots.length
      ? (completed / state.robots.length) * 100
      : 0,
    finalStatus: state.status,
  };
};
export function initializeRecoveryClone(snapshot, method) {
  const source = cloneDeadlockState(snapshot),
    preview = prepareRecovery(snapshot, method);
  if (!preview)
    return {
      ...source,
      method,
      available: false,
      status: "FAILED",
      reason: `${method} is unavailable for this deadlock.`,
    };
  const applied = applyRecovery(snapshot, preview),
    action =
      method === "termination"
        ? `${preview.victim} TERMINATED`
        : method === "rollback"
          ? `${preview.victim} rolled back to (${preview.previous.row},${preview.previous.col})`
          : `${preview.victim} dynamically rerouted`;
  const state = {
    ...source,
    method,
    available: true,
    robots: cloneRobots(applied.robots),
    graph: { ...applied.graph },
    cycle: applied.cycle ? [...applied.cycle] : null,
    preview,
    action,
    status: applied.cycle ? "FAILED" : "RECOVERING",
    additionalSteps: 0,
    baselineWaiting: applied.robots.reduce((s, r) => s + r.waitingSteps, 0),
    events: [
      ...source.events,
      {
        step: source.step,
        text: `${action}. ${applied.cycle ? "Deadlock still exists." : "Cycle broken."}`,
      },
    ],
  };
  return { ...state, metrics: metricsFor(state) };
}
export function stepRecoveryClone(input, maxSteps = 1000) {
  const state = {
    ...input,
    robots: cloneRobots(input.robots),
    graph: { ...input.graph },
    cycle: input.cycle ? [...input.cycle] : null,
    events: input.events.map((e) => ({ ...e })),
    obstacles: new Set(input.obstacles),
  };
  if (
    !state.available ||
    ["COMPLETED", "FAILED", "TIMEOUT"].includes(state.status)
  )
    return state;
  if (state.additionalSteps >= maxSteps) {
    state.status = "TIMEOUT";
    state.metrics = metricsFor(state);
    return state;
  }
  const rollbackHoldActive =
    state.method === "rollback" &&
    state.robots.some((robot) => (robot.rollbackCooldown || 0) > 0);
  const result = advanceSimulation(state.robots, "basic", state.obstacles);
  state.robots = result.robots;
  state.graph = result.graph;
  state.cycle = result.cycle;
  state.additionalSteps += 1;
  state.step += 1;
  state.events.push(
    ...result.notes.map((text) => ({ step: state.step, text })),
  );
  state.status = result.cycle
    ? "FAILED"
    : finished(state.robots)
      ? "COMPLETED"
      : state.additionalSteps >= maxSteps
        ? "TIMEOUT"
        : result.movementSteps || Object.keys(result.graph).length
          ? "RUNNING"
          : rollbackHoldActive
            ? "RECOVERING"
            : "FAILED";
  state.metrics = metricsFor(state);
  return state;
}
export function runRecoveryClone(snapshot, method, maxSteps = 1000) {
  let state = initializeRecoveryClone(snapshot, method);
  while (
    state.available &&
    !["COMPLETED", "FAILED", "TIMEOUT"].includes(state.status)
  )
    state = stepRecoveryClone(state, maxSteps);
  return state;
}
export function runAllRecoveryClones(snapshot, maxSteps = 1000) {
  return ["termination", "rollback", "reroute"].map((method) =>
    runRecoveryClone(snapshot, method, maxSteps),
  );
}
