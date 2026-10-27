export const keyOf = ({ row, col }) => `${row},${col}`;

export function bfs(start, goal, obstacles, blocked = new Set(), size = 12) {
  const queue = [[start]];
  const seen = new Set([keyOf(start)]);
  while (queue.length) {
    const path = queue.shift();
    const here = path[path.length - 1];
    if (here.row === goal.row && here.col === goal.col) return path;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      const next = { row: here.row + dr, col: here.col + dc };
      const key = keyOf(next);
      if (
        next.row < 0 ||
        next.col < 0 ||
        next.row >= size ||
        next.col >= size ||
        obstacles.has(key) ||
        blocked.has(key) ||
        seen.has(key)
      )
        continue;
      seen.add(key);
      queue.push([...path, next]);
    }
  }
  return null;
}
