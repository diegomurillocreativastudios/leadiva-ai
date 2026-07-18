/** Resolves the sector label shown on home search result cards. */
export function homeSearchResultSector(candidate: {
  reasonCode: string | null;
  category: string | null;
}): "Público" | "Privado" {
  if (candidate.reasonCode === "PUBLIC_SECTOR") {
    return "Público";
  }

  const category = candidate.category?.trim().toUpperCase();
  if (category === "PUBLIC") {
    return "Público";
  }
  if (category === "PRIVATE") {
    return "Privado";
  }

  return "Privado";
}
