/**
 * Utility functions for AddClientPanel
 */

import { FormData, ClientBillingContact } from './types';
import { Client } from '@/services/FleetOwner/Clients/types';
import { sanitizeString } from '@/utils/tripValidation';

/**
 * Get final payment terms with default fallback
 */
export const getFinalPaymentTerms = (paymentTerms: string): string => {
  if (paymentTerms === 'Instant Payment') return 'Instant Payment';
  return paymentTerms || '30 Days';
};

/**
 * Get fields for each tab for validation
 */
export const getTabFields = (tab: string): (keyof FormData)[] => {
  switch (tab) {
    case 'company':
      return ['companyName', 'contactPerson', 'phone', 'email'];
    case 'address':
      return ['address', 'city', 'state', 'pincode'];
    case 'kam':
      return ['kamName', 'kamEmail', 'kamPhone', 'billingContactPerson', 'billingContactPersonEmail', 'billingContactPersonPhone'];
    case 'financial':
      return ['potentialVolume', 'projectedContractRevenue', 'paymentTerms', 'invoiceFrequency', 'clientBillingContacts'];
    case 'lanes':
      return [];
    case 'remarks':
      return [];
    default:
      return [];
  }
};

/**
 * Convert form data to client update data
 * Preserves empty strings for optional fields (service will handle defaults)
 */
export const formDataToClientUpdate = (data: FormData): Partial<Client> => {
  const finalPaymentTerms = getFinalPaymentTerms(data.paymentTerms || '');
  
  // Helper to preserve empty strings for optional fields
  const sanitizeOptional = (value: string | undefined): string => {
    if (!value) return '';
    return sanitizeString(value);
  };
  
  return {
    name: sanitizeString(data.companyName),
    contact: sanitizeString(data.contactPerson),
    phone: sanitizeString(data.phone),
    email: sanitizeOptional(data.email),
    address: sanitizeOptional(data.address),
    city: sanitizeOptional(data.city),
    state: sanitizeOptional(data.state),
    pincode: sanitizeOptional(data.pincode),
    kamName: sanitizeOptional(data.kamName),
    kamEmail: sanitizeOptional(data.kamEmail),
    kamPhone: sanitizeOptional(data.kamPhone),
    billingContactPerson: sanitizeOptional(data.billingContactPerson),
    billingContactPersonEmail: sanitizeOptional(data.billingContactPersonEmail),
    billingContactPersonPhone: sanitizeOptional(data.billingContactPersonPhone),
    clientBillingContacts: data.clientBillingContacts?.map((contact: ClientBillingContact) => ({
      name: sanitizeString(contact.name),
      email: sanitizeOptional(contact.email),
      phone: sanitizeOptional(contact.phone),
    })) || [],
    creditLimit: parseFloat(data.potentialVolume || '0') || 0,
    potentialVolume: parseFloat(data.potentialVolume || '0') || 0,
    projectedContractRevenue: parseFloat(data.projectedContractRevenue || '0') || 0,
    paymentTerms: finalPaymentTerms,
    invoiceFrequency: data.invoiceFrequency || undefined,
    remarks: sanitizeOptional(data.remarks),
    updatedAt: new Date(),
  } as any;
};

/**
 * Convert form data to new client data
 */
export const formDataToNewClient = (data: FormData, userId: string, fleetOwnerId: string): any => {
  const finalPaymentTerms = getFinalPaymentTerms(data.paymentTerms || '');
  
  return {
    name: sanitizeString(data.companyName),
    contact: sanitizeString(data.contactPerson),
    phone: sanitizeString(data.phone),
    email: sanitizeString(data.email || ''),
    address: sanitizeString(data.address || ''),
    city: sanitizeString(data.city),
    state: sanitizeString(data.state),
    pincode: sanitizeString(data.pincode),
    kamName: sanitizeString(data.kamName || ''),
    kamEmail: sanitizeString(data.kamEmail || ''),
    kamPhone: sanitizeString(data.kamPhone || ''),
    billingContactPerson: sanitizeString(data.billingContactPerson || ''),
    billingContactPersonEmail: sanitizeString(data.billingContactPersonEmail || ''),
    billingContactPersonPhone: sanitizeString(data.billingContactPersonPhone || ''),
    clientBillingContacts: data.clientBillingContacts?.map((contact: ClientBillingContact) => ({
      name: sanitizeString(contact.name),
      email: sanitizeString(contact.email || ''),
      phone: sanitizeString(contact.phone || ''),
    })) || [],
    creditLimit: parseFloat(data.potentialVolume || '0'),
    potentialVolume: parseFloat(data.potentialVolume || '0'),
    projectedContractRevenue: parseFloat(data.projectedContractRevenue || '0'),
    paymentTerms: finalPaymentTerms,
    invoiceFrequency: data.invoiceFrequency || undefined,
    remarks: sanitizeString(data.remarks),
    status: 'active',
    dispatcherId: userId,
    fleetOwnerId: fleetOwnerId,
    totalIndents: 0,
    activeIndents: 0,
    totalSpent: 0,
    pendingAmount: 0,
  };
};

/**
 * Convert client data to form data
 * Handles edge cases like "Not provided" strings and empty values
 */
export const clientToFormData = (client: Client): Partial<FormData> => {
  // Helper to normalize "Not provided" strings to empty strings
  const normalizeValue = (value: string | undefined | null): string => {
    if (!value || value === 'Not provided' || value.trim() === 'Not provided') {
      return '';
    }
    return value.trim();
  };

  // Helper to safely convert numbers to strings
  const numberToString = (value: number | undefined | null): string => {
    if (value === undefined || value === null || isNaN(value)) {
      return '';
    }
    return value.toString();
  };
  
  return {
    companyName: normalizeValue(client.name),
    contactPerson: normalizeValue(client.contact),
    phone: normalizeValue(client.phone),
    email: normalizeValue(client.email),
    address: normalizeValue(client.address),
    city: normalizeValue((client as any).city),
    state: normalizeValue((client as any).state),
    pincode: normalizeValue((client as any).pincode),
    kamName: normalizeValue((client as any).kamName),
    kamEmail: normalizeValue((client as any).kamEmail),
    kamPhone: normalizeValue((client as any).kamPhone),
    billingContactPerson: normalizeValue((client as any).billingContactPerson),
    billingContactPersonEmail: normalizeValue((client as any).billingContactPersonEmail),
    billingContactPersonPhone: normalizeValue((client as any).billingContactPersonPhone),
    clientBillingContacts: (() => {
      // Check if new array format exists
      if (Array.isArray((client as any).clientBillingContacts) && (client as any).clientBillingContacts.length > 0) {
        return (client as any).clientBillingContacts.map((contact: any) => ({
          name: normalizeValue(contact.name),
          email: normalizeValue(contact.email),
          phone: normalizeValue(contact.phone),
        }));
      }
      // Fallback to old format for backward compatibility
      const oldName = normalizeValue((client as any).clientBillingContact);
      if (oldName) {
        return [{
          name: oldName,
          email: normalizeValue((client as any).clientBillingContactEmail),
          phone: normalizeValue((client as any).clientBillingContactPhone),
        }];
      }
      // Return at least one empty contact if nothing exists
      return [{ name: '', email: '', phone: '' }];
    })(),
    potentialVolume: numberToString((client as any).potentialVolume) || numberToString((client as any).creditLimit),
    projectedContractRevenue: numberToString((client as any).projectedContractRevenue) || numberToString((client as any).winLanedVolumePotential),
    paymentTerms: normalizeValue(client.paymentTerms) || '30 Days',
    invoiceFrequency: normalizeValue((client as any).invoiceFrequency),
    remarks: normalizeValue((client as any).remarks),
  };
};
