import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Truck,
  Phone,
  Mail,
  Check,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

interface AddSupplierWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (supplier: SupplierFormData) => void;
}

export interface SupplierFormData {
  name: string;
  companyName: string;
  phone: string;
  email: string;
  vehicleTypes: string[];
  areas: string[];
  supplierType: "integrated" | "offline" | "marketplace";
}

type Step = "basic" | "contact" | "fleet" | "review";

const steps: { id: Step; title: string; description: string }[] = [
  { id: "basic", title: "Basic Info", description: "Supplier details" },
  { id: "contact", title: "Contact", description: "Phone & email" },
  { id: "fleet", title: "Fleet", description: "Vehicles & areas" },
  { id: "review", title: "Review", description: "Confirm details" },
];

const vehicleOptions = [
  "Tata Ace",
  "Bolero Pickup",
  "Tata 407",
  "Eicher 14ft",
  "Container 20ft",
  "Container 32ft",
  "Trailer",
  "Refrigerated",
  "Tanker",
];

const areaOptions = [
  "Mumbai",
  "Pune",
  "Delhi",
  "Bangalore",
  "Chennai",
  "Hyderabad",
  "Kolkata",
  "Ahmedabad",
  "Jaipur",
  "Nashik",
];

const AddSupplierWizard = ({ open, onOpenChange, onSave }: AddSupplierWizardProps) => {
  const isMobile = useIsMobile();
  const [currentStep, setCurrentStep] = useState<Step>("basic");
  const [formData, setFormData] = useState<SupplierFormData>({
    name: "",
    companyName: "",
    phone: "",
    email: "",
    vehicleTypes: [],
    areas: [],
    supplierType: "offline",
  });

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    if (!formData.phone.trim()) {
      toast.error("Phone number is required");
      return;
    }

    onSave(formData);
    onOpenChange(false);
    resetForm();
    toast.success("Supplier added successfully");
  };

  const resetForm = () => {
    setFormData({
      name: "",
      companyName: "",
      phone: "",
      email: "",
      vehicleTypes: [],
      areas: [],
      supplierType: "offline",
    });
    setCurrentStep("basic");
  };

  const toggleVehicle = (vehicle: string) => {
    setFormData({
      ...formData,
      vehicleTypes: formData.vehicleTypes.includes(vehicle)
        ? formData.vehicleTypes.filter((v) => v !== vehicle)
        : [...formData.vehicleTypes, vehicle],
    });
  };

  const toggleArea = (area: string) => {
    setFormData({
      ...formData,
      areas: formData.areas.includes(area)
        ? formData.areas.filter((a) => a !== area)
        : [...formData.areas, area],
    });
  };

  const canProceed = () => {
    switch (currentStep) {
      case "basic":
        return formData.name.trim().length > 0;
      case "contact":
        return formData.phone.trim().length > 0;
      default:
        return true;
    }
  };

  if (!open) return null;

  const canGoBack = currentStepIndex > 0;

  const renderStepContent = () => {
    switch (currentStep) {
      case "basic":
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="supplierName">Supplier Name *</Label>
              <Input
                id="supplierName"
                placeholder="Enter supplier name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={cn("text-lg", isMobile ? "h-12 min-h-[44px]" : "h-14")}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="Enter company name"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                className={cn("text-lg", isMobile ? "h-12 min-h-[44px]" : "h-14")}
              />
            </div>
          </div>
        );

      case "contact":
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number *</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className={cn("pl-10 text-lg", isMobile ? "h-12 min-h-[44px]" : "h-14")}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="supplier@company.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={cn("pl-10 text-lg", isMobile ? "h-12 min-h-[44px]" : "h-14")}
                />
              </div>
            </div>
          </div>
        );

      case "fleet":
        return (
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>Vehicle Types</Label>
              <div className="flex flex-wrap gap-2">
                {vehicleOptions.map((vehicle) => (
                  <button
                    key={vehicle}
                    type="button"
                    onClick={() => toggleVehicle(vehicle)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs transition-colors border",
                      formData.vehicleTypes.includes(vehicle)
                        ? "bg-gray-900 text-white dark:bg-white dark:text-black border-transparent"
                        : "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                    )}
                  >
                    {vehicle}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Service Areas</Label>
              <div className="flex flex-wrap gap-2">
                {areaOptions.map((area) => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => toggleArea(area)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs transition-colors border",
                      formData.areas.includes(area)
                        ? "bg-gray-900 text-white dark:bg-white dark:text-black border-transparent"
                        : "bg-gray-50 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700"
                    )}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case "review":
        return (
          <div className="space-y-6">
            <div className="p-4 rounded-xl bg-secondary/50 border border-border dark:border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="h-12 w-12 rounded-xl bg-primary/20 flex items-center justify-center">
                  <Truck className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-lg font-semibold text-foreground">{formData.name}</p>
                  <p className="text-sm text-muted-foreground">{formData.companyName || "No company"}</p>
                </div>
                <Badge variant="outline" className="ml-auto text-xs capitalize">
                  {formData.supplierType}
                </Badge>
              </div>

              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Phone className="h-3 w-3" />
                  {formData.phone}
                </div>
                {formData.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-3 w-3" />
                    {formData.email}
                  </div>
                )}
              </div>

              {(formData.vehicleTypes.length > 0 || formData.areas.length > 0) && (
                <div className="mt-3 pt-3 border-t border-border dark:border-gray-700 space-y-2">
                  {formData.vehicleTypes.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Vehicles</p>
                      <div className="flex flex-wrap gap-1">
                        {formData.vehicleTypes.map((v) => (
                          <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {formData.areas.length > 0 && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Areas</p>
                      <div className="flex flex-wrap gap-1">
                        {formData.areas.map((a) => (
                          <Badge key={a} variant="outline" className="text-xs">{a}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-gray-950 w-full">
      {/* Header - same as Add Vehicle Wizard */}
      <div className="bg-white dark:bg-gray-950 border-b border-gray-200 dark:border-gray-800 shrink-0">
        <div className={cn("flex items-center justify-between", isMobile ? "px-3 py-3 gap-2" : "px-4 lg:px-6 py-4 gap-4")}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <motion.button
              type="button"
              onClick={canGoBack ? handleBack : () => onOpenChange(false)}
              className="min-h-[44px] min-w-[44px] h-9 w-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-gray-300" />
            </motion.button>
            <div className="min-w-0 flex-1">
              <h1 className={cn("font-semibold text-gray-900 dark:text-white tracking-tight truncate", isMobile ? "text-base" : "text-lg")}>
                Add Supplier
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 truncate">{steps[currentStepIndex].title}</p>
            </div>
            {!isMobile && (
              <Badge className="bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-0 gap-1 shrink-0">
                <Truck className="h-3 w-3" />
                New Supplier
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {steps.map((s, idx) => (
              <motion.div
                key={s.id}
                className={cn(
                  "h-2 rounded-full transition-all duration-300",
                  idx === currentStepIndex
                    ? "w-8 bg-gray-900 dark:bg-white"
                    : idx < currentStepIndex
                    ? "w-2 bg-gray-400 dark:bg-gray-600"
                    : "w-2 bg-gray-200 dark:bg-gray-700"
                )}
                animate={{ scale: idx === currentStepIndex ? 1.1 : 1, opacity: idx === currentStepIndex ? 1 : 0.6 }}
              />
            ))}
          </div>
          <motion.button
            type="button"
            onClick={() => onOpenChange(false)}
            className="min-h-[44px] min-w-[44px] h-9 w-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors shrink-0"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <X className="h-5 w-5 text-gray-700 dark:text-gray-300" />
          </motion.button>
        </div>
      </div>

      {/* Main Content - Split Layout (same as Add Vehicle Wizard) */}
      <div className="flex-1 flex overflow-hidden bg-white dark:bg-gray-950 min-h-0 w-full">
        <div className="w-full lg:w-[55%] xl:w-[60%] min-w-0 flex flex-col overflow-hidden border-r-0 lg:border-r border-gray-200 dark:border-gray-800">
          <ScrollArea className="flex-1 w-full">
            <div className={cn("w-full", isMobile ? "p-4 pb-bottom-nav" : "px-4 sm:px-6 lg:px-8 py-6 lg:py-8")}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentStep}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2 }}
                >
                  {renderStepContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </ScrollArea>
        </div>

        {/* Right Sidebar - Supplier Summary (desktop only) */}
        <div className="hidden lg:flex w-[40%] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800 flex-col overflow-hidden">
          <ScrollArea className="flex-1 w-full">
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Supplier Summary</h3>
              {(formData.name || formData.companyName) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                      <Truck className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Supplier</p>
                      {formData.name && (
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {formData.name}
                        </p>
                      )}
                      {formData.companyName && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                          {formData.companyName}
                        </p>
                      )}
                      <Badge variant="outline" className="mt-2 text-[10px] capitalize">
                        {formData.supplierType}
                      </Badge>
                    </div>
                  </div>
                </motion.div>
              )}
              {(formData.phone || formData.email) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                      <Phone className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Contact</p>
                      {formData.phone && (
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{formData.phone}</p>
                      )}
                      {formData.email && (
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">{formData.email}</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
              {(formData.vehicleTypes.length > 0 || formData.areas.length > 0) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                      <Truck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Fleet & areas</p>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {formData.vehicleTypes.length} vehicle type(s) • {formData.areas.length} area(s)
                      </p>
                    </div>
                  </div>
                </motion.div>
              )}
              {!formData.name && !formData.phone && formData.vehicleTypes.length === 0 && formData.areas.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
                  <Truck className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Complete the steps to see supplier summary
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Footer - same as Add Vehicle Wizard */}
      <div className={cn("bg-white dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 shrink-0 py-4 w-full", isMobile ? "p-3 pb-bottom-nav" : "px-4 sm:px-6 lg:px-8")}>
        <div className="flex items-center justify-between w-full">
          <motion.button
            type="button"
            onClick={canGoBack ? handleBack : () => onOpenChange(false)}
            className="min-h-[44px] px-6 py-2.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-medium text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {canGoBack ? "Back" : "Cancel"}
          </motion.button>
          {currentStep === "review" ? (
            <motion.button
              type="button"
              onClick={handleSubmit}
              className="min-h-[44px] px-8 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors flex items-center gap-2"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Check className="h-4 w-4" />
              Add Supplier
            </motion.button>
          ) : (
            <motion.button
              type="button"
              onClick={handleNext}
              disabled={!canProceed()}
              className="min-h-[44px] px-8 py-2.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-sm hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              whileHover={{ scale: !canProceed() ? 1 : 1.02 }}
              whileTap={{ scale: !canProceed() ? 1 : 0.98 }}
            >
              Continue
              <ArrowRight className="h-4 w-4" />
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddSupplierWizard;
