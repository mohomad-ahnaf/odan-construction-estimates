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
  description: string;
  estimateDate: string;
  currency: "LKR" | "USD" | "GBP" | "EUR";
  markupPercent: number;
  taxPercent: number;
  notes: string;
  items: Item[];
};
export type EstimateFields = Omit<EstimateInput, "clientId" | "projectId">;
export type Estimate = Omit<
  EstimateInput,
  "clientId" | "projectId" | "estimateDate" | "description"
> & {
  description: string | null;
  clientId: string | null;
  projectId: string | null;
  estimateDate: string | null;
  title: string;
  clientName: string;
  clientEmail: string | null;
  clientNumber: string | null;
  projectCodeSnapshot: string | null;
  siteAddress: string;
  id: string;
  number: string;
  status: "DRAFT" | "SENT" | "APPROVED" | "REJECTED";
  version: number;
  createdAt: string;
  updatedAt: string;
  totals: {
    lines: string[];
    subtotal: string;
    baseSubtotal: string;
    markupAmount: string;
    subtotalAfterMarkup: string;
    tax: string;
    total: string;
  };
};
export type ClientEstimateInput = {
  clientEstimateDate: string;
  title: string;
  notes: string;
  items: { sourceEstimateId: string; refreshSnapshot?: boolean }[];
};
export type ClientEstimate = {
  id: string;
  clientEstimateNumber: string;
  projectId: string;
  clientId: string;
  clientNameSnapshot: string;
  clientNumberSnapshot: string | null;
  projectNameSnapshot: string;
  projectCodeSnapshot: string | null;
  clientEstimateDate: string;
  title: string;
  notes: string | null;
  currency: string;
  status: Estimate["status"];
  version: number;
  grandTotal: string;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    sourceEstimateId: string;
    position: number;
    estimateNumberSnapshot: string;
    descriptionSnapshot: string;
    currencySnapshot: string;
    quantity: number;
    rateSnapshot: string;
    amountSnapshot: string;
  }[];
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
  address: string;
  contactPerson: string;
  telephone: string;
  email: string;
  notes: string;
};
export type Client = ClientInput & {
  id: string;
  clientCode: string | null;
  active: boolean;
  projectCount: number;
  estimateCount: number;
  totalsByCurrency: CurrencyTotals;
  createdAt: string;
};
export type ProjectInput = {
  projectName: string;
  siteAddress: string;
  description: string;
  startDate: string;
};
export type Project = ProjectInput & {
  id: string;
  clientId: string;
  projectCode: string | null;
  status: "ACTIVE" | "ARCHIVED";
  estimateCount?: number;
  latestEstimateValue?: { currency: string; total: string } | null;
};
export type Dashboard = {
  activeProjects: number;
  activeClients: number;
  totalEstimates: number;
  approvedTotalsByCurrency: CurrencyTotals;
  recentEstimates: {
    id: string;
    number: string;
    description: string | null;
    clientName: string;
    projectTitle: string;
    estimateDate: string | null;
    createdAt: string;
    status: Estimate["status"];
    currency: string;
    grandTotal: string;
  }[];
};
