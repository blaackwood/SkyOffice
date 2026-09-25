import Phaser from 'phaser'

// import { debugDraw } from '../utils/debug'
import { createCharacterAnims } from '../anims/CharacterAnims'

import Item from '../items/Item'
import Chair from '../items/Chair'
import { sittingShiftData } from '../characters/Player'
import Computer from '../items/Computer'
import Whiteboard from '../items/Whiteboard'
import VendingMachine from '../items/VendingMachine'
import '../characters/MyPlayer'
import '../characters/OtherPlayer'
import MyPlayer from '../characters/MyPlayer'
import OtherPlayer from '../characters/OtherPlayer'
import PlayerSelector from '../characters/PlayerSelector'
import Network from '../services/Network'
import { loadSavedPlayerPosition } from '../services/PlayerPosition'
import type { SavedDeskDecoration } from '../services/DeskLayout'
import { IPlayer } from '../../../types/IOfficeState'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
import { ItemType } from '../../../types/Items'
import { DESK_SLOTS } from '../../../types/Desk'
import { DESK_DECORATION_ASSETS, type DeskDecorationAsset, type IDeskDecoration } from '../../../types/Desk'
import { fetchLiveStudySessions, type LiveStudySession } from '../services/RankEstudosLive'

import store from '../stores'
import { setFocused, setShowChat } from '../stores/ChatStore'
import { Event, phaserEvents } from '../events/EventCenter'
import type { MeetingRoomParticipant, MeetingRoomPresence } from '../events/EventCenter'
import { NavKeys, Keyboard } from '../../../types/KeyboardState'
import { loadRoomDoorLayout, ROOM_DOOR_LAYOUT_STORAGE_KEY, type RoomDoorPlacement } from '../services/RoomDoorLayout'

interface StudyDeskStation {
  slot: typeof DESK_SLOTS[number]
  chair: Chair
  glow: Phaser.GameObjects.Graphics
  lamp: Phaser.GameObjects.Graphics
  label: Phaser.GameObjects.Text
}

const normalizeStudyName = (name: string) => name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()

export default class Game extends Phaser.Scene {
  network!: Network
  private cursors!: NavKeys
  private keyR!: Phaser.Input.Keyboard.Key
  private map!: Phaser.Tilemaps.Tilemap
  private seatItems: Chair[] = []
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer
  myPlayer!: MyPlayer
  private playerSelector!: Phaser.GameObjects.Zone
  private otherPlayers!: Phaser.Physics.Arcade.Group
  private otherPlayerMap = new Map<string, OtherPlayer>()
  computerMap = new Map<string, Computer>()
  private whiteboardMap = new Map<string, Whiteboard>()
  private isCameraDragging = false
  private wasCameraDragging = false
  private isCameraDragPending = false
  private pointerOnOtherPlayer = false
  // Kept as a switch so click-to-walk can be re-enabled later without
  // deleting the existing movement implementation.
  private clickToWalkEnabled = false
  private isFollowingPlayer = false
  private dragStartX = 0
  private dragStartY = 0
  private cameraStartX = 0
  private cameraStartY = 0
  private deskEditorMode = false
  private draggingDeskDecoration = false
  private selectedDeskDecoration?: DeskDecorationAsset
  private deskCatalogDragInProgress = false
  private deskDecorationObjects = new Map<string, Phaser.GameObjects.Sprite | Phaser.GameObjects.Image>()
  private deskDecorationShadows = new Map<string, Phaser.GameObjects.Ellipse>()
  private deskDecorationOwners = new Map<string, string>()
  private selectedDeskDecorationId?: string
  private deskHoverLabel?: Phaser.GameObjects.Text
  private deskHoverLabelBackground?: Phaser.GameObjects.Graphics
  private deskHoverHighlight?: Phaser.GameObjects.Graphics
  private deskEditorTargetHighlight?: Phaser.GameObjects.Graphics
  private deskUndoStack: SavedDeskDecoration[][] = []
  private deskRedoStack: SavedDeskDecoration[][] = []
  private roomAreas: {
    id: string
    name: string
    isolateVoice: boolean
    focusOnEnter: boolean
    polygon: Phaser.Geom.Polygon
  }[] = []
  private roomDoors = new Map<string, {
    placement: RoomDoorPlacement
    frame: Phaser.GameObjects.Container
    swingLeaf?: Phaser.GameObjects.Container
    sideLeaf?: Phaser.GameObjects.Container
    blocker: Phaser.GameObjects.Zone
    lockMarker: Phaser.GameObjects.Graphics
    collider?: Phaser.Physics.Arcade.Collider
    openAngle: number
  }>()
  private roomHoverLabel!: HTMLDivElement
  private hoveredRoomAreaId?: string
  private hoveredRoomWorldPoint?: { x: number; y: number }
  private roomFocusMaskShape?: Phaser.GameObjects.Graphics
  private roomFocusMask?: Phaser.Display.Masks.GeometryMask
  private roomFocusOverlay?: Phaser.GameObjects.Rectangle
  private activeFocusAreaId?: string
  private lastMeetingPresenceSignature = 'uninitialized'
  private activeMeetingRoomId?: string
  private pendingMeetingChair?: Chair
  private studyDeskStations: StudyDeskStation[] = []
  private liveStudySessions: LiveStudySession[] = []
  private studyPresenceBadges = new Map<string, Phaser.GameObjects.Text>()
  private studyPresenceTimer?: number
  private lastStudyVisualUpdate = 0
  private studySessionPollInFlight = false

  constructor() {
    super('game')
  }

  registerKeys() {
    this.cursors = {
      ...this.input.keyboard.createCursorKeys(),
      ...(this.input.keyboard.addKeys('W,S,A,D') as Keyboard),
    }

    // maybe we can have a dedicated method for adding keys if more keys are needed in the future
    this.keyR = this.input.keyboard.addKey('R')
    this.input.keyboard.disableGlobalCapture()
    this.input.keyboard.on('keydown-ENTER', (event) => {
      store.dispatch(setShowChat(true))
      store.dispatch(setFocused(true))
    })
    this.input.keyboard.on('keydown-ESC', (event) => {
      store.dispatch(setShowChat(false))
    })
  }

  disableKeys() {
    this.input.keyboard.enabled = false
    this.resetMovementInput()
  }

  enableKeys() {
    this.resetMovementInput()
    this.input.keyboard.enabled = true
  }

  private resetMovementInput() {
    const keys = this.cursors ? Object.values(this.cursors) : []
    ;[...keys, this.keyR].forEach((key) => key?.reset())

    if (this.myPlayer?.body) this.myPlayer.setVelocity(0, 0)
    const playerContainerBody = this.myPlayer?.playerContainer.body as
      | Phaser.Physics.Arcade.Body
      | undefined
    playerContainerBody?.setVelocity(0, 0)

    if (this.myPlayer?.joystickMovement) {
      this.myPlayer.joystickMovement = {
        isMoving: false,
        direction: { left: false, right: false, up: false, down: false },
      }
    }
  }

  create(data: { network: Network }) {
    if (!data.network) {
      throw new Error('server instance missing')
    } else {
      this.network = data.network
    }

    createCharacterAnims(this.anims)

    this.map = this.make.tilemap({ key: 'tilemap' })

    const roomAreaData = this.cache.json.get('room_areas') as {
      areas?: {
        id?: string
        name?: string
        isolateVoice?: boolean
        focusOnEnter?: boolean
        polygon?: [number, number][]
      }[]
    }
    this.roomAreas = (roomAreaData?.areas ?? [])
      .filter((area) => (area.polygon?.length ?? 0) >= 3)
      .map((area, index) => ({
        id: area.id || `room-area-${index}`,
        name: area.name || `Cômodo ${index + 1}`,
        isolateVoice: !!area.isolateVoice,
        focusOnEnter: !!area.focusOnEnter,
        polygon: new Phaser.Geom.Polygon(area.polygon!.map(([x, y]) => new Phaser.Geom.Point(x, y))),
      }))
    phaserEvents.on(Event.MEETING_ROOM_LOCK_CHANGED, this.handleMeetingRoomLockChanged, this)
    phaserEvents.on(Event.MEETING_WALK_STARTED, this.handleMeetingWalkStarted, this)
    phaserEvents.on(Event.STUDY_SESSION_STARTED, this.handleStudySessionStarted, this)
    phaserEvents.on(Event.STUDY_SESSIONS_REFRESH, this.refreshLiveStudyMap, this)
    this.loadRoomDoors()
    window.addEventListener('storage', this.handleDoorLayoutStorage)

    // Use a dedicated 16 px collision grid so furniture edges don't leave
    // large gaps just because the visible Gather art is a single image.
    const collisionMap = this.make.tilemap({ key: 'collision_map' })
    const collisionTiles = collisionMap.addTilesetImage('Collision', 'collision_tile')
    const collisionLayer = collisionMap.createLayer('Collision', collisionTiles)
    collisionLayer.setCollisionByProperty({ collides: true })
    const seatMap = this.cache.json.get('seat_map') as {
      seats: { x: number; y: number; direction: string; shift?: [number, number]; stand?: [number, number]; visible?: string[] }[]
    }
    collisionLayer.setVisible(false)
    this.collisionLayer = collisionLayer

    // Render the exported Gather layout as one exact, unified floor plan.
    const mapWidth = 68 * 32
    const mapHeight = 53 * 32
    this.add.image(0, 0, 'gather_map').setOrigin(0, 0).setDepth(-1000)
    if (this.game.renderer.type === Phaser.WEBGL) {
      this.roomFocusMaskShape = this.make.graphics({ x: 0, y: 0, add: false })
      this.roomFocusMask = new Phaser.Display.Masks.GeometryMask(this, this.roomFocusMaskShape)
      this.roomFocusMask.setInvertAlpha(true)
      this.roomFocusOverlay = this.add
        .rectangle(mapWidth / 2, mapHeight / 2, mapWidth, mapHeight, 0x10141b, 0.7)
        .setDepth(50000)
        .setMask(this.roomFocusMask)
        .setVisible(false)
    }
    this.events.once('shutdown', () => {
      this.roomFocusOverlay?.clearMask(false)
      this.roomFocusOverlay?.destroy()
      this.roomFocusMask?.destroy()
      this.roomFocusMaskShape?.destroy()
      this.roomDoors.forEach(({ frame, blocker, collider }) => { collider?.destroy(); frame.destroy(); blocker.destroy() })
      this.roomDoors.clear()
      phaserEvents.off(Event.MEETING_ROOM_LOCK_CHANGED, this.handleMeetingRoomLockChanged, this)
      phaserEvents.off(Event.MEETING_WALK_STARTED, this.handleMeetingWalkStarted, this)
      phaserEvents.off(Event.STUDY_SESSION_STARTED, this.handleStudySessionStarted, this)
      phaserEvents.off(Event.STUDY_SESSIONS_REFRESH, this.refreshLiveStudyMap, this)
      if (this.studyPresenceTimer) window.clearInterval(this.studyPresenceTimer)
      this.studyPresenceTimer = undefined
      this.studyDeskStations.forEach(({ glow, lamp, label }) => { glow.destroy(); lamp.destroy(); label.destroy() })
      this.studyDeskStations = []
      this.studyPresenceBadges.forEach((badge) => badge.destroy())
      this.studyPresenceBadges.clear()
      this.roomFocusOverlay = undefined
      this.roomFocusMask = undefined
      this.roomFocusMaskShape = undefined
      this.activeFocusAreaId = undefined
      window.removeEventListener('storage', this.handleDoorLayoutStorage)
    })
    // Use a DOM tooltip tied directly to pointer events on the visible map canvas.
    // This keeps it reliably under the cursor even when the Phaser camera moves.
    const gameCanvas = this.game.canvas
    this.roomHoverLabel = document.createElement('div')
    Object.assign(this.roomHoverLabel.style, {
      position: 'fixed',
      // Keep map hover labels above the map but below the bottom bar and UI popovers.
      zIndex: '29',
      display: 'none',
      pointerEvents: 'none',
      transform: 'translateX(-50%)',
      padding: '4px 8px',
      borderRadius: '5px',
      background: 'rgba(25, 29, 39, 0.94)',
      color: '#fff',
      font: '600 13px Arial, sans-serif',
      whiteSpace: 'nowrap',
      boxShadow: '0 1px 3px rgba(0,0,0,.35)',
    })
    document.body.appendChild(this.roomHoverLabel)
    const handleMapPointerUp = (event: PointerEvent) => {
      // Phaser's object hit test handles avatar clicks. Don't also treat that
      // same pointer release as a walk command on the floor.
      if (this.pointerOnOtherPlayer) {
        this.pointerOnOtherPlayer = false
        return
      }
      if (event.button !== 0 || this.deskEditorMode || this.isCameraDragging || this.wasCameraDragging) return
      // Clicking the map to walk is temporarily disabled. Keyboard movement,
      // meeting actions and the existing walkToPosition implementation remain.
      if (!this.clickToWalkEnabled) return
      const rect = gameCanvas.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const screenX = ((event.clientX - rect.left) / rect.width) * this.scale.width
      const screenY = ((event.clientY - rect.top) / rect.height) * this.scale.height
      if (screenX < 0 || screenY < 0 || screenX >= this.scale.width || screenY >= this.scale.height) return
      const destination = this.cameras.main.getWorldPoint(screenX, screenY)
      if (this.deskHoverLabel?.visible && this.deskHoverLabel.getBounds().contains(destination.x, destination.y)) return
      if (!store.getState().user.loggedIn || store.getState().chat.focused) return
      this.walkToPosition(destination.x, destination.y)
    }
    // Capture before Phaser and other canvas listeners process the same click,
    // so selecting an avatar cannot also trigger map movement.
    gameCanvas.addEventListener('pointerup', handleMapPointerUp, true)
    const updateRoomHover = (event: PointerEvent) => {
      if (document.body.classList.contains('meeting-fullscreen')) {
        this.roomHoverLabel.style.display = 'none'
        this.hoveredRoomAreaId = undefined
        this.hoveredRoomWorldPoint = undefined
        return
      }
      const rect = gameCanvas.getBoundingClientRect()
      const screenX = event.clientX - rect.left
      const screenY = event.clientY - rect.top
      const target = event.target
      const isUiControl = target instanceof Element && !!target.closest('button, input, textarea, select, [role="button"], .skyoffice-desk-editor')
      if (isUiControl || screenX < 0 || screenY < 0 || screenX >= rect.width || screenY >= rect.height) {
        this.roomHoverLabel.style.display = 'none'
        return
      }
      const worldPoint = this.cameras.main.getWorldPoint(
        screenX * (this.scale.width / rect.width),
        screenY * (this.scale.height / rect.height)
      )
      const area = this.roomAreaAt(worldPoint.x, worldPoint.y)
      if (!area) {
        this.hoveredRoomAreaId = undefined
        this.hoveredRoomWorldPoint = undefined
        this.roomHoverLabel.style.display = 'none'
        return
      }
      this.hoveredRoomAreaId = area.id
      this.hoveredRoomWorldPoint = worldPoint
      this.roomHoverLabel.textContent = this.roomAreaDisplayName(area, worldPoint.x, worldPoint.y)
      this.roomHoverLabel.style.left = `${event.clientX}px`
      this.roomHoverLabel.style.top = `${event.clientY + 14}px`
      this.roomHoverLabel.style.display = 'block'
    }
    const hideRoomHover = () => {
      this.roomHoverLabel.style.display = 'none'
    }
    // Listen in the capture phase on window so UI overlays cannot swallow the hover.
    window.addEventListener('pointermove', updateRoomHover, true)
    gameCanvas.addEventListener('pointerleave', hideRoomHover)
    this.events.once('shutdown', () => {
      window.removeEventListener('pointermove', updateRoomHover, true)
      gameCanvas.removeEventListener('pointerup', handleMapPointerUp, true)
      gameCanvas.removeEventListener('pointerleave', hideRoomHover)
      this.hoveredRoomAreaId = undefined
      this.hoveredRoomWorldPoint = undefined
      this.roomHoverLabel.remove()
    })
    this.physics.world.setBounds(0, 0, mapWidth, mapHeight)
    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight)

    const playerName = store.getState().user.myPlayerName || sessionStorage.getItem('skyoffice.pendingPlayerName') || ''
    const savedPosition = loadSavedPlayerPosition(playerName, mapWidth, mapHeight)
    const spawn = savedPosition
      ? this.findWalkableSpawnNear(savedPosition.x, savedPosition.y, mapWidth, mapHeight)
      : undefined
    const spawnX = spawn?.x ?? 1088
    const spawnY = spawn?.y ?? 1024
    this.myPlayer = this.add.myPlayer(spawnX, spawnY, 'adam', this.network.mySessionId)
    this.myPlayer.setCollideWorldBounds(true)
    ;(this.myPlayer.playerContainer.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true)
    this.playerSelector = new PlayerSelector(this, 0, 0, 16, 16)
    this.myPlayer.standFinder = (chair) => this.findStandSpot(chair)
    const savePlayerPosition = () => this.network.saveLastPlayerPosition(this.myPlayer.x, this.myPlayer.y)
    window.addEventListener('pagehide', savePlayerPosition)
    this.events.once('shutdown', () => window.removeEventListener('pagehide', savePlayerPosition))
    this.roomDoors.forEach((door) => {
      door.collider = this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], door.blocker)
    })

    // The player sprite is the authoritative moving body. Keep the name-tag
    // container colliding with the same grid so it cannot drift through walls
    // while the avatar is blocked. Seat tiles are deliberately open in the
    // collision map, so this does not keep the player outside a chair.
    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], collisionLayer)

    // import chair objects from Tiled map to Phaser
    const chairs = this.physics.add.staticGroup({ classType: Chair })
    // Seats come from seat-map.json: x/y = seat centre in map pixels, direction = facing.
    // Optional per-seat "shift" [x, y] (avatar offset from the seat point) and "stand" override the defaults.
    const chairFrame = this.map.getObjectLayer('Chair').objects[0].gid! - this.map.getTileset('chair').firstgid
    seatMap.seats.forEach((seat) => {
      const item = chairs.get(seat.x, seat.y, 'chairs', chairFrame).setDepth(seat.y) as Chair
      const d = seat.direction
      item.itemDirection = d === 'up' || d === 'down' || d === 'left' || d === 'right' ? d : 'down'
      item.sitShift = seat.shift
      item.standShift = seat.stand
      item.setVisible(false)
      if (seat.visible?.length === 48) {
        const shift = seat.shift ?? sittingShiftData[item.itemDirection as 'up' | 'down' | 'left' | 'right']
        const shape = this.add.graphics().setPosition(seat.x + shift[0], seat.y + shift[1]).setVisible(false)
        shape.fillStyle(0xffffff, 1)
        seat.visible.forEach((row, y) => {
          let start = -1
          for (let x = 0; x <= 32; x++) {
            const on = x < 32 && row[x] !== '0'
            if (on && start < 0) start = x
            if (!on && start >= 0) { shape.fillRect(start - 16, y - 24, x - start, 1); start = -1 }
          }
        })
        item.playerMaskShape = shape
        item.playerMask = shape.createGeometryMask()
      }

      this.seatItems.push(item)
    })

    this.createStudyDeskStations()
    void this.refreshLiveStudyMap()
    this.studyPresenceTimer = window.setInterval(() => { void this.refreshLiveStudyMap() }, 15000)

    // Debug: open the game with ?debugSeats in the URL (e.g. http://localhost:5173/?debugSeats)
    // to see every seat's index in seat-map.json (white label), the seat point (red dot) and
    // where the avatar's centre will be drawn when seated (blue dot).
    if (new URLSearchParams(window.location.search).has('debugSeats')) {
      seatMap.seats.forEach((seat, i) => {
        const shift = seat.shift ?? sittingShiftData[seat.direction as 'up' | 'down' | 'left' | 'right'] ?? [0, 0]
        this.add.circle(seat.x, seat.y, 2, 0xff0000).setDepth(6000)
        this.add.circle(seat.x + shift[0], seat.y + shift[1], 2, 0x3399ff).setDepth(6000)
        this.add
          .text(seat.x + 4, seat.y - 6, `${i}`, {
            fontFamily: 'Arial',
            fontSize: '10px',
            color: '#ffffff',
            backgroundColor: 'rgba(0,0,0,0.75)',
          })
          .setDepth(6000)
      })
    }

    // import computers objects from Tiled map to Phaser
    const computers = this.physics.add.staticGroup({ classType: Computer })
    const computerLayer = this.map.getObjectLayer('Computer')
    computerLayer.objects.forEach((obj, i) => {
      const item = this.addObjectFromTiled(computers, obj, 'computers', 'computer') as Computer
      item.setDepth(item.y + item.height * 0.27)
      // Desks begin bare; the owner can add a computer from the decorator catalog.
      item.setVisible(false)
      item.body.enable = false
      const id = `${i}`
      item.id = id
      this.computerMap.set(id, item)
    })

    // import whiteboards objects from Tiled map to Phaser
    const whiteboards = this.physics.add.staticGroup({ classType: Whiteboard })
    const whiteboardLayer = this.map.getObjectLayer('Whiteboard')
    whiteboardLayer.objects.forEach((obj, i) => {
      const item = this.addObjectFromTiled(
        whiteboards,
        obj,
        'whiteboards',
        'whiteboard'
      ) as Whiteboard
      const id = `${i}`
      item.id = id
      this.whiteboardMap.set(id, item)
    })

    // import vending machine objects from Tiled map to Phaser
    const vendingMachines = this.physics.add.staticGroup({ classType: VendingMachine })
    const vendingMachineLayer = this.map.getObjectLayer('VendingMachine')
    vendingMachineLayer.objects.forEach((obj, i) => {
      this.addObjectFromTiled(vendingMachines, obj, 'vendingmachines', 'vendingmachine')
    })

    // import other objects from Tiled map to Phaser
    // The flattened Gather artwork contains the visible furniture already.

    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer })

    // Start with the map covering the viewport so the decorative cloud backdrop
    // cannot peek around the office. This uses a cover fit, not a contain fit.
    const coverZoom = Math.max(this.scale.width / mapWidth, this.scale.height / mapHeight) * 1.02
    this.cameras.main.zoom = Phaser.Math.Clamp(coverZoom, 0.1, 3)
    this.cameras.main.startFollow(this.myPlayer, true)
    this.isFollowingPlayer = true

    // allow zooming in/out with the mouse scroll wheel (listening on window so
    // it still works even if the pointer is over a UI element on top of the canvas)
    const handleWheelZoom = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('.skyoffice-desk-editor')) return
      const newZoom = this.cameras.main.zoom - event.deltaY * 0.001
      this.cameras.main.zoom = Phaser.Math.Clamp(newZoom, 0.1, 3)
    }
    window.addEventListener('wheel', handleWheelZoom, { passive: true })
    this.events.once('shutdown', () => {
      window.removeEventListener('wheel', handleWheelZoom)
    })

    // A short left click walks; dragging with the left button pans the camera.
    const handleMouseDown = (event: PointerEvent) => {
      const rect = gameCanvas.getBoundingClientRect()
      const isOverCanvas = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom
      // Start panning only when the gesture begins on the actual map canvas.
      // The full-screen chat and other overlays can cover the map's rectangle;
      // clicks in those panels must never start a hidden camera drag.
      if (!isOverCanvas || event.target !== gameCanvas) return
      if (event.button === 0) {
        this.isCameraDragPending = true
        this.isCameraDragging = false
        this.dragStartX = event.clientX
        this.dragStartY = event.clientY
        this.cameraStartX = this.cameras.main.scrollX
        this.cameraStartY = this.cameras.main.scrollY
      } else if (event.button === 1 || event.button === 2) {
        this.isCameraDragPending = false
        this.isCameraDragging = true
        this.dragStartX = event.clientX
        this.dragStartY = event.clientY
        this.cameraStartX = this.cameras.main.scrollX
        this.cameraStartY = this.cameras.main.scrollY
        this.cameras.main.stopFollow()
        this.isFollowingPlayer = false
      }
    }
    const handleMouseMove = (event: PointerEvent) => {
      if (this.pointerOnOtherPlayer) return
      if (this.isCameraDragPending && !(event.buttons & 1)) {
        this.isCameraDragPending = false
        return
      }
      if (this.isCameraDragPending && Math.hypot(event.clientX - this.dragStartX, event.clientY - this.dragStartY) > 6) {
        this.isCameraDragPending = false
        this.isCameraDragging = true
        this.cameras.main.stopFollow()
        this.isFollowingPlayer = false
      }
      if (this.isCameraDragging) {
        const dx = (event.clientX - this.dragStartX) / this.cameras.main.zoom
        const dy = (event.clientY - this.dragStartY) / this.cameras.main.zoom
        this.cameras.main.scrollX = this.cameraStartX - dx
        this.cameras.main.scrollY = this.cameraStartY - dy
      }
    }
    const handleMouseUp = () => {
      this.wasCameraDragging = this.isCameraDragging
      this.isCameraDragPending = false
      this.isCameraDragging = false
      window.setTimeout(() => { this.wasCameraDragging = false }, 0)
    }
    const preventEditorContextMenu = (event: MouseEvent) => {
      if (this.deskEditorMode) event.preventDefault()
    }
    const handleWindowBlur = () => {
      this.resetMovementInput()
      handleMouseUp()
    }
    window.addEventListener('pointerdown', handleMouseDown, true)
    window.addEventListener('pointermove', handleMouseMove, true)
    // Capture phase guarantees drag state is cleared even if an overlay handles
    // or stops propagation for the pointer release.
    window.addEventListener('pointerup', handleMouseUp, true)
    window.addEventListener('pointercancel', handleMouseUp, true)
    window.addEventListener('blur', handleWindowBlur)
    window.addEventListener('contextmenu', preventEditorContextMenu)
    this.events.once('shutdown', () => {
      window.removeEventListener('pointerdown', handleMouseDown, true)
      window.removeEventListener('pointermove', handleMouseMove, true)
      window.removeEventListener('pointerup', handleMouseUp, true)
      window.removeEventListener('pointercancel', handleMouseUp, true)
      window.removeEventListener('blur', handleWindowBlur)
      window.removeEventListener('contextmenu', preventEditorContextMenu)
    })

    this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], vendingMachines)

    this.physics.add.overlap(
      this.playerSelector,
      [computers, whiteboards, vendingMachines],
      this.handleItemSelectorOverlap,
      undefined,
      this
    )

    // register network event listeners
    this.network.onPlayerJoined(this.handlePlayerJoined, this)
    this.network.onPlayerLeft(this.handlePlayerLeft, this)
    this.network.onMyPlayerReady(this.handleMyPlayerReady, this)
    this.network.onMyPlayerVideoConnected(this.handleMyVideoConnected, this)
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this)
    this.network.onPlayerVoiceActivity(this.handlePlayerVoiceActivity, this)
    this.network.onItemUserAdded(this.handleItemUserAdded, this)
    this.network.onItemUserRemoved(this.handleItemUserRemoved, this)
    this.network.onChatMessageAdded(this.handleChatMessageAdded, this)
    this.network.onDeskDecorationUpdated(this.handleDeskDecorationUpdated, this)
    this.network.onDeskDecorationRemoved(this.handleDeskDecorationRemoved, this)

    phaserEvents.on(Event.DESK_EDITOR_MODE, this.setDeskEditorMode, this)
    phaserEvents.on(Event.DESK_EDITOR_SELECT, this.setSelectedDeskDecoration, this)
    phaserEvents.on(Event.DESK_UNDO, this.undoDeskLayout, this)
    phaserEvents.on(Event.DESK_REDO, this.redoDeskLayout, this)
    this.events.once('shutdown', () => {
      phaserEvents.off(Event.DESK_EDITOR_MODE, this.setDeskEditorMode, this)
      phaserEvents.off(Event.DESK_EDITOR_SELECT, this.setSelectedDeskDecoration, this)
      phaserEvents.off(Event.DESK_UNDO, this.undoDeskLayout, this)
      phaserEvents.off(Event.DESK_REDO, this.redoDeskLayout, this)
      phaserEvents.off(Event.DESK_DECORATION_UPDATED, this.handleDeskDecorationUpdated, this)
      phaserEvents.off(Event.DESK_DECORATION_REMOVED, this.handleDeskDecorationRemoved, this)
    })

    this.createDeskHoverZones()
    const placeDeskDecorationOnPointerUp = (event: PointerEvent) => this.handleDeskEditorPlacement(event)
    const beginDeskDecorationDrag = (event: DragEvent) => {
      const isCatalogItem = event.dataTransfer && Array.from(event.dataTransfer.types).includes('application/x-skyoffice-desk-item')
      const startedInCatalog = event.target instanceof Element && Boolean(event.target.closest('.skyoffice-desk-editor .item'))
      if (isCatalogItem || (this.deskEditorMode && startedInCatalog)) {
        this.deskCatalogDragInProgress = true
      }
    }
    const allowDeskDecorationDrop = (event: DragEvent) => {
      if (event.target !== this.game.canvas || !event.dataTransfer || !Array.from(event.dataTransfer.types).includes('application/x-skyoffice-desk-item')) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
    }
    const dropDeskDecoration = (event: DragEvent) => this.handleDeskDecorationDrop(event)
    const endDeskDecorationDrag = () => {
      window.setTimeout(() => { this.deskCatalogDragInProgress = false }, 0)
    }
    const cancelDeskDecorationDrag = () => {
      this.deskCatalogDragInProgress = false
      this.draggingDeskDecoration = false
    }
    window.addEventListener('pointerup', placeDeskDecorationOnPointerUp, true)
    window.addEventListener('dragstart', beginDeskDecorationDrag, true)
    window.addEventListener('dragover', allowDeskDecorationDrop, true)
    window.addEventListener('drop', dropDeskDecoration, true)
    window.addEventListener('dragend', endDeskDecorationDrag, true)
    window.addEventListener('pointercancel', cancelDeskDecorationDrag, true)
    this.input.keyboard?.on('keydown-DELETE', this.deleteSelectedDeskDecoration, this)
    this.input.keyboard?.on('keydown-BACKSPACE', this.deleteSelectedDeskDecoration, this)
    this.events.once('shutdown', () => {
      window.removeEventListener('pointerup', placeDeskDecorationOnPointerUp, true)
      window.removeEventListener('dragstart', beginDeskDecorationDrag, true)
      window.removeEventListener('dragover', allowDeskDecorationDrop, true)
      window.removeEventListener('drop', dropDeskDecoration, true)
      window.removeEventListener('dragend', endDeskDecorationDrag, true)
      window.removeEventListener('pointercancel', cancelDeskDecorationDrag, true)
      this.input.keyboard?.off('keydown-DELETE', this.deleteSelectedDeskDecoration, this)
      this.input.keyboard?.off('keydown-BACKSPACE', this.deleteSelectedDeskDecoration, this)
      this.deskDecorationObjects.forEach((object) => object.destroy())
      this.deskDecorationObjects.clear()
      this.deskDecorationShadows.forEach((shadow) => shadow.destroy())
      this.deskDecorationShadows.clear()
    })
  }

  private setDeskEditorMode(enabled: boolean) {
    this.deskEditorMode = enabled
    if (this.myPlayer) {
      // Keep the editor's avatar out of the way while retaining a faint position cue.
      this.myPlayer.setAlpha(enabled ? 0.18 : 1)
      this.myPlayer.playerContainer.setVisible(!enabled)
    }
    this.deskDecorationObjects.forEach((object, id) => {
      if (this.deskDecorationOwners.get(id) === this.currentOwnerName()) this.input.setDraggable(object, enabled)
    })
    if (!enabled) {
      this.selectedDeskDecoration = undefined
      this.selectedDeskDecorationId = undefined
      this.deskEditorTargetHighlight?.setVisible(false)
    } else {
      this.updateDeskEditorTargetHighlight()
    }
  }

  private setSelectedDeskDecoration(asset?: DeskDecorationAsset) {
    this.selectedDeskDecoration = asset
    this.updateDeskEditorTargetHighlight()
  }

  private updateDeskEditorTargetHighlight() {
    const highlight = this.deskEditorTargetHighlight
    const slot = DESK_SLOTS[this.currentDeskIndex()]
    if (!highlight || !this.deskEditorMode || !this.selectedDeskDecoration || !slot) {
      highlight?.setVisible(false)
      return
    }
    highlight.clear()
      .fillStyle(0x6eb6ff, 0.14)
      .fillRoundedRect(slot.x - slot.width / 2 - 5, slot.y - slot.height / 2 - 5, slot.width + 10, slot.height + 10, 6)
      .lineStyle(2, 0x9ed1ff, 0.9)
      .strokeRoundedRect(slot.x - slot.width / 2 - 5, slot.y - slot.height / 2 - 5, slot.width + 10, slot.height + 10, 6)
      .setVisible(true)
  }

  private currentDeskIndex() {
    return this.network.roomState?.players.get(this.network.mySessionId)?.deskIndex ?? -1
  }

  private createStudyDeskStations() {
    const unusedSeats = new Set(this.seatItems)
    DESK_SLOTS.forEach((slot) => {
      const chair = [...unusedSeats]
        .map((seat) => ({ seat, distance: Phaser.Math.Distance.Between(seat.x, seat.y, slot.x, slot.y) }))
        .sort((a, b) => a.distance - b.distance)
        .find(({ distance }) => distance <= 36)?.seat
      if (!chair) return
      unusedSeats.delete(chair)

      const glow = this.add.graphics().setPosition(slot.x, slot.y - 8).setDepth(slot.y + 24).setVisible(false)
      glow.fillStyle(0xffd66e, 0.12)
      glow.fillCircle(0, 0, 27)
      glow.fillStyle(0xffd66e, 0.11)
      glow.fillCircle(0, 0, 17)

      const lamp = this.add.graphics().setPosition(slot.x, slot.y - 8).setDepth(slot.y + 25).setVisible(false)
      lamp.fillStyle(0xffdf83, 1)
      lamp.fillTriangle(-9, -12, 9, -12, 0, -21)
      lamp.fillRoundedRect(-2, -12, 4, 10, 1)
      lamp.fillRoundedRect(-7, -3, 14, 3, 1)
      lamp.fillStyle(0xfff3c2, 1)
      lamp.fillCircle(0, -11, 2)

      const label = this.add.text(slot.x, slot.y - 31, '', {
        fontFamily: 'Arial', fontSize: '9px', fontStyle: 'bold', color: '#ffe39b',
        backgroundColor: '#29251c', padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 1).setDepth(slot.y + 26).setVisible(false)
      this.studyDeskStations.push({ slot, chair, glow, lamp, label })
    })
  }

  private async refreshLiveStudyMap() {
    if (this.studySessionPollInFlight || !this.scene.isActive()) return
    this.studySessionPollInFlight = true
    try {
      this.liveStudySessions = await fetchLiveStudySessions()
      this.updateLiveStudyVisuals()
    } catch (error) {
      // A brief RankEstudos outage should not interfere with movement or the map.
      console.warn('Could not refresh live study map markers', error)
    } finally {
      this.studySessionPollInFlight = false
    }
  }

  private getOnlineStudyPlayers() {
    const players: Array<{ id: string; name: string; x: number; y: number; seated: boolean; container: Phaser.GameObjects.Container }> = []
    if (this.myPlayer?.playerName.text.trim()) {
      players.push({
        id: this.network.mySessionId,
        name: this.myPlayer.playerName.text.trim(),
        x: this.myPlayer.x,
        y: this.myPlayer.y,
        seated: this.myPlayer.playerBehavior === PlayerBehavior.SITTING,
        container: this.myPlayer.playerContainer,
      })
    }
    this.otherPlayerMap.forEach((player, id) => {
      const name = player.playerName.text.trim()
      if (!name) return
      players.push({ id, name, x: player.x, y: player.y, seated: player.anims.currentAnim?.key.includes('_sit_') ?? false, container: player.playerContainer })
    })
    return players
  }

  private updateLiveStudyVisuals() {
    const onlinePlayers = this.getOnlineStudyPlayers()
    const sessionByName = new Map<string, LiveStudySession>()
    this.liveStudySessions.forEach((session) => {
      const key = normalizeStudyName(session.name)
      const existing = sessionByName.get(key)
      if (!existing || session.runningSince > existing.runningSince) sessionByName.set(key, session)
    })

    const seatedStudyers = new Set<string>()
    this.studyDeskStations.forEach((station) => {
      const occupant = onlinePlayers.find((player) => player.seated &&
        Phaser.Math.Distance.Between(player.x, player.y, station.chair.x, station.chair.y) <= 28 &&
        sessionByName.has(normalizeStudyName(player.name)))
      const session = occupant ? sessionByName.get(normalizeStudyName(occupant.name)) : undefined
      const isPaused = Boolean(session && (session.pausedAt > 0 || !session.runningSince))
      station.glow.setVisible(Boolean(session)).setAlpha(isPaused ? 0.38 : 0.95)
      station.lamp.setVisible(Boolean(session)).setAlpha(isPaused ? 0.55 : 1)
      station.label.setVisible(Boolean(session)).setAlpha(isPaused ? 0.55 : 1)
      if (session && occupant) {
        station.label.setText(session.name)
        seatedStudyers.add(occupant.id)
      }
    })

    const presentStudyIds = new Set<string>()
    onlinePlayers.forEach((player) => {
      const session = sessionByName.get(normalizeStudyName(player.name))
      if (!session || seatedStudyers.has(player.id)) return
      presentStudyIds.add(player.id)
      let badge = this.studyPresenceBadges.get(player.id)
      if (!badge || !badge.active) {
        badge = this.add.text(0, -29, '', {
          fontFamily: 'Arial', fontSize: '10px', fontStyle: 'bold', color: '#ffe39b',
          backgroundColor: '#29251c', padding: { x: 5, y: 3 },
        }).setOrigin(0.5, 1)
        player.container.add(badge)
        this.studyPresenceBadges.set(player.id, badge)
      }
      const isPaused = Boolean(session.pausedAt > 0 || !session.runningSince)
      badge.setText(isPaused ? '◷ Pausado' : '✦ Estudando')
        .setColor(isPaused ? '#d2b783' : '#ffe39b')
        .setPosition(0, -29)
        .setVisible(true)
    })
    this.studyPresenceBadges.forEach((badge, id) => {
      if (!presentStudyIds.has(id)) badge.setVisible(false)
    })
  }

  private handleStudySessionStarted(playerName: string) {
    if (normalizeStudyName(playerName) !== normalizeStudyName(this.myPlayer?.playerName.text || '')) return
    void (async () => {
      await this.refreshLiveStudyMap()
      if (!this.myPlayer) return
      const alreadyAtStudyDesk = this.studyDeskStations.some((station) =>
        Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, station.chair.x, station.chair.y) <= 28 &&
        this.myPlayer.playerBehavior === PlayerBehavior.SITTING)
      if (alreadyAtStudyDesk) return

      const onlineNames = new Set(this.getOnlineStudyPlayers().map((player) => normalizeStudyName(player.name)))
      const activeOnlineSessions = this.liveStudySessions
        .filter((session) => onlineNames.has(normalizeStudyName(session.name)))
        .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))
      const ownIndex = Math.max(0, activeOnlineSessions.findIndex((session) => normalizeStudyName(session.name) === normalizeStudyName(playerName)))
      const ownedIndex = this.currentDeskIndex()
      const preferred = ownedIndex >= 0
        ? this.studyDeskStations.find((station) => DESK_SLOTS.indexOf(station.slot) === ownedIndex)
        : this.studyDeskStations[ownIndex % Math.max(1, this.studyDeskStations.length)]

      const occupied = (chair: Chair) => this.getOnlineStudyPlayers().some((player) =>
        player.id !== this.network.mySessionId && Phaser.Math.Distance.Between(player.x, player.y, chair.x, chair.y) <= 23)
      const candidates = preferred
        ? [preferred, ...this.studyDeskStations.filter((station) => station !== preferred)]
        : this.studyDeskStations
      const station = candidates.find((candidate) => !occupied(candidate.chair))
      if (station) this.walkToPosition(station.chair.x, station.chair.y, 18)
    })()
  }

  private findWalkableSpawnNear(
    x: number,
    y: number,
    mapWidth: number,
    mapHeight: number
  ): { x: number; y: number } | undefined {
    const isWalkable = (candidateX: number, candidateY: number) => {
      if (candidateX < 12 || candidateY < 12 || candidateX > mapWidth - 12 || candidateY > mapHeight - 12) return false
      const bodyChecks: Array<[number, number]> = [[0, 0], [-8, 0], [8, 0], [0, -8], [0, 8]]
      return bodyChecks.every(([offsetX, offsetY]) => {
        const tile = this.collisionLayer.getTileAtWorldXY(candidateX + offsetX, candidateY + offsetY, true)
        return !tile?.collides
      })
    }

    const step = 16
    for (let radius = 0; radius <= 96; radius += step) {
      for (let offsetY = -radius; offsetY <= radius; offsetY += step) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += step) {
          if (radius > 0 && Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) continue
          const candidateX = x + offsetX
          const candidateY = y + offsetY
          if (isWalkable(candidateX, candidateY)) return { x: candidateX, y: candidateY }
        }
      }
    }
    return undefined
  }

  adjustCameraZoom(amount: number) {
    this.cameras.main.zoom = Phaser.Math.Clamp(this.cameras.main.zoom + amount, 0.1, 3)
  }

  focusOnOwnedDesk() {
    const slot = DESK_SLOTS[this.currentDeskIndex()]
    if (!slot) return false
    this.cameras.main.stopFollow()
    this.isFollowingPlayer = false
    this.cameras.main.zoom = Math.max(this.cameras.main.zoom, 1)
    this.cameras.main.centerOn(slot.x, slot.y)
    return true
  }

  walkToOwnedDesk() {
    const slot = DESK_SLOTS[this.currentDeskIndex()]
    if (!slot || !this.myPlayer) return false
    const chair = this.seatItems.reduce<Chair | undefined>((closest, seat) => {
      if (!closest) return seat
      return Phaser.Math.Distance.Between(seat.x, seat.y, slot.x, slot.y) <
        Phaser.Math.Distance.Between(closest.x, closest.y, slot.x, slot.y) ? seat : closest
    }, undefined)
    if (!chair) return false

    return this.walkToPosition(chair.x, chair.y, 18)
  }

  walkToPlayer(playerId: string) {
    const target = this.otherPlayerMap.get(playerId)
    if (!target || !this.myPlayer) return false
    return this.walkToPosition(target.x, target.y, 32)
  }

  private handleMeetingWalkStarted(roomId: string, seatIndex: number) {
    const room = this.roomAreas.find((area) => area.id === roomId && this.isMeetingRoomArea(area.name))
    if (!room || this.network.isMeetingRoomLocked(roomId)) return
    const seats = this.seatItems
      .filter((seat) => Phaser.Geom.Polygon.Contains(room.polygon, seat.x, seat.y))
      .sort((a, b) => a.y - b.y || a.x - b.x)
    const chair = seats[seatIndex]
    if (!chair) return
    this.pendingMeetingChair = chair
    if (!this.walkToPosition(chair.x, chair.y, 8)) this.pendingMeetingChair = undefined
  }

  private walkToPosition(targetX: number, targetY: number, targetRadius = 10) {
    if (!this.myPlayer || targetX < 0 || targetY < 0 || targetX >= 2176 || targetY >= 1696) return false
    const columns = 2176 / 16
    const rows = 1696 / 16
    const [walkStartX, walkStartY] = this.myPlayer.getAutoWalkStartPosition()
    const startX = Phaser.Math.Clamp(Math.floor(walkStartX / 16), 0, columns - 1)
    const startY = Phaser.Math.Clamp(Math.floor(walkStartY / 16), 0, rows - 1)
    const start = startY * columns + startX
    const parents = new Map<number, number>([[start, -1]])
    const queue = [start]
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]] as const
    let target = -1
    let nearest = start
    let nearestDistance = Phaser.Math.Distance.Between(startX * 16 + 8, startY * 16 + 8, targetX, targetY)

    for (let head = 0; head < queue.length; head++) {
      const current = queue[head]
      const x = current % columns
      const y = Math.floor(current / columns)
      const worldX = x * 16 + 8
      const worldY = y * 16 + 8
      const distance = Phaser.Math.Distance.Between(worldX, worldY, targetX, targetY)
      if (distance < nearestDistance && this.isBodyFree(worldX, worldY)) {
        nearest = current
        nearestDistance = distance
      }
      if (distance <= targetRadius && this.isBodyFree(worldX, worldY)) {
        target = current
        break
      }

      for (const [dx, dy] of directions) {
        const nextX = x + dx
        const nextY = y + dy
        if (nextX < 0 || nextY < 0 || nextX >= columns || nextY >= rows) continue
        const next = nextY * columns + nextX
        if (parents.has(next)) continue
        const nextWorldX = nextX * 16 + 8
        const nextWorldY = nextY * 16 + 8
        if (!this.isBodyFree(nextWorldX, nextWorldY)) continue
        parents.set(next, current)
        queue.push(next)
      }
    }

    if (target < 0) target = nearest
    if (target === start && nearestDistance > targetRadius) return false
    const reversedPath: [number, number][] = []
    for (let step = target; step !== start; step = parents.get(step) ?? -1) {
      if (step < 0) return false
      reversedPath.push([(step % columns) * 16 + 8, Math.floor(step / columns) * 16 + 8])
    }
    const path = reversedPath.reverse()
    const startCenter: [number, number] = [startX * 16 + 8, startY * 16 + 8]
    if (Phaser.Math.Distance.Between(walkStartX, walkStartY, startCenter[0], startCenter[1]) > 2) path.unshift(startCenter)
    this.myPlayer.walkAlongPath(path)
    this.cameras.main.startFollow(this.myPlayer, true)
    this.isFollowingPlayer = true
    return true
  }

  private createDeskHoverZones() {
    this.deskHoverHighlight = this.add.graphics().setDepth(11998).setVisible(false)
    this.deskEditorTargetHighlight = this.add.graphics().setDepth(11997).setVisible(false)
    this.deskHoverLabelBackground = this.add.graphics().setDepth(11999).setVisible(false)
    this.deskHoverLabel = this.add
      .text(0, 0, '', {
        fontFamily: 'Arial',
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#272a33',
        padding: { left: 9, right: 9, top: 6, bottom: 6 },
      })
      .setOrigin(0.5)
      .setDepth(12000)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })

    this.deskHoverLabel.on('pointerdown', () => {
      const index = Number(this.deskHoverLabel?.getData('deskIndex'))
      const desk = this.network.roomState?.desks.get(String(index))
      if (!Number.isInteger(index)) return
      if (desk?.ownerName) return
      this.network.claimDesk(index)
      this.hideDeskHoverLabel()
      phaserEvents.emit(Event.DESK_CLAIMED, index)
    })
    this.deskHoverLabel.on('pointerout', () => this.hideDeskHoverLabel())

    DESK_SLOTS.forEach((slot, index) => {
      const zone = this.add.zone(slot.x, slot.y, slot.width, slot.height).setInteractive()
      zone.setDepth(1)
      zone.on('pointerover', () => {
        let ownerName = this.network.roomState?.desks.get(String(index))?.ownerName || ''
        if (!ownerName) {
          const slotItems = Array.from(this.deskDecorationObjects.entries()).find(([, object]) =>
            Math.abs(object.x - slot.x) <= slot.width / 2 && Math.abs(object.y - slot.y) <= slot.height / 2
          )
          if (slotItems) ownerName = this.deskDecorationOwners.get(slotItems[0]) || ''
        }
        if (ownerName) this.hideDeskHoverLabel()
        else this.showDeskHoverLabel('▣  Move Desk Here', slot.x, slot.y - slot.height / 2 - 12, index)
      })
      zone.on('pointerout', (pointer: Phaser.Input.Pointer) => {
        const labelBounds = this.deskHoverLabel?.getBounds()
        if (!labelBounds?.contains(pointer.worldX, pointer.worldY)) this.hideDeskHoverLabel()
      })
    })
  }

  private showDeskHoverLabel(text: string, x: number, y: number, deskIndex: number) {
    if (!this.deskHoverLabel || !this.deskHoverLabelBackground || !this.deskHoverHighlight) return
    const slot = DESK_SLOTS[deskIndex]
    this.deskHoverHighlight
      .clear()
      .fillStyle(0x8ac8ff, 0.1)
      .fillRoundedRect(slot.x - slot.width / 2 - 5, slot.y - slot.height / 2 - 5, slot.width + 10, slot.height + 10, 5)
      .lineStyle(2, 0xc6e2ff, 0.95)
      .strokeRoundedRect(slot.x - slot.width / 2 - 5, slot.y - slot.height / 2 - 5, slot.width + 10, slot.height + 10, 5)
      .setVisible(true)
    this.deskHoverLabel.setData('deskIndex', deskIndex).setText(text).setPosition(x, y).setVisible(true)
    const bounds = this.deskHoverLabel.getBounds()
    const padding = 1
    this.deskHoverLabelBackground
      .clear()
      .fillStyle(0xf8f9fb, 1)
      .fillRoundedRect(bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2, 8)
      .lineStyle(1, 0xdfe2e8, 1)
      .strokeRoundedRect(bounds.x - padding, bounds.y - padding, bounds.width + padding * 2, bounds.height + padding * 2, 8)
      .setVisible(true)
  }

  private hideDeskHoverLabel() {
    this.deskHoverHighlight?.setVisible(false)
    this.deskHoverLabel?.setVisible(false)
    this.deskHoverLabelBackground?.setVisible(false)
  }

  private handleDeskEditorPlacement(event: PointerEvent) {
    if (!this.deskEditorMode || !this.selectedDeskDecoration) return
    if (this.wasCameraDragging) {
      this.wasCameraDragging = false
      return
    }
    // Native drag/drop ends with pointer events too; don't place a second copy.
    if (this.deskCatalogDragInProgress) {
      // Releasing outside the canvas cancels the browser's native drag state;
      // otherwise the next map gesture would still be treated as a catalog drag.
      if (event.target !== this.game.canvas) this.deskCatalogDragInProgress = false
      return
    }
    if (this.draggingDeskDecoration) {
      queueMicrotask(() => { this.draggingDeskDecoration = false })
      return
    }
    if (event.button !== 0 || event.shiftKey || event.target !== this.game.canvas) return
    // Phaser already applies the canvas scale, device pixel ratio and camera
    // transform to this pointer. Reusing clientX/clientY here breaks placement
    // on high-DPI screens and when the map is zoomed.
    const { worldX, worldY } = this.input.activePointer
    this.placeDeskDecorationAtWorld(worldX, worldY, this.selectedDeskDecoration)
  }

  private handleDeskDecorationDrop(event: DragEvent) {
    if (!this.deskEditorMode || event.target !== this.game.canvas) return
    const assetId = event.dataTransfer?.getData('application/x-skyoffice-desk-item')
    const asset = DESK_DECORATION_ASSETS.find((entry) => entry.id === assetId)
    if (!asset) return
    event.preventDefault()
    this.selectedDeskDecoration = asset
    const canvasRect = this.game.canvas.getBoundingClientRect()
    if (!canvasRect.width || !canvasRect.height) return
    const screenX = ((event.clientX - canvasRect.left) / canvasRect.width) * this.scale.width
    const screenY = ((event.clientY - canvasRect.top) / canvasRect.height) * this.scale.height
    if (screenX < 0 || screenY < 0 || screenX >= this.scale.width || screenY >= this.scale.height) return
    const worldPoint = this.cameras.main.getWorldPoint(screenX, screenY)
    this.placeDeskDecorationAtWorld(worldPoint.x, worldPoint.y, asset)
    this.deskCatalogDragInProgress = false
  }

  private placeDeskDecorationAtWorld(x: number, y: number, asset: DeskDecorationAsset) {
    const deskIndex = this.currentDeskIndex()
    const slot = DESK_SLOTS[deskIndex]
    if (!slot) return
    // Artwork can extend slightly beyond its interaction bounds, so accept a
    // small margin around the tabletop and clamp the saved object into the slot.
    if (Math.abs(x - slot.x) > slot.width / 2 + 8 || Math.abs(y - slot.y) > slot.height / 2 + 8) return
    // Snap placement to a small grid so furniture aligns cleanly, while keeping
    // every object's center inside the server-validated bounds of the desk.
    const placementX = Phaser.Math.Clamp(Math.round(x / 8) * 8, slot.x - slot.width / 2 + 8, slot.x + slot.width / 2 - 8)
    const placementY = Phaser.Math.Clamp(Math.round(y / 8) * 8, slot.y - slot.height / 2 + 8, slot.y + slot.height / 2 - 8)

    const id = `${this.network.mySessionId}:${Date.now()}`
    this.rememberDeskLayout()
    if (asset.texture === 'computers') {
      this.deskDecorationObjects.forEach((object, oldId) => {
        if (object instanceof Computer && this.deskDecorationOwners.get(oldId) === this.currentOwnerName()) {
          this.deskDecorationObjects.delete(oldId)
          this.deskDecorationOwners.delete(oldId)
        }
      })
    }
    this.addDeskDecoration(id, asset, placementX, placementY, this.currentOwnerName())
    this.selectedDeskDecorationId = id
    this.saveCurrentDeskLayout()
  }

  private currentOwnerName() {
    return this.network.roomState?.players.get(this.network.mySessionId)?.name.trim().toLocaleLowerCase() || ''
  }

  private handleDeskDecorationUpdated(item: IDeskDecoration, id: string) {
    const old = this.deskDecorationObjects.get(id)
    if (old) this.hideDeskDecorationObject(old)
    this.deskDecorationShadows.get(id)?.destroy()
    this.deskDecorationShadows.delete(id)
    const asset = ({ texture: item.texture, frame: item.frame } as any) as DeskDecorationAsset
    const object = this.addDeskDecoration(id, asset, item.x, item.y, item.ownerName)
    object.setRotation(item.rotation || 0)
    this.deskDecorationObjects.set(id, object)
  }

  private addDeskDecoration(id: string, asset: DeskDecorationAsset, x: number, y: number, ownerName: string) {
    let object: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image
    if (asset.texture === 'computers') {
      const deskIndex = DESK_SLOTS.findIndex((slot) => Math.abs(slot.x - x) <= slot.width / 2 && Math.abs(slot.y - y) <= slot.height / 2)
      const computer = this.computerMap.get(String(deskIndex))
      if (computer) {
        computer.setPosition(x, y).setOrigin(0.5, 0.75).setFrame(asset.frame).setDepth(y + 20).setVisible(true)
        computer.body.enable = true
        computer.refreshBody()
        object = computer
      } else {
        object = this.add.sprite(x, y, asset.texture, asset.frame).setOrigin(0.5, 0.75).setDepth(y + 20)
      }
    } else if (asset.texture.startsWith('pixelart_')) {
      const itemWidth = asset.width || 20
      const shadow = this.add.ellipse(x, y + 4, itemWidth * 2.2, itemWidth * 0.62, 0x000000, 0.28)
        .setOrigin(0.5, 0.5).setDepth(y + 19)
      this.deskDecorationShadows.set(id, shadow)
      object = this.add.image(x, y, asset.texture).setOrigin(0.5, 0.85).setScale(2.2).setDepth(y + 20)
    } else {
      object = this.add.sprite(x, y, asset.texture, asset.frame).setOrigin(0.5, 0.75).setDepth(y + 20)
    }
    object.setInteractive({ useHandCursor: ownerName === this.currentOwnerName() })
    this.deskDecorationObjects.set(id, object)
    this.deskDecorationOwners.set(id, ownerName)
    object.on('pointerover', () => this.hideDeskHoverLabel())
    object.on('pointerout', () => this.hideDeskHoverLabel())

    if (ownerName === this.currentOwnerName()) {
      this.input.setDraggable(object, this.deskEditorMode)
      object.on('pointerdown', () => {
        if (!this.deskEditorMode) return
        this.selectedDeskDecorationId = id
      })
      object.on('dragstart', () => {
        this.draggingDeskDecoration = true
        this.selectedDeskDecorationId = id
        this.rememberDeskLayout()
      })
      object.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
        const slot = DESK_SLOTS[this.currentDeskIndex()]
        if (!slot) return
        object.setPosition(Phaser.Math.Clamp(dragX, slot.x - slot.width / 2 + 8, slot.x + slot.width / 2 - 8),
          Phaser.Math.Clamp(dragY, slot.y - slot.height / 2 + 8, slot.y + slot.height / 2 - 8))
        object.setDepth(object.y + 20)
        const shadow = this.deskDecorationShadows.get(id)
        if (shadow) shadow.setPosition(object.x, object.y + 4).setDepth(object.y + 19)
      })
      object.on('dragend', () => {
        this.draggingDeskDecoration = false
        this.saveCurrentDeskLayout()
      })
    }
    return object
  }

  private handleDeskDecorationRemoved(id: string) {
    const object = this.deskDecorationObjects.get(id)
    if (object) this.hideDeskDecorationObject(object)
    this.deskDecorationShadows.get(id)?.destroy()
    this.deskDecorationShadows.delete(id)
    this.deskDecorationObjects.delete(id)
    this.deskDecorationOwners.delete(id)
  }

  private hideDeskDecorationObject(object: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image) {
    if (Array.from(this.computerMap.values()).includes(object as Computer)) {
      const computer = object as Computer
      computer.setVisible(false)
      computer.body.enable = false
    } else {
      object.destroy()
    }
  }

  private deleteSelectedDeskDecoration() {
    if (!this.deskEditorMode || this.isDeskEditorTextFocused()) return
    const id = this.selectedDeskDecorationId
    if (!id || this.deskDecorationOwners.get(id) !== this.currentOwnerName()) return
    this.rememberDeskLayout()
    this.network.removeDeskDecoration(id)
    this.handleDeskDecorationRemoved(id)
    this.selectedDeskDecorationId = undefined
    this.saveCurrentDeskLayout()
  }

  private rotateSelectedDeskDecoration() {
    if (!this.deskEditorMode || this.isDeskEditorTextFocused()) return
    const id = this.selectedDeskDecorationId
    if (!id || this.deskDecorationOwners.get(id) !== this.currentOwnerName()) return
    const object = this.deskDecorationObjects.get(id)
    if (!object) return
    this.rememberDeskLayout()
    object.rotation += Math.PI / 2
    this.saveCurrentDeskLayout()
  }

  private isDeskEditorTextFocused() {
    const element = document.activeElement
    return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || Boolean(element && (element as HTMLElement).isContentEditable)
  }

  private currentDeskLayout(): SavedDeskDecoration[] {
    const slot = DESK_SLOTS[this.currentDeskIndex()]
    const owner = this.currentOwnerName()
    if (!slot || !owner) return []
    return Array.from(this.deskDecorationObjects.entries())
      .filter(([id]) => this.deskDecorationOwners.get(id) === owner)
      .map(([id, object]) => ({ id, texture: object.texture.key, frame: Number(object.frame.name),
        dx: object.x - slot.x, dy: object.y - slot.y, rotation: object.rotation }))
  }

  private rememberDeskLayout() {
    const current = this.currentDeskLayout()
    const last = this.deskUndoStack[this.deskUndoStack.length - 1]
    if (last && JSON.stringify(last) === JSON.stringify(current)) return
    this.deskUndoStack.push(current)
    if (this.deskUndoStack.length > 50) this.deskUndoStack.shift()
    this.deskRedoStack = []
  }

  private undoDeskLayout() {
    if (!this.deskEditorMode || this.isDeskEditorTextFocused()) return
    const previous = this.deskUndoStack.pop()
    if (!previous) return
    this.deskRedoStack.push(this.currentDeskLayout())
    this.selectedDeskDecorationId = undefined
    this.network.saveDeskLayout(previous)
  }

  private redoDeskLayout() {
    if (!this.deskEditorMode || this.isDeskEditorTextFocused()) return
    const next = this.deskRedoStack.pop()
    if (!next) return
    this.deskUndoStack.push(this.currentDeskLayout())
    this.selectedDeskDecorationId = undefined
    this.network.saveDeskLayout(next)
  }

  private saveCurrentDeskLayout() {
    const slot = DESK_SLOTS[this.currentDeskIndex()]
    if (!slot) return
    const owner = this.currentOwnerName()
    const selectedObject = this.deskDecorationObjects.get(this.selectedDeskDecorationId || '')
    const items = Array.from(this.deskDecorationObjects.entries())
      .filter(([id]) => this.deskDecorationOwners.get(id) === owner)
      .map(([id, object]) => ({
        id,
        texture: object.texture.key,
        frame: object.texture.key.startsWith('pixelart_') ? 0 : Number(object.frame.name),
        dx: object.x - slot.x,
        dy: object.y - slot.y,
        rotation: object.rotation,
      }))
    const selectedObjectId = selectedObject
      ? Array.from(this.deskDecorationObjects.entries()).find(([, object]) => object === selectedObject)?.[0]
      : undefined
    const selectedIndex = selectedObjectId ? items.findIndex((item) => item.id === selectedObjectId) : -1
    this.deskDecorationObjects.forEach((object, id) => {
      if (this.deskDecorationOwners.get(id) === owner) {
        this.hideDeskDecorationObject(object)
        this.deskDecorationShadows.get(id)?.destroy()
        this.deskDecorationShadows.delete(id)
        this.deskDecorationObjects.delete(id)
        this.deskDecorationOwners.delete(id)
      }
    })
    this.network.saveDeskLayout(items)
    this.selectedDeskDecorationId = selectedIndex >= 0 ? `${owner}:${selectedIndex}` : undefined
  }

  private handleItemSelectorOverlap(playerSelector, selectionItem) {
    const currentItem = playerSelector.selectedItem as Item | undefined
    // currentItem is undefined if nothing was perviously selected
    if (currentItem) {
      // if the selection has not changed, do nothing
      if (currentItem === selectionItem || currentItem.depth >= selectionItem.depth) {
        return
      }
      // if selection changes, clear pervious dialog
      if (this.myPlayer.playerBehavior !== PlayerBehavior.SITTING) currentItem.clearDialogBox()
    }

    // set selected item and set up new dialog
    playerSelector.selectedItem = selectionItem
    if (selectionItem.itemType === ItemType.COMPUTER) {
      const computer = selectionItem as Computer
      computer.openDialog(this.network.mySessionId, this.network)
      return
    }
    selectionItem.onOverlapDialog()
  }

  // Player body = 16x9.6 box at the feet (see the myPlayer factory). True when that box,
  // centred on a sprite at (cx, cy), touches no blocked collision tile and stays in the world.
  private isBodyFree(cx: number, cy: number) {
    const x0 = cx - 8, x1 = cx + 7.9, y0 = cy + 14.4, y1 = cy + 23.9
    if (x0 < 0 || y0 < 0 || x1 >= 2176 || y1 >= 1696) return false
    for (let x = x0; x <= x1 + 4; x += 4) {
      for (let y = y0; y <= y1 + 4; y += 4) {
        const tile = this.collisionLayer.getTileAt(Math.floor(Math.min(x, x1) / 16), Math.floor(Math.min(y, y1) / 16))
        if (tile?.collides) return false
      }
    }
    return true
  }

  // Where the avatar steps to when getting up: the free-floor spot closest to the usual
  // "in front of the seat" position that also isn't inside another seat's 20px auto-sit
  // radius (otherwise standing up from one cushion would instantly sit you on the next).
  private findStandSpot(chair: Chair): [number, number] {
    const dir = (chair.itemDirection ?? 'down') as 'up' | 'down' | 'left' | 'right'
    const sit = chair.sitShift ?? sittingShiftData[dir]
    const target = [sit[0], sit[1]]
    let best: [number, number] | undefined
    let bestCost = Infinity
    for (let dx = -24; dx <= 24; dx++) {
      for (let dy = -24; dy <= 24; dy++) {
        // prefer stepping out towards the open floor in front/below the seat rather than backwards over it
        const cost = Math.hypot(dx - target[0], dy - target[1]) + 0.75 * Math.max(0, target[1] - dy)
        if (cost >= bestCost) continue
        const px = chair.x + dx
        const py = chair.y + dy
        if (Phaser.Math.Distance.Between(px, py, chair.x, chair.y) <= 21) continue
        if (!this.isBodyFree(px, py)) continue
        if (this.seatItems.some((s) => s !== chair && Phaser.Math.Distance.Between(px, py, s.x, s.y) <= 21)) continue
        best = [dx, dy]
        bestCost = cost
      }
    }
    return best ?? [target[0], target[1]]
  }

  private addObjectFromTiled(
    group: Phaser.Physics.Arcade.StaticGroup,
    object: Phaser.Types.Tilemaps.TiledObject,
    key: string,
    tilesetName: string
  ) {
    const actualX = object.x! + object.width! * 0.5
    const actualY = object.y! - object.height! * 0.5
    const obj = group
      .get(actualX, actualY, key, object.gid! - this.map.getTileset(tilesetName).firstgid)
      .setDepth(actualY)
    return obj
  }

  private addGroupFromTiled(
    objectLayerName: string,
    key: string,
    tilesetName: string,
    collidable: boolean
  ) {
    const group = this.physics.add.staticGroup()
    const objectLayer = this.map.getObjectLayer(objectLayerName)
    objectLayer.objects.forEach((object) => {
      const actualX = object.x! + object.width! * 0.5
      const actualY = object.y! - object.height! * 0.5
      group
        .get(actualX, actualY, key, object.gid! - this.map.getTileset(tilesetName).firstgid)
        .setDepth(actualY)
    })
    if (this.myPlayer && collidable)
      this.physics.add.collider([this.myPlayer, this.myPlayer.playerContainer], group)
  }

  // function to add new player to the otherPlayer group
  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    if (this.otherPlayerMap.has(id)) return
    const otherPlayer = this.add.otherPlayer(newPlayer.x, newPlayer.y, 'adam', id, newPlayer.name)
    const selectPlayer = (_pointer: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation()
      this.pointerOnOtherPlayer = false
      phaserEvents.emit(Event.PLAYER_SELECTED, { id, name: otherPlayer.playerName.text })
    }
    const beginPlayerClick = () => { this.pointerOnOtherPlayer = true }
    // Let Phaser hit-test the actual remote sprite/name tag. This is reliable
    // with camera zoom, scrolling, and canvas scaling, unlike manual coordinate math.
    otherPlayer.setInteractive({ useHandCursor: true })
    otherPlayer.on('pointerdown', beginPlayerClick)
    otherPlayer.on('pointerup', selectPlayer)
    otherPlayer.playerName.setInteractive({ useHandCursor: true })
    otherPlayer.playerName.on('pointerdown', beginPlayerClick)
    otherPlayer.playerName.on('pointerup', selectPlayer)
    if (newPlayer.anim) otherPlayer.updateOtherPlayer('anim', newPlayer.anim)
    otherPlayer.readyToConnect = newPlayer.readyToConnect
    otherPlayer.videoConnected = newPlayer.videoConnected
    otherPlayer.cameraEnabled = newPlayer.cameraEnabled
    otherPlayer.setTint(newPlayer.tint ?? 0xffffff)
    otherPlayer.setMicrophoneEnabled(newPlayer.microphoneEnabled)
    this.otherPlayers.add(otherPlayer)
    this.otherPlayerMap.set(id, otherPlayer)
  }

  // function to remove the player who left from the otherPlayer group
  private handlePlayerLeft(id: string) {
    if (this.otherPlayerMap.has(id)) {
      const otherPlayer = this.otherPlayerMap.get(id)
      if (!otherPlayer) return
      this.otherPlayers.remove(otherPlayer, true, true)
      this.otherPlayerMap.delete(id)
    }
  }

  private handleMyPlayerReady() {
    this.myPlayer.readyToConnect = true
  }

  private handleMyVideoConnected() {
    this.myPlayer.videoConnected = true
  }

  // function to update target position upon receiving player updates
  private handlePlayerUpdated(field: string, value: number | string, id: string) {
    const otherPlayer = this.otherPlayerMap.get(id)
    otherPlayer?.updateOtherPlayer(field, value)
  }

  private handlePlayerVoiceActivity(id: string, speaking: boolean) {
    if (id === this.network.mySessionId) {
      this.myPlayer.setSpeaking(speaking)
      return
    }
    this.otherPlayerMap.get(id)?.setSpeaking(speaking)
  }

  private handleItemUserAdded(playerId: string, itemId: string, itemType: ItemType) {
    if (itemType === ItemType.COMPUTER) {
      const computer = this.computerMap.get(itemId)
      computer?.addCurrentUser(playerId)
    } else if (itemType === ItemType.WHITEBOARD) {
      const whiteboard = this.whiteboardMap.get(itemId)
      whiteboard?.addCurrentUser(playerId)
    }
  }

  private handleItemUserRemoved(playerId: string, itemId: string, itemType: ItemType) {
    if (itemType === ItemType.COMPUTER) {
      const computer = this.computerMap.get(itemId)
      computer?.removeCurrentUser(playerId)
    } else if (itemType === ItemType.WHITEBOARD) {
      const whiteboard = this.whiteboardMap.get(itemId)
      whiteboard?.removeCurrentUser(playerId)
    }
  }

  private handleChatMessageAdded(playerId: string, content: string) {
    const otherPlayer = this.otherPlayerMap.get(playerId)
    otherPlayer?.updateDialogBubble(content)
  }

  update(t: number, dt: number) {
    if (t - this.lastStudyVisualUpdate >= 500) {
      this.lastStudyVisualUpdate = t
      this.updateLiveStudyVisuals()
    }
    if (document.body.classList.contains('meeting-fullscreen')) {
      this.roomHoverLabel.style.display = 'none'
      this.hoveredRoomAreaId = undefined
      this.hoveredRoomWorldPoint = undefined
    }
    if (this.hoveredRoomAreaId) {
      const hoveredArea = this.roomAreas.find(({ id }) => id === this.hoveredRoomAreaId)
      if (hoveredArea && this.hoveredRoomWorldPoint) {
        this.roomHoverLabel.textContent = this.roomAreaDisplayName(
          hoveredArea,
          this.hoveredRoomWorldPoint.x,
          this.hoveredRoomWorldPoint.y
        )
      }
    }
    if (this.myPlayer && this.network) {
      if (this.deskEditorMode && Phaser.Input.Keyboard.JustDown(this.keyR)) {
        this.rotateSelectedDeskDecoration()
      }
      this.playerSelector.update(this.myPlayer, this.cursors)
      this.myPlayer.update(this.playerSelector, this.cursors, this.keyR, this.network, dt)
      // The name tag lives in its own physics-enabled container. World
      // collisions can nudge that body away from the avatar during auto-walk;
      // snap it back after physics so it stays attached to the character.
      this.myPlayer.playerContainer.setPosition(this.myPlayer.x, this.myPlayer.y - 30)
      const meetingChair = this.pendingMeetingChair
      const preserveReservedSeat = Boolean(meetingChair)
      if (meetingChair && !this.myPlayer.isAutoWalking() && this.myPlayer.playerBehavior === PlayerBehavior.IDLE) {
        this.pendingMeetingChair = undefined
        if (Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, meetingChair.x, meetingChair.y) <= 28) {
          this.myPlayer.sitOnChair(meetingChair, this.playerSelector, this.network)
        }
      }
      this.updateRoomFocus()
      // Seat direction controls the seated pose. Approach is direction-neutral;
      // normal map collisions still keep avatars from walking through furniture.
      this.seatItems.forEach((chair) => {
        const localSittingHere =
          this.myPlayer.playerBehavior === PlayerBehavior.SITTING &&
          Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, chair.x, chair.y) <= 24
        if (chair.playerMask) {
          if (localSittingHere) this.myPlayer.setMask(chair.playerMask)
          else if (this.myPlayer.mask === chair.playerMask) this.myPlayer.clearMask(false)
          this.otherPlayerMap.forEach((player) => {
            const animation = player.anims.currentAnim?.key ?? ''
            const sittingHere = animation.includes('_sit_') && Phaser.Math.Distance.Between(player.x, player.y, chair.x, chair.y) <= 24
            if (sittingHere) player.setMask(chair.playerMask!)
            else if (player.mask === chair.playerMask) player.clearMask(false)
          })
        }
      })
      if (this.myPlayer.playerBehavior === PlayerBehavior.IDLE && !preserveReservedSeat) {
        let nearestSeat: Chair | undefined
        let nearestSeatDistance = 20
        this.seatItems.forEach((chair) => {
          const distance = Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, chair.x, chair.y)
          if (distance <= nearestSeatDistance) {
            nearestSeat = chair
            nearestSeatDistance = distance
          }
        })
        if (nearestSeat) this.myPlayer.sitOnChair(nearestSeat, this.playerSelector, this.network)
      }
      this.updateMeetingRoomPresence()
      this.otherPlayerMap.forEach((otherPlayer) => {
        const distance = Phaser.Math.Distance.Between(
          this.myPlayer.x, this.myPlayer.y, otherPlayer.x, otherPlayer.y
        )
        const localMeetingRoom = this.roomAreas.find((area) => area.id === this.activeMeetingRoomId)
        const localMeetingArea = this.meetingRoomAtPosition(this.myPlayer.x, this.myPlayer.y)
        const remoteMeetingRoom = this.meetingRoomAtPosition(otherPlayer.x, otherPlayer.y)
        const sameMeeting = Boolean(localMeetingRoom && remoteMeetingRoom?.id === localMeetingRoom.id)
        const eitherInsideMeeting = Boolean(localMeetingArea || remoteMeetingRoom)
        const callAllowed = sameMeeting || (!eitherInsideMeeting && distance <= 300)
        otherPlayer.makeCall(this.myPlayer, this.network.webRTC!, callAllowed)
        const localRoom = this.isolatedRoomAt(this.myPlayer.x, this.myPlayer.y)
        const remoteRoom = this.isolatedRoomAt(otherPlayer.x, otherPlayer.y)
        const audioAllowed = callAllowed && (!localRoom && !remoteRoom ? true : localRoom?.id === remoteRoom?.id)
        this.network.webRTC?.setPlayerProximity(otherPlayer.playerId, sameMeeting ? 0 : distance, audioAllowed)
      })

      // resume the camera following the player once they move again after dragging
      if (
        !this.isCameraDragging &&
        !this.isFollowingPlayer &&
        this.cursors &&
        (this.cursors.left?.isDown ||
          this.cursors.right?.isDown ||
          this.cursors.up?.isDown ||
          this.cursors.down?.isDown ||
          this.cursors.W?.isDown ||
          this.cursors.A?.isDown ||
          this.cursors.S?.isDown ||
          this.cursors.D?.isDown)
      ) {
        this.cameras.main.startFollow(this.myPlayer, true)
        this.isFollowingPlayer = true
      }

      this.updateVideoBubblePositions()
    }
  }

  private updateRoomFocus() {
    const area = this.roomAreaAt(this.myPlayer.x, this.myPlayer.y)
    const nextAreaId = area?.focusOnEnter ? area.id : undefined
    if (nextAreaId === this.activeFocusAreaId) return
    if (this.activeFocusAreaId) {
      this.roomDoors.forEach((door) => {
        if (door.placement.roomId === this.activeFocusAreaId) this.animateRoomDoor(door, false)
      })
    }
    this.activeFocusAreaId = nextAreaId
    if (this.roomFocusOverlay && this.roomFocusMaskShape) {
      if (area?.focusOnEnter) {
        this.roomFocusMaskShape.clear().fillStyle(0xffffff, 1).fillPoints(area.polygon.points, true)
        this.roomFocusOverlay.setVisible(true)
      } else this.roomFocusOverlay.setVisible(false)
    }
    if (nextAreaId) {
      this.roomDoors.forEach((door) => {
        if (door.placement.roomId === nextAreaId) {
          if (this.network.isMeetingRoomLocked(nextAreaId)) this.applyMeetingRoomLock(nextAreaId, true)
          else this.animateRoomDoor(door, true)
        }
      })
    }
  }

  private handleMeetingRoomLockChanged(roomId: string, locked: boolean) {
    this.applyMeetingRoomLock(roomId, locked)
  }

  private applyMeetingRoomLock(roomId: string, locked: boolean) {
    this.roomDoors.forEach((door) => {
      if (door.placement.roomId !== roomId) return
      const { frame, blocker, lockMarker, sideLeaf, swingLeaf } = door
      const body = blocker.body as Phaser.Physics.Arcade.StaticBody | undefined
      if (body) body.enable = locked
      lockMarker.setVisible(locked)
      if (locked) {
        if (sideLeaf) {
          this.tweens.killTweensOf(sideLeaf)
          sideLeaf.rotation = 0
        }
        if (swingLeaf) {
          this.tweens.killTweensOf(swingLeaf)
          swingLeaf.rotation = 0
        }
        frame.setVisible(true)
      } else {
        this.animateRoomDoor(door, this.activeFocusAreaId === roomId)
      }
    })
  }

  private meetingRoomAtPosition(x: number, y: number) {
    for (let index = this.roomAreas.length - 1; index >= 0; index--) {
      const area = this.roomAreas[index]
      if (!this.isMeetingRoomArea(area.name)) continue
      if (Phaser.Geom.Polygon.Contains(area.polygon, x, y)) return area
    }
    return undefined
  }

  private isMeetingRoomArea(name: string) {
    const normalized = name.trim().toLocaleLowerCase()
    return normalized.startsWith('meeting room:') || normalized === 'green library'
  }

  private updateMeetingRoomPresence() {
    const localSeat = this.myPlayer.playerBehavior === PlayerBehavior.SITTING
      ? this.seatItems.find((seat) => Phaser.Math.Distance.Between(this.myPlayer.x, this.myPlayer.y, seat.x, seat.y) <= 24)
      : undefined
    const roomAtSeat = localSeat ? this.meetingRoomAtPosition(localSeat.x, localSeat.y) : undefined
    if (roomAtSeat) this.activeMeetingRoomId = roomAtSeat.id

    let room = this.roomAreas.find((area) => area.id === this.activeMeetingRoomId)
    if (!room || !Phaser.Geom.Polygon.Contains(room.polygon, this.myPlayer.x, this.myPlayer.y)) {
      this.activeMeetingRoomId = undefined
      room = undefined
    }
    let presence: MeetingRoomPresence | null = null

    if (room) {
      const activeRoom = room
      const participants: MeetingRoomParticipant[] = [{
        playerId: this.myPlayer.playerId,
        name: String(this.myPlayer.playerName.text || 'Você'),
      }]
      this.otherPlayerMap.forEach((player) => {
        if (this.meetingRoomAtPosition(player.x, player.y)?.id !== activeRoom.id) return
        participants.push({ playerId: player.playerId, name: String(player.playerName.text || 'Participante') })
      })
      participants.sort((a, b) => a.playerId === this.myPlayer.playerId ? -1 : b.playerId === this.myPlayer.playerId ? 1 : a.name.localeCompare(b.name))
      presence = { roomId: activeRoom.id, roomName: activeRoom.name, participants }
    }

    const signature = presence ? JSON.stringify(presence) : 'none'
    if (signature === this.lastMeetingPresenceSignature) return
    this.lastMeetingPresenceSignature = signature
    phaserEvents.emit(Event.MEETING_ROOM_PRESENCE, presence)
  }

  private loadRoomDoors() {
    this.roomDoors.forEach(({ frame, blocker, collider }) => { collider?.destroy(); frame.destroy(); blocker.destroy() })
    this.roomDoors.clear()
    const validRoomIds = new Set(this.roomAreas.filter((area) => area.focusOnEnter).map((area) => area.id))
    loadRoomDoorLayout().doors.filter((door) => validRoomIds.has(door.roomId)).forEach((placement) => {
      const frame = this.add.container(placement.x, placement.y).setDepth(50001).setVisible(false)
      const halfWidth = placement.width / 2
      const height = placement.height
      const blockerWidth = placement.wall === 'vertical' ? 14 : placement.width
      const blockerHeight = placement.wall === 'vertical' ? placement.width : 14
      const blocker = this.add.zone(placement.x, placement.y, blockerWidth, blockerHeight).setVisible(false)
      this.physics.add.existing(blocker, true)
      ;(blocker.body as Phaser.Physics.Arcade.StaticBody).enable = false
      const lockMarker = this.add.graphics().setPosition(placement.wall === 'vertical' ? 12 : 0, -height / 2 - 9).setVisible(false)
      lockMarker.fillStyle(0xd93045, 1).fillRoundedRect(-6, -5, 12, 10, 2)
      lockMarker.lineStyle(2, 0xd93045, 1).strokeRoundedRect(-4, -12, 8, 10, 4)
      lockMarker.fillStyle(0xffffff, 1).fillCircle(0, 0, 1.2)
      frame.add(lockMarker)
      const room = this.roomAreas.find((area) => area.id === placement.roomId)
      const roomCenter = room
        ? room.polygon.points.reduce(
          (center, point) => ({ x: center.x + point.x / room.polygon.points.length, y: center.y + point.y / room.polygon.points.length }),
          { x: 0, y: 0 }
        )
        : { x: placement.x, y: placement.y }
      if (placement.wall === 'vertical') {
        // Place the hinge at one end so this edge-on leaf can swing out into the room.
        const sideLeaf = this.add.container(0, -halfWidth)
        const edge = this.add.graphics()
        // From the side the door is only a slim, continuous wood edge.
        edge.fillStyle(0xb77d59, 1).fillRect(-4, 0, 8, placement.width)
        edge.fillStyle(0xe6a97d, 1).fillRect(-2, 0, 5, placement.width)
        edge.fillStyle(0xf4c49a, 1).fillRect(-1, 1, 1, placement.width - 2)
        sideLeaf.add(edge)
        frame.add(sideLeaf)
        const openAngle = roomCenter.x < placement.x ? Math.PI / 2 : -Math.PI / 2
        this.roomDoors.set(placement.doorId, { placement, frame, sideLeaf, blocker, lockMarker, openAngle })
        if (this.network.isMeetingRoomLocked(placement.roomId)) this.applyMeetingRoomLock(placement.roomId, true)
        return
      }
      const jamb = this.add.graphics()
      jamb.fillStyle(0x80523e, 1).fillRect(-halfWidth - 4, -height / 2, 4, height)
      jamb.fillRect(halfWidth, -height / 2, 4, height)
      jamb.fillStyle(0xd09a70, 1).fillRect(-halfWidth - 3, -height / 2 + 2, 1, height - 4)
      jamb.fillRect(halfWidth + 2, -height / 2 + 2, 1, height - 4)
      frame.add(jamb)
      const makeLeaf = (isLeft: boolean) => {
        const leaf = this.add.container(isLeft ? -halfWidth : halfWidth, 0)
        const panel = this.add.graphics()
        const x = isLeft ? 0 : -halfWidth
        const insetX = Math.max(3, Math.min(8, halfWidth * 0.1))
        const insetY = Math.max(4, Math.min(10, height * 0.1))
        panel.fillStyle(0xe6a97d, 1).fillRect(x, -height / 2, halfWidth, height)
        panel.fillStyle(0xc8855f, 1).fillRect(x + insetX, -height / 2 + insetY, halfWidth - insetX * 2, height - insetY * 2)
        panel.fillStyle(0xe9b28a, 1).fillRect(x + insetX + 1, -height / 2 + insetY + 1, halfWidth - insetX * 2 - 2, height - insetY * 2 - 2)
        panel.fillStyle(0xf4c49a, 1).fillRect(x + insetX + 1, -height / 2 + insetY + 1, halfWidth - insetX * 2 - 2, 2)
        panel.fillStyle(0xd89c71, 1).fillRect(x + insetX + 1, height / 2 - insetY - 2, halfWidth - insetX * 2 - 2, 1)
        // Fine wood grain and small hinges give the leaves depth without a heavy outline.
        panel.fillStyle(0xd89c71, 0.55).fillRect(x + halfWidth * 0.32, -height / 2 + insetY + 4, 1, height - insetY * 2 - 8)
        panel.fillRect(x + halfWidth * 0.72, -height / 2 + insetY + 4, 1, height - insetY * 2 - 8)
        const outerX = isLeft ? 2 : -3
        panel.fillStyle(0x70554a, 1).fillRect(outerX, -height * 0.32, 3, 5)
        panel.fillRect(outerX, height * 0.26, 3, 5)
        panel.fillStyle(0xc9a06c, 1).fillRect(outerX + 1, -height * 0.32 + 1, 1, 3)
        panel.fillRect(outerX + 1, height * 0.26 + 1, 1, 3)
        const centerSeamX = isLeft ? halfWidth - 2 : -halfWidth
        panel.fillStyle(0x98634a, 1).fillRect(centerSeamX, -height / 2, 2, height)
        const knobX = isLeft ? halfWidth - 9 : -halfWidth + 9
        panel.fillStyle(0x76543b, 1).fillCircle(knobX, 0, 3)
        panel.fillStyle(0xd7ad66, 1).fillCircle(knobX, 0, 2)
        panel.fillStyle(0xf0d596, 1).fillRect(knobX - 1, -1, 1, 2)
        leaf.add(panel)
        return leaf
      }
      const leftLeaf = makeLeaf(true)
      const rightLeaf = makeLeaf(false)
      // Keep the paired wood artwork, but swing the complete door from one hinge like the Gather door.
      const hingeOnLeft = roomCenter.x >= placement.x
      const hingeX = hingeOnLeft ? -halfWidth : halfWidth
      const swingLeaf = this.add.container(hingeX, 0)
      leftLeaf.x -= hingeX
      rightLeaf.x -= hingeX
      swingLeaf.add([leftLeaf, rightLeaf])
      frame.add(swingLeaf)
      const roomIsBelow = roomCenter.y > placement.y
      const openAngle = (hingeOnLeft === roomIsBelow ? 1 : -1) * Math.PI / 2
      this.roomDoors.set(placement.doorId, { placement, frame, swingLeaf, blocker, lockMarker, openAngle })
      if (this.network.isMeetingRoomLocked(placement.roomId)) this.applyMeetingRoomLock(placement.roomId, true)
    })
    if (this.activeFocusAreaId) {
      this.roomDoors.forEach((door) => {
        if (door.placement.roomId === this.activeFocusAreaId) this.animateRoomDoor(door, true)
      })
    }
  }

  private animateRoomDoor(door: { placement: RoomDoorPlacement; frame: Phaser.GameObjects.Container; swingLeaf?: Phaser.GameObjects.Container; sideLeaf?: Phaser.GameObjects.Container; openAngle: number }, close: boolean) {
    const { placement, frame, swingLeaf, sideLeaf, openAngle } = door
    if (sideLeaf) {
      this.tweens.killTweensOf(sideLeaf)
      if (!close) {
        if (!frame.visible) {
          sideLeaf.rotation = 0
          frame.setVisible(true)
        }
        this.tweens.add({
          targets: sideLeaf,
          rotation: openAngle,
          duration: 300,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (this.activeFocusAreaId !== placement.roomId) frame.setVisible(false)
          },
        })
        return
      }
      if (!frame.visible) {
        sideLeaf.rotation = openAngle
        frame.setVisible(true)
      }
      this.tweens.add({ targets: sideLeaf, rotation: 0, duration: 360, ease: 'Sine.easeInOut' })
      return
    }
    if (!swingLeaf) return
    this.tweens.killTweensOf(swingLeaf)
    if (!close) {
      if (!frame.visible) {
        swingLeaf.rotation = 0
        frame.setVisible(true)
      }
      const hideAfterOpening = () => {
        if (this.activeFocusAreaId !== placement.roomId) frame.setVisible(false)
      }
      this.tweens.add({
        targets: swingLeaf,
        rotation: openAngle,
        duration: 300,
        ease: 'Sine.easeInOut',
        onComplete: hideAfterOpening,
      })
      return
    }
    if (!frame.visible) {
      swingLeaf.rotation = openAngle
      frame.setVisible(true)
    }
    this.tweens.add({ targets: swingLeaf, rotation: 0, duration: 360, ease: 'Sine.easeInOut' })
  }

  private handleDoorLayoutStorage = (event: StorageEvent) => {
    if (event.key === ROOM_DOOR_LAYOUT_STORAGE_KEY) this.loadRoomDoors()
  }

  private roomAreaAt(x: number, y: number) {
    // The six upper desk cubicles each fill their own room; their desk owner
    // label takes precedence throughout that whole cubicle.
    for (let index = this.roomAreas.length - 1; index >= 0; index--) {
      const area = this.roomAreas[index]
      const deskIndex = Number(area.id.replace('desk-slot-', ''))
      if (area.name.trim().toLocaleLowerCase() === 'unclaimed desk' && deskIndex >= 14 && deskIndex < 20 &&
        Phaser.Geom.Polygon.Contains(area.polygon, x, y)) return area
    }
    for (let index = this.roomAreas.length - 1; index >= 0; index--) {
      const area = this.roomAreas[index]
      // Desk claim regions are overlays; keep the parent room name visible.
      if (area.name.trim().toLocaleLowerCase() === 'unclaimed desk') continue
      if (Phaser.Geom.Polygon.Contains(area.polygon, x, y)) return area
    }
    // The upper desks do not sit inside a named room region, so use their
    // own area label as a fallback after checking all surrounding rooms.
    for (let index = this.roomAreas.length - 1; index >= 0; index--) {
      const area = this.roomAreas[index]
      if (area.name.trim().toLocaleLowerCase() === 'unclaimed desk' && Phaser.Geom.Polygon.Contains(area.polygon, x, y)) {
        return area
      }
    }
    return undefined
  }

  private roomAreaDisplayName(area: (typeof this.roomAreas)[number], x: number, y: number) {
    const areaDeskIndex = area.name.trim().toLocaleLowerCase() === 'unclaimed desk'
      ? Number(area.id.replace('desk-slot-', ''))
      : -1
    const deskIndex = areaDeskIndex >= 0 && areaDeskIndex < DESK_SLOTS.length
      ? areaDeskIndex
      : DESK_SLOTS.findIndex((slot) =>
          Math.abs(x - slot.x) <= slot.width / 2 && Math.abs(y - slot.y) <= slot.height / 2
        )
    if (deskIndex < 0) return area.name
    const ownerName = this.network.roomState?.desks.get(String(deskIndex))?.ownerName.trim()
    if (area.name.trim().toLocaleLowerCase() === 'unclaimed desk') {
      return ownerName ? `${ownerName} Mesa` : 'Unclaimed Desk'
    }
    return `${area.name} · ${ownerName ? `${ownerName} Mesa` : 'Unclaimed Desk'}`
  }

  private isolatedRoomAt(x: number, y: number) {
    for (let index = this.roomAreas.length - 1; index >= 0; index--) {
      const area = this.roomAreas[index]
      // Desk claim polygons are visual/workstation areas, not private voice
      // rooms. People at desks must remain part of the general nearby audio.
      if (area.name.trim().toLocaleLowerCase() === 'unclaimed desk') continue
      if (area.isolateVoice && Phaser.Geom.Polygon.Contains(area.polygon, x, y)) return area
    }
    return undefined
  }

  // keep each player's webcam bubble glued above their character on screen
  private updateVideoBubblePositions() {
    const webRTC = this.network.webRTC
    if (!webRTC) return
    const meetingActive = document.body.classList.contains('meeting-active')

    const cam = this.cameras.main
    const canvasRect = this.game.canvas.getBoundingClientRect()

    const screenPositionFor = (worldX: number, worldY: number) => {
      const screenX = (worldX - cam.worldView.x) * cam.zoom
      const screenY = (worldY - cam.worldView.y) * cam.zoom
      return { x: canvasRect.left + screenX, y: canvasRect.top + screenY - 65 }
    }

    if (!meetingActive) {
      const myPos = screenPositionFor(this.myPlayer.x, this.myPlayer.y)
      webRTC.setVideoPosition(this.network.mySessionId, myPos.x, myPos.y)
    }

    this.otherPlayerMap.forEach((otherPlayer, id) => {
      webRTC.setCameraEnabled(id, otherPlayer.cameraEnabled)
      if (!meetingActive) {
        const pos = screenPositionFor(otherPlayer.x, otherPlayer.y)
        webRTC.setVideoPosition(id, pos.x, pos.y)
      }
    })
  }
}
