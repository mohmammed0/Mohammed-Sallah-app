export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          attempts: number;
          completed_at: string | null;
          failure_category: string | null;
          id: string;
          last_attempt_at: string | null;
          last_error_at: string | null;
          locked_at: string | null;
          requested_at: string;
          retention_snapshot: Json;
          scheduled_at: string;
          status: string;
          user_id: string;
          verified_at: string | null;
          version: number;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          failure_category?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          last_error_at?: string | null;
          locked_at?: string | null;
          requested_at?: string;
          retention_snapshot?: Json;
          scheduled_at?: string;
          status?: string;
          user_id: string;
          verified_at?: string | null;
          version?: number;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          failure_category?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          last_error_at?: string | null;
          locked_at?: string | null;
          requested_at?: string;
          retention_snapshot?: Json;
          scheduled_at?: string;
          status?: string;
          user_id?: string;
          verified_at?: string | null;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'account_deletion_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      account_reauthentications: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          method: string;
          session_id: string;
          user_id: string;
          verified_at: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          method: string;
          session_id: string;
          user_id: string;
          verified_at?: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          method?: string;
          session_id?: string;
          user_id?: string;
          verified_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'account_reauthentications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      addresses: {
        Row: {
          access_notes: string | null;
          address_kind: string;
          building: string | null;
          city_id: string;
          created_at: string;
          deleted_at: string | null;
          district_id: string | null;
          formatted_address: string;
          id: string;
          is_default: boolean;
          label: string;
          location: unknown;
          unit: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_notes?: string | null;
          address_kind?: string;
          building?: string | null;
          city_id: string;
          created_at?: string;
          deleted_at?: string | null;
          district_id?: string | null;
          formatted_address: string;
          id?: string;
          is_default?: boolean;
          label: string;
          location: unknown;
          unit?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_notes?: string | null;
          address_kind?: string;
          building?: string | null;
          city_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          district_id?: string | null;
          formatted_address?: string;
          id?: string;
          is_default?: boolean;
          label?: string;
          location?: unknown;
          unit?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'addresses_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'addresses_district_id_fkey';
            columns: ['district_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'addresses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_audit_logs: {
        Row: {
          action: string;
          actor_id: string;
          after_snapshot: Json | null;
          before_snapshot: Json | null;
          correlation_id: string;
          created_at: string;
          id: string;
          ip_hash: string | null;
          reason: string;
          target_id: string | null;
          target_type: string;
        };
        Insert: {
          action: string;
          actor_id: string;
          after_snapshot?: Json | null;
          before_snapshot?: Json | null;
          correlation_id: string;
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          reason: string;
          target_id?: string | null;
          target_type: string;
        };
        Update: {
          action?: string;
          actor_id?: string;
          after_snapshot?: Json | null;
          before_snapshot?: Json | null;
          correlation_id?: string;
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          reason?: string;
          target_id?: string | null;
          target_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_audit_logs_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_permissions: {
        Row: {
          description: string;
          id: string;
          key: string;
          risk_level: string;
        };
        Insert: {
          description: string;
          id?: string;
          key: string;
          risk_level: string;
        };
        Update: {
          description?: string;
          id?: string;
          key?: string;
          risk_level?: string;
        };
        Relationships: [];
      };
      admin_role_assignments: {
        Row: {
          admin_role_id: string;
          granted_at: string;
          granted_by: string;
          id: string;
          reason: string;
          revoked_at: string | null;
          user_id: string;
        };
        Insert: {
          admin_role_id: string;
          granted_at?: string;
          granted_by: string;
          id?: string;
          reason: string;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          admin_role_id?: string;
          granted_at?: string;
          granted_by?: string;
          id?: string;
          reason?: string;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_role_assignments_admin_role_id_fkey';
            columns: ['admin_role_id'];
            isOneToOne: false;
            referencedRelation: 'admin_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_role_assignments_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_role_assignments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_role_permissions: {
        Row: {
          admin_role_id: string;
          permission_id: string;
        };
        Insert: {
          admin_role_id: string;
          permission_id: string;
        };
        Update: {
          admin_role_id?: string;
          permission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_role_permissions_admin_role_id_fkey';
            columns: ['admin_role_id'];
            isOneToOne: false;
            referencedRelation: 'admin_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_role_permissions_permission_id_fkey';
            columns: ['permission_id'];
            isOneToOne: false;
            referencedRelation: 'admin_permissions';
            referencedColumns: ['id'];
          },
        ];
      };
      admin_roles: {
        Row: {
          description: string;
          id: string;
          key: string;
          name: string;
          system_role: Database['public']['Enums']['user_role'];
        };
        Insert: {
          description: string;
          id?: string;
          key: string;
          name: string;
          system_role: Database['public']['Enums']['user_role'];
        };
        Update: {
          description?: string;
          id?: string;
          key?: string;
          name?: string;
          system_role?: Database['public']['Enums']['user_role'];
        };
        Relationships: [];
      };
      ai_diagnostics: {
        Row: {
          created_at: string;
          customer_edited_output: Json | null;
          error_category: string | null;
          fallback_source: string | null;
          id: string;
          latency_ms: number | null;
          model: string;
          prompt_version: string;
          provider: string;
          request_id: string | null;
          schema_version: string;
          session_id: string;
          source_message_id: string | null;
          structured_output: Json;
        };
        Insert: {
          created_at?: string;
          customer_edited_output?: Json | null;
          error_category?: string | null;
          fallback_source?: string | null;
          id?: string;
          latency_ms?: number | null;
          model: string;
          prompt_version: string;
          provider: string;
          request_id?: string | null;
          schema_version: string;
          session_id: string;
          source_message_id?: string | null;
          structured_output: Json;
        };
        Update: {
          created_at?: string;
          customer_edited_output?: Json | null;
          error_category?: string | null;
          fallback_source?: string | null;
          id?: string;
          latency_ms?: number | null;
          model?: string;
          prompt_version?: string;
          provider?: string;
          request_id?: string | null;
          schema_version?: string;
          session_id?: string;
          source_message_id?: string | null;
          structured_output?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_diagnostics_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_diagnostics_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_diagnostics_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'ai_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_diagnostics_source_message_id_fkey';
            columns: ['source_message_id'];
            isOneToOne: false;
            referencedRelation: 'ai_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_message_media: {
        Row: {
          created_at: string;
          file_upload_id: string;
          id: string;
          media_kind: string;
          message_id: string;
        };
        Insert: {
          created_at?: string;
          file_upload_id: string;
          id?: string;
          media_kind: string;
          message_id: string;
        };
        Update: {
          created_at?: string;
          file_upload_id?: string;
          id?: string;
          media_kind?: string;
          message_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_message_media_file_upload_id_fkey';
            columns: ['file_upload_id'];
            isOneToOne: true;
            referencedRelation: 'file_uploads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_message_media_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'ai_messages';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_messages: {
        Row: {
          actor: string;
          client_message_id: string | null;
          created_at: string;
          id: string;
          in_reply_to_message_id: string | null;
          input_kind: string;
          metadata: Json;
          original_content: string;
          redacted_content: string | null;
          sequence_number: number;
          session_id: string;
        };
        Insert: {
          actor: string;
          client_message_id?: string | null;
          created_at?: string;
          id?: string;
          in_reply_to_message_id?: string | null;
          input_kind?: string;
          metadata?: Json;
          original_content: string;
          redacted_content?: string | null;
          sequence_number: number;
          session_id: string;
        };
        Update: {
          actor?: string;
          client_message_id?: string | null;
          created_at?: string;
          id?: string;
          in_reply_to_message_id?: string | null;
          input_kind?: string;
          metadata?: Json;
          original_content?: string;
          redacted_content?: string | null;
          sequence_number?: number;
          session_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_messages_in_reply_to_message_id_fkey';
            columns: ['in_reply_to_message_id'];
            isOneToOne: false;
            referencedRelation: 'ai_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_messages_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'ai_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_prompt_versions: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          purpose: string;
          schema_version: string;
          system_prompt_hash: string;
          version: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          purpose: string;
          schema_version: string;
          system_prompt_hash: string;
          version: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          purpose?: string;
          schema_version?: string;
          system_prompt_hash?: string;
          version?: string;
        };
        Relationships: [];
      };
      ai_rate_limit_events: {
        Row: {
          created_at: string;
          id: string;
          ip_hash: string | null;
          limit_name: string;
          observed_count: number;
          operation: string;
          user_id: string | null;
          window_started_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          limit_name: string;
          observed_count: number;
          operation: string;
          user_id?: string | null;
          window_started_at: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          ip_hash?: string | null;
          limit_name?: string;
          observed_count?: number;
          operation?: string;
          user_id?: string | null;
          window_started_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_rate_limit_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_sessions: {
        Row: {
          confirmed_category_slug: string | null;
          created_at: string;
          ended_at: string | null;
          id: string;
          latest_diagnostic_id: string | null;
          locale: string;
          model: string | null;
          prompt_version_id: string | null;
          provider: string | null;
          purpose: string;
          request_id: string | null;
          status: string;
          suggested_category_slug: string | null;
          summary_requested_at: string | null;
          updated_at: string;
          user_id: string;
          version: number;
        };
        Insert: {
          confirmed_category_slug?: string | null;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          latest_diagnostic_id?: string | null;
          locale: string;
          model?: string | null;
          prompt_version_id?: string | null;
          provider?: string | null;
          purpose: string;
          request_id?: string | null;
          status?: string;
          suggested_category_slug?: string | null;
          summary_requested_at?: string | null;
          updated_at?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          confirmed_category_slug?: string | null;
          created_at?: string;
          ended_at?: string | null;
          id?: string;
          latest_diagnostic_id?: string | null;
          locale?: string;
          model?: string | null;
          prompt_version_id?: string | null;
          provider?: string | null;
          purpose?: string;
          request_id?: string | null;
          status?: string;
          suggested_category_slug?: string | null;
          summary_requested_at?: string | null;
          updated_at?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_sessions_prompt_version_id_fkey';
            columns: ['prompt_version_id'];
            isOneToOne: false;
            referencedRelation: 'ai_prompt_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_sessions_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_sessions_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_usage_events: {
        Row: {
          created_at: string;
          error_category: string | null;
          estimated_cost_minor: number;
          id: string;
          input_units: number;
          latency_ms: number | null;
          model: string;
          operation: string;
          output_units: number;
          provider: string;
          session_id: string | null;
          success: boolean;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          error_category?: string | null;
          estimated_cost_minor?: number;
          id?: string;
          input_units?: number;
          latency_ms?: number | null;
          model: string;
          operation: string;
          output_units?: number;
          provider: string;
          session_id?: string | null;
          success: boolean;
          user_id: string;
        };
        Update: {
          created_at?: string;
          error_category?: string | null;
          estimated_cost_minor?: number;
          id?: string;
          input_units?: number;
          latency_ms?: number | null;
          model?: string;
          operation?: string;
          output_units?: number;
          provider?: string;
          session_id?: string | null;
          success?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_usage_events_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'ai_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_usage_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blocked_users: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
          reason: string | null;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
          reason?: string | null;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'blocked_users_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocked_users_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      cancellation_decisions: {
        Row: {
          actor_id: string;
          cancellation_request_id: string;
          created_at: string;
          decision: string;
          fee_minor: number;
          id: string;
          impact_snapshot: Json;
          reason: string;
          refund_implication: string | null;
        };
        Insert: {
          actor_id: string;
          cancellation_request_id: string;
          created_at?: string;
          decision: string;
          fee_minor?: number;
          id?: string;
          impact_snapshot?: Json;
          reason: string;
          refund_implication?: string | null;
        };
        Update: {
          actor_id?: string;
          cancellation_request_id?: string;
          created_at?: string;
          decision?: string;
          fee_minor?: number;
          id?: string;
          impact_snapshot?: Json;
          reason?: string;
          refund_implication?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'cancellation_decisions_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cancellation_decisions_cancellation_request_id_fkey';
            columns: ['cancellation_request_id'];
            isOneToOne: true;
            referencedRelation: 'cancellation_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      cancellation_requests: {
        Row: {
          created_at: string;
          expected_job_version: number | null;
          id: string;
          idempotency_key: string | null;
          job_id: string | null;
          job_resolution_applied_at: string | null;
          lifecycle_state: string;
          pending_job_status: Database['public']['Enums']['job_status'] | null;
          reason: string;
          request_id: string | null;
          requester_id: string;
          resolved_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          expected_job_version?: number | null;
          id?: string;
          idempotency_key?: string | null;
          job_id?: string | null;
          job_resolution_applied_at?: string | null;
          lifecycle_state: string;
          pending_job_status?: Database['public']['Enums']['job_status'] | null;
          reason: string;
          request_id?: string | null;
          requester_id: string;
          resolved_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          expected_job_version?: number | null;
          id?: string;
          idempotency_key?: string | null;
          job_id?: string | null;
          job_resolution_applied_at?: string | null;
          lifecycle_state?: string;
          pending_job_status?: Database['public']['Enums']['job_status'] | null;
          reason?: string;
          request_id?: string | null;
          requester_id?: string;
          resolved_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cancellation_requests_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cancellation_requests_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cancellation_requests_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cancellation_requests_requester_id_fkey';
            columns: ['requester_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      change_order_items: {
        Row: {
          change_order_id: string;
          description: string;
          id: string;
          quantity: number;
          total_amount_minor: number | null;
          unit_amount_minor: number;
        };
        Insert: {
          change_order_id: string;
          description: string;
          id?: string;
          quantity: number;
          total_amount_minor?: number | null;
          unit_amount_minor: number;
        };
        Update: {
          change_order_id?: string;
          description?: string;
          id?: string;
          quantity?: number;
          total_amount_minor?: number | null;
          unit_amount_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'change_order_items_change_order_id_fkey';
            columns: ['change_order_id'];
            isOneToOne: false;
            referencedRelation: 'change_orders';
            referencedColumns: ['id'];
          },
        ];
      };
      change_orders: {
        Row: {
          added_amount_minor: number;
          created_at: string;
          currency: string;
          customer_decision_at: string | null;
          customer_id: string | null;
          description: string;
          expires_at: string;
          id: string;
          idempotency_key: string;
          job_id: string;
          provider_id: string;
          reason: string;
          revised_total_minor: number;
          status: Database['public']['Enums']['change_order_status'];
          version: number;
        };
        Insert: {
          added_amount_minor: number;
          created_at?: string;
          currency?: string;
          customer_decision_at?: string | null;
          customer_id?: string | null;
          description: string;
          expires_at: string;
          id?: string;
          idempotency_key: string;
          job_id: string;
          provider_id: string;
          reason: string;
          revised_total_minor: number;
          status?: Database['public']['Enums']['change_order_status'];
          version?: number;
        };
        Update: {
          added_amount_minor?: number;
          created_at?: string;
          currency?: string;
          customer_decision_at?: string | null;
          customer_id?: string | null;
          description?: string;
          expires_at?: string;
          id?: string;
          idempotency_key?: string;
          job_id?: string;
          provider_id?: string;
          reason?: string;
          revised_total_minor?: number;
          status?: Database['public']['Enums']['change_order_status'];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'change_orders_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'change_orders_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'change_orders_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      cities: {
        Row: {
          boundary: unknown;
          code: string;
          country_code: string;
          created_at: string;
          enabled: boolean;
          id: string;
          name_ar: string;
          name_en: string;
          timezone: string;
        };
        Insert: {
          boundary?: unknown;
          code: string;
          country_code?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name_ar: string;
          name_en: string;
          timezone?: string;
        };
        Update: {
          boundary?: unknown;
          code?: string;
          country_code?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name_ar?: string;
          name_en?: string;
          timezone?: string;
        };
        Relationships: [];
      };
      completion_attempts: {
        Row: {
          attempt_number: number;
          corrected_from_attempt_id: string | null;
          created_at: string;
          decided_at: string | null;
          id: string;
          idempotency_key: string;
          job_id: string;
          provider_id: string;
          status: string;
          submitted_at: string;
        };
        Insert: {
          attempt_number: number;
          corrected_from_attempt_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          idempotency_key: string;
          job_id: string;
          provider_id: string;
          status?: string;
          submitted_at?: string;
        };
        Update: {
          attempt_number?: number;
          corrected_from_attempt_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          id?: string;
          idempotency_key?: string;
          job_id?: string;
          provider_id?: string;
          status?: string;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'completion_attempts_corrected_from_attempt_id_fkey';
            columns: ['corrected_from_attempt_id'];
            isOneToOne: false;
            referencedRelation: 'completion_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'completion_attempts_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'completion_attempts_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      completion_proofs: {
        Row: {
          captured_at: string | null;
          completion_attempt_id: string;
          created_at: string;
          description: string | null;
          file_upload_id: string | null;
          id: string;
          job_id: string;
          mime_type: string;
          provider_id: string;
          size_bytes: number;
          storage_path: string;
        };
        Insert: {
          captured_at?: string | null;
          completion_attempt_id: string;
          created_at?: string;
          description?: string | null;
          file_upload_id?: string | null;
          id?: string;
          job_id: string;
          mime_type: string;
          provider_id: string;
          size_bytes: number;
          storage_path: string;
        };
        Update: {
          captured_at?: string | null;
          completion_attempt_id?: string;
          created_at?: string;
          description?: string | null;
          file_upload_id?: string | null;
          id?: string;
          job_id?: string;
          mime_type?: string;
          provider_id?: string;
          size_bytes?: number;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'completion_proofs_completion_attempt_id_fkey';
            columns: ['completion_attempt_id'];
            isOneToOne: false;
            referencedRelation: 'completion_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'completion_proofs_file_upload_id_fkey';
            columns: ['file_upload_id'];
            isOneToOne: true;
            referencedRelation: 'file_uploads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'completion_proofs_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'completion_proofs_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          joined_at: string;
          left_at: string | null;
          member_role: string;
          support_access_reason: string | null;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          joined_at?: string;
          left_at?: string | null;
          member_role: string;
          support_access_reason?: string | null;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          joined_at?: string;
          left_at?: string | null;
          member_role?: string;
          support_access_reason?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_members_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          closed_at: string | null;
          created_at: string;
          id: string;
          job_id: string;
          status: string;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          job_id: string;
          status?: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          id?: string;
          job_id?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: true;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_acceptance_evidence: {
        Row: {
          acceptance_id: string;
          created_at: string;
          file_upload_id: string;
        };
        Insert: {
          acceptance_id: string;
          created_at?: string;
          file_upload_id: string;
        };
        Update: {
          acceptance_id?: string;
          created_at?: string;
          file_upload_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_acceptance_evidence_acceptance_id_fkey';
            columns: ['acceptance_id'];
            isOneToOne: false;
            referencedRelation: 'customer_acceptances';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_acceptance_evidence_file_upload_id_fkey';
            columns: ['file_upload_id'];
            isOneToOne: false;
            referencedRelation: 'file_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
      customer_acceptances: {
        Row: {
          accepted: boolean;
          accepted_total_minor: number;
          completion_attempt_id: string;
          created_at: string;
          customer_id: string;
          evidence_references: Json;
          id: string;
          job_id: string;
          reason: string | null;
        };
        Insert: {
          accepted: boolean;
          accepted_total_minor: number;
          completion_attempt_id: string;
          created_at?: string;
          customer_id: string;
          evidence_references?: Json;
          id?: string;
          job_id: string;
          reason?: string | null;
        };
        Update: {
          accepted?: boolean;
          accepted_total_minor?: number;
          completion_attempt_id?: string;
          created_at?: string;
          customer_id?: string;
          evidence_references?: Json;
          id?: string;
          job_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'customer_acceptances_completion_attempt_id_fkey';
            columns: ['completion_attempt_id'];
            isOneToOne: true;
            referencedRelation: 'completion_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_acceptances_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'customer_acceptances_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      data_export_requests: {
        Row: {
          attempts: number;
          completed_at: string | null;
          expires_at: string | null;
          failure_category: string | null;
          id: string;
          last_attempt_at: string | null;
          last_error_at: string | null;
          locked_at: string | null;
          private_storage_path: string | null;
          requested_at: string;
          scheduled_at: string;
          signed_download_url: string | null;
          status: string;
          user_id: string;
          version: number;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          expires_at?: string | null;
          failure_category?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          last_error_at?: string | null;
          locked_at?: string | null;
          private_storage_path?: string | null;
          requested_at?: string;
          scheduled_at?: string;
          signed_download_url?: string | null;
          status?: string;
          user_id: string;
          version?: number;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          expires_at?: string | null;
          failure_category?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          last_error_at?: string | null;
          locked_at?: string | null;
          private_storage_path?: string | null;
          requested_at?: string;
          scheduled_at?: string;
          signed_download_url?: string | null;
          status?: string;
          user_id?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'data_export_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      data_export_table_classifications: {
        Row: {
          classification: string;
          manifest_categories: string[];
          query_anchors: string[];
          reason: string;
          table_name: string;
        };
        Insert: {
          classification: string;
          manifest_categories?: string[];
          query_anchors?: string[];
          reason: string;
          table_name: string;
        };
        Update: {
          classification?: string;
          manifest_categories?: string[];
          query_anchors?: string[];
          reason?: string;
          table_name?: string;
        };
        Relationships: [];
      };
      dead_letter_events: {
        Row: {
          attempts: number;
          created_at: string;
          error_category: string;
          id: string;
          payload: Json;
          resolved_at: string | null;
          resolved_by: string | null;
          source_id: string;
          source_type: string;
        };
        Insert: {
          attempts: number;
          created_at?: string;
          error_category: string;
          id?: string;
          payload: Json;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source_id: string;
          source_type: string;
        };
        Update: {
          attempts?: number;
          created_at?: string;
          error_category?: string;
          id?: string;
          payload?: Json;
          resolved_at?: string | null;
          resolved_by?: string | null;
          source_id?: string;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dead_letter_events_resolved_by_fkey';
            columns: ['resolved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      dispute_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          dispute_id: string;
          event_type: string;
          id: string;
          payload: Json;
          reason: string | null;
          visible_to_participants: boolean;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          dispute_id: string;
          event_type: string;
          id?: string;
          payload?: Json;
          reason?: string | null;
          visible_to_participants?: boolean;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          dispute_id?: string;
          event_type?: string;
          id?: string;
          payload?: Json;
          reason?: string | null;
          visible_to_participants?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'dispute_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'dispute_events_dispute_id_fkey';
            columns: ['dispute_id'];
            isOneToOne: false;
            referencedRelation: 'disputes';
            referencedColumns: ['id'];
          },
        ];
      };
      disputes: {
        Row: {
          assigned_to: string | null;
          completion_attempt_id: string | null;
          completion_decision_id: string | null;
          created_at: string;
          expected_job_version: number | null;
          id: string;
          idempotency_key: string | null;
          job_id: string;
          job_resolution_applied_at: string | null;
          opened_by: string;
          pre_dispute_job_status: Database['public']['Enums']['job_status'] | null;
          priority: string;
          reason: string;
          resolution_outcome: string | null;
          resolved_at: string | null;
          status: Database['public']['Enums']['case_status'];
          target_job_status: Database['public']['Enums']['job_status'] | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          assigned_to?: string | null;
          completion_attempt_id?: string | null;
          completion_decision_id?: string | null;
          created_at?: string;
          expected_job_version?: number | null;
          id?: string;
          idempotency_key?: string | null;
          job_id: string;
          job_resolution_applied_at?: string | null;
          opened_by: string;
          pre_dispute_job_status?: Database['public']['Enums']['job_status'] | null;
          priority?: string;
          reason: string;
          resolution_outcome?: string | null;
          resolved_at?: string | null;
          status?: Database['public']['Enums']['case_status'];
          target_job_status?: Database['public']['Enums']['job_status'] | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          assigned_to?: string | null;
          completion_attempt_id?: string | null;
          completion_decision_id?: string | null;
          created_at?: string;
          expected_job_version?: number | null;
          id?: string;
          idempotency_key?: string | null;
          job_id?: string;
          job_resolution_applied_at?: string | null;
          opened_by?: string;
          pre_dispute_job_status?: Database['public']['Enums']['job_status'] | null;
          priority?: string;
          reason?: string;
          resolution_outcome?: string | null;
          resolved_at?: string | null;
          status?: Database['public']['Enums']['case_status'];
          target_job_status?: Database['public']['Enums']['job_status'] | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'disputes_assigned_to_fkey';
            columns: ['assigned_to'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_completion_attempt_id_fkey';
            columns: ['completion_attempt_id'];
            isOneToOne: false;
            referencedRelation: 'completion_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_completion_decision_id_fkey';
            columns: ['completion_decision_id'];
            isOneToOne: false;
            referencedRelation: 'customer_acceptances';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'disputes_opened_by_fkey';
            columns: ['opened_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      districts: {
        Row: {
          boundary: unknown;
          city_id: string;
          code: string;
          enabled: boolean;
          id: string;
          name_ar: string;
          name_en: string;
        };
        Insert: {
          boundary?: unknown;
          city_id: string;
          code: string;
          enabled?: boolean;
          id?: string;
          name_ar: string;
          name_en: string;
        };
        Update: {
          boundary?: unknown;
          city_id?: string;
          code?: string;
          enabled?: boolean;
          id?: string;
          name_ar?: string;
          name_en?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'districts_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
        ];
      };
      external_privacy_requests: {
        Row: {
          email_hash: string;
          id: string;
          reason: string | null;
          request_type: string;
          requested_at: string;
          status: string;
        };
        Insert: {
          email_hash: string;
          id?: string;
          reason?: string | null;
          request_type: string;
          requested_at?: string;
          status?: string;
        };
        Update: {
          email_hash?: string;
          id?: string;
          reason?: string | null;
          request_type?: string;
          requested_at?: string;
          status?: string;
        };
        Relationships: [];
      };
      feature_flags: {
        Row: {
          enabled: boolean;
          environments: string[];
          key: string;
          rules: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          enabled?: boolean;
          environments?: string[];
          key: string;
          rules?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          enabled?: boolean;
          environments?: string[];
          key?: string;
          rules?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'feature_flags_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      file_uploads: {
        Row: {
          attempts: number;
          content_sha256: string | null;
          created_at: string;
          declared_mime_type: string;
          detected_mime_type: string | null;
          expires_at: string;
          extension: string;
          failure_category: string | null;
          final_path: string | null;
          id: string;
          locked_at: string | null;
          max_size_bytes: number;
          original_filename: string;
          purpose: string;
          quarantine_bucket: string;
          quarantine_cleaned_at: string | null;
          quarantine_cleanup_attempts: number;
          quarantine_cleanup_claimed_at: string | null;
          quarantine_cleanup_worker_id: string | null;
          quarantine_path: string;
          resource_id: string | null;
          sanitized: boolean;
          scanned_at: string | null;
          scanner: string | null;
          size_bytes: number;
          status: string;
          target_bucket: string;
          target_path: string;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          content_sha256?: string | null;
          created_at?: string;
          declared_mime_type: string;
          detected_mime_type?: string | null;
          expires_at?: string;
          extension: string;
          failure_category?: string | null;
          final_path?: string | null;
          id?: string;
          locked_at?: string | null;
          max_size_bytes: number;
          original_filename: string;
          purpose: string;
          quarantine_bucket?: string;
          quarantine_cleaned_at?: string | null;
          quarantine_cleanup_attempts?: number;
          quarantine_cleanup_claimed_at?: string | null;
          quarantine_cleanup_worker_id?: string | null;
          quarantine_path: string;
          resource_id?: string | null;
          sanitized?: boolean;
          scanned_at?: string | null;
          scanner?: string | null;
          size_bytes: number;
          status?: string;
          target_bucket: string;
          target_path: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          content_sha256?: string | null;
          created_at?: string;
          declared_mime_type?: string;
          detected_mime_type?: string | null;
          expires_at?: string;
          extension?: string;
          failure_category?: string | null;
          final_path?: string | null;
          id?: string;
          locked_at?: string | null;
          max_size_bytes?: number;
          original_filename?: string;
          purpose?: string;
          quarantine_bucket?: string;
          quarantine_cleaned_at?: string | null;
          quarantine_cleanup_attempts?: number;
          quarantine_cleanup_claimed_at?: string | null;
          quarantine_cleanup_worker_id?: string | null;
          quarantine_path?: string;
          resource_id?: string | null;
          sanitized?: boolean;
          scanned_at?: string | null;
          scanner?: string | null;
          size_bytes?: number;
          status?: string;
          target_bucket?: string;
          target_path?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'file_uploads_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      financial_action_intents: {
        Row: {
          action_type: string;
          amount_minor: number;
          completed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          created_by: string;
          failure_category: string | null;
          id: string;
          idempotency_key: string;
          payment_id: string;
          provider_reference: string | null;
          refund_id: string | null;
          source_id: string;
          source_type: string;
          status: string;
        };
        Insert: {
          action_type: string;
          amount_minor?: number;
          completed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by: string;
          failure_category?: string | null;
          id?: string;
          idempotency_key: string;
          payment_id: string;
          provider_reference?: string | null;
          refund_id?: string | null;
          source_id: string;
          source_type: string;
          status?: string;
        };
        Update: {
          action_type?: string;
          amount_minor?: number;
          completed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          created_by?: string;
          failure_category?: string | null;
          id?: string;
          idempotency_key?: string;
          payment_id?: string;
          provider_reference?: string | null;
          refund_id?: string | null;
          source_id?: string;
          source_type?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'financial_action_intents_confirmed_by_fkey';
            columns: ['confirmed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_action_intents_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_action_intents_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payment_accounting';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_action_intents_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_action_intents_refund_id_fkey';
            columns: ['refund_id'];
            isOneToOne: false;
            referencedRelation: 'refunds';
            referencedColumns: ['id'];
          },
        ];
      };
      financial_holds: {
        Row: {
          amount_minor: number;
          cancellation_request_id: string | null;
          created_at: string;
          created_by: string;
          dispute_id: string | null;
          id: string;
          job_id: string;
          payment_id: string | null;
          reason: string;
          released_at: string | null;
          released_by: string | null;
          status: Database['public']['Enums']['financial_status'];
        };
        Insert: {
          amount_minor: number;
          cancellation_request_id?: string | null;
          created_at?: string;
          created_by: string;
          dispute_id?: string | null;
          id?: string;
          job_id: string;
          payment_id?: string | null;
          reason: string;
          released_at?: string | null;
          released_by?: string | null;
          status?: Database['public']['Enums']['financial_status'];
        };
        Update: {
          amount_minor?: number;
          cancellation_request_id?: string | null;
          created_at?: string;
          created_by?: string;
          dispute_id?: string | null;
          id?: string;
          job_id?: string;
          payment_id?: string | null;
          reason?: string;
          released_at?: string | null;
          released_by?: string | null;
          status?: Database['public']['Enums']['financial_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'financial_holds_cancellation_request_id_fkey';
            columns: ['cancellation_request_id'];
            isOneToOne: false;
            referencedRelation: 'cancellation_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_holds_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_holds_dispute_id_fkey';
            columns: ['dispute_id'];
            isOneToOne: false;
            referencedRelation: 'disputes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_holds_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_holds_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payment_accounting';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_holds_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'financial_holds_released_by_fkey';
            columns: ['released_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      idempotency_keys: {
        Row: {
          attempt_count: number;
          command: string;
          completed_at: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          key: string;
          last_failure_category: string | null;
          request_hash: string | null;
          response: Json | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          attempt_count?: number;
          command: string;
          completed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          key: string;
          last_failure_category?: string | null;
          request_hash?: string | null;
          response?: Json | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempt_count?: number;
          command?: string;
          completed_at?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          key?: string;
          last_failure_category?: string | null;
          request_hash?: string | null;
          response?: Json | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'idempotency_keys_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      invoice_items: {
        Row: {
          description: string;
          id: string;
          invoice_id: string;
          quantity: number;
          unit_amount_minor: number;
          vat_rate_bps: number;
        };
        Insert: {
          description: string;
          id?: string;
          invoice_id: string;
          quantity: number;
          unit_amount_minor: number;
          vat_rate_bps?: number;
        };
        Update: {
          description?: string;
          id?: string;
          invoice_id?: string;
          quantity?: number;
          unit_amount_minor?: number;
          vat_rate_bps?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'invoice_items_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'invoices';
            referencedColumns: ['id'];
          },
        ];
      };
      invoices: {
        Row: {
          currency: string;
          customer_snapshot: Json;
          id: string;
          invoice_number: string;
          issued_at: string;
          job_id: string;
          legal_review_version: string | null;
          payment_method: string;
          platform_fee_minor: number;
          private_pdf_path: string | null;
          seller_snapshot: Json;
          status: string;
          subtotal_minor: number;
          total_minor: number;
          vat_minor: number;
        };
        Insert: {
          currency?: string;
          customer_snapshot: Json;
          id?: string;
          invoice_number: string;
          issued_at: string;
          job_id: string;
          legal_review_version?: string | null;
          payment_method: string;
          platform_fee_minor?: number;
          private_pdf_path?: string | null;
          seller_snapshot: Json;
          status: string;
          subtotal_minor: number;
          total_minor: number;
          vat_minor?: number;
        };
        Update: {
          currency?: string;
          customer_snapshot?: Json;
          id?: string;
          invoice_number?: string;
          issued_at?: string;
          job_id?: string;
          legal_review_version?: string | null;
          payment_method?: string;
          platform_fee_minor?: number;
          private_pdf_path?: string | null;
          seller_snapshot?: Json;
          status?: string;
          subtotal_minor?: number;
          total_minor?: number;
          vat_minor?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'invoices_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      job_assignments: {
        Row: {
          assigned_at: string;
          ended_at: string | null;
          id: string;
          job_id: string;
          provider_id: string;
          reason: string | null;
        };
        Insert: {
          assigned_at?: string;
          ended_at?: string | null;
          id?: string;
          job_id: string;
          provider_id: string;
          reason?: string | null;
        };
        Update: {
          assigned_at?: string;
          ended_at?: string | null;
          id?: string;
          job_id?: string;
          provider_id?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'job_assignments_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_assignments_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      job_checklists: {
        Row: {
          completed_at: string | null;
          completed_by: string | null;
          id: string;
          item_key: string;
          job_id: string;
          label_snapshot: string;
          required: boolean;
        };
        Insert: {
          completed_at?: string | null;
          completed_by?: string | null;
          id?: string;
          item_key: string;
          job_id: string;
          label_snapshot: string;
          required?: boolean;
        };
        Update: {
          completed_at?: string | null;
          completed_by?: string | null;
          id?: string;
          item_key?: string;
          job_id?: string;
          label_snapshot?: string;
          required?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'job_checklists_completed_by_fkey';
            columns: ['completed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_checklists_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      job_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          job_id: string;
          payload: Json;
          payload_version: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          job_id: string;
          payload?: Json;
          payload_version?: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          job_id?: string;
          payload?: Json;
          payload_version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_events_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      job_location_sharing_sessions: {
        Row: {
          consented_at: string;
          created_at: string;
          expires_at: string;
          id: string;
          job_id: string;
          provider_id: string;
          starts_at: string;
          stop_reason: string | null;
          stopped_at: string | null;
        };
        Insert: {
          consented_at?: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          job_id: string;
          provider_id: string;
          starts_at?: string;
          stop_reason?: string | null;
          stopped_at?: string | null;
        };
        Update: {
          consented_at?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          job_id?: string;
          provider_id?: string;
          starts_at?: string;
          stop_reason?: string | null;
          stopped_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'job_location_sharing_sessions_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_location_sharing_sessions_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      job_location_updates: {
        Row: {
          accuracy_m: number | null;
          captured_at: string;
          created_at: string;
          expires_at: string;
          id: string;
          job_id: string;
          location: unknown;
          provider_id: string;
          sharing_consent_at: string;
        };
        Insert: {
          accuracy_m?: number | null;
          captured_at: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          job_id: string;
          location: unknown;
          provider_id: string;
          sharing_consent_at: string;
        };
        Update: {
          accuracy_m?: number | null;
          captured_at?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          job_id?: string;
          location?: unknown;
          provider_id?: string;
          sharing_consent_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_location_updates_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_location_updates_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      job_notes: {
        Row: {
          author_id: string;
          body: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          job_id: string;
          visibility: string;
        };
        Insert: {
          author_id: string;
          body: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          job_id: string;
          visibility: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          job_id?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_notes_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_notes_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      job_status_history: {
        Row: {
          actor_id: string;
          created_at: string;
          id: string;
          idempotency_key: string;
          job_id: string;
          metadata: Json;
          new_status: Database['public']['Enums']['job_status'];
          previous_status: Database['public']['Enums']['job_status'] | null;
          reason: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          job_id: string;
          metadata?: Json;
          new_status: Database['public']['Enums']['job_status'];
          previous_status?: Database['public']['Enums']['job_status'] | null;
          reason: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          job_id?: string;
          metadata?: Json;
          new_status?: Database['public']['Enums']['job_status'];
          previous_status?: Database['public']['Enums']['job_status'] | null;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_status_history_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_status_history_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      job_terminal_effects: {
        Row: {
          actor_id: string | null;
          applied_at: string;
          job_id: string;
          metadata: Json;
          outcome: string;
          source_id: string | null;
          source_type: string;
        };
        Insert: {
          actor_id?: string | null;
          applied_at?: string;
          job_id: string;
          metadata?: Json;
          outcome: string;
          source_id?: string | null;
          source_type: string;
        };
        Update: {
          actor_id?: string | null;
          applied_at?: string;
          job_id?: string;
          metadata?: Json;
          outcome?: string;
          source_id?: string | null;
          source_type?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'job_terminal_effects_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'job_terminal_effects_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: true;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      jobs: {
        Row: {
          approved_total_minor: number;
          completed_at: string | null;
          created_at: string;
          currency: string;
          customer_id: string;
          exact_address_id: string;
          id: string;
          provider_id: string;
          request_id: string;
          scheduled_end: string | null;
          scheduled_start: string | null;
          selected_offer_id: string;
          status: Database['public']['Enums']['job_status'];
          updated_at: string;
          version: number;
        };
        Insert: {
          approved_total_minor: number;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_id: string;
          exact_address_id: string;
          id?: string;
          provider_id: string;
          request_id: string;
          scheduled_end?: string | null;
          scheduled_start?: string | null;
          selected_offer_id: string;
          status?: Database['public']['Enums']['job_status'];
          updated_at?: string;
          version?: number;
        };
        Update: {
          approved_total_minor?: number;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          exact_address_id?: string;
          id?: string;
          provider_id?: string;
          request_id?: string;
          scheduled_end?: string | null;
          scheduled_start?: string | null;
          selected_offer_id?: string;
          status?: Database['public']['Enums']['job_status'];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'jobs_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_exact_address_id_fkey';
            columns: ['exact_address_id'];
            isOneToOne: false;
            referencedRelation: 'addresses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'jobs_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: true;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: true;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_selected_offer_id_fkey';
            columns: ['selected_offer_id'];
            isOneToOne: true;
            referencedRelation: 'offers';
            referencedColumns: ['id'];
          },
        ];
      };
      legal_acceptances: {
        Row: {
          accepted_at: string;
          id: string;
          ip_hash: string | null;
          legal_document_id: string;
          user_agent_hash: string | null;
          user_id: string;
        };
        Insert: {
          accepted_at?: string;
          id?: string;
          ip_hash?: string | null;
          legal_document_id: string;
          user_agent_hash?: string | null;
          user_id: string;
        };
        Update: {
          accepted_at?: string;
          id?: string;
          ip_hash?: string | null;
          legal_document_id?: string;
          user_agent_hash?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'legal_acceptances_legal_document_id_fkey';
            columns: ['legal_document_id'];
            isOneToOne: false;
            referencedRelation: 'legal_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'legal_acceptances_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      legal_documents: {
        Row: {
          content_hash: string;
          document_type: string;
          effective_at: string | null;
          id: string;
          locale: string;
          published_at: string | null;
          requires_acceptance: boolean;
          version: string;
        };
        Insert: {
          content_hash: string;
          document_type: string;
          effective_at?: string | null;
          id?: string;
          locale: string;
          published_at?: string | null;
          requires_acceptance?: boolean;
          version: string;
        };
        Update: {
          content_hash?: string;
          document_type?: string;
          effective_at?: string | null;
          id?: string;
          locale?: string;
          published_at?: string | null;
          requires_acceptance?: boolean;
          version?: string;
        };
        Relationships: [];
      };
      marketplace_report_events: {
        Row: {
          actor_id: string;
          created_at: string;
          event_type: string;
          from_status: string | null;
          id: string;
          idempotency_key: string;
          payload: Json;
          reason: string;
          report_id: string;
          to_status: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          event_type: string;
          from_status?: string | null;
          id?: string;
          idempotency_key: string;
          payload?: Json;
          reason: string;
          report_id: string;
          to_status: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          event_type?: string;
          from_status?: string | null;
          id?: string;
          idempotency_key?: string;
          payload?: Json;
          reason?: string;
          report_id?: string;
          to_status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'marketplace_report_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_report_events_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'marketplace_reports';
            referencedColumns: ['id'];
          },
        ];
      };
      marketplace_reports: {
        Row: {
          attachment_evidence: Json;
          conversation_id: string | null;
          correlation_id: string;
          created_at: string;
          explanation: string | null;
          id: string;
          job_id: string | null;
          last_action_by: string | null;
          message_id: string | null;
          priority: string;
          rating_id: string | null;
          reason_category: string;
          reported_user_id: string;
          reporter_id: string;
          request_id: string | null;
          resolved_at: string | null;
          status: string;
          support_case_id: string;
          target_id: string;
          target_type: string;
          text_snapshot: string | null;
          updated_at: string;
          version: number;
        };
        Insert: {
          attachment_evidence?: Json;
          conversation_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          job_id?: string | null;
          last_action_by?: string | null;
          message_id?: string | null;
          priority?: string;
          rating_id?: string | null;
          reason_category: string;
          reported_user_id: string;
          reporter_id: string;
          request_id?: string | null;
          resolved_at?: string | null;
          status?: string;
          support_case_id: string;
          target_id: string;
          target_type: string;
          text_snapshot?: string | null;
          updated_at?: string;
          version?: number;
        };
        Update: {
          attachment_evidence?: Json;
          conversation_id?: string | null;
          correlation_id?: string;
          created_at?: string;
          explanation?: string | null;
          id?: string;
          job_id?: string | null;
          last_action_by?: string | null;
          message_id?: string | null;
          priority?: string;
          rating_id?: string | null;
          reason_category?: string;
          reported_user_id?: string;
          reporter_id?: string;
          request_id?: string | null;
          resolved_at?: string | null;
          status?: string;
          support_case_id?: string;
          target_id?: string;
          target_type?: string;
          text_snapshot?: string | null;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'marketplace_reports_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_last_action_by_fkey';
            columns: ['last_action_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_rating_id_fkey';
            columns: ['rating_id'];
            isOneToOne: false;
            referencedRelation: 'ratings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_reported_user_id_fkey';
            columns: ['reported_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'marketplace_reports_support_case_id_fkey';
            columns: ['support_case_id'];
            isOneToOne: true;
            referencedRelation: 'support_cases';
            referencedColumns: ['id'];
          },
        ];
      };
      matching_candidates: {
        Row: {
          created_at: string;
          eligible: boolean;
          exclusion_reason: string | null;
          id: string;
          matching_run_id: string;
          provider_id: string;
          score: number | null;
          score_components: Json;
        };
        Insert: {
          created_at?: string;
          eligible: boolean;
          exclusion_reason?: string | null;
          id?: string;
          matching_run_id: string;
          provider_id: string;
          score?: number | null;
          score_components?: Json;
        };
        Update: {
          created_at?: string;
          eligible?: boolean;
          exclusion_reason?: string | null;
          id?: string;
          matching_run_id?: string;
          provider_id?: string;
          score?: number | null;
          score_components?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'matching_candidates_matching_run_id_fkey';
            columns: ['matching_run_id'];
            isOneToOne: false;
            referencedRelation: 'matching_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matching_candidates_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      matching_runs: {
        Row: {
          candidate_count: number;
          completed_at: string | null;
          configuration_version: string;
          created_at: string;
          id: string;
          request_id: string;
          status: string;
          weights: Json;
        };
        Insert: {
          candidate_count?: number;
          completed_at?: string | null;
          configuration_version: string;
          created_at?: string;
          id?: string;
          request_id: string;
          status?: string;
          weights: Json;
        };
        Update: {
          candidate_count?: number;
          completed_at?: string | null;
          configuration_version?: string;
          created_at?: string;
          id?: string;
          request_id?: string;
          status?: string;
          weights?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'matching_runs_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matching_runs_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      message_attachments: {
        Row: {
          created_at: string;
          file_upload_id: string | null;
          id: string;
          message_id: string;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
          uploader_id: string;
        };
        Insert: {
          created_at?: string;
          file_upload_id?: string | null;
          id?: string;
          message_id: string;
          mime_type: string;
          size_bytes: number;
          storage_path: string;
          uploader_id: string;
        };
        Update: {
          created_at?: string;
          file_upload_id?: string | null;
          id?: string;
          message_id?: string;
          mime_type?: string;
          size_bytes?: number;
          storage_path?: string;
          uploader_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_attachments_file_upload_id_fkey';
            columns: ['file_upload_id'];
            isOneToOne: true;
            referencedRelation: 'file_uploads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_attachments_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_attachments_uploader_id_fkey';
            columns: ['uploader_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_delivery_events: {
        Row: {
          created_at: string;
          id: string;
          message_id: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_id: string;
          status: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_delivery_events_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_delivery_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_moderation_events: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          message_id: string;
          reason: string;
          reporter_id: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          message_id: string;
          reason: string;
          reporter_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          message_id?: string;
          reason?: string;
          reporter_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'message_moderation_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_moderation_events_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_moderation_events_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_read_receipts: {
        Row: {
          message_id: string;
          read_at: string;
          user_id: string;
        };
        Insert: {
          message_id: string;
          read_at?: string;
          user_id: string;
        };
        Update: {
          message_id?: string;
          read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'message_read_receipts_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_read_receipts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      message_translations: {
        Row: {
          created_at: string;
          id: string;
          message_id: string;
          original_text: string;
          source_locale: string;
          status: string;
          target_locale: string;
          translated_text: string | null;
          translation_job_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          message_id: string;
          original_text: string;
          source_locale: string;
          status?: string;
          target_locale: string;
          translated_text?: string | null;
          translation_job_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          message_id?: string;
          original_text?: string;
          source_locale?: string;
          status?: string;
          target_locale?: string;
          translated_text?: string | null;
          translation_job_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'message_translations_message_id_fkey';
            columns: ['message_id'];
            isOneToOne: false;
            referencedRelation: 'messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'message_translations_translation_job_id_fkey';
            columns: ['translation_job_id'];
            isOneToOne: false;
            referencedRelation: 'translation_jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          client_message_id: string | null;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          edited_at: string | null;
          id: string;
          sender_id: string;
        };
        Insert: {
          body: string;
          client_message_id?: string | null;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          sender_id: string;
        };
        Update: {
          body?: string;
          client_message_id?: string | null;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          edited_at?: string | null;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_actions: {
        Row: {
          action_type: string;
          actor_id: string;
          created_at: string;
          ends_at: string | null;
          id: string;
          reason: string;
          starts_at: string;
          target_user_id: string;
        };
        Insert: {
          action_type: string;
          actor_id: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          reason: string;
          starts_at?: string;
          target_user_id: string;
        };
        Update: {
          action_type?: string;
          actor_id?: string;
          created_at?: string;
          ends_at?: string | null;
          id?: string;
          reason?: string;
          starts_at?: string;
          target_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_actions_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_actions_target_user_id_fkey';
            columns: ['target_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_outbox: {
        Row: {
          attempts: number;
          available_at: string;
          channel: string;
          created_at: string;
          deduplication_key: string;
          delivered_at: string | null;
          event_type: string;
          id: string;
          last_error_category: string | null;
          payload: Json;
          status: Database['public']['Enums']['notification_status'];
          template_id: string | null;
          user_id: string;
        };
        Insert: {
          attempts?: number;
          available_at?: string;
          channel: string;
          created_at?: string;
          deduplication_key: string;
          delivered_at?: string | null;
          event_type: string;
          id?: string;
          last_error_category?: string | null;
          payload: Json;
          status?: Database['public']['Enums']['notification_status'];
          template_id?: string | null;
          user_id: string;
        };
        Update: {
          attempts?: number;
          available_at?: string;
          channel?: string;
          created_at?: string;
          deduplication_key?: string;
          delivered_at?: string | null;
          event_type?: string;
          id?: string;
          last_error_category?: string | null;
          payload?: Json;
          status?: Database['public']['Enums']['notification_status'];
          template_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_outbox_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'notification_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_outbox_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_preferences: {
        Row: {
          email: boolean;
          in_app: boolean;
          marketing: boolean;
          push: boolean;
          quiet_hours_end: string | null;
          quiet_hours_start: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          email?: boolean;
          in_app?: boolean;
          marketing?: boolean;
          push?: boolean;
          quiet_hours_end?: string | null;
          quiet_hours_start?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          email?: boolean;
          in_app?: boolean;
          marketing?: boolean;
          push?: boolean;
          quiet_hours_end?: string | null;
          quiet_hours_start?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_templates: {
        Row: {
          body_template: string;
          channel: string;
          enabled: boolean;
          event_type: string;
          id: string;
          locale: string;
          subject_template: string | null;
          version: number;
        };
        Insert: {
          body_template: string;
          channel: string;
          enabled?: boolean;
          event_type: string;
          id?: string;
          locale: string;
          subject_template?: string | null;
          version?: number;
        };
        Update: {
          body_template?: string;
          channel?: string;
          enabled?: boolean;
          event_type?: string;
          id?: string;
          locale?: string;
          subject_template?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      offer_revisions: {
        Row: {
          actor_id: string;
          created_at: string;
          id: string;
          offer_id: string;
          reason: string;
          revision: number;
          snapshot: Json;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          id?: string;
          offer_id: string;
          reason: string;
          revision: number;
          snapshot: Json;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          id?: string;
          offer_id?: string;
          reason?: string;
          revision?: number;
          snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'offer_revisions_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offer_revisions_offer_id_fkey';
            columns: ['offer_id'];
            isOneToOne: false;
            referencedRelation: 'offers';
            referencedColumns: ['id'];
          },
        ];
      };
      offer_status_history: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: string;
          new_status: Database['public']['Enums']['offer_status'];
          offer_id: string;
          previous_status: Database['public']['Enums']['offer_status'] | null;
          reason: string | null;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          new_status: Database['public']['Enums']['offer_status'];
          offer_id: string;
          previous_status?: Database['public']['Enums']['offer_status'] | null;
          reason?: string | null;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          new_status?: Database['public']['Enums']['offer_status'];
          offer_id?: string;
          previous_status?: Database['public']['Enums']['offer_status'] | null;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'offer_status_history_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offer_status_history_offer_id_fkey';
            columns: ['offer_id'];
            isOneToOne: false;
            referencedRelation: 'offers';
            referencedColumns: ['id'];
          },
        ];
      };
      offer_withdrawals: {
        Row: {
          created_at: string;
          id: string;
          offer_id: string;
          provider_id: string;
          reason: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          offer_id: string;
          provider_id: string;
          reason: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          offer_id?: string;
          provider_id?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'offer_withdrawals_offer_id_fkey';
            columns: ['offer_id'];
            isOneToOne: false;
            referencedRelation: 'offers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offer_withdrawals_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      offers: {
        Row: {
          created_at: string;
          currency: string;
          estimated_arrival_minutes: number;
          estimated_duration_minutes: number;
          expires_at: string;
          id: string;
          idempotency_key: string;
          labor_amount_minor: number | null;
          materials_estimate_minor: number | null;
          materials_included: boolean;
          provider_id: string;
          provider_note: string;
          request_id: string;
          status: Database['public']['Enums']['offer_status'];
          total_amount_minor: number;
          updated_at: string;
          version: number;
          visit_fee_minor: number;
          warranty_days: number;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          estimated_arrival_minutes: number;
          estimated_duration_minutes: number;
          expires_at: string;
          id?: string;
          idempotency_key: string;
          labor_amount_minor?: number | null;
          materials_estimate_minor?: number | null;
          materials_included: boolean;
          provider_id: string;
          provider_note?: string;
          request_id: string;
          status?: Database['public']['Enums']['offer_status'];
          total_amount_minor: number;
          updated_at?: string;
          version?: number;
          visit_fee_minor?: number;
          warranty_days?: number;
        };
        Update: {
          created_at?: string;
          currency?: string;
          estimated_arrival_minutes?: number;
          estimated_duration_minutes?: number;
          expires_at?: string;
          id?: string;
          idempotency_key?: string;
          labor_amount_minor?: number | null;
          materials_estimate_minor?: number | null;
          materials_included?: boolean;
          provider_id?: string;
          provider_note?: string;
          request_id?: string;
          status?: Database['public']['Enums']['offer_status'];
          total_amount_minor?: number;
          updated_at?: string;
          version?: number;
          visit_fee_minor?: number;
          warranty_days?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'offers_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'offers_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'offers_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_attempts: {
        Row: {
          attempt_number: number;
          created_at: string;
          error_category: string | null;
          id: string;
          payment_id: string;
          provider_reference: string | null;
          status: Database['public']['Enums']['financial_status'];
        };
        Insert: {
          attempt_number: number;
          created_at?: string;
          error_category?: string | null;
          id?: string;
          payment_id: string;
          provider_reference?: string | null;
          status: Database['public']['Enums']['financial_status'];
        };
        Update: {
          attempt_number?: number;
          created_at?: string;
          error_category?: string | null;
          id?: string;
          payment_id?: string;
          provider_reference?: string | null;
          status?: Database['public']['Enums']['financial_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'payment_attempts_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payment_accounting';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_attempts_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
        ];
      };
      payment_events: {
        Row: {
          amount_minor: number | null;
          created_at: string;
          event_type: string;
          id: string;
          payload_hash: string | null;
          payment_id: string;
          provider_event_id: string | null;
        };
        Insert: {
          amount_minor?: number | null;
          created_at?: string;
          event_type: string;
          id?: string;
          payload_hash?: string | null;
          payment_id: string;
          provider_event_id?: string | null;
        };
        Update: {
          amount_minor?: number | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          payload_hash?: string | null;
          payment_id?: string;
          provider_event_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payment_events_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payment_accounting';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payment_events_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
        ];
      };
      payments: {
        Row: {
          amount_minor: number;
          created_at: string;
          currency: string;
          customer_id: string;
          id: string;
          idempotency_key: string;
          job_id: string;
          payment_mode: string;
          provider_id: string;
          provider_name: string;
          provider_reference: string | null;
          refunded_minor: number;
          status: Database['public']['Enums']['financial_status'];
          updated_at: string;
          version: number;
        };
        Insert: {
          amount_minor: number;
          created_at?: string;
          currency?: string;
          customer_id: string;
          id?: string;
          idempotency_key: string;
          job_id: string;
          payment_mode: string;
          provider_id: string;
          provider_name: string;
          provider_reference?: string | null;
          refunded_minor?: number;
          status?: Database['public']['Enums']['financial_status'];
          updated_at?: string;
          version?: number;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          customer_id?: string;
          id?: string;
          idempotency_key?: string;
          job_id?: string;
          payment_mode?: string;
          provider_id?: string;
          provider_name?: string;
          provider_reference?: string | null;
          refunded_minor?: number;
          status?: Database['public']['Enums']['financial_status'];
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      platform_fees: {
        Row: {
          amount_minor: number;
          basis_minor: number;
          created_at: string;
          id: string;
          job_id: string;
          payment_id: string | null;
          rate_bps: number;
          rule_version: string;
        };
        Insert: {
          amount_minor: number;
          basis_minor: number;
          created_at?: string;
          id?: string;
          job_id: string;
          payment_id?: string | null;
          rate_bps: number;
          rule_version: string;
        };
        Update: {
          amount_minor?: number;
          basis_minor?: number;
          created_at?: string;
          id?: string;
          job_id?: string;
          payment_id?: string | null;
          rate_bps?: number;
          rule_version?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_fees_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_fees_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payment_accounting';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_fees_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
        ];
      };
      privacy_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          request_id: string;
          request_type: string;
          user_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          request_id: string;
          request_type: string;
          user_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          request_id?: string;
          request_type?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'privacy_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'privacy_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          anonymized_at: string | null;
          avatar_path: string | null;
          created_at: string;
          display_name: string;
          id: string;
          phone: string | null;
          preferred_locale: string;
          status: Database['public']['Enums']['account_status'];
          updated_at: string;
        };
        Insert: {
          anonymized_at?: string | null;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string;
          id: string;
          phone?: string | null;
          preferred_locale?: string;
          status?: Database['public']['Enums']['account_status'];
          updated_at?: string;
        };
        Update: {
          anonymized_at?: string | null;
          avatar_path?: string | null;
          created_at?: string;
          display_name?: string;
          id?: string;
          phone?: string | null;
          preferred_locale?: string;
          status?: Database['public']['Enums']['account_status'];
          updated_at?: string;
        };
        Relationships: [];
      };
      provider_availability: {
        Row: {
          end_time: string;
          id: string;
          provider_id: string;
          start_time: string;
          timezone: string;
          weekday: number;
        };
        Insert: {
          end_time: string;
          id?: string;
          provider_id: string;
          start_time: string;
          timezone?: string;
          weekday: number;
        };
        Update: {
          end_time?: string;
          id?: string;
          provider_id?: string;
          start_time?: string;
          timezone?: string;
          weekday?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_availability_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_blackout_periods: {
        Row: {
          ends_at: string;
          id: string;
          provider_id: string;
          reason: string | null;
          starts_at: string;
        };
        Insert: {
          ends_at: string;
          id?: string;
          provider_id: string;
          reason?: string | null;
          starts_at: string;
        };
        Update: {
          ends_at?: string;
          id?: string;
          provider_id?: string;
          reason?: string | null;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_blackout_periods_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_document_reviews: {
        Row: {
          created_at: string;
          decision: Database['public']['Enums']['verification_status'];
          document_id: string;
          id: string;
          reason: string;
          reviewer_id: string;
        };
        Insert: {
          created_at?: string;
          decision: Database['public']['Enums']['verification_status'];
          document_id: string;
          id?: string;
          reason: string;
          reviewer_id: string;
        };
        Update: {
          created_at?: string;
          decision?: Database['public']['Enums']['verification_status'];
          document_id?: string;
          id?: string;
          reason?: string;
          reviewer_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_document_reviews_document_id_fkey';
            columns: ['document_id'];
            isOneToOne: false;
            referencedRelation: 'provider_documents';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_document_reviews_reviewer_id_fkey';
            columns: ['reviewer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      provider_documents: {
        Row: {
          content_hash: string;
          created_at: string;
          deleted_at: string | null;
          document_type: string;
          expires_at: string | null;
          id: string;
          mime_type: string;
          provider_id: string;
          size_bytes: number;
          status: Database['public']['Enums']['verification_status'];
          storage_path: string;
        };
        Insert: {
          content_hash: string;
          created_at?: string;
          deleted_at?: string | null;
          document_type: string;
          expires_at?: string | null;
          id?: string;
          mime_type: string;
          provider_id: string;
          size_bytes: number;
          status?: Database['public']['Enums']['verification_status'];
          storage_path: string;
        };
        Update: {
          content_hash?: string;
          created_at?: string;
          deleted_at?: string | null;
          document_type?: string;
          expires_at?: string | null;
          id?: string;
          mime_type?: string;
          provider_id?: string;
          size_bytes?: number;
          status?: Database['public']['Enums']['verification_status'];
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_documents_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_job_eligibility_reviews: {
        Row: {
          created_at: string;
          id: string;
          job_id: string;
          provider_id: string;
          reason: string;
          resolved_at: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          job_id: string;
          provider_id: string;
          reason: string;
          resolved_at?: string | null;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          job_id?: string;
          provider_id?: string;
          reason?: string;
          resolved_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_job_eligibility_reviews_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_job_eligibility_reviews_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_payout_accounts: {
        Row: {
          created_at: string;
          id: string;
          last4: string | null;
          provider_id: string;
          provider_name: string;
          provider_token: string;
          status: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last4?: string | null;
          provider_id: string;
          provider_name: string;
          provider_token: string;
          status?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last4?: string | null;
          provider_id?: string;
          provider_name?: string;
          provider_token?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_payout_accounts_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_performance_snapshots: {
        Row: {
          active_workload: number;
          cancellation_rate: number;
          completed_jobs: number;
          completion_rate: number;
          id: string;
          provider_id: string;
          rating: number;
          response_minutes: number | null;
          snapshot_date: string;
        };
        Insert: {
          active_workload: number;
          cancellation_rate: number;
          completed_jobs: number;
          completion_rate: number;
          id?: string;
          provider_id: string;
          rating: number;
          response_minutes?: number | null;
          snapshot_date: string;
        };
        Update: {
          active_workload?: number;
          cancellation_rate?: number;
          completed_jobs?: number;
          completion_rate?: number;
          id?: string;
          provider_id?: string;
          rating?: number;
          response_minutes?: number | null;
          snapshot_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_performance_snapshots_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_portfolio_items: {
        Row: {
          category_id: string | null;
          created_at: string;
          description: string | null;
          id: string;
          provider_id: string;
          sort_order: number;
          storage_path: string;
          title: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          provider_id: string;
          sort_order?: number;
          storage_path: string;
          title: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          provider_id?: string;
          sort_order?: number;
          storage_path?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_portfolio_items_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_portfolio_items_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_profiles: {
        Row: {
          accepting_requests: boolean;
          active_workload: number;
          bio: string | null;
          business_name: string | null;
          commercial_registration_reference: string | null;
          completed_jobs: number;
          created_at: string;
          kind: Database['public']['Enums']['provider_kind'];
          max_active_jobs: number;
          preferred_brief_locale: string;
          rating_average: number;
          rating_count: number;
          response_rate: number;
          service_radius_km: number;
          updated_at: string;
          user_id: string;
          verification_status: Database['public']['Enums']['verification_status'];
        };
        Insert: {
          accepting_requests?: boolean;
          active_workload?: number;
          bio?: string | null;
          business_name?: string | null;
          commercial_registration_reference?: string | null;
          completed_jobs?: number;
          created_at?: string;
          kind: Database['public']['Enums']['provider_kind'];
          max_active_jobs?: number;
          preferred_brief_locale?: string;
          rating_average?: number;
          rating_count?: number;
          response_rate?: number;
          service_radius_km?: number;
          updated_at?: string;
          user_id: string;
          verification_status?: Database['public']['Enums']['verification_status'];
        };
        Update: {
          accepting_requests?: boolean;
          active_workload?: number;
          bio?: string | null;
          business_name?: string | null;
          commercial_registration_reference?: string | null;
          completed_jobs?: number;
          created_at?: string;
          kind?: Database['public']['Enums']['provider_kind'];
          max_active_jobs?: number;
          preferred_brief_locale?: string;
          rating_average?: number;
          rating_count?: number;
          response_rate?: number;
          service_radius_km?: number;
          updated_at?: string;
          user_id?: string;
          verification_status?: Database['public']['Enums']['verification_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'provider_profiles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      provider_qualification_events: {
        Row: {
          actor_id: string;
          category_id: string;
          created_at: string;
          event_type: string;
          id: string;
          provider_id: string;
          qualification_id: string;
          reason: string;
          subcategory_id: string | null;
        };
        Insert: {
          actor_id: string;
          category_id: string;
          created_at?: string;
          event_type: string;
          id?: string;
          provider_id: string;
          qualification_id: string;
          reason: string;
          subcategory_id?: string | null;
        };
        Update: {
          actor_id?: string;
          category_id?: string;
          created_at?: string;
          event_type?: string;
          id?: string;
          provider_id?: string;
          qualification_id?: string;
          reason?: string;
          subcategory_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_qualification_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_qualification_events_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_qualification_events_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'provider_qualification_events_qualification_id_fkey';
            columns: ['qualification_id'];
            isOneToOne: false;
            referencedRelation: 'provider_restricted_qualifications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_qualification_events_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'service_subcategories';
            referencedColumns: ['id'];
          },
        ];
      };
      provider_restricted_qualifications: {
        Row: {
          category_id: string;
          id: string;
          provider_id: string;
          qualified: boolean;
          reason: string;
          reviewed_at: string;
          reviewed_by: string;
          subcategory_id: string | null;
          updated_at: string;
        };
        Insert: {
          category_id: string;
          id?: string;
          provider_id: string;
          qualified: boolean;
          reason: string;
          reviewed_at?: string;
          reviewed_by: string;
          subcategory_id?: string | null;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          id?: string;
          provider_id?: string;
          qualified?: boolean;
          reason?: string;
          reviewed_at?: string;
          reviewed_by?: string;
          subcategory_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_restricted_qualifications_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_restricted_qualifications_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'provider_restricted_qualifications_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_restricted_qualifications_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'service_subcategories';
            referencedColumns: ['id'];
          },
        ];
      };
      provider_service_areas: {
        Row: {
          center: unknown;
          city_id: string;
          district_id: string | null;
          enabled: boolean;
          id: string;
          provider_id: string;
          radius_m: number | null;
        };
        Insert: {
          center?: unknown;
          city_id: string;
          district_id?: string | null;
          enabled?: boolean;
          id?: string;
          provider_id: string;
          radius_m?: number | null;
        };
        Update: {
          center?: unknown;
          city_id?: string;
          district_id?: string | null;
          enabled?: boolean;
          id?: string;
          provider_id?: string;
          radius_m?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_service_areas_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_service_areas_district_id_fkey';
            columns: ['district_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_service_areas_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_services: {
        Row: {
          category_id: string;
          created_at: string;
          enabled: boolean;
          provider_id: string;
          qualified_for_restricted: boolean;
          review_reason: string | null;
          review_status: Database['public']['Enums']['provider_service_review_status'];
          reviewed_at: string | null;
          reviewed_by: string | null;
          subcategory_id: string | null;
          submitted_at: string | null;
        };
        Insert: {
          category_id: string;
          created_at?: string;
          enabled?: boolean;
          provider_id: string;
          qualified_for_restricted?: boolean;
          review_reason?: string | null;
          review_status?: Database['public']['Enums']['provider_service_review_status'];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          subcategory_id?: string | null;
          submitted_at?: string | null;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          enabled?: boolean;
          provider_id?: string;
          qualified_for_restricted?: boolean;
          review_reason?: string | null;
          review_status?: Database['public']['Enums']['provider_service_review_status'];
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          subcategory_id?: string | null;
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_services_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_services_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'provider_services_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_services_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'service_subcategories';
            referencedColumns: ['id'];
          },
        ];
      };
      provider_settlements: {
        Row: {
          created_at: string;
          fee_minor: number;
          gross_minor: number;
          id: string;
          idempotency_key: string;
          net_minor: number;
          payment_id: string;
          provider_id: string;
          provider_reference: string | null;
          status: Database['public']['Enums']['financial_status'];
        };
        Insert: {
          created_at?: string;
          fee_minor: number;
          gross_minor: number;
          id?: string;
          idempotency_key: string;
          net_minor: number;
          payment_id: string;
          provider_id: string;
          provider_reference?: string | null;
          status?: Database['public']['Enums']['financial_status'];
        };
        Update: {
          created_at?: string;
          fee_minor?: number;
          gross_minor?: number;
          id?: string;
          idempotency_key?: string;
          net_minor?: number;
          payment_id?: string;
          provider_id?: string;
          provider_reference?: string | null;
          status?: Database['public']['Enums']['financial_status'];
        };
        Relationships: [
          {
            foreignKeyName: 'provider_settlements_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payment_accounting';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_settlements_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_settlements_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_status_history: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: string;
          new_status: Database['public']['Enums']['verification_status'];
          previous_status: Database['public']['Enums']['verification_status'] | null;
          provider_id: string;
          reason: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          new_status: Database['public']['Enums']['verification_status'];
          previous_status?: Database['public']['Enums']['verification_status'] | null;
          provider_id: string;
          reason: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          new_status?: Database['public']['Enums']['verification_status'];
          previous_status?: Database['public']['Enums']['verification_status'] | null;
          provider_id?: string;
          reason?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_status_history_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_status_history_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_suspensions: {
        Row: {
          actor_id: string;
          ends_at: string | null;
          id: string;
          lifted_at: string | null;
          lifted_by: string | null;
          provider_id: string;
          reason: string;
          starts_at: string;
        };
        Insert: {
          actor_id: string;
          ends_at?: string | null;
          id?: string;
          lifted_at?: string | null;
          lifted_by?: string | null;
          provider_id: string;
          reason: string;
          starts_at?: string;
        };
        Update: {
          actor_id?: string;
          ends_at?: string | null;
          id?: string;
          lifted_at?: string | null;
          lifted_by?: string | null;
          provider_id?: string;
          reason?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_suspensions_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_suspensions_lifted_by_fkey';
            columns: ['lifted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'provider_suspensions_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      push_tokens: {
        Row: {
          device_id: string | null;
          enabled: boolean;
          id: string;
          last_result: string | null;
          provider: string;
          token_ciphertext: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          device_id?: string | null;
          enabled?: boolean;
          id?: string;
          last_result?: string | null;
          provider?: string;
          token_ciphertext: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          device_id?: string | null;
          enabled?: boolean;
          id?: string;
          last_result?: string | null;
          provider?: string;
          token_ciphertext?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_device_id_fkey';
            columns: ['device_id'];
            isOneToOne: false;
            referencedRelation: 'user_devices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      rate_limit_buckets: {
        Row: {
          count: number;
          key_hash: string;
          limit_value: number;
          operation: string;
          updated_at: string;
          window_start: string;
        };
        Insert: {
          count?: number;
          key_hash: string;
          limit_value: number;
          operation: string;
          updated_at?: string;
          window_start: string;
        };
        Update: {
          count?: number;
          key_hash?: string;
          limit_value?: number;
          operation?: string;
          updated_at?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      rating_replies: {
        Row: {
          created_at: string;
          id: string;
          moderation_status: string;
          provider_id: string;
          rating_id: string;
          reply: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          moderation_status?: string;
          provider_id: string;
          rating_id: string;
          reply: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          moderation_status?: string;
          provider_id?: string;
          rating_id?: string;
          reply?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rating_replies_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'rating_replies_rating_id_fkey';
            columns: ['rating_id'];
            isOneToOne: true;
            referencedRelation: 'ratings';
            referencedColumns: ['id'];
          },
        ];
      };
      ratings: {
        Row: {
          created_at: string;
          customer_id: string;
          id: string;
          job_id: string;
          moderation_status: string;
          provider_id: string;
          review: string | null;
          score: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customer_id: string;
          id?: string;
          job_id: string;
          moderation_status?: string;
          provider_id: string;
          review?: string | null;
          score: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_id?: string;
          id?: string;
          job_id?: string;
          moderation_status?: string;
          provider_id?: string;
          review?: string | null;
          score?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ratings_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ratings_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: true;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ratings_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      receipts: {
        Row: {
          amount_minor: number;
          currency: string;
          id: string;
          issued_at: string;
          payment_id: string;
          private_pdf_path: string | null;
          receipt_number: string;
        };
        Insert: {
          amount_minor: number;
          currency?: string;
          id?: string;
          issued_at: string;
          payment_id: string;
          private_pdf_path?: string | null;
          receipt_number: string;
        };
        Update: {
          amount_minor?: number;
          currency?: string;
          id?: string;
          issued_at?: string;
          payment_id?: string;
          private_pdf_path?: string | null;
          receipt_number?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'receipts_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payment_accounting';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'receipts_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
        ];
      };
      refunds: {
        Row: {
          amount_minor: number;
          created_at: string;
          created_by: string;
          id: string;
          idempotency_key: string;
          payment_id: string;
          provider_reference: string | null;
          reason: string;
          status: Database['public']['Enums']['financial_status'];
          updated_at: string;
        };
        Insert: {
          amount_minor: number;
          created_at?: string;
          created_by: string;
          id?: string;
          idempotency_key: string;
          payment_id: string;
          provider_reference?: string | null;
          reason: string;
          status?: Database['public']['Enums']['financial_status'];
          updated_at?: string;
        };
        Update: {
          amount_minor?: number;
          created_at?: string;
          created_by?: string;
          id?: string;
          idempotency_key?: string;
          payment_id?: string;
          provider_reference?: string | null;
          reason?: string;
          status?: Database['public']['Enums']['financial_status'];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'refunds_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payment_accounting';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'refunds_payment_id_fkey';
            columns: ['payment_id'];
            isOneToOne: false;
            referencedRelation: 'payments';
            referencedColumns: ['id'];
          },
        ];
      };
      request_media: {
        Row: {
          content_hash: string | null;
          created_at: string;
          deleted_at: string | null;
          file_upload_id: string | null;
          id: string;
          media_kind: string;
          mime_type: string;
          request_id: string;
          size_bytes: number;
          storage_path: string;
          thumbnail_path: string | null;
          upload_status: string;
          uploader_id: string;
        };
        Insert: {
          content_hash?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          file_upload_id?: string | null;
          id?: string;
          media_kind: string;
          mime_type: string;
          request_id: string;
          size_bytes: number;
          storage_path: string;
          thumbnail_path?: string | null;
          upload_status?: string;
          uploader_id: string;
        };
        Update: {
          content_hash?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          file_upload_id?: string | null;
          id?: string;
          media_kind?: string;
          mime_type?: string;
          request_id?: string;
          size_bytes?: number;
          storage_path?: string;
          thumbnail_path?: string | null;
          upload_status?: string;
          uploader_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_media_file_upload_id_fkey';
            columns: ['file_upload_id'];
            isOneToOne: true;
            referencedRelation: 'file_uploads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_media_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_media_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_media_uploader_id_fkey';
            columns: ['uploader_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      request_provider_matches: {
        Row: {
          brief_translation_id: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          matching_run_id: string;
          notified_at: string | null;
          provider_id: string;
          request_id: string;
          score: number;
          status: string;
          viewed_at: string | null;
        };
        Insert: {
          brief_translation_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          matching_run_id: string;
          notified_at?: string | null;
          provider_id: string;
          request_id: string;
          score: number;
          status?: string;
          viewed_at?: string | null;
        };
        Update: {
          brief_translation_id?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          matching_run_id?: string;
          notified_at?: string | null;
          provider_id?: string;
          request_id?: string;
          score?: number;
          status?: string;
          viewed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'request_provider_matches_brief_translation_id_fkey';
            columns: ['brief_translation_id'];
            isOneToOne: false;
            referencedRelation: 'request_translations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_provider_matches_matching_run_id_fkey';
            columns: ['matching_run_id'];
            isOneToOne: false;
            referencedRelation: 'matching_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_provider_matches_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'request_provider_matches_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_provider_matches_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      request_publication_events: {
        Row: {
          actor_id: string;
          approval_snapshot: Json;
          created_at: string;
          id: string;
          idempotency_key: string;
          request_id: string;
          request_version: number;
        };
        Insert: {
          actor_id: string;
          approval_snapshot: Json;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          request_id: string;
          request_version: number;
        };
        Update: {
          actor_id?: string;
          approval_snapshot?: Json;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          request_id?: string;
          request_version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'request_publication_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_publication_events_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_publication_events_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      request_safety_flags: {
        Row: {
          created_at: string;
          flag_type: string;
          guidance_version: string | null;
          id: string;
          request_id: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          severity: string;
          source: string;
        };
        Insert: {
          created_at?: string;
          flag_type: string;
          guidance_version?: string | null;
          id?: string;
          request_id: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          severity: string;
          source: string;
        };
        Update: {
          created_at?: string;
          flag_type?: string;
          guidance_version?: string | null;
          id?: string;
          request_id?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          severity?: string;
          source?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_safety_flags_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_safety_flags_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_safety_flags_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      request_status_history: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: string;
          idempotency_key: string | null;
          metadata: Json;
          new_status: Database['public']['Enums']['request_status'];
          previous_status: Database['public']['Enums']['request_status'] | null;
          reason: string | null;
          request_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          new_status: Database['public']['Enums']['request_status'];
          previous_status?: Database['public']['Enums']['request_status'] | null;
          reason?: string | null;
          request_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          idempotency_key?: string | null;
          metadata?: Json;
          new_status?: Database['public']['Enums']['request_status'];
          previous_status?: Database['public']['Enums']['request_status'] | null;
          reason?: string | null;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_status_history_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_status_history_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_status_history_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      request_translations: {
        Row: {
          created_at: string;
          id: string;
          original_content: Json;
          request_id: string;
          source_locale: string;
          status: string;
          target_locale: string;
          translated_content: Json | null;
          translation_job_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          original_content: Json;
          request_id: string;
          source_locale: string;
          status?: string;
          target_locale: string;
          translated_content?: Json | null;
          translation_job_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          original_content?: Json;
          request_id?: string;
          source_locale?: string;
          status?: string;
          target_locale?: string;
          translated_content?: Json | null;
          translation_job_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_translations_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_translations_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_translations_translation_job_id_fkey';
            columns: ['translation_job_id'];
            isOneToOne: false;
            referencedRelation: 'translation_jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      request_visibility: {
        Row: {
          expires_at: string | null;
          max_providers: number;
          request_id: string;
          updated_at: string;
          visibility: string;
        };
        Insert: {
          expires_at?: string | null;
          max_providers?: number;
          request_id: string;
          updated_at?: string;
          visibility?: string;
        };
        Update: {
          expires_at?: string | null;
          max_providers?: number;
          request_id?: string;
          updated_at?: string;
          visibility?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'request_visibility_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: true;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'request_visibility_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: true;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      resolution_actions: {
        Row: {
          action_type: string;
          actor_id: string;
          amount_minor: number | null;
          completed_at: string | null;
          created_at: string;
          dispute_id: string;
          id: string;
          idempotency_key: string;
          reason: string;
          status: string;
        };
        Insert: {
          action_type: string;
          actor_id: string;
          amount_minor?: number | null;
          completed_at?: string | null;
          created_at?: string;
          dispute_id: string;
          id?: string;
          idempotency_key: string;
          reason: string;
          status?: string;
        };
        Update: {
          action_type?: string;
          actor_id?: string;
          amount_minor?: number | null;
          completed_at?: string | null;
          created_at?: string;
          dispute_id?: string;
          id?: string;
          idempotency_key?: string;
          reason?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'resolution_actions_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'resolution_actions_dispute_id_fkey';
            columns: ['dispute_id'];
            isOneToOne: false;
            referencedRelation: 'disputes';
            referencedColumns: ['id'];
          },
        ];
      };
      scheduled_jobs: {
        Row: {
          attempts: number;
          completed_at: string | null;
          error_category: string | null;
          id: string;
          job_type: string;
          last_error_at: string | null;
          locked_at: string | null;
          payload: Json;
          scheduled_at: string;
          status: string;
          worker_id: string | null;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          error_category?: string | null;
          id?: string;
          job_type: string;
          last_error_at?: string | null;
          locked_at?: string | null;
          payload: Json;
          scheduled_at: string;
          status?: string;
          worker_id?: string | null;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          error_category?: string | null;
          id?: string;
          job_type?: string;
          last_error_at?: string | null;
          locked_at?: string | null;
          payload?: Json;
          scheduled_at?: string;
          status?: string;
          worker_id?: string | null;
        };
        Relationships: [];
      };
      service_categories: {
        Row: {
          created_at: string;
          enabled: boolean;
          icon_key: string;
          id: string;
          restricted: boolean;
          slug: string;
          sort_order: number;
          updated_at: string;
          verification_required: boolean;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          icon_key: string;
          id?: string;
          restricted?: boolean;
          slug: string;
          sort_order?: number;
          updated_at?: string;
          verification_required?: boolean;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          icon_key?: string;
          id?: string;
          restricted?: boolean;
          slug?: string;
          sort_order?: number;
          updated_at?: string;
          verification_required?: boolean;
        };
        Relationships: [];
      };
      service_category_translations: {
        Row: {
          category_id: string;
          description: string;
          locale: string;
          name: string;
        };
        Insert: {
          category_id: string;
          description: string;
          locale: string;
          name: string;
        };
        Update: {
          category_id?: string;
          description?: string;
          locale?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_category_translations_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      service_question_translations: {
        Row: {
          help_text: string | null;
          locale: string;
          prompt: string;
          question_id: string;
        };
        Insert: {
          help_text?: string | null;
          locale: string;
          prompt: string;
          question_id: string;
        };
        Update: {
          help_text?: string | null;
          locale?: string;
          prompt?: string;
          question_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_question_translations_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'service_questions';
            referencedColumns: ['id'];
          },
        ];
      };
      service_questions: {
        Row: {
          answer_type: string;
          category_id: string;
          enabled: boolean;
          id: string;
          key: string;
          options: Json | null;
          required: boolean;
          safety_relevant: boolean;
          sort_order: number;
          subcategory_id: string | null;
          validation: Json;
        };
        Insert: {
          answer_type: string;
          category_id: string;
          enabled?: boolean;
          id?: string;
          key: string;
          options?: Json | null;
          required?: boolean;
          safety_relevant?: boolean;
          sort_order?: number;
          subcategory_id?: string | null;
          validation?: Json;
        };
        Update: {
          answer_type?: string;
          category_id?: string;
          enabled?: boolean;
          id?: string;
          key?: string;
          options?: Json | null;
          required?: boolean;
          safety_relevant?: boolean;
          sort_order?: number;
          subcategory_id?: string | null;
          validation?: Json;
        };
        Relationships: [
          {
            foreignKeyName: 'service_questions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_questions_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'service_subcategories';
            referencedColumns: ['id'];
          },
        ];
      };
      service_regions: {
        Row: {
          boundary: unknown;
          code: string;
          enabled: boolean;
          id: string;
          name_ar: string;
          name_en: string;
        };
        Insert: {
          boundary?: unknown;
          code: string;
          enabled?: boolean;
          id?: string;
          name_ar: string;
          name_en: string;
        };
        Update: {
          boundary?: unknown;
          code?: string;
          enabled?: boolean;
          id?: string;
          name_ar?: string;
          name_en?: string;
        };
        Relationships: [];
      };
      service_request_answers: {
        Row: {
          answer_boolean: boolean | null;
          answer_number: number | null;
          answer_options: string[] | null;
          answer_text: string | null;
          created_at: string;
          id: string;
          question_id: string;
          request_id: string;
        };
        Insert: {
          answer_boolean?: boolean | null;
          answer_number?: number | null;
          answer_options?: string[] | null;
          answer_text?: string | null;
          created_at?: string;
          id?: string;
          question_id: string;
          request_id: string;
        };
        Update: {
          answer_boolean?: boolean | null;
          answer_number?: number | null;
          answer_options?: string[] | null;
          answer_text?: string | null;
          created_at?: string;
          id?: string;
          question_id?: string;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_request_answers_question_id_fkey';
            columns: ['question_id'];
            isOneToOne: false;
            referencedRelation: 'service_questions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_request_answers_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_request_answers_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      service_requests: {
        Row: {
          ai_model: string | null;
          ai_prompt_version: string | null;
          ai_provider: string | null;
          approximate_location: unknown;
          cancellation_reason: string | null;
          category_confirmed_at: string | null;
          category_id: string | null;
          category_selection_source: string | null;
          city_id: string;
          created_at: string;
          customer_approved_at: string | null;
          customer_id: string;
          deleted_at: string | null;
          district_id: string | null;
          exact_address_id: string | null;
          id: string;
          original_locale: string;
          original_text: string;
          published_at: string | null;
          requested_end: string | null;
          requested_start: string | null;
          status: Database['public']['Enums']['request_status'];
          structured_description: string;
          subcategory_id: string | null;
          suggested_category_id: string | null;
          timing_mode: Database['public']['Enums']['request_timing_mode'];
          title: string;
          updated_at: string;
          urgency: Database['public']['Enums']['request_urgency'];
          version: number;
        };
        Insert: {
          ai_model?: string | null;
          ai_prompt_version?: string | null;
          ai_provider?: string | null;
          approximate_location?: unknown;
          cancellation_reason?: string | null;
          category_confirmed_at?: string | null;
          category_id?: string | null;
          category_selection_source?: string | null;
          city_id: string;
          created_at?: string;
          customer_approved_at?: string | null;
          customer_id: string;
          deleted_at?: string | null;
          district_id?: string | null;
          exact_address_id?: string | null;
          id?: string;
          original_locale?: string;
          original_text: string;
          published_at?: string | null;
          requested_end?: string | null;
          requested_start?: string | null;
          status?: Database['public']['Enums']['request_status'];
          structured_description: string;
          subcategory_id?: string | null;
          suggested_category_id?: string | null;
          timing_mode?: Database['public']['Enums']['request_timing_mode'];
          title: string;
          updated_at?: string;
          urgency?: Database['public']['Enums']['request_urgency'];
          version?: number;
        };
        Update: {
          ai_model?: string | null;
          ai_prompt_version?: string | null;
          ai_provider?: string | null;
          approximate_location?: unknown;
          cancellation_reason?: string | null;
          category_confirmed_at?: string | null;
          category_id?: string | null;
          category_selection_source?: string | null;
          city_id?: string;
          created_at?: string;
          customer_approved_at?: string | null;
          customer_id?: string;
          deleted_at?: string | null;
          district_id?: string | null;
          exact_address_id?: string | null;
          id?: string;
          original_locale?: string;
          original_text?: string;
          published_at?: string | null;
          requested_end?: string | null;
          requested_start?: string | null;
          status?: Database['public']['Enums']['request_status'];
          structured_description?: string;
          subcategory_id?: string | null;
          suggested_category_id?: string | null;
          timing_mode?: Database['public']['Enums']['request_timing_mode'];
          title?: string;
          updated_at?: string;
          urgency?: Database['public']['Enums']['request_urgency'];
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'service_requests_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_district_id_fkey';
            columns: ['district_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_exact_address_id_fkey';
            columns: ['exact_address_id'];
            isOneToOne: false;
            referencedRelation: 'addresses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'service_subcategories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_suggested_category_id_fkey';
            columns: ['suggested_category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      service_subcategories: {
        Row: {
          category_id: string;
          enabled: boolean;
          id: string;
          restricted: boolean;
          slug: string;
          sort_order: number;
        };
        Insert: {
          category_id: string;
          enabled?: boolean;
          id?: string;
          restricted?: boolean;
          slug: string;
          sort_order?: number;
        };
        Update: {
          category_id?: string;
          enabled?: boolean;
          id?: string;
          restricted?: boolean;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'service_subcategories_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
        ];
      };
      service_subcategory_translations: {
        Row: {
          description: string;
          locale: string;
          name: string;
          subcategory_id: string;
        };
        Insert: {
          description: string;
          locale: string;
          name: string;
          subcategory_id: string;
        };
        Update: {
          description?: string;
          locale?: string;
          name?: string;
          subcategory_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_subcategory_translations_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'service_subcategories';
            referencedColumns: ['id'];
          },
        ];
      };
      settlement_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          reason: string | null;
          settlement_id: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          reason?: string | null;
          settlement_id: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          reason?: string | null;
          settlement_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'settlement_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'settlement_events_settlement_id_fkey';
            columns: ['settlement_id'];
            isOneToOne: false;
            referencedRelation: 'provider_settlements';
            referencedColumns: ['id'];
          },
        ];
      };
      support_case_access_grants: {
        Row: {
          access_type: string;
          case_id: string;
          created_at: string;
          expires_at: string;
          granted_by: string;
          id: string;
          permissions: string[];
          reason: string;
          revoked_at: string | null;
          revoked_by: string | null;
          revoked_reason: string | null;
          starts_at: string;
          user_id: string;
        };
        Insert: {
          access_type: string;
          case_id: string;
          created_at?: string;
          expires_at: string;
          granted_by: string;
          id?: string;
          permissions: string[];
          reason: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          starts_at?: string;
          user_id: string;
        };
        Update: {
          access_type?: string;
          case_id?: string;
          created_at?: string;
          expires_at?: string;
          granted_by?: string;
          id?: string;
          permissions?: string[];
          reason?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          revoked_reason?: string | null;
          starts_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_case_access_grants_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'support_cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_case_access_grants_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_case_access_grants_revoked_by_fkey';
            columns: ['revoked_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_case_access_grants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      support_case_assignments: {
        Row: {
          assigned_at: string;
          assigned_by: string;
          assignee_id: string;
          case_id: string;
          ended_at: string | null;
          ended_reason: string | null;
          expires_at: string | null;
          id: string;
          permissions: string[];
        };
        Insert: {
          assigned_at?: string;
          assigned_by: string;
          assignee_id: string;
          case_id: string;
          ended_at?: string | null;
          ended_reason?: string | null;
          expires_at?: string | null;
          id?: string;
          permissions?: string[];
        };
        Update: {
          assigned_at?: string;
          assigned_by?: string;
          assignee_id?: string;
          case_id?: string;
          ended_at?: string | null;
          ended_reason?: string | null;
          expires_at?: string | null;
          id?: string;
          permissions?: string[];
        };
        Relationships: [
          {
            foreignKeyName: 'support_case_assignments_assigned_by_fkey';
            columns: ['assigned_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_case_assignments_assignee_id_fkey';
            columns: ['assignee_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_case_assignments_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'support_cases';
            referencedColumns: ['id'];
          },
        ];
      };
      support_case_evidence: {
        Row: {
          case_id: string;
          content_hash: string | null;
          created_at: string;
          id: string;
          mime_type: string;
          private_storage_path: string;
          size_bytes: number;
          uploader_id: string;
        };
        Insert: {
          case_id: string;
          content_hash?: string | null;
          created_at?: string;
          id?: string;
          mime_type: string;
          private_storage_path: string;
          size_bytes: number;
          uploader_id: string;
        };
        Update: {
          case_id?: string;
          content_hash?: string | null;
          created_at?: string;
          id?: string;
          mime_type?: string;
          private_storage_path?: string;
          size_bytes?: number;
          uploader_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_case_evidence_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'support_cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_case_evidence_uploader_id_fkey';
            columns: ['uploader_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      support_case_messages: {
        Row: {
          body: string;
          case_id: string;
          created_at: string;
          id: string;
          sender_id: string;
          visible_to_user: boolean;
        };
        Insert: {
          body: string;
          case_id: string;
          created_at?: string;
          id?: string;
          sender_id: string;
          visible_to_user?: boolean;
        };
        Update: {
          body?: string;
          case_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
          visible_to_user?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'support_case_messages_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'support_cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_case_messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      support_cases: {
        Row: {
          closed_at: string | null;
          created_at: string;
          dispute_id: string | null;
          id: string;
          job_id: string | null;
          opened_by: string;
          priority: string;
          request_id: string | null;
          status: Database['public']['Enums']['case_status'];
          subject: string;
          topic: string;
          updated_at: string;
        };
        Insert: {
          closed_at?: string | null;
          created_at?: string;
          dispute_id?: string | null;
          id?: string;
          job_id?: string | null;
          opened_by: string;
          priority?: string;
          request_id?: string | null;
          status?: Database['public']['Enums']['case_status'];
          subject: string;
          topic: string;
          updated_at?: string;
        };
        Update: {
          closed_at?: string | null;
          created_at?: string;
          dispute_id?: string | null;
          id?: string;
          job_id?: string | null;
          opened_by?: string;
          priority?: string;
          request_id?: string | null;
          status?: Database['public']['Enums']['case_status'];
          subject?: string;
          topic?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_cases_dispute_id_fkey';
            columns: ['dispute_id'];
            isOneToOne: true;
            referencedRelation: 'disputes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_cases_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_cases_opened_by_fkey';
            columns: ['opened_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_cases_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_cases_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      support_internal_notes: {
        Row: {
          author_id: string;
          body: string;
          case_id: string;
          created_at: string;
          id: string;
        };
        Insert: {
          author_id: string;
          body: string;
          case_id: string;
          created_at?: string;
          id?: string;
        };
        Update: {
          author_id?: string;
          body?: string;
          case_id?: string;
          created_at?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_internal_notes_author_id_fkey';
            columns: ['author_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'support_internal_notes_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'support_cases';
            referencedColumns: ['id'];
          },
        ];
      };
      system_incidents: {
        Row: {
          commander_id: string | null;
          created_at: string;
          id: string;
          resolved_at: string | null;
          severity: string;
          started_at: string;
          status: string;
          summary: string;
          title: string;
        };
        Insert: {
          commander_id?: string | null;
          created_at?: string;
          id?: string;
          resolved_at?: string | null;
          severity: string;
          started_at: string;
          status?: string;
          summary: string;
          title: string;
        };
        Update: {
          commander_id?: string | null;
          created_at?: string;
          id?: string;
          resolved_at?: string | null;
          severity?: string;
          started_at?: string;
          status?: string;
          summary?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'system_incidents_commander_id_fkey';
            columns: ['commander_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      system_settings: {
        Row: {
          key: string;
          sensitive: boolean;
          updated_at: string;
          updated_by: string | null;
          value: Json;
          version: number;
        };
        Insert: {
          key: string;
          sensitive?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          value: Json;
          version?: number;
        };
        Update: {
          key?: string;
          sensitive?: boolean;
          updated_at?: string;
          updated_by?: string | null;
          value?: Json;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'system_settings_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      transcription_jobs: {
        Row: {
          claim_expires_at: string | null;
          claim_token: string | null;
          client_message_id: string | null;
          completed_at: string | null;
          created_at: string;
          customer_edited_transcript: string | null;
          error_category: string | null;
          expires_at: string | null;
          id: string;
          model: string | null;
          private_audio_path: string;
          provider: string | null;
          request_id: string | null;
          source_locale: string | null;
          status: string;
          transcript: string | null;
          user_id: string;
        };
        Insert: {
          claim_expires_at?: string | null;
          claim_token?: string | null;
          client_message_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          customer_edited_transcript?: string | null;
          error_category?: string | null;
          expires_at?: string | null;
          id?: string;
          model?: string | null;
          private_audio_path: string;
          provider?: string | null;
          request_id?: string | null;
          source_locale?: string | null;
          status?: string;
          transcript?: string | null;
          user_id: string;
        };
        Update: {
          claim_expires_at?: string | null;
          claim_token?: string | null;
          client_message_id?: string | null;
          completed_at?: string | null;
          created_at?: string;
          customer_edited_transcript?: string | null;
          error_category?: string | null;
          expires_at?: string | null;
          id?: string;
          model?: string | null;
          private_audio_path?: string;
          provider?: string | null;
          request_id?: string | null;
          source_locale?: string | null;
          status?: string;
          transcript?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transcription_jobs_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'provider_request_briefs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transcription_jobs_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'service_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transcription_jobs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      translation_jobs: {
        Row: {
          attempts: number;
          completed_at: string | null;
          created_at: string;
          error_category: string | null;
          id: string;
          model: string | null;
          model_version: string | null;
          provider: string | null;
          source_hash: string;
          source_locale: string;
          status: string;
          target_locale: string;
        };
        Insert: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          error_category?: string | null;
          id?: string;
          model?: string | null;
          model_version?: string | null;
          provider?: string | null;
          source_hash: string;
          source_locale: string;
          status?: string;
          target_locale: string;
        };
        Update: {
          attempts?: number;
          completed_at?: string | null;
          created_at?: string;
          error_category?: string | null;
          id?: string;
          model?: string | null;
          model_version?: string | null;
          provider?: string | null;
          source_hash?: string;
          source_locale?: string;
          status?: string;
          target_locale?: string;
        };
        Relationships: [];
      };
      upload_security_events: {
        Row: {
          created_at: string;
          event_type: string;
          id: string;
          metadata: Json;
          scanner: string | null;
          upload_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_type: string;
          id?: string;
          metadata?: Json;
          scanner?: string | null;
          upload_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_type?: string;
          id?: string;
          metadata?: Json;
          scanner?: string | null;
          upload_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'upload_security_events_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 'file_uploads';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'upload_security_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_block_events: {
        Row: {
          actor_id: string;
          blocked: boolean;
          changed: boolean;
          created_at: string;
          id: string;
          idempotency_key: string;
          reason: string;
          target_user_id: string;
        };
        Insert: {
          actor_id: string;
          blocked: boolean;
          changed: boolean;
          created_at?: string;
          id?: string;
          idempotency_key: string;
          reason: string;
          target_user_id: string;
        };
        Update: {
          actor_id?: string;
          blocked?: boolean;
          changed?: boolean;
          created_at?: string;
          id?: string;
          idempotency_key?: string;
          reason?: string;
          target_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_block_events_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_block_events_target_user_id_fkey';
            columns: ['target_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_devices: {
        Row: {
          app_version: string | null;
          device_hash: string;
          id: string;
          last_seen_at: string;
          platform: string;
          revoked_at: string | null;
          user_id: string;
        };
        Insert: {
          app_version?: string | null;
          device_hash: string;
          id?: string;
          last_seen_at?: string;
          platform: string;
          revoked_at?: string | null;
          user_id: string;
        };
        Update: {
          app_version?: string | null;
          device_hash?: string;
          id?: string;
          last_seen_at?: string;
          platform?: string;
          revoked_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_devices_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_preferences: {
        Row: {
          created_at: string;
          currency: string;
          reduced_motion: boolean;
          role_mode: Database['public']['Enums']['user_role'];
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          reduced_motion?: boolean;
          role_mode?: Database['public']['Enums']['user_role'];
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          reduced_motion?: boolean;
          role_mode?: Database['public']['Enums']['user_role'];
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_roles: {
        Row: {
          granted_at: string;
          granted_by: string | null;
          revoked_at: string | null;
          role: Database['public']['Enums']['user_role'];
          user_id: string;
        };
        Insert: {
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
          role: Database['public']['Enums']['user_role'];
          user_id: string;
        };
        Update: {
          granted_at?: string;
          granted_by?: string | null;
          revoked_at?: string | null;
          role?: Database['public']['Enums']['user_role'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_roles_granted_by_fkey';
            columns: ['granted_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_roles_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      webhook_events: {
        Row: {
          attempts: number;
          id: string;
          payload_hash: string;
          processed_at: string | null;
          provider: string;
          provider_event_id: string;
          received_at: string;
          signature_valid: boolean;
          status: string;
        };
        Insert: {
          attempts?: number;
          id?: string;
          payload_hash: string;
          processed_at?: string | null;
          provider: string;
          provider_event_id: string;
          received_at?: string;
          signature_valid: boolean;
          status?: string;
        };
        Update: {
          attempts?: number;
          id?: string;
          payload_hash?: string;
          processed_at?: string | null;
          provider?: string;
          provider_event_id?: string;
          received_at?: string;
          signature_valid?: boolean;
          status?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      payment_accounting: {
        Row: {
          amount_minor: number | null;
          created_at: string | null;
          currency: string | null;
          customer_id: string | null;
          id: string | null;
          job_id: string | null;
          net_paid_minor: number | null;
          payment_mode: string | null;
          provider_id: string | null;
          refunded_minor: number | null;
          status: Database['public']['Enums']['financial_status'] | null;
          updated_at: string | null;
          version: number | null;
        };
        Insert: {
          amount_minor?: number | null;
          created_at?: string | null;
          currency?: string | null;
          customer_id?: string | null;
          id?: string | null;
          job_id?: string | null;
          net_paid_minor?: never;
          payment_mode?: string | null;
          provider_id?: string | null;
          refunded_minor?: number | null;
          status?: Database['public']['Enums']['financial_status'] | null;
          updated_at?: string | null;
          version?: number | null;
        };
        Update: {
          amount_minor?: number | null;
          created_at?: string | null;
          currency?: string | null;
          customer_id?: string | null;
          id?: string | null;
          job_id?: string | null;
          net_paid_minor?: never;
          payment_mode?: string | null;
          provider_id?: string | null;
          refunded_minor?: number | null;
          status?: Database['public']['Enums']['financial_status'] | null;
          updated_at?: string | null;
          version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'payments_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payments_provider_id_fkey';
            columns: ['provider_id'];
            isOneToOne: false;
            referencedRelation: 'provider_profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      provider_public_profiles: {
        Row: {
          bio: string | null;
          business_name: string | null;
          completed_jobs: number | null;
          created_at: string | null;
          kind: Database['public']['Enums']['provider_kind'] | null;
          preferred_brief_locale: string | null;
          rating_average: number | null;
          rating_count: number | null;
          response_rate: number | null;
          user_id: string | null;
          verification_status: Database['public']['Enums']['verification_status'] | null;
        };
        Relationships: [];
      };
      provider_request_briefs: {
        Row: {
          approximate_location: unknown;
          category_id: string | null;
          city_id: string | null;
          district_id: string | null;
          id: string | null;
          original_locale: string | null;
          original_text: string | null;
          published_at: string | null;
          requested_end: string | null;
          requested_start: string | null;
          status: Database['public']['Enums']['request_status'] | null;
          structured_description: string | null;
          subcategory_id: string | null;
          title: string | null;
          urgency: Database['public']['Enums']['request_urgency'] | null;
          version: number | null;
        };
        Insert: {
          approximate_location?: unknown;
          category_id?: string | null;
          city_id?: string | null;
          district_id?: string | null;
          id?: string | null;
          original_locale?: string | null;
          original_text?: string | null;
          published_at?: string | null;
          requested_end?: string | null;
          requested_start?: string | null;
          status?: Database['public']['Enums']['request_status'] | null;
          structured_description?: string | null;
          subcategory_id?: string | null;
          title?: string | null;
          urgency?: Database['public']['Enums']['request_urgency'] | null;
          version?: number | null;
        };
        Update: {
          approximate_location?: unknown;
          category_id?: string | null;
          city_id?: string | null;
          district_id?: string | null;
          id?: string | null;
          original_locale?: string | null;
          original_text?: string | null;
          published_at?: string | null;
          requested_end?: string | null;
          requested_start?: string | null;
          status?: Database['public']['Enums']['request_status'] | null;
          structured_description?: string | null;
          subcategory_id?: string | null;
          title?: string | null;
          urgency?: Database['public']['Enums']['request_urgency'] | null;
          version?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'service_requests_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'service_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_district_id_fkey';
            columns: ['district_id'];
            isOneToOne: false;
            referencedRelation: 'districts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requests_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'service_subcategories';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      abandon_ai_intake_session: {
        Args: { p_session_id: string };
        Returns: undefined;
      };
      accept_completion: {
        Args: {
          p_accept: boolean;
          p_evidence_upload_ids: string[];
          p_idempotency_key: string;
          p_job_id: string;
          p_reason: string;
          p_review: string;
          p_score: number;
        };
        Returns: Json;
      };
      admin_marketplace_health: { Args: never; Returns: Json };
      admin_set_category: {
        Args: {
          p_category_id: string;
          p_enabled: boolean;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      admin_set_customer_status: {
        Args: {
          p_customer_id: string;
          p_idempotency_key: string;
          p_reason: string;
          p_status: Database['public']['Enums']['account_status'];
        };
        Returns: undefined;
      };
      archive_my_saved_address: {
        Args: { p_address_id: string };
        Returns: undefined;
      };
      assert_data_export_catalog_complete: { Args: never; Returns: boolean };
      assign_support_case: {
        Args: {
          p_assignee_id: string;
          p_case_id: string;
          p_expires_at: string;
          p_idempotency_key: string;
          p_permissions: string[];
          p_reason: string;
        };
        Returns: Json;
      };
      authorize_clean_media: {
        Args: { p_upload_id: string; p_user_id: string };
        Returns: Json;
      };
      authorize_media_scan_readback: {
        Args: {
          p_attempt_id: string;
          p_attempt_token: string;
          p_operation_id: string;
          p_output_sha256: string;
          p_output_size_bytes: number;
        };
        Returns: Json;
      };
      authorize_message_media: {
        Args: { p_upload_id: string; p_user_id: string };
        Returns: Json;
      };
      authorize_protected_media: {
        Args: { p_upload_id: string; p_user_id: string };
        Returns: Json;
      };
      build_data_export: {
        Args: { p_request_id: string; p_user_id: string };
        Returns: Json;
      };
      build_data_export_v3: {
        Args: { p_request_id: string; p_user_id: string };
        Returns: Json;
      };
      claim_file_upload: {
        Args: { p_upload_id: string; p_user_id: string };
        Returns: Json;
      };
      claim_media_scan_artifact_cleanup: {
        Args: {
          p_cleanup_token_hash: string;
          p_operation_id: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      claim_media_scan_job: {
        Args: {
          p_attempt_token_hash: string;
          p_operation_id: string;
          p_signature_max_age_seconds: number;
          p_signature_timestamp: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      claim_privacy_job: { Args: { p_worker_id: string }; Returns: Json };
      claim_transcription_job: {
        Args: {
          p_client_message_id: string;
          p_model: string;
          p_private_audio_path: string;
          p_provider: string;
          p_source_locale: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      claim_upload_quarantine_cleanup: {
        Args: { p_worker_id: string };
        Returns: Json;
      };
      cleanup_expired_media_scanner_nonces: {
        Args: { p_operation_id: string };
        Returns: Json;
      };
      complete_account_deletion: {
        Args: { p_job_id: string; p_request_id: string };
        Returns: undefined;
      };
      complete_data_export: {
        Args: {
          p_expires_at: string;
          p_job_id: string;
          p_private_storage_path: string;
          p_request_id: string;
          p_signed_download_url: string;
        };
        Returns: undefined;
      };
      complete_file_upload: {
        Args: {
          p_content_sha256: string;
          p_detected_mime_type: string;
          p_final_path: string;
          p_sanitized: boolean;
          p_scanner: string;
          p_size_bytes: number;
          p_upload_id: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      complete_media_scan_artifact_cleanup: {
        Args: {
          p_artifact_id: string;
          p_cleanup_token: string;
          p_operation_id: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      complete_upload_quarantine_cleanup: {
        Args: { p_upload_id: string; p_worker_id: string };
        Returns: undefined;
      };
      confirm_financial_action: {
        Args: {
          p_idempotency_key: string;
          p_intent_id: string;
          p_provider_reference: string;
          p_reason: string;
        };
        Returns: Json;
      };
      consume_media_scanner_nonce: {
        Args: {
          p_action: string;
          p_body_sha256: string;
          p_nonce: string;
          p_operation_id: string;
          p_request_timestamp: number;
          p_worker_id: string;
        };
        Returns: Json;
      };
      consume_rate_limit: {
        Args: {
          p_key_hash: string;
          p_limit: number;
          p_operation: string;
          p_window_start: string;
        };
        Returns: boolean;
      };
      create_change_order: { Args: { payload: Json }; Returns: string };
      create_file_upload: {
        Args: {
          p_declared_mime_type: string;
          p_filename: string;
          p_purpose: string;
          p_resource_id: string;
          p_size_bytes: number;
        };
        Returns: Json;
      };
      create_marketplace_report: {
        Args: {
          p_explanation: string;
          p_idempotency_key: string;
          p_reason_category: string;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: Json;
      };
      create_marketplace_report_v2: {
        Args: {
          p_context_conversation_id: string;
          p_explanation: string;
          p_idempotency_key: string;
          p_reason_category: string;
          p_target_id: string;
          p_target_type: string;
        };
        Returns: Json;
      };
      create_resource_file_upload: {
        Args: {
          p_declared_mime_type: string;
          p_filename: string;
          p_purpose: string;
          p_resource_id: string;
          p_size_bytes: number;
        };
        Returns: Json;
      };
      create_unbound_file_upload: {
        Args: {
          p_declared_mime_type: string;
          p_filename: string;
          p_purpose: string;
          p_size_bytes: number;
        };
        Returns: Json;
      };
      decide_cancellation: {
        Args: {
          p_approve: boolean;
          p_cancellation_id: string;
          p_expected_job_version: number;
          p_fee_minor: number;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: Json;
      };
      decide_change_order: {
        Args: {
          p_approve: boolean;
          p_change_order_id: string;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: Json;
      };
      end_support_case_assignment: {
        Args: {
          p_assignment_id: string;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: Json;
      };
      expire_data_export: { Args: { p_request_id: string }; Returns: undefined };
      fail_file_upload: {
        Args: {
          p_failure_category: string;
          p_scanner: string;
          p_upload_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      fail_media_scan_artifact_cleanup: {
        Args: {
          p_artifact_id: string;
          p_cleanup_token: string;
          p_failure_category: string;
          p_operation_id: string;
          p_worker_id: string;
        };
        Returns: Json;
      };
      fail_media_scan_attempt: {
        Args: {
          p_attempt_id: string;
          p_attempt_token: string;
          p_failure_category: string;
          p_operation_id: string;
        };
        Returns: Json;
      };
      fail_privacy_job: {
        Args: {
          p_error_category: string;
          p_job_id: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      fail_upload_quarantine_cleanup: {
        Args: {
          p_error_category: string;
          p_upload_id: string;
          p_worker_id: string;
        };
        Returns: undefined;
      };
      finalize_media_scan_job: {
        Args: {
          p_attempt_id: string;
          p_attempt_token: string;
          p_manifest_fingerprint: string;
          p_operation_id: string;
        };
        Returns: Json;
      };
      get_account_deletion_summary: { Args: never; Returns: Json };
      get_authorized_job_location:
        | { Args: { p_job_id: string }; Returns: Json }
        | {
            Args: { p_case_id: string; p_job_id: string; p_reason: string };
            Returns: Json;
          };
      get_completion_proof_manifest: {
        Args: { p_job_id: string };
        Returns: Json;
      };
      get_customer_offers: { Args: { p_request_id: string }; Returns: Json };
      get_customer_pii: {
        Args: { p_customer_id: string; p_reason: string };
        Returns: Json;
      };
      get_data_export_manifest: { Args: never; Returns: Json };
      get_data_export_manifest_v3: { Args: never; Returns: Json };
      get_data_export_query_coverage: { Args: never; Returns: Json };
      get_data_export_query_coverage_v3: { Args: never; Returns: Json };
      get_finance_review_queue: { Args: never; Returns: Json };
      get_marketplace_report_enforcement_target: {
        Args: { p_report_id: string };
        Returns: Json;
      };
      get_marketplace_report_enforcement_targets: {
        Args: { p_report_ids: string[] };
        Returns: Json;
      };
      get_marketplace_safe_identity: {
        Args: { p_case_id?: string; p_user_id: string };
        Returns: Json;
      };
      get_marketplace_trust_context: {
        Args: { p_conversation_id: string };
        Returns: Json;
      };
      get_media_scan_attempt_status: {
        Args: { p_attempt_id: string; p_attempt_token: string };
        Returns: Json;
      };
      get_my_file_upload_status: {
        Args: { p_upload_id: string };
        Returns: Json;
      };
      get_my_marketplace_reports: { Args: { p_limit?: number }; Returns: Json };
      get_privacy_retention_config: { Args: never; Returns: Json };
      get_provider_request_brief: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      get_provider_request_brief_without_timing_mode: {
        Args: { p_request_id: string };
        Returns: Json;
      };
      get_provider_verification_identity: {
        Args: { p_provider_id: string; p_reason: string };
        Returns: Json;
      };
      get_session_context: { Args: never; Returns: Json };
      grant_support_case_access: {
        Args: {
          p_access_type: string;
          p_case_id: string;
          p_expires_at: string;
          p_idempotency_key: string;
          p_permissions: string[];
          p_reason: string;
          p_user_id: string;
        };
        Returns: Json;
      };
      heartbeat_media_scan_attempt: {
        Args: {
          p_attempt_id: string;
          p_attempt_token: string;
          p_operation_id: string;
        };
        Returns: Json;
      };
      link_ai_session_to_request: {
        Args: { p_request_id: string; p_session_id: string };
        Returns: undefined;
      };
      list_customer_pii: {
        Args: { p_query: string; p_reason: string };
        Returns: Json;
      };
      list_marketplace_reports: {
        Args: { p_limit?: number; p_status?: string };
        Returns: Json;
      };
      list_my_saved_addresses: { Args: never; Returns: Json };
      list_open_marketplace_reports: {
        Args: {
          p_after_created_at?: string;
          p_after_report_id?: string;
          p_limit?: number;
        };
        Returns: Json;
      };
      make_my_saved_address_default: {
        Args: { p_address_id: string };
        Returns: undefined;
      };
      open_dispute:
        | {
            Args: {
              p_expected_version: number;
              p_idempotency_key: string;
              p_job_id: string;
              p_reason: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_idempotency_key: string;
              p_job_id: string;
              p_reason: string;
            };
            Returns: string;
          };
      prepare_media_scan_output: {
        Args: {
          p_attempt_id: string;
          p_attempt_token: string;
          p_input_mime_type: string;
          p_input_sha256: string;
          p_input_size_bytes: number;
          p_operation_id: string;
          p_output_mime_type: string;
          p_output_sha256: string;
          p_output_size_bytes: number;
          p_prepare_fingerprint: string;
          p_sanitizer_id: string;
          p_sanitizer_version: string;
        };
        Returns: Json;
      };
      publish_service_request: { Args: { payload: Json }; Returns: string };
      reconcile_blocked_account_deletions: {
        Args: { p_request_id?: string };
        Returns: Json;
      };
      record_account_reauthentication: {
        Args: { p_method: string; p_session_id: string; p_user_id: string };
        Returns: string;
      };
      record_job_location: {
        Args: {
          p_accuracy_m: number;
          p_job_id: string;
          p_latitude: number;
          p_longitude: number;
          p_session_id: string;
        };
        Returns: string;
      };
      record_media_scan_attestation: {
        Args: {
          p_attempt_id: string;
          p_attempt_token: string;
          p_manifest: Json;
          p_manifest_fingerprint: string;
          p_operation_id: string;
        };
        Returns: Json;
      };
      reject_file_upload: {
        Args: {
          p_failure_category: string;
          p_scanner: string;
          p_upload_id: string;
          p_user_id: string;
        };
        Returns: undefined;
      };
      reject_media_scan_job: {
        Args: {
          p_attempt_id: string;
          p_attempt_token: string;
          p_failure_category: string;
          p_operation_id: string;
        };
        Returns: Json;
      };
      request_account_deletion: { Args: never; Returns: string };
      request_cancellation:
        | {
            Args: { p_job_id: string; p_reason: string; p_request_id: string };
            Returns: string;
          }
        | {
            Args: {
              p_expected_version: number;
              p_idempotency_key: string;
              p_job_id: string;
              p_reason: string;
              p_request_id: string;
            };
            Returns: Json;
          };
      request_data_export: { Args: never; Returns: string };
      request_external_account_deletion: {
        Args: { p_email: string; p_reason?: string };
        Returns: undefined;
      };
      request_job_cancellation: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_job_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      request_service_request_cancellation: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_reason: string;
          p_request_id: string;
        };
        Returns: Json;
      };
      resolve_dispute: {
        Args: {
          p_action: string;
          p_amount_minor: number;
          p_dispute_id: string;
          p_expected_job_version: number;
          p_idempotency_key: string;
          p_job_outcome: string;
          p_reason: string;
        };
        Returns: Json;
      };
      resolve_marketplace_report: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_reason: string;
          p_report_id: string;
          p_resolution: string;
        };
        Returns: Json;
      };
      resolve_service_location: {
        Args: { p_latitude: number; p_longitude: number };
        Returns: Json;
      };
      restore_active_ai_intake: { Args: never; Returns: Json };
      review_provider: {
        Args: {
          p_decision: Database['public']['Enums']['verification_status'];
          p_idempotency_key: string;
          p_provider_id: string;
          p_reason: string;
        };
        Returns: undefined;
      };
      review_provider_service: {
        Args: {
          p_category_id: string;
          p_decision: Database['public']['Enums']['provider_service_review_status'];
          p_idempotency_key: string;
          p_provider_id: string;
          p_reason: string;
        };
        Returns: Json;
      };
      revoke_support_case_access: {
        Args: {
          p_grant_id: string;
          p_idempotency_key: string;
          p_reason: string;
        };
        Returns: Json;
      };
      run_matching: {
        Args: { p_limit?: number; p_request_id: string };
        Returns: string;
      };
      select_offer: {
        Args: { p_idempotency_key: string; p_offer_id: string };
        Returns: string;
      };
      send_message_with_attachments: {
        Args: {
          p_body: string;
          p_client_message_id: string;
          p_conversation_id: string;
          p_upload_ids: string[];
        };
        Returns: Json;
      };
      set_active_role: {
        Args: { p_role: Database['public']['Enums']['user_role'] };
        Returns: Json;
      };
      set_provider_restricted_qualification: {
        Args: {
          p_category_id: string;
          p_idempotency_key: string;
          p_provider_id: string;
          p_qualified: boolean;
          p_reason: string;
          p_subcategory_id: string;
        };
        Returns: Json;
      };
      set_user_block: {
        Args: {
          p_blocked: boolean;
          p_idempotency_key: string;
          p_reason: string;
          p_target_user_id: string;
        };
        Returns: Json;
      };
      start_ai_intake_session: {
        Args: { p_idempotency_key: string; p_locale: string };
        Returns: string;
      };
      start_job_location_sharing: {
        Args: {
          p_consent: boolean;
          p_duration_minutes: number;
          p_job_id: string;
        };
        Returns: Json;
      };
      start_or_get_media_scan: {
        Args: { p_operation_id: string; p_upload_id: string };
        Returns: Json;
      };
      stop_job_location_sharing: {
        Args: { p_reason?: string; p_session_id: string };
        Returns: Json;
      };
      submit_completion: {
        Args: { p_idempotency_key: string; p_job_id: string; p_proofs: Json };
        Returns: Json;
      };
      submit_offer: { Args: { payload: Json }; Returns: string };
      transition_job: {
        Args: {
          p_idempotency_key: string;
          p_job_id: string;
          p_reason: string;
          p_to_status: string;
        };
        Returns: Json;
      };
      triage_marketplace_report: {
        Args: {
          p_expected_version: number;
          p_idempotency_key: string;
          p_priority: string;
          p_reason: string;
          p_report_id: string;
        };
        Returns: Json;
      };
      upsert_my_saved_address: { Args: { payload: Json }; Returns: string };
      upsert_provider_onboarding: { Args: { payload: Json }; Returns: Json };
      upsert_provider_onboarding_without_final_diff: {
        Args: { payload: Json };
        Returns: Json;
      };
    };
    Enums: {
      account_status: 'active' | 'suspended' | 'deletion_pending' | 'anonymized';
      case_status:
        | 'open'
        | 'waiting_customer'
        | 'waiting_provider'
        | 'waiting_operations'
        | 'resolved'
        | 'closed';
      change_order_status: 'pending' | 'approved' | 'rejected' | 'expired' | 'cancelled';
      financial_status:
        | 'pending'
        | 'offline'
        | 'authorized'
        | 'captured'
        | 'partially_refunded'
        | 'cancelled'
        | 'refunded'
        | 'failed'
        | 'held'
        | 'released';
      job_status:
        | 'provider_selected'
        | 'scheduled'
        | 'en_route'
        | 'arrived'
        | 'diagnosing'
        | 'awaiting_change_order_approval'
        | 'in_progress'
        | 'completion_submitted'
        | 'completed'
        | 'cancelled'
        | 'disputed';
      notification_status:
        'pending' | 'processing' | 'delivered' | 'failed' | 'dead_letter' | 'disabled';
      offer_status: 'active' | 'revised' | 'withdrawn' | 'expired' | 'selected' | 'rejected';
      provider_kind: 'individual' | 'company';
      provider_service_review_status:
        'draft' | 'submitted' | 'approved' | 'more_information_required' | 'rejected' | 'suspended';
      request_status:
        | 'draft'
        | 'approved'
        | 'published'
        | 'matching'
        | 'receiving_offers'
        | 'provider_selected'
        | 'cancelled'
        | 'expired';
      request_timing_mode: 'asap' | 'scheduled' | 'flexible';
      request_urgency: 'flexible' | 'normal' | 'urgent' | 'safety_critical';
      user_role:
        | 'customer'
        | 'provider'
        | 'operations_admin'
        | 'verification_reviewer'
        | 'support_agent'
        | 'finance_reviewer'
        | 'analyst'
        | 'super_admin'
        | 'privacy_reviewer';
      verification_status:
        | 'draft'
        | 'submitted'
        | 'under_review'
        | 'more_information_required'
        | 'verified'
        | 'rejected'
        | 'suspended';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      account_status: ['active', 'suspended', 'deletion_pending', 'anonymized'],
      case_status: [
        'open',
        'waiting_customer',
        'waiting_provider',
        'waiting_operations',
        'resolved',
        'closed',
      ],
      change_order_status: ['pending', 'approved', 'rejected', 'expired', 'cancelled'],
      financial_status: [
        'pending',
        'offline',
        'authorized',
        'captured',
        'partially_refunded',
        'cancelled',
        'refunded',
        'failed',
        'held',
        'released',
      ],
      job_status: [
        'provider_selected',
        'scheduled',
        'en_route',
        'arrived',
        'diagnosing',
        'awaiting_change_order_approval',
        'in_progress',
        'completion_submitted',
        'completed',
        'cancelled',
        'disputed',
      ],
      notification_status: [
        'pending',
        'processing',
        'delivered',
        'failed',
        'dead_letter',
        'disabled',
      ],
      offer_status: ['active', 'revised', 'withdrawn', 'expired', 'selected', 'rejected'],
      provider_kind: ['individual', 'company'],
      provider_service_review_status: [
        'draft',
        'submitted',
        'approved',
        'more_information_required',
        'rejected',
        'suspended',
      ],
      request_status: [
        'draft',
        'approved',
        'published',
        'matching',
        'receiving_offers',
        'provider_selected',
        'cancelled',
        'expired',
      ],
      request_timing_mode: ['asap', 'scheduled', 'flexible'],
      request_urgency: ['flexible', 'normal', 'urgent', 'safety_critical'],
      user_role: [
        'customer',
        'provider',
        'operations_admin',
        'verification_reviewer',
        'support_agent',
        'finance_reviewer',
        'analyst',
        'super_admin',
        'privacy_reviewer',
      ],
      verification_status: [
        'draft',
        'submitted',
        'under_review',
        'more_information_required',
        'verified',
        'rejected',
        'suspended',
      ],
    },
  },
} as const;
