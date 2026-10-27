import { Package, Flag } from "lucide-react";
import { SIZE, OBSTACLES } from "../logic/simulation.js";
import { keyOf } from "../logic/pathfinding.js";

export default function WarehouseGrid({
  robots,
  cycle,
  graph,
  adaptive,
  selected,
  onSelect,
  recoveryPath = [],
  obstacles = OBSTACLES,
  editMode = false,
  editTool,
  onCellClick,
  onInspectCell,
}) {
  const cycleIds = new Set((cycle || []).slice(0, -1));
  const pathCells = new Map();
  robots.forEach((r) =>
    (r.path || []).slice(1).forEach((c) => {
      if (!pathCells.has(keyOf(c))) pathCells.set(keyOf(c), r.color);
    }),
  );
  return (
    <div className="grid-shell">
      <div className="warehouse-grid">
        {Array.from({ length: SIZE * SIZE }, (_, i) => {
          const row = Math.floor(i / SIZE),
            col = i % SIZE,
            key = `${row},${col}`;
          // A completed robot has left the active floor and releases its final resource.
          const robot = robots.find(
            (r) =>
              !["Completed", "Terminated"].includes(r.status) &&
              keyOf(r.position) === key,
          );
          const goal = robots.find(
            (r) =>
              r.destination &&
              keyOf(r.destination) === key &&
              !["Completed", "Terminated"].includes(r.status),
          );
          const pathColor = pathCells.get(key),
            reservation =
              adaptive &&
              robots.find((r) =>
                (r.reservedCells || []).some((c) => keyOf(c) === key),
              );
          const requester = robots.find(
              (r) =>
                graph?.[r.id] && (r.path || [])[1] && keyOf(r.path[1]) === key,
            ),
            recovering = recoveryPath.some((c) => keyOf(c) === key);
          const past = robots
            .find((r) => r.id === selected)
            ?.history?.some((c) => keyOf(c) === key);
          const owner = robot?.id;
          return (
            <div
              onClick={() =>
                editMode
                  ? onCellClick?.({ row, col })
                  : onInspectCell?.({ row, col })
              }
              className={`cell ${obstacles.has(key) ? "shelf" : ""} ${reservation ? "reserved" : ""} ${requester ? "requested" : ""} ${recovering ? "recovery-route" : ""} ${past ? "past-path" : ""} ${editMode ? "editable" : ""}`}
              style={
                reservation ? { "--reserve": reservation.color } : undefined
              }
              title={
                owner
                  ? `Cell (${row},${col}) · Owner: ${owner}${requester ? ` · Requested by: ${requester.id}` : ""}`
                  : requester
                    ? `Cell (${row},${col}) · Requested by: ${requester.id}`
                    : ""
              }
              key={key}
            >
              {pathColor && !obstacles.has(key) && (
                <span className="path-dot" style={{ background: pathColor }} />
              )}
              {obstacles.has(key) && <Package size={14} />}{" "}
              {goal && (
                <Flag
                  className="goal"
                  size={13}
                  style={{ color: goal.color }}
                />
              )}
              {requester && (
                <span className="requester-tag">{requester.id}?</span>
              )}
              {robot && (
                <button
                  className={`robot ${cycleIds.has(robot.id) ? "danger" : ""} ${selected === robot.id ? "selected" : ""}`}
                  style={{
                    "--robot": cycleIds.has(robot.id) ? "#ff4c61" : robot.color,
                  }}
                  title={`${robot.id}: ${robot.status}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editMode && (editTool || onCellClick?.tool) === "erase")
                      onCellClick?.({ row, col });
                    else onSelect(robot.id);
                  }}
                >
                  <span>{robot.id.slice(1)}</span>
                  {adaptive && <b>L{robot.reservationDepth}</b>}
                  {cycleIds.has(robot.id) && (
                    <>
                      <em>DEADLOCK</em>
                      <small>
                        WAIT → {graph[robot.id]} ·{" "}
                        {robot.path[1]
                          ? `C(${robot.path[1].row},${robot.path[1].col})`
                          : ""}
                      </small>
                    </>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="grid-axis">
        12 × 12 RESOURCE MATRIX <span>•</span> ONE CELL = ONE EXCLUSIVE RESOURCE
      </div>
    </div>
  );
}
