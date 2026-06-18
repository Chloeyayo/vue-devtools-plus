(function () {
  const ALARM_NAME = 'vue-devtools-keep-alive'
  const PING_TYPE = '__VUE_DEVTOOLS_KEEPALIVE_PING__'
  // Chrome clamps chrome.alarms periods to a minimum of ~30s (and ~1min for
  // unpacked/release builds depending on channel), so 0.5 min is the realistic
  // floor. The offscreen document pings back on its own 20s timer below.
  const ALARM_PERIOD_MINUTES = 0.5

  let initialized = false
  let offscreenReady = false

  // The listener's existence is what wakes the service worker on each alarm
  // firing. While awake, we also refresh the offscreen document so its ping
  // loop keeps running.
  function onAlarm () {
    // Touch a chrome API to record activity, then ensure the offscreen
    // keep-alive page is alive. Both are best-effort.
    try {
      chrome.runtime.getPlatformInfo(() => {})
    } catch (e) {}
  }

  function startAlarms () {
    if (!chrome.alarms || !chrome.alarms.onAlarm) return false
    return chrome.alarms.clear(ALARM_NAME).then(() => chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: ALARM_PERIOD_MINUTES
    }))
      .then(() => {
        chrome.alarms.onAlarm.addListener(onAlarm)
        return true
      })
      .catch(() => false)
  }

  function startOffscreen () {
    if (offscreenReady || !chrome.offscreen || !chrome.offscreen.createDocument) return false

    const existing = typeof chrome.offscreen.hasDocument === 'function'
      ? chrome.offscreen.hasDocument().catch(() => false)
      : Promise.resolve(false)

    return existing.then(hasDocument => {
      if (hasDocument) {
        offscreenReady = true
        return true
      }

      return chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('offscreen.html'),
        // The offscreen page only keeps the service worker alive via periodic
        // runtime messages; there is no single reason that maps to "keep-alive".
        // BLOBS is the least-misleading available reason and is accepted by
        // Chrome at runtime. See keep-alive design notes.
        reasons: ['BLOBS'],
        justification: 'Keep the Vue Devtools service worker available while the devtools panel is open by posting periodic runtime messages'
      })
    })
      .then(() => {
        offscreenReady = true
        return true
      })
      .catch(e => {
        if (e.message && (e.message.includes('single offscreen') || e.message.includes('already'))) {
          offscreenReady = true
          return true
        }
        return false
      })
  }

  function init () {
    if (initialized) return
    initialized = true

    // Alarms are the primary MV3 keep-alive mechanism (they wake the SW on
    // each fire). The offscreen document is a secondary signal. Note: a
    // setInterval-based "self ping" does NOT work under MV3 — the timer dies
    // with the SW ~30s after it goes idle — so we deliberately avoid that.
    Promise.all([
      startAlarms(),
      startOffscreen()
    ]).then(() => {})
  }

  function onMessage (msg, sender, sendResponse) {
    if (msg && msg.type === PING_TYPE) {
      sendResponse(true)
      return true
    }
    return false
  }

  self.__vueDevtoolsKeepAlive = {
    init,
    onMessage
  }
})()
