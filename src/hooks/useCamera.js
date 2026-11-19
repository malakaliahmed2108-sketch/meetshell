// =============================================================================
// src/hooks/useCamera.js
// =============================================================================
// A CUSTOM HOOK that owns ALL camera logic: listing devices, asking for
// permission with getUserMedia(), tracking the status, and releasing the camera.
// Components only call the functions it returns - they never touch
// navigator.mediaDevices themselves.
//
// useState  -> data that must re-draw the screen (status, stream, device list)
// useRef    -> values that must SURVIVE renders but must NOT re-draw the screen
//              (the live stream for cleanup, "request in progress" flag, ...)
// useEffect -> side effects: load devices, listen for plug/unplug, clean up
// =============================================================================

import { useState, useRef, useEffect, useCallback } from 'react'

// The six situations the UI must be able to describe.
export const CAMERA_STATUS = Object.freeze({
  OFF: 'off',
  REQUESTING: 'requesting',
  ON: 'on',
  DENIED: 'denied',
  NO_CAMERA: 'no-camera',
  ERROR: 'error',
})

// Friendly messages. The user never sees raw browser error names such as
// "NotAllowedError" - those are only written to the console for developers.
export const CAMERA_MESSAGES = Object.freeze({
  off: 'Camera is off. Choose a camera and press “Start camera”.',
  requesting: 'Waiting for camera permission… please click “Allow” in your browser.',
  on: 'Camera is on.',
  denied:
    'Camera permission was denied. Allow camera access in your browser’s address bar (or site settings) and try again.',
  'no-camera': 'No camera was found. Connect a camera and try again.',
  error: 'Something went wrong while starting the camera. Please try again.',
})

// Turns a browser error into { status, message } the interface can display.
function classifyError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return { status: CAMERA_STATUS.DENIED, message: CAMERA_MESSAGES.denied }

    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return { status: CAMERA_STATUS.NO_CAMERA, message: CAMERA_MESSAGES['no-camera'] }

    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      // The chosen deviceId no longer exists (e.g. the camera was unplugged).
      return {
        status: CAMERA_STATUS.NO_CAMERA,
        message: 'The selected camera is no longer available. Please choose another one.',
      }

    case 'NotReadableError':
    case 'TrackStartError':
      return {
        status: CAMERA_STATUS.ERROR,
        message: 'The camera could not be started. It may be in use by another application.',
      }

    default:
      return { status: CAMERA_STATUS.ERROR, message: CAMERA_MESSAGES.error }
  }
}

export function useCamera() {
  // ---- State: changes here must update the screen --------------------------
  const [camera, setCamera] = useState({
    status: CAMERA_STATUS.OFF,
    message: CAMERA_MESSAGES.off,
  })
  const [stream, setStream] = useState(null)          // the live MediaStream (or null)
  const [devices, setDevices] = useState([])          // available videoinput devices
  const [devicesLoaded, setDevicesLoaded] = useState(false)
  const [selectedDeviceId, setSelectedDeviceId] = useState('')

  // ---- Refs: values that must NOT trigger a re-render ----------------------
  const streamRef = useRef(null)     // same stream as `stream`, readable in cleanup code
  const pendingRef = useRef(false)   // true while a permission request is in progress
  const requestIdRef = useRef(0)     // identifies the CURRENT request (see startCamera)

  // Small helper to change status + message together.
  const update = useCallback((status, message = CAMERA_MESSAGES[status]) => {
    setCamera({ status, message })
  }, [])

  // Stops every track of the active stream. Stopping the tracks is what really
  // switches the camera (and its LED) off - merely hiding the <video> does not.
  const releaseStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setStream(null)
  }, [])

  // ---------------------------------------------------------------------------
  // Device list
  // ---------------------------------------------------------------------------
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setDevices([])
      setDevicesLoaded(true)
      return
    }
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      const cameras = all.filter((device) => device.kind === 'videoinput')
      setDevices(cameras)
      // Keep the current choice if it still exists, otherwise use the first camera.
      setSelectedDeviceId((current) =>
        cameras.some((c) => c.deviceId === current) ? current : (cameras[0]?.deviceId ?? ''),
      )
    } catch (error) {
      console.error('enumerateDevices failed:', error)
      setDevices([])
    } finally {
      setDevicesLoaded(true)
    }
  }, [])

  // ---------------------------------------------------------------------------
  // START
  // ---------------------------------------------------------------------------
  const startCamera = useCallback(
    async (deviceId = selectedDeviceId) => {
      // Block repeated requests while the permission prompt is still open.
      if (pendingRef.current) return

      if (!navigator.mediaDevices?.getUserMedia) {
        update(CAMERA_STATUS.ERROR, 'Your browser does not support camera access.')
        return
      }

      releaseStream() // never keep an old stream alive when starting a new one

      // Each request gets a number. If the user stops the camera (or the
      // component unmounts) before the request finishes, the number changes and
      // we know this answer is stale.
      const requestId = ++requestIdRef.current
      pendingRef.current = true
      update(CAMERA_STATUS.REQUESTING)

      try {
        const constraints = {
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        }
        const newStream = await navigator.mediaDevices.getUserMedia(constraints)

        // STALE REQUEST: the user cancelled while the browser was asking.
        // The camera has just been opened, so we must close it right away.
        if (requestId !== requestIdRef.current) {
          newStream.getTracks().forEach((track) => track.stop())
          return
        }

        streamRef.current = newStream
        setStream(newStream)
        update(CAMERA_STATUS.ON)

        // If the camera is unplugged while running, the track "ends" by itself.
        const [track] = newStream.getVideoTracks()
        track?.addEventListener('ended', () => {
          if (streamRef.current === newStream) {
            releaseStream()
            update(CAMERA_STATUS.ERROR, 'The camera was disconnected or stopped unexpectedly.')
          }
        })

        // Remember which device was really opened, then refresh the list:
        // after permission is granted the browser reveals device names.
        const usedId = track?.getSettings?.().deviceId
        if (usedId) setSelectedDeviceId(usedId)
        refreshDevices()
      } catch (error) {
        if (requestId !== requestIdRef.current) return // cancelled: ignore the error
        console.error('Camera error:', error) // raw details for developers only
        const { status, message } = classifyError(error)
        update(status, message)
      } finally {
        // Only the request that is still current may clear the flag.
        if (requestId === requestIdRef.current) pendingRef.current = false
      }
    },
    [selectedDeviceId, releaseStream, refreshDevices, update],
  )

  // ---------------------------------------------------------------------------
  // STOP (also used to cancel a pending request)
  // ---------------------------------------------------------------------------
  const stopCamera = useCallback(() => {
    requestIdRef.current += 1   // invalidates any request still waiting
    pendingRef.current = false
    releaseStream()
    setCamera((current) =>
      current.status === CAMERA_STATUS.OFF
        ? current
        : { status: CAMERA_STATUS.OFF, message: CAMERA_MESSAGES.off },
    )
  }, [releaseStream])

  // ---------------------------------------------------------------------------
  // CHANGE DEVICE: select a camera; if the camera is running, restart with it.
  // ---------------------------------------------------------------------------
  const selectDevice = useCallback(
    (deviceId) => {
      if (pendingRef.current) return
      setSelectedDeviceId(deviceId)
      if (streamRef.current) startCamera(deviceId) // restart with the new device
    },
    [startCamera],
  )

  // ---------------------------------------------------------------------------
  // EFFECTS
  // ---------------------------------------------------------------------------
  // 1) Load the device list once and keep it updated when cameras are plugged
  //    in or removed.
  useEffect(() => {
    refreshDevices()
    const media = navigator.mediaDevices
    media?.addEventListener?.('devicechange', refreshDevices)
    return () => media?.removeEventListener?.('devicechange', refreshDevices)
  }, [refreshDevices])

  // 2) UNMOUNT CLEANUP: when the component that uses this hook disappears,
  //    cancel any pending request and stop every track.
  useEffect(() => {
    return () => {
      requestIdRef.current += 1
      pendingRef.current = false
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
    }
  }, [])

  // "No camera" is DERIVED: if the camera is off and the browser reports zero
  // cameras, show that message instead of the generic "off" one.
  const noDevices = devicesLoaded && devices.length === 0
  const status =
    camera.status === CAMERA_STATUS.OFF && noDevices ? CAMERA_STATUS.NO_CAMERA : camera.status
  const message =
    status !== camera.status ? CAMERA_MESSAGES[CAMERA_STATUS.NO_CAMERA] : camera.message

  return {
    stream,
    status,
    message,
    devices,
    selectedDeviceId,
    hasCamera: !noDevices,
    startCamera,
    stopCamera,
    selectDevice,
  }
}