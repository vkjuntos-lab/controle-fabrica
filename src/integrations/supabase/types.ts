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
      accounts_payable: {
        Row: {
          amount: number
          attachment_url: string | null
          bank_account_id: string | null
          category_id: string | null
          competence: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          id: string
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          planned_method: string | null
          recurring: string | null
          status: Database["public"]["Enums"]["fin_status"]
          store_id: string
          supplier: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_url?: string | null
          bank_account_id?: string | null
          category_id?: string | null
          competence?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          id?: string
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          planned_method?: string | null
          recurring?: string | null
          status?: Database["public"]["Enums"]["fin_status"]
          store_id: string
          supplier?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_url?: string | null
          bank_account_id?: string | null
          category_id?: string | null
          competence?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          planned_method?: string | null
          recurring?: string | null
          status?: Database["public"]["Enums"]["fin_status"]
          store_id?: string
          supplier?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_payable_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          amount: number
          bank_account_id: string | null
          category_id: string | null
          competence: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          customer_name: string | null
          description: string
          due_date: string
          id: string
          notes: string | null
          paid_amount: number | null
          paid_at: string | null
          planned_method: string | null
          sale_id: string | null
          status: Database["public"]["Enums"]["fin_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          category_id?: string | null
          competence?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          description: string
          due_date: string
          id?: string
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          planned_method?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["fin_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category_id?: string | null
          competence?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          customer_name?: string | null
          description?: string
          due_date?: string
          id?: string
          notes?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          planned_method?: string | null
          sale_id?: string | null
          status?: Database["public"]["Enums"]["fin_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_receivable_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_name: string | null
          actor_role: string | null
          actor_user_id: string | null
          created_at: string
          details: Json
          entity: string | null
          entity_id: string | null
          id: string
          ip: string | null
          store_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          store_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_role?: string | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          entity?: string | null
          entity_id?: string | null
          id?: string
          ip?: string | null
          store_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_responses: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          response_text: string
          store_id: string
          trigger_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          response_text: string
          store_id: string
          trigger_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          response_text?: string
          store_id?: string
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_responses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_number: string | null
          active: boolean
          agency: string | null
          bank: string | null
          created_at: string
          id: string
          is_cash: boolean
          name: string
          opening_balance: number
          store_id: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          active?: boolean
          agency?: string | null
          bank?: string | null
          created_at?: string
          id?: string
          is_cash?: boolean
          name: string
          opening_balance?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          active?: boolean
          agency?: string | null
          bank?: string | null
          created_at?: string
          id?: string
          is_cash?: boolean
          name?: string
          opening_balance?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_item_logs: {
        Row: {
          batch_id: string
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          item_id: string | null
          message: string
        }
        Insert: {
          batch_id: string
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          item_id?: string | null
          message: string
        }
        Update: {
          batch_id?: string
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          item_id?: string | null
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "batch_item_logs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_item_logs_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "batch_items"
            referencedColumns: ["id"]
          },
        ]
      }
      batch_items: {
        Row: {
          ai_data: Json | null
          batch_id: string
          created_at: string | null
          error_message: string | null
          existing_product_id: string | null
          id: string
          is_duplicate: boolean | null
          manual_data: Json | null
          preview_url: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          ai_data?: Json | null
          batch_id: string
          created_at?: string | null
          error_message?: string | null
          existing_product_id?: string | null
          id?: string
          is_duplicate?: boolean | null
          manual_data?: Json | null
          preview_url?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          ai_data?: Json | null
          batch_id?: string
          created_at?: string | null
          error_message?: string | null
          existing_product_id?: string | null
          id?: string
          is_duplicate?: boolean | null
          manual_data?: Json | null
          preview_url?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "product_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      bella_campaign_runs: {
        Row: {
          campaign_type: string
          channel: string
          conversation_id: string | null
          coupon_code: string | null
          created_at: string
          customer_id: string | null
          id: string
          message_text: string | null
          meta: Json
          send_error: string | null
          send_ok: boolean
          stage: number | null
          store_id: string
        }
        Insert: {
          campaign_type: string
          channel?: string
          conversation_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          message_text?: string | null
          meta?: Json
          send_error?: string | null
          send_ok?: boolean
          stage?: number | null
          store_id: string
        }
        Update: {
          campaign_type?: string
          channel?: string
          conversation_id?: string | null
          coupon_code?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          message_text?: string | null
          meta?: Json
          send_error?: string | null
          send_ok?: boolean
          stage?: number | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bella_campaign_runs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bella_campaign_runs_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bella_campaign_runs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bella_knowledge: {
        Row: {
          active: boolean
          answer: string
          created_at: string
          id: string
          question: string | null
          store_id: string
          tags: string[] | null
          topic: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          answer: string
          created_at?: string
          id?: string
          question?: string | null
          store_id: string
          tags?: string[] | null
          topic: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          answer?: string
          created_at?: string
          id?: string
          question?: string | null
          store_id?: string
          tags?: string[] | null
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bella_knowledge_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bella_leads: {
        Row: {
          channel: string
          contact: string
          conversation_id: string | null
          created_at: string
          customer_id: string | null
          id: string
          interest: string | null
          last_interaction_at: string | null
          meta: Json
          name: string | null
          reason: string | null
          stage: string
          store_id: string
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          channel?: string
          contact: string
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          interest?: string | null
          last_interaction_at?: string | null
          meta?: Json
          name?: string | null
          reason?: string | null
          stage?: string
          store_id: string
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          channel?: string
          contact?: string
          conversation_id?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          interest?: string | null
          last_interaction_at?: string | null
          meta?: Json
          name?: string | null
          reason?: string | null
          stage?: string
          store_id?: string
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bella_leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bella_leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bella_leads_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bella_prompts: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          store_id: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          store_id: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          store_id?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bella_prompts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bella_reviews: {
        Row: {
          auto_flag_reason: string | null
          conversation_id: string
          created_at: string
          csat_comment: string | null
          csat_score: number | null
          escalation_reason: string | null
          id: string
          reviewed_at: string | null
          reviewer_id: string | null
          reviewer_notes: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          auto_flag_reason?: string | null
          conversation_id: string
          created_at?: string
          csat_comment?: string | null
          csat_score?: number | null
          escalation_reason?: string | null
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          auto_flag_reason?: string | null
          conversation_id?: string
          created_at?: string
          csat_comment?: string | null
          csat_score?: number | null
          escalation_reason?: string | null
          id?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          reviewer_notes?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      boletos: {
        Row: {
          amount: number
          ar_id: string | null
          barcode: string | null
          created_at: string
          customer_id: string | null
          digitable_line: string | null
          due_date: string
          id: string
          notes: string | null
          operator_user_id: string | null
          paid_amount: number | null
          paid_at: string | null
          pdf_url: string | null
          provider: string
          sale_id: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          ar_id?: string | null
          barcode?: string | null
          created_at?: string
          customer_id?: string | null
          digitable_line?: string | null
          due_date: string
          id?: string
          notes?: string | null
          operator_user_id?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          pdf_url?: string | null
          provider?: string
          sale_id?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          ar_id?: string | null
          barcode?: string | null
          created_at?: string
          customer_id?: string | null
          digitable_line?: string | null
          due_date?: string
          id?: string
          notes?: string | null
          operator_user_id?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          pdf_url?: string | null
          provider?: string
          sale_id?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "boletos_ar_id_fkey"
            columns: ["ar_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boletos_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boletos_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boletos_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_deliveries: {
        Row: {
          campaign_id: string
          channel: Database["public"]["Enums"]["campaign_channel"]
          clicked_at: string | null
          created_at: string
          customer_id: string
          error: string | null
          id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          campaign_id: string
          channel: Database["public"]["Enums"]["campaign_channel"]
          clicked_at?: string | null
          created_at?: string
          customer_id: string
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          campaign_id?: string
          channel?: Database["public"]["Enums"]["campaign_channel"]
          clicked_at?: string | null
          created_at?: string
          customer_id?: string
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_deliveries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          channel: Database["public"]["Enums"]["campaign_channel"]
          created_at: string
          error_count: number
          id: string
          metadata: Json
          name: string
          scheduled_at: string | null
          segment_key: string
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          store_id: string | null
          template: string
          template_id: string | null
          template_lang: string | null
          template_params: Json
          trigger: Database["public"]["Enums"]["campaign_trigger"]
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          error_count?: number
          id?: string
          metadata?: Json
          name: string
          scheduled_at?: string | null
          segment_key?: string
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          store_id?: string | null
          template?: string
          template_id?: string | null
          template_lang?: string | null
          template_params?: Json
          trigger?: Database["public"]["Enums"]["campaign_trigger"]
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["campaign_channel"]
          created_at?: string
          error_count?: number
          id?: string
          metadata?: Json
          name?: string
          scheduled_at?: string | null
          segment_key?: string
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          store_id?: string | null
          template?: string
          template_id?: string | null
          template_lang?: string | null
          template_params?: Json
          trigger?: Database["public"]["Enums"]["campaign_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "wa_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_sessions: {
        Row: {
          closed_at: string | null
          closing_counted: Json | null
          code: string
          created_at: string
          id: string
          opened_at: string
          opening: number
          operator: string
          operator_user_id: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closing_counted?: Json | null
          code: string
          created_at?: string
          id?: string
          opened_at?: string
          opening?: number
          operator: string
          operator_user_id?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closing_counted?: Json | null
          code?: string
          created_at?: string
          id?: string
          opened_at?: string
          opening?: number
          operator?: string
          operator_user_id?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashier_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_events: {
        Row: {
          channel: string
          created_at: string
          customer_id: string
          id: string
          installment_id: string
          level: number
          message: string
          offset_days: number
          pix_charge_id: string | null
          rule_id: string | null
          sent_at: string | null
          status: string
          store_id: string
          wa_url: string | null
        }
        Insert: {
          channel?: string
          created_at?: string
          customer_id: string
          id?: string
          installment_id: string
          level?: number
          message: string
          offset_days: number
          pix_charge_id?: string | null
          rule_id?: string | null
          sent_at?: string | null
          status?: string
          store_id: string
          wa_url?: string | null
        }
        Update: {
          channel?: string
          created_at?: string
          customer_id?: string
          id?: string
          installment_id?: string
          level?: number
          message?: string
          offset_days?: number
          pix_charge_id?: string | null
          rule_id?: string | null
          sent_at?: string | null
          status?: string
          store_id?: string
          wa_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_events_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "credit_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_events_pix_charge_id_fkey"
            columns: ["pix_charge_id"]
            isOneToOne: false
            referencedRelation: "pix_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_events_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "collection_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_rules: {
        Row: {
          active: boolean
          auto_block: boolean
          auto_pix: boolean
          created_at: string
          id: string
          level: number
          notify_manager: boolean
          offset_days: number
          store_id: string
          template: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_block?: boolean
          auto_pix?: boolean
          created_at?: string
          id?: string
          level?: number
          notify_manager?: boolean
          offset_days: number
          store_id: string
          template: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_block?: boolean
          auto_pix?: boolean
          created_at?: string
          id?: string
          level?: number
          notify_manager?: boolean
          offset_days?: number
          store_id?: string
          template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          active: boolean
          code: string | null
          color: string | null
          created_at: string
          id: string
          kind: string
          monthly_budget: number
          name: string
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          kind?: string
          monthly_budget?: number
          name: string
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          color?: string | null
          created_at?: string
          id?: string
          kind?: string
          monthly_budget?: number
          name?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          customer_id: string | null
          discount_amount: number
          id: string
          sale_id: string | null
        }
        Insert: {
          coupon_id: string
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          sale_id?: string | null
        }
        Update: {
          coupon_id?: string
          created_at?: string
          customer_id?: string | null
          discount_amount?: number
          id?: string
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          code: string
          created_at: string
          customer_id: string | null
          id: string
          kind: Database["public"]["Enums"]["coupon_kind"]
          max_uses: number
          metadata: Json
          min_ticket: number
          segment_key: string | null
          updated_at: string
          used_count: number
          valid_from: string
          valid_until: string | null
          value: number
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          customer_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["coupon_kind"]
          max_uses?: number
          metadata?: Json
          min_ticket?: number
          segment_key?: string | null
          updated_at?: string
          used_count?: number
          valid_from?: string
          valid_until?: string | null
          value?: number
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["coupon_kind"]
          max_uses?: number
          metadata?: Json
          min_ticket?: number
          segment_key?: string | null
          updated_at?: string
          used_count?: number
          valid_from?: string
          valid_until?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_installments: {
        Row: {
          bank_account_id: string | null
          created_at: string
          credit_sale_id: string
          customer_id: string
          id: string
          numero: number
          paid_amount: number | null
          paid_at: string | null
          payment_method: string | null
          penalty_applied_at: string | null
          pix_charge_id: string | null
          status: Database["public"]["Enums"]["credit_installment_status"]
          store_id: string
          updated_at: string
          valor: number
          vencimento: string
        }
        Insert: {
          bank_account_id?: string | null
          created_at?: string
          credit_sale_id: string
          customer_id: string
          id?: string
          numero: number
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          penalty_applied_at?: string | null
          pix_charge_id?: string | null
          status?: Database["public"]["Enums"]["credit_installment_status"]
          store_id: string
          updated_at?: string
          valor: number
          vencimento: string
        }
        Update: {
          bank_account_id?: string | null
          created_at?: string
          credit_sale_id?: string
          customer_id?: string
          id?: string
          numero?: number
          paid_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          penalty_applied_at?: string | null
          pix_charge_id?: string | null
          status?: Database["public"]["Enums"]["credit_installment_status"]
          store_id?: string
          updated_at?: string
          valor?: number
          vencimento?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_installments_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_installments_credit_sale_id_fkey"
            columns: ["credit_sale_id"]
            isOneToOne: false
            referencedRelation: "credit_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_installments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_installments_pix_charge_id_fkey"
            columns: ["pix_charge_id"]
            isOneToOne: false
            referencedRelation: "pix_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_installments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_limits: {
        Row: {
          blocked: boolean
          blocked_at: string | null
          blocked_reason: string | null
          created_at: string
          customer_id: string
          id: string
          limit_amount: number
          score: number
          store_id: string
          tier: Database["public"]["Enums"]["credit_tier"]
          updated_at: string
        }
        Insert: {
          blocked?: boolean
          blocked_at?: string | null
          blocked_reason?: string | null
          created_at?: string
          customer_id: string
          id?: string
          limit_amount?: number
          score?: number
          store_id: string
          tier?: Database["public"]["Enums"]["credit_tier"]
          updated_at?: string
        }
        Update: {
          blocked?: boolean
          blocked_at?: string | null
          blocked_reason?: string | null
          created_at?: string
          customer_id?: string
          id?: string
          limit_amount?: number
          score?: number
          store_id?: string
          tier?: Database["public"]["Enums"]["credit_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_limits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_limits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_policies: {
        Row: {
          auto_apply_limit: boolean
          base_score: number
          created_at: string
          store_id: string
          tier_a_limit: number
          tier_b_limit: number
          tier_c_limit: number
          updated_at: string
        }
        Insert: {
          auto_apply_limit?: boolean
          base_score?: number
          created_at?: string
          store_id: string
          tier_a_limit?: number
          tier_b_limit?: number
          tier_c_limit?: number
          updated_at?: string
        }
        Update: {
          auto_apply_limit?: boolean
          base_score?: number
          created_at?: string
          store_id?: string
          tier_a_limit?: number
          tier_b_limit?: number
          tier_c_limit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_policies_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_sales: {
        Row: {
          created_at: string
          customer_id: string
          entrada: number
          id: string
          notes: string | null
          num_parcelas: number
          operator_user_id: string | null
          restante: number
          sale_id: string | null
          store_id: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          entrada?: number
          id?: string
          notes?: string | null
          num_parcelas: number
          operator_user_id?: string | null
          restante: number
          sale_id?: string | null
          store_id: string
          total: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          entrada?: number
          id?: string
          notes?: string | null
          num_parcelas?: number
          operator_user_id?: string | null
          restante?: number
          sale_id?: string | null
          store_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_sales_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_score_events: {
        Row: {
          created_at: string
          customer_id: string
          delta: number
          id: string
          installment_id: string | null
          reason: string
          store_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          delta: number
          id?: string
          installment_id?: string | null
          reason: string
          store_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          delta?: number
          id?: string
          installment_id?: string | null
          reason?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_score_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_score_events_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "credit_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_score_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_store_credit: {
        Row: {
          balance: number
          created_at: string
          customer_id: string
          id: string
          store_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          customer_id: string
          id?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          customer_id?: string
          id?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_store_credit_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_store_credit_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_store_credit_movements: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          note: string | null
          source: string
          source_id: string | null
          store_id: string
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          note?: string | null
          source: string
          source_id?: string | null
          store_id: string
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          note?: string | null
          source?: string
          source_id?: string | null
          store_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_store_credit_movements_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_store_credit_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          asaas_wallet_id: string | null
          birthday: string | null
          cashback: number
          cpf: string
          created_at: string
          email: string | null
          id: string
          is_recipient: boolean
          kanban_stage: string | null
          mp_collector_id: string | null
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          tags: string[]
          tier: string
          updated_at: string
          value_potential: number | null
        }
        Insert: {
          address?: string | null
          asaas_wallet_id?: string | null
          birthday?: string | null
          cashback?: number
          cpf: string
          created_at?: string
          email?: string | null
          id?: string
          is_recipient?: boolean
          kanban_stage?: string | null
          mp_collector_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          store_id: string
          tags?: string[]
          tier?: string
          updated_at?: string
          value_potential?: number | null
        }
        Update: {
          address?: string | null
          asaas_wallet_id?: string | null
          birthday?: string | null
          cashback?: number
          cpf?: string
          created_at?: string
          email?: string | null
          id?: string
          is_recipient?: boolean
          kanban_stage?: string | null
          mp_collector_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          tags?: string[]
          tier?: string
          updated_at?: string
          value_potential?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fb_webhook_logs: {
        Row: {
          created_at: string
          direction: string
          error: string | null
          event_type: string | null
          http_status: number | null
          id: string
          recipient_id: string | null
          request: Json | null
          response: Json | null
          sender_id: string | null
          signature_valid: boolean | null
          status: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          error?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string
          recipient_id?: string | null
          request?: Json | null
          response?: Json | null
          sender_id?: string | null
          signature_valid?: boolean | null
          status?: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          error?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string
          recipient_id?: string | null
          request?: Json | null
          response?: Json | null
          sender_id?: string | null
          signature_valid?: boolean | null
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fb_webhook_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          active: boolean
          color: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["fin_kind"]
          name: string
          parent_id: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["fin_kind"]
          name: string
          parent_id?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["fin_kind"]
          name?: string
          parent_id?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          bank_account_id: string | null
          category_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: Database["public"]["Enums"]["fin_kind"]
          paid_at: string
          payable_id: string | null
          payment_link_id: string | null
          payment_method: string | null
          pix_charge_id: string | null
          receivable_id: string | null
          sale_id: string | null
          source: Database["public"]["Enums"]["fin_source"]
          store_id: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: Database["public"]["Enums"]["fin_kind"]
          paid_at?: string
          payable_id?: string | null
          payment_link_id?: string | null
          payment_method?: string | null
          pix_charge_id?: string | null
          receivable_id?: string | null
          sale_id?: string | null
          source?: Database["public"]["Enums"]["fin_source"]
          store_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          category_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["fin_kind"]
          paid_at?: string
          payable_id?: string | null
          payment_link_id?: string | null
          payment_method?: string | null
          pix_charge_id?: string | null
          receivable_id?: string | null
          sale_id?: string | null
          source?: Database["public"]["Enums"]["fin_source"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_payable_id_fkey"
            columns: ["payable_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_payment_link_id_fkey"
            columns: ["payment_link_id"]
            isOneToOne: false
            referencedRelation: "payment_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_pix_charge_id_fkey"
            columns: ["pix_charge_id"]
            isOneToOne: false
            referencedRelation: "pix_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_documents: {
        Row: {
          cancelled_at: string | null
          chave: string | null
          created_at: string
          customer_id: string | null
          danfe_url: string | null
          emitted_at: string | null
          environment: Database["public"]["Enums"]["fiscal_environment"]
          error_msg: string | null
          id: string
          kind: Database["public"]["Enums"]["fiscal_doc_kind"]
          numero: number
          protocolo: string | null
          provider: string
          provider_ref: string | null
          qrcode_url: string | null
          reference: string | null
          retry_count: number
          sale_id: string | null
          serie: number
          status: Database["public"]["Enums"]["fiscal_doc_status"]
          store_id: string | null
          total_value: number
          updated_at: string
          xml_authorized: string | null
          xml_cancelled: string | null
        }
        Insert: {
          cancelled_at?: string | null
          chave?: string | null
          created_at?: string
          customer_id?: string | null
          danfe_url?: string | null
          emitted_at?: string | null
          environment?: Database["public"]["Enums"]["fiscal_environment"]
          error_msg?: string | null
          id?: string
          kind: Database["public"]["Enums"]["fiscal_doc_kind"]
          numero: number
          protocolo?: string | null
          provider?: string
          provider_ref?: string | null
          qrcode_url?: string | null
          reference?: string | null
          retry_count?: number
          sale_id?: string | null
          serie: number
          status?: Database["public"]["Enums"]["fiscal_doc_status"]
          store_id?: string | null
          total_value?: number
          updated_at?: string
          xml_authorized?: string | null
          xml_cancelled?: string | null
        }
        Update: {
          cancelled_at?: string | null
          chave?: string | null
          created_at?: string
          customer_id?: string | null
          danfe_url?: string | null
          emitted_at?: string | null
          environment?: Database["public"]["Enums"]["fiscal_environment"]
          error_msg?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["fiscal_doc_kind"]
          numero?: number
          protocolo?: string | null
          provider?: string
          provider_ref?: string | null
          qrcode_url?: string | null
          reference?: string | null
          retry_count?: number
          sale_id?: string | null
          serie?: number
          status?: Database["public"]["Enums"]["fiscal_doc_status"]
          store_id?: string | null
          total_value?: number
          updated_at?: string
          xml_authorized?: string | null
          xml_cancelled?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_documents_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_documents_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fiscal_documents_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_queue: {
        Row: {
          attempts: number
          created_at: string
          document_id: string
          id: string
          last_error: string | null
          next_attempt_at: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          document_id: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          document_id?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_queue_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "fiscal_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_settings: {
        Row: {
          active: boolean
          cep: string | null
          cert_pass_secret_name: string | null
          cert_secret_name: string | null
          cnae: string | null
          cnpj: string
          created_at: string
          csc_id: string | null
          csc_token: string | null
          endereco: string | null
          environment: Database["public"]["Enums"]["fiscal_environment"]
          id: string
          ie: string | null
          im: string | null
          municipio: string | null
          nfce_next_number: number
          nfce_serie: number
          nfe_next_number: number
          nfe_serie: number
          nome_fantasia: string | null
          provider: string
          razao_social: string
          regime: Database["public"]["Enums"]["fiscal_regime"]
          store_id: string | null
          uf: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cep?: string | null
          cert_pass_secret_name?: string | null
          cert_secret_name?: string | null
          cnae?: string | null
          cnpj: string
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          endereco?: string | null
          environment?: Database["public"]["Enums"]["fiscal_environment"]
          id?: string
          ie?: string | null
          im?: string | null
          municipio?: string | null
          nfce_next_number?: number
          nfce_serie?: number
          nfe_next_number?: number
          nfe_serie?: number
          nome_fantasia?: string | null
          provider?: string
          razao_social: string
          regime?: Database["public"]["Enums"]["fiscal_regime"]
          store_id?: string | null
          uf: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cep?: string | null
          cert_pass_secret_name?: string | null
          cert_secret_name?: string | null
          cnae?: string | null
          cnpj?: string
          created_at?: string
          csc_id?: string | null
          csc_token?: string | null
          endereco?: string | null
          environment?: Database["public"]["Enums"]["fiscal_environment"]
          id?: string
          ie?: string | null
          im?: string | null
          municipio?: string | null
          nfce_next_number?: number
          nfce_serie?: number
          nfe_next_number?: number
          nfe_serie?: number
          nome_fantasia?: string | null
          provider?: string
          razao_social?: string
          regime?: Database["public"]["Enums"]["fiscal_regime"]
          store_id?: string | null
          uf?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_tax_profiles: {
        Row: {
          active: boolean
          cfop: string
          cofins_aliq: number
          cofins_cst: string
          created_at: string
          csosn: string | null
          cst_icms: string | null
          description: string | null
          icms_aliq: number
          icms_base_red: number
          id: string
          ipi_aliq: number
          ipi_cst: string | null
          name: string
          origem: number
          pis_aliq: number
          pis_cst: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          cfop?: string
          cofins_aliq?: number
          cofins_cst?: string
          created_at?: string
          csosn?: string | null
          cst_icms?: string | null
          description?: string | null
          icms_aliq?: number
          icms_base_red?: number
          id?: string
          ipi_aliq?: number
          ipi_cst?: string | null
          name: string
          origem?: number
          pis_aliq?: number
          pis_cst?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          cfop?: string
          cofins_aliq?: number
          cofins_cst?: string
          created_at?: string
          csosn?: string | null
          cst_icms?: string | null
          description?: string | null
          icms_aliq?: number
          icms_base_red?: number
          id?: string
          ipi_aliq?: number
          ipi_cst?: string | null
          name?: string
          origem?: number
          pis_aliq?: number
          pis_cst?: string
          updated_at?: string
        }
        Relationships: []
      }
      fraud_blocklist: {
        Row: {
          added_by: string | null
          auto_added: boolean
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          reason: string | null
          store_id: string | null
          value: string
        }
        Insert: {
          added_by?: string | null
          auto_added?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          reason?: string | null
          store_id?: string | null
          value: string
        }
        Update: {
          added_by?: string | null
          auto_added?: boolean
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          reason?: string | null
          store_id?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "fraud_blocklist_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_events: {
        Row: {
          action_taken: string
          amount: number | null
          cpf: string | null
          created_at: string
          email: string | null
          id: string
          ip: string | null
          metadata: Json
          phone: string | null
          reasons: Json
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          source_id: string | null
          source_type: string
          store_id: string | null
        }
        Insert: {
          action_taken: string
          amount?: number | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          phone?: string | null
          reasons?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          source_id?: string | null
          source_type: string
          store_id?: string | null
        }
        Update: {
          action_taken?: string
          amount?: number | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          id?: string
          ip?: string | null
          metadata?: Json
          phone?: string | null
          reasons?: Json
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          source_id?: string | null
          source_type?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      fraud_rules: {
        Row: {
          action: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          name: string
          rule_type: string
          store_id: string | null
          threshold: number | null
          updated_at: string
          weight: number
          window_minutes: number | null
        }
        Insert: {
          action?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          rule_type: string
          store_id?: string | null
          threshold?: number | null
          updated_at?: string
          weight?: number
          window_minutes?: number | null
        }
        Update: {
          action?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          rule_type?: string
          store_id?: string | null
          threshold?: number | null
          updated_at?: string
          weight?: number
          window_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fraud_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_card_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          created_by: string | null
          gift_card_id: string
          id: string
          sale_id: string | null
          type: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          created_by?: string | null
          gift_card_id: string
          id?: string
          sale_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          created_by?: string | null
          gift_card_id?: string
          id?: string
          sale_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_card_transactions_gift_card_id_fkey"
            columns: ["gift_card_id"]
            isOneToOne: false
            referencedRelation: "gift_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      gift_cards: {
        Row: {
          balance: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          initial_amount: number
          issued_by: string | null
          issued_to_customer_id: string | null
          notes: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          balance: number
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          initial_amount: number
          issued_by?: string | null
          issued_to_customer_id?: string | null
          notes?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          initial_amount?: number
          issued_by?: string | null
          issued_to_customer_id?: string | null
          notes?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gift_cards_issued_to_customer_id_fkey"
            columns: ["issued_to_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gift_cards_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          store_id: string
          updated_at: string
          variables: Json
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          store_id: string
          updated_at?: string
          variables?: Json
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          store_id?: string
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ig_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ig_webhook_logs: {
        Row: {
          created_at: string
          direction: string
          error: string | null
          event_type: string | null
          http_status: number | null
          id: string
          recipient_id: string | null
          request: Json | null
          response: Json | null
          sender_id: string | null
          signature_valid: boolean | null
          status: string
          store_id: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          error?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string
          recipient_id?: string | null
          request?: Json | null
          response?: Json | null
          sender_id?: string | null
          signature_valid?: boolean | null
          status?: string
          store_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          error?: string | null
          event_type?: string | null
          http_status?: number | null
          id?: string
          recipient_id?: string | null
          request?: Json | null
          response?: Json | null
          sender_id?: string | null
          signature_valid?: boolean | null
          status?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ig_webhook_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_accounts: {
        Row: {
          balance: number
          created_at: string
          customer_id: string
          id: string
          last_expiry_notice_at: string | null
          last_tier_notice_tier: string | null
          lifetime_points: number
          tier: Database["public"]["Enums"]["loyalty_tier"]
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          customer_id: string
          id?: string
          last_expiry_notice_at?: string | null
          last_tier_notice_tier?: string | null
          lifetime_points?: number
          tier?: Database["public"]["Enums"]["loyalty_tier"]
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          customer_id?: string
          id?: string
          last_expiry_notice_at?: string | null
          last_tier_notice_tier?: string | null
          lifetime_points?: number
          tier?: Database["public"]["Enums"]["loyalty_tier"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_accounts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_ledger: {
        Row: {
          account_id: string
          created_at: string
          customer_id: string
          expired: boolean
          expires_at: string | null
          id: string
          kind: Database["public"]["Enums"]["loyalty_entry_kind"]
          metadata: Json
          points: number
          reason: string | null
          sale_id: string | null
        }
        Insert: {
          account_id: string
          created_at?: string
          customer_id: string
          expired?: boolean
          expires_at?: string | null
          id?: string
          kind: Database["public"]["Enums"]["loyalty_entry_kind"]
          metadata?: Json
          points: number
          reason?: string | null
          sale_id?: string | null
        }
        Update: {
          account_id?: string
          created_at?: string
          customer_id?: string
          expired?: boolean
          expires_at?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["loyalty_entry_kind"]
          metadata?: Json
          points?: number
          reason?: string | null
          sale_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_ledger_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rules: {
        Row: {
          active: boolean
          birthday_bonus_points: number
          brl_per_point: number
          created_at: string
          expiration_months: number
          id: string
          low_balance_threshold: number
          name: string
          notify_expiring_days: number
          notify_on_earn: boolean
          points_per_brl: number
          tier_bronze_threshold: number
          tier_diamante_multiplier: number
          tier_diamante_threshold: number
          tier_ouro_multiplier: number
          tier_ouro_threshold: number
          tier_prata_multiplier: number
          tier_prata_threshold: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          birthday_bonus_points?: number
          brl_per_point?: number
          created_at?: string
          expiration_months?: number
          id?: string
          low_balance_threshold?: number
          name?: string
          notify_expiring_days?: number
          notify_on_earn?: boolean
          points_per_brl?: number
          tier_bronze_threshold?: number
          tier_diamante_multiplier?: number
          tier_diamante_threshold?: number
          tier_ouro_multiplier?: number
          tier_ouro_threshold?: number
          tier_prata_multiplier?: number
          tier_prata_threshold?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          birthday_bonus_points?: number
          brl_per_point?: number
          created_at?: string
          expiration_months?: number
          id?: string
          low_balance_threshold?: number
          name?: string
          notify_expiring_days?: number
          notify_on_earn?: boolean
          points_per_brl?: number
          tier_bronze_threshold?: number
          tier_diamante_multiplier?: number
          tier_diamante_threshold?: number
          tier_ouro_multiplier?: number
          tier_ouro_threshold?: number
          tier_prata_multiplier?: number
          tier_prata_threshold?: number
          updated_at?: string
        }
        Relationships: []
      }
      marketing_photo_generations: {
        Row: {
          created_at: string
          created_by: string | null
          error: string | null
          id: string
          image_path: string | null
          is_current: boolean
          preset: string
          product_id: string | null
          source_image_path: string | null
          status: string
          store_id: string
          updated_at: string
          watermark: Json | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          image_path?: string | null
          is_current?: boolean
          preset: string
          product_id?: string | null
          source_image_path?: string | null
          status?: string
          store_id: string
          updated_at?: string
          watermark?: Json | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error?: string | null
          id?: string
          image_path?: string | null
          is_current?: boolean
          preset?: string
          product_id?: string | null
          source_image_path?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          watermark?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_photo_generations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lots_expiring_soon"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "marketing_photo_generations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_photo_generations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          context: Json
          created_at: string
          id: string
          kind: string
          link_url: string | null
          message: string | null
          read_by: string[]
          severity: string
          store_id: string
          target_roles: string[]
          title: string
        }
        Insert: {
          context?: Json
          created_at?: string
          id?: string
          kind: string
          link_url?: string | null
          message?: string | null
          read_by?: string[]
          severity?: string
          store_id: string
          target_roles?: string[]
          title: string
        }
        Update: {
          context?: Json
          created_at?: string
          id?: string
          kind?: string
          link_url?: string | null
          message?: string | null
          read_by?: string[]
          severity?: string
          store_id?: string
          target_roles?: string[]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          id: string
          is_default: boolean
          provider: string
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          provider: string
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          id?: string
          is_default?: boolean
          provider?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_gateways_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          amount: number
          carrier: string | null
          code: string
          confirmation_attempts: number
          confirmation_last_error: string | null
          confirmation_sent_at: string | null
          created_at: string
          customer_id: string | null
          description: string
          expires_at: string | null
          fulfilled_at: string | null
          fulfillment: Json | null
          id: string
          installments_paid: number | null
          items: Json | null
          max_installments: number
          methods: Json
          mp_init_point: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          notes: string | null
          operator_user_id: string | null
          order_confirmed_at: string | null
          paid_amount: number | null
          paid_at: string | null
          paid_method: string | null
          provider: string
          receivable_id: string | null
          return_reason: string | null
          return_requested_at: string | null
          sale_id: string | null
          shipped_at: string | null
          splits: Json | null
          status: Database["public"]["Enums"]["payment_link_status"]
          store_id: string
          tracking_code: string | null
          updated_at: string
          wa_conversation_id: string | null
        }
        Insert: {
          amount: number
          carrier?: string | null
          code: string
          confirmation_attempts?: number
          confirmation_last_error?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_id?: string | null
          description: string
          expires_at?: string | null
          fulfilled_at?: string | null
          fulfillment?: Json | null
          id?: string
          installments_paid?: number | null
          items?: Json | null
          max_installments?: number
          methods?: Json
          mp_init_point?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notes?: string | null
          operator_user_id?: string | null
          order_confirmed_at?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_method?: string | null
          provider?: string
          receivable_id?: string | null
          return_reason?: string | null
          return_requested_at?: string | null
          sale_id?: string | null
          shipped_at?: string | null
          splits?: Json | null
          status?: Database["public"]["Enums"]["payment_link_status"]
          store_id: string
          tracking_code?: string | null
          updated_at?: string
          wa_conversation_id?: string | null
        }
        Update: {
          amount?: number
          carrier?: string | null
          code?: string
          confirmation_attempts?: number
          confirmation_last_error?: string | null
          confirmation_sent_at?: string | null
          created_at?: string
          customer_id?: string | null
          description?: string
          expires_at?: string | null
          fulfilled_at?: string | null
          fulfillment?: Json | null
          id?: string
          installments_paid?: number | null
          items?: Json | null
          max_installments?: number
          methods?: Json
          mp_init_point?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          notes?: string | null
          operator_user_id?: string | null
          order_confirmed_at?: string | null
          paid_amount?: number | null
          paid_at?: string | null
          paid_method?: string | null
          provider?: string
          receivable_id?: string | null
          return_reason?: string | null
          return_requested_at?: string | null
          sale_id?: string | null
          shipped_at?: string | null
          splits?: Json | null
          status?: Database["public"]["Enums"]["payment_link_status"]
          store_id?: string
          tracking_code?: string | null
          updated_at?: string
          wa_conversation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_links_wa_conversation_id_fkey"
            columns: ["wa_conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reminders: {
        Row: {
          attempts: number
          channel: string
          created_at: string
          customer_id: string
          error: string | null
          id: string
          message: string
          phone: string | null
          provider: string | null
          provider_message_id: string | null
          schedule_id: string | null
          sent_at: string | null
          status: string
          store_id: string
          wa_url: string | null
        }
        Insert: {
          attempts?: number
          channel?: string
          created_at?: string
          customer_id: string
          error?: string | null
          id?: string
          message: string
          phone?: string | null
          provider?: string | null
          provider_message_id?: string | null
          schedule_id?: string | null
          sent_at?: string | null
          status?: string
          store_id: string
          wa_url?: string | null
        }
        Update: {
          attempts?: number
          channel?: string
          created_at?: string
          customer_id?: string
          error?: string | null
          id?: string
          message?: string
          phone?: string | null
          provider?: string | null
          provider_message_id?: string | null
          schedule_id?: string | null
          sent_at?: string | null
          status?: string
          store_id?: string
          wa_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "payment_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reminders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_schedules: {
        Row: {
          active: boolean
          amount: number | null
          cadence: string
          channel: string
          created_at: string
          customer_id: string
          id: string
          last_run_at: string | null
          max_occurrences: number | null
          message: string
          next_run_at: string
          occurrences: number
          operator_user_id: string | null
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount?: number | null
          cadence: string
          channel?: string
          created_at?: string
          customer_id: string
          id?: string
          last_run_at?: string | null
          max_occurrences?: number | null
          message: string
          next_run_at: string
          occurrences?: number
          operator_user_id?: string | null
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number | null
          cadence?: string
          channel?: string
          created_at?: string
          customer_id?: string
          id?: string
          last_run_at?: string | null
          max_occurrences?: number | null
          message?: string
          next_run_at?: string
          occurrences?: number
          operator_user_id?: string | null
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_schedules_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_schedules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_split_entries: {
        Row: {
          amount: number
          created_at: string
          error: string | null
          id: string
          percentage: number | null
          provider: string
          provider_ref: string | null
          recipient_customer_id: string | null
          recipient_name: string | null
          source_id: string
          source_type: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          error?: string | null
          id?: string
          percentage?: number | null
          provider: string
          provider_ref?: string | null
          recipient_customer_id?: string | null
          recipient_name?: string | null
          source_id: string
          source_type: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          error?: string | null
          id?: string
          percentage?: number | null
          provider?: string
          provider_ref?: string | null
          recipient_customer_id?: string | null
          recipient_name?: string | null
          source_id?: string
          source_type?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_split_entries_recipient_customer_id_fkey"
            columns: ["recipient_customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_split_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      pix_charges: {
        Row: {
          amount: number
          approved_at: string | null
          cancelled_at: string | null
          cart_snapshot: Json
          created_at: string
          credit_installment_id: string | null
          customer_id: string | null
          customer_phone: string
          expires_at: string
          id: string
          mp_payment_id: string | null
          mp_qr_code: string | null
          mp_qr_code_base64: string | null
          mp_ticket_url: string | null
          operator_user_id: string | null
          parent_charge_id: string | null
          provider: string
          reminded_at: string | null
          sale_code: string
          session_id: string | null
          splits: Json | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          cancelled_at?: string | null
          cart_snapshot?: Json
          created_at?: string
          credit_installment_id?: string | null
          customer_id?: string | null
          customer_phone: string
          expires_at: string
          id?: string
          mp_payment_id?: string | null
          mp_qr_code?: string | null
          mp_qr_code_base64?: string | null
          mp_ticket_url?: string | null
          operator_user_id?: string | null
          parent_charge_id?: string | null
          provider?: string
          reminded_at?: string | null
          sale_code: string
          session_id?: string | null
          splits?: Json | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          cancelled_at?: string | null
          cart_snapshot?: Json
          created_at?: string
          credit_installment_id?: string | null
          customer_id?: string | null
          customer_phone?: string
          expires_at?: string
          id?: string
          mp_payment_id?: string | null
          mp_qr_code?: string | null
          mp_qr_code_base64?: string | null
          mp_ticket_url?: string | null
          operator_user_id?: string | null
          parent_charge_id?: string | null
          provider?: string
          reminded_at?: string | null
          sale_code?: string
          session_id?: string | null
          splits?: Json | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_charges_credit_installment_id_fkey"
            columns: ["credit_installment_id"]
            isOneToOne: false
            referencedRelation: "credit_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_parent_charge_id_fkey"
            columns: ["parent_charge_id"]
            isOneToOne: false
            referencedRelation: "pix_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      post_drafts: {
        Row: {
          ai_prompt: string | null
          caption: string | null
          created_at: string | null
          error_message: string | null
          id: string
          media_type: string
          media_urls: Json | null
          platform: string
          published_at: string | null
          scheduled_at: string | null
          status: string
          store_id: string
          updated_at: string | null
          user_id: string | null
          visual_style: string | null
        }
        Insert: {
          ai_prompt?: string | null
          caption?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          media_type: string
          media_urls?: Json | null
          platform: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          store_id: string
          updated_at?: string | null
          user_id?: string | null
          visual_style?: string | null
        }
        Update: {
          ai_prompt?: string | null
          caption?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          media_type?: string
          media_urls?: Json | null
          platform?: string
          published_at?: string | null
          scheduled_at?: string | null
          status?: string
          store_id?: string
          updated_at?: string | null
          user_id?: string | null
          visual_style?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_drafts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_batches: {
        Row: {
          cancel_reason: string | null
          cancelled_at: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          settings: Json | null
          status: Database["public"]["Enums"]["batch_status"]
          store_id: string
          updated_at: string | null
        }
        Insert: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          settings?: Json | null
          status?: Database["public"]["Enums"]["batch_status"]
          store_id: string
          updated_at?: string | null
        }
        Update: {
          cancel_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          settings?: Json | null
          status?: Database["public"]["Enums"]["batch_status"]
          store_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_batches_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          parent_id: string | null
          slug: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          slug?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          slug?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_lots: {
        Row: {
          created_at: string
          id: string
          lot_code: string
          product_id: string
          qty: number
          store_id: string
          updated_at: string
          validity: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          lot_code: string
          product_id: string
          qty?: number
          store_id: string
          updated_at?: string
          validity: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          lot_code?: string
          product_id?: string
          qty?: number
          store_id?: string
          updated_at?: string
          validity?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lots_expiring_soon"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_lots_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_lots_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          active: boolean
          attrs: Json
          cost_price: number | null
          created_at: string
          ean: string | null
          id: string
          image_url: string | null
          name: string
          price: number
          product_id: string
          sku: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          attrs?: Json
          cost_price?: number | null
          created_at?: string
          ean?: string | null
          id?: string
          image_url?: string | null
          name: string
          price: number
          product_id: string
          sku?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          attrs?: Json
          cost_price?: number | null
          created_at?: string
          ean?: string | null
          id?: string
          image_url?: string | null
          name?: string
          price?: number
          product_id?: string
          sku?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lots_expiring_soon"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          ai_generated: boolean
          brand: string | null
          category_id: string | null
          cest: string | null
          color: string | null
          cost_price: number | null
          created_at: string
          description: string | null
          ean: string | null
          id: string
          image_url: string | null
          min_stock: number
          name: string
          ncm: string | null
          sku: string
          slug: string | null
          store_id: string
          storefront_public: boolean
          supplier: string | null
          tags: string[]
          tax_profile_id: string | null
          unit_commercial: string | null
          unit_price: number
          updated_at: string
          volume: string | null
        }
        Insert: {
          active?: boolean
          ai_generated?: boolean
          brand?: string | null
          category_id?: string | null
          cest?: string | null
          color?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          ean?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name: string
          ncm?: string | null
          sku: string
          slug?: string | null
          store_id: string
          storefront_public?: boolean
          supplier?: string | null
          tags?: string[]
          tax_profile_id?: string | null
          unit_commercial?: string | null
          unit_price?: number
          updated_at?: string
          volume?: string | null
        }
        Update: {
          active?: boolean
          ai_generated?: boolean
          brand?: string | null
          category_id?: string | null
          cest?: string | null
          color?: string | null
          cost_price?: number | null
          created_at?: string
          description?: string | null
          ean?: string | null
          id?: string
          image_url?: string | null
          min_stock?: number
          name?: string
          ncm?: string | null
          sku?: string
          slug?: string | null
          store_id?: string
          storefront_public?: boolean
          supplier?: string | null
          tags?: string[]
          tax_profile_id?: string | null
          unit_commercial?: string | null
          unit_price?: number
          updated_at?: string
          volume?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_tax_profile_id_fkey"
            columns: ["tax_profile_id"]
            isOneToOne: false
            referencedRelation: "fiscal_tax_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          failure_count: number
          id: string
          last_used_at: string | null
          p256dh: string
          store_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh: string
          store_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          failure_count?: number
          id?: string
          last_used_at?: string | null
          p256dh?: string
          store_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          cashback_used: number
          code: string
          created_at: string
          customer_id: string | null
          id: string
          lines: Json
          operator: string | null
          operator_user_id: string | null
          payments: Json
          session_id: string | null
          store_id: string
          total: number
          whatsapp_link: string | null
        }
        Insert: {
          cashback_used?: number
          code: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lines?: Json
          operator?: string | null
          operator_user_id?: string | null
          payments?: Json
          session_id?: string | null
          store_id: string
          total?: number
          whatsapp_link?: string | null
        }
        Update: {
          cashback_used?: number
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lines?: Json
          operator?: string | null
          operator_user_id?: string | null
          payments?: Json
          session_id?: string | null
          store_id?: string
          total?: number
          whatsapp_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cashier_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_messages: {
        Row: {
          created_at: string | null
          customer_id: string
          id: string
          last_error: string | null
          send_at: string
          status: string | null
          store_id: string
          text: string
        }
        Insert: {
          created_at?: string | null
          customer_id: string
          id?: string
          last_error?: string | null
          send_at: string
          status?: string | null
          store_id: string
          text: string
        }
        Update: {
          created_at?: string | null
          customer_id?: string
          id?: string
          last_error?: string | null
          send_at?: string
          status?: string | null
          store_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          access_token: string
          account_id: string
          created_at: string | null
          id: string
          name: string | null
          platform: string
          store_id: string
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          access_token: string
          account_id: string
          created_at?: string | null
          id?: string
          name?: string | null
          platform: string
          store_id: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string
          account_id?: string
          created_at?: string | null
          id?: string
          name?: string | null
          platform?: string
          store_id?: string
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          lot_id: string
          note: string | null
          operator: string | null
          operator_user_id: string | null
          qty: number
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          lot_id: string
          note?: string | null
          operator?: string | null
          operator_user_id?: string | null
          qty: number
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["stock_movement_kind"]
          lot_id?: string
          note?: string | null
          operator?: string | null
          operator_user_id?: string | null
          qty?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "lots_expiring_soon"
            referencedColumns: ["lot_id"]
          },
          {
            foreignKeyName: "stock_movements_lot_id_fkey"
            columns: ["lot_id"]
            isOneToOne: false
            referencedRelation: "product_lots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_orders: {
        Row: {
          cancelled_at: string | null
          channel: string
          code: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          imported_at: string | null
          imported_by: string | null
          items: Json
          notes: string | null
          reserved_until: string | null
          status: string
          store_id: string
          total: number
          updated_at: string
          wa_delivered_at: string | null
          wa_error: string | null
          wa_failed_at: string | null
          wa_message_id: string | null
          wa_read_at: string | null
          wa_status: string | null
          whatsapp_clicked_at: string | null
          whatsapp_confirmed_at: string | null
        }
        Insert: {
          cancelled_at?: string | null
          channel?: string
          code: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          items: Json
          notes?: string | null
          reserved_until?: string | null
          status?: string
          store_id: string
          total?: number
          updated_at?: string
          wa_delivered_at?: string | null
          wa_error?: string | null
          wa_failed_at?: string | null
          wa_message_id?: string | null
          wa_read_at?: string | null
          wa_status?: string | null
          whatsapp_clicked_at?: string | null
          whatsapp_confirmed_at?: string | null
        }
        Update: {
          cancelled_at?: string | null
          channel?: string
          code?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          imported_at?: string | null
          imported_by?: string | null
          items?: Json
          notes?: string | null
          reserved_until?: string | null
          status?: string
          store_id?: string
          total?: number
          updated_at?: string
          wa_delivered_at?: string | null
          wa_error?: string | null
          wa_failed_at?: string | null
          wa_message_id?: string | null
          wa_read_at?: string | null
          wa_status?: string | null
          whatsapp_clicked_at?: string | null
          whatsapp_confirmed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      storefront_stock_reservations: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          order_id: string
          product_id: string
          qty: number
          released_at: string | null
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          order_id: string
          product_id: string
          qty: number
          released_at?: string | null
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string
          product_id?: string
          qty?: number
          released_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "storefront_stock_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "storefront_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          active: boolean
          address: string | null
          cnpj: string | null
          code: string
          created_at: string
          id: string
          name: string
          phone: string | null
          slug: string | null
          storefront_public: boolean
          storefront_whatsapp: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          cnpj?: string | null
          code: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          slug?: string | null
          storefront_public?: boolean
          storefront_whatsapp?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          cnpj?: string | null
          code?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          slug?: string | null
          storefront_public?: boolean
          storefront_whatsapp?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_charges: {
        Row: {
          amount: number
          charged_at: string | null
          created_at: string
          id: string
          mp_payment_id: string | null
          status: string
          store_id: string
          subscription_id: string
        }
        Insert: {
          amount: number
          charged_at?: string | null
          created_at?: string
          id?: string
          mp_payment_id?: string | null
          status?: string
          store_id: string
          subscription_id: string
        }
        Update: {
          amount?: number
          charged_at?: string | null
          created_at?: string
          id?: string
          mp_payment_id?: string | null
          status?: string
          store_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_charges_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          amount: number
          charges_count: number
          created_at: string
          customer_id: string
          frequency: number
          frequency_type: string
          id: string
          last_charge_at: string | null
          max_charges: number | null
          mp_init_point: string | null
          mp_preapproval_id: string | null
          next_charge_at: string
          notes: string | null
          operator_user_id: string | null
          payer_email: string | null
          provider: string
          status: string
          store_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          charges_count?: number
          created_at?: string
          customer_id: string
          frequency?: number
          frequency_type?: string
          id?: string
          last_charge_at?: string | null
          max_charges?: number | null
          mp_init_point?: string | null
          mp_preapproval_id?: string | null
          next_charge_at: string
          notes?: string | null
          operator_user_id?: string | null
          payer_email?: string | null
          provider?: string
          status?: string
          store_id: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          charges_count?: number
          created_at?: string
          customer_id?: string
          frequency?: number
          frequency_type?: string
          id?: string
          last_charge_at?: string | null
          max_charges?: number | null
          mp_init_point?: string | null
          mp_preapproval_id?: string | null
          next_charge_at?: string
          notes?: string | null
          operator_user_id?: string | null
          payer_email?: string | null
          provider?: string
          status?: string
          store_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string | null
          id: string
          name: string
          store_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          store_id: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
          login_email: string | null
          role: Database["public"]["Enums"]["app_role"]
          store_id: string | null
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id?: string
          login_email?: string | null
          role: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          login_email?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_conversations: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          cart: Json
          cart_recovery_last_at: string | null
          cart_recovery_stage: number
          channel: string
          closed_at: string | null
          created_at: string
          customer_id: string | null
          first_response_at: string | null
          handoff_at: string | null
          handoff_reason: string | null
          handoff_to_human: boolean
          id: string
          last_inbound_at: string | null
          last_outbound_at: string | null
          last_snippet: string | null
          phone: string
          queue_id: string | null
          sla_state: string
          status: string
          store_id: string
          tags: string[]
          unread_count: number
          updated_at: string
          wa_name: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          cart?: Json
          cart_recovery_last_at?: string | null
          cart_recovery_stage?: number
          channel?: string
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          first_response_at?: string | null
          handoff_at?: string | null
          handoff_reason?: string | null
          handoff_to_human?: boolean
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_snippet?: string | null
          phone: string
          queue_id?: string | null
          sla_state?: string
          status?: string
          store_id: string
          tags?: string[]
          unread_count?: number
          updated_at?: string
          wa_name?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          cart?: Json
          cart_recovery_last_at?: string | null
          cart_recovery_stage?: number
          channel?: string
          closed_at?: string | null
          created_at?: string
          customer_id?: string | null
          first_response_at?: string | null
          handoff_at?: string | null
          handoff_reason?: string | null
          handoff_to_human?: boolean
          id?: string
          last_inbound_at?: string | null
          last_outbound_at?: string | null
          last_snippet?: string | null
          phone?: string
          queue_id?: string | null
          sla_state?: string
          status?: string
          store_id?: string
          tags?: string[]
          unread_count?: number
          updated_at?: string
          wa_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "wa_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_internal_notes: {
        Row: {
          author_id: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_internal_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_messages: {
        Row: {
          channel: string
          conversation_id: string
          created_at: string
          direction: string
          id: string
          meta: Json
          text: string | null
          wa_message_id: string | null
        }
        Insert: {
          channel?: string
          conversation_id: string
          created_at?: string
          direction: string
          id?: string
          meta?: Json
          text?: string | null
          wa_message_id?: string | null
        }
        Update: {
          channel?: string
          conversation_id?: string
          created_at?: string
          direction?: string
          id?: string
          meta?: Json
          text?: string | null
          wa_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "wa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_queues: {
        Row: {
          active: boolean
          color: string
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          sla_first_response_seconds: number
          sla_resolution_seconds: number
          store_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          sla_first_response_seconds?: number
          sla_resolution_seconds?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          sla_first_response_seconds?: number
          sla_resolution_seconds?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_queues_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_settings: {
        Row: {
          active: boolean
          cloud_phone_id: string | null
          cloud_template_lang: string | null
          cloud_template_name: string | null
          cloud_token: string | null
          cloud_waba_id: string | null
          created_at: string
          fb_active: boolean
          fb_app_id: string | null
          fb_page_id: string | null
          fb_token: string | null
          fb_token_expires_at: string | null
          from_number: string | null
          ig_active: boolean
          ig_app_id: string | null
          ig_page_id: string | null
          ig_token: string | null
          ig_token_expires_at: string | null
          ig_user_id: string | null
          last_test_at: string | null
          last_test_error: string | null
          provider: string
          store_id: string
          updated_at: string
          verified_at: string | null
          zapi_client_token: string | null
          zapi_instance_id: string | null
          zapi_token: string | null
        }
        Insert: {
          active?: boolean
          cloud_phone_id?: string | null
          cloud_template_lang?: string | null
          cloud_template_name?: string | null
          cloud_token?: string | null
          cloud_waba_id?: string | null
          created_at?: string
          fb_active?: boolean
          fb_app_id?: string | null
          fb_page_id?: string | null
          fb_token?: string | null
          fb_token_expires_at?: string | null
          from_number?: string | null
          ig_active?: boolean
          ig_app_id?: string | null
          ig_page_id?: string | null
          ig_token?: string | null
          ig_token_expires_at?: string | null
          ig_user_id?: string | null
          last_test_at?: string | null
          last_test_error?: string | null
          provider?: string
          store_id: string
          updated_at?: string
          verified_at?: string | null
          zapi_client_token?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Update: {
          active?: boolean
          cloud_phone_id?: string | null
          cloud_template_lang?: string | null
          cloud_template_name?: string | null
          cloud_token?: string | null
          cloud_waba_id?: string | null
          created_at?: string
          fb_active?: boolean
          fb_app_id?: string | null
          fb_page_id?: string | null
          fb_token?: string | null
          fb_token_expires_at?: string | null
          from_number?: string | null
          ig_active?: boolean
          ig_app_id?: string | null
          ig_page_id?: string | null
          ig_token?: string | null
          ig_token_expires_at?: string | null
          ig_user_id?: string | null
          last_test_at?: string | null
          last_test_error?: string | null
          provider?: string
          store_id?: string
          updated_at?: string
          verified_at?: string | null
          zapi_client_token?: string | null
          zapi_instance_id?: string | null
          zapi_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_tags: {
        Row: {
          color: string
          created_at: string
          id: string
          label: string
          store_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          label: string
          store_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          label?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wa_tags_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wa_templates: {
        Row: {
          body_text: string | null
          buttons: Json
          category: string | null
          created_at: string
          footer_text: string | null
          header_text: string | null
          id: string
          language: string
          meta_template_id: string | null
          name: string
          raw: Json
          status: string
          store_id: string
          synced_at: string
          updated_at: string
          variables_count: number
        }
        Insert: {
          body_text?: string | null
          buttons?: Json
          category?: string | null
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          meta_template_id?: string | null
          name: string
          raw?: Json
          status?: string
          store_id: string
          synced_at?: string
          updated_at?: string
          variables_count?: number
        }
        Update: {
          body_text?: string | null
          buttons?: Json
          category?: string | null
          created_at?: string
          footer_text?: string | null
          header_text?: string | null
          id?: string
          language?: string
          meta_template_id?: string | null
          name?: string
          raw?: Json
          status?: string
          store_id?: string
          synced_at?: string
          updated_at?: string
          variables_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "wa_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          amount: number | null
          applied_at: string | null
          apply_error: string | null
          apply_status: string
          created_at: string
          external_ref: string | null
          id: string
          method: string | null
          parsed: Json | null
          parsed_status: string | null
          provider: string
          provider_payment_id: string | null
          raw_body: string | null
          raw_headers: Json | null
          received_at: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number | null
          applied_at?: string | null
          apply_error?: string | null
          apply_status?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          method?: string | null
          parsed?: Json | null
          parsed_status?: string | null
          provider: string
          provider_payment_id?: string | null
          raw_body?: string | null
          raw_headers?: Json | null
          received_at?: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number | null
          applied_at?: string | null
          apply_error?: string | null
          apply_status?: string
          created_at?: string
          external_ref?: string | null
          id?: string
          method?: string | null
          parsed?: Json | null
          parsed_status?: string | null
          provider?: string
          provider_payment_id?: string | null
          raw_body?: string | null
          raw_headers?: Json | null
          received_at?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      lots_expiring_soon: {
        Row: {
          days_left: number | null
          lot_code: string | null
          lot_id: string | null
          product_id: string | null
          product_name: string | null
          qty: number | null
          sku: string | null
          validity: string | null
        }
        Relationships: []
      }
      wa_queue_metrics_24h: {
        Row: {
          answered_count: number | null
          closed_count: number | null
          open_count: number | null
          queue_id: string | null
          sla_breached: number | null
          store_id: string | null
          tma_seconds: number | null
          tme_seconds: number | null
          waiting_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "wa_conversations_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "wa_queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wa_conversations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      abc_suppliers: {
        Args: { _from: string; _store_id: string; _to: string }
        Returns: {
          share: number
          supplier: string
          total: number
        }[]
      }
      add_store_credit: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_note?: string
          p_source?: string
          p_source_id?: string
          p_store_id: string
        }
        Returns: number
      }
      adjust_credit_limit: {
        Args: {
          _customer: string
          _new_limit: number
          _reason?: string
          _store: string
        }
        Returns: undefined
      }
      apply_overdue_penalties: { Args: never; Returns: number }
      can_read_store_row: {
        Args: { _operator_user_id: string; _store_id: string }
        Returns: boolean
      }
      cancel_boleto: { Args: { _id: string }; Returns: undefined }
      cancel_gift_card: {
        Args: { p_id: string }
        Returns: {
          balance: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          initial_amount: number
          issued_by: string | null
          issued_to_customer_id: string | null
          notes: string | null
          status: string
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "gift_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cancel_payment_link: { Args: { _id: string }; Returns: undefined }
      cancel_product_batch: {
        Args: { p_batch_id: string; p_reason: string }
        Returns: undefined
      }
      cashflow_by_cost_center: {
        Args: { _from: string; _store_id: string; _to: string }
        Returns: {
          cost_center_id: string
          cost_center_name: string
          forecast_in: number
          forecast_out: number
          kind: string
          monthly_budget: number
          net: number
          realized_in: number
          realized_out: number
        }[]
      }
      cashflow_daily: {
        Args: { _from: string; _store_id: string; _to: string }
        Returns: {
          day: string
          forecast_in: number
          forecast_out: number
          realized_in: number
          realized_out: number
        }[]
      }
      cashflow_history_monthly: {
        Args: { _months?: number; _store_id: string }
        Returns: {
          accumulated: number
          month: string
          net: number
          realized_in: number
          realized_out: number
        }[]
      }
      cashflow_projection: {
        Args: { _days?: number; _store_id: string }
        Returns: {
          day: string
          expected_in: number
          expected_out: number
          net: number
          running_balance: number
        }[]
      }
      consolidated_by_store: {
        Args: { _from: string; _to: string }
        Returns: {
          avg_ticket: number
          expiring_lots: number
          open_sessions: number
          pending_pix: number
          revenue: number
          sales_count: number
          store_id: string
          store_name: string
        }[]
      }
      create_boleto: {
        Args: {
          _amount: number
          _ar?: string
          _barcode?: string
          _customer: string
          _digitable?: string
          _due: string
          _notes?: string
          _pdf?: string
          _sale?: string
          _store: string
        }
        Returns: string
      }
      create_credit_sale: {
        Args: {
          _customer: string
          _entrada: number
          _intervalo_dias?: number
          _notes?: string
          _parcelas: number
          _primeiro_venc: string
          _store: string
          _total: number
        }
        Returns: string
      }
      create_payment_link: {
        Args: {
          _amount: number
          _customer?: string
          _description: string
          _expires_at?: string
          _max_installments?: number
          _methods?: Json
          _notes?: string
          _receivable?: string
          _sale?: string
          _store: string
        }
        Returns: {
          code: string
          id: string
        }[]
      }
      create_payment_schedule: {
        Args: {
          _amount: number
          _cadence: string
          _customer: string
          _max_occ?: number
          _message: string
          _next: string
          _store: string
          _title: string
        }
        Returns: string
      }
      create_subscription: {
        Args: {
          _amount: number
          _customer: string
          _freq: number
          _freq_type: string
          _max_charges?: number
          _next: string
          _notes?: string
          _payer_email?: string
          _store: string
          _title: string
        }
        Returns: string
      }
      credit_dashboard: {
        Args: { _store_id: string }
        Returns: {
          default_rate: number
          open_count: number
          overdue_amount: number
          overdue_count: number
          received_today: number
          to_receive_today: number
        }[]
      }
      credit_risk_preview: {
        Args: { _customer: string; _store: string }
        Returns: {
          avg_days_late: number
          overdue_now: number
          paid_late: number
          paid_ontime: number
          probability: number
          score: number
          tier_suggested: Database["public"]["Enums"]["credit_tier"]
        }[]
      }
      credit_tier_from_score: {
        Args: { _score: number }
        Returns: Database["public"]["Enums"]["credit_tier"]
      }
      credit_wallet: {
        Args: { _customer_id: string; _store_id: string }
        Returns: {
          available: number
          blocked: boolean
          blocked_reason: string
          limit_amount: number
          next_due: string
          open_count: number
          overdue_count: number
          score: number
          tier: Database["public"]["Enums"]["credit_tier"]
          used: number
        }[]
      }
      customer_360: {
        Args: { _customer_id: string; _store_id?: string }
        Returns: {
          amount: number
          description: string
          event_at: string
          event_kind: string
          extra: Json
        }[]
      }
      debit_store_credit: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_note?: string
          p_source?: string
          p_source_id?: string
          p_store_id: string
        }
        Returns: number
      }
      dre_by_category: {
        Args: { _from: string; _store_id: string; _to: string }
        Returns: {
          category_id: string
          category_name: string
          kind: Database["public"]["Enums"]["fin_kind"]
          total: number
        }[]
      }
      emit_notification: {
        Args: {
          _ctx?: Json
          _kind: string
          _link?: string
          _message?: string
          _roles?: string[]
          _severity?: string
          _store: string
          _title: string
        }
        Returns: string
      }
      ensure_credit_limit: {
        Args: { _customer: string; _store: string }
        Returns: string
      }
      fiscal_cert_path_allowed: {
        Args: { _settings_txt: string; _user_id: string }
        Returns: boolean
      }
      gen_gift_card_code: { Args: never; Returns: string }
      gen_payment_link_code: { Args: never; Returns: string }
      get_store_credit_balance: {
        Args: { p_customer_id: string; p_store_id: string }
        Returns: number
      }
      get_wa_credentials_for_send: {
        Args: { _store: string }
        Returns: {
          active: boolean
          cloud_phone_id: string
          cloud_template_lang: string
          cloud_template_name: string
          cloud_token: string
          provider: string
          zapi_client_token: string
          zapi_instance_id: string
          zapi_token: string
        }[]
      }
      get_wa_settings: {
        Args: { _store: string }
        Returns: {
          active: boolean
          cloud_phone_id: string
          cloud_template_lang: string
          cloud_template_name: string
          cloud_token: string
          from_number: string
          last_test_at: string
          last_test_error: string
          provider: string
          store_id: string
          verified_at: string
          zapi_client_token: string
          zapi_instance_id: string
          zapi_token: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_staff: { Args: { _user_id: string }; Returns: boolean }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      issue_gift_card: {
        Args: {
          p_amount: number
          p_customer_id?: string
          p_expires_at?: string
          p_notes?: string
          p_store_id: string
        }
        Returns: {
          balance: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          initial_amount: number
          issued_by: string | null
          issued_to_customer_id: string | null
          notes: string | null
          status: string
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "gift_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_boletos: {
        Args: { _status?: string; _store: string }
        Returns: {
          amount: number
          barcode: string
          created_at: string
          customer_id: string
          customer_name: string
          digitable_line: string
          due_date: string
          id: string
          notes: string
          paid_amount: number
          paid_at: string
          pdf_url: string
          status: string
          store_id: string
        }[]
      }
      list_credit_installments: {
        Args: { _scope: string; _store_id: string }
        Returns: {
          credit_sale_id: string
          customer_id: string
          customer_name: string
          customer_phone: string
          days_late: number
          id: string
          num_total: number
          numero: number
          paid_amount: number
          paid_at: string
          status: Database["public"]["Enums"]["credit_installment_status"]
          valor: number
          vencimento: string
        }[]
      }
      list_customers_with_stats: {
        Args: { _store_id: string }
        Returns: {
          avg_ticket: number
          birthday: string
          cashback: number
          cpf: string
          created_at: string
          email: string
          id: string
          last_purchase_at: string
          name: string
          phone: string
          sales_count: number
          tags: string[]
          tier: string
          total_spent: number
        }[]
      }
      list_login_operators: {
        Args: { _store_id: string }
        Returns: {
          display_name: string
          login_email: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      list_login_stores: {
        Args: never
        Returns: {
          code: string
          id: string
          name: string
        }[]
      }
      list_notifications: {
        Args: { _limit?: number; _only_unread?: boolean; _store: string }
        Returns: {
          context: Json
          created_at: string
          id: string
          is_read: boolean
          kind: string
          link_url: string
          message: string
          severity: string
          title: string
        }[]
      }
      list_payment_links: {
        Args: { _scope: string; _store_id: string }
        Returns: {
          amount: number
          code: string
          created_at: string
          customer_id: string
          customer_name: string
          customer_phone: string
          description: string
          expires_at: string
          id: string
          methods: Json
          mp_init_point: string
          paid_amount: number
          paid_at: string
          paid_method: string
          status: Database["public"]["Enums"]["payment_link_status"]
        }[]
      }
      list_payment_reminders: {
        Args: { _limit?: number; _store: string }
        Returns: {
          channel: string
          created_at: string
          customer_id: string
          customer_name: string
          id: string
          message: string
          schedule_id: string
          sent_at: string
          status: string
          wa_url: string
        }[]
      }
      list_payment_schedules: {
        Args: { _store: string }
        Returns: {
          active: boolean
          amount: number
          cadence: string
          created_at: string
          customer_id: string
          customer_name: string
          customer_phone: string
          id: string
          last_run_at: string
          max_occurrences: number
          message: string
          next_run_at: string
          occurrences: number
          title: string
        }[]
      }
      list_queued_reminders: {
        Args: { _limit?: number }
        Returns: {
          attempts: number
          customer_id: string
          customer_name: string
          id: string
          message: string
          phone: string
          provider: string
          store_id: string
          wa_url: string
        }[]
      }
      list_stores_with_stats: {
        Args: never
        Returns: {
          active: boolean
          address: string
          cnpj: string
          code: string
          id: string
          month_revenue: number
          month_sales: number
          name: string
          operators_count: number
          phone: string
          products_count: number
        }[]
      }
      list_subscription_charges: {
        Args: { _subscription: string }
        Returns: {
          amount: number
          charged_at: string
          created_at: string
          id: string
          mp_payment_id: string
          status: string
        }[]
      }
      list_subscriptions: {
        Args: { _store: string }
        Returns: {
          amount: number
          charges_count: number
          created_at: string
          customer_id: string
          customer_name: string
          customer_phone: string
          frequency: number
          frequency_type: string
          id: string
          last_charge_at: string
          max_charges: number
          mp_init_point: string
          mp_preapproval_id: string
          next_charge_at: string
          payer_email: string
          status: string
          title: string
        }[]
      }
      log_audit: {
        Args: {
          _action: string
          _details?: Json
          _entity?: string
          _entity_id?: string
          _store_id?: string
        }
        Returns: string
      }
      mark_all_notifications_read: { Args: { _store: string }; Returns: number }
      mark_boleto_paid: {
        Args: { _amount?: number; _id: string }
        Returns: undefined
      }
      mark_expired_payment_links: { Args: never; Returns: number }
      mark_notification_read: { Args: { _id: string }; Returns: undefined }
      mark_overdue_installments: { Args: never; Returns: number }
      mark_reminder_sent: { Args: { _id: string }; Returns: undefined }
      my_stores: {
        Args: never
        Returns: {
          code: string
          id: string
          name: string
          role: Database["public"]["Enums"]["app_role"]
        }[]
      }
      notifications_unread_count: { Args: { _store: string }; Returns: number }
      pay_installment: {
        Args: {
          _amount: number
          _bank_account?: string
          _installment_id: string
          _method: string
        }
        Returns: undefined
      }
      recompute_credit_score: {
        Args: { _customer: string; _store: string }
        Returns: {
          applied_limit: number
          score: number
          tier: Database["public"]["Enums"]["credit_tier"]
        }[]
      }
      recompute_loyalty_tier: {
        Args: { _customer_id: string }
        Returns: string
      }
      record_reminder_result: {
        Args: {
          _error?: string
          _id: string
          _msg_id?: string
          _ok: boolean
          _provider?: string
        }
        Returns: undefined
      }
      record_wa_test_result: {
        Args: { _error?: string; _ok: boolean; _store: string }
        Returns: undefined
      }
      redeem_gift_card: {
        Args: { p_amount: number; p_code: string; p_sale_id?: string }
        Returns: {
          balance: number
          code: string
          created_at: string
          expires_at: string | null
          id: string
          initial_amount: number
          issued_by: string | null
          issued_to_customer_id: string | null
          notes: string | null
          status: string
          store_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "gift_cards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolve_payment_link: {
        Args: { _code: string }
        Returns: {
          amount: number
          code: string
          customer_name: string
          description: string
          expires_at: string
          id: string
          max_installments: number
          methods: Json
          mp_init_point: string
          provider: string
          status: Database["public"]["Enums"]["payment_link_status"]
          store_name: string
        }[]
      }
      run_due_reminders: { Args: never; Returns: number }
      seed_collection_rules: { Args: { _store_id: string }; Returns: undefined }
      set_subscription_status: {
        Args: { _id: string; _status: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      storage_media_path_allowed: {
        Args: { _product_txt: string; _store_txt: string; _user_id: string }
        Returns: boolean
      }
      storefront_admin_confirm_order: {
        Args: { _code: string; _user_id: string }
        Returns: {
          error: string
          ok: boolean
        }[]
      }
      storefront_admin_get_send_payload: {
        Args: { _code: string }
        Returns: {
          channel: string
          code: string
          customer_name: string
          customer_phone: string
          items: Json
          status: string
          store_name: string
          store_slug: string
          store_whatsapp: string
          total: number
          wa_message_id: string
        }[]
      }
      storefront_admin_list_orders: {
        Args: { _limit?: number; _status?: string; _store_id?: string }
        Returns: {
          cancelled_at: string
          channel: string
          code: string
          confirmed_at: string
          created_at: string
          customer_name: string
          customer_phone: string
          items: Json
          notes: string
          reserved_until: string
          status: string
          store_id: string
          store_name: string
          total: number
          wa_message_id: string
          wa_status: string
        }[]
      }
      storefront_available_stock: {
        Args: { _product_id: string }
        Returns: number
      }
      storefront_cancel_order: { Args: { _code: string }; Returns: boolean }
      storefront_expire_reservations: {
        Args: never
        Returns: {
          cancelled: number
          code: string
        }[]
      }
      storefront_get_category: {
        Args: { _slug: string }
        Returns: {
          id: string
          name: string
          slug: string
          store_name: string
          store_slug: string
        }[]
      }
      storefront_get_order: {
        Args: { _code: string }
        Returns: {
          cancelled_at: string
          channel: string
          code: string
          confirmed_at: string
          created_at: string
          customer_name: string
          customer_phone: string
          items: Json
          notes: string
          reserved_until: string
          status: string
          total: number
          wa_delivered_at: string
          wa_error: string
          wa_failed_at: string
          wa_read_at: string
          wa_status: string
          whatsapp_clicked_at: string
          whatsapp_confirmed_at: string
        }[]
      }
      storefront_get_product: {
        Args: { _slug: string }
        Returns: {
          brand: string
          category_name: string
          category_slug: string
          description: string
          id: string
          image_url: string
          name: string
          sku: string
          slug: string
          stock: number
          store_id: string
          store_name: string
          store_slug: string
          store_whatsapp: string
          unit_price: number
        }[]
      }
      storefront_list_categories: {
        Args: { _store_slug?: string }
        Returns: {
          id: string
          name: string
          product_count: number
          slug: string
          store_slug: string
        }[]
      }
      storefront_list_products: {
        Args: {
          _category_slug?: string
          _limit?: number
          _search?: string
          _store_slug?: string
        }
        Returns: {
          brand: string
          category_name: string
          category_slug: string
          description: string
          id: string
          image_url: string
          name: string
          sku: string
          slug: string
          stock: number
          store_name: string
          store_slug: string
          unit_price: number
        }[]
      }
      storefront_mark_whatsapp: {
        Args: { _code: string; _confirmed?: boolean }
        Returns: boolean
      }
      storefront_reserve_order: {
        Args: { _code: string; _minutes?: number }
        Returns: {
          error: string
          ok: boolean
          reserved_until: string
        }[]
      }
      storefront_update_order_notes: {
        Args: { _code: string; _notes: string }
        Returns: boolean
      }
      storefront_validate_cart: {
        Args: { _items: Json }
        Returns: {
          available: number
          ok: boolean
          product_id: string
          requested: number
        }[]
      }
      storefront_wa_set_message_id: {
        Args: { _code: string; _message_id: string }
        Returns: boolean
      }
      storefront_wa_update_status: {
        Args: { _error?: string; _message_id: string; _status: string }
        Returns: boolean
      }
      system_block_customer: {
        Args: { _customer: string; _reason: string; _store: string }
        Returns: undefined
      }
      system_pay_installment: {
        Args: {
          _amount: number
          _installment_id: string
          _method: string
          _pix_charge?: string
        }
        Returns: undefined
      }
      toggle_credit_block: {
        Args: {
          _blocked: boolean
          _customer: string
          _reason?: string
          _store: string
        }
        Returns: undefined
      }
      toggle_payment_schedule: {
        Args: { _active: boolean; _id: string }
        Returns: undefined
      }
      upsert_wa_settings: {
        Args: {
          _active: boolean
          _cloud_phone_id?: string
          _cloud_template_lang?: string
          _cloud_template_name?: string
          _cloud_token?: string
          _from: string
          _provider: string
          _store: string
          _zapi_client_token?: string
          _zapi_instance?: string
          _zapi_token?: string
        }
        Returns: undefined
      }
      user_has_store: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      user_role_in_store: {
        Args: { _store_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier" | "stockist"
      batch_status: "draft" | "processing" | "completed" | "archived"
      campaign_channel: "wa" | "email" | "inapp"
      campaign_status: "draft" | "scheduled" | "running" | "done" | "failed"
      campaign_trigger: "manual" | "birthday" | "inactive60" | "tier_upgrade"
      coupon_kind: "percent" | "fixed" | "shipping"
      credit_installment_status: "open" | "paid" | "overdue" | "canceled"
      credit_tier: "A" | "B" | "C"
      fin_kind: "income" | "expense"
      fin_source:
        | "sale"
        | "pix"
        | "manual"
        | "payable"
        | "receivable"
        | "adjust"
      fin_status: "open" | "paid" | "overdue" | "canceled"
      fiscal_doc_kind: "nfce" | "nfe" | "cfe_sat" | "nfe_devolucao"
      fiscal_doc_status:
        | "pending"
        | "processing"
        | "authorized"
        | "rejected"
        | "cancelled"
        | "contingency"
        | "inutilized"
      fiscal_environment: "homologacao" | "producao"
      fiscal_regime: "simples" | "presumido" | "real" | "mei"
      loyalty_entry_kind: "earn" | "redeem" | "expire" | "adjust"
      loyalty_tier: "bronze" | "prata" | "ouro" | "diamante"
      payment_link_status: "pending" | "paid" | "expired" | "canceled"
      stock_movement_kind: "entry" | "sale" | "adjust"
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
      app_role: ["admin", "manager", "cashier", "stockist"],
      batch_status: ["draft", "processing", "completed", "archived"],
      campaign_channel: ["wa", "email", "inapp"],
      campaign_status: ["draft", "scheduled", "running", "done", "failed"],
      campaign_trigger: ["manual", "birthday", "inactive60", "tier_upgrade"],
      coupon_kind: ["percent", "fixed", "shipping"],
      credit_installment_status: ["open", "paid", "overdue", "canceled"],
      credit_tier: ["A", "B", "C"],
      fin_kind: ["income", "expense"],
      fin_source: ["sale", "pix", "manual", "payable", "receivable", "adjust"],
      fin_status: ["open", "paid", "overdue", "canceled"],
      fiscal_doc_kind: ["nfce", "nfe", "cfe_sat", "nfe_devolucao"],
      fiscal_doc_status: [
        "pending",
        "processing",
        "authorized",
        "rejected",
        "cancelled",
        "contingency",
        "inutilized",
      ],
      fiscal_environment: ["homologacao", "producao"],
      fiscal_regime: ["simples", "presumido", "real", "mei"],
      loyalty_entry_kind: ["earn", "redeem", "expire", "adjust"],
      loyalty_tier: ["bronze", "prata", "ouro", "diamante"],
      payment_link_status: ["pending", "paid", "expired", "canceled"],
      stock_movement_kind: ["entry", "sale", "adjust"],
    },
  },
} as const
