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
export type ProjectDirectoryItem = Omit<Project, "startDate"> & {
  startDate: string | null;
  clientName: string;
  clientCode: string | null;
  clientActive: boolean;
  estimateCount: number;
};
export type DocumentCategory =
  | "DRAWINGS"
  | "IMAGES"
  | "CONTRACTS"
  | "BOQ"
  | "REPORTS"
  | "OTHER";
export type DocumentStatus =
  | "DRAFT"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "ARCHIVED";
export type ProjectDocument = {
  id: string;
  projectId: string;
  uploadedBy: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  category: DocumentCategory;
  googleDriveFileId: string;
  googleDriveFolderId: string;
  version: number;
  revisionNote: string | null;
  isLatest: boolean;
  versionGroupId: string;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
  links: { viewUrl: string; downloadUrl: string };
  uploader: { id: string; name: string; email: string };
};
export type DocumentApproval = {
  id: string;
  documentId: string;
  action: "SUBMITTED" | "APPROVED" | "REJECTED";
  comment: string | null;
  approvedBy: string;
  createdAt: string;
  approver: { id: string; name: string };
};
export type PlanPoint = { x: number; y: number };
export type PlanDocument = {
  id: string;
  projectId: string;
  fileName: string;
  fileType: "application/pdf" | "image/png" | "image/jpeg";
  version: number;
  versionGroupId: string;
  isLatest: boolean;
  status: DocumentStatus;
  createdAt: string;
  uploader: { id: string; name: string; email: string };
};
export type PageCalibration = {
  id: string;
  documentId: string;
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  referenceGeometry: { points: [PlanPoint, PlanPoint] };
  referenceLengthMeters: string;
  referenceUnit: "mm" | "cm" | "m" | "ft" | "in";
  checkReferenceGeometry: { points: [PlanPoint, PlanPoint] } | null;
  checkReferenceLengthMeters: string | null;
  metresPerPageUnit: number;
  checkDifferencePercent: number | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};
export type PlanMeasurement = {
  id: string;
  documentId: string;
  groupId: string;
  group: { id: string; name: string; documentId: string };
  pageNumber: number;
  pageWidth: number;
  pageHeight: number;
  type: "LENGTH" | "AREA" | "COUNT";
  label: string;
  geometry: { points: PlanPoint[] };
  quantity: string;
  unit: "m" | "m²" | "count";
  confirmed: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string };
  document: { id: string; version: number; fileName: string; projectId: string };
};
export type PlanMeasurementGroup = {
  id: string;
  documentId: string;
  name: string;
  version: number;
  createdAt: string;
  updatedAt: string;
  creator: { id: string; name: string };
  _count: { measurements: number };
};
export type PlanPageWorkspace = {
  document: Pick<PlanDocument, "id" | "projectId" | "fileName" | "fileType" | "version" | "status">;
  calibration: PageCalibration | null;
  measurements: PlanMeasurement[];
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
