# model-source-picker

> English version. The original Chinese version is [README.md](README.md).

A provider-first model picker for DeepSeek Harness. It turns the model selector on the composer into a two-level structure of **"pick the source first, then the model"**: the **model source** is enlarged at the top level, and the concrete models live one level down.

## Install

```bash
dsh plugin --profile desktop add github:BEAVER-awa/dsh-model-source-picker
```

If nothing changes after installing, toggle the bundle off and on again in the plugin manager (or restart the app) — that is more reliable than refreshing the page repeatedly; see "Diagnosis" below for why.

Requirements: DeepSeek Harness >= 0.2.1 (it uses the `modelDirectories` service), Node >= 22. The plugin only occupies a client-side UI seat; it does not touch the agent loop, tools or prompts.

## What changed

|  | Stock picker | This plugin |
|---|---|---|
| Composer trigger | icon + model name | **source** (e.g. `TokenPlan`) + model name + reasoning effort |
| Menu level 1 | every model of every source, flattened | **source list** (enlarged names, initial badges, model counts, current-source marker) |
| Menu level 2 | none | models of that source (searchable, current one checked, descriptions and reasoning-effort counts shown) |
| Reasoning effort | flattened into the menu | its own row on level 1, or a third level for models with effort tiers |

## Interaction

- Click a source -> its model list; `‹ Model sources` in the top left or `Esc` goes back one level
- A search box appears when a source has more than 6 models; just start typing to filter
- Selection takes effect immediately; nothing outside the session is closed
- Switching is still possible while a session is running (same as the stock picker)
- Sub-agent sessions do not show this control (same as the stock picker)

## Implementation

- It reuses the official plugin's model catalog entirely: it takes the `conversation.input.model` seat at `priority: -20` and gets the same store used by the `/model` command through `ctx.get('modelDirectories').directoryFor(sessionId)` (`load()` / `select()`). It issues no requests and builds no catalog of its own. Priority -20 overrides both the stock picker (0) and the replacement shipped by `dsh-codex-subscription` (-10).
- The dynamic client half receives a restricted ctx (only `get` / `on` / `provide` / `effect`), so every service is read with `ctx.get()` and null-checked individually instead of gating on a top-level `inject` — silently failing to mount because one service is missing is the hardest failure mode to debug.
- Styles use theme tokens only (`--dsw-alias-*`, `--dsw-font-*`), so light/dark mode is automatic; the menu is portaled to `document.body` to avoid being clipped by the docked composer.
- Text goes through locale (namespace `model-source-picker`, Chinese and English); if locale registration fails it falls back to built-in strings.
- If registration fails it logs `[model-source-picker] ...` and abdicates the seat, so the composer falls back to the stock picker instead of breaking the UI.

## Files

- `lib/client.js` — browser half (all the UI)
- `lib/index.js` — host half (placeholder so the package is valid in both halves)
- `cordis.patch.yml` — bundle patch, inserts the `model-source-picker` line
- `package.json` — `dsh.bundle.patch` + `dsh.client{ platform, immediately }`

## Diagnosis

`shell.overlay` contains a `model-source-picker-probe` placeholder entry that draws nothing: its only purpose is to prove that **this bundle really is running in the page**. Check the occupants of `shell.overlay` in the Slots inspector to separate "the module never reached the browser" from "registration was rejected".

If the UI looks unchanged right after installation, the new plugin row has not entered the client module graph yet: disable `dsh-model-source-picker` and enable it again in the plugin manager (or restart the app). That is more reliable than refreshing the page repeatedly.

## Disable / uninstall

Disable the bundle `dsh-model-source-picker` in the plugin manager, or delete the insert line in `cordis.patch.yml`; refresh the page and the stock picker is back.

## License

MIT.
