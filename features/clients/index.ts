export {
  AddClientModal,
  type AddClientFormData,
  type ConnectionInviteeMatch,
} from './components/AddClientModal';
export { default as ClientDetailScreen } from './components/ClientDetailScreen';
export { CustomersTab, type CustomersTabProps } from './components/CustomersTab';
export {
  getClientsByOrganization,
  getClientById,
  getClientDetails,
  getClientByName,
  getClientByPhone,
  createClient,
  updateClient,
  type ClientRow,
  type CreateClientData,
  type UpdateClientData,
} from './services/clients.service';
