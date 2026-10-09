-- WezTerm config for Bryson's Claude Setup: the Night Owl look, plus image support for the Claude Code mods.
-- Source of truth for the look: Windows Terminal settings.json ("NightOwl Cyberpunk" defaults).
local wezterm = require 'wezterm'
local act = wezterm.action
local config = wezterm.config_builder()

-- One file for every machine: Windows gets the Windows Terminal setup, a Mac keeps its own shell and keys
local is_windows = wezterm.target_triple:find('windows') ~= nil
local is_mac = wezterm.target_triple:find('darwin') ~= nil

config.default_cwd = wezterm.home_dir

if is_windows then
  -- Shell: PowerShell 7 when it is installed, else WezTerm's own default
  if #wezterm.glob('C:/Program Files/PowerShell/7/pwsh.exe') > 0 then
    config.default_prog = { 'pwsh.exe' }
  end

  -- Other Windows Terminal profiles, reachable by right-clicking the + tab button
  config.launch_menu = {
    { label = 'PowerShell', args = { 'pwsh.exe' } },
    { label = 'Windows PowerShell', args = { 'powershell.exe' } },
    { label = 'Command Prompt', args = { 'cmd.exe' } },
    { label = 'Git Bash', args = { 'C:\\Program Files\\Git\\bin\\bash.exe', '-i', '-l' } },
    { label = 'Ubuntu', args = { 'wsl.exe', '-d', 'Ubuntu' } },
  }
end

-- Colors: NightOwl Cyberpunk, copied from Windows Terminal
config.colors = {
  foreground = '#D6DEEB',
  background = '#011627',
  cursor_bg = '#80A4C2',
  cursor_fg = '#011627',
  cursor_border = '#80A4C2',
  selection_bg = '#1D3B53',
  selection_fg = '#D6DEEB',
  ansi = { '#011627', '#EF5350', '#22DA6E', '#FFEB95', '#82AAFF', '#C792EA', '#21C7A8', '#FFFFFF' },
  brights = { '#575656', '#EF5350', '#22DA6E', '#FFEB95', '#82AAFF', '#C792EA', '#7FDBCA', '#FFFFFF' },
  tab_bar = {
    background = '#1F1F1F',
    active_tab = { bg_color = '#011627', fg_color = '#D6DEEB' },
    inactive_tab = { bg_color = '#1F1F1F', fg_color = '#9DA5B4' },
    inactive_tab_hover = { bg_color = '#2B2B2B', fg_color = '#D6DEEB' },
    new_tab = { bg_color = '#1F1F1F', fg_color = '#9DA5B4' },
    new_tab_hover = { bg_color = '#2B2B2B', fg_color = '#D6DEEB' },
  },
}

-- Font: JetBrainsMono Nerd Font semi-bold; 11pt on Windows with ClearType-style rendering,
-- 14pt on a Mac, where points draw smaller, so the text comes out the same size
config.font = wezterm.font('JetBrainsMono Nerd Font', { weight = 'DemiBold' })
config.font_size = is_mac and 14 or 11
if is_windows then
  config.freetype_load_target = 'Normal'
  config.freetype_render_target = 'HorizontalLcd'
end
-- Windows Terminal "intenseTextStyle": "bright" = bright color, no extra bold
config.bold_brightens_ansi_colors = 'BrightOnly'

-- Window: 75% opacity without acrylic, 12px padding, hidden scrollbar, 120x30 like Windows Terminal
local SEE_THROUGH = 0.75
-- With the idle-opacity mod: how solid the window gets once Claude stops, so the answer reads easily
local READING = 0.9
config.window_background_opacity = SEE_THROUGH
-- Cells an app paints a background on (Claude Code panes, message bars) draw as a second layer over
-- the window's, so any opacity above 0 makes them visibly more solid than the terminal. 0 lets the
-- window background show through them, so the Pinboard pane matches the terminal exactly (diff and
-- message-bar tints go with it)
config.text_background_opacity = 0
config.win32_system_backdrop = 'Disable'
config.window_padding = { left = 12, right = 12, top = 12, bottom = 12 }
config.enable_scroll_bar = false
config.scrollback_lines = 9001
config.initial_cols = 120
config.initial_rows = 30

-- Cursor: blinking bar, Windows Terminal's 530ms blink without fade
config.default_cursor_style = 'BlinkingBar'
config.cursor_blink_rate = 530
config.cursor_blink_ease_in = 'Constant'
config.cursor_blink_ease_out = 'Constant'

-- Tabs in the title bar, always shown, Segoe UI like Windows Terminal
config.window_decorations = 'INTEGRATED_BUTTONS|RESIZE'
config.use_fancy_tab_bar = true
config.hide_tab_bar_if_only_one_tab = false
config.show_new_tab_button_in_tab_bar = true
-- Windows Terminal shows the bare title (what Claude Code sets), no index, up to ~30 chars
config.show_tab_index_in_tab_bar = false
config.tab_max_width = 32
config.window_frame = {
  font = wezterm.font(is_mac and 'Helvetica Neue' or 'Segoe UI', { weight = 'Regular' }),
  font_size = is_mac and 12 or 9.5,
  active_titlebar_bg = '#1F1F1F',
  inactive_titlebar_bg = '#1F1F1F',
}
config.window_close_confirmation = 'NeverPrompt'

-- Claude Code mods: kitty graphics is what <Image> draws with (cc-image-view thumbnails)
config.enable_kitty_graphics = true
config.set_environment_variables = {
  CLAUDE_CODE_FORCE_TERMINAL_IMAGES = '1',
}

-- Keys: Windows Terminal behavior
-- Ctrl+C copies when text is selected, otherwise sends Ctrl+C to the program (interrupt)
local copy_or_interrupt = wezterm.action_callback(function(window, pane)
  local selection = window:get_selection_text_for_pane(pane)
  if selection ~= '' then
    window:perform_action(act.CopyTo 'Clipboard', pane)
    window:perform_action(act.ClearSelection, pane)
  else
    window:perform_action(act.SendKey { key = 'c', mods = 'CTRL' }, pane)
  end
end)

-- Alt+Shift+D: split the focused pane along its longer side, like Windows Terminal's "auto" split
local split_auto = wezterm.action_callback(function(window, pane)
  local dims = pane:get_dimensions()
  if dims.pixel_width > dims.pixel_height then
    window:perform_action(act.SplitHorizontal { domain = 'CurrentPaneDomain' }, pane)
  else
    window:perform_action(act.SplitVertical { domain = 'CurrentPaneDomain' }, pane)
  end
end)

config.keys = {
  { key = 'f', mods = 'CTRL|SHIFT', action = act.Search 'CurrentSelectionOrEmptyString' },
  { key = 'D', mods = 'ALT|SHIFT', action = split_auto },
  { key = '+', mods = 'ALT|SHIFT', action = act.SplitHorizontal { domain = 'CurrentPaneDomain' } },
  { key = '_', mods = 'ALT|SHIFT', action = act.SplitVertical { domain = 'CurrentPaneDomain' } },
  { key = 'D', mods = 'CTRL|SHIFT', action = act.SpawnTab 'CurrentPaneDomain' },
  { key = 'W', mods = 'CTRL|SHIFT', action = act.CloseCurrentPane { confirm = false } },
  { key = 'Space', mods = 'CTRL|SHIFT', action = act.ShowLauncher },
}

-- Move between panes with Alt+arrows on Windows; a Mac uses Cmd+Option+arrows, since Option+arrows
-- there jump by word in the shell and in Claude Code's prompt
local pane_mods = is_mac and 'CMD|ALT' or 'ALT'
for _, dir in ipairs { 'Left', 'Right', 'Up', 'Down' } do
  table.insert(config.keys, { key = dir .. 'Arrow', mods = pane_mods, action = act.ActivatePaneDirection(dir) })
end

-- Ctrl+C / Ctrl+V copy and paste only on Windows: a Mac copies with Cmd, and Claude Code
-- there pastes images with Ctrl+V, so the keys go through to the program untouched
if is_windows then
  table.insert(config.keys, { key = 'c', mods = 'CTRL', action = copy_or_interrupt })
  table.insert(config.keys, { key = 'v', mods = 'CTRL', action = act.PasteFrom 'Clipboard' })
end

-- Right-click: copy if something is selected, otherwise paste (Windows Terminal default)
config.mouse_bindings = {
  {
    event = { Down = { streak = 1, button = 'Right' } },
    mods = 'NONE',
    action = wezterm.action_callback(function(window, pane)
      local selection = window:get_selection_text_for_pane(pane)
      if selection ~= '' then
        window:perform_action(act.CopyTo 'Clipboard', pane)
        window:perform_action(act.ClearSelection, pane)
      else
        window:perform_action(act.PasteFrom 'Clipboard', pane)
      end
    end),
  },
}

-- idle-opacity mod: the Claude Code session on screen writes `working`, `stopped` or `ended` to
-- <temp>/claude-idle-opacity/state, `stopped` once its final answer is shown. Nothing polls:
-- WezTerm watches that file, a write reloads the config, and on the reload each window showing
-- Claude switches to READING while it has stopped, and back to SEE_THROUGH otherwise. No fade:
-- WezTerm can't animate opacity, and stepping it reloads the config each step, which jitters

local temp = (os.getenv('TEMP') or os.getenv('TMPDIR') or '/tmp'):gsub('\\', '/'):gsub('/+$', '')
local state_dir = temp .. '/claude-idle-opacity'

-- The folder must exist to be watched; the mod writes into it
if #wezterm.glob(state_dir) == 0 then
  local mkdir = is_windows and { 'cmd.exe', '/c', 'mkdir', (state_dir:gsub('/', '\\')) } or { 'mkdir', '-p', state_dir }
  wezterm.run_child_process(mkdir)
end
local state_file = state_dir .. '/state'
-- Only a file is watched (a write inside a watched folder reloads nothing), so it must exist before
-- the mod's first write; opening it to append changes nothing in it
local touch = io.open(state_file, 'a')
if touch then touch:close() end
wezterm.add_to_config_reload_watch_list(state_file)

-- Claude Code's sessions run in the background; the pane shows one through a `claude` client. The
-- foreground process is often one the client started (bun.exe for a plugin), so Claude is looked
-- for up its parents; a pane whose foreground is a plain shell is not showing Claude
local function shows_claude(pane)
  local info = pane:get_foreground_process_info()
  if info == nil then return true end
  for _ = 1, 8 do
    if info == nil then return false end
    if (info.name or ''):lower():find('claude') then return true end
    info = info.ppid and info.ppid ~= 0 and wezterm.procinfo.get_info_for_pid(info.ppid) or nil
  end
  return false
end

local function claude_phase(pane)
  if not shows_claude(pane) then return nil end
  local file = io.open(state_file, 'r')
  if not file then return nil end
  local phase = file:read('*l')
  file:close()
  return phase
end

local function shown_opacity(window)
  return (window:get_config_overrides() or {}).window_background_opacity or SEE_THROUGH
end

local function set_opacity(window, opacity)
  local overrides = window:get_config_overrides() or {}
  overrides.window_background_opacity = opacity
  window:set_config_overrides(overrides)
end

-- Fires for every window when the state file changes, and again on its own override, where the
-- opacity already matches and nothing changes
wezterm.on('window-config-reloaded', function(window, pane)
  local target = claude_phase(pane) == 'stopped' and READING or SEE_THROUGH
  if shown_opacity(window) ~= target then set_opacity(window, target) end
end)

return config
