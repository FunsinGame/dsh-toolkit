/**
 * Browser-side real JSX runtime, bundled only by the Playwright smoke test.
 * React itself stays external and is supplied by the test page's UMD build.
 */
import runtime from '../node_modules/react/cjs/react-jsx-runtime.development.js'

export const jsx = runtime.jsx
export const jsxs = runtime.jsxs
export const Fragment = runtime.Fragment
export default runtime
