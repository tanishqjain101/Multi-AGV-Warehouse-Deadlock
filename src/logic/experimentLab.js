import { bfs, keyOf } from "./pathfinding.js";
import {
  COLORS,
  advanceSimulation,
  cloneRobots,
  compareHandlingStrategies,
  createDeadlockSnapshot,
  createRobot,
} from "./simulation.js";
import { runAllRecoveryClones } from "./recoveryComparison.js";

export const LAB_METHOD_NAMES = {
  termination: "Process Termination",
  rollback: "Rollback / Resource Preemption",
  reroute: "Dynamic Rerouting",
  prevention: "Prevention",
  avoidance: "Avoidance",
  detection: "Detection + Recovery",
};

const randomFor = (initialSeed) => {
  let seed = Number(initialSeed) >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
};

const shuffle = (items, random) => {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
};

const labRobot = (id, path, index) => ({
  ...createRobot(id, path[0].row, path[0].col, COLORS[index % COLORS.length]),
  destination: { ...path.at(-1) },
  path: path.map((cell) => ({ ...cell })),
  initialPath: path.map((cell) => ({ ...cell })),
});

const obstacleRate = { low: 0.05, medium: 0.11, high: 0.18 };

export function generateLabScenario(config, seed, manualScenario) {
  if (config.source === "manual" && manualScenario?.robots?.length)
    return {
      robots: cloneRobots(manualScenario.robots).slice(0, config.robotCount),
      obstacles: new Set(manualScenario.obstacles),
      gridSize: Math.max(
        config.gridSize,
        ...manualScenario.robots.flatMap((robot) => [
          robot.position.row + 1,
          robot.position.col + 1,
        ]),
      ),
      scenarioType: "manual-base",
    };

  const random = randomFor(seed),
    size = config.gridSize,
    all = [];
  for (let row = 0; row < size; row += 1)
    for (let col = 0; col < size; col += 1) all.push({ row, col });

  const guaranteed = config.congestion === "high",
    center = Math.max(2, Math.floor(size / 2) - 1),
    ring = [
      { row: center, col: center },
      { row: center, col: center + 1 },
      { row: center + 1, col: center + 1 },
      { row: center + 1, col: center },
    ],
    starts = [
      { row: center, col: center - 2 },
      { row: center - 2, col: center + 1 },
      { row: center + 1, col: center + 3 },
      { row: center + 3, col: center },
    ],
    approaches = [
      [starts[0], { row: center, col: center - 1 }, ring[0], ring[1]],
      [starts[1], { row: center - 1, col: center + 1 }, ring[1], ring[2]],
      [starts[2], { row: center + 1, col: center + 2 }, ring[2], ring[3]],
      [starts[3], { row: center + 2, col: center }, ring[3], ring[0]],
    ],
    reserved = new Set(guaranteed ? approaches.flat().map(keyOf) : []),
    obstacleCount = Math.floor(size * size * obstacleRate[config.obstacleDensity]),
    obstacles = new Set(
      shuffle(
        all.filter((cell) => !reserved.has(keyOf(cell))),
        random,
      )
        .slice(0, obstacleCount)
        .map(keyOf),
    );

  const robots = guaranteed
    ? approaches
        .slice(0, Math.min(4, config.robotCount))
        .map((path, index) => labRobot(`R${index + 1}`, path, index))
    : [];
  const occupied = new Set(robots.flatMap((robot) => robot.path.map(keyOf))),
    central = all.filter((cell) => {
      const margin = config.congestion === "medium" ? 2 : 0;
      return (
        cell.row >= margin &&
        cell.col >= margin &&
        cell.row < size - margin &&
        cell.col < size - margin
      );
    }),
    free = shuffle(
      central.filter(
        (cell) => !obstacles.has(keyOf(cell)) && !occupied.has(keyOf(cell)),
      ),
      random,
    );

  for (let index = robots.length; index < config.robotCount; index += 1) {
    let created = null;
    for (let attempt = 0; attempt < 80 && !created; attempt += 1) {
      const start = free[Math.floor(random() * free.length)],
        goal = free[Math.floor(random() * free.length)];
      if (!start || !goal || keyOf(start) === keyOf(goal)) continue;
      const path = bfs(start, goal, obstacles, new Set(), size);
      if (path?.length > 1) created = labRobot(`R${index + 1}`, path, index);
    }
    if (created) {
      robots.push(created);
      occupied.add(keyOf(created.position));
    }
  }
  return {
    robots,
    obstacles,
    gridSize: size,
    scenarioType: guaranteed ? "high-congestion-cycle" : "generated",
  };
}

const findDeadlock = (scenario, seed) => {
  let robots = cloneRobots(scenario.robots),
    step = 0;
  while (step < 400) {
    const result = advanceSimulation(robots, "basic", scenario.obstacles);
    robots = result.robots;
    step += 1;
    if (result.cycle)
      return createDeadlockSnapshot({
        robots,
        graph: result.graph,
        cycle: result.cycle,
        step,
        events: result.notes.map((text) => ({ step, text })),
        obstacles: scenario.obstacles,
        seed,
        scenarioType: scenario.scenarioType,
        gridSize: scenario.gridSize,
      });
    if (robots.every((robot) => robot.status === "Completed")) break;
  }
  return null;
};

const baseRecord = (runId, seed, config, scenario, method, family) => ({
  runId,
  seed,
  scenarioType: scenario.scenarioType,
  robotCount: scenario.robots.length,
  gridSize: scenario.gridSize,
  obstacleDensity: config.obstacleDensity,
  congestion: config.congestion,
  method,
  family,
});

export function runLabCase(config, runIndex, manualScenario) {
  const seed =
      config.seedMode === "fixed"
        ? config.fixedSeeds[runIndex % config.fixedSeeds.length]
        : Math.floor(Math.random() * 4294967295),
    runId = runIndex + 1,
    scenario = generateLabScenario(config, seed, manualScenario),
    snapshot = findDeadlock(scenario, seed),
    records = [];

  if (["recovery", "both"].includes(config.experimentType)) {
    if (snapshot) {
      runAllRecoveryClones(snapshot, 1000).forEach((run) => {
        const m = run.metrics || {};
        records.push({
          ...baseRecord(runId, seed, config, scenario, run.method, "recovery"),
          deadlockOccurred: true,
          deadlockResolved: Boolean(m.deadlockResolved),
          recoverySteps: m.recoverySteps ?? 0,
          waitingSteps: m.totalWaiting ?? 0,
          completionSteps: m.additionalSteps ?? 0,
          robotsLost: m.robotsLost ?? 0,
          extraPathLength: m.extraPathLength ?? 0,
          completedRobots: m.completedRobots ?? 0,
          completionRate: m.completionRate ?? 0,
          status: m.finalStatus || run.status || "FAILED",
        });
      });
    } else {
      ["termination", "rollback", "reroute"].forEach((method) =>
        records.push({
          ...baseRecord(runId, seed, config, scenario, method, "recovery"),
          deadlockOccurred: false,
          deadlockResolved: false,
          recoverySteps: 0,
          waitingSteps: scenario.robots.reduce(
            (sum, robot) => sum + robot.waitingSteps,
            0,
          ),
          completionSteps: 0,
          robotsLost: 0,
          extraPathLength: 0,
          completedRobots: scenario.robots.length,
          completionRate: 100,
          status: "NO_DEADLOCK",
        }),
      );
    }
  }

  if (["strategy", "both"].includes(config.experimentType)) {
    compareHandlingStrategies(
      scenario.robots,
      "basic",
      scenario.obstacles,
      1000,
      scenario.gridSize,
    ).forEach((row) =>
      records.push({
        ...baseRecord(runId, seed, config, scenario, row.strategy, "strategy"),
        deadlockOccurred: row.deadlocksFormed > 0,
        deadlockResolved:
          row.deadlocksFormed === 0 ||
          (row.recoveryRequired && row.finalStatus === "COMPLETED"),
        deadlocksFormed: row.deadlocksFormed,
        deadlocksPrevented:
          row.strategy !== "detection" && row.deadlocksFormed === 0 ? 1 : 0,
        blockedRequests: row.resourceRequestsBlocked,
        unsafeDenials: row.unsafeRequestsDenied,
        recoveryRequired: row.recoveryRequired,
        recoverySteps: row.recoverySteps,
        waitingSteps: row.totalWaitingSteps,
        completionSteps: row.totalCompletionSteps,
        reroutes: row.reroutes,
        robotsLost: row.robotsTerminated,
        extraPathLength: row.extraPathLength,
        completedRobots: row.completedRobots,
        completionRate: row.completionRate,
        status: row.finalStatus,
      }),
    );
  }
  return { runId, seed, scenarioType: scenario.scenarioType, records };
}

export function aggregateLabResults(records) {
  const groups = new Map();
  records.forEach((record) => {
    if (!groups.has(record.method)) groups.set(record.method, []);
    groups.get(record.method).push(record);
  });
  const average = (rows, key) =>
    rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) / rows.length;
  return [...groups].map(([method, rows]) => {
    const applicable = rows.filter(
      (row) => row.family !== "recovery" || row.deadlockOccurred,
    );
    return {
      method,
      label: LAB_METHOD_NAMES[method],
      family: rows[0].family,
      runs: rows.length,
      averageWaiting: average(rows, "waitingSteps"),
      averageCompletionRate: average(rows, "completionRate"),
      averageRecoverySteps: average(applicable.length ? applicable : rows, "recoverySteps"),
      averageExtraPathLength: average(rows, "extraPathLength"),
      averageRobotsLost: average(rows, "robotsLost"),
      successRate:
        (applicable.filter((row) => row.deadlockResolved).length /
          Math.max(1, applicable.length)) *
        100,
      outcomes: {
        completed: rows.filter((row) => row.status === "COMPLETED").length,
        recovered: rows.filter(
          (row) => row.deadlockOccurred && row.deadlockResolved,
        ).length,
        deadlock: rows.filter(
          (row) => row.deadlockOccurred && !row.deadlockResolved,
        ).length,
        failed: rows.filter((row) =>
          ["FAILED", "TIMEOUT", "STALLED", "UNRECOVERABLE"].includes(
            row.status,
          ),
        ).length,
      },
    };
  });
}
