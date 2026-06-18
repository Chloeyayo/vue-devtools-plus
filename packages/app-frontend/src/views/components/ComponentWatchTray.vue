<template>
  <section
    v-if="watched.length"
    class="component-watch-tray"
  >
    <div class="tray-header">
      <div class="tray-title">
        <VueIcon icon="star" />
        <span>Watchboard</span>
        <span class="tray-count">{{ countLabel }}</span>
      </div>
      <VueButton
        v-if="hasCurrentItems && hasOtherItems"
        v-tooltip="showAll ? 'Show current component' : 'Show all watched'"
        class="icon-button flat tray-toggle"
        icon-left="filter_list"
        @click="showAll = !showAll"
      />
    </div>

    <div class="watch-list">
      <div
        v-for="item in visibleItems"
        :key="itemKey(item)"
        :class="{
          current: String(item.uid) === String(currentUid),
          changed: changedValues[itemKey(item)]
        }"
        class="watch-row"
        @click="onRowClick(item)"
      >
        <div class="watch-main">
          <span class="watch-name">{{ item.name }}</span>
          <span class="watch-path">{{ item.path }}</span>
        </div>
        <span class="watch-value">{{ watchValue(item) }}</span>
        <span
          v-tooltip="watchModeSwitchTooltip(item)"
          :class="watchMode(item)"
          class="watch-mode"
          @click.stop
          @dblclick.stop="toggleWatchMode(item)"
        >{{ watchModeLabel(item) }}</span>
        <VueButton
          v-tooltip="'Inspect field'"
          class="icon-button flat row-action"
          icon-left="gps_fixed"
          @click.stop="$emit('inspect', item)"
        />
        <VueDropdown @click.native.stop>
          <VueButton
            slot="trigger"
            v-tooltip="'More actions'"
            class="icon-button flat row-action"
            icon-left="more_vert"
          />

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
              icon-left="close"
              @click="removeWatch(item)"
            >
              Unwatch
            </VueDropdownButton>
          </div>
        </VueDropdown>
      </div>
    </div>
  </section>
</template>

<script>
import Vue from 'vue'
import {
  PAGE_WATCH_SCRIPT,
  WATCHBOARD_CHANGED_EVENT,
  WATCH_POLL_INTERVAL,
  watchboardState,
  watchKey,
  watchMode,
  saveWatched,
  syncWatchedFromStorage
} from '@front/views/enhanced-search/watchboard'

export default {
  name: 'ComponentWatchTray',

  props: {
    currentUid: {
      type: [String, Number],
      default: null
    }
  },

  data () {
    return {
      values: {},
      changedValues: {},
      showAll: false,
      watchTimer: null
    }
  },

  computed: {
    watched () {
      return watchboardState.watched
    },

    currentItems () {
      return this.watched.filter(item => String(item.uid) === String(this.currentUid))
    },

    otherItems () {
      return this.watched.filter(item => String(item.uid) !== String(this.currentUid))
    },

    hasCurrentItems () {
      return !!this.currentItems.length
    },

    hasOtherItems () {
      return !!this.otherItems.length
    },

    visibleItems () {
      if (this.showAll || !this.hasCurrentItems) return this.watched
      return this.currentItems
    },

    countLabel () {
      if (!this.hasCurrentItems || this.showAll) return String(this.watched.length)
      return this.currentItems.length + '/' + this.watched.length
    }
  },

  watch: {
    watched () {
      this.refreshValues()
      this.startPolling()
    },

    currentUid () {
      this.showAll = false
    }
  },

  mounted () {
    syncWatchedFromStorage()
    window.addEventListener(WATCHBOARD_CHANGED_EVENT, this.onWatchboardChanged)
    this.refreshValues()
    this.startPolling()
  },

  beforeDestroy () {
    window.removeEventListener(WATCHBOARD_CHANGED_EVENT, this.onWatchboardChanged)
    this.stopPolling()
  },

  methods: {
    onRowClick (item) {
      const selection = window.getSelection()
      if (selection && selection.toString()) return
      this.$emit('inspect', item)
    },

    itemKey (item) {
      return watchKey(item.uid, item.path)
    },

    watchMode (item) {
      return watchMode(item)
    },

    watchModeLabel (item) {
      return this.watchMode(item) === 'deep' ? 'nested' : 'field'
    },

    watchModeSwitchTooltip (item) {
      return this.watchMode(item) === 'deep'
        ? 'Track field only'
        : 'Track nested changes'
    },

    watchValue (item) {
      let key = this.itemKey(item)
      return Object.prototype.hasOwnProperty.call(this.values, key)
        ? this.values[key]
        : '...'
    },

    removeWatch (item) {
      let key = this.itemKey(item)
      saveWatched(this.watched.filter(watched => this.itemKey(watched) !== key))
      Vue.delete(this.values, key)
      Vue.delete(this.changedValues, key)
    },

    toggleWatchMode (item) {
      let key = this.itemKey(item)
      let mode = this.watchMode(item) === 'deep' ? 'value' : 'deep'
      saveWatched(this.watched.map(watched => {
        return this.itemKey(watched) === key
          ? { ...watched, mode }
          : watched
      }))
      this.refreshValues()
    },

    onWatchboardChanged () {
      this.refreshValues()
      this.startPolling()
    },

    startPolling () {
      this.stopPolling()
      if (this.watched.length) {
        this.watchTimer = setInterval(this.refreshValues, WATCH_POLL_INTERVAL)
      }
    },

    stopPolling () {
      if (this.watchTimer) {
        clearInterval(this.watchTimer)
        this.watchTimer = null
      }
    },

    refreshValues () {
      if (!this.$isChrome) return

      let items = this.watched.map(item => ({
        uid: item.uid,
        path: item.path,
        mode: this.watchMode(item)
      }))
      let watchedKeys = {}
      this.watched.forEach(item => {
        watchedKeys[this.itemKey(item)] = true
      })
      let script = '(' + PAGE_WATCH_SCRIPT + ')(' + JSON.stringify(items) + ')'

      chrome.devtools.inspectedWindow.eval(script, (payload, err) => {
        if (err || !payload) return
        let values = Array.isArray(payload) ? payload : (payload.values || [])
        let events = Array.isArray(payload) ? [] : (payload.events || [])

        values.forEach(item => {
          let key = this.itemKey(item)
          if (watchedKeys[key] && this.values[key] !== item.value) {
            Vue.set(this.values, key, item.value)
          }
        })

        events.forEach(event => {
          let key = this.itemKey(event)
          if (!watchedKeys[key]) return

          if (Object.prototype.hasOwnProperty.call(event, 'value')) {
            Vue.set(this.values, key, event.value)
          }
          Vue.set(this.changedValues, key, true)
          setTimeout(() => Vue.delete(this.changedValues, key), 900)
        })
      })
    }
  }
}
</script>

<style lang="stylus" scoped>
.component-watch-tray
  background $background-color
  border-bottom 1px solid $border-color
  padding 7px 10px 8px
  position sticky
  top 0
  z-index 2
  .vue-ui-dark-mode &
    background $dark-background-color
    border-bottom-color $dark-border-color

.tray-header
  align-items center
  display flex
  justify-content space-between
  margin-bottom 5px

.tray-title
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

.tray-count
  color $blueishGrey
  font-size 11px
  font-weight 500
  margin-left 6px

.tray-toggle
  height 20px
  width 20px
  >>> .vue-ui-icon
    height 15px
    width 15px

.watch-list
  display flex
  flex-direction column
  gap 4px

.watch-row
  align-items center
  border 1px solid rgba($grey, .24)
  border-radius 4px
  cursor pointer
  display grid
  grid-template-columns minmax(120px, 1fr) minmax(70px, .75fr) auto 20px 20px
  gap 6px
  min-height 28px
  padding 3px 5px 3px 7px
  transition background-color .15s, border-color .15s
  &:hover
    background $hover-color
    border-color rgba($green, .32)
  &.current
    border-left 3px solid rgba($green, .75)
    padding-left 5px
  &.changed
    background rgba($green, .1)
    border-color rgba($green, .45)
  .vue-ui-dark-mode &
    border-color rgba($grey, .12)
    &:hover
      background $dark-hover-color

.watch-main
  min-width 0

.watch-name,
.watch-path,
.watch-value
  display block
  overflow hidden
  text-overflow ellipsis
  white-space nowrap
  // !important: global.styl's `#app *` user-select rule outweighs scoped classes
  user-select text !important
  -webkit-user-select text !important
  cursor text

.watch-name
  color $component-color
  font-size 11px
  line-height 13px

.watch-path
  color #666
  font-family Menlo, Consolas, monospace
  font-size 11px
  line-height 13px
  .vue-ui-dark-mode &
    color #aaa

.watch-value
  color #333
  font-family Menlo, Consolas, monospace
  font-size 11px
  .vue-ui-dark-mode &
    color #ddd

.watch-mode
  border-radius 3px
  color #777
  cursor pointer
  font-size 10px
  line-height 16px
  padding 0 5px
  text-transform uppercase
  user-select none
  &:hover
    background rgba($green, .1)
  &.value
    background rgba($green, .12)
  &.deep
    background rgba($blue, .12)

.watch-menu
  .vue-ui-button
    display block
    width 100%

.row-action
  height 20px
  width 20px
  >>> .vue-ui-icon
    height 14px
    width 14px
</style>
