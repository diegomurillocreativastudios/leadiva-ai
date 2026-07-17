import { isNull, type SQL } from "drizzle-orm";

import { opportunities, searchResults } from "@/server/db/schema";

export function searchResultNotDeleted(): SQL {
  return isNull(searchResults.deletedAt);
}

export function opportunityNotDeleted(): SQL {
  return isNull(opportunities.deletedAt);
}
