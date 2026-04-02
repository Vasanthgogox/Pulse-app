declare module 'expo-print' {
  export function printAsync(options: { html: string }): Promise<void>;
  export function printToFileAsync(options: { html: string }): Promise<{ uri: string }>;
}
