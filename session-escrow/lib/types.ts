export type MilestoneStatus = "pending" | "delivered" | "approved" | "released" | "disputed" | "resolved";

export interface Resolution {
  toContractor: number; // USDC
  toClient: number; // USDC
  at: number;
  tx?: string;
  inrRate?: number | null; // INR per 1 USDC when resolved (for the contractor's share)
}

export interface Milestone {
  title: string;
  amount: number; // USDC
  status: MilestoneStatus;
  evidence?: string;
  deliveredAt?: number;
  approvedAt?: number;
  releasedAt?: number;
  releaseTx?: string;
  inrRate?: number | null; // INR per 1 USDC at release time; null = lookup failed
  resolution?: Resolution;
}

export type DealStatus = "draft" | "active" | "completed";

export interface LogEntry {
  at: number;
  text: string;
  hash?: string;
  unverified?: boolean; // true if the transaction could not be confirmed on the network when recorded
}

export interface Deal {
  id: string;
  title: string;
  description: string;
  contractorName: string;
  contractorAddress: string;
  clientName?: string;
  clientAddress?: string;
  milestones: Milestone[];
  contractId?: string;
  fundTx?: string;
  fundedAt?: number;
  status: DealStatus;
  createdAt: number;
  log: LogEntry[];
}

export const dealTotal = (d: Pick<Deal, "milestones">) =>
  d.milestones.reduce((s, m) => s + m.amount, 0);

export const isSettled = (m: Pick<Milestone, "status">) => m.status === "released" || m.status === "resolved";
