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
          file_name: string
          id: string
          message_id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name: string
          id?: string
          message_id: string
          mime_type: string
          size_bytes?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string
          id?: string
          message_id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
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
          created_at: string
          department_id: string | null
          display_name: string
          id: string
          inbound_enabled: boolean
          is_active: boolean
          is_shared: boolean
          provider: string
          signature_html: string | null
          sort_order: number
          type: string
          updated_at: string
        }
        Insert: {
          address: string
          created_at?: string
          department_id?: string | null
          display_name: string
          id?: string
          inbound_enabled?: boolean
          is_active?: boolean
          is_shared?: boolean
          provider?: string
          signature_html?: string | null
          sort_order?: number
          type?: string
          updated_at?: string
        }
        Update: {
          address?: string
          created_at?: string
          department_id?: string | null
          display_name?: string
          id?: string
          inbound_enabled?: boolean
          is_active?: boolean
          is_shared?: boolean
          provider?: string
          signature_html?: string | null
          sort_order?: number
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
          rated_at: string | null
          rated_staff_id: string | null
          rated_staff_name: string | null
          rating: number | null
          rating_comment: string | null
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
          rated_at?: string | null
          rated_staff_id?: string | null
          rated_staff_name?: string | null
          rating?: number | null
          rating_comment?: string | null
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
          rated_at?: string | null
          rated_staff_id?: string | null
          rated_staff_name?: string | null
          rating?: number | null
          rating_comment?: string | null
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
      admin_platform_metrics: {
        Args: { _from: string; _to: string }
        Returns: Json
      }
      admin_revenue_summary: { Args: never; Returns: Json }
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
      my_subscription_overview: {
        Args: { _organization_id: string }
        Returns: Json
      }
      next_financial_number: { Args: { _kind: string }; Returns: string }
      normalize_ar: { Args: { _input: string }; Returns: string }
      print_copy_number: {
        Args: {
          _document_id: string
          _document_ref: string
          _organization_id: string
        }
        Returns: number
      }
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
