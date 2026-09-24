import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import Tooltip from '@mui/material/Tooltip'
import TableRestaurantIcon from '@mui/icons-material/TableRestaurant'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'

import { useAppSelector } from '../hooks'
import { phaserEvents, Event } from '../events/EventCenter'
import phaserGame from '../PhaserGame'
import Game from '../scenes/Game'

const ToolRail = styled.div`
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 35;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 5px;
  border-radius: 10px;
  background: #17191d;
  box-shadow: 0 3px 12px rgba(0, 0, 0, .32);
`

const ToolButton = styled.button`
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 7px;
  color: #c5c8ce;
  background: #202226;
  cursor: pointer;

  svg { width: 19px; height: 19px; }
  &:hover { color: #fff; background: #30333a; }
  &:active { background: #3a3e47; }
`

export default function HelperButtonGroup() {
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const [deskIndex, setDeskIndex] = useState(-1)

  useEffect(() => {
    const syncOwnedDesk = () => {
      const game = phaserGame.scene.keys.game as Game | undefined
      const network = game?.network
      setDeskIndex(network?.roomState?.players.get(network.mySessionId)?.deskIndex ?? -1)
    }
    const claimDesk = (index: number) => setDeskIndex(index)
    phaserEvents.on(Event.MY_PLAYER_READY, syncOwnedDesk)
    phaserEvents.on(Event.DESK_CLAIMED, claimDesk)
    syncOwnedDesk()
    return () => {
      phaserEvents.off(Event.MY_PLAYER_READY, syncOwnedDesk)
      phaserEvents.off(Event.DESK_CLAIMED, claimDesk)
    }
  }, [])

  const game = () => phaserGame.scene.keys.game as Game | undefined

  if (!roomJoined) return null

  return (
    <ToolRail aria-label="Controles do mapa">
      <Tooltip title="Aumentar zoom" placement="left">
        <ToolButton type="button" aria-label="Aumentar zoom" onClick={() => game()?.adjustCameraZoom(0.2)}>
          <AddIcon />
        </ToolButton>
      </Tooltip>
      <Tooltip title="Diminuir zoom" placement="left">
        <ToolButton type="button" aria-label="Diminuir zoom" onClick={() => game()?.adjustCameraZoom(-0.2)}>
          <RemoveIcon />
        </ToolButton>
      </Tooltip>
      {deskIndex >= 0 && <>
        <Tooltip title="Ir até minha mesa" placement="left">
          <ToolButton type="button" aria-label="Ir até minha mesa" onClick={() => game()?.walkToOwnedDesk()}>
            <TableRestaurantIcon />
          </ToolButton>
        </Tooltip>
        <Tooltip title="Decorar minha mesa" placement="left">
          <ToolButton
            type="button"
            aria-label="Decorar minha mesa"
            onClick={(event) => {
              const currentGame = game()
              if (currentGame?.focusOnOwnedDesk()) {
                phaserEvents.emit(Event.DESK_EDITOR_REQUEST, deskIndex, event.currentTarget)
              }
            }}
          >
            <EditOutlinedIcon />
          </ToolButton>
        </Tooltip>
      </>}
    </ToolRail>
  )
}
