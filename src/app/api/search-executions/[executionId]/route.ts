import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/server/auth";
import { getUserSearchExecutionDetail } from "@/server/services/search-execution.service";

export const runtime = "nodejs";

const executionIdSchema = z.uuid();

export async function GET(
  _request: Request,
  context: { params: Promise<{ executionId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { executionId: rawExecutionId } = await context.params;
  const parsed = executionIdSchema.safeParse(rawExecutionId);
  if (!parsed.success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const detail = await getUserSearchExecutionDetail({
    executionId: parsed.data,
    userId: session.user.id,
  });
  if (!detail) {
    // Do not reveal whether an execution exists for another user.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
