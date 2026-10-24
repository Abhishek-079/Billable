"use client";

import type { Deal } from "./types";

async function j(res: Response) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || res.statusText);
  return body;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const dealsApi = {
  create: (body: {
    title: string;
    description: string;
    contractorName: string;
    contractorAddress: string;
    milestones: { title: string; amount: number }[];
  }): Promise<Deal> => fetch("/api/deals", json("POST", body)).then(j).then((r) => r.deal),
  get: (id: string): Promise<Deal> => fetch(`/api/deals/${id}`, { cache: "no-store" }).then(j).then((r) => r.deal),
  list: (address: string): Promise<Deal[]> =>
    fetch(`/api/deals?address=${address}`, { cache: "no-store" }).then(j).then((r) => r.deals),
  patch: (id: string, body: Record<string, unknown>): Promise<Deal> =>
    fetch(`/api/deals/${id}`, json("PATCH", body)).then(j).then((r) => r.deal),
};
