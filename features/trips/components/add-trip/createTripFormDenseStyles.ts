/**
 * Shared dense / mobile form styles for Create Trip and Create Load (indent).
 * Pair with `isDenseForm = Platform.OS !== "web" || width < 600`.
 */
import { StyleSheet } from "react-native";
import Theme from "@/constants/Theme";
import { ADD_TRIP_FORM } from "./addTripFormTokens";

export const createTripFormDenseStyles = StyleSheet.create({
  scrollContentDense: {
    paddingTop: 6,
  },
  cardDense: {
    paddingHorizontal: ADD_TRIP_FORM.cardPad,
    paddingVertical: ADD_TRIP_FORM.cardPad,
    borderRadius: 12,
    marginBottom: ADD_TRIP_FORM.cardGap,
  },
  cardHeadDense: {
    paddingBottom: 4,
    marginBottom: 6,
    gap: 5,
  },
  stepBadgeDense: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  cardTitleDense: {
    fontSize: 9,
    letterSpacing: 0.75,
  },
  gridRowDense: { gap: 6 },
  labelDense: {
    fontSize: ADD_TRIP_FORM.labelSize,
    marginBottom: ADD_TRIP_FORM.labelSpacing,
    letterSpacing: 0.45,
    lineHeight: ADD_TRIP_FORM.labelLine,
    textTransform: "uppercase",
  },
  inputDense: {
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    fontStyle: "normal",
    fontWeight: "400",
    minHeight: ADD_TRIP_FORM.fieldHeight,
    marginBottom: ADD_TRIP_FORM.fieldGap,
  },
  formFieldShellDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    marginBottom: ADD_TRIP_FORM.fieldGap,
    borderWidth: 1,
  },
  quickDateRowDense: {
    gap: 4,
    marginBottom: 4,
  },
  quickDateChipDense: {
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  quickDateChipTextDense: {
    fontSize: 10,
    fontStyle: "normal",
    letterSpacing: 0.2,
  },
  dateTouchableTextDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontStyle: "normal",
  },
  dateTouchablePlaceholderDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontStyle: "normal",
  },
  priceShellDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    gap: 8,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    borderWidth: 1,
    marginBottom: ADD_TRIP_FORM.fieldGap,
  },
  priceInputDense: {
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    fontWeight: "600",
    minHeight: 0,
  },
  clientCardDense: {
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
  },
  clientNameDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontWeight: "600",
    fontStyle: "normal",
  },
  infoCalloutDense: {
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    marginTop: 2,
    gap: 6,
  },
  infoCalloutTextDense: {
    fontSize: 11,
    lineHeight: 15,
  },
  supplierSectionDense: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheetLabelDense: {
    fontSize: ADD_TRIP_FORM.labelSize,
    marginBottom: ADD_TRIP_FORM.labelSpacing,
    letterSpacing: 0.45,
  },
  sheetInputDense: {
    minHeight: ADD_TRIP_FORM.fieldHeight,
    paddingVertical: ADD_TRIP_FORM.fieldPadV,
    paddingHorizontal: ADD_TRIP_FORM.fieldPadH,
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    lineHeight: ADD_TRIP_FORM.fieldLineHeight,
    borderRadius: ADD_TRIP_FORM.fieldRadius,
    fontStyle: "normal",
    fontWeight: "400",
  },
  dropdownTextDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontStyle: "normal",
  },
  dropdownPlaceholderDense: {
    fontSize: ADD_TRIP_FORM.fieldFontSize,
    fontStyle: "normal",
    color: Theme.placeholder,
  },
});
