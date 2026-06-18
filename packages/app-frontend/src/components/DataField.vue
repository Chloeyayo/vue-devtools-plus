<template>
  <div class="data-field">
    <VTooltip
      :style="{ marginLeft: depth * 14 + 'px' }"
      :disabled="!field.meta"
      :class="{
        'force-toolbar': contextMenuOpen || editing,
        watched: isFieldWatched,
      }"
      class="self"
      placement="left"
      offset="24"
      @click.native="onClick"
      @mouseenter.native="onContextMenuMouseEnter"
      @mouseleave.native="onContextMenuMouseLeave"
    >
      <span
        v-show="isExpandableType"
        :class="{ rotated: expanded }"
        class="arrow right"
      />
      <span
        v-if="editing && renamable"
      >
        <input
          ref="keyInput"
          v-model="editedKey"
          class="edit-input key-input"
          :class="{ error: !keyValid }"
          @keydown.esc.capture.stop.prevent="cancelEdit()"
          @keydown.enter="submitEdit()"
        >
      </span>
      <!-- eslint-disable vue/no-v-html -->
      <span
        v-else
        :class="{ abstract: fieldOptions.abstract }"
        class="key"
        v-html="highlightedKey"
      /><span
        v-if="!fieldOptions.abstract"
        class="colon"
      >:</span>

      <span
        v-if="editing"
        class="edit-overlay"
      >
        <input
          ref="editInput"
          v-model="editedValue"
          class="edit-input value-input"
          :class="{ error: !valueValid }"
          list="special-tokens"
          @keydown.esc.capture.stop.prevent="cancelEdit()"
          @keydown.enter="submitEdit()"
        >
        <span class="actions">
          <VueIcon
            v-if="!editValid"
            v-tooltip="editErrorMessage"
            class="small-icon warning"
            icon="warning"
          />
          <template v-else>
            <VueButton
              v-tooltip="$t('DataField.edit.cancel.tooltip')"
              class="icon-button flat"
              icon-left="cancel"
              @click="cancelEdit()"
            />
            <VueButton
              v-tooltip="$t('DataField.edit.submit.tooltip')"
              class="icon-button flat"
              icon-left="save"
              @click="submitEdit()"
            />
          </template>
        </span>
      </span>
      <template v-else>
        <span
          v-tooltip="valueTooltip"
          :class="valueClass"
          class="value"
          @dblclick="openEdit()"
          v-html="highlightedFormattedValue"
        />
        <span class="actions">
          <template v-if="quickEdits">
            <VueButton
              v-for="(info, index) of quickEdits"
              :key="index"
              v-tooltip="info.title || 'Quick edit'"
              :class="info.class"
              :icon-left="info.icon"
              class="quick-edit icon-button flat"
              @click="quickEdit(info, $event)"
            />
          </template>
          <VueButton
            v-if="isSubfieldsEditable && !addingValue"
            v-tooltip="'Add new value'"
            class="add-value icon-button flat"
            icon-left="add_circle"
            @click="addNewValue()"
          />
          <VueButton
            v-if="canWatchField"
            v-tooltip="isValueWatched ? 'Unwatch field' : 'Watch field'"
            :class="{ active: isValueWatched }"
            :icon-left="isValueWatched ? 'star' : 'star_border'"
            class="watch-field icon-button flat"
            @click.stop="toggleWatchField('value')"
          />
          <VueButton
            v-if="canDeepWatchField || isDeepWatched"
            v-tooltip="isDeepWatched ? 'Unwatch nested changes' : 'Watch nested changes'"
            :class="{ active: isDeepWatched }"
            class="watch-field deep icon-button flat"
            icon-left="compare_arrows"
            @click.stop="toggleWatchField('deep')"
          />

          <!-- Context menu -->
          <VueDropdown
            :open.sync="contextMenuOpen"
            @click.native.stop
          >
            <VueButton
              slot="trigger"
              icon-left="more_vert"
              class="icon-button flat"
            />

            <div
              class="context-menu-dropdown"
              @mouseenter="onContextMenuMouseEnter"
              @mouseleave="onContextMenuMouseLeave"
            >
              <VueDropdownButton
                v-if="isValueEditable"
                icon-left="edit"
                @click="openEdit()"
              >
                Edit value
              </VueDropdownButton>
              <VueDropdownButton
                icon-left="flip_to_front"
                @click="copyToClipboard"
              >
                {{ $t('DataField.contextMenu.copyValue') }}
              </VueDropdownButton>
              <VueDropdownButton
                v-if="removable"
                icon-left="delete"
                @click="removeField()"
              >
                Remove value
              </VueDropdownButton>
            </div>
          </VueDropdown>
        </span>
      </template>
      <!-- eslint-enable vue/no-v-html -->

      <template #popper>
        <div
          v-if="field.meta"
          class="meta"
        >
          <div
            v-for="(val, key) in field.meta"
            :key="key"
            class="meta-field"
          >
            <span class="key">{{ key }}</span>
            <span class="value">{{ val }}</span>
          </div>
        </div>
      </template>
    </VTooltip>
    <div
      v-if="expanded && isExpandableType"
      class="children"
    >
      <data-field
        v-for="subField in formattedSubFields"
        :key="subField.key"
        :field="subField"
        :parent-field="field"
        :depth="depth + 1"
        :path="`${path}.${subField.key}`"
        :editable="isEditable"
        :removable="isSubfieldsEditable"
        :renamable="editable && valueType === 'plain-object'"
        :force-collapse="forceCollapse"
        :search-query="searchQuery"
        :is-state-field="isStateField"
        :watch-context="watchContext"
        :watch-type="fieldWatchType"
      />
      <VueButton
        v-if="subFieldCount > limit"
        v-tooltip="'Show more'"
        :style="{ marginLeft: depthMargin + 'px' }"
        icon-left="more_horiz"
        class="icon-button flat more"
        @click="showMoreSubfields()"
      />
      <data-field
        v-if="isSubfieldsEditable && addingValue"
        ref="newField"
        :field="newField"
        :depth="depth + 1"
        :path="`${path}.${newField.key}`"
        :renamable="valueType === 'plain-object'"
        :force-collapse="forceCollapse"
        :search-query="searchQuery"
        :watch-context="watchContext"
        :watch-type="fieldWatchType"
        editable
        removable
        :is-state-field="isStateField"
        @cancel-edit="addingValue = false"
        @submit-edit="addingValue = false"
      />
    </div>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import {
  isPlainObject,
  sortByKey,
  openInEditor,
  copyToClipboard,
  escape as escapeHtml,
  escapeRegExp
} from '@utils/util'
import { formattedValue, valueType } from '@front/filters'
import {
  watchboardState,
  isWatchedMode as isWatchboardMode,
  toggleWatch as toggleWatchboard
} from '@front/views/enhanced-search/watchboard'

import DataFieldEdit from '@front/mixins/data-field-edit'

function subFieldCount (value) {
  if (Array.isArray(value)) {
    return value.length
  } else if (value && typeof value === 'object') {
    return Object.keys(value).length
  } else {
    return 0
  }
}

let cachedQuery = null
let cachedPattern = null

function searchPattern (query) {
  if (query !== cachedQuery) {
    const terms = String(query || '').trim().split(/\s+/).filter(Boolean)
    cachedQuery = query
    cachedPattern = terms.length
      ? new RegExp(terms.map(escapeRegExp).join('|'), 'ig')
      : null
  }
  return cachedPattern
}

function highlightPlainText (value, query) {
  const text = String(value == null ? '' : value)
  const pattern = searchPattern(query)
  if (!pattern) return escapeHtml(text)

  pattern.lastIndex = 0
  let output = ''
  let cursor = 0
  let match
  while ((match = pattern.exec(text))) {
    output += escapeHtml(text.slice(cursor, match.index))
    output += '<mark class="data-search-keyword">' + escapeHtml(match[0]) + '</mark>'
    cursor = match.index + match[0].length
  }
  return output + escapeHtml(text.slice(cursor))
}

function highlightFormattedHtml (html, query) {
  const pattern = searchPattern(query)
  if (!pattern) return html

  return String(html == null ? '' : html).split(/(<[^>]*>)/g).map(part => {
    if (!part || part.charAt(0) === '<') return part
    return part.replace(pattern, '<mark class="data-search-keyword">$&</mark>')
  }).join('')
}

export default {
  name: 'DataField',

  mixins: [
    DataFieldEdit
  ],

  props: {
    field: {
      type: Object,
      required: true
    },
    depth: {
      type: Number,
      required: true
    },
    path: {
      type: String,
      required: true
    },
    forceCollapse: {
      type: String,
      default: null
    },
    isStateField: {
      type: Boolean,
      default: false
    },
    searchQuery: {
      type: String,
      default: ''
    },
    watchContext: {
      type: Object,
      default: null
    },
    watchType: {
      type: String,
      default: ''
    }
  },

  data () {
    const value = this.field.value && this.field.value._custom ? this.field.value._custom.value : this.field.value
    return {
      contextMenuOpen: false,
      limit: 20,
      expanded: this.depth === 0 && this.field.key !== '$route' && (subFieldCount(value) < 6)
    }
  },

  computed: {
    ...mapState('components', [
      'inspectedInstance'
    ]),

    depthMargin () {
      return (this.depth + 1) * 14 + 10
    },

    valueType () {
      const value = this.field.value
      return valueType(value)
    },

    rawValueType () {
      return typeof this.field.value
    },

    isExpandableType () {
      let value = this.field.value
      if (this.valueType === 'custom') {
        value = value._custom.value
      }
      const closed = this.fieldOptions.closed
      const closedDefined = typeof closed !== 'undefined'
      return (!closedDefined &&
        (
          Array.isArray(value) ||
          isPlainObject(value)
        )) ||
        (
          closedDefined &&
          !closed
        )
    },

    formattedValue () {
      let value = this.field.value
      if (this.fieldOptions.abstract) {
        return ''
      } else {
        return formattedValue(value)
      }
    },

    highlightedFormattedValue () {
      return highlightFormattedHtml(this.formattedValue, this.searchQuery)
    },

    rawValue () {
      let value = this.field.value

      // CustomValue API
      const isCustom = this.valueType === 'custom'
      let inherit = {}
      if (isCustom) {
        inherit = value._custom.fields || {}
        value = value._custom.value
      }

      if (value && value._isArray) {
        value = value.items
      }
      return { value, inherit }
    },

    formattedSubFields () {
      if (this.field.searchChildren) {
        return this.field.searchChildren.slice(0, this.limit).map(field => ({
          ...field
        }))
      }

      let { value, inherit } = this.rawValue

      if (Array.isArray(value)) {
        return value.slice(0, this.limit).map((item, i) => ({
          key: i,
          value: item,
          ...inherit
        }))
      } else if (typeof value === 'object') {
        value = Object.keys(value).map(key => ({
          key,
          value: value[key],
          ...inherit
        }))
        if (this.valueType !== 'custom') {
          value = sortByKey(value)
        }
      }

      return value.slice(0, this.limit)
    },

    subFieldCount () {
      if (this.field.searchChildren) {
        return this.field.searchChildren.length
      }

      const { value } = this.rawValue
      return subFieldCount(value)
    },

    valueTooltip () {
      const type = this.valueType
      if (type === 'custom') {
        return this.field.value._custom.tooltip
      } else if (type.indexOf('native ') === 0) {
        return type.substr('native '.length)
      } else {
        return null
      }
    },

    fieldOptions () {
      if (this.valueType === 'custom') {
        return Object.assign({}, this.field, this.field.value._custom)
      } else {
        return this.field
      }
    },

    editErrorMessage () {
      if (!this.valueValid) {
        return 'Invalid value (must be valid JSON)'
      } else if (!this.keyValid) {
        if (this.duplicateKey) {
          return 'Duplicate key'
        } else {
          return 'Invalid key'
        }
      }
      return ''
    },

    valueClass () {
      const cssClass = [this.valueType, `raw-${this.rawValueType}`]
      if (this.valueType === 'custom') {
        const value = this.field.value
        value._custom.type && cssClass.push(`type-${value._custom.type}`)
        value._custom.class && cssClass.push(value._custom.class)
      }
      return cssClass
    },

    displayedKey () {
      let key = this.field.key
      if (typeof key === 'string') {
        key = key.replace('__vue__', '')
      }
      return key
    },

    highlightedKey () {
      return highlightPlainText(this.displayedKey, this.searchQuery)
    },

    fieldWatchType () {
      return this.field.type || this.watchType
    },

    canWatchField () {
      return !!(
        this.watchContext &&
        this.watchContext.uid != null &&
        this.path &&
        this.fieldWatchType &&
        !this.fieldOptions.abstract
      )
    },

    canDeepWatchField () {
      return this.canWatchField && this.isExpandableType
    },

    watchEntry () {
      if (!this.canWatchField) return null
      return {
        uid: this.watchContext.uid,
        name: this.watchContext.name,
        path: this.path,
        type: this.fieldWatchType,
        value: this.formattedValue
      }
    },

    watchedFields () {
      return watchboardState.watched
    },

    isValueWatched () {
      return this.watchEntry && isWatchboardMode(this.watchedFields, this.watchEntry.uid, this.watchEntry.path, 'value')
    },

    isDeepWatched () {
      return this.watchEntry && isWatchboardMode(this.watchedFields, this.watchEntry.uid, this.watchEntry.path, 'deep')
    },

    isFieldWatched () {
      return this.isValueWatched || this.isDeepWatched
    }
  },

  watch: {
    searchQuery: {
      handler (value) {
        if (value && this.isExpandableType) {
          this.expanded = true
        }
      },
      immediate: true
    },

    forceCollapse: {
      handler (value) {
        if (value === 'search' && this.isExpandableType) {
          this.expanded = true
        } else if (value === 'expand' && this.depth < 4) {
          this.expanded = true
        } else if (value === 'collapse') {
          this.expanded = false
        }
      },
      immediate: true
    }
  },

  methods: {
    copyToClipboard () {
      copyToClipboard(this.field.value)
    },

    toggleWatchField (mode) {
      if (!this.watchEntry) return
      toggleWatchboard(this.watchEntry, mode)
    },

    onClick (event) {
      // Cancel if target is interactive
      if (event.target.tagName === 'INPUT' || event.target.className.includes('button')) {
        return
      }

      // Cancel if the user is selecting text to copy
      const selection = window.getSelection()
      if (selection && selection.toString()) {
        return
      }

      // CustomValue API `file`
      if (this.valueType === 'custom' && this.fieldOptions.file) {
        return openInEditor(this.fieldOptions.file)
      }
      if (this.valueType === 'custom' && this.fieldOptions['type'] === '$refs') {
        if (this.$isChrome) {
          const evl = `inspect(window.__VUE_DEVTOOLS_INSTANCE_MAP__.get("${this.fieldOptions.uid}").$refs["${this.fieldOptions.key}"])`
          console.log(evl)
          chrome.devtools.inspectedWindow.eval(evl)
        } else {
          window.alert('DOM inspection is not supported in this shell.')
        }
      }

      // Default action
      this.toggle()
    },

    toggle () {
      if (this.isExpandableType) {
        this.expanded = !this.expanded

        !this.expanded && this.cancelCurrentEdition()
      }
    },

    hyphen: v => v.replace(/\s/g, '-'),

    onContextMenuMouseEnter () {
      clearTimeout(this.$_contextMenuTimer)
    },

    onContextMenuMouseLeave () {
      clearTimeout(this.$_contextMenuTimer)
      this.$_contextMenuTimer = setTimeout(() => {
        this.contextMenuOpen = false
      }, 4000)
    },

    showMoreSubfields () {
      this.limit += 20
    }
  }
}
</script>

<style lang="stylus" scoped>
.data-field
  user-select text
  font-size 12px
  font-family Menlo, Consolas, monospace
  cursor pointer

.self
  height 20px
  line-height 20px
  position relative
  white-space nowrap
  padding-left 14px
  .high-density &
    height 14px
    line-height 14px
  span, div
    display inline-block
    vertical-align middle
  .arrow
    position absolute
    top 7px
    left 0px
    transition transform .1s ease
    &.rotated
      transform rotate(90deg)
  .actions
    visibility hidden
    display inline-flex
    align-items center
    position relative
    top -1px
    .icon-button
      user-select none
      width 20px
      height @width
      &:first-child
        margin-left 6px
      &:not(:last-child)
        margin-right 6px
    .icon-button >>> .vue-ui-icon,
    .small-icon
      width 16px
      height @width
    .watch-field.active >>> svg
      fill $active-color
    .watch-field.deep.active >>> svg
      fill $purple
    .warning >>> svg
      fill $orange
  &:hover,
  &.force-toolbar,
  &.watched
    .actions
      visibility visible
  .colon
    margin-right .5em
    position relative

  .type
    color $background-color
    padding 3px 6px
    font-size 10px
    line-height 10px
    height 16px
    border-radius 3px
    margin 2px 6px
    position relative
    background-color #eee
    &.prop
      background-color #96afdd
    &.computed
      background-color #af90d5
    &.vuex-getter
      background-color #5dd5d5
    &.firebase-binding
      background-color #ffcc00
    &.observable
      background-color #ff9999
    .vue-ui-dark-mode &
      color: #242424

  .edit-overlay
    display inline-flex
    align-items center

.key
  color #881391
  .vue-ui-dark-mode &
    color: $lightPink
  &.abstract
    color $blueishGrey
    .vue-ui-dark-mode &
      color lighten($blueishGrey, 20%)

.key >>> .data-search-keyword,
.value >>> .data-search-keyword
  background rgba(255, 193, 7, .34)
  border-radius 2px
  box-shadow 0 0 0 1px rgba(255, 193, 7, .18)
  color inherit
  font-weight 700
  padding 0 1px
  .vue-ui-dark-mode &
    background rgba(255, 213, 79, .28)
    box-shadow 0 0 0 1px rgba(255, 213, 79, .18)

// !important: global.styl's `#app *` user-select rule outweighs scoped classes
.key,
.value
  user-select text !important
  -webkit-user-select text !important
  cursor text

.value
  display inline-block
  color #444
  &.string, &.native
    color $red
  &.string
    >>> span
      color $black
      .vue-ui-dark-mode &
        color $red
  &.null
    color #999
  &.literal
    color $vividBlue
  &.raw-boolean
    width 36px
  &.native.Error
    background $red
    color $white !important
    padding 0 4px
    border-radius $br
    &::before
      content 'Error: '
      opacity .75
  &.custom
    &.type-component
      color $green
      &::before,
      &::after
        color $darkGrey
      &::before
        content '<'
      &::after
        content '>'
    &.type-function
      font-style italic
      >>> span
        color $vividBlue
        font-family dejavu sans mono, monospace
        .platform-mac &
          font-family Menlo, monospace
        .platform-windows &
          font-family Consolas, Lucida Console, Courier New, monospace
        .vue-ui-dark-mode &
          color $purple
    &.type-component-definition
      color $green
      >>> span
        color $darkerGrey
    &.type-reference
        opacity 0.5
      >>> .attr-title
        color #800080
        .vue-ui-dark-mode &
          color #e36eec

  .vue-ui-dark-mode &
    color #bdc6cf
    &.string, &.native
      color #e33e3a
    &.null
      color #999
    &.literal
      color $purple

.meta
  font-size 12px
  font-family Menlo, Consolas, monospace
  min-width 150px
  .key
    display inline-block
    width 80px
    color lighten(#881391, 60%)
    .vue-ui-dark-mode &
      color #881391
  .value
    color white
    .vue-ui-dark-mode &
      color black
.meta-field
  &:not(:last-child)
    margin-bottom 4px

.edit-input
  font-family Menlo, Consolas, monospace
  border solid 1px $green
  border-radius 3px
  padding 2px
  outline none
  &.error
    border-color $orange
.value-input
  width 180px
.key-input
  width 90px
  color #881391

.context-menu-dropdown
  .vue-ui-button
    display block
    width 100%

.more
  width 20px
  height @width
  >>> .vue-ui-icon
    width 16px
    height @width
</style>
