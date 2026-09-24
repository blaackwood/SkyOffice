import { Client, Room } from 'colyseus.js'
import {
  FocusPhase,
  IComputer,
  IOfficeState,
  IPlayer,
  IWhiteboard,
} from '../../../types/IOfficeState'
import type { IDeskDecoration } from '../../../types/Desk'
import { SavedDeskDecoration, loadDeskLayout, saveDeskLayout } from './DeskLayout'
import { Message } from '../../../types/Messages'
import { IRoomData, RoomType } from '../../../types/Rooms'
import { ItemType } from '../../../types/Items'
import WebRTC from '../web/WebRTC'
import { phaserEvents, Event } from '../events/EventCenter'
import store from '../stores'
import { setSessionId, setPlayerNameMap, removePlayerNameMap } from '../stores/UserStore'
import {
  setLobbyJoined,
  setJoinedRoomData,
  setAvailableRooms,
  addAvailableRooms,
  removeAvailableRooms,
  setConnectionStatus,
} from '../stores/RoomStore'
import { clearDailyChat, incrementUnread, pushConversationMessage } from '../stores/ChatStore'
import { playChatNotificationSound, playWaveNotificationSound, startCallRingtone } from './ChatNotificationSound'
import { setWhiteboardUrls } from '../stores/WhiteboardStore'
import { setGroupFocus } from '../stores/FocusStore'
import { brasiliaChatClearCycleKey, millisecondsUntilBrasiliaChatClear, shouldClearDailyChat } from '../../../types/DailyChatSchedule'

export default class Network {
  private client: Client
  private room?: Room<IOfficeState>
  private lobby?: Room
  private reconnectTarget: { kind: 'public' } | { kind: 'custom'; roomId: string; password: string | null } = { kind: 'public' }
  webRTC?: WebRTC

  mySessionId!: string
  private reconnecting = false
  private connectionHeartbeatTimer?: number
  private connectionHeartbeatTimeout?: number
  private chatClearTimer?: number
  private lastPlayerUpdate?: { x: number; y: number; anim: string }
  private lastPlayerTint?: number
  private lastPlayerStatus?: 'active' | 'busy' | 'away'
  private lastMicrophoneEnabled?: boolean
  private lastCameraEnabled?: boolean
  private lastBrasiliaChatClearDay = brasiliaChatClearCycleKey(Date.now())
  private meetingRoomLocks = new Map<string, boolean>()
  private stopCallRingtone?: () => void

  get roomState(): IOfficeState | undefined {
    return this.room?.state
  }

  constructor() {
    const protocol = window.location.protocol.replace('http', 'ws')
    const endpoint =
      process.env.NODE_ENV === 'production'
        ? import.meta.env.VITE_SERVER_URL
        : `${protocol}//${window.location.hostname}:2567`
    this.client = new Client(endpoint)
    void this.joinLobbyRoom()

    phaserEvents.on(Event.MY_PLAYER_NAME_CHANGE, this.updatePlayerName, this)
    phaserEvents.on(Event.MY_PLAYER_TEXTURE_CHANGE, this.updatePlayer, this)
    phaserEvents.on(Event.MY_PLAYER_TINT_CHANGE, this.updatePlayerTint, this)
    phaserEvents.on(Event.PLAYER_DISCONNECTED, this.playerStreamDisconnect, this)
    phaserEvents.on(Event.MY_PLAYER_STATUS_CHANGE, this.updatePlayerStatus, this)
    this.scheduleDailyChatClear()
    document.addEventListener('visibilitychange', this.handleChatVisibilityChange)
  }

  private clearChatIfBrasiliaDayChanged() {
    const timestamp = Date.now()
    const currentDay = brasiliaChatClearCycleKey(timestamp)
    if (!shouldClearDailyChat(timestamp, this.lastBrasiliaChatClearDay)) return
    this.lastBrasiliaChatClearDay = currentDay
    store.dispatch(clearDailyChat())
  }

  private scheduleDailyChatClear() {
    if (this.chatClearTimer) window.clearTimeout(this.chatClearTimer)
    this.chatClearTimer = window.setTimeout(() => {
      this.clearChatIfBrasiliaDayChanged()
      this.scheduleDailyChatClear()
    }, millisecondsUntilBrasiliaChatClear(Date.now()))
  }

  private handleChatVisibilityChange = () => {
    if (document.visibilityState !== 'visible') return
    this.clearChatIfBrasiliaDayChanged()
    this.scheduleDailyChatClear()
    this.sendConnectionHeartbeat()
  }

  /**
   * method to join Colyseus' built-in LobbyRoom, which automatically notifies
   * connected clients whenever rooms with "realtime listing" have updates
   */
  async joinLobbyRoom() {
    let attempt = 0
    while (!this.room) {
      if (!navigator.onLine) {
        await new Promise<void>((resolve) => {
          const handleOnline = () => {
            window.removeEventListener('online', handleOnline)
            resolve()
          }
          window.addEventListener('online', handleOnline, { once: true })
          if (navigator.onLine) handleOnline()
        })
      }

      try {
        const lobby = await this.client.joinOrCreate(RoomType.LOBBY)
        // The player may have joined the main room while matchmaking was
        // waiting for a sleeping server to wake up.
        if (this.room) {
          lobby.leave()
          return
        }

        this.lobby = lobby
        lobby.onMessage('rooms', (rooms) => {
          store.dispatch(setAvailableRooms(rooms))
        })

        lobby.onMessage('+', ([roomId, room]) => {
          store.dispatch(addAvailableRooms({ roomId, room }))
        })

        lobby.onMessage('-', (roomId) => {
          store.dispatch(removeAvailableRooms(roomId))
        })

        lobby.onLeave((code) => {
          if (code === 4000 || this.room) return
          this.lobby = undefined
          store.dispatch(setLobbyJoined(false))
          void this.joinLobbyRoom()
        })

        attempt = 0
        store.dispatch(setLobbyJoined(true))
        return
      } catch {
        attempt += 1
        store.dispatch(setLobbyJoined(false))
        const delay = Math.min(1000 * (2 ** Math.min(attempt - 1, 4)), 15_000)
        const jitteredDelay = Math.round(delay * (0.8 + Math.random() * 0.4))
        await new Promise((resolve) => window.setTimeout(resolve, jitteredDelay))
      }
    }
  }

  // method to join the public lobby
  async joinOrCreatePublic() {
    this.reconnectTarget = { kind: 'public' }
    this.room = await this.client.joinOrCreate(RoomType.PUBLIC)
    this.initialize()
  }

  // method to join a custom room
  async joinCustomById(roomId: string, password: string | null) {
    this.reconnectTarget = { kind: 'custom', roomId, password }
    this.room = await this.client.joinById(roomId, { password })
    this.initialize()
  }

  // method to create a custom room
  async createCustom(roomData: IRoomData) {
    const { name, description, password, autoDispose } = roomData
    this.room = await this.client.create(RoomType.CUSTOM, {
      name,
      description,
      password,
      autoDispose,
    })
    this.reconnectTarget = { kind: 'custom', roomId: this.room.id, password }
    this.initialize()
  }

  // set up all network listeners before the game starts
  initialize(isReconnection = false) {
    if (!this.room) return

    if (!isReconnection && this.lobby) {
      const lobby = this.lobby
      this.lobby = undefined
      store.dispatch(setLobbyJoined(false))
      lobby.leave()
    }
    this.mySessionId = this.room.sessionId
    store.dispatch(setSessionId(this.room.sessionId))
    if (!this.webRTC) this.webRTC = new WebRTC(this.mySessionId, this)
    store.dispatch(setConnectionStatus('connected'))
    if (this.connectionHeartbeatTimeout) window.clearTimeout(this.connectionHeartbeatTimeout)
    this.connectionHeartbeatTimeout = undefined
    this.startConnectionHeartbeat()

    const activeRoom = this.room
    activeRoom.onLeave((code) => {
      // 4000 is Colyseus' intentional leave code. Unexpected closes keep the
      // same room/session briefly on the server so this client can resume.
      if (code === 4000 || this.reconnecting) return
      void this.reconnectRoom(activeRoom.id, activeRoom.sessionId)
    })

    const syncGroupFocus = () => {
      const focus = this.room!.state.groupFocus
      store.dispatch(
        setGroupFocus({
          phase: focus.phase,
          status: focus.status,
          durationSeconds: focus.durationSeconds,
          remainingSeconds: focus.remainingSeconds,
        })
      )
    }
    this.room.state.groupFocus.onChange = syncGroupFocus
    syncGroupFocus()

    const notifyDeskDecoration = (item: IDeskDecoration, id: string) => {
      phaserEvents.emit(Event.DESK_DECORATION_UPDATED, item, id)
    }
    this.room.state.deskDecorations.onAdd = (item: IDeskDecoration, id: string) => {
      item.onChange = () => notifyDeskDecoration(item, id)
      notifyDeskDecoration(item, id)
    }
    this.room.state.deskDecorations.onRemove = (_item: IDeskDecoration, id: string) => {
      phaserEvents.emit(Event.DESK_DECORATION_REMOVED, id)
    }
    this.room.state.deskDecorations.forEach((item, id) => notifyDeskDecoration(item, id))

    // Track players added after initialization and players already present in
    // the initial snapshot, including participants who are still choosing a name.
    const trackedPlayers = new Set<string>()
    const trackPlayer = (player: IPlayer, key: string) => {
      if (trackedPlayers.has(key)) return
      trackedPlayers.add(key)
      if (key === this.mySessionId) return
      phaserEvents.emit(Event.PLAYER_UPDATED, 'status', player.status, key)
      phaserEvents.emit(Event.PLAYER_UPDATED, 'microphoneEnabled', player.microphoneEnabled, key)
      let playerReportedJoined = false
      const reportPlayerJoined = () => {
        if (playerReportedJoined || player.name === '') return
        playerReportedJoined = true
        phaserEvents.emit(Event.PLAYER_JOINED, player, key)
        store.dispatch(setPlayerNameMap({ id: key, name: player.name }))
      }

      // track changes on every child object inside the players MapSchema
      player.onChange = (changes) => {
        changes.forEach((change) => {
          const { field, value } = change
          phaserEvents.emit(Event.PLAYER_UPDATED, field, value, key)

          if (field === 'name' && value !== '') reportPlayerJoined()
        })
      }
      // The player may already have a name in the initial room snapshot, in
      // which case there will be no later name-change event to create its sprite.
      reportPlayerJoined()
    }
    this.room.state.players.onAdd = trackPlayer
    this.room.state.players.forEach(trackPlayer)

    // an instance removed from the players MapSchema
    this.room.state.players.onRemove = (player: IPlayer, key: string) => {
      trackedPlayers.delete(key)
      phaserEvents.emit(Event.PLAYER_LEFT, key)
      this.webRTC?.deleteVideoStream(key)
      this.webRTC?.deleteOnCalledVideoStream(key)
      store.dispatch(removePlayerNameMap(key))
    }

    // new instance added to the computers MapSchema
    this.room.state.computers.onAdd = (computer: IComputer, key: string) => {
      // track changes on every child object's connectedUser
      computer.connectedUser.onAdd = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.COMPUTER)
      }
      computer.connectedUser.onRemove = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.COMPUTER)
      }
    }

    // new instance added to the whiteboards MapSchema
    this.room.state.whiteboards.onAdd = (whiteboard: IWhiteboard, key: string) => {
      store.dispatch(
        setWhiteboardUrls({
          whiteboardId: key,
          roomId: whiteboard.roomId,
        })
      )
      // track changes on every child object's connectedUser
      whiteboard.connectedUser.onAdd = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_ADDED, item, key, ItemType.WHITEBOARD)
      }
      whiteboard.connectedUser.onRemove = (item, index) => {
        phaserEvents.emit(Event.ITEM_USER_REMOVED, item, key, ItemType.WHITEBOARD)
      }
    }

    // when the server sends room data
    this.room.onMessage(Message.SEND_ROOM_DATA, (content) => {
      store.dispatch(setJoinedRoomData(content))
    })

    this.room.onMessage(Message.TEAM_LABEL_UPDATED, ({ teamLabel }) => {
      phaserEvents.emit(Event.TEAM_NAME_CHANGED, teamLabel)
    })

    // when a user sends a message
    this.room.onMessage(Message.ADD_CHAT_MESSAGE, (message: {
      messageId?: string
      channel?: 'general' | 'direct' | 'nearby'
      clientId?: string
      senderId?: string
      senderName?: string
      recipientId?: string
      recipientName?: string
      content: string
      attachment?: { name: string; mimeType: string; data: string }
      sentAt?: number
      history?: boolean
    }) => {
      if (message.channel === 'nearby' || !message.channel) {
        if (message.clientId) {
          playChatNotificationSound()
          phaserEvents.emit(Event.UPDATE_DIALOG_BUBBLE, message.clientId, message.content)
        }
        return
      }
      if (message.channel !== 'general' && message.channel !== 'direct') return
      const peerId = message.channel === 'direct'
        ? (message.senderId === this.mySessionId ? message.recipientId : message.senderId)
        : undefined
      const conversationId = message.channel === 'general' ? 'general' : `dm:${peerId || ''}`
      store.dispatch(pushConversationMessage({
        id: message.messageId || `${message.sentAt ?? Date.now()}:${message.senderId}:${Math.random()}`,
        channel: message.channel,
        conversationId,
        senderId: message.senderId || '',
        senderName: message.senderName || 'Participante',
        recipientId: message.recipientId,
        recipientName: message.recipientName,
        content: message.content,
        attachment: message.attachment,
        sentAt: message.sentAt ?? Date.now(),
      }))
      if (message.senderId !== this.mySessionId) {
        if (!message.history) playChatNotificationSound()
        const chat = store.getState().chat
        if (!chat.showChat || chat.selectedConversation !== conversationId) {
          store.dispatch(incrementUnread(conversationId))
        }
      }
    })

    this.room.onMessage(Message.CLEAR_CHAT_HISTORY, () => {
      this.lastBrasiliaChatClearDay = brasiliaChatClearCycleKey(Date.now())
      store.dispatch(clearDailyChat())
    })

    this.room.onMessage(Message.CONNECTION_HEARTBEAT_ACK, () => {
      if (this.connectionHeartbeatTimeout) window.clearTimeout(this.connectionHeartbeatTimeout)
      this.connectionHeartbeatTimeout = undefined
    })
    // Check the socket right away so a half-open connection is detected
    // promptly, then keep checking every three minutes in the background.
    this.sendConnectionHeartbeat()

    // Ask after installing listeners so the room can safely replay the history.
    this.room.send(Message.REQUEST_CHAT_HISTORY)

    this.room.onMessage(Message.MEETING_CHAT_MESSAGE, (message: {
      roomId: string; senderId: string; senderName: string; content: string; attachment?: { name: string; mimeType: string; data: string }; sentAt: number
    }) => {
      phaserEvents.emit(Event.MEETING_CHAT_MESSAGE, message)
    })

    const updateMeetingLock = (roomId: string, locked: boolean) => {
      this.meetingRoomLocks.set(roomId, locked)
      phaserEvents.emit(Event.MEETING_ROOM_LOCK_CHANGED, roomId, locked)
    }
    this.room.onMessage(Message.MEETING_ROOM_LOCK_UPDATED, (message: { roomId: string; locked: boolean }) => {
      if (message?.roomId && typeof message.locked === 'boolean') updateMeetingLock(message.roomId, message.locked)
    })
    this.room.onMessage(Message.MEETING_ROOM_LOCK_STATE, (locks: Record<string, boolean>) => {
      Object.entries(locks ?? {}).forEach(([roomId, locked]) => {
        if (typeof locked === 'boolean') updateMeetingLock(roomId, locked)
      })
    })
    this.room.onMessage(Message.WAVE_RECEIVED, (message: { fromId: string; fromName: string }) => {
      if (!message?.fromId || message.fromId === this.mySessionId) return
      playWaveNotificationSound()
      phaserEvents.emit(Event.WAVE_RECEIVED, message)
    })
    this.room.onMessage(Message.MEETING_WALK_INVITE, (message: { fromId: string; fromName: string }) => {
      if (message?.fromId && message.fromId !== this.mySessionId) phaserEvents.emit(Event.MEETING_WALK_INVITE, message)
    })
    this.room.onMessage(Message.MEETING_WALK_STARTED, (message: { roomId: string; participants: { playerId: string; seatIndex: number }[] }) => {
      const participant = message?.participants?.find((entry) => entry.playerId === this.mySessionId)
      if (!message?.roomId || !participant) return
      phaserEvents.emit(Event.MEETING_WALK_STARTED, message.roomId, participant.seatIndex)
    })
    this.room.onMessage(Message.MEETING_WALK_DECLINED, (message: { peerName?: string; locked?: boolean }) => {
      phaserEvents.emit(Event.MEETING_WALK_DECLINED, message)
    })
    this.room.onMessage(Message.MEETING_CALL_INVITE, (message: { fromId: string; fromName: string; roomId: string; roomName: string }) => {
      if (!message?.fromId || message.fromId === this.mySessionId) return
      this.stopCallRingtone?.()
      this.stopCallRingtone = startCallRingtone()
      phaserEvents.emit(Event.MEETING_CALL_INVITE, message)
    })
    this.room.onMessage(Message.MEETING_CALL_ACCEPTED, () => {
      this.stopCallRingtone?.()
      this.stopCallRingtone = undefined
      phaserEvents.emit(Event.MEETING_CALL_FINISHED)
    })
    this.room.onMessage(Message.MEETING_CALL_DECLINED, (message: { fromName?: string; reason?: string }) => {
      this.stopCallRingtone?.()
      this.stopCallRingtone = undefined
      phaserEvents.emit(Event.MEETING_CALL_DECLINED, message)
    })
    this.room.onMessage(Message.MEETING_CALL_ENDED, () => {
      this.stopCallRingtone?.()
      this.stopCallRingtone = undefined
      phaserEvents.emit(Event.MEETING_CALL_FINISHED)
    })
    this.room.onMessage(Message.MEETING_CALL_DEFERRED, (message: { fromId: string; fromName: string; roomId: string; roomName: string }) => {
      this.stopCallRingtone?.()
      this.stopCallRingtone = undefined
      phaserEvents.emit(Event.MEETING_CALL_DEFERRED, message)
    })

    // when a peer disconnects with myPeer
    this.room.onMessage(Message.DISCONNECT_STREAM, (clientId: string) => {
      this.webRTC?.deleteOnCalledVideoStream(clientId)
    })

    // when a computer user stops sharing screen
    this.room.onMessage(Message.STOP_SCREEN_SHARE, (clientId: string) => {
      const computerState = store.getState().computer
      computerState.shareScreenManager?.onUserLeft(clientId)
    })
  }

  // method to register event listener and call back function when a item user added
  onChatMessageAdded(callback: (playerId: string, content: string) => void, context?: any) {
    phaserEvents.on(Event.UPDATE_DIALOG_BUBBLE, callback, context)
  }

  // method to register event listener and call back function when a item user added
  onItemUserAdded(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_ADDED, callback, context)
  }

  // method to register event listener and call back function when a item user removed
  onItemUserRemoved(
    callback: (playerId: string, key: string, itemType: ItemType) => void,
    context?: any
  ) {
    phaserEvents.on(Event.ITEM_USER_REMOVED, callback, context)
  }

  onDeskDecorationUpdated(callback: (item: IDeskDecoration, id: string) => void, context?: any) {
    phaserEvents.on(Event.DESK_DECORATION_UPDATED, callback, context)
    this.room?.state.deskDecorations.forEach((item, id) => callback.call(context, item, id))
  }

  onDeskDecorationRemoved(callback: (id: string) => void, context?: any) {
    phaserEvents.on(Event.DESK_DECORATION_REMOVED, callback, context)
  }

  // method to register event listener and call back function when a player joined
  onPlayerJoined(callback: (Player: IPlayer, key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_JOINED, callback, context)
    // Reconcile the current snapshot too: the initial onAdd/onChange callbacks
    // can arrive before the Game scene registers its listeners.
    this.room?.state.players.forEach((player, key) => {
      if (key !== this.mySessionId && player.name !== '') {
        callback.call(context, player, key)
      }
    })

  }

  private async reconnectRoom(roomId: string, sessionId: string) {
    if (this.reconnecting) return
    this.reconnecting = true
    store.dispatch(setConnectionStatus('reconnecting'))

    try {
      let attempt = 0
      while (this.reconnecting) {
        if (!navigator.onLine) {
          await new Promise<void>((resolve) => {
            const handleOnline = () => {
              window.removeEventListener('online', handleOnline)
              resolve()
            }
            window.addEventListener('online', handleOnline, { once: true })
            // Recheck after subscribing so a fast network recovery cannot be
            // missed between the initial check and listener registration.
            if (navigator.onLine) handleOnline()
          })
          continue
        }

        try {
          this.room = await this.client.reconnect(roomId, sessionId)
          this.initialize(true)
          return
        } catch {
          attempt += 1
        }

        // If Render restarted the instance, the old session may no longer
        // exist. Rejoin with a fresh session while continuing to retry.
        if (attempt >= 3) {
          try {
            this.room = this.reconnectTarget.kind === 'public'
              ? await this.client.joinOrCreate(RoomType.PUBLIC)
              : await this.client.joinById(this.reconnectTarget.roomId, { password: this.reconnectTarget.password })
            this.initialize(true)
            this.webRTC?.reconnectAs(this.mySessionId)
            this.restorePlayerAfterFreshJoin()
            return
          } catch {
            attempt += 1
          }
        }

        const delay = Math.min(1000 * (2 ** Math.min(attempt - 1, 4)), 15_000)
        const jitteredDelay = Math.round(delay * (0.8 + Math.random() * 0.4))
        await new Promise((resolve) => window.setTimeout(resolve, jitteredDelay))
      }
    } finally {
      this.reconnecting = false
    }
  }

  private startConnectionHeartbeat() {
    if (this.connectionHeartbeatTimer) window.clearInterval(this.connectionHeartbeatTimer)
    this.connectionHeartbeatTimer = window.setInterval(() => this.sendConnectionHeartbeat(), 3 * 60 * 1000)
  }

  private sendConnectionHeartbeat() {
    if (!this.room || this.reconnecting || this.connectionHeartbeatTimeout) return
    this.room.send(Message.CONNECTION_HEARTBEAT)
    this.connectionHeartbeatTimeout = window.setTimeout(() => {
      this.connectionHeartbeatTimeout = undefined
      if (this.room && !this.reconnecting) void this.reconnectRoom(this.room.id, this.room.sessionId)
    }, 20_000)
  }

  private restorePlayerAfterFreshJoin() {
    const { user } = store.getState()
    if (user.myPlayerName) this.updatePlayerName(user.myPlayerName)
    if (this.lastPlayerUpdate) {
      const { x, y, anim } = this.lastPlayerUpdate
      this.updatePlayer(x, y, anim)
    }
    if (this.lastPlayerTint !== undefined) this.updatePlayerTint(this.lastPlayerTint)
    if (this.lastPlayerStatus) this.updatePlayerStatus(this.lastPlayerStatus)
    if (this.lastMicrophoneEnabled !== undefined) this.updateMicrophoneState(this.lastMicrophoneEnabled)
    if (this.lastCameraEnabled !== undefined) this.updateCameraState(this.lastCameraEnabled)
    if (user.loggedIn) {
      this.readyToConnect()
      if (user.videoConnected) this.videoConnected()
    }
  }

  retryConnection() {
    if (this.room) void this.reconnectRoom(this.room.id, this.room.sessionId)
  }

  // method to register event listener and call back function when a player left
  onPlayerLeft(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_LEFT, callback, context)
  }

  // method to register event listener and call back function when myPlayer is ready to connect
  onMyPlayerReady(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_READY, callback, context)
  }

  // method to register event listener and call back function when my video is connected
  onMyPlayerVideoConnected(callback: (key: string) => void, context?: any) {
    phaserEvents.on(Event.MY_PLAYER_VIDEO_CONNECTED, callback, context)
  }

  // method to register event listener and call back function when a player updated
  onPlayerUpdated(
    callback: (field: string, value: number | string, key: string) => void,
    context?: any
  ) {
    phaserEvents.on(Event.PLAYER_UPDATED, callback, context)
  }

  onPlayerVoiceActivity(callback: (playerId: string, speaking: boolean) => void, context?: any) {
    phaserEvents.on(Event.PLAYER_VOICE_ACTIVITY, callback, context)
  }

  // method to send player updates to Colyseus server
  updatePlayer(currentX: number, currentY: number, currentAnim: string) {
    this.lastPlayerUpdate = { x: currentX, y: currentY, anim: currentAnim }
    this.room?.send(Message.UPDATE_PLAYER, { x: currentX, y: currentY, anim: currentAnim })
  }

  // method to send player name to Colyseus server
  updatePlayerName(currentName: string) {
    this.room?.send(Message.UPDATE_PLAYER_NAME, { name: currentName })
    if (!this.room) return
    const roomName = store.getState().room.roomName || 'Public office'
    const items = loadDeskLayout(roomName, currentName)
    this.room.send(Message.SYNC_DESK_LAYOUT, { items })
  }

  updatePlayerTint(tint: number) {
    this.lastPlayerTint = tint
    this.room?.send(Message.UPDATE_PLAYER_TINT, { tint })
  }

  updateTeamLabel(teamLabel: string) {
    this.room?.send(Message.UPDATE_TEAM_LABEL, { teamLabel })
  }

  saveDeskLayout(items: SavedDeskDecoration[]) {
    const name = store.getState().user.myPlayerName
    const roomName = store.getState().room.roomName || 'Public office'
    if (!name) return
    saveDeskLayout(roomName, name, items)
    this.room?.send(Message.SYNC_DESK_LAYOUT, { items })
  }

  claimDesk(deskIndex: number) {
    this.room?.send(Message.CLAIM_DESK, { deskIndex })
    if (!this.room) return
    const name = store.getState().user.myPlayerName
    const roomName = store.getState().room.roomName || 'Public office'
    if (name) {
      const items = loadDeskLayout(roomName, name)
      this.room.send(Message.SYNC_DESK_LAYOUT, { items })
    }
  }

  updateDeskDecoration(id: string, texture: string, frame: number, x: number, y: number, rotation = 0) {
    this.room?.send(Message.UPDATE_DESK_DECORATION, { id, texture, frame, x, y, rotation })
  }

  removeDeskDecoration(id: string) {
    this.room?.send(Message.REMOVE_DESK_DECORATION, { id })
  }

  // method to send ready-to-connect signal to Colyseus server
  readyToConnect() {
    this.room?.send(Message.READY_TO_CONNECT)
    phaserEvents.emit(Event.MY_PLAYER_READY)
  }

  // method to send ready-to-connect signal to Colyseus server
  videoConnected() {
    this.room?.send(Message.VIDEO_CONNECTED)
    phaserEvents.emit(Event.MY_PLAYER_VIDEO_CONNECTED)
  }

  updatePlayerStatus(status: 'active' | 'busy' | 'away') {
    this.lastPlayerStatus = status
    this.room?.send(Message.UPDATE_PLAYER_STATUS, { status })
  }

  updateCameraState(enabled: boolean) {
    this.lastCameraEnabled = enabled
    this.room?.send(Message.UPDATE_CAMERA_STATE, { enabled })
  }

  updateMicrophoneState(enabled: boolean) {
    this.lastMicrophoneEnabled = enabled
    this.room?.send(Message.UPDATE_MICROPHONE_STATE, { enabled })
    phaserEvents.emit(Event.MY_PLAYER_MIC_STATE_CHANGE, enabled)
  }

  updateRemoteVoiceActivity(peerId: string, speaking: boolean) {
    phaserEvents.emit(Event.PLAYER_VOICE_ACTIVITY, this.sessionIdForPeer(peerId), speaking)
  }

  sessionIdForPeer(peerId: string) {
    let playerId = peerId
    this.room?.state.players.forEach((_, id) => {
      if (id.replace(/[^0-9a-z]/gi, 'G') === peerId) playerId = id
    })
    return playerId
  }

  updateGroupFocus(
    action: 'start' | 'pause' | 'resume' | 'stop' | 'reset' | 'phase' | 'duration',
    details: { phase?: FocusPhase; minutes?: number } = {}
  ) {
    this.room?.send(Message.UPDATE_GROUP_FOCUS, { action, ...details })
  }

  // method to send stream-disconnection signal to Colyseus server
  playerStreamDisconnect(id: string) {
    this.room?.send(Message.DISCONNECT_STREAM, { clientId: id })
    this.webRTC?.deleteVideoStream(id)
    this.webRTC?.deleteOnCalledVideoStream(id)
  }

  connectToComputer(id: string) {
    this.room?.send(Message.CONNECT_TO_COMPUTER, { computerId: id })
  }

  disconnectFromComputer(id: string) {
    this.room?.send(Message.DISCONNECT_FROM_COMPUTER, { computerId: id })
  }

  connectToWhiteboard(id: string) {
    this.room?.send(Message.CONNECT_TO_WHITEBOARD, { whiteboardId: id })
  }

  disconnectFromWhiteboard(id: string) {
    this.room?.send(Message.DISCONNECT_FROM_WHITEBOARD, { whiteboardId: id })
  }

  onStopScreenShare(id: string) {
    this.room?.send(Message.STOP_SCREEN_SHARE, { computerId: id })
  }

  addChatMessage(content: string, channel: 'general' | 'direct' | 'nearby' = 'nearby', recipientId?: string, attachment?: { name: string; mimeType: string; data: string }) {
    this.room?.send(Message.ADD_CHAT_MESSAGE, { content, channel, recipientId, attachment })
  }

  sendWave(targetId: string) { this.room?.send(Message.WAVE_USER, { targetId }) }
  waveBack(targetId: string) { this.room?.send(Message.WAVE_RECEIVED, { targetId }) }
  requestMeetingWalk(targetId: string) { this.room?.send(Message.REQUEST_MEETING_WALK, { targetId }) }
  startMeetingWalk(targetId: string) { this.room?.send(Message.START_MEETING_WALK, { targetId }) }
  respondToMeetingWalk(fromId: string, accept: boolean) { this.room?.send(Message.RESPOND_MEETING_WALK, { fromId, accept }) }
  startMeetingCall(targetId: string) {
    this.stopCallRingtone?.()
    this.stopCallRingtone = startCallRingtone()
    this.room?.send(Message.START_MEETING_CALL, { targetId })
  }
  respondToMeetingCall(fromId: string, response: 'accept' | 'decline' | 'later') {
    this.stopCallRingtone?.()
    this.stopCallRingtone = undefined
    this.room?.send(Message.RESPOND_MEETING_CALL, { fromId, response })
  }

  sendMeetingChatMessage(roomId: string, content: string, attachment?: { name: string; mimeType: string; data: string }) {
    this.room?.send(Message.MEETING_CHAT_MESSAGE, { roomId, content, attachment })
  }

  isMeetingRoomLocked(roomId: string) {
    return this.meetingRoomLocks.get(roomId) ?? false
  }

  getLockedMeetingRoomIds() {
    return [...this.meetingRoomLocks.entries()].filter(([, locked]) => locked).map(([roomId]) => roomId)
  }

  setMeetingRoomLocked(roomId: string, locked: boolean) {
    this.room?.send(Message.SET_MEETING_ROOM_LOCK, { roomId, locked })
  }

}
