import { useEffect, useState } from "react";
import SimpleSimulator from "./pages/SimpleSimulator.jsx";
import RecoveryComparisonView from "./pages/RecoveryComparisonView.jsx";
import RecoveryResults from "./pages/RecoveryResults.jsx";
import DeadlockStrategies from "./pages/DeadlockStrategies.jsx";
import Analysis from "./pages/Analysis.jsx";
import ExperimentLab from "./pages/ExperimentLab.jsx";
import {
  clearExperimentData,
  EXPERIMENT_KEYS,
  loadExperiment,
  saveExperiment,
} from "./logic/experimentStorage.js";

const pageFromPath = () =>
  location.pathname === "/experiment-lab"
    ? "lab"
    : location.pathname === "/analysis"
    ? "analysis"
    : location.pathname === "/results"
    ? "results"
    : location.pathname === "/deadlock-strategies"
      ? "strategies"
      : location.pathname === "/recovery-comparison"
        ? "comparison"
        : "simulator";
export default function App() {
  const [page, setPage] = useState(pageFromPath),
    [snapshot, setSnapshot] = useState(() =>
      loadExperiment(EXPERIMENT_KEYS.snapshot),
    ),
    [results, setResults] = useState(() =>
      loadExperiment(EXPERIMENT_KEYS.recovery),
    ),
    [strategyResults, setStrategyResults] = useState(() =>
      loadExperiment(EXPERIMENT_KEYS.strategy),
    ),
    [initialScenario, setInitialScenario] = useState(
      () => loadExperiment(EXPERIMENT_KEYS.metadata)?.initialScenario || null,
    );
  useEffect(() => {
    const back = () => setPage(pageFromPath());
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, []);
  useEffect(() => saveExperiment(EXPERIMENT_KEYS.snapshot, snapshot), [snapshot]);
  useEffect(() => saveExperiment(EXPERIMENT_KEYS.recovery, results), [results]);
  useEffect(
    () => saveExperiment(EXPERIMENT_KEYS.strategy, strategyResults),
    [strategyResults],
  );
  useEffect(
    () =>
      saveExperiment(EXPERIMENT_KEYS.metadata, {
        initialScenario,
        seed: snapshot?.seed ?? null,
        scenarioType: snapshot?.scenarioType ?? null,
      }),
    [initialScenario, snapshot],
  );
  const go = (next) => {
    const path =
      next === "lab"
        ? "/experiment-lab"
        : next === "analysis"
        ? "/analysis"
        : next === "results"
        ? "/results"
        : next === "strategies"
          ? "/deadlock-strategies"
          : next === "comparison"
            ? "/recovery-comparison"
            : "/";
    history.pushState({}, "", path);
    setPage(next);
  },
    resetAllExperimentData = () => {
      clearExperimentData();
      setSnapshot(null);
      setResults(null);
      setStrategyResults(null);
      setInitialScenario(null);
    };
  return (
    <div className="focused-app">
      <nav className="simple-nav">
        {[
          ["simulator", "Simulator"],
          ["comparison", "Recovery Comparison"],
          ["strategies", "Deadlock Strategies"],
          ["results", "Results"],
          ["analysis", "Analysis"],
          ["lab", "Experiment Lab"],
        ].map(([id, label]) => (
          <button
            className={page === id ? "active" : ""}
            onClick={() => go(id)}
            key={id}
          >
            {label}
          </button>
        ))}
        <button className="reset-all-data" onClick={resetAllExperimentData}>
          Reset All Experiment Data
        </button>
      </nav>
      {page === "simulator" ? (
        <SimpleSimulator
          onDeadlock={setSnapshot}
          onScenario={setInitialScenario}
          onCompare={(snap) => {
            setSnapshot(snap);
            go("comparison");
          }}
        />
      ) : page === "comparison" ? (
        <RecoveryComparisonView
          snapshot={snapshot}
          savedRuns={results}
          onResults={(runs) => {
            setResults(runs);
          }}
          onViewResults={() => go("results")}
        />
      ) : page === "strategies" ? (
        <DeadlockStrategies
          initialScenario={initialScenario}
          savedRuns={strategyResults}
          onResults={setStrategyResults}
        />
      ) : page === "results" ? (
        <RecoveryResults runs={results} />
      ) : page === "analysis" ? (
        <Analysis
          snapshot={snapshot}
          recoveryRuns={results}
          strategyRuns={strategyResults}
        />
      ) : (
        <ExperimentLab manualScenario={initialScenario} />
      )}
    </div>
  );
}
