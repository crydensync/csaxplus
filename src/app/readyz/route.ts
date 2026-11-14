import { getConsoleStore } from "@/server/db";

export async function GET(): Promise<Response> {
  try {
    await getConsoleStore().driver.query("select 1 as ready");
    return Response.json({ status: "ready" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json(
      { status: "not_ready" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
