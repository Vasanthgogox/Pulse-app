import { useEffect, useRef, useState } from "react";
import {
  getConnectionInviteeByPhone,
  type ConnectionInviteeByPhone,
} from "@/features/connections/services/connectionRequests.service";
import {
  isPhoneLikeNetworkSearch,
  NETWORK_PHONE_SEARCH_DEBOUNCE_MS,
  normalizedDigitsForNetworkSearch,
} from "@/lib/networkPhoneSearch";

export function useNetworkPhoneLookup(search: string) {
  const [invitee, setInvitee] = useState<ConnectionInviteeByPhone | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const genRef = useRef(0);

  useEffect(() => {
    if (!isPhoneLikeNetworkSearch(search)) {
      setInvitee(null);
      setLoading(false);
      setSearched(false);
      setError(null);
      return;
    }

    const normalized = normalizedDigitsForNetworkSearch(search);
    if (!normalized) {
      setInvitee(null);
      setLoading(false);
      setSearched(false);
      return;
    }

    const gen = ++genRef.current;
    setLoading(true);
    setError(null);
    setSearched(false);

    const timer = setTimeout(() => {
      void getConnectionInviteeByPhone(normalized).then(({ error: err, invitee: row }) => {
        if (gen !== genRef.current) return;
        setLoading(false);
        setSearched(true);
        if (err) {
          setError(err.message);
          setInvitee(null);
          return;
        }
        setError(null);
        setInvitee(row);
      });
    }, NETWORK_PHONE_SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [search]);

  return { invitee, loading, searched, error, isActive: isPhoneLikeNetworkSearch(search) };
}
