import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";

import IconDoc from "@/assets/file type icons/doc.svg";
import IconExcel from "@/assets/file type icons/excel.svg";
import IconImage from "@/assets/file type icons/image.svg";
import IconMail from "@/assets/file type icons/mail.svg";
import IconPdf from "@/assets/file type icons/pdf.svg";
import IconText from "@/assets/file type icons/text.svg";
import IconVector from "@/assets/file type icons/vector.svg";
import IconXls from "@/assets/file type icons/xls.svg";
import IconZip from "@/assets/file type icons/zip.svg";

/** Metronic file-type icons for trips promo feature chips. */
export const TripsPromoIcons = {
  doc: IconDoc,
  excel: IconExcel,
  image: IconImage,
  mail: IconMail,
  pdf: IconPdf,
  text: IconText,
  vector: IconVector,
  xls: IconXls,
  zip: IconZip,
} as const satisfies Record<string, ComponentType<SvgProps>>;

export type TripsPromoIconId = keyof typeof TripsPromoIcons;
