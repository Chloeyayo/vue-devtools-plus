<template>
  <scroll-pane class="enhanced-search-tab">
    <action-header
      slot="header"
      class="enhanced-search-header"
    >
      <span class="title">
        <VueIcon icon="search" />
        <span>Enhanced Search</span>
      </span>

      <div class="search">
        <VueIcon icon="search" />
        <input
          ref="searchInput"
          v-model.trim="query"
          placeholder="Search data, props, computed"
          spellcheck="false"
          @input="onQueryInput"
          @keydown.enter.prevent="runSearch"
          @keydown.esc.prevent="clearQuery"
        >
        <button
          v-if="query"
          v-tooltip="'Clear search'"
          type="button"
          class="clear-query"
          @click="clearQuery"
        >
          <VueIcon icon="close" />
        </button>
      </div>

      <VueButton
        v-tooltip="'Refresh results'"
        class="icon-button flat"
        icon-left="refresh"
        @click="refresh"
      />
    </action-header>

    <template slot="scroll">
      <div class="enhanced-search-content">
        <div class="enhanced-search-options">
          <button
            v-for="filter in filterNames"
            :key="filter"
            type="button"
            class="filter-chip"
            :class="{ active: filters[filter] }"
            @click="toggleFilter(filter)"
          >
            {{ filter }}
          </button>
          <button
            type="button"
            class="filter-chip business-chip"
            :class="{ active: businessOnly }"
            @click="toggleBusinessOnly"
          >
            Business
          </button>
          <span class="status">{{ statusText }}</span>
        </div>

        <div class="enhanced-search-nav">
          <button
            type="button"
            :class="{ active: activeView === 'search' }"
            @click="setActiveView('search')"
          >
            <span>Search</span>
            <span
              v-if="query && results.length"
              class="nav-count"
            >
              {{ results.length }}
            </span>
          </button>
          <button
            type="button"
            :class="{ active: activeView === 'watchboard' }"
            @click="setActiveView('watchboard')"
          >
            <span>Watchboard</span>
            <span
              v-if="watched.length"
              class="nav-count"
            >
              {{ watched.length }}
            </span>
          </button>
        </div>

        <div
          v-if="locationFeedback"
          class="location-feedback"
          :class="locationFeedback.status"
          role="status"
          aria-live="polite"
        >
          <span class="location-feedback-status">{{ locationFeedbackStatusText }}</span>
          <span class="location-feedback-breadcrumb mono">
            <span
              v-for="(crumb, index) in locationFeedbackBreadcrumb"
              :key="index + '-' + crumb"
              class="location-feedback-crumb"
            >
              {{ crumb }}
            </span>
          </span>
        </div>

        <section
          v-if="activeView === 'search'"
          class="results"
        >
          <div
            v-if="loading"
            class="notice"
          >
            <div>Searching...</div>
          </div>
          <div
            v-else-if="error"
            class="notice error"
          >
            <div>{{ error }}</div>
          </div>
          <div
            v-else-if="!query"
            class="notice"
          >
            <div>Type to search across all components.</div>
          </div>
          <div
            v-else-if="!hasActiveFilters"
            class="notice"
          >
            <div>Select at least one field type.</div>
          </div>
          <div
            v-else-if="!results.length"
            class="notice"
          >
            <div>No matches found.</div>
          </div>
          <template v-else>
            <div
              v-for="result in results"
              :key="resultKey(result)"
              class="result-row selectable-item"
              :class="{ watched: isWatched(result.compUid, result.propPath) }"
              @click="inspectResult(result)"
            >
              <span class="result-head">
                <!-- eslint-disable vue/no-v-html -->
                <span
                  class="component-name"
                  v-html="highlightComponentName(result.compName)"
                />
                <span class="watch-actions">
                  <button
                    v-tooltip="isWatchedMode(result.compUid, result.propPath, 'value') ? 'Unwatch field' : 'Watch field'"
                    type="button"
                    class="watch-button value"
                    :class="{ active: isWatchedMode(result.compUid, result.propPath, 'value') }"
                    :aria-label="isWatchedMode(result.compUid, result.propPath, 'value') ? 'Unwatch field' : 'Watch field'"
                    @click.stop="toggleWatch(result, 'value')"
                  >
                    <VueIcon :icon="valueWatchIcon(result.compUid, result.propPath)" />
                  </button>
                  <button
                    v-if="canDeepWatchEntry(result) || isWatchedMode(result.compUid, result.propPath, 'deep')"
                    v-tooltip="isWatchedMode(result.compUid, result.propPath, 'deep') ? 'Unwatch nested changes' : 'Watch nested changes'"
                    type="button"
                    class="watch-button deep"
                    :class="{ active: isWatchedMode(result.compUid, result.propPath, 'deep') }"
                    :aria-label="isWatchedMode(result.compUid, result.propPath, 'deep') ? 'Unwatch nested changes' : 'Watch nested changes'"
                    @click.stop="toggleWatch(result, 'deep')"
                  >
                    <VueIcon icon="compare_arrows" />
                  </button>
                </span>
              </span>
              <span class="result-detail mono">
                <span class="prop-type">{{ result.propType }}</span>
                <span
                  class="match-type"
                  :class="result.matchType"
                >
                  {{ result.matchType }}
                </span>
                <span
                  class="prop-path"
                  v-html="highlightText(result.propPath)"
                />
                <span
                  class="prop-value"
                  v-html="highlightValue(result.value)"
                />
              </span>
              <span
                class="component-path"
                v-html="highlightText(result.compPath)"
              />
              <!-- eslint-enable vue/no-v-html -->
            </div>
          </template>
        </section>

        <section
          v-else
          class="results"
        >
          <div
            v-if="!watched.length"
            class="notice"
          >
            <div>No watched variables. Pin search results to watch them here.</div>
          </div>
          <template v-else>
            <div
              v-for="item in watched"
              :key="watchKey(item.uid, item.path)"
              class="result-row selectable-item"
              @click="inspectWatch(item)"
            >
              <span class="result-head">
                <span class="component-name">&lt;{{ item.name }}&gt;</span>
                <span
                  v-tooltip="watchModeSwitchTooltip(item)"
                  class="watch-mode"
                  :class="watchMode(item)"
                  @click.stop
                  @dblclick.stop="toggleWatchMode(item)"
                >
                  {{ watchModeLabel(item) }}
                </span>
                <span
                  v-if="watchChangeCount(item)"
                  class="watch-change-count"
                >
                  {{ watchChangeCount(item) }}
                </span>
                <span class="watch-actions">
                  <VueDropdown @click.native.stop>
                    <button
                      slot="trigger"
                      v-tooltip="'More actions'"
                      type="button"
                      class="watch-button"
                      aria-label="More actions"
                    >
                      <VueIcon icon="more_vert" />
                    </button>

                    <div
                      class="watch-menu"
                      @click.stop
                    >
                      <VueDropdownButton
                        :icon-left="watchMode(item) === 'deep' ? 'star' : 'compare_arrows'"
                        @click="toggleWatchMode(item)"
                      >
                        {{ watchModeSwitchTooltip(item) }}
                      </VueDropdownButton>
                      <VueDropdownButton
                        v-if="watchChangeCount(item)"
                        icon-left="delete"
                        @click="clearWatchChanges(item)"
                      >
                        Clear changes
                      </VueDropdownButton>
                      <VueDropdownButton
                        icon-left="close"
                        @click="removeWatch(item)"
                      >
                        Unwatch
                      </VueDropdownButton>
                    </div>
                  </VueDropdown>
                </span>
              </span>
              <span class="result-detail mono">
                <span class="prop-type">{{ item.type }}</span>
                <span class="prop-path watch-copy-target">
                  <span class="watch-copy-text">{{ item.path }}</span>
                  <button
                    v-tooltip="'Copy path'"
                    type="button"
                    class="copy-button"
                    aria-label="Copy path"
                    @click.stop="copyText(item.path)"
                  >
                    <VueIcon icon="content_copy" />
                  </button>
                </span>
                <span
                  class="prop-value watch-copy-target"
                  :class="{ changed: changedValues[watchKey(item.uid, item.path)] }"
                >
                  <span class="watch-copy-text">= {{ watchValue(item) }}</span>
                  <button
                    v-tooltip="'Copy value'"
                    type="button"
                    class="copy-button"
                    aria-label="Copy value"
                    @click.stop="copyText(watchValue(item))"
                  >
                    <VueIcon icon="content_copy" />
                  </button>
                </span>
              </span>
              <div
                v-if="watchMode(item) === 'deep' || watchChangeCount(item)"
                class="change-list mono"
              >
                <div
                  v-if="watchChangeCount(item)"
                  class="change-toolbar"
                >
                  <label
                    class="change-filter"
                    @click.stop
                  >
                    <VueIcon icon="filter_list" />
                    <input
                      :value="watchChangeFilter(item)"
                      placeholder="Filter field/path"
                      spellcheck="false"
                      @click.stop
                      @input="setWatchChangeFilter(item, $event.target.value)"
                      @keydown.stop
                    >
                  </label>
                  <span
                    v-if="watchChangeFilter(item)"
                    class="change-filter-count"
                  >
                    {{ filteredWatchChangeCount(item) }} / {{ watchChangeCount(item) }}
                  </span>
                  <button
                    v-if="watchChangeFilter(item)"
                    v-tooltip="'Clear filter'"
                    type="button"
                    class="copy-button change-filter-clear"
                    aria-label="Clear filter"
                    @click.stop="clearWatchChangeFilter(item)"
                  >
                    <VueIcon icon="close" />
                  </button>
                </div>
                <div
                  v-if="!watchChangesFor(item).length"
                  class="change-empty"
                >
                  {{ watchChangeEmptyText(item) }}
                </div>
                <template v-else>
                  <div
                    v-for="change in watchChangesFor(item)"
                    :key="change.id"
                    class="change-row"
                    :class="change.type"
                  >
                    <span
                      class="change-kind"
                      :class="change.type"
                    >{{ changeLabel(change) }}</span>
                    <span class="change-path">
                      <span class="change-path-text">{{ fullChangePath(item, change) }}</span>
                      <button
                        v-tooltip="'Copy path'"
                        type="button"
                        class="copy-button"
                        aria-label="Copy path"
                        @click.stop="copyText(fullChangePath(item, change))"
                      >
                        <VueIcon icon="content_copy" />
                      </button>
                    </span>
                    <span class="change-values">
                      <span
                        class="change-value old"
                        :class="{ empty: !hasChangeBefore(change) }"
                      >
                        <span class="change-value-label">old</span>
                        <span class="change-value-text">{{ changeBeforeValue(change) }}</span>
                        <button
                          v-if="hasChangeBefore(change)"
                          v-tooltip="'Copy old value'"
                          type="button"
                          class="copy-button"
                          aria-label="Copy old value"
                          @click.stop="copyText(change.before)"
                        >
                          <VueIcon icon="content_copy" />
                        </button>
                      </span>
                      <span
                        class="change-value new"
                        :class="{ empty: !hasChangeAfter(change) }"
                      >
                        <span class="change-value-label">new</span>
                        <span class="change-value-text">{{ changeAfterValue(change) }}</span>
                        <button
                          v-if="hasChangeAfter(change)"
                          v-tooltip="'Copy new value'"
                          type="button"
                          class="copy-button"
                          aria-label="Copy new value"
                          @click.stop="copyText(change.after)"
                        >
                          <VueIcon icon="content_copy" />
                        </button>
                      </span>
                    </span>
                    <span class="change-time">{{ change.time }}</span>
                  </div>
                </template>
              </div>
            </div>
          </template>
        </section>
      </div>
    </template>
  </scroll-pane>
</template>

<script>
import Vue from 'vue'
import ActionHeader from '@front/components/ActionHeader.vue'
import ScrollPane from '@front/components/ScrollPane.vue'
import { escape as escapeHtml, escapeRegExp } from '@utils/util'
import { retryHighlightDataPath } from '@front/util/locate-field'
import {
  PAGE_WATCH_SCRIPT,
  WATCHBOARD_CHANGED_EVENT,
  WATCH_POLL_INTERVAL,
  watchboardState,
  watchKey as createWatchKey,
  watchMode as getWatchMode,
  watchedItem as findWatchedItem,
  isWatched as checkWatched,
  isWatchedMode as checkWatchedMode,
  applyWatchToggle,
  saveWatched as saveStoredWatched,
  syncWatchedFromStorage
} from './watchboard'

const QUERY_STORAGE_KEY = 'vue-devtools-enhanced-search-query'
const BUSINESS_FILTER_STORAGE_KEY = 'vue-devtools-business-components-only'
const SEARCH_POLL_INTERVAL = 1000
const FILTER_NAMES = ['data', 'props', 'computed']
const MAX_STORED_CHANGES = 30
const MAX_RENDERED_CHANGES = 6
const LOCATION_FEEDBACK_EVENT = 'vue-devtools-eh-location-feedback'
const LOCATION_FEEDBACK_KEY = '__VUE_DEVTOOLS_EH_LOCATION_FEEDBACK__'
const ENHANCED_SEARCH_SHORTCUT_EVENT = 'vue-devtools-enhanced-search-shortcut'

function publishLocationFeedback (feedback) {
  if (typeof window === 'undefined') return
  window[LOCATION_FEEDBACK_KEY] = feedback
  window.dispatchEvent(new window.CustomEvent(LOCATION_FEEDBACK_EVENT, {
    detail: feedback
  }))
}

const PAGE_SEARCH_SCRIPT = `
function (query, opts) {
  var MAX_DEPTH = opts.maxDepth || 8
  var MAX_RESULTS = opts.maxResults || 200
  var searchData = opts.searchData !== false
  var searchProps = opts.searchProps !== false
  var searchComputed = opts.searchComputed !== false
  var businessOnly = opts.businessOnly !== false
  var q = String(query || '').toLowerCase()
  var results = []
  var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null
  var INTERNAL_COMPONENT_NAMES = {
    Transition: true,
    TransitionGroup: true,
    KeepAlive: true,
    RouterView: true,
    RouterLink: true
  }
  var ELEMENT_UI_INTERNAL_COMPONENT_NAMES = {
    Bar: true,
    LabelWrap: true,
    Next: true,
    Prev: true,
    Sizes: true
  }
  var ELEMENT_UI_PACKAGE_RE = /(?:^|\\/)packages\\/(?:alert|aside|autocomplete|avatar|badge|breadcrumb|button|calendar|card|carousel|cascader|checkbox|collapse|color-picker|container|date-picker|dialog|divider|dropdown|form|header|icon|image|input|input-number|link|main|menu|message|message-box|notification|pagination|popover|progress|radio|rate|scrollbar|select|slider|steps|switch|table|tabs|tag|time-picker|time-select|timeline|tooltip|transfer|tree|upload)(?:\\/|$)/

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

  function getComponentFile(vm) {
    var opt = vm.$options || {}
    if (opt.__file) return opt.__file
    var vnode = vm.$vnode
    var ctorOptions = vnode && vnode.componentOptions && vnode.componentOptions.Ctor && vnode.componentOptions.Ctor.options
    return ctorOptions && ctorOptions.__file ? ctorOptions.__file : ''
  }

  function classifyName(name) {
    return String(name || '')
      .replace(/[<>]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/(?:^|[-_/])(\\w)/g, function (_, c) {
        return c ? c.toUpperCase() : ''
      })
  }

  function isDependencyComponentFile(file) {
    var normalized = String(file || '').replace(/\\\\/g, '/').toLowerCase()
    return normalized.indexOf('/node_modules/') !== -1 || normalized.indexOf('node_modules/') === 0
  }

  function isElementUIComponentName(name) {
    return /^E[lL][A-Z0-9]/.test(name)
  }

  function isElementUIComponentFile(file) {
    return ELEMENT_UI_PACKAGE_RE.test(String(file || '').replace(/\\\\/g, '/').toLowerCase())
  }

  function isElementUIComponent(name, file) {
    return isElementUIComponentName(name) || isElementUIComponentFile(file)
  }

  function hasElementUIAncestor(vm) {
    var parent = vm.$parent
    while (parent) {
      if (isElementUIComponent(classifyName(getComponentName(parent)), getComponentFile(parent))) {
        return true
      }
      parent = parent.$parent
    }
    return false
  }

  function isBusinessComponent(vm) {
    var file = getComponentFile(vm)
    var name = classifyName(getComponentName(vm))
    if (!name && !file) return true
    if (INTERNAL_COMPONENT_NAMES[name]) return false
    if (isElementUIComponent(name, file)) return false
    if (ELEMENT_UI_INTERNAL_COMPONENT_NAMES[name] && hasElementUIAncestor(vm)) return false
    return file ? !isDependencyComponentFile(file) : true
  }

  function getComponentPath(vm) {
    var parts = []
    var cur = vm
    while (cur) {
      if (!businessOnly || isBusinessComponent(cur)) {
        parts.unshift(getComponentName(cur))
      }
      cur = cur.$parent
    }
    return parts.join(' > ')
  }

  function truncate(value, len) {
    var limit = len || 120
    var text
    if (value === undefined) text = 'undefined'
    else if (value === null) text = 'null'
    else if (typeof value === 'string') text = value
    else if (typeof value === 'function') text = 'fn()'
    else if (Array.isArray(value)) text = 'Array[' + value.length + ']'
    else if (isElement(value)) text = '<' + value.tagName.toLowerCase() + '>'
    else if (value && value._isVue) text = '<Vue:' + getComponentName(value) + '>'
    else if (typeof value === 'object') {
      try {
        text = JSON.stringify(value)
      } catch (e) {
        var ctor = value.constructor && value.constructor.name ? value.constructor.name : 'Object'
        var count = 0
        try {
          count = Object.keys(value).length
        } catch (e2) {
          count = 0
        }
        text = ctor + '{' + count + '}'
      }
    } else {
      text = String(value)
    }
    return text.length > limit ? text.substring(0, limit) + '...' : text
  }

  function pushResult(info, propPath, value, matchType) {
    results.push({
      compName: info.name,
      compPath: info.path,
      compUid: info.uid,
      propPath: propPath,
      propType: info.currentType,
      value: truncate(value),
      matchType: matchType
    })
  }

  function safeDeepSearch(obj, prefix, depth, info) {
    try {
      deepSearch(obj, prefix, depth, info)
    } catch (e) {
      if (window.console && console.warn) {
        console.warn('[Vue Devtools EH] skipped search branch', info.name, prefix, e)
      }
    }
  }

  function deepSearch(obj, prefix, depth, info) {
    if (results.length >= MAX_RESULTS) return
    if (depth > MAX_DEPTH) return
    if (obj === null || obj === undefined) return
    if (isElement(obj) || (obj && obj._isVue)) return

    var type = typeof obj
    if (type !== 'object' && type !== 'string' && type !== 'number' && type !== 'boolean') return

    if (type !== 'object') return
    if (seen) {
      if (seen.has(obj)) return
      seen.add(obj)
    }

    var keys = Object.keys(obj)
    for (var i = 0; i < keys.length && results.length < MAX_RESULTS; i++) {
      var key = keys[i]
      if (key.charAt(0) === '_' && key !== '_uid') continue
      if (key.charAt(0) === '$') continue

      var fullPath = prefix ? prefix + '.' + key : key
      var val
      try {
        val = obj[key]
      } catch (e) {
        continue
      }

      if (key.toLowerCase().indexOf(q) !== -1) {
        pushResult(info, fullPath, val, 'key')
      } else if (val !== null && val !== undefined && typeof val !== 'object' && typeof val !== 'function') {
        if (String(val).toLowerCase().indexOf(q) !== -1) {
          pushResult(info, fullPath, val, 'value')
        }
      }

      if (val !== null && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (var j = 0; j < Math.min(val.length, 100) && results.length < MAX_RESULTS; j++) {
            deepSearch(val[j], fullPath + '[' + j + ']', depth + 1, info)
          }
        } else if (!isElement(val) && !val._isVue) {
          deepSearch(val, fullPath, depth + 1, info)
        }
      }
    }
  }

  function searchComponent(vm) {
    if (!vm || results.length >= MAX_RESULTS) return

    if (!businessOnly || isBusinessComponent(vm)) {
      var info = {
        name: getComponentName(vm),
        path: getComponentPath(vm),
        uid: vm.__VUE_DEVTOOLS_UID__ || String(vm._uid),
        currentType: ''
      }

      if (searchData && vm.$data) {
        info.currentType = 'data'
        safeDeepSearch(vm.$data, '', 0, info)
      }

      if (searchProps && vm.$props) {
        info.currentType = 'props'
        safeDeepSearch(vm.$props, '', 0, info)
      }

      if (searchComputed && vm.$options && vm.$options.computed) {
        info.currentType = 'computed'
        var computed = vm.$options.computed
        var compKeys = Object.keys(computed)
        for (var i = 0; i < compKeys.length && results.length < MAX_RESULTS; i++) {
          var ck = compKeys[i]
          var cv
          try {
            cv = vm[ck]
          } catch (e) {
            continue
          }
          if (ck.toLowerCase().indexOf(q) !== -1) {
            pushResult(info, ck, cv, 'key')
          } else if (cv !== null && cv !== undefined && typeof cv !== 'object' && typeof cv !== 'function') {
            if (String(cv).toLowerCase().indexOf(q) !== -1) {
              pushResult(info, ck, cv, 'value')
            }
          } else if (cv !== null && typeof cv === 'object' && !isElement(cv) && !cv._isVue) {
            safeDeepSearch(cv, ck, 1, info)
          }
        }
      }
    }

    var children = vm.$children || []
    for (var c = 0; c < children.length && results.length < MAX_RESULTS; c++) {
      searchComponent(children[c])
    }
  }

  var roots = []
  var rootSet = {}
  var allEls = document.querySelectorAll('*')
  for (var i = 0; i < allEls.length; i++) {
    var el = allEls[i]
    if (el.__vue__ && el.__vue__.$root) {
      var root = el.__vue__.$root
      var id = root.__VUE_DEVTOOLS_UID__ || root._uid
      if (!rootSet[id]) {
        rootSet[id] = true
        roots.push(root)
      }
    }
  }

  for (var r = 0; r < roots.length; r++) {
    searchComponent(roots[r])
  }

  return {
    results: results,
    capped: results.length >= MAX_RESULTS
  }
}
`

function makeDiffPath (base, segment) {
  if (!base) return segment || 'value'
  if (!segment) return base
  return segment.charAt(0) === '[' ? base + segment : base + '.' + segment
}

function isContainerPreview (value) {
  let text = String(value == null ? '' : value).trim()
  return /^Array\[\d+\]/.test(text) ||
    text === 'Object' ||
    text === 'Object (empty)' ||
    text.charAt(0) === '{' ||
    text.charAt(0) === '['
}

export default {
  name: 'EnhancedSearchTab',

  components: {
    ActionHeader,
    ScrollPane
  },

  data () {
    return {
      query: '',
      filterNames: FILTER_NAMES,
      filters: {
        data: true,
        props: true,
        computed: true
      },
      businessOnly: window.localStorage.getItem(BUSINESS_FILTER_STORAGE_KEY) !== 'false',
      activeView: 'search',
      results: [],
      watched: watchboardState.watched,
      watchValues: {},
      watchChanges: {},
      watchChangeFilters: {},
      changedValues: {},
      loading: false,
      capped: false,
      error: '',
      searchSeq: 0,
      changeSeq: 0,
      debounceTimer: null,
      searchTimer: null,
      searchInFlight: false,
      searchLive: false,
      watchTimer: null,
      locationFeedback: null,
      locationFeedbackSeq: 0,
      locationFeedbackTimer: null
    }
  },

  computed: {
    hasActiveFilters () {
      return this.filterNames.some(filter => this.filters[filter])
    },

    scopeText () {
      return this.businessOnly ? 'Business only' : 'All components'
    },

    totalChangeCount () {
      return Object.keys(this.watchChanges).reduce((total, key) => {
        return total + this.watchChanges[key].length
      }, 0)
    },

    statusText () {
      if (this.activeView === 'watchboard') {
        return this.watched.length + ' watched' + (this.totalChangeCount ? ' · ' + this.totalChangeCount + ' changes' : '')
      }
      if (!this.hasActiveFilters) return 'No field types selected'
      if (this.loading) return 'Searching'
      if (this.error) return 'Error'
      if (!this.query) return this.scopeText
      return this.scopeText + ' · ' + this.results.length + ' result' + (this.results.length === 1 ? '' : 's') + (this.capped ? ' (capped)' : '') + (this.searchLive ? ' · live' : '')
    },

    locationFeedbackStatusText () {
      if (!this.locationFeedback) return ''
      if (this.locationFeedback.status === 'pending') return 'Locating'
      if (this.locationFeedback.status === 'success') return 'Highlighted'
      return 'Not found'
    },

    locationFeedbackBreadcrumb () {
      if (!this.locationFeedback) return []
      return [
        'Components',
        this.locationFeedback.type,
        this.locationFeedback.path
      ].filter(Boolean)
    }
  },

  mounted () {
    this.query = window.localStorage.getItem(QUERY_STORAGE_KEY) || ''
    this.loadWatched()
    window.addEventListener(WATCHBOARD_CHANGED_EVENT, this.onWatchboardChanged)
    window.addEventListener(ENHANCED_SEARCH_SHORTCUT_EVENT, this.onEnhancedSearchShortcut)
    this.$nextTick(() => {
      if (this.$refs.searchInput) {
        this.$refs.searchInput.focus()
      }
      this.refresh()
    })
  },

  destroyed () {
    clearTimeout(this.debounceTimer)
    clearTimeout(this.locationFeedbackTimer)
    window.removeEventListener(WATCHBOARD_CHANGED_EVENT, this.onWatchboardChanged)
    window.removeEventListener(ENHANCED_SEARCH_SHORTCUT_EVENT, this.onEnhancedSearchShortcut)
    this.stopSearchPolling()
    this.stopWatchPolling()
  },

  methods: {
    onEnhancedSearchShortcut (event) {
      if (event && event.detail) {
        event.detail.handled = true
      }
      this.activeView = 'search'
      this.$nextTick(() => {
        if (this.$refs.searchInput) {
          this.$refs.searchInput.focus()
          this.$refs.searchInput.select()
        }
        this.refresh()
      })
    },

    highlightText (value) {
      let text = String(value == null ? '' : value)
      let keyword = this.query.trim()
      if (!keyword) {
        return escapeHtml(text)
      }

      let pattern = new RegExp(escapeRegExp(keyword), 'ig')
      let output = ''
      let cursor = 0
      let match
      while ((match = pattern.exec(text))) {
        output += escapeHtml(text.slice(cursor, match.index))
        output += '<mark class="eh-keyword">' + escapeHtml(match[0]) + '</mark>'
        cursor = match.index + match[0].length
      }

      return output + escapeHtml(text.slice(cursor))
    },

    highlightComponentName (name) {
      return '&lt;' + this.highlightText(name) + '&gt;'
    },

    highlightValue (value) {
      return '= ' + this.highlightText(value)
    },

    setActiveView (view) {
      this.activeView = view
      this.refresh()
    },

    toggleFilter (filter) {
      this.filters[filter] = !this.filters[filter]
      this.refresh()
    },

    toggleBusinessOnly () {
      this.businessOnly = !this.businessOnly
      window.localStorage.setItem(BUSINESS_FILTER_STORAGE_KEY, this.businessOnly ? 'true' : 'false')
      this.refresh()
    },

    onQueryInput () {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        window.localStorage.setItem(QUERY_STORAGE_KEY, this.query)
        this.runSearch()
        this.startSearchPolling()
      }, 250)
    },

    clearQuery () {
      clearTimeout(this.debounceTimer)
      this.stopSearchPolling()
      this.query = ''
      this.results = []
      this.error = ''
      this.capped = false
      this.loading = false
      window.localStorage.removeItem(QUERY_STORAGE_KEY)
      this.$nextTick(() => {
        if (this.$refs.searchInput) {
          this.$refs.searchInput.focus()
        }
      })
    },

    refresh () {
      if (this.activeView === 'watchboard') {
        this.stopSearchPolling()
        this.refreshWatched()
        this.startWatchPolling()
      } else {
        this.stopWatchPolling()
        this.runSearch()
        this.startSearchPolling()
      }
    },

    startSearchPolling () {
      this.stopSearchPolling()
      if (
        this.activeView !== 'search' ||
        !this.query.trim() ||
        !this.hasActiveFilters ||
        !this.$isChrome
      ) {
        return
      }
      this.searchLive = true
      this.searchTimer = setInterval(() => {
        this.runSearch(true)
      }, SEARCH_POLL_INTERVAL)
    },

    stopSearchPolling () {
      if (this.searchTimer) {
        clearInterval(this.searchTimer)
        this.searchTimer = null
      }
      this.searchLive = false
    },

    runSearch (silent = false) {
      if (silent && this.searchInFlight) {
        return
      }
      let query = this.query.trim()
      let requestId = ++this.searchSeq
      this.error = ''
      this.capped = false

      if (!query || !this.hasActiveFilters) {
        this.results = []
        this.loading = false
        this.searchInFlight = false
        return
      }

      if (!this.$isChrome) {
        this.error = 'Enhanced Search is only available in the Chrome/Edge extension shell.'
        this.loading = false
        this.searchInFlight = false
        return
      }

      this.searchInFlight = true
      if (!silent) {
        this.loading = true
      }
      let script = '(' + PAGE_SEARCH_SCRIPT + ')(' + JSON.stringify(query) + ', ' + JSON.stringify({
        maxDepth: 8,
        maxResults: 200,
        searchData: this.filters.data,
        searchProps: this.filters.props,
        searchComputed: this.filters.computed,
        businessOnly: this.businessOnly
      }) + ')'

      chrome.devtools.inspectedWindow.eval(script, (payload, err) => {
        if (requestId !== this.searchSeq) return
        this.searchInFlight = false
        if (!silent) {
          this.loading = false
        }
        if (err) {
          this.error = err.value || err.description || 'Search failed.'
          this.results = []
          return
        }
        this.results = payload && payload.results ? payload.results : []
        this.capped = !!(payload && payload.capped)
      })
    },

    resultKey (result) {
      return result.compUid + '::' + result.propType + '::' + result.propPath
    },

    watchKey (uid, path) {
      return createWatchKey(uid, path)
    },

    watchValue (item) {
      let key = this.watchKey(item.uid, item.path)
      return Object.prototype.hasOwnProperty.call(this.watchValues, key)
        ? this.watchValues[key]
        : '...'
    },

    watchMode (item) {
      return getWatchMode(item)
    },

    watchModeLabel (item) {
      return this.watchMode(item) === 'deep' ? 'nested' : 'field'
    },

    watchModeSwitchTooltip (item) {
      return this.watchMode(item) === 'deep'
        ? 'Track field only'
        : 'Track nested changes'
    },

    watchedItem (uid, path) {
      return findWatchedItem(this.watched, uid, path)
    },

    isWatched (uid, path) {
      return checkWatched(this.watched, uid, path)
    },

    isWatchedMode (uid, path, mode) {
      return checkWatchedMode(this.watched, uid, path, mode)
    },

    valueWatchIcon (uid, path) {
      return this.isWatchedMode(uid, path, 'value') ? 'star' : 'star_border'
    },

    canDeepWatchEntry (entry) {
      return isContainerPreview(entry && (entry.value || entry.formattedValue))
    },

    copyText (value) {
      if (typeof document === 'undefined') return
      let dummyTextArea = document.createElement('textarea')
      dummyTextArea.textContent = String(value == null ? '' : value)
      dummyTextArea.setAttribute('readonly', '')
      dummyTextArea.style.position = 'absolute'
      dummyTextArea.style.left = '-9999px'
      document.body.appendChild(dummyTextArea)
      dummyTextArea.select()
      document.execCommand('copy')
      document.body.removeChild(dummyTextArea)
    },

    clearWatchRuntime (uid, path) {
      let key = this.watchKey(uid, path)
      Vue.delete(this.watchValues, key)
      Vue.delete(this.watchChanges, key)
      Vue.delete(this.watchChangeFilters, key)
      Vue.delete(this.changedValues, key)
    },

    removeWatch (entry) {
      let uid = entry.compUid || entry.uid
      let path = entry.propPath || entry.path
      let key = this.watchKey(uid, path)
      let index = this.watched.findIndex(watched => this.watchKey(watched.uid, watched.path) === key)
      if (index >= 0) {
        this.watched.splice(index, 1)
        this.clearWatchRuntime(uid, path)
        this.saveWatched()
        this.refreshWatched()
      }
    },

    toggleWatch (entry, mode = null) {
      let result = applyWatchToggle(this.watched, entry, mode)
      this.watched = result.watched
      if (result.previous) {
        this.clearWatchRuntime(result.item.uid, result.item.path)
      }
      this.saveWatched()
      this.refreshWatched()
    },

    toggleWatchMode (item) {
      let nextMode = this.watchMode(item) === 'deep' ? 'value' : 'deep'
      this.toggleWatch(item, nextMode)
    },

    loadWatched () {
      this.watched = syncWatchedFromStorage()
    },

    saveWatched () {
      this.watched = saveStoredWatched(this.watched)
    },

    onWatchboardChanged () {
      this.watched = watchboardState.watched
      if (this.activeView === 'watchboard') {
        this.refreshWatched()
        this.startWatchPolling()
      }
    },

    startWatchPolling () {
      this.stopWatchPolling()
      if (this.watched.length) {
        this.watchTimer = setInterval(this.refreshWatched, WATCH_POLL_INTERVAL)
      }
    },

    stopWatchPolling () {
      if (this.watchTimer) {
        clearInterval(this.watchTimer)
        this.watchTimer = null
      }
    },

    refreshWatched () {
      if (!this.$isChrome) return

      let items = this.watched.map(item => ({
        uid: item.uid,
        path: item.path,
        mode: this.watchMode(item)
      }))
      let watchedByKey = {}
      this.watched.forEach(item => {
        watchedByKey[this.watchKey(item.uid, item.path)] = item
      })
      let script = '(' + PAGE_WATCH_SCRIPT + ')(' + JSON.stringify(items) + ')'

      chrome.devtools.inspectedWindow.eval(script, (payload, err) => {
        if (err || !payload) return
        let values = Array.isArray(payload) ? payload : (payload.values || [])
        let events = Array.isArray(payload) ? [] : (payload.events || [])

        values.forEach(item => {
          let key = this.watchKey(item.uid, item.path)
          if (!watchedByKey[key]) return
          if (this.watchValues[key] !== item.value) {
            Vue.set(this.watchValues, key, item.value)
          }
        })

        events.forEach(event => {
          let key = this.watchKey(event.uid, event.path)
          if (!watchedByKey[key]) return

          if (Object.prototype.hasOwnProperty.call(event, 'value')) {
            Vue.set(this.watchValues, key, event.value)
          }
          if (event.changes && event.changes.length) {
            this.pushWatchChanges(key, event.changes, event.time)
            Vue.set(this.changedValues, key, true)
            setTimeout(() => Vue.delete(this.changedValues, key), 900)
          }
        })
      })
    },

    pushWatchChanges (key, changes, timestamp = null) {
      let time = timestamp
        ? new Date(timestamp).toLocaleTimeString()
        : new Date().toLocaleTimeString()
      let next = changes.map(change => ({
        ...change,
        id: ++this.changeSeq,
        time
      })).concat(this.watchChanges[key] || []).slice(0, MAX_STORED_CHANGES)
      Vue.set(this.watchChanges, key, next)
    },

    watchChangesFor (item) {
      let key = this.watchKey(item.uid, item.path)
      return this.filteredWatchChanges(item, this.watchChanges[key] || []).slice(0, MAX_RENDERED_CHANGES)
    },

    watchChangeCount (item) {
      let key = this.watchKey(item.uid, item.path)
      return (this.watchChanges[key] || []).length
    },

    filteredWatchChangeCount (item) {
      let key = this.watchKey(item.uid, item.path)
      return this.filteredWatchChanges(item, this.watchChanges[key] || []).length
    },

    watchChangeFilter (item) {
      let key = this.watchKey(item.uid, item.path)
      return this.watchChangeFilters[key] || ''
    },

    setWatchChangeFilter (item, value) {
      let key = this.watchKey(item.uid, item.path)
      value = String(value || '').trim()
      if (value) {
        Vue.set(this.watchChangeFilters, key, value)
      } else {
        Vue.delete(this.watchChangeFilters, key)
      }
    },

    clearWatchChangeFilter (item) {
      let key = this.watchKey(item.uid, item.path)
      Vue.delete(this.watchChangeFilters, key)
    },

    filteredWatchChanges (item, changes) {
      let filter = this.watchChangeFilter(item).toLowerCase()
      if (!filter) return changes
      return changes.filter(change => {
        return this.fullChangePath(item, change).toLowerCase().indexOf(filter) !== -1 ||
          String(change.path || '').toLowerCase().indexOf(filter) !== -1
      })
    },

    watchChangeEmptyText (item) {
      return this.watchChangeFilter(item) ? 'No matching changes' : 'No changes yet'
    },

    fullChangePath (item, change) {
      if (!change.path || change.path === 'value') return item.path
      return makeDiffPath(item.path, change.path)
    },

    changeLabel (change) {
      if (change.type === 'added') return 'Added'
      if (change.type === 'removed') return 'Removed'
      return 'Changed'
    },

    hasChangeBefore (change) {
      return change.type !== 'added'
    },

    hasChangeAfter (change) {
      return change.type !== 'removed'
    },

    changeBeforeValue (change) {
      return this.hasChangeBefore(change) ? change.before : '-'
    },

    changeAfterValue (change) {
      return this.hasChangeAfter(change) ? change.after : '-'
    },

    clearWatchChanges (item) {
      let key = this.watchKey(item.uid, item.path)
      Vue.delete(this.watchChanges, key)
      Vue.delete(this.changedValues, key)
    },

    beginLocationFeedback (entry) {
      clearTimeout(this.locationFeedbackTimer)
      let feedback = {
        id: ++this.locationFeedbackSeq,
        status: 'pending',
        path: entry.path || '',
        type: entry.type || ''
      }
      this.locationFeedback = feedback
      publishLocationFeedback(feedback)
      return feedback.id
    },

    finishLocationFeedback (id, ok) {
      if (!this.locationFeedback || this.locationFeedback.id !== id) return
      this.locationFeedback.status = ok ? 'success' : 'failure'
      publishLocationFeedback(this.locationFeedback)
      clearTimeout(this.locationFeedbackTimer)
      this.locationFeedbackTimer = setTimeout(() => {
        if (this.locationFeedback && this.locationFeedback.id === id) {
          this.locationFeedback = null
          publishLocationFeedback(null)
        }
      }, ok ? 2400 : 4000)
    },

    inspectResult (result) {
      this.inspectEntry({
        uid: result.compUid,
        path: result.propPath,
        type: result.propType
      })
    },

    inspectWatch (item) {
      this.inspectEntry(item)
    },

    inspectEntry (entry) {
      let feedbackId = this.beginLocationFeedback(entry)
      this.$store.dispatch('components/selectInstance', entry.uid)

      let pushed = this.$router.push({ name: 'components' })
      if (pushed && pushed.catch) {
        pushed.catch(function (e) {
          return e
        })
      }

      retryHighlightDataPath(entry.path, entry.type, ok => {
        this.finishLocationFeedback(feedbackId, ok)
      })
    }
  }
}
</script>

<style lang="stylus" scoped>
.enhanced-search-tab
  height 100%

.enhanced-search-header
  .title
    display flex
    align-items center
    color $component-color
    font-size 16px
    .vue-ui-icon
      margin-right 5px

  .search
    max-width 620px
    min-width 160px

.clear-query
  appearance none
  align-items center
  background transparent
  border 0
  border-radius 3px
  color #999
  cursor pointer
  display flex
  flex none
  height 22px
  justify-content center
  margin-left 4px
  padding 0
  width 22px
  .vue-ui-icon
    height 13px
    width 13px
  .vue-ui-icon >>> svg
    fill #999
  &:hover
    background $hover-color
    .vue-ui-icon >>> svg
      fill $active-color
    .vue-ui-dark-mode &
      background $dark-hover-color

.enhanced-search-content
  min-height 100%
  display flex
  flex-direction column
  background $background-color
  .vue-ui-dark-mode &
    background $dark-background-color

.enhanced-search-options
  display flex
  align-items center
  min-height 34px
  padding 6px 12px
  border-bottom 1px solid $border-color
  .vue-ui-dark-mode &
    border-bottom-color $dark-border-color

.filter-chip
  appearance none
  border 1px solid $border-color
  background $white
  color #666
  cursor pointer
  border-radius 3px
  font-size 12px
  line-height 20px
  margin-right 6px
  padding 0 9px
  .vue-ui-dark-mode &
    background $dark-background-color
    border-color $dark-border-color
    color #aaa
  &.active
    color #fff
    background $active-color
    border-color $active-color

.status
  margin-left auto
  color #999
  font-size 12px

.enhanced-search-nav
  display flex
  align-items center
  padding 8px 12px
  border-bottom 1px solid $border-color
  .vue-ui-dark-mode &
    border-bottom-color $dark-border-color
  button
    appearance none
    border 0
    background transparent
    color #777
    cursor pointer
    border-radius 3px
    display inline-flex
    align-items center
    gap 6px
    padding 4px 10px
    font-size 13px
    margin-right 4px
    .vue-ui-dark-mode &
      color #aaa
    &:hover
      background $hover-color
      .vue-ui-dark-mode &
        background $dark-hover-color
    &.active
      background rgba($green, .12)
      color $active-color

.nav-count
  background rgba($grey, .25)
  border-radius 8px
  color #777
  font-size 10px
  line-height 14px
  min-width 14px
  padding 0 5px
  text-align center
  .active &
    background rgba($green, .18)
    color $active-color
  .vue-ui-dark-mode &
    background rgba($grey, .15)
    color #aaa

.location-feedback
  align-items center
  border-bottom 1px solid rgba($grey, .15)
  color #777
  display flex
  font-size 12px
  min-height 28px
  padding 4px 12px
  .vue-ui-dark-mode &
    border-bottom-color rgba($grey, .08)
    color #aaa
  &.pending
    .location-feedback-status
      color $blue
  &.success
    .location-feedback-status
      color $active-color
  &.failure
    .location-feedback-status
      color $red

.location-feedback-status
  flex none
  font-weight 600
  margin-right 8px

.location-feedback-breadcrumb
  align-items center
  display flex
  min-width 0
  overflow hidden
  white-space nowrap

.location-feedback-crumb
  min-width 0
  overflow hidden
  text-overflow ellipsis
  &:not(:last-child)
    flex none
    &::after
      color #bbb
      content '/'
      margin 0 6px
  &:last-child
    color $pink
  .vue-ui-dark-mode &
    &:last-child
      color $lightPink

.results
  display flex
  flex-direction column
  padding 5px 0

.result-row
  border-left 3px solid transparent
  border-bottom 1px solid rgba($grey, .15)
  cursor pointer
  padding 8px 14px 8px 11px
  display flex
  flex-direction column
  gap 3px
  color #444
  transition border-color .15s, background-color .15s
  &:hover
    border-left-color rgba($green, .45)
  &.watched
    border-left-color rgba($green, .85)
  .vue-ui-dark-mode &
    color #ddd
    border-bottom-color rgba($grey, .08)

.result-head
  display flex
  align-items center
  min-width 0

.component-name
  color $component-color
  font-family Menlo, Consolas, monospace
  font-size 12px
  font-weight 600
  overflow hidden
  text-overflow ellipsis
  white-space nowrap

.watch-actions
  display flex
  align-items center
  margin-left auto
  flex none
  gap 2px

.watch-mode + .watch-actions
  margin-left 0

.watch-mode
  border 1px solid rgba($green, .35)
  border-radius 2px
  color $active-color
  cursor pointer
  font-size 10px
  line-height 16px
  margin-left auto
  margin-right 6px
  padding 0 5px
  text-transform uppercase
  user-select none
  &:hover
    background rgba($green, .08)
  &.deep
    background rgba($green, .1)
  .vue-ui-dark-mode &
    border-color rgba($green, .45)

.watch-change-count
  background rgba($blue, .12)
  border 1px solid rgba($blue, .28)
  border-radius 8px
  color $blue
  font-size 10px
  line-height 14px
  margin-left 0
  margin-right 6px
  min-width 14px
  padding 0 5px
  text-align center

.watch-button
  appearance none
  align-items center
  background transparent
  border 1px solid transparent
  border-radius 3px
  color #aaa
  cursor pointer
  display flex
  height 22px
  justify-content center
  padding 0
  transition background-color .15s, border-color .15s
  width 24px
  .vue-ui-icon
    height 15px
    width 15px
  .vue-ui-icon >>> svg
    fill #aaa
    transition fill .15s
  .result-row:not(:hover):not(.watched) &:not(.active)
    opacity .55
  &:hover
    background rgba($green, .08)
    border-color rgba($green, .2)
    .vue-ui-icon >>> svg
      fill $active-color
  &.active
    background rgba($green, .1)
    border-color rgba($green, .25)
    color $active-color
    .vue-ui-icon >>> svg
      fill $active-color
  &.deep.active
    background rgba($blue, .1)
    border-color rgba($blue, .25)
    .vue-ui-icon >>> svg
      fill $blue
  .vue-ui-dark-mode &
    &:hover
      background rgba($green, .12)
      border-color rgba($green, .25)
    &.active
      background rgba($green, .16)
      border-color rgba($green, .3)
    &.deep.active
      background rgba($blue, .16)
      border-color rgba($blue, .3)

.watch-menu
  .vue-ui-button
    display block
    width 100%

.result-detail
  display flex
  align-items baseline
  min-width 0
  font-size 12px
  white-space nowrap
  overflow hidden

.prop-type
  background rgba($grey, .35)
  border-radius 2px
  color #666
  flex none
  font-size 10px
  margin-right 6px
  padding 1px 4px
  text-transform uppercase
  .vue-ui-dark-mode &
    background rgba($grey, .12)
    color #aaa

.match-type
  border 1px solid rgba($blue, .25)
  border-radius 2px
  color $blue
  flex none
  font-size 10px
  margin-right 6px
  padding 0 4px
  text-transform uppercase
  &.value
    border-color rgba($green, .28)
    color $active-color

.prop-path
  color $pink
  flex none
  margin-right 5px
  .vue-ui-dark-mode &
    color $lightPink

.prop-value
  color $darkerGreen
  overflow hidden
  text-overflow ellipsis
  .vue-ui-dark-mode &
    color lighten($green, 15%)
  &.changed
    animation eh-value-flash .9s

.watch-copy-target
  align-items center
  display inline-flex
  min-width 0

.watch-copy-text
  min-width 0
  overflow hidden
  text-overflow ellipsis
  white-space nowrap

.prop-value.watch-copy-target
  flex 1 1 auto

.copy-button
  appearance none
  align-items center
  background transparent
  border 1px solid transparent
  border-radius 3px
  color #aaa
  cursor pointer
  display inline-flex
  flex none
  height 18px
  justify-content center
  margin-left 4px
  padding 0
  transition background-color .15s, border-color .15s
  width 18px
  .vue-ui-icon
    height 12px
    width 12px
  .vue-ui-icon >>> svg
    fill #aaa
    transition fill .15s
  &:hover
    background rgba($green, .08)
    border-color rgba($green, .2)
    .vue-ui-icon >>> svg
      fill $active-color
  .vue-ui-dark-mode &
    &:hover
      background rgba($green, .12)
      border-color rgba($green, .25)

.component-path
  color #aaa
  font-family Menlo, Consolas, monospace
  font-size 11px
  overflow hidden
  text-overflow ellipsis
  white-space nowrap

.result-row >>> .eh-keyword
  background rgba(255, 193, 7, .34)
  border-radius 2px
  box-shadow 0 0 0 1px rgba(255, 193, 7, .18)
  color inherit
  font-weight 700
  line-height inherit
  padding 0 1px

.vue-ui-dark-mode .result-row >>> .eh-keyword
  background rgba(255, 213, 79, .28)
  box-shadow 0 0 0 1px rgba(255, 213, 79, .18)

.change-list
  border-left 1px solid rgba($green, .25)
  display flex
  flex-direction column
  font-size 11px
  margin 4px 0 0 8px
  padding-left 8px
  .vue-ui-dark-mode &
    border-left-color rgba($green, .35)

.change-toolbar
  align-items center
  display flex
  gap 6px
  margin-bottom 5px
  min-width 0

.change-filter
  align-items center
  background rgba($grey, .08)
  border 1px solid rgba($grey, .2)
  border-radius 3px
  color #777
  display flex
  flex 1 1 220px
  height 24px
  max-width 360px
  min-width 140px
  padding 0 6px
  .vue-ui-icon
    flex none
    height 13px
    margin-right 5px
    width 13px
  .vue-ui-icon >>> svg
    fill #aaa
  input
    background transparent
    border 0
    color inherit
    flex 1 1 auto
    font-family Menlo, Consolas, monospace
    font-size 11px
    min-width 0
    outline none
    padding 0
  .vue-ui-dark-mode &
    background rgba($grey, .08)
    border-color rgba($grey, .16)
    color #bbb

.change-filter-count
  color #999
  flex none
  line-height 18px
  white-space nowrap

.change-filter-clear
  margin-left 0

.change-empty
  color #aaa
  line-height 18px

.change-row
  align-items start
  display grid
  grid-template-columns 62px minmax(0, 1fr) minmax(0, 1.35fr) auto
  gap 8px
  line-height 17px
  min-width 0
  padding 4px 0

.change-kind
  border-radius 2px
  color #fff
  font-size 10px
  font-weight 600
  line-height 16px
  padding 0 4px
  text-align center
  text-transform uppercase
  &.added
    background $green
  &.removed
    background $red
  &.changed
    background $blue

.change-path
  align-items center
  color $pink
  display flex
  min-width 0
  .vue-ui-dark-mode &
    color $lightPink

.change-path-text
  min-width 0
  overflow hidden
  text-overflow ellipsis
  white-space nowrap

.change-values
  display flex
  flex-direction column
  gap 3px
  min-width 0

.change-value
  align-items center
  color #666
  display grid
  gap 4px
  grid-template-columns 28px minmax(0, 1fr) 18px
  min-width 0
  &.old
    .change-value-label
      color $red
  &.new
    .change-value-label
      color $active-color
  &.empty
    .change-value-label,
    .change-value-text
      color #aaa
  .vue-ui-dark-mode &
    color #bbb

.change-value-label
  color #999
  flex none
  font-size 10px
  text-transform uppercase

.change-value-text
  min-width 0
  overflow hidden
  text-overflow ellipsis
  white-space nowrap

.change-time
  color #aaa
  line-height 17px
  white-space nowrap

.error
  color $red

@keyframes eh-value-flash
  0%
    background rgba($green, .25)
  100%
    background transparent
</style>
