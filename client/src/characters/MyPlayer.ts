import Phaser from 'phaser'
import PlayerSelector from './PlayerSelector'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
import { sittingShiftData } from './Player'
import Player from './Player'
import Network from '../services/Network'
import Chair from '../items/Chair'
import Whiteboard from '../items/Whiteboard'

import { phaserEvents, Event } from '../events/EventCenter'
import { ItemType } from '../../../types/Items'
import { NavKeys } from '../../../types/KeyboardState'
import { JoystickMovement } from '../components/Joystick'
import { openURL } from '../utils/helpers'

export default class MyPlayer extends Player {
  private playContainerBody: Phaser.Physics.Arcade.Body
  private chairOnSit?: Chair
  private sitExitArmed = false
  // set by Game: finds a free floor spot to step to when standing up from a seat
  public standFinder?: (chair: Chair) => [number, number]
  public joystickMovement?: JoystickMovement
  private autoWalkPath: [number, number][] = []
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, id, frame)
    this.playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body

    // react to status changes coming from the BottomBar profile menu
    phaserEvents.on(Event.MY_PLAYER_STATUS_CHANGE, this.setStatus, this)
    phaserEvents.on(Event.MY_PLAYER_MIC_STATE_CHANGE, this.setMicrophoneEnabled, this)
  }

  destroy(fromScene?: boolean) {
    phaserEvents.off(Event.MY_PLAYER_STATUS_CHANGE, this.setStatus, this)
    phaserEvents.off(Event.MY_PLAYER_MIC_STATE_CHANGE, this.setMicrophoneEnabled, this)
    super.destroy(fromScene)
  }

  setPlayerName(name: string) {
    this.playerName.setText(name)
    phaserEvents.emit(Event.MY_PLAYER_NAME_CHANGE, name)
  }

  setPlayerTexture(texture: string) {
    this.playerTexture = texture
    const currentParts = this.anims.currentAnim?.key.split('_') ?? []
    const action = this.playerBehavior === PlayerBehavior.SITTING
      ? 'sit'
      : currentParts[1] === 'run' ? 'run' : 'idle'
    const direction = currentParts[2] ?? 'down'
    const nextAnimation = `${texture}_${action}_${direction}`
    const fallbackAnimation = `${texture}_idle_down`
    const animation = this.scene.anims.exists(nextAnimation) ? nextAnimation : fallbackAnimation
    this.anims.play(animation, true)
    phaserEvents.emit(Event.MY_PLAYER_TEXTURE_CHANGE, this.x, this.y, animation)
  }

  handleJoystickMovement(movement: JoystickMovement) {
    this.joystickMovement = movement
  }

  walkAlongPath(path: [number, number][]) {
    const [startX, startY] = this.getAutoWalkStartPosition()
    this.autoWalkPath = []
    let lastX = startX
    let lastY = startY
    path.forEach(([x, y]) => {
      if (Math.abs(x - lastX) > 1 && Math.abs(y - lastY) > 1) {
        this.autoWalkPath.push([x, lastY])
      }
      this.autoWalkPath.push([x, y])
      lastX = x
      lastY = y
    })
    if (this.chairOnSit) this.sitExitArmed = true
  }

  isAutoWalking() {
    return this.autoWalkPath.length > 0
  }

  getAutoWalkStartPosition(): [number, number] {
    if (!this.chairOnSit) return [this.x, this.y]
    this.chairOnSit.standShift ??= this.standFinder?.(this.chairOnSit) ?? [0, 3]
    return [this.chairOnSit.x + this.chairOnSit.standShift[0], this.chairOnSit.y + this.chairOnSit.standShift[1]]
  }

  setPlayerTint(tint: number) {
    this.setTint(tint)
    phaserEvents.emit(Event.MY_PLAYER_TINT_CHANGE, tint)
  }

  sitOnChair(chairItem: Chair, playerSelector: PlayerSelector, network: Network) {
    if (this.playerBehavior === PlayerBehavior.SITTING || !chairItem.itemDirection || this.chairOnSit === chairItem) return
    this.setVelocity(0, 0)
    this.playContainerBody.setVelocity(0, 0)
    const direction = chairItem.itemDirection
    const sitAnimation = `${this.playerTexture}_sit_${direction}`
    this.sitExitArmed = false
    this.chairOnSit = chairItem
    this.playerBehavior = PlayerBehavior.SITTING
    // Snap and switch to the seated sprite in the same frame. The actual pose
    // must not depend on a separate transition animation completing first.
    const shift = chairItem.sitShift ?? sittingShiftData[direction]
    const sitX = chairItem.x + shift[0]
    const sitY = chairItem.y + shift[1]
    this.setPosition(sitX, sitY).setDepth(sitY).play(sitAnimation, true)
    this.playerContainer.setPosition(this.x, this.y - 30)
    playerSelector.selectedItem = undefined
    playerSelector.setPosition(direction === 'up' ? this.x : 0, direction === 'up' ? this.y - this.height : 0)
    network.updatePlayer(this.x, this.y, sitAnimation)
  }

  update(
    playerSelector: PlayerSelector,
    cursors: NavKeys,
    keyR: Phaser.Input.Keyboard.Key,
    network: Network,
    delta: number
  ) {
    if (!cursors) return

    if (
      this.chairOnSit &&
      this.playerBehavior !== PlayerBehavior.SITTING &&
      Phaser.Math.Distance.Between(this.x, this.y, this.chairOnSit.x, this.chairOnSit.y) > 24
    ) {
      this.chairOnSit = undefined
    }

    const item = playerSelector.selectedItem

    if (Phaser.Input.Keyboard.JustDown(keyR)) {
      switch (item?.itemType) {
        case ItemType.WHITEBOARD:
          const whiteboard = item as Whiteboard
          whiteboard.openDialog(network)
          break
        case ItemType.VENDINGMACHINE:
          // hacky and hard-coded, but leaving it as is for now
          const url = 'https://www.buymeacoffee.com/skyoffice'
          openURL(url)
          break
      }
    }

    const manualMovement = cursors.left?.isDown || cursors.right?.isDown || cursors.up?.isDown || cursors.down?.isDown ||
      cursors.W?.isDown || cursors.A?.isDown || cursors.S?.isDown || cursors.D?.isDown || this.joystickMovement?.isMoving
    if (manualMovement) this.autoWalkPath = []

    switch (this.playerBehavior) {
      case PlayerBehavior.IDLE:
        const speed = 200
        let vx = 0
        let vy = 0

        let joystickLeft = false
        let joystickRight = false
        let joystickUp = false
        let joystickDown = false

        if (this.joystickMovement?.isMoving) {
          joystickLeft = this.joystickMovement.direction.left
          joystickRight = this.joystickMovement.direction.right
          joystickUp = this.joystickMovement.direction.up
          joystickDown = this.joystickMovement.direction.down
        }

        if (cursors.left?.isDown || cursors.A?.isDown || joystickLeft) vx -= speed
        if (cursors.right?.isDown || cursors.D?.isDown || joystickRight) vx += speed
        if (cursors.up?.isDown || cursors.W?.isDown || joystickUp) {
          vy -= speed
          this.setDepth(this.y) //change player.depth if player.y changes
        }
        if (cursors.down?.isDown || cursors.S?.isDown || joystickDown) {
          vy += speed
          this.setDepth(this.y) //change player.depth if player.y changes
        }
        if (!manualMovement && this.autoWalkPath.length > 0) {
          const [targetX, targetY] = this.autoWalkPath[0]
          const dx = targetX - this.x
          const dy = targetY - this.y
          const distance = Math.hypot(dx, dy)
          if (distance <= Math.max(4, speed * delta / 1000)) {
            this.setPosition(targetX, targetY)
            this.autoWalkPath.shift()
          }
          if (this.autoWalkPath.length > 0) {
            const [nextX, nextY] = this.autoWalkPath[0]
            const nextDx = nextX - this.x
            const nextDy = nextY - this.y
            if (Math.abs(nextDx) > 1) vx = Math.sign(nextDx) * speed
            else if (Math.abs(nextDy) > 1) vy = Math.sign(nextDy) * speed
            if (Math.abs(vy) >= Math.abs(vx)) this.setDepth(this.y)
          }
        }
        // update character velocity
        this.setVelocity(vx, vy)
        this.body.velocity.setLength(speed)
        // also update playerNameContainer velocity
        this.playContainerBody.setVelocity(vx, vy)
        this.playContainerBody.velocity.setLength(speed)

        // update animation according to velocity and send new location and anim to server
        if (vx !== 0 || vy !== 0) network.updatePlayer(this.x, this.y, this.anims.currentAnim.key)
        if (vx > 0) {
          this.play(`${this.playerTexture}_run_right`, true)
        } else if (vx < 0) {
          this.play(`${this.playerTexture}_run_left`, true)
        } else if (vy > 0) {
          this.play(`${this.playerTexture}_run_down`, true)
        } else if (vy < 0) {
          this.play(`${this.playerTexture}_run_up`, true)
        } else {
          const parts = this.anims.currentAnim.key.split('_')
          parts[1] = 'idle'
          const newAnim = parts.join('_')
          // this prevents idle animation keeps getting called
          if (this.anims.currentAnim.key !== newAnim) {
            this.play(parts.join('_'), true)
            // send new location and anim to server
            network.updatePlayer(this.x, this.y, this.anims.currentAnim.key)
          }
        }
        break

      case PlayerBehavior.SITTING:
        if (this.chairOnSit?.itemDirection) {
          const sitAnimation = `${this.playerTexture}_sit_${this.chairOnSit.itemDirection}`
          if (this.anims.currentAnim?.key !== sitAnimation) this.play(sitAnimation, true)
        }
        const movementKeys = [cursors.left, cursors.right, cursors.up, cursors.down, cursors.W, cursors.A, cursors.S, cursors.D]
        const movementHeld = movementKeys.some((key) => key?.isDown) || Boolean(this.joystickMovement?.isMoving) || this.autoWalkPath.length > 0
        if (!movementHeld) this.sitExitArmed = true
        const movementPressed = movementKeys.some((key) => key && Phaser.Input.Keyboard.JustDown(key))
        if (this.sitExitArmed && (movementPressed || this.joystickMovement?.isMoving || this.autoWalkPath.length > 0)) {
          this.sitExitArmed = false
          const parts = this.anims.currentAnim.key.split('_')
          parts[1] = 'idle'
          this.play(parts.join('_'), true)
          this.playerBehavior = PlayerBehavior.IDLE
          // The seated pose is drawn tucked into the furniture; step back out to
          // the open floor tile in front of it so the physics body never ends up
          // inside a blocked collision tile.
          if (this.chairOnSit) {
            this.chairOnSit.standShift ??= this.standFinder?.(this.chairOnSit) ?? [0, 3]
            const stand = this.chairOnSit.standShift
            this.setPosition(this.chairOnSit.x + stand[0], this.chairOnSit.y + stand[1]).setDepth(this.y)
            this.playerContainer.setPosition(this.x, this.y - 30)
          }
          this.chairOnSit?.clearDialogBox()
          playerSelector.setPosition(this.x, this.y)
          playerSelector.update(this, cursors)
          network.updatePlayer(this.x, this.y, this.anims.currentAnim.key)
        }
        break
    }
  }
}

declare global {
  namespace Phaser.GameObjects {
    interface GameObjectFactory {
      myPlayer(x: number, y: number, texture: string, id: string, frame?: string | number): MyPlayer
    }
  }
}

Phaser.GameObjects.GameObjectFactory.register(
  'myPlayer',
  function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    const sprite = new MyPlayer(this.scene, x, y, texture, id, frame)

    this.displayList.add(sprite)
    this.updateList.add(sprite)

    this.scene.physics.world.enableBody(sprite, Phaser.Physics.Arcade.DYNAMIC_BODY)

    const collisionScale = [0.5, 0.2]
    sprite.body
      .setSize(sprite.width * collisionScale[0], sprite.height * collisionScale[1])
      .setOffset(
        sprite.width * (1 - collisionScale[0]) * 0.5,
        sprite.height * (1 - collisionScale[1])
      )

    return sprite
  }
)
