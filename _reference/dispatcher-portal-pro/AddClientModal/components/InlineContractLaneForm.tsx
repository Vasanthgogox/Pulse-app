/**
 * Inline Contract Lane Form Component
 * Wrapper for unified ContractLaneForm in inline mode
 * This file now just re-exports the unified form with inline context
 */

import ContractLaneForm from '@/components/contract-lanes/ContractLaneForm';
import { ContractLaneCreateData } from '@/types/contractLane';
import { ContractLane } from '@/types/contractLane';

interface InlineContractLaneFormProps {
  clientId: string;
  clientName: string;
  duplicateLaneData?: ContractLane | null;
  onSave: (data: ContractLaneCreateData) => Promise<void>;
  onCancel: () => void;
}

export const InlineContractLaneForm: React.FC<InlineContractLaneFormProps> = ({
  clientId,
  clientName,
  duplicateLaneData,
  onSave,
  onCancel,
}) => {
  return (
    <ContractLaneForm
      context="inline"
      isOpen={true}
      onCancel={onCancel}
      onSave={onSave}
      clientId={clientId}
      clientName={clientName}
      duplicateLaneData={duplicateLaneData}
    />
  );
};
