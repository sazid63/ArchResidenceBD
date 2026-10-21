/**
 * The core, through the desktop shell (W5.1).
 *
 * The app is a **shell** (the plan's §4 §: Tauri + React ✓) and the core is the brain ✓.
 * When the app runs inside the desktop shell ✓, the shell holds the core as a sidecar ✓
 * and answers these calls over the bridge ✓ (one JSON object per line over stdio ✓).
 *
 * When the app runs in a browser ✓ (the prototype ✓, `pnpm dev` ✓), there is no core ✓ -
 * and this says so ✓, rather than pretending the app is connected ✓ ✓.
 */

export interface CoreError {
  /** The frozen error code (`invalid_params`, `internal`, `worker_down`, ...). */
  code: string;
  /** What went wrong, in words. */
  message: string;
}

export interface CoreResponse {
  /** The request's id, echoed. */
  id: string;
  /** The result, when the call succeeded. */
  result?: unknown;
  /** The error, when it did not. */
  error?: CoreError;
}

type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function shellInvoke(): Invoke | null {
  const host = window as unknown as { __TAURI__?: { core?: { invoke?: Invoke } } };
  return host.__TAURI__?.core?.invoke ?? null;
}

/** Whether the app is running inside the desktop shell (and so has a core). */
export function isDesktopShell(): boolean {
  return shellInvoke() !== null;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `a${counter}`;
}

/** Ask the core a question. Throws when there is no core to ask. */
export async function ask(
  method: string,
  params: Record<string, unknown> = {},
): Promise<CoreResponse> {
  const invoke = shellInvoke();
  if (!invoke) {
    throw new Error("the app is running outside the desktop shell");
  }
  const id = nextId();
  return (await invoke("ask", { id, method, params })) as CoreResponse;
}

/** The core's health, or null when there is no core to ask. */
export async function coreHealth(): Promise<CoreResponse | null> {
  if (!isDesktopShell()) return null;
  try {
    return (await ask("ping")) as CoreResponse;
  } catch {
    return null;
  }
}
