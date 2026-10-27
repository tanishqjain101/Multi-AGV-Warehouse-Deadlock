import { useState } from "react";
import {
  Bot,
  Flag,
  GitBranch,
  PackagePlus,
  Eraser,
  Undo2,
  Trash2,
  CheckCircle2,
  Save,
  FolderOpen,
} from "lucide-react";
import { bfs, keyOf } from "../logic/pathfinding.js";
import { COLORS, SIZE, cloneRobots, createRobot } from "../logic/simulation.js";

const STORAGE_KEY = "wareflow.manualScenario.v1";
const tools = [
  ["robot", "Place Robot", Bot],
  ["destination", "Place Destination", Flag],
  ["path", "Draw Path", GitBranch],
  ["shelf", "Place Obstacle / Shelf", PackagePlus],
  ["erase", "Erase", Eraser],
];
const same = (a, b) => Boolean(a && b && a.row === b.row && a.col === b.col);
const inBounds = (c) =>
  c &&
  Number.isInteger(c.row) &&
  Number.isInteger(c.col) &&
  c.row >= 0 &&
  c.col >= 0 &&
  c.row < SIZE &&
  c.col < SIZE;
const modeLabel = (robot) =>
  robot?.pathMode === "Manual" ? "Manual Path" : "Auto Path";

export function validateScenario(robots, obstacles) {
  if (!robots.length) return { error: "Add at least one robot." };
  const starts = new Set();
  for (const r of robots) {
    if (!inBounds(r.position))
      return { error: `${r.id} does not have a valid start.` };
    const start = keyOf(r.position);
    if (starts.has(start))
      return { error: "Duplicate robot starting cells found." };
    starts.add(start);
    if (obstacles.has(start))
      return { error: `${r.id} start crosses a shelf.` };
    if (!inBounds(r.destination))
      return { error: `${r.id} needs a destination.` };
    if (obstacles.has(keyOf(r.destination)))
      return { error: `${r.id} destination crosses a shelf.` };
    const path = r.path?.length ? r.path : [r.position];
    if (!same(path[0], r.position))
      return { error: `${r.id} path must begin at its start.` };
    for (let i = 0; i < path.length; i++) {
      if (!inBounds(path[i]) || obstacles.has(keyOf(path[i])))
        return {
          error: `${r.id} path passes through a shelf or invalid cell.`,
        };
      if (
        i &&
        Math.abs(path[i].row - path[i - 1].row) +
          Math.abs(path[i].col - path[i - 1].col) !==
          1
      )
        return { error: `${r.id} path is not continuous.` };
    }
    if (r.pathMode === "Manual" && !same(path[path.length - 1], r.destination))
      return { error: `${r.id} manual path must end at its destination.` };
  }
  const completed = robots.map((r) => {
    if (r.pathMode === "Manual")
      return { ...r, path: r.path.map((c) => ({ ...c })) };
    const path = bfs(r.position, r.destination, obstacles, new Set(), SIZE);
    return path ? { ...r, path, pathMode: "Automatic" } : null;
  });
  if (completed.some((r) => !r))
    return { error: "Automatic path unavailable for one or more robots." };
  return {
    robots: completed.map((r) => ({
      ...r,
      initialPath: r.path.map((c) => ({ ...c })),
    })),
  };
}

export default function useScenarioBuilder({
  active,
  setActive,
  robots,
  setRobots,
  obstacles,
  setObstacles,
  selected,
  setSelected,
  onValidated,
}) {
  const [tool, setTool] = useState("robot"),
    [notice, setNotice] = useState("Select a tool, then click the grid.");
  const updateRobot = (id, fn) =>
    setRobots((rs) => rs.map((r) => (r.id === id ? fn(r) : r)));
  const destinations = new Set(
    robots.filter((r) => r.destination).map((r) => keyOf(r.destination)),
  );
  const click = (cell) => {
    if (!active) return;
    const key = keyOf(cell),
      at = robots.find((r) => keyOf(r.position) === key),
      goal = robots.find((r) => r.destination && keyOf(r.destination) === key);
    if (tool === "robot") {
      if (obstacles.has(key) || at || goal)
        return setNotice("Robot starts must use an empty cell.");
      const number =
          Math.max(0, ...robots.map((r) => Number(r.id.slice(1)) || 0)) + 1,
        id = `R${number}`;
      setRobots((rs) => [
        ...rs,
        createRobot(
          id,
          cell.row,
          cell.col,
          COLORS[(number - 1) % COLORS.length],
        ),
      ]);
      setSelected(id);
      setNotice(`${id} placed at Cell (${cell.row},${cell.col}).`);
      return;
    }
    if (tool === "destination") {
      if (!selected || !robots.some((r) => r.id === selected))
        return setNotice("Select a robot first.");
      if (obstacles.has(key) || at || destinations.has(key))
        return setNotice("Destination must use an empty cell.");
      updateRobot(selected, (r) => ({
        ...r,
        destination: { ...cell },
        ...(r.pathMode === "Manual" ? {} : { path: [{ ...r.position }] }),
      }));
      setNotice(
        `${selected} destination assigned to Cell (${cell.row},${cell.col}).`,
      );
      return;
    }
    if (tool === "path") {
      const r = robots.find((x) => x.id === selected);
      if (!r) return setNotice("Select a robot first.");
      if (obstacles.has(key)) return setNotice("A path cannot cross a shelf.");
      const path =
          r.pathMode === "Manual" && r.path?.length ? r.path : [r.position],
        last = path[path.length - 1];
      if (same(last, cell))
        return setNotice("That cell is already the path endpoint.");
      if (Math.abs(last.row - cell.row) + Math.abs(last.col - cell.col) !== 1)
        return setNotice(
          "Rejected: choose an adjacent up, down, left, or right cell.",
        );
      updateRobot(selected, (x) => ({
        ...x,
        path: [...path, { ...cell }],
        pathMode: "Manual",
      }));
      setNotice(
        `${selected} manual path extended to Cell (${cell.row},${cell.col}).`,
      );
      return;
    }
    if (tool === "shelf") {
      if (at || goal) return setNotice("Shelves require an empty cell.");
      if (robots.some((r) => (r.path || []).some((c) => keyOf(c) === key)))
        return setNotice("Erase the path cell before placing a shelf here.");
      setObstacles((old) => new Set([...old, key]));
      setNotice(`Shelf placed at Cell (${cell.row},${cell.col}).`);
      return;
    }
    if (tool === "erase") {
      if (at) {
        setRobots((rs) => rs.filter((r) => r.id !== at.id));
        if (selected === at.id) setSelected("");
        setNotice(`${at.id} erased.`);
        return;
      }
      if (obstacles.has(key)) {
        setObstacles((old) => {
          const n = new Set(old);
          n.delete(key);
          return n;
        });
        setNotice("Shelf erased.");
        return;
      }
      if (goal) {
        updateRobot(goal.id, (r) => ({ ...r, destination: null }));
        setNotice(`${goal.id} destination erased.`);
        return;
      }
      const owner =
        robots.find(
          (r) =>
            r.id === selected &&
            (r.path || []).slice(1).some((c) => keyOf(c) === key),
        ) ||
        robots.find((r) =>
          (r.path || []).slice(1).some((c) => keyOf(c) === key),
        );
      if (owner) {
        const index = owner.path.findIndex((c, i) => i > 0 && keyOf(c) === key);
        updateRobot(owner.id, (r) => ({
          ...r,
          path: r.path.slice(0, index),
          pathMode: "Manual",
        }));
        setSelected(owner.id);
        setNotice(`${owner.id} path erased safely from that cell onward.`);
        return;
      }
      setNotice("There is nothing to erase in that cell.");
    }
  };
  const undo = () => {
    const r = robots.find((x) => x.id === selected);
    if (!r) return setNotice("Select a robot first.");
    updateRobot(selected, (x) => ({
      ...x,
      path: (x.path || []).length > 1 ? x.path.slice(0, -1) : [x.position],
      pathMode: "Manual",
    }));
    setNotice(`${selected} last path cell removed.`);
  };
  const clear = () => {
    if (!robots.some((r) => r.id === selected))
      return setNotice("Select a robot first.");
    updateRobot(selected, (r) => ({
      ...r,
      path: [{ ...r.position }],
      initialPath: [{ ...r.position }],
      pathMode: "Automatic",
    }));
    setNotice(
      `${selected} manual path cleared; BFS will generate an auto path when validated.`,
    );
  };
  const validate = () => {
    const result = validateScenario(robots, obstacles);
    if (result.error) return setNotice(result.error);
    setRobots(result.robots);
    setNotice("Scenario valid. Deadlock-prone paths are allowed.");
    onValidated(result.robots, obstacles);
  };
  const save = () => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          version: 1,
          robots: cloneRobots(robots),
          obstacles: [...obstacles],
        }),
      );
      setNotice(
        `Scenario saved (${robots.length} robot${robots.length === 1 ? "" : "s"}).`,
      );
    } catch {
      setNotice("Scenario could not be saved in this browser.");
    }
  };
  const load = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) throw new Error();
      const data = JSON.parse(raw);
      if (!Array.isArray(data.robots) || !Array.isArray(data.obstacles))
        throw new Error();
      const loaded = cloneRobots(data.robots),
        loadedObstacles = new Set(data.obstacles);
      setRobots(loaded);
      setObstacles(loadedObstacles);
      setSelected(loaded[0]?.id || "");
      setNotice(
        `Saved scenario loaded (${loaded.length} robot${loaded.length === 1 ? "" : "s"}).`,
      );
      onValidated(loaded, loadedObstacles);
    } catch {
      setNotice("No valid saved scenario was found.");
    }
  };
  const chosen = robots.find((r) => r.id === selected);
  click.tool = tool;
  return {
    panel: (
      <section className={`scenario-builder card ${active ? "open" : ""}`}>
        <div className="builder-head">
          <div>
            <small>MANUAL CONTROL</small>
            <b>Scenario Builder</b>
          </div>
          <button onClick={() => setActive(!active)}>
            {active ? "Exit Edit Mode" : "Enter Edit Mode"}
          </button>
        </div>
        {active && (
          <>
            <p className="current-tool">
              CURRENT TOOL:{" "}
              {tools.find(([id]) => id === tool)?.[1]?.toUpperCase()}
            </p>
            <div className="builder-tools">
              {tools.map(([id, label, Icon]) => (
                <button
                  className={tool === id ? "active" : ""}
                  onClick={() => {
                    setTool(id);
                    setNotice(`${label} selected.`);
                  }}
                  key={id}
                >
                  <Icon size={14} />
                  {label}
                </button>
              ))}
            </div>
            <div className="builder-selection">
              <span>
                Selected <b>{selected || "None"}</b>
              </span>
              <span>
                Path mode <b>{chosen ? modeLabel(chosen) : "—"}</b>
              </span>
              <span>
                Cells <b>{chosen?.path?.length || 0}</b>
              </span>
              <button onClick={undo}>
                <Undo2 size={13} /> Undo Last Path Cell
              </button>
              <button onClick={clear}>
                <Trash2 size={13} /> Clear Path
              </button>
            </div>
            <p className="builder-notice" role="status">
              {notice}
            </p>
            <div className="builder-actions">
              <button className="validate-button" onClick={validate}>
                <CheckCircle2 size={15} /> Validate Scenario
              </button>
              <button onClick={save}>
                <Save size={14} /> Save Scenario
              </button>
              <button onClick={load}>
                <FolderOpen size={14} /> Load Scenario
              </button>
            </div>
          </>
        )}
      </section>
    ),
    onCellClick: click,
    activeTool: tool,
  };
}
