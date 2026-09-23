/**
 * Registers the development TypeScript resolver. Import this before your entry
 * point:  node --import ./tools/register.mjs --experimental-strip-types src/cli.ts
 */
import { register } from 'node:module';

register('./ts-resolve.mjs', import.meta.url);
