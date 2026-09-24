let previewStream: MediaStream | undefined

export type PreviewMediaKind = 'audio' | 'video'

export function previewMediaEnabled(kind: PreviewMediaKind) {
  const tracks = kind === 'audio' ? previewStream?.getAudioTracks() : previewStream?.getVideoTracks()
  return Boolean(tracks?.some((track) => track.readyState === 'live' && track.enabled))
}

export async function enablePreviewMedia(kind: PreviewMediaKind, deviceId?: string, noiseSuppression = true) {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Media devices are unavailable')
  const captured = await navigator.mediaDevices.getUserMedia(kind === 'audio'
    ? {
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression,
        },
        video: false,
      }
    : {
        audio: false,
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
      })
  const track = (kind === 'audio' ? captured.getAudioTracks() : captured.getVideoTracks())[0]
  if (!track) {
    captured.getTracks().forEach((item) => item.stop())
    throw new Error(`No ${kind} track was returned`)
  }

  previewStream ??= new MediaStream()
  const oldTracks = kind === 'audio' ? previewStream.getAudioTracks() : previewStream.getVideoTracks()
  oldTracks.forEach((oldTrack) => {
    previewStream?.removeTrack(oldTrack)
    oldTrack.stop()
  })
  previewStream.addTrack(track)
  captured.getTracks().filter((item) => item !== track).forEach((item) => item.stop())
  return previewStream
}

export function disablePreviewMedia(kind: PreviewMediaKind) {
  const tracks = kind === 'audio' ? previewStream?.getAudioTracks() : previewStream?.getVideoTracks()
  tracks?.forEach((track) => {
    previewStream?.removeTrack(track)
    track.stop()
  })
  if (previewStream?.getTracks().length === 0) previewStream = undefined
}

export function getPreviewMediaStream() {
  return previewStream
}

export function takePreviewMediaStream() {
  const stream = previewStream
  previewStream = undefined
  return stream
}
