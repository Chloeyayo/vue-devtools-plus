window.addEventListener('message', e => {
  if (e.source === window && e.data && e.data.key === '_vue-devtools-send-message') {
    chrome.runtime.sendMessage(e.data.message)
  }
})

if (document instanceof HTMLDocument) {
  const script = document.createElement('script')
  script.src = chrome.runtime.getURL('build/detector-exec.js')
  script.onload = () => {
    script.remove()
  }
  ;(document.head || document.documentElement).appendChild(script)
}
