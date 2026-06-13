import { ChatScreen } from './ChatScreen';
import { IntegratedChatProvider } from '../contexts/IntegratedChatContext';
import { TripChatProvider } from '../contexts/TripChatContext';

export default function ChatRouteContent() {
  return (
    <TripChatProvider isActive>
      <IntegratedChatProvider isActive>
        <ChatScreen />
      </IntegratedChatProvider>
    </TripChatProvider>
  );
}
