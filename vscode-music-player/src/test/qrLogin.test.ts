import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  QrLoginError,
  QrLoginFlow,
  QR_STATUS,
  PASSPORT_USER_AGENT,
  renderQrSvg,
  svgToDataUrl,
} from '../auth/qrLogin';
import type { RawRequestOptions } from '../bilibili/client';

/** 造一个 JSON 响应，可选带多条 Set-Cookie。 */
function jsonResponse(body: unknown, setCookies: string[] = []): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const cookie of setCookies) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status: 200, headers });
}

/**
 * 注意：`Response` 的 body 只能读一次，所以这里收的是**工厂函数**而不是响应对象——
 * 复用同一个响应实例会让第二个用例拿到 "Body is unusable"。
 */
function generateOk(): Response {
  return jsonResponse({
    code: 0,
    data: { url: 'https://www.bilibili.com/h5/login?token=xyz', qrcode_key: 'KEY123' },
  });
}

function pollResponse(qrCode: number, setCookies: string[] = []): Response {
  return jsonResponse({ code: 0, data: { code: qrCode, message: 'ok' } }, setCookies);
}

type Responder = () => Response | Error;

interface Harness {
  flow: QrLoginFlow;
  state: { calls: number; urls: string[]; options: RawRequestOptions[] };
}

function harness(
  responders: Responder[],
  overrides: { sleep?: (ms: number) => Promise<void>; maxWaitMs?: number } = {},
): Harness {
  const state: Harness['state'] = { calls: 0, urls: [], options: [] };
  const flow = new QrLoginFlow({
    fetchRaw: async (options: RawRequestOptions) => {
      state.urls.push(options.url);
      state.options.push(options);
      const responder = responders[Math.min(state.calls, responders.length - 1)];
      state.calls++;
      const result = responder === undefined ? pollResponse(QR_STATUS.WAITING) : responder();
      if (result instanceof Error) throw result;
      return result;
    },
    sleep: overrides.sleep ?? (async () => undefined),
    ...(overrides.maxWaitMs === undefined ? {} : { maxWaitMs: overrides.maxWaitMs }),
  });
  return { flow, state };
}

test('扫码登录：等待 → 已扫 → 成功，并正确收下 cookie', async () => {
  const events: string[] = [];
  let qrSvg = '';
  let qrUrl = '';

  const { flow, state } = harness([
    generateOk,
    () => pollResponse(QR_STATUS.WAITING),
    () => pollResponse(QR_STATUS.SCANNED),
    () =>
      pollResponse(QR_STATUS.SUCCESS, [
        'SESSDATA=abc%2Cdef; Path=/; Expires=Wed, 01 Jan 2026 00:00:00 GMT',
        'bili_jct=token123; Path=/',
        'DedeUserID=42; Path=/',
      ]),
  ]);

  const cookies = await flow.run({
    onQrCode: (payload) => {
      qrSvg = payload.svg;
      qrUrl = payload.url;
    },
    onStatus: (status) => events.push(status),
  });

  assert.equal(qrUrl, 'https://www.bilibili.com/h5/login?token=xyz');
  assert.ok(qrSvg.startsWith('<svg'), '应当生成 SVG 二维码');
  assert.deepEqual(cookies, {
    SESSDATA: 'abc%2Cdef',
    bili_jct: 'token123',
    DedeUserID: '42',
  });
  // 前面两次是「正在获取二维码」与「请扫码」，第三次才是第一次轮询结果。
  assert.deepEqual(events, ['waiting', 'waiting', 'waiting', 'scanned', 'success']);
  assert.equal(state.calls, 4);
});

test('扫码登录：轮询请求带上 key、App UA，且不带我们自己的 cookie', async () => {
  const { flow, state } = harness([
    generateOk,
    () => pollResponse(QR_STATUS.SUCCESS, ['SESSDATA=s; Path=/', 'bili_jct=j; Path=/']),
  ]);
  await flow.run();

  assert.match(state.urls[0] ?? '', /qrcode\/generate$/);
  assert.match(state.urls[1] ?? '', /qrcode\/poll\?qrcode_key=KEY123$/);
  assert.equal(state.options[1]?.userAgent, PASSPORT_USER_AGENT);
  assert.equal(state.options[1]?.skipCookie, true, 'passport 接口不该带 B 站 cookie');
});

test('扫码登录：二维码过期抛 expired', async () => {
  const { flow } = harness([generateOk, () => pollResponse(QR_STATUS.EXPIRED)]);
  await assert.rejects(
    () => flow.run(),
    (error: unknown) => {
      assert.equal(error instanceof QrLoginError, true);
      assert.equal((error as QrLoginError).kind, 'expired');
      return true;
    },
  );
});

test('扫码登录：等待超时也算过期', async () => {
  const { flow } = harness([generateOk, () => pollResponse(QR_STATUS.WAITING)], { maxWaitMs: 0 });
  await assert.rejects(
    () => flow.run(),
    (error: unknown) => (error as QrLoginError).kind === 'expired',
  );
});

test('扫码登录：取消可以在流程开始前或轮询中生效', async () => {
  const before = harness([generateOk]);
  before.flow.cancel();
  await assert.rejects(
    () => before.flow.run(),
    (error: unknown) => (error as QrLoginError).kind === 'cancelled',
  );
  assert.equal(before.state.calls, 0, '取消后不该再发请求');

  const during: Harness = harness([generateOk, () => pollResponse(QR_STATUS.WAITING)], {
    sleep: async () => {
      during.flow.cancel();
    },
  });
  await assert.rejects(
    () => during.flow.run(),
    (error: unknown) => (error as QrLoginError).kind === 'cancelled',
  );
});

test('扫码登录：外层 code 非 0 时失败', async () => {
  const { flow } = harness([() => jsonResponse({ code: -412, message: '请求被拦截' })]);
  await assert.rejects(
    () => flow.run(),
    (error: unknown) => {
      assert.equal((error as QrLoginError).kind, 'failed');
      assert.match((error as QrLoginError).message, /请求被拦截/);
      return true;
    },
  );
});

test('扫码登录：响应缺少 qrcode_key 时失败', async () => {
  const { flow } = harness([() => jsonResponse({ code: 0, data: { url: 'https://x' } })]);
  await assert.rejects(
    () => flow.run(),
    (error: unknown) => (error as QrLoginError).kind === 'failed',
  );
});

test('扫码登录：连续网络失败达上限后放弃', async () => {
  const { flow } = harness([
    generateOk,
    () => new Error('ECONNRESET'),
    () => new Error('ECONNRESET'),
    () => new Error('ECONNRESET'),
  ]);
  await assert.rejects(
    () => flow.run(),
    (error: unknown) => (error as QrLoginError).kind === 'failed',
  );
});

test('扫码登录：成功但没拿到 Set-Cookie 视为失败', async () => {
  const { flow } = harness([generateOk, () => pollResponse(QR_STATUS.SUCCESS)]);
  await assert.rejects(
    () => flow.run(),
    (error: unknown) => {
      assert.equal((error as QrLoginError).kind, 'failed');
      assert.match((error as QrLoginError).message, /Set-Cookie/);
      return true;
    },
  );
});

test('HTTP 非 200 时失败', async () => {
  const { flow } = harness([() => new Response('nope', { status: 500 })]);
  await assert.rejects(
    () => flow.run(),
    (error: unknown) => (error as QrLoginError).kind === 'failed',
  );
});

test('renderQrSvg / svgToDataUrl', async () => {
  const svg = await renderQrSvg('https://www.bilibili.com/h5/login?token=abc');
  assert.ok(svg.startsWith('<svg'));
  assert.match(svg, /viewBox=/);

  const dataUrl = svgToDataUrl(svg);
  assert.ok(dataUrl.startsWith('data:image/svg+xml;base64,'));
  const decoded = Buffer.from(dataUrl.split(',')[1] ?? '', 'base64').toString('utf8');
  assert.equal(decoded, svg);
});
