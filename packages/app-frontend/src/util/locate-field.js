import Vue from 'vue'

// Locates a DataField in the components inspector by state path:
// expands each segment, scrolls into view and flashes a highlight,
// without touching the state filter so sibling fields stay visible.

export function normalizeDataPath (path) {
  return String(path || '').replace(/\[(\d+)\]/g, '.$1')
}

function getAppVm () {
  const app = document.getElementById('app')
  return app && app.__vue__
}

function walkVms (vm, cb) {
  if (!vm) return
  cb(vm)
  const children = vm.$children || []
  for (let i = 0; i < children.length; i++) {
    walkVms(children[i], cb)
  }
}

function isInTypeSection (vm, type) {
  if (!type || !vm.$el || !vm.$el.closest) return true
  const container = vm.$el.closest('.data-el')
  if (!container) return true
  // mirror StateInspector's toDisplayType class mapping
  const typeClass = type === 'undefined'
    ? 'data'
    : String(type).replace(/\s/g, '-')
  return container.classList.contains(typeClass)
}

function findDataFieldVm (path, type) {
  const root = getAppVm()
  let match = null
  walkVms(root, vm => {
    if (
      !match &&
      vm.$options &&
      vm.$options.name === 'DataField' &&
      isInTypeSection(vm, type) &&
      normalizeDataPath(vm.path) === path
    ) {
      match = vm
    }
  })
  return match
}

export function flashElement (el) {
  if (!el) return false
  const old = document.querySelectorAll('.eh-inspect-highlight')
  for (let i = 0; i < old.length; i++) {
    old[i].classList.remove('eh-inspect-highlight')
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  el.classList.remove('eh-inspect-highlight')
  el.classList.add('eh-inspect-highlight')
  el.addEventListener('animationend', function () {
    this.classList.remove('eh-inspect-highlight')
  }, { once: true })
  return true
}

function expandPath (path, type, done) {
  const parts = path.split('.').filter(Boolean)
  let index = 1

  function step () {
    if (index >= parts.length) {
      done(true)
      return
    }
    const field = findDataFieldVm(parts.slice(0, index).join('.'), type)
    if (!field) {
      done(false)
      return
    }
    if (field.isExpandableType && !field.expanded) {
      field.expanded = true
    }
    index++
    Vue.nextTick(step)
  }

  step()
}

export function highlightDataPath (path, type, done) {
  const normalized = normalizeDataPath(path)
  expandPath(normalized, type, () => {
    const field = findDataFieldVm(normalized, type)
    if (field && field.$el) {
      flashElement(field.$el)
      done && done(true)
    } else {
      done && done(false)
    }
  })
}

export function retryHighlightDataPath (path, type, done) {
  let attempts = 0

  function attempt () {
    attempts++
    highlightDataPath(path, type, ok => {
      if (ok) {
        done && done(true)
      } else if (attempts < 15) {
        setTimeout(attempt, 200)
      } else {
        done && done(false)
      }
    })
  }

  setTimeout(attempt, 120)
}
