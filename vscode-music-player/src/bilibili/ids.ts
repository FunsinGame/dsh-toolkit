/**
 * BV 号 ↔ AV 号互转。
 *
 * 算法与常量取自参考实现 BBPlayer 的 `lib/api/bilibili/utils.ts`（同一套官方
 * Base58 打乱表），这里补上了入参校验：错误输入应当立刻抛错，而不是静默产出
 * 一个看似合法的 NaN 号。
 */

const XOR_CODE = 23442827791579n;
const MASK_CODE = 2251799813685247n;
const MAX_AID = 2251799813685248n;
const BASE = 58n;
const MAGIC_STR = 'FcwAPNKTMug3GV5Lj7EJnHpWsx4tb8haYeviqBz6rkCy12mUSDQX9RdoZf';

const BVID_PATTERN = /^BV[0-9A-Za-z]{10}$/;

/** 判断字符串是否是合法 BV 号。 */
export function isBvid(value: string): boolean {
  return BVID_PATTERN.test(value);
}

/** BV 号 → AV 号。非法输入抛 `Error`。 */
export function bv2av(bvid: string): number {
  if (!isBvid(bvid)) {
    throw new Error(`不是合法的 BV 号：${bvid}`);
  }
  const chars = Array.from(bvid);
  [chars[3], chars[9]] = [chars[9], chars[3]];
  [chars[4], chars[7]] = [chars[7], chars[4]];
  chars.splice(0, 3);
  const tmp = chars.reduce((pre, char) => {
    const index = MAGIC_STR.indexOf(char);
    if (index < 0) throw new Error(`BV 号含非法字符：${char}`);
    return pre * BASE + BigInt(index);
  }, 0n);
  return Number((tmp & MASK_CODE) ^ XOR_CODE);
}

/** AV 号 → BV 号。非法输入抛 `Error`。 */
export function av2bv(avid: number | bigint): string {
  const value = BigInt(avid);
  if (value <= 0n || value > MASK_CODE) {
    throw new Error(`不是合法的 AV 号：${String(avid)}`);
  }
  let tempNum = (value | MAX_AID) ^ XOR_CODE;
  const result = Array.from('BV1000000000');
  for (let i = 11; i >= 3; i--) {
    result[i] = MAGIC_STR[Number(tempNum % BASE)];
    tempNum /= BASE;
  }
  [result[3], result[9]] = [result[9], result[3]];
  [result[4], result[7]] = [result[7], result[4]];
  return result.join('');
}
