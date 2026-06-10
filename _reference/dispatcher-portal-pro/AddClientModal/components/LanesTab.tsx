/**
 * Lanes Tab Component
 * Expanded version with full inline ContractLaneForm
 */

import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, MapPin, Truck, Route } from 'lucide-react';
import { ContractLaneData } from '../types';
import { ContractLaneCreateData } from '@/types/contractLane';
import { toast } from 'sonner';
import { InlineContractLaneForm } from './InlineContractLaneForm';

interface LanesTabProps {
  stepNumber: number;
  totalSteps: number;
  lanes: ContractLaneData[];
  onLanesChange: (lanes: ContractLaneData[]) => void;
  clientName: string;
  clientId?: string;
}

export const LanesTab: React.FC<LanesTabProps> = ({ 
  stepNumber, 
  totalSteps, 
  lanes, 
  onLanesChange,
  clientName,
  clientId
}) => {
  const [editingLaneIndex, setEditingLaneIndex] = useState<number | null>(null);

  const handleAddLane = async (laneData: ContractLaneCreateData) => {
    try {
      const { clientId: _, clientName: __, createdBy: ___, ...laneWithoutClient } = laneData;
      
      if (editingLaneIndex !== null) {
        const updatedLanes = [...lanes];
        updatedLanes[editingLaneIndex] = laneWithoutClient as ContractLaneData;
        onLanesChange(updatedLanes);
        toast.success('Contract lane updated');
        setEditingLaneIndex(null);
      } else {
        onLanesChange([...lanes, laneWithoutClient as ContractLaneData]);
        toast.success('Contract lane added');
      }
    } catch (error: any) {
      toast.error('Failed to save lane', { description: error.message });
    }
  };

  const handleEditLane = (index: number) => {
    setEditingLaneIndex(index);
  };

  const handleDeleteLane = (index: number) => {
    const updatedLanes = lanes.filter((_, i) => i !== index);
    onLanesChange(updatedLanes);
    toast.success('Contract lane removed');
  };

  const handleCancelForm = () => {
    // Reset form but keep it visible
    setEditingLaneIndex(null);
  };

  const editingLane = editingLaneIndex !== null ? lanes[editingLaneIndex] : null;

  return (
    <div className="space-y-6">
      <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card to-card/50 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
        <CardContent className="p-6 relative">
          <div className="pb-4 mb-6 border-b border-border/50 relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wider">Step {stepNumber} of {totalSteps}</p>
                <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <Route className="h-5 w-5 text-primary" />
                  Contract Lanes
                </h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Fill in the form below to add a contract lane for this client.
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Route className="h-6 w-6 text-primary" />
              </div>
            </div>
          </div>

          {/* Full Contract Lane Form - Always Visible */}
          <div className="mb-6">
            <InlineContractLaneForm
              key={editingLaneIndex ?? 'new'} // Force re-render when switching between new/edit
              clientId={clientId || 'temp'}
              clientName={clientName || 'New Client'}
              duplicateLaneData={editingLane ? editingLane as any : undefined}
              onSave={handleAddLane}
              onCancel={handleCancelForm}
            />
          </div>

          {/* Added Lanes List */}
          {lanes.length > 0 && (
            <div className="mt-8 space-y-4">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/30">
                <h4 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Route className="h-4 w-4 text-primary" />
                  Added Contract Lanes 
                  <span className="ml-2 px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {lanes.length}
                  </span>
                </h4>
              </div>
              
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {lanes.map((lane, index) => (
                  <Card key={index} className="border-border/50 bg-gradient-to-br from-card/80 to-card/40 shadow-md hover:shadow-lg transition-all duration-200 hover:border-primary/30">
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-4 w-4 text-primary" />
                              <span className="font-medium text-sm">
                                {lane.fromLocation || lane.warehouseCity || 'N/A'}
                              </span>
                              <span className="text-muted-foreground">→</span>
                              <span className="font-medium text-sm">
                                {lane.toLocation || 'N/A'}
                              </span>
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {lane.vehicleType && (
                              <div className="flex items-center gap-1">
                                <Truck className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Vehicle:</span>
                                <span className="font-medium">{lane.vehicleType}</span>
                              </div>
                            )}
                            {lane.distance && (
                              <div className="flex items-center gap-1">
                                <Route className="h-3 w-3 text-muted-foreground" />
                                <span className="text-muted-foreground">Distance:</span>
                                <span className="font-medium">{lane.distance} km</span>
                              </div>
                            )}
                            {lane.rate && (
                              <div>
                                <span className="text-muted-foreground">Rate:</span>
                                <span className="font-medium ml-1">₹{lane.rate.toLocaleString()}</span>
                              </div>
                            )}
                            {lane.pricingDetails?.model && (
                              <div>
                                <span className="text-muted-foreground">Model:</span>
                                <span className="font-medium ml-1 capitalize">
                                  {lane.pricingDetails.model.replace('_', ' ')}
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                            {lane.warehouseName && (
                              <div>
                                <span className="font-medium">Warehouse:</span> {lane.warehouseName} {lane.warehouseZone && `(${lane.warehouseZone})`}
                              </div>
                            )}
                            {lane.pricingDetails?.baseRate && (
                              <div>
                                <span className="font-medium">Base Rate:</span> ₹{lane.pricingDetails.baseRate.toLocaleString()}
                              </div>
                            )}
                            {lane.pricingDetails?.perMTRate && lane.pricingDetails?.perKMRate && (
                              <div>
                                <span className="font-medium">Per MT/KM:</span> ₹{lane.pricingDetails.perMTRate}/MT × ₹{lane.pricingDetails.perKMRate}/KM
                              </div>
                            )}
                            {lane.contractStartDate && (
                              <div>
                                <span className="font-medium">Contract:</span> {new Date(lane.contractStartDate).toLocaleDateString()}
                                {lane.contractEndDate && ` - ${new Date(lane.contractEndDate).toLocaleDateString()}`}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleEditLane(index)}
                            className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-all duration-200 rounded-lg"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteLane(index)}
                            className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive transition-all duration-200 rounded-lg"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </div>
  );
};
