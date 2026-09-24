let notificationContext: AudioContext | undefined

export function primeChatNotificationSound() {
  try {
    notificationContext ??= new AudioContext()
    if (notificationContext.state === 'suspended') {
      void notificationContext.resume().catch(() => undefined)
    }
  } catch (error) {
    console.warn('Chat notification sound is unavailable', error)
  }
}

export function playChatNotificationSound() {
  try {
    notificationContext ??= new AudioContext()
    const context = notificationContext
    const play = () => {
      if (context.state !== 'running') return
      const oscillator = context.createOscillator()
      const volume = context.createGain()
      const startAt = context.currentTime
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(740, startAt)
      oscillator.frequency.exponentialRampToValueAtTime(1040, startAt + 0.09)
      volume.gain.setValueAtTime(0.0001, startAt)
      volume.gain.exponentialRampToValueAtTime(0.16, startAt + 0.015)
      volume.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.24)
      oscillator.connect(volume)
      volume.connect(context.destination)
      oscillator.start(startAt)
      oscillator.stop(startAt + 0.25)
      oscillator.onended = () => {
        oscillator.disconnect()
        volume.disconnect()
      }
    }
    if (context.state === 'suspended') void context.resume().then(play).catch(() => undefined)
    else play()
  } catch (error) {
    console.warn('Could not play chat notification sound', error)
  }
}

export function playWaveNotificationSound() {
  try {
    notificationContext ??= new AudioContext()
    const context = notificationContext
    const play = () => {
      if (context.state !== 'running') return
      const startAt = context.currentTime
      // A light two-note chime, clearly different from the brighter message ping.
      ;[0, 0.12].forEach((offset, index) => {
        const oscillator = context.createOscillator()
        const volume = context.createGain()
        const onset = startAt + offset
        oscillator.type = 'triangle'
        oscillator.frequency.setValueAtTime(index === 0 ? 587.33 : 783.99, onset)
        volume.gain.setValueAtTime(0.0001, onset)
        volume.gain.exponentialRampToValueAtTime(0.09, onset + 0.012)
        volume.gain.exponentialRampToValueAtTime(0.0001, onset + 0.18)
        oscillator.connect(volume)
        volume.connect(context.destination)
        oscillator.start(onset)
        oscillator.stop(onset + 0.19)
        oscillator.onended = () => { oscillator.disconnect(); volume.disconnect() }
      })
    }
    if (context.state === 'suspended') void context.resume().then(play).catch(() => undefined)
    else play()
  } catch (error) {
    console.warn('Could not play wave notification sound', error)
  }
}

export function startCallRingtone() {
  try {
    notificationContext ??= new AudioContext()
    const context = notificationContext
    const ringOnce = () => {
      const startAt = context.currentTime
      ;[0, 0.24].forEach((offset, index) => {
        const oscillator = context.createOscillator()
        const volume = context.createGain()
        const onset = startAt + offset
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(index === 0 ? 480 : 620, onset)
        volume.gain.setValueAtTime(0.0001, onset)
        volume.gain.exponentialRampToValueAtTime(0.045, onset + 0.04)
        volume.gain.exponentialRampToValueAtTime(0.0001, onset + 0.42)
        oscillator.connect(volume)
        volume.connect(context.destination)
        oscillator.start(onset)
        oscillator.stop(onset + 0.44)
        oscillator.onended = () => { oscillator.disconnect(); volume.disconnect() }
      })
    }
    if (context.state === 'suspended') void context.resume().catch(() => undefined)
    ringOnce()
    const timer = window.setInterval(() => {
      if (context.state === 'running') ringOnce()
    }, 2800)
    return () => window.clearInterval(timer)
  } catch (error) {
    console.warn('Call ringtone is unavailable', error)
    return () => undefined
  }
}
