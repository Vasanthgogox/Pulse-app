/**
 * Remarks Tab Component
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { UseFormReturn } from 'react-hook-form';
import { FileText } from 'lucide-react';
import { FormData } from '../types';

interface RemarksTabProps {
  form: UseFormReturn<FormData>;
  stepNumber: number;
  totalSteps: number;
}

export const RemarksTab: React.FC<RemarksTabProps> = ({ form, stepNumber, totalSteps }) => {
  return (
    <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card to-card/50 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <CardContent className="p-6 relative">
        <div className="pb-4 mb-6 border-b border-border/50 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wider">Step {stepNumber} of {totalSteps}</p>
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Remarks
              </h3>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        <FormField
          control={form.control}
          name="remarks"
          render={({ field }) => (
            <FormItem className="space-y-2">
              <FormLabel className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Remarks
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Any additional notes or comments..."
                  className="min-h-[200px] border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200 resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </CardContent>
    </Card>
  );
};
