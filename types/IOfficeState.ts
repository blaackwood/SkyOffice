import { Schema, SetSchema, MapSchema } from '@colyseus/schema'
import type { IDeskDecoration, IDeskSlot } from './Desk'
export type { IDeskDecoration, IDeskSlot } from './Desk'

export interface IPlayer extends Schema {
  name: string
  x: number
  y: number
  anim: string
  tint: number
  readyToConnect: boolean
  videoConnected: boolean
  cameraEnabled: boolean
  microphoneEnabled: boolean
  status: 'active' | 'busy' | 'away'
  deskIndex: number
}

export interface IComputer extends Schema {
  connectedUser: SetSchema<string>
}

export interface IWhiteboard extends Schema {
  roomId: string
  connectedUser: SetSchema<string>
}

export type FocusPhase = 'focus' | 'shortBreak' | 'longBreak'
export type FocusStatus = 'idle' | 'running' | 'paused' | 'completed'

export interface IGroupFocus extends Schema {
  phase: FocusPhase
  status: FocusStatus
  durationSeconds: number
  remainingSeconds: number
}

export interface IChatMessage extends Schema {
  author: string
  createdAt: number
  content: string
  /** Present only for proximity messages kept locally in the current session. */
  playerId?: string
}

export interface IOfficeState extends Schema {
  teamLabel: string
  managerSessionId: string
  players: MapSchema<IPlayer>
  computers: MapSchema<IComputer>
  whiteboards: MapSchema<IWhiteboard>
  groupFocus: IGroupFocus
  deskDecorations: MapSchema<IDeskDecoration>
  desks: MapSchema<IDeskSlot>
}
