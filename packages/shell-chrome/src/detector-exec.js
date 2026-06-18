import { installToast } from '@back/toast'

function sendMessage (message) {
  window.postMessage({
    key: '_vue-devtools-send-message',
    message
  })
}

function detect () {
  let timeout = 1000
  let retries = 10

  function run () {
    const nuxtDetected = Boolean(window.__NUXT__ || window.$nuxt)

    if (nuxtDetected) {
      const Vue = window.$nuxt && window.$nuxt.$root && window.$nuxt.$root.constructor
      const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__
      sendMessage({
        devtoolsEnabled: (Vue && Vue.config.devtools) || (hook && hook.enabled),
        vueDetected: true,
        nuxtDetected: true
      })
      return
    }

    if (window.__VUE__) {
      const hook = window.__VUE_DEVTOOLS_GLOBAL_HOOK__
      sendMessage({
        devtoolsEnabled: hook && hook.enabled,
        vueDetected: true
      })
      return
    }

    const all = document.querySelectorAll('*')
    let el
    for (let i = 0; i < all.length; i++) {
      if (all[i].__vue__) {
        el = all[i]
        break
      }
    }
    if (el) {
      let Vue = Object.getPrototypeOf(el.__vue__).constructor
      while (Vue.super) {
        Vue = Vue.super
      }
      sendMessage({
        devtoolsEnabled: Vue.config.devtools,
        vueDetected: true
      })
    } else if (retries > 0) {
      retries--
      setTimeout(run, timeout)
      timeout *= 5
    }
  }

  setTimeout(run, 100)
}

if (document instanceof HTMLDocument) {
  detect()
  installToast(window)
}
