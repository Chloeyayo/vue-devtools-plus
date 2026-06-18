<template>
  <scroll-pane>
    <action-header slot="header">
      <div
        v-tooltip="$t('ComponentTree.filter.tooltip')"
        class="search"
      >
        <VueIcon icon="search" />
        <input
          ref="filterInstances"
          placeholder="Filter components"
          @input="filterInstances"
        >
      </div>
      <a
        v-tooltip="$t('ComponentTree.business.tooltip')"
        :class="{active: businessOnly}"
        class="button business-filter"
        @click="toggleBusinessOnly"
      >
        <VueIcon icon="business" />
        <span>Business</span>
      </a>
      <a
        v-tooltip="$t('ComponentTree.select.tooltip')"
        :class="{active: selecting}"
        class="button select-component"
        @click="setSelecting(!selecting)"
      >
        <VueIcon :icon="selecting ? 'gps_fixed' : 'gps_not_fixed'" />
        <span>Select</span>
      </a>
    </action-header>
    <div
      slot="scroll"
      class="tree"
      :class="{
        'high-density': finalHighDensity
      }"
    >
      <div
        v-if="locationFeedback"
        class="eh-location-feedback"
        :class="locationFeedback.status"
        role="status"
        aria-live="polite"
      >
        <span class="eh-location-feedback-status">{{ locationFeedbackStatusText }}</span>
        <span class="eh-location-feedback-breadcrumb">
          <span
            v-for="(crumb, index) in locationFeedbackBreadcrumb"
            :key="index + '-' + crumb"
            class="eh-location-feedback-crumb"
          >
            {{ crumb }}
          </span>
        </span>
      </div>
      <div
        v-if="businessOnly && !visibleInstances.length"
        class="empty-filtered-tree"
      >
        {{ $t('ComponentTree.business.empty') }}
      </div>
      <div
        v-if="selecting && selectorCandidates.length"
        class="selector-candidates"
      >
        <div class="selector-candidates-title">
          {{ $t('ComponentTree.candidates.title') }}
        </div>
        <button
          v-for="candidate in selectorCandidates"
          :key="candidate.id"
          type="button"
          class="selector-candidate"
          :class="{ selected: candidate.selected }"
          @click.stop="selectSelectorCandidate(candidate)"
          @mouseenter="previewSelectorCandidate(candidate)"
          @mouseleave="clearSelectorPreview"
        >
          <span class="candidate-name">&lt;{{ candidate.name }}&gt;</span>
          <span
            v-if="candidate.level"
            class="candidate-level"
          >
            parent
          </span>
          <span
            v-if="candidate.file"
            class="candidate-file"
          >
            {{ shortFile(candidate.file) }}
          </span>
          <span
            v-if="candidate.stateMatch"
            class="candidate-state-match"
          >
            {{ candidate.stateMatch.type }} {{ candidate.stateMatch.path }}
          </span>
        </button>
      </div>
      <component-instance
        v-for="instance in visibleInstances"
        ref="instances"
        :key="instance.id"
        :instance="instance"
        :depth="0"
      />
    </div>
  </scroll-pane>
</template>

<script>
import { mapGetters, mapState } from 'vuex'
import ScrollPane from '@front/components/ScrollPane.vue'
import ActionHeader from '@front/components/ActionHeader.vue'
import ComponentInstance from './ComponentInstance.vue'

import { classify, focusInput, isBusinessComponent } from '@utils/util'
import Keyboard, {
  UP,
  DOWN,
  LEFT,
  RIGHT
} from '../../mixins/keyboard'

const BUSINESS_FILTER_STORAGE_KEY = 'vue-devtools-business-components-only'
const LOCATION_FEEDBACK_EVENT = 'vue-devtools-eh-location-feedback'
const LOCATION_FEEDBACK_KEY = '__VUE_DEVTOOLS_EH_LOCATION_FEEDBACK__'
const COMPONENT_SELECTOR_SHORTCUT_EVENT = 'vue-devtools-component-selector-shortcut'

export default {
  components: {
    ScrollPane,
    ActionHeader,
    ComponentInstance
  },

  mixins: [
    Keyboard({
      onKeyDown ({ key, code, modifiers }) {
        switch (modifiers) {
          case 'alt':
            if (key === 's' || code === 'KeyS') {
              this.setSelecting(!this.selecting)
              return false
            }
            break
          case 'ctrl':
            if (key === 'f') {
              focusInput(this.$refs.filterInstances)
              return false
            }
            break
          case '':
            if ([LEFT, RIGHT, UP, DOWN].includes(key)) {
              const all = getAllInstances(this.$refs.instances || [])
              if (!all.length) {
                return
              }

              const { current, currentIndex } = findCurrent(all, i => i.selected)
              if (!current) {
                return
              }

              let instanceToSelect

              if (key === LEFT) {
                if (current.expanded && current.$children.filter(isComponentInstance).length) {
                  current.collapse()
                } else if (current.$parent && current.$parent.expanded) {
                  instanceToSelect = current.$parent
                }
              } else if (key === RIGHT) {
                if (current.expanded && current.$children.filter(isComponentInstance).length) {
                  instanceToSelect = findByIndex(all, currentIndex + 1)
                } else {
                  current.expand()
                }
              } else if (key === UP) {
                instanceToSelect = findByIndex(all, currentIndex - 1)
              } else if (key === DOWN) {
                instanceToSelect = findByIndex(all, currentIndex + 1)
              }

              if (instanceToSelect) {
                instanceToSelect.select()
                instanceToSelect.scrollIntoView(false)
              }
              return false
            }
        }
      }
    })
  ],

  props: {
    instances: {
      type: Array,
      required: true
    }
  },

  data () {
    return {
      selecting: false,
      highDensity: false,
      businessOnly: window.localStorage.getItem(BUSINESS_FILTER_STORAGE_KEY) !== 'false',
      selectorCandidates: [],
      locationFeedback: null,
      locationFeedbackTimer: null
    }
  },

  computed: {
    ...mapState('components', [
      'expansionMap'
    ]),

    ...mapGetters('components', [
      'totalCount'
    ]),

    finalHighDensity () {
      if (this.$shared.displayDensity === 'auto') {
        return this.highDensity
      }
      return this.$shared.displayDensity === 'high'
    },

    visibleInstances () {
      return this.businessOnly
        ? filterBusinessInstances(this.instances)
        : this.instances
    },

    visibleCount () {
      return countInstances(this.visibleInstances)
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

  watch: {
    expansionMap: {
      handler: 'updateAutoDensity',
      deep: true,
      immediate: true
    },
    totalCount: 'updateAutoDensity',
    visibleCount: 'updateAutoDensity',
    businessOnly: 'updateAutoDensity',
    '$responsive.height': 'updateAutoDensity'
  },

  mounted () {
    bridge.on('instance-selected', this.stopSelector)
    bridge.on('stop-component-selector', this.stopSelector)
    bridge.on('component-selector-candidates', this.updateSelectorCandidates)
    window.addEventListener(LOCATION_FEEDBACK_EVENT, this.updateLocationFeedback)
    window.addEventListener(COMPONENT_SELECTOR_SHORTCUT_EVENT, this.onComponentSelectorShortcut)
    this.updateLocationFeedback({
      detail: window[LOCATION_FEEDBACK_KEY]
    })
  },

  beforeDestroy () {
    this.setSelecting(false)
    clearTimeout(this.locationFeedbackTimer)
    bridge.off('instance-selected', this.stopSelector)
    bridge.off('stop-component-selector', this.stopSelector)
    bridge.off('component-selector-candidates', this.updateSelectorCandidates)
    window.removeEventListener(LOCATION_FEEDBACK_EVENT, this.updateLocationFeedback)
    window.removeEventListener(COMPONENT_SELECTOR_SHORTCUT_EVENT, this.onComponentSelectorShortcut)
  },

  methods: {
    onComponentSelectorShortcut (event) {
      if (event && event.detail) {
        event.detail.handled = true
      }
      this.setSelecting(!this.selecting)
    },

    stopSelector () {
      this.selectorCandidates = []
      this.setSelecting(false)
    },

    updateSelectorCandidates (payload) {
      this.selectorCandidates = payload && payload.candidates
        ? payload.candidates
        : []
    },

    updateLocationFeedback (event) {
      clearTimeout(this.locationFeedbackTimer)
      this.locationFeedback = event && event.detail
        ? event.detail
        : null

      if (
        this.locationFeedback &&
        this.locationFeedback.status !== 'pending'
      ) {
        let id = this.locationFeedback.id
        this.locationFeedbackTimer = setTimeout(() => {
          if (this.locationFeedback && this.locationFeedback.id === id) {
            this.locationFeedback = null
          }
        }, this.locationFeedback.status === 'success' ? 2400 : 4000)
      }
    },

    filterInstances (e) {
      bridge.send('filter-instances', classify(e.target.value))
    },

    toggleBusinessOnly () {
      this.businessOnly = !this.businessOnly
      window.localStorage.setItem(BUSINESS_FILTER_STORAGE_KEY, this.businessOnly ? 'true' : 'false')
    },

    setSelecting (value) {
      if (this.selecting !== value) {
        this.selecting = value

        if (this.selecting) {
          bridge.send('start-component-selector')
        } else {
          bridge.send('stop-component-selector')
        }
      }
    },

    updateAutoDensity () {
      if (this.$shared.displayDensity === 'auto') {
        this.$nextTick(() => {
          const totalHeight = this.$isChrome ? this.$responsive.height : this.$root.$el.offsetHeight
          const count = this.$el.querySelectorAll('.instance').length
          const treeHeight = 22 * count
          const scrollHeight = totalHeight - (totalHeight <= 350 ? 76 : 111)
          this.highDensity = treeHeight >= scrollHeight
        })
      }
    },

    selectSelectorCandidate (candidate) {
      this.$store.dispatch('components/selectInstance', candidate.id)
      this.selectorCandidates = []
      this.setSelecting(false)
    },

    previewSelectorCandidate (candidate) {
      bridge.send('enter-instance', candidate.id)
    },

    clearSelectorPreview () {
      bridge.send('leave-instance')
    },

    shortFile (file) {
      return String(file || '').replace(/^.*[\\/]/, '')
    }
  }
}

const isComponentInstance = object => typeof object !== 'undefined' && typeof object.instance !== 'undefined'

const isBusinessTreeInstance = instance => instance.isBusinessComponent === false
  ? false
  : isBusinessComponent(instance)

const filterBusinessInstances = instances => instances.reduce((list, instance) => {
  const children = filterBusinessInstances(instance.children || [])
  if (isBusinessTreeInstance(instance)) {
    list.push({
      ...instance,
      children
    })
  } else {
    list.push(...children)
  }
  return list
}, [])

const countInstances = instances => instances.reduce((total, instance) => {
  return total + 1 + countInstances(instance.children || [])
}, 0)

const getAllInstances = list => (list || []).reduce((instances, i) => {
  if (isComponentInstance(i)) {
    instances.push(i)
  }
  instances = instances.concat(getAllInstances(i.$children))
  return instances
}, [])

function findCurrent (all, check) {
  for (let i = 0; i < all.length; i++) {
    if (check(all[i])) {
      return {
        current: all[i],
        currentIndex: i
      }
    }
  }
  return {
    current: null,
    currentIndex: -1
  }
}

function findByIndex (all, index) {
  if (index < 0) {
    return all[0]
  } else if (index >= all.length) {
    return all[all.length - 1]
  } else {
    return all[index]
  }
}
</script>

<style lang="stylus">
.tree
  padding 5px

.eh-location-feedback
  align-items center
  border-bottom 1px solid rgba($grey, .15)
  color #777
  display flex
  font-family Roboto, sans-serif
  font-size 12px
  margin -5px -5px 5px
  min-height 28px
  padding 4px 10px
  .vue-ui-dark-mode &
    border-bottom-color rgba($grey, .08)
    color #aaa
  &.pending
    .eh-location-feedback-status
      color $blue
  &.success
    .eh-location-feedback-status
      color $active-color
  &.failure
    .eh-location-feedback-status
      color $red

.eh-location-feedback-status
  flex none
  font-weight 600
  margin-right 8px

.eh-location-feedback-breadcrumb
  align-items center
  display flex
  font-family Menlo, Consolas, monospace
  min-width 0
  overflow hidden
  white-space nowrap

.eh-location-feedback-crumb
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

.selector-candidates
  background $background-color
  border-bottom 1px solid $border-color
  box-shadow 0 2px 6px rgba($grey, .12)
  margin -5px -5px 5px
  padding 6px 8px
  position sticky
  top 0
  z-index 5
  .vue-ui-dark-mode &
    background $dark-background-color
    border-bottom-color $dark-border-color
    box-shadow 0 2px 6px rgba(#000, .22)

.selector-candidates-title
  color #999
  font-size 11px
  line-height 16px
  margin-bottom 4px
  text-transform uppercase

.selector-candidate
  appearance none
  align-items center
  background transparent
  border 1px solid transparent
  border-radius 3px
  color #555
  cursor pointer
  display flex
  font-family Menlo, Consolas, monospace
  font-size 12px
  line-height 20px
  min-width 0
  padding 1px 5px
  text-align left
  width 100%
  .vue-ui-dark-mode &
    color #ddd
  &:hover
    background $hover-color
    .vue-ui-dark-mode &
      background $dark-hover-color
  &.selected
    background rgba($green, .12)
    border-color rgba($green, .24)

.candidate-name
  color $component-color
  flex none
  font-weight 600

.candidate-level
  border 1px solid rgba($blue, .22)
  border-radius 2px
  color $blue
  flex none
  font-family Roboto, sans-serif
  font-size 10px
  line-height 14px
  margin-left 6px
  padding 0 4px
  text-transform uppercase

.candidate-file
  color #aaa
  flex 1
  margin-left 6px
  overflow hidden
  text-overflow ellipsis
  white-space nowrap

.candidate-state-match
  border 1px solid rgba($green, .28)
  border-radius 2px
  color $active-color
  flex none
  font-family Menlo, Consolas, monospace
  font-size 10px
  line-height 14px
  margin-left 6px
  max-width 48%
  overflow hidden
  padding 0 4px
  text-overflow ellipsis
  white-space nowrap

.select-component
  &.active
    color $active-color
    .vue-ui-icon
      animation pulse 2s infinite linear

.business-filter
  &.active
    color $active-color

.empty-filtered-tree
  color #999
  font-size 12px
  line-height 24px
  padding 8px 10px
</style>
