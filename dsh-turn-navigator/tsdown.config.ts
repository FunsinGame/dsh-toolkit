import { clientBundle } from './shared/tsdown.client.ts'

export default clientBundle(
  '@deepseek-ai/dsh-turn-navigator',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
