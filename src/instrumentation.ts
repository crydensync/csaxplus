/**
 * Boot-time configuration check. Next calls `register` once when the server
 * starts, before any request is served, so a misconfigured deployment stops here
 * with a readable list of what is wrong instead of failing later on whichever
 * screen happens to touch the setting first.
 */
export async function register(): Promise<void> {
  // Only the Node.js server reads configuration; the edge runtime has none, and
  // this guard keeps the filesystem-using loader out of the edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // `next build` collects pages but serves nobody, and a build machine is not
  // required to hold the deployment's secrets. The check belongs at serve time.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkConfiguration } = await import("./instrumentation-node");
  checkConfiguration();
}
