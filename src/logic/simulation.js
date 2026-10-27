import { bfs, keyOf } from "./pathfinding.js";
import { findCycle } from "./deadlock.js";

export const SIZE = 12;
export const OBSTACLES = new Set([
  "1,2",
  "1,3",
  "1,8",
  "1,9",
  "2,2",
  "2,3",
  "2,8",
  "2,9",
  "4,1",
  "4,2",
  "4,9",
  "4,10",
  "7,1",
  "7,2",
  "7,9",
  "7,10",
  "9,3",
  "9,4",
  "9,7",
  "9,8",
  "10,3",
  "10,4",
  "10,7",
  "10,8",
]);
export const CONGESTION_THRESHOLDS = { medium: 2, high: 5 };
const p = (row, col) => ({ row, col });
export const COLORS = [
  "#36d9ff",
  "#ffb84d",
  "#b88cff",
  "#4ee59b",
  "#ff6b7d",
  "#4b9cff",
  "#f07ee6",
  "#d7e85c",
];
export const cloneRobots = (robots) =>
  robots.map((r) => ({
    ...r,
    position: { ...r.position },
    destination: r.destination ? { ...r.destination } : null,
    requestedCell: r.requestedCell ? { ...r.requestedCell } : null,
    path: (r.path || []).map((c) => ({ ...c })),
    initialPath: (r.initialPath || r.path || []).map((c) => ({ ...c })),
    history: (r.history || []).map((c) => ({ ...c })),
    reservedCells: (r.reservedCells || []).map((c) => ({ ...c })),
  }));

function robot(id, start, destination, path, index) {
  return {
    id,
    color: COLORS[index % COLORS.length],
    position: start,
    destination,
    path,
    initialPath: path,
    status: "Moving",
    waitingSteps: 0,
    rerouted: false,
    congestionScore: 0,
    congestionLabel: "Low",
    reservationDepth: 1,
    reservedCells: [],
    history: [],
    pathMode: "Automatic",
    requestedCell: null,
    resourceHolder: null,
  };
}

export function createRobot(
  id,
  row,
  col,
  color = COLORS[(Number(id.slice(1)) - 1 || 0) % COLORS.length],
) {
  const cell = { row, col };
  return {
    id,
    color,
    position: { ...cell },
    destination: null,
    path: [{ ...cell }],
    initialPath: [{ ...cell }],
    history: [],
    pathMode: "Automatic",
    status: "Moving",
    waitingSteps: 0,
    requestedCell: null,
    resourceHolder: null,
    rerouted: false,
    reservedCells: [],
    reservationDepth: 1,
    congestionScore: 0,
    congestionLabel: "Low",
    completionStep: null,
  };
}

export function defaultRobots() {
  return cloneRobots([
    // The short processing holds make the wait-for cycle form progressively on ticks 3–5.
    robot(
      "R1",
      p(5, 3),
      p(3, 6),
      [p(5, 3), p(5, 4), p(5, 5), p(5, 6), p(4, 6), p(3, 6)],
      0,
    ),
    robot(
      "R2",
      p(3, 6),
      p(6, 8),
      [p(3, 6), p(4, 6), p(5, 6), p(5, 6), p(6, 6), p(6, 7), p(6, 8)],
      1,
    ),
    robot(
      "R3",
      p(6, 8),
      p(8, 5),
      [p(6, 8), p(6, 7), p(6, 6), p(6, 6), p(6, 6), p(6, 5), p(7, 5), p(8, 5)],
      2,
    ),
    robot(
      "R4",
      p(8, 5),
      p(5, 3),
      [p(8, 5), p(7, 5), p(6, 5), p(6, 5), p(6, 5), p(5, 5), p(5, 4), p(5, 3)],
      3,
    ),
    robot(
      "R5",
      p(11, 0),
      p(8, 2),
      [p(11, 0), p(10, 0), p(9, 0), p(8, 0), p(8, 1), p(8, 2)],
      4,
    ),
  ]);
}

function seeded(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
function shuffle(items, random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateScenario(
  count = 5,
  type = "normal",
  seed = Date.now(),
) {
  if (type === "guaranteed") return guaranteedDeadlockScenario(count, seed);
  const random = seeded(seed),
    free = [];
  for (let row = 0; row < SIZE; row++)
    for (let col = 0; col < SIZE; col++)
      if (!OBSTACLES.has(`${row},${col}`)) free.push(p(row, col));
  const pool =
    type === "congested"
      ? free.filter((c) => c.row >= 3 && c.row <= 8 && c.col >= 3 && c.col <= 8)
      : free;
  for (let attempt = 0; attempt < 100; attempt++) {
    const starts = shuffle(pool.length >= count ? pool : free, random).slice(
      0,
      count,
    );
    const goalPool = shuffle(
      free.filter((c) => !starts.some((s) => keyOf(s) === keyOf(c))),
      random,
    );
    const robots = starts.map((start, i) => {
      let goal;
      if (type === "deadlock")
        goal = goalPool.sort(
          (a, b) =>
            Math.abs(b.row - start.row) +
            Math.abs(b.col - start.col) -
            (Math.abs(a.row - start.row) + Math.abs(a.col - start.col)),
        )[i % goalPool.length];
      else if (type === "congested")
        goal = goalPool.sort(
          (a, b) =>
            Math.abs(a.row - 5.5) +
            Math.abs(a.col - 5.5) -
            (Math.abs(b.row - 5.5) + Math.abs(b.col - 5.5)),
        )[i % goalPool.length];
      else goal = goalPool[i];
      const path = bfs(start, goal, OBSTACLES, new Set(), SIZE);
      return path && robot(`R${i + 1}`, start, goal, path, i);
    });
    if (
      robots.every(Boolean) &&
      new Set(robots.map((r) => keyOf(r.destination))).size === count
    )
      return cloneRobots(robots);
  }
  return cloneRobots(defaultRobots().slice(0, Math.min(count, 5)));
}
export const randomRobots = () => generateScenario(5, "normal", Date.now());

export function congestionFor(robot, robots) {
  const others = robots.filter(
    (r) => r.id !== robot.id && r.status !== "Completed",
  );
  const nearby = others.filter(
    (r) =>
      Math.abs(r.position.row - robot.position.row) +
        Math.abs(r.position.col - robot.position.col) <=
      3,
  );
  const occupied = new Set(others.map((r) => keyOf(r.position)));
  const pathOccupied = robot.path
    .slice(1, 4)
    .filter((c) => occupied.has(keyOf(c))).length;
  const nearbyWaiting = nearby.filter(
    (r) => r.status === "Waiting" || r.status === "Deadlocked",
  ).length;
  return nearby.length + pathOccupied + nearbyWaiting;
}
export function reservationDepth(algorithm, score) {
  if (algorithm === "basic") return 1;
  if (algorithm === "fixed") return 2;
  return score >= CONGESTION_THRESHOLDS.high
    ? 3
    : score >= CONGESTION_THRESHOLDS.medium
      ? 2
      : 1;
}

// Each tick creates fresh short-lived claims. They are discarded after movement.
export function guaranteedDeadlockScenario(count = 5, seed = Date.now()) {
  const random = seeded(Number(seed) >>> 0),
    options = [];
  // A true next-cell cycle on an orthogonal grid needs an even number of cells.
  // Four robots approach the ring for two ticks, so no deadlock exists at start.
  for (let row = 3; row <= 7; row++)
    for (let col = 3; col <= 7; col++) {
      const ring = [
        p(row, col),
        p(row, col + 1),
        p(row + 1, col + 1),
        p(row + 1, col),
      ];
      const starts = [
        p(row, col - 2),
        p(row - 2, col + 1),
        p(row + 1, col + 3),
        p(row + 3, col),
      ];
      const approaches = [
        [starts[0], p(row, col - 1), ring[0]],
        [starts[1], p(row - 1, col + 1), ring[1]],
        [starts[2], p(row + 1, col + 2), ring[2]],
        [starts[3], p(row + 2, col), ring[3]],
      ];
      if (
        [...ring, ...approaches.flat()].every(
          (c) =>
            c.row >= 0 &&
            c.col >= 0 &&
            c.row < SIZE &&
            c.col < SIZE &&
            !OBSTACLES.has(keyOf(c)),
        )
      )
        options.push({ ring, approaches });
    }
  const { ring, approaches } = options[Math.floor(random() * options.length)];
  const core = ring.map((held, i) => {
    const next = ring[(i + 1) % 4];
    return robot(
      `R${i + 1}`,
      approaches[i][0],
      next,
      [...approaches[i], next],
      i,
    );
  });
  const occupied = new Set(core.flatMap((r) => r.path.map(keyOf)));
  const extras = generateScenario(
    Math.max(count + 4, 8),
    "normal",
    (Number(seed) + 17) >>> 0,
  )
    .filter((r) => !r.path.some((c) => occupied.has(keyOf(c))))
    .slice(0, Math.max(0, count - 4))
    .map((r, i) => ({
      ...r,
      id: `R${i + 5}`,
      color: COLORS[(i + 4) % COLORS.length],
    }));
  return cloneRobots([...core, ...extras]);
}

export function advanceSimulation(
  input,
  algorithm = "basic",
  obstacles = OBSTACLES,
) {
  let robots = cloneRobots(input),
    graph = {},
    notes = [],
    movementSteps = 0;
  const occupied = new Map(
    robots
      .filter((r) => !["Completed", "Terminated"].includes(r.status))
      .map((r) => [keyOf(r.position), r.id]),
  );
  const claims = new Map();
  robots.forEach((r) => {
    if (["Completed", "Terminated"].includes(r.status)) return;
    if ((r.rollbackCooldown || 0) > 0) {
      r.rollbackCooldown -= 1;
      r.status = "Recovering";
      r.requestedCell = null;
      r.resourceHolder = null;
      r.reservedCells = [];
      notes.push(`${r.id} recovery hold keeps its released resource available`);
      return;
    }
    const score = congestionFor(r, robots),
      depth = reservationDepth(algorithm, score);
    r.congestionScore = score;
    r.congestionLabel =
      score >= CONGESTION_THRESHOLDS.high
        ? "High"
        : score >= CONGESTION_THRESHOLDS.medium
          ? "Medium"
          : "Low";
    r.reservationDepth = depth;
    const requested = r.path.slice(1, depth + 1);
    let blocker = null;
    for (const cell of requested) {
      const key = keyOf(cell),
        owner = occupied.get(key),
        claimant = claims.get(key);
      if (owner && owner !== r.id) {
        blocker = owner;
        break;
      }
      if (claimant && claimant !== r.id) {
        blocker = claimant;
        break;
      }
    }
    r.requestedCell = requested[0] ? { ...requested[0] } : null;
    r.resourceHolder = blocker;
    if (blocker) {
      r.status = "Waiting";
      r.waitingSteps++;
      r.reservedCells = [];
      graph[r.id] = blocker;
      notes.push(
        `${r.id} requested Cell (${requested[0].row},${requested[0].col}); owned by ${blocker}; ${r.id} became WAITING`,
      );
      return;
    }
    requested.forEach((c) => claims.set(keyOf(c), r.id));
    r.reservedCells = requested;
    const target = r.path[1];
    if (!target) {
      r.status = "Completed";
      return;
    }
    const held = keyOf(target) === keyOf(r.position);
    if (!held) r.history = [...(r.history || []), { ...r.position }];
    occupied.delete(keyOf(r.position));
    r.position = target;
    r.path = r.path.slice(1);
    occupied.set(keyOf(target), r.id);
    if (!held) movementSteps++;
    r.resourceHolder = null;
    r.requestedCell = null;
    r.status =
      r.path.length === 1 ? "Completed" : r.rerouted ? "Rerouted" : "Moving";
    notes.push(
      `${r.id} moved to Cell (${target.row},${target.col}) using L${depth}`,
    );
  });
  const cycle = findCycle(graph);
  if (cycle) {
    robots = robots.map((r) =>
      cycle.includes(r.id) ? { ...r, status: "Deadlocked" } : r,
    );
    notes.unshift(`Deadlock detected: ${cycle.join(" → ")}`);
  }
  return { robots, graph, cycle, notes, movementSteps };
}

function sharedPathCells(robots) {
  const counts = new Map();
  robots.forEach((r) =>
    new Set((r.initialPath || r.path).map(keyOf)).forEach((key) =>
      counts.set(key, (counts.get(key) || 0) + 1),
    ),
  );
  return new Set(
    [...counts].filter(([, count]) => count > 1).map(([key]) => key),
  );
}

// Critical-section prevention avoids partial Hold-and-Wait within a contiguous
// shared segment by acquiring that segment atomically before entry.
export function advancePrevention(input, obstacles = OBSTACLES) {
  let robots = cloneRobots(input),
    graph = {},
    notes = [],
    movementSteps = 0;
  const shared = sharedPathCells(robots);
  const occupied = new Map(
    robots
      .filter((r) => !["Completed", "Terminated"].includes(r.status))
      .map((r) => [keyOf(r.position), r.id]),
  );
  const reservations = new Map();
  robots.forEach((r) =>
    (r.reservedCells || []).forEach((cell) =>
      reservations.set(keyOf(cell), r.id),
    ),
  );
  let blockedRequests = 0;
  robots.forEach((r) => {
    if (["Completed", "Terminated"].includes(r.status)) return;
    const target = r.path[1];
    if (!target) {
      r.status = "Completed";
      r.reservedCells = [];
      return;
    }
    const entering =
      shared.has(keyOf(target)) &&
      !(r.reservedCells || []).some((c) => keyOf(c) === keyOf(target));
    if (entering) {
      const segment = [];
      for (const cell of r.path.slice(1)) {
        if (!shared.has(keyOf(cell))) break;
        segment.push(cell);
      }
      const unavailable = segment.find((cell) => {
        const owner =
          occupied.get(keyOf(cell)) || reservations.get(keyOf(cell));
        return owner && owner !== r.id;
      });
      if (unavailable) {
        r.status = "Waiting";
        r.waitingSteps += 1;
        r.requestedCell = { ...target };
        r.resourceHolder =
          occupied.get(keyOf(unavailable)) ||
          reservations.get(keyOf(unavailable));
        r.reservedCells = [];
        blockedRequests += 1;
        notes.push(
          `${r.id} requests critical shared segment; request blocked because not all required resources are available; partial Hold-and-Wait prevented in the critical section`,
        );
        return;
      }
      r.reservedCells = segment.map((cell) => ({ ...cell }));
      segment.forEach((cell) => reservations.set(keyOf(cell), r.id));
      notes.push(
        `${r.id} atomically reserved ${segment.length} critical resources`,
      );
    }
    const owner =
      occupied.get(keyOf(target)) || reservations.get(keyOf(target));
    if (owner && owner !== r.id) {
      r.status = "Waiting";
      r.waitingSteps += 1;
      r.requestedCell = { ...target };
      r.resourceHolder = owner;
      blockedRequests += 1;
      notes.push(
        `${r.id} waited outside the critical section without retaining partial segment reservations`,
      );
      return;
    }
    r.history = [...(r.history || []), { ...r.position }];
    occupied.delete(keyOf(r.position));
    r.position = { ...target };
    r.path = r.path.slice(1);
    occupied.set(keyOf(target), r.id);
    movementSteps += 1;
    r.requestedCell = null;
    r.resourceHolder = null;
    const stillInside = r.path.some((cell) =>
      (r.reservedCells || []).some((held) => keyOf(held) === keyOf(cell)),
    );
    if (!stillInside || r.path.length === 1) {
      (r.reservedCells || []).forEach((cell) =>
        reservations.delete(keyOf(cell)),
      );
      r.reservedCells = [];
    }
    r.status = r.path.length === 1 ? "Completed" : "Moving";
    notes.push(
      `${r.id} moved to Cell (${target.row},${target.col}) under atomic reservation`,
    );
  });
  return {
    robots,
    graph,
    cycle: null,
    notes,
    movementSteps,
    blockedRequests,
    unsafeDenied: 0,
    reservedResources: robots.reduce(
      (sum, r) => sum + (r.reservedCells?.length || 0),
      0,
    ),
  };
}

// Avoidance projects all grants for this tick. If the projected allocation
// contains a circular wait, the last grant that completes that cycle is denied.
export function advanceAvoidance(input, obstacles = OBSTACLES) {
  let robots = cloneRobots(input),
    notes = [],
    movementSteps = 0,
    unsafeDenied = 0;
  const active = robots.filter(
    (r) => !["Completed", "Terminated"].includes(r.status),
  );
  const occupied = new Map(active.map((r) => [keyOf(r.position), r.id])),
    claimed = new Map(),
    candidates = [];
  active.forEach((r) => {
    const target = r.path[1];
    if (target && !occupied.has(keyOf(target)) && !claimed.has(keyOf(target))) {
      claimed.set(keyOf(target), r.id);
      candidates.push(r.id);
    }
  });
  const projectedOwner = new Map();
  active.forEach((r) =>
    projectedOwner.set(
      keyOf(candidates.includes(r.id) ? r.path[1] : r.position),
      r.id,
    ),
  );
  const projectedGraph = {};
  active.forEach((r) => {
    const next = candidates.includes(r.id) ? r.path[2] : r.path[1],
      holder = next && projectedOwner.get(keyOf(next));
    if (holder && holder !== r.id) projectedGraph[r.id] = holder;
  });
  const projectedCycle = findCycle(projectedGraph);
  let denied = null;
  if (projectedCycle) {
    denied = [...projectedCycle.slice(0, -1)]
      .reverse()
      .find((id) => candidates.includes(id));
    if (denied) {
      unsafeDenied = 1;
      candidates.splice(candidates.indexOf(denied), 1);
      notes.push(
        `${denied} unsafe request denied; tentative allocation would create ${projectedCycle.join(" -> ")}; circular allocation avoided`,
      );
    }
  }
  const allowed = new Set(candidates),
    finalOwner = new Map();
  active.forEach((r) =>
    finalOwner.set(keyOf(allowed.has(r.id) ? r.path[1] : r.position), r.id),
  );
  const graph = {};
  robots.forEach((r) => {
    if (["Completed", "Terminated"].includes(r.status)) return;
    const target = r.path[1];
    if (!target) {
      r.status = "Completed";
      return;
    }
    if (allowed.has(r.id)) {
      r.history = [...(r.history || []), { ...r.position }];
      r.position = { ...target };
      r.path = r.path.slice(1);
      r.status = r.path.length === 1 ? "Completed" : "Moving";
      r.requestedCell = null;
      r.resourceHolder = null;
      movementSteps += 1;
      notes.push(
        `${r.id} moved to Cell (${target.row},${target.col}); projected allocation was safe`,
      );
      return;
    }
    const holder = finalOwner.get(keyOf(target)) || occupied.get(keyOf(target));
    r.status = denied === r.id ? "Avoidance Blocked" : "Waiting";
    r.waitingSteps += 1;
    r.requestedCell = { ...target };
    r.resourceHolder = holder || null;
    if (holder && holder !== r.id && denied !== r.id) graph[r.id] = holder;
    if (denied !== r.id)
      notes.push(`${r.id} waits for ${holder || "a pending allocation"}`);
  });
  return {
    robots,
    graph,
    cycle: findCycle(graph),
    notes,
    movementSteps,
    blockedRequests: 0,
    unsafeDenied,
    reservedResources: 0,
  };
}

export function advanceByStrategy(
  input,
  strategy = "detection",
  algorithm = "basic",
  obstacles = OBSTACLES,
) {
  if (strategy === "prevention") return advancePrevention(input, obstacles);
  if (strategy === "avoidance") return advanceAvoidance(input, obstacles);
  return {
    ...advanceSimulation(input, algorithm, obstacles),
    blockedRequests: 0,
    unsafeDenied: 0,
    reservedResources: 0,
  };
}

// Recovery tests each cycle member and chooses the shortest valid alternate path.
export function chooseReroute(
  robots,
  cycle,
  obstacles = OBSTACLES,
  gridSize = SIZE,
) {
  const ids = new Set(cycle.slice(0, -1));
  const candidates = robots
    .filter((r) => ids.has(r.id))
    .map((robot) => {
      const blocked = new Set(
        robots
          .filter(
            (r) =>
              r.id !== robot.id &&
              !["Completed", "Terminated"].includes(r.status),
          )
          .map((r) => keyOf(r.position)),
      );
      blocked.delete(keyOf(robot.destination));
      const oldNext = keyOf(robot.path[1]);
      const path = [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]
        .map(([dr, dc]) => ({
          row: robot.position.row + dr,
          col: robot.position.col + dc,
        }))
        .filter(
          (cell) =>
            cell.row >= 0 &&
            cell.col >= 0 &&
            cell.row < gridSize &&
            cell.col < gridSize &&
            !obstacles.has(keyOf(cell)) &&
            !blocked.has(keyOf(cell)) &&
            keyOf(cell) !== oldNext,
        )
        .map((cell) => {
          const tail = bfs(
            cell,
            robot.destination,
            obstacles,
            blocked,
            gridSize,
          );
          return tail ? [robot.position, ...tail] : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.length - b.length)[0];
      return path && path.length > 1
        ? { robot, path, extra: Math.max(0, path.length - robot.path.length) }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.extra - b.extra);
  return candidates[0] || null;
}

export function runHeadless(
  initial,
  algorithm,
  maxTicks = 600,
  obstacles = OBSTACLES,
) {
  let robots = cloneRobots(initial),
    steps = 0,
    movementSteps = 0,
    deadlocks = 0,
    reroutes = 0,
    completionTotal = 0;
  while (
    steps < maxTicks &&
    !robots.every((r) => ["Completed", "Terminated"].includes(r.status))
  ) {
    const result = advanceSimulation(robots, algorithm, obstacles);
    robots = result.robots;
    steps++;
    movementSteps += result.movementSteps;
    robots.forEach((r) => {
      if (r.status === "Completed" && !r.completionStep) {
        r.completionStep = steps;
        completionTotal += steps;
      }
    });
    if (result.cycle) {
      deadlocks++;
      const choice = chooseReroute(robots, result.cycle, obstacles);
      if (!choice) break;
      reroutes++;
      robots = robots.map((r) =>
        r.id === choice.robot.id
          ? { ...r, path: choice.path, status: "Rerouted", rerouted: true }
          : result.cycle.includes(r.id)
            ? { ...r, status: "Moving" }
            : r,
      );
    }
    if (result.movementSteps === 0 && !result.cycle) break;
  }
  const completed = robots.filter((r) => r.status === "Completed").length;
  return {
    deadlocks,
    completionRate: (completed / initial.length) * 100,
    avgWait: robots.reduce((s, r) => s + r.waitingSteps, 0) / initial.length,
    movementSteps,
    reroutes,
    avgCompletion: completed ? completionTotal / completed : 0,
  };
}

export function createDeadlockSnapshot({
  robots,
  graph,
  cycle,
  step,
  events,
  timeline = [],
  obstacles = OBSTACLES,
  seed = null,
  scenarioType = "manual",
  metrics = {},
  gridSize = SIZE,
}) {
  return Object.freeze({
    robots: cloneRobots(robots),
    graph: { ...graph },
    cycle: [...cycle],
    step,
    events: events.map((e) => ({ ...e })),
    timeline: timeline.map((f) => ({
      ...f,
      robots: cloneRobots(f.robots),
      graph: { ...f.graph },
      cycle: f.cycle ? [...f.cycle] : null,
      events: (f.events || []).map((e) => ({ ...e })),
    })),
    obstacles: new Set(obstacles),
    seed,
    scenarioType,
    metrics: structuredClone(metrics),
    gridSize,
    capturedAt: new Date().toISOString(),
  });
}

export function prepareRecovery(snapshot, method, requestedVictim) {
  const ids = snapshot.cycle.slice(0, -1),
    robots = cloneRobots(snapshot.robots),
    victim =
      requestedVictim && ids.includes(requestedVictim)
        ? requestedVictim
        : ids[0],
    current = robots.find((r) => r.id === victim);
  if (method === "termination")
    return {
      method,
      victim,
      currentPath: current.path,
      proposedPath: [],
      reason: `${victim} is selected as the termination victim and releases ${keyOf(current.position)}.`,
      released: [current.position],
    };
  if (method === "rollback") {
    const occupied = new Set(
      robots
        .filter(
          (r) =>
            r.id !== victim && !["Completed", "Terminated"].includes(r.status),
        )
        .map((r) => keyOf(r.position)),
    );
    const candidates = [...(current.history || [])].reverse();
    const previous = candidates.find(
      (c) => !occupied.has(keyOf(c)) && !snapshot.obstacles.has(keyOf(c)),
    );
    if (!previous) return null;
    return {
      method,
      victim,
      currentPath: current.path,
      proposedPath: [previous, current.position, ...current.path.slice(1)],
      previous,
      reason: `${victim} can roll back to its previous safe cell and release ${keyOf(current.position)}.`,
    };
  }
  let choice;
  if (requestedVictim && ids.includes(requestedVictim)) {
    const candidate = robots.find((r) => r.id === requestedVictim),
      blocked = new Set(
        robots
          .filter(
            (r) =>
              r.id !== requestedVictim &&
              !["Completed", "Terminated"].includes(r.status),
          )
          .map((r) => keyOf(r.position)),
      );
    blocked.delete(keyOf(candidate.destination));
    const oldNext = keyOf(candidate.path[1]);
    const path = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]
      .map(([dr, dc]) => ({
        row: candidate.position.row + dr,
        col: candidate.position.col + dc,
      }))
      .filter(
        (cell) =>
          cell.row >= 0 &&
          cell.col >= 0 &&
          cell.row < (snapshot.gridSize || SIZE) &&
          cell.col < (snapshot.gridSize || SIZE) &&
          !snapshot.obstacles.has(keyOf(cell)) &&
          !blocked.has(keyOf(cell)) &&
          keyOf(cell) !== oldNext,
      )
      .map((cell) => {
        const tail = bfs(
          cell,
          candidate.destination,
          snapshot.obstacles,
          blocked,
          snapshot.gridSize || SIZE,
        );
        return tail ? [candidate.position, ...tail] : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.length - b.length)[0];
    choice = path
      ? {
          robot: candidate,
          path,
          extra: Math.max(0, path.length - candidate.path.length),
        }
      : null;
  } else
    choice = chooseReroute(
      robots,
      snapshot.cycle,
      snapshot.obstacles,
      snapshot.gridSize || SIZE,
    );
  if (!choice) return null;
  return {
    method,
    victim: choice.robot.id,
    currentPath: choice.robot.path,
    proposedPath: choice.path,
    extraPathLength: choice.extra,
    reason: `${choice.robot.id} has the lowest-cost available alternative route.`,
  };
}

export function applyRecovery(snapshot, preview) {
  const robots = cloneRobots(snapshot.robots).map((r) => {
    if (r.id !== preview.victim)
      return snapshot.cycle.includes(r.id) ? { ...r, status: "Moving" } : r;
    if (preview.method === "termination")
      return { ...r, status: "Terminated", path: [], reservedCells: [] };
    if (preview.method === "rollback")
      return {
        ...r,
        position: { ...preview.previous },
        path: preview.proposedPath.map((c) => ({ ...c })),
        status: "Rolled Back",
        history: r.history.slice(0, -1),
        reservedCells: [],
        requestedCell: null,
        resourceHolder: null,
        rollbackCooldown: 1,
      };
    return {
      ...r,
      path: preview.proposedPath.map((c) => ({ ...c })),
      status: "Rerouted",
      rerouted: true,
      reservedCells: [],
    };
  });
  return { robots, ...rebuildWaitForGraph(robots) };
}

export function rebuildWaitForGraph(robots) {
  const occupied = new Map(
      robots
        .filter((r) => !["Completed", "Terminated"].includes(r.status))
        .map((r) => [keyOf(r.position), r.id]),
    ),
    graph = {};
  robots.forEach((r) => {
    if (
      ["Completed", "Terminated"].includes(r.status) ||
      (r.rollbackCooldown || 0) > 0
    )
      return;
    const requested = (r.path || [])[1],
      holder = requested && occupied.get(keyOf(requested));
    if (holder && holder !== r.id) graph[r.id] = holder;
  });
  return { graph, cycle: findCycle(graph) };
}

export function compareRecoveries(
  snapshot,
  algorithm = "basic",
  maxSteps = 1000,
) {
  return ["termination", "rollback", "reroute"].map((method) => {
    const preview = prepareRecovery(snapshot, method);
    if (!preview)
      return {
        method,
        available: false,
        reason: `${method} has no valid candidate in this snapshot.`,
      };
    const applied = applyRecovery(snapshot, preview),
      baselineWait = applied.robots.reduce((s, r) => s + r.waitingSteps, 0);
    let robots = applied.robots,
      steps = 0,
      movement = 0,
      cycle = null;
    while (
      steps < maxSteps &&
      !robots.every((r) => ["Completed", "Terminated"].includes(r.status))
    ) {
      const result = advanceSimulation(robots, algorithm, snapshot.obstacles);
      robots = result.robots;
      cycle = result.cycle;
      steps++;
      movement += result.movementSteps;
      if (
        cycle ||
        (!result.movementSteps && Object.keys(result.graph).length === 0)
      )
        break;
    }
    const completed = robots.filter((r) => r.status === "Completed").length,
      totalWait = robots.reduce((s, r) => s + r.waitingSteps, 0) - baselineWait,
      activeTotal = robots.filter((r) => r.status !== "Terminated").length;
    return {
      method,
      available: true,
      deadlockResolved: !cycle,
      recoverySteps: 1,
      additionalSteps: steps,
      totalWaiting: totalWait,
      averageWaiting: activeTotal ? totalWait / activeTotal : 0,
      robotsTerminated: method === "termination" ? 1 : 0,
      resourcesReleased: 1,
      reroutes: method === "reroute" ? 1 : 0,
      extraPathLength: preview.extraPathLength || 0,
      completedRobots: completed,
      completionRate: robots.length ? (completed / robots.length) * 100 : 0,
      finalStatus: cycle
        ? "DEADLOCK"
        : steps >= maxSteps
          ? "TIMEOUT"
          : "COMPLETED",
      movementSteps: movement,
      victim: preview.victim,
    };
  });
}

export function compareHandlingStrategies(
  initial,
  algorithm = "basic",
  obstacles = OBSTACLES,
  maxSteps = 1000,
  gridSize = SIZE,
) {
  return ["prevention", "avoidance", "detection"].map((strategy) => {
    let robots = cloneRobots(initial),
      steps = 0,
      deadlocks = 0,
      blocked = 0,
      denied = 0,
      recoverySteps = 0,
      terminated = 0,
      reroutes = 0,
      extraPathLength = 0,
      finalStatus = "COMPLETED";
    while (
      steps < maxSteps &&
      !robots.every((r) => ["Completed", "Terminated"].includes(r.status))
    ) {
      const result = advanceByStrategy(robots, strategy, algorithm, obstacles);
      robots = result.robots;
      steps += 1;
      blocked += result.blockedRequests || 0;
      denied += result.unsafeDenied || 0;
      if (result.cycle) {
        deadlocks += 1;
        if (strategy !== "detection") {
          finalStatus = "DEADLOCK";
          break;
        }
        const snapshot = createDeadlockSnapshot({
          robots,
          graph: result.graph,
          cycle: result.cycle,
          step: steps,
          events: [],
          obstacles,
          gridSize,
        });
        const preview = prepareRecovery(snapshot, "reroute");
        if (!preview) {
          finalStatus = "UNRECOVERABLE";
          break;
        }
        robots = applyRecovery(snapshot, preview).robots;
        recoverySteps += 1;
        if (preview.method === "termination") terminated += 1;
        if (preview.method === "reroute") {
          reroutes += 1;
          extraPathLength += preview.extraPathLength || 0;
        }
      }
      if (
        result.movementSteps === 0 &&
        !result.cycle &&
        strategy === "detection" &&
        Object.keys(result.graph).length === 0
      ) {
        finalStatus = "STALLED";
        break;
      }
    }
    if (
      steps >= maxSteps &&
      !robots.every((r) => ["Completed", "Terminated"].includes(r.status))
    )
      finalStatus = "TIMEOUT";
    const completed = robots.filter((r) => r.status === "Completed").length,
      totalWaiting = robots.reduce((sum, r) => sum + r.waitingSteps, 0);
    return {
      strategy,
      deadlocksFormed: deadlocks,
      resourceRequestsBlocked: blocked,
      unsafeRequestsDenied: denied,
      recoveryRequired: recoverySteps > 0,
      recoverySteps,
      totalWaitingSteps: totalWaiting,
      averageWaitingSteps: robots.length ? totalWaiting / robots.length : 0,
      totalCompletionSteps: steps,
      robotsTerminated: terminated,
      reroutes,
      extraPathLength,
      completedRobots: completed,
      completionRate: robots.length ? (completed / robots.length) * 100 : 0,
      finalStatus,
    };
  });
}
