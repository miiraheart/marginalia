# Marginalia

Select text in a Claude Code conversation and act on it right there: quote it into your prompt, pin it, ask about it, turn it into a task, or keep it for later.

```
  - Cats sleep 12 to 16 hours a day, saving energy for short bursts of hunting.
  [ ❝ Quote ] [ ♥ Remember ] [ + Task ] [ ⋯ ] [ ✕ ]  9 words selected
  - Cats are obligate carnivores and need taurine from animal tissue.
```

## What it does

Select text with the mouse anywhere in the transcript. A moment after you let go, a **margin bar** appears under the selected line:

| Button | What happens |
|---|---|
| `❝ Quote` | Puts a chip like `[❝1 Cats sleep 12 to…]` at your cursor. When you send the prompt, the full passage goes along as context, labeled with where it came from. |
| `♥ Remember` | Asks Claude to remember the passage. |
| `+ Task` | Creates a task from it with [beads](https://github.com/gastownhall/beads) (`bd create`), when the project uses beads. |
| `⋯` | More: Explain, Deeper, Redo, Anki, Define, Wrong, Copy clean. |
| `✕` | Closes the bar. |

Quoted text becomes a **pin**: a gray outline around the original passage with `❝1 pinned [✕ unpin]` in its border. Pins also show in a **pin tray** above the prompt, with `↥ go` (jump back to the passage), `▸ show` and `✕ unpin`. Removing the chip from the prompt unpins it too.

Drawing the bar, pins and tray costs no tokens. Only sending a quote or one of the ask actions does.

## Install

Requires a Claude Code version with mods. Tested on 2.1.296.

```
/plugin marketplace add miiraheart/marginalia
```

```
/plugin install marginalia@marginalia
```

Selection only works in **fullscreen** mode.

To update:

```bash
claude plugin marketplace update marginalia && claude plugin update marginalia@marginalia
```

To uninstall:

```bash
claude plugin uninstall marginalia@marginalia
```

## Settings

Both are environment variables. Set them in your shell, or per project in `.claude/settings.json` under `"env"`.

| Variable | Effect |
|---|---|
| `MARGINALIA_ACTIONS` | Buttons on the bar itself, comma separated, in order. Default `quote,remember,task`. The rest go under `⋯`. Names: `quote`, `remember`, `task`, `explain`, `deeper`, `redo`, `anki`, `define`, `wrong`, `copy`. |
| `MARGINALIA_DEFINE_CMD` | A command run with the selected words for `Define` (for example a dictionary lookup). Its output shows as a toast. Without it, Define asks Claude. |

A language-learning project might use:

```json
{ "env": { "MARGINALIA_ACTIONS": "quote,define,anki,task" } }
```

## Commands

- `/q` quotes the current selection into the prompt.
- `/remember-this` sends the selection to Remember.

## How the bar stays out of your way

Terminal selections are tied to screen rows, so anything that moves text while you select changes what is selected. Marginalia avoids moving text:

- The bar sits beside the selected line when it fits, or on a blank line under it.
- Between tight list items, where there is no blank line, the bar takes its own row under the selected item. It is added only after your selection settles, and when you select again the old row turns blank instead of disappearing, so nothing above your new selection shifts.
- The terminal does not report a plain click outside the selection, so the bar closes with `✕`, when you type, press a button or start a new selection, or by itself 15 seconds after it appears.

## For theme mods

Marginalia works on its own. A theme mod that draws assistant messages itself can draw the bar and pins in its own style through `$.marginalia`:

- `view({ requestId, role })` returns what to draw for a message: the selection, its pins, the buttons, and blank rows to keep.
- `press(args)` runs a button.
- `version()` changes whenever something should be redrawn.
- `placed({ inFlow, rows })` tells Marginalia whether the bar was drawn as its own row.

The types are in [`types/index.d.ts`](types/index.d.ts).

## Known limits

- Fullscreen only: outside fullscreen, Claude Code reports no selection.
- Without a theme mod, Marginalia redraws a message while it has a bar or a pin, and its spacing can differ slightly from the default rendering.

## License

[MIT](LICENSE)
