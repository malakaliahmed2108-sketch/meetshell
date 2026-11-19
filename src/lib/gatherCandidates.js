// Plain JavaScript, no React.
export function gatherCandidates({ iceServers, onCandidate, onDone, onStateChange }) {
  const pc = new RTCPeerConnection({ iceServers });
  let closed = false;

  pc.createDataChannel("probe");

  pc.addEventListener("icegatheringstatechange", () => {
    if (!closed && onStateChange) onStateChange(pc.iceGatheringState);
  });

  pc.addEventListener("icecandidate", (event) => {
    if (closed) return;
    if (event.candidate) {
      onCandidate(event.candidate);
    } else {
      // null candidate = gathering finished
      onDone();
    }
  });

  pc.createOffer()
    .then((offer) => pc.setLocalDescription(offer))
    .catch((err) => console.error("gatherCandidates failed:", err));

  // stop function
  return () => {
    closed = true;
    pc.close();
  };
}