import type { EnterpriseReimbursementState } from "./reimbursementEngine";

export interface ReimbursementTimelineNode {
  key: string;
  label: string;
  completed: boolean;
  current: boolean;
}

const FLOW: EnterpriseReimbursementState[] = [
  "pending_review",
  "approved",
  "reimbursed",
];

export function buildReimbursementTimeline(
  state: EnterpriseReimbursementState,
): ReimbursementTimelineNode[] {
  if (state === "none") {
    return [
      {
        key: "none",
        label: "No reimbursement required",
        completed: false,
        current: true,
      },
    ];
  }
  if (state === "rejected") {
    return [
      { key: "pending_review", label: "Submitted", completed: true, current: false },
      { key: "rejected", label: "Rejected", completed: true, current: true },
    ];
  }
  if (state === "disputed") {
    return [
      { key: "pending_review", label: "Submitted", completed: true, current: false },
      { key: "disputed", label: "Disputed", completed: true, current: true },
    ];
  }
  return FLOW.map((node) => {
    const index = FLOW.indexOf(node);
    const currentIndex = FLOW.indexOf(
      state === "approved" ? "approved" : state === "reimbursed" ? "reimbursed" : "pending_review",
    );
    return {
      key: node,
      label:
        node === "pending_review"
          ? "Awaiting review"
          : node === "approved"
            ? "Approved"
            : "Reimbursed",
      completed: index <= currentIndex,
      current: index === currentIndex,
    };
  });
}
