import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "../src/server/db/schema/tables";

config({ path: ".env.local" });

const databaseUrl =
  process.env.DATABASE_URL?.trim() || process.env.NEON_DB_URL?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

function normalizeUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl.trim());
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    return url.toString();
  } catch {
    return rawUrl.trim().toLowerCase();
  }
}

const samples = [
  {
    title: "Desarrollo de plataforma CRM para banca",
    organizationName: "Banco Demo SV",
    sourceType: "PRIVATE_WEB",
    category: "SOFTWARE",
    sourceUrl: "https://example.com/rfp/crm-banca",
    snippet: "Solicitud de desarrollo de software CRM omnichannel.",
    workMode: "HYBRID",
    countryCode: "SV",
    city: "San Salvador",
  },
  {
    title: "Consultoría en inteligencia artificial para retail",
    organizationName: "Retail Centroamérica",
    sourceType: "LINKEDIN",
    category: "AI",
    sourceUrl: "https://www.linkedin.com/posts/demo-ai-consulting",
    snippet: "Buscamos firma de consultoría en AI aplicada a operaciones.",
    workMode: "REMOTE",
    countryCode: "SV",
    city: null,
  },
  {
    title: "Soporte de infraestructura cloud y redes",
    organizationName: "Grupo Industrial Alfa",
    sourceType: "PRIVATE_WEB",
    category: "IT",
    sourceUrl: "https://proveedores.example.com/it-support",
    snippet: "Servicios gestionados de infraestructura IT.",
    workMode: "ONSITE",
    countryCode: "SV",
    adminArea: "La Libertad",
    city: "Santa Tecla",
  },
] as const;

async function main() {
  const sql = neon(databaseUrl!);
  const db = drizzle(sql, { schema });

  for (const sample of samples) {
    await db
      .insert(schema.searchResults)
      .values({
        sourceType: sample.sourceType,
        title: sample.title,
        snippet: sample.snippet,
        sourceUrl: sample.sourceUrl,
        normalizedUrl: normalizeUrl(sample.sourceUrl),
        organizationName: sample.organizationName,
        category: sample.category,
        countryCode: sample.countryCode,
        adminArea: "adminArea" in sample ? sample.adminArea : null,
        city: sample.city,
        workMode: sample.workMode,
        verificationStatus: "PENDING",
        rawData: { seeded: true },
        discoveredAt: new Date(),
      })
      .onConflictDoNothing();
  }

  console.log("Demo projects seeded.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
