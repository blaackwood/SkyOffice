import React, { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import Box from '@mui/material/Box'
import IconButton from '@mui/material/IconButton'
import MenuBookIcon from '@mui/icons-material/MenuBook'
import CloseIcon from '@mui/icons-material/Close'

import { hasStudyPin, submitStudyHours } from '../services/RankEstudosLive'

interface Props {
  open: boolean
  playerName: string
  onClose: () => void
}

export default function RankEstudosDialog({ open, playerName, onClose }: Props) {
  const [hours, setHours] = useState('')
  const [questions, setQuestions] = useState('')
  const [flashcards, setFlashcards] = useState('')
  const [corrections, setCorrections] = useState('')
  const [classHours, setClassHours] = useState('')
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [pinExists, setPinExists] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!open) return
    setHours('')
    setQuestions('')
    setFlashcards('')
    setCorrections('')
    setClassHours('')
    setPin('')
    setConfirmation('')
    setError('')
    setSuccess(false)
    setPinExists(null)
    let cancelled = false
    hasStudyPin(playerName)
      .then((exists) => { if (!cancelled) setPinExists(exists) })
      .catch(() => { if (!cancelled) setError('Não consegui consultar o PIN no RankEstudos.') })
    return () => { cancelled = true }
  }, [open, playerName])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      await submitStudyHours(playerName, {
        hours: Number(hours) || 0,
        questions: Number(questions) || 0,
        flashcards: Number(flashcards) || 0,
        corrections: Number(corrections) || 0,
        classHours: Number(classHours) || 0,
      }, pin, confirmation)
      setSuccess(true)
      window.setTimeout(onClose, 900)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível lançar as horas.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { overflow: 'hidden', border: '1px solid #353c4a', borderRadius: 3, color: '#edf1f8', background: '#1b202a', boxShadow: '0 24px 80px #0009' } }}
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 3, py: 2.5, borderBottom: '1px solid #303744', background: '#202631' }}>
          <Box sx={{ width: 40, height: 40, display: 'grid', placeItems: 'center', flex: 'none', borderRadius: 2, color: '#66e3d0', background: '#163a3d' }}>
            <MenuBookIcon />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ mb: .25, color: '#7fe5d5', fontSize: 10, fontWeight: 750, letterSpacing: '.12em', textTransform: 'uppercase' }}>RankEstudos</Box>
            <Box sx={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>Lançar horas</Box>
            <Box sx={{ mt: .35, color: '#9da8b9', fontSize: 12, fontWeight: 400 }}>Registre o que você estudou</Box>
          </Box>
          <IconButton aria-label="Fechar" onClick={onClose} disabled={loading} size="small" sx={{ alignSelf: 'flex-start', color: '#aab3c2' }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ px: 3, pt: '20px !important', pb: 1.5 }}>
          <Alert severity="info" sx={{ mb: 2.25, py: .25, border: '1px solid #21444f', borderRadius: 2, color: '#c4e9f4', background: '#152932', '& .MuiAlert-icon': { color: '#50c8e8' } }}>
            Lançamento para <strong>{playerName || 'seu nome'}</strong>.
          </Alert>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' }, gap: 1.25, '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#202630' }, '& .MuiInputLabel-root': { color: '#aab4c3' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3c4554' }, '& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#65748a' }, '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#56cbbd' } }}>
            <TextField autoFocus fullWidth type="number" label="Horas" value={hours}
              onChange={(event) => setHours(event.target.value)} inputProps={{ min: 0, max: 24, step: 0.01 }} />
            <TextField fullWidth type="number" label="Questões" value={questions}
              onChange={(event) => setQuestions(event.target.value)} inputProps={{ min: 0, max: 3000, step: 1 }} />
            <TextField fullWidth type="number" label="Flashcards" value={flashcards}
              onChange={(event) => setFlashcards(event.target.value)} inputProps={{ min: 0, max: 5000, step: 1 }} />
            <TextField fullWidth type="number" label="Correções" value={corrections}
              onChange={(event) => setCorrections(event.target.value)} inputProps={{ min: 0, max: 3000, step: 1 }} />
            <TextField fullWidth type="number" label="Aula assistida (horas)" value={classHours}
              onChange={(event) => setClassHours(event.target.value)} inputProps={{ min: 0, max: 24, step: 0.01 }} />
          </Box>
          <TextField
            fullWidth
            required
            type="password"
            label={pinExists === false ? 'Crie um PIN (4 a 6 números)' : 'PIN do RankEstudos'}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            inputProps={{ inputMode: 'numeric', maxLength: 6, autoComplete: 'new-password' }}
            sx={{ mt: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#202630' }, '& .MuiInputLabel-root': { color: '#aab4c3' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3c4554' }, '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#56cbbd' } }}
          />
          {pinExists === false && (
            <TextField
              fullWidth
              required
              type="password"
              label="Confirme o novo PIN"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              inputProps={{ inputMode: 'numeric', maxLength: 6, autoComplete: 'new-password' }}
              sx={{ mt: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2, background: '#202630' }, '& .MuiInputLabel-root': { color: '#aab4c3' }, '& .MuiOutlinedInput-notchedOutline': { borderColor: '#3c4554' }, '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#56cbbd' } }}
            />
          )}
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          {success && <Alert severity="success" sx={{ mt: 1 }}>Horas lançadas!</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, mt: 1, borderTop: '1px solid #303744', background: '#1e232d' }}>
          <Button onClick={onClose} disabled={loading} sx={{ px: 2, color: '#b6c0cf', borderRadius: 2 }}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={loading || pinExists === null || success} sx={{ px: 2.25, py: 1, borderRadius: 2, color: '#0f2526', background: '#59d2c0', fontWeight: 750, boxShadow: 'none', '&:hover': { background: '#74e2d0', boxShadow: 'none' }, '&.Mui-disabled': { color: '#78828d', background: '#34434a' } }}>
            {loading ? 'Salvando…' : 'Lançar horas'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
