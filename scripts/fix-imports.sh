#!/usr/bin/env bash
# Post-refactor import path fixer
# Run after rebasing onto develop: bash fix-imports.sh

set -e
FILES=$(find . -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -path "*/node_modules/*" ! -path "*/.expo/*" ! -path "*/dist/*" \
  ! -path "*/dist-test-bundle/*" ! -path "*/.metro-cache/*")

fix() {
  local old="$1" new="$2"
  echo "$FILES" | xargs grep -l "$old" 2>/dev/null | while read -r f; do
    sed -i '' "s|${old}|${new}|g" "$f"
  done
}

# services/ → features/
fix "@/services/tripsService"                    "@/features/trips/services/trips.service"
fix "@/services/driversService"                  "@/features/drivers/services/drivers.service"
fix "@/services/salaryRequestsService"           "@/features/drivers/services/salaryRequests.service"
fix "@/services/driverLocationService"           "@/features/driver/services/driverLocation.service"
fix "@/services/tripDocumentsService"            "@/features/trips/services/tripDocuments.service"
fix "@/services/loadsService"                    "@/features/indents/services/loads.service"
fix "@/services/sharedLedgerService"             "@/features/finance/services/sharedLedger.service"
fix "@/services/sharedLedgerNotificationsService" "@/features/finance/services/sharedLedgerNotifications.service"
fix "@/services/logPodsService"                  "@/features/log-pods/services/logPods.service"
fix "@/services/routingService"                  "@/lib/routingService"
fix "@/services/connectionRequestsService"       "@/features/connections/services/connectionRequests.service"

# hooks/ → lib/hooks/ + features/auth/hooks/
fix "@/hooks/useGlobalFabAnimation"              "@/lib/hooks/useGlobalFabAnimation"
fix "@/hooks/useKeyboardVisible"                 "@/lib/hooks/useKeyboardVisible"
fix "@/hooks/useMobileKeepSignedInSignOut"       "@/features/auth/hooks/useMobileKeepSignedInSignOut"
fix "@/hooks/useWebKeepSignedInSignOut"          "@/features/auth/hooks/useWebKeepSignedInSignOut"

# lib/ domain files → features/
fix "@/lib/driverUtils"                          "@/features/drivers/utils/driverUtils.util"
fix "@/lib/driverTripSequence"                   "@/features/driver/utils/driverTripSequence.util"
fix "@/lib/driverInviteOffer.util"               "@/features/drivers/utils/driverInviteOffer.util"
fix "@/lib/driverCommunication"                  "@/features/driver/utils/driverCommunication.util"
fix "@/lib/driverGpayTransactions"               "@/features/driver/utils/driverGpayTransactions.util"
fix "@/lib/driverTripStatusNotes.util"           "@/features/driver/utils/driverTripStatusNotes.util"
fix "@/lib/driverDashboardFlags"                 "@/features/driver/utils/driverDashboardFlags.util"
fix "@/lib/driverAssignerDisplay"                "@/features/trips/utils/driverAssignerDisplay.util"
fix "@/lib/fleetAvatar"                          "@/features/vehicles/utils/fleetAvatar.util"
fix "@/lib/indiaLocations.json"                  "@/lib/data/indiaLocations.json"

# components/ domain components → features/
fix "@/components/DriverTripFlowCard"            "@/features/driver/components/DriverTripFlowCard"
fix "@/components/DriverPartnerProfileDashboard" "@/features/drivers/components/DriverPartnerProfileDashboard"

echo "✅ Import paths updated."
