import Phaser from 'phaser'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
/**
 * Pixel alignment from the Tiled seat marker to the seated sprite origin.
 * Third value is a depth (render order) correction applied on top of the
 * seated player's y-position — OtherPlayer.ts reads sittingShiftData[dir][2]
 * every frame to decide whether a remote player renders in front of or
 * behind nearby sprites while seated. Without a numeric third entry here,
 * that lookup is undefined and the resulting depth becomes NaN, which
 * makes Phaser's render-order sort for that sprite unstable (seated remote
 * players appearing to float above furniture or get hidden behind it).
 * Every direction MUST have exactly 3 entries: [x, y, depth].
 */
export const sittingShiftData = {
  // Seat points come from the Chair markers of map.json (mirrored in seat-map.json).
  // The seated avatar is drawn at marker + [x, y]. A seat can override this with its
  // own "shift": [x, y] in client/public/assets/map/seat-map.json.
  // depth: sitting-down/left/right poses lean slightly forward into the seat,
  // so nudge them a touch forward in the sort; the sit-up pose faces away
  // (back to camera) and should tuck slightly behind.
  up: [0, 3, -4],
  down: [0, 3, 4],
  left: [0, 3, 2],
  right: [0, 3, 2],
}

// status -> dot color, keep in sync with statusMeta in BottomBar.tsx
const statusDotColors: Record<'active' | 'busy' | 'away', number> = {
  active: 0x22c55e,
  busy: 0xef4444,
  away: 0xf59e0b,
}

export default class Player extends Phaser.Physics.Arcade.Sprite {
  playerId: string
  playerTexture: string
  playerBehavior = PlayerBehavior.IDLE
  readyToConnect = false
  videoConnected = false
  cameraEnabled = false
  microphoneEnabled = false
  speaking = false
  playerName: Phaser.GameObjects.Text
  playerContainer: Phaser.GameObjects.Container
  private playerNameDot: Phaser.GameObjects.Arc
  private microphoneIndicator: Phaser.GameObjects.Text
  private playerDialogBubble: Phaser.GameObjects.Container
  private timeoutID?: number

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, frame)

    this.playerId = id
    this.playerTexture = texture
    this.setDepth(this.y)

    this.anims.play(`${this.playerTexture}_idle_down`, true)

    this.playerContainer = this.scene.add.container(this.x, this.y - 30).setDepth(5000)

    // add dialogBubble to playerContainer
    this.playerDialogBubble = this.scene.add.container(0, 0).setDepth(5000)
    this.playerContainer.add(this.playerDialogBubble)

    // add playerName to playerContainer: dark pill with a green status dot, Gather-style
    this.playerName = this.scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '12px',
        color: '#ffffff',
        backgroundColor: '#1e2233',
        padding: { left: 16, right: 22, top: 3, bottom: 3 },
      })
      .setOrigin(0.5)
    this.playerNameDot = this.scene.add.circle(0, 0, 3, 0x2ecc71)
    this.microphoneIndicator = this.scene.add
      .text(0, 0, '🔇', { fontFamily: 'Arial', fontSize: '10px' })
      .setOrigin(0.5)
    this.playerContainer.add(this.playerName)
    this.playerContainer.add(this.playerNameDot)
    this.playerContainer.add(this.microphoneIndicator)

    this.scene.physics.world.enable(this.playerContainer)
    const playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
    const collisionScale = [0.5, 0.2]
    playContainerBody
      .setSize(this.width * collisionScale[0], this.height * collisionScale[1])
      .setOffset(-8, this.height * (1 - collisionScale[1]) + 6)
  }

  // keep the status dot glued to the left edge of the name pill, whatever the name's length
  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta)
    this.playerNameDot.setPosition(-this.playerName.width / 2 + 9, 0)
    this.microphoneIndicator.setPosition(this.playerName.width / 2 - 11, 0)
  }

  // recolor the status dot next to the name (active/busy/away)
  setStatus(status: 'active' | 'busy' | 'away') {
    this.playerNameDot.setFillStyle(statusDotColors[status] ?? statusDotColors.active)
  }

  setMicrophoneEnabled(enabled: boolean) {
    this.microphoneEnabled = enabled
    this.refreshMicrophoneIndicator()
  }

  setSpeaking(speaking: boolean) {
    this.speaking = speaking
    this.refreshMicrophoneIndicator()
  }

  private refreshMicrophoneIndicator() {
    const active = this.speaking && this.microphoneEnabled
    this.microphoneIndicator.setText(active ? '🔊' : this.microphoneEnabled ? '🎙️' : '🔇')
    this.microphoneIndicator.setColor(active ? '#63e6a2' : this.microphoneEnabled ? '#d6dfef' : '#8991a8')
  }

  updateDialogBubble(content: string) {
    this.clearDialogBubble()

    // preprocessing for dialog bubble text (maximum 70 characters)
    const dialogBubbleText = content.length <= 70 ? content : content.substring(0, 70).concat('...')

    const innerText = this.scene.add
      .text(0, 0, dialogBubbleText, { wordWrap: { width: 165, useAdvancedWrap: true } })
      .setFontFamily('Arial')
      .setFontSize(12)
      .setColor('#000000')
      .setOrigin(0.5)

    // set dialogBox slightly larger than the text in it
    const innerTextHeight = innerText.height
    const innerTextWidth = innerText.width

    innerText.setY(-innerTextHeight / 2 - this.playerName.height / 2 - 8)
    const dialogBoxWidth = innerTextWidth + 10
    const dialogBoxHeight = innerTextHeight + 3
    const dialogBoxX = innerText.x - innerTextWidth / 2 - 5
    const dialogBoxY = innerText.y - innerTextHeight / 2 - 2
    const bubble = this.scene.add.graphics()
    bubble.fillStyle(0xb6f4ed, 1)
    bubble.fillRoundedRect(dialogBoxX, dialogBoxY, dialogBoxWidth, dialogBoxHeight, 5)
    bubble.fillTriangle(-4, dialogBoxY + dialogBoxHeight - 1, 4, dialogBoxY + dialogBoxHeight - 1, 0, dialogBoxY + dialogBoxHeight + 6)
    this.playerDialogBubble.add(bubble)
    this.playerDialogBubble.add(innerText)

    // After 6 seconds, clear the dialog bubble
    this.timeoutID = window.setTimeout(() => {
      this.clearDialogBubble()
    }, 6000)
  }

  private clearDialogBubble() {
    clearTimeout(this.timeoutID)
    this.playerDialogBubble.removeAll(true)
  }
}
