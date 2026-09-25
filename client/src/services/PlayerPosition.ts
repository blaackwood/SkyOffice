export interface SavedPlayerPosition {
  x: number
  y: number
}

const storageKey = (playerName: string) =>
  `skyoffice.last-position.v1:${playerName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR')}`

export function loadSavedPlayerPosition(
  playerName: string,
  mapWidth: number,
  mapHeight: number
): SavedPlayerPosition | undefined {
  if (!playerName.trim()) return undefined
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(playerName)) || 'null')
    if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return undefined
    if (value.x < 8 || value.y < 8 || value.x > mapWidth - 8 || value.y > mapHeight - 8) return undefined
    return { x: value.x, y: value.y }
  } catch {
    return undefined
  }
}

export function savePlayerPosition(playerName: string, x: number, y: number): void {
  if (!playerName.trim() || !Number.isFinite(x) || !Number.isFinite(y)) return
  try {
    localStorage.setItem(storageKey(playerName), JSON.stringify({ x: Math.round(x), y: Math.round(y) }))
  } catch {
    // Local position recovery is an enhancement; a disabled storage must not block movement.
  }
}
