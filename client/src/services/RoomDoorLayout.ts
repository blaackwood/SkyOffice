export const ROOM_DOOR_LAYOUT_STORAGE_KEY = 'skyoffice.room-door-layout.v2'

export type RoomDoorWall = 'horizontal' | 'vertical'
export interface RoomDoorPlacement {
  doorId: string
  roomId: string
  /** Center of the complete double-door frame on the map. */
  x: number
  y: number
  wall: RoomDoorWall
  /** Full width along the wall, and height in the map plane. */
  width: number
  height: number
}

export interface RoomDoorLayout {
  version: 1
  doors: RoomDoorPlacement[]
}

export function parseRoomDoorLayout(value: string | null | undefined): RoomDoorLayout {
  if (!value) return { version: 1, doors: [] }
  try {
    const parsed = JSON.parse(value) as Partial<RoomDoorLayout>
    const doors = Array.isArray(parsed.doors) ? parsed.doors.flatMap((value, index): RoomDoorPlacement[] => {
      if (!value || typeof value.roomId !== 'string' || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return []
      const legacy = value as Partial<RoomDoorPlacement> & { orientation?: string }
      const wall = legacy.wall ?? legacy.orientation
      if (wall !== 'horizontal' && wall !== 'vertical') return []
      const oldSingleLeaf = 'hinge' in legacy || 'swing' in legacy
      let storedWidth = Number.isFinite(legacy.width) ? legacy.width! : 144
      let storedHeight = Number.isFinite(legacy.height) ? legacy.height! : 88
      if (storedWidth === 96 && storedHeight === 72) {
        storedWidth = 144
        storedHeight = 88
      }
      return [{
        doorId: (legacy as { doorId?: string }).doorId || `${value.roomId}__${index}`,
        roomId: value.roomId,
        x: value.x,
        y: value.y,
        wall,
        width: oldSingleLeaf ? Math.max(144, storedWidth * 2) : Math.max(56, storedWidth),
        height: storedHeight,
      }]
    }) : []
    return { version: 1, doors }
  } catch {
    return { version: 1, doors: [] }
  }
}

export function loadRoomDoorLayout(): RoomDoorLayout {
  try {
    return parseRoomDoorLayout(window.localStorage.getItem(ROOM_DOOR_LAYOUT_STORAGE_KEY))
  } catch {
    return { version: 1, doors: [] }
  }
}
