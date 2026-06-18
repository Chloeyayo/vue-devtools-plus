(function () {
  const message = { type: '__VUE_DEVTOOLS_KEEPALIVE_PING__' }

  function ping () {
    try {
      chrome.runtime.sendMessage(message).catch(() => {})
    } catch (e) {}
  }

  ping()
  setInterval(ping, 20000)
})()
