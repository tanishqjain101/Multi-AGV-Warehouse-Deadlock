// DFS finds a back-edge in the wait-for graph; that back-edge identifies circular wait.
export function findCycle(graph) {
  const visited = new Set();
  const active = new Set();
  const stack = [];
  function visit(node) {
    visited.add(node);
    active.add(node);
    stack.push(node);
    const next = graph[node];
    if (next) {
      if (!visited.has(next)) {
        const result = visit(next);
        if (result) return result;
      } else if (active.has(next))
        return [...stack.slice(stack.indexOf(next)), next];
    }
    stack.pop();
    active.delete(node);
    return null;
  }
  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      const cycle = visit(node);
      if (cycle) return cycle;
    }
  }
  return null;
}
