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
          ip: string | null
          metadata: Json
          organization_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
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
          sla_hours?: number
          sort_order?: number
          storage_gb?: number | null
          support_level?: string
          updated_at?: string
          voice_enabled?: boolean
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
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
          email: string
          full_name: string
          id: string
          job_title: string | null
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
          email: string
          full_name: string
          id?: string
          job_title?: string | null
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
          email?: string
          full_name?: string
          id?: string
          job_title?: string | null
          permissions?: string[]
          role?: Database["public"]["Enums"]["platform_role"]
          role_id?: string | null
          status?: Database["public"]["Enums"]["platform_staff_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_staff_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "platform_roles"
            referencedColumns: ["id"]
          },
        ]
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
      support_ticket_messages: {
        Row: {
          attachments: Json
          author_id: string | null
          author_name: string
          body: string
          created_at: string
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
          id?: string
          is_staff?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_messages_ticket_id_fkey"
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
          closed_at: string | null
          created_at: string
          description: string
          id: string
          last_reply_at: string
          organization_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          reference: string
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          description: string
          id?: string
          last_reply_at?: string
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reference?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          closed_at?: string | null
          created_at?: string
          description?: string
          id?: string
          last_reply_at?: string
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reference?: string
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_organization_id_fkey"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
      admin_revenue_summary: { Args: never; Returns: Json }
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
      my_subscription_overview: {
        Args: { _organization_id: string }
        Returns: Json
      }
      record_metered_usage: {
        Args: { _amount: number; _metric: string; _organization_id: string }
        Returns: number
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
      platform_role: "super_admin" | "staff"
      platform_staff_status: "active" | "suspended"
      subscription_status: "active" | "expired" | "cancelled" | "trial"
      task_priority: "low" | "medium" | "high" | "urgent"
      task_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "cancelled"
        | "overdue"
      ticket_priority: "low" | "medium" | "high" | "urgent"
      ticket_status: "new" | "awaiting_reply" | "in_progress" | "closed"
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
      platform_role: ["super_admin", "staff"],
      platform_staff_status: ["active", "suspended"],
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
      ticket_status: ["new", "awaiting_reply", "in_progress", "closed"],
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
