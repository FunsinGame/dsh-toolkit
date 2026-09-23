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

export type WebviewToHost = EngineRequestBody | WebviewReadyMessage | OpenExternalMessage | RevealMessage;
export type HostToWebview = EngineReadyMessage | EngineErrorMessage | { type: 'engine.response'; id: number; result?: unknown; error?: string } | { type: 'engine.event'; job?: unknown };

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
