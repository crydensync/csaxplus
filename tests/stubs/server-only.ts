// Vitest resolves `server-only` to this stub. The real package throws unless it
// is loaded under React's "react-server" condition, which a plain node test run
// does not set. Bundling the real guard is what matters in the app build; the
// test stub only has to not explode.
export {};
