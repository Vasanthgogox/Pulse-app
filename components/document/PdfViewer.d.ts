declare module '@/components/document/PdfViewer' {
  import { FunctionComponent } from 'react';

  interface PdfViewerProps {
    pdfUri: string | null;
  }

  export const PdfViewer: FunctionComponent<PdfViewerProps>;
}