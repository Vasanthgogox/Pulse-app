/**
 * Metronic help card illustrations (assets/illustrations).
 */
import Illustration2 from "@/assets/illustrations/2.svg";
import Illustration31 from "@/assets/illustrations/31.svg";

type Props = {
  width?: number;
  height?: number;
};

const QUESTIONS_ASPECT = 600 / 437;
const SUPPORT_ASPECT = 528 / 600;

function fitIllustration(boxW: number, boxH: number, assetAspect: number) {
  let w = boxW;
  let h = w / assetAspect;
  if (h > boxH) {
    h = boxH;
    w = h * assetAspect;
  }
  return { width: w, height: h };
}

/** Help Center — thoughtful figure (illustration 2). */
export function NetworkHelpQuestionsIllustration({
  width = 128,
  height = 104,
}: Props) {
  const size = fitIllustration(width, height, QUESTIONS_ASPECT);
  return <Illustration2 width={size.width} height={size.height} />;
}

/** Contact Support — agent at desk (illustration 31). */
export function NetworkHelpSupportIllustration({
  width = 128,
  height = 104,
}: Props) {
  const size = fitIllustration(width, height, SUPPORT_ASPECT);
  return <Illustration31 width={size.width} height={size.height} />;
}
