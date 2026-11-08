/**
 * Model Source Picker — client half.
 *
 * Takes over the composer model seat (`conversation.input.model`) and rebuilds
 * the picker as a two-level flow:
 *
 *   level 1  the model SOURCE (account / provider) — enlarged, the first thing
 *            you look at, with its model count and the current model as meta;
 *   level 2  the concrete models of the source you picked.
 *
 * It reads the same catalog the shipped picker reads (`modelDirectories`
 * service, i.e. the shared ModelDirectory), so `/model`, the settings page and
 * this popover never disagree about what is selectable.
 *
 * Priority -20 wins the single-occupant seat over the shipped picker (0) and
 * over dsh-codex-subscription's picker (-10); lower wins. A thrown render
 * abdicates and falls back to the winner behind it, so a regression here can
 * never leave the composer without a model control.
 */

window.__ModuleLoader__.load({
  id: 'dsh-model-source-picker',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    let ReactDOM
    try {
      ReactDOM = require('react-dom')
    } catch (cause) {
      console.error('[model-source-picker] react-dom is unavailable, the menu renders inline', cause)
      ReactDOM = undefined
    }

    const NS = 'model-source-picker'

    const zh = {
      placeholder: '选择模型',
      source: '模型来源',
      back: '模型来源',
      modelsCount: '{count} 个模型',
      current: '当前',
      loading: '正在读取模型目录…',
      empty: '没有可用的模型来源',
      emptyModels: '这个来源暂时没有模型',
      search: '搜索模型',
      noMatch: '没有匹配的模型',
      reasoning: '推理强度',
      reasoningDefault: '默认',
      effortLevels: '{count} 档推理',
      selectFailed: '切换模型失败',
      loadFailed: '模型目录读取失败',
      sessionInUse: '会话正在运行，等这一轮结束后再切换模型',
      free: '免费',
      account: 'DeepSeek 账号',
    }

    const en = {
      placeholder: 'Select model',
      source: 'Model source',
      back: 'Sources',
      modelsCount: '{count} models',
      current: 'current',
      loading: 'Loading model directory…',
      empty: 'No model source available',
      emptyModels: 'No models in this source yet',
      search: 'Search models',
      noMatch: 'No matching model',
      reasoning: 'Reasoning effort',
      reasoningDefault: 'Default',
      effortLevels: '{count} effort levels',
      selectFailed: 'Could not switch model',
      loadFailed: 'Could not load the model directory',
      sessionInUse: 'The session is busy; switch models after this turn finishes',
      free: 'free',
      account: 'DeepSeek account',
    }

    /**
     * Minimal translator so a failed locale registration still yields text.
     * @param {Record<string, string>} bundle
     */
    function localTranslator (bundle) {
      return (key, vars) => {
        const template = typeof bundle[key] === 'string' ? bundle[key] : key
        if (vars === undefined) return template
        return template.replace(/\{(\w+)\}/g, (match, name) =>
          Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match)
      }
    }

    const CSS = `
/* Own the box model inside our own subtrees: a width:100% row with padding must
   not grow past the panel edge. */
.msp-root, .msp-root *, .msp-menu, .msp-menu * {
  box-sizing: border-box;
}
.msp-root {
  position: relative;
  display: inline-flex;
  min-width: 0;
}
.msp-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 360px;
  height: 28px;
  margin: 0;
  padding: 0 4px 0 5px;
  border: 0;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary, #5c6370);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.msp-trigger:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.msp-trigger:disabled {
  cursor: default;
  opacity: 0.55;
}
.msp-trigger:focus-visible,
.msp-row:focus-visible,
.msp-source:focus-visible,
.msp-back:focus-visible {
  outline: 2px solid var(--dsw-focus-ring-color, var(--dsw-alias-state-business-primary, #3b82f6));
  outline-offset: 1px;
}
/* The model source is the loudest part of the trigger, by design. */
.msp-src {
  flex: none;
  max-width: 150px;
  overflow: hidden;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--dsw-alias-bg-layer-2, #f0f1f3);
  color: var(--dsw-alias-label-primary, #1c1f24);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msp-model {
  min-width: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-caption, #7b8290);
  font-size: 12.5px;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msp-model--solo {
  color: var(--dsw-alias-label-secondary, #5c6370);
  font-size: 13px;
}
.msp-effort {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #9aa1ad);
  font-size: 11.5px;
  line-height: 16px;
}
.msp-trigger-chev {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #9aa1ad);
}
.msp-dot {
  flex: none;
  width: 6px;
  height: 6px;
  margin: 0 3px;
  border-radius: 50%;
  background: var(--dsw-alias-label-secondary, #5c6370);
  animation: msp-pulse 900ms ease-in-out infinite;
}
@keyframes msp-pulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 1; }
}

/* The panel. Fixed + body portal: the docked composer clips overlays.
   Surface recipe copied from the shipped picker menu: the raised surface is a
   theme layer, the hairline comes from the elevation stroke, no extra border. */
.msp-menu {
  position: fixed;
  z-index: 1100;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  /* Nothing may paint outside the card: a clamped list must scroll, not spill. */
  overflow: hidden;
  max-height: min(460px, calc(100vh - 24px));
  padding: 5px;
  border: 0;
  border-radius: var(--dsw-radius-lg, 16px);
  background: var(--dsw-alias-bg-layer-1, #ffffff);
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2, rgba(127, 127, 127, 0.35));
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2, rgba(127, 127, 127, 0.55));
  box-shadow: var(--dsw-elevation-prominent, 0 12px 32px rgba(0, 0, 0, 0.16));
  color: var(--dsw-alias-label-primary, #1c1f24);
  font-size: 13px;
  line-height: 18px;
}
.msp-head {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
  padding: 0 2px 5px;
}
.msp-title {
  padding: 0 4px;
  color: var(--dsw-alias-label-caption, #7b8290);
  font-size: 12px;
  font-weight: 500;
  line-height: 16px;
}
.msp-head-name {
  min-width: 0;
  overflow: hidden;
  padding: 0 2px;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msp-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  margin: 0;
  padding: 2px 6px 2px 4px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, #5c6370);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.msp-back:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.msp-list {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.msp-source {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 7px 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.msp-source:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.msp-tile {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
  border-radius: 9px;
  background: var(--dsw-alias-bg-layer-2, #f0f1f3);
  color: var(--dsw-alias-label-secondary, #5c6370);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.msp-source[data-active='true'] .msp-tile {
  border-color: transparent;
  background: var(--dsw-alias-label-primary, #1c1f24);
  color: var(--dsw-alias-bg-layer-1, #ffffff);
}
.msp-source-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}
/* Enlarged source name: level 1 is the provider, not the model. */
.msp-source-name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 600;
  line-height: 19px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msp-source-meta {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #9aa1ad);
  font-size: 11.5px;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msp-chev {
  flex: none;
  color: var(--dsw-alias-label-tertiary, #9aa1ad);
}
.msp-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.msp-row:hover {
  background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.05));
}
.msp-row:disabled {
  cursor: default;
  opacity: 0.6;
}
.msp-row[aria-checked='true'] .msp-row-name {
  font-weight: 600;
}
.msp-row-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 auto;
}
.msp-row-name {
  overflow: hidden;
  font-size: 13px;
  line-height: 18px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msp-row-meta {
  overflow: hidden;
  color: var(--dsw-alias-label-tertiary, #9aa1ad);
  font-size: 11px;
  line-height: 15px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msp-check {
  flex: none;
  color: var(--dsw-alias-label-primary, #1c1f24);
}
.msp-search {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 2px 4px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2, #f0f1f3);
  color: var(--dsw-alias-label-tertiary, #9aa1ad);
}
.msp-search input {
  flex: 1 1 auto;
  min-width: 0;
  border: 0;
  padding: 1px 0;
  background: transparent;
  color: var(--dsw-alias-label-primary, #1c1f24);
  font: inherit;
  font-size: 12.5px;
  outline: none;
}
.msp-sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--dsw-alias-border-l1, rgba(0, 0, 0, 0.08));
}
.msp-empty,
.msp-loading,
.msp-error {
  padding: 8px 10px;
  font-size: 12.5px;
  line-height: 17px;
}
.msp-empty,
.msp-loading {
  color: var(--dsw-alias-label-tertiary, #9aa1ad);
}
.msp-error {
  flex: none;
  max-height: 92px;
  overflow: auto;
  margin-bottom: 3px;
  padding: 6px 7px;
  border-radius: var(--dsw-radius-md, 12px);
  background: var(--dsw-alias-interactive-bg-hover-danger, rgba(236, 19, 19, 0.05));
  color: var(--dsw-alias-state-error-primary, #d14343);
  font-size: 11px;
  line-height: 16px;
}
`

    const CSS_TAG = NS + '/picker.css'

    function ensureStyles () {
      if (typeof document === 'undefined') return () => {}
      const existing = document.querySelector('style[data-plugin-css="' + CSS_TAG + '"]')
      if (existing !== null) return () => {}
      const tag = document.createElement('style')
      tag.dataset.plugin = 'dsh-model-source-picker'
      tag.dataset.pluginCss = CSS_TAG
      tag.textContent = CSS
      document.head.appendChild(tag)
      return () => { tag.remove() }
    }

    /* ---------------------------------------------------------------- icons */

    function chevron (className, size, direction) {
      return h('svg', {
        className,
        width: size,
        height: size,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      }, h('path', {
        d: direction === 'down' ? 'M4 6.5 8 10.5 12 6.5' : 'M6.5 4 10.5 8 6.5 12',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function checkIcon () {
      return h('svg', {
        className: 'msp-check',
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      }, h('path', {
        d: 'M3.5 8.4 6.5 11.4 12.5 4.6',
        stroke: 'currentColor',
        strokeWidth: 1.9,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      }))
    }

    function searchIcon () {
      return h('svg', {
        width: 13,
        height: 13,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': 'true',
      }, h('circle', { cx: 7, cy: 7, r: 4.2, stroke: 'currentColor', strokeWidth: 1.4 }),
      h('path', { d: 'M10.2 10.2 13.5 13.5', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' }))
    }

    /* -------------------------------------------------------------- helpers */

    function modelsOf (group) {
      return group !== null && group !== undefined && Array.isArray(group.models) ? group.models : []
    }

    function modelNameOf (model) {
      return typeof model.name === 'string' && model.name !== '' ? model.name : String(model.id)
    }

    function providerLabel (group, t) {
      if (group === null || group === undefined) return ''
      if (group.id === 'deepseek-account') return t('account')
      const name = typeof group.name === 'string' ? group.name.trim() : ''
      return name !== '' ? name : String(group.id)
    }

    /** Two-glyph tile label: ASCII words keep their initials, CJK keeps 1-2 glyphs. */
    function initials (group, label) {
      if (group !== null && group !== undefined && group.id === 'deepseek-account') return 'DS'
      const text = String(label === null || label === undefined ? '' : label).trim()
      if (text === '') return '?'
      if (/^[\x20-\x7f]+$/.test(text)) {
        const words = text.split(/[\s/._-]+/).filter(Boolean)
        if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
        const inner = text.slice(1).match(/[A-Z]/)
        return (text[0] + (inner === null ? text.charAt(1) : inner[0])).toUpperCase()
      }
      const chars = Array.from(text)
      return chars.length >= 2 ? chars[0] + chars[1] : chars[0]
    }

    function effortLabelOf (model, effortId, t) {
      if (effortId === null || effortId === undefined) return t('reasoningDefault')
      const efforts = Array.isArray(model?.reasoning?.efforts) ? model.reasoning.efforts : []
      const match = efforts.find((entry) => entry.id === effortId)
      return match !== undefined && typeof match.name === 'string' && match.name !== '' ? match.name : String(effortId)
    }

    function selectionFor (provider, model, effort) {
      const choice = { provider, model }
      if (typeof effort === 'string' && effort !== '') { choice.reasoningEffort = effort; return choice }
      const fallback = model?.reasoning?.defaultEffort
      if (typeof fallback === 'string' && fallback !== '') choice.reasoningEffort = fallback
      return choice
    }

    /**
     * Turn a Remote/ModelDirectory failure into one readable line.
     * The store returns `{ ok: false, error: { code, message } }`.
     */
    function failureText (error, t) {
      if (error === null || error === undefined) return t('selectFailed')
      const code = typeof error.code === 'string' ? error.code : ''
      if (code === 'session/writer-held') return t('sessionInUse')
      const message = typeof error.message === 'string' ? error.message : ''
      if (message !== '') return message
      if (code !== '') return code
      return typeof error === 'string' ? error : t('selectFailed')
    }

    function portal (node) {
      if (ReactDOM !== undefined && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined' && document.body !== null) {
        return ReactDOM.createPortal(node, document.body)
      }
      return node
    }

    /* ------------------------------------------------------------ component */

    function SourcePicker (props) {
      const { locked, available, directory, load, select, t } = props

      const state = React.useSyncExternalStore(
        (onChange) => directory.subscribe(onChange),
        () => directory.getSnapshot(),
      )

      const [open, setOpen] = React.useState(false)
      const [pane, setPane] = React.useState('source')
      const [query, setQuery] = React.useState('')
      const [position, setPosition] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)

      const rootRef = React.useRef(null)
      const menuRef = React.useRef(null)
      const triggerRef = React.useRef(null)
      const requestedRef = React.useRef(false)

      const groups = Array.isArray(state?.groups) ? state.groups : []
      const failures = Array.isArray(state?.failures) ? state.failures : []
      const status = state?.status
      const current = state?.current ?? null

      const sources = React.useMemo(() => {
        const rank = (group) => (group.id === 'deepseek-account' ? 0 : group.id === 'deepseek-official' ? 1 : 2)
        return groups.slice().sort((left, right) => rank(left) - rank(right))
      }, [groups])

      const currentSource = current === null ? null : (sources.find((group) => group.id === current.provider) ?? null)
      const currentModels = modelsOf(currentSource)
      const currentModel = current === null || currentSource === null
        ? null
        : (currentModels.find((model) => model.id === current.model) ?? null)
      const currentEfforts = Array.isArray(currentModel?.reasoning?.efforts) ? currentModel.reasoning.efforts : []
      const effectiveEffort = current?.reasoningEffort ?? currentModel?.reasoning?.defaultEffort ?? null

      const sourceName = currentSource === null ? null : providerLabel(currentSource, t)
      const modelName = current === null
        ? null
        : (currentModel === null ? String(current.model) : modelNameOf(currentModel))
      /* The store keeps the resolved effort name, which covers models whose
       * metadata is not in the fetched catalog. */
      const retained = typeof state?.retainedEffort === 'string' && state.retainedEffort !== '' ? state.retainedEffort : null
      const effortName = effectiveEffort === null ? retained : effortLabelOf(currentModel, effectiveEffort, t)

      /* Load the catalog once; the shared store keeps `/model` in sync. */
      React.useEffect(() => {
        if (available !== true || requestedRef.current) return
        requestedRef.current = true
        Promise.resolve(load()).catch((cause) => {
          console.error('[model-source-picker] loading the model directory failed', cause)
        })
      }, [available, load])

      /* Keep the fixed panel glued to the trigger and fully inside the viewport.
       * The first pass runs before the panel is in the DOM (natural height is
       * unknown), the frame pass re-glues it once the real, clamped height is
       * known — otherwise a long model list pushes the panel off screen and the
       * tail of it spills past the window edge. */
      const measure = React.useCallback(() => {
        const anchor = triggerRef.current
        if (anchor === null) return
        const rect = anchor.getBoundingClientRect()
        const margin = 10
        const gap = 8
        const host = menuRef.current
        const viewportWidth = window.innerWidth
        const viewportHeight = window.innerHeight
        const width = Math.min(352, Math.max(272, viewportWidth - margin * 2))
        const spaceAbove = rect.top - gap - margin
        const spaceBelow = viewportHeight - rect.bottom - gap - margin
        /* A composer sits at the bottom of the window: above is the normal side. */
        const above = spaceAbove >= spaceBelow
        const room = above ? spaceAbove : spaceBelow
        const cap = Math.max(180, Math.min(room, 460))
        const natural = host === null ? 0 : host.offsetHeight
        const height = natural === 0 ? cap : Math.min(natural, cap)
        const top = above
          ? Math.max(margin, rect.top - gap - height)
          : Math.min(viewportHeight - margin - height, rect.bottom + gap)
        const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - margin - width))
        setPosition({ left, top, width, maxHeight: cap })
      }, [])

      React.useLayoutEffect(() => {
        if (!open) return undefined
        measure()
        const frame = window.requestAnimationFrame(() => measure())
        return () => window.cancelAnimationFrame(frame)
      }, [open, pane, measure])

      React.useEffect(() => {
        if (!open) return undefined
        const onMove = () => measure()
        window.addEventListener('resize', onMove)
        window.addEventListener('scroll', onMove, true)
        return () => {
          window.removeEventListener('resize', onMove)
          window.removeEventListener('scroll', onMove, true)
        }
      }, [open, measure])

      React.useEffect(() => {
        if (!open) return undefined
        const onPointerDown = (event) => {
          const target = event.target
          if (rootRef.current?.contains(target) === true) return
          if (menuRef.current?.contains(target) === true) return
          /* Reset the drill-down without stealing focus back from whatever the
           * user just clicked: reopening must always start at the source level. */
          setOpen(false)
          setPane('source')
          setQuery('')
          setError(null)
        }
        document.addEventListener('mousedown', onPointerDown, true)
        return () => document.removeEventListener('mousedown', onPointerDown, true)
      }, [open])

      /* Focus the search box / first row whenever the pane opens or changes. */
      React.useLayoutEffect(() => {
        if (!open) return
        const menu = menuRef.current
        if (menu === null) return
        const target = menu.querySelector('[data-msp-focus], [data-msp-row]')
        if (target instanceof HTMLElement) target.focus({ preventScroll: true })
      }, [open, pane])

      const close = React.useCallback(() => {
        setOpen(false)
        setPane('source')
        setQuery('')
        setError(null)
        window.requestAnimationFrame(() => {
          triggerRef.current?.focus({ preventScroll: true })
        })
      }, [])

      const openSource = React.useCallback((group) => {
        setPane('model:' + group.id)
        setQuery('')
        setError(null)
      }, [])

      const backToSources = React.useCallback(() => {
        setPane('source')
        setQuery('')
        setError(null)
      }, [])

      const choose = React.useCallback((choice) => {
        if (busy === true) return
        setBusy(true)
        setError(null)
        Promise.resolve()
          .then(() => select(choice))
          .then((outcome) => {
            setBusy(false)
            if (outcome === false) {
              setError(t('selectFailed'))
              return
            }
            if (outcome !== null && outcome !== undefined && outcome.ok === false) {
              setError(failureText(outcome.error, t))
              return
            }
            close()
          })
          .catch((cause) => {
            setBusy(false)
            setError(typeof cause?.message === 'string' && cause.message !== '' ? cause.message : t('selectFailed'))
          })
      }, [busy, close, select, t])

      const onMenuKeyDown = React.useCallback((event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (pane !== 'source') backToSources()
          else close()
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
        const menu = menuRef.current
        if (menu === null) return
        const items = Array.from(menu.querySelectorAll('[data-msp-row]:not([disabled])'))
        if (items.length === 0) return
        event.preventDefault()
        const active = items.findIndex((item) => item === document.activeElement)
        let next
        if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = items.length - 1
        else if (event.key === 'ArrowDown') next = active < 0 ? 0 : Math.min(items.length - 1, active + 1)
        else next = active <= 0 ? 0 : active - 1
        items[next].focus({ preventScroll: false })
      }, [backToSources, close, pane])

      if (available !== true || directory === undefined) return null

      const busyNow = busy || status === 'selecting'
      const paneGroup = pane.startsWith('model:') ? (sources.find((group) => group.id === pane.slice(6)) ?? null) : null
      const showEffort = currentEfforts.length > 0 && currentSource !== null && currentModel !== null

      /* ------------------------------------------------------ pane: source */

      const sourceNodes = []

      sourceNodes.push(h('div', { className: 'msp-head', key: 'head' },
        h('span', { className: 'msp-title' }, t('source'))))

      for (const failure of failures) {
        const label = typeof failure?.name === 'string' && failure.name !== '' ? failure.name : String(failure?.id ?? '')
        const message = typeof failure?.message === 'string' && failure.message !== '' ? failure.message : t('loadFailed')
        sourceNodes.push(h('div', {
          className: 'msp-error',
          key: 'failure:' + String(failure?.id ?? label),
          title: label + ': ' + message,
        }, label + ' · ' + message))
      }

      if (sources.length === 0) {
        const emptyText = status === 'ready' ? t('empty') : (status === 'error' ? t('loadFailed') : t('loading'))
        sourceNodes.push(h('div', {
          className: status === 'idle' || status === 'loading' || status === undefined ? 'msp-loading' : 'msp-empty',
          key: 'empty',
        }, emptyText))
      }

      for (const group of sources) {
        const label = providerLabel(group, t)
        const models = modelsOf(group)
        const active = current !== null && current.provider === group.id
        const meta = [
          models.length === 1 ? t('modelsCount', { count: 1 }) : t('modelsCount', { count: models.length }),
        ]
        if (active) meta.push(t('current') + ' ' + (modelName ?? ''))
        sourceNodes.push(h('button', {
          type: 'button',
          key: 'source:' + group.id,
          className: 'msp-source',
          role: 'menuitem',
          'data-msp-row': '1',
          'data-active': active ? 'true' : 'false',
          title: label,
          onClick: () => openSource(group),
        },
        h('span', { className: 'msp-tile', 'aria-hidden': 'true' }, initials(group, label)),
        h('span', { className: 'msp-source-copy' },
          h('span', { className: 'msp-source-name' }, label),
          h('span', { className: 'msp-source-meta' }, meta.join(' · '))),
        chevron('msp-chev', 14)))
      }

      if (showEffort) {
        sourceNodes.push(h('div', { className: 'msp-sep', key: 'sep' }))
        sourceNodes.push(h('button', {
          type: 'button',
          key: 'effort-slot',
          className: 'msp-row',
          role: 'menuitem',
          'data-msp-row': '1',
          onClick: () => { setPane('effort'); setError(null) },
        },
        h('span', { className: 'msp-row-copy' },
          h('span', { className: 'msp-row-name' }, t('reasoning')),
          h('span', { className: 'msp-row-meta' }, effortName ?? t('reasoningDefault'))),
        chevron('msp-chev', 14)))
      }

      /* ------------------------------------------------------- pane: models */

      const modelNodes = []

      if (paneGroup !== null) {
        const label = providerLabel(paneGroup, t)
        const models = modelsOf(paneGroup)
        const needle = query.trim().toLowerCase()
        const visible = needle === ''
          ? models
          : models.filter((model) => {
            const haystack = [modelNameOf(model), String(model.id), typeof model.description === 'string' ? model.description : '']
              .join(' ').toLowerCase()
            return haystack.includes(needle)
          })

        modelNodes.push(h('div', { className: 'msp-head', key: 'head' },
          h('button', {
            type: 'button',
            className: 'msp-back',
            onClick: backToSources,
            title: t('back'),
          }, chevron('msp-chev', 12, 'left'), h('span', null, t('back'))),
          h('span', { className: 'msp-head-name', title: label }, label)))

        if (models.length > 6) {
          modelNodes.push(h('label', { className: 'msp-search', key: 'search' },
            searchIcon(),
            h('input', {
              type: 'search',
              value: query,
              placeholder: t('search'),
              'aria-label': t('search'),
              'data-msp-focus': '1',
              onChange: (event) => setQuery(event.target.value),
              onKeyDown: (event) => {
                if (event.key !== 'Escape') return
                event.stopPropagation()
                if (query !== '') setQuery('')
                else backToSources()
              },
            })))
        }

        if (models.length === 0) {
          modelNodes.push(h('div', { className: 'msp-empty', key: 'empty' }, t('emptyModels')))
        } else if (visible.length === 0) {
          modelNodes.push(h('div', { className: 'msp-empty', key: 'nomatch' }, t('noMatch')))
        }

        for (const model of visible) {
          const selected = current !== null && current.provider === paneGroup.id && current.model === model.id
          const efforts = Array.isArray(model?.reasoning?.efforts) ? model.reasoning.efforts : []
          const pieces = []
          if (selected === true) pieces.push(t('current'))
          if (efforts.length > 0) pieces.push(t('effortLevels', { count: efforts.length }))
          if (typeof model.description === 'string' && model.description !== '' && pieces.length === 0) pieces.push(model.description)
          modelNodes.push(h('button', {
            type: 'button',
            key: 'model:' + model.id,
            className: 'msp-row',
            role: 'menuitemradio',
            'aria-checked': selected ? 'true' : 'false',
            'data-msp-row': '1',
            disabled: busyNow,
            title: typeof model.description === 'string' && model.description !== '' ? model.description : modelNameOf(model),
            onClick: () => choose(selectionFor(paneGroup.id, model.id, typeof model?.reasoning?.defaultEffort === 'string' ? model.reasoning.defaultEffort : undefined)),
          },
          h('span', { className: 'msp-row-copy' },
            h('span', { className: 'msp-row-name' }, modelNameOf(model)),
            pieces.length === 0 ? null : h('span', { className: 'msp-row-meta' }, pieces.join(' · '))),
          selected === true ? checkIcon() : null))
        }
      }

      /* ------------------------------------------------------- pane: effort */

      const effortNodes = []

      if (pane === 'effort' && currentSource !== null && currentModel !== null) {
        const label = providerLabel(currentSource, t) + ' · ' + modelNameOf(currentModel)
        effortNodes.push(h('div', { className: 'msp-head', key: 'head' },
          h('button', { type: 'button', className: 'msp-back', onClick: backToSources, title: t('back') },
            chevron('msp-chev', 12, 'left'), h('span', null, t('back'))),
          h('span', { className: 'msp-head-name', title: label }, t('reasoning'))))

        for (const effort of currentEfforts) {
          const selected = effectiveEffort === effort.id
          effortNodes.push(h('button', {
            type: 'button',
            key: 'effort:' + effort.id,
            className: 'msp-row',
            role: 'menuitemradio',
            'aria-checked': selected ? 'true' : 'false',
            'data-msp-row': '1',
            disabled: busyNow,
            title: typeof effort.description === 'string' ? effort.description : String(effort.name ?? effort.id),
            onClick: () => choose(selectionFor(currentSource.id, currentModel.id, effort.id)),
          },
          h('span', { className: 'msp-row-copy' },
            h('span', { className: 'msp-row-name' }, typeof effort.name === 'string' && effort.name !== '' ? effort.name : String(effort.id)),
            typeof effort.description === 'string' && effort.description !== ''
              ? h('span', { className: 'msp-row-meta' }, effort.description)
              : null),
          selected === true ? checkIcon() : null))
        }
      }

      /* Only the rows scroll: the pane header and the search box stay pinned, and
       * every row keeps its natural height instead of being squeezed by the
       * panel's max-height (a squeezed row paints its nowrap text outside the
       * row, which reads as "the text spills out of the menu"). */
      const paneNodes = pane === 'source'
        ? sourceNodes
        : (pane === 'effort' ? effortNodes : modelNodes)
      const pinned = []
      const rows = []
      for (const node of paneNodes) {
        const className = node?.props?.className
        if (className === 'msp-head' || className === 'msp-search') pinned.push(node)
        else rows.push(node)
      }
      const body = [...pinned, h('div', { className: 'msp-list', key: 'msp-list' }, rows)]

      const menu = open
        ? h('div', {
          ref: menuRef,
          className: 'msp-menu',
          role: 'menu',
          'aria-label': t('source'),
          style: position === null
            ? { left: '0px', top: '0px', width: '352px', visibility: 'hidden' }
            : { left: position.left + 'px', top: position.top + 'px', width: position.width + 'px', maxHeight: position.maxHeight + 'px' },
          onKeyDown: onMenuKeyDown,
        },
        body,
        error === null ? null : h('div', { className: 'msp-error', key: 'error', role: 'alert' }, error))
        : null

      return h('div', { className: 'msp-root', ref: rootRef },
        h('button', {
          ref: triggerRef,
          type: 'button',
          className: 'msp-trigger',
          disabled: locked === true,
          'aria-haspopup': 'menu',
          'aria-expanded': open ? 'true' : 'false',
          title: sourceName === null ? t('placeholder') : sourceName + ' · ' + (modelName ?? ''),
          onClick: () => {
            if (open) close()
            else setOpen(true)
          },
        },
        sourceName === null ? null : h('span', { className: 'msp-src', key: 'src', title: sourceName }, sourceName),
        h('span', {
          className: modelName === null ? 'msp-model msp-model--solo' : 'msp-model',
          key: 'model',
        }, modelName ?? t('placeholder')),
        effortName === null ? null : h('span', { className: 'msp-effort', key: 'effort' }, effortName),
        busyNow ? h('span', { className: 'msp-dot', key: 'busy', 'aria-hidden': 'true' }) : chevron('msp-trigger-chev', 12, 'down')),
        menu === null ? null : portal(menu))
    }

    /* ---------------------------------------------------------------- apply */

    /* The dynamic client half receives a restricted context: read services
     * through ctx.get and treat every one of them as optional. */
    function service (ctx, name) {
      try {
        const value = typeof ctx?.get === 'function' ? ctx.get(name) : ctx?.[name]
        return value === undefined ? undefined : value
      } catch (cause) {
        return undefined
      }
    }

    function apply (ctx) {
      try {
        ensureStyles()
      } catch (cause) {
        console.error('[model-source-picker] stylesheet insertion failed', cause)
      }

      let t = localTranslator(zh)
      try {
        const locale = service(ctx, 'locale')
        if (locale !== undefined && typeof locale.register === 'function') {
          locale.register(NS, { zh, en })
          const bound = typeof locale.bind === 'function' ? locale.bind(NS) : undefined
          if (typeof bound === 'function') t = bound
        }
      } catch (cause) {
        console.error('[model-source-picker] locale registration failed, using bundled strings', cause)
      }

      /* The seat only renders when model selection is meaningful for the
       * session, so the store is never touched for an addressed subagent. */
      const Seat = (props) => {
        if (props.available !== true || props.directory === undefined) return null
        return h(SourcePicker, { ...props, t })
      }

      /* A null overlay occupant is the cheapest possible "this bundle ran"
       * marker: it costs nothing on screen and shows up in slot inspection. */
      let probed = false
      const probe = (slots) => {
        if (probed || slots === undefined || typeof slots.register !== 'function') return
        probed = true
        try {
          slots.register({
            name: 'shell.overlay',
            id: 'model-source-picker-probe',
            order: 9000,
            inject: () => ({}),
          }, () => null)
        } catch (cause) {
          console.error('[model-source-picker] probe registration failed', cause)
        }
      }

      let claimed = false
      /* Never claim the seat without a usable directory service: claiming and
       * then rendering nothing leaves the composer with no model control at
       * all, because a lower priority already shadows the shipped picker.
       * Services are resolved on every call so a late provider still counts. */
      const claim = (slots, scope) => {
        if (claimed || slots === undefined || typeof slots.register !== 'function') return
        if (service(scope, 'modelDirectories') === undefined) return
        claimed = true
        const registration = {
          name: 'conversation.input.model',
          /* Lower priority wins the single-occupant seat: -20 beats the
           * shipped picker (0) and dsh-codex-subscription's (-10). */
          priority: -20,
          locale: NS,
          inject: (sessionId) => {
            const models = service(scope, 'modelDirectories')
            const sessions = service(scope, 'sessions')
            let directory
            try {
              directory = models === undefined || typeof models.directoryFor !== 'function'
                ? undefined
                : models.directoryFor(sessionId)
            } catch (cause) {
              console.error('[model-source-picker] no directory for this session', cause)
              directory = undefined
            }
            if (directory === undefined) return { available: false, directory: undefined, load: () => {}, select: () => Promise.resolve(undefined) }
            const available = sessions === undefined || sessions.subagentAddress(sessionId) === undefined
            return {
              available,
              directory: directory.store,
              load: () => {
                if (available) Promise.resolve(directory.load()).catch(() => {})
              },
              select: (selection) => (available ? Promise.resolve(directory.select(selection)) : Promise.resolve(undefined)),
            }
          },
        }
        const install = () => slots.register(registration, Seat)
        try {
          if (typeof slots.inject === 'function') slots.inject('conversation.input.model', install)
          else install()
        } catch (cause) {
          claimed = false
          console.error('[model-source-picker] failed to claim the composer model seat', cause)
        }
      }

      const mount = (scope) => {
        const slots = service(scope, 'slots')
        probe(slots)
        if (slots === undefined) return
        if (service(scope, 'modelDirectories') !== undefined) {
          claim(slots, scope)
          return
        }
        /* modelDirectories is provided by the shipped picker's client half,
         * which may mount after this bundle: wait for it instead of failing. */
        if (typeof scope.inject === 'function') {
          try {
            scope.inject(['modelDirectories'], (inner) => {
              claim(service(inner, 'slots') ?? slots, inner)
            })
          } catch (cause) {
            console.error('[model-source-picker] could not wait for the model directory service', cause)
          }
        }
      }

      if (service(ctx, 'slots') !== undefined) {
        mount(ctx)
        return
      }
      if (typeof ctx.inject === 'function') {
        try {
          ctx.inject(['slots'], (scope) => mount(scope))
        } catch (cause) {
          console.error('[model-source-picker] slots service unavailable on the client scope', cause)
        }
      } else {
        console.error('[model-source-picker] slots service unavailable on the client scope')
      }
    }

    return { apply }
  },
})
