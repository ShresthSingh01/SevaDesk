export interface FieldLabels {
  fullName: string;
  dob: string;
  gender: string;
  mobile: string;
  aadhaar: string;
  voterId: string;
  rationCard: string;
  address: string;
  state: string;
  district: string;
  pincode: string;
  bankAccount: string;
  ifsc: string;
  email: string;
}

export type FieldKey = keyof FieldLabels;

export interface Citizen {
  id: string;
  fullName: string;
  dob?: string;
  gender?: 'Male' | 'Female' | 'Transgender' | 'Prefer not to say' | '';
  mobile?: string;
  email?: string;
  address?: string;
  state?: string;
  district?: string;
  pincode?: string;
  aadhaar?: string;
  voterId?: string;
  rationCard?: string;
  bankAccount?: string;
  ifsc?: string;
  consentAt?: string;
  consentPurpose?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  department?: string;
  portalUrl?: string;
  officialFee?: number | null;
  operatorCharge?: number | null;
  feeSourceUrl?: string;
  feeVerifiedAt?: string;
  maxUploadMB?: number | null;
  allowedExtensions?: string[];
  requiredFields?: FieldKey[];
  adapterId?: string;
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface DocumentInfo {
  name: string;
  size: number;
  type: string;
}

export interface ValidationError {
  field: string;
  label: string;
  message: string;
}

export interface ValidationWarning {
  field: string;
  label: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface PreflightSnapshot extends ValidationResult {
  checkedAt: string;
  rulesSnapshot: {
    requiredFields: string[];
    maxUploadMB: number | null;
    allowedExtensions: string[];
  };
}

export interface Application {
  id: string;
  citizenId: string;
  serviceId: string;
  status: 'draft' | 'needs_correction' | 'ready' | 'in_portal' | 'submitted' | 'rejected' | 'closed';
  receiptRef?: string;
  statusNote?: string;
  portalErrorCategory?: string;
  preflight?: PreflightSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  action: string;
  description: string;
  entityType: string;
  entityId: string;
}

export interface OcrCandidate {
  key: FieldKey;
  label: string;
  value: string;
  confidence: string | number;
  sensitive?: boolean;
}

export interface PortalErrorInterpretation {
  category: string;
  title: string;
  explanation: string;
  action: string;
  confidence: 'heuristic' | 'none';
}

export interface FieldSuggestion {
  key: string;
  label: string;
  value: string;
  candidates: Array<{ field: any; index: number; score: number }>;
  suggestedIndex: number;
  confidence: number;
}

export declare const FIELD_LABELS: FieldLabels;
export declare const FIELD_KEYS: FieldKey[];
export declare const KEY_ALIASES: Record<string, string[]>;

export declare function normalizeText(value?: string): string;
export declare function onlyDigits(value?: string): string;
export declare function maskIdentifier(value?: string, visible?: number): string;
export declare function validateVerhoeff(numStr: string): boolean;
export declare function validateCitizen(citizen?: Partial<Citizen>, requiredFields?: string[]): ValidationResult;
export declare function validateCase(citizen?: Partial<Citizen>, service?: Partial<ServiceDefinition>, documents?: DocumentInfo[]): ValidationResult;
export declare function scoreFieldMatch(dataKey: string, field?: any): number;
export declare function suggestFieldMatches(dataFields?: Record<string, any>, pageFields?: any[]): FieldSuggestion[];
export declare function extractOcrCandidates(text?: string): OcrCandidate[];
export declare function interpretPortalError(message?: string): PortalErrorInterpretation;
export declare function formatINR(value: number | string | null | undefined): string;
export declare function buildApplicationPayload(application: Application, citizen: Citizen, service: ServiceDefinition): any;
