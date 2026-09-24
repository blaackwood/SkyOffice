import { DESK_DECORATION_ASSETS } from '../../../types/Desk'

export interface SavedDeskDecoration {
  id: string
  texture: string
  frame: number
  dx: number
  dy: number
  rotation: number
}

const storageKey = (roomName: string, playerName: string) =>
  `skyoffice.desk.v3:${roomName.trim().toLocaleLowerCase()}:${playerName.trim().toLocaleLowerCase()}`

export function loadDeskLayout(roomName: string, playerName: string): SavedDeskDecoration[] {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(roomName, playerName)) || '[]')
    if (!Array.isArray(value)) return []
    return value.filter((item) => item && typeof item.id === 'string' &&
      DESK_DECORATION_ASSETS.some((asset) => asset.texture === item.texture && asset.frame === item.frame))
      .slice(0, 60).map((item) => ({ id: item.id, texture: item.texture, frame: item.frame,
        dx: Number.isFinite(item.dx) ? item.dx : 0, dy: Number.isFinite(item.dy) ? item.dy : 0,
        rotation: Number.isFinite(item.rotation) ? item.rotation : 0 }))
  } catch { return [] }
}

export function saveDeskLayout(roomName: string, playerName: string, items: SavedDeskDecoration[]) {
  try { localStorage.setItem(storageKey(roomName, playerName), JSON.stringify(items.slice(0, 60))) } catch { /* optional */ }
}
