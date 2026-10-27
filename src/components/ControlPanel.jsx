import {
  Play,
  Pause,
  StepForward,
  RotateCcw,
  Shuffle,
  Volume2,
  VolumeX,
  Presentation,
} from "lucide-react";
export default function ControlPanel({
  running,
  onStart,
  onPause,
  onStep,
  onReset,
  onGenerate,
  speed,
  setSpeed,
  mode,
  setMode,
  sound,
  setSound,
  presentation,
  setPresentation,
}) {
  return (
    <div className="controls">
      <button className="primary" onClick={onStart}>
        <Play size={16} /> Start
      </button>
      <button onClick={onPause}>
        <Pause size={16} /> Pause
      </button>
      <button onClick={onStep}>
        <StepForward size={16} /> Step
      </button>
      <span className="control-sep" />
      <button onClick={onReset}>
        <RotateCcw size={15} /> Reset
      </button>
      <button onClick={onGenerate}>
        <Shuffle size={15} /> Generate
      </button>
      <label>
        Algorithm
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="basic">Basic — 1 Cell</option>
          <option value="fixed">Fixed — 2 Cells</option>
          <option value="adaptive">Adaptive — ALAR</option>
        </select>
      </label>
      <label className="secondary-setting">
        Speed
        <select
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
        >
          <option value="3000">3 seconds</option>
          <option value="4000">4 seconds</option>
          <option value="5000">5 seconds</option>
          <option value="0">Manual Step</option>
        </select>
      </label>
      <button
        className="icon-control"
        onClick={() => setSound(!sound)}
        title={`Sound ${sound ? "on" : "off"}`}
      >
        {sound ? <Volume2 size={15} /> : <VolumeX size={15} />} Sound{" "}
        {sound ? "On" : "Off"}
      </button>
      <button
        className={`icon-control ${presentation ? "active" : ""}`}
        onClick={() => setPresentation(!presentation)}
      >
        <Presentation size={15} /> Present
      </button>
      <i className={running ? "live" : ""} />
    </div>
  );
}
