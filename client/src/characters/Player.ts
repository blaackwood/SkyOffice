import Phaser from 'phaser'
import { PlayerActivity } from '../../../types/PlayerActivity'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
import { getAvatarTextureKey } from '../services/AvatarRenderer'
import { normalizeAvatarParts } from '../avatarConfig'
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
  basePlayerTexture: string
  avatarAppearance = ''
  playerBehavior = PlayerBehavior.IDLE
  readyToConnect = false
  videoConnected = false
  cameraEnabled = false
  microphoneEnabled = false
  speaking = false
  playerName: Phaser.GameObjects.Text
  playerContainer: Phaser.GameObjects.Container
  private playerNameBadge: Phaser.GameObjects.Graphics
  private playerNameDot: Phaser.GameObjects.Arc
  private speakingBubble: Phaser.GameObjects.Container
  private playerNameBadgeWidth = -1
  private playerNameBadgeHeight = -1
  private playerDialogBubble: Phaser.GameObjects.Container
  private timeoutID?: number
  private activityState?: PlayerActivity
  private activityLabel: Phaser.GameObjects.Text
  private studySessionPresent = false

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
    this.basePlayerTexture = texture
    this.setDepth(this.y)

    this.anims.play(`${this.playerTexture}_idle_down`, true)

    this.playerContainer = this.scene.add.container(this.x, this.y - 30).setDepth(5000)

    // add dialogBubble to playerContainer
    this.playerDialogBubble = this.scene.add.container(0, 0).setDepth(5000)
    this.playerContainer.add(this.playerDialogBubble)

    // Gather-style name badge: rounded indigo pill, clear text and a small tail.
    this.playerNameBadge = this.scene.add.graphics()
    this.playerName = this.scene.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#e8eaff',
        padding: { left: 19, right: 11, top: 5, bottom: 5 },
      })
      .setOrigin(0.5)
    this.playerNameDot = this.scene.add.circle(0, 0, 3, 0x2ecc71)
    this.playerContainer.add(this.playerNameBadge)
    this.playerContainer.add(this.playerName)
    this.playerContainer.add(this.playerNameDot)
    this.activityLabel = this.scene.add.text(0, -16, '', {
      fontFamily: 'Arial', fontSize: '10px', color: '#e0d6b5', align: 'center',
      backgroundColor: '#29251c', padding: { left: 5, right: 5, top: 2, bottom: 2 },
      wordWrap: { width: 160, useAdvancedWrap: true },
    }).setOrigin(0.5, 1).setVisible(false)
    this.playerContainer.add(this.activityLabel)

    // Small Gather-style speech indicator shown while this player's microphone
    // is actively picking up voice. It stays in the world with the avatar so
    // everyone nearby can see who is talking.
    this.speakingBubble = this.scene.add.container(22, 4).setVisible(false)
    const speakingBackground = this.scene.add.graphics()
    speakingBackground.fillStyle(0xffffff, 0.98)
    speakingBackground.fillRoundedRect(-15, -10, 30, 18, 8)
    speakingBackground.fillTriangle(-4, 7, 4, 7, 0, 13)
    const speakingDots = this.scene.add.text(0, -1, '•••', {
      color: '#171923',
      fontFamily: 'Arial',
      fontSize: '11px',
      fontStyle: 'bold',
      padding: { left: 1, right: 1, top: 0, bottom: 0 },
    }).setOrigin(0.5)
    this.speakingBubble.add([speakingBackground, speakingDots])
    this.playerContainer.add(this.speakingBubble)

    this.scene.physics.world.enable(this.playerContainer)
    const playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
    const collisionScale = [0.5, 0.2]
    playContainerBody
      .setSize(this.width * collisionScale[0], this.height * collisionScale[1])
      .setOffset(-8, this.height * (1 - collisionScale[1]) + 6)
  }

  private avatarLoadRequest = 0
  setAvatarAppearance(appearance: string) {
    const request = ++this.avatarLoadRequest
    let parts
    try { parts = normalizeAvatarParts(appearance ? JSON.parse(appearance) : undefined) }
    catch { parts = normalizeAvatarParts(undefined) }
    this.avatarAppearance = JSON.stringify(parts)
    void getAvatarTextureKey(this.scene, parts).then(texture => {
      if (!this.scene || request !== this.avatarLoadRequest) return
      const suffix = this.anims.currentAnim?.key.split('_').slice(-2).join('_') || 'idle_down'
      this.playerTexture = texture
      this.setTint(0xffffff)
      const animation = texture + '_' + suffix
      this.anims.play(this.scene.anims.exists(animation) ? animation : texture + '_idle_down', true)
    }).catch(error => { console.warn('Falha ao carregar aparência do avatar', error) })
  }
  // Keep the badge and online dot sized and positioned around each player's name.
  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta)
    this.refreshPlayerNameBadge()
    this.playerNameDot.setPosition(-this.playerName.width / 2 + 9, 0)
    this.speakingBubble.setPosition(Math.max(22, this.playerName.width / 2 + 8), 4)
  }

  private refreshPlayerNameBadge(): void {
    const width = this.playerName.width
    const height = this.playerName.height
    if (width === this.playerNameBadgeWidth && height === this.playerNameBadgeHeight) return
    this.playerNameBadgeWidth = width
    this.playerNameBadgeHeight = height

    const left = -width / 2
    const top = -height / 2
    const radius = height / 2
    this.playerNameBadge.clear()
    this.playerNameBadge.fillStyle(0x303865, 0.98)
    this.playerNameBadge.fillRoundedRect(left, top, width, height, radius)
    this.playerNameBadge.fillTriangle(-4, top + height - 1, 4, top + height - 1, 0, top + height + 5)
    this.playerNameBadge.lineStyle(1, 0x4b568a, 0.9)
    this.playerNameBadge.strokeRoundedRect(left, top, width, height, radius)
  }

  // recolor the status dot next to the name (active/busy/away)
  setStatus(status: 'active' | 'busy' | 'away') {
    this.playerNameDot.setFillStyle(statusDotColors[status] ?? statusDotColors.active)
  }

  setActivity(value: string) {
    try { this.activityState = value ? JSON.parse(value) : undefined }
    catch { this.activityState = undefined }
    const label = this.activityState?.label || ''
    this.activityLabel.setText(['Estudando', 'Fazendo simulado'].includes(label) ? '' : label)
    this.setStudySessionPresent(this.studySessionPresent)
  }

  setStudySessionPresent(present: boolean): void {
    this.studySessionPresent = present
    this.activityLabel.setVisible(present && Boolean(this.activityLabel.text))
  }

  getStudyBadgeY(): number {
    return this.activityLabel.visible ? this.activityLabel.y - this.activityLabel.height - 3 : -29
  }

  setMicrophoneEnabled(enabled: boolean) {
    this.microphoneEnabled = enabled
  }

  setSpeaking(speaking: boolean) {
    this.speaking = speaking
    this.speakingBubble.setVisible(speaking)
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

