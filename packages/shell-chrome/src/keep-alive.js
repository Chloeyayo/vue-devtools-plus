(function () {
  const ALARM_NAME = 'vue-devtools-keep-alive'
  const PING_TYPE = '__VUE_DEVTOOLS_KEEPALIVE_PING__'
  const SELF_PING_INTERVAL = 20000

  let selfPingTimer = null
  let initialized = false
  let offscreenReady = false

  // the listener's existence is what wakes the service worker on each alarm
  function onAlarm () {}

  function startAlarms () {
    if (!chrome.alarms || !chrome.alarms.onAlarm) return false
    return chrome.alarms.clear(ALARM_NAME).then(() => chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.1,
      periodInMinutes: 0.4
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
        reasons: ['BLOBS'],
        justification: 'Keep Vue Devtools service worker available while the devtools panel is open'
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

  function startSelfPing () {
    if (selfPingTimer) return
    selfPingTimer = setInterval(() => {
      chrome.runtime.getPlatformInfo(() => {})
    }, SELF_PING_INTERVAL)
  }

  function init () {
    if (initialized) return
    initialized = true

    Promise.all([
      startAlarms(),
      startOffscreen()
    ]).then(results => {
      if (!results[0] && !results[1]) {
        startSelfPing()
      }
    })
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
