import Peer from 'peerjs'
import Network from '../services/Network'
import store from '../stores'
import { setVideoConnected, setMicEnabled, setCameraEnabled } from '../stores/UserStore'

export default class WebRTC {
  private myPeer: Peer
  private peers = new Map<string, { call: Peer.MediaConnection; video: HTMLVideoElement }>()
  private onCalledPeers = new Map<string, { call: Peer.MediaConnection; video: HTMLVideoElement }>()
  private videoGrid: HTMLElement
  private myVideo = document.createElement('video')
  private myStream?: MediaStream
  private placeholderVideoTrack?: MediaStreamTrack
  private placeholderAudioTrack?: MediaStreamTrack
  private placeholderAudioContext?: AudioContext
  private mediaAnnounced = false
  private cameraEnabled = false
  private network: Network
  private selfViewHidden = false
  private currentCameraId?: string
  private currentMicId?: string
  private screenShareStream?: MediaStream
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

  constructor(userId: string, network: Network) {
    const sanitizedId = this.replaceInvalidId(userId)
    this.myPeer = new Peer(sanitizedId)
    this.network = network
    this.videoGrid = document.querySelector<HTMLElement>('.video-grid') ?? document.createElement('div')
    this.videoGrid.classList.add('video-grid')
    if (!this.videoGrid.isConnected) document.body.append(this.videoGrid)
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
        call.answer(this.myStream)
        const video = document.createElement('video')
        this.onCalledPeers.set(call.peer, { call, video })

        call.on('stream', (userVideoStream) => {
          const playerId = this.network.sessionIdForPeer(call.peer)
          this.addVideoStream(video, userVideoStream, playerId)
        })
      }
      // on close is triggered manually with deleteOnCalledVideoStream()
    })
  }

  async getUserMedia(alertOnError = true): Promise<boolean> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
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
      this.myVideo.srcObject = this.myStream
      this.addVideoStream(this.myVideo, this.myStream)
      this.cameraEnabled = this.hasCameraTrack
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

  async getCameraMedia(deviceId?: string): Promise<boolean> {
    try {
      const video = deviceId ? { deviceId: { exact: deviceId } } : true
      const cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video })
      const newTrack = cameraStream.getVideoTracks()[0]
      if (!newTrack) return false

      this.myStream ??= new MediaStream()
      const oldTrack = this.myStream.getVideoTracks()[0]
      if (oldTrack) {
        oldTrack.stop()
        this.myStream.removeTrack(oldTrack)
      }
      this.placeholderVideoTrack = undefined
      this.myStream.addTrack(newTrack)
      this.ensureOutgoingAudioTrack()
      this.currentCameraId = newTrack.getSettings().deviceId
      this.myVideo.srcObject = this.myStream
      this.addVideoStream(this.myVideo, this.myStream)
      this.cameraEnabled = true
      this.setCameraEnabled(this.network.mySessionId, true)
      store.dispatch(setCameraEnabled(true))
      this.replaceTrackInPeers('video', newTrack)
      this.announceMediaReady()
      this.network.updateCameraState(true)
      return true
    } catch (error) {
      console.warn('Unable to access camera', error)
      return false
    }
  }

  adoptPrejoinMedia(stream: MediaStream) {
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
      this.myStream.getVideoTracks().forEach((old) => { this.myStream?.removeTrack(old); old.stop() })
      this.myStream.addTrack(video)
      this.currentCameraId = video.getSettings().deviceId
      this.replaceTrackInPeers('video', video)
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
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })
      const track = stream.getVideoTracks()[0]
      if (!track) return false
      this.screenShareStream = stream
      this.cameraEnabledBeforeScreenShare = store.getState().user.cameraEnabled
      this.replaceTrackInPeers('video', track)
      this.myVideo.srcObject = stream
      this.addVideoStream(this.myVideo, stream)
      this.cameraEnabled = true
      this.setCameraEnabled(this.network.mySessionId, true)
      store.dispatch(setCameraEnabled(true))
      this.network.updateCameraState(true)
      track.onended = () => this.stopMeetingScreenShare()
      return true
    } catch (error) {
      console.warn('Unable to share screen in meeting', error)
      return false
    }
  }

  stopMeetingScreenShare() {
    if (!this.screenShareStream) return
    this.screenShareStream.getTracks().forEach((track) => track.stop())
    this.screenShareStream = undefined
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

      const oldTrack = currentStream.getVideoTracks()[0]
      oldTrack?.stop()
      if (oldTrack) currentStream.removeTrack(oldTrack)
      currentStream.addTrack(newTrack)

      this.myVideo.srcObject = currentStream
      this.addVideoStream(this.myVideo, currentStream)
      this.currentCameraId = newTrack.getSettings().deviceId || deviceId
      this.cameraEnabled = newTrack.enabled
      this.setCameraEnabled(this.network.mySessionId, newTrack.enabled)
      store.dispatch(setCameraEnabled(newTrack.enabled))
      this.network.updateCameraState(newTrack.enabled)
      this.replaceTrackInPeers('video', newTrack)
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
          audio: { deviceId: { exact: deviceId } },
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
        this.myVideo.srcObject = this.myStream
        this.addVideoStream(this.myVideo, this.myStream)
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

  setNearbyVolume(volume: number) {
    this.nearbyVolume = Math.max(0, Math.min(1, volume))
    ;[...this.peers.values(), ...this.onCalledPeers.values()].forEach(({ video }) => {
      const playerId = video.dataset.playerId || ''
      video.volume = this.nearbyVolume * (this.playerProximity.get(playerId) ?? 1) * (this.participantVolumes.get(playerId) ?? 1)
      video.muted = this.locallyMutedPlayers.has(playerId)
    })
  }

  setPlayerProximity(playerId: string, distance: number, roomAudioAllowed = true) {
    const normalizedDistance = Math.max(0, Math.min(1, distance / 300))
    const attenuation = roomAudioAllowed ? (1 - normalizedDistance) ** 1.5 : 0
    this.playerProximity.set(playerId, attenuation)
    const video = this.getVideoElement(playerId)
    if (video) {
      video.volume = this.nearbyVolume * attenuation * (this.participantVolumes.get(playerId) ?? 1)
      video.muted = this.locallyMutedPlayers.has(playerId)
    }
  }

  setParticipantVolume(playerId: string, volume: number) {
    const normalized = Math.max(0, Math.min(1, volume))
    this.participantVolumes.set(playerId, normalized)
    const video = this.getVideoElement(playerId)
    if (video) video.volume = this.nearbyVolume * (this.playerProximity.get(playerId) ?? 1) * normalized
  }

  setParticipantMuted(playerId: string, muted: boolean) {
    if (muted) this.locallyMutedPlayers.add(playerId)
    else this.locallyMutedPlayers.delete(playerId)
    const video = this.getVideoElement(playerId)
    if (video) video.muted = muted
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

  hasPeerConnection(playerId: string): boolean {
    const sanitizedId = this.replaceInvalidId(playerId)
    return this.peers.has(sanitizedId) || this.onCalledPeers.has(sanitizedId)
  }

  disconnectPeer(playerId: string) {
    this.deleteVideoStream(playerId)
    this.deleteOnCalledVideoStream(playerId)
  }

  get isSelfViewHidden(): boolean {
    return this.selfViewHidden
  }

  // method to call a peer
  connectToNewUser(userId: string) {
    if (this.myStream) {
      const sanitizedId = this.replaceInvalidId(userId)
      if (!this.peers.has(sanitizedId)) {
        const call = this.myPeer.call(sanitizedId, this.myStream)
        const video = document.createElement('video')
        this.peers.set(sanitizedId, { call, video })

        call.on('stream', (userVideoStream) => {
          this.addVideoStream(video, userVideoStream, userId)
        })

        // on close is triggered manually with deleteVideoStream()
      }
    }
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
      video.play()
    })
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
      if (rms > 0.045) meter.lastVoiceAt = now
      const speaking = now - meter.lastVoiceAt < 450
      if (speaking !== meter.speaking) {
        meter.speaking = speaking
        const video = this.getVideoElement(playerId)
        video?.classList.toggle('speaking', speaking)
        video?.parentElement?.classList.toggle('is-speaking', speaking)
        if (playerId !== this.network.mySessionId) this.network.updateRemoteVoiceActivity(playerId, speaking)
      }
    })
  }

  private stopVoiceActivity(playerId: string) {
    const meter = this.voiceAnalyzers.get(playerId)
    if (!meter) return
    const video = this.getVideoElement(playerId)
    video?.classList.remove('speaking')
    video?.parentElement?.classList.remove('is-speaking')
    if (meter.speaking && playerId !== this.network.mySessionId) this.network.updateRemoteVoiceActivity(playerId, false)
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
    this.cameraEnabled = videoTrack.enabled
    this.setCameraEnabled(this.network.mySessionId, videoTrack.enabled)
    this.network.updateCameraState(videoTrack.enabled)
    store.dispatch(setCameraEnabled(videoTrack.enabled))
    return videoTrack.enabled
  }

  get hasStream(): boolean {
    return !!this.myStream
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
