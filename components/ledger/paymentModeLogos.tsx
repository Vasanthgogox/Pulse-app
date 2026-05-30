/**
 * Brand payment marks — logo artwork only, no tile background fills.
 */
import { memo, type ReactNode } from "react";
import Svg, { Circle, G, Path, Rect, Text as SvgText, TSpan } from "react-native-svg";

export interface PaymentModeLogoProps {
  size?: number;
}

function LogoSvg({
  size,
  viewBox,
  children,
}: {
  size: number;
  viewBox: string;
  children: ReactNode;
}) {
  return (
    <Svg width={size} height={size} viewBox={viewBox}>
      {children}
    </Svg>
  );
}

/** NPCI UPI — tricolor arrows + wordmark (transparent). */
export const UpiLogo = memo(function UpiLogo({ size = 48 }: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 72 28">
      <Path
        d="M2 3.5 C8 3.5 11 6 14.5 8.5 L14.5 10.5 C11 8 8 5.5 2 5.5 Z"
        fill="#008C44"
      />
      <Path
        d="M2 12.5 C8 12.5 11 15 14.5 17.5 L14.5 19.5 C11 17 8 14.5 2 14.5 Z"
        fill="#F47920"
      />
      <Path
        d="M2 21.5 C8 21.5 11 24 14.5 26.5 L14.5 28.5 C11 26 8 23.5 2 23.5 Z"
        fill="#006838"
      />
      <SvgText
        x={22}
        y={19}
        fill="#231F20"
        fontSize={18}
        fontWeight="800"
        fontFamily="System"
      >
        UPI
      </SvgText>
    </LogoSvg>
  );
});

/** NHAI FASTag — wordmark + tricolor stripe (no outer tile). */
export const FastagLogo = memo(function FastagLogo({ size = 48 }: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 72 32">
      <SvgText
        x={36}
        y={16}
        fontSize={15}
        fontWeight="900"
        fontFamily="System"
        textAnchor="middle"
      >
        <TSpan fill="#0B3D91">FAST</TSpan>
        <TSpan fill="#E8A317">ag</TSpan>
      </SvgText>
      <Path d="M8 24 H64" stroke="#FF9933" strokeWidth={2.4} strokeLinecap="round" />
      <Path d="M8 27 H64" stroke="#231F20" strokeWidth={2.4} strokeLinecap="round" opacity={0.85} />
      <Path d="M8 30 H64" stroke="#138808" strokeWidth={2.4} strokeLinecap="round" />
    </LogoSvg>
  );
});

/** Cash — rupee note mark. */
export const CashLogo = memo(function CashLogo({ size = 48 }: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Rect x={8} y={10} width={32} height={28} rx={4} fill="#10b981" stroke="#059669" strokeWidth={1.5} />
      <Circle cx={24} cy={24} r={8.5} fill="none" stroke="#ecfdf5" strokeWidth={1.5} />
      <SvgText
        x={24}
        y={28}
        fill="#ffffff"
        fontSize={15}
        fontWeight="700"
        fontFamily="System"
        textAnchor="middle"
      >
        ₹
      </SvgText>
    </LogoSvg>
  );
});

/** Bank transfer — building + rupee badge. */
export const BankLogo = memo(function BankLogo({ size = 48 }: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <G fill="#1d4ed8">
        <Path d="M24 8 L40 17 L40 19 L8 19 L8 17 Z" />
        <Rect x={12} y={19} width={4} height={16} />
        <Rect x={22} y={19} width={4} height={16} />
        <Rect x={32} y={19} width={4} height={16} />
        <Rect x={8} y={35} width={32} height={3} rx={1} />
      </G>
      <Circle cx={38} cy={12} r={6} fill="#fbbf24" />
      <SvgText
        x={38}
        y={15}
        fill="#1d4ed8"
        fontSize={9}
        fontWeight="900"
        fontFamily="System"
        textAnchor="middle"
      >
        ₹
      </SvgText>
    </LogoSvg>
  );
});

/** Cheque leaf. */
export const ChequeLogo = memo(function ChequeLogo({ size = 48 }: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Rect x={6} y={10} width={36} height={28} rx={3} fill="#ffffff" stroke="#db2777" strokeWidth={2} />
      <Rect x={11} y={15} width={16} height={3.5} rx={1.5} fill="#fbcfe8" />
      <Rect x={11} y={22} width={26} height={2} rx={1} fill="#f9a8d4" />
      <Rect x={11} y={27} width={22} height={2} rx={1} fill="#f9a8d4" />
      <Rect x={11} y={32} width={18} height={2} rx={1} fill="#f9a8d4" />
      <Path
        d="M32 31 C34 29 36 29 38 31"
        stroke="#db2777"
        strokeWidth={1.8}
        fill="none"
        strokeLinecap="round"
      />
    </LogoSvg>
  );
});

/** Indian Oil–style fuel mark. */
export const FuelCardLogo = memo(function FuelCardLogo({ size = 48 }: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Circle cx={24} cy={22} r={16} fill="#00429A" />
      <Circle cx={24} cy={22} r={12} fill="none" stroke="#F37021" strokeWidth={3.2} />
      <Path d="M24 10 C19 17 19 22 24 30 C29 22 29 17 24 10 Z" fill="#F37021" />
      <Rect x={13} y={34} width={22} height={4} rx={2} fill="#00429A" />
    </LogoSvg>
  );
});

/** On-account credit mark. */
export const CreditLogo = memo(function CreditLogo({ size = 48 }: PaymentModeLogoProps) {
  return (
    <LogoSvg size={size} viewBox="0 0 48 48">
      <Circle cx={24} cy={22} r={13} fill="none" stroke="#475569" strokeWidth={2.2} />
      <Path
        d="M24 13 L24 22 L31 26"
        stroke="#475569"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <SvgText
        x={24}
        y={42}
        fill="#475569"
        fontSize={7.5}
        fontWeight="800"
        fontFamily="System"
        textAnchor="middle"
        letterSpacing={0.8}
      >
        CREDIT
      </SvgText>
    </LogoSvg>
  );
});

export const PaymentModeLogo = memo(function PaymentModeLogo({
  modeId,
  size = 48,
}: PaymentModeLogoProps & { modeId: string }) {
  switch (modeId.toUpperCase()) {
    case "UPI":
      return <UpiLogo size={size} />;
    case "FASTAG":
      return <FastagLogo size={size} />;
    case "CASH":
      return <CashLogo size={size} />;
    case "BANK":
      return <BankLogo size={size} />;
    case "CHEQUE":
      return <ChequeLogo size={size} />;
    case "FUEL_CARD":
      return <FuelCardLogo size={size} />;
    case "CREDIT":
      return <CreditLogo size={size} />;
    default:
      return <CashLogo size={size} />;
  }
});
