import Phaser from 'phaser'

export const phaserEvents = new Phaser.Events.EventEmitter()

export interface MeetingRoomParticipant {
  playerId: string
  name: string
}

export interface MeetingRoomPresence {
  roomId: string
  roomName: string
  participants: MeetingRoomParticipant[]
}

export interface MeetingChatMessage {
  roomId: string
  senderId: string
  senderName: string
  content: string
  attachment?: { name: string; mimeType: string; data: string }
  sentAt: number
}

export enum Event {
  PLAYER_JOINED = 'player-joined',
  PLAYER_UPDATED = 'player-updated',
  PLAYER_VOICE_ACTIVITY = 'player-voice-activity',
  PLAYER_LEFT = 'player-left',
  PLAYER_SELECTED = 'player-selected',
  PLAYER_DISCONNECTED = 'player-disconnected',
  MY_PLAYER_READY = 'my-player-ready',
  MY_PLAYER_NAME_CHANGE = 'my-player-name-change',
  MY_PLAYER_TEXTURE_CHANGE = 'my-player-texture-change',
  MY_PLAYER_VIDEO_CONNECTED = 'my-player-video-connected',
  MY_PLAYER_STATUS_CHANGE = 'my-player-status-change',
  MY_PLAYER_MIC_STATE_CHANGE = 'my-player-mic-state-change',
  MY_PLAYER_TINT_CHANGE = 'my-player-tint-change',
  ITEM_USER_ADDED = 'item-user-added',
  ITEM_USER_REMOVED = 'item-user-removed',
  UPDATE_DIALOG_BUBBLE = 'update-dialog-bubble',
  DESK_DECORATION_UPDATED = 'desk-decoration-updated',
  DESK_DECORATION_REMOVED = 'desk-decoration-removed',
  DESK_EDITOR_MODE = 'desk-editor-mode',
  DESK_EDITOR_SELECT = 'desk-editor-select',
  DESK_CLAIMED = 'desk-claimed',
  DESK_EDITOR_REQUEST = 'desk-editor-request',
  DESK_UNDO = 'desk-undo',
  DESK_REDO = 'desk-redo',
  TEAM_NAME_EDIT_REQUEST = 'team-name-edit-request',
  TEAM_NAME_CHANGED = 'team-name-changed',
  MEETING_ROOM_PRESENCE = 'meeting-room-presence',
  MEETING_CHAT_MESSAGE = 'meeting-chat-message',
  MEETING_ROOM_LOCK_CHANGED = 'meeting-room-lock-changed',
  WAVE_RECEIVED = 'wave-received',
  MEETING_WALK_INVITE = 'meeting-walk-invite',
  MEETING_WALK_STARTED = 'meeting-walk-started',
  MEETING_WALK_DECLINED = 'meeting-walk-declined',
  MEETING_CALL_INVITE = 'meeting-call-invite',
  MEETING_CALL_DECLINED = 'meeting-call-declined',
  MEETING_CALL_FINISHED = 'meeting-call-finished',
  MEETING_CALL_DEFERRED = 'meeting-call-deferred',
}
