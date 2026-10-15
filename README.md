# Marginalia

Select text in a Claude Code conversation and act on it right there: quote it into your prompt, ask about it, turn it into a task, or keep it for later.

<img width="1161" height="120" alt="image" src="https://github.com/user-attachments/assets/0ffd14ac-314f-437a-bc9a-68fe86fff42f" />

## What it does

Select text with the mouse anywhere in the transcript. A moment after you let go, a **margin bar** appears under the selected line:

| Button | What happens |
|---|---|
| `❝ Quote` | Puts a chip like `[❝1 Cats sleep 12 to…]` at your cursor. When you send the prompt, the full passage goes along as context, labeled with where it came from. |
| `♥ Remember` | Asks Claude to remember the passage. |
| `+ Task` | Creates a task from it with [beads](https://github.com/gastownhall/beads) (`bd create`), when the project uses beads. |
| `⋯` | More: Explain, Deeper, Redo, Anki, Define, Wrong, Copy clean. |
| `✕` | Closes the bar. |

<img width="1221" height="115" alt="image" src="https://github.com/user-attachments/assets/747afb7a-0c9a-4983-a77f-cf3bf6b3e7c4" />

<img width="1305" height="244" alt="image" src="https://github.com/user-attachments/assets/dc2544cf-e922-469e-bcfc-f4be47e087fa" />

Click `⋯` and the other actions open on a second line:

<img width="1074" height="183" alt="image" src="https://github.com/user-attachments/assets/ff6b71a3-3f57-4d85-aeea-d20193a87d2c" />

| More action | What happens |
|---|---|
| `? Explain` | Asks Claude to explain the passage more simply. |
| `↳ Deeper` | Asks Claude to go deeper, with one concrete example. |
| `✎ Redo` | Asks Claude to rewrite the passage another way. |
| `▤ Anki` | Asks Claude to turn the passage into an Anki card, the way the project makes cards. |
| `≡ Define` | Defines the selected words (see `MARGINALIA_DEFINE_CMD` below). |
| `✗ Wrong` | Tells Claude the passage looks wrong or unclear and asks it to check and fix it. |
| `⧉ Copy clean` | Copies the passage without list markers or button text. |

Quoted text stays **outlined** in gray in the conversation, with `❝1 quoted [✕ unquote]` in its border. Every quote also shows in a **quote tray** above the prompt, with `↥ go` (jump back to the passage), `▸ show` and `✕ unquote`. Removing the chip from the prompt unquotes it too.

### Jump between messages

The footer next to `Progress` holds `me ▲ ▼` and `reply ▲ ▼`. `me` steps through the messages you sent, including ones sent while Claude was working. `reply` steps through Claude's replies, landing on the start of each one. `▲` goes to older ones, `▼` to newer ones, and each jump puts the message at the top of the screen. Sending a new message starts over from the bottom.

Drawing the bar, outlines and tray costs no tokens. Only sending a quote or one of the ask actions does.

## Install

Requires a Claude Code version with mods. Tested on 2.1.296.

```
/plugin marketplace add miiraheart/marginalia
```

```
/plugin install marginalia@marginalia
```

Selection needs Claude Code's **fullscreen mode**: the transcript view with "Jump to bottom" and mouse selection. That is a Claude Code setting, not the size of your terminal window.

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
| `MARGINALIA_DEFINE_CMD` | A command run with the selected words for `Define` (for example a dictionary lookup). Its output shows as a toast. Without it, or when the command fails or takes more than 20 seconds, Define asks Claude. |

Example: to have `≡ Define` and `▤ Anki` on the bar instead of `♥ Remember` (handy when you learn a language), put this in that project's `.claude/settings.json`. The bar then shows `[ ❝ Quote ] [ ≡ Define ] [ ▤ Anki ] [ + Task ]`, and Remember moves under `⋯`.

```json
{ "env": { "MARGINALIA_ACTIONS": "quote,define,anki,task" } }
```

## Commands

- `/q` quotes the current selection into the prompt.
- `/remember-this` sends the selection to Remember.

## How the bar stays out of your way

Terminal selections are tied to screen rows, so anything that moves text while you select changes what is selected. Marginalia avoids moving text:

- The bar sits beside the selected line when it fits, or on a blank line under it.
- Between tight list items, where there is no blank line, the bar takes its own row under the selected item. It is added only after your selection settles.
- When you select again, the old bar row is reused if it sits right above your new selection: the bar moves into it, just above the selected line. Otherwise the old row turns blank instead of disappearing, so nothing above your new selection shifts. Blank rows below the selection are removed at once.
- The terminal does not report a plain click outside the selection, so the bar closes with `✕`, when you type, press a button or start a new selection, or by itself 15 seconds after it appears.

## For theme mods

Marginalia works on its own. A theme mod that draws assistant messages itself can draw the bar and quote outlines in its own style through `$.marginalia`:

- `view({ requestId, role })` returns what to draw for a message: the selection, its quotes (`pins` in the types), the buttons, and blank rows to keep.
- `press(args)` runs a button.
- `version()` changes whenever something should be redrawn.
- `placed({ inFlow, rows })` tells Marginalia whether the bar was drawn as its own row.

The types are in [`types/index.d.ts`](types/index.d.ts).

## Known limits

- Claude Code's fullscreen mode only: in the classic mode Claude Code reports no selection, so the bar never appears.
- The jump buttons follow their own last jump: after scrolling by hand, the next click continues from the message it last jumped to. The last few messages of a conversation stop as high as they can, since nothing below them can scroll up.
- When Marginalia runs alone (no theme mod drawing the messages), it draws a message itself while that message has a bar or a quote. Its spacing can then differ by a line from Claude Code's own drawing.

## License

[MIT](LICENSE)
