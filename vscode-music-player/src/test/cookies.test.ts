import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  getCsrfToken,
  getUserId,
  isLoggedIn,
  mergeCookies,
  parseCookieHeader,
  parseSetCookieHeaders,
  parseSetCookieLine,
  readSetCookieHeaders,
  serializeCookie,
  splitMergedSetCookie,
} from '../bilibili/cookies';

test('splitMergedSetCookie 不会把 Expires 里的逗号当分隔符', () => {
  const merged =
    'SESSDATA=abc%2Cdef; Path=/; Expires=Wed, 01 Jan 2025 00:00:00 GMT; Secure, ' +
    'bili_jct=token123; Path=/; Expires=Wed, 01 Jan 2025 00:00:00 GMT, ' +
    'DedeUserID=42; Path=/';
  const parts = splitMergedSetCookie(merged);
  assert.equal(parts.length, 3);
  assert.equal(parseSetCookieLine(parts[0] ?? '')?.name, 'SESSDATA');
  assert.equal(parseSetCookieLine(parts[0] ?? '')?.value, 'abc%2Cdef', '值里的逗号不能被切开');
  assert.equal(parseSetCookieLine(parts[1] ?? '')?.value, 'token123');
  assert.equal(parseSetCookieLine(parts[2] ?? '')?.value, '42');
});

test('parseSetCookieLine / parseSetCookieHeaders', () => {
  assert.deepEqual(parseSetCookieLine('name=value; Path=/; HttpOnly'), {
    name: 'name',
    value: 'value',
  });
  assert.equal(parseSetCookieLine('novalue'), null);
  assert.equal(parseSetCookieLine('=value'), null);
  assert.equal(parseSetCookieLine(''), null);

  const jar = parseSetCookieHeaders([
    'SESSDATA=s1; Path=/',
    'bili_jct=j1; Path=/',
    'DedeUserID=88; Path=/',
    'bad-line',
  ]);
  assert.deepEqual(jar, { SESSDATA: 's1', bili_jct: 'j1', DedeUserID: '88' });
});

test('readSetCookieHeaders 优先用 getSetCookie()', () => {
  const fake = {
    getSetCookie: () => ['a=1; Path=/', 'b=2; Path=/'],
    get: () => 'never-used',
  } as unknown as Headers;
  assert.deepEqual(readSetCookieHeaders(fake), ['a=1; Path=/', 'b=2; Path=/']);
});

test('readSetCookieHeaders 在没有 getSetCookie 时退回合并串解析', () => {
  const fake = {
    get: (name: string) =>
      name.toLowerCase() === 'set-cookie'
        ? 'a=1; Expires=Wed, 01 Jan 2025 00:00:00 GMT, b=2; Path=/'
        : null,
  } as unknown as Headers;
  assert.deepEqual(readSetCookieHeaders(fake), [
    'a=1; Expires=Wed, 01 Jan 2025 00:00:00 GMT',
    'b=2; Path=/',
  ]);
});

test('readSetCookieHeaders 无头时返回空数组', () => {
  const fake = { get: () => null } as unknown as Headers;
  assert.deepEqual(readSetCookieHeaders(fake), []);
});

test('parseCookieHeader / serializeCookie 往返（含清理空值）', () => {
  const jar = parseCookieHeader('SESSDATA=a%2Cb; bili_jct=t1 ;  DedeUserID=7');
  assert.deepEqual(jar, { SESSDATA: 'a%2Cb', bili_jct: 't1', DedeUserID: '7' });
  assert.equal(serializeCookie(jar), 'SESSDATA=a%2Cb; bili_jct=t1; DedeUserID=7');
  assert.equal(serializeCookie(null), '');
  assert.equal(serializeCookie({ a: '1', empty: '' }), 'a=1; empty=');
});

test('serializeCookie 去掉换行，避免头注入', () => {
  assert.equal(serializeCookie({ a: 'x\r\ny' }), 'a=xy');
});

test('csrf / mid / 登录态判定', () => {
  assert.equal(getCsrfToken({ bili_jct: 'tok' }), 'tok');
  assert.equal(getCsrfToken({ bili_jct: '' }), null);
  assert.equal(getCsrfToken(null), null);
  assert.equal(getUserId({ DedeUserID: '123' }), 123);
  assert.equal(getUserId({ DedeUserID: 'abc' }), null);
  assert.equal(isLoggedIn({ bili_jct: 'tok', DedeUserID: '1' }), true);
  assert.equal(isLoggedIn({ bili_jct: 'tok' }), false);
  assert.equal(isLoggedIn(null), false);
});

test('mergeCookies 后者覆盖前者', () => {
  assert.deepEqual(mergeCookies({ a: '1', b: '2' }, null, { b: '3', c: '4' }), {
    a: '1',
    b: '3',
    c: '4',
  });
});
