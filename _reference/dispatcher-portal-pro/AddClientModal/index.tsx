/**
 * AddClientPanel - Main Component
 * Refactored modular version for scalability and maintainability
 */

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Loader2, Sparkles, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAuthContext } from '@/components/app/AuthProvider';
import { fleetOwnerClientsService } from '@/services/FleetOwner/Clients';
import { batchCreateContractLanes } from '@/services/Dispatcher/ContractLanes';
import { useContractLanesSettings } from '@/hooks/useContractLanesSettings';
import { ContractLaneCreateData } from '@/types/contractLane';
import { AddClientPanelProps, FormData, ContractLaneData } from './types';
import { formSchema } from './types';
import { useTabNavigation } from './hooks/useTabNavigation';
import { useMockData } from './hooks/useMockData';
import { formDataToClientUpdate, formDataToNewClient, clientToFormData } from './utils';
import { CompanyTab } from './components/CompanyTab';
import { AddressTab } from './components/AddressTab';
import { KAMTab } from './components/KAMTab';
import { FinancialTab } from './components/FinancialTab';
import { LanesTab } from './components/LanesTab';
import { RemarksTab } from './components/RemarksTab';
import { TabNavigation } from './components/TabNavigation';
import { FooterNavigation } from './components/FooterNavigation';

const AddClientPanel: React.FC<AddClientPanelProps> = ({
  isOpen,
  onClose,
  onSuccess,
  editClientId
}) => {
  const { userData } = useAuthContext();
  const { isEnabled: contractLanesEnabled } = useContractLanesSettings();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingClient, setLoadingClient] = useState(false);
  const [contractLanes, setContractLanes] = useState<ContractLaneData[]>([]);

  const isEditMode = !!editClientId;

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      companyName: '',
      contactPerson: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
      kamName: '',
      kamEmail: '',
      kamPhone: '',
      billingContactPerson: '',
      billingContactPersonEmail: '',
      billingContactPersonPhone: '',
      potentialVolume: '500000',
      clientBillingContacts: [{ name: '', email: '', phone: '' }],
      projectedContractRevenue: '0',
      paymentTerms: '30 Days',
      invoiceFrequency: 'Monthly',
      remarks: '',
    },
  });

  const {
    activeTab,
    setActiveTab,
    canAccessTab,
    handleNext,
    handlePrevious,
    handleSkip,
    canSkipTab,
    areAllTabsValidated,
    resetTabs,
    getTabs,
  } = useTabNavigation(contractLanesEnabled, isEditMode, form.trigger, () => setContractLanes([]));

  const { fillWithMockData } = useMockData(isEditMode, form.reset, setContractLanes);

  // Handle auth context loss
  useEffect(() => {
    if (isOpen && !userData?.uid) {
      toast.error('Session expired. Please log in again.');
      onClose();
    }
  }, [userData, isOpen, onClose]);

  // Load client data for edit mode
  useEffect(() => {
    if (isEditMode && editClientId && userData?.uid && isOpen) {
      const loadClient = async () => {
        setLoadingClient(true);
        try {
          const response = await fleetOwnerClientsService.getClientByIdFromDispatcherSubcollection(
            editClientId,
            userData.uid
          );

          if (response.success && response.data) {
            const formData = clientToFormData(response.data);
            form.reset(formData);
          }
        } catch (error: any) {
          toast.error('Error loading client', { description: error.message });
        } finally {
          setLoadingClient(false);
        }
      };
      loadClient();
    } else if (!isEditMode && isOpen) {
      form.reset();
      setContractLanes([]);
      resetTabs();
    }
  }, [isOpen, isEditMode, editClientId, userData?.uid]);

  // Helper function to check if user can manage clients
  const canManageClients = (user: any): boolean => {
    if (!user) return false;
    
    // Check old format first (for backward compatibility)
    if (user.canManageClients === true) return true;
    
    // Check new nested format
    if (user.permissions?.clients?.manage === true) return true;
    
    // For fleet owners and dispatchers without explicit permission, allow if they have TMS access
    if ((user.role === 'fleet_owner' || user.role === 'dispatcher') && 
        (user.tmsEnabled !== false || user.permissions?.modules?.tms === true)) {
      return true;
    }
    
    return false;
  };

  const onSubmit = async (data: FormData) => {
    try {
      setIsSubmitting(true);

      if (!userData?.uid) {
        toast.error('Authentication required');
        setIsSubmitting(false);
        return;
      }

      if (!canManageClients(userData)) {
        toast.error('Unauthorized: You do not have permission to manage clients');
        setIsSubmitting(false);
        return;
      }

      if (isEditMode && editClientId) {
        // Update existing client
        const updateData = formDataToClientUpdate(data);

        const response = await fleetOwnerClientsService.updateClient(
          editClientId,
          updateData,
          { dispatcherId: userData.uid }
        );

        if (response.success) {
          toast.success('Client updated successfully!');
          onSuccess?.();
          onClose();
        } else {
          toast.error('Failed to update client', { description: response.error });
        }
      } else {
        // Add new client
        const { OrganizationService } = await import('@/services/shared/Auth/organizationService');
        const organizationMemberUids = await OrganizationService.getOrganizationMemberUids(userData.uid);
        const organizationOwnerId = organizationMemberUids[0] || userData.uid;

        const newClient = formDataToNewClient(data, userData.uid, organizationOwnerId);

        const response = await fleetOwnerClientsService.createClient(
          newClient,
          { userId: userData.uid, userRole: 'dispatcher', fleetOwnerId: organizationOwnerId }
        );

        if (response.success && response.data?.id) {
          toast.success('Client added successfully!');
          
          // Create contract lanes if any
          if (contractLanes.length > 0) {
            const lanesWithClientInfo = contractLanes.map(lane => ({
              ...lane,
              clientId: response.data!.id,
              clientName: data.companyName,
              createdBy: userData.uid,
            }));

            await batchCreateContractLanes(lanesWithClientInfo as ContractLaneCreateData[]);
            toast.success(`${contractLanes.length} contract lane(s) added`);
          }

          onSuccess?.(response.data.id);
          onClose();
        } else {
          toast.error('Failed to add client', { description: response.error });
        }
      }
    } catch (error: any) {
      toast.error('Error saving client', { description: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabs = getTabs();
  const totalSteps = tabs.length;
  const currentStep = tabs.indexOf(activeTab) + 1;

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/50 z-[45] transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        style={{ margin: 0, padding: 0, top: 0, right: 0, bottom: 0, left: 0 }}
        onClick={onClose}
      />

      {/* Side Panel */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-full md:w-[min(700px,60vw)] lg:w-[min(900px,70vw)] md:max-w-[900px] md:min-w-[320px] bg-gradient-to-br from-card via-card to-card/95 shadow-2xl z-[50] flex flex-col transition-all duration-300 ease-in-out border-l border-border/50",
          isOpen ? "translate-x-0 opacity-100" : "translate-x-full opacity-0"
        )}
        style={{ margin: 0, padding: 0 }}
      >
        {/* Header with gradient */}
        <div className="relative p-6 border-b border-border/50 bg-gradient-to-r from-primary/5 via-transparent to-transparent backdrop-blur-sm">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-50" />
          <div className="relative flex items-center justify-between">
            <div className="space-y-1">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                {isEditMode ? 'Edit Client' : 'Add Client'}
              </h2>
              <p className="text-sm text-muted-foreground font-medium">
                {isEditMode ? 'Update client information' : 'Add a new client to your directory'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!isEditMode && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={fillWithMockData}
                  className="text-xs border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-all duration-200"
                >
                  <Sparkles className="h-4 w-4 mr-2 text-primary" />
                  Fill Mock Data
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={onClose} 
                className="hover:bg-destructive/10 hover:text-destructive transition-colors duration-200 rounded-full"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 pb-24 bg-gradient-to-b from-transparent via-transparent to-background/30">
          {loadingClient ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
                <Loader2 className="h-10 w-10 animate-spin text-primary relative z-10" />
              </div>
              <span className="text-sm font-medium text-muted-foreground animate-pulse">Loading client details...</span>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Tabs 
                  value={activeTab} 
                  onValueChange={(value) => {
                    if (canAccessTab(value)) {
                      setActiveTab(value as any);
                    }
                  }} 
                  className="w-full"
                >
                  <TabNavigation
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={(tab) => setActiveTab(tab)}
                    canAccessTab={canAccessTab}
                    isEditMode={isEditMode}
                    contractLanesEnabled={contractLanesEnabled}
                  />

                  <TabsContent value="company" className="space-y-4">
                    <CompanyTab form={form} stepNumber={tabs.indexOf('company') + 1} totalSteps={totalSteps} />
                  </TabsContent>

                  <TabsContent value="address" className="space-y-4">
                    <AddressTab form={form} stepNumber={tabs.indexOf('address') + 1} totalSteps={totalSteps} />
                  </TabsContent>

                  <TabsContent value="kam" className="space-y-4">
                    <KAMTab form={form} stepNumber={tabs.indexOf('kam') + 1} totalSteps={totalSteps} />
                  </TabsContent>

                  <TabsContent value="financial" className="space-y-4">
                    <FinancialTab form={form} stepNumber={tabs.indexOf('financial') + 1} totalSteps={totalSteps} />
                  </TabsContent>

                  {!isEditMode && contractLanesEnabled && (
                    <TabsContent value="lanes" className="space-y-4">
                      <LanesTab
                        stepNumber={tabs.indexOf('lanes') + 1}
                        totalSteps={totalSteps}
                        lanes={contractLanes}
                        onLanesChange={setContractLanes}
                        clientName={form.watch('companyName') || 'New Client'}
                        clientId={isEditMode ? editClientId || undefined : undefined}
                      />
                    </TabsContent>
                  )}

                  <TabsContent value="remarks" className="space-y-4">
                    <RemarksTab form={form} stepNumber={tabs.indexOf('remarks') + 1} totalSteps={totalSteps} />
                  </TabsContent>
                </Tabs>
              </form>
            </Form>
          )}
        </div>

        {/* Footer Navigation */}
        <FooterNavigation
          activeTab={activeTab}
          isSubmitting={isSubmitting}
          canSubmit={areAllTabsValidated(form.formState.isValid)}
          userRole={userData?.role}
          userId={userData?.uid}
          isEditMode={isEditMode}
          onPrevious={handlePrevious}
          onNext={async () => {
            const success = await handleNext();
            if (!success) {
              toast.error('Please fill in all required fields before continuing');
            }
            return success;
          }}
          onSkip={canSkipTab() ? async () => {
            const skipped = handleSkip();
            if (skipped) {
              toast.info('Skipped for now. You can add this later.');
            }
            return skipped;
          } : undefined}
          canSkip={canSkipTab()}
          onSubmit={() => form.handleSubmit(onSubmit)()}
          onClose={onClose}
        />
      </div>
    </>
  );
};

export default AddClientPanel;
