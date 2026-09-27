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
  clientId: string;
  projectId: string;
  estimateDate: string;
  currency: "LKR" | "USD" | "GBP" | "EUR";
  taxPercent: number;
  notes: string;
  items: Item[];
};
export type Estimate = Omit<
  EstimateInput,
  "clientId" | "projectId" | "estimateDate"
> & {
  clientId: string | null;
  projectId: string | null;
  estimateDate: string | null;
  title: string;
  clientName: string;
  clientEmail: string | null;
  siteAddress: string;
  id: string;
  number: string;
  status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED";
  version: number;
  createdAt: string;
  updatedAt: string;
  totals: { lines: string[]; subtotal: string; tax: string; total: string };
};
export type Session = { user: User | null; csrfToken: string };
export type Page<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};
export type CurrencyTotals = Record<string, string>;
export type ClientInput = {
  name: string;
  registrationNumber: string;
  vatNumber: string;
  address: string;
  contactPerson: string;
  telephone: string;
  email: string;
  notes: string;
};
export type Client = ClientInput & {
  id: string;
  active: boolean;
  projectCount: number;
  estimateCount: number;
  totalsByCurrency: CurrencyTotals;
  createdAt: string;
};
export type ProjectInput = {
  projectCode: string;
  projectName: string;
  siteAddress: string;
  description: string;
  startDate: string;
  completionDate: string;
};
export type Project = ProjectInput & {
  id: string;
  clientId: string;
  status: "ACTIVE" | "ARCHIVED";
};
export type Dashboard = {
  activeProjects: number;
  activeClients: number;
  totalEstimates: number;
  approvedTotalsByCurrency: CurrencyTotals;
  recentEstimates: {
    id: string;
    number: string;
    clientName: string;
    projectTitle: string;
    estimateDate: string | null;
    createdAt: string;
    status: Estimate["status"];
    currency: string;
    grandTotal: string;
  }[];
};
