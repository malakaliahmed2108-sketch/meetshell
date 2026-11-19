import { useEffect, useState } from "react";
import { gatherCandidates } from "../lib/gatherCandidates";

// Use the CONFIGS object from your lab if it differs from this one.
const CONFIGS = {
  none: [],
  stun: [{ urls: "stun:stun.l.google.com:19302" }],
  wrong: [{ urls: "stun:stun.invalid:3478" }],
};

const TYPE_COLORS = {
  host: "#d6ecff",
  srflx: "#ffe3c2",
  relay: "#e2f5d8",
  prflx: "#eee",
};

export default function CandidatePanel() {
  const [configName, setConfigName] = useState("stun");
  const [candidates, setCandidates] = useState([]);
  const [gatheringState, setGatheringState] = useState("new");
  const [elapsedMs, setElapsedMs] = useState(null);

  const iceServers = CONFIGS[configName];

  useEffect(() => {
    // empty the table and reset the run
    setCandidates([]);
    setGatheringState("new");
    setElapsedMs(null);

    const start = performance.now();

    const stop = gatherCandidates({
      iceServers,
      onCandidate: (c) => {
        // new array each time (no push)
        setCandidates((prev) => [...prev, c]);
      },
      onDone: () => {
        setElapsedMs(Math.round(performance.now() - start));
      },
      onStateChange: setGatheringState,
    });

    // cleanup: closes the old connection before a new one opens
    return stop;
  }, [iceServers]);

  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);

  return (
    <div>
      <h2>Candidate Gathering Panel</h2>

      <label>
        Configuration:{" "}
        <select value={configName} onChange={(e) => setConfigName(e.target.value)}>
          {Object.keys(CONFIGS).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <p>
        Gathering state: <strong>{gatheringState}</strong> | Gathering time:{" "}
        <strong>{elapsedMs === null ? "…" : `${elapsedMs} ms`}</strong>
      </p>

      <table border="1" cellPadding="6">
        <thead>
          <tr>
            <th>Type</th>
            <th>Protocol</th>
            <th>Address : Port</th>
            <th>Priority</th>
            <th>Foundation</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr
              key={`${c.type}-${c.protocol}-${c.address}-${c.port}`}
              style={{ background: TYPE_COLORS[c.type], color: "#000" }}
            >
              <td>{c.type}</td>
              <td>{c.protocol}</td>
              <td>
                {c.address} : {c.port}
              </td>
              <td>{c.priority}</td>
              <td>{c.foundation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}