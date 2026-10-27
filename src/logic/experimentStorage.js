export const EXPERIMENT_KEYS = {
  recovery: "agv_recovery_results",
  strategy: "agv_strategy_results",
  snapshot: "agv_deadlock_snapshot",
  metadata: "agv_scenario_metadata",
  labResults: "agv_experiment_lab_results",
  labConfig: "agv_experiment_lab_config",
};

const replacer = (_key, value) =>
  value instanceof Set ? { __agvType: "Set", values: [...value] } : value;

const reviver = (_key, value) =>
  value?.__agvType === "Set" && Array.isArray(value.values)
    ? new Set(value.values)
    : value;

export function loadExperiment(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw, reviver) : null;
  } catch {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage may be unavailable; the application can continue in memory.
    }
    return null;
  }
}

export function saveExperiment(key, value) {
  if (value === null || value === undefined) return;
  try {
    localStorage.setItem(key, JSON.stringify(value, replacer));
  } catch {
    // Quota/privacy failures should not prevent the experiment from running.
  }
}

export function removeExperiment(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage may be unavailable.
  }
}

export function clearExperimentData() {
  try {
    Object.values(EXPERIMENT_KEYS).forEach((key) => localStorage.removeItem(key));
  } catch {
    // Keep the in-memory reset usable when storage access is unavailable.
  }
}
