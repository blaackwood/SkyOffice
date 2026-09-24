import Phaser from 'phaser'
import Player from './Player'
import MyPlayer from './MyPlayer'
import { sittingShiftData } from './Player'
import WebRTC from '../web/WebRTC'
import { Event, phaserEvents } from '../events/EventCenter'

export default class OtherPlayer extends Player {
  private targetPosition: [number, number]
  private lastUpdateTimestamp?: number
  private connectionBufferTime = 0
  private connected = false
  private playContainerBody: Phaser.Physics.Arcade.Body
  private myPlayer?: MyPlayer
  private remoteSitAnimation?: string

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    name: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, id, frame)
    this.targetPosition = [x, y]

    this.playerName.setText(name)
    this.playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
  }

  makeCall(myPlayer: MyPlayer, webRTC: WebRTC, callAllowed = false) {
    this.myPlayer = myPlayer
    const myPlayerId = myPlayer.playerId
    if (!callAllowed) {
      // Tear down both directions as soon as the pair no longer shares an
      // allowed space. Otherwise an existing PeerJS stream keeps its last
      // video frame on screen even though the players have separated.
      if (this.connected || webRTC.hasPeerConnection(this.playerId)) {
        phaserEvents.emit(Event.PLAYER_DISCONNECTED, this.playerId)
      }
      this.connected = false
      this.connectionBufferTime = 0
      return
    }

    if (webRTC.hasPeerConnection(this.playerId)) {
      this.connected = true
      return
    }

    const shouldInitiate = myPlayer.playerId > this.playerId || !this.videoConnected
    if (
      shouldInitiate &&
      !this.connected &&
      this.connectionBufferTime >= 750 &&
      myPlayer.readyToConnect &&
      this.readyToConnect &&
      myPlayer.videoConnected &&
      myPlayerId !== this.playerId
    ) {
      webRTC.connectToNewUser(this.playerId)
      this.connected = true
      this.connectionBufferTime = 0
    }
  }

  updateOtherPlayer(field: string, value: number | string | boolean) {
    switch (field) {
      case 'name':
        if (typeof value === 'string') {
          this.playerName.setText(value)
        }
        break

      case 'x':
        if (typeof value === 'number') {
          this.targetPosition[0] = value
        }
        break

      case 'y':
        if (typeof value === 'number') {
          this.targetPosition[1] = value
        }
        break

      case 'anim':
        if (typeof value === 'string') {
          this.remoteSitAnimation = value.includes('_sit_') ? value : undefined
          this.anims.play(value, true)
        }
        break

      case 'readyToConnect':
        if (typeof value === 'boolean') {
          this.readyToConnect = value
        }
        break

      case 'videoConnected':
        if (typeof value === 'boolean') {
          this.videoConnected = value
        }
        break

      case 'cameraEnabled':
        if (typeof value === 'boolean') {
          this.cameraEnabled = value
        }
        break

      case 'microphoneEnabled':
        if (typeof value === 'boolean') this.setMicrophoneEnabled(value)
        break

      case 'status':
        if (value === 'active' || value === 'busy' || value === 'away') {
          this.setStatus(value)
        }
        break

      case 'tint':
        if (typeof value === 'number' && Number.isInteger(value)) this.setTint(value)
        break
    }
  }

  destroy(fromScene?: boolean) {
    this.playerContainer.destroy()

    super.destroy(fromScene)
  }

  /** preUpdate is called every frame for every game object. */
  preUpdate(t: number, dt: number) {
    super.preUpdate(t, dt)
    // Sit is a one-frame pose; keep it applied while the server reports that
    // this player is sitting so interpolation cannot make the pose look idle.
    if (this.remoteSitAnimation && this.anims.currentAnim?.key !== this.remoteSitAnimation) {
      this.anims.play(this.remoteSitAnimation, true)
    }

    // if Phaser has not updated the canvas (when the game tab is not active) for more than 1 sec
    // directly snap player to their current locations
    if (this.lastUpdateTimestamp && t - this.lastUpdateTimestamp > 750) {
      this.lastUpdateTimestamp = t
      this.x = this.targetPosition[0]
      this.y = this.targetPosition[1]
      this.playerContainer.x = this.targetPosition[0]
      this.playerContainer.y = this.targetPosition[1] - 30
      return
    }

    this.lastUpdateTimestamp = t
    this.setDepth(this.y) // change player.depth based on player.y
    const animParts = this.anims.currentAnim.key.split('_')
    const animState = animParts[1]
    if (animState === 'sit') {
      const animDir = animParts[2]
      const sittingShift = sittingShiftData[animDir]
      // Guard against a missing/malformed depth entry: falling back to 0
      // keeps this.depth a real number instead of NaN, which would otherwise
      // make Phaser's render-order sort for this sprite unstable.
      if (sittingShift && typeof sittingShift[2] === 'number') {
        // set hardcoded depth (differs between directions) if player sits down
        this.setDepth(this.depth + sittingShift[2])
      }
    }

    const speed = 200 // speed is in unit of pixels per second
    const delta = (speed / 1000) * dt // minimum distance that a player can move in a frame (dt is in unit of ms)
    let dx = this.targetPosition[0] - this.x
    let dy = this.targetPosition[1] - this.y

    // if the player is close enough to the target position, directly snap the player to that position
    if (Math.abs(dx) < delta) {
      this.x = this.targetPosition[0]
      this.playerContainer.x = this.targetPosition[0]
      dx = 0
    }
    if (Math.abs(dy) < delta) {
      this.y = this.targetPosition[1]
      this.playerContainer.y = this.targetPosition[1] - 30
      dy = 0
    }

    // if the player is still far from target position, impose a constant velocity towards it
    let vx = 0
    let vy = 0
    if (dx > 0) vx += speed
    else if (dx < 0) vx -= speed
    if (dy > 0) vy += speed
    else if (dy < 0) vy -= speed

    // update character velocity
    this.setVelocity(vx, vy)
    this.body.velocity.setLength(speed)
    // also update playerNameContainer velocity
    this.playContainerBody.setVelocity(vx, vy)
    this.playContainerBody.velocity.setLength(speed)

    // while currently connected with myPlayer
    // if myPlayer and the otherPlayer stop overlapping, delete video stream
    this.connectionBufferTime += dt
    if (
      this.connected &&
      !this.body.embedded &&
      Phaser.Math.Distance.Between(this.x, this.y, this.myPlayer!.x, this.myPlayer!.y) > 300 &&
      this.connectionBufferTime >= 750
    ) {
      phaserEvents.emit(Event.PLAYER_DISCONNECTED, this.playerId)
      this.connectionBufferTime = 0
      this.connected = false
    }
  }
}

declare global {
  namespace Phaser.GameObjects {
    interface GameObjectFactory {
      otherPlayer(
        x: number,
        y: number,
        texture: string,
        id: string,
        name: string,
        frame?: string | number
      ): OtherPlayer
    }
  }
}

Phaser.GameObjects.GameObjectFactory.register(
  'otherPlayer',
  function (
    this: Phaser.GameObjects.GameObjectFactory,
    x: number,
    y: number,
    texture: string,
    id: string,
    name: string,
    frame?: string | number
  ) {
    const sprite = new OtherPlayer(this.scene, x, y, texture, id, name, frame)

    this.displayList.add(sprite)
    this.updateList.add(sprite)

    this.scene.physics.world.enableBody(sprite, Phaser.Physics.Arcade.DYNAMIC_BODY)

    const collisionScale = [6, 4]
    sprite.body
      .setSize(sprite.width * collisionScale[0], sprite.height * collisionScale[1])
      .setOffset(
        sprite.width * (1 - collisionScale[0]) * 0.5,
        sprite.height * (1 - collisionScale[1]) * 0.5 + 17
      )

    return sprite
  }
)
