import { NextResponse } from "next/server";

import { getServerEnv } from "@/env/server";
import { auth } from "@/server/auth";
import { syncComprasal } from "@/server/integrations/comprasal/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const env = getServerEnv();
  const session = await auth();
  const jobSecret = request.headers.get("x-job-secret");

  const authorizedBySecret =
    Boolean(env.JOB_SYNC_SECRET) && jobSecret === env.JOB_SYNC_SECRET;
  const authorizedBySession =
    Boolean(session?.user) &&
    (session?.user.role === "ADMIN" || session?.user.role === "USER");

  if (!authorizedBySecret && !authorizedBySession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncComprasal({
      userId: session?.user?.id,
      interestCategories: session?.user?.interestCategories,
    });

    if (result.status === "FAILED") {
      return NextResponse.json(result, { status: 502 });
    }

    return NextResponse.json(result, {
      status: result.status === "PARTIALLY_COMPLETED" ? 207 : 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed";

    if (message === "COMPRASAL_SYNC_ALREADY_RUNNING") {
      return NextResponse.json(
        { error: "Ya hay una sincronización COMPRASAL en curso" },
        { status: 409 },
      );
    }

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
