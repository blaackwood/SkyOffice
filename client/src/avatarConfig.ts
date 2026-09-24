import Adam from './images/login/Adam_login.png'
import Ash from './images/login/Ash_login.png'
import Lucy from './images/login/Lucy_login.png'
import Nancy from './images/login/Nancy_login.png'

// the only 4 body sprites that exist in this project today — "simplified
// avatar" means picking one of these + a color, not layered hair/clothes
// (there's no pixel-art asset for that yet)
export const AVATAR_BASES = [
  { name: 'adam', img: Adam },
  { name: 'ash', img: Ash },
  { name: 'lucy', img: Lucy },
  { name: 'nancy', img: Nancy },
]

// small, curated color palette applied as a Phaser sprite tint. 0xffffff
// means "no tint" (the sprite's original colors)
export const AVATAR_TINTS: { name: string; value: number }[] = [
  { name: 'Original', value: 0xffffff },
  { name: 'Coral', value: 0xff8a65 },
  { name: 'Lime', value: 0xaed581 },
  { name: 'Sky', value: 0x64b5f6 },
  { name: 'Lavender', value: 0xba68c8 },
  { name: 'Sun', value: 0xffd54f },
  { name: 'Rose', value: 0xf06292 },
]

export type AvatarChoice = {
  avatar: string
  tint: number
}

export const DEFAULT_AVATAR_CHOICE: AvatarChoice = {
  avatar: AVATAR_BASES[0].name,
  tint: AVATAR_TINTS[0].value,
}

const storageKey = (name: string) => `skyoffice_avatar_${name.trim().toLowerCase()}`

// avatar choices are saved per player name in this browser, so joining
// again under the same name restores the same look automatically
export function loadSavedAvatar(name: string): AvatarChoice | null {
  if (!name) return null
  try {
    const raw = window.localStorage.getItem(storageKey(name))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (typeof parsed.avatar === 'string' && typeof parsed.tint === 'number') {
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function saveAvatar(name: string, choice: AvatarChoice) {
  if (!name) return
  try {
    window.localStorage.setItem(storageKey(name), JSON.stringify(choice))
  } catch {
    // storage unavailable (private mode, quota, etc.) — not critical, skip silently
  }
}