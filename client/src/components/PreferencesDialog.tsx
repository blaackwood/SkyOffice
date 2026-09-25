import React, { useState } from 'react'
import styled from 'styled-components'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Slider from '@mui/material/Slider'
import Switch from '@mui/material/Switch'
import Typography from '@mui/material/Typography'
import { OfficeStatus } from '../services/OfficePreferences'

const Layout = styled.div`
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr);
  min-height: 310px;
  color: #f2f3f6;
  background: #171a20;
  @media (max-width: 560px) { grid-template-columns: 112px minmax(0, 1fr); }
`
const Navigation = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-right: 1px solid #303541;
  button {
    border: 0; border-radius: 8px; padding: 9px 10px; text-align: left;
    color: #c4c8d0; background: transparent; cursor: pointer;
  }
  button.selected { color: #fff; background: #30354a; }
`
const Settings = styled.div`
  padding: 22px 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  .row { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
  .hint { color: #aeb4c1; font-size: 12px; line-height: 1.5; }
`

type Section = 'General' | 'Audio' | 'Video' | 'Chat'
type Props = {
  open: boolean
  onClose: () => void
  status: OfficeStatus
  setStatus: (value: OfficeStatus) => void
  microphones: MediaDeviceInfo[]
  cameras: MediaDeviceInfo[]
  activeMicId?: string
  activeCameraId?: string
  onSelectMic: (id: string) => void
  onSelectCamera: (id: string) => void
  nearbyVolume: number
  setNearbyVolume: (value: number) => void
  selfViewHidden: boolean
  setSelfViewHidden: (hidden: boolean) => void
  cameraMirrored: boolean
  setCameraMirrored: (mirrored: boolean) => void
}

export default function PreferencesDialog(props: Props) {
  const [section, setSection] = useState<Section>('General')
  const sections: Section[] = ['General', 'Audio', 'Video', 'Chat']
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ style: { background: '#171a20', color: '#f2f3f6', borderRadius: 14 } }}
    >
      <DialogTitle>Preferences</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        <Layout>
          <Navigation aria-label="Preferences sections">
            {sections.map((name) => (
              <button type="button" key={name} className={section === name ? 'selected' : ''} onClick={() => setSection(name)}>
                {name}
              </button>
            ))}
          </Navigation>
          <Settings>
            {section === 'General' && <>
              <Typography variant="subtitle1">Presence</Typography>
              <FormControl fullWidth size="small">
                <InputLabel id="presence-label">Status</InputLabel>
                <Select labelId="presence-label" label="Status" value={props.status}
                  onChange={(event) => props.setStatus(event.target.value as OfficeStatus)}>
                  <MenuItem value="active">🟢 Active</MenuItem>
                  <MenuItem value="busy">🎧 Busy</MenuItem>
                  <MenuItem value="away">🟠 Away</MenuItem>
                </Select>
              </FormControl>
              <div className="hint">Your status appears beside your name in the office.</div>
            </>}
            {section === 'Audio' && <>
              <Typography variant="subtitle1">Microphone and nearby voice</Typography>
              <FormControl fullWidth size="small">
                <InputLabel id="mic-label">Microphone</InputLabel>
                <Select labelId="mic-label" label="Microphone" value={props.activeMicId || ''}
                  onChange={(event) => props.onSelectMic(String(event.target.value))}>
                  {props.microphones.map((device) => <MenuItem key={device.deviceId} value={device.deviceId}>{device.label || 'Microphone'}</MenuItem>)}
                  {!props.microphones.length && <MenuItem value="" disabled>No microphone found</MenuItem>}
                </Select>
              </FormControl>
              <div>
                <div className="row"><span>Nearby voice volume</span><span>{props.nearbyVolume}%</span></div>
                <Slider min={0} max={100} value={props.nearbyVolume} onChange={(_, value) => props.setNearbyVolume(Array.isArray(value) ? value[0] : value)} aria-label="Nearby voice volume" />
              </div>
              <div className="hint">Voice fades as participants move farther away. People in closed meeting rooms cannot hear outside the room.</div>
            </>}
            {section === 'Video' && <>
              <Typography variant="subtitle1">Camera</Typography>
              <FormControl fullWidth size="small">
                <InputLabel id="camera-label">Camera</InputLabel>
                <Select labelId="camera-label" label="Camera" value={props.activeCameraId || ''}
                  onChange={(event) => props.onSelectCamera(String(event.target.value))}>
                  {props.cameras.map((device) => <MenuItem key={device.deviceId} value={device.deviceId}>{device.label || 'Camera'}</MenuItem>)}
                  {!props.cameras.length && <MenuItem value="" disabled>No camera found</MenuItem>}
                </Select>
              </FormControl>
              <FormControlLabel control={<Switch checked={props.selfViewHidden} onChange={(event) => props.setSelfViewHidden(event.target.checked)} />} label="Hide my camera preview" />
              <FormControlLabel control={<Switch checked={props.cameraMirrored} onChange={(event) => props.setCameraMirrored(event.target.checked)} />} label="Inverter câmera para todos" />
              <div className="hint">Your camera remains off until you turn it on from the bottom bar.</div>
            </>}
            {section === 'Chat' && <>
              <Typography variant="subtitle1">Chat history</Typography>
              <div className="hint">As mensagens ficam disponíveis durante todo o dia e são apagadas às 23:55 (horário de Brasília).</div>
            </>}
          </Settings>
        </Layout>
      </DialogContent>
    </Dialog>
  )
}
