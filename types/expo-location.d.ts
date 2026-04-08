declare module 'expo-location' {
  export interface LocationGeocodedAddress {
    name?: string | null;
    street?: string | null;
    city?: string | null;
    region?: string | null;
    subregion?: string | null;
    country?: string | null;
    isoCountryCode?: string | null;
    postalCode?: string | null;
    timezone?: string | null;
  }

  export enum Accuracy {
    Lowest = 1,
    Low = 2,
    Balanced = 3,
    High = 4,
    Highest = 5,
    BestForNavigation = 6,
  }

  export function reverseGeocodeAsync(options: {
    latitude: number;
    longitude: number;
  }): Promise<LocationGeocodedAddress[]>;

  export function requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  export function requestBackgroundPermissionsAsync(): Promise<unknown>;
  export function getBackgroundPermissionsAsync(): Promise<{ status: string }>;
  export function getForegroundPermissionsAsync(): Promise<{ status: string }>;
  export function getCurrentPositionAsync(options?: object): Promise<{
    coords: { latitude: number; longitude: number; accuracy?: number | null };
  }>;
}
