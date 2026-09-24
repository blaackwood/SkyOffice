import type { Schema } from '@colyseus/schema'

/** Workstations currently present in the default office map. */
export const DESK_SLOTS = [
  // Six stations in the left middle office: three columns by two rows.
  { x: 592, y: 848, width: 96, height: 64 },
  { x: 688, y: 848, width: 96, height: 64 },
  { x: 784, y: 848, width: 96, height: 64 },
  { x: 592, y: 944, width: 96, height: 64 },
  { x: 688, y: 944, width: 96, height: 64 },
  { x: 784, y: 944, width: 96, height: 64 },
  // Eight stations in the right middle office: four columns by two rows.
  { x: 1200, y: 848, width: 96, height: 64 },
  { x: 1296, y: 848, width: 96, height: 64 },
  { x: 1392, y: 848, width: 96, height: 64 },
  { x: 1488, y: 848, width: 96, height: 64 },
  { x: 1200, y: 944, width: 96, height: 64 },
  { x: 1296, y: 944, width: 96, height: 64 },
  { x: 1392, y: 944, width: 96, height: 64 },
  { x: 1488, y: 944, width: 96, height: 64 },
  // Keep the six original upper workstations claimable as well.
  { x: 528, y: 592, width: 96, height: 64 },
  { x: 688, y: 592, width: 96, height: 64 },
  { x: 848, y: 592, width: 96, height: 64 },
  { x: 1200, y: 592, width: 96, height: 64 },
  { x: 1408, y: 592, width: 96, height: 64 },
  { x: 1552, y: 592, width: 96, height: 64 },
] as const

export const DESK_DECORATION_TEXTURES = {
  office: { firstGid: 2584, frames: 848, width: 32, height: 32, category: 'Office' },
  generic: { firstGid: 3432, frames: 1248, width: 32, height: 32, category: 'Objects' },
  chairs: { firstGid: 2561, frames: 23, width: 32, height: 64, category: 'Seating' },
  computers: { firstGid: 4680, frames: 5, width: 96, height: 64, category: 'Technology' },
  whiteboards: { firstGid: 4685, frames: 3, width: 64, height: 64, category: 'Technology' },
  basement: { firstGid: 4688, frames: 800, width: 32, height: 32, category: 'Objects' },
  vendingmachines: { firstGid: 5488, frames: 1, width: 48, height: 72, category: 'Office' },
  laptop: { firstGid: 0, frames: 1, width: 64, height: 48, category: 'Technology' },
} as const

export type DeskDecorationTexture = keyof typeof DESK_DECORATION_TEXTURES

export interface DeskDecorationAsset {
  id: string
  texture: DeskDecorationTexture
  frame: number
  label: string
  category: string
  width: number
  height: number
}

export interface IDeskDecoration extends Schema {
  ownerName: string
  texture: string
  frame: number
  x: number
  y: number
  rotation: number
}

export interface IDeskSlot extends Schema {
  ownerName: string
  ownerSessionId: string
}

/** Small starter catalog from the pixel-art sheets already shipped with the office. */
export const DESK_DECORATION_ASSETS: DeskDecorationAsset[] = [
  ...[1, 2, 3, 5, 7, 8, 11, 12, 13, 19, 20, 21, 22].map((frame) => ({ id: `chairs:${frame}`, texture: 'chairs' as const, frame, label: `Cadeira ${frame}`, category: 'Seating', width: 32, height: 64 })),
  ...[0, 1, 2, 3, 4].map((frame) => ({ id: `computers:${frame}`, texture: 'computers' as const, frame, label: `Computador ${frame + 1}`, category: 'Technology', width: 96, height: 64 })),
  { id: 'laptop:0', texture: 'laptop', frame: 0, label: 'Notebook', category: 'Technology', width: 64, height: 48 },
  ...[0, 1, 2].map((frame) => ({ id: `whiteboards:${frame}`, texture: 'whiteboards' as const, frame, label: `Quadro ${frame + 1}`, category: 'Office', width: 64, height: 64 })),
  { id: 'vendingmachines:0', texture: 'vendingmachines', frame: 0, label: 'Máquina de bebidas', category: 'Office', width: 48, height: 72 },
]
