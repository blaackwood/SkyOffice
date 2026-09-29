import React, { useState } from 'react'
import styled from 'styled-components'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'
import AvatarPicker from './AvatarPicker'
import { AvatarChoice } from '../avatarConfig'

const Centered = styled.div`display:flex;justify-content:center;padding:0;`
type Props = { open:boolean; initialValue:AvatarChoice; playerName?:string; onClose:()=>void; onSave:(value:AvatarChoice)=>void; onPreview?:(value:AvatarChoice)=>void }
export default function EditAvatarDialog({open,initialValue,playerName,onClose,onSave,onPreview}:Props) {
 const [draft,setDraft]=useState<AvatarChoice>(initialValue)
 const update=(value:AvatarChoice)=>{setDraft(value);onPreview?.(value)}
 const cancel=()=>{setDraft(initialValue);onPreview?.(initialValue);onClose()}
 return <Dialog open={open} onClose={cancel} maxWidth={false} TransitionProps={{onEnter:()=>setDraft(initialValue)}} PaperProps={{style:{background:'#191b1e',color:'#eee',maxWidth:'none',borderRadius:10,margin:8}}}>
  <DialogTitle style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 20px'}}>Editar avatar<IconButton onClick={cancel} size="small" aria-label="Fechar editor" style={{color:'#c6c8cc'}}><CloseIcon/></IconButton></DialogTitle>
  <DialogContent style={{padding:0,overflow:'hidden'}}><Centered><AvatarPicker value={draft} onChange={update} playerName={playerName}/></Centered></DialogContent>
  <DialogActions><Button onClick={cancel} color="inherit">Cancelar</Button><Button variant="contained" color="secondary" onClick={()=>{onSave(draft);onClose()}}>Concluir</Button></DialogActions>
 </Dialog>
}

