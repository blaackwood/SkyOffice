import React, { FormEvent, useEffect, useRef, useState } from 'react'
import styled from 'styled-components'
import type { MeetingChatMessage, MeetingRoomPresence } from '../events/EventCenter'
import { Event, phaserEvents } from '../events/EventCenter'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { useAppDispatch, useAppSelector } from '../hooks'
import { markConversationRead, setFocused, setSelectedConversation, setShowChat } from '../stores/ChatStore'
import MicIcon from '@mui/icons-material/Mic'
import MicOffIcon from '@mui/icons-material/MicOff'
import VideocamIcon from '@mui/icons-material/Videocam'
import VideocamOffIcon from '@mui/icons-material/VideocamOff'
import SentimentSatisfiedAltIcon from '@mui/icons-material/SentimentSatisfiedAlt'
import PresentToAllIcon from '@mui/icons-material/PresentToAll'
import PanToolIcon from '@mui/icons-material/PanTool'
import SettingsIcon from '@mui/icons-material/Settings'
import CallEndIcon from '@mui/icons-material/CallEnd'
import MapOutlinedIcon from '@mui/icons-material/MapOutlined'
import OpenInFullIcon from '@mui/icons-material/OpenInFull'
import VolumeUpIcon from '@mui/icons-material/VolumeUp'
import VolumeOffIcon from '@mui/icons-material/VolumeOff'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import LockOpenOutlinedIcon from '@mui/icons-material/LockOpenOutlined'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline'
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined'
import { playChatNotificationSound, primeChatNotificationSound } from '../services/ChatNotificationSound'

const MEETING_HAND_SIGNAL = '__skyoffice_hand__:'
const MEETING_EMOJIS = [['😀','feliz'],['😃','sorriso'],['😄','sorriso'],['😁','feliz'],['😆','risada'],['😅','suor'],['🤣','rolando de rir'],['😂','rindo'],['🙂','sorriso'],['😉','piscando'],['😊','feliz'],['🥰','amor'],['😍','apaixonado'],['🤩','animado'],['😋','delicia'],['🤔','pensando'],['🙄','revirando olhos'],['😎','legal'],['🥳','festa'],['😭','chorando'],['😢','triste'],['😡','bravo'],['👍','positivo'],['👎','negativo'],['👏','palmas'],['🙌','comemorando'],['🙏','obrigado'],['🤝','aperto de mao'],['❤️','coracao'],['💙','coracao azul'],['💚','coracao verde'],['🔥','fogo'],['🎉','festa'],['✨','brilho'],['✅','certo'],['👀','olhos']]

const RoomStatusPill = styled.div`
  position:fixed;z-index:8500;top:13px;left:68px;height:32px;max-width:min(300px,calc(100vw - 140px));
  display:flex;align-items:center;gap:6px;padding:2px 4px 2px 6px;border:0;border-radius:8px;
  background:#2b2c31;color:#e7e8ec;font:13px Arial,sans-serif;box-shadow:0 1px 3px #0005;
  .room-avatars { display:flex;align-items:center;padding-left:1px; }
  .room-avatar { width:18px;height:18px;margin-left:-5px;display:grid;place-items:center;border:1px solid #2b2c31;border-radius:50%;font-size:9px;font-weight:700;color:#29232d; }
  .room-avatar:first-child { margin-left:0; }
  .room-avatar-count { min-width:17px;padding:0 3px;background:#383c45;color:#e9eaf0;font-size:9px; }
  .room-title { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650; }
  .room-lock { width:25px;height:25px;flex:0 0 25px;display:grid;place-items:center;border:0;border-radius:6px;background:#393b40;color:#d9dbe1;cursor:pointer; }
  .room-lock:hover { background:#4a4c52; }
  .room-lock.locked { background:#e8344f;color:#852131; }
  .room-lock svg { font-size:16px; }
`

const Screen = styled.section`
  position: fixed; inset: 0; z-index: 8000; display: grid;
  grid-template-columns: minmax(0, 1fr) 320px; grid-template-rows: 48px minmax(0, 1fr) 70px;
  color: #e8e9ed; background: #070809; font: 14px Arial, sans-serif;
  header { grid-column: 1 / -1; display:flex; align-items:center; gap:10px; padding:0 22px; background:#090a0c; border-bottom:1px solid #17181b; }
  header strong { font-size:15px; } header span { color:#9a9da4; font-size:12px; }
  header .close { margin-left:auto;width:30px;height:30px;border-radius:50%;background:transparent;font-size:19px; }
  header .close:hover { background:#25272b; }
  button { color:inherit; border:0; cursor:pointer; font:inherit; }
  .stage { position:relative; min-width:0; min-height:0; display:flex; align-items:center; justify-content:center; padding:14px 8px; }
  .tiles { width:100%; height:min(60vh,430px); display:grid; grid-template-columns:repeat(auto-fit,minmax(min(320px,100%),1fr)); grid-auto-rows:minmax(220px,1fr); gap:8px; }
  .tiles.spotlight { position:relative;width:100%;height:100%;display:block; }
  .tile { position:relative; min-height:0; overflow:hidden; display:grid; place-items:center; border-radius:7px; background:#101112; }
  .tiles.spotlight .tile.spotlight-main { position:absolute;inset:0;width:100%;height:100%; }
  .tiles.spotlight .tile.spotlight-self,.tiles.spotlight .tile.spotlight-secondary { position:absolute;z-index:5;right:14px;bottom:14px;width:min(28%,320px);height:auto;min-height:0;aspect-ratio:16/9;border:1px solid #55585d;box-shadow:0 4px 18px #0009; }
  .tiles.spotlight .tile.spotlight-hidden { display:none; }
  .avatar { position:relative;z-index:1;display:grid; place-items:center; width:58px;height:58px;border:2px solid #383b40;border-radius:50%;background:#202328;font-size:22px;font-weight:700; }
  .tile video.meeting-video[style*='display: block'] ~ .avatar { display:none; }
  .tile-name { position:absolute;z-index:1;left:10px;bottom:10px;padding:5px 8px;border-radius:5px;background:#08090bd9;font-size:12px;text-align:left; }
  .tile.is-speaking { border:2px solid #22c55e;box-shadow:0 0 0 1px #22c55e; }
  .tile.hand-raised { outline:3px solid #facc15;outline-offset:-3px; }
  .hand-indicator { position:absolute;z-index:3;top:9px;right:46px;width:29px;height:29px;display:grid;place-items:center;border-radius:50%;background:#facc15;color:#24200b;box-shadow:0 2px 8px #0009; }
  .hand-indicator svg { font-size:18px; }
  .tile-fullscreen { position:absolute;z-index:3;top:8px;right:8px;width:30px;height:30px;display:none;place-items:center;padding:0;border-radius:6px;background:#111216d9;color:#f0f1f4; }
  .tile:hover .tile-fullscreen,.tile:focus-within .tile-fullscreen { display:grid; }
  .tile-fullscreen svg { font-size:18px; }
  .tile-hover-controls { position:absolute;z-index:2;left:50%;top:50%;transform:translate(-50%,-50%);display:none;align-items:center;gap:3px;padding:5px 7px;border-radius:13px;background:#111216ef;box-shadow:0 3px 12px #0008; }
  .tile:hover .tile-hover-controls,.tile:focus-within .tile-hover-controls { display:flex; }
  .tile-hover-controls button { width:34px;height:34px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:#292c32;color:#e5e6ea;cursor:pointer; }
  .tile-hover-controls button:hover { background:#424650; }
  .tile-hover-controls svg { font-size:19px; }
  .tile-volume-panel { position:absolute;z-index:4;top:calc(50% + 28px);left:50%;transform:translateX(-50%);width:190px;padding:10px 12px;border-radius:8px;background:#202125;box-shadow:0 5px 18px #000a;color:#e5e6ea;font-size:12px; }
  .tile-volume-title { display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:14px; }
  .tile-volume-title svg { font-size:16px; }
  .tile-volume-slider { width:100%;height:5px;margin:0 0 10px;accent-color:#535de3;cursor:pointer; }
  .tile-volume-mute { display:flex;align-items:center;gap:7px;white-space:nowrap; }
  .tile-volume-mute input { width:14px;height:14px;margin:0 0 0 auto;accent-color:#535de3; }
  .chat { grid-column:2; grid-row:2 / 4; min-height:0; margin:6px 8px 70px 0; display:flex; flex-direction:column; background:#101112; border:1px solid #1d1f22; border-radius:8px; }
  &.no-panel { grid-template-columns:minmax(0,1fr); }
  &.no-panel .chat { display:none; }
  .chat { position:relative; }
  .chat-title { padding:18px 16px;border-bottom:1px solid #24262a;font-weight:650; }
  .messages { flex:1;overflow:auto;padding:14px 12px;display:flex;flex-direction:column;justify-content:flex-end;gap:14px; }
  .message { display:grid;grid-template-columns:24px minmax(0,1fr);align-items:start;gap:8px;padding:8px 5px 10px;color:#d5d6d9;line-height:1.4;overflow-wrap:anywhere;border-bottom:1px solid #26282d; }
  .message-avatar { width:23px;height:23px;display:grid;place-items:center;border-radius:50%;color:#33243a;font-size:12px;font-weight:700; }
  .message-copy { min-width:0; }
  .message-header { display:flex;align-items:baseline;gap:5px;margin:0 0 2px;line-height:1.3; }
  .message-header b { color:#c3c5ca;font-size:13px;font-weight:700; }
  .message-time { color:#858991;font-size:11px;white-space:nowrap; }
  .message-text { color:#d5d6d9;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere; }
  .meeting-composer { position:relative;display:grid;grid-template-columns:minmax(0,1fr) 36px;gap:5px;padding:10px;border-top:1px solid #25272b; }
  .meeting-composer input[type='text'] { grid-column:1 / -1;width:100%;min-width:0;padding:11px 10px;color:#eee;background:#181a1e;border:1px solid #292c31;border-radius:7px;outline:none; }
  .composer-tools { display:flex;align-items:center;gap:3px; }
  .composer-tools button { width:32px;height:30px;display:grid;place-items:center;padding:0;border-radius:6px;background:transparent;color:#c5c8d0; }
  .composer-tools button:hover { background:#292c33; }
  .composer-tools svg { width:17px;height:17px; }
  .composer-send { width:36px;height:32px;border-radius:7px;background:#3547ca;font-size:18px; }
  .selected-attachment { grid-column:1 / -1;display:flex;align-items:center;gap:6px;min-width:0;color:#c5c8d0;font-size:11px; }
  .selected-attachment span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .composer-popup { position:absolute;z-index:5;left:8px;bottom:calc(100% + 6px);width:min(285px,calc(100% - 16px));max-height:300px;overflow:auto;padding:9px;border:1px solid #363a44;border-radius:10px;background:#191b20;box-shadow:0 8px 24px #0009; }
  .composer-popup input { width:100%;padding:7px 8px;color:#eee;background:#22252b;border:1px solid #393d47;border-radius:6px; }
  .emoji-grid { display:grid;grid-template-columns:repeat(8,1fr);gap:2px;margin-top:7px; }
  .emoji-grid button { width:30px;height:30px;padding:0;border-radius:5px;background:transparent;font-size:19px; }
  .emoji-grid button:hover { background:#30343d; }
  .mention-option { width:100%;display:flex;align-items:center;gap:8px;padding:7px;border-radius:6px;background:transparent;text-align:left; }
  .mention-option:hover { background:#30343d; }
  .mention-avatar { width:24px;height:24px;display:grid;place-items:center;border-radius:50%;background:#45486e;font-size:11px;font-weight:700; }
  .meeting-attachment { display:inline-flex;align-items:center;gap:6px;margin-top:5px;padding:5px 7px;border:1px solid #343943;border-radius:6px;color:#b8c5ff;background:#20232a;text-decoration:none;font-size:12px; }
  .meeting-utilities { position:fixed;z-index:8250;right:16px;bottom:22px;display:flex;gap:5px;padding:2px;border:0;border-radius:10px;background:transparent; }
  .meeting-utilities button { position:relative;width:34px;height:34px;display:grid;place-items:center;border-radius:8px;background:transparent;color:#d6d8de; }
  .meeting-utilities button:hover,.meeting-utilities button.active { background:#2b2e36; }
  .meeting-utilities svg { font-size:19px; }
  .people-count { position:absolute;top:-5px;right:-3px;min-width:15px;height:15px;display:grid;place-items:center;padding:0 3px;border-radius:9px;background:#626771;color:#fff;font-size:9px;font-weight:700; }
  .utility-title { display:flex;align-items:center;justify-content:space-between;padding:15px 13px;border-bottom:1px solid #24262a;font-size:14px;font-weight:650; }
  .utility-title button { width:28px;height:28px;border-radius:6px;background:transparent;color:#b9bbc2;font-size:18px; }
  .utility-content { display:flex;flex-direction:column;gap:10px;padding:12px; }
  .utility-action { min-height:34px;padding:7px 10px;border-radius:7px;background:#202227;text-align:center;color:#d4d6dc; }
  .utility-line { display:flex;align-items:center;gap:8px;color:#c8cad0;font-size:13px; }
  .utility-line svg { width:16px;height:16px;color:#aeb2bc; }
  .people-list { display:flex;flex-direction:column;gap:3px;padding:8px; }
  .person-row { display:flex;align-items:center;gap:8px;min-height:40px;padding:4px 8px;border-radius:7px;background:transparent;text-align:left;color:#d1d3d9; }
  .person-row:hover { background:#24262c; }
  .person-avatar-wrap { position:relative;width:25px;height:25px;flex:none; }
  .person-avatar { width:25px;height:25px;display:grid;place-items:center;border-radius:50%;background:#e7a5a5;color:#342b2b;font-size:12px;font-weight:700; }
  .person-online { position:absolute;right:-1px;bottom:-1px;width:9px;height:9px;border:2px solid #111214;border-radius:50%;background:#26cb78; }
  .send { width:38px;border-radius:7px;background:#3547ca;font-size:18px; }
  .permission-hint { margin-left:auto;color:#e8b974;font-size:12px; }
  .toolbar { position:fixed;z-index:8200;left:50%;bottom:18px;transform:translateX(-50%);display:flex;align-items:center;gap:7px;padding:8px 10px;background:#121317ed;border:1px solid #25272d;border-radius:17px;box-shadow:0 5px 20px #0008; }
  .split-control { position:relative;display:flex;align-items:center;gap:0;border-radius:11px;background:#1d2027;overflow:visible; }
  .split-control .tool { border-radius:0;width:34px; }.split-control .tool:first-child { border-radius:11px 0 0 11px; }
  .split-control .split-arrow { width:20px;height:38px;padding:0;border-radius:0 11px 11px 0;background:#1d2027;color:#b9bdc6;font-size:11px; }
  .split-control .split-arrow:hover { background:#30343d; }
  .tool { position:relative;width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:transparent;color:#d7d9df; }
  .tool:hover,.tool.on { background:#2b2e36; }.tool svg { font-size:19px; }
  .meeting-chat-tool { position:relative; }
  .meeting-chat-unread { position:absolute;right:-1px;top:-2px;min-width:15px;height:15px;padding:0 3px;display:grid;place-items:center;border-radius:9px;background:#6b707b;color:#fff;font-size:9px;font-weight:700; }
  .profile { background:#262a34;font-weight:700; }.profile::after { content:'';position:absolute;right:0;bottom:0;width:9px;height:9px;border:2px solid #15161a;border-radius:50%;background:#26d07c; }
  .muted { color:#e1e3e8; }.muted svg { color:#e1e3e8; }
  .separator { width:1px;height:22px;background:#34363d;margin:0 3px; }
  .hangup { color:#fa5964;background:#373be0;border-radius:12px;margin-left:7px; }.hangup:hover { background:#484de9; }
  .popup { position:absolute;bottom:54px;left:50%;transform:translateX(-50%);display:flex;gap:6px;padding:9px;border:1px solid #30333a;border-radius:12px;background:#191b20;box-shadow:0 6px 22px #0009;white-space:nowrap; }
  .popup button { min-width:34px;height:34px;padding:0 8px;border-radius:7px;background:#282b32; }.popup button:hover { background:#3a3e49; }
  .device-popup { position:absolute;z-index:2;left:0;bottom:48px;display:flex;flex-direction:column;align-items:stretch;gap:4px;width:min(310px,80vw);max-height:42vh;overflow:auto;padding:7px;border:1px solid #30333a;border-radius:11px;background:#191b20;box-shadow:0 6px 22px #0009; }
  .device-popup button { width:100%;min-height:34px;padding:6px 9px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;border-radius:7px;background:#282b32; }
  &.compact-shell { display:contents; }
  @media(max-width:700px) { grid-template-columns:minmax(0,1fr) 280px; .tiles{grid-template-columns:1fr;grid-auto-rows:minmax(120px,1fr);height:min(60vh,430px)} .stage{padding:8px} }
  @media(max-width:540px) { grid-template-columns:minmax(0,1fr);grid-template-rows:48px minmax(0,1fr) 58px; .chat{display:none}.tile{min-height:120px}.permission-hint{font-size:10px} }
`

const MiniMeeting = styled.aside`
  position:fixed;z-index:8200;top:14px;left:50%;transform:translateX(-50%);
  width:min(var(--mini-width),calc(100vw - 24px));color:#e8e9ed;
  .mini-tiles { display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px; }
  .mini-tile { position:relative;min-width:0;aspect-ratio:16/9;display:grid;place-items:center;border:1px solid #393b40;border-radius:7px;background:#171719;box-sizing:border-box; }
  .mini-tile.is-speaking { border:2px solid #22c55e;box-shadow:0 0 0 1px #22c55e; }
  .mini-tile.hand-raised { outline:3px solid #facc15;outline-offset:-3px; }
  .mini-tile:fullscreen { width:100vw;height:100vh;aspect-ratio:auto;border:0;border-radius:0;background:#090a0c; }
  .mini-avatar { position:relative;z-index:1;width:40px;height:40px;display:grid;place-items:center;border:2px solid #55585d;border-radius:50%;background:#252830;font-weight:700;font-size:18px; }
  .mini-tile video.meeting-video[style*='display: block'] ~ .mini-avatar { display:none; }
  .mini-name { position:absolute;z-index:1;left:5px;bottom:5px;max-width:calc(100% - 10px);min-height:22px;display:flex;align-items:center;gap:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:2px 6px;border-radius:4px;background:#050609e8;font-size:11px;box-sizing:border-box; }
  .mini-name-label { min-width:0;overflow:hidden;text-overflow:ellipsis; }
  .mini-mic-status { display:grid;place-items:center;color:#fa5261; }
  .mini-mic-status svg { font-size:14px; }
  .mini-hand-indicator { position:absolute;z-index:3;top:5px;right:35px;width:23px;height:23px;display:grid;place-items:center;border-radius:50%;background:#facc15;color:#24200b;box-shadow:0 2px 7px #0009; }
  .mini-hand-indicator svg { font-size:15px; }
  .mini-hover-controls { position:absolute;z-index:2;left:50%;top:50%;transform:translate(-50%,-50%);display:none;align-items:center;gap:3px;padding:5px 7px;border-radius:13px;background:#111216eF;box-shadow:0 3px 12px #0008; }
  .mini-tile:hover .mini-hover-controls,.mini-tile:focus-within .mini-hover-controls { display:flex; }
  .mini-hover-controls button { width:30px;height:30px;display:grid;place-items:center;padding:0;border:0;border-radius:50%;background:#292c32;color:#e5e6ea;cursor:pointer; }
  .mini-hover-controls button:hover { background:#424650; }
  .mini-hover-controls svg { font-size:17px; }
  .mini-fullscreen { position:absolute;z-index:3;top:6px;right:6px;width:27px;height:27px;display:none;place-items:center;padding:0;border:0;border-radius:6px;background:#111216d9;color:#f0f1f4;cursor:pointer; }
  .mini-tile:hover .mini-fullscreen,.mini-tile:focus-within .mini-fullscreen { display:grid; }
  .mini-fullscreen svg { font-size:17px; }
  .mini-volume-panel { position:absolute;z-index:4;top:calc(50% + 25px);left:50%;transform:translateX(-50%);width:184px;padding:10px 12px;border-radius:8px;background:#202125;box-shadow:0 5px 18px #000a;color:#e5e6ea;font-size:12px; }
  .mini-volume-title { display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:14px; }
  .mini-volume-title svg { font-size:16px; }
  .mini-volume-slider { width:100%;height:5px;margin:0 0 10px;accent-color:#535de3;cursor:pointer; }
  .mini-volume-mute { display:flex;align-items:center;gap:7px;white-space:nowrap; }
  .mini-volume-mute input { width:14px;height:14px;margin:0 0 0 auto;accent-color:#535de3; }
  .mini-footer { height:16px;display:flex;align-items:center;justify-content:center;margin-top:3px; }
  .mini-size-grip { width:64px;height:14px;display:grid;place-items:center;margin:0;padding:0;border:0;border-radius:8px;background:transparent;cursor:ns-resize;touch-action:none; }
  .mini-size-grip::before { content:'';width:48px;height:4px;border-radius:4px;background:#686b72;transition:background .15s,transform .15s; }
  .mini-size-grip:hover::before,.mini-size-grip:focus-visible::before { background:#d5d7dc;transform:scaleY(1.35); }
  button { color:inherit;border:0;cursor:pointer;font:inherit; }
`

interface Props { presence: MeetingRoomPresence; onClose: () => void }

export default function MeetingPanel({ presence, onClose }: Props) {
  const [messages, setMessages] = useState<MeetingChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [mediaError, setMediaError] = useState('')
  const [sharingScreen, setSharingScreen] = useState(false)
  const [compact, setCompact] = useState(false)
  const [roomLocked, setRoomLocked] = useState(false)
  const [spotlightParticipantId, setSpotlightParticipantId] = useState<string | null>(null)
  const [rightPanel, setRightPanel] = useState<'chat' | 'people' | 'details' | null>('chat')
  const [composerPopup, setComposerPopup] = useState<'emoji' | 'mention' | null>(null)
  const [emojiSearch, setEmojiSearch] = useState('')
  const [selectedAttachment, setSelectedAttachment] = useState<File | null>(null)
  const [attachmentError, setAttachmentError] = useState('')
  const [meetingLinkCopied, setMeetingLinkCopied] = useState(false)
  const [startedAt] = useState(() => Date.now())
  const [miniWidth, setMiniWidth] = useState(480)
  const [mutedParticipants, setMutedParticipants] = useState<Record<string, boolean>>({})
  const [hiddenParticipantCameras, setHiddenParticipantCameras] = useState<Record<string, boolean>>({})
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>({})
  const [volumePanelId, setVolumePanelId] = useState<string | null>(null)
  const [handRaised, setHandRaised] = useState(false)
  const [raisedHands, setRaisedHands] = useState<Record<string, boolean>>({})
  const [popup, setPopup] = useState<'emoji' | 'settings' | 'microphone' | 'camera' | null>(null)
  const [devices, setDevices] = useState<{ cameras: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cameras: [], mics: [] })
  const tilesRef = useRef<HTMLDivElement>(null)
  const resizeDragRef = useRef<{ pointerId: number; startY: number; startWidth: number } | null>(null)
  const meetingVideosRef = useRef(new Set<HTMLVideoElement>())
  const meetingFileRef = useRef<HTMLInputElement>(null)
  const meetingInputRef = useRef<HTMLInputElement>(null)
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const dispatch = useAppDispatch()
  const showChat = useAppSelector((state) => state.chat.showChat)
  const selectedConversation = useAppSelector((state) => state.chat.selectedConversation)
  const unreadCount = useAppSelector((state) => Object.values(state.chat.unreadByConversation).reduce((total, count) => total + count, 0))
  const myName = useAppSelector((state) => state.user.myPlayerName)
  const micEnabled = useAppSelector((state) => state.user.micEnabled)
  const cameraEnabled = useAppSelector((state) => state.user.cameraEnabled)
  const game = phaserGame.scene.keys.game as Game | undefined
  const network = game?.network
  const webRTC = network?.webRTC
  const roomTitle = presence.roomName

  useEffect(() => {
    setRoomLocked(network?.isMeetingRoomLocked(presence.roomId) ?? false)
    const listener = (roomId: string, locked: boolean) => {
      if (roomId === presence.roomId) setRoomLocked(locked)
    }
    phaserEvents.on(Event.MEETING_ROOM_LOCK_CHANGED, listener)
    return () => { phaserEvents.off(Event.MEETING_ROOM_LOCK_CHANGED, listener) }
  }, [network, presence.roomId])

  const toggleRoomLock = () => {
    const next = !roomLocked
    setRoomLocked(next)
    network?.setMeetingRoomLocked(presence.roomId, next)
  }

  const startMiniResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    resizeDragRef.current = { pointerId: event.pointerId, startY: event.clientY, startWidth: miniWidth }
  }

  const moveMiniResize = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = resizeDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const nextWidth = drag.startWidth + (event.clientY - drag.startY) * 2
    setMiniWidth(Math.max(360, Math.min(900, Math.round(nextWidth / 10) * 10)))
  }

  const stopMiniResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (resizeDragRef.current?.pointerId === event.pointerId) resizeDragRef.current = null
  }

  const handleMiniResizeKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    setMiniWidth((width) => Math.max(360, Math.min(900, width + (event.key === 'ArrowDown' ? 20 : -20))))
  }

  const roomStatusPill = <RoomStatusPill>
    <div className="room-avatars" aria-label={`${presence.participants.length} participantes`}>
      {presence.participants.slice(0, 3).map((participant, index) => <span key={participant.playerId} className="room-avatar" aria-label={participant.name} style={{ background: `hsl(${(index * 79 + 224) % 360} 55% 78%)` }}>{(participant.name.trim()[0] || '?').toLocaleUpperCase()}</span>)}
      {presence.participants.length > 3 && <span className="room-avatar room-avatar-count">+{presence.participants.length - 3}</span>}
    </div>
    <span className="room-title">{roomTitle}</span>
    <button className={`room-lock${roomLocked ? ' locked' : ''}`} type="button" aria-label={roomLocked ? 'Destrancar portas da sala' : 'Trancar portas da sala'} aria-pressed={roomLocked} onClick={toggleRoomLock}>{roomLocked ? <LockOutlinedIcon /> : <LockOpenOutlinedIcon />}</button>
  </RoomStatusPill>

  useEffect(() => {
    if (!webRTC) return
    webRTC.prepareMutedMeeting()
    setSharingScreen(false)
  }, [presence.roomId, webRTC])

  useEffect(() => {
    document.body.classList.add('meeting-active')
    return () => {
      document.body.classList.remove('meeting-active')
      document.body.classList.remove('meeting-fullscreen')
    }
  }, [])

  useEffect(() => {
    document.body.classList.toggle('meeting-fullscreen', !compact)
    return () => { document.body.classList.remove('meeting-fullscreen') }
  }, [compact])

  useEffect(() => {
    const listener = (message: MeetingChatMessage) => {
      if (message.roomId === presence.roomId) setMessages((current) => [...current, message].slice(-200))
    }
    phaserEvents.on(Event.MEETING_CHAT_MESSAGE, listener)
    return () => { phaserEvents.off(Event.MEETING_CHAT_MESSAGE, listener) }
  }, [presence.roomId])

  useEffect(() => {
    setHandRaised(false)
    setRaisedHands({})
    setSpotlightParticipantId(null)
    setRightPanel('chat')
    setComposerPopup(null)
  }, [presence.roomId])

  useEffect(() => {
    const listener = (message: MeetingChatMessage) => {
      if (message.roomId !== presence.roomId || !message.content.startsWith(MEETING_HAND_SIGNAL)) return
      const raised = message.content.slice(MEETING_HAND_SIGNAL.length) === 'up'
      setRaisedHands((current) => ({ ...current, [message.senderId]: raised }))
      if (raised && message.senderId !== sessionId) playChatNotificationSound()
    }
    phaserEvents.on(Event.MEETING_CHAT_MESSAGE, listener)
    return () => { phaserEvents.off(Event.MEETING_CHAT_MESSAGE, listener) }
  }, [presence.roomId, sessionId])

  useEffect(() => {
    const listener = (playerId: string, speaking: boolean) => {
      const video = webRTC?.getVideoElement(playerId)
      video?.classList.toggle('speaking', speaking)
      video?.parentElement?.classList.toggle('is-speaking', speaking)
    }
    phaserEvents.on(Event.PLAYER_VOICE_ACTIVITY, listener)
    return () => { phaserEvents.off(Event.PLAYER_VOICE_ACTIVITY, listener) }
  }, [webRTC])

  useEffect(() => {
    const moveVideoElements = () => {
      const grid = document.querySelector<HTMLElement>('.video-grid')
      const tiles = tilesRef.current
      if (!grid || !tiles) return
      presence.participants.forEach((participant) => {
        const tile = tiles.querySelector<HTMLElement>(`[data-participant="${CSS.escape(participant.playerId)}"]`)
        const video = webRTC?.getVideoElement(participant.playerId)
        if (tile && video && video.parentElement !== tile) {
          video.classList.add('meeting-video')
          meetingVideosRef.current.add(video)
          tile.prepend(video)
        }
        if (tile && video) tile.classList.toggle('is-speaking', video.classList.contains('speaking'))
      })
    }
    const interval = window.setInterval(moveVideoElements, 400)
    moveVideoElements()
    return () => {
      window.clearInterval(interval)
    }
  }, [presence.participants, sessionId, webRTC, compact])

  useEffect(() => () => {
    meetingVideosRef.current.forEach((video) => {
      video.classList.remove('meeting-video')
      document.querySelector('.video-grid')?.append(video)
    })
    meetingVideosRef.current.clear()
  }, [])

  const stopGameKeyboard = (event: React.KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
  }

  const sendMessage = (event: FormEvent) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content && !selectedAttachment) return
    if (selectedAttachment && selectedAttachment.size > 3 * 1024 * 1024) {
      setAttachmentError('O arquivo deve ter até 3 MB.')
      return
    }
    const send = (attachment?: { name: string; mimeType: string; data: string }) => {
      network?.sendMeetingChatMessage(presence.roomId, content, attachment)
      setDraft('')
      setSelectedAttachment(null)
      setAttachmentError('')
      setComposerPopup(null)
    }
    if (selectedAttachment) {
      const reader = new FileReader()
      reader.onload = () => {
        if (typeof reader.result === 'string') send({ name: selectedAttachment.name, mimeType: selectedAttachment.type || 'application/octet-stream', data: reader.result })
        else setAttachmentError('Não foi possível ler esse arquivo.')
      }
      reader.onerror = () => setAttachmentError('Não foi possível ler esse arquivo.')
      reader.readAsDataURL(selectedAttachment)
      return
    }
    send()
  }

  const insertMeetingText = (text: string) => {
    const input = meetingInputRef.current
    if (!input) { setDraft((current) => `${current}${text}`); return }
    const start = input.selectionStart ?? draft.length
    const end = input.selectionEnd ?? start
    const next = `${draft.slice(0, start)}${text}${draft.slice(end)}`
    setDraft(next)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const selectMeetingMention = (participant: MeetingRoomPresence['participants'][number]) => {
    const token = draft.match(/@[\p{L}\p{N}_]*$/u)
    const start = token ? draft.length - token[0].length : draft.length
    const name = participant.name.replace(/\s+/g, '')
    const next = `${draft.slice(0, start)}@${name} `
    setDraft(next)
    setComposerPopup(null)
    requestAnimationFrame(() => {
      meetingInputRef.current?.focus()
      meetingInputRef.current?.setSelectionRange(next.length, next.length)
    })
  }

  const openDirectChat = (participantId: string) => {
    if (participantId === sessionId) dispatch(setSelectedConversation('general'))
    else dispatch(setSelectedConversation(`dm:${participantId}`))
    dispatch(setShowChat(true))
    dispatch(setFocused(true))
  }

  const copyMeetingLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setMeetingLinkCopied(true)
      window.setTimeout(() => setMeetingLinkCopied(false), 1800)
    } catch {
      setMediaError('Não foi possível copiar o link desta sala.')
    }
  }

  const changeSpotlight = (participantId: string) => {
    setSpotlightParticipantId(participantId)
  }

  const toggleMicrophone = async () => {
    if (!webRTC) return
    setMediaError('')
    if (micEnabled) webRTC.toggleAudio()
    else if (!webRTC.hasAudioTrack) {
      if (!await webRTC.getUserMedia(false)) setMediaError('Não foi possível ligar o microfone. Verifique a permissão do navegador.')
    } else webRTC.toggleAudio()
  }

  const toggleCamera = async () => {
    if (!webRTC) return
    setMediaError('')
    if (sharingScreen) {
      webRTC.stopMeetingScreenShare()
      setSharingScreen(false)
    }
    if (cameraEnabled) webRTC.toggleVideo()
    else if (!webRTC.hasCameraTrack) {
      if (!await webRTC.getCameraMedia()) setMediaError('Não foi possível ligar a câmera. Verifique a permissão do navegador.')
    } else webRTC.toggleVideo()
  }

  const toggleScreenShare = async () => {
    if (sharingScreen) {
      webRTC?.stopMeetingScreenShare()
      setSharingScreen(false)
      return
    }
    const started = await webRTC?.startMeetingScreenShare()
    if (started) setSharingScreen(true)
    else setMediaError('Não foi possível compartilhar a tela.')
  }

  const sendReaction = (reaction: string) => {
    network?.sendMeetingChatMessage(presence.roomId, reaction)
    setPopup(null)
  }

  const toggleHand = () => {
    const next = !handRaised
    setHandRaised(next)
    primeChatNotificationSound()
    setRaisedHands((current) => ({ ...current, [sessionId]: next }))
    network?.sendMeetingChatMessage(presence.roomId, `${MEETING_HAND_SIGNAL}${next ? 'up' : 'down'}`)
  }

  const openDevices = async (kind: 'microphone' | 'camera') => {
    if (popup === kind) {
      setPopup(null)
      return
    }
    setPopup(kind)
    const available = await webRTC?.listDevices()
    if (available) setDevices(available)
  }

  const leaveMeetingView = () => {
    webRTC?.stopMeetingScreenShare()
    webRTC?.prepareMutedMeeting()
    onClose()
  }

  const participantTiles = (mini = false, featuredId: string | null = null) => <div className={`${mini ? 'mini-tiles' : 'tiles'}${featuredId && !mini ? ' spotlight' : ''}`} ref={tilesRef}>
    {presence.participants.map((participant, index) => <div
      className={`${mini ? 'mini-tile' : 'tile'}${raisedHands[participant.playerId] ? ' hand-raised' : ''}${featuredId && !mini ? participant.playerId === featuredId ? ' spotlight-main' : participant.playerId === sessionId ? ' spotlight-self' : ' spotlight-secondary' : ''}`}
      data-participant={participant.playerId}
      key={participant.playerId}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('button,input,a')) return
        if (!mini) changeSpotlight(participant.playerId)
      }}
      title={!mini ? `Destacar ${participant.name}` : undefined}
    >
      <span className={mini ? 'mini-avatar' : 'avatar'} style={{ background: `hsl(${(index * 79 + 224) % 360} 35% 28%)` }}>
        {(participant.name.trim()[0] || '?').toLocaleUpperCase()}
      </span>
      {raisedHands[participant.playerId] && <span className={mini ? 'mini-hand-indicator' : 'hand-indicator'} title={`${participant.name} levantou a mão`} aria-label={`${participant.name} levantou a mão`}><PanToolIcon /></span>}
      {mini ? <div className="mini-name">
        {!micEnabled && participant.playerId === sessionId && <span className="mini-mic-status" title="Microfone desligado"><MicOffIcon /></span>}
        <span className="mini-name-label">{participant.name}{participant.playerId === sessionId ? ' (Você)' : ''}</span>
      </div> : <button type="button" className="tile-name" title={`Destacar ${participant.name}`} onClick={() => changeSpotlight(participant.playerId)}>{participant.name}{participant.playerId === sessionId ? ' (Você)' : ''}</button>}
      <>
        <button className={mini ? 'mini-fullscreen' : 'tile-fullscreen'} type="button" aria-label={`Tela cheia da câmera de ${participant.name}`} title="Expandir câmera" onClick={(event) => {
          const tile = event.currentTarget.closest<HTMLElement>('.mini-tile')
            ?? event.currentTarget.closest<HTMLElement>('.tile')
          if (tile && document.fullscreenElement === tile) void document.exitFullscreen()
          else if (tile?.requestFullscreen) void tile.requestFullscreen()
        }}><OpenInFullIcon /></button>
        <div className={mini ? 'mini-hover-controls' : 'tile-hover-controls'} aria-label={`Controles de ${participant.name}`}>
          <button type="button" aria-label={participant.playerId === sessionId ? (micEnabled ? 'Desligar seu microfone' : 'Ligar seu microfone') : (mutedParticipants[participant.playerId] ? 'Ativar áudio deste usuário para você' : 'Mutar este usuário para você')} title={participant.playerId === sessionId ? (micEnabled ? 'Desligar seu microfone' : 'Ligar seu microfone') : (mutedParticipants[participant.playerId] ? 'Ativar áudio deste usuário para você' : 'Mutar este usuário para você')} onClick={() => {
            if (participant.playerId === sessionId) void toggleMicrophone()
            else {
              const muted = !mutedParticipants[participant.playerId]
              setMutedParticipants((current) => ({ ...current, [participant.playerId]: muted }))
              webRTC?.setParticipantMuted(participant.playerId, muted)
            }
          }}>{participant.playerId === sessionId ? (micEnabled ? <MicIcon /> : <MicOffIcon />) : (mutedParticipants[participant.playerId] ? <MicIcon /> : <MicOffIcon />)}</button>
          <button type="button" aria-label={participant.playerId === sessionId ? (cameraEnabled ? 'Desligar sua câmera' : 'Ligar sua câmera') : (hiddenParticipantCameras[participant.playerId] ? 'Mostrar câmera deste usuário' : 'Ocultar câmera deste usuário')} title={participant.playerId === sessionId ? (cameraEnabled ? 'Desligar sua câmera' : 'Ligar sua câmera') : (hiddenParticipantCameras[participant.playerId] ? 'Mostrar câmera deste usuário' : 'Ocultar câmera deste usuário')} onClick={() => {
            if (participant.playerId === sessionId) void toggleCamera()
            else {
              const hidden = !hiddenParticipantCameras[participant.playerId]
              setHiddenParticipantCameras((current) => ({ ...current, [participant.playerId]: hidden }))
              webRTC?.setParticipantCameraHidden(participant.playerId, hidden)
            }
          }}>{participant.playerId === sessionId ? (cameraEnabled ? <VideocamIcon /> : <VideocamOffIcon />) : (hiddenParticipantCameras[participant.playerId] ? <VideocamIcon /> : <VideocamOffIcon />)}</button>
          {participant.playerId !== sessionId && <button type="button" aria-label={`Volume de ${participant.name}`} title={`Volume de ${participant.name}`} onClick={() => setVolumePanelId((current) => current === participant.playerId ? null : participant.playerId)}>{(participantVolumes[participant.playerId] ?? 1) === 0 ? <VolumeOffIcon /> : <VolumeUpIcon />}</button>}
        </div>
        {participant.playerId !== sessionId && volumePanelId === participant.playerId && <div className={mini ? 'mini-volume-panel' : 'tile-volume-panel'} onClick={(event) => event.stopPropagation()}>
          <div className={mini ? 'mini-volume-title' : 'tile-volume-title'}><VolumeUpIcon />Volume do usuário</div>
          <input className={mini ? 'mini-volume-slider' : 'tile-volume-slider'} type="range" min="0" max="100" value={Math.round((participantVolumes[participant.playerId] ?? 1) * 100)} aria-label={`Volume de ${participant.name}`} onChange={(event) => {
            const volume = Number(event.target.value) / 100
            setParticipantVolumes((current) => ({ ...current, [participant.playerId]: volume }))
            webRTC?.setParticipantVolume(participant.playerId, volume)
          }} />
          <label className={mini ? 'mini-volume-mute' : 'tile-volume-mute'}><VolumeOffIcon />Silenciar para mim<input type="checkbox" checked={mutedParticipants[participant.playerId] ?? false} onChange={(event) => {
            const muted = event.target.checked
            setMutedParticipants((current) => ({ ...current, [participant.playerId]: muted }))
            webRTC?.setParticipantMuted(participant.playerId, muted)
          }} /></label>
        </div>}
      </>
    </div>)}
  </div>

  const meetingToolbar = <nav className="toolbar" aria-label="Controles da reunião">
        <button className="tool profile" title={myName || 'Seu perfil'}>{(myName.trim()[0] || 'L').toLocaleUpperCase()}</button>
        <span className="separator" />
        <div className="split-control">
          <button className={`tool ${micEnabled ? 'on' : 'muted'}`} aria-label={micEnabled ? 'Desligar microfone' : 'Ligar microfone'} title={micEnabled ? 'Desligar microfone' : 'Ligar microfone'} onClick={() => void toggleMicrophone()}>{micEnabled ? <MicIcon /> : <MicOffIcon />}</button>
          <button className="split-arrow" aria-label="Selecionar microfone" title="Selecionar microfone" onClick={() => void openDevices('microphone')}>⌃</button>
          {popup === 'microphone' && <div className="device-popup">{devices.mics.length ? devices.mics.map((device) => <button key={device.deviceId} onClick={async () => { const ok = await webRTC?.switchMicrophone(device.deviceId); if (ok) setPopup(null); else setMediaError('Não foi possível selecionar este microfone.') }}>{device.label || 'Microfone'}</button>) : <button disabled>Nenhum microfone</button>}</div>}
        </div>
        <div className="split-control">
          <button className={`tool ${cameraEnabled ? 'on' : 'muted'}`} aria-label={cameraEnabled ? 'Desligar câmera' : 'Ligar câmera'} title={cameraEnabled ? 'Desligar câmera' : 'Ligar câmera'} onClick={() => void toggleCamera()}>{cameraEnabled ? <VideocamIcon /> : <VideocamOffIcon />}</button>
          <button className="split-arrow" aria-label="Selecionar câmera" title="Selecionar câmera" onClick={() => void openDevices('camera')}>⌃</button>
          {popup === 'camera' && <div className="device-popup">{devices.cameras.length ? devices.cameras.map((device) => <button key={device.deviceId} onClick={async () => { const ok = await webRTC?.switchCamera(device.deviceId); if (ok) setPopup(null); else setMediaError('Não foi possível selecionar esta câmera.') }}>{device.label || 'Câmera'}</button>) : <button disabled>Nenhuma câmera</button>}</div>}
        </div>
        <button className={`tool ${popup === 'emoji' ? 'on' : ''}`} aria-label="Reações" title="Reações" onClick={() => setPopup(popup === 'emoji' ? null : 'emoji')}><SentimentSatisfiedAltIcon /></button>
        <button className={`tool ${sharingScreen ? 'on' : ''}`} aria-label={sharingScreen ? 'Parar compartilhamento' : 'Compartilhar tela'} title={sharingScreen ? 'Parar compartilhamento' : 'Compartilhar tela'} onClick={() => void toggleScreenShare()}><PresentToAllIcon /></button>
        <button className={`tool ${handRaised ? 'on' : ''}`} aria-label={handRaised ? 'Abaixar a mão' : 'Levantar a mão'} title={handRaised ? 'Abaixar a mão' : 'Levantar a mão'} onClick={toggleHand}><PanToolIcon /></button>
        <button className={`tool ${popup === 'settings' ? 'on' : ''}`} aria-label="Configurações" title="Configurações" onClick={() => setPopup(popup === 'settings' ? null : 'settings')}><SettingsIcon /></button>
        <button className={`tool meeting-chat-tool ${showChat ? 'on' : ''}`} aria-label={unreadCount ? `Chat, ${unreadCount} mensagens não lidas` : 'Abrir chat geral e mensagens privadas'} title={showChat ? 'Fechar chat' : 'Chat geral e mensagens privadas'} onClick={() => {
          const next = !showChat
          if (next) {
            if (selectedConversation === 'nearby') dispatch(setSelectedConversation('general'))
            dispatch(markConversationRead(selectedConversation === 'nearby' ? 'general' : selectedConversation))
          }
          dispatch(setShowChat(next))
          dispatch(setFocused(next))
        }}><ForumOutlinedIcon />{unreadCount > 0 && <span className="meeting-chat-unread">{unreadCount > 99 ? '99+' : unreadCount}</span>}</button>
        {!compact && <button className="tool" aria-label="Voltar ao jogo mantendo o meeting no topo" title="Voltar ao jogo" onClick={() => setCompact(true)}><MapOutlinedIcon /></button>}
        {compact && <button className="tool" aria-label="Abrir reunião completa" title="Abrir reunião completa" onClick={() => setCompact(false)}><OpenInFullIcon /></button>}
        <button className="tool hangup" aria-label="Sair da reunião" title="Sair da reunião" onClick={leaveMeetingView}><CallEndIcon /></button>
        {popup && <div className="popup">
          {popup === 'emoji' && ['👍', '👏', '❤️', '😂', '🎉', '🙌'].map((emoji) => <button key={emoji} onClick={() => sendReaction(emoji)}>{emoji}</button>)}
          {popup === 'settings' && <><button onClick={() => void openDevices('microphone')}>Microfone</button><button onClick={() => void openDevices('camera')}>Câmera</button></>}
        </div>}
      </nav>

  if (compact) {
    return <>
      {roomStatusPill}
      <MiniMeeting aria-label={roomTitle} style={{ '--mini-width': `${miniWidth}px` } as React.CSSProperties}>
      {participantTiles(true)}
      <div className="mini-footer" aria-label="Controles rápidos do meeting">
        <div className="mini-size-grip" role="slider" tabIndex={0} aria-label="Tamanho das câmeras; arraste para baixo para aumentar e para cima para diminuir" aria-orientation="vertical" aria-valuemin={360} aria-valuemax={900} aria-valuenow={miniWidth} onPointerDown={startMiniResize} onPointerMove={moveMiniResize} onPointerUp={stopMiniResize} onPointerCancel={stopMiniResize} onKeyDown={handleMiniResizeKey} />
      </div>
      </MiniMeeting>
      <Screen className="compact-shell" role="presentation">{meetingToolbar}</Screen>
    </>
  }

  return (
    <Screen className={rightPanel ? '' : 'no-panel'} role="dialog" aria-label={roomTitle}>
      {roomStatusPill}
      <header>{mediaError && <span className="permission-hint">{mediaError}</span>}<button className="close" type="button" aria-label="Fechar reunião" onClick={leaveMeetingView}>×</button></header>
      <main className="stage">{participantTiles(false, spotlightParticipantId)}</main>
      {rightPanel && <aside className="chat">
        <div className="utility-title"><span>{rightPanel === 'chat' ? 'Meeting Chat' : rightPanel === 'people' ? 'Pessoas' : 'Detalhes do meeting'}</span><button type="button" aria-label="Fechar painel" onClick={() => setRightPanel(null)}>×</button></div>
        {rightPanel === 'chat' && <>
          <div className="messages">
            {messages.filter((message) => !message.content.startsWith(MEETING_HAND_SIGNAL)).length === 0 && <div style={{ color: '#858990', textAlign: 'center', margin: 'auto' }}>As mensagens desta sala aparecem aqui.</div>}
            {messages.filter((message) => !message.content.startsWith(MEETING_HAND_SIGNAL)).map((message) => <div className="message" key={`${message.sentAt}-${message.senderId}-${message.content}-${message.attachment?.name || ''}`}>
              <span className="message-avatar" style={{ background: `hsl(${Array.from(message.senderId).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 0)} 42% 76%)` }}>{(message.senderName.trim()[0] || '?').toLocaleUpperCase()}</span>
              <div className="message-copy">
                <div className="message-header"><b>{message.senderName}</b><time className="message-time" dateTime={new Date(message.sentAt).toISOString()}>{new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div>
                {!!message.content && <div className="message-text">{message.content.split(/(@[\p{L}\p{N}_]+)/gu).map((part, index) => part.startsWith('@') ? <span key={index} style={{ color: '#9eafff', background: '#252c43', borderRadius: 3, padding: '1px 3px' }}>{part}</span> : part)}</div>}
                {message.attachment && <a className="meeting-attachment" href={message.attachment.data} download={message.attachment.name}><AttachFileIcon />{message.attachment.name}</a>}
              </div>
            </div>)}
          </div>
          <form className="meeting-composer" onSubmit={sendMessage}>
            {composerPopup === 'emoji' && <div className="composer-popup"><input aria-label="Buscar emoji" placeholder="Buscar emoji" value={emojiSearch} onChange={(event) => setEmojiSearch(event.target.value)} onKeyDown={stopGameKeyboard} /><div className="emoji-grid">{MEETING_EMOJIS.filter(([emoji, label]) => !emojiSearch || emoji.includes(emojiSearch) || label.includes(emojiSearch.trim().toLocaleLowerCase())).map(([emoji, label]) => <button key={emoji} type="button" aria-label={`Inserir ${label}`} onClick={() => { insertMeetingText(emoji); setComposerPopup(null) }}>{emoji}</button>)}</div></div>}
            {composerPopup === 'mention' && <div className="composer-popup" role="listbox" aria-label="Marcar pessoa">{presence.participants.filter((participant) => participant.name.toLocaleLowerCase().replace(/\s+/g, '').includes((draft.match(/@[\p{L}\p{N}_]*$/u)?.[0].slice(1) || '').toLocaleLowerCase())).map((participant) => <button className="mention-option" key={participant.playerId} type="button" onClick={() => selectMeetingMention(participant)}><span className="mention-avatar">{(participant.name[0] || '?').toLocaleUpperCase()}</span>{participant.name}{participant.playerId === sessionId ? ' (Você)' : ''}</button>)}</div>}
            {selectedAttachment && <div className="selected-attachment"><AttachFileIcon /><span>{selectedAttachment.name}</span><button type="button" aria-label="Remover anexo" onClick={() => setSelectedAttachment(null)}>×</button></div>}
            <input ref={meetingInputRef} type="text" aria-label={`Mensagem ${roomTitle}`} placeholder={`Mensagem ${roomTitle}`} value={draft} onChange={(event) => { const next = event.target.value; setDraft(next); setComposerPopup(next.match(/@[\p{L}\p{N}_]*$/u) ? 'mention' : null) }} onKeyDown={(event) => { stopGameKeyboard(event); if (event.key === 'Escape') setComposerPopup(null) }} onKeyUp={stopGameKeyboard} onKeyPress={stopGameKeyboard} maxLength={500} />
            <input ref={meetingFileRef} type="file" hidden onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; if (file.size > 3 * 1024 * 1024) setAttachmentError('O arquivo deve ter até 3 MB.'); else { setSelectedAttachment(file); setAttachmentError('') }; event.target.value = '' }} />
            <div className="composer-tools"><button type="button" aria-label="Anexar arquivo" title="Anexar arquivo" onClick={() => meetingFileRef.current?.click()}><AttachFileIcon /></button><button type="button" aria-label="Marcar pessoa" title="Marcar pessoa" onClick={() => { insertMeetingText('@'); setComposerPopup('mention') }}><AlternateEmailIcon /></button><button type="button" aria-label="Inserir emoji" title="Inserir emoji" onClick={() => setComposerPopup(composerPopup === 'emoji' ? null : 'emoji')}><SentimentSatisfiedAltIcon /></button><span style={{ color: '#ee8791', fontSize: 11 }}>{attachmentError}</span></div>
            <button className="composer-send" type="submit" aria-label="Enviar mensagem" disabled={!draft.trim() && !selectedAttachment}>➤</button>
          </form>
        </>}
        {rightPanel === 'people' && <div className="people-list">{presence.participants.map((participant) => <button className="person-row" type="button" key={participant.playerId} aria-label={`Abrir conversa com ${participant.name}`} onClick={() => openDirectChat(participant.playerId)}><span className="person-avatar-wrap"><span className="person-avatar">{(participant.name.trim()[0] || '?').toLocaleUpperCase()}</span><span className="person-online" /></span><span>{participant.name}{participant.playerId === sessionId ? ' (Você)' : ''}</span></button>)}</div>}
        {rightPanel === 'details' && <div className="utility-content"><button className="utility-action" type="button" onClick={() => void copyMeetingLink()}><LinkOutlinedIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: .5 }} />{meetingLinkCopied ? 'Link copiado' : 'Link do meeting'}</button><div className="utility-line"><InfoOutlinedIcon />Em andamento há {Math.max(1, Math.floor((Date.now() - startedAt) / 60000))} min</div><div className="utility-line"><PeopleOutlineIcon />{presence.roomName}</div><div className="utility-line"><PeopleOutlineIcon />{presence.participants.length} {presence.participants.length === 1 ? 'pessoa' : 'pessoas'} na sala</div></div>}
      </aside>}
      <div className="meeting-utilities" aria-label="Informações do meeting"><button type="button" className={rightPanel === 'details' ? 'active' : ''} aria-label="Informações do meeting" title="Informações do meeting" onClick={() => setRightPanel(rightPanel === 'details' ? null : 'details')}><InfoOutlinedIcon /></button><button type="button" className={rightPanel === 'people' ? 'active' : ''} aria-label={`${presence.participants.length} pessoas no meeting`} title="Pessoas" onClick={() => setRightPanel(rightPanel === 'people' ? null : 'people')}><PeopleOutlineIcon /><span className="people-count">{presence.participants.length}</span></button><button type="button" className={rightPanel === 'chat' ? 'active' : ''} aria-label="Abrir chat do meeting" title="Chat" onClick={() => setRightPanel(rightPanel === 'chat' ? null : 'chat')}><ForumOutlinedIcon /></button></div>
      {meetingToolbar}
    </Screen>
  )
}
