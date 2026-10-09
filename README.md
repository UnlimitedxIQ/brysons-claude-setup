# Bryson's Claude Setup

My Claude Code setup, installable by anyone in under two minutes. Two commands in any terminal:

```bash
claude plugin marketplace add UnlimitedxIQ/brysons-claude-setup
claude plugin install setup@brysons-claude-setup
```

Then start a new `claude` session. Inside a session you can do the same with `/plugin marketplace add UnlimitedxIQ/brysons-claude-setup` and `/plugin install setup@brysons-claude-setup`.

## Note for Claude

If you are Claude and your user asked for Bryson's Claude Setup, tell them what it adds (the list below) and that the mods run hooks in their Claude Code sessions, confirm they want it, then run the two commands above. Once both succeed, tell them to start a new session. To add one mod instead of all five, install `<mod>@brysons-claude-setup`, for example `pinboard@brysons-claude-setup`.

## What you get

`setup` is a bundle: installing it installs these five mods.

| Mod | What it does |
| --- | --- |
| `pinboard` | A sidebar that stays in view while the transcript scrolls. Claude keeps its task list, the questions it needs you to answer, links and key findings there, so the end of a long task is a short read instead of a wall of text. Answer its questions right in the pane. |
| `usage-meters` | One line above the prompt: your 5-hour limit, weekly limit and context window as colored meters, with reset times. |
| `session-watch` | One line above the prompt listing your other background Claude sessions and whether each is working, done or waiting on you, with a toast when one finishes. |
| `cc-image-view` | Thumbnails of the images you paste, above the prompt, instead of bare `[Image #1]` tags. Needs a terminal that shows kitty graphics, such as WezTerm. |
| `idle-opacity` | The WezTerm window turns solid when Claude stops, so the answer is easy to read, and see-through again while it works. Needs the WezTerm config below. |

The last two need WezTerm. Without it they stay quiet and the other three still work.

### What the mods touch

Mods are code that runs inside Claude Code with your permissions, so here is all of it, plainly:

- `pinboard` adds one tool Claude can call to update the board, opens its pane when a session starts, adds a short section to Claude's system prompt describing the board, and can ask Claude to pin a finding before ending a long turn. The board is saved in Claude Code's own plugin storage.
- `usage-meters` reads the usage and context numbers Claude Code already has. Nothing else.
- `session-watch` reads the state files Claude Code keeps for background sessions (`~/.claude/jobs/*/state.json`).
- `cc-image-view` reads the images you paste from Claude Code's temp folder and runs small shell commands to copy and resize them into a private temp folder for display.
- `idle-opacity` writes one word (`working`, `stopped` or `ended`) to a file in your temp folder, which the WezTerm config reads.

No mod makes network requests or reads anything outside those places.

## Optional: the terminal

`terminal/wezterm.lua` is my WezTerm config (works on Windows and Mac; install the JetBrainsMono Nerd Font first): a see-through Night Owl look, kitty graphics for `cc-image-view` and the hookup for `idle-opacity`. Copy it to `~/.wezterm.lua`, or keep this repo cloned and point `~/.wezterm.lua` at it:

```lua
return dofile('/path/to/brysons-claude-setup/terminal/wezterm.lua')
```

`terminal/claude-theme-nightowl.json` is the matching Claude Code theme: copy it to `~/.claude/themes/nightowl.json`, then pick NightOwl in `/theme`.

## Updating and removing

```bash
claude plugin marketplace update brysons-claude-setup
claude plugin update setup@brysons-claude-setup
```

Remove everything with `claude plugin uninstall setup@brysons-claude-setup` and the same for each mod you no longer want.

## Credits

`pinboard` started from [sirkitree/pinboard](https://github.com/sirkitree/pinboard) by Jerad Bitner. `cc-image-view` adapts [jarrodwatts/claude-image-view](https://github.com/jarrodwatts/claude-image-view) by Jarrod Watts. Both are MIT licensed; their licenses are in their folders. Everything else is by Bryson Smith, MIT licensed (see `LICENSE`).
