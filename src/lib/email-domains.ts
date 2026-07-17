const DEFAULT_ALLOWED_DOMAINS = [
  "creativastudios.us",
  "creativaconsultores.com",
  "creativatechstudios.com",
] as const;

export function parseAllowedEmailDomains(
  value?: string | null,
): string[] {
  if (!value?.trim()) {
    return [...DEFAULT_ALLOWED_DOMAINS];
  }

  return value
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailDomainAllowed(
  email: string,
  allowedDomains: readonly string[],
): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return false;
  }
  return allowedDomains.includes(domain);
}
