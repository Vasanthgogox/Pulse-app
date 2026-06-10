/**
 * Company Tab Component
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
import { Building2, User, Phone, Mail, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FormData } from '../types';

interface CompanyTabProps {
  form: UseFormReturn<FormData>;
  stepNumber: number;
  totalSteps: number;
}

export const CompanyTab: React.FC<CompanyTabProps> = ({ form, stepNumber, totalSteps }) => {
  return (
    <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card to-card/50 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <CardContent className="p-6 relative">
        <div className="pb-4 mb-6 border-b border-border/50 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wider">Step {stepNumber} of {totalSteps}</p>
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Company Information
              </h3>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="companyName"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" />
                  Company Name <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="ABC Logistics Pvt Ltd"
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field}
                    />
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contactPerson"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <User className="h-4 w-4 text-primary" />
                  Contact Person <span className="text-destructive">*</span>
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="Rajesh Kumar"
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
            name="phone"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Phone className="h-4 w-4 text-primary" />
                  Phone Number <span className="text-destructive">*</span>
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

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Mail className="h-4 w-4 text-primary" />
                  Email Address
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      type="email"
                      placeholder="contact@company.com"
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
            name="panNumber"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  PAN Number
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="ABCDE1234F"
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200 uppercase"
                      maxLength={10}
                      {...field}
                    />
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="tanNumber"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  TAN Number
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="ABCD12345E"
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200 uppercase"
                      maxLength={10}
                      {...field}
                    />
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
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
