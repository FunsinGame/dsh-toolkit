/**
 * Message contract between the webview UI and the extension host.
 *
 * The UI is the same bundle that runs in a browser; only the transport differs.
 * In the browser it talks HTTP directly, here it posts these envelopes and the
 * extension host answers from the in-process engine.
 *
 * `id` correlates request and response. The UI keeps a pending map, so responses
 * may arrive out of order.
 */

import type { SearchRequest } from '@sounddesk/core';

/** Injected into the webview before the bundle runs. */
export interface EngineBootstrap {
  port: number;
  token: string;
  url: string;
  dataDir: string;
  modelLoaded: boolean;
  host: 'vscode';
}

export interface EngineRequestBody {
  type: 'engine.request';
  id: number;
  method: string;
  params?: unknown;
}

export interface EngineReadyMessage {
  type: 'engine.ready';
  bootstrap: EngineBootstrap;
}

export interface EngineErrorMessage {
  type: 'engine.error';
  message: string;
}

export interface WebviewReadyMessage {
  type: 'webview.ready';
}

export interface OpenExternalMessage {
  type: 'webview.openExternal';
  url: string;
}

export interface RevealMessage {
  type: 'webview.reveal';
  path: string;
}

/**
 * Ask the host to do something the webview cannot: act on a real file path.
 *
 * The path is never sent by the UI. The webview asks with an asset id and the
 * **host** resolves it from the engine's database — a path arriving from a webview
 * would be untrusted input, and `revealFileInOS` on an arbitrary path is exactly
 * the kind of thing a malicious page would like to trigger.
 */
export interface HostActionMessage {
  type: 'webview.hostAction';
  action: 'revealInOS' | 'openInEditor';
  assetId: number;
  /** correlation id, so the UI can surface a failure */
  requestId: number;
}

export interface HostActionReply {
  type: 'webview.hostActionReply';
  requestId: number;
  ok: boolean;
  error?: string;
}

/**
 * Ask the host to show a folder picker.
 *
 * A webview cannot obtain a real directory path — `<input type="file" webkitdirectory>`
 * yields `File` objects with no filesystem path, and the engine needs a path it can
 * hand to `chokidar`. So the *host* owns the dialog and the resulting path is the
 * only way this information can exist at all.
 *
 * This is the one message that legitimately sends a path *from* the webview (as the
 * chosen root) rather than resolving one on the host side; see the handler in
 * `webviewSession.ts` for why that is an acceptable trust boundary here.
 */
export interface PickFolderMessage {
  type: 'webview.pickFolder';
  /** correlation id */
  requestId: number;
  /** shown as the dialog title, e.g. "选择要索引的素材库目录" */
  title?: string;
}

/** Answer to {@link PickFolderMessage}. */
export interface PickFolderReply {
  type: 'webview.pickFolderReply';
  requestId: number;
  /** absent when the user cancelled */
  path?: string;
  /** present when the dialog itself failed */
  error?: string;
}

export type WebviewToHost =
  | EngineRequestBody
  | WebviewReadyMessage
  | OpenExternalMessage
  | RevealMessage
  | HostActionMessage
  | PickFolderMessage;

export type HostToWebview =
  | EngineReadyMessage
  | EngineErrorMessage
  | { type: 'engine.response'; id: number; result?: unknown; error?: string }
  | { type: 'engine.event'; job?: unknown }
  | HostActionReply
  | PickFolderReply;

// -- params shapes -----------------------------------------------------------

export interface AssetIdParams {
  id: number;
}

export interface PatchAssetParams {
  id: number;
  patch: {
    tags?: string[];
    favorite?: boolean;
    rating?: number;
    ucsCatId?: string | null;
  };
}

export interface ListAssetsParams {
  libraryId?: number;
  limit?: number;
  offset?: number;
}

export interface AddLibraryParams {
  root: string;
  name?: string;
}

export interface UcsLookupParams {
  term: string;
}

export interface CancelJobParams {
  id: string;
}

export type SearchParams = SearchRequest;

/** Narrow `unknown` params without scattering casts through the handler. */
export function asParams<T>(value: unknown): T {
  return (value ?? {}) as T;
}
