import type { PlatformRole } from './jwt-claims';

export interface Address {
  line1?:      string;
  line2?:      string;
  city?:       string;
  state?:      string;
  postalCode?: string;
  country?:    string;
}

export interface TenantDto {
  id:        string;
  name:      string;
  createdAt: string;
}

export interface OrganizationDto {
  id:        string;
  name:      string;
  legalName?: string;
  tenantId:  string;
  createdAt: string;
}

export interface BusinessUnitDto {
  id:             string;
  organizationId: string;
  name:           string;
  code:           string;
}

export interface WarehouseDto {
  id:             string;
  organizationId: string;
  businessUnitId?: string;
  name:           string;
  code:           string;
  address?:       Address;
}

export interface UserDto {
  id:    string;
  email: string;
  name?: string;
}

export interface MembershipDto {
  id:             string;
  userId:         string;
  organizationId: string;
  businessUnitId?: string;
  role:           PlatformRole;
  status:         'active' | 'suspended' | 'revoked';
  warehouseIds?:  string[];
}

export interface InvitationDto {
  id:             string;
  organizationId: string;
  email:          string;
  role:           PlatformRole;
  businessUnitId?: string;
  status:         'pending' | 'accepted' | 'expired' | 'revoked';
  expiresAt:      string;
}

export interface LoginRequest {
  email:    string;
  password: string;
  /** Optional — select membership when user has multiple */
  membershipId?: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn:   number;
  tokenType:   'Bearer';
  user:        CurrentUserDto;
}

export interface CurrentUserDto {
  id:             string;
  email:          string;
  name?:          string;
  role:           PlatformRole;
  schemaVersion:  string;
  tenantId:       string;
  organizationId: string;
  membershipId:   string;
  businessUnitId?: string;
  warehouseIds:  string[];
  organization?:  OrganizationDto;
  membership?:    MembershipDto;
  warehouses?:    WarehouseDto[];
}

export interface CreateOrganizationRequest {
  name:      string;
  legalName?: string;
}

export interface CreateBusinessUnitRequest {
  organizationId: string;
  name:           string;
  code:           string;
}

export interface CreateWarehouseRequest {
  organizationId: string;
  businessUnitId?: string;
  name:           string;
  code:           string;
  address?:       Address;
}

export interface InviteUserRequest {
  organizationId: string;
  email:          string;
  role:           PlatformRole;
  businessUnitId?: string;
}
