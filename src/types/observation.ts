export type ObservationStatus = 
  | 'visible_change' 
  | 'no_clear_change' 
  | 'incomparable' 
  | 'insufficient_evidence' 
  | 'professional_review';

export interface ObservationPayload {
  sessionId: string;
  beforeImageUrl: string;
  afterImageUrl: string;
  additionalNotes?: string;
}

export interface ObservationResult {
  id: string;
  sessionId: string;
  status: ObservationStatus;
  confidence: number;
  limitations: string[];
  warnings: string[];
  createdAt: string;
}