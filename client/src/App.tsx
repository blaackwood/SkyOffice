import React, { useEffect, useState } from 'react'
import styled from 'styled-components'

import { useAppSelector } from './hooks'

import RoomSelectionDialog from './components/RoomSelectionDialog'
import LoginDialog from './components/LoginDialog'
import ComputerDialog from './components/ComputerDialog'
import WhiteboardDialog from './components/WhiteboardDialog'
import Chat from './components/Chat'
import HelperButtonGroup from './components/HelperButtonGroup'
import BottomBar from './components/BottomBar'
import MeetingPanel from './components/MeetingPanel'
import phaserGame from './PhaserGame'
import Game from './scenes/Game'
import { Event, phaserEvents } from './events/EventCenter'
import type { MeetingRoomPresence } from './events/EventCenter'

const ConnectionNotice = styled.div`
  position: fixed;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 1000;
  padding: 8px 14px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 999px;
  background: #262a3d;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, .3);

  button {
    border: 1px solid #59617c;
    border-radius: 999px;
    padding: 5px 10px;
    background: #333750;
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
  }

  button:hover { background: #414866; }
`

const Backdrop = styled.div`
  position: absolute;
  height: 100%;
  width: 100%;
`

function App() {
  const [meetingPresence, setMeetingPresence] = useState<MeetingRoomPresence | null>(null)
  const [dismissedMeetingRoomId, setDismissedMeetingRoomId] = useState('')
  const loggedIn = useAppSelector((state) => state.user.loggedIn)
  const computerDialogOpen = useAppSelector((state) => state.computer.computerDialogOpen)
  const whiteboardDialogOpen = useAppSelector((state) => state.whiteboard.whiteboardDialogOpen)
  const roomJoined = useAppSelector((state) => state.room.roomJoined)
  const connectionStatus = useAppSelector((state) => state.room.connectionStatus)

  useEffect(() => {
    const updateMeeting = (presence: MeetingRoomPresence | null) => {
      setMeetingPresence(presence)
      if (!presence) setDismissedMeetingRoomId('')
    }
    phaserEvents.on(Event.MEETING_ROOM_PRESENCE, updateMeeting)
    return () => { phaserEvents.off(Event.MEETING_ROOM_PRESENCE, updateMeeting) }
  }, [])

  let ui: JSX.Element
  if (loggedIn) {
    if (computerDialogOpen) {
      /* Render ComputerDialog if user is using a computer. */
      ui = <ComputerDialog />
    } else if (whiteboardDialogOpen) {
      /* Render WhiteboardDialog if user is using a whiteboard. */
      ui = <WhiteboardDialog />
    } else {
      ui = (
        /* Render the in-world UI when no dialogs are opened. */
        <>
          <Chat />
        </>
      )
    }
  } else if (roomJoined) {
    /* Render LoginDialog if not logged in but selected a room. */
    ui = <LoginDialog />
  } else {
    /* Render RoomSelectionDialog if yet selected a room. */
    ui = <RoomSelectionDialog />
  }

  return (
    <Backdrop>
      {ui}
      {loggedIn && !computerDialogOpen && !whiteboardDialogOpen && meetingPresence && dismissedMeetingRoomId !== meetingPresence.roomId && (
        <MeetingPanel presence={meetingPresence} onClose={() => setDismissedMeetingRoomId(meetingPresence.roomId)} />
      )}
      {loggedIn && connectionStatus !== 'connected' && (
        <ConnectionNotice role="status">
          {connectionStatus === 'reconnecting'
            ? 'Conexão instável. Voltando para a sala…'
            : 'A conexão caiu.'}
          {connectionStatus === 'disconnected' && (
            <button
              type="button"
              onClick={() => {
                const game = phaserGame.scene.keys.game as Game | undefined
                game?.network?.retryConnection()
              }}
            >
              Tentar novamente
            </button>
          )}
        </ConnectionNotice>
      )}
      {/* Render HelperButtonGroup if no dialogs are opened. */}
      {!computerDialogOpen && !whiteboardDialogOpen && <HelperButtonGroup />}
      {/* Render BottomBar (mic/camera controls) whenever logged in and no dialog is open. */}
      {loggedIn && !computerDialogOpen && !whiteboardDialogOpen && !(meetingPresence && dismissedMeetingRoomId !== meetingPresence.roomId) && <BottomBar />}
    </Backdrop>
  )
}

export default App
