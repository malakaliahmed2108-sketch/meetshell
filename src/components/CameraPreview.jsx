// =============================================================================
// src/components/CameraPreview.jsx
// =============================================================================
// Presentational component: it receives the stream, the status and callbacks
// as PROPS. It owns no camera logic - only the <video> element (through a ref)
// and the controls (dropdown + start/stop button + status message).
// =============================================================================

import { useEffect, useRef } from 'react'
import { CAMERA_STATUS } from '../hooks/useCamera.js'

export default function CameraPreview({
  stream,
  status,
  message,
  devices,
  selectedDeviceId,
  hasCamera,
  onStart,
  onStop,
  onSelectDevice,
}) {
  const videoRef = useRef(null)

  // A <video> cannot receive a stream through JSX attributes: we must assign
  // the DOM property `srcObject` ourselves, after React has drawn the element.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return undefined
    video.srcObject = stream
    // Cleanup: detach the stream when it changes or this component unmounts,
    // so the element never keeps a reference to a stopped camera.
    return () => {
      video.srcObject = null
    }
  }, [stream])

  const isOn = status === CAMERA_STATUS.ON
  const isRequesting = status === CAMERA_STATUS.REQUESTING
  const needsPermissionHint = devices.some((device) => !device.deviceId)

  // While a request is pending the button becomes "Cancel request".
  // Start is blocked, so the permission prompt can never be opened twice.
  let buttonLabel = 'Start camera'
  if (isOn) buttonLabel = 'Stop camera'
  if (isRequesting) buttonLabel = 'Cancel request'

  return (
    <div className="camera">
      <div className="camera__controls">
        <label className="field camera__select">
          <span className="field__label">Camera device</span>
          <select
            value={selectedDeviceId}
            disabled={!hasCamera || isRequesting}
            onChange={(event) => onSelectDevice(event.target.value)}
          >
            {devices.length === 0 && <option value="">No cameras found</option>}
            {devices.map((device, index) => (
              <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className={`btn ${isOn || isRequesting ? 'btn--danger' : 'btn--primary'}`}
          disabled={!hasCamera}
          onClick={isOn || isRequesting ? onStop : () => onStart()}
        >
          {buttonLabel}
        </button>
      </div>

      {needsPermissionHint && (
        <p className="panel__text">
          Camera names appear after you allow camera access for the first time.
        </p>
      )}

      {/* role="status" (or "alert" for problems) lets screen readers announce changes. */}
      <p
        className={`camera__status camera__status--${status}`}
        role={isOn || isRequesting || status === CAMERA_STATUS.OFF ? 'status' : 'alert'}
      >
        {isRequesting && <span className="spinner spinner--small" aria-hidden="true" />}
        {message}
      </p>

      {/* CONDITIONAL RENDERING: the live preview only exists while the camera is on. */}
      {isOn ? (
        <video
          ref={videoRef}
          className="camera__video"
          autoPlay
          playsInline
          muted
          aria-label="Live camera preview"
        />
      ) : (
        <div className="camera__placeholder" aria-hidden="true">
          <span>📷</span>
        </div>
      )}
    </div>
  )
}