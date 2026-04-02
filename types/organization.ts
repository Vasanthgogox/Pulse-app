/** Current org shape for list/detail screens. Aligned with Q-unified-base. */
export interface CurrentOrganization {
  id: string;
  name: string;
  operatingModel?: 'ASSET_BASED' | 'NON_ASSET' | 'HYBRID';
  sourcingStrategy?: string;
  marketplaceEnabled?: boolean;
  capabilities?: {
    canPostIndent: boolean;
    canBid: boolean;
    canManageAssets: boolean;
    canUseMarketplace: boolean;
  };
}
