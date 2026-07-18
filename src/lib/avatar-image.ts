const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AvatarMimeType = (typeof ALLOWED_MIME_TYPES)[number];

/** Max stored avatar payload (decoded bytes). */
export const AVATAR_MAX_BYTES = 350_000;

/** Max raw file size accepted before client compression. */
export const AVATAR_MAX_SOURCE_BYTES = 8_000_000;

const DATA_URL_PATTERN =
  /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

function startsWithBytes(bytes: Uint8Array, signature: readonly number[]) {
  if (bytes.length < signature.length) {
    return false;
  }
  return signature.every((value, index) => bytes[index] === value);
}

export function isAllowedAvatarMimeType(
  mimeType: string,
): mimeType is AvatarMimeType {
  return (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export function detectImageMimeFromBytes(
  bytes: Uint8Array,
): AvatarMimeType | null {
  if (startsWithBytes(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (
    startsWithBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return "image/png";
  }
  if (
    startsWithBytes(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes.length >= 12 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export type AvatarValidationResult =
  | { ok: true; dataUrl: string; mimeType: AvatarMimeType; byteLength: number }
  | { ok: false; error: string };

export function validateAvatarDataUrl(raw: string): AvatarValidationResult {
  const trimmed = raw.trim();
  const match = DATA_URL_PATTERN.exec(trimmed);
  if (!match) {
    return {
      ok: false,
      error: "Formato de imagen no válido. Usa JPG, PNG o WebP.",
    };
  }

  const declaredMime = match[1] as AvatarMimeType;
  const base64 = match[2];

  let bytes: Uint8Array;
  try {
    const binary = atob(base64);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return { ok: false, error: "No se pudo leer la imagen." };
  }

  if (bytes.byteLength === 0) {
    return { ok: false, error: "La imagen está vacía." };
  }

  if (bytes.byteLength > AVATAR_MAX_BYTES) {
    return {
      ok: false,
      error: "La imagen es demasiado grande. Prueba con otra más ligera.",
    };
  }

  const detectedMime = detectImageMimeFromBytes(bytes);
  if (!detectedMime) {
    return {
      ok: false,
      error: "El archivo no parece una imagen JPG, PNG o WebP.",
    };
  }

  if (detectedMime !== declaredMime) {
    return {
      ok: false,
      error: "El tipo de imagen no coincide con el contenido del archivo.",
    };
  }

  return {
    ok: true,
    dataUrl: `data:${declaredMime};base64,${base64}`,
    mimeType: declaredMime,
    byteLength: bytes.byteLength,
  };
}
