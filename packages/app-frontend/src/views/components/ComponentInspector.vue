<template>
  <scroll-pane>
    <action-header
      v-show="hasTarget"
      slot="header"
    >
      <span class="title">
        <span class="title-bracket">&lt;</span>
        <span>{{ targetName }}</span>
        <span class="title-bracket">&gt;</span>
      </span>
      <div class="search">
        <VueIcon icon="search" />
        <input
          ref="filterInput"
          :value="rawFilter"
          placeholder="Filter key, path, value"
          spellcheck="false"
          @input="onFilterInput"
          @keydown.esc.prevent="clearFilter"
        >
        <button
          v-if="rawFilter"
          v-tooltip="'Clear filter'"
          type="button"
          class="clear-filter"
          @click="clearFilter"
        >
          <VueIcon icon="close" />
        </button>
      </div>
      <VueLoadingIndicator
        v-if="loading || filtering"
        class="primary"
      />
      <a
        v-if="$isChrome"
        v-tooltip="'Inspect DOM'"
        class="button inspect"
        @click="inspectDOM"
      >
        <VueIcon icon="code" />
        <span>Inspect DOM</span>
      </a>
      <a
        v-if="fileIsPath"
        v-tooltip="$t('ComponentInspector.openInEditor.tooltip', { file: target.file })"
        class="button"
        @click="openInEditor"
      >
        <VueIcon icon="launch" />
        <span>Open in editor</span>
      </a>
    </action-header>
    <template slot="scroll">
      <component-watch-tray
        v-if="hasTarget"
        :current-uid="target.id"
        @inspect="inspectWatchEntry"
      />
      <component-state-timeline
        v-if="hasTarget"
        :target="target"
        @inspect="inspectStateChange"
      />
      <section
        v-if="!hasTarget"
        class="notice"
      >
        <div>Select a component instance to inspect.</div>
      </section>
      <div
        v-else-if="!target.state || !target.state.length"
        class="notice"
      >
        <div>This instance has no reactive state.</div>
      </div>
      <div
        v-else-if="filterQuery && !filteredStateCount"
        class="notice"
      >
        <div>No matching inspected data.</div>
      </div>
      <section
        v-else
        class="data"
      >
        <state-inspector
          :state="filteredState"
          :search-query="filterQuery"
          :watch-context="watchContext"
          class="component-state-inspector"
        />
      </section>
    </template>
  </scroll-pane>
</template>

<script>
import ScrollPane from '@front/components/ScrollPane.vue'
import ActionHeader from '@front/components/ActionHeader.vue'
import StateInspector from '@front/components/StateInspector.vue'
import ComponentWatchTray from './ComponentWatchTray.vue'
import ComponentStateTimeline from './ComponentStateTimeline.vue'
import { sortByKey, openInEditor, getComponentDisplayName } from '@utils/util'
import { retryHighlightDataPath } from '@front/util/locate-field'
import groupBy from 'lodash/groupBy'

const SEARCH_MAX_DEPTH = 10
const SEARCH_MAX_VISITED = 4000
const SEARCH_MAX_RESULTS = 200
const FILTER_DEBOUNCE = 220
const INSPECT_STATE_PATH_EVENT = 'vue-devtools-inspect-state-path'

export default {
  components: {
    ScrollPane,
    ActionHeader,
    StateInspector,
    ComponentWatchTray,
    ComponentStateTimeline
  },

  props: {
    target: {
      type: Object,
      required: true
    },
    loading: {
      type: Boolean,
      default: false
    }
  },

  data () {
    return {
      rawFilter: '',
      filterQuery: '',
      filterTimer: null,
      filtering: false,
      pendingWatchInspect: null
    }
  },

  computed: {
    hasTarget () {
      return this.target.id != null
    },

    targetName () {
      return getComponentDisplayName(this.target.name, this.$shared.componentNameStyle)
    },

    filteredEntries () {
      const state = this.target.state || []
      const terms = searchTerms(this.filterQuery)
      const sortedState = sortByKey(state)
      if (!terms.length) return sortedState

      const budget = createSearchBudget()
      return sortedState.reduce((list, entry) => {
        if (searchBudgetExceeded(budget)) return list

        const filtered = filterStateEntry(entry, terms, budget)
        if (filtered) {
          list.push(filtered)
        }
        return list
      }, [])
    },

    filteredState () {
      return groupBy(this.filteredEntries, 'type')
    },

    filteredStateCount () {
      return this.filteredEntries.length
    },

    watchContext () {
      if (!this.hasTarget) return null
      return {
        uid: this.target.id,
        name: this.targetName
      }
    },

    // Checks if the file is actually a path (e.g. '/path/to/file.vue'), or
    // only the basename of a pre-compiled 3rd-party component (e.g. 'file.vue')
    fileIsPath () {
      return this.target.file && /[/\\]/.test(this.target.file)
    }
  },

  watch: {
    'target.id' (id) {
      if (this.pendingWatchInspect && String(this.pendingWatchInspect.uid) === String(id)) {
        this.$nextTick(() => {
          this.applyWatchInspect(this.pendingWatchInspect)
        })
      }
    }
  },

  mounted () {
    window.addEventListener(INSPECT_STATE_PATH_EVENT, this.onInspectStatePath)
  },

  beforeDestroy () {
    clearTimeout(this.filterTimer)
    window.removeEventListener(INSPECT_STATE_PATH_EVENT, this.onInspectStatePath)
  },

  methods: {
    onInspectStatePath (event) {
      const entry = event && event.detail && event.detail.entry
      if (!entry) return

      if (event.detail) {
        event.detail.handled = true
      }

      this.pendingWatchInspect = entry
      if (String(entry.uid) === String(this.target.id)) {
        this.applyWatchInspect(entry)
      }
    },

    inspectDOM () {
      if (!this.hasTarget) return
      if (this.$isChrome) {
        chrome.devtools.inspectedWindow.eval(
          `inspect(window.__VUE_DEVTOOLS_INSTANCE_MAP__.get("${this.target.id}").$el)`
        )
      } else {
        window.alert('DOM inspection is not supported in this shell.')
      }
    },

    openInEditor () {
      const file = this.target.file
      openInEditor(file)
    },

    inspectWatchEntry (entry) {
      this.pendingWatchInspect = entry
      this.$store.dispatch('components/selectInstance', entry.uid)
      if (String(entry.uid) === String(this.target.id)) {
        this.applyWatchInspect(entry)
      }
    },

    inspectStateChange (entry) {
      clearTimeout(this.filterTimer)
      this.rawFilter = ''
      this.filterQuery = ''
      this.filtering = false
      retryHighlightDataPath(entry.path, entry.type)
    },

    applyWatchInspect (entry) {
      // locate without filtering so sibling fields stay visible
      clearTimeout(this.filterTimer)
      this.rawFilter = ''
      this.filterQuery = ''
      this.filtering = false
      this.pendingWatchInspect = null
      retryHighlightDataPath(entry.path, entry.type)
    },

    onFilterInput (event) {
      this.rawFilter = event.target.value
      clearTimeout(this.filterTimer)

      const nextQuery = this.rawFilter.trim()
      if (!nextQuery) {
        this.filtering = false
        this.filterQuery = ''
        return
      }

      if (nextQuery === this.filterQuery) {
        this.filtering = false
        return
      }

      this.filtering = true
      this.filterTimer = setTimeout(() => {
        this.filterQuery = nextQuery
        this.$nextTick(() => {
          this.filtering = false
        })
      }, FILTER_DEBOUNCE)
    },

    clearFilter () {
      clearTimeout(this.filterTimer)
      this.rawFilter = ''
      this.filterQuery = ''
      this.filtering = false
      this.$nextTick(() => {
        if (this.$refs.filterInput) {
          this.$refs.filterInput.focus()
        }
      })
    }
  }
}

function searchTerms (query) {
  return String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function createSearchBudget () {
  return {
    visited: 0,
    results: 0,
    truncated: false
  }
}

function searchBudgetExceeded (budget) {
  if (budget.visited >= SEARCH_MAX_VISITED || budget.results >= SEARCH_MAX_RESULTS) {
    budget.truncated = true
    return true
  }
  return false
}

function reserveSearchResult (budget) {
  if (budget.results >= SEARCH_MAX_RESULTS) {
    budget.truncated = true
    return false
  }
  budget.results++
  return true
}

function filterStateEntry (entry, terms, budget) {
  const path = String(entry.key)
  const directMatch = matchesField(entry.key, path, entry.value, terms, [entry.type])
  if (directMatch && !isSearchableContainer(entry.value)) {
    return entry
  }

  const result = filterChildren(entry.value, path, terms, new Map(), 0, budget)
  if (!directMatch && !result.length) return null

  return {
    ...entry,
    searchChildren: result
  }
}

function filterChildren (value, path, terms, seen, depth, budget) {
  if (depth > SEARCH_MAX_DEPTH || searchBudgetExceeded(budget)) return []

  const raw = searchableContainerValue(value)
  if (!raw || typeof raw !== 'object') return []
  if (seen.has(raw)) return []
  seen.set(raw, true)

  let children = []
  if (Array.isArray(raw)) {
    for (let index = 0; index < raw.length; index++) {
      if (searchBudgetExceeded(budget)) break

      const item = raw[index]
      budget.visited++
      const child = filterChild(index, item, makeChildPath(path, index), terms, seen, depth, budget)
      if (child) children.push(child)
    }
  } else {
    const keys = Object.keys(raw)
    for (let i = 0; i < keys.length; i++) {
      if (searchBudgetExceeded(budget)) break

      const key = keys[i]
      budget.visited++
      const child = filterChild(key, raw[key], makeChildPath(path, key), terms, seen, depth, budget)
      if (child) children.push(child)
    }
  }

  seen.delete(raw)
  return children
}

function filterChild (key, value, path, terms, seen, depth, budget) {
  if (matchesField(key, path, value, terms)) {
    if (!reserveSearchResult(budget)) return null

    const field = {
      key,
      value
    }
    if (isSearchableContainer(value)) {
      field.searchChildren = filterChildren(value, path, terms, seen, depth + 1, budget)
    }
    return field
  }

  const children = filterChildren(value, path, terms, seen, depth + 1, budget)
  if (!children.length) return null
  if (!reserveSearchResult(budget)) return null

  return {
    key,
    value,
    searchChildren: children
  }
}

function matchesField (key, path, value, terms, extra = []) {
  const haystack = extra.concat([
    key,
    path,
    bracketPath(path),
    searchableValue(value)
  ]).filter(value => value !== null && value !== undefined).join(' ').toLowerCase()

  return terms.every(term => haystack.indexOf(term) !== -1)
}

function makeChildPath (path, key) {
  return path + '.' + key
}

function bracketPath (path) {
  return String(path || '').replace(/\.(\d+)(?=\.|$)/g, '[$1]')
}

function searchableContainerValue (value) {
  if (value && value._custom) {
    return value._custom.value
  }
  if (value && value._isArray) {
    return value.items
  }
  return value
}

function isSearchableContainer (value) {
  const raw = searchableContainerValue(value)
  return !!raw && typeof raw === 'object'
}

function searchableValue (value) {
  if (value && value._custom) {
    return [
      value._custom.display,
      value._custom.tooltip,
      primitiveText(value._custom.value)
    ].filter(Boolean).join(' ')
  }
  return primitiveText(value)
}

function primitiveText (value) {
  if (value === null || value === undefined) return String(value)
  const type = typeof value
  return type === 'string' || type === 'number' || type === 'boolean'
    ? String(value)
    : ''
}
</script>

<style lang="stylus" scoped>
.title
  white-space nowrap
  position relative
  top -1px

.clear-filter
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
</style>
