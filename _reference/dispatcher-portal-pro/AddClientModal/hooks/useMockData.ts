/**
 * Custom hook for mock data functionality
 */

import { UseFormReset } from 'react-hook-form';
import { FormData } from '../types';
import { ContractLaneData } from '../types';
import { getRandomMockClient, getRandomMockLane } from '@/mock/mockData';
import { ContractLaneCreateData } from '@/types/contractLane';
import { toast } from 'sonner';

export const useMockData = (
  isEditMode: boolean,
  reset: UseFormReset<FormData>,
  setContractLanes: (lanes: ContractLaneData[]) => void
) => {
  const fillWithMockData = () => {
    if (isEditMode) {
      toast.info('Mock data is only available when adding new clients');
      return;
    }

    const mockData = getRandomMockClient();
    const mockLane = getRandomMockLane();
    
    // Fill client form
    reset({
      companyName: mockData.companyName,
      contactPerson: mockData.contactPerson,
      phone: mockData.phone,
      email: mockData.email || '',
      address: mockData.address || '',
      city: mockData.city || '',
      state: mockData.state || '',
      pincode: mockData.pincode || '',
      kamName: mockData.kamName || '',
      kamEmail: mockData.kamEmail || '',
      kamPhone: mockData.kamPhone || '',
      billingContactPerson: mockData.billingContactPerson || '',
      billingContactPersonEmail: mockData.billingContactPersonEmail || '',
      billingContactPersonPhone: mockData.billingContactPersonPhone || '',
      potentialVolume: mockData.creditLimit || '',
      clientBillingContacts: [{ name: 'John Doe', email: 'billing@client.com', phone: '+91 98765 43210' }],
      projectedContractRevenue: '',
      paymentTerms: mockData.paymentTerms || '30 Days',
      invoiceFrequency: mockData.invoiceFrequency || '',
      remarks: mockData.remarks || '',
    });
    
    // Fill lanes with complete warehouse data
    if (mockLane.fromLocation && mockLane.toLocation && mockLane.vehicleType) {
      const laneData: Omit<ContractLaneCreateData, 'clientId' | 'clientName' | 'createdBy'> & {
        warehouseAddress?: string;
        warehouseCity?: string;
        warehouseState?: string;
        warehousePincode?: string;
        destinationWarehouseName?: string;
        destinationAddress?: string;
        destinationGstNumber?: string;
        contractStartDate?: string;
        contractEndDate?: string;
      } = {
        warehouseId: mockLane.warehouseId || 'temp',
        warehouseName: mockLane.warehouseName || mockLane.fromLocation || 'Default Warehouse',
        warehouseCode: mockLane.warehouseCode,
        warehouseZone: mockLane.warehouseZone,
        warehouseAddress: mockLane.warehouseAddress,
        warehouseCity: mockLane.warehouseCity || mockLane.fromLocation,
        warehouseState: mockLane.warehouseState,
        warehousePincode: mockLane.warehousePincode,
        fromLocation: mockLane.fromLocation,
        toLocation: mockLane.toLocation,
        destinationWarehouseName: mockLane.destinationWarehouseName,
        destinationAddress: mockLane.destinationAddress,
        destinationGstNumber: mockLane.destinationGstNumber,
        vehicleType: mockLane.vehicleType,
        rate: mockLane.rate || 0,
        loadType: mockLane.loadType,
        distance: mockLane.distance,
        loadCapacity: mockLane.loadCapacity,
        pricingDetails: mockLane.pricingDetails,
        additionalCharges: mockLane.additionalCharges,
        serviceLevelAgreement: mockLane.serviceLevelAgreement,
        contractStartDate: mockLane.contractStartDate,
        contractEndDate: mockLane.contractEndDate,
        notes: mockLane.notes,
      };
      
      setContractLanes([laneData as any]);
    }
    
    toast.success('Form filled with mock data', {
      description: 'You can now review and submit the form',
    });
  };

  return { fillWithMockData };
};
