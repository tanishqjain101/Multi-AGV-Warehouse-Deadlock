import assert from "node:assert/strict";
import {
  OBSTACLES,
  advanceSimulation,
  applyRecovery,
  cloneRobots,
  compareRecoveries,
  createDeadlockSnapshot,
  generateScenario,
  guaranteedDeadlockScenario,
  prepareRecovery,
  compareHandlingStrategies,
  createRobot,
} from "../src/logic/simulation.js";
import { findCycle } from "../src/logic/deadlock.js";
import {
  cloneDeadlockState,
  initializeRecoveryClone,
  runAllRecoveryClones,
  stepRecoveryClone,
} from "../src/logic/recoveryComparison.js";

const signature = (robots) =>
  JSON.stringify(
    robots.map((r) => ({
      id: r.id,
      position: r.position,
      destination: r.destination,
      path: r.path,
    })),
  );
const placed = createRobot("R1", 2, 3);
assert.deepEqual(placed.position, { row: 2, col: 3 });
assert.equal(placed.destination, null);
assert.deepEqual(placed.path, [{ row: 2, col: 3 }]);
assert.equal(placed.requestedCell, null);
assert.equal(placed.resourceHolder, null);
assert.ok(Array.isArray(placed.history));
assert.ok(Array.isArray(placed.reservedCells));
const reachDeadlock = (seed = 1) => {
  let robots = guaranteedDeadlockScenario(5, seed),
    result,
    step = 0,
    timeline = [];
  assert.equal(findCycle({}), null, "scenario must not begin deadlocked");
  while (step < 20) {
    result = advanceSimulation(robots, "basic", OBSTACLES);
    robots = result.robots;
    step += 1;
    timeline.push({
      step,
      robots,
      graph: result.graph,
      cycle: result.cycle,
      events: [],
    });
    if (result.cycle) break;
  }
  assert.ok(result.cycle, "expected a real directed cycle");
  assert.ok(step > 1, "robots must move before deadlock");
  return createDeadlockSnapshot({
    robots,
    graph: result.graph,
    cycle: result.cycle,
    step,
    events: [],
    timeline,
    obstacles: OBSTACLES,
    seed,
    scenarioType: "guaranteed",
  });
};

for (let seed = 1; seed <= 10; seed += 1) {
  const snapshot = reachDeadlock(seed);
  assert.deepEqual(snapshot.cycle, ["R1", "R2", "R3", "R4", "R1"]);
}
assert.equal(
  signature(generateScenario(8, "congested", 90210)),
  signature(generateScenario(8, "congested", 90210)),
  "same seed must reproduce scenario",
);
assert.deepEqual(findCycle({ R1: "R2", R2: "R3", R3: "R1" }), [
  "R1",
  "R2",
  "R3",
  "R1",
]);
assert.equal(
  findCycle({ R1: "R2", R3: "R2" }),
  null,
  "waiting without a cycle is contention, not deadlock",
);

const snapshot = reachDeadlock(2026),
  frozen = signature(snapshot.robots);
for (const method of ["termination", "rollback", "reroute"]) {
  const preview = prepareRecovery(snapshot, method);
  assert.ok(preview, `${method} preview should exist`);
  const applied = applyRecovery(snapshot, preview);
  assert.equal(
    applied.cycle,
    null,
    `${method} must break the captured cycle immediately`,
  );
  assert.equal(
    signature(snapshot.robots),
    frozen,
    "recovery must not mutate snapshot",
  );
}
const comparison = compareRecoveries(snapshot, "basic");
for (const row of comparison) {
  assert.equal(row.available, true);
  assert.equal(
    row.deadlockResolved,
    true,
    `${row.method} should resolve the demo`,
  );
  assert.equal(row.finalStatus, "COMPLETED");
}
const terminationPreview = prepareRecovery(snapshot, "termination"),
  terminationApplied = applyRecovery(snapshot, terminationPreview),
  terminated = terminationApplied.robots.find(
    (r) => r.id === terminationPreview.victim,
  );
assert.equal(terminated.status, "Terminated");
assert.equal(terminated.path.length, 0);
assert.ok(
  !Object.keys(terminationApplied.graph).includes(terminationPreview.victim),
);
assert.ok(
  !Object.values(terminationApplied.graph).includes(terminationPreview.victim),
);
const rollbackPreview = prepareRecovery(snapshot, "rollback"),
  rollbackApplied = applyRecovery(snapshot, rollbackPreview),
  rolled = rollbackApplied.robots.find((r) => r.id === rollbackPreview.victim);
assert.deepEqual(rolled.position, rollbackPreview.previous);
assert.equal(rolled.rollbackCooldown, 1);
const rollbackHeldPosition = { ...rolled.position },
  rollbackStep = advanceSimulation(
    rollbackApplied.robots,
    "basic",
    snapshot.obstacles,
  );
assert.deepEqual(
  rollbackStep.robots.find((r) => r.id === rollbackPreview.victim).position,
  rollbackHeldPosition,
  "rollback victim must not reacquire on cooldown step",
);
assert.equal(rollbackStep.cycle, null);
const reroutePreview = prepareRecovery(snapshot, "reroute"),
  rerouteApplied = applyRecovery(snapshot, reroutePreview),
  rerouted = rerouteApplied.robots.find((r) => r.id === reroutePreview.victim);
assert.notDeepEqual(rerouted.path, reroutePreview.currentPath);
assert.equal(rerouteApplied.cycle, null);
const steppedRollback = stepRecoveryClone(
  initializeRecoveryClone(snapshot, "rollback"),
);
assert.notEqual(steppedRollback.status, "DEADLOCK");

// A rollback recovery hold intentionally performs no movement. It must not be
// mistaken for an unrecoverable stall when the rebuilt graph has no cycle.
const holdOnlyRollback = initializeRecoveryClone(snapshot, "rollback");
holdOnlyRollback.robots = holdOnlyRollback.robots.map((robot) =>
  robot.id === holdOnlyRollback.preview.victim
    ? robot
    : { ...robot, status: "Completed", path: [{ ...robot.position }] },
);
holdOnlyRollback.graph = {};
holdOnlyRollback.cycle = null;
const heldRollback = stepRecoveryClone(holdOnlyRollback);
assert.equal(heldRollback.cycle, null);
assert.equal(
  heldRollback.status,
  "RECOVERING",
  "the rollback cooldown tick must not be classified as FAILED",
);

const isolatedA = cloneDeadlockState(snapshot),
  isolatedB = cloneDeadlockState(snapshot),
  isolatedC = cloneDeadlockState(snapshot);
assert.equal(signature(isolatedA.robots), signature(isolatedB.robots));
assert.equal(signature(isolatedB.robots), signature(isolatedC.robots));
isolatedA.robots[0].position.row = 99;
assert.notEqual(
  isolatedB.robots[0].position.row,
  99,
  "recovery grids must not share robot objects",
);
isolatedB.robots[0].path[0].col = 99;
assert.notEqual(
  isolatedC.robots[0].path[0].col,
  99,
  "recovery grids must not share path objects",
);
const recoveryRuns = runAllRecoveryClones(snapshot, 1000);
assert.equal(recoveryRuns.length, 3);
for (const run of recoveryRuns) {
  assert.equal(run.available, true);
  assert.equal(run.metrics.deadlockResolved, true);
  assert.equal(run.metrics.finalStatus, "COMPLETED");
}
assert.equal(
  signature(snapshot.robots),
  frozen,
  "running all methods must not mutate the original snapshot",
);

const manualFour = [0, 1, 2, 3].map((row) => ({
  id: `R${row + 1}`,
  color: "#fff",
  position: { row, col: 0 },
  destination: { row, col: 2 },
  path: [
    { row, col: 0 },
    { row, col: 1 },
    { row, col: 2 },
  ],
  initialPath: [
    { row, col: 0 },
    { row, col: 1 },
    { row, col: 2 },
  ],
  history: [],
  status: "Moving",
  waitingSteps: 0,
  reservedCells: [],
  pathMode: "Manual",
}));
let manualState = cloneRobots(manualFour);
for (let i = 0; i < 3; i += 1)
  manualState = advanceSimulation(manualState, "basic", new Set()).robots;
assert.equal(
  manualState.filter((r) => r.status === "Completed").length,
  4,
  "a four-robot manual scenario should run to completion",
);

const strategyInitial = guaranteedDeadlockScenario(5, 2026),
  strategySignature = signature(strategyInitial);
const strategies = compareHandlingStrategies(
  strategyInitial,
  "basic",
  OBSTACLES,
  100,
);
assert.equal(
  signature(strategyInitial),
  strategySignature,
  "strategy comparison must not mutate its shared initial scenario",
);
const prevention = strategies.find((r) => r.strategy === "prevention"),
  avoidance = strategies.find((r) => r.strategy === "avoidance"),
  detection = strategies.find((r) => r.strategy === "detection");
assert.equal(prevention.deadlocksFormed, 0);
assert.ok(prevention.resourceRequestsBlocked > 0);
assert.equal(prevention.completionRate, 100);
assert.equal(avoidance.deadlocksFormed, 0);
assert.ok(avoidance.unsafeRequestsDenied > 0);
assert.equal(avoidance.completionRate, 100);
assert.ok(detection.deadlocksFormed > 0);
assert.equal(detection.recoveryRequired, true);
assert.equal(detection.completionRate, 100);

const normal = [
  {
    id: "R1",
    color: "#fff",
    position: { row: 0, col: 0 },
    destination: { row: 0, col: 2 },
    path: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ],
    initialPath: [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ],
    history: [],
    status: "Moving",
    waitingSteps: 0,
    reservedCells: [],
    pathMode: "Manual",
  },
];
let state = cloneRobots(normal);
for (let i = 0; i < 3; i += 1)
  state = advanceSimulation(state, "basic", new Set()).robots;
assert.equal(
  state[0].status,
  "Completed",
  "normal manual scenario should complete",
);
console.log(
  "PASS: deterministic generation, cycle detection, 10/10 guaranteed deadlocks, three recoveries, immutable snapshot, and normal completion",
);
