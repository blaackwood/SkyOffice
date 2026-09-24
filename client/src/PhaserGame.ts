import Phaser from 'phaser'
import Game from './scenes/Game'
import Background from './scenes/Background'
import Bootstrap from './scenes/Bootstrap'

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'phaser-container',
  backgroundColor: '#93cbee',
  pixelArt: true, // Prevent pixel art from becoming blurred when scaled.
  scale: {
    mode: Phaser.Scale.ScaleModes.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
  autoFocus: true,
  scene: [Bootstrap, Background, Game],
}

// Vite can re-evaluate this module while preserving the React app. Keep the
// existing Phaser instance in that case; creating another one leaves a second
// canvas stacked below the visible page and can make the office appear gone.
const gameWindow = window as Window & { __skyOfficePhaserGame?: Phaser.Game; game?: Phaser.Game }
const phaserGame = gameWindow.__skyOfficePhaserGame ?? new Phaser.Game(config)
gameWindow.__skyOfficePhaserGame = phaserGame
gameWindow.game = phaserGame

export default phaserGame
