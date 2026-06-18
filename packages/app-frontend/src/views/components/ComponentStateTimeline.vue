<template>
  <section
    v-show="hasEntries"
    class="component-state-timeline"
  >
    <div class="timeline-header">
      <div class="timeline-title">
        <VueIcon icon="timeline" />
        <span>State changes</span>
        <span class="timeline-count">{{ entries.length }}</span>
      </div>
      <VueButton
        v-tooltip="'Clear state changes'"
        class="icon-button flat timeline-clear"
        icon-left="delete_sweep"
        @click="clear"
      />
    </div>

    <div class="timeline-list">
      <div
        v-for="entry in entries"
        :key="entry.id"
        class="timeline-row"
      >
        <div class="timeline-main">
          <span class="timeline-path">{{ entry.path }}</span>
          <span class="timeline-meta">{{ entry.changeType }} / {{ entry.type }} / {{ entry.time }}</span>
        </div>
        <div class="timeline-values">
          <span class="timeline-old">{{ entry.oldValue }}</span>
          <VueIcon icon="arrow_forward" />
          <span class="timeline-new">{{ entry.newValue }}</span>
        </div>
        <VueButton
          v-tooltip="'Inspect field'"
          class="icon-button flat row-action"
          icon-left="gps_fixed"
          @click="$emit('inspect', entry)"
        />
      </div>
    </div>
  </section>
</template>

<script>
const MAX_DEPTH = 8
const MAX_VISITED = 3000
const MAX_ENTRIES = 30
const MAX_CHANGES_PER_TICK = 12
const MAX_VALUE_LENGTH = 90

let nextEntryId = 1

export default {
  name: 'ComponentStateTimeline',

  props: {
    target: {
      type: Object,
      required: true
    }
  },

  data () {
    return {
      baseline: null,
      baselineId: null,
      entries: []
    }
  },

  computed: {
    hasEntries () {
      return this.entries.length > 0
    }
  },

  watch: {
    'target.id': {
      handler () {
        this.reset()
      },
      immediate: true
    },

    'target.state': {
      handler () {
        this.recordChanges()
      }
    }
  },

  methods: {
    clear () {
      this.entries = []
      this.baseline = flattenState(this.target.state)
      this.baselineId = this.target.id
    },

    reset () {
      this.entries = []
      this.baseline = flattenState(this.target.state)
      this.baselineId = this.target.id
    },

    recordChanges () {
      if (this.target.id == null) {
        this.reset()
        return
      }

      const current = flattenState(this.target.state)
      if (!this.baseline || String(this.baselineId) !== String(this.target.id)) {
        this.baseline = current
        this.baselineId = this.target.id
        return
      }

      const changes = diffSnapshots(this.baseline, current)
      this.baseline = current
      if (!changes.length) return

      const now = formatTime()
      const next = changes.slice(0, MAX_CHANGES_PER_TICK).map(change => ({
        id: nextEntryId++,
        time: now,
        path: change.path,
        type: change.type,
        changeType: change.changeType,
        oldValue: change.oldValue,
        newValue: change.newValue
      }))

      this.entries = next.concat(this.entries).slice(0, MAX_ENTRIES)
    }
  }
}

function formatTime () {
  const date = new Date()
  return [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join(':') + '.' + String(date.getMilliseconds()).padStart(3, '0')
}

function pad (value) {
  return String(value).padStart(2, '0')
}

function flattenState (state) {
  const map = {}
  const budget = { visited: 0 }
  const entries = Array.isArray(state) ? state : []
  entries.forEach(entry => {
    const path = String(entry.key)
    walkValue(entry.value, path, entry.type, map, new Map(), 0, budget)
  })
  return map
}

function walkValue (value, path, type, map, seen, depth, budget) {
  if (budget.visited++ > MAX_VISITED) return

  const raw = unwrapValue(value)
  const summary = summarizeValue(value)
  map[path] = {
    type,
    value: summary
  }

  if (!raw || typeof raw !== 'object' || depth >= MAX_DEPTH) return
  if (seen.has(raw)) return
  seen.set(raw, true)

  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      walkValue(raw[i], path + '.' + i, type, map, seen, depth + 1, budget)
    }
  } else {
    Object.keys(raw).forEach(key => {
      walkValue(raw[key], path + '.' + key, type, map, seen, depth + 1, budget)
    })
  }

  seen.delete(raw)
}

function unwrapValue (value) {
  if (value && value._custom) return value._custom.value
  if (value && value._isArray) return value.items
  return value
}

function summarizeValue (value) {
  if (value && value._custom) {
    return clip(value._custom.display || primitiveSummary(value._custom.value))
  }
  if (value && value._isArray) {
    return 'Array[' + (value.items ? value.items.length : 0) + ']'
  }
  return clip(primitiveSummary(value))
}

function primitiveSummary (value) {
  if (value === null) return 'null'
  if (value === undefined) return 'undefined'

  const type = typeof value
  if (type === 'string') return JSON.stringify(value)
  if (type === 'number' || type === 'boolean') return String(value)
  if (Array.isArray(value)) return 'Array[' + value.length + ']'
  if (type === 'object') return 'Object'
  return type
}

function clip (value) {
  const text = String(value)
  return text.length > MAX_VALUE_LENGTH
    ? text.slice(0, MAX_VALUE_LENGTH - 3) + '...'
    : text
}

function diffSnapshots (before, after) {
  const keys = {}
  Object.keys(before).forEach(key => { keys[key] = true })
  Object.keys(after).forEach(key => { keys[key] = true })

  return Object.keys(keys).sort().reduce((list, path) => {
    const oldEntry = before[path]
    const newEntry = after[path]

    if (!oldEntry) {
      list.push(makeChange(path, 'added', '', newEntry))
    } else if (!newEntry) {
      list.push(makeChange(path, 'removed', oldEntry, ''))
    } else if (oldEntry.value !== newEntry.value) {
      list.push(makeChange(path, 'changed', oldEntry, newEntry))
    }
    return list
  }, [])
}

function makeChange (path, changeType, oldEntry, newEntry) {
  return {
    path,
    type: (oldEntry && oldEntry.type) || (newEntry && newEntry.type) || '',
    changeType,
    oldValue: oldEntry && Object.prototype.hasOwnProperty.call(oldEntry, 'value') ? oldEntry.value : '',
    newValue: newEntry && Object.prototype.hasOwnProperty.call(newEntry, 'value') ? newEntry.value : ''
  }
}
</script>

<style lang="stylus" scoped>
.component-state-timeline
  background $background-color
  border-bottom 1px solid $border-color
  padding 7px 10px 8px
  .vue-ui-dark-mode &
    background $dark-background-color
    border-bottom-color $dark-border-color

.timeline-header
  align-items center
  display flex
  justify-content space-between
  margin-bottom 5px

.timeline-title
  align-items center
  color $component-color
  display flex
  font-size 12px
  font-weight 600
  min-width 0
  .vue-ui-icon
    height 15px
    margin-right 5px
    width 15px

.timeline-count
  color $blueishGrey
  font-size 11px
  font-weight 500
  margin-left 6px

.timeline-clear
  height 20px
  width 20px
  >>> .vue-ui-icon
    height 15px
    width 15px

.timeline-list
  display flex
  flex-direction column
  gap 4px
  max-height 142px
  overflow auto

.timeline-row
  align-items center
  border 1px solid rgba($grey, .24)
  border-left 3px solid rgba($blue, .55)
  border-radius 4px
  display grid
  gap 6px
  grid-template-columns minmax(120px, .8fr) minmax(150px, 1.2fr) 20px
  min-height 28px
  padding 3px 5px
  .vue-ui-dark-mode &
    border-color rgba($grey, .12)
    border-left-color rgba($blue, .65)

.timeline-main,
.timeline-values
  min-width 0

.timeline-path,
.timeline-meta,
.timeline-old,
.timeline-new
  display block
  overflow hidden
  text-overflow ellipsis
  white-space nowrap
  user-select text !important
  -webkit-user-select text !important
  cursor text

.timeline-path
  color $component-color
  font-family Menlo, Consolas, monospace
  font-size 11px
  line-height 13px

.timeline-meta
  color $blueishGrey
  font-size 10px
  line-height 12px

.timeline-values
  align-items center
  display grid
  gap 5px
  grid-template-columns minmax(0, 1fr) 14px minmax(0, 1fr)
  .vue-ui-icon
    height 13px
    opacity .65
    width 13px

.timeline-old,
.timeline-new
  color #333
  font-family Menlo, Consolas, monospace
  font-size 11px
  .vue-ui-dark-mode &
    color #ddd

.timeline-old
  opacity .7

.row-action
  height 20px
  width 20px
  >>> .vue-ui-icon
    height 14px
    width 14px
</style>
