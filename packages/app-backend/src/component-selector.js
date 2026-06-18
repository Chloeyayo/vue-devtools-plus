import { highlight, unHighlight } from './highlighter'
import { findRelatedComponent, getSelectableComponent } from './utils'
import { getInstanceName, getInstanceFile } from './index'
import { isBusinessComponent } from '@utils/util'
import { isBrowser } from '@utils/env'

const MAX_TEXT_LENGTH = 240
const MAX_SEARCH_DEPTH = 8
const MAX_SEARCH_KEYS = 2500
const MAX_ARRAY_ITEMS = 200

export default class ComponentSelector {
  constructor (bridge, instanceMap) {
    const self = this
    self.bridge = bridge
    self.instanceMap = instanceMap
    self.bindMethods()

    bridge.on('start-component-selector', self.startSelecting)
    bridge.on('stop-component-selector', self.stopSelecting)
  }

  /**
   * Adds event listeners for mouseover and mouseup
   */
  startSelecting () {
    if (!isBrowser) return
    window.addEventListener('mouseover', this.elementMouseOver, true)
    window.addEventListener('click', this.elementClicked, true)
    window.addEventListener('mouseout', this.cancelEvent, true)
    window.addEventListener('mouseenter', this.cancelEvent, true)
    window.addEventListener('mouseleave', this.cancelEvent, true)
    window.addEventListener('mousedown', this.cancelEvent, true)
    window.addEventListener('mouseup', this.cancelEvent, true)
  }

  /**
   * Removes event listeners
   */
  stopSelecting () {
    if (!isBrowser) return
    window.removeEventListener('mouseover', this.elementMouseOver, true)
    window.removeEventListener('click', this.elementClicked, true)
    window.removeEventListener('mouseout', this.cancelEvent, true)
    window.removeEventListener('mouseenter', this.cancelEvent, true)
    window.removeEventListener('mouseleave', this.cancelEvent, true)
    window.removeEventListener('mousedown', this.cancelEvent, true)
    window.removeEventListener('mouseup', this.cancelEvent, true)

    unHighlight()
    this.selectedInstance = null
    this.lastTargetEl = null
    this.lastResolved = null
    this.lastCandidatesSignature = null
    this.bridge.send('component-selector-candidates', null)
  }

  /**
   * Resolves candidates, selection and DOM-text state match for a target
   * element, caching by element so hover and click share one computation.
   * @param {Element} el
   */
  resolveTarget (el) {
    if (el === this.lastTargetEl && this.lastResolved) {
      return this.lastResolved
    }

    const candidates = findComponentCandidates(el)
    const selected = candidates.find(candidate => candidate.isBusiness) || candidates[0]

    this.lastTargetEl = el
    this.lastResolved = {
      candidates,
      instance: selected
        ? selected.instance
        : findRelatedComponent(el),
      stateMatch: findDomStateMatch(el, candidates)
    }
    return this.lastResolved
  }

  /**
   * Highlights a component on element mouse over
   * @param {MouseEvent} e
   */
  elementMouseOver (e) {
    this.cancelEvent(e)

    const el = e.target
    if (el) {
      const { candidates, instance, stateMatch } = this.resolveTarget(el)
      this.selectedInstance = instance
      this.sendCandidates(candidates, instance, stateMatch)
    }

    unHighlight()
    if (this.selectedInstance) {
      highlight(this.selectedInstance)
    }
  }

  /**
   * Selects an instance in the component view
   * @param {MouseEvent} e
   */
  elementClicked (e) {
    this.cancelEvent(e)

    const { instance, stateMatch } = this.resolveTarget(e.target)

    if (stateMatch) {
      this.bridge.send('inspect-state-path', stateMatch)
    } else if (instance) {
      this.bridge.send('inspect-instance', instance.__VUE_DEVTOOLS_UID__)
    } else {
      this.bridge.send('stop-component-selector')
    }

    this.stopSelecting()
  }

  /**
   * Cancel a mouse event
   * @param {MouseEvent} e
   */
  cancelEvent (e) {
    e.stopImmediatePropagation()
    e.preventDefault()
  }

  sendCandidates (candidates, selectedInstance, stateMatch = null) {
    const selectedId = selectedInstance && selectedInstance.__VUE_DEVTOOLS_UID__
    const visibleCandidates = candidates.filter(candidate => candidate.isBusiness)
    const displayCandidates = (visibleCandidates.length ? visibleCandidates : candidates).slice(0, 8)
    const matchSignature = stateMatch
      ? stateMatch.uid + ':' + stateMatch.type + ':' + stateMatch.path
      : ''
    const signature = selectedId + '::' + displayCandidates.map(candidate => candidate.id).join(',') + '::' + matchSignature
    if (signature === this.lastCandidatesSignature) return

    this.lastCandidatesSignature = signature
    this.bridge.send('component-selector-candidates', {
      selectedId,
      candidates: displayCandidates.map(candidate => ({
        id: candidate.id,
        name: candidate.name,
        file: candidate.file,
        isBusiness: candidate.isBusiness,
        level: candidate.level,
        selected: candidate.id === selectedId,
        stateMatch: stateMatch && String(stateMatch.uid) === String(candidate.id)
          ? {
            path: stateMatch.path,
            type: stateMatch.type,
            matchType: stateMatch.matchType,
            value: stateMatch.value
          }
          : null
      }))
    })
  }

  /**
   * Bind class methods to the class scope to avoid rebind for event listeners
   */
  bindMethods () {
    this.startSelecting = this.startSelecting.bind(this)
    this.stopSelecting = this.stopSelecting.bind(this)
    this.elementMouseOver = this.elementMouseOver.bind(this)
    this.elementClicked = this.elementClicked.bind(this)
    this.sendCandidates = this.sendCandidates.bind(this)
  }
}

function findComponentCandidates (el) {
  const candidates = []
  const seenIds = {}

  while (el) {
    if (el.__vue__) {
      collectVmCandidates(el.__vue__, candidates, seenIds)
    }
    el = el.parentElement
  }

  return candidates
}

function collectVmCandidates (vm, candidates, seenIds) {
  const seenVms = []
  let level = 0

  while (vm && seenVms.indexOf(vm) === -1) {
    seenVms.push(vm)
    const instance = getSelectableComponent(vm)
    if (instance) {
      const id = instance.__VUE_DEVTOOLS_UID__
      if (id && !seenIds[id]) {
        seenIds[id] = true
        candidates.push(createCandidate(instance, level))
      }
    }
    vm = vm.$parent
    level++
  }
}

function createCandidate (instance, level) {
  const file = getInstanceFile(instance)
  const name = getInstanceName(instance)
  return {
    id: instance.__VUE_DEVTOOLS_UID__,
    instance,
    name,
    file,
    isBusiness: isBusinessComponent(getBusinessMeta(instance)),
    level
  }
}

function getBusinessMeta (instance) {
  if (!instance) return null
  return {
    name: getInstanceName(instance),
    file: getInstanceFile(instance),
    // lazy: only walked when the name needs an Element UI ancestor check
    get parent () {
      return getBusinessMeta(instance.$parent)
    }
  }
}

function findDomStateMatch (el, candidates) {
  const domText = getSearchText(el)
  if (!domText || !candidates || !candidates.length) return null

  const ordered = orderCandidatesForStateSearch(candidates)
  let best = null
  for (let i = 0; i < ordered.length; i++) {
    const candidate = ordered[i]
    const match = findInstanceStateMatch(candidate, domText)
    if (match && (!best || match.score > best.score)) {
      best = match
    }
  }

  if (!best) return null

  return {
    uid: best.uid,
    name: best.name,
    file: best.file,
    path: best.path,
    type: best.type,
    value: best.value,
    domText,
    matchType: best.matchType,
    score: best.score
  }
}

function orderCandidatesForStateSearch (candidates) {
  const business = candidates.filter(candidate => candidate.isBusiness)
  const rest = candidates.filter(candidate => !candidate.isBusiness)
  return business.concat(rest)
}

function findInstanceStateMatch (candidate, domText) {
  const instance = candidate.instance
  if (!instance) return null

  const budget = {
    count: 0
  }
  let best = null

  function pushMatch (path, type, value, matchType, baseScore) {
    const score = baseScore +
      (candidate.isBusiness ? 8 : 0) +
      Math.max(0, 6 - (candidate.level || 0)) +
      typePriority(type)

    if (!best || score > best.score) {
      best = {
        uid: candidate.id,
        name: candidate.name,
        file: candidate.file,
        path,
        type,
        value: truncateMatchValue(value),
        matchType,
        score
      }
    }
  }

  if (instance.$data) {
    searchObject(instance.$data, '', 'data', domText, budget, pushMatch, 0)
  }

  if (instance.$props) {
    searchObject(instance.$props, '', 'props', domText, budget, pushMatch, 0)
  } else if (instance._props) {
    searchObject(instance._props, '', 'props', domText, budget, pushMatch, 0)
  }

  const computed = instance.$options && instance.$options.computed
  if (computed) {
    const keys = Object.keys(computed)
    for (let i = 0; i < keys.length && budget.count < MAX_SEARCH_KEYS; i++) {
      const key = keys[i]
      let value
      try {
        value = instance[key]
      } catch (e) {
        continue
      }
      searchValue(value, key, 'computed', domText, budget, pushMatch, 0)
    }
  }

  return best
}

function searchObject (obj, prefix, type, domText, budget, pushMatch, depth) {
  if (!obj || typeof obj !== 'object') return
  const keys = Object.keys(obj)
  for (let i = 0; i < keys.length && budget.count < MAX_SEARCH_KEYS; i++) {
    const key = keys[i]
    if (!isSearchableKey(key)) continue
    const path = prefix ? prefix + '.' + key : key
    let value
    try {
      value = obj[key]
    } catch (e) {
      continue
    }
    searchValue(value, path, type, domText, budget, pushMatch, depth)
  }
}

function searchValue (value, path, type, domText, budget, pushMatch, depth) {
  if (budget.count++ >= MAX_SEARCH_KEYS) return
  if (value == null || isElement(value) || isVueInstance(value)) return

  const match = scoreValueMatch(value, domText)
  if (match) {
    pushMatch(path, type, value, match.type, match.score)
  }

  if (depth >= MAX_SEARCH_DEPTH || typeof value !== 'object') return

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length && i < MAX_ARRAY_ITEMS && budget.count < MAX_SEARCH_KEYS; i++) {
      searchValue(value[i], path + '[' + i + ']', type, domText, budget, pushMatch, depth + 1)
    }
    return
  }

  searchObject(value, path, type, domText, budget, pushMatch, depth + 1)
}

function scoreValueMatch (value, domText) {
  const valueText = normalizeSearchText(valueToSearchText(value))
  if (!valueText || valueText.length < 2) return null

  const valueLower = valueText.toLowerCase()
  const domLower = domText.toLowerCase()

  if (valueLower === domLower) {
    return {
      type: 'exact',
      score: 100
    }
  }

  if (valueText.length >= 3 && domLower.indexOf(valueLower) !== -1) {
    return {
      type: 'dom-contains-value',
      score: 78
    }
  }

  if (domText.length >= 3 && valueLower.indexOf(domLower) !== -1) {
    return {
      type: 'value-contains-dom',
      score: 72
    }
  }

  return null
}

function getSearchText (el) {
  if (!el) return ''
  return normalizeSearchText(el.textContent || '').slice(0, MAX_TEXT_LENGTH)
}

function normalizeSearchText (value) {
  return String(value == null ? '' : value)
    .replace(/\s+/g, ' ')
    .trim()
}

function valueToSearchText (value) {
  if (value == null) return ''
  const type = typeof value
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return String(value)
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  return ''
}

function truncateMatchValue (value) {
  const text = valueToSearchText(value)
  return text.length > 120 ? text.slice(0, 120) + '...' : text
}

function isSearchableKey (key) {
  return key.charAt(0) !== '_' && key.charAt(0) !== '$'
}

function isElement (value) {
  return value && value.nodeType === 1
}

function isVueInstance (value) {
  return value && value._isVue
}

function typePriority (type) {
  if (type === 'data') return 3
  if (type === 'props') return 2
  if (type === 'computed') return 1
  return 0
}
