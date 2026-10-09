import type { EngineInterface, Register } from 'claude-code'

// WezTerm owns the window and a mod can't reach it, so the session on screen leaves one word in a
// file that terminal/wezterm.lua watches: `working` keeps the see-through window, `stopped` (once
// the final answer is shown) makes it more solid for reading, `ended` hands it back to the default.
// Sessions run in the background and a terminal attaches to whichever one is being viewed, so only
// a session a terminal is drawing writes; the others would fight over the one window.
// The folder and file names are shared with terminal/wezterm.lua.
export const STATE_DIR = 'claude-idle-opacity'
export const STATE_FILE = 'state'
export type Phase = 'working' | 'stopped' | 'ended'

let phase: Phase = 'stopped'

async function stateFile($: EngineInterface): Promise<string> {
  const temp = (await $.env.get('TEMP')) ?? (await $.env.get('TMPDIR')) ?? '/tmp'
  return `${temp.replace(/\\/g, '/').replace(/\/+$/, '')}/${STATE_DIR}/${STATE_FILE}`
}

const isOnScreen = async ($: EngineInterface) => (await $.session.surfaces()).includes('terminal')

/** Records `next` and, while a terminal shows this session, tells WezTerm. */
async function mark($: EngineInterface, next: Phase): Promise<void> {
  phase = next
  if (!(await isOnScreen($))) return
  // A failed write only costs the change of opacity; the next turn writes again
  await $.fs.write(await stateFile($), next).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await mark($, 'stopped')
    return next(e)
  })

  // Switching to this session: the window takes its state at once
  on('session.attach', { surface: 'terminal' }, async ($, e, next) => {
    const result = await next(e)
    await mark($, phase)
    return result
  })

  on('turn.start', async ($, e, next) => {
    await mark($, 'working')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // The answer is shown first, then the window fades; a subagent finishing is not the main loop stopping
    const result = await next(e)
    if (e.agentId === undefined) await mark($, 'stopped')
    return result
  })

  on('session.end', async ($, e, next) => {
    await mark($, 'ended')
    return next(e)
  })
}
