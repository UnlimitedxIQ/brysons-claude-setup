<div align="center">

# Pinboard

**What needs you, pinned where you can see it.**<br>
Open decisions, the task list and the links Claude creates stay in a pane beside the conversation, so they don't scroll out of view.

[![Version](https://img.shields.io/badge/version-0.1.0-d77757.svg)](.claude-plugin/plugin.json)
[![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-c678dd.svg)](https://code.claude.com/docs/en/plugins/mods/overview)
[![Claude Code 2.1.287+](https://img.shields.io/badge/Claude%20Code-2.1.287%2B-4a4a4a.svg)](#install)
[![Catalogue](https://img.shields.io/badge/awesome--claude--code--mods-validates-4a4a4a.svg)](https://mods.aidojo.si/#sirkitree--pinboard--pinboard)
[![License: MIT](https://img.shields.io/badge/license-MIT-4eba65.svg)](LICENSE)

<img src="docs/board-in-progress.png" alt="Pinboard pane beside a Claude Code session, with one open decision and two of four todos done" width="820">

</div>

The story of how it came together: [Pinboard: a Claude Code mod](https://jeradbitner.com/blog/pinboard-claude-code-mod).

## What it pins

- **Open decisions**: questions Claude needs you to answer. Each has a reply field in the pane (`ctrl+x tab` puts you in the first one, Tab moves to the next, Enter sends). Your reply goes to Claude as your own message, queued until it finishes the current turn, and shows under the question until Claude acts on it and closes it. Claude doesn't wait on an open decision: it pins the question and keeps working on whatever doesn't depend on it, so a long unattended session never stalls on one.
- **Todos**: the session's task list, one action per item. The one Claude is working on is marked `▸` in the warning color (one at a time), open items show `○`, and finished items fold into a single dim `✓ N done` line so open work stays on top.
- **Links**: URLs from actions that make something (`gh pr|issue|release|repo|gist create`, `gh pr|issue comment`, `git push`, and MCP tools that create, draft, send, publish, share or upload), newest first, up to 12. GitHub PRs and issues get short labels such as `repo PR #12`. Press `l` (or the **clear** button) to empty the list.

- **Findings**: what you'd want to know without reading the transcript, pinned as it happens: `◆` something Claude found, `↪` a switch to another approach or task with the reason it was the better move, `▪` the result of a run, test or backtest with its numbers. Each is a short headline with one dim line of why or data beneath, newest first; the pane shows eight and folds older ones into one line. Press `f` (or **clear**) to empty the list. With findings on the board, Claude keeps its closing reply to a few lines.

Everything is session state: `/clear` and `/resume` start an empty board.

## How Claude updates it

Pinboard registers a tool, `mcp__pinboard__update`, that Claude calls to add todos, start one, check them off or remove them by id, open decisions and close them, and pin findings. Its description carries a few working rules borrowed from opencode's `todowrite`: update in real time, mark a todo done only after the work (and any verification) is actually done, and when blocked, leave it in progress and add a follow-up todo for the blocker. Each call shows as one dim line in the transcript (`Pinboard: +2 todo, 1 decided`), so lists don't have to be repeated in replies.

The current board, with ids, is added to the end of the system prompt on every request, so Claude always knows what's open. Pinboard doesn't depend on the `TodoWrite` or Task tools, which newer models don't get by default.

Questions are the easiest thing to leave in a reply, where they scroll away. When Claude finishes a turn whose last lines end in a question mark (code blocks aside) while the board has no open decision, Pinboard's `Stop` hook sends it back once to pin the question with `open_decisions`. It only nudges once per stop, so a rhetorical question can still end the turn. If the question is already pinned but undone todos remain, the same hook sends Claude back once to carry on with the work that doesn't need the answer.

Findings get the same help. After 15 tool calls in a turn with nothing pinned, the board at the end of the system prompt carries a line reminding Claude to pin what it has learned; the line clears once a finding lands. A turn of 15 or more tool calls that ends with no finding is sent back once to pin them, without repeating the reply. Subagents' calls don't count.

## How it opens

- The pane opens by itself when an interactive session starts (not under `claude -p`), and again the first time something lands on an empty board.
- Opened that way, Claude Code only seats it in a terminal at least 144 columns wide (110 once you've opened it yourself). Below that it waits and appears when the terminal widens, or run `/pinboard`.
- `/pinboard` opens it at any width, even while Claude is working. Ctrl+X then X closes it.
- Docked beside a fullscreen transcript it takes a quarter of the screen (at least 30 columns), and opens at that width from the next session on. A width you drag it to still wins.

## Install

```bash
claude plugin marketplace add sirkitree/pinboard
claude plugin install pinboard@pinboard
```

## Develop

```bash
claude plugin validate --strict .
claude plugin test .
claude --plugin-dir .
```

Built on the mods API as of Claude Code 2.1.288. That API is in early access and changes between releases.
