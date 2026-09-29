import manifestData from '../data/atelier-avatar.json'
import { normalizeAvatarParts, type AvatarChoice, type AvatarPartId } from '../avatarConfig'
export const atelierManifest = manifestData
export const AVATAR_ROOT = import.meta.env.BASE_URL + 'assets/atelier-avatar/'
export const DIRECTIONS = ['right', 'up', 'left', 'down'] as const
export type AvatarDirection = typeof DIRECTIONS[number]
// The original character completes six steps at 15 fps (400 ms per cycle).
// Sample the pack's run row at the same contact/passing phases.
export const WALK_FRAMES = [16, 17, 19, 20, 21, 23] as const
export const WALK_FPS = 15
const FRAME_WIDTH = 64
const FRAME_HEIGHT = 96
const FRAME_GUTTER = 2
// Sleeve endpoints are measured once per sheet/frame, not on every game tick.
const cuffCache = new WeakMap<HTMLCanvasElement, Map<number, Array<{ x: number; y: number }>>>()
function sleeveEnds(image: HTMLCanvasElement, frame: number) {
  let frames = cuffCache.get(image)
  if (!frames) { frames = new Map(); cuffCache.set(image, frames) }
  const cached = frames.get(frame)
  if (cached) return cached
  const pixels = image.getContext('2d')!.getImageData(frame % 8 * 68 + 2, Math.floor(frame / 8) * 100 + 2, 64, 96).data
  const ends = [[8, 20], [44, 56]].map(([left, right]) => {
    for (let y = 67; y >= 44; y--) {
      const xs: number[] = []
      for (let x = left; x < right; x++) if (pixels[(y * 64 + x) * 4 + 3] > 180) xs.push(x)
      if (xs.length >= 3) return { x: (xs[0] + xs[xs.length - 1]) / 2, y }
    }
    return { x: left < 30 ? 20 : 44, y: 58 }
  })
  frames.set(frame, ends)
  return ends
}
type Parts = AvatarChoice['parts']
const cache = new Map<string, Promise<HTMLCanvasElement>>()
const pending = new Map<string, Promise<HTMLCanvasElement>>()
let active = 0
const waiters: Array<() => void> = []
async function acquire() { if (active >= 3) await new Promise<void>(resolve => waiters.push(resolve)); else active++ }
function release() { const next = waiters.shift(); if (next) next(); else active-- }
export function getLayerSheet(id: string, direction: AvatarDirection): Promise<HTMLCanvasElement> {
  const key = id + ':' + direction
  const cached = cache.get(key) || pending.get(key)
  if (cached) { if (cache.has(key)) { cache.delete(key); cache.set(key, cached) }; return cached }
  const item = manifestData.items.find(item => item.id === id)
  if (!item) return Promise.reject(new Error('Peça de avatar desconhecida'))
  const promise = (async () => {
    await acquire()
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Não foi possível carregar ' + item.label))
        image.src = AVATAR_ROOT + item.directions[direction].sheet
      })
      // Keep idle, walk and run at half resolution in CPU memory. Never upload
      // hundreds of full 1024×1152 sheets into the game's GPU texture cache.
      const canvas = document.createElement('canvas')
      canvas.width = (FRAME_WIDTH + FRAME_GUTTER * 2) * 8
      canvas.height = (FRAME_HEIGHT + FRAME_GUTTER * 2) * 3
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      // Resizing a tightly packed sheet blends pixels from the next row into
      // the feet. Isolate each source frame before resizing and surround the
      // result with transparent gutters so preview scaling cannot sample a
      // neighbouring head/body beneath the current character.
      const frame = document.createElement('canvas')
      frame.width = 128; frame.height = 192
      const frameContext = frame.getContext('2d')!
      frameContext.imageSmoothingEnabled = false
      for (let index = 0; index < 24; index++) {
        frameContext.clearRect(0, 0, 128, 192)
        frameContext.drawImage(image, index % 8 * 128, Math.floor(index / 8) * 192, 128, 192, 0, 0, 128, 192)
        ctx.drawImage(frame, index % 8 * (FRAME_WIDTH + FRAME_GUTTER * 2) + FRAME_GUTTER,
          Math.floor(index / 8) * (FRAME_HEIGHT + FRAME_GUTTER * 2) + FRAME_GUTTER, FRAME_WIDTH, FRAME_HEIGHT)
      }
      image.src = ''
      return canvas
    } finally { release() }
  })()
  pending.set(key, promise)
  promise.then(() => {
    pending.delete(key); cache.set(key, promise)
    while (cache.size > 48) cache.delete(cache.keys().next().value!)
  }, () => { pending.delete(key) })
  return promise
}
export async function loadAvatarLayers(parts: Parts, directions: readonly AvatarDirection[]) {
  const normalized = normalizeAvatarParts(parts)
  const layers = new Map<string, HTMLCanvasElement>()
  await Promise.all(directions.flatMap(direction => Object.values(normalized).filter(Boolean).map(async id => {
    layers.set(id + ':' + direction, await getLayerSheet(id!, direction))
  })))
  return { parts: normalized, layers }
}
export function drawAvatarFrame(ctx: CanvasRenderingContext2D, loaded: Awaited<ReturnType<typeof loadAvatarLayers>>, direction: AvatarDirection, frame: number, size = 64) {
  if (!Number.isInteger(frame) || frame < 0 || frame >= 24) return
  const scale = size / 64
  const garment = loaded.parts.jacket && !['jacket_08', 'jacket_14'].includes(loaded.parts.jacket)
    ? loaded.parts.jacket : loaded.parts.top
  const longSleeves = garment && !['top_01', 'top_02', 'top_07', 'top_08', 'top_13', 'top_16'].includes(garment)
  const fitHands = !!longSleeves && (direction === 'down' || direction === 'up')
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, size, size * 1.5)
  ctx.clip()
  for (const slot of manifestData.layerOrder) {
    const part = (slot === 'pants' ? 'bottom' : slot) as AvatarPartId
    const id = loaded.parts[part]
    if (!id) continue
    const image = loaded.layers.get(id + ':' + direction)
    if (!image) continue
    let x = 0, y = 0, width = 64, height = 96
    // The skin artwork includes its own legs underneath the selected trousers.
    // Keep the head, torso and hands, but do not draw the covered lower legs:
    // during a stride they otherwise show beside the garment as a second pair.
    if (slot === 'skin' && loaded.parts.bottom) height = longSleeves ? 61 : 65
    if (slot === 'top' && loaded.parts.jacket && !['jacket_08', 'jacket_14'].includes(loaded.parts.jacket)) {
      x = (direction === 'left' ? 45 : direction === 'right' ? 61 : 42) / 2
      width = (direction === 'left' || direction === 'right' ? 23 : 44) / 2
    }
    if (slot === 'hair' && loaded.parts.hat) { y = 22.5; height = 73.5 }
    ctx.save()
    if (slot === 'skin' && fitHands) {
      // Long sleeves replace the bare shoulders and arms as well as the wrists.
      // Preserve the head/neck, but keep covered skin inside the garment torso.
      ctx.beginPath(); ctx.rect(0, 0, size, 35 * scale)
      ctx.rect(28 * scale, 35 * scale, 8 * scale, 7 * scale)
      ctx.rect(24.5 * scale, 42 * scale, 15 * scale, 19 * scale); ctx.clip()
    }
    ctx.drawImage(image, (frame % 8) * (FRAME_WIDTH + FRAME_GUTTER * 2) + FRAME_GUTTER + x,
      Math.floor(frame / 8) * (FRAME_HEIGHT + FRAME_GUTTER * 2) + FRAME_GUTTER + y,
      width, height, x * scale, y * scale, width * scale, height * scale)
    ctx.restore()
    if (id === garment && fitHands) {
      const skin = loaded.layers.get(loaded.parts.skin + ':' + direction)
      if (skin) {
        const cuffs = sleeveEnds(image, frame)
        cuffs.forEach((cuff, index) => {
          // Neutral hand only: no thigh pixels, and no duplicate original wrist.
          ctx.drawImage(skin, 2 + (index === 0 ? 17.5 : 39.5), 2 + 58, 7, 6.5,
            (cuff.x - 3.5) * scale, (cuff.y - 1) * scale, 7 * scale, 6.5 * scale)
        })
      }
    }
    // The side garments cover the skin layer, including its entire hand.
    // Restore only the near hand above clothing, following the pack's arm pivot.
    if (slot === 'jacket' || (slot === 'top' && !loaded.parts.jacket)) {
      const skin = loaded.layers.get(loaded.parts.skin + ':' + direction)
      if (skin && (direction === 'left' || direction === 'right')) {
        const phase = Math.sin(frame % 8 / 8 * Math.PI * 2)
        const moving = frame >= 8
        const force = frame >= 16 ? 1.65 : 1
        ctx.save()
        ctx.scale(scale, scale)
        if (direction === 'right') { ctx.translate(64, 0); ctx.scale(-1, 1) }
        ctx.translate(moving ? Math.round(phase * force) / 4 : 0,
          -(moving ? Math.round(Math.abs(phase) * 3 * force) : Math.round(phase * 1.2)) / 4)
        ctx.translate(33.75, 40.25)
        ctx.rotate(moving ? -phase * 8 * force * Math.PI / 180 : 0)
        ctx.translate(-33.75, -40.25)
        // Read the neutral hand so the clothing cannot erase it in any phase.
        if (direction === 'right') {
          ctx.translate(64, 0); ctx.scale(-1, 1)
          ctx.drawImage(skin, 2 + 20.75, 2 + 59.5, 11.25, 7, 20.75, 59.5, 11.25, 7)
        } else ctx.drawImage(skin, 2 + 32, 2 + 59.5, 11.25, 7, 32, 59.5, 11.25, 7)
        ctx.restore()
      }
    }
  }
  ctx.restore()
}

export function drawSeatedAvatar(ctx: CanvasRenderingContext2D, loaded: Awaited<ReturnType<typeof loadAvatarLayers>>, direction: AvatarDirection, progress = 1, size = 32) {
  const pose = document.createElement('canvas'); pose.width = 64; pose.height = 96
  drawAvatarFrame(pose.getContext('2d')!, loaded, direction, 0)
  const legs = document.createElement('canvas'); legs.width = 64; legs.height = 96
  const legLayers = new Map([...loaded.layers].filter(([key]) =>
    key === loaded.parts.bottom + ':' + direction || key === loaded.parts.shoes + ':' + direction))
  drawAvatarFrame(legs.getContext('2d')!, { ...loaded, layers: legLayers }, direction, 0)
  ctx.save(); ctx.scale(size / 64, size / 64)
  ctx.beginPath(); ctx.rect(0, 0, 64, 96); ctx.clip()
  const side = direction === 'left' || direction === 'right'
  const drop = 7 * progress
  if (side) {
    const sign = direction === 'left' ? -1 : 1
    // Bend the thigh around the hip; move the shin and shoe to the knee.
    const angle = progress * Math.PI / 2
    const kneeX = 33 + sign * Math.sin(angle) * 13
    const kneeY = 61 + Math.cos(angle) * 13 + drop
    ctx.drawImage(legs, 0, 74, 64, 22, kneeX - 33, kneeY, 64, 22)
    ctx.save(); ctx.translate(33, 61 + drop); ctx.rotate(-sign * angle)
    ctx.drawImage(legs, 0, 61, 64, 13, -33, 0, 64, 13); ctx.restore()
    ctx.drawImage(pose, 0, 0, 64, 66.5, 0, drop, 64, 66.5)
  } else {
    ctx.drawImage(pose, 0, 61, 64, 35, 0, 61 + drop, 64, 35 - drop * 1.8)
    ctx.drawImage(pose, 0, 0, 64, 61, 0, drop, 64, 61)
  }
  ctx.restore()
}

