/**
 * Boot-time check. Next calls `register` once when the server starts, before
 * any request is served, so a misconfigured deployment stops here with a
 * readable list of what is wrong instead of failing later on whichever screen
 * happens to touch the setting first.
 */
export async function register(): Promise<void> {
  // Only the Node.js server reads configuration and opens the console store;
  // the edge runtime has neither, and this guard keeps the filesystem-using
  // modules out of the edge bundle.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // `next build` collects pages but serves nobody, and a build machine is not
  // required to hold the deployment's secrets or reach its database. The check
  // belongs at serve time.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startConsole } = await import("./instrumentation-node");
  await startConsole();
}
