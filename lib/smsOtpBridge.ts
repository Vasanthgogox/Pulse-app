/**
 * Bridge to native SmsOtpModule (Android only).
 * Use for reading last parsed SMS OTP and subscribing to new OTP events.
 */
import { NativeEventEmitter, NativeModules, Platform } from "react-native";

const EVENT_OTP_PARSED = "onSmsOtpParsed";

export type ParsedOtp = {
  code: string;
  sender: string;
  body: string;
  time: number;
};

const SmsOtpModule = Platform.OS === "android" ? NativeModules.SmsOtpModule : null;

export function isSmsOtpSupported(): boolean {
  return SmsOtpModule != null;
}

/** Get the last OTP parsed by the native receiver/observer (Android only). */
export function getLastParsedOtp(): Promise<ParsedOtp | null> {
  if (!SmsOtpModule) return Promise.resolve(null);
  return SmsOtpModule.getLastParsedOtp().then((m: ParsedOtp | null) => m ?? null);
}

/** Subscribe to new OTP parsed events (Android only). Returns unsubscribe. */
export function subscribeToSmsOtpParsed(callback: (otp: ParsedOtp) => void): () => void {
  if (!SmsOtpModule) return () => {};
  const emitter = new NativeEventEmitter(SmsOtpModule);
  const sub = emitter.addListener(EVENT_OTP_PARSED, (payload: ParsedOtp) => {
    callback(payload);
  });
  return () => sub.remove();
}
