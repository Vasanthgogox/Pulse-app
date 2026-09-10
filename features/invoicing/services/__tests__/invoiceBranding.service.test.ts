import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getInvoiceBrandingSettings,
  invoiceBrandingCacheKey,
} from '../invoiceBranding.service';

const mockFrom = jest.fn();

jest.mock('@/lib/supabase', () => ({
  supabase: () => ({
    from: mockFrom,
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

const ORG_A = '5b471ecb-fbfb-470e-95cf-525d789c761a';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function emptyBrandingQuery() {
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        limit: jest.fn(async () => ({ data: [], error: null })),
      })),
    })),
  };
}

describe('invoice branding isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async () => null);
  });

  it('uses distinct AsyncStorage keys per workspace', () => {
    expect(invoiceBrandingCacheKey(ORG_A)).toBe(`@pulse/invoice-branding-v1:${ORG_A}`);
    expect(invoiceBrandingCacheKey(ORG_B)).toBe(`@pulse/invoice-branding-v1:${ORG_B}`);
    expect(invoiceBrandingCacheKey(ORG_A)).not.toBe(invoiceBrandingCacheKey(ORG_B));
  });

  it('scopes branding_settings to the active organization', async () => {
    const eq = jest.fn(() => ({
      limit: jest.fn(async () => ({ data: [], error: null })),
    }));
    mockFrom.mockReturnValue({
      select: jest.fn(() => ({ eq })),
    });

    const { settings } = await getInvoiceBrandingSettings(ORG_A);
    expect(mockFrom).toHaveBeenCalledWith('branding_settings');
    expect(eq).toHaveBeenCalledWith('org_id', ORG_A);
    expect(eq).not.toHaveBeenCalledWith('org_id', ORG_B);
    expect(settings.companyName).toBeNull();
  });

  it('empty branding_settings does not produce GOGOX', async () => {
    mockFrom.mockReturnValue(emptyBrandingQuery());
    const { settings } = await getInvoiceBrandingSettings(ORG_A);
    expect(settings.companyName).toBeNull();
    expect(settings.companyName).not.toBe('GOGOX');
  });

  it('does not return Organization B branding for Organization A', async () => {
    const eq = jest.fn((col: string, value: string) => {
      expect(col).toBe('org_id');
      expect(value).toBe(ORG_A);
      return {
        limit: jest.fn(async () => ({
          data: [{ company_name: 'GOGOVAN INDIA PVT LTD', logo_url: null }],
          error: null,
        })),
      };
    });
    mockFrom.mockReturnValue({
      select: jest.fn(() => ({ eq })),
    });

    const { settings } = await getInvoiceBrandingSettings(ORG_A);
    expect(settings.companyName).toBe('GOGOVAN INDIA PVT LTD');
    expect(settings.companyName).not.toBe('Other Logistics Pvt Ltd');
  });

  it('does not read another workspace AsyncStorage cache', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === invoiceBrandingCacheKey(ORG_B)) {
        return JSON.stringify({
          companyName: 'Other Logistics Pvt Ltd',
          logoUrl: 'https://org-b.example/logo.png',
        });
      }
      return null;
    });
    mockFrom.mockReturnValue({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          limit: jest.fn(async () => ({
            data: null,
            error: { code: '42P01', message: 'relation branding_settings does not exist' },
          })),
        })),
      })),
    });

    const { settings } = await getInvoiceBrandingSettings(ORG_A);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(invoiceBrandingCacheKey(ORG_A));
    expect(AsyncStorage.getItem).not.toHaveBeenCalledWith(invoiceBrandingCacheKey(ORG_B));
    expect(settings.companyName).toBeNull();
    expect(settings.logoUrl).toBeNull();
  });
});
