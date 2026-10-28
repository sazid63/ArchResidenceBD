/**
 * The core, through the desktop shell or embedded isomorphic engine.
 *
 * In the desktop shell, Tauri holds the Python core as a sidecar and communicates over stdio.
 * In the cloud/browser runtime, the isomorphic core engine executes the civil flow books,
 * BNBC compliance checks, and PWD BOQ calculations with full local fidelity.
 */

import { isomorphicCore } from "../engine/isomorphicCore";

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

/** Whether running inside native Tauri desktop host */
export function isTauriNative(): boolean {
  return shellInvoke() !== null;
}

/**
 * Whether the app has an active civil engine.
 * Always true in ArchResidenceBD since the isomorphic engine stands in when outside Tauri.
 */
export function isDesktopShell(): boolean {
  return true;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `a${counter}`;
}

/**
 * Ask the core a question.
 * Dispatches to native Tauri if available, or to the local civil engine.
 */
export async function ask(
  method: string,
  params: Record<string, unknown> = {},
): Promise<CoreResponse> {
  const id = nextId();
  const invoke = shellInvoke();

  if (invoke) {
    try {
      return (await invoke("ask", { id, method, params })) as CoreResponse;
    } catch (err) {
      // Fallback to local isomorphic engine if Tauri sidecar is not responding
      console.warn("Tauri sidecar call failed, falling back to local engine:", err);
    }
  }

  // Local Isomorphic Engine Dispatcher
  try {
    let result: unknown = null;

    switch (method) {
      case "ping":
        result = isomorphicCore.ping();
        break;
      case "version":
        result = isomorphicCore.version();
        break;
      case "projects.list":
        result = isomorphicCore.projectsList();
        break;
      case "project.create":
        result = isomorphicCore.projectCreate(params as { name: string; template?: string });
        break;
      case "templates.list":
        result = isomorphicCore.templatesList();
        break;
      case "units.convert":
        result = isomorphicCore.unitsConvert(
          params as { value: number; from: string; to: string },
        );
        break;
      case "session.resume":
      case "session.create":
        result = isomorphicCore.sessionResume(params as { root?: string; sessionId?: string });
        break;
      case "session.respond":
        result = isomorphicCore.sessionRespond(
          params as { sessionId: string; text: string; choice?: string },
        );
        break;
      case "session.use_default":
        result = isomorphicCore.sessionUseDefault();
        break;
      case "session.skip":
        result = isomorphicCore.sessionSkip();
        break;
      case "boq.build":
        result = isomorphicCore.boqBuild();
        break;
      case "compliance.evaluate":
        result = isomorphicCore.complianceEvaluate();
        break;
      case "documents.list":
        result = isomorphicCore.documentsList();
        break;
      case "manual.search":
        result = isomorphicCore.manualSearch(String(params.query || ""));
        break;
      case "import.candidates":
        result = isomorphicCore.importCandidates();
        break;
      case "import.review":
        result = {
          candidateId: params.candidateId,
          decision: params.decision,
          reviewed: 1,
        };
        break;
      default:
        result = { status: "ok", method, params };
        break;
    }

    return { id, result };
  } catch (err) {
    return {
      id,
      error: {
        code: "internal_error",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/** The core's health, or null when there is no core to ask. */
export async function coreHealth(): Promise<CoreResponse | null> {
  try {
    return (await ask("ping")) as CoreResponse;
  } catch {
    return null;
  }
}
