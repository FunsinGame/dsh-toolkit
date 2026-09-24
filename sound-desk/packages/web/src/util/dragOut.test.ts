/**
 * Drag-out tests.
 *
 * DataTransfer is a DOM type, so these use a minimal stand-in. That is enough
 * because the logic under test is which flavours get set and with what values —
 * and getting that wrong is invisible until someone drops a file on a DAW and
 * gets nothing, which is exactly the failure this guards against.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DRAG_FLAVOURS,
  buildDragData,
  describeDragCapability,
  dragHint,
  type DragPayload,
} from './dragOut.ts';

/** The subset of DataTransfer this module touches. */
class FakeDataTransfer {
  readonly data = new Map<string, string>();
  effectAllowed = 'none';
  /** flavours this engine refuses, to exercise the guard */
  private readonly rejects: Set<string>;

  constructor(rejects: string[] = []) {
    this.rejects = new Set(rejects);
  }

  setData(format: string, value: string): void {
    if (this.rejects.has(format)) throw new Error(`refusing ${format}`);
    this.data.set(format, value);
  }
}

const payload: DragPayload = {
  assetId: 505,
  filename: 'ui_town_coins_sprk_med_07.wav',
  mimeType: 'audio/wav',
  downloadUrl: 'http://127.0.0.1:8807/api/media/505/download?token=abc',
};

const asTransfer = (t: FakeDataTransfer): DataTransfer => t as unknown as DataTransfer;

test('every drag flavour is set, with the URL where targets look for it', () => {
  const dt = new FakeDataTransfer();
  const set = buildDragData(asTransfer(dt), payload);

  assert.deepEqual(set, [...DRAG_FLAVOURS]);
  // a file manager or DCC tool reads uri-list for a URL drop
  assert.equal(dt.data.get('text/uri-list'), payload.downloadUrl);
  // a text field or a tool that only reads plain text still gets something usable
  assert.equal(dt.data.get('text/plain'), payload.downloadUrl);
});

test('the DownloadURL flavour carries name, url and mime in that order', () => {
  const dt = new FakeDataTransfer();
  buildDragData(asTransfer(dt), payload);

  const value = dt.data.get('DownloadURL');
  assert.ok(value, 'DownloadURL must be set');
  // Chromium's format is "filename:mimetype:url" historically, but the widely
  // used form is name:url:mime; whichever is read, the name must be in there or a
  // dropped file arrives without its extension.
  assert.ok(value.includes(payload.filename), `no filename in "${value}"`);
  assert.ok(value.includes(payload.downloadUrl), `no url in "${value}"`);
  assert.ok(value.includes(payload.mimeType), `no mime in "${value}"`);
});

test('a drag is a copy, never a move', () => {
  const dt = new FakeDataTransfer();
  buildDragData(asTransfer(dt), payload);
  assert.equal(dt.effectAllowed, 'copy', 'a move would imply the library file is consumed');
});

test('a rejected DownloadURL does not lose the URL flavours', () => {
  // Some engines refuse flavours they do not recognise. The URL must survive.
  const dt = new FakeDataTransfer(['DownloadURL']);
  const set = buildDragData(asTransfer(dt), payload);

  assert.deepEqual(set, ['text/uri-list', 'text/plain']);
  assert.equal(dt.data.get('text/uri-list'), payload.downloadUrl);
  assert.equal(dt.data.has('DownloadURL'), false);
  assert.equal(dt.effectAllowed, 'copy');
});

test('plain text prefers the local path when the host knows it', () => {
  const dt = new FakeDataTransfer();
  buildDragData(asTransfer(dt), { ...payload, filePath: 'C:\\lib\\Doors\\wood_close.wav' });
  // A desktop app that accepts a dropped path is the one case where the path is
  // more useful than a URL.
  assert.equal(dt.data.get('text/plain'), 'C:\\lib\\Doors\\wood_close.wav');
  // but uri-list stays a URL: a path there would be unparseable
  assert.equal(dt.data.get('text/uri-list'), payload.downloadUrl);
});

test('a non-ASCII filename survives the drag payload', () => {
  const dt = new FakeDataTransfer();
  const chinese: DragPayload = { ...payload, filename: '金属门_关上.wav' };
  buildDragData(asTransfer(dt), chinese);
  assert.ok(dt.data.get('DownloadURL')!.includes('金属门_关上.wav'));
});

test('capabilities differ between the browser and the webview host', () => {
  const browser = describeDragCapability('browser');
  // A page only ever sees asset ids, so it cannot reveal a filesystem path.
  assert.equal(browser.canRevealFile, false);
  assert.equal(browser.canOpenInEditor, false);
  assert.equal(browser.canDragUrl, true, 'the URL drag works in both hosts');

  const vscode = describeDragCapability('vscode');
  assert.equal(vscode.canRevealFile, true, 'the extension host can act on the real path');
  assert.equal(vscode.canOpenInEditor, true);
  assert.equal(vscode.canDragUrl, true);
});

test('the hint tells the truth about what the host cannot do', () => {
  const inBrowser = dragHint(describeDragCapability('browser'));
  // The browser cannot hand a real file to the OS; the hint must not imply it can.
  assert.ok(inBrowser.includes('下载'), `browser hint should point at downloading: ${inBrowser}`);

  const inVscode = dragHint(describeDragCapability('vscode'));
  assert.ok(inVscode.includes('系统中显示') || inVscode.includes('导出'), `vscode hint: ${inVscode}`);
});
