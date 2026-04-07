export async function compressImage(fileOrBlob: Blob, maxWidth = 1200): Promise<Blob> {
  if (!fileOrBlob.type.startsWith('image/')) {
    return fileOrBlob;
  }
  
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(fileOrBlob);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxWidth) {
          if (width > height) {
            height = Math.round((height *= maxWidth / width));
            width = maxWidth;
          } else {
            width = Math.round((width *= maxWidth / height));
            height = maxWidth;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(fileOrBlob);
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        // Using lower quality (0.6) yields massive size reductions with decent OCR readability
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else resolve(fileOrBlob);
          },
          'image/jpeg',
          0.6 
        );
      };
      img.onerror = () => resolve(fileOrBlob);
    };
    reader.onerror = () => resolve(fileOrBlob);
  });
}
