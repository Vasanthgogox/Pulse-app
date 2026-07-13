/** Signup persona + provisioning flow (audit reference). */
export const SIGNUP_FLOWCHART = `flowchart TD
  subgraph personas [Top-level personas]
    BU["Business user /sign-up"]
    DR["Driver /driver-signup"]
  end

  BU --> OTP["Phone OTP + resolver"]
  OTP --> OWN[Owner variant]
  OTP --> MEM[Team invite variant]
  OTP --> EXIST[Existing account sign-in]

  OWN --> AUTH1["auth.signUp onboarding_type=owner"]
  MEM --> AUTH2["auth.signUp onboarding_type=member"]
  DR --> AUTH3["auth.signUp role=driver"]

  AUTH1 --> T1[handle_new_user]
  AUTH2 --> T1
  AUTH3 --> T1

  T1 --> U["public.users + profiles"]
  T1 --> ORG{"role=user AND onboarding_type=owner?"}
  ORG -->|yes| O["organizations + org_members"]
  ORG -->|no| SKIP[no org]

  MEM --> JOIN[acceptInvitation]
  DR --> DOCS["driver_profiles + storage + metadata"]
`;
