/**
 * Minimal Database fragment for `public.incident_reports`.
 * Used to keep client/PostgREST column keys in sync until full codegen is regenerated.
 * Queries should still go through `fromIncidentReports()` to bypass strict table locks.
 */

export type IncidentReportsRow = {
  id: string;
  reference_number: string;
  submitted_by_id: string | null;
  submitted_by_name: string | null;
  incident_date_time: string;
  project_id: string | null;
  project_name: string | null;
  injured_worker_id: string | null;
  injured_worker_name: string | null;
  injury_details: string | null;
  treatment_details: string;
  treating_person_id: string | null;
  treating_person_name: string | null;
  offsite_treatment_location: string | null;
  what_occurred: string;
  incident_location_details: string;
  treatment_given: string | null;
  witness_ids: string[];
  witness_names: string[];
  immediate_corrective_action_required: boolean;
  is_notifiable_under_whs: boolean;
  what_caused_to_go_wrong: string | null;
  what_could_have_prevented: string | null;
  recommendations_to_prevent: string | null;
  medical_certificate_urls: string[];
  submitter_signature_url: string | null;
  status: string;
  is_read_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type IncidentReportsInsert = Omit<
  IncidentReportsRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type IncidentReportsUpdate = Partial<IncidentReportsInsert>;

export type IncidentReportsDatabase = {
  public: {
    Tables: {
      incident_reports: {
        Row: IncidentReportsRow;
        Insert: IncidentReportsInsert;
        Update: IncidentReportsUpdate;
        Relationships: [];
      };
    };
  };
};
