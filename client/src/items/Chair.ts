import { ItemType } from '../../../types/Items'
import Item from './Item'

export default class Chair extends Item {
  itemDirection?: string
  tiledId?: number
  sitShift?: [number, number]
  standShift?: [number, number]
  playerMask?: Phaser.Display.Masks.GeometryMask
  playerMaskShape?: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: string | number) {
    super(scene, x, y, texture, frame)

    this.itemType = ItemType.CHAIR
  }

}
