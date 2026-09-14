import { TripsIndentsPanel } from "@/features/trips/components/indents/TripsIndentsPanel";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("react-native", () => jest.requireActual("react-native"));

const mockUseIndentsQuery = jest.fn();
const mockUseIndentOfferCountsQuery = jest.fn();

jest.mock("@/lib/queries/useIndentsQuery", () => ({
  useIndentsQuery: (...args: unknown[]) => mockUseIndentsQuery(...args),
  useIndentOfferCountsQuery: (...args: unknown[]) => mockUseIndentOfferCountsQuery(...args),
}));

const ORG_ID = "org-1";

function indent(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ind-1",
    organization_id: ORG_ID,
    indent_number: "IND001",
    pickup_area: "Chennai",
    drop_location: "Bengaluru",
    client_name: "Acme Co",
    client_price: 45000,
    supplier_target: 40000,
    status: "open",
    load_type: "FTL",
    ...overrides,
  };
}

describe("TripsIndentsPanel", () => {
  beforeEach(() => {
    mockUseIndentsQuery.mockReset();
    mockUseIndentOfferCountsQuery.mockReset();
    mockUseIndentOfferCountsQuery.mockReturnValue({ data: {} });
  });

  it("shows an UNASSIGNED badge for an indent with no bids", () => {
    mockUseIndentsQuery.mockReturnValue({
      data: [indent({ status: "open" })],
      isLoading: false,
      isError: false,
    });
    const { getByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(getByText("UNASSIGNED")).toBeTruthy();
    expect(getByText("Acme Co")).toBeTruthy();
    expect(getByText("Chennai → Bengaluru")).toBeTruthy();
  });

  it("shows BIDDING hint + UNASSIGNED badge once a bid exists but no supplier is picked", () => {
    mockUseIndentsQuery.mockReturnValue({
      data: [indent({ id: "ind-2", status: "open" })],
      isLoading: false,
      isError: false,
    });
    mockUseIndentOfferCountsQuery.mockReturnValue({ data: { "ind-2": 2 } });
    const { getByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(getByText("UNASSIGNED")).toBeTruthy();
    expect(getByText("Receiving bids")).toBeTruthy();
  });

  it("shows an AWARDED badge once a supplier is selected", () => {
    mockUseIndentsQuery.mockReturnValue({
      data: [indent({ id: "ind-3", status: "awarded", assigned_supplier_id: "sup-1" })],
      isLoading: false,
      isError: false,
    });
    const { getByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(getByText("AWARDED")).toBeTruthy();
  });

  it("never renders a Trip-shaped row (no driver/vehicle assignment UI) for an indent", () => {
    mockUseIndentsQuery.mockReturnValue({
      data: [indent()],
      isLoading: false,
      isError: false,
    });
    const { queryByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(queryByText(/\bASSIGNED\b/)).toBeNull();
    expect(queryByText(/driver/i)).toBeNull();
    expect(queryByText(/vehicle/i)).toBeNull();
  });

  it("excludes indents belonging to another organization (own-org view only)", () => {
    mockUseIndentsQuery.mockReturnValue({
      data: [indent({ id: "ind-other", organization_id: "other-org" })],
      isLoading: false,
      isError: false,
    });
    const { getByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(getByText("No indents waiting to become a trip.")).toBeTruthy();
  });

  it("excludes completed/cancelled/closed/expired indents — they are done, not waiting on a trip", () => {
    mockUseIndentsQuery.mockReturnValue({
      data: [
        indent({ id: "ind-done", status: "completed", client_name: "Done Co" }),
        indent({ id: "ind-open", status: "open", client_name: "Open Co" }),
      ],
      isLoading: false,
      isError: false,
    });
    const { getByText, queryByTestId, queryByText } = render(
      <TripsIndentsPanel orgId={ORG_ID} />,
    );
    expect(getByText("Open Co")).toBeTruthy();
    expect(queryByText("Done Co")).toBeNull();
    expect(queryByTestId("indent-card-ind-done")).toBeNull();
  });

  it("filters by stage chip", () => {
    mockUseIndentsQuery.mockReturnValue({
      data: [
        indent({ id: "ind-open", status: "open", client_name: "Open Co" }),
        indent({ id: "ind-awarded", status: "awarded", assigned_supplier_id: "sup-1", client_name: "Awarded Co" }),
      ],
      isLoading: false,
      isError: false,
    });
    const { getByText, queryByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(getByText("Open Co")).toBeTruthy();
    expect(getByText("Awarded Co")).toBeTruthy();

    fireEvent.press(getByText("Awarded"));
    expect(queryByText("Open Co")).toBeNull();
    expect(getByText("Awarded Co")).toBeTruthy();
  });

  it("shows a loading state", () => {
    mockUseIndentsQuery.mockReturnValue({ data: [], isLoading: true, isError: false });
    const { getByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(getByText("Loading indents…")).toBeTruthy();
  });

  it("shows an error state", () => {
    mockUseIndentsQuery.mockReturnValue({ data: [], isLoading: false, isError: true });
    const { getByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(getByText("Could not load indents.")).toBeTruthy();
  });

  it("shows an empty state when the org has no open indents", () => {
    mockUseIndentsQuery.mockReturnValue({ data: [], isLoading: false, isError: false });
    const { getByText } = render(<TripsIndentsPanel orgId={ORG_ID} />);
    expect(getByText("No indents waiting to become a trip.")).toBeTruthy();
  });
});
