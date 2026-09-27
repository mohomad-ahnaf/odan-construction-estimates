export type User = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "ESTIMATOR" | "VIEWER";
};
export type Item = {
  description: string;
  unit: string;
  quantity: number;
  rate: number;
};
export type EstimateInput = {
  title: string;
  clientName: string;
  clientEmail: string;
  siteAddress: string;
  currency: "LKR" | "USD" | "GBP" | "EUR";
  taxPercent: number;
  notes: string;
  items: Item[];
};
export type Estimate = EstimateInput & {
  id: string;
  number: string;
  status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED";
  version: number;
  createdAt: string;
  updatedAt: string;
  totals: { lines: string[]; subtotal: string; tax: string; total: string };
};
export type Session = { user: User | null; csrfToken: string };
