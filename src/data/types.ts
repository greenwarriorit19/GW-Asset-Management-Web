// Domain model for the Green Warrior Asset Management & Employee Handover System.
// `assets` holds the CURRENT state of every asset. `transactions` is the permanent,
// append-only history. Nothing in transactions is ever edited or deleted.

import type { RoleDef } from './permissions';
export type { RoleDef } from './permissions';

/** Role code: one of the built-in codes or a custom role created under Users & Permissions. */
export type Role = 'super_admin' | 'asset_admin' | (string & {});

export type AssetStatus =
  | 'Available' | 'Reserved' | 'Assigned' | 'Transferred' | 'Returned'
  | 'Under Inspection' | 'Under Repair' | 'Damaged' | 'Lost' | 'Retired' | 'Disposed';

export const ASSET_STATUSES: AssetStatus[] = [
  'Available', 'Reserved', 'Assigned', 'Transferred', 'Returned',
  'Under Inspection', 'Under Repair', 'Damaged', 'Lost', 'Retired', 'Disposed',
];

export type Condition = 'New' | 'Good' | 'Fair' | 'Damaged' | 'Not Working';
export const CONDITIONS: Condition[] = ['New', 'Good', 'Fair', 'Damaged', 'Not Working'];

export type OwnershipType = 'Company Owned' | 'Leased' | 'Rented' | 'Project Funded' | 'Client Provided';
export const OWNERSHIP_TYPES: OwnershipType[] = ['Company Owned', 'Leased', 'Rented', 'Project Funded', 'Client Provided'];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  employeeId?: string;      // links to Employee.id when the user is also an employee
  departmentId?: string;
  active: boolean;
}

export interface Department { id: string; code: string; name: string; headEmployeeId?: string }
export interface Location { id: string; code: string; name: string; address?: string }
export interface Category { id: string; code: string; name: string; description?: string; verificationIntervalMonths: number }

export interface Employee {
  id: string;
  employeeCode: string;     // e.g. GW-EMP-0012 (shown as "Employee ID")
  erpId?: string;           // employee reference in the ERP / payroll system
  name: string;
  designation: string;
  departmentId: string;
  dateOfJoining: string;
  workLocationId: string;
  mobile: string;
  email: string;
  active: boolean;
}

export interface Attachment {
  name: string; type: string; size: number;
  dataUrl?: string;        // inline copy (small files / previews)
  driveId?: string;        // Google Drive file id when stored in the shared Drive folder
  url?: string;            // Drive view link
}

export interface Asset {
  id: string;               // GW-AST-MOB-0001 — permanent, unique
  categoryId: string;
  name: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  imei?: string;
  sim?: string;
  mdmRegistered?: boolean;   // enrolled in Mobile Device Management (phones, tablets and other field devices)
  barcode?: string;
  ownershipType: OwnershipType;
  supplierName: string;
  invoiceNumber: string;
  poNumber: string;
  purchaseDate: string;
  purchaseCost: number;
  warrantyStart?: string;
  warrantyExpiry?: string;
  funding?: string;
  status: AssetStatus;
  condition: Condition;
  departmentId: string;
  locationId: string;
  custodianEmployeeId?: string;
  lastVerificationDate?: string;
  nextVerificationDate?: string;
  specification?: string;
  accessories?: string;
  maintenanceNotes?: string;
  remarks?: string;
  invoiceAttachment?: Attachment;
  warrantyAttachment?: Attachment;
  photo?: Attachment;
  registeredBy: string;
  registeredAt: string;
  registrationApprovedBy?: string;
}

export type TransactionType =
  | 'REGISTRATION' | 'HANDOVER' | 'RETURN' | 'INSPECTION' | 'TRANSFER' | 'REPAIR_SENT' | 'REPAIR_COMPLETED'
  | 'INCIDENT' | 'VERIFICATION' | 'RETIREMENT' | 'DISPOSAL' | 'STATUS_CHANGE' | 'UPDATE';

export interface Transaction {
  id: string;
  type: TransactionType;
  assetId: string;
  date: string;             // ISO datetime
  reference?: string;       // e.g. GW-HO-202609-0001
  fromEmployeeId?: string;
  toEmployeeId?: string;
  fromDepartmentId?: string;
  toDepartmentId?: string;
  fromLocationId?: string;
  toLocationId?: string;
  statusBefore: AssetStatus;
  statusAfter: AssetStatus;
  conditionBefore?: Condition;
  conditionAfter?: Condition;
  performedByUserId: string;
  performedByName: string;
  reason: string;
  remarks?: string;
}

export type ApprovalState = 'Pending Approval' | 'Approved' | 'Rejected';

export interface HandoverItem {
  assetId: string;
  condition: Condition;
  quantity: number;
  accessories: string;
  remarks: string;
}

export interface Handover {
  id: string;               // GW-HO-YYYYMM-0001
  date: string;
  employeeId: string;
  issuedByUserId: string;
  expectedReturnDate?: string;
  purpose: string;
  locationOfUse: string;
  items: HandoverItem[];
  approval: ApprovalState;
  approvedByUserId?: string;
  approvedAt?: string;
  approvalComments?: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  employeeSignature?: string;   // typed-name signature captured on acknowledgement
  authorizedSignatoryUserId?: string;
  status: 'Draft' | 'Awaiting Approval' | 'Awaiting Acknowledgement' | 'Active' | 'Closed' | 'Rejected';
  createdByUserId: string;
  createdAt: string;
  transferId?: string;      // set when this handover was generated by a transfer
}

export interface AssetReturn {
  id: string;               // GW-RT-YYYYMM-0001
  date: string;
  assetId: string;
  employeeId: string;
  handoverId?: string;
  receivedByUserId: string;
  conditionReported: Condition;
  accessoriesReturned: string;
  employeeRemarks?: string;
  // Inspection (required before the asset becomes Available)
  inspected: boolean;
  inspectedByUserId?: string;
  inspectionDate?: string;
  inspectionCondition?: Condition;
  inspectionOutcome?: 'Acceptable' | 'Faulty' | 'Damaged';
  inspectionNotes?: string;
  employeeSignature?: string;
  receiverSignature?: string;
  status: 'Pending Inspection' | 'Completed';
  createdByUserId: string;
  createdAt: string;
}

export interface Transfer {
  id: string;               // GW-TR-YYYYMM-0001
  date: string;
  assetId: string;
  fromEmployeeId?: string;
  toEmployeeId?: string;
  fromDepartmentId: string;
  toDepartmentId: string;
  fromLocationId: string;
  toLocationId: string;
  reason: string;
  conditionAtTransfer: Condition;
  requestedByUserId: string;
  approval: ApprovalState;
  approvedByUserId?: string;
  approvedAt?: string;
  approvalComments?: string;
  status: 'Awaiting Approval' | 'Approved' | 'Completed' | 'Rejected';
  completedAt?: string;
  newHandoverId?: string;
  createdAt: string;
}

export interface Repair {
  id: string;               // GW-RP-YYYYMM-0001
  assetId: string;
  reportedDate: string;
  reportedByUserId: string;
  faultDescription: string;
  vendor: string;
  estimatedCost: number;
  expectedReturnDate?: string;
  quotation?: Attachment;
  serviceReport?: Attachment;
  actualCost?: number;
  completionDate?: string;
  workDone?: string;
  inspectionNotes?: string;
  inspectedByUserId?: string;
  outcome?: 'Available' | 'Assigned' | 'Retired';
  approval: ApprovalState;
  approvedByUserId?: string;
  status: 'Open' | 'In Progress' | 'Completed';
  statusBeforeRepair: AssetStatus;
  custodianBeforeRepair?: string;
  createdAt: string;
}

export interface Incident {
  id: string;               // GW-INC-YYYYMM-0001
  assetId: string;
  type: 'Lost' | 'Damaged';
  incidentDate: string;
  reportedByEmployeeId: string;
  reportedByUserId: string;
  location: string;
  description: string;
  policeReportNo?: string;
  investigatedByUserId?: string;
  investigationNotes?: string;
  responsibility?: string;
  recoveryAction?: string;
  recoveryAmount?: number;
  resolution?: 'Repair' | 'Recovered' | 'Written Off' | 'Retired';
  approval: ApprovalState;
  approvedByUserId?: string;
  approvedAt?: string;
  status: 'Reported' | 'Under Investigation' | 'Awaiting Approval' | 'Closed';
  createdAt: string;
}

export interface Verification {
  id: string;               // GW-VF-YYYYMM-0001
  assetId: string;
  date: string;
  verifiedByUserId: string;
  expectedCustodianId?: string;
  foundCustodianId?: string;
  expectedLocationId: string;
  foundLocationId?: string;
  expectedStatus: AssetStatus;
  foundCondition?: Condition;
  result: 'Verified' | 'Mismatch' | 'Missing';
  notes?: string;
  nextVerificationDate: string;
  createdAt: string;
}

export interface Disposal {
  id: string;               // GW-DSP-YYYYMM-0001
  assetId: string;
  // Retirement
  retirementRequestedByUserId: string;
  retirementRequestedAt: string;
  retirementReason: string;
  technicalRecommendation?: string;
  retirementApproval: ApprovalState;
  retirementApprovedByUserId?: string;
  retirementApprovedAt?: string;
  // Disposal
  dataErased?: boolean;
  dataErasureCertificate?: Attachment;
  disposalMethod?: 'Sale' | 'Scrap' | 'Donation' | 'Return to Lessor' | 'E-Waste Vendor' | 'Write Off';
  disposalDate?: string;
  disposalValue?: number;
  disposalVendor?: string;
  disposalProof?: Attachment;
  disposalApproval: ApprovalState;
  disposalApprovedByUserId?: string;
  disposalApprovedAt?: string;
  status: 'Retirement Pending' | 'Retired' | 'Disposal Pending' | 'Disposed' | 'Rejected';
  createdAt: string;
}

export interface Approval {
  id: string;
  entityType: 'Registration' | 'Handover' | 'Transfer' | 'Repair' | 'Incident' | 'Retirement' | 'Disposal' | 'Return';
  entityId: string;
  requestedByUserId: string;
  requestedAt: string;
  approverRole: Role;
  decision: ApprovalState;
  decidedByUserId?: string;
  decidedAt?: string;
  comments?: string;
}

export interface AssetDocument {
  id: string;
  assetId?: string;
  entityType: string;       // Asset | Handover | Repair | Incident | Disposal | Return | Transfer
  entityId: string;
  documentType: string;     // Invoice | Warranty | Photograph | Quotation | Service Report | Proof of Disposal | Signed Form | Other
  attachment: Attachment;
  uploadedByUserId: string;
  uploadedAt: string;
  remarks?: string;
}

export interface AuditLog {
  id: string;
  at: string;
  userId: string;
  userName: string;
  role: Role;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  details?: string;
}

export interface Database {
  version: number;
  users: User[];
  roles: RoleDef[];
  departments: Department[];
  locations: Location[];
  categories: Category[];
  employees: Employee[];
  assets: Asset[];
  transactions: Transaction[];
  handovers: Handover[];
  returns: AssetReturn[];
  transfers: Transfer[];
  repairs: Repair[];
  incidents: Incident[];
  verifications: Verification[];
  disposals: Disposal[];
  approvals: Approval[];
  documents: AssetDocument[];
  auditLogs: AuditLog[];
}
