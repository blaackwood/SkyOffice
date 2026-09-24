import { Schema, SetSchema, MapSchema, type } from '@colyseus/schema'
import {
  IPlayer,
  IOfficeState,
  IComputer,
  IWhiteboard,
  IGroupFocus,
  IDeskDecoration,
  IDeskSlot,
} from '../../../types/IOfficeState'

export class Player extends Schema implements IPlayer {
  @type('string') name = ''
  @type('number') x = 705
  @type('number') y = 500
  @type('string') anim = 'adam_idle_down'
  @type('number') tint = 0xffffff
  @type('boolean') readyToConnect = false
  @type('boolean') videoConnected = false
  @type('boolean') cameraEnabled = false
  @type('boolean') microphoneEnabled = false
  @type('string') status: 'active' | 'busy' | 'away' = 'active'
  @type('number') deskIndex = -1
}

export class DeskDecoration extends Schema implements IDeskDecoration {
  @type('string') ownerName = ''
  @type('string') texture = ''
  @type('number') frame = 0
  @type('number') x = 0
  @type('number') y = 0
  @type('number') rotation = 0
}

export class DeskSlot extends Schema implements IDeskSlot {
  @type('string') ownerName = ''
  @type('string') ownerSessionId = ''
}

export class Computer extends Schema implements IComputer {
  @type({ set: 'string' }) connectedUser = new SetSchema<string>()
}

export class Whiteboard extends Schema implements IWhiteboard {
  @type('string') roomId = getRoomId()
  @type({ set: 'string' }) connectedUser = new SetSchema<string>()
}

export class GroupFocus extends Schema implements IGroupFocus {
  @type('string') phase: 'focus' | 'shortBreak' | 'longBreak' = 'focus'
  @type('string') status: 'idle' | 'running' | 'paused' | 'completed' = 'idle'
  @type('number') durationSeconds = 25 * 60
  @type('number') remainingSeconds = 25 * 60
}

export class OfficeState extends Schema implements IOfficeState {
  @type('string') teamLabel = 'Team'
  @type('string') managerSessionId = ''
  @type({ map: Player })
  players = new MapSchema<Player>()

  @type({ map: Computer })
  computers = new MapSchema<Computer>()

  @type({ map: Whiteboard })
  whiteboards = new MapSchema<Whiteboard>()
  @type(GroupFocus)
  groupFocus = new GroupFocus()

  @type({ map: DeskDecoration })
  deskDecorations = new MapSchema<DeskDecoration>()

  @type({ map: DeskSlot })
  desks = new MapSchema<DeskSlot>()

}

export const whiteboardRoomIds = new Set<string>()
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const charactersLength = characters.length

function getRoomId(): string {
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  if (!whiteboardRoomIds.has(result)) {
    whiteboardRoomIds.add(result)
    return result
  } else {
    console.log('roomId exists, remaking another one.')
    return getRoomId()
  }
}
