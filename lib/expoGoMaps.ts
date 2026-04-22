import Constants, { ExecutionEnvironment } from "expo-constants";

/** True when running inside Expo Go (custom native modules like MapLibre are unavailable). */
export function isExpoGo(): boolean {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
}
