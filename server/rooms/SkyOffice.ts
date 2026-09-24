import bcrypt from 'bcrypt'
import { Room, Client, ServerError } from 'colyseus'
import { Dispatcher } from '@colyseus/command'
import { Player, OfficeState, Computer, Whiteboard, DeskDecoration, DeskSlot } from './schema/OfficeState'
import { Message } from '../../types/Messages'
import { millisecondsUntilBrasiliaChatClear } from '../../types/DailyChatSchedule'
import { selectNearestAvailableMeetingRoom, MeetingRoomCandidate } from './MeetingRoomSelection'
import { DESK_DECORATION_ASSETS, DESK_SLOTS } from '../../types/Desk'
import { IRoomData } from '../../types/Rooms'
import { whiteboardRoomIds } from './schema/OfficeState'
import PlayerUpdateCommand from './commands/PlayerUpdateCommand'
import PlayerUpdateNameCommand from './commands/PlayerUpdateNameCommand'
import {
  ComputerAddUserCommand,
  ComputerRemoveUserCommand,
} from './commands/ComputerUpdateArrayCommand'
import {
  WhiteboardAddUserCommand,
  WhiteboardRemoveUserCommand,
} from './commands/WhiteboardUpdateArrayCommand'

export class SkyOffice extends Room<OfficeState> {
  private dispatcher = new Dispatcher(this)
  private groupFocusTicker?: ReturnType<typeof setInterval>
  private name: string
  private description: string
  private password: string | null = null
  private meetingRoomLocks = new Map<string, boolean>()
  private meetingWalkInvites = new Map<string, { fromId: string; expiresAt: number }>()
  private meetingCalls = new Map<string, { fromId: string; roomId: string; roomName: string; timer: ReturnType<typeof setTimeout> }>()
  private generalChatHistory: Array<{
    channel: 'general'
    senderId: string
    senderName: string
    content: string
    attachment?: { name: string; mimeType: string; data: string }
    sentAt: number
  }> = []
  private chatClearTimer?: ReturnType<typeof setTimeout>
  private configuredAutoDispose = true

  async onCreate(options: IRoomData) {
    const { name, description, password, autoDispose } = options
    this.name = name
    this.description = description
    this.autoDispose = autoDispose
    this.configuredAutoDispose = this.autoDispose

    let hasPassword = false
    if (password) {
      const salt = await bcrypt.genSalt(10)
      this.password = await bcrypt.hash(password, salt)
      hasPassword = true
    }
    this.setMetadata({ name, description, hasPassword })

    this.setState(new OfficeState())
    this.registerTeamLabelHandler()
    this.scheduleGeneralChatClear()

    DESK_SLOTS.forEach((_, index) => this.state.desks.set(String(index), new DeskSlot()))

    this.groupFocusTicker = setInterval(() => {
      const focus = this.state.groupFocus
      if (focus.status !== 'running') return
      focus.remainingSeconds = Math.max(0, focus.remainingSeconds - 1)
      if (focus.remainingSeconds === 0) focus.status = 'completed'
    }, 1000)

    // HARD-CODED: Add 5 computers in a room
    for (let i = 0; i < 5; i++) {
      this.state.computers.set(String(i), new Computer())
    }

    // HARD-CODED: Add 3 whiteboards in a room
    for (let i = 0; i < 3; i++) {
      this.state.whiteboards.set(String(i), new Whiteboard())
    }

    // when a player connect to a computer, add to the computer connectedUser array
    this.onMessage(Message.CONNECT_TO_COMPUTER, (client, message: { computerId: string }) => {
      this.dispatcher.dispatch(new ComputerAddUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    // when a player disconnect from a computer, remove from the computer connectedUser array
    this.onMessage(Message.DISCONNECT_FROM_COMPUTER, (client, message: { computerId: string }) => {
      this.dispatcher.dispatch(new ComputerRemoveUserCommand(), {
        client,
        computerId: message.computerId,
      })
    })

    // when a player stop sharing screen
    this.onMessage(Message.STOP_SCREEN_SHARE, (client, message: { computerId: string }) => {
      const computer = this.state.computers.get(message.computerId)
      computer.connectedUser.forEach((id) => {
        this.clients.forEach((cli) => {
          if (cli.sessionId === id && cli.sessionId !== client.sessionId) {
            cli.send(Message.STOP_SCREEN_SHARE, client.sessionId)
          }
        })
      })
    })

    // when a player connect to a whiteboard, add to the whiteboard connectedUser array
    this.onMessage(Message.CONNECT_TO_WHITEBOARD, (client, message: { whiteboardId: string }) => {
      this.dispatcher.dispatch(new WhiteboardAddUserCommand(), {
        client,
        whiteboardId: message.whiteboardId,
      })
    })

    // when a player disconnect from a whiteboard, remove from the whiteboard connectedUser array
    this.onMessage(
      Message.DISCONNECT_FROM_WHITEBOARD,
      (client, message: { whiteboardId: string }) => {
        this.dispatcher.dispatch(new WhiteboardRemoveUserCommand(), {
          client,
          whiteboardId: message.whiteboardId,
        })
      }
    )

    // when receiving updatePlayer message, call the PlayerUpdateCommand
    this.onMessage(
      Message.UPDATE_PLAYER,
      (client, message: { x: number; y: number; anim: string }) => {
        this.dispatcher.dispatch(new PlayerUpdateCommand(), {
          client,
          x: message.x,
          y: message.y,
          anim: message.anim,
        })
      }
    )

    // when receiving updatePlayerName message, call the PlayerUpdateNameCommand
    this.onMessage(Message.UPDATE_PLAYER_NAME, (client, message: { name: string }) => {
      const name = typeof message?.name === 'string' ? message.name.trim().slice(0, 24) : ''
      const player = this.state.players.get(client.sessionId)
      if (!name || !player) return
      if (player.deskIndex >= 0 && player.name.toLocaleLowerCase() !== name.toLocaleLowerCase()) return
      const duplicate = Array.from(this.state.players.entries()).some(
        ([sessionId, other]) => sessionId !== client.sessionId && other.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
      )
      if (duplicate) return
      this.dispatcher.dispatch(new PlayerUpdateNameCommand(), {
        client,
        name,
      })
      // Reclaim the same desk when the named participant rejoins this room.
      const owned = Array.from(this.state.desks.entries()).find(([, desk]) => desk.ownerName.toLocaleLowerCase() === name.toLocaleLowerCase())
      if (owned) {
        const [index, desk] = owned
        desk.ownerSessionId = client.sessionId
        player.deskIndex = Number(index)
      }
    })

    this.onMessage(Message.CLAIM_DESK, (client, message: { deskIndex: number }) => {
      const player = this.state.players.get(client.sessionId)
      const index = Number(message?.deskIndex)
      const desk = this.state.desks.get(String(index))
      if (!player?.name || !desk || !Number.isInteger(index)) return
      if (player.deskIndex === index) return
      if (desk.ownerName && desk.ownerSessionId !== client.sessionId) return
      const duplicateOwner = Array.from(this.state.desks.values()).some(
        (entry) => entry !== desk && entry.ownerSessionId !== client.sessionId && entry.ownerName.toLocaleLowerCase() === player.name.trim().toLocaleLowerCase()
      )
      if (duplicateOwner) return
      if (player.deskIndex >= 0) {
        const previousDesk = this.state.desks.get(String(player.deskIndex))
        if (previousDesk?.ownerSessionId === client.sessionId) {
          previousDesk.ownerName = ''
          previousDesk.ownerSessionId = ''
        }
      }
      desk.ownerName = player.name.trim()
      desk.ownerSessionId = client.sessionId
      player.deskIndex = index
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.READY_TO_CONNECT, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.readyToConnect = true
    })

    // when a player is ready to connect, call the PlayerReadyToConnectCommand
    this.onMessage(Message.VIDEO_CONNECTED, (client) => {
      const player = this.state.players.get(client.sessionId)
      if (player) player.videoConnected = true
    })

    this.onMessage(Message.UPDATE_CAMERA_STATE, (client, message: { enabled: boolean }) => {
      if (typeof message?.enabled !== 'boolean') return
      const player = this.state.players.get(client.sessionId)
      if (player) player.cameraEnabled = message.enabled
    })

    this.onMessage(Message.UPDATE_PLAYER_TINT, (client, message: { tint: number }) => {
      const player = this.state.players.get(client.sessionId)
      const tint = Number(message?.tint)
      if (!player || !Number.isInteger(tint) || tint < 0 || tint > 0xffffff) return
      player.tint = tint
    })

    this.onMessage(Message.UPDATE_MICROPHONE_STATE, (client, message: { enabled: boolean }) => {
      if (typeof message?.enabled !== 'boolean') return
      const player = this.state.players.get(client.sessionId)
      if (player) player.microphoneEnabled = message.enabled
    })

    // Each named participant owns one assigned workstation. Layout sync is
    // room-scoped; the client also keeps the owner's layout in local storage.
    this.onMessage(Message.SYNC_DESK_LAYOUT, (client, message: { items: unknown[] }) => {
      const player = this.state.players.get(client.sessionId)
      if (!player?.name || player.deskIndex < 0 || !Array.isArray(message?.items)) return
      const ownerName = player.name.trim().toLocaleLowerCase()
      const slot = DESK_SLOTS[player.deskIndex]
      if (!slot) return

      this.state.deskDecorations.forEach((item, id) => {
        if (item.ownerName === ownerName) this.state.deskDecorations.delete(id)
      })

      message.items.slice(0, 80).forEach((raw, index) => {
        if (!raw || typeof raw !== 'object') return
        const item = raw as { texture?: unknown; frame?: unknown; dx?: unknown; dy?: unknown; rotation?: unknown }
        const texture = typeof item.texture === 'string' ? item.texture : ''
        const asset = DESK_DECORATION_ASSETS.find((entry) => entry.texture === texture && entry.frame === item.frame)
        if (!asset) return
        if (typeof item.dx !== 'number' || typeof item.dy !== 'number') return
        if (Math.abs(item.dx) > slot.width / 2 - 8 || Math.abs(item.dy) > slot.height / 2 - 8) return
        const decoration = new DeskDecoration()
        decoration.ownerName = ownerName
        decoration.texture = texture
        decoration.frame = asset.frame
        decoration.rotation = Number.isFinite(item.rotation) ? Number(item.rotation) : 0
        decoration.x = slot.x + item.dx
        decoration.y = slot.y + item.dy
        this.state.deskDecorations.set(`${ownerName}:${index}`, decoration)
      })
    })

    this.onMessage(
      Message.UPDATE_DESK_DECORATION,
      (client, message: { id: string; texture: string; frame: number; x: number; y: number; rotation?: number }) => {
        const player = this.state.players.get(client.sessionId)
        if (!player?.name || player.deskIndex < 0 || !message) return
        const id = String(message.id || '')
        const existing = this.state.deskDecorations.get(id)
        const ownerName = player.name.trim().toLocaleLowerCase()
        const slot = DESK_SLOTS[player.deskIndex]
        if (!slot || (existing && existing.ownerName !== ownerName)) return
        const asset = DESK_DECORATION_ASSETS.find((entry) => entry.texture === message.texture && entry.frame === message.frame)
        if (!asset) return
        if (!Number.isFinite(message.x) || !Number.isFinite(message.y)) return
        if (Math.abs(message.x - slot.x) > slot.width / 2 - 8 || Math.abs(message.y - slot.y) > slot.height / 2 - 8) return

        const decoration = existing || new DeskDecoration()
        decoration.ownerName = ownerName
        decoration.texture = message.texture
        decoration.frame = message.frame
        decoration.rotation = Number.isFinite(message.rotation) ? Number(message.rotation) : 0
        decoration.x = Math.round(message.x / 4) * 4
        decoration.y = Math.round(message.y / 4) * 4
        this.state.deskDecorations.set(id, decoration)
      }
    )

    this.onMessage(Message.REMOVE_DESK_DECORATION, (client, message: { id: string }) => {
      const player = this.state.players.get(client.sessionId)
      const decoration = this.state.deskDecorations.get(String(message?.id || ''))
      if (!player?.name || !decoration) return
      if (decoration.ownerName === player.name.trim().toLocaleLowerCase()) {
        this.state.deskDecorations.delete(String(message.id))
      }
    })

    this.onMessage(
      Message.UPDATE_PLAYER_STATUS,
      (client, message: { status: 'active' | 'busy' | 'away' }) => {
        if (!message || !['active', 'busy', 'away'].includes(message.status)) return
        const player = this.state.players.get(client.sessionId)
        if (player) player.status = message.status
      }
    )

    this.onMessage(
      Message.UPDATE_GROUP_FOCUS,
      (
        client,
        message: {
          action: 'start' | 'pause' | 'resume' | 'stop' | 'reset' | 'phase' | 'duration'
          phase?: 'focus' | 'shortBreak' | 'longBreak'
          minutes?: number
        }
      ) => {
        const focus = this.state.groupFocus
        if (!message || typeof message.action !== 'string') return

        if (message.action === 'phase') {
          if (focus.status === 'running') return
          const durations = { focus: 25, shortBreak: 5, longBreak: 15 }
          if (!message.phase || !(message.phase in durations)) return
          focus.phase = message.phase
          focus.durationSeconds = durations[message.phase] * 60
          focus.remainingSeconds = focus.durationSeconds
          focus.status = 'idle'
          return
        }

        if (message.action === 'duration') {
          if (focus.status === 'running') return
          if (!Number.isInteger(message.minutes) || message.minutes! < 1 || message.minutes! > 180)
            return
          focus.durationSeconds = message.minutes! * 60
          focus.remainingSeconds = focus.durationSeconds
          focus.status = 'idle'
          return
        }

        switch (message.action) {
          case 'start':
            if (focus.status === 'idle' || focus.status === 'completed') {
              focus.remainingSeconds = focus.durationSeconds
            }
            focus.status = 'running'
            break
          case 'pause':
            if (focus.status === 'running') focus.status = 'paused'
            break
          case 'resume':
            if (focus.status === 'paused') focus.status = 'running'
            break
          case 'stop':
            focus.status = 'idle'
            focus.remainingSeconds = focus.durationSeconds
            break
          case 'reset':
            if (focus.status !== 'running') {
              focus.status = 'idle'
              focus.remainingSeconds = focus.durationSeconds
            }
            break
        }
      }
    )

    // when a player disconnect a stream, broadcast the signal to the other player connected to the stream
    this.onMessage(Message.DISCONNECT_STREAM, (client, message: { clientId: string }) => {
      this.clients.forEach((cli) => {
        if (cli.sessionId === message.clientId) {
          cli.send(Message.DISCONNECT_STREAM, client.sessionId)
        }
      })
    })

    // In-room chat is scoped to this room. General messages go to everyone,
    // direct messages go only to the two participants, and nearby messages
    // stay transient for the existing speech-bubble flow.
    this.onMessage(Message.ADD_CHAT_MESSAGE, (client, message: {
      content: string
      channel?: 'general' | 'direct' | 'nearby'
      recipientId?: string
      attachment?: { name?: string; mimeType?: string; data?: string }
    }) => {
      const sender = this.state.players.get(client.sessionId)
      const content =
        typeof message?.content === 'string' ? message.content.trim().slice(0, 500) : ''
      const rawAttachment = message?.attachment
      const attachment = rawAttachment && typeof rawAttachment.name === 'string' && typeof rawAttachment.mimeType === 'string' &&
        typeof rawAttachment.data === 'string' && rawAttachment.data.startsWith('data:') && rawAttachment.data.length <= 14_000_000
        ? { name: rawAttachment.name.slice(0, 180), mimeType: rawAttachment.mimeType.slice(0, 120), data: rawAttachment.data }
        : undefined
      if (!sender || (!content && !attachment)) return

      const channel = message?.channel === 'general' || message?.channel === 'direct'
        ? message.channel
        : 'nearby'
      const payload = {
        channel,
        senderId: client.sessionId,
        senderName: sender.name || 'Participante',
        content,
        attachment,
        sentAt: Date.now(),
      }

      if (channel === 'general') {
        // Keep the room available after everyone leaves so a later participant
        // can still receive today's general chat history.
        this.autoDispose = false
        const generalPayload = { ...payload, channel: 'general' as const }
        this.generalChatHistory.push(generalPayload)
        this.clients.forEach((recipient) => recipient.send(Message.ADD_CHAT_MESSAGE, generalPayload))
        return
      }

      if (channel === 'direct') {
        const recipientId = typeof message.recipientId === 'string' ? message.recipientId : ''
        const recipient = this.clients.find((entry) => entry.sessionId === recipientId)
        const recipientPlayer = this.state.players.get(recipientId)
        if (!recipient || !recipientPlayer || recipientId === client.sessionId) return
        const directPayload = {
          ...payload,
          recipientId,
          recipientName: recipientPlayer.name || 'Participante',
        }
        client.send(Message.ADD_CHAT_MESSAGE, directPayload)
        recipient.send(Message.ADD_CHAT_MESSAGE, directPayload)
        return
      }

      const proximityRange = 300
      const proximityRangeSquared = proximityRange * proximityRange
      this.clients.forEach((recipient) => {
        if (recipient.sessionId === client.sessionId) return
        const player = this.state.players.get(recipient.sessionId)
        if (!player) return
        const dx = sender.x - player.x
        const dy = sender.y - player.y
        if (dx * dx + dy * dy <= proximityRangeSquared) {
          recipient.send(Message.ADD_CHAT_MESSAGE, { channel, clientId: client.sessionId, content })
        }
      })
    })

    this.onMessage(Message.REQUEST_CHAT_HISTORY, (client) => {
      if (!this.state.players.has(client.sessionId)) return
      this.generalChatHistory.forEach((message) => client.send(Message.ADD_CHAT_MESSAGE, { ...message, history: true }))
    })

    this.onMessage(Message.MEETING_CHAT_MESSAGE, (client, message: { roomId?: string; content?: string; attachment?: { name?: string; mimeType?: string; data?: string } }) => {
      const sender = this.state.players.get(client.sessionId)
      const roomId = typeof message?.roomId === 'string' ? message.roomId : ''
      const content = typeof message?.content === 'string' ? message.content.trim().slice(0, 500) : ''
      const rawAttachment = message?.attachment
      const attachment = rawAttachment && typeof rawAttachment.name === 'string' && typeof rawAttachment.mimeType === 'string' &&
        typeof rawAttachment.data === 'string' && rawAttachment.data.startsWith('data:') && rawAttachment.data.length <= 4_300_000
        ? { name: rawAttachment.name.slice(0, 180), mimeType: rawAttachment.mimeType.slice(0, 120), data: rawAttachment.data }
        : undefined
      if (!sender || !roomId || (!content && !attachment)) return
      const payload = {
        roomId,
        senderId: client.sessionId,
        senderName: sender.name || 'Participante',
        content,
        attachment,
        sentAt: Date.now(),
      }
      this.clients.forEach((recipient) => recipient.send(Message.MEETING_CHAT_MESSAGE, payload))
    })

    this.onMessage(Message.SET_MEETING_ROOM_LOCK, (client, message: { roomId?: string; locked?: boolean }) => {
      const roomId = typeof message?.roomId === 'string' ? message.roomId.trim().slice(0, 120) : ''
      if (!roomId || typeof message?.locked !== 'boolean' || !this.state.players.has(client.sessionId)) return
      this.meetingRoomLocks.set(roomId, message.locked)
      this.broadcast(Message.MEETING_ROOM_LOCK_UPDATED, { roomId, locked: message.locked })
    })

    const getOnlinePeer = (id: unknown, senderId: string) => {
      if (typeof id !== 'string' || !id || id === senderId) return undefined
      const peer = this.clients.find((entry) => entry.sessionId === id)
      const player = this.state.players.get(id)
      return peer && player ? { peer, player } : undefined
    }
    const sendWave = (recipient: Client, fromId: string) => {
      const from = this.state.players.get(fromId)
      if (!from) return
      recipient.send(Message.WAVE_RECEIVED, { fromId, fromName: from.name || 'Participante' })
    }
    const startMeetingWalk = (firstId: string, secondId: string) => {
      const roomId = 'area-1790200110788-3'
      const first = this.clients.find((entry) => entry.sessionId === firstId)
      const second = this.clients.find((entry) => entry.sessionId === secondId)
      if (!first || !second || this.meetingRoomLocks.get(roomId)) return false
      const plan = { roomId, participants: [{ playerId: firstId, seatIndex: 0 }, { playerId: secondId, seatIndex: 1 }] }
      first.send(Message.MEETING_WALK_STARTED, plan)
      second.send(Message.MEETING_WALK_STARTED, plan)
      return true
    }
    const meetingRooms: MeetingRoomCandidate[] = [
      { roomId: 'area-1790200110788-3', roomName: 'Green Library', x: 1440, y: 1247, left: 1284, top: 1118, right: 1597, bottom: 1377 },
      { roomId: 'area-1790200211458-6', roomName: 'Media Room', x: 656, y: 1248, left: 485, top: 1121, right: 827, bottom: 1376 },
      { roomId: 'area-1790200251777-7', roomName: 'Study Huddle', x: 399, y: 1008, left: 323, top: 927, right: 475, bottom: 1089 },
      { roomId: 'area-1790200287499-8', roomName: 'Coffe Huddle', x: 400, y: 784, left: 325, top: 704, right: 475, bottom: 865 },
      { roomId: 'area-1790200328588-9', roomName: 'Data Huddle', x: 1679, y: 1007, left: 1602, top: 927, right: 1756, bottom: 1087 },
      { roomId: 'area-1790200353691-10', roomName: 'Fishtank Huddle', x: 1679, y: 784, left: 1602, top: 704, right: 1755, bottom: 863 },
    ]
    this.onMessage(Message.WAVE_USER, (client, message: { targetId?: string }) => {
      const target = getOnlinePeer(message?.targetId, client.sessionId)
      if (target) sendWave(target.peer, client.sessionId)
    })
    this.onMessage(Message.WAVE_RECEIVED, (client, message: { targetId?: string }) => {
      const target = getOnlinePeer(message?.targetId, client.sessionId)
      if (target) sendWave(target.peer, client.sessionId)
    })
    this.onMessage(Message.REQUEST_MEETING_WALK, (client, message: { targetId?: string }) => {
      const target = getOnlinePeer(message?.targetId, client.sessionId)
      if (!target) return
      this.meetingWalkInvites.set(target.peer.sessionId, { fromId: client.sessionId, expiresAt: Date.now() + 60_000 })
      const sender = this.state.players.get(client.sessionId)
      target.peer.send(Message.MEETING_WALK_INVITE, {
        fromId: client.sessionId,
        fromName: sender?.name || 'Participante',
      })
    })
    this.onMessage(Message.START_MEETING_WALK, (client, message: { targetId?: string }) => {
      const target = getOnlinePeer(message?.targetId, client.sessionId)
      if (!target) return
      if (!startMeetingWalk(client.sessionId, target.peer.sessionId)) {
        client.send(Message.MEETING_WALK_DECLINED, { locked: true })
      }
    })
    this.onMessage(Message.RESPOND_MEETING_WALK, (client, message: { fromId?: string; accept?: boolean }) => {
      const invite = this.meetingWalkInvites.get(client.sessionId)
      if (!invite || invite.fromId !== message?.fromId || invite.expiresAt < Date.now()) {
        this.meetingWalkInvites.delete(client.sessionId)
        return
      }
      this.meetingWalkInvites.delete(client.sessionId)
      const inviter = this.clients.find((entry) => entry.sessionId === invite.fromId)
      if (!inviter) return
      if (!message.accept || !startMeetingWalk(invite.fromId, client.sessionId)) {
        inviter.send(Message.MEETING_WALK_DECLINED, { peerName: this.state.players.get(client.sessionId)?.name || 'Participante', locked: !!message.accept && this.meetingRoomLocks.get('area-1790200110788-3') })
        return
      }
    })
    this.onMessage(Message.START_MEETING_CALL, (client, message: { targetId?: string }) => {
      const target = getOnlinePeer(message?.targetId, client.sessionId)
      const caller = this.state.players.get(client.sessionId)
      if (!caller) return
      if (!target) {
        client.send(Message.MEETING_CALL_DECLINED, { reason: 'offline' })
        return
      }
      if (this.meetingCalls.has(target.peer.sessionId)) {
        client.send(Message.MEETING_CALL_DECLINED, { fromName: target.player.name || 'Participante', reason: 'busy' })
        return
      }
      const playerPositions: { playerId: string; x: number; y: number }[] = []
      this.state.players.forEach((player, playerId) => playerPositions.push({ playerId, x: player.x, y: player.y }))
      const reservedRoomIds = new Set(Array.from(this.meetingCalls.values()).map((call) => call.roomId))
      const room = selectNearestAvailableMeetingRoom(
        meetingRooms,
        playerPositions,
        client.sessionId,
        target.peer.sessionId,
        caller.x,
        caller.y,
        (roomId) => !!this.meetingRoomLocks.get(roomId),
        reservedRoomIds,
      )
      if (!room) {
        client.send(Message.MEETING_CALL_DECLINED, { reason: 'locked' })
        return
      }
      const timer = setTimeout(() => {
        const current = this.meetingCalls.get(target.peer.sessionId)
        if (!current || current.fromId !== client.sessionId) return
        this.meetingCalls.delete(target.peer.sessionId)
        const fromName = this.state.players.get(target.peer.sessionId)?.name || 'Participante'
        client.send(Message.MEETING_CALL_DECLINED, { fromName, reason: 'timeout' })
        target.peer.send(Message.MEETING_CALL_ENDED, { reason: 'timeout' })
      }, 45_000)
      this.meetingCalls.set(target.peer.sessionId, { fromId: client.sessionId, roomId: room.roomId, roomName: room.roomName, timer })
      client.send(Message.MEETING_WALK_STARTED, { roomId: room.roomId, participants: [{ playerId: client.sessionId, seatIndex: 0 }] })
      target.peer.send(Message.MEETING_CALL_INVITE, {
        fromId: client.sessionId,
        fromName: caller.name || 'Participante',
        roomId: room.roomId,
        roomName: room.roomName,
      })
    })
    this.onMessage(Message.RESPOND_MEETING_CALL, (client, message: { fromId?: string; response?: 'accept' | 'decline' | 'later' }) => {
      const call = this.meetingCalls.get(client.sessionId)
      if (!call || call.fromId !== message?.fromId) return
      if (message.response === 'later') {
        clearTimeout(call.timer)
        call.timer = setTimeout(() => {
          const current = this.meetingCalls.get(client.sessionId)
          if (current !== call) return
          this.meetingCalls.delete(client.sessionId)
          const fromName = this.state.players.get(client.sessionId)?.name || 'Participante'
          this.clients.find((entry) => entry.sessionId === call.fromId)?.send(Message.MEETING_CALL_DECLINED, { fromName, reason: 'timeout' })
          this.clients.find((entry) => entry.sessionId === client.sessionId)?.send(Message.MEETING_CALL_ENDED, { reason: 'timeout' })
        }, 5 * 60_000)
        client.send(Message.MEETING_CALL_DEFERRED, {
          fromId: call.fromId,
          fromName: this.state.players.get(call.fromId)?.name || 'Participante',
          roomId: call.roomId,
          roomName: call.roomName,
        })
        this.clients.find((entry) => entry.sessionId === call.fromId)?.send(Message.MEETING_CALL_ENDED, { reason: 'later' })
        return
      }
      clearTimeout(call.timer)
      this.meetingCalls.delete(client.sessionId)
      const caller = this.clients.find((entry) => entry.sessionId === call.fromId)
      if (!caller) return
      if (message.response === 'accept' && !this.meetingRoomLocks.get(call.roomId)) {
        caller.send(Message.MEETING_CALL_ACCEPTED, { fromId: client.sessionId })
        client.send(Message.MEETING_WALK_STARTED, { roomId: call.roomId, participants: [{ playerId: client.sessionId, seatIndex: 1 }] })
        return
      }
      caller.send(Message.MEETING_CALL_DECLINED, {
        fromName: this.state.players.get(client.sessionId)?.name || 'Participante',
        reason: message.response === 'accept' ? 'locked' : 'declined',
      })
    })
  }

  async onAuth(client: Client, options: { password: string | null }) {
    if (this.password) {
      const validPassword = await bcrypt.compare(options.password, this.password)
      if (!validPassword) {
        throw new ServerError(403, 'Password is incorrect!')
      }
    }
    return true
  }

  onJoin(client: Client, options: any) {
    if (!this.state.managerSessionId) this.state.managerSessionId = client.sessionId
    if (!this.state.players.has(client.sessionId)) {
      this.state.players.set(client.sessionId, new Player())
    }
    client.send(Message.SEND_ROOM_DATA, {
      id: this.roomId,
      name: this.name,
      description: this.description,
    })

    client.send(Message.TEAM_LABEL_UPDATED, { teamLabel: this.state.teamLabel })
    client.send(Message.MEETING_ROOM_LOCK_STATE, Object.fromEntries(this.meetingRoomLocks))
  }

  private registerTeamLabelHandler() {
    this.onMessage(Message.UPDATE_TEAM_LABEL, (client, message: { teamLabel: string }) => {
      if (client.sessionId !== this.state.managerSessionId) return
      const teamLabel = typeof message?.teamLabel === 'string' ? message.teamLabel.trim().slice(0, 24) : ''
      if (!teamLabel) return
      this.state.teamLabel = teamLabel
      this.broadcast(Message.TEAM_LABEL_UPDATED, { teamLabel })
    })
  }

  async onLeave(client: Client, consented: boolean) {
    const pendingCall = this.meetingCalls.get(client.sessionId)
    if (pendingCall) {
      clearTimeout(pendingCall.timer)
      this.meetingCalls.delete(client.sessionId)
      this.clients.find((entry) => entry.sessionId === pendingCall.fromId)?.send(Message.MEETING_CALL_DECLINED, { fromName: this.state.players.get(client.sessionId)?.name || 'Participante', reason: 'disconnected' })
    }
    for (const [calleeId, call] of this.meetingCalls) {
      if (call.fromId !== client.sessionId) continue
      clearTimeout(call.timer)
      this.meetingCalls.delete(calleeId)
      this.clients.find((entry) => entry.sessionId === calleeId)?.send(Message.MEETING_CALL_ENDED, { reason: 'disconnected' })
    }
    const player = this.state.players.get(client.sessionId)
    const savedPlayer = player ? {
      name: player.name,
      x: player.x,
      y: player.y,
      anim: player.anim,
      tint: player.tint,
      readyToConnect: player.readyToConnect,
      videoConnected: player.videoConnected,
      cameraEnabled: player.cameraEnabled,
      microphoneEnabled: player.microphoneEnabled,
      status: player.status,
      deskIndex: player.deskIndex,
    } : undefined

    // Remove the player from the shared room state immediately so every other
    // client removes their avatar and DM contact without waiting for timeout.
    this.state.players.delete(client.sessionId)
    this.state.computers.forEach((computer) => computer.connectedUser.delete(client.sessionId))
    this.state.whiteboards.forEach((whiteboard) => whiteboard.connectedUser.delete(client.sessionId))
    if (this.state.managerSessionId === client.sessionId) {
      this.state.managerSessionId = this.clients.find((member) => member.sessionId !== client.sessionId)?.sessionId || ''
    }

    if (!consented) {
      try {
        await this.allowReconnection(client, 20)
        if (savedPlayer) {
          const restoredPlayer = Object.assign(new Player(), savedPlayer)
          this.state.players.set(client.sessionId, restoredPlayer)
        }
        return
      } catch {
        // The reconnect window expired. Clean the player's room state below.
      }
    }
  }

  onDispose() {
    if (this.groupFocusTicker) clearInterval(this.groupFocusTicker)
    if (this.chatClearTimer) clearTimeout(this.chatClearTimer)
    this.state.whiteboards.forEach((whiteboard) => {
      if (whiteboardRoomIds.has(whiteboard.roomId)) whiteboardRoomIds.delete(whiteboard.roomId)
    })

    console.log('room', this.roomId, 'disposing...')
    this.dispatcher.stop()
  }

  private scheduleGeneralChatClear() {
    if (this.chatClearTimer) clearTimeout(this.chatClearTimer)
    this.chatClearTimer = setTimeout(() => {
      this.generalChatHistory = []
      this.broadcast(Message.CLEAR_CHAT_HISTORY)
      this.autoDispose = this.configuredAutoDispose
      this.scheduleGeneralChatClear()
      if (this.clients.length === 0 && this.configuredAutoDispose) this.disconnect()
    }, millisecondsUntilBrasiliaChatClear(Date.now()))
  }
}
