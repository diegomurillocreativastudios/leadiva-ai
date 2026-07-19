import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/server/auth";
import { searchComprasalAvailable } from "@/server/integrations/comprasal/available-service";
import { hasSignificantComprasalQuery } from "@/server/integrations/comprasal/available-search";

export const runtime = "nodejs";
export const maxDuration = 300;

export const comprasalAvailableSearchBodySchema = z
  .object({
    sourceType: z.literal("COMPRASAL"),
    query: z
      .string()
      .trim()
      .min(2)
      .max(300)
      .refine(hasSignificantComprasalQuery, "Query has no significant terms"),
  })
  .strict();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const json: unknown = await request.json().catch(() => null);
  const parsed = comprasalAvailableSearchBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    const result = await searchComprasalAvailable({
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
  } catch {
    return NextResponse.json(
      { error: "No se pudo completar la búsqueda en COMPRASAL" },
      { status: 502 },
    );
  }
}
