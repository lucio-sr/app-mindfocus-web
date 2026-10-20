export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      analysis_models: {
        Row: {
          created_at: string
          cut_points: Json
          id: string
          is_default: boolean
          metadata: Json
          name: string
          network: Json
          trained_at: string | null
          version: string
        }
        Insert: {
          created_at?: string
          cut_points?: Json
          id?: string
          is_default?: boolean
          metadata?: Json
          name: string
          network?: Json
          trained_at?: string | null
          version: string
        }
        Update: {
          created_at?: string
          cut_points?: Json
          id?: string
          is_default?: boolean
          metadata?: Json
          name?: string
          network?: Json
          trained_at?: string | null
          version?: string
        }
        Relationships: []
      }
      analysis_runs: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inputs: Json
          institution_id: string
          model_id: string
          p_adhd: number | null
          patient_id: string
          session_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inputs?: Json
          institution_id: string
          model_id: string
          p_adhd?: number | null
          patient_id: string
          session_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inputs?: Json
          institution_id?: string
          model_id?: string
          p_adhd?: number | null
          patient_id?: string
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_runs_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
          {
            foreignKeyName: "analysis_runs_institution_id_patient_id_session_id_fkey"
            columns: ["institution_id", "patient_id", "session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["institution_id", "patient_id", "id"]
          },
          {
            foreignKeyName: "analysis_runs_model_id_fkey"
            columns: ["model_id"]
            isOneToOne: false
            referencedRelation: "analysis_models"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          changed_columns: string[] | null
          created_at: string
          id: number
          institution_id: string | null
          record_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changed_columns?: string[] | null
          created_at?: string
          id?: never
          institution_id?: string | null
          record_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changed_columns?: string[] | null
          created_at?: string
          id?: never
          institution_id?: string | null
          record_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          accepted_at: string
          guardian_id: string
          id: string
          institution_id: string
          patient_id: string
          recorded_by: string | null
          revoked_at: string | null
          term_version: string
        }
        Insert: {
          accepted_at?: string
          guardian_id: string
          id?: string
          institution_id: string
          patient_id: string
          recorded_by?: string | null
          revoked_at?: string | null
          term_version: string
        }
        Update: {
          accepted_at?: string
          guardian_id?: string
          id?: string
          institution_id?: string
          patient_id?: string
          recorded_by?: string | null
          revoked_at?: string | null
          term_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
        ]
      }
      game_access_codes: {
        Row: {
          code_hash: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          institution_id: string
          patient_id: string
          purpose: Database["public"]["Enums"]["access_code_purpose"]
          revoked_at: string | null
          used_at: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          institution_id: string
          patient_id: string
          purpose?: Database["public"]["Enums"]["access_code_purpose"]
          revoked_at?: string | null
          used_at?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          institution_id?: string
          patient_id?: string
          purpose?: Database["public"]["Enums"]["access_code_purpose"]
          revoked_at?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "game_access_codes_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
        ]
      }
      game_device_sessions: {
        Row: {
          access_code_id: string
          created_at: string
          expires_at: string
          id: string
          institution_id: string
          patient_id: string
          purpose: Database["public"]["Enums"]["access_code_purpose"]
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          access_code_id: string
          created_at?: string
          expires_at: string
          id?: string
          institution_id: string
          patient_id: string
          purpose: Database["public"]["Enums"]["access_code_purpose"]
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          access_code_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          institution_id?: string
          patient_id?: string
          purpose?: Database["public"]["Enums"]["access_code_purpose"]
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_device_sessions_access_code_id_fkey"
            columns: ["access_code_id"]
            isOneToOne: false
            referencedRelation: "game_access_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_device_sessions_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
        ]
      }
      game_logs: {
        Row: {
          created_at: string
          data: Json
          id: string
          institution_id: string
          patient_id: string
          session_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: string
          institution_id: string
          patient_id: string
          session_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          institution_id?: string
          patient_id?: string
          session_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_logs_institution_id_patient_id_session_id_fkey"
            columns: ["institution_id", "patient_id", "session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["institution_id", "patient_id", "id"]
          },
        ]
      }
      game_results: {
        Row: {
          attempt: number
          click_amount: number | null
          created_at: string
          ended_at: string | null
          first_touch_at: string | null
          hits: number | null
          id: string
          institution_id: string
          metrics: Json
          patient_id: string
          purposeless_clicks: number | null
          session_id: string
          started_at: string | null
          test: Database["public"]["Enums"]["game_test"]
          total_errors: number | null
        }
        Insert: {
          attempt?: number
          click_amount?: number | null
          created_at?: string
          ended_at?: string | null
          first_touch_at?: string | null
          hits?: number | null
          id?: string
          institution_id: string
          metrics?: Json
          patient_id: string
          purposeless_clicks?: number | null
          session_id: string
          started_at?: string | null
          test: Database["public"]["Enums"]["game_test"]
          total_errors?: number | null
        }
        Update: {
          attempt?: number
          click_amount?: number | null
          created_at?: string
          ended_at?: string | null
          first_touch_at?: string | null
          hits?: number | null
          id?: string
          institution_id?: string
          metrics?: Json
          patient_id?: string
          purposeless_clicks?: number | null
          session_id?: string
          started_at?: string | null
          test?: Database["public"]["Enums"]["game_test"]
          total_errors?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_results_institution_id_patient_id_session_id_fkey"
            columns: ["institution_id", "patient_id", "session_id"]
            isOneToOne: false
            referencedRelation: "game_sessions"
            referencedColumns: ["institution_id", "patient_id", "id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          app_version: string | null
          created_at: string
          device_session_id: string | null
          ended_at: string | null
          id: string
          institution_id: string
          legacy_id: number | null
          patient_id: string
          played: string[]
          raw: Json | null
          started_at: string | null
          updated_at: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_session_id?: string | null
          ended_at?: string | null
          id?: string
          institution_id: string
          legacy_id?: number | null
          patient_id: string
          played?: string[]
          raw?: Json | null
          started_at?: string | null
          updated_at?: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_session_id?: string | null
          ended_at?: string | null
          id?: string
          institution_id?: string
          legacy_id?: number | null
          patient_id?: string
          played?: string[]
          raw?: Json | null
          started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "game_sessions_device_session_id_fkey"
            columns: ["device_session_id"]
            isOneToOne: true
            referencedRelation: "game_device_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_sessions_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
        ]
      }
      institution_members: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          institution_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          institution_id: string
          role: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          institution_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "institution_members_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      institutions: {
        Row: {
          cep: string | null
          city: string | null
          complement: string | null
          created_at: string
          created_by: string | null
          district: string | null
          document: string
          document_type: Database["public"]["Enums"]["document_type"]
          email: string | null
          id: string
          legal_name: string | null
          logo_path: string | null
          name: string
          number: string | null
          phone: string | null
          status: Database["public"]["Enums"]["institution_status"]
          street: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          document: string
          document_type: Database["public"]["Enums"]["document_type"]
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name: string
          number?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["institution_status"]
          street?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string | null
          district?: string | null
          document?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_path?: string | null
          name?: string
          number?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["institution_status"]
          street?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      neuropsych_assessments: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          created_at: string
          created_by: string | null
          file_name: string | null
          file_path: string | null
          id: string
          institution_id: string
          instrument: Database["public"]["Enums"]["neuro_instrument"]
          instrument_name: string | null
          legacy_id: number | null
          notes: string | null
          patient_id: string
          scores: Json
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          institution_id: string
          instrument: Database["public"]["Enums"]["neuro_instrument"]
          instrument_name?: string | null
          legacy_id?: number | null
          notes?: string | null
          patient_id: string
          scores?: Json
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          institution_id?: string
          instrument?: Database["public"]["Enums"]["neuro_instrument"]
          instrument_name?: string | null
          legacy_id?: number | null
          notes?: string | null
          patient_id?: string
          scores?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neuropsych_assessments_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "neuropsych_assessments_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
        ]
      }
      patient_guardians: {
        Row: {
          created_at: string
          guardian_id: string
          income: string | null
          institution_id: string
          patient_id: string
          relationship: string
        }
        Insert: {
          created_at?: string
          guardian_id: string
          income?: string | null
          institution_id: string
          patient_id: string
          relationship: string
        }
        Update: {
          created_at?: string
          guardian_id?: string
          income?: string | null
          institution_id?: string
          patient_id?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_guardians_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
        ]
      }
      patients: {
        Row: {
          adhd_diagnosis: boolean
          autism_diagnosis: boolean
          birthdate: string
          cpf: string | null
          created_at: string
          created_by: string | null
          education: string | null
          full_name: string
          gender: string | null
          id: string
          institution_id: string
          legacy_id: number | null
          medications: string[]
          notes: string | null
          public_school: boolean | null
          school_dropout: boolean
          school_dropout_times: number
          school_failure: boolean
          school_failure_times: number
          siblings: number
          uf: string | null
          updated_at: string
        }
        Insert: {
          adhd_diagnosis?: boolean
          autism_diagnosis?: boolean
          birthdate: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          education?: string | null
          full_name: string
          gender?: string | null
          id?: string
          institution_id: string
          legacy_id?: number | null
          medications?: string[]
          notes?: string | null
          public_school?: boolean | null
          school_dropout?: boolean
          school_dropout_times?: number
          school_failure?: boolean
          school_failure_times?: number
          siblings?: number
          uf?: string | null
          updated_at?: string
        }
        Update: {
          adhd_diagnosis?: boolean
          autism_diagnosis?: boolean
          birthdate?: string
          cpf?: string | null
          created_at?: string
          created_by?: string | null
          education?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          institution_id?: string
          legacy_id?: number | null
          medications?: string[]
          notes?: string | null
          public_school?: boolean | null
          school_dropout?: boolean
          school_dropout_times?: number
          school_failure?: boolean
          school_failure_times?: number
          siblings?: number
          uf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patients_institution_id_fkey"
            columns: ["institution_id"]
            isOneToOne: false
            referencedRelation: "institutions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birthdate: string | null
          cep: string | null
          city: string | null
          complement: string | null
          cpf: string
          created_at: string
          crp_number: string | null
          crp_uf: string | null
          district: string | null
          email: string
          full_name: string
          gender: string | null
          id: string
          number: string | null
          phone: string | null
          street: string | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          birthdate?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          cpf: string
          created_at?: string
          crp_number?: string | null
          crp_uf?: string | null
          district?: string | null
          email: string
          full_name: string
          gender?: string | null
          id: string
          number?: string | null
          phone?: string | null
          street?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          birthdate?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          cpf?: string
          created_at?: string
          crp_number?: string | null
          crp_uf?: string | null
          district?: string | null
          email?: string
          full_name?: string
          gender?: string | null
          id?: string
          number?: string | null
          phone?: string | null
          street?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      questionnaire_requests: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          failed_attempts: number
          guardian_id: string
          id: string
          institution_id: string
          instrument: string
          patient_id: string
          response_id: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at: string
          failed_attempts?: number
          guardian_id: string
          id?: string
          institution_id: string
          instrument?: string
          patient_id: string
          response_id?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          failed_attempts?: number
          guardian_id?: string
          id?: string
          institution_id?: string
          instrument?: string
          patient_id?: string
          response_id?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_requests_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
          {
            foreignKeyName: "questionnaire_requests_patient_id_guardian_id_fkey"
            columns: ["patient_id", "guardian_id"]
            isOneToOne: false
            referencedRelation: "patient_guardians"
            referencedColumns: ["patient_id", "guardian_id"]
          },
          {
            foreignKeyName: "questionnaire_requests_response_id_fkey"
            columns: ["response_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_responses: {
        Row: {
          answers: Json
          channel: string | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          guardian_id: string | null
          id: string
          institution_id: string
          instrument: string
          legacy_id: number | null
          patient_id: string
          scores: Json | null
          started_at: string | null
        }
        Insert: {
          answers: Json
          channel?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          guardian_id?: string | null
          id?: string
          institution_id: string
          instrument?: string
          legacy_id?: number | null
          patient_id: string
          scores?: Json | null
          started_at?: string | null
        }
        Update: {
          answers?: Json
          channel?: string | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          guardian_id?: string | null
          id?: string
          institution_id?: string
          instrument?: string
          legacy_id?: number | null
          patient_id?: string
          scores?: Json | null
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_responses_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
        ]
      }
      reports: {
        Row: {
          analysis_run_id: string | null
          created_at: string
          created_by: string | null
          id: string
          institution_id: string
          kind: Database["public"]["Enums"]["report_kind"]
          notes: string | null
          patient_id: string
          storage_path: string
        }
        Insert: {
          analysis_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id: string
          kind: Database["public"]["Enums"]["report_kind"]
          notes?: string | null
          patient_id: string
          storage_path: string
        }
        Update: {
          analysis_run_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          institution_id?: string
          kind?: Database["public"]["Enums"]["report_kind"]
          notes?: string | null
          patient_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_institution_id_analysis_run_id_fkey"
            columns: ["institution_id", "analysis_run_id"]
            isOneToOne: false
            referencedRelation: "analysis_runs"
            referencedColumns: ["institution_id", "id"]
          },
          {
            foreignKeyName: "reports_institution_id_patient_id_fkey"
            columns: ["institution_id", "patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["institution_id", "id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_institution_member: {
        Args: {
          p_institution_id: string
          p_role: Database["public"]["Enums"]["member_role"]
          p_user_id: string
        }
        Returns: string
      }
      create_institution: {
        Args: { p_admin_id: string; p_institution: Json }
        Returns: string
      }
      create_questionnaire_request: {
        Args: {
          p_guardian_id: string
          p_patient_id: string
          p_valid_days?: number
        }
        Returns: {
          expires_at: string
          request_id: string
          token: string
        }[]
      }
      current_user_access: { Args: never; Returns: Json }
      hit_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      ingest_game_logs: {
        Args: { p_payload: Json; p_token: string }
        Returns: string
      }
      ingest_game_session: {
        Args: { p_payload: Json; p_token: string }
        Returns: string
      }
      issue_access_code: {
        Args: {
          p_patient_id: string
          p_purpose?: Database["public"]["Enums"]["access_code_purpose"]
          p_valid_for?: string
        }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      platform_institution_stats: {
        Args: never
        Returns: {
          created_at: string
          game_sessions: number
          institution_id: string
          members: number
          name: string
          patients: number
          reports: number
          status: Database["public"]["Enums"]["institution_status"]
        }[]
      }
      questionnaire_by_token: {
        Args: { p_birthdate?: string; p_token: string }
        Returns: Json
      }
      redeem_game_access_code: {
        Args: { p_code: string }
        Returns: {
          expires_at: string
          patient_id: string
          session_id: string
          token: string
        }[]
      }
      redeem_simulator_access_code: { Args: { p_code: string }; Returns: Json }
      register_guardian_patients: {
        Args: {
          p_consent_term_version?: string
          p_guardian_id: string
          p_institution_id: string
          p_patients: Json
        }
        Returns: string[]
      }
      register_patient: {
        Args: {
          p_consent_term_version?: string
          p_guardians: Json
          p_institution_id: string
          p_patient: Json
        }
        Returns: string
      }
      remove_patient_guardian: {
        Args: { p_guardian_id: string; p_patient_id: string }
        Returns: undefined
      }
      revoke_questionnaire_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      submit_questionnaire_by_token: {
        Args: {
          p_answers: Json
          p_birthdate: string
          p_started_at?: string
          p_token: string
        }
        Returns: Json
      }
      submit_questionnaire_in_person: {
        Args: {
          p_answers: Json
          p_guardian_id: string
          p_patient_id: string
          p_started_at?: string
        }
        Returns: string
      }
    }
    Enums: {
      access_code_purpose: "game" | "simulator"
      document_type: "cpf" | "cnpj"
      game_test: "gonogo" | "tmt_a" | "tmt_b" | "genius" | "stroop"
      institution_status: "pending" | "active" | "suspended"
      member_role: "admin" | "psychologist" | "staff"
      neuro_instrument: "tavis" | "fdt" | "neupsilin" | "other"
      report_kind: "summary" | "general"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      access_code_purpose: ["game", "simulator"],
      document_type: ["cpf", "cnpj"],
      game_test: ["gonogo", "tmt_a", "tmt_b", "genius", "stroop"],
      institution_status: ["pending", "active", "suspended"],
      member_role: ["admin", "psychologist", "staff"],
      neuro_instrument: ["tavis", "fdt", "neupsilin", "other"],
      report_kind: ["summary", "general"],
    },
  },
} as const
