/**
 * KAM & Billing Tab Component
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { UseFormReturn } from 'react-hook-form';
import { User, Mail, Phone, UserCircle } from 'lucide-react';
import { FormData } from '../types';

interface KAMTabProps {
  form: UseFormReturn<FormData>;
  stepNumber: number;
  totalSteps: number;
}

export const KAMTab: React.FC<KAMTabProps> = ({ form, stepNumber, totalSteps }) => {
  return (
    <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card to-card/50 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <CardContent className="p-6 relative">
        <div className="pb-4 mb-6 border-b border-border/50 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wider">Step {stepNumber} of {totalSteps}</p>
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <User className="h-5 w-5 text-primary" />
                Internal KAM & Billing Contact
              </h3>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormField
            control={form.control}
            name="kamName"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  KAM Name
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      placeholder="Key Account Manager name" 
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field} 
                    />
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="kamEmail"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  KAM Email
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      type="email"
                      placeholder="kam@company.com" 
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field} 
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="kamPhone"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  KAM Phone
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      placeholder="+91 98765 43210" 
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field} 
                    />
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <FormField
            control={form.control}
            name="billingContactPerson"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <UserCircle className="h-4 w-4 text-primary" />
                  Billing Contact Person
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      placeholder="Billing contact person name" 
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field} 
                    />
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="billingContactPersonEmail"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Billing Contact Email
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      type="email"
                      placeholder="billing@company.com" 
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field} 
                    />
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="billingContactPersonPhone"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  Billing Contact Phone
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      placeholder="+91 98765 43210" 
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field} 
                    />
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
};
