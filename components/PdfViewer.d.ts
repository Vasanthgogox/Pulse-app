declare module '@/components/PdfViewer' {
  import { FunctionComponent } from 'react';

  interface PdfViewerProps {
    pdfUri: string | null;
  }

  export const PdfViewer: FunctionComponent<PdfViewerProps>;
}