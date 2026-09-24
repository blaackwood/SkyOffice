export interface MeetingRoomCandidate {
  roomId: string
  roomName: string
  x: number
  y: number
  left: number
  top: number
  right: number
  bottom: number
}

export interface PlayerPosition {
  playerId: string
  x: number
  y: number
}

export function selectNearestAvailableMeetingRoom(
  rooms: MeetingRoomCandidate[],
  players: PlayerPosition[],
  callerId: string,
  targetId: string,
  callerX: number,
  callerY: number,
  isLocked: (roomId: string) => boolean,
  reservedRoomIds: Set<string>,
): MeetingRoomCandidate | undefined {
  return rooms
    .filter((room) => !isLocked(room.roomId) && !reservedRoomIds.has(room.roomId))
    .filter((room) => !players.some((player) =>
      player.playerId !== callerId && player.playerId !== targetId &&
      player.x >= room.left && player.x <= room.right &&
      player.y >= room.top && player.y <= room.bottom,
    ))
    .sort((a, b) => ((a.x - callerX) ** 2 + (a.y - callerY) ** 2) - ((b.x - callerX) ** 2 + (b.y - callerY) ** 2))[0]
}
