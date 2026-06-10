/**
 * Financial Tab Component
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UseFormReturn, useFieldArray } from 'react-hook-form';
import { CreditCard, IndianRupee, Calendar, Receipt, UserCircle, Mail, Phone, Plus, Trash2 } from 'lucide-react';
import { FormData } from '../types';
import { PAYMENT_TERMS_OPTIONS, INVOICE_FREQUENCY_OPTIONS } from '../constants';

interface FinancialTabProps {
  form: UseFormReturn<FormData>;
  stepNumber: number;
  totalSteps: number;
}

export const FinancialTab: React.FC<FinancialTabProps> = ({ form, stepNumber, totalSteps }) => {
  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'clientBillingContacts',
  });

  const addContact = () => {
    append({
      name: '',
      email: '',
      phone: '',
    });
  };

  return (
    <Card className="border-border/50 shadow-lg bg-gradient-to-br from-card to-card/50 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
      <CardContent className="p-6 relative">
        <div className="pb-4 mb-6 border-b border-border/50 relative">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-primary mb-2 uppercase tracking-wider">Step {stepNumber} of {totalSteps}</p>
              <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                Financial Information
              </h3>
            </div>
            <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <FormField
            control={form.control}
            name="potentialVolume"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-primary" />
                  Potential Volume of the Client (₹)
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      type="number" 
                      placeholder="0" 
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field} 
                    />
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormDescription className="text-xs text-muted-foreground">
                  Expected business volume from the client
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="projectedContractRevenue"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <IndianRupee className="h-4 w-4 text-primary" />
                  Projected Contract Revenue (₹)
                </FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input 
                      type="number" 
                      placeholder="0" 
                      className="pl-10 border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200"
                      {...field} 
                    />
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  </div>
                </FormControl>
                <FormDescription className="text-xs text-muted-foreground">
                  Secured business volume (e.g., Gogox business volume)
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
          <FormField
            control={form.control}
            name="paymentTerms"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  Payment Terms
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200">
                      <SelectValue placeholder="Select payment terms" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PAYMENT_TERMS_OPTIONS.map((term) => (
                      <SelectItem key={term} value={term}>
                        {term}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="invoiceFrequency"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-primary" />
                  Invoice Frequency
                </FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="border-border/50 focus:border-primary focus:ring-primary/20 transition-all duration-200">
                      <SelectValue placeholder="Select frequency" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {INVOICE_FREQUENCY_OPTIONS.map((freq) => (
                      <SelectItem key={freq} value={freq}>
                        {freq}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <UserCircle className="h-4 w-4 text-primary" />
              Client Billing Contacts
            </h4>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addContact}
              className="text-xs"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Contact
            </Button>
          </div>

          <div className="space-y-4">
            {fields.map((field, index) => (
              <Card key={field.id} className="border-border/50 bg-card/50">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-xs font-medium text-muted-foreground">
                      Contact {index + 1}
                    </span>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(index)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name={`clientBillingContacts.${index}.name`}
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            <UserCircle className="h-4 w-4 text-primary" />
                            Client Billing Contact Name
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                placeholder="Client billing contact name" 
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
                      name={`clientBillingContacts.${index}.email`}
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            <Mail className="h-4 w-4 text-primary" />
                            Client Billing Email
                          </FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input 
                                type="email"
                                placeholder="billing@client.com" 
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
                      name={`clientBillingContacts.${index}.phone`}
                      render={({ field }) => (
                        <FormItem className="space-y-2">
                          <FormLabel className="text-sm font-semibold flex items-center gap-2">
                            <Phone className="h-4 w-4 text-primary" />
                            Client Billing Phone
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
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
