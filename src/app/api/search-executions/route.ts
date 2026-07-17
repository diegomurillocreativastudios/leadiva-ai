import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import { listUserSearchExecutions } from "@/server/services/search-execution.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedLimit = Number.parseInt(
    new URL(request.url).searchParams.get("limit") ?? "20",
    10,
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(20, Math.max(1, requestedLimit))
    : 20;
  const executions = await listUserSearchExecutions({
    userId: session.user.id,
    limit,
  });

  return NextResponse.json({ executions });
}
