import React, { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import styled from 'styled-components'
import Tooltip from '@mui/material/Tooltip'
import Popover from '@mui/material/Popover'
import Switch from '@mui/material/Switch'
import Slider from '@mui/material/Slider'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import VideocamIcon from '@mui/icons-material/Videocam'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import CheckIcon from '@mui/icons-material/Check'
import CircleIcon from '@mui/icons-material/Circle'
import HeadsetIcon from '@mui/icons-material/Headset'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import TimerIcon from '@mui/icons-material/Timer'
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import ChairAltIcon from '@mui/icons-material/ChairAlt'
import GridViewIcon from '@mui/icons-material/GridView'
import WeekendIcon from '@mui/icons-material/Weekend'
import ComputerIcon from '@mui/icons-material/Computer'
import UndoIcon from '@mui/icons-material/Undo'
import RedoIcon from '@mui/icons-material/Redo'
import SettingsIcon from '@mui/icons-material/Settings'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { useAppDispatch, useAppSelector } from '../hooks'
import { phaserEvents, Event } from '../events/EventCenter'
import { markConversationRead, setShowChat, setFocused, setSelectedConversation } from '../stores/ChatStore'
import GroupFocusPanel from './GroupFocusPanel'
import IndividualFocusPanel from './IndividualFocusPanel'
import RankEstudosDialog from './RankEstudosDialog'
import EditAvatarDialog from './EditAvatarDialog'
import TeamLabelDialog from './TeamLabelDialog'
import PreferencesDialog from './PreferencesDialog'
import {
  AvatarChoice,
  DEFAULT_AVATAR_CHOICE,
  loadSavedAvatar,
  saveAvatar,
} from '../avatarConfig'
import { fetchOwnLiveStudy, LiveStudyTimer } from '../services/RankEstudosLive'
import { loadOfficePreferences, saveOfficePreferences, OfficeStatus } from '../services/OfficePreferences'
import { DESK_DECORATION_ASSETS, DESK_DECORATION_TEXTURES, DeskDecorationAsset } from '../../../types/Desk'

// --- layout: small, clean, dark pill — Gather-style ---
const Bar = styled.div`
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  background: #1b1d29;
  border-radius: 999px;
  padding: 5px 6px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
  z-index: 30;
`

const ProfileButton = styled.button<{ ringColor: string }>`
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: #05bdba;
  color: #fff;
  font-weight: bold;
  font-size: 13px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &::after {
    content: '';
    position: absolute;
    right: -1px;
    bottom: -1px;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: ${(props) => props.ringColor};
    border: 2px solid #1b1d29;
  }

  &:hover {
    filter: brightness(1.1);
  }
`

const Divider = styled.div`
  width: 1px;
  height: 20px;
  background: #333750;
  margin: 0 2px;
`

function NearbyChatIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="0.1 3.7" strokeLinecap="round" /></svg>
}

const StudyTimer = styled.div`
  color: #bfeee6;
  font-size: 12px;
  white-space: nowrap;
  padding: 0 7px;
`

// split button: main toggle (mic/cam) + tiny chevron that opens the device picker
const SplitButton = styled.div<{ active: boolean }>`
  display: flex;
  align-items: center;
  border-radius: 999px;
  background: ${(props) => (props.active ? '#282c40' : '#c0392b')};
  overflow: hidden;
`

const ToggleHalf = styled.button`
  width: 30px;
  height: 30px;
  border: none;
  background: transparent;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    filter: brightness(1.2);
  }
`

const ChevronHalf = styled.button`
  width: 18px;
  height: 30px;
  border: none;
  background: transparent;
  color: #b8bcd4;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  svg {
    font-size: 15px;
  }

  &:hover {
    filter: brightness(1.3);
  }
`

// standalone round icon button (chat, emoji, etc.) — same size/feel as the
// mic/cam toggle halves but not part of a split button
const RoundIconButton = styled.button<{ active?: boolean }>`
  position: relative;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: ${(props) => (props.active ? '#282c40' : 'transparent')};
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    font-size: 17px;
  }

  &:hover {
    background: #282c40;
  }

  .unread-count {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    box-sizing: border-box;
    display: grid;
    place-items: center;
    padding: 0 4px;
    border: 1px solid #1b1d29;
    border-radius: 999px;
    color: #fff;
    background: #e53935;
    font: 700 10px/1 Arial, sans-serif;
  }
`

// --- status popover (profile) ---
const StatusMenu = styled.div`
  background: #262a3d;
  color: #eee;
  padding: 14px;
  width: 220px;
  border-radius: 10px;

  .name {
    font-weight: bold;
    font-size: 15px;
  }

  .current-status {
    color: #9a9fb5;
    font-size: 13px;
    margin-bottom: 12px;
  }
`

const StatusOptions = styled.div`
  display: flex;
  gap: 6px;
`

const StatusOption = styled.button<{ selected: boolean; color: string }>`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 4px;
  border-radius: 8px;
  border: 1px solid ${(props) => (props.selected ? props.color : '#3c4160')};
  background: ${(props) => (props.selected ? `${props.color}22` : 'transparent')};
  color: ${(props) => (props.selected ? props.color : '#c7cae3')};
  font-size: 12px;
  cursor: pointer;

  svg {
    font-size: 14px;
  }

  &:hover {
    filter: brightness(1.2);
  }
`

// --- device picker popover (mic/camera) ---
const DeviceMenu = styled.div`
  background: #262a3d;
  color: #eee;
  padding: 8px;
  width: 260px;
  border-radius: 10px;

  .title {
    font-size: 12px;
    color: #9a9fb5;
    padding: 6px 10px 4px;
  }
`

const DeviceItem = styled.button<{ selected: boolean }>`
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  border: none;
  background: ${(props) => (props.selected ? '#333750' : 'transparent')};
  color: #eee;
  font-size: 13px;
  text-align: left;
  cursor: pointer;

  .check {
    width: 16px;
    display: flex;
    align-items: center;
    color: #05bdba;
  }

  &:hover {
    background: #2f3348;
  }
`

const DeviceMenuRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  margin-top: 4px;
  border-top: 1px solid #333750;
  font-size: 13px;
`

function DeskAssetPreview({ asset, cursor = false, zoom = 1 }: { asset: DeskDecorationAsset; cursor?: boolean; zoom?: number }) {
  const ref = React.useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const image = new Image()
    image.src = asset.texture === 'office' ? '/assets/tileset/Modern_Office_Black_Shadow.png'
      : asset.texture === 'generic' ? '/assets/tileset/Generic.png'
      : asset.texture === 'basement' ? '/assets/tileset/Basement.png'
      : asset.texture === 'chairs' ? '/assets/items/chair.png'
      : asset.texture === 'computers' ? '/assets/items/computer.png'
      : asset.texture === 'laptop' ? '/assets/items/laptop.svg'
      : asset.texture === 'whiteboards' ? '/assets/items/whiteboard.png' : '/assets/items/vendingmachine.png'
    image.onload = () => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const spec = DESK_DECORATION_TEXTURES[asset.texture]
      const cols = Math.floor(image.width / spec.width)
      const sx = (asset.frame % cols) * spec.width
      const sy = Math.floor(asset.frame / cols) * spec.height
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.imageSmoothingEnabled = false
      if (cursor) {
        ctx.drawImage(image, sx, sy, spec.width, spec.height, 0, 0, canvas.width, canvas.height)
      } else {
        const scale = Math.min(36 / spec.width, 30 / spec.height)
        const width = spec.width * scale, height = spec.height * scale
        ctx.drawImage(image, sx, sy, spec.width, spec.height, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
      }
    }
  }, [asset, cursor, zoom])
  return <canvas ref={ref} width={cursor ? asset.width : 42} height={cursor ? asset.height : 34}
    style={cursor ? { width: asset.width * zoom, height: asset.height * zoom } : undefined} />
}

const DeskEditorMenu = styled.div`
  position: fixed;
  z-index: 40;
  left: 16px;
  top: 12px;
  height: min(760px, calc(100vh - 24px));
  width: min(340px, calc(100vw - 32px));
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 16px;
  border: 1px solid rgba(255,255,255,.09);
  border-radius: 18px;
  color: #f6f7fb;
  background: #171a22;
  box-shadow: 0 18px 56px rgba(0,0,0,.48);

  .top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .heading { font-weight: 750; font-size: 16px; letter-spacing: -.2px; }
  .close { width: 30px; height: 30px; border: 0; border-radius: 50%; color: #d8dbe5; background: #292d38; cursor: pointer; font-size: 20px; }
  .hint { margin: 4px 0 12px; color: #a9afbe; font-size: 12px; line-height: 1.45; }
  .search { width: 100%; box-sizing: border-box; margin: 0 0 10px; padding: 10px 12px; border: 1px solid #383d4a; border-radius: 10px; color: white; background: #222630; outline: none; }
  .search:focus { border-color: #66dfc0; }
  .categories { display: flex; flex: 0 0 auto; gap: 7px; overflow-x: auto; margin: 0 0 10px; scrollbar-width: none; }
  .category { width: 34px; height: 32px; flex: 0 0 auto; border: 1px solid transparent; border-radius: 8px; color: #cbd1de; background: #252934; cursor: pointer; display: grid; place-items: center; }
  .category:hover { background: #303541; }
  .category.selected { border-color: #46d5b2; color: #c8fff0; background: #183d36; }
  .items { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; overflow: auto; flex: 1; min-height: 0; align-content: start; }
  .item {
    min-height: 58px; border: 1px solid transparent; border-radius: 8px;
    color: #e7eaf1; background: transparent; cursor: pointer;
    display: grid; place-items: center;
  }
  .item:hover, .item.selected { border-color: #55dfbd; background: rgba(85,223,189,.10); }
  .item canvas { image-rendering: pixelated; }
  .history { display: flex; justify-content: flex-end; gap: 6px; margin-top: 10px; padding-top: 9px; border-top: 1px solid #303541; }
  .history button { width: 32px; height: 30px; display: grid; place-items: center; border: 1px solid #383d4a; border-radius: 8px; color: #e7e9ef; background: #252934; cursor: pointer; }
  .history button:hover { border-color: #687184; background: #2e3340; }
  .help { margin: 8px 0 0; color: #9299a8; font-size: 10px; }
`

const DecorationCursorGhost = styled.div`
  position: fixed;
  z-index: 60;
  width: max-content;
  height: max-content;
  display: grid;
  place-items: center;
  pointer-events: none;
  transform: translate(-50%, -50%);
  opacity: .72;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, .55));

  canvas { display: block; image-rendering: pixelated; }
`

const statusMeta = {
  active: { label: 'Active', color: '#22c55e', icon: <CircleIcon /> },
  busy: { label: 'Busy', color: '#ef4444', icon: <HeadsetIcon /> },
  away: { label: 'Away', color: '#f59e0b', icon: <RadioButtonUncheckedIcon /> },
}

export default function BottomBar() {
  const dispatch = useAppDispatch()
  const micOn = useAppSelector((state) => state.user.micEnabled)
  const camOn = useAppSelector((state) => state.user.cameraEnabled)
  const myPlayerName = useAppSelector((state) => state.user.myPlayerName)
  const loggedIn = useAppSelector((state) => state.user.loggedIn)
  const showChat = useAppSelector((state) => state.chat.showChat)
  const selectedConversation = useAppSelector((state) => state.chat.selectedConversation)
  const unreadCount = useAppSelector((state) => Object.values(state.chat.unreadByConversation).reduce((total, count) => total + count, 0))
  const [liveStudy, setLiveStudy] = useState<LiveStudyTimer | null>(null)
  const [liveStudyError, setLiveStudyError] = useState('')
  const [clockTick, setClockTick] = useState(Date.now())
  const [status, setStatus] = useState<OfficeStatus>(() => loadOfficePreferences().status)
  const [profileAnchor, setProfileAnchor] = useState<HTMLButtonElement | null>(null)
  const [micMenuAnchor, setMicMenuAnchor] = useState<HTMLButtonElement | null>(null)
  const [camMenuAnchor, setCamMenuAnchor] = useState<HTMLButtonElement | null>(null)
  const [mediaError, setMediaError] = useState('')
  const [mics, setMics] = useState<MediaDeviceInfo[]>([])
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([])
  const [activeMicId, setActiveMicId] = useState<string | undefined>(() => loadOfficePreferences().microphoneId || undefined)
  const [activeCameraId, setActiveCameraId] = useState<string | undefined>(() => loadOfficePreferences().cameraId || undefined)
  const [selfViewHidden, setSelfViewHidden] = useState(() => loadOfficePreferences().selfViewHidden)
  const [nearbyVolume, setNearbyVolume] = useState(() => loadOfficePreferences().nearbyVolume)
  const [focusAnchor, setFocusAnchor] = useState<HTMLButtonElement | null>(null)
  const [individualFocusAnchor, setIndividualFocusAnchor] = useState<HTMLButtonElement | null>(null)
  const [rankEstudosOpen, setRankEstudosOpen] = useState(false)
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false)
  const [avatarChoice, setAvatarChoice] = useState<AvatarChoice>(
    () => loadSavedAvatar(myPlayerName) || DEFAULT_AVATAR_CHOICE
  )
  const [teamLabel, setTeamLabel] = useState('Team')
  const [teamLabelOpen, setTeamLabelOpen] = useState(false)
  const [preferencesOpen, setPreferencesOpen] = useState(false)
  const [deskEditorAnchor, setDeskEditorAnchor] = useState<HTMLButtonElement | null>(null)
  const [selectedDeskDecoration, setSelectedDeskDecoration] = useState<DeskDecorationAsset | undefined>()
  const [decorationCursor, setDecorationCursor] = useState<{ x: number; y: number; zoom: number; visible: boolean }>({ x: 0, y: 0, zoom: 1, visible: false })
  const [deskIndex, setDeskIndex] = useState(-1)
  const [deskSearch, setDeskSearch] = useState('')
  const [deskCategory, setDeskCategory] = useState('Todos')
  const groupFocus = useAppSelector((state) => state.focus.group)

  useEffect(() => {
    if (!deskEditorAnchor || !selectedDeskDecoration) {
      setDecorationCursor((cursor) => cursor.visible ? { ...cursor, visible: false } : cursor)
      return
    }
    const followCursor = (event: MouseEvent) => {
      const canvas = phaserGame.canvas
      if (!canvas) return
      const bounds = canvas.getBoundingClientRect()
      const insideCanvas = event.clientX >= bounds.left && event.clientX <= bounds.right &&
        event.clientY >= bounds.top && event.clientY <= bounds.bottom
      const overCatalog = event.target instanceof Element && Boolean(event.target.closest('.skyoffice-desk-editor'))
      const game = phaserGame.scene.keys.game as Game | undefined
      const zoom = game?.cameras?.main?.zoom || 1
      setDecorationCursor({ x: event.clientX, y: event.clientY, zoom, visible: insideCanvas && !overCatalog })
    }
    const hideGhostAfterDrop = (event: MouseEvent) => {
      if (event.target === phaserGame.canvas) {
        setDecorationCursor((cursor) => ({ ...cursor, visible: false }))
      }
    }
    window.addEventListener('mousemove', followCursor)
    window.addEventListener('click', hideGhostAfterDrop)
    return () => {
      window.removeEventListener('mousemove', followCursor)
      window.removeEventListener('click', hideGhostAfterDrop)
    }
  }, [deskEditorAnchor, selectedDeskDecoration])

  useEffect(() => {
    const claimComplete = (index: number) => {
      setDeskIndex(index)
    }
    const syncOwnedDesk = () => {
      const game = phaserGame.scene.keys.game as Game | undefined
      const network = game?.network
      const player = network?.roomState?.players.get(network.mySessionId)
      setDeskIndex(player?.deskIndex ?? -1)
    }
    const requestEditor = (index: number, anchor: HTMLButtonElement) => {
      setDeskIndex(index)
      setDeskEditorAnchor(anchor)
      phaserEvents.emit(Event.DESK_EDITOR_MODE, true)
    }
    phaserEvents.on(Event.DESK_CLAIMED, claimComplete)
    phaserEvents.on(Event.MY_PLAYER_READY, syncOwnedDesk)
    phaserEvents.on(Event.DESK_EDITOR_REQUEST, requestEditor)
    syncOwnedDesk()
    return () => {
      phaserEvents.off(Event.DESK_CLAIMED, claimComplete)
      phaserEvents.off(Event.MY_PLAYER_READY, syncOwnedDesk)
      phaserEvents.off(Event.DESK_EDITOR_REQUEST, requestEditor)
    }
  }, [])

  useEffect(() => {
    const editTeamName = () => {
      const game = phaserGame.scene.keys.game as Game | undefined
      const network = game?.network
      const roomState = network?.roomState
      if (!network || roomState?.managerSessionId !== network.mySessionId) return
      setTeamLabel(roomState.teamLabel || 'Team')
      setTeamLabelOpen(true)
    }
    const updateTeamName = (name: string) => setTeamLabel(name || 'Team')
    phaserEvents.on(Event.TEAM_NAME_EDIT_REQUEST, editTeamName)
    phaserEvents.on(Event.TEAM_NAME_CHANGED, updateTeamName)
    return () => {
      phaserEvents.off(Event.TEAM_NAME_EDIT_REQUEST, editTeamName)
      phaserEvents.off(Event.TEAM_NAME_CHANGED, updateTeamName)
    }
  }, [])

  const closeDeskEditor = () => {
    setDeskEditorAnchor(null)
    setSelectedDeskDecoration(undefined)
    phaserEvents.emit(Event.DESK_EDITOR_SELECT, undefined)
    phaserEvents.emit(Event.DESK_EDITOR_MODE, false)
  }

  useEffect(() => () => {
    phaserEvents.emit(Event.DESK_EDITOR_SELECT, undefined)
    phaserEvents.emit(Event.DESK_EDITOR_MODE, false)
  }, [])

  useEffect(() => {
    if (!loggedIn || !myPlayerName) {
      setLiveStudy(null)
      setLiveStudyError('')
      return
    }

    let cancelled = false
    const refresh = () => {
      fetchOwnLiveStudy(myPlayerName)
        .then((timer) => {
          if (!cancelled) {
            setLiveStudy(timer)
            setLiveStudyError('')
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setLiveStudy(null)
            setLiveStudyError(error instanceof Error ? error.message : 'Não foi possível ler seu tempo ao vivo.')
          }
        })
    }
    refresh()
    const poll = window.setInterval(refresh, 20000)
    const tick = window.setInterval(() => setClockTick(Date.now()), 1000)
    return () => {
      cancelled = true
      window.clearInterval(poll)
      window.clearInterval(tick)
    }
  }, [loggedIn, myPlayerName])

  const getWebRTC = () => {
    const game = phaserGame.scene.keys.game as Game
    return game.network?.webRTC
  }

  useEffect(() => {
    saveOfficePreferences({
      status,
      microphoneId: activeMicId || '',
      cameraId: activeCameraId || '',
      selfViewHidden,
      nearbyVolume,
    })
  }, [status, activeMicId, activeCameraId, selfViewHidden, nearbyVolume])

  useEffect(() => {
    setAvatarChoice(loadSavedAvatar(myPlayerName) || DEFAULT_AVATAR_CHOICE)
  }, [myPlayerName])

  useEffect(() => {
    if (loggedIn) phaserEvents.emit(Event.MY_PLAYER_STATUS_CHANGE, status)
  }, [loggedIn, status])

  useEffect(() => {
    getWebRTC()?.setSelfViewHidden(selfViewHidden)
    getWebRTC()?.setNearbyVolume(nearbyVolume / 100)
  }, [selfViewHidden, nearbyVolume])

  const handleConnectOrToggleMic = async () => {
    const webRTC = getWebRTC()
    if (!webRTC) {
      setMediaError('O áudio ainda está conectando. Tente novamente em instantes.')
      return
    }
    if (!webRTC.hasAudioTrack) {
      let connected = activeMicId ? await webRTC.switchMicrophone(activeMicId) : false
      if (!connected) connected = await webRTC.getUserMedia(false)
      if (connected) setActiveMicId(webRTC.activeMicId)
      else setMediaError('Não foi possível ligar o microfone. Verifique a permissão do navegador.')
      return
    }
    if (!webRTC.toggleAudio()) setMediaError('Não foi possível alterar o microfone. Selecione um dispositivo e tente novamente.')
  }

  const handleToggleCam = async () => {
    const webRTC = getWebRTC()
    if (!webRTC) {
      setMediaError('A câmera ainda está conectando. Tente novamente em instantes.')
      return
    }
    if (!webRTC.hasCameraTrack) {
      let connected = activeCameraId ? await webRTC.getCameraMedia(activeCameraId) : false
      if (!connected) connected = await webRTC.getCameraMedia()
      if (connected) setActiveCameraId(webRTC.activeCameraId)
      else setMediaError('Não foi possível ligar a câmera. Verifique a permissão do navegador.')
      return
    }
    if (!webRTC.toggleVideo()) setMediaError('Não foi possível alterar a câmera. Selecione um dispositivo e tente novamente.')
  }

  // refresh the device lists whenever a picker is about to open
  const refreshDevices = async () => {
    const webRTC = getWebRTC()
    if (!webRTC) {
      setMediaError('Os dispositivos ainda estão conectando. Tente abrir o seletor novamente.')
      return
    }
    try {
      const { cameras: camList, mics: micList } = await webRTC.listDevices()
      setCameras(camList)
      setMics(micList)
      const saved = loadOfficePreferences()
      setActiveCameraId(webRTC.activeCameraId || saved.cameraId || undefined)
      setActiveMicId(webRTC.activeMicId || saved.microphoneId || undefined)
      if (camList.length === 0 && micList.length === 0) setMediaError('Nenhum microfone ou câmera foi encontrado.')
    } catch (error) {
      console.warn('Unable to list media devices', error)
      setMediaError('Não foi possível listar os dispositivos de áudio e vídeo.')
    }
  }

  const openMicMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    refreshDevices()
    setMicMenuAnchor(e.currentTarget)
  }

  const openCamMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    refreshDevices()
    setCamMenuAnchor(e.currentTarget)
  }

  const handleSelectMic = async (deviceId: string) => {
    const webRTC = getWebRTC()
    if (!webRTC) return
    const switched = await webRTC.switchMicrophone(deviceId)
    if (!switched) {
      setMediaError('Não foi possível selecionar esse microfone. Verifique a permissão do navegador.')
      return
    }
    setActiveMicId(webRTC.activeMicId || deviceId)
    setMicMenuAnchor(null)
  }

  const handleSelectCamera = async (deviceId: string) => {
    const webRTC = getWebRTC()
    if (!webRTC) return
    const switched = await webRTC.switchCamera(deviceId)
    if (!switched) {
      setMediaError('Não foi possível selecionar essa câmera. Verifique a permissão do navegador.')
      return
    }
    setActiveCameraId(webRTC.activeCameraId || deviceId)
    setCamMenuAnchor(null)
  }

  const handleToggleSelfView = () => {
    const webRTC = getWebRTC()
    if (!webRTC) return
    const next = !selfViewHidden
    webRTC.setSelfViewHidden(next)
    setSelfViewHidden(next)
  }

  return (
    <>
    <Snackbar open={Boolean(mediaError)} autoHideDuration={4500} onClose={() => setMediaError('')} anchorOrigin={{ vertical: 'top', horizontal: 'center' }}>
      <Alert severity="error" variant="filled" onClose={() => setMediaError('')}>{mediaError}</Alert>
    </Snackbar>
    <Bar className="skyoffice-bottom-bar">
      <Tooltip title="Your profile">
        <ProfileButton
          ringColor={statusMeta[status].color}
          onClick={(e) => setProfileAnchor(e.currentTarget)}
        >
          {myPlayerName.trim().charAt(0).toUpperCase() || 'L'}
        </ProfileButton>
      </Tooltip>

      <Popover
        open={Boolean(profileAnchor)}
        anchorEl={profileAnchor}
        onClose={() => setProfileAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <StatusMenu>
          <div className="name">{myPlayerName || 'Perfil'}</div>
          <div className="current-status" style={{ color: statusMeta[status].color }}>{statusMeta[status].label}</div>
          <StatusOptions>
            {(Object.keys(statusMeta) as Array<keyof typeof statusMeta>).map((key) => (
              <StatusOption
                key={key}
                selected={status === key}
                color={statusMeta[key].color}
                onClick={() => {
                  setStatus(key)
                  phaserEvents.emit(Event.MY_PLAYER_STATUS_CHANGE, key)
                }}
              >
                {statusMeta[key].icon}
                {statusMeta[key].label}
              </StatusOption>
            ))}
          </StatusOptions>
          <button
            type="button"
            style={{ marginTop: 12, width: '100%' }}
            onClick={() => {
              setAvatarChoice(loadSavedAvatar(myPlayerName) || DEFAULT_AVATAR_CHOICE)
              setAvatarEditorOpen(true)
              setProfileAnchor(null)
            }}
          >
            Edit avatar
          </button>
        </StatusMenu>
      </Popover>

      <EditAvatarDialog
        open={avatarEditorOpen}
        initialValue={avatarChoice}
        onClose={() => setAvatarEditorOpen(false)}
        onPreview={(choice) => {
          const game = phaserGame.scene.keys.game as Game | undefined
          game?.myPlayer?.setPlayerTexture(choice.avatar)
          game?.myPlayer?.setPlayerTint(choice.tint)
        }}
        onSave={(choice) => {
          saveAvatar(myPlayerName, choice)
          setAvatarChoice(choice)
          const game = phaserGame.scene.keys.game as Game | undefined
          game?.myPlayer?.setPlayerTexture(choice.avatar)
          game?.myPlayer?.setPlayerTint(choice.tint)
        }}
      />

      {loggedIn && (liveStudy || liveStudyError) && (
        <Tooltip title={liveStudyError || 'Seu tempo de estudo ao vivo no RankEstudos'}>
          <StudyTimer>
            {liveStudyError ? 'Timer indisponível' : liveStudy!.paused ? 'Pausado' : 'Estudando'}{liveStudy ? ' · ' : ''}
            {(() => {
              if (!liveStudy) return ''
              const elapsed = liveStudy.accumulated +
                (!liveStudy.paused && liveStudy.runningSince > 0
                  ? Math.max(0, clockTick - liveStudy.runningSince)
                  : 0)
              const totalSeconds = Math.floor(elapsed / 1000)
              const hours = Math.floor(totalSeconds / 3600)
              const minutes = Math.floor((totalSeconds % 3600) / 60)
              const seconds = totalSeconds % 60
              return hours > 0
                ? `${hours} h ${String(minutes).padStart(2, '0')} min`
                : `${minutes} min ${String(seconds).padStart(2, '0')} s`
            })()}
          </StudyTimer>
        </Tooltip>
      )}

      <Divider />

      {/* microphone: main button toggles, chevron opens device picker */}
      <SplitButton active={micOn}>
        <Tooltip title={micOn ? 'Mute microphone' : 'Connect microphone'}>
          <ToggleHalf type="button" aria-label={micOn ? 'Desligar microfone' : 'Ligar microfone'} onClick={() => void handleConnectOrToggleMic()}>
            {micOn ? <MicIcon fontSize="small" /> : <MicOffIcon fontSize="small" />}
          </ToggleHalf>
        </Tooltip>
        <ChevronHalf type="button" aria-label="Selecionar microfone" onClick={openMicMenu}>
          <KeyboardArrowUpIcon />
        </ChevronHalf>
      </SplitButton>

      <Popover
        open={Boolean(micMenuAnchor)}
        anchorEl={micMenuAnchor}
        onClose={() => setMicMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <DeviceMenu>
          <div className="title">Select microphone</div>
          {mics.length === 0 && <div className="title">No microphone found</div>}
          {mics.map((d) => (
            <DeviceItem
              key={d.deviceId}
              selected={d.deviceId === activeMicId}
              onClick={() => handleSelectMic(d.deviceId)}
            >
              <span className="check">{d.deviceId === activeMicId && <CheckIcon fontSize="small" />}</span>
              {d.label || 'Microphone'}
            </DeviceItem>
          ))}
          <DeviceMenuRow style={{ display: 'block' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Nearby audio volume</span><span>{nearbyVolume}%</span>
            </div>
            <Slider
              size="small"
              min={0}
              max={100}
              value={nearbyVolume}
              aria-label="Nearby audio volume"
              onChange={(_, value) => setNearbyVolume(Array.isArray(value) ? value[0] : value)}
            />
          </DeviceMenuRow>
        </DeviceMenu>
      </Popover>

      {/* camera: main button toggles, chevron opens device picker + hide self view */}
      <SplitButton active={camOn}>
        <Tooltip title={camOn ? 'Turn camera off' : 'Turn camera on'}>
          <ToggleHalf type="button" aria-label={camOn ? 'Desligar câmera' : 'Ligar câmera'} onClick={() => void handleToggleCam()}>
            {camOn ? <VideocamIcon fontSize="small" /> : <VideocamOffIcon fontSize="small" />}
          </ToggleHalf>
        </Tooltip>
        <ChevronHalf type="button" aria-label="Selecionar câmera" onClick={openCamMenu}>
          <KeyboardArrowUpIcon />
        </ChevronHalf>
      </SplitButton>

      <Popover
        open={Boolean(camMenuAnchor)}
        anchorEl={camMenuAnchor}
        onClose={() => setCamMenuAnchor(null)}
        anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
        transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      >
        <DeviceMenu>
          <div className="title">Select camera</div>
          {cameras.length === 0 && <div className="title">No camera found</div>}
          {cameras.map((d) => (
            <DeviceItem
              key={d.deviceId}
              selected={d.deviceId === activeCameraId}
              onClick={() => handleSelectCamera(d.deviceId)}
            >
              <span className="check">{d.deviceId === activeCameraId && <CheckIcon fontSize="small" />}</span>
              {d.label || 'Camera'}
            </DeviceItem>
          ))}
          <DeviceMenuRow>
            Hide self view
            <Switch size="small" checked={selfViewHidden} onChange={handleToggleSelfView} />
          </DeviceMenuRow>
        </DeviceMenu>
      </Popover>

      {Boolean(deskEditorAnchor) && createPortal(<DeskEditorMenu className="skyoffice-desk-editor">
        <div className="top">
          <div className="heading">Decoração</div>
          <button className="close" type="button" aria-label="Fechar decoração" onClick={closeDeskEditor}>×</button>
        </div>
          <div className="hint">Escolha uma peça e clique na mesa para colocá-la.</div>
          {deskIndex >= 0 && <>
          <input className="search" value={deskSearch} onChange={(event) => setDeskSearch(event.target.value)} placeholder="Buscar item" />
          <div className="categories">
            {[
              { value: 'Todos', name: 'Tudo', icon: <GridViewIcon fontSize="small" /> },
              { value: 'Office', name: 'Escritório', icon: <ChairAltIcon fontSize="small" /> },
              { value: 'Seating', name: 'Assentos', icon: <WeekendIcon fontSize="small" /> },
              { value: 'Technology', name: 'Tecnologia', icon: <ComputerIcon fontSize="small" /> },
            ].map(({ value, name, icon }) => <button key={value} type="button" title={name} aria-label={name} className={`category${deskCategory === value ? ' selected' : ''}`} onClick={() => setDeskCategory(value)}>{icon}</button>)}
          </div>
          <div className="items">
            {DESK_DECORATION_ASSETS.filter((asset) => (deskCategory === 'Todos' || asset.category === deskCategory) && asset.label.toLowerCase().includes(deskSearch.toLowerCase())).map((asset) => (
              <button
                key={asset.id}
                type="button"
                className={`item${selectedDeskDecoration?.id === asset.id ? ' selected' : ''}`}
                aria-label={asset.label}
                title={asset.label}
                onClick={() => {
                  const next = selectedDeskDecoration?.id === asset.id ? undefined : asset
                  setSelectedDeskDecoration(next)
                  phaserEvents.emit(Event.DESK_EDITOR_SELECT, next)
                }}
              >
                <DeskAssetPreview asset={asset} />
              </button>
            ))}
          </div>
          <div className="history">
            <button type="button" aria-label="Desfazer" title="Desfazer" onClick={() => phaserEvents.emit(Event.DESK_UNDO)}><UndoIcon fontSize="small" /></button>
            <button type="button" aria-label="Refazer" title="Refazer" onClick={() => phaserEvents.emit(Event.DESK_REDO)}><RedoIcon fontSize="small" /></button>
          </div>
  <p className="help">Clique para posicionar · Botão direito ou Shift + arraste move a câmera · R gira · Delete remove</p>
          </>}
      </DeskEditorMenu>, document.body)}
      {deskEditorAnchor && selectedDeskDecoration && decorationCursor.visible && createPortal(
        <DecorationCursorGhost style={{ left: decorationCursor.x, top: decorationCursor.y }} aria-hidden="true">
          <DeskAssetPreview asset={selectedDeskDecoration} cursor zoom={decorationCursor.zoom} />
        </DecorationCursorGhost>,
        document.body
      )}

      <Tooltip title="Lançar horas no RankEstudos">
        <RoundIconButton
          aria-label="Lançar horas no RankEstudos"
          disabled={!loggedIn || !myPlayerName}
          onClick={() => setRankEstudosOpen(true)}
        >
          <MenuBookIcon fontSize="small" />
        </RoundIconButton>
      </Tooltip>
      <RankEstudosDialog
        open={rankEstudosOpen}
        playerName={myPlayerName}
        onClose={() => setRankEstudosOpen(false)}
      />

      <Tooltip title="Foco em grupo">
        <RoundIconButton
          active={Boolean(focusAnchor) || groupFocus.status === 'running'}
          aria-label="Foco em grupo"
          onClick={(event) => {
            setIndividualFocusAnchor(null)
            setFocusAnchor(event.currentTarget)
          }}
        >
          <TimerIcon />
        </RoundIconButton>
      </Tooltip>
      <GroupFocusPanel anchorEl={focusAnchor} onClose={() => setFocusAnchor(null)} />
      <Tooltip title="Pomodoro individual">
        <RoundIconButton
          active={Boolean(individualFocusAnchor)}
          aria-label="Pomodoro individual"
          onClick={(event) => {
            setFocusAnchor(null)
            setIndividualFocusAnchor(event.currentTarget)
          }}
        >
          <TimerOutlinedIcon fontSize="small" />
        </RoundIconButton>
      </Tooltip>
      <IndividualFocusPanel anchorEl={individualFocusAnchor} onClose={() => setIndividualFocusAnchor(null)} />
      <TeamLabelDialog
        open={teamLabelOpen}
        currentName={teamLabel}
        onClose={() => setTeamLabelOpen(false)}
        onSave={(name) => {
          const game = phaserGame.scene.keys.game as Game | undefined
          game?.network?.updateTeamLabel(name)
          setTeamLabel(name)
          setTeamLabelOpen(false)
        }}
      />

      <Tooltip title={unreadCount > 0 ? `Chat · ${unreadCount} unread` : showChat ? 'Close chat' : 'Open chat'}>
        <RoundIconButton
          aria-label={unreadCount > 0 ? `Chat, ${unreadCount} unread messages` : 'Chat'}
          active={showChat}
          onClick={() => {
            const next = !showChat
            if (next) dispatch(setSelectedConversation('general'))
            dispatch(setShowChat(next))
            dispatch(setFocused(next))
            if (next) dispatch(markConversationRead('general'))
          }}
        >
          <ForumOutlinedIcon fontSize="small" />
          {unreadCount > 0 && <span className="unread-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
        </RoundIconButton>
      </Tooltip>
      <Tooltip title={showChat && selectedConversation === 'nearby' ? 'Fechar chat local' : 'Chat local · mensagem temporária'}>
        <RoundIconButton
          aria-label="Chat local temporário"
          active={showChat && selectedConversation === 'nearby'}
          onClick={() => {
            const isOpen = showChat && selectedConversation === 'nearby'
            if (isOpen) {
              dispatch(setShowChat(false))
              dispatch(setFocused(false))
            } else {
              dispatch(setSelectedConversation('nearby'))
              dispatch(setShowChat(true))
              dispatch(setFocused(true))
            }
          }}
        >
          <NearbyChatIcon />
        </RoundIconButton>
      </Tooltip>
      <Tooltip title="Preferences">
        <RoundIconButton
          aria-label="Preferences"
          active={preferencesOpen}
          onClick={() => {
            void refreshDevices()
            setPreferencesOpen(true)
          }}
        >
          <SettingsIcon fontSize="small" />
        </RoundIconButton>
      </Tooltip>
      <PreferencesDialog
        open={preferencesOpen}
        onClose={() => setPreferencesOpen(false)}
        status={status}
        setStatus={setStatus}
        microphones={mics}
        cameras={cameras}
        activeMicId={activeMicId}
        activeCameraId={activeCameraId}
        onSelectMic={handleSelectMic}
        onSelectCamera={handleSelectCamera}
        nearbyVolume={nearbyVolume}
        setNearbyVolume={setNearbyVolume}
        selfViewHidden={selfViewHidden}
        setSelfViewHidden={handleToggleSelfView}
      />
    </Bar>
    </>
  )
}
