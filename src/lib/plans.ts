import type { Plan } from "@prisma/client";

export type PlanInfo = {
  id: Plan;
  name: string;
  priceEurMonthly: number;
  maxInboxes: number;
  monthlySends: number;
  apiRequestsPerMinute: number;
  features: string[];
};

export const PLANS: Record<Plan, PlanInfo> = {
  FREE: {
    id: "FREE",
    name: "Gratuit",
    priceEurMonthly: 0,
    maxInboxes: 3,
    monthlySends: 100,
    apiRequestsPerMinute: 60,
    features: ["3 boîtes mail", "100 envois / mois", "API REST complète", "Réception illimitée"],
  },
  PRO: {
    id: "PRO",
    name: "Pro",
    priceEurMonthly: 19,
    maxInboxes: 50,
    monthlySends: 10_000,
    apiRequestsPerMinute: 300,
    features: ["50 boîtes mail", "10 000 envois / mois", "Clés API multiples", "Support email"],
  },
  SCALE: {
    id: "SCALE",
    name: "Scale",
    priceEurMonthly: 99,
    maxInboxes: 500,
    monthlySends: 100_000,
    apiRequestsPerMinute: 1200,
    features: ["500 boîtes mail", "100 000 envois / mois", "Débit API x20", "Support prioritaire"],
  },
};

export function startOfMonthUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
