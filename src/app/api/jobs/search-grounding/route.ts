import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerEnv } from "@/env/server";
import { auth } from "@/server/auth";
import { mapPrivateSearchError } from "@/server/integrations/vertex-ai/response";
import { runGroundedSearch } from "@/server/integrations/vertex-ai/service";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z
  .object({
    sourceType: z.enum(["PRIVATE_WEB", "LINKEDIN"]).default("PRIVATE_WEB"),
    query: z.string().trim().min(3).max(300).optional(),
  })
  .strict();

export async function POST(request: Request) {
  const env = getServerEnv();
  const session = await auth();
  const jobSecret = request.headers.get("x-job-secret");

  const authorizedBySecret =
    Boolean(env.JOB_SYNC_SECRET) && jobSecret === env.JOB_SYNC_SECRET;
  const authorizedBySession =
    Boolean(session?.user) &&
    (session?.user.role === "ADMIN" ||
      session?.user.role === "COMMERCIAL_ANALYST");

  if (!authorizedBySecret && !authorizedBySession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json: unknown = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const result = await runGroundedSearch({
      sourceType: parsed.data.sourceType,
      query: parsed.data.query,
      userId: session?.user?.id,
      interestCategories: session?.user?.interestCategories,
    });

    return NextResponse.json(result, {
      status: result.status === "FAILED" ? 502 : 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    const friendly = mapPrivateSearchError(message);

    if (message === "PRIVATE_SEARCH_ALREADY_RUNNING") {
      return NextResponse.json({ error: friendly }, { status: 409 });
    }

    if (
      message === "AI_RATE_LIMITED" ||
      /RESOURCE_EXHAUSTED|\b429\b/i.test(message)
    ) {
      return NextResponse.json({ error: friendly }, { status: 429 });
    }

    return NextResponse.json({ error: friendly }, { status: 502 });
  }
}
