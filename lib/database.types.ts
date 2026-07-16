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
    PostgrestVersion: "14.1"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounting_books: {
        Row: {
          amount: number
          created_at: string
          id: string
          organization_id: string
          reference_msg_id: string
          trip_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          organization_id: string
          reference_msg_id: string
          trip_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          organization_id?: string
          reference_msg_id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounting_books_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_reference_msg_id_fkey"
            columns: ["reference_msg_id"]
            isOneToOne: true
            referencedRelation: "trip_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_reference_msg_id_fkey"
            columns: ["reference_msg_id"]
            isOneToOne: true
            referencedRelation: "trip_messages_archive_candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounting_books_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      activity_stream: {
        Row: {
          activity_type: string
          actor_id: string
          actor_name: string | null
          actor_type: string
          context_payload: Json
          created_at: string
          id: string
          is_public: boolean
          org_id: string | null
          target_id: string
          target_name: string | null
          target_ref: string | null
          target_type: string
        }
        Insert: {
          activity_type: string
          actor_id: string
          actor_name?: string | null
          actor_type: string
          context_payload?: Json
          created_at?: string
          id?: string
          is_public?: boolean
          org_id?: string | null
          target_id: string
          target_name?: string | null
          target_ref?: string | null
          target_type: string
        }
        Update: {
          activity_type?: string
          actor_id?: string
          actor_name?: string | null
          actor_type?: string
          context_payload?: Json
          created_at?: string
          id?: string
          is_public?: boolean
          org_id?: string | null
          target_id?: string
          target_name?: string | null
          target_ref?: string | null
          target_type?: string
        }
        Relationships: []
      }
      ai_settings: {
        Row: {
          auto_assign_vehicle: boolean
          auto_enforce_credit: boolean
          auto_flag_risk: boolean
          auto_post_ocr: boolean
          id: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          auto_assign_vehicle?: boolean
          auto_enforce_credit?: boolean
          auto_flag_risk?: boolean
          auto_post_ocr?: boolean
          id?: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          auto_assign_vehicle?: boolean
          auto_enforce_credit?: boolean
          auto_flag_risk?: boolean
          auto_post_ocr?: boolean
          id?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      b2b_operations_dismissals: {
        Row: {
          alert_key: string
          dismissed_at: string
          organization_id: string
        }
        Insert: {
          alert_key: string
          dismissed_at?: string
          organization_id: string
        }
        Update: {
          alert_key?: string
          dismissed_at?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_operations_dismissals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "b2b_operations_dismissals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      bids: {
        Row: {
          amount: number
          bidder_organization_id: string
          bidder_user_id: string
          created_at: string
          id: string
          note: string | null
          post_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          bidder_organization_id: string
          bidder_user_id: string
          created_at?: string
          id?: string
          note?: string | null
          post_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bidder_organization_id?: string
          bidder_user_id?: string
          created_at?: string
          id?: string
          note?: string | null
          post_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bids_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bids_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      branding_settings: {
        Row: {
          company_name: string | null
          id: string
          logo_url: string | null
          org_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          id?: string
          logo_url?: string | null
          org_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          id?: string
          logo_url?: string | null
          org_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branding_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branding_settings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_attachments: {
        Row: {
          created_at: string
          id: string
          message_id: string
          metadata: Json
          mime_type: string | null
          size_bytes: number | null
          storage_bucket: string
          storage_path: string
          upload_status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          metadata?: Json
          mime_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path: string
          upload_status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          metadata?: Json
          mime_type?: string | null
          size_bytes?: number | null
          storage_bucket?: string
          storage_path?: string
          upload_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_audit_log: {
        Row: {
          action: string
          actor_user_id: string | null
          conversation_id: string | null
          created_at: string
          id: number
          message_id: string | null
          organization_id: string
          payload: Json
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: never
          message_id?: string | null
          organization_id: string
          payload?: Json
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: never
          message_id?: string | null
          organization_id?: string
          payload?: Json
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          channel_key?: string | null
          client_id?: string | null
          conversation_type: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          legacy_network_conversation_id?: string | null
          legacy_trip_conversation_id?: string | null
          message_count?: number
          metadata?: Json
          organization_id: string
          supplier_id?: string | null
          title?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          channel_key?: string | null
          client_id?: string | null
          conversation_type?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string | null
          id?: string
          is_archived?: boolean
          last_message_at?: string | null
          last_message_preview?: string | null
          legacy_network_conversation_id?: string | null
          legacy_trip_conversation_id?: string | null
          message_count?: number
          metadata?: Json
          organization_id?: string
          supplier_id?: string | null
          title?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "chat_conversations_legacy_network_conversation_id_fkey"
            columns: ["legacy_network_conversation_id"]
            isOneToOne: true
            referencedRelation: "network_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_legacy_trip_conversation_id_fkey"
            columns: ["legacy_trip_conversation_id"]
            isOneToOne: true
            referencedRelation: "trip_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      chat_mentions: {
        Row: {
          created_at: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_mentions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }
        Insert: {
          client_message_id?: string | null
          content?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          legacy_source?: string | null
          message_type?: string
          metadata?: Json
          organization_id: string
          reply_to_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Update: {
          client_message_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          legacy_source?: string | null
          message_type?: string
          metadata?: Json
          organization_id?: string
          reply_to_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages_archive: {
        Row: {
          archived_at: string
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }
        Insert: {
          archived_at?: string
          client_message_id?: string | null
          content?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          legacy_source?: string | null
          message_type?: string
          metadata?: Json
          organization_id: string
          reply_to_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Update: {
          archived_at?: string
          client_message_id?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          legacy_source?: string | null
          message_type?: string
          metadata?: Json
          organization_id?: string
          reply_to_id?: string | null
          sender_name?: string
          sender_role?: string | null
          sender_type?: string
          sender_user_id?: string | null
        }
        Relationships: []
      }
      chat_participants: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          muted_until: string | null
          participant_role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          muted_until?: string | null
          participant_role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          muted_until?: string | null
          participant_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_pins: {
        Row: {
          conversation_id: string
          message_id: string
          pinned_at: string
          pinned_by: string | null
        }
        Insert: {
          conversation_id: string
          message_id: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Update: {
          conversation_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_pins_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_pins_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_push_outbox: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: number
          message_id: string
          organization_id: string
          payload: Json
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string
          conversation_id: string
          created_at?: string
          id?: never
          message_id: string
          organization_id: string
          payload?: Json
          sent_at?: string | null
          title?: string
          user_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: never
          message_id?: string
          organization_id?: string
          payload?: Json
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_push_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_push_outbox_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_read_receipts: {
        Row: {
          delivered_at: string | null
          message_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          delivered_at?: string | null
          message_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          delivered_at?: string | null
          message_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_read_receipts_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      client_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          client_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          field_name: string | null
          id: string
          new_value: string | null
          old_value: string | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          client_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          client_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          field_name?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_audit_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contacts: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          designation: string | null
          email: string | null
          id: string
          is_billing: boolean
          is_decision_maker: boolean
          is_dispatch: boolean
          is_finance: boolean
          is_operations: boolean
          is_primary: boolean
          is_procurement: boolean
          mobile: string | null
          name: string
          notes: string | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_billing?: boolean
          is_decision_maker?: boolean
          is_dispatch?: boolean
          is_finance?: boolean
          is_operations?: boolean
          is_primary?: boolean
          is_procurement?: boolean
          mobile?: string | null
          name: string
          notes?: string | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_billing?: boolean
          is_decision_maker?: boolean
          is_dispatch?: boolean
          is_finance?: boolean
          is_operations?: boolean
          is_primary?: boolean
          is_procurement?: boolean
          mobile?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_agreements: {
        Row: {
          claims_terms: Json | null
          client_id: string
          commercial_model: string | null
          contract_number: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          detention_terms: Json | null
          effective_date: string | null
          escalation_matrix: Json | null
          expiry_date: string | null
          general_terms: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_terms: Json | null
          penalty_clauses: Json | null
          renewal_date: string | null
          signed_storage_path: string | null
          status: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          claims_terms?: Json | null
          client_id: string
          commercial_model?: string | null
          contract_number: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detention_terms?: Json | null
          effective_date?: string | null
          escalation_matrix?: Json | null
          expiry_date?: string | null
          general_terms?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_terms?: Json | null
          penalty_clauses?: Json | null
          renewal_date?: string | null
          signed_storage_path?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          claims_terms?: Json | null
          client_id?: string
          commercial_model?: string | null
          contract_number?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          detention_terms?: Json | null
          effective_date?: string | null
          escalation_matrix?: Json | null
          expiry_date?: string | null
          general_terms?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: Json | null
          penalty_clauses?: Json | null
          renewal_date?: string | null
          signed_storage_path?: string | null
          status?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_agreements_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contract_versions: {
        Row: {
          agreement_id: string
          created_at: string
          effective_date: string | null
          file_name: string | null
          id: string
          notes: string | null
          organization_id: string
          storage_path: string
          uploaded_by: string | null
          version_number: number
        }
        Insert: {
          agreement_id: string
          created_at?: string
          effective_date?: string | null
          file_name?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          storage_path: string
          uploaded_by?: string | null
          version_number?: number
        }
        Update: {
          agreement_id?: string
          created_at?: string
          effective_date?: string | null
          file_name?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          storage_path?: string
          uploaded_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_contract_versions_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "client_contract_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contract_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_contracts: {
        Row: {
          billing_to_hq: boolean | null
          client_id: string
          created_at: string
          deleted_at: string | null
          drop_location: string
          id: string
          notes: string | null
          organization_id: string
          pickup_area: string
          rate: number | null
          rate_type: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
          warehouse_id: string | null
        }
        Insert: {
          billing_to_hq?: boolean | null
          client_id: string
          created_at?: string
          deleted_at?: string | null
          drop_location: string
          id?: string
          notes?: string | null
          organization_id: string
          pickup_area: string
          rate?: number | null
          rate_type?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          warehouse_id?: string | null
        }
        Update: {
          billing_to_hq?: boolean | null
          client_id?: string
          created_at?: string
          deleted_at?: string | null
          drop_location?: string
          id?: string
          notes?: string | null
          organization_id?: string
          pickup_area?: string
          rate?: number | null
          rate_type?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_contracts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_type: string | null
          expiry_date: string | null
          file_name: string | null
          folder: string | null
          id: string
          mime_type: string | null
          notes: string | null
          organization_id: string
          storage_path: string | null
          title: string
          updated_at: string
          updated_by: string | null
          version_number: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_type?: string | null
          expiry_date?: string | null
          file_name?: string | null
          folder?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          storage_path?: string | null
          title: string
          updated_at?: string
          updated_by?: string | null
          version_number?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_type?: string | null
          expiry_date?: string | null
          file_name?: string | null
          folder?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          storage_path?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_finance_profiles: {
        Row: {
          aging_0_30: number | null
          aging_31_60: number | null
          aging_61_90: number | null
          aging_90_plus: number | null
          billing_cycle: string | null
          client_id: string
          created_at: string
          created_by: string | null
          credit_days: number | null
          credit_limit: number | null
          dso_target_days: number | null
          id: string
          invoice_frequency: string | null
          notes: string | null
          opening_balance: number | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          aging_0_30?: number | null
          aging_31_60?: number | null
          aging_61_90?: number | null
          aging_90_plus?: number | null
          billing_cycle?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          dso_target_days?: number | null
          id?: string
          invoice_frequency?: string | null
          notes?: string | null
          opening_balance?: number | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          aging_0_30?: number | null
          aging_31_60?: number | null
          aging_61_90?: number | null
          aging_90_plus?: number | null
          billing_cycle?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          credit_days?: number | null
          credit_limit?: number | null
          dso_target_days?: number | null
          id?: string
          invoice_frequency?: string | null
          notes?: string | null
          opening_balance?: number | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_finance_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_finance_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_finance_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_kyc_documents: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          expiry_date: string | null
          file_name: string | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          notes: string | null
          organization_id: string
          status: string | null
          storage_path: string | null
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_label?: string | null
          doc_type: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          status?: string | null
          storage_path?: string | null
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_label?: string | null
          doc_type?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          status?: string | null
          storage_path?: string | null
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_kyc_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_lane_rates: {
        Row: {
          agreement_id: string | null
          base_rate: number | null
          client_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          destination_address: string | null
          destination_gstin: string | null
          destination_label: string
          destination_warehouse_id: string | null
          detention_included: boolean | null
          distance_km: number | null
          fuel_clause: string | null
          id: string
          is_spot_rate: boolean
          min_billing: number | null
          notes: string | null
          organization_id: string
          origin_label: string
          origin_warehouse_id: string | null
          per_km_rate: number | null
          per_mt_rate: number | null
          pricing_model: string | null
          rate: number | null
          rate_type: string | null
          toll_included: boolean | null
          updated_at: string
          updated_by: string | null
          valid_from: string | null
          valid_to: string | null
          vehicle_type: string | null
          warehouse_zone: string | null
        }
        Insert: {
          agreement_id?: string | null
          base_rate?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_address?: string | null
          destination_gstin?: string | null
          destination_label: string
          destination_warehouse_id?: string | null
          detention_included?: boolean | null
          distance_km?: number | null
          fuel_clause?: string | null
          id?: string
          is_spot_rate?: boolean
          min_billing?: number | null
          notes?: string | null
          organization_id: string
          origin_label: string
          origin_warehouse_id?: string | null
          per_km_rate?: number | null
          per_mt_rate?: number | null
          pricing_model?: string | null
          rate?: number | null
          rate_type?: string | null
          toll_included?: boolean | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_type?: string | null
          warehouse_zone?: string | null
        }
        Update: {
          agreement_id?: string | null
          base_rate?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          destination_address?: string | null
          destination_gstin?: string | null
          destination_label?: string
          destination_warehouse_id?: string | null
          detention_included?: boolean | null
          distance_km?: number | null
          fuel_clause?: string | null
          id?: string
          is_spot_rate?: boolean
          min_billing?: number | null
          notes?: string | null
          organization_id?: string
          origin_label?: string
          origin_warehouse_id?: string | null
          per_km_rate?: number | null
          per_mt_rate?: number | null
          pricing_model?: string | null
          rate?: number | null
          rate_type?: string | null
          toll_included?: boolean | null
          updated_at?: string
          updated_by?: string | null
          valid_from?: string | null
          valid_to?: string | null
          vehicle_type?: string | null
          warehouse_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_lane_rates_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "client_contract_agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_destination_warehouse_id_fkey"
            columns: ["destination_warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_lane_rates_origin_warehouse_id_fkey"
            columns: ["origin_warehouse_id"]
            isOneToOne: false
            referencedRelation: "client_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      client_risk_scores: {
        Row: {
          client_id: string
          id: string
          last_updated: string
          organization_id: string
          predicted_delay: number
          risk_score: number
        }
        Insert: {
          client_id: string
          id?: string
          last_updated?: string
          organization_id: string
          predicted_delay?: number
          risk_score?: number
        }
        Update: {
          client_id?: string
          id?: string
          last_updated?: string
          organization_id?: string
          predicted_delay?: number
          risk_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_risk_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_risk_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_warehouses: {
        Row: {
          address: string | null
          billing_address: string | null
          capacity_tons: number | null
          city: string | null
          client_id: string
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          dock_count: number | null
          handling_equipment: string | null
          id: string
          latitude: number | null
          loading_type: string | null
          local_gstin: string | null
          longitude: number | null
          manager_name: string | null
          manager_phone: string | null
          name: string
          operating_hours: string | null
          ops_contact: string | null
          organization_id: string
          pincode: string | null
          security_contact: string | null
          state: string | null
          unloading_type: string | null
          updated_at: string
          updated_by: string | null
          warehouse_code: string | null
          warehouse_zone: string | null
        }
        Insert: {
          address?: string | null
          billing_address?: string | null
          capacity_tons?: number | null
          city?: string | null
          client_id: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dock_count?: number | null
          handling_equipment?: string | null
          id?: string
          latitude?: number | null
          loading_type?: string | null
          local_gstin?: string | null
          longitude?: number | null
          manager_name?: string | null
          manager_phone?: string | null
          name: string
          operating_hours?: string | null
          ops_contact?: string | null
          organization_id: string
          pincode?: string | null
          security_contact?: string | null
          state?: string | null
          unloading_type?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_code?: string | null
          warehouse_zone?: string | null
        }
        Update: {
          address?: string | null
          billing_address?: string | null
          capacity_tons?: number | null
          city?: string | null
          client_id?: string
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          dock_count?: number | null
          handling_equipment?: string | null
          id?: string
          latitude?: number | null
          loading_type?: string | null
          local_gstin?: string | null
          longitude?: number | null
          manager_name?: string | null
          manager_phone?: string | null
          name?: string
          operating_hours?: string | null
          ops_contact?: string | null
          organization_id?: string
          pincode?: string | null
          security_contact?: string | null
          state?: string | null
          unloading_type?: string | null
          updated_at?: string
          updated_by?: string | null
          warehouse_code?: string | null
          warehouse_zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_warehouses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          annual_revenue: number | null
          avatar_seed: string | null
          avatar_url: string | null
          billing_address: string | null
          billing_contact_email: string | null
          billing_contact_name: string | null
          billing_contact_phone: string | null
          cin: string | null
          client_code: string | null
          client_status: string | null
          commodity_types: string[] | null
          contact_percent: string | null
          contact_person: string | null
          corporate_address: string | null
          country: string | null
          created_at: string | null
          created_by: string | null
          deleted_at: string | null
          display_id: string | null
          email: string | null
          expected_monthly_loads: number | null
          gstin: string | null
          hq_address: string | null
          id: string
          iec_number: string | null
          industry: string | null
          invoice_frequency_label: string | null
          is_integrated: boolean | null
          kam_email: string | null
          kam_name: string | null
          kam_phone: string | null
          legal_name: string | null
          linked_organization_id: string | null
          msme_number: string | null
          name: string
          notes: string | null
          operating_regions: string[] | null
          organization_id: string
          owner_full_name: string | null
          pan_number: string | null
          payment_terms_label: string | null
          phone: string
          potential_volume: number | null
          projected_contract_revenue: number | null
          registered_address: string | null
          state: string | null
          status: string
          tan_number: string | null
          trade_name: string | null
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          annual_revenue?: number | null
          avatar_seed?: string | null
          avatar_url?: string | null
          billing_address?: string | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          cin?: string | null
          client_code?: string | null
          client_status?: string | null
          commodity_types?: string[] | null
          contact_percent?: string | null
          contact_person?: string | null
          corporate_address?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          display_id?: string | null
          email?: string | null
          expected_monthly_loads?: number | null
          gstin?: string | null
          hq_address?: string | null
          id?: string
          iec_number?: string | null
          industry?: string | null
          invoice_frequency_label?: string | null
          is_integrated?: boolean | null
          kam_email?: string | null
          kam_name?: string | null
          kam_phone?: string | null
          legal_name?: string | null
          linked_organization_id?: string | null
          msme_number?: string | null
          name: string
          notes?: string | null
          operating_regions?: string[] | null
          organization_id: string
          owner_full_name?: string | null
          pan_number?: string | null
          payment_terms_label?: string | null
          phone: string
          potential_volume?: number | null
          projected_contract_revenue?: number | null
          registered_address?: string | null
          state?: string | null
          status?: string
          tan_number?: string | null
          trade_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          annual_revenue?: number | null
          avatar_seed?: string | null
          avatar_url?: string | null
          billing_address?: string | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          cin?: string | null
          client_code?: string | null
          client_status?: string | null
          commodity_types?: string[] | null
          contact_percent?: string | null
          contact_person?: string | null
          corporate_address?: string | null
          country?: string | null
          created_at?: string | null
          created_by?: string | null
          deleted_at?: string | null
          display_id?: string | null
          email?: string | null
          expected_monthly_loads?: number | null
          gstin?: string | null
          hq_address?: string | null
          id?: string
          iec_number?: string | null
          industry?: string | null
          invoice_frequency_label?: string | null
          is_integrated?: boolean | null
          kam_email?: string | null
          kam_name?: string | null
          kam_phone?: string | null
          legal_name?: string | null
          linked_organization_id?: string | null
          msme_number?: string | null
          name?: string
          notes?: string | null
          operating_regions?: string[] | null
          organization_id?: string
          owner_full_name?: string | null
          pan_number?: string | null
          payment_terms_label?: string | null
          phone?: string
          potential_volume?: number | null
          projected_contract_revenue?: number | null
          registered_address?: string | null
          state?: string | null
          status?: string
          tan_number?: string | null
          trade_name?: string | null
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_linked_organization_id_fkey"
            columns: ["linked_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_linked_organization_id_fkey"
            columns: ["linked_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_requests: {
        Row: {
          created_at: string | null
          from_organization_id: string
          id: string
          note: string | null
          request_carrier_supplier: boolean
          request_shipper_client: boolean
          responded_at: string | null
          responded_by: string | null
          status: string
          to_organization_id: string
        }
        Insert: {
          created_at?: string | null
          from_organization_id: string
          id?: string
          note?: string | null
          request_carrier_supplier?: boolean
          request_shipper_client?: boolean
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_organization_id: string
        }
        Update: {
          created_at?: string | null
          from_organization_id?: string
          id?: string
          note?: string | null
          request_carrier_supplier?: boolean
          request_shipper_client?: boolean
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_requests_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_to_organization_id_fkey"
            columns: ["to_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_requests_to_organization_id_fkey"
            columns: ["to_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparty_resolutions: {
        Row: {
          counterparty_name: string
          counterparty_type: string
          dismissed: boolean
          id: string
          matched_org_id: string | null
          org_id: string
          resolved_at: string
          resolved_by_user_id: string
        }
        Insert: {
          counterparty_name: string
          counterparty_type: string
          dismissed?: boolean
          id?: string
          matched_org_id?: string | null
          org_id: string
          resolved_at?: string
          resolved_by_user_id: string
        }
        Update: {
          counterparty_name?: string
          counterparty_type?: string
          dismissed?: boolean
          id?: string
          matched_org_id?: string | null
          org_id?: string
          resolved_at?: string
          resolved_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "counterparty_resolutions_matched_org_id_fkey"
            columns: ["matched_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_resolutions_matched_org_id_fkey"
            columns: ["matched_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_resolutions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_resolutions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_resolutions_resolved_by_user_id_fkey"
            columns: ["resolved_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_quotes: {
        Row: {
          amount: number
          bidder_organization_id: string
          created_at: string | null
          driver_id: string | null
          id: string
          indent_id: string
          notes: string | null
          status: string
          updated_at: string | null
          vehicle_id: string | null
        }
        Insert: {
          amount: number
          bidder_organization_id: string
          created_at?: string | null
          driver_id?: string | null
          id?: string
          indent_id: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Update: {
          amount?: number
          bidder_organization_id?: string
          created_at?: string | null
          driver_id?: string | null
          id?: string
          indent_id?: string
          notes?: string | null
          status?: string
          updated_at?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_quotes_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_bidder_organization_id_fkey"
            columns: ["bidder_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "direct_quotes_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_quotes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      dispute: {
        Row: {
          created_at: string | null
          evidence_url: string | null
          id: string
          internal_snapshot: number
          partner_org_id: string
          partner_snapshot: number
          proposed_amount: number | null
          raised_by_org_id: string
          raised_paid: number | null
          raised_sales: number | null
          reason_code: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          transaction_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          evidence_url?: string | null
          id?: string
          internal_snapshot?: number
          partner_org_id: string
          partner_snapshot?: number
          proposed_amount?: number | null
          raised_by_org_id: string
          raised_paid?: number | null
          raised_sales?: number | null
          reason_code?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          transaction_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          evidence_url?: string | null
          id?: string
          internal_snapshot?: number
          partner_org_id?: string
          partner_snapshot?: number
          proposed_amount?: number | null
          raised_by_org_id?: string
          raised_paid?: number | null
          raised_sales?: number | null
          reason_code?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          transaction_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_raised_by_org_id_fkey"
            columns: ["raised_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_raised_by_org_id_fkey"
            columns: ["raised_by_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      document_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          document_id: string | null
          entity_id: string
          entity_type: string
          id: string
          metadata: Json | null
          new_status: string | null
          notes: string | null
          old_status: string | null
          organization_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          document_id?: string | null
          entity_id: string
          entity_type: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          organization_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          document_id?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          metadata?: Json | null
          new_status?: string | null
          notes?: string | null
          old_status?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_audit_log_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "entity_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_invites: {
        Row: {
          commission_per_km: number | null
          commission_percent: number | null
          created_at: string | null
          deleted_at: string | null
          from_org_name: string | null
          from_organization_id: string
          id: string
          invitee_name: string | null
          payable_amount: number | null
          responded_at: string | null
          responded_by: string | null
          status: string
          to_user_id: string
        }
        Insert: {
          commission_per_km?: number | null
          commission_percent?: number | null
          created_at?: string | null
          deleted_at?: string | null
          from_org_name?: string | null
          from_organization_id: string
          id?: string
          invitee_name?: string | null
          payable_amount?: number | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_user_id: string
        }
        Update: {
          commission_per_km?: number | null
          commission_percent?: number | null
          created_at?: string | null
          deleted_at?: string | null
          from_org_name?: string | null
          from_organization_id?: string
          id?: string
          invitee_name?: string | null
          payable_amount?: number | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          to_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_invites_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_invites_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_ledger: {
        Row: {
          amount: number
          balance_after: number | null
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          driver_id: string
          id: string
          organization_id: string
          reference_id: string | null
          reference_type: string | null
          trip_id: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          driver_id: string
          id?: string
          organization_id: string
          reference_id?: string | null
          reference_type?: string | null
          trip_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          driver_id?: string
          id?: string
          organization_id?: string
          reference_id?: string | null
          reference_type?: string | null
          trip_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_ledger_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_ledger_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          address_label: string | null
          driver_id: string
          id: string
          latitude: number
          longitude: number
          odometer_km: number | null
          organization_id: string
          recorded_at: string
          source: string
          trip_id: string | null
        }
        Insert: {
          accuracy?: number | null
          address_label?: string | null
          driver_id: string
          id?: string
          latitude: number
          longitude: number
          odometer_km?: number | null
          organization_id: string
          recorded_at?: string
          source?: string
          trip_id?: string | null
        }
        Update: {
          accuracy?: number | null
          address_label?: string | null
          driver_id?: string
          id?: string
          latitude?: number
          longitude?: number
          odometer_km?: number | null
          organization_id?: string
          recorded_at?: string
          source?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      driver_presence: {
        Row: {
          accuracy: number | null
          driver_id: string
          heading: number | null
          latitude: number
          longitude: number
          organization_id: string
          recorded_at: string
          session_id: string | null
          speed_kmh: number | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          accuracy?: number | null
          driver_id: string
          heading?: number | null
          latitude: number
          longitude: number
          organization_id: string
          recorded_at?: string
          session_id?: string | null
          speed_kmh?: number | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          accuracy?: number | null
          driver_id?: string
          heading?: number | null
          latitude?: number
          longitude?: number
          organization_id?: string
          recorded_at?: string
          session_id?: string | null
          speed_kmh?: number | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_presence_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_presence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_presence_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      driver_profiles: {
        Row: {
          created_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          id: string
          insurance_expiry: string | null
          insurance_photo_url: string | null
          languages: string[] | null
          license_expiry: string | null
          license_number: string | null
          license_photo_url: string | null
          license_type: string | null
          preferred_areas: string[] | null
          preferred_vehicle_types: string[] | null
          updated_at: string | null
          user_id: string
          vehicle_registration: string | null
          vehicle_registration_expiry: string | null
          vehicle_registration_photo_url: string | null
          years_of_experience: number | null
        }
        Insert: {
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_photo_url?: string | null
          languages?: string[] | null
          license_expiry?: string | null
          license_number?: string | null
          license_photo_url?: string | null
          license_type?: string | null
          preferred_areas?: string[] | null
          preferred_vehicle_types?: string[] | null
          updated_at?: string | null
          user_id: string
          vehicle_registration?: string | null
          vehicle_registration_expiry?: string | null
          vehicle_registration_photo_url?: string | null
          years_of_experience?: number | null
        }
        Update: {
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_photo_url?: string | null
          languages?: string[] | null
          license_expiry?: string | null
          license_number?: string | null
          license_photo_url?: string | null
          license_type?: string | null
          preferred_areas?: string[] | null
          preferred_vehicle_types?: string[] | null
          updated_at?: string | null
          user_id?: string
          vehicle_registration?: string | null
          vehicle_registration_expiry?: string | null
          vehicle_registration_photo_url?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      driver_salary_requests: {
        Row: {
          amount: number
          cash_entry_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          driver_id: string
          id: string
          note: string | null
          organization_id: string
          request_type: string
          salary_month: string | null
          status: string
          trip_ids: string[] | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          cash_entry_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          driver_id: string
          id?: string
          note?: string | null
          organization_id: string
          request_type: string
          salary_month?: string | null
          status?: string
          trip_ids?: string[] | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          cash_entry_id?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          driver_id?: string
          id?: string
          note?: string | null
          organization_id?: string
          request_type?: string
          salary_month?: string | null
          status?: string
          trip_ids?: string[] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_salary_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_salary_requests_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_salary_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_salary_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_signup_matches: {
        Row: {
          acted_at: string | null
          acted_by: string | null
          detected_at: string
          driver_id: string
          id: string
          matched_user_id: string
          metadata: Json
          organization_id: string
          phone_canonical: string
          source: string
          state: string
        }
        Insert: {
          acted_at?: string | null
          acted_by?: string | null
          detected_at?: string
          driver_id: string
          id?: string
          matched_user_id: string
          metadata?: Json
          organization_id: string
          phone_canonical: string
          source?: string
          state?: string
        }
        Update: {
          acted_at?: string | null
          acted_by?: string | null
          detected_at?: string
          driver_id?: string
          id?: string
          matched_user_id?: string
          metadata?: Json
          organization_id?: string
          phone_canonical?: string
          source?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "driver_signup_matches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_signup_matches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_signup_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_signup_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_tenures: {
        Row: {
          created_at: string
          driver_id: string
          id: string
          joined_at: string
          left_at: string | null
          organization_id: string
          trip_count: number | null
        }
        Insert: {
          created_at?: string
          driver_id: string
          id?: string
          joined_at: string
          left_at?: string | null
          organization_id: string
          trip_count?: number | null
        }
        Update: {
          created_at?: string
          driver_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          organization_id?: string
          trip_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_tenures_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_tenures_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "driver_tenures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_tenures_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_trip_counters: {
        Row: {
          driver_id: string
          trip_seq: number
        }
        Insert: {
          driver_id: string
          trip_seq?: number
        }
        Update: {
          driver_id?: string
          trip_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "driver_trip_counters_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "driver_trip_counters_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: true
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
        ]
      }
      drivers: {
        Row: {
          assigned_vehicle_id: string | null
          avatar_seed: string | null
          avatar_url: string | null
          commission_per_km: number | null
          commission_percent: number | null
          created_at: string | null
          deleted_at: string | null
          driver_code: string | null
          email: string | null
          emergency_contact: string | null
          emergency_name: string | null
          hired_at: string
          id: string
          left_at: string | null
          license_number: string | null
          name: string
          organization_id: string
          payable_amount: number | null
          phone: string | null
          status: string
          tracking_only: boolean
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          assigned_vehicle_id?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          commission_per_km?: number | null
          commission_percent?: number | null
          created_at?: string | null
          deleted_at?: string | null
          driver_code?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_name?: string | null
          hired_at?: string
          id?: string
          left_at?: string | null
          license_number?: string | null
          name: string
          organization_id: string
          payable_amount?: number | null
          phone?: string | null
          status?: string
          tracking_only?: boolean
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          assigned_vehicle_id?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          commission_per_km?: number | null
          commission_percent?: number | null
          created_at?: string | null
          deleted_at?: string | null
          driver_code?: string | null
          email?: string | null
          emergency_contact?: string | null
          emergency_name?: string | null
          hired_at?: string
          id?: string
          left_at?: string | null
          license_number?: string | null
          name?: string
          organization_id?: string
          payable_amount?: number | null
          phone?: string | null
          status?: string
          tracking_only?: boolean
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_drivers_assigned_vehicle"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_documents: {
        Row: {
          created_at: string
          created_by: string | null
          doc_label: string | null
          doc_number: string | null
          doc_type: string
          entity_id: string
          entity_type: string
          expiry_date: string | null
          id: string
          issued_by: string | null
          issued_date: string | null
          notes: string | null
          organization_id: string
          replaced_by_id: string | null
          status: string
          storage_path: string | null
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          doc_label?: string | null
          doc_number?: string | null
          doc_type: string
          entity_id: string
          entity_type: string
          expiry_date?: string | null
          id?: string
          issued_by?: string | null
          issued_date?: string | null
          notes?: string | null
          organization_id: string
          replaced_by_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          doc_label?: string | null
          doc_number?: string | null
          doc_type?: string
          entity_id?: string
          entity_type?: string
          expiry_date?: string | null
          id?: string
          issued_by?: string | null
          issued_date?: string | null
          notes?: string | null
          organization_id?: string
          replaced_by_id?: string | null
          status?: string
          storage_path?: string | null
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entity_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_documents_replaced_by_id_fkey"
            columns: ["replaced_by_id"]
            isOneToOne: false
            referencedRelation: "entity_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_identity_anchors: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          global_ref: string | null
          legacy_ref: string | null
          network_ref: string | null
          org_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          global_ref?: string | null
          legacy_ref?: string | null
          network_ref?: string | null
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          global_ref?: string | null
          legacy_ref?: string | null
          network_ref?: string | null
          org_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      event_dead_letter: {
        Row: {
          attempt_count: number
          created_at: string
          destination: string
          event_id: string
          failure_reason: string
          id: string
          original_id: string
          payload: Json
          resolution_note: string | null
          resolved_at: string | null
        }
        Insert: {
          attempt_count: number
          created_at?: string
          destination: string
          event_id: string
          failure_reason: string
          id?: string
          original_id: string
          payload: Json
          resolution_note?: string | null
          resolved_at?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          destination?: string
          event_id?: string
          failure_reason?: string
          id?: string
          original_id?: string
          payload?: Json
          resolution_note?: string | null
          resolved_at?: string | null
        }
        Relationships: []
      }
      event_outbox: {
        Row: {
          attempt_count: number
          created_at: string
          delivered_at: string | null
          destination: string
          event_id: string
          id: string
          last_error: string | null
          max_attempts: number
          next_attempt_at: string
          payload: Json
          status: string
          topic: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          destination: string
          event_id: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload: Json
          status?: string
          topic?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          delivered_at?: string | null
          destination?: string
          event_id?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          next_attempt_at?: string
          payload?: Json
          status?: string
          topic?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_outbox_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_store"
            referencedColumns: ["id"]
          },
        ]
      }
      event_schema_registry: {
        Row: {
          aggregate_type: string
          created_at: string
          description: string | null
          event_type: string
          payload_schema: Json | null
          schema_version: string
        }
        Insert: {
          aggregate_type: string
          created_at?: string
          description?: string | null
          event_type: string
          payload_schema?: Json | null
          schema_version?: string
        }
        Update: {
          aggregate_type?: string
          created_at?: string
          description?: string | null
          event_type?: string
          payload_schema?: Json | null
          schema_version?: string
        }
        Relationships: []
      }
      event_store: {
        Row: {
          agent_id: string | null
          aggregate_id: string
          aggregate_type: string
          caused_by: string | null
          correlation_id: string | null
          emitted_at: string
          event_type: string
          id: string
          metadata: Json
          org_id: string | null
          payload: Json
          schema_version: string
          user_id: string | null
          version: number
        }
        Insert: {
          agent_id?: string | null
          aggregate_id: string
          aggregate_type: string
          caused_by?: string | null
          correlation_id?: string | null
          emitted_at?: string
          event_type: string
          id?: string
          metadata?: Json
          org_id?: string | null
          payload?: Json
          schema_version?: string
          user_id?: string | null
          version?: number
        }
        Update: {
          agent_id?: string | null
          aggregate_id?: string
          aggregate_type?: string
          caused_by?: string | null
          correlation_id?: string | null
          emitted_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          org_id?: string | null
          payload?: Json
          schema_version?: string
          user_id?: string | null
          version?: number
        }
        Relationships: []
      }
      geofence_events: {
        Row: {
          driver_id: string
          event_type: string
          id: string
          latitude: number
          longitude: number
          organization_id: string
          place_label: string | null
          recorded_at: string
          trip_id: string
        }
        Insert: {
          driver_id: string
          event_type: string
          id?: string
          latitude: number
          longitude: number
          organization_id: string
          place_label?: string | null
          recorded_at?: string
          trip_id: string
        }
        Update: {
          driver_id?: string
          event_type?: string
          id?: string
          latitude?: number
          longitude?: number
          organization_id?: string
          place_label?: string | null
          recorded_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "geofence_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "geofence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "geofence_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      global_references: {
        Row: {
          entity_id: string
          entity_type: string
          id: string
          issued_at: string
          issued_by_org: string | null
          reference: string
          year: number
        }
        Insert: {
          entity_id: string
          entity_type: string
          id?: string
          issued_at?: string
          issued_by_org?: string | null
          reference: string
          year: number
        }
        Update: {
          entity_id?: string
          entity_type?: string
          id?: string
          issued_at?: string
          issued_by_org?: string | null
          reference?: string
          year?: number
        }
        Relationships: []
      }
      id_generation_log: {
        Row: {
          created_at: string
          entity_id: string | null
          entity_type: string
          generated_id: string
          id: string
          latency_ms: number | null
          org_id: string | null
          path: string
          reference: string | null
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          entity_type: string
          generated_id: string
          id?: string
          latency_ms?: number | null
          org_id?: string | null
          path?: string
          reference?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          generated_id?: string
          id?: string
          latency_ms?: number | null
          org_id?: string | null
          path?: string
          reference?: string | null
        }
        Relationships: []
      }
      idempotency_keys: {
        Row: {
          completed_at: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          error_message: string | null
          expires_at: string
          key: string
          org_id: string
          request_hash: string
          response_payload: Json | null
          status: string
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          error_message?: string | null
          expires_at?: string
          key: string
          org_id: string
          request_hash: string
          response_payload?: Json | null
          status?: string
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          error_message?: string | null
          expires_at?: string
          key?: string
          org_id?: string
          request_hash?: string
          response_payload?: Json | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      indents: {
        Row: {
          assigned_supplier_id: string | null
          assigned_supplier_rate: number | null
          circulation_target: string | null
          client_name: string
          client_price: number
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_indent_id: string | null
          drop_location: string
          id: string
          indent_code: string | null
          indent_number: string
          indent_operational_code: string | null
          last_saved_at: string | null
          load_type: string | null
          organization_id: string
          owner_user_id: string | null
          pickup_area: string
          pickup_date: string | null
          sequence_number: number | null
          shared_at: string | null
          status: string
          supplier_target: number
          updated_at: string | null
          vehicle_type: string | null
          weight: number | null
        }
        Insert: {
          assigned_supplier_id?: string | null
          assigned_supplier_rate?: number | null
          circulation_target?: string | null
          client_name: string
          client_price?: number
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          display_indent_id?: string | null
          drop_location: string
          id?: string
          indent_code?: string | null
          indent_number: string
          indent_operational_code?: string | null
          last_saved_at?: string | null
          load_type?: string | null
          organization_id: string
          owner_user_id?: string | null
          pickup_area: string
          pickup_date?: string | null
          sequence_number?: number | null
          shared_at?: string | null
          status?: string
          supplier_target?: number
          updated_at?: string | null
          vehicle_type?: string | null
          weight?: number | null
        }
        Update: {
          assigned_supplier_id?: string | null
          assigned_supplier_rate?: number | null
          circulation_target?: string | null
          client_name?: string
          client_price?: number
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          display_indent_id?: string | null
          drop_location?: string
          id?: string
          indent_code?: string | null
          indent_number?: string
          indent_operational_code?: string | null
          last_saved_at?: string | null
          load_type?: string | null
          organization_id?: string
          owner_user_id?: string | null
          pickup_area?: string
          pickup_date?: string | null
          sequence_number?: number | null
          shared_at?: string | null
          status?: string
          supplier_target?: number
          updated_at?: string | null
          vehicle_type?: string | null
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indents_assigned_supplier_id_fkey"
            columns: ["assigned_supplier_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_assigned_supplier_id_fkey"
            columns: ["assigned_supplier_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          created_at: string
          financial_year: string
          last_seq: number
          org_id: string
        }
        Insert: {
          created_at?: string
          financial_year: string
          last_seq?: number
          org_id: string
        }
        Update: {
          created_at?: string
          financial_year?: string
          last_seq?: number
          org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_sequences_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          cgst_amount: number
          client_id: string | null
          client_name: string | null
          created_at: string
          created_by: string | null
          due_date: string | null
          financial_year: string
          gst_rate: number
          id: string
          igst_amount: number
          invoice_date: string
          invoice_number: string
          notes: string | null
          org_id: string
          pdf_storage_path: string | null
          sgst_amount: number
          status: string
          subtotal: number
          total_amount: number
          trip_ids: string[]
          updated_at: string
        }
        Insert: {
          cgst_amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          financial_year: string
          gst_rate?: number
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number: string
          notes?: string | null
          org_id: string
          pdf_storage_path?: string | null
          sgst_amount?: number
          status?: string
          subtotal?: number
          total_amount?: number
          trip_ids?: string[]
          updated_at?: string
        }
        Update: {
          cgst_amount?: number
          client_id?: string | null
          client_name?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          financial_year?: string
          gst_rate?: number
          id?: string
          igst_amount?: number
          invoice_date?: string
          invoice_number?: string
          notes?: string | null
          org_id?: string
          pdf_storage_path?: string | null
          sgst_amount?: number
          status?: string
          subtotal?: number
          total_amount?: number
          trip_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      network_conversations: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          org_a_id: string
          org_a_name: string
          org_b_id: string
          org_b_name: string
          unread_count_a: number
          unread_count_b: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          org_a_id: string
          org_a_name: string
          org_b_id: string
          org_b_name: string
          unread_count_a?: number
          unread_count_b?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          org_a_id?: string
          org_a_name?: string
          org_b_id?: string
          org_b_name?: string
          unread_count_a?: number
          unread_count_b?: number
          updated_at?: string
        }
        Relationships: []
      }
      network_identities: {
        Row: {
          created_at: string
          id: string
          identity_type: string
          metadata: Json
          network_ref: string
          participant_orgs: string[]
          primary_entity: string
          primary_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          identity_type: string
          metadata?: Json
          network_ref: string
          participant_orgs?: string[]
          primary_entity: string
          primary_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          identity_type?: string
          metadata?: Json
          network_ref?: string
          participant_orgs?: string[]
          primary_entity?: string
          primary_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      network_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          is_read_by_other: boolean
          read_at: string | null
          sender_avatar_seed: string | null
          sender_name: string
          sender_org_id: string
          sender_user_id: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          is_read_by_other?: boolean
          read_at?: string | null
          sender_avatar_seed?: string | null
          sender_name: string
          sender_org_id: string
          sender_user_id?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          is_read_by_other?: boolean
          read_at?: string | null
          sender_avatar_seed?: string | null
          sender_name?: string
          sender_org_id?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "network_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "network_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_jobs: {
        Row: {
          confidence_score: number | null
          created_at: string
          created_by: string | null
          document_fingerprint: string
          duplicate_of_job_id: string | null
          engine_name: string
          engine_version: string
          error_message: string | null
          force_rescan: boolean
          id: string
          is_duplicate: boolean
          ocr_model: string | null
          organization_id: string
          pod_attachment_id: string | null
          processing_completed_at: string | null
          processing_duration_ms: number | null
          processing_started_at: string | null
          prompt_version: string
          raw_model_json: Json | null
          result_json: Json | null
          source_kind: string
          source_subtype: string | null
          status: Database["public"]["Enums"]["ocr_job_status"]
          storage_path: string | null
          trip_document_id: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          document_fingerprint: string
          duplicate_of_job_id?: string | null
          engine_name?: string
          engine_version: string
          error_message?: string | null
          force_rescan?: boolean
          id?: string
          is_duplicate?: boolean
          ocr_model?: string | null
          organization_id: string
          pod_attachment_id?: string | null
          processing_completed_at?: string | null
          processing_duration_ms?: number | null
          processing_started_at?: string | null
          prompt_version?: string
          raw_model_json?: Json | null
          result_json?: Json | null
          source_kind: string
          source_subtype?: string | null
          status?: Database["public"]["Enums"]["ocr_job_status"]
          storage_path?: string | null
          trip_document_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          created_by?: string | null
          document_fingerprint?: string
          duplicate_of_job_id?: string | null
          engine_name?: string
          engine_version?: string
          error_message?: string | null
          force_rescan?: boolean
          id?: string
          is_duplicate?: boolean
          ocr_model?: string | null
          organization_id?: string
          pod_attachment_id?: string | null
          processing_completed_at?: string | null
          processing_duration_ms?: number | null
          processing_started_at?: string | null
          prompt_version?: string
          raw_model_json?: Json | null
          result_json?: Json | null
          source_kind?: string
          source_subtype?: string | null
          status?: Database["public"]["Enums"]["ocr_job_status"]
          storage_path?: string | null
          trip_document_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ocr_jobs_duplicate_of_job_id_fkey"
            columns: ["duplicate_of_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_document_id_fkey"
            columns: ["trip_document_id"]
            isOneToOne: false
            referencedRelation: "trip_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_jobs_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      operational_sequences: {
        Row: {
          created_at: string
          current_value: number
          entity_type: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_value?: number
          entity_type: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_value?: number
          entity_type?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operational_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operational_sequences_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_agent_rate_log: {
        Row: {
          request_count: number
          user_id: string
          window_start: string
        }
        Insert: {
          request_count?: number
          user_id: string
          window_start: string
        }
        Update: {
          request_count?: number
          user_id?: string
          window_start?: string
        }
        Relationships: []
      }
      organization_counters: {
        Row: {
          indent_seq: number
          organization_id: string
          trip_seq: number
        }
        Insert: {
          indent_seq?: number
          organization_id: string
          trip_seq?: number
        }
        Update: {
          indent_seq?: number
          organization_id?: string
          trip_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "organization_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_links: {
        Row: {
          created_at: string | null
          id: string
          link_type: string
          linked_org_id: string
          owner_org_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          link_type: string
          linked_org_id: string
          owner_org_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          link_type?: string
          linked_org_id?: string
          owner_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_links_linked_org_id_fkey"
            columns: ["linked_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_links_linked_org_id_fkey"
            columns: ["linked_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_links_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_links_owner_org_id_fkey"
            columns: ["owner_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_locations: {
        Row: {
          address_line: string | null
          city: string | null
          created_at: string
          department: string | null
          id: string
          is_verified: boolean
          location_type: string
          name: string
          organization_id: string
          sort_order: number
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          created_at?: string
          department?: string | null
          id?: string
          is_verified?: boolean
          location_type?: string
          name: string
          organization_id: string
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          city?: string | null
          created_at?: string
          department?: string | null
          id?: string
          is_verified?: boolean
          location_type?: string
          name?: string
          organization_id?: string
          sort_order?: number
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          joined_at: string
          organization_id: string
          permissions: Json
          role: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          joined_at?: string
          organization_id: string
          permissions?: Json
          role?: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          joined_at?: string
          organization_id?: string
          permissions?: Json
          role?: string
          status?: string
          updated_at?: string | null
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
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_relations: {
        Row: {
          created_at: string | null
          from_organization_id: string
          id: string
          relation_type: string
          status: string
          to_organization_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          from_organization_id: string
          id?: string
          relation_type?: string
          status?: string
          to_organization_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          from_organization_id?: string
          id?: string
          relation_type?: string
          status?: string
          to_organization_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_relations_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_relations_from_organization_id_fkey"
            columns: ["from_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_relations_to_organization_id_fkey"
            columns: ["to_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_relations_to_organization_id_fkey"
            columns: ["to_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line: string | null
          avatar_seed: string | null
          business_pan: string | null
          business_type: string | null
          cin: string | null
          city: string | null
          created_at: string | null
          deleted_at: string | null
          employee_count: string | null
          founded_year: number | null
          gstin: string | null
          id: string
          kyc_rejected_reason: string | null
          logo_url: string | null
          name: string
          operating_model: string
          operational_code: string | null
          owner_id: string | null
          profile_about: string | null
          profile_area: string | null
          profile_ceo_name: string | null
          profile_facebook: string | null
          profile_products: string[]
          profile_sector: string | null
          profile_website: string | null
          profile_youtube: string | null
          slug: string | null
          state: string | null
          updated_at: string | null
          verification_status: Database["public"]["Enums"]["kyc_verification_status"]
          verified_at: string | null
          verified_by: string | null
          zone: string | null
        }
        Insert: {
          address_line?: string | null
          avatar_seed?: string | null
          business_pan?: string | null
          business_type?: string | null
          cin?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          employee_count?: string | null
          founded_year?: number | null
          gstin?: string | null
          id?: string
          kyc_rejected_reason?: string | null
          logo_url?: string | null
          name: string
          operating_model?: string
          operational_code?: string | null
          owner_id?: string | null
          profile_about?: string | null
          profile_area?: string | null
          profile_ceo_name?: string | null
          profile_facebook?: string | null
          profile_products?: string[]
          profile_sector?: string | null
          profile_website?: string | null
          profile_youtube?: string | null
          slug?: string | null
          state?: string | null
          updated_at?: string | null
          verification_status?: Database["public"]["Enums"]["kyc_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
          zone?: string | null
        }
        Update: {
          address_line?: string | null
          avatar_seed?: string | null
          business_pan?: string | null
          business_type?: string | null
          cin?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          employee_count?: string | null
          founded_year?: number | null
          gstin?: string | null
          id?: string
          kyc_rejected_reason?: string | null
          logo_url?: string | null
          name?: string
          operating_model?: string
          operational_code?: string | null
          owner_id?: string | null
          profile_about?: string | null
          profile_area?: string | null
          profile_ceo_name?: string | null
          profile_facebook?: string | null
          profile_products?: string[]
          profile_sector?: string | null
          profile_website?: string | null
          profile_youtube?: string | null
          slug?: string | null
          state?: string | null
          updated_at?: string | null
          verification_status?: Database["public"]["Enums"]["kyc_verification_status"]
          verified_at?: string | null
          verified_by?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      platform_metrics: {
        Row: {
          id: string
          labels: Json
          metric_name: string
          metric_value: number
          recorded_at: string
        }
        Insert: {
          id?: string
          labels?: Json
          metric_name: string
          metric_value: number
          recorded_at?: string
        }
        Update: {
          id?: string
          labels?: Json
          metric_name?: string
          metric_value?: number
          recorded_at?: string
        }
        Relationships: []
      }
      posts: {
        Row: {
          author_user_id: string
          content: string | null
          created_at: string
          destination: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          load_date: string | null
          material: string | null
          organization_id: string
          origin: string | null
          rate_offer: number | null
          source_indent_id: string | null
          type: string
          updated_at: string
          vehicle_type: string | null
          view_count: number
          weight_tonnes: number | null
        }
        Insert: {
          author_user_id: string
          content?: string | null
          created_at?: string
          destination?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          load_date?: string | null
          material?: string | null
          organization_id: string
          origin?: string | null
          rate_offer?: number | null
          source_indent_id?: string | null
          type: string
          updated_at?: string
          vehicle_type?: string | null
          view_count?: number
          weight_tonnes?: number | null
        }
        Update: {
          author_user_id?: string
          content?: string | null
          created_at?: string
          destination?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          load_date?: string | null
          material?: string | null
          organization_id?: string
          origin?: string | null
          rate_offer?: number | null
          source_indent_id?: string | null
          type?: string
          updated_at?: string
          vehicle_type?: string | null
          view_count?: number
          weight_tonnes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
        ]
      }
      product_usage: {
        Row: {
          id: string
          metric_key: string
          org_id: string
          period_end: string
          period_start: string
          product_id: string
          quantity: number
          recorded_at: string
        }
        Insert: {
          id?: string
          metric_key: string
          org_id: string
          period_end: string
          period_start: string
          product_id: string
          quantity?: number
          recorded_at?: string
        }
        Update: {
          id?: string
          metric_key?: string
          org_id?: string
          period_end?: string
          period_start?: string
          product_id?: string
          quantity?: number
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      product_waitlist: {
        Row: {
          company_name: string | null
          created_at: string
          email: string
          fleet_size: string | null
          full_name: string | null
          id: string
          invited_at: string | null
          org_id: string | null
          product_id: string
          referral_source: string | null
          status: string
          use_case: string | null
          user_id: string | null
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          email: string
          fleet_size?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          org_id?: string | null
          product_id: string
          referral_source?: string | null
          status?: string
          use_case?: string | null
          user_id?: string | null
        }
        Update: {
          company_name?: string | null
          created_at?: string
          email?: string
          fleet_size?: string | null
          full_name?: string | null
          id?: string
          invited_at?: string | null
          org_id?: string | null
          product_id?: string
          referral_source?: string | null
          status?: string
          use_case?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_waitlist_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_waitlist_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: string | null
          aggregated: boolean
          asset: boolean
          avatar_seed: string | null
          avatar_url: string | null
          bio: string | null
          company_name: string | null
          created_at: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          full_name: string | null
          id: string
          insurance_expiry: string | null
          insurance_photo_url: string | null
          languages: string[] | null
          license_expiry: string | null
          license_number: string | null
          license_photo_url: string | null
          license_type: string | null
          onboarding_completed: boolean | null
          phone: string | null
          preferred_areas: string[] | null
          preferred_vehicle_types: string[] | null
          role: string
          updated_at: string | null
          vehicle_registration: string | null
          vehicle_registration_expiry: string | null
          vehicle_registration_photo_url: string | null
          years_of_experience: number | null
        }
        Insert: {
          address?: string | null
          aggregated?: boolean
          asset?: boolean
          avatar_seed?: string | null
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id: string
          insurance_expiry?: string | null
          insurance_photo_url?: string | null
          languages?: string[] | null
          license_expiry?: string | null
          license_number?: string | null
          license_photo_url?: string | null
          license_type?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          preferred_areas?: string[] | null
          preferred_vehicle_types?: string[] | null
          role?: string
          updated_at?: string | null
          vehicle_registration?: string | null
          vehicle_registration_expiry?: string | null
          vehicle_registration_photo_url?: string | null
          years_of_experience?: number | null
        }
        Update: {
          address?: string | null
          aggregated?: boolean
          asset?: boolean
          avatar_seed?: string | null
          avatar_url?: string | null
          bio?: string | null
          company_name?: string | null
          created_at?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          full_name?: string | null
          id?: string
          insurance_expiry?: string | null
          insurance_photo_url?: string | null
          languages?: string[] | null
          license_expiry?: string | null
          license_number?: string | null
          license_photo_url?: string | null
          license_type?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          preferred_areas?: string[] | null
          preferred_vehicle_types?: string[] | null
          role?: string
          updated_at?: string | null
          vehicle_registration?: string | null
          vehicle_registration_expiry?: string | null
          vehicle_registration_photo_url?: string | null
          years_of_experience?: number | null
        }
        Relationships: []
      }
      ratings: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          organization_id: string
          rated_id: string
          rated_type: string
          rater_id: string
          rater_type: string
          score: number
          trip_id: string
          updated_at: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          organization_id: string
          rated_id: string
          rated_type: string
          rater_id: string
          rater_type: string
          score: number
          trip_id: string
          updated_at?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          rated_id?: string
          rated_type?: string
          rater_id?: string
          rater_type?: string
          score?: number
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      rpc_rate_limits: {
        Row: {
          created_at: string
          id: string
          scope: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          scope: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          scope?: string
          user_id?: string
        }
        Relationships: []
      }
      search_index: {
        Row: {
          display_name: string | null
          entity_id: string
          entity_type: string
          id: string
          location_text: string | null
          network_ref: string | null
          org_id: string | null
          phone: string | null
          reference: string | null
          relevance_boost: number
          search_vector: unknown
          secondary_ref: string | null
          tags: string[] | null
          updated_at: string
          vehicle_number: string | null
        }
        Insert: {
          display_name?: string | null
          entity_id: string
          entity_type: string
          id?: string
          location_text?: string | null
          network_ref?: string | null
          org_id?: string | null
          phone?: string | null
          reference?: string | null
          relevance_boost?: number
          search_vector?: unknown
          secondary_ref?: string | null
          tags?: string[] | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Update: {
          display_name?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          location_text?: string | null
          network_ref?: string | null
          org_id?: string | null
          phone?: string | null
          reference?: string | null
          relevance_boost?: number
          search_vector?: unknown
          secondary_ref?: string | null
          tags?: string[] | null
          updated_at?: string
          vehicle_number?: string | null
        }
        Relationships: []
      }
      shared_ledger_connection: {
        Row: {
          created_at: string
          id: string
          org_a_id: string
          org_b_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_a_id: string
          org_b_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          org_a_id?: string
          org_b_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_ledger_connection_org_a_id_fkey"
            columns: ["org_a_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_connection_org_a_id_fkey"
            columns: ["org_a_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_connection_org_b_id_fkey"
            columns: ["org_b_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_connection_org_b_id_fkey"
            columns: ["org_b_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_ledger_notifications: {
        Row: {
          amount_meta: number | null
          created_at: string
          dedupe_key: string | null
          event_type: string
          handled_at: string | null
          handled_by_user_id: string | null
          id: string
          organization_id: string
          partner_key: string | null
          partner_org_id: string | null
          payload_json: Json
          read_at: string | null
          source_dispute_id: string | null
          status: string
          subtitle: string | null
          title: string
          transaction_id: string | null
          trip_id: string | null
          updated_at: string
        }
        Insert: {
          amount_meta?: number | null
          created_at?: string
          dedupe_key?: string | null
          event_type: string
          handled_at?: string | null
          handled_by_user_id?: string | null
          id?: string
          organization_id: string
          partner_key?: string | null
          partner_org_id?: string | null
          payload_json?: Json
          read_at?: string | null
          source_dispute_id?: string | null
          status?: string
          subtitle?: string | null
          title: string
          transaction_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_meta?: number | null
          created_at?: string
          dedupe_key?: string | null
          event_type?: string
          handled_at?: string | null
          handled_by_user_id?: string | null
          id?: string
          organization_id?: string
          partner_key?: string | null
          partner_org_id?: string | null
          payload_json?: Json
          read_at?: string | null
          source_dispute_id?: string | null
          status?: string
          subtitle?: string | null
          title?: string
          transaction_id?: string | null
          trip_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_ledger_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_notifications_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_notifications_partner_org_id_fkey"
            columns: ["partner_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shared_ledger_notifications_source_dispute_id_fkey"
            columns: ["source_dispute_id"]
            isOneToOne: false
            referencedRelation: "dispute"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          post_id: string
          viewed_at: string
          viewer_org_id: string
          viewer_org_name: string | null
          viewer_user_id: string
        }
        Insert: {
          id?: string
          post_id: string
          viewed_at?: string
          viewer_org_id: string
          viewer_org_name?: string | null
          viewer_user_id: string
        }
        Update: {
          id?: string
          post_id?: string
          viewed_at?: string
          viewer_org_id?: string
          viewer_org_name?: string | null
          viewer_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_org_id_fkey"
            columns: ["viewer_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_viewer_org_id_fkey"
            columns: ["viewer_org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_bills: {
        Row: {
          advance_paid: number
          approved_at: string | null
          approved_by: string | null
          balance_payable: number | null
          bill_date: string
          bill_number: string
          created_at: string
          created_by: string | null
          gross_amount: number
          id: string
          net_payable: number
          notes: string | null
          org_id: string
          status: string
          supplier_id: string | null
          supplier_name: string | null
          tds_amount: number
          tds_percent: number
          trip_ids: string[]
          updated_at: string
        }
        Insert: {
          advance_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          balance_payable?: number | null
          bill_date?: string
          bill_number: string
          created_at?: string
          created_by?: string | null
          gross_amount?: number
          id?: string
          net_payable?: number
          notes?: string | null
          org_id: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tds_amount?: number
          tds_percent?: number
          trip_ids?: string[]
          updated_at?: string
        }
        Update: {
          advance_paid?: number
          approved_at?: string | null
          approved_by?: string | null
          balance_payable?: number | null
          bill_date?: string
          bill_number?: string
          created_at?: string
          created_by?: string | null
          gross_amount?: number
          id?: string
          net_payable?: number
          notes?: string | null
          org_id?: string
          status?: string
          supplier_id?: string | null
          supplier_name?: string | null
          tds_amount?: number
          tds_percent?: number
          trip_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_bills_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_compliance_documents: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_type: string
          expiry_date: string | null
          file_name: string | null
          id: string
          label: string
          notes: string | null
          organization_id: string
          status: string
          storage_path: string | null
          supplier_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_type: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          label: string
          notes?: string | null
          organization_id: string
          status?: string
          storage_path?: string | null
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_type?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          label?: string
          notes?: string | null
          organization_id?: string
          status?: string
          storage_path?: string | null
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_compliance_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_compliance_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_compliance_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          department: string | null
          designation: string | null
          email: string | null
          id: string
          is_dispatch: boolean
          is_finance: boolean
          is_operations: boolean
          is_primary: boolean
          mobile: string | null
          name: string
          notes: string | null
          organization_id: string
          supplier_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_dispatch?: boolean
          is_finance?: boolean
          is_operations?: boolean
          is_primary?: boolean
          mobile?: string | null
          name: string
          notes?: string | null
          organization_id: string
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          department?: string | null
          designation?: string | null
          email?: string | null
          id?: string
          is_dispatch?: boolean
          is_finance?: boolean
          is_operations?: boolean
          is_primary?: boolean
          mobile?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contacts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_contract_agreements: {
        Row: {
          contract_number: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          effective_date: string | null
          expiry_date: string | null
          general_terms: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_terms: Json | null
          rate_type: string | null
          signed_storage_path: string | null
          sla_terms: Json | null
          status: string
          supplier_id: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          contract_number: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          general_terms?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_terms?: Json | null
          rate_type?: string | null
          signed_storage_path?: string | null
          sla_terms?: Json | null
          status?: string
          supplier_id: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          contract_number?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          effective_date?: string | null
          expiry_date?: string | null
          general_terms?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: Json | null
          rate_type?: string | null
          signed_storage_path?: string | null
          sla_terms?: Json | null
          status?: string
          supplier_id?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_contract_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contract_agreements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_contract_agreements_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_fleet: {
        Row: {
          capacity_tons: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          driver_id: string | null
          fitness_expiry: string | null
          has_gps: boolean
          id: string
          insurance_expiry: string | null
          notes: string | null
          organization_id: string
          ownership: string
          permit_expiry: string | null
          supplier_id: string
          updated_at: string
          vehicle_number: string
          vehicle_type: string | null
        }
        Insert: {
          capacity_tons?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          fitness_expiry?: string | null
          has_gps?: boolean
          id?: string
          insurance_expiry?: string | null
          notes?: string | null
          organization_id: string
          ownership?: string
          permit_expiry?: string | null
          supplier_id: string
          updated_at?: string
          vehicle_number: string
          vehicle_type?: string | null
        }
        Update: {
          capacity_tons?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          driver_id?: string | null
          fitness_expiry?: string | null
          has_gps?: boolean
          id?: string
          insurance_expiry?: string | null
          notes?: string | null
          organization_id?: string
          ownership?: string
          permit_expiry?: string | null
          supplier_id?: string
          updated_at?: string
          vehicle_number?: string
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_fleet_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_fleet_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "supplier_fleet_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_fleet_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_fleet_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_kyc_documents: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_label: string | null
          doc_type: string
          expiry_date: string | null
          file_name: string | null
          id: string
          is_mandatory: boolean
          mime_type: string | null
          notes: string | null
          organization_id: string
          status: string
          storage_path: string | null
          supplier_id: string
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
          version_number: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_label?: string | null
          doc_type: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          notes?: string | null
          organization_id: string
          status?: string
          storage_path?: string | null
          supplier_id: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_label?: string | null
          doc_type?: string
          expiry_date?: string | null
          file_name?: string | null
          id?: string
          is_mandatory?: boolean
          mime_type?: string | null
          notes?: string | null
          organization_id?: string
          status?: string
          storage_path?: string | null
          supplier_id?: string
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "supplier_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_kyc_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_kyc_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_warehouses: {
        Row: {
          address: string | null
          city: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          loading_bays: number | null
          name: string
          notes: string | null
          organization_id: string
          pincode: string | null
          state: string | null
          storage_capacity_tons: number | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          loading_bays?: number | null
          name: string
          notes?: string | null
          organization_id: string
          pincode?: string | null
          state?: string | null
          storage_capacity_tons?: number | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          loading_bays?: number | null
          name?: string
          notes?: string | null
          organization_id?: string
          pincode?: string | null
          state?: string | null
          storage_capacity_tons?: number | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_warehouses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_warehouses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          avatar_seed: string | null
          avatar_url: string | null
          company_name: string | null
          contact: string | null
          contact_person: string | null
          created_at: string | null
          deleted_at: string | null
          email: string | null
          gst_number: string | null
          gstin: string | null
          id: string
          industry: string | null
          is_active: boolean
          is_verified: boolean
          linked_organization_id: string | null
          name: string | null
          onboarding_agreement_notes: string | null
          onboarding_agreement_signed_at: string | null
          onboarding_agreement_status: string | null
          onboarding_agreement_storage_path: string | null
          operating_areas: string[] | null
          organization_id: string
          owner_full_name: string | null
          pan_number: string | null
          phone: string | null
          registered_address: string | null
          supplier_type: string | null
          updated_at: string | null
          updated_by: string | null
          vehicle_types: string[] | null
          website: string | null
        }
        Insert: {
          address?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          company_name?: string | null
          contact?: string | null
          contact_person?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          gst_number?: string | null
          gstin?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          is_verified?: boolean
          linked_organization_id?: string | null
          name?: string | null
          onboarding_agreement_notes?: string | null
          onboarding_agreement_signed_at?: string | null
          onboarding_agreement_status?: string | null
          onboarding_agreement_storage_path?: string | null
          operating_areas?: string[] | null
          organization_id: string
          owner_full_name?: string | null
          pan_number?: string | null
          phone?: string | null
          registered_address?: string | null
          supplier_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vehicle_types?: string[] | null
          website?: string | null
        }
        Update: {
          address?: string | null
          avatar_seed?: string | null
          avatar_url?: string | null
          company_name?: string | null
          contact?: string | null
          contact_person?: string | null
          created_at?: string | null
          deleted_at?: string | null
          email?: string | null
          gst_number?: string | null
          gstin?: string | null
          id?: string
          industry?: string | null
          is_active?: boolean
          is_verified?: boolean
          linked_organization_id?: string | null
          name?: string | null
          onboarding_agreement_notes?: string | null
          onboarding_agreement_signed_at?: string | null
          onboarding_agreement_status?: string | null
          onboarding_agreement_storage_path?: string | null
          operating_areas?: string[] | null
          organization_id?: string
          owner_full_name?: string | null
          pan_number?: string | null
          phone?: string | null
          registered_address?: string | null
          supplier_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vehicle_types?: string[] | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_linked_organization_id_fkey"
            columns: ["linked_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_linked_organization_id_fkey"
            columns: ["linked_organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount_in: number
          amount_out: number
          chat_mirror_of_transaction_id: string | null
          contact_id: string | null
          contact_type: string | null
          created_at: string | null
          description: string
          id: string
          is_opening_balance: boolean
          ledger_category: string | null
          ledger_entity_type: string | null
          ledger_flow_type: string | null
          organization_id: string
          party_name: string
          transaction_date: string
          trip_id: string | null
        }
        Insert: {
          amount_in?: number
          amount_out?: number
          chat_mirror_of_transaction_id?: string | null
          contact_id?: string | null
          contact_type?: string | null
          created_at?: string | null
          description?: string
          id?: string
          is_opening_balance?: boolean
          ledger_category?: string | null
          ledger_entity_type?: string | null
          ledger_flow_type?: string | null
          organization_id: string
          party_name: string
          transaction_date?: string
          trip_id?: string | null
        }
        Update: {
          amount_in?: number
          amount_out?: number
          chat_mirror_of_transaction_id?: string | null
          contact_id?: string | null
          contact_type?: string | null
          created_at?: string | null
          description?: string
          id?: string
          is_opening_balance?: boolean
          ledger_category?: string | null
          ledger_entity_type?: string | null
          ledger_flow_type?: string | null
          organization_id?: string
          party_name?: string
          transaction_date?: string
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_chat_mirror_of_transaction_id_fkey"
            columns: ["chat_mirror_of_transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_assignment_audit: {
        Row: {
          changed_at: string
          changed_by: string | null
          driver_id_new: string | null
          driver_id_prev: string | null
          event_type: string
          id: string
          trip_id: string
          vehicle_id_new: string | null
          vehicle_id_prev: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          driver_id_new?: string | null
          driver_id_prev?: string | null
          event_type: string
          id?: string
          trip_id: string
          vehicle_id_new?: string | null
          vehicle_id_prev?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          driver_id_new?: string | null
          driver_id_prev?: string | null
          event_type?: string
          id?: string
          trip_id?: string
          vehicle_id_new?: string | null
          vehicle_id_prev?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_assignment_audit_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_new_fkey"
            columns: ["driver_id_new"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_new_fkey"
            columns: ["driver_id_new"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_prev_fkey"
            columns: ["driver_id_prev"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_driver_id_prev_fkey"
            columns: ["driver_id_prev"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_vehicle_id_new_fkey"
            columns: ["vehicle_id_new"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_assignment_audit_vehicle_id_prev_fkey"
            columns: ["vehicle_id_prev"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_conversations: {
        Row: {
          client_id: string | null
          created_at: string
          driver_id: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          organization_id: string
          party_name: string
          party_type: string
          supplier_id: string | null
          trip_id: string
          unread_dispatcher_count: number
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          organization_id: string
          party_name: string
          party_type: string
          supplier_id?: string | null
          trip_id: string
          unread_dispatcher_count?: number
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          created_at?: string
          driver_id?: string | null
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          organization_id?: string
          party_name?: string
          party_type?: string
          supplier_id?: string | null
          trip_id?: string
          unread_dispatcher_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_conversations_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_conversations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_documents: {
        Row: {
          document_type: string
          file_name: string
          id: string
          mime_type: string | null
          ocr_job_id: string | null
          size_bytes: number | null
          storage_path: string
          trip_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          document_type?: string
          file_name: string
          id?: string
          mime_type?: string | null
          ocr_job_id?: string | null
          size_bytes?: number | null
          storage_path: string
          trip_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          document_type?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          ocr_job_id?: string | null
          size_bytes?: number | null
          storage_path?: string
          trip_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_documents_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_documents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_finance_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          impact: string
          mission_key: string | null
          organization_id: string
          reason: string
          trip_id: string
          type: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          impact: string
          mission_key?: string | null
          organization_id: string
          reason: string
          trip_id: string
          type: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          impact?: string
          mission_key?: string | null
          organization_id?: string
          reason?: string
          trip_id?: string
          type?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_finance_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_finance_adjustments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_fuel_entries: {
        Row: {
          amount_inr: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          bill_storage_path: string | null
          entered_at: string
          entered_by: string | null
          fuel_type: string | null
          id: string
          last_retry_at: string | null
          ledger_state: string
          liters: number | null
          notes: string | null
          ocr_job_id: string | null
          payment_mode: string | null
          payment_owner: string
          posting_error: string | null
          posting_state: string
          reimbursed_at: string | null
          reimbursed_by: string | null
          reimbursement_notes: string | null
          reimbursement_state: string
          reimbursement_updated_at: string | null
          retry_count: number
          source: string
          station_name: string | null
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          bill_storage_path?: string | null
          entered_at?: string
          entered_by?: string | null
          fuel_type?: string | null
          id?: string
          last_retry_at?: string | null
          ledger_state?: string
          liters?: number | null
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          posting_error?: string | null
          posting_state?: string
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          station_name?: string | null
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          bill_storage_path?: string | null
          entered_at?: string
          entered_by?: string | null
          fuel_type?: string | null
          id?: string
          last_retry_at?: string | null
          ledger_state?: string
          liters?: number | null
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          posting_error?: string | null
          posting_state?: string
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          station_name?: string | null
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_fuel_entries_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_fuel_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_location_checkpoints: {
        Row: {
          accuracy: number | null
          distance_delta_m: number | null
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          organization_id: string
          recorded_at: string
          session_id: string | null
          source: string
          speed_kmh: number | null
          trip_id: string
        }
        Insert: {
          accuracy?: number | null
          distance_delta_m?: number | null
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          organization_id: string
          recorded_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          trip_id: string
        }
        Update: {
          accuracy?: number | null
          distance_delta_m?: number | null
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          organization_id?: string
          recorded_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_location_checkpoints_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "trip_tracking_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_location_checkpoints_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_location_checkpoints_default: {
        Row: {
          accuracy: number | null
          distance_delta_m: number | null
          driver_id: string
          heading: number | null
          id: string
          latitude: number
          longitude: number
          organization_id: string
          recorded_at: string
          session_id: string | null
          source: string
          speed_kmh: number | null
          trip_id: string
        }
        Insert: {
          accuracy?: number | null
          distance_delta_m?: number | null
          driver_id: string
          heading?: number | null
          id?: string
          latitude: number
          longitude: number
          organization_id: string
          recorded_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          trip_id: string
        }
        Update: {
          accuracy?: number | null
          distance_delta_m?: number | null
          driver_id?: string
          heading?: number | null
          id?: string
          latitude?: number
          longitude?: number
          organization_id?: string
          recorded_at?: string
          session_id?: string | null
          source?: string
          speed_kmh?: number | null
          trip_id?: string
        }
        Relationships: []
      }
      trip_messages: {
        Row: {
          content: string
          context_indent_id: string | null
          context_trip_id: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean
          is_delivered: boolean
          is_read: boolean
          message_type: string
          metadata: Json | null
          organization_id: string
          priority_weight: number
          reactions: Json | null
          read_at: string | null
          reply_to_id: string | null
          reply_to_preview: Json | null
          sender_avatar_seed: string | null
          sender_name: string
          sender_role: string
          sender_user_id: string | null
          visibility_tags: Json | null
        }
        Insert: {
          content: string
          context_indent_id?: string | null
          context_trip_id?: string | null
          conversation_id: string
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean
          is_delivered?: boolean
          is_read?: boolean
          message_type?: string
          metadata?: Json | null
          organization_id: string
          priority_weight?: number
          reactions?: Json | null
          read_at?: string | null
          reply_to_id?: string | null
          reply_to_preview?: Json | null
          sender_avatar_seed?: string | null
          sender_name: string
          sender_role: string
          sender_user_id?: string | null
          visibility_tags?: Json | null
        }
        Update: {
          content?: string
          context_indent_id?: string | null
          context_trip_id?: string | null
          conversation_id?: string
          created_at?: string
          delivered_at?: string | null
          edited_at?: string | null
          id?: string
          is_deleted?: boolean
          is_delivered?: boolean
          is_read?: boolean
          message_type?: string
          metadata?: Json | null
          organization_id?: string
          priority_weight?: number
          reactions?: Json | null
          read_at?: string | null
          reply_to_id?: string | null
          reply_to_preview?: Json | null
          sender_avatar_seed?: string | null
          sender_name?: string
          sender_role?: string
          sender_user_id?: string | null
          visibility_tags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_messages_context_indent_id_fkey"
            columns: ["context_indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_indent_id_fkey"
            columns: ["context_indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_context_trip_id_fkey"
            columns: ["context_trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "trip_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "trip_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "trip_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "trip_messages_archive_candidates"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_operational_timeline_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          organization_id: string
          payload: Json
          source_id: string | null
          source_type: string | null
          trip_id: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          source_id?: string | null
          source_type?: string | null
          trip_id: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          source_id?: string | null
          source_type?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_operational_timeline_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_operational_timeline_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_other_expenses: {
        Row: {
          amount_inr: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          description: string | null
          entered_at: string
          entered_by: string | null
          expense_category: string
          id: string
          last_retry_at: string | null
          ledger_state: string
          location_name: string | null
          notes: string | null
          ocr_job_id: string | null
          payment_mode: string | null
          payment_owner: string
          posting_error: string | null
          posting_state: string
          receipt_storage_path: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          reimbursement_notes: string | null
          reimbursement_state: string
          reimbursement_updated_at: string | null
          retry_count: number
          source: string
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          description?: string | null
          entered_at?: string
          entered_by?: string | null
          expense_category: string
          id?: string
          last_retry_at?: string | null
          ledger_state?: string
          location_name?: string | null
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          posting_error?: string | null
          posting_state?: string
          receipt_storage_path?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          description?: string | null
          entered_at?: string
          entered_by?: string | null
          expense_category?: string
          id?: string
          last_retry_at?: string | null
          ledger_state?: string
          location_name?: string | null
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          posting_error?: string | null
          posting_state?: string
          receipt_storage_path?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_other_expenses_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_other_expenses_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_otps: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string
          failed_attempts: number
          id: string
          trip_id: string
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at: string
          failed_attempts?: number
          id?: string
          trip_id: string
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string
          failed_attempts?: number
          id?: string
          trip_id?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_otps_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: true
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_predictions: {
        Row: {
          confidence_score: number
          created_at: string
          id: string
          organization_id: string
          predicted_cost: number
          predicted_profit: number
          risk_flag: string
          trip_id: string
        }
        Insert: {
          confidence_score?: number
          created_at?: string
          id?: string
          organization_id: string
          predicted_cost?: number
          predicted_profit?: number
          risk_flag?: string
          trip_id: string
        }
        Update: {
          confidence_score?: number
          created_at?: string
          id?: string
          organization_id?: string
          predicted_cost?: number
          predicted_profit?: number
          risk_flag?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_toll_entries: {
        Row: {
          amount_inr: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          entered_at: string
          entered_by: string | null
          id: string
          is_estimated: boolean
          last_retry_at: string | null
          ledger_state: string
          notes: string | null
          ocr_job_id: string | null
          payment_mode: string | null
          payment_owner: string
          plaza_name: string | null
          posting_error: string | null
          posting_state: string
          receipt_storage_path: string | null
          reimbursed_at: string | null
          reimbursed_by: string | null
          reimbursement_notes: string | null
          reimbursement_state: string
          reimbursement_updated_at: string | null
          retry_count: number
          source: string
          status: string
          trip_id: string
          updated_at: string
        }
        Insert: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          entered_at?: string
          entered_by?: string | null
          id?: string
          is_estimated?: boolean
          last_retry_at?: string | null
          ledger_state?: string
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          plaza_name?: string | null
          posting_error?: string | null
          posting_state?: string
          receipt_storage_path?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          trip_id: string
          updated_at?: string
        }
        Update: {
          amount_inr?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          entered_at?: string
          entered_by?: string | null
          id?: string
          is_estimated?: boolean
          last_retry_at?: string | null
          ledger_state?: string
          notes?: string | null
          ocr_job_id?: string | null
          payment_mode?: string | null
          payment_owner?: string
          plaza_name?: string | null
          posting_error?: string | null
          posting_state?: string
          receipt_storage_path?: string | null
          reimbursed_at?: string | null
          reimbursed_by?: string | null
          reimbursement_notes?: string | null
          reimbursement_state?: string
          reimbursement_updated_at?: string | null
          retry_count?: number
          source?: string
          status?: string
          trip_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_toll_entries_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_toll_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_tracking_sessions: {
        Row: {
          device_id: string | null
          driver_id: string
          ended_at: string | null
          id: string
          is_active: boolean
          last_heartbeat: string
          organization_id: string
          started_at: string
          trip_id: string
        }
        Insert: {
          device_id?: string | null
          driver_id: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_heartbeat?: string
          organization_id: string
          started_at?: string
          trip_id: string
        }
        Update: {
          device_id?: string | null
          driver_id?: string
          ended_at?: string | null
          id?: string
          is_active?: boolean
          last_heartbeat?: string
          organization_id?: string
          started_at?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_tracking_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_tracking_sessions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trip_workflow_events: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          idempotency_key: string | null
          org_id: string
          payload: Json
          trip_id: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          org_id: string
          payload?: Json
          trip_id: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          org_id?: string
          payload?: Json
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_workflow_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_workflow_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
        ]
      }
      trips: {
        Row: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          organization_id: string
          owner_user_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          pod_received_at: string | null
          pod_required: boolean
          sequence_number: number | null
          source: string
          source_indent_code: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }
        Insert: {
          actual_distance_traveled_km?: number | null
          advance_paid?: number
          amount_paid?: number
          assigned_by_user_id?: string | null
          booking_ref?: string | null
          client_id?: string | null
          client_name: string
          client_price?: number
          completed_at?: string | null
          converted_by?: string | null
          converted_from_indent_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          display_trip_id?: string | null
          distance?: number | null
          distance_discrepancy_km?: number | null
          distance_source?: string | null
          driver_commission?: number
          driver_display_name?: string | null
          driver_display_trip_id?: string | null
          driver_id?: string | null
          drop_lat?: number | null
          drop_location: string
          drop_lon?: number | null
          end_odometer_km?: number | null
          estimated_duration?: string | null
          gps_distance_km?: number | null
          id?: string
          indent_id?: string | null
          indent_reference_code?: string | null
          is_guaranteed?: boolean
          last_location_at?: string | null
          last_location_chat_at?: string | null
          load_tons?: number | null
          load_type?: string | null
          margin?: number | null
          notes?: string | null
          odometer_distance_km?: number | null
          odometer_notes?: string | null
          odometer_updated_at?: string | null
          odometer_updated_by?: string | null
          odometer_verification_state?: string
          organization_id: string
          owner_user_id?: string | null
          payment_status?: string
          pickup_area: string
          pickup_date?: string | null
          pickup_lat?: number | null
          pickup_lon?: number | null
          platform_fee?: number
          pod_received_at?: string | null
          pod_required?: boolean
          sequence_number?: number | null
          source?: string
          source_indent_code?: string | null
          source_indent_id?: string | null
          start_odometer_km?: number | null
          started_at?: string | null
          status?: string
          status_change_origin?: string | null
          supplier_id?: string | null
          supplier_rate?: number
          trip_code?: string | null
          trip_number: string
          trip_operational_code?: string | null
          trip_payout_mode?: string | null
          updated_at?: string | null
          vehicle_display_number?: string | null
          vehicle_id?: string | null
        }
        Update: {
          actual_distance_traveled_km?: number | null
          advance_paid?: number
          amount_paid?: number
          assigned_by_user_id?: string | null
          booking_ref?: string | null
          client_id?: string | null
          client_name?: string
          client_price?: number
          completed_at?: string | null
          converted_by?: string | null
          converted_from_indent_at?: string | null
          created_at?: string | null
          created_by_user_id?: string | null
          deleted_at?: string | null
          display_trip_id?: string | null
          distance?: number | null
          distance_discrepancy_km?: number | null
          distance_source?: string | null
          driver_commission?: number
          driver_display_name?: string | null
          driver_display_trip_id?: string | null
          driver_id?: string | null
          drop_lat?: number | null
          drop_location?: string
          drop_lon?: number | null
          end_odometer_km?: number | null
          estimated_duration?: string | null
          gps_distance_km?: number | null
          id?: string
          indent_id?: string | null
          indent_reference_code?: string | null
          is_guaranteed?: boolean
          last_location_at?: string | null
          last_location_chat_at?: string | null
          load_tons?: number | null
          load_type?: string | null
          margin?: number | null
          notes?: string | null
          odometer_distance_km?: number | null
          odometer_notes?: string | null
          odometer_updated_at?: string | null
          odometer_updated_by?: string | null
          odometer_verification_state?: string
          organization_id?: string
          owner_user_id?: string | null
          payment_status?: string
          pickup_area?: string
          pickup_date?: string | null
          pickup_lat?: number | null
          pickup_lon?: number | null
          platform_fee?: number
          pod_received_at?: string | null
          pod_required?: boolean
          sequence_number?: number | null
          source?: string
          source_indent_code?: string | null
          source_indent_id?: string | null
          start_odometer_km?: number | null
          started_at?: string | null
          status?: string
          status_change_origin?: string | null
          supplier_id?: string | null
          supplier_rate?: number
          trip_code?: string | null
          trip_number?: string
          trip_operational_code?: string | null
          trip_payout_mode?: string | null
          updated_at?: string | null
          vehicle_display_number?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_assigned_by_user_id_fkey"
            columns: ["assigned_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "trips_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_indent_id_fkey"
            columns: ["indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_source_indent_id_fkey"
            columns: ["source_indent_id"]
            isOneToOne: false
            referencedRelation: "v_open_indents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_counters: {
        Row: {
          indent_seq: number
          load_seq: number
          trip_seq: number
          user_id: string
        }
        Insert: {
          indent_seq?: number
          load_seq?: number
          trip_seq?: number
          user_id: string
        }
        Update: {
          indent_seq?: number
          load_seq?: number
          trip_seq?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_counters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_push_tokens: {
        Row: {
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          platform: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      vehicle_health_scores: {
        Row: {
          breakdown_probability: number | null
          health_score: number
          id: string
          last_updated: string
          next_maintenance_at: string | null
          organization_id: string
          vehicle_id: string
        }
        Insert: {
          breakdown_probability?: number | null
          health_score?: number
          id?: string
          last_updated?: string
          next_maintenance_at?: string | null
          organization_id: string
          vehicle_id: string
        }
        Update: {
          breakdown_probability?: number | null
          health_score?: number
          id?: string
          last_updated?: string
          next_maintenance_at?: string | null
          organization_id?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_health_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_health_scores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_ledger_entries: {
        Row: {
          amount: number
          approved_by: string | null
          created_at: string
          credit: number | null
          debit: number | null
          entry_type: string
          id: string
          metadata: Json
          organization_id: string
          posted_at: string
          source_id: string
          source_type: string
          trip_id: string | null
          vehicle_id: string
        }
        Insert: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          credit?: number | null
          debit?: number | null
          entry_type: string
          id?: string
          metadata?: Json
          organization_id: string
          posted_at?: string
          source_id: string
          source_type: string
          trip_id?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          created_at?: string
          credit?: number | null
          debit?: number | null
          entry_type?: string
          id?: string
          metadata?: Json
          organization_id?: string
          posted_at?: string
          source_id?: string
          source_type?: string
          trip_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "vehicle_ledger_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_maintenance_entries: {
        Row: {
          amount_inr: number
          entered_at: string
          entered_by: string | null
          id: string
          invoice_storage_path: string | null
          maintenance_type: string
          next_due_date: string | null
          next_due_km: number | null
          notes: string | null
          organization_id: string
          status: string
          trip_id: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          amount_inr?: number
          entered_at?: string
          entered_by?: string | null
          id?: string
          invoice_storage_path?: string | null
          maintenance_type: string
          next_due_date?: string | null
          next_due_km?: number | null
          notes?: string | null
          organization_id: string
          status?: string
          trip_id?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          amount_inr?: number
          entered_at?: string
          entered_by?: string | null
          id?: string
          invoice_storage_path?: string | null
          maintenance_type?: string
          next_due_date?: string | null
          next_due_km?: number | null
          notes?: string | null
          organization_id?: string
          status?: string
          trip_id?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_maintenance_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "vehicle_maintenance_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_odometer_events: {
        Row: {
          confidence_score: number | null
          created_at: string
          driver_id: string | null
          event_side: string
          id: string
          ocr_job_id: string | null
          odometer_km: number
          organization_id: string
          photo_storage_path: string | null
          reading_source: string
          recorded_at: string
          trip_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          driver_id?: string | null
          event_side: string
          id?: string
          ocr_job_id?: string | null
          odometer_km: number
          organization_id: string
          photo_storage_path?: string | null
          reading_source?: string
          recorded_at?: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          driver_id?: string | null
          event_side?: string
          id?: string
          ocr_job_id?: string | null
          odometer_km?: number
          organization_id?: string
          photo_storage_path?: string | null
          reading_source?: string
          recorded_at?: string
          trip_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_odometer_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "v_driver_balances"
            referencedColumns: ["driver_id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_ocr_job_id_fkey"
            columns: ["ocr_job_id"]
            isOneToOne: false
            referencedRelation: "ocr_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "vehicle_odometer_events_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_operation_ledger_entries: {
        Row: {
          amount: number
          approval_state: string
          approved_at: string | null
          approved_by: string | null
          created_at: string
          entry_type: string
          id: string
          organization_id: string
          source_id: string
          source_type: string
          trip_id: string | null
          vehicle_id: string
        }
        Insert: {
          amount?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entry_type?: string
          id?: string
          organization_id: string
          source_id: string
          source_type: string
          trip_id?: string | null
          vehicle_id: string
        }
        Update: {
          amount?: number
          approval_state?: string
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          entry_type?: string
          id?: string
          organization_id?: string
          source_id?: string
          source_type?: string
          trip_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_operation_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_active_trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_driver_tracking_health"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "v_long_haul_health"
            referencedColumns: ["trip_id"]
          },
          {
            foreignKeyName: "vehicle_operation_ledger_entries_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          avatar_seed: string | null
          avatar_url: string | null
          capacity: string | null
          created_at: string | null
          deleted_at: string | null
          documents: Json | null
          id: string
          organization_id: string
          status: string
          supplier_id: string | null
          type: string
          updated_at: string | null
          vehicle_axle: string | null
          vehicle_body_type: string | null
          vehicle_brand: string | null
          vehicle_code: string | null
          vehicle_model: string | null
          vehicle_number: string
          vehicle_size: string | null
          vehicle_type: string | null
        }
        Insert: {
          avatar_seed?: string | null
          avatar_url?: string | null
          capacity?: string | null
          created_at?: string | null
          deleted_at?: string | null
          documents?: Json | null
          id?: string
          organization_id: string
          status?: string
          supplier_id?: string | null
          type?: string
          updated_at?: string | null
          vehicle_axle?: string | null
          vehicle_body_type?: string | null
          vehicle_brand?: string | null
          vehicle_code?: string | null
          vehicle_model?: string | null
          vehicle_number: string
          vehicle_size?: string | null
          vehicle_type?: string | null
        }
        Update: {
          avatar_seed?: string | null
          avatar_url?: string | null
          capacity?: string | null
          created_at?: string | null
          deleted_at?: string | null
          documents?: Json | null
          id?: string
          organization_id?: string
          status?: string
          supplier_id?: string | null
          type?: string
          updated_at?: string | null
          vehicle_axle?: string | null
          vehicle_body_type?: string | null
          vehicle_brand?: string | null
          vehicle_code?: string | null
          vehicle_model?: string | null
          vehicle_number?: string
          vehicle_size?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vehicles_supplier"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_audit_log: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          org_id: string
          payload: Json
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          org_id: string
          payload?: Json
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "workspace_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_products: {
        Row: {
          activated_at: string | null
          billing_cycle: string | null
          created_at: string
          expires_at: string | null
          id: string
          metadata: Json
          org_id: string
          product_id: string
          seats: number | null
          status: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          billing_cycle?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          org_id: string
          product_id: string
          seats?: number | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          billing_cycle?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          product_id?: string
          seats?: number | null
          status?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      trip_messages_archive_candidates: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string | null
          id: string | null
          is_read: boolean | null
          message_type: string | null
          metadata: Json | null
          organization_id: string | null
          read_at: string | null
          sender_name: string | null
          sender_role: string | null
          sender_user_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          is_read?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          organization_id?: string | null
          read_at?: string | null
          sender_name?: string | null
          sender_role?: string | null
          sender_user_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string | null
          id?: string | null
          is_read?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          organization_id?: string | null
          read_at?: string | null
          sender_name?: string | null
          sender_role?: string | null
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "trip_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      v_active_trips: {
        Row: {
          client_name: string | null
          client_price: number | null
          driver_current_status: string | null
          driver_display_name: string | null
          driver_name: string | null
          driver_phone: string | null
          drop_location: string | null
          id: string | null
          margin: number | null
          organization_id: string | null
          payment_status: string | null
          pickup_area: string | null
          pickup_date: string | null
          status: string | null
          supplier_name: string | null
          supplier_rate: number | null
          trip_number: string | null
          vehicle_display_number: string | null
          vehicle_number: string | null
          vehicle_type: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_client_revenue: {
        Row: {
          client_id: string | null
          client_name: string | null
          organization_id: string | null
          outstanding: number | null
          total_billed: number | null
          total_collected: number | null
          total_trips: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_driver_balances: {
        Row: {
          completed_trips: number | null
          current_balance: number | null
          driver_id: string | null
          driver_name: string | null
          organization_id: string | null
          phone: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drivers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_driver_tracking_health: {
        Row: {
          actual_distance_km: number | null
          anchor_at: string | null
          days_elapsed: number | null
          id: string | null
          target_km: number | null
          tracking_status: string | null
          trip_number: string | null
        }
        Insert: {
          actual_distance_km?: never
          anchor_at?: never
          days_elapsed?: never
          id?: string | null
          target_km?: never
          tracking_status?: never
          trip_number?: string | null
        }
        Update: {
          actual_distance_km?: never
          anchor_at?: never
          days_elapsed?: never
          id?: string | null
          target_km?: never
          tracking_status?: never
          trip_number?: string | null
        }
        Relationships: []
      }
      v_long_haul_health: {
        Row: {
          current_km: number | null
          expected_km: number | null
          health_status: string | null
          time_elapsed: string | null
          total_distance_km: number | null
          trip_id: string | null
          trip_number: string | null
        }
        Relationships: []
      }
      v_open_indents: {
        Row: {
          client_name: string | null
          client_price: number | null
          drop_location: string | null
          id: string | null
          indent_number: string | null
          organization_id: string | null
          pickup_area: string | null
          pickup_date: string | null
          quote_count: number | null
          status: string | null
          supplier_target: number | null
          vehicle_type: string | null
          weight: number | null
        }
        Relationships: [
          {
            foreignKeyName: "indents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string | null
          id: string | null
          role: string | null
          status: string | null
          updated_at: string | null
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          role?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          address_line: string | null
          business_pan: string | null
          business_type: string | null
          cin: string | null
          city: string | null
          created_at: string | null
          deleted_at: string | null
          employee_count: string | null
          gstin: string | null
          id: string | null
          kyc_rejected_reason: string | null
          logo_url: string | null
          name: string | null
          operating_model: string | null
          owner_id: string | null
          slug: string | null
          state: string | null
          updated_at: string | null
          verification_status:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          verified_at: string | null
          verified_by: string | null
          zone: string | null
        }
        Insert: {
          address_line?: string | null
          business_pan?: string | null
          business_type?: string | null
          cin?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          employee_count?: string | null
          gstin?: string | null
          id?: string | null
          kyc_rejected_reason?: string | null
          logo_url?: string | null
          name?: string | null
          operating_model?: string | null
          owner_id?: string | null
          slug?: string | null
          state?: string | null
          updated_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          verified_at?: string | null
          verified_by?: string | null
          zone?: string | null
        }
        Update: {
          address_line?: string | null
          business_pan?: string | null
          business_type?: string | null
          cin?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          employee_count?: string | null
          gstin?: string | null
          id?: string | null
          kyc_rejected_reason?: string | null
          logo_url?: string | null
          name?: string | null
          operating_model?: string | null
          owner_id?: string | null
          slug?: string | null
          state?: string | null
          updated_at?: string | null
          verification_status?:
            | Database["public"]["Enums"]["kyc_verification_status"]
            | null
          verified_at?: string | null
          verified_by?: string | null
          zone?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_bid: {
        Args: { p_actor_org_id: string; p_bid_id: string }
        Returns: undefined
      }
      accept_driver_invite: { Args: { p_invite_id: string }; Returns: Json }
      accept_partner_view: {
        Args: {
          contact_id?: string
          org_id: string
          partner_paid: number
          partner_sales: number
          trip_id: string
        }
        Returns: undefined
      }
      acknowledge_global_alert: {
        Args: { p_alert_key: string; p_org_id: string }
        Returns: undefined
      }
      acknowledge_ledger_messages_for_transaction: {
        Args: {
          p_acknowledged_at: string
          p_conversation_id: string
          p_message_id: string
        }
        Returns: number
      }
      add_driver_ledger_entry: {
        Args: {
          p_amount: number
          p_description?: string
          p_driver_id: string
          p_org_id: string
          p_reference_id?: string
          p_reference_type?: string
          p_trip_id?: string
          p_type: string
        }
        Returns: string
      }
      allocate_invoice_number: {
        Args: { p_financial_yr?: string; p_org_id: string }
        Returns: string
      }
      allocate_operational_sequence: {
        Args: { p_entity_type: string; p_org_id: string }
        Returns: number
      }
      apply_roster_deploy_from_direct_quote: {
        Args: { p_driver_id: string; p_quote_id: string; p_vehicle_id: string }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          organization_id: string
          owner_user_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          pod_received_at: string | null
          pod_required: boolean
          sequence_number: number | null
          source: string
          source_indent_code: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      archive_chat_messages: {
        Args: { p_batch?: number; p_older_than?: string }
        Returns: number
      }
      assign_aggregate_trip_driver: {
        Args: {
          p_driver_org_id: string
          p_driver_phone: string
          p_trip_id: string
          p_vehicle_display_number?: string
          p_vehicle_id?: string
        }
        Returns: Json
      }
      award_indent_to_trip: {
        Args: {
          p_driver_id?: string
          p_indent_id: string
          p_supplier_id?: string
          p_supplier_org_id?: string
          p_supplier_rate?: number
          p_vehicle_display_number?: string
          p_vehicle_id?: string
        }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          organization_id: string
          owner_user_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          pod_received_at: string | null
          pod_required: boolean
          sequence_number: number | null
          source: string
          source_indent_code: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      backfill_trip_room_operational_batch: {
        Args: { p_limit?: number }
        Returns: number
      }
      batch_award_indents_to_trips: {
        Args: { p_org_id: string }
        Returns: number
      }
      can_access_trip_location: {
        Args: { p_trip_id: string }
        Returns: boolean
      }
      change_trip_status_with_notification: {
        Args: {
          p_new_status: string
          p_organization_id: string
          p_trip_id: string
          p_user_id?: string
          p_user_name?: string
        }
        Returns: Json
      }
      check_ocr_scan_quota: { Args: { p_org_id: string }; Returns: Json }
      check_rate_limit: {
        Args: {
          p_max: number
          p_scope: string
          p_user_id: string
          p_window?: string
        }
        Returns: boolean
      }
      claim_trip_by_otp: {
        Args: { p_code: string; p_max_attempts?: number }
        Returns: Json
      }
      cleanup_expired_idempotency_keys: { Args: never; Returns: number }
      cleanup_rate_limits: { Args: { p_window?: string }; Returns: number }
      column_exists: {
        Args: { p_column: string; p_schema: string; p_table: string }
        Returns: boolean
      }
      compute_client_health_score: {
        Args: { p_client_id: string; p_org_id: string }
        Returns: Json
      }
      compute_compliance_score: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: Json
      }
      compute_driver_performance_score: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: Json
      }
      compute_supplier_reliability_score: {
        Args: { p_org_id: string; p_supplier_id: string }
        Returns: Json
      }
      compute_vehicle_performance_score: {
        Args: { p_org_id: string; p_vehicle_id: string }
        Returns: Json
      }
      confirm_to_accounting_books: {
        Args: { p_message_id: string; p_org_id: string }
        Returns: Json
      }
      confirm_trip_feedback: {
        Args: { p_msg_id: string; p_rating: number }
        Returns: Json
      }
      create_trip_from_assigned_indent: {
        Args: {
          p_driver_id?: string
          p_indent_id: string
          p_vehicle_display_number?: string
          p_vehicle_id?: string
        }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          organization_id: string
          owner_user_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          pod_received_at: string | null
          pod_required: boolean
          sequence_number: number | null
          source: string
          source_indent_code: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_trip_from_direct_quote: {
        Args: { p_quote_id: string; p_vehicle_display_number?: string }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          organization_id: string
          owner_user_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          pod_received_at: string | null
          pod_required: boolean
          sequence_number: number | null
          source: string
          source_indent_code: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      discover_extract_city: { Args: { p_location: string }; Returns: string }
      discover_organizations: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_org_id: string
          p_search?: string
        }
        Returns: {
          address_line: string
          avatar_seed: string
          avatar_url: string
          average_rating: number
          city: string
          connection_status: string
          id: string
          is_in_user_trip_city: boolean
          lane_overlap_count: number
          mutual_count: number
          name: string
          profile_role: string
          recommendation_score: number
          state: string
          trip_count: number
        }[]
      }
      dismiss_driver_signup_match: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      driver_has_assigned_trip_for_supplier: {
        Args: { p_supplier_id: string }
        Returns: boolean
      }
      driver_has_assigned_trip_for_trip_id: {
        Args: { p_trip_id: string }
        Returns: boolean
      }
      driver_has_other_active_trip: {
        Args: { p_current_trip_id?: string; p_driver_id: string }
        Returns: boolean
      }
      driver_phone_has_other_active_trip: {
        Args: { p_current_trip_id?: string; p_driver_id: string }
        Returns: boolean
      }
      driver_reject_trip: { Args: { p_trip_id: string }; Returns: undefined }
      driver_update_trip_status: {
        Args: {
          p_completed_at?: string
          p_started_at?: string
          p_status: string
          p_trip_id: string
        }
        Returns: undefined
      }
      emit_event: {
        Args: {
          p_aggregate_id: string
          p_aggregate_type: string
          p_caused_by?: string
          p_correlation_id?: string
          p_event_type: string
          p_metadata?: Json
          p_org_id?: string
          p_payload: Json
          p_user_id?: string
        }
        Returns: string
      }
      enforce_rpc_rate_limit: {
        Args: { p_max_requests: number; p_scope: string; p_window: string }
        Returns: undefined
      }
      enqueue_driver_signup_matches: {
        Args: { p_phone: string; p_user_id: string }
        Returns: number
      }
      ensure_chat_channel: {
        Args: {
          p_channel_key: string
          p_organization_id: string
          p_title?: string
        }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_direct_chat: {
        Args: { p_organization_id: string; p_peer_user_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_driver_signup_matches_for_driver: {
        Args: { p_driver_id: string }
        Returns: number
      }
      ensure_driver_trip_conversation: {
        Args: { p_driver_id: string; p_party_name: string; p_trip_id: string }
        Returns: {
          client_id: string | null
          created_at: string
          driver_id: string | null
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          organization_id: string
          party_name: string
          party_type: string
          supplier_id: string | null
          trip_id: string
          unread_dispatcher_count: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "trip_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      ensure_network_identity: {
        Args: {
          p_identity_type: string
          p_org_id: string
          p_primary_entity: string
          p_primary_id: string
        }
        Returns: string
      }
      ensure_trip_chat_room: {
        Args: { p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      execute_b2b_update: {
        Args: {
          p_event_type: string
          p_organization_id: string
          p_payload?: Json
          p_trip_id: string
        }
        Returns: Json
      }
      expire_old_posts: { Args: never; Returns: number }
      find_org_matches_for_counterparty: {
        Args: { p_min_similarity?: number; p_name: string; p_phone?: string }
        Returns: {
          org_city: string
          org_id: string
          org_name: string
          similarity_score: number
        }[]
      }
      fn_build_chat_lanes: { Args: { p_unified: Json }; Returns: Json }
      fn_can_access_trip_for_chat: {
        Args: { p_trip_id: string }
        Returns: boolean
      }
      fn_chat_can_access_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      fn_chat_ensure_conv_for_network: {
        Args: { p_network_conversation_id: string }
        Returns: string
      }
      fn_chat_ensure_conv_for_trip_lane: {
        Args: { p_trip_conversation_id: string }
        Returns: string
      }
      fn_chat_is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      fn_chat_is_participant: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      fn_ensure_trip_chat_room: {
        Args: { p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_ensure_trip_chat_room_core: {
        Args: { p_created_by?: string; p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_ensure_trip_party_conversations: {
        Args: { p_trip_id: string }
        Returns: undefined
      }
      fn_expire_workspace_products: { Args: never; Returns: undefined }
      fn_insert_driver_location_log_chat: {
        Args: {
          p_body: string
          p_metadata: Json
          p_priority_weight?: number
          p_trip_id: string
        }
        Returns: undefined
      }
      fn_mirror_legacy_trip_message_to_room: {
        Args: { p_msg_id: string }
        Returns: boolean
      }
      fn_post_system_log_to_trip_chats: {
        Args: {
          p_content: string
          p_metadata: Json
          p_priority_weight?: number
          p_trip_id: string
        }
        Returns: undefined
      }
      fn_post_system_message_to_trip_chats:
        | {
            Args: {
              p_content: string
              p_dedupe_status?: string
              p_trip_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_content: string
              p_dedupe_status?: string
              p_simulated?: boolean
              p_trip_id: string
            }
            Returns: undefined
          }
      fn_post_trip_feedback_prompt_to_chats: {
        Args: { p_trip_id: string }
        Returns: undefined
      }
      fn_post_trip_room_action_card: {
        Args: {
          p_body?: string
          p_created_at?: string
          p_event_type: string
          p_legacy_msg_id?: string
          p_metadata?: Json
          p_title: string
          p_trip_id: string
        }
        Returns: undefined
      }
      fn_reconcile_trip_conversation_unread: {
        Args: { p_conversation_id: string }
        Returns: number
      }
      fn_storage_trip_doc_access: { Args: { p_name: string }; Returns: boolean }
      fn_sync_trip_room_participants: {
        Args: { p_conversation_id: string; p_trip_id: string }
        Returns: undefined
      }
      fn_trip_location_city_hint: {
        Args: { p_trip_id: string }
        Returns: string
      }
      fn_trip_message_counts_as_dispatcher_unread: {
        Args: { p_message_type: string; p_sender_role: string }
        Returns: boolean
      }
      fn_trip_status_chat_message_body: {
        Args: { p: Database["public"]["Tables"]["trips"]["Row"] }
        Returns: string
      }
      generate_enterprise_operational_code: {
        Args: { p_entity_type: string; p_org_id: string }
        Returns: string
      }
      generate_global_reference: {
        Args: { p_entity_id: string; p_entity_type: string; p_org_id?: string }
        Returns: string
      }
      generate_operational_code: {
        Args: { entity_type: string; org_id: string }
        Returns: string
      }
      generate_trip_otp: {
        Args: { p_trip_id: string; p_ttl_minutes?: number }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      get_active_driver_stint: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: {
          commission_per_km: number
          commission_percent: number
          hired_at: string
          id: string
          name: string
          organization_id: string
          payable_amount: number
          phone: string
          status: string
          user_id: string
        }[]
      }
      get_active_products: {
        Args: { p_org_id: string }
        Returns: {
          expires_at: string
          product_id: string
          status: string
          trial_ends_at: string
        }[]
      }
      get_audit_log_for_org: {
        Args: { p_limit?: number; p_offset?: number; p_org_id: string }
        Returns: {
          actor_email: string
          actor_name: string
          created_at: string
          event_type: string
          id: string
          payload: Json
        }[]
      }
      get_b2b_chat_bootstrap: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_chat_inbox: {
        Args: { p_before?: string; p_limit?: number; p_organization_id: string }
        Returns: {
          channel_key: string
          client_id: string
          conversation_type: string
          created_at: string
          driver_id: string
          id: string
          is_archived: boolean
          last_message_at: string
          last_message_preview: string
          message_count: number
          metadata: Json
          my_last_read_at: string
          organization_id: string
          supplier_id: string
          title: string
          trip_id: string
          unread_count: number
        }[]
      }
      get_chat_messages: {
        Args: { p_before?: string; p_conversation_id: string; p_limit?: number }
        Returns: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_client_detail_bundle: {
        Args: { p_client_id: string; p_org_id: string }
        Returns: Json
      }
      get_client_details: { Args: { p_client_id: string }; Returns: Json }
      get_client_management_bundle: {
        Args: { p_client_id: string; p_org_id: string }
        Returns: Json
      }
      get_client_monthly_analytics: {
        Args: { p_client_id: string; p_months_back?: number; p_org_id: string }
        Returns: {
          avg_payment_delay_days: number
          cancellation_rate_pct: number
          collected: number
          km_driven: number
          margin: number
          margin_pct: number
          on_time_pct: number
          outstanding: number
          period: string
          revenue: number
          trip_count: number
        }[]
      }
      get_clients_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_clients_with_profiles: {
        Args: { p_org_id: string }
        Returns: {
          address: string
          avatar_seed: string
          avatar_url: string
          contact_person: string
          created_at: string
          email: string
          gstin: string
          id: string
          is_integrated: boolean
          linked_organization_id: string
          name: string
          organization_id: string
          pan_number: string
          phone: string
          status: string
          updated_at: string
        }[]
      }
      get_compliance_summary: {
        Args: { p_org_id: string }
        Returns: {
          active_docs: number
          entity_type: string
          expired_docs: number
          expiring_30d: number
          expiring_7d: number
          pending_docs: number
          total_docs: number
          verified_docs: number
        }[]
      }
      get_connection_partner_display: {
        Args: { p_linked_organization_id: string }
        Returns: Json
      }
      get_connection_partner_display_batch: {
        Args: { p_linked_organization_ids: string[] }
        Returns: Json
      }
      get_connection_requests_received_with_names: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          from_org_name: string
          from_organization_id: string
          id: string
          request_carrier_supplier: boolean
          request_shipper_client: boolean
          responded_at: string
          responded_by: string
          status: string
          to_org_name: string
          to_organization_id: string
        }[]
      }
      get_connection_requests_sent_with_names: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          from_org_name: string
          from_organization_id: string
          id: string
          request_carrier_supplier: boolean
          request_shipper_client: boolean
          responded_at: string
          responded_by: string
          status: string
          to_org_name: string
          to_organization_id: string
        }[]
      }
      get_db_capabilities: { Args: never; Returns: Json }
      get_db_observability_summary: { Args: never; Returns: Json }
      get_direct_quotes_with_bidder_names: {
        Args: { p_indent_id: string }
        Returns: {
          amount: number
          bidder_organization_id: string
          bidder_organization_name: string
          created_at: string
          driver_id: string
          id: string
          indent_id: string
          notes: string
          status: string
          updated_at: string
          vehicle_id: string
        }[]
      }
      get_driver_balance: { Args: { p_driver_id: string }; Returns: number }
      get_driver_coalesced_email_for_org: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: {
          email: string
        }[]
      }
      get_driver_detail_bundle: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: Json
      }
      get_driver_invite_sent_status: {
        Args: { p_org_id: string; p_to_user_id: string }
        Returns: {
          status: string
        }[]
      }
      get_driver_invitee_by_phone: {
        Args: { p_phone: string }
        Returns: {
          email: string
          emergency_contact_name: string
          emergency_contact_phone: string
          full_name: string
          is_in_fleet: boolean
          license_number: string
          phone: string
          user_id: string
        }[]
      }
      get_driver_invites_received: {
        Args: never
        Returns: {
          commission_per_km: number
          commission_percent: number
          created_at: string
          from_org_avatar_seed: string
          from_org_avatar_url: string
          from_org_name: string
          from_organization_id: string
          id: string
          payable_amount: number
          responded_at: string
          responded_by: string
          status: string
          to_user_id: string
        }[]
      }
      get_driver_invites_sent: {
        Args: { p_org_id: string }
        Returns: {
          created_at: string
          driver_name: string
          from_org_name: string
          id: string
          status: string
          to_user_id: string
        }[]
      }
      get_driver_latest_location: {
        Args: { p_driver_id: string }
        Returns: {
          accuracy: number
          latitude: number
          longitude: number
          recorded_at: string
        }[]
      }
      get_driver_location_history_for_trip: {
        Args: { p_limit?: number; p_trip_id: string }
        Returns: {
          latitude: number
          longitude: number
          recorded_at: string
        }[]
      }
      get_driver_monthly_analytics: {
        Args: { p_driver_id: string; p_months_back?: number; p_org_id: string }
        Returns: {
          earnings: number
          km_driven: number
          paid: number
          period: string
          revenue: number
          trip_count: number
        }[]
      }
      get_driver_phone_active_trip: {
        Args: { p_exclude_trip_id?: string; p_phone: string }
        Returns: Json
      }
      get_driver_previous_rows_by_identity: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: {
          created_at: string
          id: string
          left_at: string
          name: string
          phone: string
          user_id: string
        }[]
      }
      get_driver_profile_display: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      get_driver_profile_display_batch: {
        Args: { p_driver_ids: string[] }
        Returns: Json
      }
      get_driver_signup_match_status: {
        Args: { p_driver_id: string }
        Returns: {
          detected_at: string
          id: string
          matched_user_id: string
          state: string
        }[]
      }
      get_driver_stint_history: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: {
          commission_per_km: number
          commission_percent: number
          hired_at: string
          id: string
          left_at: string
          name: string
          organization_id: string
          payable_amount: number
          phone: string
          user_id: string
        }[]
      }
      get_driver_tenures: {
        Args: { p_driver_id: string; p_org_id: string }
        Returns: {
          created_at: string
          driver_id: string
          id: string
          joined_at: string
          left_at: string
          organization_id: string
          trip_count: number
        }[]
      }
      get_drivers_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_drivers_with_profiles: {
        Args: { p_org_id: string }
        Returns: {
          assigned_vehicle_id: string
          avatar_seed: string
          avatar_url: string
          commission_per_km: number
          commission_percent: number
          created_at: string
          email: string
          id: string
          left_at: string
          name: string
          organization_id: string
          payable_amount: number
          phone: string
          status: string
          tracking_only: boolean
          updated_at: string
          user_id: string
        }[]
      }
      get_email_by_phone: { Args: { p_phone: string }; Returns: string }
      get_expiring_documents: {
        Args: { p_days_ahead?: number; p_org_id: string }
        Returns: {
          days_until: number
          doc_label: string
          doc_number: string
          doc_type: string
          entity_id: string
          entity_type: string
          expiry_date: string
          id: string
          status: string
        }[]
      }
      get_global_app_bootstrap: { Args: { p_org_id: string }; Returns: Json }
      get_identity_health: { Args: { p_since?: string }; Returns: Json }
      get_indents_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_initial_chat_state:
        | {
            Args: {
              p_hub_trip_bucket?: string
              p_message_limit?: number
              p_organization_id: string
              p_trip_limit?: number
              p_trip_offset?: number
            }
            Returns: Json
          }
        | {
            Args: {
              p_hub_trip_bucket?: string
              p_include_message_bodies?: boolean
              p_message_limit?: number
              p_organization_id: string
              p_trip_limit?: number
              p_trip_offset?: number
            }
            Returns: Json
          }
      get_integrated_partners: { Args: { p_org_id: string }; Returns: Json }
      get_invitee_by_phone: {
        Args: { p_phone: string }
        Returns: {
          full_name: string
          organization_id: string
          organization_name: string
          phone: string
          profile_company_name: string
          profile_role: string
        }[]
      }
      get_invitees_by_phones: {
        Args: { p_phones: string[] }
        Returns: {
          full_name: string
          organization_id: string
          organization_name: string
          phone: string
          profile_company_name: string
          profile_role: string
        }[]
      }
      get_last_n_locations_for_trip: {
        Args: { p_n?: number; p_trip_id: string }
        Returns: {
          latitude: number
          longitude: number
          recorded_at: string
        }[]
      }
      get_last_trip_location: { Args: { p_trip_id: string }; Returns: Json }
      get_latest_assignment_audit_by_trip_ids: {
        Args: { p_trip_ids: string[] }
        Returns: {
          changed_at: string
          changed_by: string
          trip_id: string
        }[]
      }
      get_latest_driver_location_for_trip: {
        Args: { p_trip_id: string }
        Returns: Json
      }
      get_multi_lane_bootstrap: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_mutual_connections: {
        Args: { p_target_org_id: string; p_viewer_org_id: string }
        Returns: {
          avatar_seed: string
          avatar_url: string
          id: string
          name: string
        }[]
      }
      get_network_conversations_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_network_feed: {
        Args: { p_limit?: number; p_offset?: number; p_org_id: string }
        Returns: {
          author_user_id: string
          bid_count: number
          content: string
          created_at: string
          destination: string
          expires_at: string
          id: string
          is_active: boolean
          load_date: string
          material: string
          org_avatar_seed: string
          org_name: string
          organization_id: string
          origin: string
          rate_offer: number
          source_indent_id: string
          type: string
          vehicle_type: string
          view_count: number
          weight_tonnes: number
        }[]
      }
      get_next_trip_sequence_for_org: {
        Args: { p_org_id: string }
        Returns: number
      }
      get_ocr_metrics: {
        Args: { p_days?: number; p_org_id: string }
        Returns: {
          avg_confidence: number
          avg_duration_ms: number
          duplicate_count: number
          failed_count: number
          jobs_in_window: number
          jobs_this_month: number
          jobs_today: number
          quota_limit: number
          quota_remaining: number
          quota_tier: string
          quota_used: number
        }[]
      }
      get_org_active_products: {
        Args: { p_org_id: string }
        Returns: {
          activated_at: string
          billing_cycle: string
          days_remaining: number
          expires_at: string
          product_id: string
          seats: number
          status: string
          trial_ends_at: string
        }[]
      }
      get_org_ledger_summary: {
        Args: { p_from?: string; p_org_id: string; p_to?: string }
        Returns: {
          net_balance: number
          payables: number
          receivables: number
          total_in: number
          total_out: number
        }[]
      }
      get_org_members_with_profiles: {
        Args: { p_org_id: string }
        Returns: {
          avatar_seed: string
          avatar_url: string
          email: string
          full_name: string
          id: string
          joined_at: string
          organization_id: string
          permissions: Json
          phone: string
          role: string
          status: string
          user_id: string
        }[]
      }
      get_org_trip_metrics: {
        Args: { p_org_id: string }
        Returns: {
          active_trips: number
          completed_trips: number
          last_trip_updated_at: string
          total_cost: number
          total_margin: number
          total_revenue: number
          total_trips: number
        }[]
      }
      get_organizations_for_user: {
        Args: never
        Returns: {
          id: string
          name: string
          owner_id: string
          slug: string
        }[]
      }
      get_partner_trip_ids_for_shared_ledger_focus: {
        Args: { org_id: string; partner_key: string; viewer_trip_id: string }
        Returns: string[]
      }
      get_pending_otp_claim_count: { Args: never; Returns: Json }
      get_pending_otp_trips: {
        Args: never
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          organization_id: string
          owner_user_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          pod_received_at: string | null
          pod_required: boolean
          sequence_number: number | null
          source: string
          source_indent_code: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_platform_health: { Args: never; Returns: Json }
      get_pod_reconciliation_summary: {
        Args: { p_organization_id?: string }
        Returns: {
          approved_count: number
          approved_sum: number
          invoiced_count: number
          invoiced_sum: number
          pod_pending_count: number
          pod_pending_sum: number
          received_count: number
          received_sum: number
        }[]
      }
      get_safe_fallback_indent_number: { Args: never; Returns: string }
      get_safe_fallback_trip_number: { Args: never; Returns: string }
      get_shared_ledger_entries: {
        Args: { org_id: string; partner_key: string }
        Returns: {
          amount: number
          id: string
          reference_id: string
          transaction_date: string
        }[]
      }
      get_shared_ledger_notifications: {
        Args: { org_id: string; status_filter?: string }
        Returns: {
          amount_meta: number | null
          created_at: string
          dedupe_key: string | null
          event_type: string
          handled_at: string | null
          handled_by_user_id: string | null
          id: string
          organization_id: string
          partner_key: string | null
          partner_org_id: string | null
          payload_json: Json
          read_at: string | null
          source_dispute_id: string | null
          status: string
          subtitle: string | null
          title: string
          transaction_id: string | null
          trip_id: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "shared_ledger_notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_shared_ledger_notifications_count: {
        Args: { org_id: string }
        Returns: number
      }
      get_shared_ledger_trip_summary: {
        Args: { org_id: string; partner_key: string }
        Returns: {
          partner_paid: number
          partner_sales: number
          trip_id: string
        }[]
      }
      get_shared_trip_finance_adjustments: {
        Args: { org_id: string; partner_key: string }
        Returns: {
          amount: number
          created_at: string
          id: string
          impact: string
          mission_key: string
          organization_id: string
          reason: string
          trip_id: string
          type: string
          void_reason: string
          voided_at: string
        }[]
      }
      get_shipper_display_names_for_supplier_trips: {
        Args: { p_org_id: string }
        Returns: {
          shipper_display_name: string
          trip_id: string
        }[]
      }
      get_supplier_details: { Args: { p_supplier_id: string }; Returns: Json }
      get_supplier_management_bundle: {
        Args: { p_org_id: string; p_supplier_id: string }
        Returns: Json
      }
      get_supplier_monthly_analytics: {
        Args: {
          p_months_back?: number
          p_org_id: string
          p_supplier_id: string
        }
        Returns: {
          avg_settlement_days: number
          cancellation_rate_pct: number
          km_driven: number
          margin_contribution: number
          margin_contribution_pct: number
          on_time_pct: number
          outstanding: number
          paid: number
          period: string
          revenue_handled: number
          supplier_payable: number
          trip_count: number
        }[]
      }
      get_supplier_trip_ids_for_org: {
        Args: { p_org_id: string }
        Returns: Json
      }
      get_suppliers_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_suppliers_with_profiles: {
        Args: { p_org_id: string }
        Returns: {
          address: string
          avatar_seed: string
          avatar_url: string
          company_name: string
          contact: string
          contact_person: string
          created_at: string
          email: string
          gstin: string
          id: string
          is_active: boolean
          is_verified: boolean
          linked_organization_id: string
          name: string
          organization_id: string
          phone: string
          supplier_type: string
          updated_at: string
        }[]
      }
      get_transactions_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_trip_assigner_displays_for_driver: {
        Args: { p_trip_ids: string[] }
        Returns: {
          assigner_user_id: string
          assigning_organization_id: string
          assigning_organization_logo_url: string
          assigning_organization_name: string
          display_name: string
          trip_id: string
        }[]
      }
      get_trip_chat_room: {
        Args: { p_trip_id: string }
        Returns: {
          channel_key: string | null
          client_id: string | null
          conversation_type: string
          created_at: string
          created_by: string | null
          driver_id: string | null
          id: string
          is_archived: boolean
          last_message_at: string | null
          last_message_preview: string | null
          legacy_network_conversation_id: string | null
          legacy_trip_conversation_id: string | null
          message_count: number
          metadata: Json
          organization_id: string
          supplier_id: string | null
          title: string | null
          trip_id: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_conversations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_trip_detail_bundle: {
        Args: { p_trip_id: string; p_viewer_org_id: string }
        Returns: Json
      }
      get_trip_otp: {
        Args: { p_trip_id: string }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      get_trip_status_summary: {
        Args: { p_org_id: string }
        Returns: {
          count: number
          status: string
        }[]
      }
      get_trips_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_trips_for_org: { Args: { p_org_id: string }; Returns: Json[] }
      get_trips_for_pod_org: { Args: { p_org_id: string }; Returns: Json[] }
      get_trips_where_org_is_client: {
        Args: { p_org_id: string }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          organization_id: string
          owner_user_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          pod_received_at: string | null
          pod_required: boolean
          sequence_number: number | null
          source: string
          source_indent_code: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_trips_where_org_is_supplier: {
        Args: { p_org_id: string }
        Returns: {
          actual_distance_traveled_km: number | null
          advance_paid: number
          amount_paid: number
          assigned_by_user_id: string | null
          booking_ref: string | null
          client_id: string | null
          client_name: string
          client_price: number
          completed_at: string | null
          converted_by: string | null
          converted_from_indent_at: string | null
          created_at: string | null
          created_by_user_id: string | null
          deleted_at: string | null
          display_trip_id: string | null
          distance: number | null
          distance_discrepancy_km: number | null
          distance_source: string | null
          driver_commission: number
          driver_display_name: string | null
          driver_display_trip_id: string | null
          driver_id: string | null
          drop_lat: number | null
          drop_location: string
          drop_lon: number | null
          end_odometer_km: number | null
          estimated_duration: string | null
          gps_distance_km: number | null
          id: string
          indent_id: string | null
          indent_reference_code: string | null
          is_guaranteed: boolean
          last_location_at: string | null
          last_location_chat_at: string | null
          load_tons: number | null
          load_type: string | null
          margin: number | null
          notes: string | null
          odometer_distance_km: number | null
          odometer_notes: string | null
          odometer_updated_at: string | null
          odometer_updated_by: string | null
          odometer_verification_state: string
          organization_id: string
          owner_user_id: string | null
          payment_status: string
          pickup_area: string
          pickup_date: string | null
          pickup_lat: number | null
          pickup_lon: number | null
          platform_fee: number
          pod_received_at: string | null
          pod_required: boolean
          sequence_number: number | null
          source: string
          source_indent_code: string | null
          source_indent_id: string | null
          start_odometer_km: number | null
          started_at: string | null
          status: string
          status_change_origin: string | null
          supplier_id: string | null
          supplier_rate: number
          trip_code: string | null
          trip_number: string
          trip_operational_code: string | null
          trip_payout_mode: string | null
          updated_at: string | null
          vehicle_display_number: string | null
          vehicle_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trips"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_unified_b2b_bootstrap: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_unlinked_counterparties: {
        Args: { p_org_id: string }
        Returns: {
          counterparty_name: string
          counterparty_type: string
          last_trip_date: string
          trip_count: number
        }[]
      }
      get_vehicle_monthly_analytics: {
        Args: { p_months_back?: number; p_org_id: string; p_vehicle_id: string }
        Returns: {
          expense: number
          km_driven: number
          margin_pct: number
          period: string
          profit: number
          revenue: number
          trip_count: number
        }[]
      }
      get_vehicles_delta: {
        Args: { p_limit?: number; p_org_id: string; p_since: string }
        Returns: Json
      }
      get_whatsapp_bootstrap_data: {
        Args: {
          p_hub_trip_bucket?: string
          p_include_message_bodies?: boolean
          p_message_limit?: number
          p_organization_id: string
          p_trip_limit?: number
          p_trip_offset?: number
        }
        Returns: Json
      }
      get_workspace_kyc_status: { Args: { p_org_id: string }; Returns: Json }
      global_search: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_org_id?: string
          p_query: string
          p_types?: string[]
        }
        Returns: {
          display_name: string
          entity_id: string
          entity_type: string
          network_ref: string
          org_id: string
          rank: number
          reference: string
          secondary_ref: string
        }[]
      }
      idempotency_acquire: {
        Args: {
          p_entity_type: string
          p_key: string
          p_org_id: string
          p_req_hash: string
          p_user_id: string
        }
        Returns: Json
      }
      idempotency_complete: {
        Args: { p_entity_id: string; p_key: string; p_response?: Json }
        Returns: undefined
      }
      idempotency_fail: {
        Args: { p_error: string; p_key: string }
        Returns: undefined
      }
      increment_product_usage: {
        Args: {
          p_metric_key: string
          p_org_id: string
          p_product_id: string
          p_quantity?: number
        }
        Returns: undefined
      }
      indent_creator_org_names_for_viewer: {
        Args: { p_trip_numbers: string[]; p_viewer_org: string }
        Returns: {
          creator_org_name: string
          trip_number: string
        }[]
      }
      is_app_migration_applied: {
        Args: { p_version: string }
        Returns: boolean
      }
      is_compliance_blocking: {
        Args: { p_driver_id?: string; p_vehicle_id?: string }
        Returns: Json
      }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_uuidv4: { Args: { p_id: string }; Returns: boolean }
      is_uuidv7: { Args: { p_id: string }; Returns: boolean }
      is_valid_business_reference: { Args: { p_ref: string }; Returns: boolean }
      join_product_waitlist: {
        Args: {
          p_company_name?: string
          p_email: string
          p_fleet_size?: string
          p_full_name?: string
          p_org_id: string
          p_product_id: string
          p_use_case?: string
        }
        Returns: Json
      }
      kill_idle_in_transaction_sessions: {
        Args: { p_threshold?: string }
        Returns: {
          duration: string
          pid: number
          query: string
          terminated: boolean
        }[]
      }
      leave_fleet: { Args: { p_organization_id: string }; Returns: undefined }
      link_driver_phone: {
        Args: { p_driver_id: string; p_phone: string }
        Returns: Json
      }
      log_client_audit: {
        Args: {
          p_action: string
          p_client_id: string
          p_entity_id: string
          p_entity_type: string
          p_field_name?: string
          p_new_value?: string
          p_old_value?: string
          p_org_id: string
        }
        Returns: undefined
      }
      log_id_generation: {
        Args: {
          p_entity_id?: string
          p_entity_type: string
          p_generated: string
          p_latency_ms?: number
          p_org_id: string
          p_path?: string
          p_reference?: string
        }
        Returns: undefined
      }
      lookup_by_reference: {
        Args: { p_ref: string }
        Returns: {
          entity_id: string
          entity_type: string
          org_id: string
        }[]
      }
      make_operational_org_code: {
        Args: { p_org_id: string; p_org_name: string; p_salt?: number }
        Returns: string
      }
      mark_chat_conversation_read: {
        Args: { p_conversation_id: string; p_up_to?: string }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_delivered: { Args: { p_message_ids: string[] }; Returns: undefined }
      mark_messages_seen: {
        Args: { p_conversation_id: string; p_message_ids: string[] }
        Returns: undefined
      }
      mark_network_conversation_read: {
        Args: { p_conversation_id: string; p_reader_org_id: string }
        Returns: undefined
      }
      mark_shared_ledger_notification_handled: {
        Args: { p_id: string; p_org_id: string }
        Returns: undefined
      }
      mark_shared_ledger_notification_read: {
        Args: { p_id: string; p_org_id: string }
        Returns: undefined
      }
      market_indents_for_org: {
        Args: { org_id: string }
        Returns: {
          assigned_supplier_id: string
          assigned_supplier_rate: number
          circulation_target: string
          client_name: string
          client_price: number
          created_at: string
          creator_organization_name: string
          drop_location: string
          id: string
          indent_number: string
          load_type: string
          organization_id: string
          pickup_area: string
          pickup_date: string
          status: string
          supplier_target: number
          updated_at: string
          vehicle_type: string
        }[]
      }
      match_driver_by_phone: {
        Args: {
          p_org_id: string
          p_phone: string
          p_require_unlinked?: boolean
        }
        Returns: {
          assigned_vehicle_id: string | null
          avatar_seed: string | null
          avatar_url: string | null
          commission_per_km: number | null
          commission_percent: number | null
          created_at: string | null
          deleted_at: string | null
          driver_code: string | null
          email: string | null
          emergency_contact: string | null
          emergency_name: string | null
          hired_at: string
          id: string
          left_at: string | null
          license_number: string | null
          name: string
          organization_id: string
          payable_amount: number | null
          phone: string | null
          status: string
          tracking_only: boolean
          updated_at: string | null
          user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "drivers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      my_organization_ids: { Args: never; Returns: string[] }
      next_indent_number: { Args: { p_org_id: string }; Returns: string }
      next_operational_sequence_value: {
        Args: { p_entity_type: string; p_org_id: string }
        Returns: number
      }
      next_trip_number: { Args: { p_org_id: string }; Returns: string }
      normalize_phone_last10: { Args: { p_phone: string }; Returns: string }
      normalize_phone_number: { Args: { p: string }; Returns: string }
      operational_prefix_for_entity: {
        Args: { p_entity_type: string }
        Returns: string
      }
      ops_agent_rate_limit_try_consume: {
        Args: {
          p_max_per_window?: number
          p_user_id: string
          p_window_seconds?: number
        }
        Returns: Json
      }
      organization_name_is_taken: { Args: { p_name: string }; Returns: boolean }
      process_b2b_event: {
        Args: {
          p_event_type: string
          p_organization_id: string
          p_payload?: Json
          p_trip_id: string
        }
        Returns: Json
      }
      record_activity: {
        Args: {
          p_activity_type: string
          p_actor_id: string
          p_actor_name: string
          p_actor_type: string
          p_context?: Json
          p_is_public?: boolean
          p_org_id?: string
          p_target_id: string
          p_target_name?: string
          p_target_ref?: string
          p_target_type: string
        }
        Returns: string
      }
      refresh_dashboard_trip_metrics: { Args: never; Returns: undefined }
      regenerate_trip_otp: {
        Args: { p_trip_id: string; p_ttl_minutes?: number }
        Returns: {
          code: string
          expires_at: string
        }[]
      }
      register_push_token: {
        Args: { p_platform: string; p_token: string }
        Returns: undefined
      }
      reject_driver_invite: {
        Args: { p_invite_id: string }
        Returns: undefined
      }
      reopen_driver_invite: {
        Args: {
          p_commission_per_km?: number
          p_commission_percent?: number
          p_from_org_name?: string
          p_invitee_name?: string
          p_org_id: string
          p_payable_amount?: number
          p_to_user_id: string
        }
        Returns: Json
      }
      reset_driver_signup_invite: {
        Args: { p_driver_id: string }
        Returns: Json
      }
      resolve_dispute:
        | {
            Args: {
              p_action: string
              p_dispute_id: string
              p_resolved_by_org_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_actor_org_id: string
              p_dispute_id: string
              p_resolution: string
            }
            Returns: undefined
          }
      resolve_ocr_scan_monthly_limit: {
        Args: { p_org_id: string }
        Returns: {
          monthly_limit: number
          tier: string
        }[]
      }
      search_chat_messages: {
        Args: { p_limit?: number; p_organization_id: string; p_query: string }
        Returns: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      send_chat_message: {
        Args: {
          p_client_message_id?: string
          p_content: string
          p_conversation_id: string
          p_mentions?: string[]
          p_message_type?: string
          p_metadata?: Json
          p_reply_to_id?: string
        }
        Returns: {
          client_message_id: string | null
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          legacy_source: string | null
          message_type: string
          metadata: Json
          organization_id: string
          reply_to_id: string | null
          sender_name: string
          sender_role: string | null
          sender_type: string
          sender_user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_driver_signup_match_invite:
        | { Args: { p_driver_id: string }; Returns: Json }
        | {
            Args: {
              p_commission_per_km?: number
              p_commission_percent?: number
              p_driver_id: string
              p_payable_amount?: number
            }
            Returns: Json
          }
      send_trip_chat_message: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_message_type?: string
          p_metadata?: Json
          p_sender_name: string
          p_sender_role: string
          p_sender_user_id?: string
        }
        Returns: {
          content: string
          context_indent_id: string | null
          context_trip_id: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean
          is_delivered: boolean
          is_read: boolean
          message_type: string
          metadata: Json | null
          organization_id: string
          priority_weight: number
          reactions: Json | null
          read_at: string | null
          reply_to_id: string | null
          reply_to_preview: Json | null
          sender_avatar_seed: string | null
          sender_name: string
          sender_role: string
          sender_user_id: string | null
          visibility_tags: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "trip_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      soft_delete_trip: {
        Args: { p_org_id: string; p_trip_id: string }
        Returns: undefined
      }
      stress_test_chat_messages: {
        Args: {
          p_batch_delay_ms?: number
          p_batch_size?: number
          p_conversation_id: string
          p_message_count?: number
          p_organization_id: string
        }
        Returns: {
          avg_insert_ms: number
          elapsed_ms: number
          messages_inserted: number
        }[]
      }
      submit_atomic_feedback: {
        Args: {
          p_comment?: string
          p_message_id: string
          p_organization_id: string
          p_rated_id: string
          p_rated_type: string
          p_score: number
          p_tags?: string[]
          p_trip_id: string
        }
        Returns: Json
      }
      submit_business_event: {
        Args: {
          p_content: string
          p_conversation_id?: string
          p_event_type: string
          p_metadata?: Json
          p_new_trip_status?: string
          p_organization_id: string
          p_trip_id: string
          p_user_id?: string
          p_user_name?: string
        }
        Returns: Json
      }
      submit_pulse_bid_with_direct_quote: {
        Args: {
          p_amount: number
          p_bidder_org_id: string
          p_note: string
          p_post_id: string
        }
        Returns: Json
      }
      submit_trip_feedback: {
        Args: {
          p_message_id: string
          p_organization_id: string
          p_rated_id: string
          p_rated_type: string
          p_score: number
          p_tags: string[]
          p_trip_id: string
        }
        Returns: Json
      }
      sync_driver_rows_user_id_for_profile: {
        Args: { p_profile_id: string }
        Returns: number
      }
      sync_my_driver_rows_user_id: { Args: never; Returns: number }
      toggle_chat_reaction: {
        Args: { p_emoji: string; p_message_id: string }
        Returns: Json
      }
      toggle_trip_message_reaction: {
        Args: {
          p_emoji: string
          p_message_id: string
          p_org_id: string
          p_user_id: string
        }
        Returns: Json
      }
      tracking_record_checkpoint: {
        Args: {
          p_accuracy?: number
          p_driver_id: string
          p_heading?: number
          p_latitude: number
          p_longitude: number
          p_org_id: string
          p_recorded_at?: string
          p_session_id: string
          p_source?: string
          p_speed_kmh?: number
          p_trip_id: string
        }
        Returns: Json
      }
      trip_otp_increment_failed: {
        Args: { p_code: string }
        Returns: undefined
      }
      update_organization_logo: {
        Args: { p_logo_url: string; p_org_id: string }
        Returns: undefined
      }
      update_workspace_kyc: {
        Args: {
          p_cin?: string
          p_gstin?: string
          p_org_id: string
          p_pan?: string
        }
        Returns: Json
      }
      upsert_entity_anchor: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_legacy_ref?: string
          p_org_id: string
        }
        Returns: undefined
      }
      uuidv7_generate: { Args: never; Returns: string }
      uuidv7_timestamp: { Args: { p_id: string }; Returns: string }
      validate_identity_integrity: { Args: { p_since?: string }; Returns: Json }
      windowed_trip_message_history: {
        Args: {
          p_before?: string
          p_conversation_id: string
          p_limit?: number
          p_party_type?: string
        }
        Returns: {
          content: string
          context_indent_id: string | null
          context_trip_id: string | null
          conversation_id: string
          created_at: string
          delivered_at: string | null
          edited_at: string | null
          id: string
          is_deleted: boolean
          is_delivered: boolean
          is_read: boolean
          message_type: string
          metadata: Json | null
          organization_id: string
          priority_weight: number
          reactions: Json | null
          read_at: string | null
          reply_to_id: string | null
          reply_to_preview: Json | null
          sender_avatar_seed: string | null
          sender_name: string
          sender_role: string
          sender_user_id: string | null
          visibility_tags: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "trip_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      kyc_verification_status:
        | "unverified"
        | "pending"
        | "verified"
        | "rejected"
      ocr_job_status: "pending" | "processing" | "completed" | "failed"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      kyc_verification_status: [
        "unverified",
        "pending",
        "verified",
        "rejected",
      ],
      ocr_job_status: ["pending", "processing", "completed", "failed"],
    },
  },
} as const;
