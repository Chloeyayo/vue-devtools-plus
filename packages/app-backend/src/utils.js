export function findRelatedComponent (el) {
  while (el) {
    if (el.__vue__) {
      const instance = getSelectableComponent(el.__vue__)
      if (instance) return instance
    }
    el = el.parentElement
  }
}

export function getSelectableComponent (instance) {
  const seen = []

  while (instance && seen.indexOf(instance) === -1) {
    seen.push(instance)

    if (instance.__VUE_DEVTOOLS_UID__ && !(instance.$options && instance.$options.abstract)) {
      return instance
    }

    if (instance.$options && instance.$options.abstract && instance._vnode && instance._vnode.componentInstance) {
      instance = instance._vnode.componentInstance
    } else {
      instance = instance.$parent
    }
  }
}
