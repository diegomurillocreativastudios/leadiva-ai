/**
 * Detects homepages and generic tender/procurement index paths that are not
 * a single-opportunity convocatoria page.
 *
 * Category, listing, search, tag, archive, and contractor-profile pages may be
 * useful for discovery, but must not become opportunities by themselves.
 */
const LISTING_LEAF =
  /\/(licitaciones?-publicas?|licitaciones?|procurement|compras|tenders?|rfps?|search|buscar|categor(?:y|ia)s?|tags?|tag|archivo|archive|perfil(?:-del)?-contratante|contractor-profile|contratante|proveedores?)$/i;

const LISTING_SECTION =
  /\/(licitaciones?-publicas?|licitaciones?|procurement|compras|tenders?|rfps?|search|buscar|categor(?:y|ia)s?|tags?|tag|archivo|archive|perfil(?:-del)?-contratante|contractor-profile)\//i;

const SPECIFIC_PROCESS_PATH =
  /\/(proceso|process|notice|expediente|detalle|detail|convocatoria|solicitud|rfp|rfq)[\w-]*/i;

export function isGenericOrListingSourceUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.replace(/\/+$/, "") || "/";
    if (pathname === "/") {
      return true;
    }
    if (LISTING_LEAF.test(pathname)) {
      return true;
    }
    if (LISTING_SECTION.test(pathname)) {
      if (SPECIFIC_PROCESS_PATH.test(pathname)) {
        return false;
      }
      const lastSegment = pathname.split("/").filter(Boolean).at(-1) ?? "";
      // Numeric or UUID-like process identifiers are treated as specific notices.
      if (/^\d{4,}$/.test(lastSegment) || /^[a-f0-9-]{20,}$/i.test(lastSegment)) {
        return false;
      }
      return true;
    }
    return false;
  } catch {
    return true;
  }
}

/** Buyer "perfil del contratante" / contractor profile hubs — not a single notice. */
export function isContractorProfileUrl(rawUrl: string): boolean {
  try {
    const pathname = new URL(rawUrl).pathname.toLowerCase();
    return /perfil(?:-del)?-contratante|contractor-profile|perfil[-_/]?contratante|contratante\/?$/.test(
      pathname,
    );
  } catch {
    return false;
  }
}
