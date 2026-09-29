// A small local log survives F5 so an intermittent browser failure can be inspected.
// No chat messages, names, or media are recorded or transmitted.
export function installFreezeDiagnostics(canvas: HTMLCanvasElement): void {
  const key = 'skyoffice.freezeDiagnostics.v1'
  const record = (kind: string, detail: string) => {
    try {
      const parsed = JSON.parse(sessionStorage.getItem(key) || '[]')
      const entries = Array.isArray(parsed) ? parsed.slice(-19) : []
      entries.push({ at: new Date().toISOString(), kind, detail: detail.slice(0, 500) })
      sessionStorage.setItem(key, JSON.stringify(entries))
    } catch { /* Diagnostics must never interrupt the room. */ }
  }
  window.addEventListener('error', event => record('error', event.message))
  window.addEventListener('unhandledrejection', event => record('promise', String(event.reason)))
  canvas.addEventListener('webglcontextlost', () => record('graphics', 'WebGL context lost'))
  let lastTick = performance.now()
  document.addEventListener('visibilitychange', () => { lastTick = performance.now() })
  window.setInterval(() => {
    const now = performance.now()
    if (!document.hidden && now - lastTick > 5000) record('delay', `Page timer delayed by ${Math.round(now - lastTick)} ms`)
    lastTick = now
  }, 2000)
}
