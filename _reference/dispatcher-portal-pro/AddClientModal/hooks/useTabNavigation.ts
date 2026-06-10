/**
 * Custom hook for tab navigation logic
 */

import { useState } from 'react';
import { TabName } from '../types';
import { TAB_ORDER } from '../constants';
import { getTabFields } from '../utils';
import { UseFormTrigger } from 'react-hook-form';
import { FormData } from '../types';

export const useTabNavigation = (
  contractLanesEnabled: boolean,
  isEditMode: boolean,
  trigger: UseFormTrigger<FormData>,
  onLanesClear?: () => void
) => {
  const [activeTab, setActiveTab] = useState<TabName>('company');
  const [validatedTabs, setValidatedTabs] = useState<Set<string>>(new Set());

  const getTabs = (): TabName[] => {
    return [...TAB_ORDER.filter(tab => {
      if (tab === 'lanes' && (isEditMode || !contractLanesEnabled)) {
        return false;
      }
      return true;
    })] as TabName[];
  };

  const canAccessTab = (tab: string): boolean => {
    if (isEditMode) return true;
    
    const tabs = getTabs();
    const tabIndex = tabs.indexOf(tab as TabName);
    
    if (tabIndex === 0) return true;
    
    for (let i = 0; i < tabIndex; i++) {
      if (!validatedTabs.has(tabs[i])) {
        return false;
      }
    }
    
    return true;
  };

  const handleNext = async () => {
    const tabs = getTabs();
    const currentIndex = tabs.indexOf(activeTab);
    
    if (currentIndex < tabs.length - 1) {
      const currentTab = activeTab;
      
      if (currentTab === 'lanes' || currentTab === 'remarks') {
        setValidatedTabs(prev => new Set([...prev, currentTab]));
        setActiveTab(tabs[currentIndex + 1]);
        return;
      }
      
      const fieldsToValidate = getTabFields(currentTab);
      const isValid = await trigger(fieldsToValidate as any);
      
      if (isValid) {
        setValidatedTabs(prev => new Set([...prev, currentTab]));
        setActiveTab(tabs[currentIndex + 1]);
      } else {
        return false;
      }
    }
    return true;
  };

  const handlePrevious = () => {
    const tabs = getTabs();
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1]);
    }
  };

  const handleSkip = () => {
    const tabs = getTabs();
    const currentIndex = tabs.indexOf(activeTab);
    
    if (currentIndex < tabs.length - 1) {
      const currentTab = activeTab;
      
      // If skipping lanes, clear any existing lanes data
      if (currentTab === 'lanes' && onLanesClear) {
        onLanesClear();
      }
      
      setValidatedTabs(prev => new Set([...prev, currentTab]));
      setActiveTab(tabs[currentIndex + 1]);
      return true;
    }
    return false;
  };

  const canSkipTab = (): boolean => {
    return activeTab === 'lanes';
  };

  const areAllTabsValidated = (formIsValid: boolean): boolean => {
    if (isEditMode) {
      return formIsValid;
    }
    
    const tabs = getTabs();
    const tabsToValidate = tabs.slice(0, -1);
    const allTabsValidated = tabsToValidate.every(tab => validatedTabs.has(tab));
    return allTabsValidated && formIsValid;
  };

  const resetTabs = () => {
    setActiveTab('company');
    setValidatedTabs(new Set());
  };

  return {
    activeTab,
    setActiveTab,
    validatedTabs,
    canAccessTab,
    handleNext,
    handlePrevious,
    handleSkip,
    canSkipTab,
    areAllTabsValidated,
    resetTabs,
    getTabs,
  };
};
