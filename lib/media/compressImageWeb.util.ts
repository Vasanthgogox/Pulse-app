/**
 * Canvas-based JPEG resize/compress for web (blob/data/file URIs).
 * Used by trip expense + odometer photo pipelines when ImageManipulator is unreliable.
 */
export async function compressUriToJpegBase64Web(
  uri: string,
  maxDimension: number,
  quality: number,
): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("Web image compression requires a browser environment.");
  }

  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error("Could not read photo.");
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    return await new Promise<string>((resolve, reject) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read photo."));
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          const max = Math.max(1, maxDimension);

          if (width > max || height > max) {
            if (width >= height) {
              height = Math.max(1, Math.round((height * max) / width));
              width = max;
            } else {
              width = Math.max(1, Math.round((width * max) / height));
              height = max;
            }
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            reject(new Error("Could not read photo."));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const comma = dataUrl.indexOf(",");
          if (comma === -1) {
            reject(new Error("Could not read photo for OCR."));
            return;
          }
          resolve(dataUrl.slice(comma + 1));
        } catch (error) {
          reject(error instanceof Error ? error : new Error("Could not read photo."));
        }
      };
      img.src = objectUrl;
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
