import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { TextInput } from 'react-native';

interface RegisteredField {
  id: number;
  inputRef: RefObject<TextInput | null>;
  multiline: boolean;
}

export interface SignUpPulseFormStepContextValue {
  revision: number;
  registerField: (inputRef: RefObject<TextInput | null>, multiline: boolean) => number;
  unregisterField: (id: number) => void;
  handleFieldSubmit: (id: number) => void;
  isLastSingleLineField: (id: number) => boolean;
}

const SignUpPulseFormStepContext = createContext<SignUpPulseFormStepContextValue | null>(
  null,
);

export function useSignUpPulseFormStepContext(): SignUpPulseFormStepContextValue | null {
  return useContext(SignUpPulseFormStepContext);
}

export interface SignUpPulseFormStepProviderProps {
  onPrimary: () => void;
  primaryDisabled: boolean;
  primaryLoading: boolean;
  children: React.ReactNode;
}

export function SignUpPulseFormStepProvider({
  onPrimary,
  primaryDisabled,
  primaryLoading,
  children,
}: SignUpPulseFormStepProviderProps) {
  const fieldsRef = useRef<RegisteredField[]>([]);
  const nextIdRef = useRef(0);
  const [revision, setRevision] = useState(0);

  const bumpRevision = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  const singleLineFields = useCallback(() => {
    return fieldsRef.current.filter((field) => !field.multiline);
  }, []);

  const registerField = useCallback(
    (inputRef: RefObject<TextInput | null>, multiline: boolean) => {
      const id = nextIdRef.current++;
      fieldsRef.current.push({ id, inputRef, multiline });
      bumpRevision();
      return id;
    },
    [bumpRevision],
  );

  const unregisterField = useCallback(
    (id: number) => {
      const before = fieldsRef.current.length;
      fieldsRef.current = fieldsRef.current.filter((field) => field.id !== id);
      if (fieldsRef.current.length !== before) {
        bumpRevision();
      }
    },
    [bumpRevision],
  );

  const isLastSingleLineField = useCallback(
    (id: number) => {
      const chain = singleLineFields();
      return chain.length > 0 && chain[chain.length - 1]?.id === id;
    },
    [singleLineFields],
  );

  const handleFieldSubmit = useCallback(
    (id: number) => {
      const chain = singleLineFields();
      const index = chain.findIndex((field) => field.id === id);
      if (index < 0) return;

      if (index < chain.length - 1) {
        chain[index + 1]?.inputRef.current?.focus();
        return;
      }

      if (!primaryDisabled && !primaryLoading) {
        onPrimary();
      }
    },
    [onPrimary, primaryDisabled, primaryLoading, singleLineFields],
  );

  const value = useMemo(
    () => ({
      revision,
      registerField,
      unregisterField,
      handleFieldSubmit,
      isLastSingleLineField,
    }),
    [revision, registerField, unregisterField, handleFieldSubmit, isLastSingleLineField],
  );

  return (
    <SignUpPulseFormStepContext.Provider value={value}>
      {children}
    </SignUpPulseFormStepContext.Provider>
  );
}
