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
          created_at: string
          description: string | null
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          organization_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          organization_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          description?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
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
          created_at: string
          email: string | null
          id: string
          legal_role: string | null
          national_id: string | null
          notes: string | null
          organization_id: string
          party_name: string
          party_type: string | null
          phone: string | null
          representative_name: string | null
        }
        Insert: {
          case_id: string
          commercial_registration?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_role?: string | null
          national_id?: string | null
          notes?: string | null
          organization_id: string
          party_name: string
          party_type?: string | null
          phone?: string | null
          representative_name?: string | null
        }
        Update: {
          case_id?: string
          commercial_registration?: string | null
          created_at?: string
          email?: string | null
          id?: string
          legal_role?: string | null
          national_id?: string | null
          notes?: string | null
          organization_id?: string
          party_name?: string
          party_type?: string | null
          phone?: string | null
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
          company_name: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          national_id: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          commercial_registration?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          client_type?: Database["public"]["Enums"]["client_type"]
          commercial_registration?: string | null
          company_name?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
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
          file_type: string | null
          id: string
          is_confidential: boolean
          organization_id: string
          source: string
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
          file_type?: string | null
          id?: string
          is_confidential?: boolean
          organization_id: string
          source?: string
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
          file_type?: string | null
          id?: string
          is_confidential?: boolean
          organization_id?: string
          source?: string
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          job_title: string | null
          phone: string | null
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
          phone?: string | null
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
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      hearing_status:
        | "scheduled"
        | "completed"
        | "postponed"
        | "cancelled"
        | "missed"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      member_status: "active" | "suspended" | "pending"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "overdue"
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
      hearing_status: [
        "scheduled",
        "completed",
        "postponed",
        "cancelled",
        "missed",
      ],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      member_status: ["active", "suspended", "pending"],
      task_priority: ["low", "medium", "high", "urgent"],
      task_status: [
        "pending",
        "in_progress",
        "completed",
        "cancelled",
        "overdue",
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
