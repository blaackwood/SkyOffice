import Phaser from 'phaser'
import { WALK_FRAMES, WALK_FPS } from '../services/AtelierAvatar'
export function createCharacterAnims(anims: Phaser.Animations.AnimationManager) {
  ;(['right', 'up', 'left', 'down'] as const).forEach((direction, i) => {
    for (const [action, start, count, fps] of [['idle', i * 8, 8, 8], ['run', 32 + i * 8, WALK_FRAMES.length, WALK_FPS], ['sit', 64 + i * 4, 4, 16]] as const) {
      const key = 'atelier_' + action + '_' + direction
      if (!anims.exists(key)) anims.create({ key, frames: anims.generateFrameNumbers('atelier', { start, end: start + count - 1 }), repeat: action === 'sit' ? 0 : -1, frameRate: fps })
    }
  })
}
