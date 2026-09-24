import React, { useState } from 'react'
import styled from 'styled-components'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'

import AvatarPicker from './AvatarPicker'
import { AvatarChoice } from '../avatarConfig'

const Centered = styled.div`
  display: flex;
  justify-content: center;
  padding: 8px 0;
`

type Props = {
  open: boolean
  initialValue: AvatarChoice
  onClose: () => void
  onSave: (value: AvatarChoice) => void
  onPreview?: (value: AvatarChoice) => void
}

export default function EditAvatarDialog({ open, initialValue, onClose, onSave, onPreview }: Props) {
  // Keep a draft and preview changes live; cancel restores the saved look.
  const [draft, setDraft] = useState<AvatarChoice>(initialValue)
  const updateDraft = (value: AvatarChoice) => {
    setDraft(value)
    onPreview?.(value)
  }
  const cancel = () => {
    setDraft(initialValue)
    onPreview?.(initialValue)
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={cancel}
      TransitionProps={{ onEnter: () => setDraft(initialValue) }}
      PaperProps={{ style: { background: '#222639', color: '#eee' } }}
    >
      <DialogTitle>Edit avatar</DialogTitle>
      <DialogContent>
        <Centered>
          <AvatarPicker value={draft} onChange={updateDraft} />
        </Centered>
      </DialogContent>
      <DialogActions>
        <Button onClick={cancel} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          color="secondary"
          onClick={() => {
            onSave(draft)
            onClose()
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  )
}
