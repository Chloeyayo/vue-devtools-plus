// Persist the user's selected component across page reloads / HMR.
//
// Why: when the debugged page reloads (F5) or hot-reloads, the backend
// reconnects and the frontend rebuilds the component tree from scratch with
// fresh instance ids (`rootUID:_uid`). The previously inspected instance is
// lost and the user has to re-select it manually.
//
// Approach: remember the selected instance by its root-to-self name path
// (e.g. `Root > App > UserProfile`), which survives reloads and HMR because
// the tree rebuilds to the same names. On the first flush after a reconnect,
// if nothing is selected yet, walk the new tree and re-select the instance
// whose name path matches.

const STORAGE_KEY = '__vue-devtools-last-selected-path__'

// Whether the remembered path was set during this panel session. We only
// auto-restore selections the user made in the current session, so a stale
// path from a previous session never unexpectedly selects a component.
let inSession = false
let lastSelectedPath = null

function rememberInSession (path) {
  inSession = !!path
  lastSelectedPath = path
  try {
    if (path) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(path))
    } else {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  } catch (e) {}
}

/**
 * Build the root-to-instance name path for a captured instance node.
 * Falls back to the instance id segment when a node has no parent link.
 *
 * @param {object} instance a node from components/instancesMap (has `.parent`)
 * @returns {string[]}
 */
export function buildNamePath (instance) {
  if (!instance) return []
  const parts = []
  let cur = instance
  while (cur) {
    parts.unshift(cur.name || cur.id || '')
    cur = cur.parent
  }
  return parts
}

/**
 * Remember the currently selected instance so it can be restored after a
 * reload. Called whenever the user selects an instance.
 *
 * @param {object} instance
 */
export function rememberSelection (instance) {
  rememberInSession(buildNamePath(instance))
}

export function clearSelection () {
  rememberInSession(null)
}

/**
 * Find an instance in the tree whose root-to-self name path matches the last
 * remembered selection.
 *
 * @param {object[]} roots
 * @returns {object|null}
 */
function findByPath (roots) {
  if (!lastSelectedPath || !roots || !roots.length) return null
  let match = null

  function walk (node, depth) {
    if (match) return
    if (!node) return
    // Compare at the matching depth; only commit a match when we've consumed
    // the whole path (i.e. this node is the leaf we remembered).
    if (depth < lastSelectedPath.length && (node.name || '') === lastSelectedPath[depth]) {
      if (depth === lastSelectedPath.length - 1) {
        match = node
        return
      }
      const children = node.children || []
      for (let i = 0; i < children.length; i++) {
        walk(children[i], depth + 1)
        if (match) return
      }
    }
  }

  for (let i = 0; i < roots.length; i++) {
    walk(roots[i], 0)
    if (match) break
  }
  return match
}

/**
 * After a flush, re-select the previously selected component if it reappeared
 * and nothing is currently inspected. Returns true if a restore happened.
 *
 * @param {object} store the Vuex store
 * @returns {boolean}
 */
export function restoreSelection (store) {
  const state = store.state.components
  // Don't clobber an active selection (e.g. user already picked something).
  if (state.inspectedInstanceId) return false
  // Only restore selections made in the current panel session.
  if (!inSession) return false

  const match = findByPath(state.instances)
  if (!match) return false

  store.dispatch('components/selectInstance', match.id)
  return true
}
