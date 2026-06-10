/**
 * Footer Navigation Component
 */

import React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TabName } from '../types';

interface FooterNavigationProps {
  activeTab: TabName;
  isSubmitting: boolean;
  canSubmit: boolean;
  userRole?: string;
  userId?: string;
  isEditMode: boolean;
  onPrevious: () => void;
  onNext: () => Promise<boolean>;
  onSkip?: () => Promise<boolean>;
  canSkip: boolean;
  onSubmit: () => void;
  onClose: () => void;
}

export const FooterNavigation: React.FC<FooterNavigationProps> = ({
  activeTab,
  isSubmitting,
  canSubmit,
  userRole,
  userId,
  isEditMode,
  onPrevious,
  onNext,
  onSkip,
  canSkip,
  onSubmit,
  onClose,
}) => {
  const isAuthorized = userId && (userRole === 'dispatcher' || userRole === 'fleet_owner');
  const isLastTab = activeTab === 'remarks';

  return (
    <div className="flex-shrink-0 border-t border-border/50 bg-gradient-to-b from-card/98 via-card/95 to-card backdrop-blur-md p-6 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
      <div className="flex items-center justify-between gap-4">
        {/* Navigation Buttons */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onPrevious}
            disabled={activeTab === 'company'}
            className="flex items-center gap-2 border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 disabled:opacity-40"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {canSkip && onSkip && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={async () => {
                const skipped = await onSkip();
                if (!skipped) {
                  // Handle skip error if needed
                }
              }}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-200"
            >
              Skip for now
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              const success = await onNext();
              if (!success) {
                // Handle validation error if needed
              }
            }}
            disabled={isLastTab}
            className="flex items-center gap-2 border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-all duration-200 disabled:opacity-40"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
            className="border-border/50 hover:border-destructive/50 hover:bg-destructive/5 hover:text-destructive transition-all duration-200"
          >
            Cancel
          </Button>
          <Button
            type="button"
            className={cn(
              "relative transition-all duration-300 font-semibold shadow-lg",
              canSubmit && isAuthorized
                ? "bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary text-primary-foreground hover:shadow-xl hover:shadow-primary/30 hover:scale-105 active:scale-100"
                : "bg-muted text-muted-foreground opacity-50 cursor-not-allowed"
            )}
            disabled={isSubmitting || !isAuthorized || !canSubmit}
            onClick={onSubmit}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isEditMode ? 'Updating...' : 'Adding...'}
              </>
            ) : (
              <>{isEditMode ? 'Update Client' : 'Add Client'}</>
            )}
            {canSubmit && isAuthorized && !isSubmitting && (
              <span className="absolute -top-1 -right-1 h-3 w-3 bg-green-500 rounded-full animate-pulse" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
