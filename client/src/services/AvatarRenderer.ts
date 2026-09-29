import Phaser from 'phaser'
import { DEFAULT_AVATAR_CHOICE, normalizeAvatarParts, type AvatarChoice } from '../avatarConfig'
import { DIRECTIONS, WALK_FRAMES, WALK_FPS, drawAvatarFrame, drawSeatedAvatar, loadAvatarLayers } from './AtelierAvatar'
const pending = new WeakMap<Phaser.Scene, Map<string, Promise<string>>>()
export function avatarTextureKey(parts: AvatarChoice['parts']) {
  const normalized = normalizeAvatarParts(parts)
  // Game and Player instantiate the default sprite as "atelier". Bootstrap
  // must build that same texture and its animations before launching the room.
  if (JSON.stringify(normalized) === JSON.stringify(normalizeAvatarParts(DEFAULT_AVATAR_CHOICE.parts))) return 'atelier'
  let hash = 2166136261
  const input = JSON.stringify(normalized)
  for (let i = 0; i < input.length; i++) hash = Math.imul(hash ^ input.charCodeAt(i), 16777619)
  return 'atelier_v2_' + (hash >>> 0).toString(36)
}
export function registerAvatarAnimations(scene: Phaser.Scene, key: string) {
  DIRECTIONS.forEach((direction, d) => {
    for (const [action, start, count, fps] of [['idle', d * 8, 8, 8], ['run', 32 + d * 8, WALK_FRAMES.length, WALK_FPS], ['sit', 64 + d * 4, 4, 16]] as const) {
      const name = key + '_' + action + '_' + direction
      if (!scene.anims.exists(name)) scene.anims.create({ key: name, frames: scene.anims.generateFrameNumbers(key, { start, end: start + count - 1 }), frameRate: fps, repeat: action === 'sit' ? 0 : -1 })
    }
  })
}
export async function getAvatarTextureKey(scene: Phaser.Scene, parts: AvatarChoice['parts']): Promise<string> {
  const key = avatarTextureKey(parts)
  if (scene.textures.exists(key)) { registerAvatarAnimations(scene, key); return key }
  let requests = pending.get(scene)
  if (!requests) { requests = new Map(); pending.set(scene, requests) }
  const cached = requests.get(key); if (cached) return cached
  const request = (async () => {
    const loaded = await loadAvatarLayers(parts, DIRECTIONS)
    if (scene.textures.exists(key)) return key
    const sheet = document.createElement('canvas'); sheet.width = 512; sheet.height = 240
    const ctx = sheet.getContext('2d')!
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
    for (let index = 0; index < 80; index++) {
      const sitting = index >= 64
      const direction = DIRECTIONS[sitting ? Math.floor((index - 64) / 4) : Math.floor((index % 32) / 8)]
      const frame = sitting ? 0 : index < 32 ? index % 8 : WALK_FRAMES[(index % 8) % WALK_FRAMES.length]
      ctx.save(); ctx.translate(index % 16 * 32, Math.floor(index / 16) * 48)
      if (sitting) {
        drawSeatedAvatar(ctx, loaded, direction, ((index - 64) % 4 + 1) / 4)
      } else drawAvatarFrame(ctx, loaded, direction, frame, 32)
      ctx.restore()
    }
    const texture = scene.textures.addCanvas(key, sheet)
    for (let i = 0; i < 80; i++) texture.add(i, 0, i % 16 * 32, Math.floor(i / 16) * 48, 32, 48)
    registerAvatarAnimations(scene, key)
    return key
  })()
  requests.set(key, request)
  try { return await request } finally { requests.delete(key) }
}
