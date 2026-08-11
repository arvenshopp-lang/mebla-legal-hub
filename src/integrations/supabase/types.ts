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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_name: string | null
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip: string | null
          metadata: Json
          organization_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_name?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: string | null
          metadata?: Json
          organization_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_name?: string | null
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
          organization_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          browser: string | null
          created_at: string
          description: string | null
          device: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip: string | null
          metadata: Json
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          browser?: string | null
          created_at?: string
          description?: string | null
          device?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          browser?: string | null
          created_at?: string
          description?: string | null
          device?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip?: string | null
          metadata?: Json
          user_agent?: string | null
        }
        Relationships: []
      }
      case_code_registry: {
        Row: {
          code: string
          created_at: string
        }
        Insert: {
          code: string
          created_at?: string
        }
        Update: {
          code?: string
          created_at?: string
        }
        Relationships: []
      }
      case_lookup_attempts: {
        Row: {
          code_attempt: string | null
          created_at: string
          id: string
          ip_hash: string
          success: boolean
        }
        Insert: {
          code_attempt?: string | null
          created_at?: string
          id?: string
          ip_hash: string
          success?: boolean
        }
        Update: {
          code_attempt?: string | null
          created_at?: string
          id?: string
          ip_hash?: string
          success?: boolean
        }
        Relationships: []
      }
      case_parties: {
        Row: {
          case_id: string
          commercial_registration: string | null
          commercial_registration_bidx: string | null
          commercial_registration_enc: string | null
          created_at: string
          email: string | null
          id: string
          legal_role: string | null
          national_id: string | null
          national_id_bidx: string | null
          national_id_enc: string | null
          notes: string | null
          organization_id: string
          party_name: string
          party_type: string | null
          phone: string | null
          pii_key_version: number | null
          representative_name: string | null
        }
        Insert: {
          case_id: string
          commercial_registration?: string | null
          commercial_registration_bidx?: string | null
          commercial_registration_enc?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_role?: string | null
          national_id?: string | null
          national_id_bidx?: string | null
          national_id_enc?: string | null
          notes?: string | null
          organization_id: string
          party_name: string
          party_type?: string | null
          phone?: string | null
          pii_key_version?: number | null
          representative_name?: string | null
        }
        Update: {
          case_id?: string
          commercial_registration?: string | null
          commercial_registration_bidx?: string | null
          commercial_registration_enc?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_role?: string | null
          national_id?: string | null
          national_id_bidx?: string | null
          national_id_enc?: string | null
          notes?: string | null
          organization_id?: string
          party_name?: string
          party_type?: string | null
          phone?: string | null
          pii_key_version?: number | null
          representative_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_parties_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_parties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_party_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          after_values: Json | null
          before_values: Json | null
          case_id: string | null
          changed_fields: string[] | null
          created_at: string
          id: string
          organization_id: string
          party_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_values?: Json | null
          before_values?: Json | null
          case_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          organization_id: string
          party_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_values?: Json | null
          before_values?: Json | null
          case_id?: string | null
          changed_fields?: string[] | null
          created_at?: string
          id?: string
          organization_id?: string
          party_id?: string
        }
        Relationships: []
      }
      case_party_permissions: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_at: string
          granted_by: string | null
          id: string
          organization_id: string
          permission: string
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          organization_id: string
          permission: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          organization_id?: string
          permission?: string
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_party_permissions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      case_updates: {
        Row: {
          case_id: string
          created_at: string
          created_by: string | null
          description: string | null
          event_date: string
          id: string
          is_client_visible: boolean
          organization_id: string
          title: string
          update_type: Database["public"]["Enums"]["update_type"]
        }
        Insert: {
          case_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          id?: string
          is_client_visible?: boolean
          organization_id: string
          title: string
          update_type: Database["public"]["Enums"]["update_type"]
        }
        Update: {
          case_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_date?: string
          id?: string
          is_client_visible?: boolean
          organization_id?: string
          title?: string
          update_type?: Database["public"]["Enums"]["update_type"]
        }
        Relationships: [
          {
            foreignKeyName: "case_updates_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_updates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assigned_lawyer_id: string | null
          case_number: string | null
          case_title: string
          case_type: string | null
          client_id: string | null
          client_role: Database["public"]["Enums"]["client_role"] | null
          closed_at: string | null
          court_branch: string | null
          court_name: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          internal_notes: string | null
          judge_name: string | null
          judicial_circuit: string | null
          last_activity_at: string
          next_action: string | null
          next_action_date: string | null
          opened_at: string | null
          opponent_name: string | null
          organization_id: string
          priority: Database["public"]["Enums"]["case_priority"]
          public_code: string | null
          status: Database["public"]["Enums"]["case_status"]
          updated_at: string
        }
        Insert: {
          assigned_lawyer_id?: string | null
          case_number?: string | null
          case_title: string
          case_type?: string | null
          client_id?: string | null
          client_role?: Database["public"]["Enums"]["client_role"] | null
          closed_at?: string | null
          court_branch?: string | null
          court_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          judge_name?: string | null
          judicial_circuit?: string | null
          last_activity_at?: string
          next_action?: string | null
          next_action_date?: string | null
          opened_at?: string | null
          opponent_name?: string | null
          organization_id: string
          priority?: Database["public"]["Enums"]["case_priority"]
          public_code?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
        }
        Update: {
          assigned_lawyer_id?: string | null
          case_number?: string | null
          case_title?: string
          case_type?: string | null
          client_id?: string | null
          client_role?: Database["public"]["Enums"]["client_role"] | null
          closed_at?: string | null
          court_branch?: string | null
          court_name?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          internal_notes?: string | null
          judge_name?: string | null
          judicial_circuit?: string | null
          last_activity_at?: string
          next_action?: string | null
          next_action_date?: string | null
          opened_at?: string | null
          opponent_name?: string | null
          organization_id?: string
          priority?: Database["public"]["Enums"]["case_priority"]
          public_code?: string | null
          status?: Database["public"]["Enums"]["case_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_assigned_lawyer_id_fkey"
            columns: ["assigned_lawyer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          client_type: Database["public"]["Enums"]["client_type"]
          commercial_registration: string | null
          commercial_registration_bidx: string | null
          commercial_registration_enc: string | null
          company_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          national_id: string | null
          national_id_bidx: string | null
          national_id_enc: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          pii_key_version: number | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          commercial_registration?: string | null
          commercial_registration_bidx?: string | null
          commercial_registration_enc?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          national_id_bidx?: string | null
          national_id_enc?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          pii_key_version?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          commercial_registration?: string | null
          commercial_registration_bidx?: string | null
          commercial_registration_enc?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          national_id_bidx?: string | null
          national_id_enc?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          pii_key_version?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          body: string | null
          company_id: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          deal_id: string | null
          due_at: string | null
          entity_kind: Database["public"]["Enums"]["crm_entity_kind"]
          id: string
          kind: Database["public"]["Enums"]["crm_activity_kind"]
          lead_id: string | null
          outcome: string | null
          owner_staff_id: string | null
          subject: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          due_at?: string | null
          entity_kind: Database["public"]["Enums"]["crm_entity_kind"]
          id?: string
          kind: Database["public"]["Enums"]["crm_activity_kind"]
          lead_id?: string | null
          outcome?: string | null
          owner_staff_id?: string | null
          subject: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          company_id?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          due_at?: string | null
          entity_kind?: Database["public"]["Enums"]["crm_entity_kind"]
          id?: string
          kind?: Database["public"]["Enums"]["crm_activity_kind"]
          lead_id?: string | null
          outcome?: string | null
          owner_staff_id?: string | null
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_companies: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          legal_name: string | null
          name: string
          notes: string | null
          organization_id: string | null
          owner_staff_id: string | null
          phone: string | null
          sector: string | null
          size_bracket: string | null
          source: string | null
          status: string
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name: string
          notes?: string | null
          organization_id?: string | null
          owner_staff_id?: string | null
          phone?: string | null
          sector?: string | null
          size_bracket?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          notes?: string | null
          organization_id?: string | null
          owner_staff_id?: string | null
          phone?: string | null
          sector?: string | null
          size_bracket?: string | null
          source?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_companies_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_contacts: {
        Row: {
          city: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          is_primary: boolean
          job_title: string | null
          notes: string | null
          owner_staff_id: string | null
          phone: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          city?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          notes?: string | null
          owner_staff_id?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          city?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          is_primary?: boolean
          job_title?: string | null
          notes?: string | null
          owner_staff_id?: string | null
          phone?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_contacts_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_deals: {
        Row: {
          amount: number
          closed_at: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          expected_close_date: string | null
          id: string
          lead_id: string | null
          lost_reason: string | null
          notes: string | null
          owner_staff_id: string | null
          probability: number
          source: string | null
          stage_id: string | null
          status: Database["public"]["Enums"]["crm_deal_status"]
          title: string
          updated_at: string
          updated_by: string | null
          utm: Json
        }
        Insert: {
          amount?: number
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_staff_id?: string | null
          probability?: number
          source?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["crm_deal_status"]
          title: string
          updated_at?: string
          updated_by?: string | null
          utm?: Json
        }
        Update: {
          amount?: number
          closed_at?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          lost_reason?: string | null
          notes?: string | null
          owner_staff_id?: string | null
          probability?: number
          source?: string | null
          stage_id?: string | null
          status?: Database["public"]["Enums"]["crm_deal_status"]
          title?: string
          updated_at?: string
          updated_by?: string | null
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "crm_deals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "crm_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_leads: {
        Row: {
          city: string | null
          company_name: string | null
          converted_at: string | null
          converted_company_id: string | null
          converted_contact_id: string | null
          converted_deal_id: string | null
          created_at: string
          created_by: string | null
          disqualify_reason: string | null
          email: string | null
          full_name: string
          id: string
          last_activity_at: string | null
          notes: string | null
          owner_staff_id: string | null
          phone: string | null
          score: number
          source: string | null
          status: Database["public"]["Enums"]["crm_lead_status"]
          updated_at: string
          updated_by: string | null
          utm: Json
        }
        Insert: {
          city?: string | null
          company_name?: string | null
          converted_at?: string | null
          converted_company_id?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string
          created_by?: string | null
          disqualify_reason?: string | null
          email?: string | null
          full_name: string
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          owner_staff_id?: string | null
          phone?: string | null
          score?: number
          source?: string | null
          status?: Database["public"]["Enums"]["crm_lead_status"]
          updated_at?: string
          updated_by?: string | null
          utm?: Json
        }
        Update: {
          city?: string | null
          company_name?: string | null
          converted_at?: string | null
          converted_company_id?: string | null
          converted_contact_id?: string | null
          converted_deal_id?: string | null
          created_at?: string
          created_by?: string | null
          disqualify_reason?: string | null
          email?: string | null
          full_name?: string
          id?: string
          last_activity_at?: string | null
          notes?: string | null
          owner_staff_id?: string | null
          phone?: string | null
          score?: number
          source?: string | null
          status?: Database["public"]["Enums"]["crm_lead_status"]
          updated_at?: string
          updated_by?: string | null
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "crm_leads_converted_company_id_fkey"
            columns: ["converted_company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_converted_deal_fk"
            columns: ["converted_deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_leads_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_pipeline_stages: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          is_lost: boolean
          is_won: boolean
          name: string
          probability: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          name: string
          probability?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          is_lost?: boolean
          is_won?: boolean
          name?: string
          probability?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      deadlines: {
        Row: {
          case_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          deadline_type: Database["public"]["Enums"]["deadline_type"]
          due_date: string
          id: string
          notes: string | null
          organization_id: string
          priority: Database["public"]["Enums"]["case_priority"]
          responsible_user_id: string | null
          status: Database["public"]["Enums"]["deadline_status"]
          title: string
          updated_at: string
        }
        Insert: {
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline_type?: Database["public"]["Enums"]["deadline_type"]
          due_date: string
          id?: string
          notes?: string | null
          organization_id: string
          priority?: Database["public"]["Enums"]["case_priority"]
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["deadline_status"]
          title: string
          updated_at?: string
        }
        Update: {
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          deadline_type?: Database["public"]["Enums"]["deadline_type"]
          due_date?: string
          id?: string
          notes?: string | null
          organization_id?: string
          priority?: Database["public"]["Enums"]["case_priority"]
          responsible_user_id?: string | null
          status?: Database["public"]["Enums"]["deadline_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deadlines_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deadlines_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      design_audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_summary: Json | null
          before_summary: Json | null
          created_at: string
          id: string
          ip_address: string | null
          page_key: string | null
          trace_id: string | null
          user_agent: string | null
          version_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_summary?: Json | null
          before_summary?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          page_key?: string | null
          trace_id?: string | null
          user_agent?: string | null
          version_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_summary?: Json | null
          before_summary?: Json | null
          created_at?: string
          id?: string
          ip_address?: string | null
          page_key?: string | null
          trace_id?: string | null
          user_agent?: string | null
          version_id?: string | null
        }
        Relationships: []
      }
      design_drafts: {
        Row: {
          custom_css: string
          design_tokens_json: Json
          id: string
          page_key: string
          revision_number: number
          theme_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          custom_css?: string
          design_tokens_json?: Json
          id?: string
          page_key?: string
          revision_number?: number
          theme_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          custom_css?: string
          design_tokens_json?: Json
          id?: string
          page_key?: string
          revision_number?: number
          theme_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_drafts_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "design_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      design_publish_state: {
        Row: {
          active_version_id: string | null
          cache_version: number
          id: string
          last_published_at: string | null
          last_published_by: string | null
          previous_version_id: string | null
          rollback_available: boolean
          rollback_used_at: string | null
          rollback_used_by: string | null
          singleton: boolean
          theme_id: string | null
          updated_at: string
        }
        Insert: {
          active_version_id?: string | null
          cache_version?: number
          id?: string
          last_published_at?: string | null
          last_published_by?: string | null
          previous_version_id?: string | null
          rollback_available?: boolean
          rollback_used_at?: string | null
          rollback_used_by?: string | null
          singleton?: boolean
          theme_id?: string | null
          updated_at?: string
        }
        Update: {
          active_version_id?: string | null
          cache_version?: number
          id?: string
          last_published_at?: string | null
          last_published_by?: string | null
          previous_version_id?: string | null
          rollback_available?: boolean
          rollback_used_at?: string | null
          rollback_used_by?: string | null
          singleton?: boolean
          theme_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_publish_state_active_version_id_fkey"
            columns: ["active_version_id"]
            isOneToOne: false
            referencedRelation: "design_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_publish_state_previous_version_id_fkey"
            columns: ["previous_version_id"]
            isOneToOne: false
            referencedRelation: "design_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_publish_state_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "design_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      design_themes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      design_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          created_by: string | null
          custom_css: string
          design_tokens_json: Json
          id: string
          page_css_json: Json
          page_key: string
          page_tokens_json: Json
          published_at: string | null
          published_by: string | null
          sanitized_css: string
          scope: string
          status: string
          theme_id: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          custom_css?: string
          design_tokens_json?: Json
          id?: string
          page_css_json?: Json
          page_key?: string
          page_tokens_json?: Json
          published_at?: string | null
          published_by?: string | null
          sanitized_css?: string
          scope?: string
          status?: string
          theme_id: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          created_by?: string | null
          custom_css?: string
          design_tokens_json?: Json
          id?: string
          page_css_json?: Json
          page_key?: string
          page_tokens_json?: Json
          published_at?: string | null
          published_by?: string | null
          sanitized_css?: string
          scope?: string
          status?: string
          theme_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "design_versions_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "design_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_logs: {
        Row: {
          action_type: string
          browser: string | null
          created_at: string
          denial_reason: string | null
          device: string | null
          document_id: string | null
          document_name: string | null
          id: string
          ip: string | null
          office_name: string | null
          organization_id: string
          os: string | null
          outcome: string
          print_id: string | null
          session_id: string | null
          share_token_id: string | null
          source_page: string | null
          trace_ref: string | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action_type: string
          browser?: string | null
          created_at?: string
          denial_reason?: string | null
          device?: string | null
          document_id?: string | null
          document_name?: string | null
          id?: string
          ip?: string | null
          office_name?: string | null
          organization_id: string
          os?: string | null
          outcome?: string
          print_id?: string | null
          session_id?: string | null
          share_token_id?: string | null
          source_page?: string | null
          trace_ref?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action_type?: string
          browser?: string | null
          created_at?: string
          denial_reason?: string | null
          device?: string | null
          document_id?: string | null
          document_name?: string | null
          id?: string
          ip?: string | null
          office_name?: string | null
          organization_id?: string
          os?: string | null
          outcome?: string
          print_id?: string | null
          session_id?: string | null
          share_token_id?: string | null
          source_page?: string | null
          trace_ref?: string | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_access_logs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_logs_share_token_id_fkey"
            columns: ["share_token_id"]
            isOneToOne: false
            referencedRelation: "document_access_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_access_tokens: {
        Row: {
          classification: string
          created_at: string
          created_by: string | null
          document_id: string
          expires_at: string
          id: string
          kind: string
          last_used_at: string | null
          max_uses: number
          organization_id: string
          recipient_label: string | null
          revoked_at: string | null
          revoked_by: string | null
          token_hash: string
          updated_at: string
          used_count: number
          watermark_note: string | null
          watermark_office: string
          watermark_user: string
        }
        Insert: {
          classification?: string
          created_at?: string
          created_by?: string | null
          document_id: string
          expires_at: string
          id?: string
          kind: string
          last_used_at?: string | null
          max_uses?: number
          organization_id: string
          recipient_label?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash: string
          updated_at?: string
          used_count?: number
          watermark_note?: string | null
          watermark_office: string
          watermark_user: string
        }
        Update: {
          classification?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          expires_at?: string
          id?: string
          kind?: string
          last_used_at?: string | null
          max_uses?: number
          organization_id?: string
          recipient_label?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          token_hash?: string
          updated_at?: string
          used_count?: number
          watermark_note?: string | null
          watermark_office?: string
          watermark_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_access_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_tokens_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_access_tokens_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_pages: {
        Row: {
          created_at: string
          document_id: string
          edited_at: string | null
          edited_by: string | null
          extracted_text: string
          id: string
          is_blank: boolean
          language: string | null
          ocr_confidence: number | null
          ocr_used: boolean
          organization_id: string
          original_text: string | null
          page_number: number
          search_vector: unknown
          updated_at: string
        }
        Insert: {
          created_at?: string
          document_id: string
          edited_at?: string | null
          edited_by?: string | null
          extracted_text?: string
          id?: string
          is_blank?: boolean
          language?: string | null
          ocr_confidence?: number | null
          ocr_used?: boolean
          organization_id: string
          original_text?: string | null
          page_number: number
          search_vector?: unknown
          updated_at?: string
        }
        Update: {
          created_at?: string
          document_id?: string
          edited_at?: string | null
          edited_by?: string | null
          extracted_text?: string
          id?: string
          is_blank?: boolean
          language?: string | null
          ocr_confidence?: number | null
          ocr_used?: boolean
          organization_id?: string
          original_text?: string | null
          page_number?: number
          search_vector?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_pages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_pages_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_processing_jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          document_id: string
          error_code: string | null
          error_message: string | null
          id: string
          ocr_pages: number
          organization_id: string
          pages_done: number
          pages_total: number | null
          processing_type: string
          progress: number
          started_at: string | null
          status: Database["public"]["Enums"]["document_job_status"]
          updated_at: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          document_id: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          ocr_pages?: number
          organization_id: string
          pages_done?: number
          pages_total?: number | null
          processing_type?: string
          progress?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["document_job_status"]
          updated_at?: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          document_id?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          ocr_pages?: number
          organization_id?: string
          pages_done?: number
          pages_total?: number | null
          processing_type?: string
          progress?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["document_job_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_processing_jobs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: true
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_processing_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          detail: Json
          event: string
          id: string
          ip: string | null
          organization_id: string
          request_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event: string
          id?: string
          ip?: string | null
          organization_id: string
          request_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          detail?: Json
          event?: string
          id?: string
          ip?: string | null
          organization_id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_request_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      document_requests: {
        Row: {
          case_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          file_count: number
          id: string
          message: string | null
          organization_id: string
          requested_items: Json
          status: string
          submitted_ip: string | null
          submitted_user_agent: string | null
          title: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          case_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          file_count?: number
          id?: string
          message?: string | null
          organization_id: string
          requested_items?: Json
          status?: string
          submitted_ip?: string | null
          submitted_user_agent?: string | null
          title: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          file_count?: number
          id?: string
          message?: string | null
          organization_id?: string
          requested_items?: Json
          status?: string
          submitted_ip?: string | null
          submitted_user_agent?: string | null
          title?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          case_id: string | null
          client_id: string | null
          client_ip: string | null
          created_at: string
          description: string | null
          document_category: string | null
          document_request_id: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_status: string
          file_type: string | null
          id: string
          is_confidential: boolean
          organization_id: string
          source: string
          storage_verified_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          case_id?: string | null
          client_id?: string | null
          client_ip?: string | null
          created_at?: string
          description?: string | null
          document_category?: string | null
          document_request_id?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_status?: string
          file_type?: string | null
          id?: string
          is_confidential?: boolean
          organization_id: string
          source?: string
          storage_verified_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          case_id?: string | null
          client_id?: string | null
          client_ip?: string | null
          created_at?: string
          description?: string | null
          document_category?: string | null
          document_request_id?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_status?: string
          file_type?: string | null
          id?: string
          is_confidential?: boolean
          organization_id?: string
          source?: string
          storage_verified_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_document_request_id_fkey"
            columns: ["document_request_id"]
            isOneToOne: false
            referencedRelation: "document_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_attachments: {
        Row: {
          created_at: string
          direction: string
          download_count: number
          extension: string | null
          file_name: string
          id: string
          is_inline_safe: boolean
          is_quarantined: boolean
          last_downloaded_at: string | null
          message_id: string | null
          mime_type: string
          original_name: string | null
          scan_detail: string | null
          scan_status: string
          sha256: string | null
          size_bytes: number
          storage_path: string
          uploaded_by: string | null
          uploaded_by_email: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          download_count?: number
          extension?: string | null
          file_name: string
          id?: string
          is_inline_safe?: boolean
          is_quarantined?: boolean
          last_downloaded_at?: string | null
          message_id?: string | null
          mime_type: string
          original_name?: string | null
          scan_detail?: string | null
          scan_status?: string
          sha256?: string | null
          size_bytes?: number
          storage_path: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          download_count?: number
          extension?: string | null
          file_name?: string
          id?: string
          is_inline_safe?: boolean
          is_quarantined?: boolean
          last_downloaded_at?: string | null
          message_id?: string | null
          mime_type?: string
          original_name?: string | null
          scan_detail?: string | null
          scan_status?: string
          sha256?: string | null
          size_bytes?: number
          storage_path?: string
          uploaded_by?: string | null
          uploaded_by_email?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_audit_logs: {
        Row: {
          action: string
          actor_email: string
          actor_id: string | null
          created_at: string
          description: string | null
          id: string
          ip: string | null
          mailbox_id: string | null
          message_id: string | null
          metadata: Json
          thread_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email: string
          actor_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip?: string | null
          mailbox_id?: string | null
          message_id?: string | null
          metadata?: Json
          thread_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          actor_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          ip?: string | null
          mailbox_id?: string | null
          message_id?: string | null
          metadata?: Json
          thread_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      email_inbound_events: {
        Row: {
          attachments_accepted: number
          attachments_rejected: number
          created_at: string
          id: string
          message_row_id: string | null
          metadata: Json
          outcome: string
          payload_hash: string
          provider: string
          provider_message_id: string | null
          recipient: string | null
          reject_reason: string | null
          request_ip: string | null
          sender_hint: string | null
          signature_mode: string
          thread_id: string | null
        }
        Insert: {
          attachments_accepted?: number
          attachments_rejected?: number
          created_at?: string
          id?: string
          message_row_id?: string | null
          metadata?: Json
          outcome: string
          payload_hash: string
          provider?: string
          provider_message_id?: string | null
          recipient?: string | null
          reject_reason?: string | null
          request_ip?: string | null
          sender_hint?: string | null
          signature_mode?: string
          thread_id?: string | null
        }
        Update: {
          attachments_accepted?: number
          attachments_rejected?: number
          created_at?: string
          id?: string
          message_row_id?: string | null
          metadata?: Json
          outcome?: string
          payload_hash?: string
          provider?: string
          provider_message_id?: string | null
          recipient?: string | null
          reject_reason?: string | null
          request_ip?: string | null
          sender_hint?: string | null
          signature_mode?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_inbound_events_message_row_id_fkey"
            columns: ["message_row_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_inbound_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name_ar: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name_ar: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name_ar?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_mailboxes: {
        Row: {
          address: string
          agentic_last_error: string | null
          agentic_last_sync_at: string | null
          agentic_link_status: string
          agentic_mailbox_id: string | null
          agentic_unread_count: number
          created_at: string
          credential_key: string | null
          department_id: string | null
          display_name: string
          id: string
          imap_folders: Json
          inbound_enabled: boolean
          is_active: boolean
          is_shared: boolean
          provider: string
          reply_to: string | null
          signature_html: string | null
          sort_order: number
          sync_enabled: boolean
          type: string
          updated_at: string
        }
        Insert: {
          address: string
          agentic_last_error?: string | null
          agentic_last_sync_at?: string | null
          agentic_link_status?: string
          agentic_mailbox_id?: string | null
          agentic_unread_count?: number
          created_at?: string
          credential_key?: string | null
          department_id?: string | null
          display_name: string
          id?: string
          imap_folders?: Json
          inbound_enabled?: boolean
          is_active?: boolean
          is_shared?: boolean
          provider?: string
          reply_to?: string | null
          signature_html?: string | null
          sort_order?: number
          sync_enabled?: boolean
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string
          agentic_last_error?: string | null
          agentic_last_sync_at?: string | null
          agentic_link_status?: string
          agentic_mailbox_id?: string | null
          agentic_unread_count?: number
          created_at?: string
          credential_key?: string | null
          department_id?: string | null
          display_name?: string
          id?: string
          imap_folders?: Json
          inbound_enabled?: boolean
          is_active?: boolean
          is_shared?: boolean
          provider?: string
          reply_to?: string | null
          signature_html?: string | null
          sort_order?: number
          sync_enabled?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_mailboxes_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "platform_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          assigned_to: string | null
          bcc_addresses: string[]
          body_text: string | null
          cc_addresses: string[]
          created_at: string
          created_by: string | null
          created_by_email: string | null
          direction: string
          failure_ref: string | null
          from_address: string
          from_name: string | null
          html: string | null
          id: string
          imap_folder: string | null
          imap_uid: number | null
          imap_uidvalidity: number | null
          in_reply_to: string | null
          kind: string
          mailbox_id: string
          message_id: string
          organization_id: string | null
          provider: string
          provider_ref: string | null
          received_at: string | null
          reference_ids: string[]
          scheduled_at: string | null
          sent_at: string | null
          status: string
          subject: string
          thread_id: string
          ticket_id: string | null
          to_addresses: string[]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          bcc_addresses?: string[]
          body_text?: string | null
          cc_addresses?: string[]
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          direction: string
          failure_ref?: string | null
          from_address: string
          from_name?: string | null
          html?: string | null
          id?: string
          imap_folder?: string | null
          imap_uid?: number | null
          imap_uidvalidity?: number | null
          in_reply_to?: string | null
          kind?: string
          mailbox_id: string
          message_id: string
          organization_id?: string | null
          provider?: string
          provider_ref?: string | null
          received_at?: string | null
          reference_ids?: string[]
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          thread_id: string
          ticket_id?: string | null
          to_addresses?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          bcc_addresses?: string[]
          body_text?: string | null
          cc_addresses?: string[]
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          direction?: string
          failure_ref?: string | null
          from_address?: string
          from_name?: string | null
          html?: string | null
          id?: string
          imap_folder?: string | null
          imap_uid?: number | null
          imap_uidvalidity?: number | null
          in_reply_to?: string | null
          kind?: string
          mailbox_id?: string
          message_id?: string
          organization_id?: string | null
          provider?: string
          provider_ref?: string | null
          received_at?: string | null
          reference_ids?: string[]
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
          thread_id?: string
          ticket_id?: string | null
          to_addresses?: string[]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "email_mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      email_notes: {
        Row: {
          author_email: string
          author_id: string | null
          body: string
          created_at: string
          id: string
          thread_id: string
        }
        Insert: {
          author_email: string
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          thread_id: string
        }
        Update: {
          author_email?: string
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_notes_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          failure_ref: string | null
          id: string
          idempotency_key: string
          last_error: string | null
          last_error_code: string | null
          locked_at: string | null
          max_attempts: number
          message_id: string
          next_attempt_at: string
          scheduled_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          failure_ref?: string | null
          id?: string
          idempotency_key: string
          last_error?: string | null
          last_error_code?: string | null
          locked_at?: string | null
          max_attempts?: number
          message_id: string
          next_attempt_at?: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          failure_ref?: string | null
          id?: string
          idempotency_key?: string
          last_error?: string | null
          last_error_code?: string | null
          locked_at?: string | null
          max_attempts?: number
          message_id?: string
          next_attempt_at?: string
          scheduled_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: true
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_runs: {
        Row: {
          created_at: string
          duplicates: number
          duration_ms: number
          error_code: string | null
          error_message: string | null
          fetched: number
          folder: string
          id: string
          ingested: number
          mailbox_id: string
          outcome: string
          provider: string
          reindexed: boolean
          rejected: number
          tickets_created: number
          trigger_source: string
        }
        Insert: {
          created_at?: string
          duplicates?: number
          duration_ms?: number
          error_code?: string | null
          error_message?: string | null
          fetched?: number
          folder: string
          id?: string
          ingested?: number
          mailbox_id: string
          outcome: string
          provider?: string
          reindexed?: boolean
          rejected?: number
          tickets_created?: number
          trigger_source?: string
        }
        Update: {
          created_at?: string
          duplicates?: number
          duration_ms?: number
          error_code?: string | null
          error_message?: string | null
          fetched?: number
          folder?: string
          id?: string
          ingested?: number
          mailbox_id?: string
          outcome?: string
          provider?: string
          reindexed?: boolean
          rejected?: number
          tickets_created?: number
          trigger_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sync_runs_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "email_mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_sync_state: {
        Row: {
          attempts: number
          created_at: string
          folder: string
          id: string
          last_error: string | null
          last_error_at: string | null
          last_error_code: string | null
          last_success_at: string | null
          last_sync_at: string | null
          last_uid: number
          local_folder: string
          lock_token: string | null
          locked_at: string | null
          mailbox_id: string
          messages_synced: number
          new_messages: number
          next_attempt_at: string | null
          provider: string
          provider_cursor: string | null
          provider_folder_id: string | null
          status: string
          uidvalidity: number | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          folder: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          last_uid?: number
          local_folder?: string
          lock_token?: string | null
          locked_at?: string | null
          mailbox_id: string
          messages_synced?: number
          new_messages?: number
          next_attempt_at?: string | null
          provider?: string
          provider_cursor?: string | null
          provider_folder_id?: string | null
          status?: string
          uidvalidity?: number | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          folder?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_error_code?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          last_uid?: number
          local_folder?: string
          lock_token?: string | null
          locked_at?: string | null
          mailbox_id?: string
          messages_synced?: number
          new_messages?: number
          next_attempt_at?: string | null
          provider?: string
          provider_cursor?: string | null
          provider_folder_id?: string | null
          status?: string
          uidvalidity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_sync_state_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "email_mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      email_thread_labels: {
        Row: {
          created_at: string
          label_id: string
          thread_id: string
        }
        Insert: {
          created_at?: string
          label_id: string
          thread_id: string
        }
        Update: {
          created_at?: string
          label_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_thread_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "email_labels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_thread_labels_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      email_threads: {
        Row: {
          assigned_to: string | null
          assigned_to_email: string | null
          created_at: string
          folder: string
          id: string
          is_starred: boolean
          is_unread: boolean
          last_activity_at: string
          mailbox_id: string
          message_count: number
          organization_id: string | null
          participants: string[]
          previous_folder: string | null
          subject: string
          ticket_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          assigned_to_email?: string | null
          created_at?: string
          folder?: string
          id?: string
          is_starred?: boolean
          is_unread?: boolean
          last_activity_at?: string
          mailbox_id: string
          message_count?: number
          organization_id?: string | null
          participants?: string[]
          previous_folder?: string | null
          subject?: string
          ticket_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          assigned_to_email?: string | null
          created_at?: string
          folder?: string
          id?: string
          is_starred?: boolean
          is_unread?: boolean
          last_activity_at?: string
          mailbox_id?: string
          message_count?: number
          organization_id?: string | null
          participants?: string[]
          previous_folder?: string | null
          subject?: string
          ticket_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_threads_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "email_mailboxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_threads_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      encryption_key_registry: {
        Row: {
          activated_at: string
          algorithm: string
          created_at: string
          derivation: string
          id: string
          key_version: number
          notes: string | null
          purpose: string
          retired_at: string | null
          rotated_by: string | null
          secret_name: string
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          algorithm: string
          created_at?: string
          derivation: string
          id?: string
          key_version: number
          notes?: string | null
          purpose: string
          retired_at?: string | null
          rotated_by?: string | null
          secret_name: string
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          algorithm?: string
          created_at?: string
          derivation?: string
          id?: string
          key_version?: number
          notes?: string | null
          purpose?: string
          retired_at?: string | null
          rotated_by?: string | null
          secret_name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      hearings: {
        Row: {
          case_id: string
          court_name: string | null
          created_at: string
          created_by: string | null
          hearing_date: string
          hearing_type: string | null
          id: string
          judicial_circuit: string | null
          location: string | null
          notes: string | null
          organization_id: string
          remote_link: string | null
          result: string | null
          status: Database["public"]["Enums"]["hearing_status"]
          title: string
          updated_at: string
        }
        Insert: {
          case_id: string
          court_name?: string | null
          created_at?: string
          created_by?: string | null
          hearing_date: string
          hearing_type?: string | null
          id?: string
          judicial_circuit?: string | null
          location?: string | null
          notes?: string | null
          organization_id: string
          remote_link?: string | null
          result?: string | null
          status?: Database["public"]["Enums"]["hearing_status"]
          title?: string
          updated_at?: string
        }
        Update: {
          case_id?: string
          court_name?: string | null
          created_at?: string
          created_by?: string | null
          hearing_date?: string
          hearing_type?: string | null
          id?: string
          judicial_circuit?: string | null
          location?: string | null
          notes?: string | null
          organization_id?: string
          remote_link?: string | null
          result?: string | null
          status?: Database["public"]["Enums"]["hearing_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hearings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hearings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_documents: {
        Row: {
          created_at: string
          employee_id: string
          expires_on: string | null
          id: string
          issued_on: string | null
          kind: string
          notes: string | null
          storage_path: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          kind: string
          notes?: string | null
          storage_path?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          kind?: string
          notes?: string | null
          storage_path?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_documents_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employees: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          email: string
          employment_status: Database["public"]["Enums"]["hr_employment_status"]
          employment_type: Database["public"]["Enums"]["hr_employment_type"]
          ended_at: string | null
          full_name: string
          id: string
          job_title: string | null
          joined_at: string | null
          manager_employee_id: string | null
          notes: string | null
          phone: string | null
          staff_id: string | null
          updated_at: string
          updated_by: string | null
          user_id: string | null
          work_location: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          email: string
          employment_status?: Database["public"]["Enums"]["hr_employment_status"]
          employment_type?: Database["public"]["Enums"]["hr_employment_type"]
          ended_at?: string | null
          full_name: string
          id?: string
          job_title?: string | null
          joined_at?: string | null
          manager_employee_id?: string | null
          notes?: string | null
          phone?: string | null
          staff_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          work_location?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          email?: string
          employment_status?: Database["public"]["Enums"]["hr_employment_status"]
          employment_type?: Database["public"]["Enums"]["hr_employment_type"]
          ended_at?: string | null
          full_name?: string
          id?: string
          job_title?: string | null
          joined_at?: string | null
          manager_employee_id?: string | null
          notes?: string | null
          phone?: string | null
          staff_id?: string | null
          updated_at?: string
          updated_by?: string | null
          user_id?: string | null
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_employees_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "platform_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_manager_employee_id_fkey"
            columns: ["manager_employee_id"]
            isOneToOne: false
            referencedRelation: "hr_employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employees_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_definitions: {
        Row: {
          adapter_type: string
          capabilities: Json
          category: string
          category_label: string
          created_at: string
          default_base_url: string | null
          display_name: string
          display_name_ar: string
          health_hint: string | null
          id: string
          is_active: boolean
          is_builtin: boolean
          logo_path: string | null
          optional_fields: string[]
          provider_key: string
          required_fields: string[]
          sort_order: number
          supported_auth_types: string[]
          updated_at: string
          website_url: string | null
        }
        Insert: {
          adapter_type: string
          capabilities?: Json
          category?: string
          category_label?: string
          created_at?: string
          default_base_url?: string | null
          display_name: string
          display_name_ar: string
          health_hint?: string | null
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          logo_path?: string | null
          optional_fields?: string[]
          provider_key: string
          required_fields?: string[]
          sort_order?: number
          supported_auth_types?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          adapter_type?: string
          capabilities?: Json
          category?: string
          category_label?: string
          created_at?: string
          default_base_url?: string | null
          display_name?: string
          display_name_ar?: string
          health_hint?: string | null
          id?: string
          is_active?: boolean
          is_builtin?: boolean
          logo_path?: string | null
          optional_fields?: string[]
          provider_key?: string
          required_fields?: string[]
          sort_order?: number
          supported_auth_types?: string[]
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      integration_health_logs: {
        Row: {
          actor_id: string | null
          check_kind: string
          checked_at: string
          id: string
          integration_id: string | null
          internal_name: string | null
          latency_ms: number | null
          provider_key: string
          result: string
          safe_error_code: string | null
          safe_error_detail: string | null
          status_code: number | null
          trace_id: string
        }
        Insert: {
          actor_id?: string | null
          check_kind?: string
          checked_at?: string
          id?: string
          integration_id?: string | null
          internal_name?: string | null
          latency_ms?: number | null
          provider_key: string
          result: string
          safe_error_code?: string | null
          safe_error_detail?: string | null
          status_code?: number | null
          trace_id: string
        }
        Update: {
          actor_id?: string | null
          check_kind?: string
          checked_at?: string
          id?: string
          integration_id?: string | null
          internal_name?: string | null
          latency_ms?: number | null
          provider_key?: string
          result?: string
          safe_error_code?: string | null
          safe_error_detail?: string | null
          status_code?: number | null
          trace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_health_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "platform_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_secrets: {
        Row: {
          ciphertext: string
          created_at: string
          created_by: string | null
          field_key: string
          id: string
          key_version: number
          masked_hint: string
          revoked_at: string | null
          rotated_at: string | null
          secret_reference: string
          status: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          created_by?: string | null
          field_key: string
          id?: string
          key_version?: number
          masked_hint: string
          revoked_at?: string | null
          rotated_at?: string | null
          secret_reference: string
          status?: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          created_by?: string | null
          field_key?: string
          id?: string
          key_version?: number
          masked_hint?: string
          revoked_at?: string | null
          rotated_at?: string | null
          secret_reference?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          issued_at: string
          notes: string | null
          number: string
          organization_id: string | null
          paid_at: string | null
          payment_method: string | null
          pdf_path: string | null
          status: string
          subscription_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string
          notes?: string | null
          number: string
          organization_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pdf_path?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          issued_at?: string
          notes?: string | null
          number?: string
          organization_id?: string | null
          paid_at?: string | null
          payment_method?: string | null
          pdf_path?: string | null
          status?: string
          subscription_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          budget_amount: number
          channel: string
          coupon_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          ends_on: string | null
          id: string
          landing_page_slug: string | null
          name: string
          notes: string | null
          objective: string | null
          owner_staff_id: string | null
          spend_amount: number
          starts_on: string | null
          status: Database["public"]["Enums"]["marketing_campaign_status"]
          updated_at: string
          updated_by: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          budget_amount?: number
          channel: string
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          id?: string
          landing_page_slug?: string | null
          name: string
          notes?: string | null
          objective?: string | null
          owner_staff_id?: string | null
          spend_amount?: number
          starts_on?: string | null
          status?: Database["public"]["Enums"]["marketing_campaign_status"]
          updated_at?: string
          updated_by?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          budget_amount?: number
          channel?: string
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          ends_on?: string | null
          id?: string
          landing_page_slug?: string | null
          name?: string
          notes?: string | null
          objective?: string | null
          owner_staff_id?: string | null
          spend_amount?: number
          starts_on?: string | null
          status?: Database["public"]["Enums"]["marketing_campaign_status"]
          updated_at?: string
          updated_by?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "platform_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaigns_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_conversion_events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_key: string
          id: string
          label: string | null
          lead_id: string | null
          occurred_at: string
          organization_id: string | null
          source: string | null
          utm: Json
          value_amount: number
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_key: string
          id?: string
          label?: string | null
          lead_id?: string | null
          occurred_at?: string
          organization_id?: string | null
          source?: string | null
          utm?: Json
          value_amount?: number
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_key?: string
          id?: string
          label?: string | null
          lead_id?: string | null
          occurred_at?: string
          organization_id?: string | null
          source?: string | null
          utm?: Json
          value_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_conversion_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_conversion_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "crm_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_conversion_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_referrals: {
        Row: {
          code: string
          coupon_id: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          label: string | null
          max_uses: number | null
          referrer_email: string | null
          referrer_kind: string
          referrer_name: string | null
          reward_note: string | null
          updated_at: string
          uses_count: number
        }
        Insert: {
          code: string
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_uses?: number | null
          referrer_email?: string | null
          referrer_kind?: string
          referrer_name?: string | null
          reward_note?: string | null
          updated_at?: string
          uses_count?: number
        }
        Update: {
          code?: string
          coupon_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          max_uses?: number | null
          referrer_email?: string | null
          referrer_kind?: string
          referrer_name?: string | null
          reward_note?: string | null
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketing_referrals_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "platform_coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_attempts: {
        Row: {
          attempt_number: number
          created_at: string
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          latency_ms: number | null
          organization_id: string
          provider: string
          queue_id: string
          request_metadata: Json
          response_metadata: Json
          status: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          organization_id: string
          provider: string
          queue_id: string
          request_metadata?: Json
          response_metadata?: Json
          status: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          latency_ms?: number | null
          organization_id?: string
          provider?: string
          queue_id?: string
          request_metadata?: Json
          response_metadata?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_attempts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_attempts_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "notification_queue"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_client_preferences: {
        Row: {
          client_id: string
          created_at: string
          email_enabled: boolean
          id: string
          marketing_opt_in: boolean
          organization_id: string
          sms_enabled: boolean
          updated_at: string
          whatsapp_enabled: boolean
        }
        Insert: {
          client_id: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          marketing_opt_in?: boolean
          organization_id: string
          sms_enabled?: boolean
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Update: {
          client_id?: string
          created_at?: string
          email_enabled?: boolean
          id?: string
          marketing_opt_in?: boolean
          organization_id?: string
          sms_enabled?: boolean
          updated_at?: string
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_client_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_client_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          event_type: string
          id: string
          organization_id: string
          payload: Json
          processed_at: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          processed_at?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_link_tokens: {
        Row: {
          case_id: string | null
          client_id: string | null
          created_at: string
          expires_at: string
          id: string
          last_used_at: string | null
          organization_id: string
          purpose: string
          revoked_at: string | null
          token_hash: string
          use_count: number
        }
        Insert: {
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          expires_at: string
          id?: string
          last_used_at?: string | null
          organization_id: string
          purpose?: string
          revoked_at?: string | null
          token_hash: string
          use_count?: number
        }
        Update: {
          case_id?: string | null
          client_id?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          last_used_at?: string | null
          organization_id?: string
          purpose?: string
          revoked_at?: string | null
          token_hash?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_link_tokens_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_link_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_link_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_queue: {
        Row: {
          accepted_at: string | null
          attempts: number
          cancelled_at: string | null
          channel: string
          created_at: string
          event_id: string | null
          event_type: string
          failed_at: string | null
          id: string
          idempotency_key: string
          is_test: boolean
          last_error_code: string | null
          last_error_message: string | null
          latency_ms: number | null
          max_attempts: number
          organization_id: string
          payload: Json
          processing_at: string | null
          provider: string
          provider_device_id: string | null
          provider_template_id: string | null
          recipient_id: string | null
          recipient_phone: string | null
          recipient_type: string
          scheduled_at: string
          status: string
          template_mapping_id: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          attempts?: number
          cancelled_at?: string | null
          channel?: string
          created_at?: string
          event_id?: string | null
          event_type: string
          failed_at?: string | null
          id?: string
          idempotency_key: string
          is_test?: boolean
          last_error_code?: string | null
          last_error_message?: string | null
          latency_ms?: number | null
          max_attempts?: number
          organization_id: string
          payload?: Json
          processing_at?: string | null
          provider?: string
          provider_device_id?: string | null
          provider_template_id?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          recipient_type?: string
          scheduled_at?: string
          status?: string
          template_mapping_id?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          attempts?: number
          cancelled_at?: string | null
          channel?: string
          created_at?: string
          event_id?: string | null
          event_type?: string
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          is_test?: boolean
          last_error_code?: string | null
          last_error_message?: string | null
          latency_ms?: number | null
          max_attempts?: number
          organization_id?: string
          payload?: Json
          processing_at?: string | null
          provider?: string
          provider_device_id?: string | null
          provider_template_id?: string | null
          recipient_id?: string | null
          recipient_phone?: string | null
          recipient_type?: string
          scheduled_at?: string
          status?: string
          template_mapping_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_queue_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "notification_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_queue_template_mapping_id_fkey"
            columns: ["template_mapping_id"]
            isOneToOne: false
            referencedRelation: "notification_template_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          channel: string
          cooldown_seconds: number
          created_at: string
          delay_seconds: number
          event_type: string
          id: string
          is_enabled: boolean
          organization_id: string
          template_mapping_id: string | null
          updated_at: string
        }
        Insert: {
          channel?: string
          cooldown_seconds?: number
          created_at?: string
          delay_seconds?: number
          event_type: string
          id?: string
          is_enabled?: boolean
          organization_id: string
          template_mapping_id?: string | null
          updated_at?: string
        }
        Update: {
          channel?: string
          cooldown_seconds?: number
          created_at?: string
          delay_seconds?: number
          event_type?: string
          id?: string
          is_enabled?: boolean
          organization_id?: string
          template_mapping_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_rules_template_mapping_id_fkey"
            columns: ["template_mapping_id"]
            isOneToOne: false
            referencedRelation: "notification_template_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_template_mappings: {
        Row: {
          body_variable_mapping: Json
          button_variable_mapping: Json
          channel: string
          created_at: string
          event_type: string
          id: string
          internal_template_key: string
          is_enabled: boolean
          organization_id: string | null
          provider: string
          provider_device_id: string | null
          provider_template_id: string | null
          updated_at: string
        }
        Insert: {
          body_variable_mapping?: Json
          button_variable_mapping?: Json
          channel?: string
          created_at?: string
          event_type: string
          id?: string
          internal_template_key: string
          is_enabled?: boolean
          organization_id?: string | null
          provider?: string
          provider_device_id?: string | null
          provider_template_id?: string | null
          updated_at?: string
        }
        Update: {
          body_variable_mapping?: Json
          button_variable_mapping?: Json
          channel?: string
          created_at?: string
          event_type?: string
          id?: string
          internal_template_key?: string
          is_enabled?: boolean
          organization_id?: string | null
          provider?: string
          provider_device_id?: string | null
          provider_template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_template_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          dedup_key: string | null
          id: string
          is_read: boolean
          message: string
          organization_id: string
          related_case_id: string | null
          related_deadline_id: string | null
          related_hearing_id: string | null
          related_task_id: string | null
          scheduled_for: string | null
          sent_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dedup_key?: string | null
          id?: string
          is_read?: boolean
          message: string
          organization_id: string
          related_case_id?: string | null
          related_deadline_id?: string | null
          related_hearing_id?: string | null
          related_task_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          dedup_key?: string | null
          id?: string
          is_read?: boolean
          message?: string
          organization_id?: string
          related_case_id?: string | null
          related_deadline_id?: string | null
          related_hearing_id?: string | null
          related_task_id?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_case_id_fkey"
            columns: ["related_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_deadline_id_fkey"
            columns: ["related_deadline_id"]
            isOneToOne: false
            referencedRelation: "deadlines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_hearing_id_fkey"
            columns: ["related_hearing_id"]
            isOneToOne: false
            referencedRelation: "hearings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_task_id_fkey"
            columns: ["related_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      office_leads: {
        Row: {
          assigned_to: string | null
          channel: string
          city: string | null
          consent_at: string | null
          consent_document_key: string | null
          consent_policy_version: string | null
          consent_text_hash: string | null
          converted_client_id: string | null
          created_at: string
          dedupe_hash: string
          dedupe_window: string
          email: string | null
          full_name: string
          id: string
          internal_note: string | null
          ip_hash: string | null
          message: string | null
          organization_id: string
          page_version: number | null
          phone: string | null
          preferred_contact: string | null
          referrer_host: string | null
          service_key: string | null
          source: string
          status: string
          updated_at: string
          utm: Json
        }
        Insert: {
          assigned_to?: string | null
          channel?: string
          city?: string | null
          consent_at?: string | null
          consent_document_key?: string | null
          consent_policy_version?: string | null
          consent_text_hash?: string | null
          converted_client_id?: string | null
          created_at?: string
          dedupe_hash: string
          dedupe_window?: string
          email?: string | null
          full_name: string
          id?: string
          internal_note?: string | null
          ip_hash?: string | null
          message?: string | null
          organization_id: string
          page_version?: number | null
          phone?: string | null
          preferred_contact?: string | null
          referrer_host?: string | null
          service_key?: string | null
          source?: string
          status?: string
          updated_at?: string
          utm?: Json
        }
        Update: {
          assigned_to?: string | null
          channel?: string
          city?: string | null
          consent_at?: string | null
          consent_document_key?: string | null
          consent_policy_version?: string | null
          consent_text_hash?: string | null
          converted_client_id?: string | null
          created_at?: string
          dedupe_hash?: string
          dedupe_window?: string
          email?: string | null
          full_name?: string
          id?: string
          internal_note?: string | null
          ip_hash?: string | null
          message?: string | null
          organization_id?: string
          page_version?: number | null
          phone?: string | null
          preferred_contact?: string | null
          referrer_host?: string | null
          service_key?: string | null
          source?: string
          status?: string
          updated_at?: string
          utm?: Json
        }
        Relationships: [
          {
            foreignKeyName: "office_leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_leads_converted_client_id_fkey"
            columns: ["converted_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      office_page_events: {
        Row: {
          channel: string
          count: number
          created_at: string
          day: string
          id: string
          kind: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          channel?: string
          count?: number
          created_at?: string
          day: string
          id?: string
          kind: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          count?: number
          created_at?: string
          day?: string
          id?: string
          kind?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "office_page_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      office_public_pages: {
        Row: {
          created_at: string
          draft: Json
          organization_id: string
          published: Json | null
          published_at: string | null
          published_by: string | null
          slug: string
          status: string
          suspended_by_platform: boolean
          suspension_reason: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          draft?: Json
          organization_id: string
          published?: Json | null
          published_at?: string | null
          published_by?: string | null
          slug: string
          status?: string
          suspended_by_platform?: boolean
          suspension_reason?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          draft?: Json
          organization_id?: string
          published?: Json | null
          published_at?: string | null
          published_by?: string | null
          slug?: string
          status?: string
          suspended_by_platform?: boolean
          suspension_reason?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "office_public_pages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "office_public_pages_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          joined_at?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          city: string | null
          commercial_registration: string | null
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          is_active: boolean
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          suspended_at: string | null
          suspension_reason: string | null
          tax_number: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          commercial_registration?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          commercial_registration?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          suspended_at?: string | null
          suspension_reason?: string | null
          tax_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      otp_verifications: {
        Row: {
          attempts: number
          code_hash: string
          consumed_at: string | null
          created_at: string
          delivery_status: string
          device: string | null
          dispatch_source: string | null
          dispatch_trace: string | null
          email: string | null
          expires_at: string
          id: string
          idempotency_key: string | null
          integration_id: string | null
          ip: string | null
          max_attempts: number
          phone_e164: string
          provider: string | null
          provider_reference: string | null
          purpose: string
          remote_verification: boolean
          trace_ref: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          attempts?: number
          code_hash: string
          consumed_at?: string | null
          created_at?: string
          delivery_status?: string
          device?: string | null
          dispatch_source?: string | null
          dispatch_trace?: string | null
          email?: string | null
          expires_at: string
          id?: string
          idempotency_key?: string | null
          integration_id?: string | null
          ip?: string | null
          max_attempts?: number
          phone_e164: string
          provider?: string | null
          provider_reference?: string | null
          purpose: string
          remote_verification?: boolean
          trace_ref?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          attempts?: number
          code_hash?: string
          consumed_at?: string | null
          created_at?: string
          delivery_status?: string
          device?: string | null
          dispatch_source?: string | null
          dispatch_trace?: string | null
          email?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          integration_id?: string | null
          ip?: string | null
          max_attempts?: number
          phone_e164?: string
          provider?: string | null
          provider_reference?: string | null
          purpose?: string
          remote_verification?: boolean
          trace_ref?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "otp_verifications_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "platform_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_access_logs: {
        Row: {
          aal: string | null
          browser: string | null
          created_at: string
          device: string | null
          entity_id: string | null
          entity_type: string
          field: string
          id: string
          ip: string | null
          key_version: number | null
          organization_id: string
          outcome: string
          reason: string | null
          trace_ref: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          aal?: string | null
          browser?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_type: string
          field: string
          id?: string
          ip?: string | null
          key_version?: number | null
          organization_id: string
          outcome?: string
          reason?: string | null
          trace_ref?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          aal?: string | null
          browser?: string | null
          created_at?: string
          device?: string | null
          entity_id?: string | null
          entity_type?: string
          field?: string
          id?: string
          ip?: string | null
          key_version?: number | null
          organization_id?: string
          outcome?: string
          reason?: string | null
          trace_ref?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pii_access_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_reencryption_jobs: {
        Row: {
          created_at: string
          cursor_id: string | null
          entity: string
          failed: number
          from_version: number
          id: string
          last_error: string | null
          processed: number
          started_by: string | null
          status: string
          to_version: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          cursor_id?: string | null
          entity: string
          failed?: number
          from_version: number
          id?: string
          last_error?: string | null
          processed?: number
          started_by?: string | null
          status?: string
          to_version: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          cursor_id?: string | null
          entity?: string
          failed?: number
          from_version?: number
          id?: string
          last_error?: string | null
          processed?: number
          started_by?: string | null
          status?: string
          to_version?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_approval_requests: {
        Row: {
          action: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_by_email: string | null
          decision_reason: string | null
          executed_at: string | null
          expires_at: string
          id: string
          payload: Json
          reason: string
          requested_at: string
          requested_by: string
          requested_by_email: string | null
          resource_id: string | null
          resource_type: string
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_email?: string | null
          decision_reason?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string
          payload?: Json
          reason: string
          requested_at?: string
          requested_by: string
          requested_by_email?: string | null
          resource_id?: string | null
          resource_type: string
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_email?: string | null
          decision_reason?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string
          payload?: Json
          reason?: string
          requested_at?: string
          requested_by?: string
          requested_by_email?: string | null
          resource_id?: string | null
          resource_type?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_backup_restore_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_email: string | null
          created_at: string
          decision_note: string | null
          executed_at: string | null
          id: string
          reason: string
          requested_by: string
          requested_by_email: string
          scope: string
          snapshot_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          created_at?: string
          decision_note?: string | null
          executed_at?: string | null
          id?: string
          reason: string
          requested_by: string
          requested_by_email: string
          scope?: string
          snapshot_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          created_at?: string
          decision_note?: string | null
          executed_at?: string | null
          id?: string
          reason?: string
          requested_by?: string
          requested_by_email?: string
          scope?: string
          snapshot_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_backup_restore_requests_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "platform_backup_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_backup_snapshots: {
        Row: {
          checksum: string | null
          created_at: string
          external_id: string | null
          finished_at: string | null
          id: string
          kind: string
          notes: string | null
          recorded_by: string | null
          retention_until: string | null
          size_bytes: number | null
          source: string
          started_at: string | null
          status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          external_id?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          recorded_by?: string | null
          retention_until?: string | null
          size_bytes?: number | null
          source: string
          started_at?: string | null
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          checksum?: string | null
          created_at?: string
          external_id?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          notes?: string | null
          recorded_by?: string | null
          retention_until?: string | null
          size_bytes?: number | null
          source?: string
          started_at?: string | null
          status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      platform_bank_reconciliations: {
        Row: {
          amount: number
          bank_name: string | null
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string | null
          matched_amount: number
          matched_at: string | null
          matched_by: string | null
          matched_by_email: string | null
          notes: string | null
          payer_name: string | null
          payment_id: string | null
          statement_ref: string
          status: string
          updated_at: string
          value_date: string
        }
        Insert: {
          amount: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string | null
          matched_amount?: number
          matched_at?: string | null
          matched_by?: string | null
          matched_by_email?: string | null
          notes?: string | null
          payer_name?: string | null
          payment_id?: string | null
          statement_ref: string
          status?: string
          updated_at?: string
          value_date: string
        }
        Update: {
          amount?: number
          bank_name?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string | null
          matched_amount?: number
          matched_at?: string | null
          matched_by?: string | null
          matched_by_email?: string | null
          notes?: string | null
          payer_name?: string | null
          payment_id?: string | null
          statement_ref?: string
          status?: string
          updated_at?: string
          value_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_bank_reconciliations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_bank_reconciliations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "platform_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_billing_notes: {
        Row: {
          author_email: string | null
          author_id: string | null
          body: string
          created_at: string
          id: string
          is_internal: boolean
          resource_id: string
          resource_type: string
        }
        Insert: {
          author_email?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          is_internal?: boolean
          resource_id: string
          resource_type: string
        }
        Update: {
          author_email?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          resource_id?: string
          resource_type?: string
        }
        Relationships: []
      }
      platform_broadcasts: {
        Row: {
          audience: string
          body: string
          channels: string[]
          created_at: string
          email_sent_count: number
          id: string
          recipients_count: number
          sent_by: string | null
          sent_by_name: string | null
          target_organization_id: string | null
          target_user_id: string | null
          title: string
        }
        Insert: {
          audience: string
          body: string
          channels?: string[]
          created_at?: string
          email_sent_count?: number
          id?: string
          recipients_count?: number
          sent_by?: string | null
          sent_by_name?: string | null
          target_organization_id?: string | null
          target_user_id?: string | null
          title: string
        }
        Update: {
          audience?: string
          body?: string
          channels?: string[]
          created_at?: string
          email_sent_count?: number
          id?: string
          recipients_count?: number
          sent_by?: string | null
          sent_by_name?: string | null
          target_organization_id?: string | null
          target_user_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_broadcasts_target_organization_id_fkey"
            columns: ["target_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_content_pages: {
        Row: {
          content: Json
          created_at: string
          description: string | null
          id: string
          is_published: boolean
          kind: string
          published_at: string | null
          published_by: string | null
          slug: string
          title: string
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          published_at?: string | null
          published_by?: string | null
          slug: string
          title: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          content?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_published?: boolean
          kind?: string
          published_at?: string | null
          published_by?: string | null
          slug?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: []
      }
      platform_coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_amount: number
          id: string
          invoice_id: string
          organization_id: string | null
          redeemed_at: string
          redeemed_by: string | null
        }
        Insert: {
          coupon_id: string
          discount_amount: number
          id?: string
          invoice_id: string
          organization_id?: string | null
          redeemed_at?: string
          redeemed_by?: string | null
        }
        Update: {
          coupon_id?: string
          discount_amount?: number
          id?: string
          invoice_id?: string
          organization_id?: string | null
          redeemed_at?: string
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "platform_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_coupon_redemptions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_coupon_redemptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_coupons: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          redeemed_count: number
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          redeemed_count?: number
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          redeemed_count?: number
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_credit_notes: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          created_by_email: string | null
          currency: string
          id: string
          invoice_id: string
          issued_at: string
          number: string
          organization_id: string | null
          pdf_path: string | null
          reason: string
          status: string
          tax_amount: number
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          currency?: string
          id?: string
          invoice_id: string
          issued_at?: string
          number: string
          organization_id?: string | null
          pdf_path?: string | null
          reason: string
          status?: string
          tax_amount?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          issued_at?: string
          number?: string
          organization_id?: string | null
          pdf_path?: string | null
          reason?: string
          status?: string
          tax_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_credit_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_departments: {
        Row: {
          code: string
          created_at: string
          default_role_id: string | null
          description: string | null
          id: string
          is_active: boolean
          manager_user_id: string | null
          name_ar: string
          parent_department_id: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_role_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          manager_user_id?: string | null
          name_ar: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_role_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          manager_user_id?: string | null
          name_ar?: string
          parent_department_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_departments_default_role_id_fkey"
            columns: ["default_role_id"]
            isOneToOne: false
            referencedRelation: "platform_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_departments_parent_department_id_fkey"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "platform_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_email_templates: {
        Row: {
          body_html: string
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_ar: string
          subject: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          body_html: string
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar: string
          subject: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          body_html?: string
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_ar?: string
          subject?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_events: {
        Row: {
          correlation_id: string | null
          id: string
          occurred_at: string
          payload: Json
          process_error: string | null
          processed_at: string | null
          request_id: string | null
          source: string
          topic: string
        }
        Insert: {
          correlation_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          process_error?: string | null
          processed_at?: string | null
          request_id?: string | null
          source?: string
          topic: string
        }
        Update: {
          correlation_id?: string | null
          id?: string
          occurred_at?: string
          payload?: Json
          process_error?: string | null
          processed_at?: string | null
          request_id?: string | null
          source?: string
          topic?: string
        }
        Relationships: []
      }
      platform_feature_flags: {
        Row: {
          audience: Json
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean
          key: string
          label: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          audience?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key: string
          label: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          audience?: Json
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean
          key?: string
          label?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      platform_financial_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closed_by_email: string | null
          created_at: string
          id: string
          notes: string | null
          period_end: string
          period_start: string
          reopen_reason: string | null
          reopened_at: string | null
          reopened_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closed_by_email?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_end: string
          period_start: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closed_by_email?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          reopen_reason?: string | null
          reopened_at?: string | null
          reopened_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_impersonation_events: {
        Row: {
          actor_user_id: string
          created_at: string
          detail: string | null
          event: string
          id: string
          ip: string | null
          path: string | null
          session_id: string
          target_user_id: string
          user_agent: string | null
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          detail?: string | null
          event: string
          id?: string
          ip?: string | null
          path?: string | null
          session_id: string
          target_user_id: string
          user_agent?: string | null
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          detail?: string | null
          event?: string
          id?: string
          ip?: string | null
          path?: string | null
          session_id?: string
          target_user_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_impersonation_events_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "platform_impersonation_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_impersonation_sessions: {
        Row: {
          actor_email: string | null
          actor_user_id: string
          approval_request_id: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          expires_at: string
          id: string
          ip: string | null
          read_only: boolean
          reason: string
          started_at: string | null
          status: string
          target_email: string | null
          target_user_id: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_user_id: string
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at: string
          id?: string
          ip?: string | null
          read_only?: boolean
          reason: string
          started_at?: string | null
          status?: string
          target_email?: string | null
          target_user_id: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_user_id?: string
          approval_request_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          expires_at?: string
          id?: string
          ip?: string | null
          read_only?: boolean
          reason?: string
          started_at?: string | null
          status?: string
          target_email?: string | null
          target_user_id?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_impersonation_sessions_approval_request_id_fkey"
            columns: ["approval_request_id"]
            isOneToOne: false
            referencedRelation: "platform_approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_integrations: {
        Row: {
          auth_type: string
          base_url: string
          configuration_json: Json
          consecutive_failures: number
          created_at: string
          created_by: string | null
          definition_id: string
          display_name: string
          environment: string
          health_check_json: Json
          id: string
          internal_name: string
          is_active: boolean
          is_enabled: boolean
          last_checked_at: string | null
          last_error_code: string | null
          last_error_detail: string | null
          last_failure_at: string | null
          last_success_at: string | null
          last_trace_id: string | null
          latency_ms: number | null
          logo_path: string | null
          logo_source: string
          mapping_json: Json
          max_retries: number
          monitor_interval_minutes: number
          provider_key: string
          secret_reference: string
          status: string
          timeout_ms: number
          updated_at: string
          verified_at: string | null
          website_url: string | null
        }
        Insert: {
          auth_type: string
          base_url: string
          configuration_json?: Json
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          definition_id: string
          display_name: string
          environment?: string
          health_check_json?: Json
          id?: string
          internal_name: string
          is_active?: boolean
          is_enabled?: boolean
          last_checked_at?: string | null
          last_error_code?: string | null
          last_error_detail?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          last_trace_id?: string | null
          latency_ms?: number | null
          logo_path?: string | null
          logo_source?: string
          mapping_json?: Json
          max_retries?: number
          monitor_interval_minutes?: number
          provider_key: string
          secret_reference: string
          status?: string
          timeout_ms?: number
          updated_at?: string
          verified_at?: string | null
          website_url?: string | null
        }
        Update: {
          auth_type?: string
          base_url?: string
          configuration_json?: Json
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          definition_id?: string
          display_name?: string
          environment?: string
          health_check_json?: Json
          id?: string
          internal_name?: string
          is_active?: boolean
          is_enabled?: boolean
          last_checked_at?: string | null
          last_error_code?: string | null
          last_error_detail?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          last_trace_id?: string | null
          latency_ms?: number | null
          logo_path?: string | null
          logo_source?: string
          mapping_json?: Json
          max_retries?: number
          monitor_interval_minutes?: number
          provider_key?: string
          secret_reference?: string
          status?: string
          timeout_ms?: number
          updated_at?: string
          verified_at?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_integrations_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "integration_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoice_items: {
        Row: {
          created_at: string
          description: string
          discount_amount: number
          id: string
          invoice_id: string
          line_subtotal: number
          line_tax: number
          line_total: number
          quantity: number
          sort_order: number
          tax_rate: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          discount_amount?: number
          id?: string
          invoice_id: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          quantity?: number
          sort_order?: number
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          discount_amount?: number
          id?: string
          invoice_id?: string
          line_subtotal?: number
          line_tax?: number
          line_total?: number
          quantity?: number
          sort_order?: number
          tax_rate?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_invoices: {
        Row: {
          billing_address: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          commercial_registration: string | null
          coupon_code: string | null
          created_at: string
          created_by: string | null
          created_by_email: string | null
          currency: string
          customer_email: string | null
          customer_legal_name: string | null
          customer_name: string
          customer_phone: string | null
          discount_total: number
          due_at: string | null
          id: string
          internal_notes: string | null
          issued_at: string | null
          notes: string | null
          number: string
          organization_id: string | null
          paid_at: string | null
          paid_total: number
          payment_method: string | null
          payment_reference: string | null
          pdf_path: string | null
          plan_code: string | null
          plan_label: string | null
          refunded_total: number
          remaining: number
          service_period_end: string | null
          service_period_start: string | null
          status: string
          subscription_id: string | null
          subtotal: number
          tax_exempt: boolean
          tax_exemption_reason: string | null
          tax_number: string | null
          tax_rate: number
          tax_total: number
          total: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          billing_address?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          commercial_registration?: string | null
          coupon_code?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          currency?: string
          customer_email?: string | null
          customer_legal_name?: string | null
          customer_name: string
          customer_phone?: string | null
          discount_total?: number
          due_at?: string | null
          id?: string
          internal_notes?: string | null
          issued_at?: string | null
          notes?: string | null
          number: string
          organization_id?: string | null
          paid_at?: string | null
          paid_total?: number
          payment_method?: string | null
          payment_reference?: string | null
          pdf_path?: string | null
          plan_code?: string | null
          plan_label?: string | null
          refunded_total?: number
          remaining?: number
          service_period_end?: string | null
          service_period_start?: string | null
          status?: string
          subscription_id?: string | null
          subtotal?: number
          tax_exempt?: boolean
          tax_exemption_reason?: string | null
          tax_number?: string | null
          tax_rate?: number
          tax_total?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          billing_address?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          commercial_registration?: string | null
          coupon_code?: string | null
          created_at?: string
          created_by?: string | null
          created_by_email?: string | null
          currency?: string
          customer_email?: string | null
          customer_legal_name?: string | null
          customer_name?: string
          customer_phone?: string | null
          discount_total?: number
          due_at?: string | null
          id?: string
          internal_notes?: string | null
          issued_at?: string | null
          notes?: string | null
          number?: string
          organization_id?: string | null
          paid_at?: string | null
          paid_total?: number
          payment_method?: string | null
          payment_reference?: string | null
          pdf_path?: string | null
          plan_code?: string | null
          plan_label?: string | null
          refunded_total?: number
          remaining?: number
          service_period_end?: string | null
          service_period_start?: string | null
          status?: string
          subscription_id?: string | null
          subtotal?: number
          tax_exempt?: boolean
          tax_exemption_reason?: string | null
          tax_number?: string | null
          tax_rate?: number
          tax_total?: number
          total?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_notification_rules: {
        Row: {
          channel: string
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean
          label: string
          target: string
          template_key: string | null
          topic: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          label: string
          target: string
          template_key?: string | null
          topic: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          label?: string
          target?: string
          template_key?: string | null
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_number_sequences: {
        Row: {
          created_at: string
          kind: string
          next_value: number
          padding: number
          period_key: string
          prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          kind: string
          next_value?: number
          padding?: number
          period_key: string
          prefix: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          kind?: string
          next_value?: number
          padding?: number
          period_key?: string
          prefix?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_payment_attempts: {
        Row: {
          correlation_id: string | null
          created_at: string
          duration_ms: number | null
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          invoice_id: string | null
          operation: string
          payment_id: string | null
          provider: string
          provider_status: string | null
          request_id: string | null
          request_payload: Json
          response_payload: Json
          status: string
        }
        Insert: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          invoice_id?: string | null
          operation: string
          payment_id?: string | null
          provider: string
          provider_status?: string | null
          request_id?: string | null
          request_payload?: Json
          response_payload?: Json
          status: string
        }
        Update: {
          correlation_id?: string | null
          created_at?: string
          duration_ms?: number | null
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          invoice_id?: string | null
          operation?: string
          payment_id?: string | null
          provider?: string
          provider_status?: string | null
          request_id?: string | null
          request_payload?: Json
          response_payload?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_payment_attempts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_payment_attempts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "platform_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_provider_configs: {
        Row: {
          code: string
          connection_status: string
          created_at: string
          description: string | null
          id: string
          integration_id: string | null
          is_enabled: boolean
          last_test_error: string | null
          last_tested_at: string | null
          name_ar: string
          settings: Json
          sort_order: number
          supports_refunds: boolean
          supports_webhooks: boolean
          updated_at: string
          webhook_path: string | null
        }
        Insert: {
          code: string
          connection_status?: string
          created_at?: string
          description?: string | null
          id?: string
          integration_id?: string | null
          is_enabled?: boolean
          last_test_error?: string | null
          last_tested_at?: string | null
          name_ar: string
          settings?: Json
          sort_order?: number
          supports_refunds?: boolean
          supports_webhooks?: boolean
          updated_at?: string
          webhook_path?: string | null
        }
        Update: {
          code?: string
          connection_status?: string
          created_at?: string
          description?: string | null
          id?: string
          integration_id?: string | null
          is_enabled?: boolean
          last_test_error?: string | null
          last_tested_at?: string | null
          name_ar?: string
          settings?: Json
          sort_order?: number
          supports_refunds?: boolean
          supports_webhooks?: boolean
          updated_at?: string
          webhook_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_payment_provider_configs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "platform_integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_webhooks: {
        Row: {
          attempts: number
          correlation_id: string | null
          event_id: string | null
          event_type: string | null
          id: string
          invoice_id: string | null
          last_error: string | null
          next_retry_at: string | null
          payment_id: string | null
          processed_at: string | null
          provider: string
          raw_body: string
          raw_headers: Json
          received_at: string
          replay_detected: boolean
          request_id: string | null
          signature_valid: boolean
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          correlation_id?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          next_retry_at?: string | null
          payment_id?: string | null
          processed_at?: string | null
          provider: string
          raw_body?: string
          raw_headers?: Json
          received_at?: string
          replay_detected?: boolean
          request_id?: string | null
          signature_valid?: boolean
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          correlation_id?: string | null
          event_id?: string | null
          event_type?: string | null
          id?: string
          invoice_id?: string | null
          last_error?: string | null
          next_retry_at?: string | null
          payment_id?: string | null
          processed_at?: string | null
          provider?: string
          raw_body?: string
          raw_headers?: Json
          received_at?: string
          replay_detected?: boolean
          request_id?: string | null
          signature_valid?: boolean
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_payment_webhooks_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_payment_webhooks_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "platform_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          approved_by_email: string | null
          bank_reference: string | null
          correlation_id: string | null
          created_at: string
          currency: string
          failure_code: string | null
          failure_message: string | null
          id: string
          invoice_id: string
          metadata: Json
          method: string
          notes: string | null
          organization_id: string | null
          paid_at: string | null
          proof_path: string | null
          provider: string
          provider_payment_id: string | null
          provider_reference: string | null
          received_at: string | null
          refunded_amount: number
          rejection_reason: string | null
          status: string
          submitted_by: string | null
          submitted_by_email: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          bank_reference?: string | null
          correlation_id?: string | null
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          invoice_id: string
          metadata?: Json
          method?: string
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          proof_path?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_reference?: string | null
          received_at?: string | null
          refunded_amount?: number
          rejection_reason?: string | null
          status?: string
          submitted_by?: string | null
          submitted_by_email?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          bank_reference?: string | null
          correlation_id?: string | null
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          invoice_id?: string
          metadata?: Json
          method?: string
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          proof_path?: string | null
          provider?: string
          provider_payment_id?: string | null
          provider_reference?: string | null
          received_at?: string | null
          refunded_amount?: number
          rejection_reason?: string | null
          status?: string
          submitted_by?: string | null
          submitted_by_email?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_period_reopen_approvals: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          approved_by_email: string | null
          created_at: string
          id: string
          period_id: string
          reason: string
          requested_by: string
          requested_by_email: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          created_at?: string
          id?: string
          period_id: string
          reason: string
          requested_by: string
          requested_by_email: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          created_at?: string
          id?: string
          period_id?: string
          reason?: string
          requested_by?: string
          requested_by_email?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_period_reopen_approvals_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "platform_financial_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_permission_grants: {
        Row: {
          created_at: string
          expires_at: string
          granted_by: string
          granted_by_email: string | null
          grantee_user_id: string
          id: string
          permission: string
          reason: string
          reference: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          source: string
          starts_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          granted_by: string
          granted_by_email?: string | null
          grantee_user_id: string
          id?: string
          permission: string
          reason: string
          reference?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source?: string
          starts_at?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          granted_by?: string
          granted_by_email?: string | null
          grantee_user_id?: string
          id?: string
          permission?: string
          reason?: string
          reference?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          source?: string
          starts_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_plans: {
        Row: {
          ai_enabled: boolean
          api_enabled: boolean
          client_upload_enabled: boolean
          code: string
          color: string
          created_at: string
          currency: string
          description: string | null
          duration_months: number
          esignature_enabled: boolean
          features: Json
          id: string
          is_active: boolean
          is_public: boolean
          max_branches: number | null
          max_cases: number | null
          max_clients: number | null
          max_documents: number | null
          max_users: number | null
          name_ar: string
          name_en: string | null
          ocr_pages_monthly: number | null
          pdf_search_enabled: boolean
          price_monthly: number
          price_yearly: number
          public_office_page: boolean
          sla_hours: number
          sort_order: number
          storage_gb: number | null
          support_level: string
          updated_at: string
          voice_enabled: boolean
        }
        Insert: {
          ai_enabled?: boolean
          api_enabled?: boolean
          client_upload_enabled?: boolean
          code: string
          color?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_months?: number
          esignature_enabled?: boolean
          features?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_branches?: number | null
          max_cases?: number | null
          max_clients?: number | null
          max_documents?: number | null
          max_users?: number | null
          name_ar: string
          name_en?: string | null
          ocr_pages_monthly?: number | null
          pdf_search_enabled?: boolean
          price_monthly?: number
          price_yearly?: number
          public_office_page?: boolean
          sla_hours?: number
          sort_order?: number
          storage_gb?: number | null
          support_level?: string
          updated_at?: string
          voice_enabled?: boolean
        }
        Update: {
          ai_enabled?: boolean
          api_enabled?: boolean
          client_upload_enabled?: boolean
          code?: string
          color?: string
          created_at?: string
          currency?: string
          description?: string | null
          duration_months?: number
          esignature_enabled?: boolean
          features?: Json
          id?: string
          is_active?: boolean
          is_public?: boolean
          max_branches?: number | null
          max_cases?: number | null
          max_clients?: number | null
          max_documents?: number | null
          max_users?: number | null
          name_ar?: string
          name_en?: string | null
          ocr_pages_monthly?: number | null
          pdf_search_enabled?: boolean
          price_monthly?: number
          price_yearly?: number
          public_office_page?: boolean
          sla_hours?: number
          sort_order?: number
          storage_gb?: number | null
          support_level?: string
          updated_at?: string
          voice_enabled?: boolean
        }
        Relationships: []
      }
      platform_refunds: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          approved_by_email: string | null
          correlation_id: string | null
          created_at: string
          currency: string
          failure_message: string | null
          id: string
          invoice_id: string
          payment_id: string
          processed_at: string | null
          provider: string
          provider_refund_id: string | null
          reason: string
          requested_by: string | null
          requested_by_email: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          correlation_id?: string | null
          created_at?: string
          currency?: string
          failure_message?: string | null
          id?: string
          invoice_id: string
          payment_id: string
          processed_at?: string | null
          provider?: string
          provider_refund_id?: string | null
          reason: string
          requested_by?: string | null
          requested_by_email?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          approved_by_email?: string | null
          correlation_id?: string | null
          created_at?: string
          currency?: string
          failure_message?: string | null
          id?: string
          invoice_id?: string
          payment_id?: string
          processed_at?: string | null
          provider?: string
          provider_refund_id?: string | null
          reason?: string
          requested_by?: string | null
          requested_by_email?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_refunds_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "platform_payments"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name_ar: string
          permissions: string[]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name_ar: string
          permissions?: string[]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name_ar?: string
          permissions?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          is_public: boolean
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          is_public?: boolean
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          is_public?: boolean
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      platform_staff: {
        Row: {
          created_at: string
          created_by: string | null
          department_id: string | null
          email: string
          full_name: string
          id: string
          job_title: string | null
          manager_user_id: string | null
          permissions: string[]
          role: Database["public"]["Enums"]["platform_role"]
          role_id: string | null
          status: Database["public"]["Enums"]["platform_staff_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          email: string
          full_name: string
          id?: string
          job_title?: string | null
          manager_user_id?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["platform_role"]
          role_id?: string | null
          status?: Database["public"]["Enums"]["platform_staff_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          email?: string
          full_name?: string
          id?: string
          job_title?: string | null
          manager_user_id?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["platform_role"]
          role_id?: string | null
          status?: Database["public"]["Enums"]["platform_staff_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_staff_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "platform_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "platform_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_staff_restrictions: {
        Row: {
          allowed_ips: string[]
          allowed_weekdays: number[]
          blocked_devices: string[]
          created_at: string
          denied_ips: string[]
          device_enforced: boolean
          effective_from: string | null
          effective_to: string | null
          ip_enforced: boolean
          reason: string | null
          time_enforced: boolean
          trusted_devices: string[]
          updated_at: string
          updated_by: string | null
          user_id: string
          work_end_minute: number
          work_start_minute: number
        }
        Insert: {
          allowed_ips?: string[]
          allowed_weekdays?: number[]
          blocked_devices?: string[]
          created_at?: string
          denied_ips?: string[]
          device_enforced?: boolean
          effective_from?: string | null
          effective_to?: string | null
          ip_enforced?: boolean
          reason?: string | null
          time_enforced?: boolean
          trusted_devices?: string[]
          updated_at?: string
          updated_by?: string | null
          user_id: string
          work_end_minute?: number
          work_start_minute?: number
        }
        Update: {
          allowed_ips?: string[]
          allowed_weekdays?: number[]
          blocked_devices?: string[]
          created_at?: string
          denied_ips?: string[]
          device_enforced?: boolean
          effective_from?: string | null
          effective_to?: string | null
          ip_enforced?: boolean
          reason?: string | null
          time_enforced?: boolean
          trusted_devices?: string[]
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          work_end_minute?: number
          work_start_minute?: number
        }
        Relationships: []
      }
      platform_staff_sessions: {
        Row: {
          browser: string | null
          country: string | null
          created_at: string
          device: string | null
          device_fingerprint: string
          first_seen_at: string
          id: string
          ip: string | null
          last_seen_at: string
          os: string | null
          requests_count: number
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          browser?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          device_fingerprint: string
          first_seen_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          os?: string | null
          requests_count?: number
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          browser?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          device_fingerprint?: string
          first_seen_at?: string
          id?: string
          ip?: string | null
          last_seen_at?: string
          os?: string | null
          requests_count?: number
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_user_notes: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          user_email: string
          user_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          id?: string
          user_email: string
          user_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      print_audit_logs: {
        Row: {
          action: string
          browser: string | null
          classification: string
          copy_number: number
          country: string | null
          created_at: string
          device: string | null
          document_id: string | null
          document_ref: string | null
          document_title: string | null
          document_type: string
          document_version: string
          id: string
          ip: string | null
          metadata: Json
          organization_id: string
          os: string | null
          pages_count: number
          print_ref: string
          session_id: string | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_name: string | null
          user_role: string | null
          watermark_override: boolean
        }
        Insert: {
          action: string
          browser?: string | null
          classification?: string
          copy_number?: number
          country?: string | null
          created_at?: string
          device?: string | null
          document_id?: string | null
          document_ref?: string | null
          document_title?: string | null
          document_type: string
          document_version?: string
          id?: string
          ip?: string | null
          metadata?: Json
          organization_id: string
          os?: string | null
          pages_count?: number
          print_ref: string
          session_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
          watermark_override?: boolean
        }
        Update: {
          action?: string
          browser?: string | null
          classification?: string
          copy_number?: number
          country?: string | null
          created_at?: string
          device?: string | null
          document_id?: string | null
          document_ref?: string | null
          document_title?: string | null
          document_type?: string
          document_version?: string
          id?: string
          ip?: string | null
          metadata?: Json
          organization_id?: string
          os?: string | null
          pages_count?: number
          print_ref?: string
          session_id?: string | null
          user_agent?: string | null
          user_email?: string | null
          user_id?: string | null
          user_name?: string | null
          user_role?: string | null
          watermark_override?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "print_audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "print_audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          job_title: string | null
          mfa_status: string
          phone: string | null
          phone_verification_status: string
          phone_verified_at: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id: string
          is_active?: boolean
          job_title?: string | null
          mfa_status?: string
          phone?: string | null
          phone_verification_status?: string
          phone_verified_at?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string | null
          mfa_status?: string
          phone?: string | null
          phone_verification_status?: string
          phone_verified_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_document_events: {
        Row: {
          actor_email: string | null
          created_at: string
          document_id: string
          event: string
          from_status: Database["public"]["Enums"]["sales_doc_status"] | null
          id: string
          metadata: Json
          note: string | null
          to_status: Database["public"]["Enums"]["sales_doc_status"] | null
        }
        Insert: {
          actor_email?: string | null
          created_at?: string
          document_id: string
          event: string
          from_status?: Database["public"]["Enums"]["sales_doc_status"] | null
          id?: string
          metadata?: Json
          note?: string | null
          to_status?: Database["public"]["Enums"]["sales_doc_status"] | null
        }
        Update: {
          actor_email?: string | null
          created_at?: string
          document_id?: string
          event?: string
          from_status?: Database["public"]["Enums"]["sales_doc_status"] | null
          id?: string
          metadata?: Json
          note?: string | null
          to_status?: Database["public"]["Enums"]["sales_doc_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_document_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sales_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_document_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          discount_amount: number
          document_id: string
          id: string
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          discount_amount?: number
          document_id: string
          id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          discount_amount?: number
          document_id?: string
          id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_document_items_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sales_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_document_signatures: {
        Row: {
          created_at: string
          document_id: string
          evidence_hash: string
          id: string
          ip: string | null
          method: string
          signed_at: string
          signer_email: string
          signer_name: string
          signer_role: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          document_id: string
          evidence_hash: string
          id?: string
          ip?: string | null
          method?: string
          signed_at?: string
          signer_email: string
          signer_name: string
          signer_role?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          document_id?: string
          evidence_hash?: string
          id?: string
          ip?: string | null
          method?: string
          signed_at?: string
          signer_email?: string
          signer_name?: string
          signer_role?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_document_signatures_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "sales_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_document_templates: {
        Row: {
          created_at: string
          created_by: string | null
          default_tax_rate: number
          default_validity_days: number
          id: string
          intro: string | null
          is_active: boolean
          items: Json
          kind: Database["public"]["Enums"]["sales_doc_kind"]
          name: string
          terms: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_tax_rate?: number
          default_validity_days?: number
          id?: string
          intro?: string | null
          is_active?: boolean
          items?: Json
          kind: Database["public"]["Enums"]["sales_doc_kind"]
          name: string
          terms?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_tax_rate?: number
          default_validity_days?: number
          id?: string
          intro?: string | null
          is_active?: boolean
          items?: Json
          kind?: Database["public"]["Enums"]["sales_doc_kind"]
          name?: string
          terms?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sales_documents: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string | null
          contact_id: string | null
          converted_invoice_id: string | null
          converted_subscription_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          deal_id: string | null
          decided_at: string | null
          decision_note: string | null
          discount_amount: number
          discount_type: string
          discount_value: number
          ends_on: string | null
          first_viewed_at: string | null
          id: string
          intro: string | null
          kind: Database["public"]["Enums"]["sales_doc_kind"]
          locked: boolean
          notes: string | null
          number: string | null
          organization_id: string | null
          owner_staff_id: string | null
          recipient_address: string | null
          recipient_company: string | null
          recipient_email: string | null
          recipient_name: string | null
          recipient_phone: string | null
          requires_approval: boolean
          sent_at: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["sales_doc_status"]
          subtotal: number
          tax_amount: number
          tax_rate: number
          template_id: string | null
          terms: string | null
          title: string
          total: number
          updated_at: string
          updated_by: string | null
          valid_until: string | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          contact_id?: string | null
          converted_invoice_id?: string | null
          converted_subscription_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          decided_at?: string | null
          decision_note?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          ends_on?: string | null
          first_viewed_at?: string | null
          id?: string
          intro?: string | null
          kind: Database["public"]["Enums"]["sales_doc_kind"]
          locked?: boolean
          notes?: string | null
          number?: string | null
          organization_id?: string | null
          owner_staff_id?: string | null
          recipient_address?: string | null
          recipient_company?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          requires_approval?: boolean
          sent_at?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["sales_doc_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          template_id?: string | null
          terms?: string | null
          title: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string | null
          contact_id?: string | null
          converted_invoice_id?: string | null
          converted_subscription_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deal_id?: string | null
          decided_at?: string | null
          decision_note?: string | null
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          ends_on?: string | null
          first_viewed_at?: string | null
          id?: string
          intro?: string | null
          kind?: Database["public"]["Enums"]["sales_doc_kind"]
          locked?: boolean
          notes?: string | null
          number?: string | null
          organization_id?: string | null
          owner_staff_id?: string | null
          recipient_address?: string | null
          recipient_company?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          recipient_phone?: string | null
          requires_approval?: boolean
          sent_at?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["sales_doc_status"]
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          template_id?: string | null
          terms?: string | null
          title?: string
          total?: number
          updated_at?: string
          updated_by?: string | null
          valid_until?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "crm_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "crm_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_converted_invoice_id_fkey"
            columns: ["converted_invoice_id"]
            isOneToOne: false
            referencedRelation: "platform_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_converted_subscription_id_fkey"
            columns: ["converted_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "crm_deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_owner_staff_id_fkey"
            columns: ["owner_staff_id"]
            isOneToOne: false
            referencedRelation: "platform_staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sales_document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_delivery_logs: {
        Row: {
          action: string
          created_at: string
          device: string | null
          error_code: string | null
          error_message: string | null
          id: string
          ip: string | null
          latency_ms: number | null
          outcome: string
          phone_masked: string
          provider: string
          purpose: string
          reference_id: string | null
          trace_ref: string | null
        }
        Insert: {
          action: string
          created_at?: string
          device?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          ip?: string | null
          latency_ms?: number | null
          outcome: string
          phone_masked: string
          provider: string
          purpose: string
          reference_id?: string | null
          trace_ref?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          device?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          ip?: string | null
          latency_ms?: number | null
          outcome?: string
          phone_masked?: string
          provider?: string
          purpose?: string
          reference_id?: string | null
          trace_ref?: string | null
        }
        Relationships: []
      }
      sms_settings: {
        Row: {
          active_provider: string
          alert_admin_on_failure: boolean
          allow_signup_during_outage: boolean
          api_key_hint: string | null
          api_secret_hint: string | null
          application_id: string | null
          base_url: string | null
          code_length: number
          code_ttl_minutes: number
          created_at: string
          default_country: string
          default_dial_code: string
          emergency_email_only: boolean
          enabled: boolean
          health_status: string
          hide_phone_when_disabled: boolean
          id: boolean
          last_error_reason: string | null
          last_failure_at: string | null
          last_success_at: string | null
          last_trace_ref: string | null
          max_verify_attempts: number
          message_language: string
          message_template: string
          provider_label: string | null
          rate_limit_per_hour: number
          require_phone: boolean
          resend_wait_seconds: number
          sender_id: string | null
          sender_name: string | null
          service_sid: string | null
          show_outage_notice: boolean
          show_phone_field: boolean
          signup_mode: string
          test_mode: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_provider?: string
          alert_admin_on_failure?: boolean
          allow_signup_during_outage?: boolean
          api_key_hint?: string | null
          api_secret_hint?: string | null
          application_id?: string | null
          base_url?: string | null
          code_length?: number
          code_ttl_minutes?: number
          created_at?: string
          default_country?: string
          default_dial_code?: string
          emergency_email_only?: boolean
          enabled?: boolean
          health_status?: string
          hide_phone_when_disabled?: boolean
          id?: boolean
          last_error_reason?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          last_trace_ref?: string | null
          max_verify_attempts?: number
          message_language?: string
          message_template?: string
          provider_label?: string | null
          rate_limit_per_hour?: number
          require_phone?: boolean
          resend_wait_seconds?: number
          sender_id?: string | null
          sender_name?: string | null
          service_sid?: string | null
          show_outage_notice?: boolean
          show_phone_field?: boolean
          signup_mode?: string
          test_mode?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_provider?: string
          alert_admin_on_failure?: boolean
          allow_signup_during_outage?: boolean
          api_key_hint?: string | null
          api_secret_hint?: string | null
          application_id?: string | null
          base_url?: string | null
          code_length?: number
          code_ttl_minutes?: number
          created_at?: string
          default_country?: string
          default_dial_code?: string
          emergency_email_only?: boolean
          enabled?: boolean
          health_status?: string
          hide_phone_when_disabled?: boolean
          id?: boolean
          last_error_reason?: string | null
          last_failure_at?: string | null
          last_success_at?: string | null
          last_trace_ref?: string | null
          max_verify_attempts?: number
          message_language?: string
          message_template?: string
          provider_label?: string | null
          rate_limit_per_hour?: number
          require_phone?: boolean
          resend_wait_seconds?: number
          sender_id?: string | null
          sender_name?: string | null
          service_sid?: string | null
          show_outage_notice?: boolean
          show_phone_field?: boolean
          signup_mode?: string
          test_mode?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          activation_method: string
          amount: number
          auto_renew: boolean
          billing_note: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          email: string
          ends_at: string
          id: string
          last_modified_at: string | null
          last_modified_by: string | null
          organization_id: string | null
          plan_code: string
          plan_id: string | null
          plan_label: string
          starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          suspended_at: string | null
          suspension_reason: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activation_method?: string
          amount?: number
          auto_renew?: boolean
          billing_note?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email: string
          ends_at: string
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          organization_id?: string | null
          plan_code: string
          plan_id?: string | null
          plan_label: string
          starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activation_method?: string
          amount?: number
          auto_renew?: boolean
          billing_note?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string
          ends_at?: string
          id?: string
          last_modified_at?: string | null
          last_modified_by?: string | null
          organization_id?: string | null
          plan_code?: string
          plan_id?: string | null
          plan_label?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          suspended_at?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_grants: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          reason: string
          requested_at: string
          revoked_at: string | null
          revoked_by: string | null
          scope: string[]
          staff_email: string
          staff_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          reason: string
          requested_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string[]
          staff_email: string
          staff_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          reason?: string
          requested_at?: string
          revoked_at?: string | null
          revoked_by?: string | null
          scope?: string[]
          staff_email?: string
          staff_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_business_calendars: {
        Row: {
          code: string
          created_at: string
          end_minute: number
          id: string
          is_active: boolean
          name_ar: string
          start_minute: number
          timezone: string
          updated_at: string
          work_days: number[]
        }
        Insert: {
          code: string
          created_at?: string
          end_minute?: number
          id?: string
          is_active?: boolean
          name_ar: string
          start_minute?: number
          timezone?: string
          updated_at?: string
          work_days?: number[]
        }
        Update: {
          code?: string
          created_at?: string
          end_minute?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          start_minute?: number
          timezone?: string
          updated_at?: string
          work_days?: number[]
        }
        Relationships: []
      }
      support_categories: {
        Row: {
          code: string
          created_at: string
          default_priority: Database["public"]["Enums"]["ticket_priority"]
          default_team_id: string | null
          description: string | null
          id: string
          is_active: boolean
          name_ar: string
          sla_policy_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          default_priority?: Database["public"]["Enums"]["ticket_priority"]
          default_team_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name_ar: string
          sla_policy_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          default_priority?: Database["public"]["Enums"]["ticket_priority"]
          default_team_id?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name_ar?: string
          sla_policy_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_categories_default_team_id_fkey"
            columns: ["default_team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_categories_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "support_sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      support_csat_invitations: {
        Row: {
          category: string | null
          comment: string | null
          created_at: string
          expires_at: string
          id: string
          rating: number | null
          recipient_email: string
          staff_id: string | null
          team_id: string | null
          ticket_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          category?: string | null
          comment?: string | null
          created_at?: string
          expires_at: string
          id?: string
          rating?: number | null
          recipient_email: string
          staff_id?: string | null
          team_id?: string | null
          ticket_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          category?: string | null
          comment?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          rating?: number | null
          recipient_email?: string
          staff_id?: string | null
          team_id?: string | null
          ticket_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_csat_invitations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_csat_invitations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_escalation_rules: {
        Row: {
          category: string | null
          channel: string | null
          created_at: string
          from_level: number
          id: string
          is_active: boolean
          name_ar: string
          notify_manager: boolean
          priority: Database["public"]["Enums"]["ticket_priority"] | null
          sort_order: number
          target_team_id: string | null
          target_user_id: string | null
          to_level: number
          trigger_type: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          channel?: string | null
          created_at?: string
          from_level?: number
          id?: string
          is_active?: boolean
          name_ar: string
          notify_manager?: boolean
          priority?: Database["public"]["Enums"]["ticket_priority"] | null
          sort_order?: number
          target_team_id?: string | null
          target_user_id?: string | null
          to_level?: number
          trigger_type: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          channel?: string | null
          created_at?: string
          from_level?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          notify_manager?: boolean
          priority?: Database["public"]["Enums"]["ticket_priority"] | null
          sort_order?: number
          target_team_id?: string | null
          target_user_id?: string | null
          to_level?: number
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_escalation_rules_target_team_id_fkey"
            columns: ["target_team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      support_holidays: {
        Row: {
          calendar_id: string
          created_at: string
          holiday_date: string
          id: string
          name_ar: string
        }
        Insert: {
          calendar_id: string
          created_at?: string
          holiday_date: string
          id?: string
          name_ar: string
        }
        Update: {
          calendar_id?: string
          created_at?: string
          holiday_date?: string
          id?: string
          name_ar?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_holidays_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "support_business_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      support_internal_notes: {
        Row: {
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          id: string
          mentions: string[]
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_internal_notes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sla_events: {
        Row: {
          created_at: string
          due_at: string | null
          event_type: string
          id: string
          metadata: Json
          metric: string
          occurred_at: string
          paused_seconds: number | null
          policy_id: string | null
          reason: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          due_at?: string | null
          event_type: string
          id?: string
          metadata?: Json
          metric?: string
          occurred_at?: string
          paused_seconds?: number | null
          policy_id?: string | null
          reason?: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          due_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          metric?: string
          occurred_at?: string
          paused_seconds?: number | null
          policy_id?: string | null
          reason?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sla_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "support_sla_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_sla_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sla_policies: {
        Row: {
          calendar_id: string
          category: string | null
          channel: string | null
          code: string
          created_at: string
          critical_percent: number
          first_response_minutes: number
          id: string
          is_active: boolean
          name_ar: string
          pause_on_customer_wait: boolean
          plan_code: string | null
          priority: Database["public"]["Enums"]["ticket_priority"] | null
          resolution_minutes: number
          specificity: number
          updated_at: string
          warning_percent: number
        }
        Insert: {
          calendar_id: string
          category?: string | null
          channel?: string | null
          code: string
          created_at?: string
          critical_percent?: number
          first_response_minutes?: number
          id?: string
          is_active?: boolean
          name_ar: string
          pause_on_customer_wait?: boolean
          plan_code?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"] | null
          resolution_minutes?: number
          specificity?: number
          updated_at?: string
          warning_percent?: number
        }
        Update: {
          calendar_id?: string
          category?: string | null
          channel?: string | null
          code?: string
          created_at?: string
          critical_percent?: number
          first_response_minutes?: number
          id?: string
          is_active?: boolean
          name_ar?: string
          pause_on_customer_wait?: boolean
          plan_code?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"] | null
          resolution_minutes?: number
          specificity?: number
          updated_at?: string
          warning_percent?: number
        }
        Relationships: [
          {
            foreignKeyName: "support_sla_policies_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "support_business_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name_ar: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name_ar: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name_ar?: string
        }
        Relationships: []
      }
      support_team_members: {
        Row: {
          created_at: string
          id: string
          is_lead: boolean
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_lead?: boolean
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_lead?: boolean
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      support_teams: {
        Row: {
          code: string
          created_at: string
          department_id: string | null
          description: string | null
          escalation_team_id: string | null
          id: string
          is_active: boolean
          is_default: boolean
          mailbox_id: string | null
          manager_user_id: string | null
          name_ar: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          escalation_team_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          mailbox_id?: string | null
          manager_user_id?: string | null
          name_ar: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          escalation_team_id?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          mailbox_id?: string | null
          manager_user_id?: string | null
          name_ar?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_teams_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "platform_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_teams_escalation_team_id_fkey"
            columns: ["escalation_team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_teams_mailbox_id_fkey"
            columns: ["mailbox_id"]
            isOneToOne: false
            referencedRelation: "email_mailboxes"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          actor_name: string | null
          created_at: string
          email_message_id: string | null
          event_type: string
          id: string
          internal_note_id: string | null
          metadata: Json
          reason: string | null
          ticket_id: string
          value_after: Json | null
          value_before: Json | null
        }
        Insert: {
          actor_id?: string | null
          actor_kind?: string
          actor_name?: string | null
          created_at?: string
          email_message_id?: string | null
          event_type: string
          id?: string
          internal_note_id?: string | null
          metadata?: Json
          reason?: string | null
          ticket_id: string
          value_after?: Json | null
          value_before?: Json | null
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          actor_name?: string | null
          created_at?: string
          email_message_id?: string | null
          event_type?: string
          id?: string
          internal_note_id?: string | null
          metadata?: Json
          reason?: string | null
          ticket_id?: string
          value_after?: Json | null
          value_before?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_events_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_ingest: {
        Row: {
          created_at: string
          dedupe_key: string
          email_message_id: string | null
          id: string
          match_reason: string | null
          outcome: string
          provider_message_id: string | null
          source: string | null
          thread_id: string | null
          ticket_id: string | null
        }
        Insert: {
          created_at?: string
          dedupe_key: string
          email_message_id?: string | null
          id?: string
          match_reason?: string | null
          outcome: string
          provider_message_id?: string | null
          source?: string | null
          thread_id?: string | null
          ticket_id?: string | null
        }
        Update: {
          created_at?: string
          dedupe_key?: string
          email_message_id?: string | null
          id?: string
          match_reason?: string | null
          outcome?: string
          provider_message_id?: string | null
          source?: string | null
          thread_id?: string | null
          ticket_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_ingest_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_ingest_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_ingest_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_messages: {
        Row: {
          attachments: Json
          author_id: string | null
          author_name: string
          body: string
          created_at: string
          email_message_id: string | null
          id: string
          is_staff: boolean
          ticket_id: string
        }
        Insert: {
          attachments?: Json
          author_id?: string | null
          author_name: string
          body: string
          created_at?: string
          email_message_id?: string | null
          id?: string
          is_staff?: boolean
          ticket_id: string
        }
        Update: {
          attachments?: Json
          author_id?: string | null
          author_name?: string
          body?: string
          created_at?: string
          email_message_id?: string | null
          id?: string
          is_staff?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_email_message_id_fkey"
            columns: ["email_message_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_tags: {
        Row: {
          created_at: string
          created_by: string | null
          tag_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          tag_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          tag_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "support_tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_tags_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assigned_to: string | null
          category: string
          channel: string
          closed_at: string | null
          created_at: string
          csat_requested_at: string | null
          description: string
          due_first_response_at: string | null
          due_resolution_at: string | null
          escalated_at: string | null
          escalation_level: number
          first_response_at: string | null
          id: string
          identity_source: string | null
          kb_article_ids: string[]
          last_customer_reply_at: string | null
          last_reply_at: string
          last_staff_reply_at: string | null
          merged_into_id: string | null
          needs_identity_review: boolean
          organization_id: string | null
          paused_at: string | null
          paused_total_seconds: number
          priority: Database["public"]["Enums"]["ticket_priority"]
          rated_at: string | null
          rated_staff_id: string | null
          rated_staff_name: string | null
          rating: number | null
          rating_comment: string | null
          reference: string
          reopened_count: number
          requester_email: string | null
          requester_name: string | null
          resolved_at: string | null
          sla_policy_id: string | null
          sla_state: string
          source_email_thread_id: string | null
          split_from_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          subscription_id: string | null
          team_id: string | null
          ticket_number: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          channel?: string
          closed_at?: string | null
          created_at?: string
          csat_requested_at?: string | null
          description: string
          due_first_response_at?: string | null
          due_resolution_at?: string | null
          escalated_at?: string | null
          escalation_level?: number
          first_response_at?: string | null
          id?: string
          identity_source?: string | null
          kb_article_ids?: string[]
          last_customer_reply_at?: string | null
          last_reply_at?: string
          last_staff_reply_at?: string | null
          merged_into_id?: string | null
          needs_identity_review?: boolean
          organization_id?: string | null
          paused_at?: string | null
          paused_total_seconds?: number
          priority?: Database["public"]["Enums"]["ticket_priority"]
          rated_at?: string | null
          rated_staff_id?: string | null
          rated_staff_name?: string | null
          rating?: number | null
          rating_comment?: string | null
          reference?: string
          reopened_count?: number
          requester_email?: string | null
          requester_name?: string | null
          resolved_at?: string | null
          sla_policy_id?: string | null
          sla_state?: string
          source_email_thread_id?: string | null
          split_from_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          subscription_id?: string | null
          team_id?: string | null
          ticket_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          category?: string
          channel?: string
          closed_at?: string | null
          created_at?: string
          csat_requested_at?: string | null
          description?: string
          due_first_response_at?: string | null
          due_resolution_at?: string | null
          escalated_at?: string | null
          escalation_level?: number
          first_response_at?: string | null
          id?: string
          identity_source?: string | null
          kb_article_ids?: string[]
          last_customer_reply_at?: string | null
          last_reply_at?: string
          last_staff_reply_at?: string | null
          merged_into_id?: string | null
          needs_identity_review?: boolean
          organization_id?: string | null
          paused_at?: string | null
          paused_total_seconds?: number
          priority?: Database["public"]["Enums"]["ticket_priority"]
          rated_at?: string | null
          rated_staff_id?: string | null
          rated_staff_name?: string | null
          rating?: number | null
          rating_comment?: string | null
          reference?: string
          reopened_count?: number
          requester_email?: string | null
          requester_name?: string | null
          resolved_at?: string | null
          sla_policy_id?: string | null
          sla_state?: string
          source_email_thread_id?: string | null
          split_from_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          subscription_id?: string | null
          team_id?: string | null
          ticket_number?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "support_sla_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_source_email_thread_id_fkey"
            columns: ["source_email_thread_id"]
            isOneToOne: false
            referencedRelation: "email_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_split_from_id_fkey"
            columns: ["split_from_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "support_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      system_failures: {
        Row: {
          action: string
          browser: string | null
          created_at: string
          device: string | null
          document_id: string | null
          error_code: string | null
          error_message: string
          http_status: number | null
          id: string
          ip: string | null
          metadata: Json
          organization_id: string | null
          os: string | null
          path: string | null
          ref: string
          search_vector: unknown
          surface: string
          ticket_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          browser?: string | null
          created_at?: string
          device?: string | null
          document_id?: string | null
          error_code?: string | null
          error_message: string
          http_status?: number | null
          id?: string
          ip?: string | null
          metadata?: Json
          organization_id?: string | null
          os?: string | null
          path?: string | null
          ref: string
          search_vector?: unknown
          surface: string
          ticket_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          browser?: string | null
          created_at?: string
          device?: string | null
          document_id?: string | null
          error_code?: string | null
          error_message?: string
          http_status?: number | null
          id?: string
          ip?: string | null
          metadata?: Json
          organization_id?: string | null
          os?: string | null
          path?: string | null
          ref?: string
          search_vector?: unknown
          surface?: string
          ticket_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_failures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          case_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          case_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          created_at: string
          id: string
          metric: string
          organization_id: string
          period_start: string
          updated_at: string
          used: number
        }
        Insert: {
          created_at?: string
          id?: string
          metric: string
          organization_id: string
          period_start: string
          updated_at?: string
          used?: number
        }
        Update: {
          created_at?: string
          id?: string
          metric?: string
          organization_id?: string
          period_start?: string
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notification_preferences: {
        Row: {
          created_at: string
          deadline_1_day: boolean
          deadline_3_days: boolean
          deadline_7_days: boolean
          deadline_same_day: boolean
          email_enabled: boolean
          hearing_1_day: boolean
          hearing_3_days: boolean
          hearing_7_days: boolean
          hearing_same_day: boolean
          id: string
          in_app_enabled: boolean
          inactive_cases: boolean
          organization_id: string
          task_overdue: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deadline_1_day?: boolean
          deadline_3_days?: boolean
          deadline_7_days?: boolean
          deadline_same_day?: boolean
          email_enabled?: boolean
          hearing_1_day?: boolean
          hearing_3_days?: boolean
          hearing_7_days?: boolean
          hearing_same_day?: boolean
          id?: string
          in_app_enabled?: boolean
          inactive_cases?: boolean
          organization_id: string
          task_overdue?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deadline_1_day?: boolean
          deadline_3_days?: boolean
          deadline_7_days?: boolean
          deadline_same_day?: boolean
          email_enabled?: boolean
          hearing_1_day?: boolean
          hearing_3_days?: boolean
          hearing_7_days?: boolean
          hearing_same_day?: boolean
          id?: string
          in_app_enabled?: boolean
          inactive_cases?: boolean
          organization_id?: string
          task_overdue?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notification_preferences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_notification_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          adapter_type: string
          created_at: string
          display_name: string
          id: string
          is_enabled: boolean
          last_error: string | null
          last_event_at: string | null
          notes: string | null
          rate_limit_per_minute: number
          signature_header: string
          signing_secret: string | null
          slug: string
          test_mode: boolean
          timestamp_header: string | null
          updated_at: string
          verification_mode: string
        }
        Insert: {
          adapter_type: string
          created_at?: string
          display_name: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_event_at?: string | null
          notes?: string | null
          rate_limit_per_minute?: number
          signature_header?: string
          signing_secret?: string | null
          slug: string
          test_mode?: boolean
          timestamp_header?: string | null
          updated_at?: string
          verification_mode?: string
        }
        Update: {
          adapter_type?: string
          created_at?: string
          display_name?: string
          id?: string
          is_enabled?: boolean
          last_error?: string | null
          last_event_at?: string | null
          notes?: string | null
          rate_limit_per_minute?: number
          signature_header?: string
          signing_secret?: string | null
          slug?: string
          test_mode?: boolean
          timestamp_header?: string | null
          updated_at?: string
          verification_mode?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          adapter_type: string | null
          attempts: number
          correlation_id: string
          created_at: string
          endpoint_id: string | null
          event_type: string | null
          id: string
          last_error: string | null
          payload_hash: string
          processed_at: string | null
          provider_event_id: string | null
          received_at: string
          redacted_payload: Json
          reject_reason: string | null
          replay_detected: boolean
          request_ip: string | null
          signature_valid: boolean
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          adapter_type?: string | null
          attempts?: number
          correlation_id?: string
          created_at?: string
          endpoint_id?: string | null
          event_type?: string | null
          id?: string
          last_error?: string | null
          payload_hash: string
          processed_at?: string | null
          provider_event_id?: string | null
          received_at?: string
          redacted_payload?: Json
          reject_reason?: string | null
          replay_detected?: boolean
          request_ip?: string | null
          signature_valid?: boolean
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          adapter_type?: string | null
          attempts?: number
          correlation_id?: string
          created_at?: string
          endpoint_id?: string | null
          event_type?: string | null
          id?: string
          last_error?: string | null
          payload_hash?: string
          processed_at?: string | null
          provider_event_id?: string | null
          received_at?: string
          redacted_payload?: Json
          reject_reason?: string | null
          replay_detected?: boolean
          request_ip?: string | null
          signature_valid?: boolean
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_endpoint_id_fkey"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_devices: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          last_synced_at: string
          phone_number: string | null
          provider: string
          provider_device_id: string
          raw_metadata: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          last_synced_at?: string
          phone_number?: string | null
          provider?: string
          provider_device_id: string
          raw_metadata?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          last_synced_at?: string
          phone_number?: string | null
          provider?: string
          provider_device_id?: string
          raw_metadata?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_provider_state: {
        Row: {
          created_at: string
          default_device_id: string | null
          devices_count: number
          is_enabled: boolean
          last_checked_at: string | null
          last_error_code: string | null
          last_error_detail: string | null
          last_synced_at: string | null
          per_org_hourly_limit: number
          per_recipient_hourly_limit: number
          provider: string
          provider_hourly_limit: number
          status: string
          templates_count: number
          test_mode: boolean
          test_phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_device_id?: string | null
          devices_count?: number
          is_enabled?: boolean
          last_checked_at?: string | null
          last_error_code?: string | null
          last_error_detail?: string | null
          last_synced_at?: string | null
          per_org_hourly_limit?: number
          per_recipient_hourly_limit?: number
          provider: string
          provider_hourly_limit?: number
          status?: string
          templates_count?: number
          test_mode?: boolean
          test_phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_device_id?: string | null
          devices_count?: number
          is_enabled?: boolean
          last_checked_at?: string | null
          last_error_code?: string | null
          last_error_detail?: string | null
          last_synced_at?: string | null
          per_org_hourly_limit?: number
          per_recipient_hourly_limit?: number
          provider?: string
          provider_hourly_limit?: number
          status?: string
          templates_count?: number
          test_mode?: boolean
          test_phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          body: string | null
          body_variable_count: number
          button_variable_count: number
          category: string | null
          components: Json
          created_at: string
          id: string
          language: string | null
          last_synced_at: string
          name: string
          provider: string
          provider_device_id: string | null
          provider_template_id: string
          raw_metadata: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          body_variable_count?: number
          button_variable_count?: number
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language?: string | null
          last_synced_at?: string
          name: string
          provider?: string
          provider_device_id?: string | null
          provider_template_id: string
          raw_metadata?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          body_variable_count?: number
          button_variable_count?: number
          category?: string | null
          components?: Json
          created_at?: string
          id?: string
          language?: string | null
          last_synced_at?: string
          name?: string
          provider?: string
          provider_device_id?: string | null
          provider_template_id?: string
          raw_metadata?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      work_item_events: {
        Row: {
          actor_id: string | null
          event: string
          from_due_date: string | null
          from_user_id: string | null
          id: string
          item_id: string
          item_type: string
          metadata: Json
          occurred_at: string
          organization_id: string
          seq: number
          to_due_date: string | null
          to_user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          event: string
          from_due_date?: string | null
          from_user_id?: string | null
          id?: string
          item_id: string
          item_type: string
          metadata?: Json
          occurred_at?: string
          organization_id: string
          seq?: number
          to_due_date?: string | null
          to_user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          event?: string
          from_due_date?: string | null
          from_user_id?: string | null
          id?: string
          item_id?: string
          item_type?: string
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          seq?: number
          to_due_date?: string | null
          to_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_item_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_activity_overview: { Args: never; Returns: Json }
      admin_growth_series: { Args: { _days?: number }; Returns: Json }
      admin_jobs_overview: { Args: never; Returns: Json }
      admin_organization_directory: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _status?: string
        }
        Returns: {
          address: string
          cases_count: number
          city: string
          clients_count: number
          commercial_registration: string
          created_at: string
          documents_count: number
          email: string
          id: string
          is_active: boolean
          lawyers_count: number
          legal_name: string
          name: string
          phone: string
          plan_code: string
          plan_label: string
          storage_bytes: number
          subscription_ends_at: string
          subscription_status: string
          suspended_at: string
          suspension_reason: string
          tax_number: string
          total_count: number
          users_count: number
        }[]
      }
      admin_platform_metrics: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      admin_revenue_summary: { Args: never; Returns: Json }
      admin_service_health: { Args: never; Returns: Json }
      admin_service_usage_summary: { Args: never; Returns: Json }
      admin_user_directory: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _sort?: string
          _status?: string
        }
        Returns: {
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          is_platform_staff: boolean
          org_member_count: number
          organization_id: string
          organization_name: string
          phone: string
          plan_code: string
          plan_label: string
          subscription_ends_at: string
          subscription_status: string
          total_count: number
        }[]
      }
      billing_match_reconciliation: {
        Args: { _entry_id: string; _payment_id: string }
        Returns: undefined
      }
      billing_reopen_period: {
        Args: { _approval_id: string }
        Returns: undefined
      }
      billing_reports: { Args: { _from: string; _to: string }; Returns: Json }
      billing_save_draft: { Args: { _payload: Json }; Returns: string }
      bump_office_page_event: {
        Args: {
          _amount?: number
          _channel?: string
          _kind: string
          _organization_id: string
        }
        Returns: undefined
      }
      claim_notification_batch: {
        Args: { _limit?: number }
        Returns: {
          accepted_at: string | null
          attempts: number
          cancelled_at: string | null
          channel: string
          created_at: string
          event_id: string | null
          event_type: string
          failed_at: string | null
          id: string
          idempotency_key: string
          is_test: boolean
          last_error_code: string | null
          last_error_message: string | null
          latency_ms: number | null
          max_attempts: number
          organization_id: string
          payload: Json
          processing_at: string | null
          provider: string
          provider_device_id: string | null
          provider_template_id: string | null
          recipient_id: string | null
          recipient_phone: string | null
          recipient_type: string
          scheduled_at: string
          status: string
          template_mapping_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notification_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      consume_ocr_pages: {
        Args: { _organization_id: string; _pages: number }
        Returns: {
          allowed: boolean
          monthly_limit: number
          used: number
        }[]
      }
      create_organization_with_owner: {
        Args: {
          _address?: string
          _city?: string
          _commercial_registration?: string
          _email?: string
          _legal_name?: string
          _name: string
          _phone?: string
          _tax_number?: string
        }
        Returns: {
          already_exists: boolean
          organization_id: string
        }[]
      }
      my_case_party_permissions: {
        Args: { _organization_id: string }
        Returns: {
          allowed: boolean
          permission: string
        }[]
      }
      my_profile: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          job_title: string
          mfa_status: string
          phone: string
          phone_verification_status: string
          phone_verified_at: string
          updated_at: string
        }[]
      }
      my_subscription_overview: {
        Args: { _organization_id: string }
        Returns: Json
      }
      next_financial_number: { Args: { _kind: string }; Returns: string }
      normalize_ar: { Args: { _input: string }; Returns: string }
      org_team_contacts: {
        Args: { _organization_id: string }
        Returns: {
          email: string
          phone: string
          user_id: string
        }[]
      }
      print_copy_number: {
        Args: {
          _document_id: string
          _document_ref: string
          _organization_id: string
        }
        Returns: number
      }
      recalc_invoice: { Args: { _invoice_id: string }; Returns: undefined }
      record_metered_usage: {
        Args: { _amount: number; _metric: string; _organization_id: string }
        Returns: number
      }
      search_document_pages: {
        Args: {
          _case_id?: string
          _client_id?: string
          _file_type?: string
          _from?: string
          _limit?: number
          _ocr_only?: boolean
          _offset?: number
          _query: string
          _to?: string
        }
        Returns: {
          case_id: string
          case_title: string
          client_id: string
          client_name: string
          document_created_at: string
          document_id: string
          file_name: string
          file_type: string
          ocr_used: boolean
          page_id: string
          page_number: number
          rank: number
          snippet: string
          total_count: number
        }[]
      }
    }
    Enums: {
      app_role: "owner" | "admin" | "lawyer" | "legal_assistant" | "viewer"
      case_priority: "low" | "medium" | "high" | "urgent"
      case_status:
        | "draft"
        | "open"
        | "in_progress"
        | "waiting"
        | "judgment_issued"
        | "execution"
        | "closed"
        | "archived"
      client_role:
        | "plaintiff"
        | "defendant"
        | "appellant"
        | "respondent"
        | "execution_applicant"
        | "execution_against"
        | "other"
      client_type: "individual" | "company" | "government"
      crm_activity_kind:
        | "meeting"
        | "call"
        | "note"
        | "task"
        | "followup"
        | "email"
      crm_deal_status: "open" | "won" | "lost" | "abandoned"
      crm_entity_kind: "lead" | "company" | "contact" | "deal"
      crm_lead_status:
        | "new"
        | "contacted"
        | "qualified"
        | "unqualified"
        | "converted"
        | "lost"
      deadline_status: "active" | "completed" | "cancelled" | "overdue"
      deadline_type:
        | "objection"
        | "appeal"
        | "response"
        | "submission"
        | "execution"
        | "expert_report"
        | "document_request"
        | "custom"
      document_job_status:
        | "queued"
        | "extracting"
        | "ocr_processing"
        | "indexing"
        | "completed"
        | "failed"
      hearing_status:
        | "scheduled"
        | "completed"
        | "postponed"
        | "cancelled"
        | "missed"
      hr_employment_status:
        | "active"
        | "probation"
        | "on_notice"
        | "suspended"
        | "terminated"
        | "resigned"
      hr_employment_type:
        | "full_time"
        | "part_time"
        | "contract"
        | "intern"
        | "vendor"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      marketing_campaign_status:
        | "draft"
        | "scheduled"
        | "running"
        | "paused"
        | "completed"
        | "cancelled"
      member_status: "active" | "suspended" | "pending"
      platform_role: "super_admin" | "staff"
      platform_staff_status: "active" | "suspended"
      sales_doc_kind: "quote" | "proposal" | "contract"
      sales_doc_status:
        | "draft"
        | "pending_approval"
        | "approved"
        | "sent"
        | "viewed"
        | "accepted"
        | "rejected"
        | "expired"
        | "cancelled"
        | "active"
        | "terminated"
      subscription_status: "active" | "expired" | "cancelled" | "trial"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "overdue"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status:
        | "new"
        | "awaiting_reply"
        | "in_progress"
        | "closed"
        | "pending_internal"
        | "escalated"
        | "resolved"
      update_type:
        | "case_created"
        | "hearing"
        | "memorandum"
        | "document"
        | "call"
        | "meeting"
        | "court_update"
        | "task"
        | "deadline"
        | "judgment"
        | "note"
        | "status_change"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["owner", "admin", "lawyer", "legal_assistant", "viewer"],
      case_priority: ["low", "medium", "high", "urgent"],
      case_status: [
        "draft",
        "open",
        "in_progress",
        "waiting",
        "judgment_issued",
        "execution",
        "closed",
        "archived",
      ],
      client_role: [
        "plaintiff",
        "defendant",
        "appellant",
        "respondent",
        "execution_applicant",
        "execution_against",
        "other",
      ],
      client_type: ["individual", "company", "government"],
      crm_activity_kind: [
        "meeting",
        "call",
        "note",
        "task",
        "followup",
        "email",
      ],
      crm_deal_status: ["open", "won", "lost", "abandoned"],
      crm_entity_kind: ["lead", "company", "contact", "deal"],
      crm_lead_status: [
        "new",
        "contacted",
        "qualified",
        "unqualified",
        "converted",
        "lost",
      ],
      deadline_status: ["active", "completed", "cancelled", "overdue"],
      deadline_type: [
        "objection",
        "appeal",
        "response",
        "submission",
        "execution",
        "expert_report",
        "document_request",
        "custom",
      ],
      document_job_status: [
        "queued",
        "extracting",
        "ocr_processing",
        "indexing",
        "completed",
        "failed",
      ],
      hearing_status: [
        "scheduled",
        "completed",
        "postponed",
        "cancelled",
        "missed",
      ],
      hr_employment_status: [
        "active",
        "probation",
        "on_notice",
        "suspended",
        "terminated",
        "resigned",
      ],
      hr_employment_type: [
        "full_time",
        "part_time",
        "contract",
        "intern",
        "vendor",
      ],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      marketing_campaign_status: [
        "draft",
        "scheduled",
        "running",
        "paused",
        "completed",
        "cancelled",
      ],
      member_status: ["active", "suspended", "pending"],
      platform_role: ["super_admin", "staff"],
      platform_staff_status: ["active", "suspended"],
      sales_doc_kind: ["quote", "proposal", "contract"],
      sales_doc_status: [
        "draft",
        "pending_approval",
        "approved",
        "sent",
        "viewed",
        "accepted",
        "rejected",
        "expired",
        "cancelled",
        "active",
        "terminated",
      ],
      subscription_status: ["active", "expired", "cancelled", "trial"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "pending",
        "in_progress",
        "completed",
        "cancelled",
        "overdue",
      ],
      ticket_priority: ["low", "medium", "high", "urgent"],
      ticket_status: [
        "new",
        "awaiting_reply",
        "in_progress",
        "closed",
        "pending_internal",
        "escalated",
        "resolved",
      ],
      update_type: [
        "case_created",
        "hearing",
        "memorandum",
        "document",
        "call",
        "meeting",
        "court_update",
        "task",
        "deadline",
        "judgment",
        "note",
        "status_change",
      ],
    },
  },
} as const
