import {
  AVATAR_MAX_SOURCE_BYTES,
  isAllowedAvatarMimeType,
} from "@/lib/avatar-image";

const MAX_DIMENSION = 512;
const OUTPUT_QUALITY = 0.82;

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo leer la imagen seleccionada."));
    };
    image.src = objectUrl;
  });
}

function canvasToJpegDataUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("No se pudo comprimir la imagen."));
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== "string") {
            reject(new Error("No se pudo comprimir la imagen."));
            return;
          }
          resolve(reader.result);
        };
        reader.onerror = () => {
          reject(new Error("No se pudo comprimir la imagen."));
        };
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      OUTPUT_QUALITY,
    );
  });
}

/** Resize and compress a profile photo for storage as a data URL. */
export async function compressProfileImage(file: File): Promise<string> {
  if (!isAllowedAvatarMimeType(file.type)) {
    throw new Error("Usa una imagen JPG, PNG o WebP.");
  }

  if (file.size > AVATAR_MAX_SOURCE_BYTES) {
    throw new Error("La imagen supera el tamaño máximo permitido (8 MB).");
  }

  const image = await loadImageElement(file);
  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  const scale =
    longestSide > MAX_DIMENSION ? MAX_DIMENSION / longestSide : 1;
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("No se pudo preparar la imagen.");
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvasToJpegDataUrl(canvas);
}
