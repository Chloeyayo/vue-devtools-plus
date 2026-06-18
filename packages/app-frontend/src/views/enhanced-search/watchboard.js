import Vue from 'vue'

export const WATCH_STORAGE_KEY = 'vue-devtools-watched'
export const WATCHBOARD_CHANGED_EVENT = 'vue-devtools-watchboard-changed'
export const WATCH_POLL_INTERVAL = 1000

// Teardown script: tears down every page-side $watch the watchboard created
// and drops the runtime. Evaluated when the panel is closed so the debugged
// page stops paying for watchers it can no longer report to anyone.
export const PAGE_WATCH_TEARDOWN_SCRIPT = `
function () {
  var RUNTIME_KEY = '__VUE_DEVTOOLS_WATCHBOARD_RUNTIME__'
  var runtime = window[RUNTIME_KEY]
  if (!runtime) return { tornDown: 0 }
  var count = 0
  if (runtime.watchers) {
    Object.keys(runtime.watchers).forEach(function (key) {
      var watcher = runtime.watchers[key]
      if (watcher && watcher.unwatch) {
        try { watcher.unwatch() } catch (e) {}
        count++
      }
    })
  }
  delete window[RUNTIME_KEY]
  return { tornDown: count }
}
`

export const PAGE_WATCH_SCRIPT = `
function (items) {
  var MAX_DEPTH = 6
  var MAX_KEYS = 80
  var MAX_STRING = 200
  var MAX_DIFF_CHANGES = 40
  var MAX_QUEUE = 500
  var RUNTIME_KEY = '__VUE_DEVTOOLS_WATCHBOARD_RUNTIME__'
  var instanceMap = window.__VUE_DEVTOOLS_INSTANCE_MAP__
  var results = []
  var runtime = window[RUNTIME_KEY]

  if (!runtime) {
    runtime = window[RUNTIME_KEY] = {
      watchers: {},
      queue: [],
      seq: 0
    }
  }

  function normalizeWatchPath(path) {
    return String(path || '').replace(/\\[(\\d+)\\]/g, '.$1')
  }

  function normalizePath(path) {
    return String(path || '').replace(/\\[(\\d+)\\]/g, '.$1').split('.').filter(Boolean)
  }

  function watchKey(item) {
    return String(item.uid) + '::' + normalizeWatchPath(item.path)
  }

  function findInstance(uid) {
    if (!instanceMap) instanceMap = window.__VUE_DEVTOOLS_INSTANCE_MAP__
    if (instanceMap) {
      if (instanceMap.has(uid)) return instanceMap.get(uid)
      var strUid = String(uid)
      if (instanceMap.has(strUid)) return instanceMap.get(strUid)
    }

    // Cache DOM-scan resolutions for this invocation so we don't re-scan the
    // whole document once per watched item on every poll tick.
    if (!runtime.uidCache) runtime.uidCache = {}
    if (Object.prototype.hasOwnProperty.call(runtime.uidCache, uid)) {
      return runtime.uidCache[uid]
    }

    var found = null
    var all = document.querySelectorAll('*')
    for (var i = 0; i < all.length; i++) {
      if (all[i].__vue__) {
        var vm = all[i].__vue__
        if (vm.__VUE_DEVTOOLS_UID__ == uid || vm._uid == uid) { found = vm; break }
        if (vm.$root && (vm.$root.__VUE_DEVTOOLS_UID__ == uid || vm.$root._uid == uid)) { found = vm.$root; break }
      }
    }
    runtime.uidCache[uid] = found
    return found
  }

  function isDestroyed(vm) {
    return !vm || vm._isDestroyed || vm._isBeingDestroyed
  }

  function isElement(value) {
    return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
  }

  function getComponentName(vm) {
    var opt = vm.$options || {}
    var name = opt.name || opt._componentTag
    if (name) return name
    if (opt.__file) {
      var file = opt.__file.replace(/^.*[\\\\/]/, '').replace(/\\.vue$/, '')
      return file.charAt(0).toUpperCase() + file.slice(1)
    }
    return 'Anonymous'
  }

  function readPath(vm, path) {
    var val = vm
    var parts = normalizePath(path)
    for (var i = 0; i < parts.length; i++) {
      if (val === null || val === undefined) return undefined
      val = val[parts[i]]
    }
    return val
  }

  function valueType(value) {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (Array.isArray(value)) return 'array'
    if (isElement(value)) return 'element'
    if (value && value._isVue) return 'vue'
    return typeof value
  }

  function displayValue(value) {
    if (value === undefined) return 'undefined'
    if (value === null) return 'null'
    if (typeof value === 'function') return 'fn()'
    if (Array.isArray(value)) return 'Array[' + value.length + ']'
    if (typeof value === 'object') return '{...}'
    return String(value)
  }

  function shortText(value, limit) {
    value = String(value)
    limit = limit || 80
    return value.length > limit ? value.substring(0, limit) + '...' : value
  }

  function trimString(value) {
    value = String(value)
    return value.length > MAX_STRING ? value.substring(0, MAX_STRING) + '...' : value
  }

  function safeSnapshot(value, depth, seen) {
    if (value === undefined) return { t: 'undefined', v: 'undefined' }
    if (value === null) return { t: 'null', v: null }
    if (typeof value === 'string') return { t: 'string', v: trimString(value) }
    if (typeof value === 'number' || typeof value === 'boolean') return { t: typeof value, v: value }
    if (typeof value === 'function') return { t: 'function', v: 'fn()' }
    if (isElement(value)) return { t: 'element', v: '<' + value.tagName.toLowerCase() + '>' }
    if (value && value._isVue) return { t: 'vue', v: '<Vue:' + getComponentName(value) + '>' }
    if (depth >= MAX_DEPTH) return { t: 'max-depth', v: displayValue(value) }
    if (typeof value !== 'object') return { t: typeof value, v: trimString(value) }

    if (seen) {
      if (seen.has(value)) return { t: 'circular', v: '[Circular]' }
      seen.add(value)
    }

    if (Array.isArray(value)) {
      var items = []
      var limit = Math.min(value.length, MAX_KEYS)
      for (var i = 0; i < limit; i++) {
        items.push(safeSnapshot(value[i], depth + 1, seen))
      }
      return {
        t: 'array',
        length: value.length,
        items: items,
        truncated: value.length > limit
      }
    }

    var props = {}
    var keys = Object.keys(value).filter(function (key) {
      return key.charAt(0) !== '$' && (key.charAt(0) !== '_' || key === '_uid')
    }).sort()
    var propLimit = Math.min(keys.length, MAX_KEYS)
    for (var k = 0; k < propLimit; k++) {
      var propKey = keys[k]
      try {
        props[propKey] = safeSnapshot(value[propKey], depth + 1, seen)
      } catch (e) {
        props[propKey] = { t: 'error', v: 'Error' }
      }
    }
    return {
      t: 'object',
      props: props,
      truncated: keys.length > propLimit
    }
  }

  function previewSnapshot(snapshot) {
    if (!snapshot) return ''
    switch (snapshot.t) {
      case 'array':
        return 'Array[' + snapshot.length + ']'
      case 'object':
        return '{...}'
      case 'undefined':
        return 'undefined'
      case 'null':
        return 'null'
      default:
        return String(snapshot.v)
    }
  }

  function snapshotEqual(a, b) {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  function makeDiffPath(base, segment) {
    if (!base) return segment || 'value'
    if (!segment) return base
    return segment.charAt(0) === '[' ? base + segment : base + '.' + segment
  }

  function pushDiff(changes, type, path, before, after) {
    if (changes.length >= MAX_DIFF_CHANGES) return
    changes.push({
      type: type,
      path: path || 'value',
      before: shortText(previewSnapshot(before)),
      after: shortText(previewSnapshot(after))
    })
  }

  function diffSnapshots(before, after, path, changes) {
    path = path || ''
    changes = changes || []
    if (changes.length >= MAX_DIFF_CHANGES || snapshotEqual(before, after)) {
      return changes
    }

    if (!before) {
      pushDiff(changes, 'added', path, null, after)
      return changes
    }
    if (!after) {
      pushDiff(changes, 'removed', path, before, null)
      return changes
    }
    if (before.t !== after.t) {
      pushDiff(changes, 'changed', path, before, after)
      return changes
    }

    if (before.t === 'object') {
      var beforeProps = before.props || {}
      var afterProps = after.props || {}
      var keyMap = {}
      Object.keys(beforeProps).forEach(function (key) { keyMap[key] = true })
      Object.keys(afterProps).forEach(function (key) { keyMap[key] = true })
      Object.keys(keyMap).sort().forEach(function (key) {
        if (changes.length >= MAX_DIFF_CHANGES) return
        if (!Object.prototype.hasOwnProperty.call(beforeProps, key)) {
          pushDiff(changes, 'added', makeDiffPath(path, key), null, afterProps[key])
        } else if (!Object.prototype.hasOwnProperty.call(afterProps, key)) {
          pushDiff(changes, 'removed', makeDiffPath(path, key), beforeProps[key], null)
        } else {
          diffSnapshots(beforeProps[key], afterProps[key], makeDiffPath(path, key), changes)
        }
      })
      return changes
    }

    if (before.t === 'array') {
      if (before.length !== after.length) {
        pushDiff(
          changes,
          'changed',
          makeDiffPath(path, 'length'),
          { t: 'number', v: before.length },
          { t: 'number', v: after.length }
        )
      }
      var limit = Math.max(before.items ? before.items.length : 0, after.items ? after.items.length : 0)
      for (var i = 0; i < limit && changes.length < MAX_DIFF_CHANGES; i++) {
        var beforeItem = before.items && before.items[i]
        var afterItem = after.items && after.items[i]
        var itemPath = makeDiffPath(path, '[' + i + ']')
        if (!beforeItem) {
          pushDiff(changes, 'added', itemPath, null, afterItem)
        } else if (!afterItem) {
          pushDiff(changes, 'removed', itemPath, beforeItem, null)
        } else {
          diffSnapshots(beforeItem, afterItem, itemPath, changes)
        }
      }
      return changes
    }

    pushDiff(changes, 'changed', path, before, after)
    return changes
  }

  function queueEvent(event) {
    event.id = ++runtime.seq
    event.time = Date.now()
    runtime.queue.push(event)
    if (runtime.queue.length > MAX_QUEUE) {
      runtime.queue.splice(0, runtime.queue.length - MAX_QUEUE)
    }
  }

  function teardownWatcher(key) {
    var watcher = runtime.watchers[key]
    if (!watcher) return
    if (watcher.unwatch) {
      try {
        watcher.unwatch()
      } catch (e) {}
    }
    delete runtime.watchers[key]
  }

  function createWatcher(rawItem) {
    var item = {
      uid: rawItem.uid,
      path: normalizeWatchPath(rawItem.path),
      mode: rawItem.mode === 'deep' ? 'deep' : 'value'
    }
    var key = watchKey(item)
    var vm = findInstance(item.uid)
    if (isDestroyed(vm) || typeof vm.$watch !== 'function') {
      runtime.watchers[key] = {
        uid: item.uid,
        path: item.path,
        mode: item.mode,
        missing: true
      }
      return
    }

    var current = readPath(vm, item.path)
    var watcher = runtime.watchers[key] = {
      uid: item.uid,
      path: item.path,
      mode: item.mode,
      vm: vm,
      value: displayValue(current),
      snapshot: safeSnapshot(current, 0, typeof WeakSet !== 'undefined' ? new WeakSet() : null),
      unwatch: null
    }

    watcher.unwatch = vm.$watch(function () {
      return readPath(vm, item.path)
    }, function (newValue, oldValue) {
      var afterSnapshot = safeSnapshot(newValue, 0, typeof WeakSet !== 'undefined' ? new WeakSet() : null)
      var changes

      if (item.mode === 'deep') {
        changes = diffSnapshots(watcher.snapshot, afterSnapshot)
      } else {
        var beforeValue = displayValue(oldValue)
        var afterValue = displayValue(newValue)
        changes = beforeValue === afterValue
          ? []
          : [{
            type: 'changed',
            path: 'value',
            before: shortText(beforeValue),
            after: shortText(afterValue)
          }]
      }

      watcher.value = displayValue(newValue)
      watcher.snapshot = afterSnapshot

      if (changes.length) {
        queueEvent({
          uid: item.uid,
          path: item.path,
          mode: item.mode,
          value: watcher.value,
          snapshot: afterSnapshot,
          changes: changes
        })
      }
    }, {
      deep: item.mode === 'deep'
    })
  }

  function syncWatchers(items) {
    var keep = {}

    items.forEach(function (rawItem) {
      var item = {
        uid: rawItem.uid,
        path: normalizeWatchPath(rawItem.path),
        mode: rawItem.mode === 'deep' ? 'deep' : 'value'
      }
      var key = watchKey(item)
      var existing = runtime.watchers[key]
      keep[key] = true

      if (existing && existing.mode === item.mode && existing.unwatch && !isDestroyed(existing.vm)) {
        return
      }

      teardownWatcher(key)
      createWatcher(item)
    })

    Object.keys(runtime.watchers).forEach(function (key) {
      if (!keep[key]) {
        teardownWatcher(key)
      }
    })
  }

  function drainEvents() {
    return runtime.queue.splice(0, runtime.queue.length)
  }

  items = (items || []).map(function (item) {
    return {
      uid: item.uid,
      path: normalizeWatchPath(item.path),
      mode: item.mode === 'deep' ? 'deep' : 'value'
    }
  })

  // Refresh the DOM-scan resolution cache each invocation; instances may have
  // been created/destroyed between polls.
  runtime.uidCache = {}

  syncWatchers(items)

  items.forEach(function (item) {
    try {
      var vm = findInstance(item.uid)
      if (!vm) {
        results.push({ uid: item.uid, path: item.path, value: '<destroyed>' })
        return
      }
      var value = readPath(vm, item.path)
      var watcher = runtime.watchers[watchKey(item)]
      if (watcher) {
        watcher.value = displayValue(value)
      }
      results.push({
        uid: item.uid,
        path: item.path,
        value: displayValue(value),
        valueType: valueType(value),
        snapshot: safeSnapshot(value, 0, typeof WeakSet !== 'undefined' ? new WeakSet() : null)
      })
    } catch (e) {
      results.push({ uid: item.uid, path: item.path, value: 'Error' })
    }
  })

  return {
    values: results,
    events: drainEvents()
  }
}
`

export const watchboardState = Vue.observable({
  watched: loadWatched()
})

export function normalizeWatchPath (path) {
  return String(path || '').replace(/\[(\d+)\]/g, '.$1')
}

export function watchKey (uid, path) {
  return uid + '::' + normalizeWatchPath(path)
}

export function watchMode (item) {
  return item && item.mode === 'deep' ? 'deep' : 'value'
}

export function defaultWatchMode (entry) {
  let value = entry.value || ''
  return /^Array\[/.test(value) || value.charAt(0) === '{' ? 'deep' : 'value'
}

export function watchedItem (watched, uid, path) {
  let key = watchKey(uid, path)
  return watched.find(item => watchKey(item.uid, item.path) === key)
}

export function isWatched (watched, uid, path) {
  return !!watchedItem(watched, uid, path)
}

export function isWatchedMode (watched, uid, path, mode) {
  let item = watchedItem(watched, uid, path)
  return !!item && watchMode(item) === mode
}

export function normalizeWatchItem (item) {
  return {
    uid: item.uid,
    path: normalizeWatchPath(item.path),
    name: item.name,
    type: item.type,
    mode: item.mode === 'deep' ? 'deep' : 'value'
  }
}

export function normalizeWatchedList (watched) {
  if (!Array.isArray(watched)) return []

  let indexes = {}
  return watched.reduce((list, raw) => {
    if (!raw || raw.uid == null || !raw.path) return list

    let item = normalizeWatchItem(raw)
    let key = watchKey(item.uid, item.path)
    if (indexes[key] != null) {
      list.splice(indexes[key], 1, item)
    } else {
      indexes[key] = list.length
      list.push(item)
    }
    return list
  }, [])
}

export function buildWatchItem (entry, mode = null) {
  return normalizeWatchItem({
    uid: entry.compUid || entry.uid,
    path: entry.propPath || entry.path,
    name: entry.compName || entry.name,
    type: entry.propType || entry.type,
    mode: mode || entry.mode || defaultWatchMode(entry)
  })
}

export function applyWatchToggle (watched, entry, mode = null) {
  let item = buildWatchItem(entry, mode)
  let previous = watchedItem(watched, item.uid, item.path)
  let next = watched.slice()
  let index = watched.indexOf(previous)
  let removed = false

  if (index >= 0) {
    if (watchMode(previous) === item.mode) {
      next.splice(index, 1)
      removed = true
    } else {
      next.splice(index, 1, item)
    }
  } else {
    next.push(item)
  }

  return {
    watched: next,
    item,
    previous,
    removed
  }
}

export function loadWatched () {
  if (typeof window === 'undefined') return []

  try {
    return normalizeWatchedList(JSON.parse(window.localStorage.getItem(WATCH_STORAGE_KEY) || '[]'))
  } catch (e) {
    return []
  }
}

export function syncWatchedFromStorage () {
  watchboardState.watched = loadWatched()
  return watchboardState.watched
}

export function saveWatched (watched, publish = true) {
  watchboardState.watched = normalizeWatchedList(watched)

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(WATCH_STORAGE_KEY, JSON.stringify(watchboardState.watched))
    if (publish) {
      window.dispatchEvent(new window.CustomEvent(WATCHBOARD_CHANGED_EVENT, {
        detail: {
          watched: watchboardState.watched
        }
      }))
    }
  }

  return watchboardState.watched
}

export function toggleWatch (entry, mode = null) {
  let result = applyWatchToggle(watchboardState.watched, entry, mode)
  result.watched = saveWatched(result.watched)
  return result
}
