import React, { useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import LinearProgress from '@mui/material/LinearProgress'
import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'
import Popover from '@mui/material/Popover'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import VideocamIcon from '@mui/icons-material/Videocam'
import MicOffIcon from '@mui/icons-material/MicOff'
import MicIcon from '@mui/icons-material/Mic'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'

import { useAppSelector } from '../hooks'

import phaserGame from '../PhaserGame'
import Bootstrap from '../scenes/Bootstrap'
import {
  disablePreviewMedia,
  enablePreviewMedia,
  getPreviewMediaStream,
  previewMediaEnabled,
} from '../services/PrejoinMedia'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 32px;
  background: #191a1d;
`

const Wrapper = styled.div`
  width: min(1040px, 100%);
  display: grid;
  grid-template-columns: minmax(0, 1.8fr) minmax(280px, .9fr);
  align-items: center;
  gap: clamp(36px, 6vw, 88px);
  color: #e8e8ea;

  @media (max-width: 760px) {
    width: min(440px, 100%);
    grid-template-columns: 1fr;
    gap: 24px;
  }

`

const CameraPreview = styled.div`
  position: relative;
  aspect-ratio: 4 / 2.65;
  min-height: 250px;
  border-radius: 20px;
  background: #202124;
  box-shadow: 0 12px 42px rgba(0, 0, 0, .18);
  display: grid;
  place-items: center;
  color: #c6c7ca;
  font-size: 15px;
  overflow: hidden;

  @media (max-width: 760px) {
    min-height: 180px;
    aspect-ratio: 16 / 8;
  }
`

const PreviewVideo = styled.video`
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
`

const CameraOffLabel = styled.div`
  position: relative;
  z-index: 1;
  pointer-events: none;
`

const CameraControls = styled.div`
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  color: #c5c6c9;
  z-index: 1;

  button {
    width: 38px;
    height: 42px;
    display: grid;
    place-items: center;
    border: 0;
    border-radius: 0;
    color: #c5c6c9;
    background: #25272b;
    cursor: pointer;
    transition: background .15s, color .15s;
  }
  button:hover { background: #34373c; color: #fff; }
  button[data-active='true'] { color: #dcfff0; background: #176b49; }
  .group { display: flex; overflow: hidden; border-radius: 12px; background: #25272b; }
  .group button:first-child { border-radius: 12px 0 0 12px; }
  .group .chevron { width: 25px; border-left: 1px solid rgba(255,255,255,.08); border-radius: 0 12px 12px 0; }
  svg { width: 19px; height: 19px; }
`

const MicMeter = styled.div`
  position: absolute;
  top: 20px;
  right: 22px;
  display: flex;
  align-items: center;
  gap: 3px;

  i { display: block; width: 4px; height: 7px; border-radius: 2px; background: #3a3d42; }
  i[data-lit='true'] { background: #35d27e; box-shadow: 0 0 5px rgba(53,210,126,.28); }
  i:nth-child(3n) { height: 11px; }
  i:nth-child(4n) { height: 15px; }
`

const VoiceStatus = styled.div`
  position: absolute;
  top: 18px;
  left: 22px;
  color: #c8cbd0;
  font-size: 13px;
  z-index: 1;
`

const DeviceMenu = styled.div`
  width: 280px;
  max-height: min(420px, 70vh);
  overflow: auto;
  padding: 8px;
  border: 1px solid #303238;
  border-radius: 12px;
  color: #e7e8ea;
  background: #202124;
  box-shadow: 0 10px 28px rgba(0,0,0,.45);

  .heading { padding: 6px 9px; color: #aeb1b7; font-size: 12px; }
  .divider { height: 1px; margin: 6px 4px; background: #36383e; }
  .setting { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 2px 9px; font-size: 12px; }
  .empty { padding: 7px 9px; color: #999da5; font-size: 12px; }
`

const DeviceOption = styled.button<{ $selected: boolean }>`
  width: 100%;
  padding: 8px 10px;
  border: 0;
  border-radius: 7px;
  color: #e7e8ea;
  background: ${(props) => props.$selected ? '#30344a' : 'transparent'};
  text-align: left;
  font: inherit;
  cursor: pointer;
  &:hover { background: #303238; }
  .label { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .sub { display: block; margin-top: 2px; overflow: hidden; color: #999da5; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
`

const EntryPanel = styled.form`
  display: flex;
  flex-direction: column;
  gap: 10px;

  h1 { margin: 0 0 16px; font-size: 20px; font-weight: 500; }
  .name-field .MuiOutlinedInput-root { color: #eee; border-radius: 9px; }
  .name-field .MuiOutlinedInput-notchedOutline { border-color: #414348; }
  .name-field .MuiInputLabel-root { color: #aeb0b5; }
  .join-button { min-height: 42px; border-radius: 9px; background: #2429b4; text-transform: none; font-size: 15px; }
  .join-button:hover { background: #3036d0; }
`

const ProgressBarWrapper = styled.div`
  position: fixed;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;

  h3 {
    color: #33ac96;
  }
`

const ProgressBar = styled(LinearProgress)`
  width: min(360px, 80vw);
`

export default function RoomSelectionDialog() {
  const [showSnackbar, setShowSnackbar] = useState(false)
  const [snackbarMessage, setSnackbarMessage] = useState('')
  const [joining, setJoining] = useState(false)
  const [playerName, setPlayerName] = useState(() => sessionStorage.getItem('skyoffice.pendingPlayerName') || '')
  const [nameError, setNameError] = useState(false)
  const [cameraEnabled, setCameraEnabled] = useState(() => previewMediaEnabled('video'))
  const [micEnabled, setMicEnabled] = useState(() => previewMediaEnabled('audio'))
  const [micLevel, setMicLevel] = useState(0)
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([])
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([])
  const [selectedMicId, setSelectedMicId] = useState(() => getPreviewMediaStream()?.getAudioTracks()[0]?.getSettings().deviceId || '')
  const [selectedCameraId, setSelectedCameraId] = useState(() => getPreviewMediaStream()?.getVideoTracks()[0]?.getSettings().deviceId || '')
  const [selectedSpeakerId, setSelectedSpeakerId] = useState('')
  const [noiseSuppression, setNoiseSuppression] = useState(true)
  const [monitorEnabled, setMonitorEnabled] = useState(true)
  const [previewRevision, setPreviewRevision] = useState(0)
  const [deviceMenuAnchor, setDeviceMenuAnchor] = useState<HTMLElement | null>(null)
  const [deviceMenuKind, setDeviceMenuKind] = useState<'microphone' | 'camera' | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const monitorAudioRef = useRef<HTMLAudioElement>(null)
  const lobbyJoined = useAppSelector((state) => state.room.lobbyJoined)

  const refreshMediaDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      setMicrophones(devices.filter((device) => device.kind === 'audioinput'))
      setCameras(devices.filter((device) => device.kind === 'videoinput'))
      setSpeakers(devices.filter((device) => device.kind === 'audiooutput'))
    } catch (error) {
      console.warn('Unable to list media devices', error)
    }
  }

  useEffect(() => {
    void refreshMediaDevices()
    const mediaDevices = navigator.mediaDevices
    const handleDeviceChange = () => { void refreshMediaDevices() }
    mediaDevices?.addEventListener?.('devicechange', handleDeviceChange)
    return () => mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = getPreviewMediaStream() ?? null
    if (cameraEnabled) void video.play().catch(() => undefined)
  }, [cameraEnabled])

  useEffect(() => {
    if (!micEnabled) { setMicLevel(0); return }
    const stream = getPreviewMediaStream()
    if (!stream?.getAudioTracks().length) return
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    const source = context.createMediaStreamSource(stream)
    source.connect(analyser)
    const samples = new Uint8Array(analyser.fftSize)
    let frame = 0
    const measure = () => {
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      samples.forEach((value) => { const amplitude = (value - 128) / 128; sum += amplitude * amplitude })
      setMicLevel(Math.min(100, Math.sqrt(sum / samples.length) * 350))
      frame = requestAnimationFrame(measure)
    }
    measure()
    return () => {
      cancelAnimationFrame(frame)
      source.disconnect()
      void context.close()
    }
  }, [micEnabled, selectedMicId, previewRevision])

  useEffect(() => {
    const audio = monitorAudioRef.current
    if (!audio) return
    const stream = getPreviewMediaStream()
    const tracks = micEnabled ? stream?.getAudioTracks() ?? [] : []
    audio.srcObject = tracks.length ? new MediaStream(tracks) : null
    audio.muted = !monitorEnabled
    audio.volume = 0.7
    if (tracks.length && monitorEnabled) void audio.play().catch(() => undefined)
  }, [micEnabled, monitorEnabled, selectedMicId, previewRevision])

  useEffect(() => {
    if (!selectedSpeakerId) return
    const audio = monitorAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null
    if (audio?.setSinkId) void audio.setSinkId(selectedSpeakerId).catch((error) => console.warn('Unable to select speaker', error))
  }, [selectedSpeakerId])

  const togglePreviewMedia = async (kind: 'audio' | 'video') => {
    const active = kind === 'video' ? cameraEnabled : micEnabled
    const setActive = kind === 'video' ? setCameraEnabled : setMicEnabled
    if (active) {
      disablePreviewMedia(kind)
      setActive(false)
      return
    }
    try {
      await enablePreviewMedia(
        kind,
        kind === 'audio' ? selectedMicId || undefined : selectedCameraId || undefined,
        noiseSuppression
      )
      setActive(true)
      const stream = getPreviewMediaStream()
      if (kind === 'audio') setSelectedMicId(stream?.getAudioTracks()[0]?.getSettings().deviceId || selectedMicId)
      else setSelectedCameraId(stream?.getVideoTracks()[0]?.getSettings().deviceId || selectedCameraId)
      setPreviewRevision((revision) => revision + 1)
      await refreshMediaDevices()
      const video = videoRef.current
      if (video && kind === 'video') {
        video.srcObject = getPreviewMediaStream() ?? null
        void video.play().catch(() => undefined)
      }
    } catch (error) {
      console.warn(`Unable to enable preview ${kind}`, error)
      setSnackbarMessage(kind === 'video'
        ? 'Não foi possível acessar a câmera. Confira a permissão do navegador.'
        : 'Não foi possível acessar o microfone. Confira a permissão do navegador.')
      setShowSnackbar(true)
    }
  }

  const openDeviceMenu = (kind: 'microphone' | 'camera', event: React.MouseEvent<HTMLElement>) => {
    setDeviceMenuKind(kind)
    setDeviceMenuAnchor(event.currentTarget)
    void refreshMediaDevices()
  }

  const selectInputDevice = async (kind: 'microphone' | 'camera', deviceId: string) => {
    const active = kind === 'microphone' ? micEnabled : cameraEnabled
    try {
      if (active) {
        await enablePreviewMedia(kind === 'microphone' ? 'audio' : 'video', deviceId, noiseSuppression)
        setPreviewRevision((revision) => revision + 1)
        if (kind === 'microphone') {
          setSelectedMicId(deviceId)
          setMicEnabled(true)
        } else {
          setSelectedCameraId(deviceId)
          setCameraEnabled(true)
        }
      } else if (kind === 'microphone') setSelectedMicId(deviceId)
      else setSelectedCameraId(deviceId)
      await refreshMediaDevices()
      setDeviceMenuAnchor(null)
    } catch (error) {
      console.warn(`Unable to select ${kind}`, error)
      setSnackbarMessage(`Não foi possível usar esse dispositivo. Confira a permissão do navegador.`)
      setShowSnackbar(true)
    }
  }

  const selectSpeaker = async (deviceId: string) => {
    const audio = monitorAudioRef.current as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null
    try {
      if (audio?.setSinkId) await audio.setSinkId(deviceId)
      setSelectedSpeakerId(deviceId)
      setDeviceMenuAnchor(null)
    } catch (error) {
      console.warn('Unable to select speaker', error)
      setSnackbarMessage('Não foi possível selecionar essa saída de áudio neste navegador.')
      setShowSnackbar(true)
    }
  }

  const toggleNoiseSuppression = async (enabled: boolean) => {
    setNoiseSuppression(enabled)
    if (!micEnabled) return
    try {
      await enablePreviewMedia('audio', selectedMicId || undefined, enabled)
      setPreviewRevision((revision) => revision + 1)
      setMicEnabled(true)
      setSelectedMicId(getPreviewMediaStream()?.getAudioTracks()[0]?.getSettings().deviceId || selectedMicId)
    } catch (error) {
      console.warn('Unable to change microphone noise suppression', error)
      setSnackbarMessage('Não foi possível atualizar o microfone.')
      setShowSnackbar(true)
    }
  }

  const handleConnect = (event?: React.FormEvent) => {
    event?.preventDefault()
    if (!playerName.trim()) {
      setNameError(true)
      return
    }
    if (lobbyJoined) {
      sessionStorage.setItem('skyoffice.pendingPlayerName', playerName.trim())
      const bootstrap = phaserGame.scene.keys.bootstrap as Bootstrap
      bootstrap.network
        .joinOrCreatePublic()
        .then(() => bootstrap.launchGame())
        .catch((error) => {
          console.error(error)
          setJoining(false)
          setSnackbarMessage('Não foi possível entrar agora. Tente novamente.')
          setShowSnackbar(true)
        })
      setJoining(true)
    } else {
      setSnackbarMessage('Conectando ao servidor. Tente novamente em alguns segundos.')
      setShowSnackbar(true)
    }
  }

  return (
    <>
      <Snackbar
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        open={showSnackbar}
        autoHideDuration={3000}
        onClose={() => {
          setShowSnackbar(false)
        }}
      >
        <Alert
          severity="error"
          variant="outlined"
          // overwrites the dark theme on render
          style={{ background: '#fdeded', color: '#7d4747' }}
        >
          {snackbarMessage}
        </Alert>
      </Snackbar>
      <Backdrop>
        <Wrapper>
              <CameraPreview>
                <PreviewVideo ref={videoRef} autoPlay muted playsInline style={{ display: cameraEnabled ? 'block' : 'none' }} />
                {!cameraEnabled && <CameraOffLabel>Sua câmera está desligada</CameraOffLabel>}
                {micEnabled && <VoiceStatus>{monitorEnabled ? 'Ouvindo sua voz' : 'Microfone ativo'}</VoiceStatus>}
                {micEnabled && <MicMeter aria-label="Nível do microfone">
                  {Array.from({ length: 10 }, (_, index) => <i key={index} data-lit={micLevel >= (index + 1) * 7} />)}
                </MicMeter>}
                <CameraControls>
                  <div className="group">
                    <button
                      type="button"
                      title={micEnabled ? 'Desligar microfone' : 'Testar microfone'}
                      aria-label={micEnabled ? 'Desligar microfone' : 'Testar microfone'}
                      data-active={micEnabled}
                      onClick={() => void togglePreviewMedia('audio')}
                    >
                      {micEnabled ? <MicIcon /> : <MicOffIcon />}
                    </button>
                    <button className="chevron" type="button" title="Escolher microfone e saída de áudio" aria-label="Escolher microfone e saída de áudio" onClick={(event) => openDeviceMenu('microphone', event)}>
                      <KeyboardArrowUpIcon />
                    </button>
                  </div>
                  <div className="group">
                    <button
                      type="button"
                      title={cameraEnabled ? 'Desligar câmera' : 'Testar câmera'}
                      aria-label={cameraEnabled ? 'Desligar câmera' : 'Testar câmera'}
                      data-active={cameraEnabled}
                      onClick={() => void togglePreviewMedia('video')}
                    >
                      {cameraEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
                    </button>
                    <button className="chevron" type="button" title="Escolher câmera" aria-label="Escolher câmera" onClick={(event) => openDeviceMenu('camera', event)}>
                      <KeyboardArrowUpIcon />
                    </button>
                  </div>
                </CameraControls>
                <audio ref={monitorAudioRef} autoPlay style={{ display: 'none' }} />
              </CameraPreview>
              <Popover
                open={Boolean(deviceMenuAnchor && deviceMenuKind === 'microphone')}
                anchorEl={deviceMenuAnchor}
                onClose={() => setDeviceMenuAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                PaperProps={{ style: { background: 'transparent', boxShadow: 'none', overflow: 'visible' } }}
              >
                <DeviceMenu>
                  <div className="heading">Selecionar microfone</div>
                  {microphones.length === 0 && <div className="empty">Nenhum microfone encontrado</div>}
                  {microphones.map((device, index) => (
                    <DeviceOption key={device.deviceId} type="button" $selected={device.deviceId === selectedMicId} onClick={() => void selectInputDevice('microphone', device.deviceId)}>
                      <span className="label">{device.label || `Microfone ${index + 1}`}</span>
                    </DeviceOption>
                  ))}
                  <div className="divider" />
                  <div className="heading">Selecionar saída de áudio</div>
                  <DeviceOption type="button" $selected={!selectedSpeakerId || selectedSpeakerId === 'default'} onClick={() => void selectSpeaker('default')}>
                    <span className="label">Padrão do sistema</span>
                  </DeviceOption>
                  {speakers.filter((device) => device.deviceId !== 'default').map((device, index) => (
                    <DeviceOption key={device.deviceId} type="button" $selected={device.deviceId === selectedSpeakerId} onClick={() => void selectSpeaker(device.deviceId)}>
                      <span className="label">{device.label || `Saída de áudio ${index + 1}`}</span>
                    </DeviceOption>
                  ))}
                  <div className="divider" />
                  <div className="setting">
                    <span>Redução de ruído</span>
                    <Switch size="small" checked={noiseSuppression} onChange={(_, checked) => void toggleNoiseSuppression(checked)} />
                  </div>
                  <div className="setting">
                    <span>Ouvir minha voz</span>
                    <Switch size="small" checked={monitorEnabled} onChange={(_, checked) => setMonitorEnabled(checked)} />
                  </div>
                </DeviceMenu>
              </Popover>
              <Popover
                open={Boolean(deviceMenuAnchor && deviceMenuKind === 'camera')}
                anchorEl={deviceMenuAnchor}
                onClose={() => setDeviceMenuAnchor(null)}
                anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
                transformOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                PaperProps={{ style: { background: 'transparent', boxShadow: 'none', overflow: 'visible' } }}
              >
                <DeviceMenu>
                  <div className="heading">Selecionar câmera</div>
                  {cameras.length === 0 && <div className="empty">Nenhuma câmera encontrada</div>}
                  {cameras.map((device, index) => (
                    <DeviceOption key={device.deviceId} type="button" $selected={device.deviceId === selectedCameraId} onClick={() => void selectInputDevice('camera', device.deviceId)}>
                      <span className="label">{device.label || `Câmera ${index + 1}`}</span>
                    </DeviceOption>
                  ))}
                </DeviceMenu>
              </Popover>
              <EntryPanel onSubmit={handleConnect}>
                <h1>Bem-vindo ao Escritório dos Estudos</h1>
                <TextField
                  className="name-field"
                  fullWidth
                  size="small"
                  placeholder="Seu nome"
                  value={playerName}
                  error={nameError}
                  helperText={nameError ? 'Digite seu nome para entrar' : ''}
                  onChange={(event) => { setPlayerName(event.target.value); setNameError(false) }}
                  inputProps={{ 'aria-label': 'Seu nome' }}
                />
                <Button className="join-button" variant="contained" type="submit" disabled={joining}>
                  {joining ? 'Connecting…' : 'Join'}
                </Button>
              </EntryPanel>
        </Wrapper>
        {!lobbyJoined && (
          <ProgressBarWrapper>
            <h3> Connecting to server...</h3>
            <ProgressBar color="secondary" />
          </ProgressBarWrapper>
        )}
      </Backdrop>
    </>
  )
}
