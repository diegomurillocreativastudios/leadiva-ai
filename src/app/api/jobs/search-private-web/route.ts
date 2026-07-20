import { NextResponse } from "next/server";
import { z } from "zod";

import { GROUNDED_HOME_QUERY_MAX_LENGTH } from "@/lib/home-search-source";
import { auth } from "@/server/auth";
import {
  PrivateWebSearchAdmissionError,
  searchPrivateWeb,
} from "@/server/integrations/private-web/service";

export const runtime = "nodejs";
export const maxDuration = 300;

export const privateWebSearchBodySchema = z
  .object({
    sourceType: z.literal("PRIVATE_WEB"),
    query: z.string().trim().min(3).max(GROUNDED_HOME_QUERY_MAX_LENGTH),
  })
  .strict();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json: unknown = await request.json().catch(() => null);
  const parsed = privateWebSearchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const result = await searchPrivateWeb({
      userId: session.user.id,
      query: parsed.data.query,
    });
    return NextResponse.json(result, {
      status:
        result.status === "FAILED"
          ? 502
          : result.status === "PARTIALLY_COMPLETED"
            ? 207
            : 200,
    });
  } catch (error) {
    if (error instanceof PrivateWebSearchAdmissionError) {
      return NextResponse.json(
        {
          error:
            error.code === "ACTIVE_SEARCH"
              ? "Ya existe una búsqueda privada en curso."
              : "Se alcanzó el límite de búsquedas privadas.",
        },
        {
          status: error.code === "ACTIVE_SEARCH" ? 409 : 429,
          headers: { "Retry-After": String(error.retryAfterSeconds) },
        },
      );
    }
    return NextResponse.json(
      { error: "No se pudo iniciar la búsqueda privada" },
      { status: 502 },
    );
  }
}
