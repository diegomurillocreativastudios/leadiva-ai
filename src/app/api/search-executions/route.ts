import { NextResponse } from "next/server";

import { auth } from "@/server/auth";
import {
  listUserSearchExecutions,
  MAX_USER_SEARCH_HISTORY_LIMIT,
} from "@/server/services/search-execution.service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const requestedLimit = Number.parseInt(
    new URL(request.url).searchParams.get("limit") ??
      String(MAX_USER_SEARCH_HISTORY_LIMIT),
    10,
  );
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(MAX_USER_SEARCH_HISTORY_LIMIT, Math.max(1, requestedLimit))
    : MAX_USER_SEARCH_HISTORY_LIMIT;
  const executions = await listUserSearchExecutions({
    userId: session.user.id,
    limit,
  });

  return NextResponse.json({ executions });
}
