export interface WorkerOnboardingFormPayload {
  fullName: string;
  email: string;
  phone: string;
  address: string;
  state: string;
  emergencyContactName: string;
  emergencyContactRelationship: string;
  emergencyContactPhone: string;
  bankName: string;
  bankBsb: string;
  bankAccountNumber: string;
  superFund: string;
  superMemberNumber: string;
  superUsi: string;
  tfn: string;
  redundancyFundName: string;
  redundancyMemberNumber: string;
  whiteCardNumber: string;
  whiteCardState: string;
  silicaCertNumber: string;
  silicaCertIssueDate: string;
  driversLicenceNumber: string;
  driversLicenceClass: string;
  driversLicenceExpiry: string;
  photoUrl: string;
  vocs: Array<{
    title: string;
    voc_type?: string | null;
    issuing_org?: string | null;
    issue_date?: string | null;
    expiry_date?: string | null;
    document_url?: string | null;
  }>;
}

export interface WorkerOnboardingRecord {
  id: string;
  email: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  address: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  bank_name: string | null;
  bank_bsb: string | null;
  bank_account_number: string | null;
  super_fund: string | null;
  super_member_number: string | null;
  super_usi: string | null;
  tfn: string | null;
  redundancy_fund_name: string | null;
  redundancy_member_number: string | null;
  white_card_number: string | null;
  state: string | null;
  silica_cert_number: string | null;
  silica_cert_issue_date: string | null;
  drivers_licence_number: string | null;
  drivers_licence_class: string | null;
  drivers_licence_expiry: string | null;
  photo_url: string | null;
  onboarding_completed: boolean;
  vocs: Array<{
    id?: string;
    title: string;
    voc_type?: string | null;
    issuing_org?: string | null;
    issue_date?: string | null;
    expiry_date?: string | null;
    document_url?: string | null;
  }>;
}
