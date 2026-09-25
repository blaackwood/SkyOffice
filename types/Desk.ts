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
  { x: 528, y: 550, width: 96, height: 64 },
  { x: 688, y: 550, width: 96, height: 64 },
  { x: 848, y: 550, width: 96, height: 64 },
  { x: 1200, y: 550, width: 96, height: 64 },
  { x: 1408, y: 550, width: 96, height: 64 },
  { x: 1552, y: 550, width: 96, height: 64 },
] as const

export type DeskDecorationTexture = string

export interface DeskDecorationAsset {
  id: string
  texture: DeskDecorationTexture
  frame: number
  label: string
  category: string
  width: number
  height: number
  path: string
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

/** Replacement desk-decoration catalog supplied in the pixelart-desk-assets pack. */
const pixelArtDeskItems: Array<[string, string, string, number, number]> = [
  ['audio_headphone.svg', 'Fone de ouvido', 'Audio', 23, 14],
  ['audio_panel_mic.svg', 'Painel de microfone', 'Audio', 22, 14],
  ['cassette_tape.svg', 'Fita cassete', 'Accessories', 18, 12],
  ['code_editor.svg', 'Editor de código', 'Technology', 20, 16],
  ['computer_mouse.svg', 'Mouse', 'Technology', 22, 13],
  ['copier_fax.svg', 'Copiadora e fax', 'Office', 20, 14],
  ['crt_retro_beige.svg', 'Monitor retrô bege', 'Technology', 19, 15],
  ['desktop_computer.svg', 'Computador de mesa', 'Technology', 19, 20],
  ['dual_monitor.svg', 'Dois monitores', 'Technology', 27, 19],
  ['gamepad_controller.svg', 'Controle de videogame', 'Accessories', 22, 11],
  ['gaming_tower_rgb.svg', 'Gabinete gamer RGB', 'Technology', 16, 13],
  ['green_vented_server.svg', 'Servidor ventilado', 'Technology', 18, 13],
  ['handheld_console.svg', 'Console portátil', 'Accessories', 18, 12],
  ['laptop.svg', 'Notebook', 'Technology', 19, 17],
  ['laptop_thin.svg', 'Notebook fino', 'Technology', 20, 12],
  ['mini_screen_module.svg', 'Mini tela', 'Technology', 8, 10],
  ['mini_server.svg', 'Mini servidor', 'Technology', 18, 11],
  ['mixer_big_dial.svg', 'Mesa de som com dial', 'Audio', 22, 10],
  ['mixer_deck.svg', 'Mesa de som', 'Audio', 22, 13],
  ['monitor_wall_bracket.svg', 'Monitor articulado', 'Technology', 22, 16],
  ['pda_handheld.svg', 'Assistente portátil', 'Accessories', 10, 10],
  ['printer.svg', 'Impressora', 'Office', 20, 15],
  ['retro_terminal.svg', 'Terminal retrô', 'Technology', 19, 16],
  ['robot_arm.svg', 'Braço robótico', 'Technology', 23, 21],
  ['server_rack.svg', 'Rack de servidores', 'Technology', 18, 15],
  ['smartphone.svg', 'Celular', 'Accessories', 11, 12],
  ['speaker_boombox.svg', 'Caixa de som', 'Audio', 22, 16],
  ['standalone_keyboard.svg', 'Teclado', 'Technology', 22, 8],
  ['tablet_graph.svg', 'Tablet gráfico', 'Accessories', 18, 11],
  ['tower_pc_blue.svg', 'Gabinete azul', 'Technology', 16, 15],
  ['usb_hub.svg', 'Hub USB', 'Technology', 22, 10],
  ['workstation_big.svg', 'Estação de trabalho', 'Technology', 24, 17],
  ['workstation_side.svg', 'Estação lateral', 'Technology', 26, 15],
]

export const DESK_DECORATION_ASSETS: DeskDecorationAsset[] = pixelArtDeskItems.map(([file, label, category, width, height]) => ({
  id: `pixelart:${file}`,
  texture: `pixelart_${file.replace('.svg', '')}`,
  frame: 0,
  label,
  category,
  width,
  height,
  path: `/assets/items/pixelart-desk-assets/${file}`,
}))

export const DESK_DECORATION_TEXTURES: Record<string, { width: number; height: number }> = Object.fromEntries(
  DESK_DECORATION_ASSETS.map((asset) => [asset.texture, { width: asset.width, height: asset.height }])
)
