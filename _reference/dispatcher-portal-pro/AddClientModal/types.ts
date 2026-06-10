/**
 * Type definitions for AddClientPanel
 */

import { z } from 'zod';
import { ContractLaneCreateData } from '@/types/contractLane';

// Client Billing Contact schema
export const clientBillingContactSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().optional(),
});

export type ClientBillingContact = z.infer<typeof clientBillingContactSchema>;

export const formSchema = z.object({
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
  contactPerson: z.string().min(2, 'Contact person name is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  panNumber: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'PAN must be in format: ABCDE1234F').optional().or(z.literal('')),
  tanNumber: z.string().regex(/^[A-Z]{4}[0-9]{5}[A-Z]{1}$/, 'TAN must be in format: ABCD12345E').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  kamName: z.string().optional(),
  kamEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  kamPhone: z.string().optional(),
  billingContactPerson: z.string().optional(),
  billingContactPersonEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  billingContactPersonPhone: z.string().optional(),
  potentialVolume: z.string().optional(),
  clientBillingContacts: z.array(clientBillingContactSchema).min(1, 'At least one client billing contact is required'),
  projectedContractRevenue: z.string().optional(),
  paymentTerms: z.string().optional(),
  invoiceFrequency: z.enum(['Per Trip', 'Weekly', 'Bi-Weekly', 'Fortnightly', 'Monthly', 'Quarterly', 'Annually', '']).optional(),
  remarks: z.string().optional(),
});

export type FormData = z.infer<typeof formSchema>;

export interface AddClientPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newClientId?: string) => void;
  editClientId?: string | null;
}

export type TabName = 'company' | 'address' | 'kam' | 'financial' | 'lanes' | 'remarks';

export interface ContractLaneData extends Omit<ContractLaneCreateData, 'clientId' | 'clientName' | 'createdBy'> {}
