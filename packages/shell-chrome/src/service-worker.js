/* global importScripts */

importScripts('keep-alive.js')

const ports = new Map()
const ZOMBIE_INTERVAL = 45000
const ZOMBIE_MAX_AGE = 90000

function isNumeric (str) {
  return +str + '' === str
}

function injectProxy (tabId) {
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['build/proxy.js']
  }, res => {
    if (!res) {
      const conn = ports.get(String(tabId))
      if (conn && conn.devtools) {
        try {
          conn.devtools.postMessage('proxy-fail')
        } catch (e) {}
      }
    }
  })
}

function reinjectProxy (tabKey) {
  const tabId = +tabKey
  let done = false
  let attempts = 0
  let updateListener = null

  function tryInject () {
    if (done) return
    chrome.scripting.executeScript({
      target: { tabId },
      files: ['build/proxy.js']
    }, res => {
      if (res) {
        done = true
      } else if (++attempts < 3) {
        setTimeout(tryInject, 800)
      }
    })
  }

  function cleanup () {
    if (updateListener) {
      try {
        chrome.tabs.onUpdated.removeListener(updateListener)
      } catch (e) {}
      updateListener = null
    }
  }

  updateListener = function (id, info) {
    if (id === tabId && info.status === 'complete') {
      cleanup()
      tryInject()
    }
  }

  chrome.tabs.onUpdated.addListener(updateListener)
  setTimeout(() => {
    cleanup()
    tryInject()
  }, 1500)
  setTimeout(cleanup, 10000)
}

function doublePipe (id, devtools, backend) {
  function devtoolsToBackend (message) {
    if (message.event === 'log') return
    try {
      backend.postMessage(message)
    } catch (e) {}
  }

  function backendToDevtools (message) {
    if (message.event === 'log') return
    try {
      devtools.postMessage(message)
    } catch (e) {}
  }

  function onBackendDisconnect () {
    backend.onMessage.removeListener(backendToDevtools)
    backend.onDisconnect.removeListener(onBackendDisconnect)
    const conn = ports.get(id)
    if (conn) {
      conn.backend = null
      conn.ts = Date.now()
    }
    reinjectProxy(id)
  }

  function onDevtoolsDisconnect () {
    devtools.onMessage.removeListener(devtoolsToBackend)
    devtools.onDisconnect.removeListener(onDevtoolsDisconnect)
    try {
      backend.onMessage.removeListener(backendToDevtools)
      backend.onDisconnect.removeListener(onBackendDisconnect)
      devtools.disconnect()
      backend.disconnect()
    } catch (e) {}
    ports.delete(id)
  }

  devtools.onMessage.addListener(devtoolsToBackend)
  backend.onMessage.addListener(backendToDevtools)
  devtools.onDisconnect.addListener(onDevtoolsDisconnect)
  backend.onDisconnect.addListener(onBackendDisconnect)

  const conn = ports.get(id)
  if (conn) {
    conn.unbridge = () => {
      devtools.onMessage.removeListener(devtoolsToBackend)
      devtools.onDisconnect.removeListener(onDevtoolsDisconnect)
    }
  }
}

setInterval(() => {
  const now = Date.now()
  ports.forEach((conn, id) => {
    if ((!conn.devtools || !conn.backend) && now - conn.ts > ZOMBIE_MAX_AGE) {
      try {
        conn.devtools && conn.devtools.disconnect()
        conn.backend && conn.backend.disconnect()
      } catch (e) {}
      ports.delete(id)
    }
  })
}, ZOMBIE_INTERVAL)

chrome.runtime.onConnect.addListener(port => {
  let tab
  let name
  if (isNumeric(port.name)) {
    tab = port.name
    name = 'devtools'
    injectProxy(+port.name)
  } else {
    tab = String(port.sender.tab.id)
    name = 'backend'
  }

  if (!ports.has(tab)) {
    ports.set(tab, {
      devtools: null,
      backend: null,
      unbridge: null,
      ts: Date.now()
    })
  }

  const conn = ports.get(tab)
  if (name === 'backend' && conn.devtools && conn.unbridge) {
    conn.unbridge()
    conn.unbridge = null
  }

  conn[name] = port
  conn.ts = Date.now()

  if (conn.devtools && conn.backend) {
    doublePipe(tab, conn.devtools, conn.backend)
  }
})

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (self.__vueDevtoolsKeepAlive && self.__vueDevtoolsKeepAlive.onMessage(req, sender, sendResponse)) {
    return true
  }

  if (sender.tab && req.vueDetected) {
    const suffix = req.nuxtDetected ? '.nuxt' : ''

    chrome.action.setIcon({
      tabId: sender.tab.id,
      path: {
        16: chrome.runtime.getURL(`icons/16${suffix}.png`),
        48: chrome.runtime.getURL(`icons/48${suffix}.png`),
        128: chrome.runtime.getURL(`icons/128${suffix}.png`)
      }
    }, () => {})
    chrome.action.setPopup({
      tabId: sender.tab.id,
      popup: chrome.runtime.getURL(`${req.devtoolsEnabled ? 'popups/enabled' : 'popups/disabled'}${suffix}.html`)
    }, () => {})
  }
})

if (self.__vueDevtoolsKeepAlive) {
  self.__vueDevtoolsKeepAlive.init()
}
