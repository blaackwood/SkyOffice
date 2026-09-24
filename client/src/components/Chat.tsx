import React, { useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import IconButton from '@mui/material/IconButton'
import InputBase from '@mui/material/InputBase'
import CloseIcon from '@mui/icons-material/Close'
import SendIcon from '@mui/icons-material/Send'
import TagIcon from '@mui/icons-material/Tag'
import WavingHandIcon from '@mui/icons-material/PanTool'
import NearMeIcon from '@mui/icons-material/NearMe'
import VideocamOutlinedIcon from '@mui/icons-material/VideocamOutlined'
import ForumOutlinedIcon from '@mui/icons-material/ForumOutlined'
import MoreVertIcon from '@mui/icons-material/MoreVert'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import AlternateEmailIcon from '@mui/icons-material/AlternateEmail'
import SentimentSatisfiedAltIcon from '@mui/icons-material/SentimentSatisfiedAlt'
import SearchIcon from '@mui/icons-material/Search'

import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'
import { useAppDispatch, useAppSelector } from '../hooks'
import { markConversationRead, setFocused, setSelectedConversation, setShowChat } from '../stores/ChatStore'
import { Event, phaserEvents } from '../events/EventCenter'

type Contact = { id: string; name: string; online: boolean }
type MentionContact = Contact & { isYou?: boolean }
type Notice = { kind: 'wave' | 'meeting' | 'call' | 'declined' | 'info'; fromId: string; fromName: string; text?: string; roomName?: string }
type DeferredCall = { fromId: string; fromName: string; roomId: string; roomName: string }
const EMOJIS = [
  ['😀','grinning'],['😃','smiley'],['😄','smile'],['😁','grin'],['😆','laugh'],['😅','sweat smile'],['🤣','rofl'],['😂','joy'],['🙂','slightly smiling'],['🙃','upside down'],['😉','wink'],['😊','blush'],['😇','innocent'],['🥰','love'],['😍','heart eyes'],['🤩','star struck'],['😘','kiss'],['😗','kissing'],['😚','closed eyes kiss'],['😋','yum'],['😛','tongue'],['😜','wink tongue'],['🤪','zany'],['😝','squint tongue'],['🤑','money'],['🤗','hug'],['🤭','hand over mouth'],['🤫','shush'],['🤔','thinking'],['🤐','zipper mouth'],['🤨','raised eyebrow'],['😐','neutral'],['😑','expressionless'],['😶','no mouth'],['😏','smirk'],['😒','unamused'],['🙄','eye roll'],['😬','grimace'],['🤥','lying'],['😌','relieved'],['😔','pensive'],['😪','sleepy'],['🤤','drooling'],['😴','sleeping'],['😷','mask'],['🤒','sick'],['🤕','hurt'],['🤢','nauseated'],['🤮','vomit'],['🥵','hot'],['🥶','cold'],['🥴','woozy'],['😵','dizzy'],['🤯','exploding head'],['🥳','party'],['😎','cool'],['😭','sob'],['😢','cry'],['😡','angry'],['🤬','swearing'],['👍','thumbs up'],['👎','thumbs down'],['👏','clap'],['🙌','raised hands'],['🙏','pray'],['🤝','handshake'],['❤️','red heart'],['💙','blue heart'],['💚','green heart'],['🔥','fire'],['🎉','party popper'],['✨','sparkles'],['✅','check'],['👀','eyes'],
]

const ChatWindow = styled.section`
  position: fixed;
  inset: 6px;
  z-index: 20000;
  display: grid;
  grid-template-columns: 294px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid #373b45;
  border-radius: 12px;
  color: #e8eaf0;
  background: #202329;
  box-shadow: 0 9px 30px rgba(0, 0, 0, .48);
  .sidebar { min-height: 0; }

  .sidebar {
    min-width: 0;
    display: flex;
    flex-direction: column;
    padding: 12px 9px;
    background: #191c21;
    border-right: 1px solid #343841;
  }
  .brand { display:flex; align-items:center; justify-content:space-between; padding: 5px 9px 15px; font-size: 17px; font-weight: 700; }
  .section-label {
    padding: 12px 9px 5px;
    color: #9299a6;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
  }
  .nav-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 0 9px;
    border: 0;
    border-radius: 7px;
    color: #c8cbd2;
    background: transparent;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }
  .nav-item svg { width: 17px; height: 17px; color: #9da4b0; }
  .nav-item:hover { background: #292d35; }
  .nav-item[data-active='true'] { color: #fff; background: #303541; }
  .contacts { overflow: auto; }
  .contact-list { display:flex; flex-direction:column; gap:2px; }
  .unread-badge { min-width:18px;height:18px;margin-left:auto;padding:0 5px;display:grid;place-items:center;border-radius:10px;background:#e33b4b;color:#fff;font-size:11px;font-weight:700;line-height:1; }
  .empty { padding: 7px 9px; color: #858c99; font-size: 11px; line-height: 1.4; }

  .conversation { min-width: 0; display: flex; flex-direction: column; }
  .conversation-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 55px;
    padding: 0 14px 0 20px;
    border-bottom: 1px solid #343841;
    font-size: 14px;
    font-weight: 650;
  }
  .conversation-title { display: flex; align-items: center; gap: 8px; }
  .conversation-title svg { color: #a8aebb; }
  .close { color: #aeb3bd; }
  .header-actions { display:flex; align-items:center; gap:7px; }
  .header-action { color:#c8cbd2; border-radius:9px; }
  .header-action.primary { background:#2939c9; color:#fff; }
  .header-action.go { padding:0 12px; border-radius:10px; background:#2939c9; color:#fff; font-size:12px; }
  .message-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 17px;
    overflow-y: auto;
    padding: 20px 20px;
  }
  .welcome { margin: auto 0 6px; color: #aeb4bf; font-size: 12px; }
  .welcome strong { display: block; margin-bottom: 4px; color: #e5e8ee; font-size: 16px; }
  .message { max-width: 90%; display: grid; grid-template-columns: 34px minmax(0,1fr); align-self: flex-start; gap: 10px; }
  .message.mine { align-self: flex-end; }
  .avatar { display:grid; place-items:center; width:32px; height:32px; border-radius:50%; background:#272a30; color:#e6e7eb; font-weight:700; }
  .avatar-wrap { position:relative; display:inline-flex; flex:none; }
  .presence-dot { position:absolute; right:-1px; bottom:-1px; width:9px; height:9px; border:2px solid #191c21; border-radius:50%; background:#777d87; }
  .presence-dot.online { background:#24c875; }
  .message-body { min-width:0; }
  .byline { color: #d5d7dc; font-size: 13px; font-weight:650; }
  .time { margin-left:5px; color:#9196a0; font-size:11px; font-weight:400; }
  .bubble { padding: 3px 0 0; color: #c5c7cd; font-size: 14px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
  .mention { color:#92a8ff; background:#252c43; border-radius:4px; padding:1px 3px; }
  .attachment-link { display:inline-flex; align-items:center; gap:6px; margin-top:5px; padding:6px 9px; border:1px solid #3b414c; border-radius:7px; color:#b8c5ff; background:#242832; text-decoration:none; }
  .composer {
    position:relative;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 12px 12px;
    padding: 12px 8px 8px 12px;
    min-height: 88px;
    flex-wrap:wrap;
    border: 1px solid #3c414c;
    border-radius: 10px;
    background: #282c33;
  }
  .input { color: #f3f4f6; font-size: 13px; }
  .input input { padding: 7px 0; }
  .input input::placeholder { color: #969daa; opacity: 1; }
  .composer-tools { display:flex; width:100%; align-items:center; gap:3px; color:#afb4bf; }
  .composer-tools button { color:#afb4bf; }
  .send { width: 31px; height: 31px; color: white; background: #4a57e7; border-radius: 8px; }
  .send:hover { background: #5966f3; }
  .attachment-chip { width:100%; color:#c5c9d1; font-size:12px; }
  .emoji-picker, .mention-picker { position:absolute; z-index:5; left:8px; bottom:calc(100% + 8px); width:min(300px,calc(100vw - 40px)); max-height:370px; padding:10px; overflow:hidden; border:1px solid #383d48; border-radius:12px; background:#17191e; box-shadow:0 12px 35px rgba(0,0,0,.55); }
  .picker-search { display:flex; align-items:center; gap:7px; height:34px; padding:0 9px; border:1px solid #383d48; border-radius:8px; color:#9da3ae; background:#202329; }
  .picker-search input { width:100%; border:0; outline:0; color:#e4e6eb; background:transparent; font:inherit; }
  .emoji-heading { padding:10px 2px 6px; color:#969daa; font-size:11px; font-weight:600; }
  .emoji-grid { display:grid; grid-template-columns:repeat(8,1fr); max-height:285px; overflow:auto; }
  .emoji-grid button { width:33px; height:33px; border:0; border-radius:6px; background:transparent; font-size:21px; cursor:pointer; }
  .emoji-grid button:hover { background:#30343d; }
  .mention-picker { width:230px; max-height:220px; padding:5px; }
  .mention-item { display:flex; align-items:center; gap:8px; width:100%; padding:6px; border:0; border-radius:7px; color:#e0e2e7; background:transparent; text-align:left; cursor:pointer; }
  .mention-item:hover { background:#2d3139; }

  @media (max-width: 700px) {
    inset: 0;
    grid-template-columns: 150px minmax(0, 1fr);
    .sidebar { padding: 10px 6px; }
    .brand { padding-left: 7px; }
    .nav-item { gap: 5px; padding: 0 6px; font-size: 11px; }
    .section-label { padding-left: 7px; font-size: 9px; }
    .message-list { padding: 13px 9px; }
    .header-actions { gap:0; }
    .header-action.go { padding:0 7px; }
  }
`

const WaveNotice = styled.div`
  position:fixed; z-index:21000; top:8px; right:10px; width:min(320px,calc(100vw - 20px));
  padding:12px; border:1px solid #363a44; border-radius:13px; color:#e6e8ed; background:#191b20;
  box-shadow:0 8px 28px rgba(0,0,0,.45);
  .notice-head { display:flex; align-items:center; gap:9px; font-size:14px; font-weight:650; }
  .notice-avatar { display:grid; place-items:center; width:36px; height:36px; border-radius:50%; background:#f4a19b; }
  .notice-sub { margin:2px 0 10px 45px; color:#a0a5af; font-size:12px; }
  .notice-actions { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .notice-actions.call { grid-template-columns:1fr 1fr 1fr; }
  .notice-close { position:absolute; top:5px; right:6px; width:28px; min-height:28px; border:0; background:transparent; color:#a3a8b1; }
  button { min-height:36px; border:1px solid #30343d; border-radius:9px; background:#22252b; color:#e0e2e7; font-weight:600; cursor:pointer; }
  button:hover { background:#2a2e36; }
  button.primary { background:#303fd1; border-color:#3b49e3; color:white; }
  button.decline { color:#ff6b76; }
`

const DeferredCallBanner = styled.div`
  position:fixed; z-index:21000; left:50%; bottom:10px; transform:translateX(-50%);
  display:flex; align-items:center; gap:14px; width:min(650px,calc(100vw - 24px)); padding:9px 12px;
  border:1px solid #353943; border-radius:10px; color:#e5e7ec; background:#191b20;
  box-shadow:0 8px 28px rgba(0,0,0,.5); font-size:14px;
  .label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  button { min-width:68px; min-height:32px; padding:0 14px; border:1px solid #343943; border-radius:8px; background:#24272e; color:#e4e6eb; font-weight:600; cursor:pointer; }
  button.join { background:#303fd1; border-color:#3b49e3; color:#fff; }
  button.decline { color:#ff6b76; }
  @media(max-width:520px) { gap:5px; padding:7px; font-size:12px; button { min-width:54px; padding:0 8px; } }
`

const NearbyComposer = styled.section`
  position: fixed;
  left: 50%;
  bottom: 78px;
  z-index: 51;
  width: min(340px, calc(100vw - 24px));
  padding: 7px;
  transform: translateX(-50%);
  border: 1px solid #373b45;
  border-radius: 12px;
  color: #e8eaf0;
  background: #202329;
  box-shadow: 0 9px 30px rgba(0, 0, 0, .48);
  .title { position: relative; display: flex; justify-content: center; align-items: center; min-height: 24px; padding: 0 28px 7px; color: #c8cbd2; font-size: 11px; font-weight: 600; }
  .title button { position: absolute; top: -5px; right: -3px; width: 26px; height: 26px; padding: 3px; color: #aeb3bd; }
  .entry { display: flex; align-items: center; gap: 7px; padding: 3px 8px; border: 1px solid #3c414c; border-radius: 9px; background: #282c33; }
  .entry svg { flex: none; width: 16px; height: 16px; color: #9da4b0; }
  .input { color: #f3f4f6; font-size: 13px; }
  .input input { padding: 5px 0; }
  .input input::placeholder { color: #969daa; opacity: 1; }
  .hint { padding: 5px 3px 0; color: #a2a9b5; font-size: 11px; }
`

const PlayerQuickCard = styled.section`
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 19000;
  width: min(310px, calc(100vw - 24px));
  padding: 10px;
  border: 1px solid #353943;
  border-radius: 14px;
  color: #e8eaf0;
  background: #191b20;
  box-shadow: 0 9px 30px rgba(0,0,0,.5);
  .top { display:flex; align-items:center; gap:9px; min-width:0; padding:0 2px 10px; }
  .avatar { position:relative; display:grid; place-items:center; flex:none; width:46px; height:46px; border-radius:50%; background:#f39a9e; color:#272329; font-size:22px; }
  .dot { position:absolute; right:0; bottom:0; width:12px; height:12px; border:2px solid #191b20; border-radius:50%; background:#24c875; }
  .identity { min-width:0; flex:1; }
  .name { overflow:hidden; color:#f1f2f5; font-size:14px; font-weight:700; text-overflow:ellipsis; white-space:nowrap; }
  .time { color:#a2a8b2; font-size:11px; }
  .actions { display:flex; align-items:center; gap:6px; }
  .actions button { min-width:36px; height:34px; padding:0 7px; border:1px solid #343943; border-radius:9px; color:#e2e5eb; background:#24272e; cursor:pointer; }
  .actions button:hover { background:#30343e; }
  .actions button.go { flex:1; color:#fff; background:#303fd1; border-color:#3b49e3; font-size:12px; font-weight:650; }
  .actions button.wave { color:#fff; background:#303fd1; border-color:#3b49e3; }
  .dismiss { position:absolute; top:7px; right:7px; width:25px !important; min-width:25px !important; height:25px !important; padding:0 !important; border:0 !important; color:#aeb3bd !important; background:transparent !important; }
  .more-menu { position:absolute; top:calc(100% + 5px); right:10px; display:grid; gap:2px; min-width:150px; padding:5px; border:1px solid #373b45; border-radius:9px; background:#202329; box-shadow:0 8px 24px rgba(0,0,0,.45); }
  .more-menu button { padding:7px 9px; border:0; border-radius:6px; color:#e5e7ec; background:transparent; text-align:left; cursor:pointer; }
  .more-menu button:hover { background:#30343e; }
  @media(max-width:520px) { top:8px; right:8px; width:min(300px,calc(100vw - 16px)); }
`

function NearbyIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="0.1 3.7" strokeLinecap="round" /></svg>
}

export default function Chat() {
  const [inputValue, setInputValue] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [notice, setNotice] = useState<Notice | null>(null)
  const [deferredCall, setDeferredCall] = useState<DeferredCall | null>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiSearch, setEmojiSearch] = useState('')
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionStart, setMentionStart] = useState(0)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<{ id: string; name: string } | null>(null)
  const [quickMoreOpen, setQuickMoreOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const showChat = useAppSelector((state) => state.chat.showChat)
  const selectedConversation = useAppSelector((state) => state.chat.selectedConversation)
  const messages = useAppSelector((state) => state.chat.messages)
  const unreadByConversation = useAppSelector((state) => state.chat.unreadByConversation)
  const sessionId = useAppSelector((state) => state.user.sessionId)
  const myPlayerName = useAppSelector((state) => state.user.myPlayerName)
  const dispatch = useAppDispatch()

  useEffect(() => {
    const onPlayerSelected = (player: { id: string; name: string }) => setSelectedPlayer(player)
    const onPlayerLeft = (playerId: string) => setSelectedPlayer((current) => current?.id === playerId ? null : current)
    phaserEvents.on(Event.PLAYER_SELECTED, onPlayerSelected)
    phaserEvents.on(Event.PLAYER_LEFT, onPlayerLeft)
    return () => {
      phaserEvents.off(Event.PLAYER_SELECTED, onPlayerSelected)
      phaserEvents.off(Event.PLAYER_LEFT, onPlayerLeft)
    }
  }, [])

  useEffect(() => {
    const onWave = (message: { fromId: string; fromName: string }) => {
      setNotice({ kind: 'wave', fromId: message.fromId, fromName: message.fromName })
    }
    const onInvite = (message: { fromId: string; fromName: string }) => {
      setNotice({ kind: 'meeting', fromId: message.fromId, fromName: message.fromName })
    }
    const onDeclined = (message: { peerName?: string; locked?: boolean }) => {
      setNotice({ kind: 'info', fromId: '', fromName: '', text: message.locked ? 'A sala está trancada.' : `${message.peerName || 'A pessoa'} não aceitou o meeting agora.` })
    }
    const onCallInvite = (message: { fromId: string; fromName: string; roomName: string }) => {
      setNotice({ kind: 'call', fromId: message.fromId, fromName: message.fromName, roomName: message.roomName })
    }
    const onCallDeclined = (message: { fromName?: string; reason?: string }) => {
      const sender = message.fromName || 'A pessoa'
      const text = message.reason === 'later' ? `${sender} will join later`
        : message.reason === 'timeout' ? `${sender} didn't answer`
        : message.reason === 'busy' ? `${sender} is busy on another call`
        : message.reason === 'locked' ? 'No meeting rooms are open right now'
        : message.reason === 'disconnected' ? `${sender} disconnected`
        : `${sender} declined to join you`
      setNotice({ kind: 'declined', fromId: '', fromName: sender, text })
    }
    const onCallFinished = () => {
      setNotice((current) => current?.kind === 'call' ? null : current)
      setDeferredCall(null)
    }
    const onCallDeferred = (message: DeferredCall) => {
      setDeferredCall(message)
      setNotice((current) => current?.kind === 'call' ? null : current)
    }
    phaserEvents.on(Event.WAVE_RECEIVED, onWave)
    phaserEvents.on(Event.MEETING_WALK_INVITE, onInvite)
    phaserEvents.on(Event.MEETING_WALK_DECLINED, onDeclined)
    phaserEvents.on(Event.MEETING_CALL_INVITE, onCallInvite)
    phaserEvents.on(Event.MEETING_CALL_DECLINED, onCallDeclined)
    phaserEvents.on(Event.MEETING_CALL_FINISHED, onCallFinished)
    phaserEvents.on(Event.MEETING_CALL_DEFERRED, onCallDeferred)
    return () => {
      phaserEvents.off(Event.WAVE_RECEIVED, onWave)
      phaserEvents.off(Event.MEETING_WALK_INVITE, onInvite)
      phaserEvents.off(Event.MEETING_WALK_DECLINED, onDeclined)
      phaserEvents.off(Event.MEETING_CALL_INVITE, onCallInvite)
      phaserEvents.off(Event.MEETING_CALL_DECLINED, onCallDeclined)
      phaserEvents.off(Event.MEETING_CALL_FINISHED, onCallFinished)
      phaserEvents.off(Event.MEETING_CALL_DEFERRED, onCallDeferred)
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.kind === 'info' || notice.kind === 'declined' ? 4500 : notice.kind === 'call' ? 45_000 : 20000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!showChat) return
    const refreshContacts = () => {
      const game = phaserGame.scene.keys.game as Game | undefined
      const players = game?.network?.roomState?.players
      const known = new Map<string, Contact>()
      messages.forEach((message) => {
        if (message.channel !== 'direct') return
        if (message.senderId === sessionId && message.recipientId && message.recipientName) {
          known.set(message.recipientId, { id: message.recipientId, name: message.recipientName, online: false })
        } else if (message.senderId !== sessionId) {
          known.set(message.senderId, { id: message.senderId, name: message.senderName, online: false })
        }
      })
      players?.forEach((player, id) => {
        if (id !== sessionId && player.name) known.set(id, { id, name: player.name, online: true })
      })
      setContacts([...known.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)))
    }
    refreshContacts()
    const timer = window.setInterval(refreshContacts, 1200)
    return () => window.clearInterval(timer)
  }, [showChat, sessionId, messages])

  useEffect(() => {
    if (showChat) inputRef.current?.focus()
  }, [showChat, selectedConversation])

  useEffect(() => {
    if (showChat) dispatch(markConversationRead(selectedConversation))
  }, [dispatch, selectedConversation, showChat])

  const currentContact = useMemo(() => {
    if (!selectedConversation.startsWith('dm:')) return undefined
    const id = selectedConversation.slice(3)
    return contacts.find((contact) => contact.id === id)
  }, [contacts, selectedConversation])
  const mentionCandidates = useMemo<MentionContact[]>(() => {
    const you: MentionContact = { id: sessionId, name: myPlayerName || 'Você', online: true, isYou: true }
    if (selectedConversation.startsWith('dm:')) return [you, ...(currentContact ? [currentContact] : [])]
    return [you, ...contacts.filter((contact) => contact.online)]
  }, [contacts, currentContact, myPlayerName, selectedConversation, sessionId])
  const visibleMessages = messages.filter((message) => message.conversationId === selectedConversation)
  const filteredEmojis = EMOJIS.filter(([, label]) => label.includes(emojiSearch.trim().toLowerCase()))
  const filteredMentions = mentionCandidates.filter((contact) => contact.name.toLowerCase().replace(/\s+/g, '').includes((mentionQuery || '').toLowerCase()))

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [visibleMessages.length, selectedConversation])

  const closeChat = () => {
    inputRef.current?.blur()
    dispatch(setFocused(false))
    dispatch(setShowChat(false))
  }

  const insertTextAtCursor = (text: string) => {
    const input = inputRef.current
    const start = input?.selectionStart ?? inputValue.length
    const end = input?.selectionEnd ?? start
    const next = `${inputValue.slice(0, start)}${text}${inputValue.slice(end)}`
    setInputValue(next)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(start + text.length, start + text.length)
    })
  }

  const selectMention = (contact: MentionContact) => {
    const input = inputRef.current
    const end = input?.selectionStart ?? inputValue.length
    const token = `@${contact.name.replace(/\s+/g, '')} `
    const next = `${inputValue.slice(0, mentionStart)}${token}${inputValue.slice(end)}`
    setInputValue(next)
    setMentionQuery(null)
    const caret = mentionStart + token.length
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(caret, caret)
    })
  }

  const walkToContact = (contactId: string) => {
    const moved = (phaserGame.scene.keys.game as Game | undefined)?.walkToPlayer(contactId)
    if (!moved) setNotice({ kind: 'info', fromId: '', fromName: '', text: 'Não consegui localizar essa pessoa no mapa.' })
  }

  const quickPlayerCard = selectedPlayer && !showChat && (
    <PlayerQuickCard aria-label={`Ações para ${selectedPlayer.name}`}>
      <button className="dismiss" type="button" aria-label="Fechar cartão" onClick={() => { setSelectedPlayer(null); setQuickMoreOpen(false) }}><CloseIcon fontSize="small" /></button>
      <div className="top">
        <span className="avatar">{selectedPlayer.name.slice(0, 1).toUpperCase()}<i className="dot" /></span>
        <span className="identity"><div className="name">{selectedPlayer.name}</div><div className="time">◷ {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date())} local time</div></span>
      </div>
      <div className="actions">
        <button className="wave" type="button" aria-label="Acenar" title="Acenar" onClick={() => network?.sendWave(selectedPlayer.id)}><WavingHandIcon fontSize="small" /></button>
        <button className="go" type="button" onClick={() => walkToContact(selectedPlayer.id)}><NearMeIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: .5 }} />Ir até</button>
        <button type="button" aria-label="Ligar para meeting" title="Ligar para meeting" onClick={() => network?.startMeetingCall(selectedPlayer.id)}><VideocamOutlinedIcon fontSize="small" /></button>
        <button type="button" aria-label="Abrir mensagem direta" title="Mensagem direta" onClick={() => { dispatch(setSelectedConversation(`dm:${selectedPlayer.id}`)); dispatch(setFocused(false)); dispatch(setShowChat(true)); setSelectedPlayer(null) }}><ForumOutlinedIcon fontSize="small" /></button>
        <button type="button" aria-label="Mais opções" title="Mais opções" onClick={() => setQuickMoreOpen((open) => !open)}><MoreVertIcon fontSize="small" /></button>
      </div>
      {quickMoreOpen && <div className="more-menu"><button type="button" onClick={() => { dispatch(setSelectedConversation(`dm:${selectedPlayer.id}`)); dispatch(setShowChat(true)); setSelectedPlayer(null); setQuickMoreOpen(false) }}>Enviar mensagem</button><button type="button" onClick={() => { setSelectedPlayer(null); setQuickMoreOpen(false) }}>Fechar cartão</button></div>}
    </PlayerQuickCard>
  )

  const submitMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const content = inputValue.trim().slice(0, 500)
    if (!content && !selectedFile) return
    const game = phaserGame.scene.keys.game as Game | undefined
    const network = game?.network
    if (!network) return
    let attachment: { name: string; mimeType: string; data: string } | undefined
    if (selectedFile) {
      try {
        attachment = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => typeof reader.result === 'string'
            ? resolve({ name: selectedFile.name, mimeType: selectedFile.type || 'application/octet-stream', data: reader.result })
            : reject(new Error('Não foi possível ler o arquivo.'))
          reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
          reader.readAsDataURL(selectedFile)
        })
      } catch {
        setFileError('Não foi possível abrir esse arquivo.')
        return
      }
    }
    if (selectedConversation === 'nearby') {
      if (!content) return
      network.addChatMessage(content, 'nearby')
      game?.myPlayer?.updateDialogBubble(content)
    } else if (selectedConversation === 'general') network.addChatMessage(content, 'general', undefined, attachment)
    else {
      const recipientId = selectedConversation.slice(3)
      if (!contacts.some((contact) => contact.id === recipientId && contact.online)) return
      network.addChatMessage(content, 'direct', recipientId, attachment)
    }
    setInputValue('')
    setSelectedFile(null)
    setFileError('')
    setEmojiOpen(false)
    setMentionQuery(null)
  }

  const game = phaserGame.scene.keys.game as Game | undefined
  const network = game?.network

  const notification = notice && (
    <WaveNotice role="alert">
      <button type="button" className="notice-close" aria-label="Fechar aviso" onClick={() => {
        if (notice.kind === 'call') network?.respondToMeetingCall(notice.fromId, 'later')
        setNotice(null)
      }}><CloseIcon fontSize="small" /></button>
      <div className="notice-head"><span className="notice-avatar">{notice.fromName.slice(0, 1).toUpperCase()}</span><span>{notice.kind === 'wave' ? `${notice.fromName} acenou para você` : notice.kind === 'meeting' ? `${notice.fromName} chamou você para um meeting` : notice.kind === 'call' ? `${notice.fromName} is inviting you to join them at ${notice.roomName}` : notice.text}</span></div>
      {notice.kind !== 'info' && notice.kind !== 'declined' && <div className="notice-sub">{notice.kind === 'call' ? 'Right now' : 'Agora mesmo · na sala atual'}</div>}
      {notice.kind === 'declined' && <div className="notice-sub">Right now</div>}
      {(notice.kind === 'wave' || notice.kind === 'meeting' || notice.kind === 'call') && <div className={`notice-actions${notice.kind === 'call' ? ' call' : ''}`}>
        {notice.kind === 'wave' ? <button type="button" onClick={() => { network?.waveBack(notice.fromId); setNotice(null) }}><WavingHandIcon sx={{ fontSize: 15, verticalAlign: 'middle', mr: .5 }} />Acenar de volta</button>
          : notice.kind === 'call' ? <>
            <button type="button" className="decline" onClick={() => { network?.respondToMeetingCall(notice.fromId, 'decline'); setNotice(null) }}>Decline</button>
            <button type="button" onClick={() => { network?.respondToMeetingCall(notice.fromId, 'later'); setNotice(null) }}>Later</button>
          </>
          : <button type="button" onClick={() => { network?.respondToMeetingWalk(notice.fromId, false); setNotice(null) }}>Agora não</button>}
        <button type="button" className="primary" onClick={() => {
          if (notice.kind === 'call') network?.respondToMeetingCall(notice.fromId, 'accept')
          else if (notice.kind === 'meeting') network?.respondToMeetingWalk(notice.fromId, true)
          else walkToContact(notice.fromId)
          setNotice(null)
        }}>{notice.kind === 'call' ? 'Join' : <><NearMeIcon sx={{ fontSize: 15, verticalAlign: 'middle', mr: .5 }} />{notice.kind === 'meeting' ? 'Iniciar meeting' : 'Ir até a pessoa'}</>}</button>
      </div>}
    </WaveNotice>
  )
  const deferredCallNotice = deferredCall && (
    <DeferredCallBanner role="status">
      <span className="label">Entre com {deferredCall.fromName} quando estiver pronto</span>
      <button type="button" className="join" onClick={() => {
        network?.respondToMeetingCall(deferredCall.fromId, 'accept')
        setDeferredCall(null)
      }}>Entrar</button>
      <button type="button" className="decline" onClick={() => {
        network?.respondToMeetingCall(deferredCall.fromId, 'decline')
        setDeferredCall(null)
      }}>Recusar</button>
    </DeferredCallBanner>
  )

  if (!showChat) return <>{quickPlayerCard}{notification}{deferredCallNotice}</>

  if (selectedConversation === 'nearby') {
    return (
      <>
      <NearbyComposer aria-label="Chat temporário por perto">
        <div className="title">
          <span>Enviar por perto</span>
          <IconButton className="close" aria-label="Fechar chat temporário" size="small" onClick={closeChat}><CloseIcon fontSize="small" /></IconButton>
        </div>
        <form className="entry" onSubmit={submitMessage}>
          <NearbyIcon />
          <InputBase
            className="input"
            inputRef={inputRef}
            fullWidth
            placeholder="Mensagem..."
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Escape') closeChat() }}
            onFocus={() => dispatch(setFocused(true))}
            onBlur={() => dispatch(setFocused(false))}
            inputProps={{ 'aria-label': 'Mensagem temporária', maxLength: 500 }}
          />
        </form>
        <div className="hint">As mensagens não ficam salvas</div>
      </NearbyComposer>
      {notification}
      {deferredCallNotice}
      </>
    )
  }

  return (
    <>
    <ChatWindow aria-label="Chat do Escritório dos Estudos">
      <aside className="sidebar">
        <div className="brand"><span>Chat</span><span><IconButton size="small" aria-label="Nova mensagem" onClick={() => dispatch(setSelectedConversation(contacts[0] ? `dm:${contacts[0].id}` : 'general'))}><SendIcon fontSize="small" /></IconButton><IconButton size="small" aria-label="Mais opções"><MoreVertIcon fontSize="small" /></IconButton></span></div>
        <div className="nav-item" style={{ marginBottom: 7, background: '#22262d', color: '#969daa' }}>⌕ <span>Buscar ou ir para…</span><small style={{ marginLeft: 'auto' }}>Ctrl F</small></div>
        <div className="section-label">Canais</div>
        <button className="nav-item" type="button" data-active={selectedConversation === 'general'} onClick={() => dispatch(setSelectedConversation('general'))}>
          <TagIcon /> #Geral
          {(unreadByConversation.general || 0) > 0 && <span className="unread-badge" aria-label={`${unreadByConversation.general} mensagem(ns) não lida(s)`}>{unreadByConversation.general > 99 ? '99+' : unreadByConversation.general}</span>}
        </button>
        <div className="section-label">Mensagens diretas</div>
        <div className="contacts contact-list">
          {contacts.map((contact) => {
            const conversationId = `dm:${contact.id}`
            const unreadCount = unreadByConversation[conversationId] || 0
            return (
              <button key={contact.id} className="nav-item" type="button" data-active={selectedConversation === conversationId} onClick={() => dispatch(setSelectedConversation(conversationId))}>
                <span className="avatar-wrap"><span className="avatar" style={{ width: 26, height: 26, fontSize: 12 }}>{contact.name.slice(0, 1).toUpperCase()}</span><span className={`presence-dot${contact.online ? ' online' : ''}`} /></span> <span>{contact.name}</span>
                {unreadCount > 0 && <span className="unread-badge" aria-label={`${unreadCount} mensagem(ns) não lida(s)`}>{unreadCount > 99 ? '99+' : unreadCount}</span>}
              </button>
            )
          })}
          {!!sessionId && <div className="nav-item" aria-label="Você, online"><span className="avatar-wrap"><span className="avatar" style={{ width: 26, height: 26, fontSize: 12, background:'#dca4dd', color:'#34303a' }}>{(myPlayerName || 'V').slice(0, 1).toUpperCase()}</span><span className="presence-dot online" /></span><span>{myPlayerName || 'Você'} (você)</span></div>}
          {contacts.length === 0 && <div className="empty">Ninguém mais está nesta sala agora.</div>}
        </div>
      </aside>

      <div className="conversation">
        <header className="conversation-header">
          <div className="conversation-title">
            <span className="avatar" style={{ width: 28, height: 28, fontSize: 13 }}>{(selectedConversation === 'general' ? '#' : currentContact?.name || '?').slice(0, 1).toUpperCase()}</span>
            {selectedConversation === 'general' ? '#Geral' : currentContact?.name || 'Mensagem direta'}
          </div>
          <div className="header-actions">
            {currentContact && <>
              <IconButton className="header-action primary" size="small" aria-label="Acenar" title="Acenar" onClick={() => network?.sendWave(currentContact.id)}><WavingHandIcon fontSize="small" /></IconButton>
              <button className="header-action go" type="button" disabled={!currentContact.online} onClick={() => walkToContact(currentContact.id)}><NearMeIcon sx={{ fontSize: 16, verticalAlign: 'middle', mr: .5 }} />Go to</button>
              <IconButton className="header-action" size="small" aria-label="Ligar para meeting" title="Ligar para meeting" disabled={!currentContact.online} onClick={() => network?.startMeetingCall(currentContact.id)}><VideocamOutlinedIcon fontSize="small" /></IconButton>
            </>}
            <IconButton className="header-action" size="small" aria-label="Mais opções"><MoreVertIcon fontSize="small" /></IconButton>
            <IconButton className="close" aria-label="Fechar chat" size="small" onClick={closeChat}><CloseIcon fontSize="small" /></IconButton>
          </div>
        </header>

        <div className="message-list" ref={listRef}>
          {visibleMessages.length === 0 && (
            <div className="welcome">
              <strong>{selectedConversation === 'general' ? '#Geral' : currentContact?.name || 'Mensagem direta'}</strong>
              {selectedConversation === 'general'
                ? 'Envie uma mensagem para todas as pessoas da sala.'
                : 'Esta conversa é privada entre vocês.'}
            </div>
          )}
          {visibleMessages.map((message) => (
              <div className={`message${message.senderId === sessionId ? ' mine' : ''}`} key={message.id}>
              <div className="avatar">{(message.senderName || 'P').slice(0, 1).toUpperCase()}</div>
              <div className="message-body"><div className="byline">{message.senderId === sessionId ? 'Você' : message.senderName}<span className="time">{new Date(message.sentAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></div>
              {message.content && <div className="bubble">{message.content.split(/(@[^\s@]+)/g).map((part, index) => part.startsWith('@') ? <span className="mention" key={index}>{part}</span> : part)}</div>}
              {message.attachment && <a className="attachment-link" href={message.attachment.data} download={message.attachment.name}><AttachFileIcon fontSize="small" />{message.attachment.name}</a>}</div>
            </div>
          ))}
        </div>

        <form className="composer" onSubmit={submitMessage}>
          <InputBase
            className="input"
            inputRef={inputRef}
            fullWidth
            placeholder={selectedConversation === 'general'
              ? 'Mensagem em #Geral'
              : currentContact?.online ? `Mensagem para ${currentContact.name}` : currentContact ? `${currentContact.name} está offline` : 'Esta pessoa não está mais na sala'}
            disabled={selectedConversation !== 'general' && !currentContact?.online}
            value={inputValue}
            onChange={(event) => {
              const value = event.target.value
              setInputValue(value)
              const cursor = event.target.selectionStart ?? value.length
              const beforeCursor = value.slice(0, cursor)
              const atIndex = beforeCursor.lastIndexOf('@')
              const query = atIndex >= 0 ? beforeCursor.slice(atIndex + 1) : ''
              if (atIndex >= 0 && !/\s/.test(query) && (atIndex === 0 || /\s/.test(beforeCursor[atIndex - 1]))) {
                setMentionStart(atIndex)
                setMentionQuery(query)
              } else setMentionQuery(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeChat()
            }}
            onFocus={() => dispatch(setFocused(true))}
            onBlur={() => dispatch(setFocused(false))}
            inputProps={{ 'aria-label': 'Escrever mensagem', maxLength: 500 }}
          />
          <input ref={fileRef} type="file" hidden onChange={(event) => {
            const file = event.target.files?.[0]
            if (!file) return
            if (file.size > 10 * 1024 * 1024) {
              setFileError('O arquivo deve ter até 10 MB.')
              event.target.value = ''
              return
            }
            setSelectedFile(file)
            setFileError('')
          }} />
          {emojiOpen && <div className="emoji-picker" onMouseDown={(event) => event.preventDefault()}>
            <div className="picker-search"><SearchIcon fontSize="small" /><input aria-label="Buscar emoji" placeholder="Buscar emoji..." value={emojiSearch} onChange={(event) => setEmojiSearch(event.target.value)} /><span>👋</span></div>
            <div className="emoji-heading">Sorrisos e emoções</div>
            <div className="emoji-grid">{filteredEmojis.map(([emoji, label]) => <button key={label} type="button" title={label} onClick={() => { insertTextAtCursor(emoji); setEmojiOpen(false); setEmojiSearch('') }}>{emoji}</button>)}</div>
          </div>}
          {mentionQuery !== null && filteredMentions.length > 0 && <div className="mention-picker" onMouseDown={(event) => event.preventDefault()}>
            {filteredMentions.map((contact) => <button className="mention-item" key={contact.id} type="button" onClick={() => selectMention(contact)}><span className="avatar-wrap"><span className="avatar" style={{ width: 25, height: 25, fontSize: 11 }}>{contact.name.slice(0, 1).toUpperCase()}</span><span className={`presence-dot${contact.online ? ' online' : ''}`} /></span>{contact.name}{contact.isYou ? ' (você)' : ''}</button>)}
          </div>}
          {selectedFile && <div className="attachment-chip">📎 {selectedFile.name} · <button type="button" aria-label="Remover anexo" onClick={() => setSelectedFile(null)}>remover</button></div>}
          {fileError && <div className="attachment-chip" role="alert" style={{ color:'#ff8189' }}>{fileError}</div>}
          <div className="composer-tools"><IconButton size="small" aria-label="Anexar arquivo" onClick={() => fileRef.current?.click()}><AttachFileIcon fontSize="small" /></IconButton><IconButton size="small" aria-label="Marcar pessoa" onClick={() => {
            const start = inputRef.current?.selectionStart ?? inputValue.length
            setMentionStart(start)
            setMentionQuery('')
            insertTextAtCursor('@')
          }}><AlternateEmailIcon fontSize="small" /></IconButton><IconButton size="small" aria-label="Abrir emojis" onClick={() => { setEmojiOpen((open) => !open); setMentionQuery(null) }}><SentimentSatisfiedAltIcon fontSize="small" /></IconButton><span style={{ flex: 1 }} /><IconButton className="send" aria-label="Enviar mensagem" type="submit" size="small" disabled={(!inputValue.trim() && !selectedFile) || (selectedConversation !== 'general' && !currentContact?.online)}><SendIcon fontSize="small" /></IconButton></div>
        </form>
      </div>
    </ChatWindow>
    {notification}
    {deferredCallNotice}
    </>
  )
}
