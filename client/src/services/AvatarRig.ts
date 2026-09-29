/** Directional pixel rig for the editor's front-facing, 32 × 48 layered art. */
export type AvatarDirection = 'down' | 'up' | 'left' | 'right'
export type AvatarPose = 'idle' | 'run' | 'sit'
type Canvas = HTMLCanvasElement
export type AvatarLayers = Record<string, Canvas | undefined>
const W = 32
const H = 48

function surface() {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  canvas.getContext('2d')!.imageSmoothingEnabled = false
  return canvas
}

function colorAt(canvas: Canvas, x: number, y: number, fallback: string) {
  const p = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data
  return p[3] ? `rgb(${p[0]},${p[1]},${p[2]})` : fallback
}

function mainColor(canvas: Canvas | undefined, fallback: string) {
  if (!canvas) return fallback
  const counts = new Map<string, number>()
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, W, H).data
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue
    const color = `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`
    counts.set(color, (counts.get(color) || 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || fallback
}

function headForDirection(layers: AvatarLayers, direction: AvatarDirection) {
  const head = surface()
  const ctx = head.getContext('2d')!
  const skin = layers.skin
  if (!skin) return head
  const skinColor = colorAt(skin, 15, 14, '#eab78d')
  const skinShade = colorAt(skin, 24, 14, '#b89076')
  const skinOutline = colorAt(skin, 25, 14, '#503d3d')
  const hairColor = layers.hair ? colorAt(layers.hair, 15, 7, mainColor(layers.hair, '#2a2228')) : '#2a2228'
  const hairOutline = layers.hair ? colorAt(layers.hair, 15, 3, '#191320') : skinOutline
  // Separate the head from shoulders; the supplied skin also includes the arms.
  const mask = surface()
  const mc = mask.getContext('2d')!
  mc.drawImage(skin, 0, 0, W, 24, 0, 0, W, 24)
  mc.drawImage(skin, 9, 24, 14, 4, 9, 24, 14, 4)
  if (direction === 'down') {
    ctx.drawImage(mask, 0, 0)
    for (const key of ['facial', 'hair', 'hat', 'glasses']) if (layers[key]) ctx.drawImage(layers[key]!, 0, 0)
    return head
  }
  // Build a clean head silhouette: facial features must not appear on the back
  // of the head, or as a second eye in profile. Outline pixels remain intact.
  const data = mc.getImageData(0, 0, W, H)
  const fill = surface().getContext('2d')!
  fill.fillStyle = direction === 'up' && layers.hair ? hairColor : skinColor
  fill.fillRect(0, 0, W, H)
  const base = fill.getImageData(0, 0, 1, 1).data
  fill.fillStyle = direction === 'up' && layers.hair ? hairOutline : skinOutline
  fill.fillRect(0, 0, 1, 1)
  const edge = fill.getImageData(0, 0, 1, 1).data
  for (let y = 0; y < 28; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    if (!data.data[i + 3]) continue
    const border = x === 0 || x === W - 1 || !data.data[i - 4 + 3] || !data.data[i + 4 + 3]
    const rgb = border ? edge : base
    for (let c = 0; c < 3; c++) data.data[i + c] = rgb[c]
  }
  mc.putImageData(data, 0, 0)
  if (direction === 'up') {
    ctx.drawImage(mask, 0, 0)
    if (layers.hair) {
      // Keep the selected crown/length silhouette without pasting front bangs
      // onto the back. Long hair continues down over the shoulders.
      ctx.drawImage(layers.hair, 0, 0, W, 9, 0, 0, W, 9)
      ctx.drawImage(layers.hair, 0, 9, 10, 39, 0, 9, 10, 39)
      ctx.drawImage(layers.hair, 22, 9, 10, 39, 22, 9, 10, 39)
      ctx.fillStyle = hairOutline
      ctx.fillRect(10, 25, 12, 1)
      ctx.fillStyle = hairColor
      ctx.fillRect(10, 24, 12, 1)
    }
    if (layers.hat) ctx.drawImage(layers.hat, 0, 0)
    return head
  }
  // Right profile. Left is mirrored after the entire articulated pose is drawn.
  ctx.drawImage(mask, 4, 0, 24, 28, 8, 0, 18, 28)
  ctx.fillStyle = skinOutline
  ctx.fillRect(25, 18, 2, 4)
  ctx.fillStyle = skinColor
  ctx.fillRect(24, 18, 2, 3) // nose
  ctx.fillStyle = '#281c37'
  ctx.fillRect(23, 17, 1, 3) // one visible eye
  ctx.fillStyle = skinShade
  ctx.fillRect(22, 23, 3, 1)
  if (layers.facial) ctx.drawImage(layers.facial, 15, 18, 13, 12, 18, 18, 9, 12)
  if (layers.hair) {
    ctx.drawImage(layers.hair, 3, 0, 26, H, 7, 0, 19, H)
    ctx.save()
    ctx.beginPath()
    ctx.rect(7, 8, 10, 13)
    ctx.clip()
    const hairSide = surface()
    const hc = hairSide.getContext('2d')!
    hc.drawImage(mask, 4, 0, 24, 28, 8, 0, 18, 28)
    hc.globalCompositeOperation = 'source-in'
    hc.fillStyle = hairColor
    hc.fillRect(0, 0, W, H)
    ctx.drawImage(hairSide, 0, 0)
    ctx.restore()
    ctx.fillStyle = skinShade
    ctx.fillRect(15, 18, 3, 4)
    ctx.fillStyle = skinColor
    ctx.fillRect(16, 18, 2, 3)
  }
  // The hair's frontal sideburn can cover the profile eye; reveal the face
  // on the forward edge before drawing glasses and headwear.
  ctx.fillStyle = skinColor
  ctx.fillRect(22, 16, 3, 6)
  ctx.fillStyle = '#faf5fa'
  ctx.fillRect(22, 18, 2, 2)
  ctx.fillStyle = '#281c37'
  ctx.fillRect(23, 18, 1, 2)
  ctx.fillStyle = skinShade
  ctx.fillRect(23, 16, 2, 1)
  if (layers.hat) ctx.drawImage(layers.hat, 3, 0, 26, H, 7, 0, 19, H)
  if (layers.glasses) {
    ctx.drawImage(layers.glasses, 16, 0, 16, H, 19, 0, 11, H)
    ctx.fillStyle = mainColor(layers.glasses, '#292438')
    ctx.fillRect(16, 18, 6, 1)
  }
  return head
}

export function createAvatarRig(layers: AvatarLayers) {
  const body = surface()
  const bc = body.getContext('2d')!
  for (const key of ['skin', 'bottom', 'top', 'jacket', 'shoes']) if (layers[key]) bc.drawImage(layers[key]!, 0, 0)
  const heads = {
    down: headForDirection(layers, 'down'),
    up: headForDirection(layers, 'up'),
    right: headForDirection(layers, 'right'),
  }
  return (direction: AvatarDirection, pose: AvatarPose, phase: number) => {
    const result = surface()
    const ctx = result.getContext('2d')!
    const side = direction === 'left' || direction === 'right'
    const moving = pose === 'run'
    // Contact, passing, contact: opposite feet/arms alternate. The hip stays
    // fixed horizontally; only individual limbs move, so this is not sliding
    // a still image from side to side.
    const stride = moving ? [1, 0.5, -0.5, -1, -0.5, 0.5][phase % 6] : 0
    const bob = moving ? [0, -1, -1, 0, -1, -1][phase % 6] : 0
    if (direction === 'left') { ctx.translate(W, 0); ctx.scale(-1, 1) }
    const leg = (left: boolean, far: boolean) => {
      const swing = (left ? stride : -stride)
      const sx = left ? 9 : 17
      const lift = moving ? Math.max(0, -swing) * 2 : 0
      ctx.save()
      if (far && side) ctx.filter = 'brightness(0.78)'
      // Pixel-aligned rows bend the leg at the knee and keep its hip attached.
      for (let row = 0; row < 10; row++) {
        const t = row / 9
        const dx = side ? Math.round(swing * 5 * t) : Math.round(swing * t * 0.7)
        const x = (side ? 13 : sx) + dx
        const y = 35 + row + Math.round(bob * (1 - t) - lift * t)
        ctx.drawImage(body, sx, 35 + row, 6, 1, x, y, 6, 1)
      }
      ctx.restore()
    }
    const arm = (left: boolean, far: boolean) => {
      const swing = (left ? -stride : stride)
      const sx = left ? 6 : 23
      ctx.save()
      if (far && side) ctx.filter = 'brightness(0.78)'
      for (let row = 0; row < 11; row++) {
        const t = row / 10
        const dx = Math.round(swing * (side ? 4 : 1) * t)
        const x = (side ? (far ? 14 : 15) : sx) + dx
        const y = 24 + row + bob - Math.round(Math.abs(swing) * t)
        ctx.drawImage(body, sx, 24 + row, 3, 1, x, y, 3, 1)
      }
      ctx.restore()
    }
    if (side) {
      leg(false, true)
      arm(false, true)
      leg(true, false)
      ctx.drawImage(body, 9, 24, 14, 12, 12, 24 + bob, 9, 12)
      arm(true, false)
    } else {
      leg(false, false)
      leg(true, false)
      arm(false, false)
      arm(true, false)
      ctx.drawImage(body, 9, 24, 14, 12, 9, 24 + bob, 14, 12)
    }
    ctx.drawImage(heads[side ? 'right' : direction as 'up' | 'down'], 0, bob)
    if (layers.other) {
      if (side) ctx.drawImage(layers.other, 0, 0, W, H, 6, bob, 23, H)
      else ctx.drawImage(layers.other, 0, bob)
    }
    if (pose === 'sit') {
      // Keep head/torso proportions. Bend the lower legs instead of stretching
      // or squashing the entire character to fake sitting.
      const seated = surface()
      const sc = seated.getContext('2d')!
      sc.drawImage(result, 0, 0, W, 35, 0, 3, W, 35)
      sc.drawImage(result, 0, 35, W, 10, 0, 38, W, 6)
      return seated
    }
    return result
  }
}
