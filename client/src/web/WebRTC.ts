import Peer from 'peerjs'
import Network from '../services/Network'
import store from '../stores'
import { setVideoConnected, setMicEnabled, setCameraEnabled } from '../stores/UserStore'

export default class WebRTC {
  private myPeer: Peer
  private peerIsOpen = false
  private peers = new Map<string, { call: Peer.MediaConnection; video: HTMLVideoElement; audio: HTMLAudioElement }>()
  private onCalledPeers = new Map<string, { call: Peer.MediaConnection; video: HTMLVideoElement; audio: HTMLAudioElement }>()
  private videoGrid: HTMLElement
  private myVideo = document.createElement('video')
  private myStream?: MediaStream
  private placeholderVideoTrack?: MediaStreamTrack
  private cameraSourceTrack?: MediaStreamTrack
  private cameraSourceVideo?: HTMLVideoElement
  private cameraCanvas?: HTMLCanvasElement
  private cameraCaptureStream?: MediaStream
  private cameraFrameHandle?: number
  private placeholderAudioTrack?: MediaStreamTrack
  private placeholderAudioContext?: AudioContext
  private mediaAnnounced = false
  private cameraEnabled = false
  private network: Network
  private selfViewHidden = false
  private cameraMirrored = false
  private currentCameraId?: string
  private currentMicId?: string
  private screenShareStream?: MediaStream
  private screenShareOutputStream?: MediaStream
  private screenShareOutputTrack?: MediaStreamTrack
  private screenShareCanvas?: HTMLCanvasElement
  private screenShareVideo?: HTMLVideoElement
  private screenShareCameraVideo?: HTMLVideoElement
  private screenShareCameraTrack?: MediaStreamTrack
  private screenShareFrameHandle?: number
  private cameraEnabledBeforeScreenShare = false
  private nearbyVolume = 0.8
  private playerProximity = new Map<string, number>()
  private participantVolumes = new Map<string, number>()
  private locallyMutedPlayers = new Set<string>()
  private locallyHiddenCameras = new Set<string>()
  private voiceAudioContext?: AudioContext
  private voiceAnalyzers = new Map<string, {
    analyser: AnalyserNode
    source: MediaStreamAudioSourceNode
    samples: Uint8Array
    speaking: boolean
    lastVoiceAt: number
  }>()
  private voiceMeterInterval?: number
  private boundUserId: string

  constructor(userId: string, network: Network) {
    const sanitizedId = this.replaceInvalidId(userId)
    this.myPeer = new Peer(sanitizedId)
    this.boundUserId = userId
    this.network = network
    this.videoGrid = document.querySelector<HTMLElement>('.video-grid') ?? document.createElement('div')
    this.videoGrid.classList.add('video-grid')
    if (!this.videoGrid.isConnected) document.body.append(this.videoGrid)
    this.myPeer.on('open', () => { this.peerIsOpen = true })
    this.myPeer.on('error', (err) => {
      console.error(err)
    })

    // mute your own video stream (you don't want to hear yourself)
    this.myVideo.muted = true
    this.styleFloatingVideo(this.myVideo)

    // config peerJS
    this.initialize()
  }

  // PeerJS throws invalid_id error if it contains some characters such as that colyseus generates.
  // https://peerjs.com/docs.html#peer-id
  private replaceInvalidId(userId: string) {
    return userId.replace(/[^0-9a-z]/gi, 'G')
  }

  initialize() {
    this.myPeer.on('call', (call) => {
      if (!this.onCalledPeers.has(call.peer)) {
        this.myStream ??= new MediaStream()
        this.ensureOutgoingVideoTrack()
        this.ensureOutgoingAudioTrack()
        call.answer(this.outgoingStream())
        const video = document.createElement('video')
        const audio = document.createElement('audio')
        this.onCalledPeers.set(call.peer, { call, video, audio })

        call.on('stream', (userVideoStream) => {
          const playerId = this.network.sessionIdForPeer(call.peer)
          this.addVideoStream(video, userVideoStream, playerId)
          this.addAudioStream(audio, userVideoStream, playerId)
        })
        const clearIncomingCall = () => {
          const playerId = this.network.sessionIdForPeer(call.peer)
          if (this.onCalledPeers.get(call.peer)?.call !== call) return
          this.deleteOnCalledVideoStream(playerId)
        }
        call.on('error', clearIncomingCall)
        call.on('close', clearIncomingCall)
      }
      // on close is triggered manually with deleteOnCalledVideoStream()
    })
  }

  async getUserMedia(alertOnError = true): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        video: false,
      })
      this.myStream ??= new MediaStream()
      const newTrack = stream.getAudioTracks()[0]
      if (!newTrack) return false
      const oldTrack = this.myStream.getAudioTracks()[0]
      if (oldTrack) {
        oldTrack.stop()
        this.myStream.removeTrack(oldTrack)
      }
      this.placeholderAudioTrack = undefined
      this.myStream.addTrack(newTrack)
      this.watchVoiceActivity(this.network.mySessionId, this.myStream)
      this.currentMicId = newTrack.getSettings().deviceId
      this.ensureOutgoingVideoTrack()
      this.replaceTrackInPeers('audio', newTrack)
      const previewStream = this.screenShareStream || this.myStream
      this.myVideo.srcObject = previewStream
      this.addVideoStream(this.myVideo, previewStream)
      this.cameraEnabled = Boolean(this.screenShareStream) || this.hasCameraTrack
      this.setCameraEnabled(this.network.mySessionId, this.cameraEnabled)
      store.dispatch(setMicEnabled(true))
      this.network.updateMicrophoneState(true)
      store.dispatch(setCameraEnabled(this.cameraEnabled))
      this.network.updateCameraState(this.cameraEnabled)
      this.announceMediaReady()
      return true
    } catch (error) {
      if (alertOnError) window.alert('Microphone unavailable or permission was denied')
      return false
    }
  }

  reconnectAs(userId: string) {
    if (this.boundUserId === userId) return
    this.stopVoiceActivity(this.boundUserId)
    this.peers.forEach(({ call, video, audio }) => {
      call.close()
      video.remove()
      audio.remove()
    })
    this.peers.clear()
    this.onCalledPeers.forEach(({ call, video, audio }) => {
      call.close()
      video.remove()
      audio.remove()
    })
    this.onCalledPeers.clear()
    if (!this.myPeer.destroyed) this.myPeer.destroy()
    this.peerIsOpen = false
    this.myPeer = new Peer(this.replaceInvalidId(userId))
    this.myPeer.on('open', () => { this.peerIsOpen = true })
    this.myPeer.on('error', (error) => console.error(error))
    this.boundUserId = userId
    this.initialize()
    this.setCameraEnabled(userId, this.cameraEnabled)
    if (this.myStream) this.watchVoiceActivity(userId, this.myStream)
  }

  async getCameraMedia(deviceId?: string): Promise<boolean> {
    try {
      const video = deviceId ? { deviceId: { exact: deviceId } } : true
      const cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video })
      const newTrack = cameraStream.getVideoTracks()[0]
      if (!newTrack) return false

      this.myStream ??= new MediaStream()
      await this.installCameraTrack(newTrack)
      this.ensureOutgoingAudioTrack()
      this.currentCameraId = newTrack.getSettings().deviceId
      if (this.screenShareStream) this.keepScreenShareOutput()
      else {
        this.myVideo.srcObject = this.myStream
        this.addVideoStream(this.myVideo, this.myStream)
      }
      this.cameraEnabled = true
      this.setCameraEnabled(this.network.mySessionId, true)
      store.dispatch(setCameraEnabled(true))
      this.announceMediaReady()
      this.network.updateCameraState(true)
      return true
    } catch (error) {
      console.warn('Unable to access camera', error)
      return false
    }
  }

  async adoptPrejoinMedia(stream: MediaStream) {
    this.myStream ??= new MediaStream()
    const audio = stream.getAudioTracks().find((track) => track.readyState === 'live')
    const video = stream.getVideoTracks().find((track) => track.readyState === 'live')

    if (audio) {
      this.placeholderAudioTrack?.stop()
      this.placeholderAudioTrack = undefined
      this.myStream.getAudioTracks().forEach((old) => { this.myStream?.removeTrack(old); old.stop() })
      this.myStream.addTrack(audio)
      this.watchVoiceActivity(this.network.mySessionId, this.myStream)
      this.currentMicId = audio.getSettings().deviceId
      this.replaceTrackInPeers('audio', audio)
    }
    if (video) {
      this.placeholderVideoTrack?.stop()
      this.placeholderVideoTrack = undefined
      await this.installCameraTrack(video)
      this.currentCameraId = video.getSettings().deviceId
    }

    this.ensureOutgoingAudioTrack()
    this.ensureOutgoingVideoTrack()
    this.cameraEnabled = Boolean(video)
    this.myVideo.srcObject = this.myStream
    this.addVideoStream(this.myVideo, this.myStream)
    store.dispatch(setMicEnabled(Boolean(audio)))
    store.dispatch(setCameraEnabled(Boolean(video)))
    this.setCameraEnabled(this.network.mySessionId, Boolean(video))
    this.network.updateMicrophoneState(Boolean(audio))
    this.network.updateCameraState(Boolean(video))
    this.announceMediaReady()
  }

  prepareMutedMeeting() {
    this.stopVoiceActivity(this.network.mySessionId)
    this.myStream ??= new MediaStream()
    this.myStream.getAudioTracks().forEach((track) => {
      if (track !== this.placeholderAudioTrack) {
        this.myStream?.removeTrack(track)
        track.stop()
      }
    })
    this.myStream.getVideoTracks().forEach((track) => {
      if (track !== this.placeholderVideoTrack) {
        this.myStream?.removeTrack(track)
        track.stop()
      }
    })
    this.stopCameraProcessor()
    this.ensureOutgoingAudioTrack()
    this.ensureOutgoingVideoTrack()
    const audioTrack = this.placeholderAudioTrack
    const videoTrack = this.placeholderVideoTrack
    if (audioTrack) this.replaceTrackInPeers('audio', audioTrack)
    if (videoTrack) this.replaceTrackInPeers('video', videoTrack)
    this.cameraEnabled = false
    this.myVideo.srcObject = this.myStream
    this.addVideoStream(this.myVideo, this.myStream)
    this.setCameraEnabled(this.network.mySessionId, false)
    store.dispatch(setMicEnabled(false))
    store.dispatch(setCameraEnabled(false))
    this.network.updateMicrophoneState(false)
    this.network.updateCameraState(false)
    this.announceMediaReady()
  }

  async startMeetingScreenShare(): Promise<boolean> {
    if (this.screenShareStream) return true
    const embeddedBrowser = (() => {
      try { return window.top !== window.self } catch { return true }
    })()
    if (embeddedBrowser) {
      throw new Error('Este navegador interno não permite captura de tela. Abra o SkyOffice diretamente no Chrome ou Edge.')
    }
    if (!window.isSecureContext) {
      throw new Error('O compartilhamento de tela exige uma conexão segura (HTTPS).')
    }
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getDisplayMedia !== 'function') {
      throw new Error('Este navegador não oferece compartilhamento de tela. Tente usar Chrome ou Edge no computador.')
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const track = stream.getVideoTracks()[0]
      if (!track) throw new Error('Nenhuma tela foi escolhida para compartilhar.')
      this.screenShareStream = stream
      // Keep one outgoing video track for PeerJS, but compose the screen and
      // camera into it so every participant can see both without a room-wide
      // limit on simultaneous sharers.
      await this.createScreenShareOutput(stream)
      this.cameraEnabledBeforeScreenShare = store.getState().user.cameraEnabled
      this.keepScreenShareOutput()
      this.cameraEnabled = true
      this.setCameraEnabled(this.network.mySessionId, true)
      store.dispatch(setCameraEnabled(true))
      this.network.updateCameraState(true)
      track.onended = () => this.stopMeetingScreenShare()
      return true
    } catch (error) {
      console.warn('Unable to share screen in meeting', error)
      if (error instanceof Error && error.message !== 'Nenhuma tela foi escolhida para compartilhar.') {
        const errorName = (error as DOMException).name
        if (errorName === 'NotAllowedError' || errorName === 'SecurityError') {
          throw new Error('O navegador bloqueou a captura. Abra o SkyOffice no Chrome ou Edge, clique no cadeado do site e permita o compartilhamento de tela.')
        }
        if (errorName === 'AbortError') {
          throw new Error('O compartilhamento foi cancelado antes de escolher uma tela.')
        }
        if (errorName === 'NotReadableError') {
          throw new Error('A tela escolhida está sendo usada por outro programa. Escolha outra tela ou janela.')
        }
        if (errorName === 'InvalidStateError') {
          throw new Error('Abra o compartilhamento a partir do botão da reunião e tente novamente.')
        }
      }
      throw error instanceof Error ? error : new Error('Não foi possível acessar a captura de tela.')
    }
  }

  stopMeetingScreenShare() {
    if (!this.screenShareStream) return
    const screenStream = this.screenShareStream
    this.screenShareStream = undefined
    this.stopScreenShareOutput()
    screenStream.getTracks().forEach((track) => track.stop())
    const cameraTrack = this.myStream?.getVideoTracks()[0]
    if (cameraTrack) this.replaceTrackInPeers('video', cameraTrack)
    if (this.myStream) {
      this.myVideo.srcObject = this.myStream
      this.addVideoStream(this.myVideo, this.myStream)
    }
    this.cameraEnabled = this.cameraEnabledBeforeScreenShare
    this.setCameraEnabled(this.network.mySessionId, this.cameraEnabled)
    store.dispatch(setCameraEnabled(this.cameraEnabled))
    this.network.updateCameraState(this.cameraEnabled)
  }

  private ensureOutgoingVideoTrack() {
    if (!this.myStream || this.myStream.getVideoTracks().length > 0) return
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 2
    const context = canvas.getContext('2d')
    context?.fillRect(0, 0, canvas.width, canvas.height)
    const placeholder = canvas.captureStream(1).getVideoTracks()[0]
    if (placeholder) {
      this.placeholderVideoTrack = placeholder
      this.myStream.addTrack(placeholder)
    }
  }

  // Keep the camera in myStream so it can be restored when sharing ends, but
  // send the shared screen to every new PeerJS connection while it is active.
  private outgoingStream(): MediaStream {
    if (!this.myStream || !this.screenShareStream) return this.myStream ?? new MediaStream()
    const stream = new MediaStream()
    this.myStream.getAudioTracks().forEach((track) => stream.addTrack(track))
    const screenTrack = this.screenShareOutputTrack || this.screenShareStream.getVideoTracks()[0]
    if (screenTrack) stream.addTrack(screenTrack)
    return stream
  }

  private keepScreenShareOutput() {
    const screenTrack = this.screenShareOutputTrack || this.screenShareStream?.getVideoTracks()[0]
    if (!screenTrack) return
    this.replaceTrackInPeers('video', screenTrack)
    const previewStream = this.screenShareOutputStream || this.screenShareStream
    this.myVideo.srcObject = previewStream ?? null
    if (previewStream) this.addVideoStream(this.myVideo, previewStream)
    // The outgoing video is still the shared screen even when the local
    // camera track is being toggled independently.
    this.cameraEnabled = true
  }

  private async createScreenShareOutput(screenStream: MediaStream): Promise<MediaStreamTrack | undefined> {
    const screenTrack = screenStream.getVideoTracks()[0]
    if (!screenTrack || typeof document === 'undefined') return undefined
    const canvas = document.createElement('canvas')
    const settings = screenTrack.getSettings()
    const sourceWidth = Number(settings.width) || 1280
    const sourceHeight = Number(settings.height) || 720
    const scale = Math.min(1, 1920 / sourceWidth)
    canvas.width = Math.max(640, Math.round(sourceWidth * scale))
    canvas.height = Math.max(360, Math.round(sourceHeight * scale))
    const context = canvas.getContext('2d')
    const capture = canvas.captureStream?.(30)
    const outputTrack = capture?.getVideoTracks()[0]
    if (!context || !capture || !outputTrack) return undefined

    const screenVideo = document.createElement('video')
    screenVideo.muted = true
    screenVideo.autoplay = true
    screenVideo.playsInline = true
    screenVideo.srcObject = new MediaStream([screenTrack])
    screenVideo.style.position = 'fixed'
    screenVideo.style.left = '-10000px'
    screenVideo.style.top = '0'
    screenVideo.style.width = '1px'
    screenVideo.style.height = '1px'
    screenVideo.style.opacity = '0'
    document.body.append(screenVideo)
    void screenVideo.play().catch(() => undefined)

    const cameraVideo = document.createElement('video')
    cameraVideo.muted = true
    cameraVideo.autoplay = true
    cameraVideo.playsInline = true
    cameraVideo.style.position = 'fixed'
    cameraVideo.style.left = '-10000px'
    cameraVideo.style.top = '0'
    cameraVideo.style.width = '1px'
    cameraVideo.style.height = '1px'
    cameraVideo.style.opacity = '0'
    document.body.append(cameraVideo)

    this.screenShareCanvas = canvas
    this.screenShareOutputStream = capture
    this.screenShareOutputTrack = outputTrack
    this.screenShareVideo = screenVideo
    this.screenShareCameraVideo = cameraVideo

    const drawFrame = () => {
      if (!this.screenShareCanvas || !this.screenShareVideo || !this.screenShareOutputStream) return
      const width = this.screenShareCanvas.width
      const height = this.screenShareCanvas.height
      context.fillStyle = '#090b10'
      context.fillRect(0, 0, width, height)
      if (screenVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && screenVideo.videoWidth > 0) {
        const fit = Math.min(width / screenVideo.videoWidth, height / screenVideo.videoHeight)
        const drawWidth = screenVideo.videoWidth * fit
        const drawHeight = screenVideo.videoHeight * fit
        context.drawImage(screenVideo, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
      }

      const cameraTrack = this.myStream?.getVideoTracks().find((track) => track !== this.placeholderVideoTrack)
      if (cameraTrack !== this.screenShareCameraTrack) {
        this.screenShareCameraTrack = cameraTrack
        cameraVideo.srcObject = cameraTrack ? new MediaStream([cameraTrack]) : null
        if (cameraTrack) void cameraVideo.play().catch(() => undefined)
      }
      if (cameraTrack?.enabled && cameraTrack.readyState === 'live' && cameraVideo.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && cameraVideo.videoWidth > 0) {
        const margin = Math.max(16, Math.round(width * .018))
        const cameraWidth = Math.min(320, Math.max(180, Math.round(width * .22)))
        const cameraHeight = Math.round(cameraWidth * 9 / 16)
        const cameraX = width - cameraWidth - margin
        const cameraY = height - cameraHeight - margin
        context.fillStyle = '#11151d'
        context.fillRect(cameraX - 4, cameraY - 4, cameraWidth + 8, cameraHeight + 8)
        context.drawImage(cameraVideo, cameraX, cameraY, cameraWidth, cameraHeight)
        context.strokeStyle = '#05bdbA'
        context.lineWidth = 4
        context.strokeRect(cameraX, cameraY, cameraWidth, cameraHeight)
      }
      this.screenShareFrameHandle = requestAnimationFrame(drawFrame)
    }
    this.screenShareFrameHandle = requestAnimationFrame(drawFrame)
    return outputTrack
  }

  private stopScreenShareOutput() {
    if (this.screenShareFrameHandle !== undefined) cancelAnimationFrame(this.screenShareFrameHandle)
    this.screenShareFrameHandle = undefined
    this.screenShareOutputStream?.getTracks().forEach((track) => track.stop())
    this.screenShareOutputStream = undefined
    this.screenShareOutputTrack = undefined
    this.screenShareCanvas = undefined
    this.screenShareCameraTrack = undefined
    this.screenShareVideo?.pause()
    if (this.screenShareVideo) {
      this.screenShareVideo.srcObject = null
      this.screenShareVideo.remove()
    }
    this.screenShareVideo = undefined
    this.screenShareCameraVideo?.pause()
    if (this.screenShareCameraVideo) {
      this.screenShareCameraVideo.srcObject = null
      this.screenShareCameraVideo.remove()
    }
    this.screenShareCameraVideo = undefined
  }

  // Draw camera frames into a horizontally flipped canvas and publish the
  // resulting track. This makes the local preview and every remote view agree.
  private async createFlippedCameraTrack(sourceTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.srcObject = new MediaStream([sourceTrack])
    video.style.position = 'fixed'
    video.style.left = '-10000px'
    video.style.top = '0'
    document.body.append(video)
    try {
      await video.play()
      if (!video.videoWidth || !video.videoHeight) {
        await new Promise<void>((resolve) => {
          video.addEventListener('loadedmetadata', () => resolve(), { once: true })
        })
      }
      const canvas = document.createElement('canvas')
      const settings = sourceTrack.getSettings()
      canvas.width = video.videoWidth || settings.width || 640
      canvas.height = video.videoHeight || settings.height || 360
      const context = canvas.getContext('2d')
      if (!context || !canvas.captureStream) throw new Error('Camera flip is unavailable')
      const captured = canvas.captureStream(30)
      const flippedTrack = captured.getVideoTracks()[0]
      if (!flippedTrack) throw new Error('Could not create flipped camera track')

      this.stopCameraProcessor()
      this.cameraSourceTrack = sourceTrack
      this.cameraSourceVideo = video
      this.cameraCanvas = canvas
      this.cameraCaptureStream = captured
      const drawFrame = () => {
        if (sourceTrack.readyState !== 'live' || !this.cameraCanvas || !this.cameraSourceVideo) return
        context.save()
        context.translate(canvas.width, 0)
        context.scale(-1, 1)
        context.drawImage(video, 0, 0, canvas.width, canvas.height)
        context.restore()
        this.cameraFrameHandle = requestAnimationFrame(drawFrame)
      }
      drawFrame()
      return flippedTrack
    } catch (error) {
      video.remove()
      console.warn('Unable to flip camera video; using the original camera track', error)
      return sourceTrack
    }
  }

  private async installCameraTrack(sourceTrack: MediaStreamTrack) {
    this.myStream ??= new MediaStream()
    const shouldBeEnabled = sourceTrack.enabled
    sourceTrack.enabled = true
    const transformedTrack = this.cameraMirrored ? await this.createFlippedCameraTrack(sourceTrack) : sourceTrack
    if (!this.cameraMirrored) this.stopCameraProcessor()
    transformedTrack.enabled = shouldBeEnabled
    const oldTrack = this.myStream.getVideoTracks()[0]
    if (oldTrack) {
      this.myStream.removeTrack(oldTrack)
      if (oldTrack !== this.placeholderVideoTrack) oldTrack.stop()
    }
    this.cameraSourceTrack = transformedTrack === sourceTrack ? undefined : sourceTrack
    this.placeholderVideoTrack = undefined
    this.myStream.addTrack(transformedTrack)
    if (transformedTrack !== sourceTrack) this.replaceTrackInPeers('video', transformedTrack)
    else this.replaceTrackInPeers('video', sourceTrack)
  }

  private stopCameraProcessor(stopSourceTrack = true) {
    if (this.cameraFrameHandle !== undefined) cancelAnimationFrame(this.cameraFrameHandle)
    this.cameraFrameHandle = undefined
    this.cameraCaptureStream?.getTracks().forEach((track) => track.stop())
    this.cameraCaptureStream = undefined
    this.cameraSourceVideo?.pause()
    if (this.cameraSourceVideo) {
      this.cameraSourceVideo.srcObject = null
      this.cameraSourceVideo.remove()
    }
    this.cameraSourceVideo = undefined
    this.cameraCanvas = undefined
    if (stopSourceTrack) this.cameraSourceTrack?.stop()
    this.cameraSourceTrack = undefined
  }

  private ensureOutgoingAudioTrack() {
    if (!this.myStream || this.myStream.getAudioTracks().length > 0) return
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const silentGain = context.createGain()
    const destination = context.createMediaStreamDestination()
    silentGain.gain.value = 0
    oscillator.connect(silentGain)
    silentGain.connect(destination)
    oscillator.start()
    this.placeholderAudioContext = context
    this.placeholderAudioTrack = destination.stream.getAudioTracks()[0]
    if (this.placeholderAudioTrack) this.myStream.addTrack(this.placeholderAudioTrack)
  }

  private announceMediaReady() {
    if (this.mediaAnnounced) return
    this.mediaAnnounced = true
    store.dispatch(setVideoConnected(true))
    this.network.videoConnected()
  }

  // list available cameras and microphones for the device-picker menus.
  // labels are only populated by the browser once permission has been granted once.
  async listDevices(): Promise<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }> {
    const devices = await navigator.mediaDevices.enumerateDevices()
    return {
      cameras: devices.filter((d) => d.kind === 'videoinput'),
      mics: devices.filter((d) => d.kind === 'audioinput'),
    }
  }

  get activeCameraId(): string | undefined {
    return this.currentCameraId
  }

  get activeMicId(): string | undefined {
    return this.currentMicId
  }

  // replace the outgoing video/audio track on every live call, so switching devices
  // mid-conversation updates what the other person sees/hears without a reconnect
  private replaceTrackInPeers(kind: 'video' | 'audio', newTrack: MediaStreamTrack) {
    const allConnections = [...this.peers.values(), ...this.onCalledPeers.values()]
    allConnections.forEach(({ call }) => {
      const peerConnection = (call as any).peerConnection as RTCPeerConnection | undefined
      const sender = peerConnection?.getSenders().find((s) => s.track && s.track.kind === kind)
      sender?.replaceTrack(newTrack)
    })
  }

  // switch to a different camera by device id, keeping the same mic and any ongoing calls
  async switchCamera(deviceId: string): Promise<boolean> {
    if (!this.hasCameraTrack) {
      return this.getCameraMedia(deviceId)
    }
    const currentStream = this.myStream
    if (!currentStream) return false
    const wasEnabled = currentStream.getVideoTracks()[0]?.enabled ?? true
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
      })
      const newTrack = newStream.getVideoTracks()[0]
      if (!newTrack) return false
      newTrack.enabled = wasEnabled
      await this.installCameraTrack(newTrack)

      if (this.screenShareStream) this.keepScreenShareOutput()
      else {
        this.myVideo.srcObject = currentStream
        this.addVideoStream(this.myVideo, currentStream)
      }
      this.currentCameraId = newTrack.getSettings().deviceId || deviceId
      if (this.screenShareStream) {
        this.cameraEnabledBeforeScreenShare = newTrack.enabled
        store.dispatch(setCameraEnabled(newTrack.enabled))
      } else {
        this.cameraEnabled = newTrack.enabled
        this.setCameraEnabled(this.network.mySessionId, newTrack.enabled)
        store.dispatch(setCameraEnabled(newTrack.enabled))
        this.network.updateCameraState(newTrack.enabled)
      }
      return true
    } catch (error) {
      console.warn('Unable to switch camera', error)
      return false
    }
  }

  // switch to a different microphone by device id, keeping the same camera and any ongoing calls
  async switchMicrophone(deviceId: string): Promise<boolean> {
    if (!this.hasAudioTrack) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
          video: false,
        })
        this.myStream ??= new MediaStream()
        const track = stream.getAudioTracks()[0]
        if (!track) return false
        const oldTrack = this.myStream.getAudioTracks()[0]
        if (oldTrack) {
          oldTrack.stop()
          this.myStream.removeTrack(oldTrack)
        }
        this.placeholderAudioTrack = undefined
        this.myStream.addTrack(track)
        this.watchVoiceActivity(this.network.mySessionId, this.myStream)
        this.ensureOutgoingVideoTrack()
        const previewStream = this.screenShareStream || this.myStream
        this.myVideo.srcObject = previewStream
        this.addVideoStream(this.myVideo, previewStream)
        this.replaceTrackInPeers('audio', track)
        this.currentMicId = track.getSettings().deviceId
        store.dispatch(setMicEnabled(true))
        this.network.updateMicrophoneState(true)
        this.announceMediaReady()
        return true
      } catch (error) {
        console.warn('Unable to access microphone', error)
        return false
      }
    }
    const currentStream = this.myStream
    if (!currentStream) return false
    const wasEnabled = currentStream.getAudioTracks()[0]?.enabled ?? true
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
      })
      const newTrack = newStream.getAudioTracks()[0]
      if (!newTrack) return false
      newTrack.enabled = wasEnabled

      const oldTrack = currentStream.getAudioTracks()[0]
      oldTrack?.stop()
      if (oldTrack) currentStream.removeTrack(oldTrack)
      currentStream.addTrack(newTrack)
      this.watchVoiceActivity(this.network.mySessionId, currentStream)

      this.currentMicId = newTrack.getSettings().deviceId || deviceId
      store.dispatch(setMicEnabled(newTrack.enabled))
      this.network.updateMicrophoneState(newTrack.enabled)
      this.replaceTrackInPeers('audio', newTrack)
      return true
    } catch (error) {
      console.warn('Unable to switch microphone', error)
      return false
    }
  }

  // "Hide self view": hides your own floating bubble from your own screen only.
  // Purely local — it does not touch the stream, so everyone else keeps seeing you normally.
  setSelfViewHidden(hidden: boolean) {
    this.selfViewHidden = hidden
    this.myVideo.style.visibility = hidden ? 'hidden' : 'visible'
  }

  async setCameraMirrored(mirrored: boolean) {
    if (this.cameraMirrored === mirrored) return
    this.cameraMirrored = mirrored
    const rawTrack = this.cameraSourceTrack || this.myStream?.getVideoTracks()
      .find((track) => track !== this.placeholderVideoTrack)
    if (!rawTrack || !this.myStream) return

    const currentTrack = this.myStream.getVideoTracks()[0]
    const wasEnabled = currentTrack?.enabled ?? true
    let outgoingTrack: MediaStreamTrack
    rawTrack.enabled = true
    if (mirrored) outgoingTrack = await this.createFlippedCameraTrack(rawTrack)
    else {
      this.stopCameraProcessor(false)
      rawTrack.enabled = true
      outgoingTrack = rawTrack
    }
    outgoingTrack.enabled = wasEnabled
    if (currentTrack) {
      this.myStream.removeTrack(currentTrack)
      if (currentTrack !== rawTrack && currentTrack !== this.placeholderVideoTrack) currentTrack.stop()
    }
    this.myStream.addTrack(outgoingTrack)
    this.cameraSourceTrack = mirrored && outgoingTrack !== rawTrack ? rawTrack : undefined
    if (this.screenShareStream) this.keepScreenShareOutput()
    else {
      this.replaceTrackInPeers('video', outgoingTrack)
      this.myVideo.srcObject = this.myStream
      this.addVideoStream(this.myVideo, this.myStream)
    }
  }

  setNearbyVolume(volume: number) {
    this.nearbyVolume = Math.max(0, Math.min(1, volume))
    ;[...this.peers.values(), ...this.onCalledPeers.values()].forEach(({ video, audio }) => {
      const playerId = video.dataset.playerId || ''
      const volume = this.nearbyVolume * (this.playerProximity.get(playerId) ?? 1) * (this.participantVolumes.get(playerId) ?? 1)
      video.volume = volume
      audio.volume = volume
      video.muted = true
      audio.muted = this.locallyMutedPlayers.has(playerId)
    })
  }

  setPlayerProximity(playerId: string, distance: number, roomAudioAllowed = true) {
    const normalizedDistance = Math.max(0, Math.min(1, distance / 300))
    const attenuation = roomAudioAllowed ? (1 - normalizedDistance) ** 1.5 : 0
    this.playerProximity.set(playerId, attenuation)
    const volume = this.nearbyVolume * attenuation * (this.participantVolumes.get(playerId) ?? 1)
    this.getRemoteMediaElements(playerId).forEach((media) => {
      media.volume = volume
      media.muted = media instanceof HTMLVideoElement ? true : this.locallyMutedPlayers.has(playerId)
    })
  }

  setParticipantVolume(playerId: string, volume: number) {
    const normalized = Math.max(0, Math.min(1, volume))
    this.participantVolumes.set(playerId, normalized)
    const nextVolume = this.nearbyVolume * (this.playerProximity.get(playerId) ?? 1) * normalized
    this.getRemoteMediaElements(playerId).forEach((media) => { media.volume = nextVolume })
  }

  setParticipantMuted(playerId: string, muted: boolean) {
    if (muted) this.locallyMutedPlayers.add(playerId)
    else this.locallyMutedPlayers.delete(playerId)
    this.getRemoteAudioElements(playerId).forEach((audio) => { audio.muted = muted })
  }

  setParticipantCameraHidden(playerId: string, hidden: boolean) {
    if (hidden) this.locallyHiddenCameras.add(playerId)
    else this.locallyHiddenCameras.delete(playerId)
    const video = this.getVideoElement(playerId)
    if (video) video.style.visibility = hidden ? 'hidden' : 'visible'
  }

  // A disabled camera track can render as a black frame in remote browsers.
  // Hide the floating video element itself when a participant turns video off.
  setCameraEnabled(playerId: string, enabled: boolean) {
    if (playerId === this.network.mySessionId) {
      this.myVideo.style.display = enabled ? 'block' : 'none'
      return
    }

    // A peer can briefly have both an outgoing and an incoming PeerJS call.
    // Update every matching element so an old call cannot leave a frozen frame
    // visible after the participant turns their camera off.
    this.getRemoteVideoElements(playerId).forEach((video) => {
      video.style.setProperty('display', enabled ? 'block' : 'none', 'important')
    })
  }

  private getRemoteVideoElements(playerId: string): HTMLVideoElement[] {
    const sanitizedId = this.replaceInvalidId(playerId)
    return [this.peers.get(sanitizedId)?.video, this.onCalledPeers.get(sanitizedId)?.video]
      .filter((video): video is HTMLVideoElement => Boolean(video))
  }

  private getRemoteAudioElements(playerId: string): HTMLAudioElement[] {
    const sanitizedId = this.replaceInvalidId(playerId)
    return [this.peers.get(sanitizedId)?.audio, this.onCalledPeers.get(sanitizedId)?.audio]
      .filter((audio): audio is HTMLAudioElement => Boolean(audio))
  }

  private getRemoteMediaElements(playerId: string): HTMLMediaElement[] {
    return [...this.getRemoteVideoElements(playerId), ...this.getRemoteAudioElements(playerId)]
  }

  hasPeerConnection(playerId: string): boolean {
    const sanitizedId = this.replaceInvalidId(playerId)
    return this.peers.has(sanitizedId) || this.onCalledPeers.has(sanitizedId)
  }

  // A PeerJS call can exist for a few seconds before its media stream arrives.
  // Treat that state differently from a working call so proximity can recover
  // from a signalling attempt that got stuck in the browser.
  hasRemoteMedia(playerId: string, requireCamera = false): boolean {
    const sanitizedId = this.replaceInvalidId(playerId)
    const entries = [this.peers.get(sanitizedId), this.onCalledPeers.get(sanitizedId)]
    return entries.some((entry) => {
      if (!entry) return false
      const streams = [entry.video.srcObject, entry.audio.srcObject]
      return streams.some((stream) => {
        if (!(stream instanceof MediaStream)) return false
        const liveTracks = stream.getTracks().filter((track) => track.readyState === 'live')
        if (!liveTracks.length) return false
        if (!requireCamera) return true
        // A muted/prejoin connection carries a tiny placeholder video track.
        // When the player has enabled their camera, require a real-sized live
        // video track so a failed replaceTrack cannot look healthy forever.
        const hasRealVideoTrack = liveTracks.some((track) => {
          if (track.kind !== 'video') return false
          const settings = track.getSettings()
          return (Number(settings.width) || 0) > 2 && (Number(settings.height) || 0) > 2
        })
        return hasRealVideoTrack && entry.video.videoWidth > 2 && entry.video.videoHeight > 2
      })
    })
  }

  disconnectPeer(playerId: string) {
    this.deleteVideoStream(playerId)
    this.deleteOnCalledVideoStream(playerId)
  }

  get isSelfViewHidden(): boolean {
    return this.selfViewHidden
  }

  // method to call a peer
  connectToNewUser(userId: string): boolean {
    if (this.myStream && this.peerReady) {
      const sanitizedId = this.replaceInvalidId(userId)
      if (!this.peers.has(sanitizedId)) {
        let call: Peer.MediaConnection
        try {
          call = this.myPeer.call(sanitizedId, this.outgoingStream())
        } catch {
          return false
        }
        const video = document.createElement('video')
        const audio = document.createElement('audio')
        this.peers.set(sanitizedId, { call, video, audio })

        call.on('stream', (userVideoStream) => {
          this.addVideoStream(video, userVideoStream, userId)
          this.addAudioStream(audio, userVideoStream, userId)
        })
        const clearFailedCall = () => {
          if (this.peers.get(sanitizedId)?.call !== call) return
          this.deleteVideoStream(userId)
        }
        call.on('error', clearFailedCall)
        call.on('close', clearFailedCall)

        // on close is triggered manually with deleteVideoStream()
        return true
      }
    }
    return false
  }

  // give the video element the small floating "bubble over the head" look
  private styleFloatingVideo(video: HTMLVideoElement) {
    video.style.position = 'fixed'
    video.style.width = '56px'
    video.style.height = '56px'
    video.style.borderRadius = '8px'
    video.style.objectFit = 'cover'
    video.style.border = '3px solid #05BDBA'
    video.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.4)'
    video.style.zIndex = '20'
    video.style.display = 'none'
    video.style.pointerEvents = 'none'
    // transform centers the bubble horizontally on the point and sits it just above it
    video.style.transform = 'translate(-50%, -100%)'
    // hidden off-screen until Game.ts starts positioning it every frame
    video.style.top = '-9999px'
    video.style.left = '-9999px'
  }

  // method to add new video stream to videoGrid div
  addVideoStream(video: HTMLVideoElement, stream: MediaStream, playerId?: string) {
    video.srcObject = stream
    // The same element carries the remote audio track. Autoplay is needed for
    // microphone-only proximity calls; otherwise audio may start only after a
    // later camera click provides another browser gesture.
    video.autoplay = true
    video.playsInline = true
    if (playerId) video.dataset.playerId = playerId
    video.volume = this.nearbyVolume * (playerId ? (this.playerProximity.get(playerId) ?? 1) * (this.participantVolumes.get(playerId) ?? 1) : 1)
    video.muted = playerId ? this.locallyMutedPlayers.has(playerId) : true
    if (playerId && this.locallyHiddenCameras.has(playerId)) video.style.visibility = 'hidden'
    if (!video.isConnected) {
      this.styleFloatingVideo(video)
      this.videoGrid.append(video)
    }
    if (playerId) this.watchVoiceActivity(playerId, stream)
    video.addEventListener('loadedmetadata', () => {
      void video.play().catch(() => undefined)
    })
  }

  private addAudioStream(audio: HTMLAudioElement, stream: MediaStream, playerId: string) {
    audio.srcObject = stream
    audio.autoplay = true
    audio.preload = 'auto'
    audio.dataset.playerId = playerId
    audio.volume = this.nearbyVolume * (this.playerProximity.get(playerId) ?? 1) * (this.participantVolumes.get(playerId) ?? 1)
    audio.muted = this.locallyMutedPlayers.has(playerId)
    audio.style.display = 'none'
    if (!audio.isConnected) this.videoGrid.append(audio)
    void audio.play().catch(() => undefined)
  }

  private watchVoiceActivity(playerId: string, stream: MediaStream) {
    if (!stream.getAudioTracks().length) return
    this.stopVoiceActivity(playerId)
    try {
      this.voiceAudioContext ??= new AudioContext()
      if (this.voiceAudioContext.state === 'suspended') {
        void this.voiceAudioContext.resume().catch(() => undefined)
      }
      const analyser = this.voiceAudioContext.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.78
      const source = this.voiceAudioContext.createMediaStreamSource(stream)
      source.connect(analyser)
      this.voiceAnalyzers.set(playerId, {
        analyser,
        source,
        samples: new Uint8Array(analyser.fftSize),
        speaking: false,
        lastVoiceAt: 0,
      })
      this.voiceMeterInterval ??= window.setInterval(() => this.updateVoiceActivity(), 120)
    } catch (error) {
      console.warn('Could not start nearby voice activity detection', error)
    }
  }

  private updateVoiceActivity() {
    const now = Date.now()
    this.voiceAnalyzers.forEach((meter, playerId) => {
      meter.analyser.getByteTimeDomainData(meter.samples)
      let sumSquares = 0
      meter.samples.forEach((sample) => {
        const amplitude = (sample - 128) / 128
        sumSquares += amplitude * amplitude
      })
      const rms = Math.sqrt(sumSquares / meter.samples.length)
      // Microphones and browser noise suppression often produce a much lower
      // RMS than the desktop input. Keep a small threshold and a release
      // delay so the indicator does not blink between syllables.
      if (rms > 0.018) meter.lastVoiceAt = now
      const speaking = meter.speaking
        ? now - meter.lastVoiceAt < 850
        : now - meter.lastVoiceAt < 300
      if (speaking !== meter.speaking) {
        meter.speaking = speaking
        const video = this.getVideoElement(playerId)
        video?.classList.toggle('speaking', speaking)
        video?.parentElement?.classList.toggle('is-speaking', speaking)
        this.network.updateRemoteVoiceActivity(playerId, speaking)
      }
    })
  }

  private stopVoiceActivity(playerId: string) {
    const meter = this.voiceAnalyzers.get(playerId)
    if (!meter) return
    const video = this.getVideoElement(playerId)
    video?.classList.remove('speaking')
    video?.parentElement?.classList.remove('is-speaking')
    if (meter.speaking) this.network.updateRemoteVoiceActivity(playerId, false)
    meter.source.disconnect()
    this.voiceAnalyzers.delete(playerId)
    if (this.voiceAnalyzers.size === 0 && this.voiceMeterInterval) {
      window.clearInterval(this.voiceMeterInterval)
      this.voiceMeterInterval = undefined
    }
  }

  // method to remove video stream (when we are the host of the call)
  deleteVideoStream(userId: string) {
    this.stopVoiceActivity(userId)
    this.playerProximity.delete(userId)
    this.participantVolumes.delete(userId)
    this.locallyMutedPlayers.delete(userId)
    this.locallyHiddenCameras.delete(userId)
    const sanitizedId = this.replaceInvalidId(userId)
    if (this.peers.has(sanitizedId)) {
      const peer = this.peers.get(sanitizedId)
      peer?.call.close()
      peer?.video.remove()
      peer?.audio.remove()
      this.peers.delete(sanitizedId)
    }
  }

  // method to remove video stream (when we are the guest of the call)
  deleteOnCalledVideoStream(userId: string) {
    this.stopVoiceActivity(userId)
    this.playerProximity.delete(userId)
    this.participantVolumes.delete(userId)
    this.locallyMutedPlayers.delete(userId)
    this.locallyHiddenCameras.delete(userId)
    const sanitizedId = this.replaceInvalidId(userId)
    if (this.onCalledPeers.has(sanitizedId)) {
      const onCalledPeer = this.onCalledPeers.get(sanitizedId)
      onCalledPeer?.call.close()
      onCalledPeer?.video.remove()
      onCalledPeer?.audio.remove()
      this.onCalledPeers.delete(sanitizedId)
    }
  }

  // find the <video> element that belongs to a given player (by their colyseus session id)
  getVideoElement(playerId: string): HTMLVideoElement | undefined {
    if (playerId === this.network.mySessionId) return this.myVideo
    const sanitizedId = this.replaceInvalidId(playerId)
    return this.peers.get(sanitizedId)?.video ?? this.onCalledPeers.get(sanitizedId)?.video
  }

  // called every frame from Game.ts to keep the video bubble glued above the player's sprite
  setVideoPosition(playerId: string, screenX: number, screenY: number) {
    const video = this.getVideoElement(playerId)
    if (video) {
      video.style.left = `${screenX}px`
      video.style.top = `${screenY}px`
    }
  }

  // toggle the microphone on/off, returns the new state (true = on)
  toggleAudio(): boolean {
    if (!this.myStream) return false
    const audioTrack = this.myStream
      .getAudioTracks()
      .find((track) => track !== this.placeholderAudioTrack)
    if (!audioTrack) return false
    audioTrack.enabled = !audioTrack.enabled
    store.dispatch(setMicEnabled(audioTrack.enabled))
    this.network.updateMicrophoneState(audioTrack.enabled)
    return audioTrack.enabled
  }

  // toggle the camera on/off, returns the new state (true = on)
  toggleVideo(): boolean {
    if (!this.myStream) return false
    const videoTrack = this.myStream.getVideoTracks().find((track) => track !== this.placeholderVideoTrack)
    if (!videoTrack) return false
    videoTrack.enabled = !videoTrack.enabled
    if (this.screenShareStream) {
      // Camera controls remain independent while the screen is the outgoing
      // video track. Keep the shared screen visible to every participant.
      this.cameraEnabledBeforeScreenShare = videoTrack.enabled
      store.dispatch(setCameraEnabled(videoTrack.enabled))
      this.keepScreenShareOutput()
      return videoTrack.enabled
    }
    this.cameraEnabled = videoTrack.enabled
    this.setCameraEnabled(this.network.mySessionId, videoTrack.enabled)
    this.network.updateCameraState(videoTrack.enabled)
    store.dispatch(setCameraEnabled(videoTrack.enabled))
    return videoTrack.enabled
  }

  get hasStream(): boolean {
    return !!this.myStream
  }

  get peerReady(): boolean {
    // PeerJS can return a MediaConnection object before the signaling socket
    // has finished opening. Starting a proximity call in that window leaves
    // both sides with a connection entry but no media stream. Only allow the
    // first call after the peer has announced its open state.
    return this.peerIsOpen && !this.myPeer.destroyed
  }

  get hasAudioTrack(): boolean {
    return Boolean(
      this.myStream?.getAudioTracks().some((track) => track !== this.placeholderAudioTrack && track.readyState === 'live')
    )
  }

  get hasCameraTrack(): boolean {
    return Boolean(
      this.myStream?.getVideoTracks().some((track) => track !== this.placeholderVideoTrack && track.readyState === 'live')
    )
  }
}
