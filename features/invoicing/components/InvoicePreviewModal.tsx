/**
 * Invoice Preview & Configuration Modal — wrapping InvoicePreviewPanel
 */
import { Modal, StyleSheet, View } from 'react-native';
import Theme from '@/constants/Theme';
import type { InvoicingTripView } from '@/features/invoicing/services/invoicing.service';
import { InvoicePreviewPanel } from '@/features/invoicing/components/InvoicePreviewPanel';

export interface InvoicePreviewModalProps {
  visible: boolean;
  onClose: () => void;
  onFinalize: (internalIds: string[]) => Promise<void>;
  isFinalizing: boolean;
  activeClient: string | null;
  selectedTrips: InvoicingTripView[];
}

export function InvoicePreviewModal({
  visible,
  onClose,
  onFinalize,
  isFinalizing,
  activeClient,
  selectedTrips,
}: InvoicePreviewModalProps) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <InvoicePreviewPanel
            onClose={onClose}
            onFinalize={onFinalize}
            isFinalizing={isFinalizing}
            activeClient={activeClient}
            selectedTrips={selectedTrips}
            isStandalone={false}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Theme.overlayBackdrop,
    justifyContent: 'flex-end',
  },
  modalContainer: {
    flex: 1,
    marginTop: 60, // Leave some room at top
    backgroundColor: Theme.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    overflow: 'hidden',
  },
});
