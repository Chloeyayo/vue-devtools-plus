import { isBrowser, target } from '@utils/env'

const SHORTCUT_RUNTIME_KEY = '__VUE_DEVTOOLS_PAGE_SHORTCUTS__'

export function installPageShortcuts (bridge) {
  if (!isBrowser || !bridge) return

  const previous = target[SHORTCUT_RUNTIME_KEY]
  if (previous && previous.cleanup) {
    previous.cleanup()
  }

  const onKeyDown = event => {
    const shortcut = getShortcut(event)
    if (!shortcut) return

    event.preventDefault()
    event.stopImmediatePropagation()
    bridge.send('devtools-shortcut', {
      ...shortcut,
      eventId: shortcut.name + ':' + event.timeStamp
    })
  }

  window.addEventListener('keydown', onKeyDown, true)

  target[SHORTCUT_RUNTIME_KEY] = {
    cleanup () {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }
}

function getShortcut (event) {
  if (
    event.defaultPrevented ||
    event.repeat ||
    event.ctrlKey ||
    event.metaKey ||
    isEditableTarget(event)
  ) {
    return null
  }

  if (
    event.altKey &&
    !event.shiftKey &&
    isKey(event, 's', 'KeyS')
  ) {
    return {
      name: 'toggle-component-selector',
      source: 'page'
    }
  }

  if (
    event.altKey &&
    event.shiftKey &&
    isKey(event, 'f', 'KeyF')
  ) {
    return {
      name: 'enhanced-search',
      source: 'page'
    }
  }

  return null
}

function isKey (event, key, code) {
  return String(event.key || '').toLowerCase() === key || event.code === code
}

function isEditableTarget (event) {
  const target = event.composedPath
    ? event.composedPath()[0]
    : event.target

  if (!target || !target.tagName) return false

  const tag = target.tagName.toUpperCase()
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  )
}
