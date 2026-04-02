/**
 * Ops Agent service — production-grade tool-calling conversational agent.
 *
 * Flow: UI → processOpsMessage() → LLM (with tools) → Tool Guard Layer (validation +
 * backend confirmation, expiry, rate limit) → Action Layer (handleCreateClient) → DB →
 * LLM follow-up (no tools) → reply to UI.
 *
 * Guardrails: idempotency (getClientByPhone), confirmation + expiry (5 min),
 * cancel handling, rate limit (5/min per user), payload locking, audit logging.
 */
import {
  GoogleGenAI,
  Type,
  type Content,
  type FunctionCall,
  type FunctionDeclaration,
  type Schema,
  FunctionCallingConfigMode,
  createPartFromFunctionResponse,
  createPartFromText,
  createUserContent,
} from '@google/genai';
import Constants from 'expo-constants';
import {
  canAccessClients,
  canAccessSuppliers,
  canAccessVehicles,
  canAccessDrivers,
  canAccessTrips,
} from '@/lib/capabilities';
import type { Capability } from '@/lib/capabilities';
import { validateEmail } from '@/lib/emailValidation';
import { VALIDATION, validateIndianVehicleNumber } from '@/lib/validation';
import { createClient, getClientByName, getClientByPhone } from '@/features/clients';
import { createSupplier } from '@/features/suppliers';
import { createVehicle } from '@/features/vehicles';
import { createDriver } from '@/features/drivers';
import type { DriverFormData } from '@/features/drivers';
import { createTrip } from '@/features/trips';

const MODEL = 'gemini-2.0-flash';
const MAX_HISTORY_TURNS = 20;
/** Confirmation dialog valid for 5 minutes. */
export const CONFIRM_EXPIRY_MS = 5 * 60 * 1000;
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_CREATES = 5;

/** In-memory rate limit: userId -> timestamps of recent create_* executions (any entity). */
const rateLimitMap = new Map<string, number[]>();

function pruneRateLimit(userId: string): void {
  const now = Date.now();
  const list = rateLimitMap.get(userId) ?? [];
  const kept = list.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (kept.length === 0) rateLimitMap.delete(userId);
  else rateLimitMap.set(userId, kept);
}

function checkRateLimit(userId: string): boolean {
  pruneRateLimit(userId);
  const list = rateLimitMap.get(userId) ?? [];
  return list.length < RATE_LIMIT_MAX_CREATES;
}

function recordRateLimit(userId: string): void {
  const list = rateLimitMap.get(userId) ?? [];
  list.push(Date.now());
  rateLimitMap.set(userId, list);
}

/** Structured audit log for ops actions (debug + production audit). */
function logOpsAgent(payload: {
  userId?: string;
  action: string;
  success: boolean;
  phone?: string;
  vehicle_number?: string;
  error?: string;
  timestamp: number;
}): void {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log('[OpsAgent]', JSON.stringify(payload));
  }
}

const SYSTEM_INSTRUCTION = `You are an Ops assistant for a fleet and logistics mobile app. You complete tasks in two steps: (1) collect required details in chat; (2) when you have everything, call the create_* tool immediately. The app will show a single confirmation card where the user can review, edit, and tap Create/Add. Do NOT ask the user to type "yes" or "confirm" in the chat—the card is the only confirmation.

**CRITICAL — only user input:**
- Use ONLY the exact text the user typed in their messages for contact_person, phone, and organization_name. Do not invent, infer, guess, or use any default/example/mock/random values.
- If the user says "create client" or "add a client" with no name or no phone, do NOT call the tool. Ask the user to provide the contact person name and phone number. Wait until they type both in the conversation.
- If the user gives only a name (e.g. "create client Vasanth"), ask for the phone number. Do not make up a phone number.
- If the user gives only a phone, ask for the contact person name. Do not make up a name.
- Never use placeholder values like "test", "John Doe", "123-456-7890", or "N/A". Never fill missing fields with your own guess.

**Add client — flow:**
1. Collect: When the user says "add a client" or "create a client", ask for contact person name (required) and phone (required). Optional: company/organization name. Use ONLY what the user typed or extracted from an attached image. Do not call the tool until both name and phone are provided.
2. When you have both name and phone: call create_client immediately. Do not ask "Reply yes to proceed" in chat. Reply with one short sentence, e.g. "Review the details below and tap Create client to save." The app will show a confirmation card; that is the only confirmation step.
If the tool returns an error (e.g. invalid phone or duplicate), tell the user and ask for the correct information.

**Add supplier — flow:**
1. Collect: phone (required), and at least one of company name or contact person. Optional: email. If missing, ask for it.
2. When you have phone and (company_name or contact_person): call create_supplier immediately. Reply briefly, e.g. "Review below and tap Add supplier to save." Do not ask the user to type "yes" in chat.

**Add vehicle (own asset) — flow:**
1. Collect: vehicle number/registration (required). Optional: brand, body type, size, axle.
2. When you have vehicle_number: call create_vehicle immediately. Reply briefly, e.g. "Review below and tap Add vehicle to save." Do not ask for "yes" in chat.

**Add driver (salaried) — flow:**
1. Collect: name (required), phone (required), DL number (required). Optional: salary, commission %, per km.
2. When you have name, phone, and license_number: call create_driver immediately. Reply briefly, e.g. "Review below and tap Add driver to save." Do not ask for "yes" in chat.

**Add trip — flow:**
1. Collect: origin (pickup), destination (drop), client name, trip rate (₹). Ask: "Own fleet (asset) or partner (aggregate)?" If aggregate, ask for supplier rate (₹).
2. When you have all required fields: call create_trip immediately. Reply briefly, e.g. "Review below and tap Create trip to confirm." Do not ask the user to type "yes" in chat.

**Image / OCR:** If the user attaches an image (e.g. business card, document, license, registration), look at the image and extract any visible text that could be used for the entity they are adding (client, supplier, driver, or vehicle). Use extracted text for: names, phone numbers, company name, email, vehicle number, brand, DL number, etc. In your reply, summarize what you found and pre-fill those details; ask the user only for any required fields that are missing or unclear. If they said "add a client" and the image has a name and phone, use them and ask for confirmation. Do not invent data that is not visible in the image.

**Interrupt / cancel:** If the user says "cancel", "stop", "abort", or "never mind", stop the flow immediately. Acknowledge that the operation was cancelled. Do not ask for more details or call any tool.

**Communication — natural language only:** Always reply in plain, natural language so the user understands what was done or what to do next. Never output code blocks, \`\`\`tool_code\`\`\`, API calls, or function syntax. Examples of good replies: "I've prepared the client. Confirm in the dialog to save." / "Vehicle added. Review the details below and confirm or edit if needed." / "Your revenue this period shows a net inflow of ₹X." Bad: any \`print(...)\`, \`create_vehicle(...)\`, or raw code. Keep instructions simple: one short sentence for what you did, then what the user should do (e.g. "Confirm in the dialog" or "Edit below if needed and tap Add vehicle").

**Answering questions about data:** You can also help the user understand their business data. When they ask about revenue, cash flow, vehicles, drivers, clients, or suppliers (e.g. "What's my revenue?", "How many vehicles do I have?", "Explain my revenue summary"), call the appropriate get_* tool first: get_revenue_summary for money in/out and net; get_vehicle_details for fleet list; get_driver_summary for drivers; get_entity_counts for counts of clients, suppliers, drivers, vehicles. Then summarize the tool result in clear, friendly language. Explain what the numbers mean and offer brief insights (e.g. "Your net inflow is positive" or "You have 3 vehicles in the fleet"). Do not invent data; only use what the tools return.

**Reports:** When the user asks for a "report", "summary report", "give me a report", "download report", or "export report", call get_report. The app will display the report in a formatted card and offer a PDF download. Reply briefly that the report is ready and they can download it as PDF.

**CRITICAL — Only use entities that exist in the database:** When the user asks to create a trip (or reference a client, supplier, driver, or vehicle), you will receive a list of available entities that exist in their database. You MUST use ONLY those names/identifiers. Do NOT invent or assume client/supplier/driver/vehicle names. If the user says a name that is NOT in the provided list:
- Reply clearly: "[Name] is not in your [clients/suppliers/drivers/vehicles] list. Please add [Name] first: say \"Add a client\" (or \"Add a supplier\" / \"Add a driver\" / \"Add a vehicle\") or add them from the app (Clients, Suppliers, Resources > Drivers, Resources > Vehicles), then create the trip."
- Do NOT call create_trip with that name. Do NOT add fake or placeholder entities. The user must add the entity in its node first, then use it in a trip.

**Ledger and transaction updates (core accounting model):** When you discuss, suggest, or (if a ledger/transaction tool is available) create or update ledger entries, follow this logic so every transaction aligns with double-entry accounting. Balance is always computed from transaction history; never suggest direct balance editing.
- **Customer payment (Cash IN):** "Client paid X" / "Received X from [client]" → record as amount_in, contact_type client, party_name = customer name. Logical: Dr Cash/Bank, Cr Accounts Receivable. Reduces customer outstanding.
- **Supplier payment (Cash OUT):** "Paid supplier X" / "Paid [supplier name] X" → record as amount_out, contact_type supplier, party_name = supplier name, description e.g. SUPPLIER. Logical: Dr Accounts Payable, Cr Cash/Bank. Reduces supplier payable.
- **Driver payment (Cash OUT):** "Paid driver X" / "Driver salary X" / "Commission to [driver]" → record as amount_out, contact_type driver, party_name = driver name (or "Driver salary"), description = payment type: Monthly salary, Trip-based commission, Advance, Reimbursement, Adjustment, or Deduction. Logical: Dr Driver Payable, Cr Cash/Bank.
- **Vehicle expense (Cash OUT):** "Fuel X", "Maintenance X", "Toll X", "Vehicle expense X" → do NOT use "vehicle" as the party. Use the **expense type** as the party/category: Fuel, Maintenance, Toll, Repair, or Other. Record as amount_out, no contact_id, party_name = expense type (e.g. Fuel), description = same (e.g. FUEL). Logical: Dr Vehicle Expense, Cr Cash/Bank. Vehicle P&L is updated by expense type.
- When explaining revenue, outstanding, or ledger: Customer ledger = receivable (AR); Supplier ledger = payable (AP); Driver ledger = salary + commission + advances − deductions; Vehicle = revenue allocated − expenses (fuel, maintenance, toll, etc.). Use these terms consistently.`;

function buildSystemInstructionWithEntityLists(opsContext?: OpsContext): string {
  let text = SYSTEM_INSTRUCTION;
  const hasLists =
    (opsContext?.availableClientNames?.trim()?.length ?? 0) > 0 ||
    (opsContext?.availableSupplierNames?.trim()?.length ?? 0) > 0 ||
    (opsContext?.availableDriverNames?.trim()?.length ?? 0) > 0 ||
    (opsContext?.availableVehicleNumbers?.trim()?.length ?? 0) > 0;
  if (!hasLists) return text;
  text += '\n\n**Available entities in the database (use ONLY these when creating trips or referencing entities; do not invent names):**\n';
  if (opsContext?.availableClientNames?.trim()) {
    text += `Clients: ${opsContext.availableClientNames.trim()}\n`;
  }
  if (opsContext?.availableSupplierNames?.trim()) {
    text += `Suppliers: ${opsContext.availableSupplierNames.trim()}\n`;
  }
  if (opsContext?.availableDriverNames?.trim()) {
    text += `Drivers: ${opsContext.availableDriverNames.trim()}\n`;
  }
  if (opsContext?.availableVehicleNumbers?.trim()) {
    text += `Vehicles: ${opsContext.availableVehicleNumbers.trim()}\n`;
  }
  text += 'If the user mentions a client, supplier, driver, or vehicle name that is NOT in the lists above, do not create a trip with it. Tell them to add that entity first (e.g. say "Add a client" or add from the Clients/Suppliers/Resources page), then create the trip.';
  return text;
}

const CREATE_CLIENT_SCHEMA: Schema = {
  type: Type.OBJECT,
  description: 'Payload to create a new client in the organization.',
  properties: {
    contact_person: {
      type: Type.STRING,
      description: 'Full name of the contact person (required).',
    },
    phone: {
      type: Type.STRING,
      description: 'Phone number (required).',
    },
    organization_name: {
      type: Type.STRING,
      description: 'Company or organization name (optional).',
    },
  },
  required: ['contact_person', 'phone'],
};

const CREATE_SUPPLIER_SCHEMA: Schema = {
  type: Type.OBJECT,
  description: 'Payload to create a new supplier. Requires phone and at least one of company_name or contact_person.',
  properties: {
    phone: { type: Type.STRING, description: 'Phone number (required).' },
    company_name: { type: Type.STRING, description: 'Company or organization name (optional but prefer with contact_person).' },
    contact_person: { type: Type.STRING, description: 'Contact person name (optional but prefer with company_name).' },
    email: { type: Type.STRING, description: 'Email (optional).' },
    supplier_type: {
      type: Type.STRING,
      description: 'One of: integrated, offline, marketplace. Default offline.',
      enum: ['integrated', 'offline', 'marketplace'],
    },
  },
  required: ['phone'],
};

const CREATE_VEHICLE_SCHEMA: Schema = {
  type: Type.OBJECT,
  description: 'Payload to add an own-asset vehicle. Required: vehicle_number. Optional: vehicle_brand, vehicle_body_type, vehicle_size, vehicle_axle.',
  properties: {
    vehicle_number: { type: Type.STRING, description: 'Vehicle registration / number (required).' },
    vehicle_brand: { type: Type.STRING, description: 'Brand (e.g. Tata, Ashok Leyland).' },
    vehicle_body_type: { type: Type.STRING, description: 'Body type (e.g. Tipper, Cargo).' },
    vehicle_size: { type: Type.STRING, description: 'Size (e.g. 28ft, 32ft).' },
    vehicle_axle: { type: Type.STRING, description: 'Axle (e.g. 6x4).' },
  },
  required: ['vehicle_number'],
};

const CREATE_DRIVER_SCHEMA: Schema = {
  type: Type.OBJECT,
  description: 'Payload to add a salaried driver. Required: name, phone, license_number (DL). Optional: fixed salary (payable_amount), commission_percent, commission_per_km.',
  properties: {
    name: { type: Type.STRING, description: 'Driver / contact name (required).' },
    phone: { type: Type.STRING, description: 'Phone number (required).' },
    license_number: { type: Type.STRING, description: 'Driving license number / DL number (required).' },
    payable_amount: { type: Type.NUMBER, description: 'Fixed salary (₹) optional.' },
    commission_percent: { type: Type.NUMBER, description: 'Trips commission in % optional.' },
    commission_per_km: { type: Type.NUMBER, description: 'Per km pay (₹/km) optional.' },
  },
  required: ['name', 'phone', 'license_number'],
};

const CREATE_TRIP_SCHEMA: Schema = {
  type: Type.OBJECT,
  description:
    'Payload to create a trip. Required: pickup_area (origin), drop_location (destination), client_name, client_price (trip rate), supply_source (asset or aggregate). When supply_source is aggregate, supplier_rate is required.',
  properties: {
    pickup_area: { type: Type.STRING, description: 'Origin / pickup location (required).' },
    drop_location: { type: Type.STRING, description: 'Destination / drop location (required).' },
    client_name: { type: Type.STRING, description: 'Client or customer name (required).' },
    client_price: { type: Type.NUMBER, description: 'Trip rate: amount charged to client (₹) (required).' },
    supply_source: {
      type: Type.STRING,
      description: "Either 'asset' (own fleet) or 'aggregate' (outsourced / partner). Required.",
      enum: ['asset', 'aggregate'],
    },
    supplier_rate: {
      type: Type.NUMBER,
      description: 'Amount paid to supplier/partner (₹). Required when supply_source is aggregate; use 0 for asset.',
    },
  },
  required: ['pickup_area', 'drop_location', 'client_name', 'client_price', 'supply_source'],
};

const GET_DATA_TOOLS: { functionDeclarations: FunctionDeclaration[] } = {
  functionDeclarations: [
    {
      name: 'get_revenue_summary',
      description:
        'Returns a short summary of the organization\'s revenue/cash flow: total amount in, total out, net, and transaction count. Call this when the user asks about revenue, cash flow, money in/out, or ledger summary.',
      parameters: { type: Type.OBJECT, description: 'No parameters.', properties: {} },
    },
    {
      name: 'get_vehicle_details',
      description:
        'Returns a summary of the fleet: count and list of vehicles (number, brand, body type, etc.). Call when the user asks about vehicles, fleet, or garage.',
      parameters: { type: Type.OBJECT, description: 'No parameters.', properties: {} },
    },
    {
      name: 'get_driver_summary',
      description:
        'Returns a summary of drivers: count and names. Call when the user asks about drivers or payroll.',
      parameters: { type: Type.OBJECT, description: 'No parameters.', properties: {} },
    },
    {
      name: 'get_entity_counts',
      description:
        'Returns counts of clients, suppliers, drivers, and vehicles. Call when the user asks how many clients/suppliers/drivers/vehicles they have or for an overview of entity counts.',
      parameters: { type: Type.OBJECT, description: 'No parameters.', properties: {} },
    },
    {
      name: 'get_report',
      description:
        'Returns a full summary report (revenue, entity counts, fleet, drivers) for display and PDF download. Call when the user asks for a "report", "summary report", "give me a report", "download report", or "export report". The app will show the report in a formatted card and offer a PDF download.',
      parameters: { type: Type.OBJECT, description: 'No parameters.', properties: {} },
    },
  ],
};

const CREATE_CLIENT_TOOL: { functionDeclarations: FunctionDeclaration[] } = {
  functionDeclarations: [
    {
      name: 'create_client',
      description:
        'Prepares the client for saving. Call when the user has provided both contact_person and phone (use only what they typed or extracted from image). The app will show a confirmation card; the user confirms there. Do not ask the user to type "yes" in chat. Never use placeholder or invented values.',
      parameters: CREATE_CLIENT_SCHEMA,
    },
    {
      name: 'create_supplier',
      description:
        'Prepares the supplier. Call when the user has provided phone and at least one of company_name or contact_person. The app shows a confirmation card; do not ask for "yes" in chat.',
      parameters: CREATE_SUPPLIER_SCHEMA,
    },
    {
      name: 'create_vehicle',
      description:
        'Prepares the vehicle. Call when the user has provided vehicle_number (optional: brand, body type, size, axle). The app shows a confirmation card; do not ask for "yes" in chat.',
      parameters: CREATE_VEHICLE_SCHEMA,
    },
    {
      name: 'create_driver',
      description:
        'Prepares the driver. Call when the user has provided name, phone, and license_number. Optional: payable_amount, commission_percent, commission_per_km. The app shows a confirmation card; do not ask for "yes" in chat.',
      parameters: CREATE_DRIVER_SCHEMA,
    },
    {
      name: 'create_trip',
      description:
        'Prepares the trip. Call when the user has provided pickup_area, drop_location, client_name, client_price, supply_source (asset/aggregate), and supplier_rate if aggregate. The app shows a confirmation card; do not ask for "yes" in chat.',
      parameters: CREATE_TRIP_SCHEMA,
    },
  ],
};

export interface OpsMessage {
  role: 'user' | 'system';
  content: string;
}

/** Session state for confirmation expiry and payload locking. UI should pass this back on the next call. */
export interface OpsSessionState {
  /** When the assistant asked "Should I save?" (ms since epoch). Used for 5-min expiry. */
  confirmationRequestedAt?: number;
  /** Locked payload to use on confirm; avoids model re-extracting different values. */
  pendingCreateClientPayload?: {
    contact_person: string;
    phone: string;
    organization_name?: string;
  };
  pendingCreateSupplierPayload?: {
    phone: string;
    company_name?: string;
    contact_person?: string;
    email?: string;
    supplier_type?: 'integrated' | 'offline' | 'marketplace';
  };
  pendingCreateVehiclePayload?: {
    vehicle_number: string;
    vehicle_brand?: string;
    vehicle_body_type?: string;
    vehicle_size?: string;
    vehicle_axle?: string;
  };
  pendingCreateDriverPayload?: {
    name: string;
    phone: string;
    license_number: string;
    payable_amount?: number;
    commission_percent?: number;
    commission_per_km?: number;
  };
  pendingCreateTripPayload?: {
    pickup_area: string;
    drop_location: string;
    client_name: string;
    client_price: number;
    supply_source: 'asset' | 'aggregate';
    supplier_rate: number;
  };
}

/** Table data for report card (ledger-style table view). */
export interface ReportTableData {
  headers: string[];
  rows: string[][];
}

/** Pre-fetched summaries for the AI to use when answering questions about revenue, vehicles, drivers, etc. */
export interface OpsContext {
  revenueSummary?: string;
  vehicleSummary?: string;
  driverSummary?: string;
  entityCounts?: string;
  /** Optional table data for in-chat report (ledger-style). */
  revenueTable?: ReportTableData;
  entityCountsTable?: ReportTableData;
  vehicleTable?: ReportTableData;
  driverTable?: ReportTableData;
  /** Comma-separated names of clients in the DB. AI must only use these for create_trip; if user says a name not here, tell them to add client first. */
  availableClientNames?: string;
  /** Comma-separated supplier names in the DB. For aggregate trips only these are valid. */
  availableSupplierNames?: string;
  /** Comma-separated driver names in the DB. */
  availableDriverNames?: string;
  /** Comma-separated vehicle numbers in the DB. */
  availableVehicleNumbers?: string;
}

/** Image attached to the last user message (e.g. for OCR). Base64 data. */
export interface LastMessageImage {
  mimeType: string;
  data: string;
}

export interface ProcessOpsMessageOptions {
  messages: OpsMessage[];
  organizationId: string | null;
  capabilities: Capability[];
  /** For rate limiting and audit logging. */
  userId?: string;
  /** Pass back the state returned from the previous call for expiry and payload lock. */
  sessionState?: OpsSessionState;
  /** Optional: pre-fetched data summaries so the AI can answer questions about revenue, vehicles, drivers. */
  opsContext?: OpsContext;
  /** Optional: image attached to the last user message (base64). Used for OCR to extract client/supplier/driver/vehicle details. */
  lastUserMessageImage?: LastMessageImage;
}

/** Report section: body for PDF/fallback; table for in-app ledger-style table view. */
export interface ChatReportSection {
  title: string;
  body?: string;
  table?: ReportTableData;
}

/** Structured report for in-chat display and PDF export. */
export interface ChatReportData {
  title: string;
  generatedAt: string;
  sections: ChatReportSection[];
}

export interface ProcessOpsMessageResult {
  reply: string;
  executed: boolean;
  error?: string;
  /** Updated state to pass back on next call (confirmation timestamp, locked payload). */
  sessionState?: OpsSessionState;
  /** When true, UI must show confirmation dialog; only create after user confirms. */
  requiresUiConfirmation?: boolean;
  /** When get_report was called, structured data for report card and PDF. */
  reportData?: ChatReportData;
}

function getApiKey(): string | undefined {
  const extra = Constants.expoConfig?.extra as { geminiApiKey?: string } | undefined;
  const fromExtra = extra?.geminiApiKey?.trim();
  const fromEnv =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_GEMINI_API_KEY
      ? String(process.env.EXPO_PUBLIC_GEMINI_API_KEY).trim()
      : '';
  return fromExtra || fromEnv || undefined;
}

/** Proxy URL: Supabase project functions. Uses same source as lib/supabase so config is consistent. */
function getOpsAgentProxyUrl(): string | undefined {
  const extra = Constants.expoConfig?.extra as { supabaseUrl?: string; opsAgentProxyUrl?: string } | undefined;
  const explicit = extra?.opsAgentProxyUrl?.trim() || (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_OPS_AGENT_PROXY_URL?.trim());
  if (explicit) return explicit;
  const base =
    extra?.supabaseUrl?.trim() ||
    (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_SUPABASE_URL?.trim()) ||
    (() => {
      try {
        const { getSupabaseBaseUrl } = require('@/lib/supabase');
        return getSupabaseBaseUrl()?.trim();
      } catch {
        return undefined;
      }
    })();
  if (base) return `${base.replace(/\/$/, '')}/functions/v1/ops-agent-chat`;
  return undefined;
}

/** Response shape from proxy or from SDK (normalized for use below). */
type GenerateContentResult = {
  text?: string;
  functionCalls?: FunctionCall[];
  candidates?: Array<{ content?: { parts?: unknown[] } }>;
};

/** When true, we have proxy + session so we must not fall back to client key (use Edge Function only). */
const useProxyOnly = (proxyUrl: string | undefined, accessToken: string | null | undefined) =>
  Boolean(proxyUrl && accessToken);

/** Call Gemini via backend proxy when configured and user is signed in; otherwise fallback to client-side key. */
async function generateContent(
  params: {
    contents: Content[];
    configWithTools: Record<string, unknown>;
    configTextOnly: Record<string, unknown>;
  },
  useTools: boolean
): Promise<GenerateContentResult> {
  const proxyUrl = getOpsAgentProxyUrl();
  const { supabase, getSupabaseAnonKey, getAccessToken } = await import('@/lib/supabase');
  const anonKey = getSupabaseAnonKey();
  const accessToken = await getAccessToken();
  const proxyOnly = useProxyOnly(proxyUrl, accessToken);

  if (proxyUrl && !accessToken) {
    throw new Error('No active session. Sign in and try Ops Agent again.');
  }

  if (proxyUrl && accessToken && anonKey && accessToken !== anonKey) {
    try {
      const config = useTools ? params.configWithTools : params.configTextOnly;
      const res = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'X-User-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: params.contents,
          systemInstruction: config.systemInstruction,
          tools: config.tools,
          toolConfig: config.toolConfig,
        }),
      });
      if (res.ok) {
        return (await res.json()) as GenerateContentResult;
      }
      const err = await res.json().catch(() => ({})) as { detail?: string; message?: string; error?: string };
      const msg = err.detail ?? err.message ?? err.error ?? res.statusText;
      if (res.status === 401) {
        try {
          await supabase().auth.signOut({ scope: 'local' });
        } catch {
          // ignore
        }
        throw new Error(msg ? `Session invalid (401): ${msg}. Sign in again and try Ops Agent.` : 'Session invalid. Sign in again and try Ops Agent.');
      }
      const statusHint = res.status === 503 ? ' Set GEMINI_API_KEY in Edge Function secrets.' : ` (HTTP ${res.status})`;
      if (proxyOnly) {
        throw new Error(msg + statusHint + ' Check function logs: Dashboard → Edge Functions → ops-agent-chat → Logs.');
      }
      if (__DEV__ && [404, 502, 503].includes(res.status) && getApiKey()) {
        return await generateContentWithClientKey(params, useTools);
      }
      throw new Error(msg);
    } catch (e) {
      if (proxyOnly) throw e;
      if (__DEV__ && getApiKey()) {
        return await generateContentWithClientKey(params, useTools);
      }
      throw e;
    }
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      proxyUrl
        ? 'Sign in to use Ops Agent (it uses the Edge Function).'
        : 'Ops Agent is not configured. Deploy ops-agent-chat and set EXPO_PUBLIC_SUPABASE_URL (or set EXPO_PUBLIC_GEMINI_API_KEY for dev without proxy).'
    );
  }
  return await generateContentWithClientKey(params, useTools);
}

async function generateContentWithClientKey(
  params: { contents: Content[]; configWithTools: Record<string, unknown>; configTextOnly: Record<string, unknown> },
  useTools: boolean
): Promise<GenerateContentResult> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('Proxy unavailable. Set EXPO_PUBLIC_GEMINI_API_KEY in .env for local dev without deploying the function.');
  const ai = new GoogleGenAI({ apiKey });
  const config = useTools ? params.configWithTools : params.configTextOnly;
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: params.contents,
    config,
  });
  return {
    text: response.text,
    functionCalls: response.functionCalls,
    candidates: response.candidates,
  };
}

/**
 * Maps UI messages to Gemini Content array. Caps history to avoid token limits.
 * Role "system" in UI = assistant/model reply; "user" = user message.
 * If lastUserMessageImage is provided, the last user turn gets an extra image part (for OCR).
 */
function buildContents(messages: OpsMessage[], lastUserMessageImage?: LastMessageImage): Content[] {
  const trimmed = messages.slice(-MAX_HISTORY_TURNS * 2);
  const contents: Content[] = [];
  const lastIndex = trimmed.length - 1;
  for (let i = 0; i < trimmed.length; i++) {
    const msg = trimmed[i];
    const textPart = createPartFromText(msg.content);
    if (msg.role === 'user') {
      const isLastUser = i === lastIndex;
      const parts = isLastUser && lastUserMessageImage
        ? [textPart, { inlineData: { mimeType: lastUserMessageImage.mimeType, data: lastUserMessageImage.data } } as { inlineData: { mimeType: string; data: string } }]
        : [textPart];
      contents.push({ role: 'user', parts });
    } else {
      contents.push({ role: 'model', parts: [textPart] });
    }
  }
  return contents;
}

const PLACEHOLDER_NAMES = /^(test|example|demo|foo|bar|john doe|jane doe|n\/?a|unknown|—|--)$/i;
const PLACEHOLDER_PHONES = /^(123-?456-?7890|1234567890|000+)$/i;
const PLACEHOLDER_VEHICLE_NUMBERS = /^(test|demo|example|xx00xx0000)$/i;

/** User can cancel the flow at any time. */
const CANCEL_KEYWORDS = /\b(cancel|stop|abort|never mind|nevermind)\b/i;

function validateCreateClientArgs(args: Record<string, unknown>): string | null {
  const contact = typeof args.contact_person === 'string' ? args.contact_person.trim() : '';
  const phone = typeof args.phone === 'string' ? args.phone.trim() : '';
  if (!contact) return 'Contact person name is required.';
  if (!phone) return 'Phone number is required.';
  if (PLACEHOLDER_NAMES.test(contact) || contact.length < 2) {
    return 'Contact person name must be the exact name the user typed in the conversation; do not use placeholders, "Unknown", or invented names. Ask the user for the name.';
  }
  if (contact.length > VALIDATION.NAME_MAX_LENGTH) {
    return `Contact person name must be at most ${VALIDATION.NAME_MAX_LENGTH} characters.`;
  }
  const digitsOnly = phone.replace(/\D/g, '');
  const tenDigits =
    digitsOnly.length === 10
      ? digitsOnly
      : digitsOnly.length === 12 && digitsOnly.startsWith('91')
        ? digitsOnly.slice(2)
        : null;
  if (tenDigits === null) {
    return 'Phone must be 10 digits or +91 followed by 10 digits. Please ask the user to re-enter.';
  }
  if (PLACEHOLDER_PHONES.test(tenDigits)) {
    return 'Phone must be the exact number the user typed; do not use example or invented numbers. Ask the user for their phone number.';
  }
  return null;
}

function validatePhone(phone: string): string | null {
  const digitsOnly = phone.replace(/\D/g, '');
  const tenDigits =
    digitsOnly.length === 10
      ? digitsOnly
      : digitsOnly.length === 12 && digitsOnly.startsWith('91')
        ? digitsOnly.slice(2)
        : null;
  if (tenDigits === null) {
    return 'Phone must be 10 digits or +91 followed by 10 digits. Please ask the user to re-enter.';
  }
  if (PLACEHOLDER_PHONES.test(tenDigits)) {
    return 'Phone must be the exact number the user typed; do not use example numbers.';
  }
  return null;
}

function validateCreateSupplierArgs(args: Record<string, unknown>): string | null {
  const phone = typeof args.phone === 'string' ? args.phone.trim() : '';
  if (!phone) return 'Phone number is required for a supplier.';
  const phoneErr = validatePhone(phone);
  if (phoneErr) return phoneErr;
  const company = typeof args.company_name === 'string' ? args.company_name.trim() : '';
  const contact = typeof args.contact_person === 'string' ? args.contact_person.trim() : '';
  if (!company && !contact) {
    return 'Please ask the user for either company name or contact person name (at least one required).';
  }
  if (company && (PLACEHOLDER_NAMES.test(company) || company.length < 2)) {
    return 'Company name must be what the user typed; do not use placeholders.';
  }
  if (contact && (PLACEHOLDER_NAMES.test(contact) || contact.length < 2)) {
    return 'Contact person name must be what the user typed; do not use placeholders.';
  }
  if (company.length > VALIDATION.COMPANY_NAME_MAX_LENGTH) {
    return `Company name must be at most ${VALIDATION.COMPANY_NAME_MAX_LENGTH} characters.`;
  }
  if (contact.length > VALIDATION.NAME_MAX_LENGTH) {
    return `Contact person name must be at most ${VALIDATION.NAME_MAX_LENGTH} characters.`;
  }
  const supplier_type = args.supplier_type;
  if (
    supplier_type !== undefined &&
    supplier_type !== null &&
    !['integrated', 'offline', 'marketplace'].includes(String(supplier_type).toLowerCase())
  ) {
    return 'supplier_type must be one of: integrated, offline, marketplace.';
  }
  return null;
}

function validateCreateVehicleArgs(args: Record<string, unknown>): string | null {
  const num = typeof args.vehicle_number === 'string' ? args.vehicle_number.trim() : '';
  if (!num) return 'Vehicle number (registration) is required.';
  if (PLACEHOLDER_NAMES.test(num) || /^(test|example|n\/?a|—|--)$/i.test(num)) {
    return 'Vehicle number must be what the user typed; do not use placeholders.';
  }
  const formatErr = validateIndianVehicleNumber(num);
  if (formatErr) return formatErr;
  return null;
}

function validateCreateDriverArgs(args: Record<string, unknown>): string | null {
  const name = typeof args.name === 'string' ? args.name.trim() : '';
  const phone = typeof args.phone === 'string' ? args.phone.trim() : '';
  const license = typeof args.license_number === 'string' ? args.license_number.trim() : '';
  if (!name) return 'Driver name is required.';
  if (!phone) return 'Driver phone number is required.';
  if (!license) return 'DL number (driving license) is required.';
  if (PLACEHOLDER_NAMES.test(name) || name.length < 2) {
    return 'Driver name must be the exact name the user typed; do not use placeholders.';
  }
  const phoneErr = validatePhone(phone);
  if (phoneErr) return phoneErr;
  if (license.length < 5) return 'DL number is too short. Ask the user for the driving license number.';
  return null;
}

function validateCreateTripArgs(args: Record<string, unknown>): string | null {
  const pickup = typeof args.pickup_area === 'string' ? args.pickup_area.trim() : '';
  const drop = typeof args.drop_location === 'string' ? args.drop_location.trim() : '';
  const clientName = typeof args.client_name === 'string' ? args.client_name.trim() : '';
  const price = typeof args.client_price === 'number' && Number.isFinite(args.client_price) ? args.client_price : NaN;
  const source = args.supply_source === 'asset' || args.supply_source === 'aggregate' ? args.supply_source : '';
  if (!pickup) return 'Origin (pickup location) is required.';
  if (!drop) return 'Destination (drop location) is required.';
  if (!clientName) return 'Client name is required.';
  if (clientName.length < 2 || PLACEHOLDER_NAMES.test(clientName)) {
    return 'Client name must be what the user typed; do not use placeholders.';
  }
  if (Number.isNaN(price) || price < 0) return 'Trip rate (client price) is required and must be a valid amount (₹).';
  if (!source) return 'Please ask the user: is this trip using your own fleet (asset) or a partner (aggregate)?';
  if (source === 'aggregate') {
    const supplierRate = typeof args.supplier_rate === 'number' && Number.isFinite(args.supplier_rate) ? args.supplier_rate : NaN;
    if (Number.isNaN(supplierRate) || supplierRate < 0) {
      return 'For aggregate trips, the supplier rate (amount paid to partner) is required. Ask the user for the supplier rate.';
    }
  }
  return null;
}

async function handleCreateClient(
  args: Record<string, unknown>,
  organizationId: string | null,
  capabilities: Capability[],
  userId?: string
): Promise<{ output?: Record<string, unknown>; error?: string }> {
  const validationError = validateCreateClientArgs(args);
  if (validationError) return { error: validationError };

  if (!organizationId) {
    return { error: 'No organization selected. Please sign in or switch organization and try again.' };
  }

  if (!canAccessClients(capabilities)) {
    return { error: "You don't have permission to add clients." };
  }

  const contact_person = String(args.contact_person ?? '').trim();
  const phone = String(args.phone ?? '').trim();
  const organization_name =
    typeof args.organization_name === 'string' && args.organization_name.trim()
      ? args.organization_name.trim()
      : undefined;

  const { error: existingError, client: existing } = await getClientByPhone(organizationId, phone);
  if (existingError) {
    return { error: existingError.message };
  }
  if (existing) {
    return { error: `A client with phone number ${phone} already exists.` };
  }

  const { error, client } = await createClient(organizationId, {
    contact_person,
    phone,
    organization_name,
  });

  if (error) {
    logOpsAgent({
      userId,
      action: 'create_client',
      success: false,
      phone,
      error: error.message,
      timestamp: Date.now(),
    });
    return { error: error.message };
  }
  logOpsAgent({
    userId,
    action: 'create_client',
    success: true,
    phone,
    timestamp: Date.now(),
  });
  return {
    output: {
      success: true,
      message: client ? `Client "${client.name}" added successfully.` : 'Client created.',
      client,
    },
  };
}

async function handleCreateSupplier(
  args: Record<string, unknown>,
  organizationId: string | null,
  capabilities: Capability[],
  userId?: string
): Promise<{ output?: Record<string, unknown>; error?: string }> {
  const validationError = validateCreateSupplierArgs(args);
  if (validationError) return { error: validationError };

  if (!organizationId) {
    return { error: 'No organization selected. Please sign in or switch organization and try again.' };
  }
  if (!canAccessSuppliers(capabilities)) {
    return { error: "You don't have permission to add suppliers." };
  }

  const phone = String(args.phone ?? '').trim();
  const company_name =
    typeof args.company_name === 'string' && args.company_name.trim()
      ? args.company_name.trim()
      : undefined;
  const contact_person =
    typeof args.contact_person === 'string' && args.contact_person.trim()
      ? args.contact_person.trim()
      : undefined;
  const email =
    typeof args.email === 'string' && args.email.trim() ? args.email.trim() : undefined;
  if (email) {
    const emailErr = validateEmail(email);
    if (emailErr) return { error: emailErr };
  }
  const rawType = args.supplier_type;
  const supplier_type: 'integrated' | 'offline' | 'marketplace' =
    rawType === 'integrated' || rawType === 'marketplace' ? rawType : 'offline';

  const { error, supplier } = await createSupplier(organizationId, {
    phone,
    company_name,
    contact_person,
    email,
    supplier_type,
  });

  if (error) {
    logOpsAgent({
      userId,
      action: 'create_supplier',
      success: false,
      phone,
      error: error.message,
      timestamp: Date.now(),
    });
    return { error: error.message };
  }
  logOpsAgent({
    userId,
    action: 'create_supplier',
    success: true,
    phone,
    timestamp: Date.now(),
  });
  return {
    output: {
      success: true,
      message: supplier ? `Supplier "${supplier.name ?? 'Added'}" added successfully.` : 'Supplier created.',
      supplier,
    },
  };
}

async function handleCreateVehicle(
  args: Record<string, unknown>,
  organizationId: string | null,
  capabilities: Capability[],
  userId?: string
): Promise<{ output?: Record<string, unknown>; error?: string }> {
  const validationError = validateCreateVehicleArgs(args);
  if (validationError) return { error: validationError };

  if (!organizationId) {
    return { error: 'No organization selected. Please sign in or switch organization and try again.' };
  }
  if (!canAccessVehicles(capabilities)) {
    return { error: "You don't have permission to add vehicles." };
  }

  const vehicle_number = String(args.vehicle_number ?? '').trim();
  const vehicle_brand =
    typeof args.vehicle_brand === 'string' && args.vehicle_brand.trim()
      ? args.vehicle_brand.trim()
      : undefined;
  const vehicle_body_type =
    typeof args.vehicle_body_type === 'string' && args.vehicle_body_type.trim()
      ? args.vehicle_body_type.trim()
      : undefined;
  const vehicle_size =
    typeof args.vehicle_size === 'string' && args.vehicle_size.trim()
      ? args.vehicle_size.trim()
      : undefined;
  const vehicle_axle =
    typeof args.vehicle_axle === 'string' && args.vehicle_axle.trim()
      ? args.vehicle_axle.trim()
      : undefined;

  const { error, vehicle } = await createVehicle(organizationId, {
    vehicle_number,
    vehicle_type: vehicle_body_type,
    vehicle_brand: vehicle_brand ?? null,
    vehicle_body_type: vehicle_body_type ?? null,
    vehicle_size: vehicle_size ?? null,
    vehicle_axle: vehicle_axle ?? null,
  });

  if (error) {
    logOpsAgent({
      userId,
      action: 'create_vehicle',
      success: false,
      vehicle_number,
      error: error.message,
      timestamp: Date.now(),
    });
    return { error: error.message };
  }
  logOpsAgent({
    userId,
    action: 'create_vehicle',
    success: true,
    vehicle_number,
    timestamp: Date.now(),
  });
  return {
    output: {
      success: true,
      message: vehicle ? `Vehicle "${vehicle.vehicle_number}" added successfully.` : 'Vehicle added.',
      vehicle,
    },
  };
}

async function handleCreateDriver(
  args: Record<string, unknown>,
  organizationId: string | null,
  capabilities: Capability[],
  userId?: string
): Promise<{ output?: Record<string, unknown>; error?: string }> {
  const validationError = validateCreateDriverArgs(args);
  if (validationError) return { error: validationError };

  if (!organizationId) {
    return { error: 'No organization selected. Please sign in or switch organization and try again.' };
  }
  if (!canAccessDrivers(capabilities)) {
    return { error: "You don't have permission to add drivers." };
  }

  const name = String(args.name ?? '').trim();
  const phone = String(args.phone ?? '').trim();
  const licenseNumber = String(args.license_number ?? '').trim();
  const payableAmount =
    typeof args.payable_amount === 'number' && Number.isFinite(args.payable_amount) && args.payable_amount >= 0
      ? args.payable_amount
      : null;
  const commissionPercent =
    typeof args.commission_percent === 'number' &&
    Number.isFinite(args.commission_percent) &&
    args.commission_percent >= 0 &&
    args.commission_percent <= 100
      ? args.commission_percent
      : null;
  const commissionPerKm =
    typeof args.commission_per_km === 'number' && Number.isFinite(args.commission_per_km) && args.commission_per_km >= 0
      ? args.commission_per_km
      : null;

  const driverData: DriverFormData = {
    driverSource: 'organization',
    name,
    phone,
    email: '',
    emergencyContact: '',
    emergencyName: '',
    licenseNumber,
    payableAmount,
    commissionPercent,
    commissionPerKm,
  };

  const { error, driver } = await createDriver(organizationId, driverData);

  if (error) {
    logOpsAgent({
      userId,
      action: 'create_driver',
      success: false,
      phone,
      error: error.message,
      timestamp: Date.now(),
    });
    return { error: error.message };
  }
  logOpsAgent({
    userId,
    action: 'create_driver',
    success: true,
    phone,
    timestamp: Date.now(),
  });
  return {
    output: {
      success: true,
      message: driver ? `Driver "${driver.name}" added successfully.` : 'Driver added.',
      driver,
    },
  };
}

/** Entity snapshot for post-create editable preview in chat. */
export interface CreatedEntitySnapshot {
  type: 'client' | 'supplier' | 'vehicle' | 'driver' | 'trip';
  id: string;
  data: Record<string, unknown>;
}

/**
 * Execute client creation after user has confirmed in the UI. Call this only when the user
 * has tapped "Create" in the confirmation dialog. Never creates without explicit UI confirm.
 */
export async function executePendingCreateClient(
  organizationId: string | null,
  capabilities: Capability[],
  payload: { contact_person: string; phone: string; organization_name?: string },
  userId?: string
): Promise<{ success: boolean; error?: string; message?: string; entity?: CreatedEntitySnapshot }> {
  if (userId && !checkRateLimit(userId)) {
    return { success: false, error: 'Rate limit exceeded. Try again in a minute.' };
  }
  const result = await handleCreateClient(
    payload as Record<string, unknown>,
    organizationId,
    capabilities,
    userId
  );
  if (result.error) {
    return { success: false, error: result.error };
  }
  const out = result.output as { message?: string; client?: { id: string; name: string; contact_person: string | null; phone: string } } | undefined;
  const msg = out && typeof out.message === 'string' ? out.message : 'Client created.';
  if (userId) recordRateLimit(userId);
  const entity: CreatedEntitySnapshot | undefined = out?.client
    ? { type: 'client', id: out.client.id, data: { contact_person: out.client.contact_person ?? payload.contact_person, phone: out.client.phone, organization_name: out.client.name ?? payload.organization_name ?? '' } }
    : undefined;
  return { success: true, message: msg, entity };
}

/** Execute supplier creation after user has confirmed in the UI. */
export async function executePendingCreateSupplier(
  organizationId: string | null,
  capabilities: Capability[],
  payload: {
    phone: string;
    company_name?: string;
    contact_person?: string;
    email?: string;
    supplier_type?: 'integrated' | 'offline' | 'marketplace';
  },
  userId?: string
): Promise<{ success: boolean; error?: string; message?: string; entity?: CreatedEntitySnapshot }> {
  if (userId && !checkRateLimit(userId)) {
    return { success: false, error: 'Rate limit exceeded. Try again in a minute.' };
  }
  const result = await handleCreateSupplier(
    payload as Record<string, unknown>,
    organizationId,
    capabilities,
    userId
  );
  if (result.error) return { success: false, error: result.error };
  const out = result.output as { message?: string; supplier?: { id: string; name: string | null; company_name: string | null; contact_person: string | null; phone: string | null; email: string | null } } | undefined;
  const msg = out && typeof out.message === 'string' ? out.message : 'Supplier created.';
  if (userId) recordRateLimit(userId);
  const entity: CreatedEntitySnapshot | undefined = out?.supplier
    ? { type: 'supplier', id: out.supplier.id, data: { company_name: out.supplier.company_name ?? out.supplier.name ?? '', contact_person: out.supplier.contact_person ?? '', phone: out.supplier.phone ?? payload.phone, email: out.supplier.email ?? payload.email ?? '' } }
    : undefined;
  return { success: true, message: msg, entity };
}

/** Execute vehicle creation after user has confirmed in the UI. */
export async function executePendingCreateVehicle(
  organizationId: string | null,
  capabilities: Capability[],
  payload: {
    vehicle_number: string;
    vehicle_brand?: string;
    vehicle_body_type?: string;
    vehicle_size?: string;
    vehicle_axle?: string;
  },
  userId?: string
): Promise<{ success: boolean; error?: string; message?: string; entity?: CreatedEntitySnapshot }> {
  if (userId && !checkRateLimit(userId)) {
    return { success: false, error: 'Rate limit exceeded. Try again in a minute.' };
  }
  const result = await handleCreateVehicle(
    payload as Record<string, unknown>,
    organizationId,
    capabilities,
    userId
  );
  if (result.error) return { success: false, error: result.error };
  const out = result.output as { message?: string; vehicle?: { id: string; vehicle_number: string; vehicle_brand: string | null; vehicle_body_type: string | null; vehicle_size: string | null; vehicle_axle: string | null } } | undefined;
  const msg = out && typeof out.message === 'string' ? out.message : 'Vehicle added.';
  if (userId) recordRateLimit(userId);
  const entity: CreatedEntitySnapshot | undefined = out?.vehicle
    ? { type: 'vehicle', id: out.vehicle.id, data: { vehicle_number: out.vehicle.vehicle_number, vehicle_brand: out.vehicle.vehicle_brand ?? '', vehicle_body_type: out.vehicle.vehicle_body_type ?? '', vehicle_size: out.vehicle.vehicle_size ?? '', vehicle_axle: out.vehicle.vehicle_axle ?? '' } }
    : undefined;
  return { success: true, message: msg, entity };
}

/** Execute driver creation after user has confirmed in the UI. */
export async function executePendingCreateDriver(
  organizationId: string | null,
  capabilities: Capability[],
  payload: {
    name: string;
    phone: string;
    license_number: string;
    payable_amount?: number;
    commission_percent?: number;
    commission_per_km?: number;
  },
  userId?: string
): Promise<{ success: boolean; error?: string; message?: string; entity?: CreatedEntitySnapshot }> {
  if (userId && !checkRateLimit(userId)) {
    return { success: false, error: 'Rate limit exceeded. Try again in a minute.' };
  }
  const result = await handleCreateDriver(
    payload as Record<string, unknown>,
    organizationId,
    capabilities,
    userId
  );
  if (result.error) return { success: false, error: result.error };
  const out = result.output as { message?: string; driver?: { id: string; name: string; phone: string | null } } | undefined;
  const msg = out && typeof out.message === 'string' ? out.message : 'Driver added.';
  if (userId) recordRateLimit(userId);
  const entity: CreatedEntitySnapshot | undefined = out?.driver
    ? { type: 'driver', id: out.driver.id, data: { name: out.driver.name, phone: out.driver.phone ?? payload.phone } }
    : undefined;
  return { success: true, message: msg, entity };
}

/** Execute trip creation after user has confirmed in the UI. */
export async function executePendingCreateTrip(
  organizationId: string | null,
  capabilities: Capability[],
  payload: {
    pickup_area: string;
    drop_location: string;
    client_name: string;
    client_price: number;
    supply_source: 'asset' | 'aggregate';
    supplier_rate: number;
  },
  userId?: string
): Promise<{ success: boolean; error?: string; message?: string; entity?: CreatedEntitySnapshot }> {
  if (!organizationId) {
    return { success: false, error: 'No organization selected.' };
  }
  if (userId && !checkRateLimit(userId)) {
    return { success: false, error: 'Rate limit exceeded. Try again in a minute.' };
  }
  if (!canAccessTrips(capabilities)) {
    return { success: false, error: "You don't have permission to create trips." };
  }
  const supplierRate = payload.supply_source === 'aggregate' ? Number(payload.supplier_rate) || 0 : 0;
  // Resolve client_id so integrated clients can see the trip (RLS: "Orgs can read trips where they are the client").
  const clientName = payload.client_name.trim() || '—';
  let client_id: string | null = null;
  if (clientName && clientName !== '—') {
    const { client } = await getClientByName(organizationId, clientName);
    client_id = client?.id ?? null;
  }
  const { error, trip } = await createTrip(organizationId, {
    pickup_area: payload.pickup_area.trim(),
    drop_location: payload.drop_location.trim(),
    client_name: clientName,
    client_id: client_id ?? undefined,
    client_price: Number(payload.client_price) || 0,
    supplier_rate: supplierRate,
  });
  if (error) return { success: false, error: error.message };
  if (userId) recordRateLimit(userId);
  const entity: CreatedEntitySnapshot | undefined = trip
    ? {
        type: 'trip',
        id: trip.id,
        data: {
          pickup_area: trip.pickup_area,
          drop_location: trip.drop_location,
          client_name: trip.client_name,
          client_price: trip.client_price,
          supply_source: payload.supply_source,
          supplier_rate: trip.supplier_rate,
        },
      }
    : undefined;
  return {
    success: true,
    message: trip ? `Trip created (${trip.display_trip_id ?? trip.trip_number ?? 'saved'}).` : 'Trip created.',
    entity,
  };
}

/**
 * Process a conversation turn: send messages to Gemini, handle function calls
 * (e.g. create_client), and return the final reply plus whether an action was executed.
 */
export async function processOpsMessage(
  options: ProcessOpsMessageOptions
): Promise<ProcessOpsMessageResult> {
  const { messages, organizationId, capabilities, userId, sessionState, opsContext, lastUserMessageImage } = options;
  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content?.trim() ?? '';

  if (CANCEL_KEYWORDS.test(lastUserMessage)) {
    return {
      reply: 'Operation cancelled.',
      executed: false,
      sessionState: undefined,
    };
  }

  const proxyUrl = getOpsAgentProxyUrl();
  const apiKey = getApiKey();
  if (!proxyUrl && !apiKey) {
    return {
      reply: 'Ops Agent is not configured. Set EXPO_PUBLIC_SUPABASE_URL in .env (project where ops-agent-chat is deployed), then restart the app: npx expo start -c',
      executed: false,
      error: 'Missing Ops Agent config',
      sessionState: undefined,
    };
  }

  const contents = buildContents(messages, lastUserMessageImage);
  if (contents.length === 0) {
    return {
      reply: 'Send a message to get started, e.g. "Add a client".',
      executed: false,
      sessionState: undefined,
    };
  }

  try {
    const allTools = {
      functionDeclarations: [
        ...(CREATE_CLIENT_TOOL.functionDeclarations ?? []),
        ...(GET_DATA_TOOLS.functionDeclarations ?? []),
      ],
    };
    const systemInstructionText = buildSystemInstructionWithEntityLists(options.opsContext);
    const configWithTools = {
      systemInstruction: { role: 'user', parts: [{ text: systemInstructionText }] },
      tools: [allTools],
      toolConfig: {
        functionCallingConfig: {
          mode: FunctionCallingConfigMode.ANY,
          allowedFunctionNames: [
            'create_client',
            'create_supplier',
            'create_vehicle',
            'create_driver',
            'create_trip',
            'get_revenue_summary',
            'get_vehicle_details',
            'get_driver_summary',
            'get_entity_counts',
            'get_report',
          ],
        },
      },
    };

    /** No tools: use for follow-up after a tool run so the model returns text only (avoids SDK warning and ensures a proper reply). */
    const configTextOnly = {
      systemInstruction: { role: 'user', parts: [{ text: systemInstructionText }] },
    };

    let response = await generateContent(
      { contents, configWithTools, configTextOnly },
      true
    );

    const functionCalls = response.functionCalls;
    const hasText = Boolean(response.text?.trim());
    if (!hasText && (!functionCalls || functionCalls.length === 0)) {
      return {
        reply: "Something went wrong understanding that. Please restate your request.",
        executed: false,
        sessionState: undefined,
      };
    }

    let executed = false;
    let resultSessionState: OpsSessionState | undefined;
    let requiresUiConfirmation = false;
    let reportDataForUi: ChatReportData | undefined;
    if (functionCalls && functionCalls.length > 0) {
      const fc: FunctionCall = functionCalls[0];
      const name = fc.name ?? 'create_client';
      const id = fc.id ?? name;
      const args = (fc.args ?? {}) as Record<string, unknown>;

      let toolResult: { output?: Record<string, unknown>; error?: string } = { output: {} };
      let actuallyExecuted = false;

      const setConfirmation = (
        payload: OpsSessionState,
        message: string
      ): void => {
        resultSessionState = { ...payload, confirmationRequestedAt: Date.now() };
        requiresUiConfirmation = true;
        toolResult = { output: { requires_ui_confirmation: true, message } };
      };

      if (name === 'create_client') {
        const validationError = validateCreateClientArgs(args);
        if (validationError) {
          toolResult = { error: validationError };
        } else if (!organizationId) {
          toolResult = { error: 'No organization selected. Please sign in or switch organization and try again.' };
        } else if (!canAccessClients(capabilities)) {
          toolResult = { error: "You don't have permission to add clients." };
        } else {
          const phone = String(args.phone ?? '').trim();
          const { error: existingError, client: existing } = await getClientByPhone(organizationId, phone);
          if (existingError) {
            toolResult = { error: existingError.message };
          } else if (existing) {
            toolResult = { error: `A client with phone number ${phone} already exists.` };
          } else {
            setConfirmation(
              {
                pendingCreateClientPayload: {
                  contact_person: String(args.contact_person ?? '').trim(),
                  phone,
                  organization_name:
                    typeof args.organization_name === 'string' && args.organization_name.trim()
                      ? args.organization_name.trim()
                      : undefined,
                },
              },
              'Please confirm in the dialog to create this client.'
            );
          }
        }
      } else if (name === 'create_supplier') {
        const validationError = validateCreateSupplierArgs(args);
        if (validationError) {
          toolResult = { error: validationError };
        } else if (!organizationId) {
          toolResult = { error: 'No organization selected. Please sign in or switch organization and try again.' };
        } else if (!canAccessSuppliers(capabilities)) {
          toolResult = { error: "You don't have permission to add suppliers." };
        } else {
          const rawType = args.supplier_type;
          const supplier_type: 'integrated' | 'offline' | 'marketplace' =
            rawType === 'integrated' || rawType === 'marketplace' ? rawType : 'offline';
          setConfirmation(
            {
              pendingCreateSupplierPayload: {
                phone: String(args.phone ?? '').trim(),
                company_name:
                  typeof args.company_name === 'string' && args.company_name.trim()
                    ? args.company_name.trim()
                    : undefined,
                contact_person:
                  typeof args.contact_person === 'string' && args.contact_person.trim()
                    ? args.contact_person.trim()
                    : undefined,
                email:
                  typeof args.email === 'string' && args.email.trim() ? args.email.trim() : undefined,
                supplier_type,
              },
            },
            'Please confirm in the dialog to add this supplier.'
          );
        }
      } else if (name === 'create_vehicle') {
        const validationError = validateCreateVehicleArgs(args);
        if (validationError) {
          toolResult = { error: validationError };
        } else if (!organizationId) {
          toolResult = { error: 'No organization selected. Please sign in or switch organization and try again.' };
        } else if (!canAccessVehicles(capabilities)) {
          toolResult = { error: "You don't have permission to add vehicles." };
        } else {
          setConfirmation(
            {
              pendingCreateVehiclePayload: {
                vehicle_number: String(args.vehicle_number ?? '').trim(),
                vehicle_brand:
                  typeof args.vehicle_brand === 'string' && args.vehicle_brand.trim()
                    ? args.vehicle_brand.trim()
                    : undefined,
                vehicle_body_type:
                  typeof args.vehicle_body_type === 'string' && args.vehicle_body_type.trim()
                    ? args.vehicle_body_type.trim()
                    : undefined,
                vehicle_size:
                  typeof args.vehicle_size === 'string' && args.vehicle_size.trim()
                    ? args.vehicle_size.trim()
                    : undefined,
                vehicle_axle:
                  typeof args.vehicle_axle === 'string' && args.vehicle_axle.trim()
                    ? args.vehicle_axle.trim()
                    : undefined,
              },
            },
            'Please confirm in the dialog to add this vehicle.'
          );
        }
      } else if (name === 'create_driver') {
        const validationError = validateCreateDriverArgs(args);
        if (validationError) {
          toolResult = { error: validationError };
        } else if (!organizationId) {
          toolResult = { error: 'No organization selected. Please sign in or switch organization and try again.' };
        } else if (!canAccessDrivers(capabilities)) {
          toolResult = { error: "You don't have permission to add drivers." };
        } else {
          const pay =
            typeof args.payable_amount === 'number' && Number.isFinite(args.payable_amount) && args.payable_amount >= 0
              ? args.payable_amount
              : undefined;
          const pct =
            typeof args.commission_percent === 'number' &&
            Number.isFinite(args.commission_percent) &&
            args.commission_percent >= 0 &&
            args.commission_percent <= 100
              ? args.commission_percent
              : undefined;
          const perKm =
            typeof args.commission_per_km === 'number' &&
            Number.isFinite(args.commission_per_km) &&
            args.commission_per_km >= 0
              ? args.commission_per_km
              : undefined;
          setConfirmation(
            {
              pendingCreateDriverPayload: {
                name: String(args.name ?? '').trim(),
                phone: String(args.phone ?? '').trim(),
                license_number: String(args.license_number ?? '').trim(),
                payable_amount: pay,
                commission_percent: pct,
                commission_per_km: perKm,
              },
            },
            'Please confirm in the dialog to add this driver.'
          );
        }
      } else if (name === 'create_trip') {
        const validationError = validateCreateTripArgs(args);
        if (validationError) {
          toolResult = { error: validationError };
        } else if (!organizationId) {
          toolResult = { error: 'No organization selected. Please sign in or switch organization and try again.' };
        } else if (!canAccessTrips(capabilities)) {
          toolResult = { error: "You don't have permission to create trips." };
        } else {
          const supplySource = args.supply_source === 'asset' || args.supply_source === 'aggregate' ? args.supply_source : 'asset';
          const supplierRate =
            supplySource === 'aggregate' && typeof args.supplier_rate === 'number' && Number.isFinite(args.supplier_rate) && args.supplier_rate >= 0
              ? args.supplier_rate
              : 0;
          setConfirmation(
            {
              pendingCreateTripPayload: {
                pickup_area: String(args.pickup_area ?? '').trim(),
                drop_location: String(args.drop_location ?? '').trim(),
                client_name: String(args.client_name ?? '').trim(),
                client_price: Number(args.client_price) || 0,
                supply_source: supplySource,
                supplier_rate: supplierRate,
              },
            },
            'Please confirm in the dialog to create this trip.'
          );
        }
      } else if (name === 'get_revenue_summary') {
        toolResult = {
          output: { summary: opsContext?.revenueSummary ?? 'No revenue data available for this period.' },
        };
      } else if (name === 'get_vehicle_details') {
        toolResult = {
          output: { summary: opsContext?.vehicleSummary ?? 'No vehicle data available.' },
        };
      } else if (name === 'get_driver_summary') {
        toolResult = {
          output: { summary: opsContext?.driverSummary ?? 'No driver data available.' },
        };
      } else if (name === 'get_entity_counts') {
        toolResult = {
          output: { summary: opsContext?.entityCounts ?? 'No entity counts available.' },
        };
      } else if (name === 'get_report') {
        const sections: ChatReportSection[] = [];
        if (opsContext?.revenueTable) {
          sections.push({
            title: 'Revenue & cash flow',
            body: opsContext.revenueSummary,
            table: opsContext.revenueTable,
          });
        } else if (opsContext?.revenueSummary) {
          sections.push({ title: 'Revenue & cash flow', body: opsContext.revenueSummary });
        }
        if (opsContext?.entityCountsTable) {
          sections.push({
            title: 'Entity counts',
            body: opsContext.entityCounts,
            table: opsContext.entityCountsTable,
          });
        } else if (opsContext?.entityCounts) {
          sections.push({ title: 'Entity counts', body: opsContext.entityCounts });
        }
        if (opsContext?.vehicleTable) {
          sections.push({
            title: 'Fleet',
            body: opsContext.vehicleSummary,
            table: opsContext.vehicleTable,
          });
        } else if (opsContext?.vehicleSummary) {
          sections.push({ title: 'Fleet', body: opsContext.vehicleSummary });
        }
        if (opsContext?.driverTable) {
          sections.push({
            title: 'Drivers',
            body: opsContext.driverSummary,
            table: opsContext.driverTable,
          });
        } else if (opsContext?.driverSummary) {
          sections.push({ title: 'Drivers', body: opsContext.driverSummary });
        }
        if (sections.length === 0) {
          sections.push({ title: 'Summary', body: 'No report data available for this period. Add transactions and entities to see a full report.' });
        }
        reportDataForUi = {
          title: 'Operations Summary Report',
          generatedAt: new Date().toISOString(),
          sections,
        };
        toolResult = {
          output: {
            summary: 'Report generated. The app will show it in a formatted card with a PDF download option.',
            report_title: reportDataForUi.title,
            report_sections: sections,
          },
        };
      } else {
        toolResult = { error: `Unknown tool: ${name}` };
      }

      const responsePayload =
        toolResult.error !== undefined
          ? { error: toolResult.error }
          : { output: toolResult.output ?? {} };

      const modelContent = response.candidates?.[0]?.content;
      const followUpContents: Content[] = [...contents];
      if (modelContent) {
        followUpContents.push(modelContent as Content);
      }
      followUpContents.push(
        createUserContent(createPartFromFunctionResponse(id, name, responsePayload))
      );

      response = await generateContent(
        { contents: followUpContents, configWithTools, configTextOnly },
        false
      );

      executed = actuallyExecuted;
    }

    const text = response.text?.trim();
    return {
      reply:
        text ||
        (executed ? 'Done.' : 'I didn’t understand. Try "Add a client", "Add a supplier", "Add a vehicle", or "Add a driver".'),
      executed,
      sessionState: resultSessionState,
      requiresUiConfirmation,
      reportData: reportDataForUi,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Request failed.';
    return {
      reply: `Something went wrong: ${message}. Please try again.`,
      executed: false,
      error: message,
      sessionState: undefined,
    };
  }
}
