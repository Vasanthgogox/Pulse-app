declare module "expo-print" {
  export type PageMargins = {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };

  export type PrintToFileOptions = {
    html?: string;
    width?: number;
    height?: number;
    margins?: PageMargins;
    base64?: boolean;
    textZoom?: number;
  };

  export function printAsync(options: { html: string }): Promise<void>;
  export function printToFileAsync(
    options: PrintToFileOptions,
  ): Promise<{ uri: string; numberOfPages?: number; base64?: string }>;
}
