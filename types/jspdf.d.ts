declare module "jspdf/dist/jspdf.es.min.js" {
  type JsPdfInstance = {
    internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
    addImage: (
      imageData: string,
      format: string,
      x: number,
      y: number,
      w: number,
      h: number,
    ) => void;
    save: (filename?: string) => void;
    text: (text: string, x: number, y: number) => void;
  };

  export const jsPDF: new (options?: {
    orientation?: "portrait" | "landscape";
    unit?: "px" | "pt" | "mm" | "cm" | "in";
    format?: string | [number, number];
  }) => JsPdfInstance;
}
