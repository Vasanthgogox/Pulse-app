/**
 * Address Tab Component
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { UseFormReturn } from 'react-hook-form';
import { MapPin, Building, MapPinned } from 'lucide-react';
import { FormData } from '../types';

interface AddressTabProps {
  form: UseFormReturn<FormData>;
  stepNumber: number;
  totalSteps: number;
}

export const AddressTab: React.FC<AddressTabProps> = ({ form, stepNumber, totalSteps }) => {
  return (
    <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card to-card/50 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <CardContent className="p-6 relative">
        <div className="pb-4 mb-6 border-b border-border/50 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wider">Step {stepNumber} of {totalSteps}</p>
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <MapPin className="h-5 w-5 text-primary" />
                Address Information
              </h3>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <MapPin className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        <FormField
          control={form.control}
          name="address"
          render={({ field }) => (
            <FormItem className="space-y-2 mb-6">
              <FormLabel className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                HO Address
              </FormLabel>
              <FormControl>
                <Textarea
                  placeholder="123, Industrial Area, Sector 5..."
                  className="min-h-[100px] border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200 resize-none"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <FormField
            control={form.control}
            name="city"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Building className="h-4 w-4 text-primary" />
                  City
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Mumbai" 
                    className="border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="state"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <MapPinned className="h-4 w-4 text-primary" />
                  State
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="Maharashtra" 
                    className="border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="pincode"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  Pincode
                </FormLabel>
                <FormControl>
                  <Input 
                    placeholder="400001" 
                    className="border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                    {...field} 
                  />
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
