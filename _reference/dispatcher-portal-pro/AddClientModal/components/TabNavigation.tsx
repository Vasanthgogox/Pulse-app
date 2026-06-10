/**
 * Tab Navigation Component
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, User, MapPin, CreditCard, Route, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TabName } from '../types';

interface TabNavigationProps {
  tabs: TabName[];
  activeTab: TabName;
  onTabChange: (tab: TabName) => void;
  canAccessTab: (tab: string) => boolean;
  isEditMode: boolean;
  contractLanesEnabled: boolean;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({
  tabs,
  activeTab,
  onTabChange,
  canAccessTab,
  isEditMode,
  contractLanesEnabled,
}) => {
  const getTabIcon = (tab: TabName) => {
    switch (tab) {
      case 'company':
        return <Building2 className="h-4 w-4" />;
      case 'address':
        return <MapPin className="h-4 w-4" />;
      case 'kam':
        return <User className="h-4 w-4" />;
      case 'financial':
        return <CreditCard className="h-4 w-4" />;
      case 'lanes':
        return <Route className="h-4 w-4" />;
      case 'remarks':
        return <Mail className="h-4 w-4" />;
      default:
        return null;
    }
  };

  const getTabLabel = (tab: TabName) => {
    switch (tab) {
      case 'company':
        return 'Company';
      case 'address':
        return 'Address';
      case 'kam':
        return 'Internal KAM & Billing';
      case 'financial':
        return 'Financial';
      case 'lanes':
        return 'Lanes';
      case 'remarks':
        return 'Remarks';
      default:
        return tab;
    }
  };

  return (
    <div className="mb-6 relative">
      <TabsList className="grid w-full grid-cols-6 bg-muted/30 p-1.5 rounded-lg border border-border/50 shadow-sm">
        {tabs.map((tab) => {
          const isActive = activeTab === tab;
          const isDisabled = !canAccessTab(tab);
          
          return (
            <TabsTrigger
              key={tab}
              value={tab}
              className={cn(
                "flex items-center gap-2 relative transition-all duration-200 rounded-md",
                "data-[state=active]:bg-gradient-to-br data-[state=active]:from-primary data-[state=active]:to-primary/90",
                "data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:shadow-primary/20",
                "data-[state=active]:font-semibold data-[state=active]:scale-[1.02]",
                "hover:bg-primary/10 hover:text-primary",
                isDisabled && "opacity-40 cursor-not-allowed",
                !isActive && "text-muted-foreground"
              )}
              disabled={isDisabled}
              onClick={() => canAccessTab(tab) && onTabChange(tab)}
            >
              <span className={cn(
                "transition-transform duration-200",
                isActive && "scale-110"
              )}>
                {getTabIcon(tab)}
              </span>
              <span className="hidden sm:inline text-xs font-medium">{getTabLabel(tab)}</span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </div>
  );
};
