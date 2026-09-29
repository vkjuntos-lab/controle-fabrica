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
      _bootstrap_migrations: {
        Row: {
          applied_at: string
          name: string | null
          version: string
        }
        Insert: {
          applied_at?: string
          name?: string | null
          version: string
        }
        Update: {
          applied_at?: string
          name?: string | null
          version?: string
        }
        Relationships: []
      }
      account_payables: {
        Row: {
          adjustment_amount: number
          company_id: string | null
          competence_date: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          discount_amount: number
          document_number: string
          due_date: string
          financial_category_id: string | null
          id: string
          installment_number: number
          interest_amount: number
          issue_date: string
          notes: string | null
          open_amount: number
          organization_id: string
          original_amount: number
          parent_id: string | null
          penalty_amount: number
          source_id: string
          source_status: string
          source_type: string
          status: string
          total_installments: number
          updated_at: string
        }
        Insert: {
          adjustment_amount?: number
          company_id?: string | null
          competence_date?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          discount_amount?: number
          document_number: string
          due_date: string
          financial_category_id?: string | null
          id?: string
          installment_number?: number
          interest_amount?: number
          issue_date: string
          notes?: string | null
          open_amount?: number
          organization_id: string
          original_amount: number
          parent_id?: string | null
          penalty_amount?: number
          source_id: string
          source_status?: string
          source_type: string
          status?: string
          total_installments?: number
          updated_at?: string
        }
        Update: {
          adjustment_amount?: number
          company_id?: string | null
          competence_date?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          discount_amount?: number
          document_number?: string
          due_date?: string
          financial_category_id?: string | null
          id?: string
          installment_number?: number
          interest_amount?: number
          issue_date?: string
          notes?: string | null
          open_amount?: number
          organization_id?: string
          original_amount?: number
          parent_id?: string | null
          penalty_amount?: number
          source_id?: string
          source_status?: string
          source_type?: string
          status?: string
          total_installments?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_payables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_payables_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "account_payables_organization_id_cost_center_id_fkey"
            columns: ["organization_id", "cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "account_payables_organization_id_financial_category_id_fkey"
            columns: ["organization_id", "financial_category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "account_payables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_payables_parent_fk"
            columns: ["organization_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "account_payables"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      account_receivables: {
        Row: {
          adjustment_amount: number
          company_id: string
          competence_date: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          discount_amount: number
          document_number: string
          due_date: string
          financial_category_id: string | null
          id: string
          installment_number: number
          interest_amount: number
          issue_date: string
          notes: string | null
          open_amount: number
          organization_id: string
          original_amount: number
          parent_id: string | null
          penalty_amount: number
          source_id: string
          source_status: string
          source_type: string
          status: string
          total_installments: number
          updated_at: string
        }
        Insert: {
          adjustment_amount?: number
          company_id: string
          competence_date?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          discount_amount?: number
          document_number: string
          due_date: string
          financial_category_id?: string | null
          id?: string
          installment_number?: number
          interest_amount?: number
          issue_date: string
          notes?: string | null
          open_amount?: number
          organization_id: string
          original_amount: number
          parent_id?: string | null
          penalty_amount?: number
          source_id: string
          source_status?: string
          source_type: string
          status?: string
          total_installments?: number
          updated_at?: string
        }
        Update: {
          adjustment_amount?: number
          company_id?: string
          competence_date?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          discount_amount?: number
          document_number?: string
          due_date?: string
          financial_category_id?: string | null
          id?: string
          installment_number?: number
          interest_amount?: number
          issue_date?: string
          notes?: string | null
          open_amount?: number
          organization_id?: string
          original_amount?: number
          parent_id?: string | null
          penalty_amount?: number
          source_id?: string
          source_status?: string
          source_type?: string
          status?: string
          total_installments?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_receivables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_receivables_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "account_receivables_organization_id_cost_center_id_fkey"
            columns: ["organization_id", "cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "account_receivables_organization_id_financial_category_id_fkey"
            columns: ["organization_id", "financial_category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "account_receivables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_receivables_organization_id_parent_id_fkey"
            columns: ["organization_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "account_receivables"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          context: Json
          created_at: string
          id: string
          organization_id: string | null
          resource: string
          resource_id: string | null
          result: string
          user_id: string | null
        }
        Insert: {
          action: string
          context?: Json
          created_at?: string
          id?: string
          organization_id?: string | null
          resource: string
          resource_id?: string | null
          result?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          context?: Json
          created_at?: string
          id?: string
          organization_id?: string | null
          resource?: string
          resource_id?: string | null
          result?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_of_materials: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          code: string
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          notes: string | null
          organization_id: string
          product_variant_id: string
          production_lead_time_days: number | null
          status: Database["public"]["Enums"]["bom_status"]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          product_variant_id: string
          production_lead_time_days?: number | null
          status?: Database["public"]["Enums"]["bom_status"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          product_variant_id?: string
          production_lead_time_days?: number | null
          status?: Database["public"]["Enums"]["bom_status"]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_of_materials_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "bill_of_materials_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_of_materials_items: {
        Row: {
          bom_id: string
          component_variant_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          quantity: number
          scrap_percentage: number
          sort_order: number
          unit_of_measure_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bom_id: string
          component_variant_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          quantity: number
          scrap_percentage?: number
          sort_order?: number
          unit_of_measure_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bom_id?: string
          component_variant_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          scrap_percentage?: number
          sort_order?: number
          unit_of_measure_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bill_of_materials_items_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_items_component_variant_id_fkey"
            columns: ["component_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "bill_of_materials_items_component_variant_id_fkey"
            columns: ["component_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_items_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_of_materials_items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      carriers: {
        Row: {
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          created_by: string | null
          document_number: string | null
          document_type: string | null
          id: string
          modality: string
          name: string
          notes: string | null
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          document_type?: string | null
          id?: string
          modality?: string
          name: string
          notes?: string | null
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          document_type?: string | null
          id?: string
          modality?: string
          name?: string
          notes?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "carriers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "carriers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_discount_authorities: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          max_discount_percent: number
          organization_id: string
          reason: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_discount_percent: number
          organization_id: string
          reason: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          max_discount_percent?: number
          organization_id?: string
          reason?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_discount_authorities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_discount_authorities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_discount_authorities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_payment_terms: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_payment_terms_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_payment_terms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_reasons: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kind: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_reasons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_reasons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_segments: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_segments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_segments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_sources: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_tags: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commercial_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commercial_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_plans: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          status: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_plans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          plan_id: string
          rate: number
          rate_type: string
          representative_id: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          organization_id: string
          plan_id: string
          rate: number
          rate_type: string
          representative_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          plan_id?: string
          rate?: number
          rate_type?: string
          representative_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "commission_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_organization_id_plan_id_fkey"
            columns: ["organization_id", "plan_id"]
            isOneToOne: false
            referencedRelation: "commission_plans"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "commission_rules_organization_id_representative_id_fkey"
            columns: ["organization_id", "representative_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "commission_rules_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "commission_rules_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          code: string
          created_at: string
          created_by: string | null
          document_number: string | null
          document_type: string | null
          email: string | null
          id: string
          legal_name: string
          notes: string | null
          organization_id: string
          phone: string | null
          state_registration: string | null
          status: string
          trade_name: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          id?: string
          legal_name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          state_registration?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          document_number?: string | null
          document_type?: string | null
          email?: string | null
          id?: string
          legal_name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          state_registration?: string | null
          status?: string
          trade_name?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_addresses: {
        Row: {
          city: string
          company_id: string
          complement: string | null
          country: string
          created_at: string
          district: string | null
          id: string
          is_primary: boolean
          number: string | null
          organization_id: string
          postal_code: string | null
          state: string | null
          street: string
          type: string
          updated_at: string
        }
        Insert: {
          city: string
          company_id: string
          complement?: string | null
          country?: string
          created_at?: string
          district?: string | null
          id?: string
          is_primary?: boolean
          number?: string | null
          organization_id: string
          postal_code?: string | null
          state?: string | null
          street: string
          type?: string
          updated_at?: string
        }
        Update: {
          city?: string
          company_id?: string
          complement?: string | null
          country?: string
          created_at?: string
          district?: string | null
          id?: string
          is_primary?: boolean
          number?: string | null
          organization_id?: string
          postal_code?: string | null
          state?: string | null
          street?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_addresses_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "company_addresses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_contacts: {
        Row: {
          communication_restricted: boolean
          company_id: string
          created_at: string
          department: string | null
          email: string | null
          id: string
          is_primary: boolean
          marketing_opt_in: boolean
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          preferred_channel: string | null
          processing_purpose: string | null
          status: string
          title: string | null
          updated_at: string
          whatsapp: string | null
        }
        Insert: {
          communication_restricted?: boolean
          company_id: string
          created_at?: string
          department?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          marketing_opt_in?: boolean
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          preferred_channel?: string | null
          processing_purpose?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Update: {
          communication_restricted?: boolean
          company_id?: string
          created_at?: string
          department?: string | null
          email?: string | null
          id?: string
          is_primary?: boolean
          marketing_opt_in?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          preferred_channel?: string | null
          processing_purpose?: string | null
          status?: string
          title?: string | null
          updated_at?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_contacts_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "company_contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      company_merge_requests: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          reason: string
          source_company_id: string
          status: string
          target_company_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          reason: string
          source_company_id: string
          status?: string
          target_company_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          reason?: string
          source_company_id?: string
          status?: string
          target_company_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_merge_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_merge_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_merge_requests_organization_id_source_company_id_fkey"
            columns: ["organization_id", "source_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "company_merge_requests_organization_id_target_company_id_fkey"
            columns: ["organization_id", "target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      company_roles: {
        Row: {
          company_id: string
          id: string
          organization_id: string
          role: string
        }
        Insert: {
          company_id: string
          id?: string
          organization_id: string
          role: string
        }
        Update: {
          company_id?: string
          id?: string
          organization_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_roles_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "company_roles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_calculation_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          items_failed: number
          items_processed: number
          organization_id: string
          results: Json
          scope: Json
          started_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          items_failed?: number
          items_processed?: number
          organization_id: string
          results?: Json
          scope: Json
          started_at?: string
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          items_failed?: number
          items_processed?: number
          organization_id?: string
          results?: Json
          scope?: Json
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_calculation_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_calculation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_centers_organization_id_parent_id_fkey"
            columns: ["organization_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      cost_routing_steps: {
        Row: {
          activity: string
          bom_id: string
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          organization_id: string
          reason: string
          standard_minutes: number
        }
        Insert: {
          activity: string
          bom_id: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          id?: string
          organization_id: string
          reason: string
          standard_minutes: number
        }
        Update: {
          activity?: string
          bom_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          organization_id?: string
          reason?: string
          standard_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_routing_steps_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_routing_steps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_routing_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_activities: {
        Row: {
          activity_type: string
          assigned_user_id: string
          company_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          lead_id: string | null
          opportunity_id: string | null
          organization_id: string
          outcome: string | null
          scheduled_at: string
          status: string
          subject: string
          updated_at: string
        }
        Insert: {
          activity_type: string
          assigned_user_id: string
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          organization_id: string
          outcome?: string | null
          scheduled_at: string
          status?: string
          subject: string
          updated_at?: string
        }
        Update: {
          activity_type?: string
          assigned_user_id?: string
          company_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          opportunity_id?: string | null
          organization_id?: string
          outcome?: string | null
          scheduled_at?: string
          status?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activities_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "crm_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activities_organization_id_lead_id_fkey"
            columns: ["organization_id", "lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "crm_activities_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      crm_activity_history: {
        Row: {
          activity_id: string
          after_value: Json
          before_value: Json | null
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          reason: string
          updated_at: string
        }
        Insert: {
          activity_id: string
          after_value: Json
          before_value?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          reason: string
          updated_at?: string
        }
        Update: {
          activity_id?: string
          after_value?: Json
          before_value?: Json | null
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_activity_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_activity_history_organization_id_activity_id_fkey"
            columns: ["organization_id", "activity_id"]
            isOneToOne: false
            referencedRelation: "crm_activities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "crm_activity_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_documents: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          id: string
          mime_type: string
          name: string
          organization_id: string
          purpose: string
          size_bytes: number
          status: string
          storage_path: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          mime_type: string
          name: string
          organization_id: string
          purpose: string
          size_bytes: number
          status?: string
          storage_path: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          mime_type?: string
          name?: string
          organization_id?: string
          purpose?: string
          size_bytes?: number
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_documents_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "crm_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_operation_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          operation: string
          operation_key: string
          organization_id: string
          payload: Json
          result: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          operation: string
          operation_key: string
          organization_id: string
          payload: Json
          result: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          operation?: string
          operation_key?: string
          organization_id?: string
          payload?: Json
          result?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_operation_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_operation_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credit_policies: {
        Row: {
          block_over_limit: boolean
          block_overdue: boolean
          company_id: string
          created_at: string
          created_by: string | null
          credit_limit: number | null
          id: string
          organization_id: string
          reason: string
          updated_at: string
        }
        Insert: {
          block_over_limit?: boolean
          block_overdue?: boolean
          company_id: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          id?: string
          organization_id: string
          reason: string
          updated_at?: string
        }
        Update: {
          block_over_limit?: boolean
          block_overdue?: boolean
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_limit?: number | null
          id?: string
          organization_id?: string
          reason?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credit_policies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credit_policies_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_credit_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_portfolio_assignments: {
        Row: {
          assignment_type: string
          company_id: string
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          organization_id: string
          reason: string
          representative_id: string
          started_at: string
          updated_at: string
        }
        Insert: {
          assignment_type?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          organization_id: string
          reason: string
          representative_id: string
          started_at?: string
          updated_at?: string
        }
        Update: {
          assignment_type?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          organization_id?: string
          reason?: string
          representative_id?: string
          started_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_portfolio_assignment_organization_id_representati_fkey"
            columns: ["organization_id", "representative_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_portfolio_assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_portfolio_assignments_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_portfolio_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_profiles: {
        Row: {
          acquisition_source_id: string | null
          commercial_segment_id: string | null
          commercial_status: string
          company_id: string
          created_at: string
          created_by: string | null
          customer_code: string
          customer_type: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_terms_id: string | null
          price_table_id: string | null
          updated_at: string
        }
        Insert: {
          acquisition_source_id?: string | null
          commercial_segment_id?: string | null
          commercial_status?: string
          company_id: string
          created_at?: string
          created_by?: string | null
          customer_code: string
          customer_type?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_terms_id?: string | null
          price_table_id?: string | null
          updated_at?: string
        }
        Update: {
          acquisition_source_id?: string | null
          commercial_segment_id?: string | null
          commercial_status?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          customer_code?: string
          customer_type?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_terms_id?: string | null
          price_table_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_profiles_organization_id_acquisition_source_id_fkey"
            columns: ["organization_id", "acquisition_source_id"]
            isOneToOne: false
            referencedRelation: "commercial_sources"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_profiles_organization_id_commercial_segment_id_fkey"
            columns: ["organization_id", "commercial_segment_id"]
            isOneToOne: false
            referencedRelation: "commercial_segments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_profiles_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_profiles_organization_id_payment_terms_id_fkey"
            columns: ["organization_id", "payment_terms_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_terms"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_profiles_organization_id_price_table_id_fkey"
            columns: ["organization_id", "price_table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      customer_return_items: {
        Row: {
          batch_id: string | null
          condition: string
          created_at: string
          customer_return_id: string
          destination: string
          id: string
          notes: string | null
          organization_id: string
          quantity: number
          reason: string | null
          received_quantity: number
          sales_order_item_id: string | null
          shipment_item_id: string | null
          sku_snapshot: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          condition?: string
          created_at?: string
          customer_return_id: string
          destination?: string
          id?: string
          notes?: string | null
          organization_id: string
          quantity: number
          reason?: string | null
          received_quantity?: number
          sales_order_item_id?: string | null
          shipment_item_id?: string | null
          sku_snapshot: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          condition?: string
          created_at?: string
          customer_return_id?: string
          destination?: string
          id?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          reason?: string | null
          received_quantity?: number
          sales_order_item_id?: string | null
          shipment_item_id?: string | null
          sku_snapshot?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_return_items_organization_id_customer_return_id_fkey"
            columns: ["organization_id", "customer_return_id"]
            isOneToOne: false
            referencedRelation: "customer_returns"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_return_items_organization_id_sales_order_item_id_fkey"
            columns: ["organization_id", "sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_items_organization_id_shipment_item_id_fkey"
            columns: ["organization_id", "shipment_item_id"]
            isOneToOne: false
            referencedRelation: "shipment_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "customer_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          created_by: string | null
          destination_location_id: string | null
          financial_action: string
          financial_notes: string | null
          financial_reference: string | null
          financial_requested_at: string | null
          id: string
          notes: string | null
          organization_id: string
          reason: string
          reason_detail: string | null
          received_at: string | null
          received_by: string | null
          requested_at: string
          return_number: string
          sales_order_id: string
          shipment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          destination_location_id?: string | null
          financial_action?: string
          financial_notes?: string | null
          financial_reference?: string | null
          financial_requested_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          reason: string
          reason_detail?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          return_number: string
          sales_order_id: string
          shipment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          destination_location_id?: string | null
          financial_action?: string
          financial_notes?: string | null
          financial_reference?: string | null
          financial_requested_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          reason?: string
          reason_detail?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string
          return_number?: string
          sales_order_id?: string
          shipment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_returns_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_returns_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_returns_organization_id_destination_location_id_fkey"
            columns: ["organization_id", "destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_returns_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_returns_organization_id_shipment_id_fkey"
            columns: ["organization_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_returns_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_tags: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          tag_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          tag_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          tag_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tags_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_tags_organization_id_tag_id_fkey"
            columns: ["organization_id", "tag_id"]
            isOneToOne: false
            referencedRelation: "commercial_tags"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      customer_territories: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          territory_id: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          territory_id: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          territory_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_territories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_territories_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "customer_territories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_territories_organization_id_territory_id_fkey"
            columns: ["organization_id", "territory_id"]
            isOneToOne: false
            referencedRelation: "sales_territories"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      domain_events: {
        Row: {
          attempts: number
          created_at: string
          event_key: string
          event_source: string
          event_type: string
          id: string
          organization_id: string
          payload: Json
          published_at: string | null
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          event_key: string
          event_source?: string
          event_type: string
          id?: string
          organization_id: string
          payload?: Json
          published_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          event_key?: string
          event_source?: string
          event_type?: string
          id?: string
          organization_id?: string
          payload?: Json
          published_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "domain_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      external_sku_mappings: {
        Row: {
          created_at: string
          created_by: string | null
          external_sku: string
          id: string
          organization_id: string
          store_id: string | null
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          external_sku: string
          id?: string
          organization_id: string
          store_id?: string | null
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          external_sku?: string
          id?: string
          organization_id?: string
          store_id?: string | null
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_sku_mappings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_sku_mappings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_settings: {
        Row: {
          currency: string
          organization_id: string
          partner_receivable_due_days: number
          partner_receivable_installments: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          currency?: string
          organization_id: string
          partner_receivable_due_days?: number
          partner_receivable_installments?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          currency?: string
          organization_id?: string
          partner_receivable_due_days?: number
          partner_receivable_installments?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "finance_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finance_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_accounts: {
        Row: {
          account_reference: string | null
          agency: string | null
          bank_name: string | null
          created_at: string
          currency: string
          id: string
          name: string
          opening_balance_reference: number | null
          organization_id: string
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          account_reference?: string | null
          agency?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          name: string
          opening_balance_reference?: number | null
          organization_id: string
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          account_reference?: string | null
          agency?: string | null
          bank_name?: string | null
          created_at?: string
          currency?: string
          id?: string
          name?: string
          opening_balance_reference?: number | null
          organization_id?: string
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_categories: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          sort_order: number
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          sort_order?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          sort_order?: number
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_categories_organization_id_parent_id_fkey"
            columns: ["organization_id", "parent_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      financial_periods: {
        Row: {
          closed_at: string | null
          created_by: string | null
          id: string
          month: number
          opened_at: string
          organization_id: string
          status: string
          year: number
        }
        Insert: {
          closed_at?: string | null
          created_by?: string | null
          id?: string
          month: number
          opened_at?: string
          organization_id: string
          status?: string
          year: number
        }
        Update: {
          closed_at?: string | null
          created_by?: string | null
          id?: string
          month?: number
          opened_at?: string
          organization_id?: string
          status?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_periods_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_recurrence_rules: {
        Row: {
          amount: number
          company_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          day_of_month: number
          direction: string
          end_date: string | null
          financial_category_id: string | null
          frequency: string
          id: string
          name: string
          organization_id: string
          payment_method_id: string | null
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number
          direction: string
          end_date?: string | null
          financial_category_id?: string | null
          frequency?: string
          id?: string
          name: string
          organization_id: string
          payment_method_id?: string | null
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          day_of_month?: number
          direction?: string
          end_date?: string | null
          financial_category_id?: string | null
          frequency?: string
          id?: string
          name?: string
          organization_id?: string
          payment_method_id?: string | null
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_recurrence_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recurrence_rules_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_recurrence_rules_organization_id_cost_center_id_fkey"
            columns: ["organization_id", "cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_recurrence_rules_organization_id_financial_categ_fkey"
            columns: ["organization_id", "financial_category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_recurrence_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_recurrence_rules_organization_id_payment_method__fkey"
            columns: ["organization_id", "payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          company_id: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          direction: string
          financial_account_id: string
          financial_category_id: string | null
          id: string
          idempotency_key: string | null
          occurred_at: string
          operation_company_id: string | null
          organization_id: string
          payment_method_id: string | null
          reference_id: string | null
          reference_type: string | null
          reversal_of_id: string | null
          status: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          company_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction: string
          financial_account_id: string
          financial_category_id?: string | null
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          operation_company_id?: string | null
          organization_id: string
          payment_method_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of_id?: string | null
          status?: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          direction?: string
          financial_account_id?: string
          financial_category_id?: string | null
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          operation_company_id?: string | null
          organization_id?: string
          payment_method_id?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of_id?: string | null
          status?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_cost_center_id_fkey"
            columns: ["organization_id", "cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_financial_account_i_fkey"
            columns: ["organization_id", "financial_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_financial_category__fkey"
            columns: ["organization_id", "financial_category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_payment_method_id_fkey"
            columns: ["organization_id", "payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      financial_transfers: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          from_account_id: string
          id: string
          notes: string | null
          occurred_at: string
          organization_id: string
          to_account_id: string
          transfer_key: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          from_account_id: string
          id?: string
          notes?: string | null
          occurred_at?: string
          organization_id: string
          to_account_id: string
          transfer_key?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          from_account_id?: string
          id?: string
          notes?: string | null
          occurred_at?: string
          organization_id?: string
          to_account_id?: string
          transfer_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transfers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transfers_organization_id_from_account_id_fkey"
            columns: ["organization_id", "from_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "financial_transfers_organization_id_to_account_id_fkey"
            columns: ["organization_id", "to_account_id"]
            isOneToOne: false
            referencedRelation: "financial_accounts"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      forecast_adjustments: {
        Row: {
          adjustment_date: string
          created_at: string
          created_by: string
          id: string
          organization_id: string
          quantity: number
          reason: string
          variant_id: string
        }
        Insert: {
          adjustment_date: string
          created_at?: string
          created_by: string
          id?: string
          organization_id: string
          quantity: number
          reason: string
          variant_id: string
        }
        Update: {
          adjustment_date?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          quantity?: number
          reason?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "forecast_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "forecast_adjustments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "forecast_adjustments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      fulfillment_orders: {
        Row: {
          assigned_user_id: string | null
          cancel_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          fulfillment_number: string
          id: string
          organization_id: string
          planned_date: string | null
          priority: string
          sales_order_id: string
          source_location_id: string
          status: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          fulfillment_number: string
          id?: string
          organization_id: string
          planned_date?: string | null
          priority?: string
          sales_order_id: string
          source_location_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          fulfillment_number?: string
          id?: string
          organization_id?: string
          planned_date?: string | null
          priority?: string
          sales_order_id?: string
          source_location_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fulfillment_orders_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fulfillment_orders_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "fulfillment_orders_organization_id_source_location_id_fkey"
            columns: ["organization_id", "source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      goods_receipt_items: {
        Row: {
          accepted_quantity: number
          batch_id: string | null
          conversion_factor: number | null
          created_at: string
          expiration_date: string | null
          goods_receipt_id: string
          id: string
          inventory_unit_id: string | null
          line_total: number
          manufacture_date: string | null
          organization_id: string
          purchase_order_item_id: string
          purchase_unit_id: string | null
          reason: string | null
          received_quantity: number
          rejected_quantity: number
          status: string
          unit_cost: number
          variant_id: string
        }
        Insert: {
          accepted_quantity?: number
          batch_id?: string | null
          conversion_factor?: number | null
          created_at?: string
          expiration_date?: string | null
          goods_receipt_id: string
          id?: string
          inventory_unit_id?: string | null
          line_total?: number
          manufacture_date?: string | null
          organization_id: string
          purchase_order_item_id: string
          purchase_unit_id?: string | null
          reason?: string | null
          received_quantity: number
          rejected_quantity?: number
          status?: string
          unit_cost?: number
          variant_id: string
        }
        Update: {
          accepted_quantity?: number
          batch_id?: string | null
          conversion_factor?: number | null
          created_at?: string
          expiration_date?: string | null
          goods_receipt_id?: string
          id?: string
          inventory_unit_id?: string | null
          line_total?: number
          manufacture_date?: string | null
          organization_id?: string
          purchase_order_item_id?: string
          purchase_unit_id?: string | null
          reason?: string | null
          received_quantity?: number
          rejected_quantity?: number
          status?: string
          unit_cost?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipt_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_inventory_unit_id_fkey"
            columns: ["inventory_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipt_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "goods_receipt_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      goods_receipts: {
        Row: {
          created_at: string
          destination_location_id: string | null
          id: string
          notes: string | null
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          purchase_order_id: string
          receipt_number: string
          received_at: string
          received_by: string | null
          status: string
          supplier_document_number: string | null
          supplier_id: string
          total_accepted: number
          total_received: number
          total_rejected: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_location_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          posted_at?: string | null
          posted_by?: string | null
          purchase_order_id: string
          receipt_number: string
          received_at?: string
          received_by?: string | null
          status?: string
          supplier_document_number?: string | null
          supplier_id: string
          total_accepted?: number
          total_received?: number
          total_rejected?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_location_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          purchase_order_id?: string
          receipt_number?: string
          received_at?: string
          received_by?: string | null
          status?: string
          supplier_document_number?: string | null
          supplier_id?: string
          total_accepted?: number
          total_received?: number
          total_rejected?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "goods_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_batches: {
        Row: {
          batch_code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          manufactured_at: string | null
          organization_id: string
          status: Database["public"]["Enums"]["inventory_batch_status"]
          updated_at: string
          variant_id: string
        }
        Insert: {
          batch_code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          manufactured_at?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["inventory_batch_status"]
          updated_at?: string
          variant_id: string
        }
        Update: {
          batch_code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          manufactured_at?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["inventory_batch_status"]
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_batches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_batches_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
          batch_id: string | null
          counted_quantity: number | null
          created_at: string
          difference: number | null
          id: string
          inventory_count_id: string
          organization_id: string
          status: Database["public"]["Enums"]["inventory_count_item_status"]
          system_quantity: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          counted_quantity?: number | null
          created_at?: string
          difference?: number | null
          id?: string
          inventory_count_id: string
          organization_id: string
          status?: Database["public"]["Enums"]["inventory_count_item_status"]
          system_quantity?: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          counted_quantity?: number | null
          created_at?: string
          difference?: number | null
          id?: string
          inventory_count_id?: string
          organization_id?: string
          status?: Database["public"]["Enums"]["inventory_count_item_status"]
          system_quantity?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_count_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_inventory_count_id_fkey"
            columns: ["inventory_count_id"]
            isOneToOne: false
            referencedRelation: "inventory_counts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_count_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_count_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_counts: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          location_id: string
          organization_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["inventory_count_status"]
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id: string
          organization_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["inventory_count_status"]
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          location_id?: string
          organization_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["inventory_count_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_counts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_counts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_counts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_locations: {
        Row: {
          address_id: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          marketplace_store_id: string | null
          name: string
          operational_purpose: string
          organization_id: string
          partner_id: string | null
          status: Database["public"]["Enums"]["inventory_location_status"]
          type: Database["public"]["Enums"]["inventory_location_type"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_store_id?: string | null
          name: string
          operational_purpose?: string
          organization_id: string
          partner_id?: string | null
          status?: Database["public"]["Enums"]["inventory_location_status"]
          type?: Database["public"]["Enums"]["inventory_location_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_store_id?: string | null
          name?: string
          operational_purpose?: string
          organization_id?: string
          partner_id?: string | null
          status?: Database["public"]["Enums"]["inventory_location_status"]
          type?: Database["public"]["Enums"]["inventory_location_type"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_locations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_locations_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_partner_fk"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          direction: Database["public"]["Enums"]["inventory_movement_direction"]
          external_reference: string | null
          id: string
          idempotency_key: string | null
          location_id: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          occurred_at: string
          organization_id: string
          quantity: number
          reason: string | null
          reference_id: string | null
          reference_type: string | null
          reversal_of_id: string | null
          reversed_by_id: string | null
          source: string | null
          status: Database["public"]["Enums"]["inventory_movement_status"]
          unit: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          direction: Database["public"]["Enums"]["inventory_movement_direction"]
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          location_id: string
          movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          occurred_at?: string
          organization_id: string
          quantity: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of_id?: string | null
          reversed_by_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["inventory_movement_status"]
          unit?: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          direction?: Database["public"]["Enums"]["inventory_movement_direction"]
          external_reference?: string | null
          id?: string
          idempotency_key?: string | null
          location_id?: string
          movement_type?: Database["public"]["Enums"]["inventory_movement_type"]
          occurred_at?: string
          organization_id?: string
          quantity?: number
          reason?: string | null
          reference_id?: string | null
          reference_type?: string | null
          reversal_of_id?: string | null
          reversed_by_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["inventory_movement_status"]
          unit?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_reversal_of_id_fkey"
            columns: ["reversal_of_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_reversed_by_id_fkey"
            columns: ["reversed_by_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          batch_id: string | null
          consumed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          fulfilled_quantity: number
          id: string
          idempotency_key: string | null
          inventory_location_id: string
          organization_id: string
          quantity: number
          release_reason: string | null
          released_at: string | null
          released_quantity: number
          reserved_at: string
          sales_order_id: string
          sales_order_item_id: string
          status: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          fulfilled_quantity?: number
          id?: string
          idempotency_key?: string | null
          inventory_location_id: string
          organization_id: string
          quantity: number
          release_reason?: string | null
          released_at?: string | null
          released_quantity?: number
          reserved_at?: string
          sales_order_id: string
          sales_order_item_id: string
          status?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          consumed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          fulfilled_quantity?: number
          id?: string
          idempotency_key?: string | null
          inventory_location_id?: string
          organization_id?: string
          quantity?: number
          release_reason?: string | null
          released_at?: string | null
          released_quantity?: number
          reserved_at?: string
          sales_order_id?: string
          sales_order_item_id?: string
          status?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_organization_id_inventory_location__fkey"
            columns: ["organization_id", "inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_reservations_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_reservations_organization_id_sales_order_item_id_fkey"
            columns: ["organization_id", "sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_reservations_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_items: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          organization_id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          quantity?: number
          transfer_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfer_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_transfer_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          destination_location_id: string
          id: string
          idempotency_key: string | null
          notes: string | null
          organization_id: string
          request_payload: Json | null
          requested_at: string
          requested_by: string | null
          source_location_id: string
          status: Database["public"]["Enums"]["inventory_transfer_status"]
          transfer_type: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          destination_location_id: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          organization_id: string
          request_payload?: Json | null
          requested_at?: string
          requested_by?: string | null
          source_location_id: string
          status?: Database["public"]["Enums"]["inventory_transfer_status"]
          transfer_type?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          destination_location_id?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          organization_id?: string
          request_payload?: Json | null
          requested_at?: string
          requested_by?: string | null
          source_location_id?: string
          status?: Database["public"]["Enums"]["inventory_transfer_status"]
          transfer_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_transfers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_transfers_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
        ]
      }
      invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      labor_rates: {
        Row: {
          activity: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          hourly_cost: number
          id: string
          organization_id: string
          reason: string
          status: string
          version: number
        }
        Insert: {
          activity: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          hourly_cost: number
          id?: string
          organization_id: string
          reason: string
          status?: string
          version: number
        }
        Update: {
          activity?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          hourly_cost?: number
          id?: string
          organization_id?: string
          reason?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "labor_rates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "labor_rates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          acquisition_source_id: string | null
          assigned_user_id: string | null
          commercial_segment_id: string | null
          company_id: string | null
          company_name: string | null
          converted_at: string | null
          created_at: string
          created_by: string | null
          disqualification_reason_id: string | null
          email: string | null
          id: string
          marketing_opt_in: boolean
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          processing_purpose: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acquisition_source_id?: string | null
          assigned_user_id?: string | null
          commercial_segment_id?: string | null
          company_id?: string | null
          company_name?: string | null
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          disqualification_reason_id?: string | null
          email?: string | null
          id?: string
          marketing_opt_in?: boolean
          name: string
          notes?: string | null
          organization_id: string
          phone?: string | null
          processing_purpose?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acquisition_source_id?: string | null
          assigned_user_id?: string | null
          commercial_segment_id?: string | null
          company_id?: string | null
          company_name?: string | null
          converted_at?: string | null
          created_at?: string
          created_by?: string | null
          disqualification_reason_id?: string | null
          email?: string | null
          id?: string
          marketing_opt_in?: boolean
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          processing_purpose?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_organization_id_acquisition_source_id_fkey"
            columns: ["organization_id", "acquisition_source_id"]
            isOneToOne: false
            referencedRelation: "commercial_sources"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "leads_organization_id_commercial_segment_id_fkey"
            columns: ["organization_id", "commercial_segment_id"]
            isOneToOne: false
            referencedRelation: "commercial_segments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "leads_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "leads_organization_id_disqualification_reason_id_fkey"
            columns: ["organization_id", "disqualification_reason_id"]
            isOneToOne: false
            referencedRelation: "commercial_reasons"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      logistics_exceptions: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_return_id: string | null
          details: Json
          exception_type: string
          fulfillment_order_id: string | null
          id: string
          message: string
          organization_id: string
          picking_task_id: string | null
          reservation_id: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          sales_order_id: string | null
          sales_order_item_id: string | null
          severity: string
          shipment_id: string | null
          status: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_return_id?: string | null
          details?: Json
          exception_type: string
          fulfillment_order_id?: string | null
          id?: string
          message: string
          organization_id: string
          picking_task_id?: string | null
          reservation_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          severity?: string
          shipment_id?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_return_id?: string | null
          details?: Json
          exception_type?: string
          fulfillment_order_id?: string | null
          id?: string
          message?: string
          organization_id?: string
          picking_task_id?: string | null
          reservation_id?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sales_order_id?: string | null
          sales_order_item_id?: string | null
          severity?: string
          shipment_id?: string | null
          status?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "logistics_exceptions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_exceptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_exceptions_organization_id_customer_return_id_fkey"
            columns: ["organization_id", "customer_return_id"]
            isOneToOne: false
            referencedRelation: "customer_returns"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "logistics_exceptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_exceptions_organization_id_fulfillment_order_id_fkey"
            columns: ["organization_id", "fulfillment_order_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "logistics_exceptions_organization_id_picking_task_id_fkey"
            columns: ["organization_id", "picking_task_id"]
            isOneToOne: false
            referencedRelation: "picking_tasks"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "logistics_exceptions_organization_id_reservation_id_fkey"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "logistics_exceptions_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "logistics_exceptions_organization_id_shipment_id_fkey"
            columns: ["organization_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "logistics_exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "logistics_exceptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "logistics_exceptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_import_rows: {
        Row: {
          error_message: string | null
          id: string
          import_id: string
          marketplace_sale_id: string | null
          organization_id: string
          raw_data: Json
          row_number: number
          status: string
        }
        Insert: {
          error_message?: string | null
          id?: string
          import_id: string
          marketplace_sale_id?: string | null
          organization_id: string
          raw_data?: Json
          row_number: number
          status?: string
        }
        Update: {
          error_message?: string | null
          id?: string
          import_id?: string
          marketplace_sale_id?: string | null
          organization_id?: string
          raw_data?: Json
          row_number?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_import_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_import_rows_organization_id_import_id_fkey"
            columns: ["organization_id", "import_id"]
            isOneToOne: false
            referencedRelation: "marketplace_imports"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      marketplace_imports: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          id: string
          invalid_rows: number
          notes: string | null
          organization_id: string
          provider: string
          status: string
          total_rows: number
          updated_at: string
          valid_rows: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          invalid_rows?: number
          notes?: string | null
          organization_id: string
          provider: string
          status?: string
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          id?: string
          invalid_rows?: number
          notes?: string | null
          organization_id?: string
          provider?: string
          status?: string
          total_rows?: number
          updated_at?: string
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_imports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_sales: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          discount_amount: number
          external_event_id: string | null
          external_order_id: string
          external_sku: string
          gross_amount: number
          id: string
          import_id: string | null
          import_key: string | null
          organization_id: string
          platform_fee: number
          quantity: number
          reconciliation_item_id: string | null
          sale_date: string
          shipping_fee: number
          source: string
          status: string
          store_id: string
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          external_event_id?: string | null
          external_order_id: string
          external_sku: string
          gross_amount?: number
          id?: string
          import_id?: string | null
          import_key?: string | null
          organization_id: string
          platform_fee?: number
          quantity: number
          reconciliation_item_id?: string | null
          sale_date: string
          shipping_fee?: number
          source?: string
          status?: string
          store_id: string
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          discount_amount?: number
          external_event_id?: string | null
          external_order_id?: string
          external_sku?: string
          gross_amount?: number
          id?: string
          import_id?: string | null
          import_key?: string | null
          organization_id?: string
          platform_fee?: number
          quantity?: number
          reconciliation_item_id?: string | null
          sale_date?: string
          shipping_fee?: number
          source?: string
          status?: string
          store_id?: string
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_sales_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_sales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_sales_organization_id_store_id_fkey"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "marketplace_stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      marketplace_stores: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          id: string
          marketplace: string
          marketplace_store_id: string | null
          name: string
          notes: string | null
          organization_id: string
          ownership_type: string
          partner_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace?: string
          marketplace_store_id?: string | null
          name: string
          notes?: string | null
          organization_id: string
          ownership_type?: string
          partner_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace?: string
          marketplace_store_id?: string | null
          name?: string
          notes?: string | null
          organization_id?: string
          ownership_type?: string
          partner_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_stores_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_stores_organization_id_partner_id_fkey"
            columns: ["organization_id", "partner_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "marketplace_stores_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      material_cost_versions: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          organization_id: string
          source_reference: string
          source_type: string
          status: string
          unit_cost: number
          unit_of_measure_id: string
          variant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          organization_id: string
          source_reference: string
          source_type?: string
          status?: string
          unit_cost: number
          unit_of_measure_id: string
          variant_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          organization_id?: string
          source_reference?: string
          source_type?: string
          status?: string
          unit_cost?: number
          unit_of_measure_id?: string
          variant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_cost_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_cost_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_cost_versions_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_cost_versions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "material_cost_versions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requirements: {
        Row: {
          available_quantity: number
          block_reason: string | null
          calculation: Json
          created_at: string
          id: string
          lead_time_days: number | null
          net_requirement: number
          organization_id: string
          parent_planned_order_id: string | null
          planning_quantity: number
          planning_run_id: string
          required_date: string
          required_quantity: number
          scheduled_receipt_quantity: number
          source_kind: string
          suggested_order_date: string | null
          unit_of_measure_id: string | null
          variant_id: string
        }
        Insert: {
          available_quantity?: number
          block_reason?: string | null
          calculation?: Json
          created_at?: string
          id?: string
          lead_time_days?: number | null
          net_requirement?: number
          organization_id: string
          parent_planned_order_id?: string | null
          planning_quantity?: number
          planning_run_id: string
          required_date: string
          required_quantity?: number
          scheduled_receipt_quantity?: number
          source_kind: string
          suggested_order_date?: string | null
          unit_of_measure_id?: string | null
          variant_id: string
        }
        Update: {
          available_quantity?: number
          block_reason?: string | null
          calculation?: Json
          created_at?: string
          id?: string
          lead_time_days?: number | null
          net_requirement?: number
          organization_id?: string
          parent_planned_order_id?: string | null
          planning_quantity?: number
          planning_run_id?: string
          required_date?: string
          required_quantity?: number
          scheduled_receipt_quantity?: number
          source_kind?: string
          suggested_order_date?: string | null
          unit_of_measure_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "material_requirements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_parent_planned_order_id_fkey"
            columns: ["parent_planned_order_id"]
            isOneToOne: false
            referencedRelation: "planned_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_planning_run_id_fkey"
            columns: ["planning_run_id"]
            isOneToOne: false
            referencedRelation: "planning_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requirements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "material_requirements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_items: {
        Row: {
          created_at: string
          created_by: string | null
          estimated_quantity: number
          estimated_total: number | null
          estimated_unit_price: number
          id: string
          notes: string | null
          opportunity_id: string
          organization_id: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          estimated_quantity: number
          estimated_total?: number | null
          estimated_unit_price: number
          id?: string
          notes?: string | null
          opportunity_id: string
          organization_id: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          estimated_quantity?: number
          estimated_total?: number | null
          estimated_unit_price?: number
          id?: string
          notes?: string | null
          opportunity_id?: string
          organization_id?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_items_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "opportunity_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "opportunity_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_stage_history: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          new_stage: Json
          opportunity_id: string
          organization_id: string
          previous_stage: Json | null
          reason: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_stage: Json
          opportunity_id: string
          organization_id: string
          previous_stage?: Json | null
          reason?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          new_stage?: Json
          opportunity_id?: string
          organization_id?: string
          previous_stage?: Json | null
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_stage_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_stage_history_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      organization_inventory_settings: {
        Row: {
          allow_negative_inventory: boolean
          created_at: string
          id: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_negative_inventory?: boolean
          created_at?: string
          id?: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_negative_inventory?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_inventory_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_inventory_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
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
        ]
      }
      organizations: {
        Row: {
          created_at: string
          created_by: string
          document: string | null
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          document?: string | null
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          document?: string | null
          id?: string
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      overhead_rules: {
        Row: {
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          financial_category_id: string | null
          id: string
          method: string
          name: string
          organization_id: string
          rate: number
          reason: string
          status: string
          version: number
        }
        Insert: {
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          financial_category_id?: string | null
          id?: string
          method: string
          name: string
          organization_id: string
          rate: number
          reason: string
          status?: string
          version: number
        }
        Update: {
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          financial_category_id?: string | null
          id?: string
          method?: string
          name?: string
          organization_id?: string
          rate?: number
          reason?: string
          status?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "overhead_rules_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overhead_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overhead_rules_financial_category_id_fkey"
            columns: ["financial_category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overhead_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_record_items: {
        Row: {
          batch_id: string | null
          id: string
          organization_id: string
          packing_record_id: string
          quantity: number
          sales_order_item_id: string | null
          sku_snapshot: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          id?: string
          organization_id: string
          packing_record_id: string
          quantity: number
          sales_order_item_id?: string | null
          sku_snapshot: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          id?: string
          organization_id?: string
          packing_record_id?: string
          quantity?: number
          sales_order_item_id?: string | null
          sku_snapshot?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "packing_record_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_record_items_organization_id_packing_record_id_fkey"
            columns: ["organization_id", "packing_record_id"]
            isOneToOne: false
            referencedRelation: "packing_records"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "packing_record_items_organization_id_sales_order_item_id_fkey"
            columns: ["organization_id", "sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "packing_record_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "packing_record_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      packing_record_volumes: {
        Row: {
          gross_weight_kg: number | null
          height_cm: number | null
          id: string
          length_cm: number | null
          notes: string | null
          organization_id: string
          packing_record_id: string
          volume_number: string
          weight_informed: boolean
          width_cm: number | null
        }
        Insert: {
          gross_weight_kg?: number | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          notes?: string | null
          organization_id: string
          packing_record_id: string
          volume_number: string
          weight_informed?: boolean
          width_cm?: number | null
        }
        Update: {
          gross_weight_kg?: number | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          notes?: string | null
          organization_id?: string
          packing_record_id?: string
          volume_number?: string
          weight_informed?: boolean
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_record_volumes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_record_volumes_organization_id_packing_record_id_fkey"
            columns: ["organization_id", "packing_record_id"]
            isOneToOne: false
            referencedRelation: "packing_records"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      packing_records: {
        Row: {
          created_at: string
          created_by: string | null
          fulfillment_order_id: string
          gross_weight_kg: number | null
          height_cm: number | null
          id: string
          length_cm: number | null
          notes: string | null
          organization_id: string
          packed_at: string
          packed_by: string | null
          sales_order_id: string
          updated_at: string
          volume_count: number
          weight_informed: boolean
          width_cm: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fulfillment_order_id: string
          gross_weight_kg?: number | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          notes?: string | null
          organization_id: string
          packed_at?: string
          packed_by?: string | null
          sales_order_id: string
          updated_at?: string
          volume_count?: number
          weight_informed?: boolean
          width_cm?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fulfillment_order_id?: string
          gross_weight_kg?: number | null
          height_cm?: number | null
          id?: string
          length_cm?: number | null
          notes?: string | null
          organization_id?: string
          packed_at?: string
          packed_by?: string | null
          sales_order_id?: string
          updated_at?: string
          volume_count?: number
          weight_informed?: boolean
          width_cm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "packing_records_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "packing_records_organization_id_fulfillment_order_id_fkey"
            columns: ["organization_id", "fulfillment_order_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "packing_records_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "packing_records_packed_by_fkey"
            columns: ["packed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_price_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          organization_id: string
          partner_id: string
          price_table_id: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          partner_id: string
          price_table_id: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          partner_id?: string
          price_table_id?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_price_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_price_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_price_links_organization_id_partner_id_fkey"
            columns: ["organization_id", "partner_id"]
            isOneToOne: true
            referencedRelation: "partner_profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_price_links_organization_id_price_table_id_fkey"
            columns: ["organization_id", "price_table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      partner_profiles: {
        Row: {
          company_id: string
          created_at: string
          default_inventory_location_id: string | null
          id: string
          notes: string | null
          operational_status: string
          organization_id: string
          partner_code: string
          settlement_frequency: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          default_inventory_location_id?: string | null
          id?: string
          notes?: string | null
          operational_status?: string
          organization_id: string
          partner_code: string
          settlement_frequency?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          default_inventory_location_id?: string | null
          id?: string
          notes?: string | null
          operational_status?: string
          organization_id?: string
          partner_code?: string
          settlement_frequency?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_profiles_default_inventory_location_id_fkey"
            columns: ["default_inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_profiles_default_inventory_location_id_fkey"
            columns: ["default_inventory_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "partner_profiles_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_reconciliation_adjustments: {
        Row: {
          adjustment_type: string
          amount: number
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          reason: string
          reconciliation_id: string
          updated_at: string
        }
        Insert: {
          adjustment_type: string
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          reason: string
          reconciliation_id: string
          updated_at?: string
        }
        Update: {
          adjustment_type?: string
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          reason?: string
          reconciliation_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_reconciliation_adjust_organization_id_reconciliati_fkey"
            columns: ["organization_id", "reconciliation_id"]
            isOneToOne: false
            referencedRelation: "partner_reconciliations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_reconciliation_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_reconciliation_adjustments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_reconciliation_items: {
        Row: {
          billable_amount: number | null
          created_at: string
          error_message: string | null
          exception_status: string | null
          gross_amount: number
          id: string
          inventory_effect_status: string
          inventory_movement_id: string | null
          marketplace_sale_id: string
          organization_id: string
          partner_id: string
          price_snapshot: Json | null
          quantity: number
          reconciliation_id: string
          reversed_movement_id: string | null
          status: string
          store_id: string
          unit_reference_value: number | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          billable_amount?: number | null
          created_at?: string
          error_message?: string | null
          exception_status?: string | null
          gross_amount?: number
          id?: string
          inventory_effect_status?: string
          inventory_movement_id?: string | null
          marketplace_sale_id: string
          organization_id: string
          partner_id: string
          price_snapshot?: Json | null
          quantity: number
          reconciliation_id: string
          reversed_movement_id?: string | null
          status?: string
          store_id: string
          unit_reference_value?: number | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          billable_amount?: number | null
          created_at?: string
          error_message?: string | null
          exception_status?: string | null
          gross_amount?: number
          id?: string
          inventory_effect_status?: string
          inventory_movement_id?: string | null
          marketplace_sale_id?: string
          organization_id?: string
          partner_id?: string
          price_snapshot?: Json | null
          quantity?: number
          reconciliation_id?: string
          reversed_movement_id?: string | null
          status?: string
          store_id?: string
          unit_reference_value?: number | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_reconciliation_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_reconciliation_items_organization_id_partner_id_fkey"
            columns: ["organization_id", "partner_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_reconciliation_items_organization_id_reconciliatio_fkey"
            columns: ["organization_id", "reconciliation_id"]
            isOneToOne: false
            referencedRelation: "partner_reconciliations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_reconciliation_items_organization_id_store_id_fkey"
            columns: ["organization_id", "store_id"]
            isOneToOne: false
            referencedRelation: "marketplace_stores"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      partner_reconciliations: {
        Row: {
          billable_amount: number
          closed_at: string | null
          closed_by: string | null
          created_at: string
          created_by: string | null
          cutoff_at: string | null
          exceptions_count: number
          frequency: string
          gross_amount: number
          id: string
          notes: string | null
          organization_id: string
          partner_id: string
          period_end: string
          period_start: string
          reopened_at: string | null
          reopened_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          sales_count: number
          snapshot: Json | null
          status: string
          units_sold: number
          updated_at: string
        }
        Insert: {
          billable_amount?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_at?: string | null
          exceptions_count?: number
          frequency?: string
          gross_amount?: number
          id?: string
          notes?: string | null
          organization_id: string
          partner_id: string
          period_end: string
          period_start: string
          reopened_at?: string | null
          reopened_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_count?: number
          snapshot?: Json | null
          status?: string
          units_sold?: number
          updated_at?: string
        }
        Update: {
          billable_amount?: number
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          created_by?: string | null
          cutoff_at?: string | null
          exceptions_count?: number
          frequency?: string
          gross_amount?: number
          id?: string
          notes?: string | null
          organization_id?: string
          partner_id?: string
          period_end?: string
          period_start?: string
          reopened_at?: string | null
          reopened_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          sales_count?: number
          snapshot?: Json | null
          status?: string
          units_sold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_reconciliations_closed_by_fkey"
            columns: ["closed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_reconciliations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_reconciliations_organization_id_partner_id_fkey"
            columns: ["organization_id", "partner_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_reconciliations_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_reconciliations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_return_items: {
        Row: {
          batch_id: string | null
          condition: string
          id: string
          notes: string | null
          organization_id: string
          quantity: number
          reason: string
          return_id: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          condition: string
          id?: string
          notes?: string | null
          organization_id: string
          quantity: number
          reason: string
          return_id: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          condition?: string
          id?: string
          notes?: string | null
          organization_id?: string
          quantity?: number
          reason?: string
          return_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_return_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_return_items_organization_id_return_id_fkey"
            columns: ["organization_id", "return_id"]
            isOneToOne: false
            referencedRelation: "partner_returns"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "partner_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_returns: {
        Row: {
          created_at: string
          created_by: string | null
          destination_location_id: string
          id: string
          notes: string | null
          organization_id: string
          partner_id: string
          received_at: string | null
          return_date: string
          return_number: string
          shipment_id: string | null
          source_location_id: string
          status: string
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          destination_location_id: string
          id?: string
          notes?: string | null
          organization_id: string
          partner_id: string
          received_at?: string | null
          return_date?: string
          return_number: string
          shipment_id?: string | null
          source_location_id: string
          status?: string
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          destination_location_id?: string
          id?: string
          notes?: string | null
          organization_id?: string
          partner_id?: string
          received_at?: string | null
          return_date?: string
          return_number?: string
          shipment_id?: string | null
          source_location_id?: string
          status?: string
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_returns_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_returns_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "partner_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_returns_organization_id_partner_id_fkey"
            columns: ["organization_id", "partner_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_returns_organization_id_shipment_id_fkey"
            columns: ["organization_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "partner_shipments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_returns_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_returns_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "partner_returns_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_shipment_items: {
        Row: {
          batch_id: string | null
          id: string
          notes: string | null
          organization_id: string
          picked_quantity: number
          quantity: number
          shipment_id: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          picked_quantity?: number
          quantity: number
          shipment_id: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          picked_quantity?: number
          quantity?: number
          shipment_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_shipment_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_shipment_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_shipment_items_organization_id_shipment_id_fkey"
            columns: ["organization_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "partner_shipments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_shipment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "partner_shipment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_shipments: {
        Row: {
          approved_by: string | null
          carrier_name: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          destination_location_id: string
          expected_delivery_date: string | null
          id: string
          notes: string | null
          organization_id: string
          partner_id: string
          received_by: string | null
          shipment_date: string
          shipment_number: string
          shipped_at: string | null
          source_location_id: string
          status: string
          tracking_code: string | null
          transfer_id: string | null
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          carrier_name?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          destination_location_id: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          partner_id: string
          received_by?: string | null
          shipment_date?: string
          shipment_number: string
          shipped_at?: string | null
          source_location_id: string
          status?: string
          tracking_code?: string | null
          transfer_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          carrier_name?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          destination_location_id?: string
          expected_delivery_date?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          partner_id?: string
          received_by?: string | null
          shipment_date?: string
          shipment_number?: string
          shipped_at?: string | null
          source_location_id?: string
          status?: string
          tracking_code?: string | null
          transfer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_shipments_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_shipments_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_shipments_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "partner_shipments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_shipments_organization_id_partner_id_fkey"
            columns: ["organization_id", "partner_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "partner_shipments_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_shipments_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "partner_shipments_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "inventory_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      payable_settlements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          discount_amount: number
          financial_transaction_id: string
          id: string
          interest_amount: number
          is_reversal: boolean
          organization_id: string
          payable_id: string
          penalty_amount: number
          reversal_of_id: string | null
          settled_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          financial_transaction_id: string
          id?: string
          interest_amount?: number
          is_reversal?: boolean
          organization_id: string
          payable_id: string
          penalty_amount?: number
          reversal_of_id?: string | null
          settled_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          financial_transaction_id?: string
          id?: string
          interest_amount?: number
          is_reversal?: boolean
          organization_id?: string
          payable_id?: string
          penalty_amount?: number
          reversal_of_id?: string | null
          settled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payable_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payable_settlements_organization_id_financial_transaction__fkey"
            columns: ["organization_id", "financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "payable_settlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payable_settlements_organization_id_payable_id_fkey"
            columns: ["organization_id", "payable_id"]
            isOneToOne: false
            referencedRelation: "account_payables"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_task_items: {
        Row: {
          barcode_snapshot: string | null
          batch_id: string | null
          confirmed_quantity: number
          created_at: string
          description_snapshot: string
          difference_reason: string | null
          id: string
          location_id: string | null
          notes: string | null
          organization_id: string
          picked_quantity: number
          picking_task_id: string
          requested_quantity: number
          reserved_quantity: number
          sales_order_item_id: string
          sku_snapshot: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          barcode_snapshot?: string | null
          batch_id?: string | null
          confirmed_quantity?: number
          created_at?: string
          description_snapshot: string
          difference_reason?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          organization_id: string
          picked_quantity?: number
          picking_task_id: string
          requested_quantity: number
          reserved_quantity?: number
          sales_order_item_id: string
          sku_snapshot: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          barcode_snapshot?: string | null
          batch_id?: string | null
          confirmed_quantity?: number
          created_at?: string
          description_snapshot?: string
          difference_reason?: string | null
          id?: string
          location_id?: string | null
          notes?: string | null
          organization_id?: string
          picked_quantity?: number
          picking_task_id?: string
          requested_quantity?: number
          reserved_quantity?: number
          sales_order_item_id?: string
          sku_snapshot?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_task_items_organization_id_batch_id_fkey"
            columns: ["organization_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "picking_task_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_task_items_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "picking_task_items_organization_id_picking_task_id_fkey"
            columns: ["organization_id", "picking_task_id"]
            isOneToOne: false
            referencedRelation: "picking_tasks"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "picking_task_items_organization_id_sales_order_item_id_fkey"
            columns: ["organization_id", "sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "picking_task_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "picking_task_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      picking_tasks: {
        Row: {
          assigned_user_id: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          fulfillment_order_id: string
          id: string
          location_id: string | null
          notes: string | null
          organization_id: string
          picked_at: string | null
          sales_order_id: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          assigned_user_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          fulfillment_order_id: string
          id?: string
          location_id?: string | null
          notes?: string | null
          organization_id: string
          picked_at?: string | null
          sales_order_id: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          assigned_user_id?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          fulfillment_order_id?: string
          id?: string
          location_id?: string | null
          notes?: string | null
          organization_id?: string
          picked_at?: string | null
          sales_order_id?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "picking_tasks_assigned_user_id_fkey"
            columns: ["assigned_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_tasks_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picking_tasks_organization_id_fulfillment_order_id_fkey"
            columns: ["organization_id", "fulfillment_order_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "picking_tasks_organization_id_location_id_fkey"
            columns: ["organization_id", "location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "picking_tasks_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      planned_orders: {
        Row: {
          bom_id: string | null
          converted_ids: string[]
          converted_qty: number
          converted_source: string | null
          created_at: string
          id: string
          moq_applied: boolean
          moq_value: number | null
          order_multiple: number | null
          order_type: string
          organization_id: string
          planning_run_id: string
          priority: string
          quantity: number
          reason: string
          required_date: string
          scenario_id: string | null
          simulated: boolean
          status: string
          suggested_order_date: string | null
          suggested_start_date: string | null
          suggested_supplier_id: string | null
          unit_of_measure_id: string | null
          variant_id: string
          why: Json
        }
        Insert: {
          bom_id?: string | null
          converted_ids?: string[]
          converted_qty?: number
          converted_source?: string | null
          created_at?: string
          id?: string
          moq_applied?: boolean
          moq_value?: number | null
          order_multiple?: number | null
          order_type: string
          organization_id: string
          planning_run_id: string
          priority?: string
          quantity: number
          reason: string
          required_date: string
          scenario_id?: string | null
          simulated?: boolean
          status?: string
          suggested_order_date?: string | null
          suggested_start_date?: string | null
          suggested_supplier_id?: string | null
          unit_of_measure_id?: string | null
          variant_id: string
          why?: Json
        }
        Update: {
          bom_id?: string | null
          converted_ids?: string[]
          converted_qty?: number
          converted_source?: string | null
          created_at?: string
          id?: string
          moq_applied?: boolean
          moq_value?: number | null
          order_multiple?: number | null
          order_type?: string
          organization_id?: string
          planning_run_id?: string
          priority?: string
          quantity?: number
          reason?: string
          required_date?: string
          scenario_id?: string | null
          simulated?: boolean
          status?: string
          suggested_order_date?: string | null
          suggested_start_date?: string | null
          suggested_supplier_id?: string | null
          unit_of_measure_id?: string | null
          variant_id?: string
          why?: Json
        }
        Relationships: [
          {
            foreignKeyName: "planned_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_orders_planning_run_id_fkey"
            columns: ["planning_run_id"]
            isOneToOne: false
            referencedRelation: "planning_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_orders_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "planning_scenarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_orders_suggested_supplier_id_fkey"
            columns: ["suggested_supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_orders_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_orders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "planned_orders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_availability: {
        Row: {
          created_at: string
          id: string
          include_in_planning: boolean
          location_id: string
          notes: string | null
          organization_id: string
          safety_stock: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          include_in_planning?: boolean
          location_id: string
          notes?: string | null
          organization_id: string
          safety_stock?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          include_in_planning?: boolean
          location_id?: string
          notes?: string | null
          organization_id?: string
          safety_stock?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_availability_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_availability_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "planning_availability_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_conversions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          idempotency_key: string
          organization_id: string
          planned_order_id: string
          planning_run_id: string
          quantity: number
          request_payload: Json
          source_id: string
          source_type: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          idempotency_key: string
          organization_id: string
          planned_order_id: string
          planning_run_id: string
          quantity: number
          request_payload: Json
          source_id: string
          source_type: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          idempotency_key?: string
          organization_id?: string
          planned_order_id?: string
          planning_run_id?: string
          quantity?: number
          request_payload?: Json
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_conversions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_conversions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_conversions_planned_order_id_fkey"
            columns: ["planned_order_id"]
            isOneToOne: false
            referencedRelation: "planned_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_conversions_planning_run_id_fkey"
            columns: ["planning_run_id"]
            isOneToOne: false
            referencedRelation: "planning_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_exceptions: {
        Row: {
          context: Json
          created_at: string
          exception_type: string
          id: string
          message: string
          organization_id: string
          planning_run_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          variant_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          exception_type: string
          id?: string
          message: string
          organization_id: string
          planning_run_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          status?: string
          variant_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          exception_type?: string
          id?: string
          message?: string
          organization_id?: string
          planning_run_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "planning_exceptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_exceptions_planning_run_id_fkey"
            columns: ["planning_run_id"]
            isOneToOne: false
            referencedRelation: "planning_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_exceptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "planning_exceptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_item_snapshots: {
        Row: {
          daily_demand: number | null
          days_of_cover: number | null
          id: string
          item_type: string
          last_movement_at: string | null
          last_sale_date: string | null
          opening_quantity: number
          organization_id: string
          parameters: Json
          partner_quantity: number
          planning_run_id: string
          product_name: string
          sku: string
          transit_quantity: number
          unit_of_measure_id: string | null
          variant_id: string
        }
        Insert: {
          daily_demand?: number | null
          days_of_cover?: number | null
          id?: string
          item_type: string
          last_movement_at?: string | null
          last_sale_date?: string | null
          opening_quantity: number
          organization_id: string
          parameters: Json
          partner_quantity: number
          planning_run_id: string
          product_name: string
          sku: string
          transit_quantity: number
          unit_of_measure_id?: string | null
          variant_id: string
        }
        Update: {
          daily_demand?: number | null
          days_of_cover?: number | null
          id?: string
          item_type?: string
          last_movement_at?: string | null
          last_sale_date?: string | null
          opening_quantity?: number
          organization_id?: string
          parameters?: Json
          partner_quantity?: number
          planning_run_id?: string
          product_name?: string
          sku?: string
          transit_quantity?: number
          unit_of_measure_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_item_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_item_snapshots_planning_run_id_fkey"
            columns: ["planning_run_id"]
            isOneToOne: false
            referencedRelation: "planning_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_item_snapshots_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_item_snapshots_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "planning_item_snapshots_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_projections: {
        Row: {
          base_forecast: number
          bucket_date: string
          demand: number
          dependent_demand: number
          excess_quantity: number | null
          id: string
          manual_adjustment: number
          opening_quantity: number
          organization_id: string
          planned_receipts: number
          planning_run_id: string
          projected_quantity: number
          projected_without_plans: number
          safety_stock: number
          scheduled_receipts: number
          target_stock: number | null
          variant_id: string
        }
        Insert: {
          base_forecast: number
          bucket_date: string
          demand: number
          dependent_demand: number
          excess_quantity?: number | null
          id?: string
          manual_adjustment: number
          opening_quantity: number
          organization_id: string
          planned_receipts: number
          planning_run_id: string
          projected_quantity: number
          projected_without_plans: number
          safety_stock: number
          scheduled_receipts: number
          target_stock?: number | null
          variant_id: string
        }
        Update: {
          base_forecast?: number
          bucket_date?: string
          demand?: number
          dependent_demand?: number
          excess_quantity?: number | null
          id?: string
          manual_adjustment?: number
          opening_quantity?: number
          organization_id?: string
          planned_receipts?: number
          planning_run_id?: string
          projected_quantity?: number
          projected_without_plans?: number
          safety_stock?: number
          scheduled_receipts?: number
          target_stock?: number | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_projections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_projections_planning_run_id_fkey"
            columns: ["planning_run_id"]
            isOneToOne: false
            referencedRelation: "planning_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_projections_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "planning_projections_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          demand_sources: Json
          error: string | null
          horizon_end: string
          horizon_start: string
          id: string
          name: string
          organization_id: string
          parameters_snapshot: Json
          planning_date: string
          planning_method: string
          request_key: string | null
          request_payload: Json
          scenario_id: string | null
          simulated: boolean
          started_at: string | null
          status: string
          summary: Json
          time_bucket: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          demand_sources?: Json
          error?: string | null
          horizon_end: string
          horizon_start: string
          id?: string
          name: string
          organization_id: string
          parameters_snapshot?: Json
          planning_date: string
          planning_method?: string
          request_key?: string | null
          request_payload?: Json
          scenario_id?: string | null
          simulated?: boolean
          started_at?: string | null
          status?: string
          summary?: Json
          time_bucket?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          demand_sources?: Json
          error?: string | null
          horizon_end?: string
          horizon_start?: string
          id?: string
          name?: string
          organization_id?: string
          parameters_snapshot?: Json
          planning_date?: string
          planning_method?: string
          request_key?: string | null
          request_payload?: Json
          scenario_id?: string | null
          simulated?: boolean
          started_at?: string | null
          status?: string
          summary?: Json
          time_bucket?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_runs_scenario_id_fkey"
            columns: ["scenario_id"]
            isOneToOne: false
            referencedRelation: "planning_scenarios"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_scenarios: {
        Row: {
          created_at: string
          created_by: string | null
          demand_multiplier: number
          description: string | null
          horizon_days: number | null
          id: string
          is_base: boolean
          lead_time_adjustment_days: number
          name: string
          organization_id: string
          safety_stock_multiplier: number
          scenario_type: string
          target_stock_multiplier: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          demand_multiplier?: number
          description?: string | null
          horizon_days?: number | null
          id?: string
          is_base?: boolean
          lead_time_adjustment_days?: number
          name: string
          organization_id: string
          safety_stock_multiplier?: number
          scenario_type?: string
          target_stock_multiplier?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          demand_multiplier?: number
          description?: string | null
          horizon_days?: number | null
          id?: string
          is_base?: boolean
          lead_time_adjustment_days?: number
          name?: string
          organization_id?: string
          safety_stock_multiplier?: number
          scenario_type?: string
          target_stock_multiplier?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_scenarios_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_scenarios_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_settings: {
        Row: {
          created_at: string
          demand_priority: Json
          demand_sources: Json
          forecast_method: string
          history_days: number
          id: string
          lead_time_overrides: Json
          lead_time_policy: string
          max_planned_orders: number
          min_history_days: number
          minimum_stock_demand: boolean
          organization_id: string
          production_lead_time_default: number | null
          projection_days: number
          purchase_lead_time_default: number | null
          time_bucket: string
          updated_at: string
          updated_by: string | null
          weighted_weights: Json
        }
        Insert: {
          created_at?: string
          demand_priority?: Json
          demand_sources?: Json
          forecast_method?: string
          history_days?: number
          id?: string
          lead_time_overrides?: Json
          lead_time_policy?: string
          max_planned_orders?: number
          min_history_days?: number
          minimum_stock_demand?: boolean
          organization_id: string
          production_lead_time_default?: number | null
          projection_days?: number
          purchase_lead_time_default?: number | null
          time_bucket?: string
          updated_at?: string
          updated_by?: string | null
          weighted_weights?: Json
        }
        Update: {
          created_at?: string
          demand_priority?: Json
          demand_sources?: Json
          forecast_method?: string
          history_days?: number
          id?: string
          lead_time_overrides?: Json
          lead_time_policy?: string
          max_planned_orders?: number
          min_history_days?: number
          minimum_stock_demand?: boolean
          organization_id?: string
          production_lead_time_default?: number | null
          projection_days?: number
          purchase_lead_time_default?: number | null
          time_bucket?: string
          updated_at?: string
          updated_by?: string | null
          weighted_weights?: Json
        }
        Relationships: [
          {
            foreignKeyName: "planning_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      planning_source_facts: {
        Row: {
          context: Json
          id: string
          organization_id: string
          planning_run_id: string
          quantity: number
          required_date: string
          source_id: string
          source_type: string
          variant_id: string
        }
        Insert: {
          context?: Json
          id?: string
          organization_id: string
          planning_run_id: string
          quantity: number
          required_date: string
          source_id: string
          source_type: string
          variant_id: string
        }
        Update: {
          context?: Json
          id?: string
          organization_id?: string
          planning_run_id?: string
          quantity?: number
          required_date?: string
          source_id?: string
          source_type?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "planning_source_facts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_source_facts_planning_run_id_fkey"
            columns: ["planning_run_id"]
            isOneToOne: false
            referencedRelation: "planning_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planning_source_facts_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "planning_source_facts_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_table_items: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          id: string
          minimum_price: number | null
          organization_id: string
          price_table_id: string
          status: string
          unit_price: number
          valid_from: string
          valid_to: string | null
          variant_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          minimum_price?: number | null
          organization_id: string
          price_table_id: string
          status?: string
          unit_price: number
          valid_from?: string
          valid_to?: string | null
          variant_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          id?: string
          minimum_price?: number | null
          organization_id?: string
          price_table_id?: string
          status?: string
          unit_price?: number
          valid_from?: string
          valid_to?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_table_items_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_table_items_organization_id_price_table_id_fkey"
            columns: ["organization_id", "price_table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      price_tables: {
        Row: {
          channel: string
          code: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          status: string
          updated_at: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          channel?: string
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          channel?: string
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          status?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_tables_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_tables_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_variable_rules: {
        Row: {
          channel: string
          commission_percent: number
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          fee_percent: number
          freight_per_unit: number
          id: string
          organization_id: string
          other_per_unit: number
          reason: string
          store_id: string | null
          tax_percent: number
          variant_id: string | null
        }
        Insert: {
          channel: string
          commission_percent?: number
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          fee_percent?: number
          freight_per_unit?: number
          id?: string
          organization_id: string
          other_per_unit?: number
          reason: string
          store_id?: string | null
          tax_percent?: number
          variant_id?: string | null
        }
        Update: {
          channel?: string
          commission_percent?: number
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fee_percent?: number
          freight_per_unit?: number
          id?: string
          organization_id?: string
          other_per_unit?: number
          reason?: string
          store_id?: string | null
          tax_percent?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_variable_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_variable_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_variable_rules_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "marketplace_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_variable_rules_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "pricing_variable_rules_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_cost_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bom_id: string | null
          calculated_at: string
          calculated_by: string | null
          completeness: string
          component_cost: number
          costing_method: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          input_fingerprint: string
          issues: Json
          labor_cost: number
          loss_cost: number
          material_cost: number
          organization_id: string
          other_cost: number
          overhead_cost: number
          packaging_cost: number
          production_order_id: string | null
          source_reference: Json
          status: string
          total_unit_cost: number | null
          variant_id: string
          version: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bom_id?: string | null
          calculated_at?: string
          calculated_by?: string | null
          completeness: string
          component_cost: number
          costing_method: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          input_fingerprint: string
          issues?: Json
          labor_cost: number
          loss_cost: number
          material_cost: number
          organization_id: string
          other_cost?: number
          overhead_cost: number
          packaging_cost: number
          production_order_id?: string | null
          source_reference: Json
          status?: string
          total_unit_cost?: number | null
          variant_id: string
          version: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bom_id?: string | null
          calculated_at?: string
          calculated_by?: string | null
          completeness?: string
          component_cost?: number
          costing_method?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          input_fingerprint?: string
          issues?: Json
          labor_cost?: number
          loss_cost?: number
          material_cost?: number
          organization_id?: string
          other_cost?: number
          overhead_cost?: number
          packaging_cost?: number
          production_order_id?: string | null
          source_reference?: Json
          status?: string
          total_unit_cost?: number | null
          variant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_cost_versions_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_versions_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_versions_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_versions_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_cost_versions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "product_cost_versions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          attributes: Json
          barcode: string | null
          color: string | null
          cost_price: number | null
          created_at: string
          created_by: string | null
          id: string
          minimum_stock: number
          organization_id: string
          product_id: string
          reorder_point: number
          replenishment_policy: string
          safety_stock: number
          sell_price: number | null
          size: string | null
          sku: string
          status: Database["public"]["Enums"]["product_variant_status"]
          target_stock: number | null
          unit_of_measure_id: string | null
          updated_at: string
          updated_by: string | null
          weight_grams: number | null
        }
        Insert: {
          attributes?: Json
          barcode?: string | null
          color?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          minimum_stock?: number
          organization_id: string
          product_id: string
          reorder_point?: number
          replenishment_policy?: string
          safety_stock?: number
          sell_price?: number | null
          size?: string | null
          sku: string
          status?: Database["public"]["Enums"]["product_variant_status"]
          target_stock?: number | null
          unit_of_measure_id?: string | null
          updated_at?: string
          updated_by?: string | null
          weight_grams?: number | null
        }
        Update: {
          attributes?: Json
          barcode?: string | null
          color?: string | null
          cost_price?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          minimum_stock?: number
          organization_id?: string
          product_id?: string
          reorder_point?: number
          replenishment_policy?: string
          safety_stock?: number
          sell_price?: number | null
          size?: string | null
          sku?: string
          status?: Database["public"]["Enums"]["product_variant_status"]
          target_stock?: number | null
          unit_of_measure_id?: string | null
          updated_at?: string
          updated_by?: string | null
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
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
            foreignKeyName: "product_variants_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_consumptions: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          inventory_movement_id: string | null
          location_id: string
          notes: string | null
          occurred_at: string
          organization_id: string
          production_order_id: string
          production_order_material_id: string
          quantity: number
          unit: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          inventory_movement_id?: string | null
          location_id: string
          notes?: string | null
          occurred_at?: string
          organization_id: string
          production_order_id: string
          production_order_material_id: string
          quantity: number
          unit?: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          inventory_movement_id?: string | null
          location_id?: string
          notes?: string | null
          occurred_at?: string
          organization_id?: string
          production_order_id?: string
          production_order_material_id?: string
          quantity?: number
          unit?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_consumptions_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "production_consumptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_production_order_material_id_fkey"
            columns: ["production_order_material_id"]
            isOneToOne: false
            referencedRelation: "production_order_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_consumptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "production_consumptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_labor_entries: {
        Row: {
          activity: string
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string
          minutes: number
          occurred_at: string
          organization_id: string
          production_order_id: string
          reason: string
        }
        Insert: {
          activity: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key: string
          minutes: number
          occurred_at: string
          organization_id: string
          production_order_id: string
          reason: string
        }
        Update: {
          activity?: string
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string
          minutes?: number
          occurred_at?: string
          organization_id?: string
          production_order_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_labor_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_labor_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_labor_entries_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_loss_reasons: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
          organization_id: string | null
          sort_order: number
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label: string
          organization_id?: string | null
          sort_order?: number
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
          organization_id?: string | null
          sort_order?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_loss_reasons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      production_losses: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          inventory_movement_id: string | null
          location_id: string
          loss_reason_id: string | null
          occurred_at: string
          organization_id: string
          production_order_id: string | null
          quantity: number
          reason: string
          unit: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          inventory_movement_id?: string | null
          location_id: string
          loss_reason_id?: string | null
          occurred_at?: string
          organization_id: string
          production_order_id?: string | null
          quantity: number
          reason: string
          unit?: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          inventory_movement_id?: string | null
          location_id?: string
          loss_reason_id?: string | null
          occurred_at?: string
          organization_id?: string
          production_order_id?: string | null
          quantity?: number
          reason?: string
          unit?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_losses_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_losses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_losses_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_losses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_losses_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "production_losses_loss_reason_id_fkey"
            columns: ["loss_reason_id"]
            isOneToOne: false
            referencedRelation: "production_loss_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_losses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_losses_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_losses_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "production_losses_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_counters: {
        Row: {
          last_number: number
          organization_id: string
        }
        Insert: {
          last_number?: number
          organization_id: string
        }
        Update: {
          last_number?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_materials: {
        Row: {
          actual_quantity: number
          bom_item_id: string | null
          bom_quantity_reference: number
          component_variant_id: string
          created_at: string
          id: string
          organization_id: string
          planned_quantity: number
          production_order_id: string
          scrap_percentage_reference: number
          sort_order: number
          unit_of_measure_id: string
          updated_at: string
        }
        Insert: {
          actual_quantity?: number
          bom_item_id?: string | null
          bom_quantity_reference: number
          component_variant_id: string
          created_at?: string
          id?: string
          organization_id: string
          planned_quantity: number
          production_order_id: string
          scrap_percentage_reference?: number
          sort_order?: number
          unit_of_measure_id: string
          updated_at?: string
        }
        Update: {
          actual_quantity?: number
          bom_item_id?: string | null
          bom_quantity_reference?: number
          component_variant_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          planned_quantity?: number
          production_order_id?: string
          scrap_percentage_reference?: number
          sort_order?: number
          unit_of_measure_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "production_order_materials_bom_item_id_fkey"
            columns: ["bom_item_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_materials_component_variant_id_fkey"
            columns: ["component_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "production_order_materials_component_variant_id_fkey"
            columns: ["component_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_materials_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_materials_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_materials_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      production_order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status:
            | Database["public"]["Enums"]["production_order_status"]
            | null
          id: string
          note: string | null
          organization_id: string
          production_order_id: string
          to_status: Database["public"]["Enums"]["production_order_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?:
            | Database["public"]["Enums"]["production_order_status"]
            | null
          id?: string
          note?: string | null
          organization_id: string
          production_order_id: string
          to_status: Database["public"]["Enums"]["production_order_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?:
            | Database["public"]["Enums"]["production_order_status"]
            | null
          id?: string
          note?: string | null
          organization_id?: string
          production_order_id?: string
          to_status?: Database["public"]["Enums"]["production_order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "production_order_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_order_status_history_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      production_orders: {
        Row: {
          approved_by: string | null
          bom_id: string | null
          cancel_reason: string | null
          canceled_at: string | null
          canceled_by: string | null
          code: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          destination_location_id: string
          id: string
          idempotency_key: string | null
          notes: string | null
          organization_id: string
          planned_end_at: string | null
          planned_quantity: number
          planned_start_at: string | null
          produced_quantity: number
          product_variant_id: string
          rejected_quantity: number
          released_at: string | null
          source_location_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["production_order_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_by?: string | null
          bom_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          code: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          destination_location_id: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          organization_id: string
          planned_end_at?: string | null
          planned_quantity: number
          planned_start_at?: string | null
          produced_quantity?: number
          product_variant_id: string
          rejected_quantity?: number
          released_at?: string | null
          source_location_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["production_order_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_by?: string | null
          bom_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          canceled_by?: string | null
          code?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          destination_location_id?: string
          id?: string
          idempotency_key?: string | null
          notes?: string | null
          organization_id?: string
          planned_end_at?: string | null
          planned_quantity?: number
          planned_start_at?: string | null
          produced_quantity?: number
          product_variant_id?: string
          rejected_quantity?: number
          released_at?: string | null
          source_location_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["production_order_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_bom_id_fkey"
            columns: ["bom_id"]
            isOneToOne: false
            referencedRelation: "bill_of_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_canceled_by_fkey"
            columns: ["canceled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "production_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "production_orders_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_orders_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "production_orders_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      production_outputs: {
        Row: {
          batch_id: string | null
          created_at: string
          created_by: string | null
          id: string
          idempotency_key: string | null
          inventory_movement_id: string | null
          location_id: string
          notes: string | null
          occurred_at: string
          organization_id: string
          production_order_id: string
          quantity_good: number
          quantity_rejected: number
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          inventory_movement_id?: string | null
          location_id: string
          notes?: string | null
          occurred_at?: string
          organization_id: string
          production_order_id: string
          quantity_good?: number
          quantity_rejected?: number
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          idempotency_key?: string | null
          inventory_movement_id?: string | null
          location_id?: string
          notes?: string | null
          occurred_at?: string
          organization_id?: string
          production_order_id?: string
          quantity_good?: number
          quantity_rejected?: number
        }
        Relationships: [
          {
            foreignKeyName: "production_outputs_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_inventory_movement_id_fkey"
            columns: ["inventory_movement_id"]
            isOneToOne: false
            referencedRelation: "inventory_movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "production_outputs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "production_outputs_production_order_id_fkey"
            columns: ["production_order_id"]
            isOneToOne: false
            referencedRelation: "production_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          attributes: Json
          brand: string | null
          category_id: string | null
          code: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          item_type: Database["public"]["Enums"]["item_type"]
          main_image_url: string | null
          name: string
          ncm: string | null
          organization_id: string
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attributes?: Json
          brand?: string | null
          category_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          main_image_url?: string | null
          name: string
          ncm?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attributes?: Json
          brand?: string | null
          category_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          item_type?: Database["public"]["Enums"]["item_type"]
          main_image_url?: string | null
          name?: string
          ncm?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          updated_by?: string | null
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
            foreignKeyName: "products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_updated_by_fkey"
            columns: ["updated_by"]
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
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profitability_settings: {
        Row: {
          low_margin_percent: number | null
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          low_margin_percent?: number | null
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          low_margin_percent?: number | null
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profitability_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profitability_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projected_shortages: {
        Row: {
          created_at: string
          detail: Json
          id: string
          organization_id: string
          parent_planned_order_id: string | null
          planning_run_id: string
          severity: string
          shortage_date: string
          shortage_quantity: number
          source: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          detail?: Json
          id?: string
          organization_id: string
          parent_planned_order_id?: string | null
          planning_run_id: string
          severity: string
          shortage_date: string
          shortage_quantity: number
          source: string
          variant_id: string
        }
        Update: {
          created_at?: string
          detail?: Json
          id?: string
          organization_id?: string
          parent_planned_order_id?: string | null
          planning_run_id?: string
          severity?: string
          shortage_date?: string
          shortage_quantity?: number
          source?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projected_shortages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projected_shortages_parent_planned_order_id_fkey"
            columns: ["parent_planned_order_id"]
            isOneToOne: false
            referencedRelation: "planned_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projected_shortages_planning_run_id_fkey"
            columns: ["planning_run_id"]
            isOneToOne: false
            referencedRelation: "planning_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projected_shortages_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "projected_shortages_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_exceptions: {
        Row: {
          created_at: string
          details: Json
          exception_type: string
          goods_receipt_id: string | null
          id: string
          message: string
          organization_id: string
          purchase_order_id: string | null
          purchase_order_item_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          supplier_document_id: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          details?: Json
          exception_type: string
          goods_receipt_id?: string | null
          id?: string
          message: string
          organization_id: string
          purchase_order_id?: string | null
          purchase_order_item_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          supplier_document_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          details?: Json
          exception_type?: string
          goods_receipt_id?: string | null
          id?: string
          message?: string
          organization_id?: string
          purchase_order_id?: string | null
          purchase_order_item_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          supplier_document_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_exceptions_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_exceptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_exceptions_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_exceptions_purchase_order_item_id_fkey"
            columns: ["purchase_order_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_exceptions_supplier_document_id_fkey"
            columns: ["supplier_document_id"]
            isOneToOne: false
            referencedRelation: "supplier_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_exceptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_exceptions_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          conversion_factor: number | null
          created_at: string
          discount_amount: number
          expected_delivery_date: string | null
          id: string
          inventory_unit_id: string | null
          line_total: number
          ordered_quantity: number
          organization_id: string
          purchase_order_id: string
          purchase_unit_id: string | null
          received_quantity: number
          status: string
          supplier_sku: string | null
          tax_amount: number
          unit_price: number
          variant_id: string
        }
        Insert: {
          conversion_factor?: number | null
          created_at?: string
          discount_amount?: number
          expected_delivery_date?: string | null
          id?: string
          inventory_unit_id?: string | null
          line_total: number
          ordered_quantity: number
          organization_id: string
          purchase_order_id: string
          purchase_unit_id?: string | null
          received_quantity?: number
          status?: string
          supplier_sku?: string | null
          tax_amount?: number
          unit_price: number
          variant_id: string
        }
        Update: {
          conversion_factor?: number | null
          created_at?: string
          discount_amount?: number
          expected_delivery_date?: string | null
          id?: string
          inventory_unit_id?: string | null
          line_total?: number
          ordered_quantity?: number
          organization_id?: string
          purchase_order_id?: string
          purchase_unit_id?: string | null
          received_quantity?: number
          status?: string
          supplier_sku?: string | null
          tax_amount?: number
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_inventory_unit_id_fkey"
            columns: ["inventory_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cancel_reason: string | null
          completed_at: string | null
          cost_center_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          destination_location_id: string | null
          discount_amount: number
          expected_delivery_date: string | null
          financial_category_id: string | null
          freight_amount: number
          id: string
          issue_date: string
          notes: string | null
          order_number: string
          organization_id: string
          other_amount: number
          payment_terms: string | null
          purchase_request_id: string | null
          quotation_id: string | null
          sent_at: string | null
          status: string
          subtotal: number
          supplier_id: string
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination_location_id?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          financial_category_id?: string | null
          freight_amount?: number
          id?: string
          issue_date?: string
          notes?: string | null
          order_number: string
          organization_id: string
          other_amount?: number
          payment_terms?: string | null
          purchase_request_id?: string | null
          quotation_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          supplier_id: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cancel_reason?: string | null
          completed_at?: string | null
          cost_center_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          destination_location_id?: string | null
          discount_amount?: number
          expected_delivery_date?: string | null
          financial_category_id?: string | null
          freight_amount?: number
          id?: string
          issue_date?: string
          notes?: string | null
          order_number?: string
          organization_id?: string
          other_amount?: number
          payment_terms?: string | null
          purchase_request_id?: string | null
          quotation_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_destination_location_id_fkey"
            columns: ["destination_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "purchase_orders_financial_category_id_fkey"
            columns: ["financial_category_id"]
            isOneToOne: false
            referencedRelation: "financial_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_receipt_costs: {
        Row: {
          created_at: string
          effective_date: string
          goods_receipt_id: string
          id: string
          organization_id: string
          quantity: number
          total_value: number
          unit_cost: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          effective_date: string
          goods_receipt_id: string
          id?: string
          organization_id: string
          quantity: number
          total_value: number
          unit_cost: number
          variant_id: string
        }
        Update: {
          created_at?: string
          effective_date?: string
          goods_receipt_id?: string
          id?: string
          organization_id?: string
          quantity?: number
          total_value?: number
          unit_cost?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_receipt_costs_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_receipt_costs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_receipt_costs_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_request_items: {
        Row: {
          created_at: string
          id: string
          needed_by_date: string | null
          organization_id: string
          purchase_request_id: string
          quantity: number
          reason: string | null
          source_id: string | null
          source_type: string
          status: string
          unit_of_measure_id: string | null
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          needed_by_date?: string | null
          organization_id: string
          purchase_request_id: string
          quantity: number
          reason?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          unit_of_measure_id?: string | null
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          needed_by_date?: string | null
          organization_id?: string
          purchase_request_id?: string
          quantity?: number
          reason?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          unit_of_measure_id?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_request_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_request_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "purchase_request_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requests: {
        Row: {
          cost_center_id: string | null
          created_at: string
          id: string
          needed_by_date: string | null
          notes: string | null
          organization_id: string
          priority: string
          request_date: string
          request_number: string
          requested_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          cost_center_id?: string | null
          created_at?: string
          id?: string
          needed_by_date?: string | null
          notes?: string | null
          organization_id: string
          priority?: string
          request_date?: string
          request_number: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          cost_center_id?: string | null
          created_at?: string
          id?: string
          needed_by_date?: string | null
          notes?: string | null
          organization_id?: string
          priority?: string
          request_date?: string
          request_number?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requests_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      purchasing_settings: {
        Row: {
          acquisition_cost_policy: string
          approval_segregation: boolean
          freight_policy: string
          organization_id: string
          over_receipt_policy: string
          payable_on: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acquisition_cost_policy?: string
          approval_segregation?: boolean
          freight_policy?: string
          organization_id: string
          over_receipt_policy?: string
          payable_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acquisition_cost_policy?: string
          approval_segregation?: boolean
          freight_policy?: string
          organization_id?: string
          over_receipt_policy?: string
          payable_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchasing_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchasing_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_supplier_items: {
        Row: {
          award_reason: string | null
          awarded: boolean
          awarded_at: string | null
          awarded_by: string | null
          created_at: string
          delivery_days: number | null
          discount_amount: number
          freight_amount: number
          id: string
          notes: string | null
          organization_id: string
          other_amount: number
          payment_terms: string | null
          purchase_request_item_id: string | null
          quantity: number
          quotation_id: string
          supplier_id: string
          tax_amount: number
          total_amount: number
          unit_of_measure_id: string | null
          unit_price: number
          valid_until: string | null
          variant_id: string
        }
        Insert: {
          award_reason?: string | null
          awarded?: boolean
          awarded_at?: string | null
          awarded_by?: string | null
          created_at?: string
          delivery_days?: number | null
          discount_amount?: number
          freight_amount?: number
          id?: string
          notes?: string | null
          organization_id: string
          other_amount?: number
          payment_terms?: string | null
          purchase_request_item_id?: string | null
          quantity: number
          quotation_id: string
          supplier_id: string
          tax_amount?: number
          total_amount: number
          unit_of_measure_id?: string | null
          unit_price: number
          valid_until?: string | null
          variant_id: string
        }
        Update: {
          award_reason?: string | null
          awarded?: boolean
          awarded_at?: string | null
          awarded_by?: string | null
          created_at?: string
          delivery_days?: number | null
          discount_amount?: number
          freight_amount?: number
          id?: string
          notes?: string | null
          organization_id?: string
          other_amount?: number
          payment_terms?: string | null
          purchase_request_item_id?: string | null
          quantity?: number
          quotation_id?: string
          supplier_id?: string
          tax_amount?: number
          total_amount?: number
          unit_of_measure_id?: string | null
          unit_price?: number
          valid_until?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_supplier_items_awarded_by_fkey"
            columns: ["awarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_supplier_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_supplier_items_purchase_request_item_id_fkey"
            columns: ["purchase_request_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_supplier_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_supplier_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_supplier_items_unit_of_measure_id_fkey"
            columns: ["unit_of_measure_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_supplier_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "quotation_supplier_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_suppliers: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          organization_id: string
          quotation_id: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id: string
          quotation_id: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          organization_id?: string
          quotation_id?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotation_suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_suppliers_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_suppliers_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          created_at: string
          created_by: string | null
          deadline: string | null
          id: string
          notes: string | null
          organization_id: string
          purchase_request_id: string | null
          quotation_number: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          purchase_request_id?: string | null
          quotation_number: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deadline?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          purchase_request_id?: string | null
          quotation_number?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_purchase_request_id_fkey"
            columns: ["purchase_request_id"]
            isOneToOne: false
            referencedRelation: "purchase_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_approvals: {
        Row: {
          created_at: string
          created_by: string | null
          decision: string
          id: string
          organization_id: string
          quote_id: string
          reason: string
          updated_at: string
          values_snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decision: string
          id?: string
          organization_id: string
          quote_id: string
          reason: string
          updated_at?: string
          values_snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decision?: string
          id?: string
          organization_id?: string
          quote_id?: string
          reason?: string
          updated_at?: string
          values_snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "quote_approvals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_approvals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_approvals_organization_id_quote_id_fkey"
            columns: ["organization_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      receivable_settlements: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          discount_amount: number
          financial_transaction_id: string
          id: string
          interest_amount: number
          is_reversal: boolean
          organization_id: string
          penalty_amount: number
          receivable_id: string
          reversal_of_id: string | null
          settled_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          financial_transaction_id: string
          id?: string
          interest_amount?: number
          is_reversal?: boolean
          organization_id: string
          penalty_amount?: number
          receivable_id: string
          reversal_of_id?: string | null
          settled_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          financial_transaction_id?: string
          id?: string
          interest_amount?: number
          is_reversal?: boolean
          organization_id?: string
          penalty_amount?: number
          receivable_id?: string
          reversal_of_id?: string | null
          settled_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_settlements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_settlements_organization_id_financial_transacti_fkey"
            columns: ["organization_id", "financial_transaction_id"]
            isOneToOne: false
            referencedRelation: "financial_transactions"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "receivable_settlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_settlements_organization_id_receivable_id_fkey"
            columns: ["organization_id", "receivable_id"]
            isOneToOne: false
            referencedRelation: "account_receivables"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      reconciliation_exceptions: {
        Row: {
          created_at: string
          created_by: string | null
          details: Json
          exception_type: string
          id: string
          item_id: string | null
          marketplace_sale_id: string | null
          message: string
          organization_id: string
          partner_id: string | null
          reconciliation_id: string | null
          resolution_notes: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          status: string
          store_id: string | null
          updated_at: string
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: Json
          exception_type: string
          id?: string
          item_id?: string | null
          marketplace_sale_id?: string | null
          message: string
          organization_id: string
          partner_id?: string | null
          reconciliation_id?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: Json
          exception_type?: string
          id?: string
          item_id?: string | null
          marketplace_sale_id?: string | null
          message?: string
          organization_id?: string
          partner_id?: string | null
          reconciliation_id?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_exceptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_exceptions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_exceptions_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          created_at: string
          id: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string
          id?: string
          permission: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string
          id?: string
          permission?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: []
      }
      sale_cost_snapshots: {
        Row: {
          channel: string
          cogs: number | null
          commission: number | null
          completeness: string
          contribution: number | null
          created_at: string
          created_by: string | null
          currency: string
          discount: number | null
          fees: number | null
          freight: number | null
          gross_margin: number | null
          id: string
          issues: Json
          margin_percent: number | null
          organization_id: string
          other_cost: number | null
          partner_id: string | null
          product_cost_version_id: string | null
          quantity: number
          reconciliation_closed_at: string | null
          reconciliation_id: string | null
          revenue: number
          sale_date: string
          sale_id: string
          source_key: string
          source_reference: Json
          store_id: string
          tax: number | null
          variant_id: string | null
        }
        Insert: {
          channel: string
          cogs?: number | null
          commission?: number | null
          completeness: string
          contribution?: number | null
          created_at?: string
          created_by?: string | null
          currency: string
          discount?: number | null
          fees?: number | null
          freight?: number | null
          gross_margin?: number | null
          id?: string
          issues?: Json
          margin_percent?: number | null
          organization_id: string
          other_cost?: number | null
          partner_id?: string | null
          product_cost_version_id?: string | null
          quantity: number
          reconciliation_closed_at?: string | null
          reconciliation_id?: string | null
          revenue: number
          sale_date: string
          sale_id: string
          source_key: string
          source_reference: Json
          store_id: string
          tax?: number | null
          variant_id?: string | null
        }
        Update: {
          channel?: string
          cogs?: number | null
          commission?: number | null
          completeness?: string
          contribution?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          discount?: number | null
          fees?: number | null
          freight?: number | null
          gross_margin?: number | null
          id?: string
          issues?: Json
          margin_percent?: number | null
          organization_id?: string
          other_cost?: number | null
          partner_id?: string | null
          product_cost_version_id?: string | null
          quantity?: number
          reconciliation_closed_at?: string | null
          reconciliation_id?: string | null
          revenue?: number
          sale_date?: string
          sale_id?: string
          source_key?: string
          source_reference?: Json
          store_id?: string
          tax?: number | null
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sale_cost_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_snapshots_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partner_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_snapshots_product_cost_version_id_fkey"
            columns: ["product_cost_version_id"]
            isOneToOne: false
            referencedRelation: "product_cost_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_snapshots_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "partner_reconciliations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_snapshots_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "marketplace_sales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_snapshots_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "marketplace_stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_cost_snapshots_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sale_cost_snapshots_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_economics: {
        Row: {
          commission_amount: number
          company_discount_amount: number
          company_shipping_amount: number
          created_at: string
          created_by: string | null
          id: string
          marketplace_discount_amount: number
          organization_id: string
          other_amount: number
          sale_id: string
          source_reference: string
          tax_amount: number
        }
        Insert: {
          commission_amount: number
          company_discount_amount: number
          company_shipping_amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_discount_amount: number
          organization_id: string
          other_amount: number
          sale_id: string
          source_reference: string
          tax_amount: number
        }
        Update: {
          commission_amount?: number
          company_discount_amount?: number
          company_shipping_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          marketplace_discount_amount?: number
          organization_id?: string
          other_amount?: number
          sale_id?: string
          source_reference?: string
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "sale_economics_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_economics_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sale_economics_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "marketplace_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_credit_checks: {
        Row: {
          blocked_reasons: string[]
          company_id: string
          created_at: string
          created_by: string | null
          credit_available: number | null
          credit_limit: number | null
          decision: string
          evaluated_amount: number
          exposure_policy: string
          id: string
          open_order_exposure: number
          open_receivables: number
          organization_id: string
          overdue_amount: number
          overrides: Json
          result: Json
          sales_order_id: string | null
        }
        Insert: {
          blocked_reasons?: string[]
          company_id: string
          created_at?: string
          created_by?: string | null
          credit_available?: number | null
          credit_limit?: number | null
          decision: string
          evaluated_amount: number
          exposure_policy: string
          id?: string
          open_order_exposure?: number
          open_receivables?: number
          organization_id: string
          overdue_amount?: number
          overrides?: Json
          result?: Json
          sales_order_id?: string | null
        }
        Update: {
          blocked_reasons?: string[]
          company_id?: string
          created_at?: string
          created_by?: string | null
          credit_available?: number | null
          credit_limit?: number | null
          decision?: string
          evaluated_amount?: number
          exposure_policy?: string
          id?: string
          open_order_exposure?: number
          open_receivables?: number
          organization_id?: string
          overdue_amount?: number
          overrides?: Json
          result?: Json
          sales_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_credit_checks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_credit_checks_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_credit_checks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_credit_checks_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      sales_demands: {
        Row: {
          already_in_forecast: boolean
          consumed_at: string | null
          consumed_by_planning_run_id: string | null
          created_at: string
          fulfilled_quantity: number
          id: string
          organization_id: string
          pending_quantity: number | null
          requested_quantity: number
          required_date: string
          sales_order_id: string
          sales_order_item_id: string
          source_type: string
          status: string
          updated_at: string
          variant_id: string
        }
        Insert: {
          already_in_forecast?: boolean
          consumed_at?: string | null
          consumed_by_planning_run_id?: string | null
          created_at?: string
          fulfilled_quantity?: number
          id?: string
          organization_id: string
          pending_quantity?: number | null
          requested_quantity: number
          required_date: string
          sales_order_id: string
          sales_order_item_id: string
          source_type?: string
          status?: string
          updated_at?: string
          variant_id: string
        }
        Update: {
          already_in_forecast?: boolean
          consumed_at?: string | null
          consumed_by_planning_run_id?: string | null
          created_at?: string
          fulfilled_quantity?: number
          id?: string
          organization_id?: string
          pending_quantity?: number | null
          requested_quantity?: number
          required_date?: string
          sales_order_id?: string
          sales_order_item_id?: string
          source_type?: string
          status?: string
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_demands_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_demands_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_demands_organization_id_sales_order_item_id_fkey"
            columns: ["organization_id", "sales_order_item_id"]
            isOneToOne: true
            referencedRelation: "sales_order_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_demands_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sales_demands_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_number_counters: {
        Row: {
          fulfillment_seq: number
          order_seq: number
          organization_id: string
          return_seq: number
          shipment_seq: number
          updated_at: string
        }
        Insert: {
          fulfillment_seq?: number
          order_seq?: number
          organization_id: string
          return_seq?: number
          shipment_seq?: number
          updated_at?: string
        }
        Update: {
          fulfillment_seq?: number
          order_seq?: number
          organization_id?: string
          return_seq?: number
          shipment_seq?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_number_counters_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_opportunities: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          estimated_value: number
          expected_close_date: string | null
          id: string
          loss_reason_id: string | null
          organization_id: string
          pipeline_id: string
          primary_contact_id: string | null
          probability: number
          representative_id: string | null
          source_id: string | null
          source_type: string | null
          stage_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_value?: number
          expected_close_date?: string | null
          id?: string
          loss_reason_id?: string | null
          organization_id: string
          pipeline_id: string
          primary_contact_id?: string | null
          probability: number
          representative_id?: string | null
          source_id?: string | null
          source_type?: string | null
          stage_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          estimated_value?: number
          expected_close_date?: string | null
          id?: string
          loss_reason_id?: string | null
          organization_id?: string
          pipeline_id?: string
          primary_contact_id?: string | null
          probability?: number
          representative_id?: string | null
          source_id?: string | null
          source_type?: string | null
          stage_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_loss_reason_id_fkey"
            columns: ["organization_id", "loss_reason_id"]
            isOneToOne: false
            referencedRelation: "commercial_reasons"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_pipeline_id_fkey"
            columns: ["organization_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "sales_pipelines"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_representative_id_fkey"
            columns: ["organization_id", "representative_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_opportunities_organization_id_stage_id_fkey"
            columns: ["organization_id", "stage_id"]
            isOneToOne: false
            referencedRelation: "sales_pipeline_stages"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_opportunities_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "company_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          approved_quantity: number
          created_at: string
          created_by: string | null
          delivered_quantity: number
          description_snapshot: string
          discount_amount: number
          expected_delivery_date: string | null
          fulfilled_quantity: number
          id: string
          line_total: number
          ordered_quantity: number
          organization_id: string
          picked_quantity: number
          price_snapshot: Json
          product_variant_id: string
          production_order_id: string | null
          reserved_quantity: number
          returned_quantity: number
          sales_order_id: string
          sku_snapshot: string
          sourcing_type: string
          status: string
          tax_amount: number
          unit_price: number
          unit_snapshot: string | null
          updated_at: string
        }
        Insert: {
          approved_quantity?: number
          created_at?: string
          created_by?: string | null
          delivered_quantity?: number
          description_snapshot: string
          discount_amount?: number
          expected_delivery_date?: string | null
          fulfilled_quantity?: number
          id?: string
          line_total: number
          ordered_quantity: number
          organization_id: string
          picked_quantity?: number
          price_snapshot?: Json
          product_variant_id: string
          production_order_id?: string | null
          reserved_quantity?: number
          returned_quantity?: number
          sales_order_id: string
          sku_snapshot: string
          sourcing_type?: string
          status?: string
          tax_amount?: number
          unit_price: number
          unit_snapshot?: string | null
          updated_at?: string
        }
        Update: {
          approved_quantity?: number
          created_at?: string
          created_by?: string | null
          delivered_quantity?: number
          description_snapshot?: string
          discount_amount?: number
          expected_delivery_date?: string | null
          fulfilled_quantity?: number
          id?: string
          line_total?: number
          ordered_quantity?: number
          organization_id?: string
          picked_quantity?: number
          price_snapshot?: Json
          product_variant_id?: string
          production_order_id?: string | null
          reserved_quantity?: number
          returned_quantity?: number
          sales_order_id?: string
          sku_snapshot?: string
          sourcing_type?: string
          status?: string
          tax_amount?: number
          unit_price?: number
          unit_snapshot?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_order_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sales_order_items_product_variant_id_fkey"
            columns: ["product_variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_operation_keys: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          operation: string
          operation_key: string
          organization_id: string
          payload: Json
          result: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          operation: string
          operation_key: string
          organization_id: string
          payload: Json
          result: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          operation?: string
          operation_key?: string
          organization_id?: string
          payload?: Json
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_operation_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_operation_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_settings: {
        Row: {
          allow_partial_fulfillment: boolean
          approval_segregation: boolean
          created_at: string
          credit_exposure_policy: string
          id: string
          make_to_order_enabled: boolean
          max_discount_percent: number | null
          organization_id: string
          price_override_policy: string
          receivable_trigger: string
          require_shipping_address: boolean
          reservation_expiry_hours: number
          reservation_policy: string
          shipment_requires_full_confirmation: boolean
          tracking_mode: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_partial_fulfillment?: boolean
          approval_segregation?: boolean
          created_at?: string
          credit_exposure_policy?: string
          id?: string
          make_to_order_enabled?: boolean
          max_discount_percent?: number | null
          organization_id: string
          price_override_policy?: string
          receivable_trigger?: string
          require_shipping_address?: boolean
          reservation_expiry_hours?: number
          reservation_policy?: string
          shipment_requires_full_confirmation?: boolean
          tracking_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_partial_fulfillment?: boolean
          approval_segregation?: boolean
          created_at?: string
          credit_exposure_policy?: string
          id?: string
          make_to_order_enabled?: boolean
          max_discount_percent?: number | null
          organization_id?: string
          price_override_policy?: string
          receivable_trigger?: string
          require_shipping_address?: boolean
          reservation_expiry_hours?: number
          reservation_policy?: string
          shipment_requires_full_confirmation?: boolean
          tracking_mode?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_status_history: {
        Row: {
          created_at: string
          created_by: string | null
          details: Json
          id: string
          new_status: string
          organization_id: string
          previous_status: string | null
          reason: string | null
          sales_order_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          new_status: string
          organization_id: string
          previous_status?: string | null
          reason?: string | null
          sales_order_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          details?: Json
          id?: string
          new_status?: string
          organization_id?: string
          previous_status?: string | null
          reason?: string | null
          sales_order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_status_history_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_status_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_status_history_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          address_snapshot: Json
          approval_policy: Json
          approved_at: string | null
          approved_by: string | null
          availability_checked_at: string | null
          billing_address_id: string | null
          cancel_reason: string | null
          canceled_at: string | null
          closed_at: string | null
          commercial_notes: string | null
          company_id: string
          company_snapshot: Json
          created_at: string
          created_by: string | null
          credit_check_result: Json | null
          credit_checked_at: string | null
          currency: string
          customer_profile_id: string | null
          discount_total: number
          expected_delivery_date: string | null
          freight_amount: number
          fulfillment_status: string
          id: string
          internal_notes: string | null
          order_date: string
          order_number: string
          organization_id: string
          payment_terms_id: string | null
          payment_terms_snapshot: string | null
          price_snapshot: Json
          price_table_id: string | null
          representative_id: string | null
          sales_opportunity_id: string | null
          sales_quote_id: string | null
          sales_quote_version: number | null
          shipping_address_id: string | null
          source_type: string
          status: string
          stock_status: string
          submitted_at: string | null
          subtotal: number
          tax_amount: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          address_snapshot?: Json
          approval_policy?: Json
          approved_at?: string | null
          approved_by?: string | null
          availability_checked_at?: string | null
          billing_address_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          closed_at?: string | null
          commercial_notes?: string | null
          company_id: string
          company_snapshot?: Json
          created_at?: string
          created_by?: string | null
          credit_check_result?: Json | null
          credit_checked_at?: string | null
          currency?: string
          customer_profile_id?: string | null
          discount_total?: number
          expected_delivery_date?: string | null
          freight_amount?: number
          fulfillment_status?: string
          id?: string
          internal_notes?: string | null
          order_date?: string
          order_number: string
          organization_id: string
          payment_terms_id?: string | null
          payment_terms_snapshot?: string | null
          price_snapshot?: Json
          price_table_id?: string | null
          representative_id?: string | null
          sales_opportunity_id?: string | null
          sales_quote_id?: string | null
          sales_quote_version?: number | null
          shipping_address_id?: string | null
          source_type?: string
          status?: string
          stock_status?: string
          submitted_at?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          address_snapshot?: Json
          approval_policy?: Json
          approved_at?: string | null
          approved_by?: string | null
          availability_checked_at?: string | null
          billing_address_id?: string | null
          cancel_reason?: string | null
          canceled_at?: string | null
          closed_at?: string | null
          commercial_notes?: string | null
          company_id?: string
          company_snapshot?: Json
          created_at?: string
          created_by?: string | null
          credit_check_result?: Json | null
          credit_checked_at?: string | null
          currency?: string
          customer_profile_id?: string | null
          discount_total?: number
          expected_delivery_date?: string | null
          freight_amount?: number
          fulfillment_status?: string
          id?: string
          internal_notes?: string | null
          order_date?: string
          order_number?: string
          organization_id?: string
          payment_terms_id?: string | null
          payment_terms_snapshot?: string | null
          price_snapshot?: Json
          price_table_id?: string | null
          representative_id?: string | null
          sales_opportunity_id?: string | null
          sales_quote_id?: string | null
          sales_quote_version?: number | null
          shipping_address_id?: string | null
          source_type?: string
          status?: string
          stock_status?: string
          submitted_at?: string | null
          subtotal?: number
          tax_amount?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_billing_address_id_fkey"
            columns: ["organization_id", "billing_address_id"]
            isOneToOne: false
            referencedRelation: "company_addresses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_customer_profile_id_fkey"
            columns: ["organization_id", "customer_profile_id"]
            isOneToOne: false
            referencedRelation: "customer_profiles"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_payment_terms_id_fkey"
            columns: ["organization_id", "payment_terms_id"]
            isOneToOne: false
            referencedRelation: "commercial_payment_terms"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_price_table_id_fkey"
            columns: ["organization_id", "price_table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_representative_id_fkey"
            columns: ["organization_id", "representative_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_sales_opportunity_id_fkey"
            columns: ["organization_id", "sales_opportunity_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_sales_quote_id_fkey"
            columns: ["organization_id", "sales_quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_orders_organization_id_shipping_address_id_fkey"
            columns: ["organization_id", "shipping_address_id"]
            isOneToOne: false
            referencedRelation: "company_addresses"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      sales_pipeline_stages: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          pipeline_id: string
          position: number
          probability: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          pipeline_id: string
          position: number
          probability: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          pipeline_id?: string
          position?: number
          probability?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_pipeline_stages_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pipeline_stages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pipeline_stages_organization_id_pipeline_id_fkey"
            columns: ["organization_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "sales_pipelines"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      sales_pipelines: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_pipelines_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_pipelines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quote_items: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          organization_id: string
          price_snapshot: Json
          product_snapshot: Json
          quantity: number
          quote_id: string
          total: number | null
          unit_price: number
          updated_at: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id: string
          price_snapshot: Json
          product_snapshot: Json
          quantity: number
          quote_id: string
          total?: number | null
          unit_price: number
          updated_at?: string
          variant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          organization_id?: string
          price_snapshot?: Json
          product_snapshot?: Json
          quantity?: number
          quote_id?: string
          total?: number | null
          unit_price?: number
          updated_at?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_quote_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quote_items_organization_id_quote_id_fkey"
            columns: ["organization_id", "quote_id"]
            isOneToOne: false
            referencedRelation: "sales_quotes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_quote_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "sales_quote_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_quotes: {
        Row: {
          acceptance_contact_id: string | null
          acceptance_evidence: string | null
          accepted_at: string | null
          accepted_by: string | null
          approved_at: string | null
          approved_by: string | null
          company_id: string
          company_snapshot: Json
          created_at: string
          created_by: string | null
          discount_amount: number
          discount_percent: number
          freight: number
          id: string
          issue_date: string
          notes: string | null
          opportunity_id: string | null
          organization_id: string
          payment_terms_snapshot: Json
          price_table_id: string
          primary_contact_id: string | null
          quote_number: number
          representative_id: string | null
          sent_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          total: number
          updated_at: string
          valid_until: string
          version: number
        }
        Insert: {
          acceptance_contact_id?: string | null
          acceptance_evidence?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          company_snapshot?: Json
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          discount_percent?: number
          freight?: number
          id?: string
          issue_date?: string
          notes?: string | null
          opportunity_id?: string | null
          organization_id: string
          payment_terms_snapshot?: Json
          price_table_id: string
          primary_contact_id?: string | null
          quote_number: number
          representative_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          valid_until: string
          version?: number
        }
        Update: {
          acceptance_contact_id?: string | null
          acceptance_evidence?: string | null
          accepted_at?: string | null
          accepted_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          company_snapshot?: Json
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          discount_percent?: number
          freight?: number
          id?: string
          issue_date?: string
          notes?: string | null
          opportunity_id?: string | null
          organization_id?: string
          payment_terms_snapshot?: Json
          price_table_id?: string
          primary_contact_id?: string | null
          quote_number?: number
          representative_id?: string | null
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          total?: number
          updated_at?: string
          valid_until?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_quotes_acceptance_contact_id_fkey"
            columns: ["acceptance_contact_id"]
            isOneToOne: false
            referencedRelation: "company_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_quotes_organization_id_opportunity_id_fkey"
            columns: ["organization_id", "opportunity_id"]
            isOneToOne: false
            referencedRelation: "sales_opportunities"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_quotes_organization_id_price_table_id_fkey"
            columns: ["organization_id", "price_table_id"]
            isOneToOne: false
            referencedRelation: "price_tables"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_quotes_organization_id_representative_id_fkey"
            columns: ["organization_id", "representative_id"]
            isOneToOne: false
            referencedRelation: "sales_representatives"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_quotes_primary_contact_id_fkey"
            columns: ["primary_contact_id"]
            isOneToOne: false
            referencedRelation: "company_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_representatives: {
        Row: {
          assigned_manager_id: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          representative_code: string
          representative_type: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_manager_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          representative_code: string
          representative_type: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_manager_id?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          representative_code?: string
          representative_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_representatives_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_representatives_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_representatives_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "sales_representatives_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_representatives_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_territories: {
        Row: {
          city: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          region: string | null
          segment_id: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          region?: string | null
          segment_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          region?: string | null
          segment_id?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_territories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_territories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_territories_organization_id_segment_id_fkey"
            columns: ["organization_id", "segment_id"]
            isOneToOne: false
            referencedRelation: "commercial_segments"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      shipment_delivery_proofs: {
        Row: {
          created_at: string
          created_by: string | null
          file_name: string | null
          file_path: string | null
          id: string
          mime_type: string | null
          notes: string | null
          occurred_at: string
          occurrences: string | null
          organization_id: string
          proof_type: string
          received_by: string | null
          shipment_id: string
          signature_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          occurred_at?: string
          occurrences?: string | null
          organization_id: string
          proof_type?: string
          received_by?: string | null
          shipment_id: string
          signature_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          mime_type?: string | null
          notes?: string | null
          occurred_at?: string
          occurrences?: string | null
          organization_id?: string
          proof_type?: string
          received_by?: string | null
          shipment_id?: string
          signature_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipment_delivery_proofs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_delivery_proofs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_delivery_proofs_organization_id_shipment_id_fkey"
            columns: ["organization_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      shipment_items: {
        Row: {
          batch_id: string | null
          delivered_quantity: number
          description_snapshot: string
          id: string
          inventory_movement_id: string | null
          organization_id: string
          quantity: number
          reservation_id: string | null
          returned_quantity: number
          sales_order_item_id: string
          shipment_id: string
          sku_snapshot: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          delivered_quantity?: number
          description_snapshot: string
          id?: string
          inventory_movement_id?: string | null
          organization_id: string
          quantity: number
          reservation_id?: string | null
          returned_quantity?: number
          sales_order_item_id: string
          shipment_id: string
          sku_snapshot: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          delivered_quantity?: number
          description_snapshot?: string
          id?: string
          inventory_movement_id?: string | null
          organization_id?: string
          quantity?: number
          reservation_id?: string | null
          returned_quantity?: number
          sales_order_item_id?: string
          shipment_id?: string
          sku_snapshot?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipment_items_organization_id_batch_id_fkey"
            columns: ["organization_id", "batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipment_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_items_organization_id_reservation_id_fkey"
            columns: ["organization_id", "reservation_id"]
            isOneToOne: false
            referencedRelation: "inventory_reservations"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipment_items_organization_id_sales_order_item_id_fkey"
            columns: ["organization_id", "sales_order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipment_items_organization_id_shipment_id_fkey"
            columns: ["organization_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "shipment_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      shipment_volumes: {
        Row: {
          carrier_tracking_code: string | null
          gross_weight_kg: number | null
          id: string
          notes: string | null
          organization_id: string
          packing_volume_id: string | null
          shipment_id: string
          volume_number: string
          weight_informed: boolean
        }
        Insert: {
          carrier_tracking_code?: string | null
          gross_weight_kg?: number | null
          id?: string
          notes?: string | null
          organization_id: string
          packing_volume_id?: string | null
          shipment_id: string
          volume_number: string
          weight_informed?: boolean
        }
        Update: {
          carrier_tracking_code?: string | null
          gross_weight_kg?: number | null
          id?: string
          notes?: string | null
          organization_id?: string
          packing_volume_id?: string | null
          shipment_id?: string
          volume_number?: string
          weight_informed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "shipment_volumes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipment_volumes_organization_id_packing_volume_id_fkey"
            columns: ["organization_id", "packing_volume_id"]
            isOneToOne: false
            referencedRelation: "packing_record_volumes"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipment_volumes_organization_id_shipment_id_fkey"
            columns: ["organization_id", "shipment_id"]
            isOneToOne: false
            referencedRelation: "shipments"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      shipments: {
        Row: {
          address_snapshot: Json
          cancel_reason: string | null
          carrier_id: string | null
          created_at: string
          created_by: string | null
          delivered_at: string | null
          delivered_quantity: number
          destination_address_id: string | null
          dispatch_key: string | null
          dispatched_at: string | null
          exception_notes: string | null
          expected_delivery_at: string | null
          fulfillment_order_id: string | null
          id: string
          organization_id: string
          picking_task_id: string | null
          sales_order_id: string
          shipment_number: string
          shipped_at: string | null
          shipping_method: string
          source_location_id: string
          status: string
          tracking_code: string | null
          tracking_source: string
          updated_at: string
        }
        Insert: {
          address_snapshot?: Json
          cancel_reason?: string | null
          carrier_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_quantity?: number
          destination_address_id?: string | null
          dispatch_key?: string | null
          dispatched_at?: string | null
          exception_notes?: string | null
          expected_delivery_at?: string | null
          fulfillment_order_id?: string | null
          id?: string
          organization_id: string
          picking_task_id?: string | null
          sales_order_id: string
          shipment_number: string
          shipped_at?: string | null
          shipping_method?: string
          source_location_id: string
          status?: string
          tracking_code?: string | null
          tracking_source?: string
          updated_at?: string
        }
        Update: {
          address_snapshot?: Json
          cancel_reason?: string | null
          carrier_id?: string | null
          created_at?: string
          created_by?: string | null
          delivered_at?: string | null
          delivered_quantity?: number
          destination_address_id?: string | null
          dispatch_key?: string | null
          dispatched_at?: string | null
          exception_notes?: string | null
          expected_delivery_at?: string | null
          fulfillment_order_id?: string | null
          id?: string
          organization_id?: string
          picking_task_id?: string | null
          sales_order_id?: string
          shipment_number?: string
          shipped_at?: string | null
          shipping_method?: string
          source_location_id?: string
          status?: string
          tracking_code?: string | null
          tracking_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_organization_id_carrier_id_fkey"
            columns: ["organization_id", "carrier_id"]
            isOneToOne: false
            referencedRelation: "carriers"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipments_organization_id_destination_address_id_fkey"
            columns: ["organization_id", "destination_address_id"]
            isOneToOne: false
            referencedRelation: "company_addresses"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipments_organization_id_fulfillment_order_id_fkey"
            columns: ["organization_id", "fulfillment_order_id"]
            isOneToOne: false
            referencedRelation: "fulfillment_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipments_organization_id_picking_task_id_fkey"
            columns: ["organization_id", "picking_task_id"]
            isOneToOne: false
            referencedRelation: "picking_tasks"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipments_organization_id_sales_order_id_fkey"
            columns: ["organization_id", "sales_order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "shipments_organization_id_source_location_id_fkey"
            columns: ["organization_id", "source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["organization_id", "id"]
          },
        ]
      }
      supplier_documents: {
        Row: {
          created_at: string
          created_by: string | null
          document_number: string
          document_type: string
          goods_receipt_id: string | null
          id: string
          issue_date: string
          notes: string | null
          organization_id: string
          processed_at: string | null
          purchase_order_id: string | null
          quantity: number | null
          status: string
          storage_path: string | null
          supplier_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          document_number: string
          document_type?: string
          goods_receipt_id?: string | null
          id?: string
          issue_date: string
          notes?: string | null
          organization_id: string
          processed_at?: string | null
          purchase_order_id?: string | null
          quantity?: number | null
          status?: string
          storage_path?: string | null
          supplier_id: string
          total_amount: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          document_number?: string
          document_type?: string
          goods_receipt_id?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          organization_id?: string
          processed_at?: string | null
          purchase_order_id?: string | null
          quantity?: number | null
          status?: string
          storage_path?: string | null
          supplier_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_documents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_documents_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_products: {
        Row: {
          conversion_factor: number | null
          created_at: string
          created_by: string | null
          id: string
          inventory_unit_id: string | null
          last_price: number | null
          last_price_date: string | null
          lead_time_days: number | null
          minimum_order_quantity: number
          order_multiple: number | null
          organization_id: string
          purchase_unit_id: string | null
          status: string
          supplier_description: string | null
          supplier_id: string
          supplier_sku: string
          updated_at: string
          updated_by: string | null
          variant_id: string
        }
        Insert: {
          conversion_factor?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_unit_id?: string | null
          last_price?: number | null
          last_price_date?: string | null
          lead_time_days?: number | null
          minimum_order_quantity?: number
          order_multiple?: number | null
          organization_id: string
          purchase_unit_id?: string | null
          status?: string
          supplier_description?: string | null
          supplier_id: string
          supplier_sku: string
          updated_at?: string
          updated_by?: string | null
          variant_id: string
        }
        Update: {
          conversion_factor?: number | null
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_unit_id?: string | null
          last_price?: number | null
          last_price_date?: string | null
          lead_time_days?: number | null
          minimum_order_quantity?: number
          order_multiple?: number | null
          organization_id?: string
          purchase_unit_id?: string | null
          status?: string
          supplier_description?: string | null
          supplier_id?: string
          supplier_sku?: string
          updated_at?: string
          updated_by?: string | null
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_inventory_unit_id_fkey"
            columns: ["inventory_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_purchase_unit_id_fkey"
            columns: ["purchase_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_products_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "supplier_products_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_profiles: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          currency: string
          default_payment_terms: string | null
          id: string
          lead_time_days: number | null
          minimum_order_value: number
          notes: string | null
          organization_id: string
          preferred: boolean
          status: string
          supplier_code: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_payment_terms?: string | null
          id?: string
          lead_time_days?: number | null
          minimum_order_value?: number
          notes?: string | null
          organization_id: string
          preferred?: boolean
          status?: string
          supplier_code: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          default_payment_terms?: string | null
          id?: string
          lead_time_days?: number | null
          minimum_order_value?: number
          notes?: string | null
          organization_id?: string
          preferred?: boolean
          status?: string
          supplier_code?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_profiles_organization_id_company_id_fkey"
            columns: ["organization_id", "company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["organization_id", "id"]
          },
          {
            foreignKeyName: "supplier_profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_return_items: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          organization_id: string
          quantity: number
          reason: string | null
          supplier_return_id: string
          variant_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          organization_id: string
          quantity: number
          reason?: string | null
          supplier_return_id: string
          variant_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          quantity?: number
          reason?: string | null
          supplier_return_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_return_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_return_items_supplier_return_id_fkey"
            columns: ["supplier_return_id"]
            isOneToOne: false
            referencedRelation: "supplier_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "supplier_return_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_returns: {
        Row: {
          created_at: string
          created_by: string | null
          goods_receipt_id: string | null
          id: string
          organization_id: string
          posted_at: string | null
          posted_by: string | null
          reason: string | null
          return_date: string
          return_number: string
          source_location_id: string | null
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          goods_receipt_id?: string | null
          id?: string
          organization_id: string
          posted_at?: string | null
          posted_by?: string | null
          reason?: string | null
          return_date?: string
          return_number: string
          source_location_id?: string | null
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          goods_receipt_id?: string | null
          id?: string
          organization_id?: string
          posted_at?: string | null
          posted_by?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string
          source_location_id?: string | null
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_posted_by_fkey"
            columns: ["posted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_returns_source_location_id_fkey"
            columns: ["source_location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "supplier_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "supplier_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      unit_conversions: {
        Row: {
          created_at: string
          created_by: string | null
          factor: number
          from_unit_id: string
          id: string
          organization_id: string | null
          to_unit_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          factor: number
          from_unit_id: string
          id?: string
          organization_id?: string | null
          to_unit_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          factor?: number
          from_unit_id?: string
          id?: string
          organization_id?: string | null
          to_unit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "unit_conversions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_from_unit_id_fkey"
            columns: ["from_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "unit_conversions_to_unit_id_fkey"
            columns: ["to_unit_id"]
            isOneToOne: false
            referencedRelation: "units_of_measure"
            referencedColumns: ["id"]
          },
        ]
      }
      units_of_measure: {
        Row: {
          category: Database["public"]["Enums"]["unit_category"]
          code: string
          created_at: string
          created_by: string | null
          decimal_precision: number
          id: string
          name: string
          organization_id: string | null
          status: Database["public"]["Enums"]["unit_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["unit_category"]
          code: string
          created_at?: string
          created_by?: string | null
          decimal_precision?: number
          id?: string
          name: string
          organization_id?: string | null
          status?: Database["public"]["Enums"]["unit_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["unit_category"]
          code?: string
          created_at?: string
          created_by?: string | null
          decimal_precision?: number
          id?: string
          name?: string
          organization_id?: string | null
          status?: Database["public"]["Enums"]["unit_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "units_of_measure_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_of_measure_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "units_of_measure_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          context: Json
          event_id: string
          id: string
          processed: boolean
          provider: string
          received_at: string
          signature_ok: boolean
        }
        Insert: {
          context?: Json
          event_id?: string
          id?: string
          processed?: boolean
          provider: string
          received_at?: string
          signature_ok?: boolean
        }
        Update: {
          context?: Json
          event_id?: string
          id?: string
          processed?: boolean
          provider?: string
          received_at?: string
          signature_ok?: boolean
        }
        Relationships: []
      }
    }
    Views: {
      inventory_balances: {
        Row: {
          batch_id: string | null
          last_movement_at: string | null
          location_id: string | null
          on_hand: number | null
          organization_id: string | null
          variant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "inventory_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["location_id"]
          },
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "inventory_positions"
            referencedColumns: ["variant_id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_positions: {
        Row: {
          barcode: string | null
          below_minimum: boolean | null
          category_id: string | null
          color: string | null
          last_movement_at: string | null
          location_code: string | null
          location_id: string | null
          location_name: string | null
          location_status:
            | Database["public"]["Enums"]["inventory_location_status"]
            | null
          location_type:
            | Database["public"]["Enums"]["inventory_location_type"]
            | null
          minimum_stock: number | null
          on_hand: number | null
          organization_id: string | null
          product_code: string | null
          product_id: string | null
          product_name: string | null
          reorder_point: number | null
          size: string | null
          sku: string | null
          variant_id: string | null
          variant_status:
            | Database["public"]["Enums"]["product_variant_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      company_detail_core: {
        Args: {
          _company: string
          _data: Json
          _id?: string
          _kind: string
          _org: string
        }
        Returns: string
      }
      company_save_core: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
      cost_audit: {
        Args: { _action: string; _context: Json; _id: string; _org: string }
        Returns: undefined
      }
      cost_calculate: {
        Args: { _data: Json; _org: string; _simulate?: boolean }
        Returns: Json
      }
      cost_capture_sale: {
        Args: { _org: string; _reconciliation?: string; _sale: string }
        Returns: string
      }
      cost_compute: {
        Args: {
          _date: string
          _order?: string
          _org: string
          _overrides?: Json
          _variant: string
        }
        Returns: Json
      }
      cost_conversion: {
        Args: { _from: string; _org: string; _to: string }
        Returns: Json
      }
      cost_query: {
        Args: {
          _export?: boolean
          _filters?: Json
          _kind: string
          _org: string
          _page?: number
        }
        Returns: Json
      }
      cost_require: {
        Args: { _org: string; _permission: string }
        Returns: undefined
      }
      cost_save_input: {
        Args: { _data: Json; _kind: string; _org: string }
        Returns: string
      }
      cost_version_action: {
        Args: { _action: string; _id: string; _org: string }
        Returns: Json
      }
      crm_action: {
        Args: {
          _action: string
          _data: Json
          _id: string
          _key: string
          _kind: string
          _org: string
        }
        Returns: Json
      }
      crm_audit: {
        Args: { _action: string; _context: Json; _id: string; _org: string }
        Returns: undefined
      }
      crm_company_access: {
        Args: { _company: string; _org: string }
        Returns: boolean
      }
      crm_document: {
        Args: { _action: string; _data: Json; _org: string }
        Returns: Json
      }
      crm_document_access: {
        Args: { _path: string; _write?: boolean }
        Returns: boolean
      }
      crm_external: { Args: { _org: string }; Returns: boolean }
      crm_financial_position: {
        Args: { _company: string; _org: string }
        Returns: Json
      }
      crm_query: {
        Args: {
          _export?: boolean
          _filters?: Json
          _kind: string
          _org: string
          _page?: number
        }
        Returns: Json
      }
      crm_require: {
        Args: { _org: string; _permission: string }
        Returns: undefined
      }
      crm_save: {
        Args: { _data: Json; _kind: string; _org: string }
        Returns: Json
      }
      crm_visible: {
        Args: { _org: string; _row: Json; _table: string }
        Returns: boolean
      }
      document_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      document_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      document_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
      exception_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      exception_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      fin_create_payable: {
        Args: { _data: Json; _org: string; _user_id?: string }
        Returns: Json
      }
      fin_create_receivable: {
        Args: { _data: Json; _org: string; _user_id?: string }
        Returns: Json
      }
      fin_direct_movement: {
        Args: { _data: Json; _org: string; _user_id?: string }
        Returns: Json
      }
      fin_document_mutate: {
        Args: {
          _data: Json
          _id: string
          _kind: string
          _op: string
          _org: string
          _user_id?: string
        }
        Returns: Json
      }
      fin_generate_recurrences: {
        Args: { _org: string; _period: string; _user_id?: string }
        Returns: Json
      }
      fin_opening_balance: {
        Args: { _data: Json; _org: string; _user_id?: string }
        Returns: Json
      }
      fin_process_reconciliation: {
        Args: { _org: string; _reconciliation_id: string; _user_id?: string }
        Returns: Json
      }
      fin_query: {
        Args: {
          _filters?: Json
          _kind: string
          _org: string
          _page?: number
          _user_id?: string
        }
        Returns: Json
      }
      fin_reverse_transaction: {
        Args: {
          _org: string
          _reason: string
          _transaction_id: string
          _user_id?: string
        }
        Returns: Json
      }
      fin_save_account: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      fin_save_category: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      fin_save_cost_center: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      fin_save_payment_method: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      fin_save_recurrence: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      fin_save_settings: { Args: { _data: Json; _org: string }; Returns: Json }
      fin_settle: {
        Args: {
          _data: Json
          _id: string
          _kind: string
          _org: string
          _user_id?: string
        }
        Returns: Json
      }
      fin_transfer: {
        Args: { _data: Json; _org: string; _user_id?: string }
        Returns: Json
      }
      finance_audit: {
        Args: {
          _action: string
          _context?: Json
          _id: string
          _org: string
          _table: string
        }
        Returns: undefined
      }
      finance_balance: {
        Args: { _account?: string; _at?: string; _org: string }
        Returns: number
      }
      finance_document_open: {
        Args: { _id: string; _kind: string; _org: string }
        Returns: number
      }
      finance_document_paid: {
        Args: { _id: string; _kind: string; _org: string }
        Returns: number
      }
      finance_refresh_document: {
        Args: { _id: string; _kind: string; _org: string }
        Returns: undefined
      }
      finance_require: {
        Args: { _org: string; _permission: string }
        Returns: undefined
      }
      has_org_role: {
        Args: {
          _organization_id: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id?: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: {
          _organization_id: string
          _permission: string
          _user_id?: string
        }
        Returns: boolean
      }
      inventory_actor_options: {
        Args: { _organization_id: string }
        Returns: Json
      }
      inventory_cancel_count: {
        Args: { _count_id: string; _organization_id: string }
        Returns: Json
      }
      inventory_complete_count: {
        Args: { _count_id: string; _organization_id: string; _user_id?: string }
        Returns: Json
      }
      inventory_dashboard: {
        Args: { _from: string; _organization_id: string; _to: string }
        Returns: Json
      }
      inventory_get_balance: {
        Args: {
          _batch_id?: string
          _location_id?: string
          _organization_id: string
          _user_id?: string
          _variant_id: string
        }
        Returns: number
      }
      inventory_list_counts: {
        Args: { _organization_id: string; _page?: number }
        Returns: Json
      }
      inventory_lock: { Args: { _organization_id: string }; Returns: undefined }
      inventory_post_movement: {
        Args: {
          _allow_negative_override?: boolean
          _batch_id?: string
          _direction?: Database["public"]["Enums"]["inventory_movement_direction"]
          _idempotency_key?: string
          _location_id: string
          _movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          _occurred_at?: string
          _organization_id: string
          _quantity: number
          _reason?: string
          _reference_id?: string
          _reference_type?: string
          _unit?: string
          _user_id?: string
          _variant_id: string
        }
        Returns: Json
      }
      inventory_post_movement_internal: {
        Args: {
          _allow_negative_override?: boolean
          _batch_id?: string
          _direction?: Database["public"]["Enums"]["inventory_movement_direction"]
          _idempotency_key?: string
          _location_id: string
          _movement_type: Database["public"]["Enums"]["inventory_movement_type"]
          _occurred_at?: string
          _organization_id: string
          _quantity: number
          _reason?: string
          _reference_id?: string
          _reference_type?: string
          _unit?: string
          _user_id?: string
          _variant_id: string
        }
        Returns: Json
      }
      inventory_post_transfer: {
        Args: {
          _destination_location_id: string
          _idempotency_key?: string
          _items: Json
          _notes?: string
          _organization_id: string
          _source_location_id: string
          _transfer_type?: string
          _user_id?: string
        }
        Returns: Json
      }
      inventory_query_positions: {
        Args: {
          _filters?: Json
          _organization_id: string
          _page?: number
          _page_size?: number
        }
        Returns: Json
      }
      inventory_read_count: {
        Args: { _count_id: string; _organization_id: string }
        Returns: Json
      }
      inventory_reverse_movement: {
        Args: {
          _movement_id: string
          _organization_id: string
          _reason: string
          _user_id?: string
        }
        Returns: Json
      }
      inventory_reverse_movement_core: {
        Args: {
          _movement_id: string
          _organization_id: string
          _reason: string
          _user_id?: string
        }
        Returns: Json
      }
      inventory_save_count_item: {
        Args: {
          _count_id: string
          _item_id: string
          _organization_id: string
          _quantity: number
        }
        Returns: Json
      }
      inventory_search_variants: {
        Args: {
          _active_only?: boolean
          _organization_id: string
          _query?: string
        }
        Returns: Json
      }
      inventory_start_count: {
        Args: { _location_id: string; _organization_id: string }
        Returns: Json
      }
      inventory_transfer_internal: {
        Args: {
          _destination_location_id: string
          _idempotency_key?: string
          _items: Json
          _notes?: string
          _organization_id: string
          _source_location_id: string
          _transfer_type?: string
          _user_id?: string
        }
        Returns: Json
      }
      is_org_member: {
        Args: { _organization_id: string; _user_id?: string }
        Returns: boolean
      }
      marketplace_cancel_sale: {
        Args: {
          _org: string
          _reason: string
          _sale_id: string
          _user_id?: string
        }
        Returns: Json
      }
      marketplace_register_sale: {
        Args: { _data: Json; _org: string; _user_id?: string }
        Returns: Json
      }
      marketplace_save_mapping: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      marketplace_save_store: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      my_organizations: {
        Args: never
        Returns: {
          name: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          slug: string
        }[]
      }
      partner_audit: {
        Args: {
          _action: string
          _context?: Json
          _id: string
          _org: string
          _table: string
        }
        Returns: undefined
      }
      partner_create_operation: {
        Args: { _data: Json; _kind: string; _org: string }
        Returns: string
      }
      partner_document_allowed: {
        Args: { _name: string; _write?: boolean }
        Returns: boolean
      }
      partner_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      partner_receive_return: {
        Args: { _id: string; _org: string }
        Returns: Json
      }
      partner_require: {
        Args: { _org: string; _permission: string }
        Returns: undefined
      }
      partner_save_company: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
      partner_save_detail: {
        Args: {
          _company: string
          _data: Json
          _id?: string
          _kind: string
          _org: string
        }
        Returns: string
      }
      partner_shipment_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      planning_audit: {
        Args: {
          _action: string
          _context?: Json
          _id: string
          _org: string
          _table: string
        }
        Returns: undefined
      }
      planning_availability_save: {
        Args: { _data: Json; _org: string }
        Returns: Json
      }
      planning_ensure_settings: { Args: { _org: string }; Returns: undefined }
      planning_event: {
        Args: { _event: string; _key: string; _org: string; _payload: Json }
        Returns: undefined
      }
      planning_exception_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      planning_execute: { Args: { _data: Json; _org: string }; Returns: Json }
      planning_forecast_adjust_delete: {
        Args: { _id: string; _org: string }
        Returns: Json
      }
      planning_forecast_adjust_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      planning_note: {
        Args: {
          _context?: Json
          _message: string
          _org: string
          _run: string
          _severity: string
          _type: string
          _variant: string
        }
        Returns: undefined
      }
      planning_order_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      planning_query: {
        Args: {
          _export?: boolean
          _filters?: Json
          _kind: string
          _org: string
          _page?: number
        }
        Returns: Json
      }
      planning_require: {
        Args: { _org: string; _permission: string }
        Returns: undefined
      }
      planning_save: {
        Args: { _data: Json; _kind: string; _org: string }
        Returns: Json
      }
      planning_scenario_delete: {
        Args: { _id: string; _org: string }
        Returns: Json
      }
      planning_scenario_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      planning_settings_save: {
        Args: { _data: Json; _org: string }
        Returns: Json
      }
      planning_supplier: {
        Args: {
          _org: string
          _settings: Database["public"]["Tables"]["planning_settings"]["Row"]
          _unit: string
          _variant: string
        }
        Returns: Json
      }
      pln_purchase_lead: {
        Args: {
          _org: string
          _v_scn: Database["public"]["Tables"]["planning_scenarios"]["Row"]
          _v_settings: Database["public"]["Tables"]["planning_settings"]["Row"]
          _variant: string
        }
        Returns: number
      }
      pln_solve: {
        Args: {
          _depth?: number
          _org: string
          _run: string
          _source?: string
          _stack?: string[]
          _v_scn: Database["public"]["Tables"]["planning_scenarios"]["Row"]
          _v_settings: Database["public"]["Tables"]["planning_settings"]["Row"]
          _variant: string
        }
        Returns: undefined
      }
      pln_supplier: { Args: { _org: string; _variant: string }; Returns: Json }
      po_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      po_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      po_receive: {
        Args: { _data?: Json; _org: string; _po_id: string }
        Returns: string
      }
      po_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
      price_link_partner: {
        Args: { _data: Json; _org: string; _user_id?: string }
        Returns: Json
      }
      price_save_item: {
        Args: {
          _data: Json
          _item_id?: string
          _org: string
          _user_id?: string
        }
        Returns: Json
      }
      price_save_table: {
        Args: { _data: Json; _id?: string; _org: string; _user_id?: string }
        Returns: Json
      }
      pricing_math: { Args: { _cost: number; _data: Json }; Returns: Json }
      pricing_publish: { Args: { _data: Json; _org: string }; Returns: string }
      pricing_resolve_table: {
        Args: { _date: string; _org: string; _table: string; _variant: string }
        Returns: Json
      }
      pricing_simulate: { Args: { _data: Json; _org: string }; Returns: Json }
      production_bom_activate: {
        Args: { _bom_id: string; _organization_id: string; _user_id?: string }
        Returns: Json
      }
      production_bom_archive: {
        Args: { _bom_id: string; _organization_id: string; _user_id?: string }
        Returns: Json
      }
      production_bom_delete: {
        Args: { _bom_id: string; _organization_id: string; _user_id?: string }
        Returns: Json
      }
      production_bom_duplicate: {
        Args: {
          _bom_id: string
          _code?: string
          _organization_id: string
          _target_variant_id: string
          _user_id?: string
        }
        Returns: Json
      }
      production_bom_save: {
        Args: {
          _bom_id?: string
          _code?: string
          _items?: Json
          _notes?: string
          _organization_id: string
          _product_variant_id?: string
          _user_id?: string
        }
        Returns: Json
      }
      production_cancel_order: {
        Args: {
          _order_id: string
          _organization_id: string
          _reason: string
          _user_id?: string
        }
        Returns: Json
      }
      production_complete_order: {
        Args: {
          _note?: string
          _order_id: string
          _organization_id: string
          _user_id?: string
        }
        Returns: Json
      }
      production_create_order: {
        Args: {
          _bom_id?: string
          _destination_location_id: string
          _idempotency_key?: string
          _notes?: string
          _organization_id: string
          _planned_end_at?: string
          _planned_quantity: number
          _planned_start_at?: string
          _product_variant_id: string
          _source_location_id: string
          _user_id?: string
        }
        Returns: Json
      }
      production_dashboard: {
        Args: {
          _from: string
          _organization_id: string
          _to: string
          _user_id?: string
        }
        Returns: Json
      }
      production_explode_bom: {
        Args: {
          _bom_id: string
          _organization_id: string
          _quantity: number
          _user_id?: string
        }
        Returns: Json
      }
      production_next_order_code: {
        Args: { _organization_id: string }
        Returns: string
      }
      production_record_consumption: {
        Args: {
          _batch_id?: string
          _idempotency_key?: string
          _location_id?: string
          _notes?: string
          _occurred_at?: string
          _order_id: string
          _order_material_id: string
          _organization_id: string
          _quantity: number
          _user_id?: string
        }
        Returns: Json
      }
      production_record_loss: {
        Args: {
          _batch_id?: string
          _idempotency_key?: string
          _location_id?: string
          _loss_reason_id?: string
          _occurred_at?: string
          _order_id: string
          _organization_id: string
          _quantity: number
          _reason: string
          _user_id?: string
          _variant_id: string
        }
        Returns: Json
      }
      production_record_output: {
        Args: {
          _batch_id?: string
          _idempotency_key?: string
          _location_id?: string
          _notes?: string
          _occurred_at?: string
          _order_id: string
          _organization_id: string
          _quantity_good: number
          _quantity_rejected?: number
          _user_id?: string
        }
        Returns: Json
      }
      production_release_order: {
        Args: {
          _note?: string
          _order_id: string
          _organization_id: string
          _user_id?: string
        }
        Returns: Json
      }
      production_start_order: {
        Args: { _order_id: string; _organization_id: string; _user_id?: string }
        Returns: Json
      }
      profitability_capture: {
        Args: { _data: Json; _org: string }
        Returns: Json
      }
      purchasing_apply_cost_policy: {
        Args: {
          _cost_inv: number
          _date: string
          _inv_unit: string
          _org: string
          _qty_inv: number
          _receipt_number: string
          _variant: string
        }
        Returns: undefined
      }
      purchasing_audit: {
        Args: {
          _action: string
          _context?: Json
          _id: string
          _org: string
          _table: string
        }
        Returns: undefined
      }
      purchasing_create_payable_doc: {
        Args: { _doc_id: string; _org: string }
        Returns: string
      }
      purchasing_create_payables: {
        Args: { _amount?: number; _org: string; _po_id: string }
        Returns: number
      }
      purchasing_ensure_settings: { Args: { _org: string }; Returns: undefined }
      purchasing_find_factor: {
        Args: { _from_unit: string; _to_unit: string }
        Returns: number
      }
      purchasing_po_payable_total: {
        Args: { _org: string; _po_id: string }
        Returns: number
      }
      purchasing_query: { Args: { _kind: string; _org: string }; Returns: Json }
      purchasing_require: {
        Args: { _org: string; _permission: string }
        Returns: undefined
      }
      purchasing_settings_save: {
        Args: { _data: Json; _org: string }
        Returns: Json
      }
      purchasing_split_terms: { Args: { _terms: string }; Returns: number[] }
      quotation_award: {
        Args: { _data: Json; _org: string; _quotation_id: string }
        Returns: Json
      }
      quotation_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      quotation_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
      rec_adjustment: {
        Args: {
          _amount: number
          _org: string
          _reason: string
          _reconciliation_id: string
          _type: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_balance_asof: {
        Args: {
          _asof: string
          _location: string
          _org: string
          _variant: string
        }
        Returns: number
      }
      rec_cancel: {
        Args: {
          _org: string
          _reason?: string
          _reconciliation_id: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_close: {
        Args: {
          _notes?: string
          _org: string
          _reconciliation_id: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_create: {
        Args: { _data: Json; _org: string; _user_id?: string }
        Returns: Json
      }
      rec_eligible_sales: {
        Args: { _from: string; _org: string; _partner: string; _to: string }
        Returns: {
          discount_amount: number
          external_order_id: string
          external_sku: string
          gross_amount: number
          id: string
          platform_fee: number
          quantity: number
          sale_date: string
          shipping_fee: number
          status: string
          store_id: string
          variant_id: string
        }[]
      }
      rec_exception_resolve: {
        Args: {
          _exception_id: string
          _notes?: string
          _org: string
          _resolution: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_preview: {
        Args: {
          _from: string
          _org: string
          _partner: string
          _to: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_process: {
        Args: {
          _item_ids?: string[]
          _limit?: number
          _org: string
          _reconciliation_id: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_process_item: {
        Args: {
          _item_id: string
          _org: string
          _reconciliation_id: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_query: {
        Args: {
          _filters?: Json
          _kind: string
          _org: string
          _page?: number
          _user_id?: string
        }
        Returns: Json
      }
      rec_reopen: {
        Args: {
          _org: string
          _reason: string
          _reconciliation_id: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_reprocess_item: {
        Args: { _item_id: string; _org: string; _user_id?: string }
        Returns: Json
      }
      rec_resolve_price: {
        Args: { _on: string; _org: string; _partner: string; _variant: string }
        Returns: number
      }
      rec_reverse_item: {
        Args: {
          _item_id: string
          _org: string
          _reason: string
          _user_id?: string
        }
        Returns: Json
      }
      rec_sale_net: {
        Args: {
          _discount: number
          _fee: number
          _gross: number
          _shipping: number
        }
        Returns: number
      }
      receipt_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      receipt_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      reconciliation_audit: {
        Args: {
          _action: string
          _context?: Json
          _id: string
          _org: string
          _table: string
        }
        Returns: undefined
      }
      reconciliation_insert_exception: {
        Args: {
          _details?: Json
          _item: string
          _message: string
          _org: string
          _partner: string
          _rec: string
          _sale: string
          _severity: string
          _store: string
          _type: string
          _variant: string
        }
        Returns: undefined
      }
      reconciliation_require: {
        Args: { _org: string; _permission: string }
        Returns: undefined
      }
      replenishment_query: {
        Args: { _filters?: Json; _org: string; _page?: number }
        Returns: Json
      }
      request_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      request_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      request_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
      return_action: {
        Args: { _action: string; _data?: Json; _id: string; _org: string }
        Returns: Json
      }
      return_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      return_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
      sales_audit: {
        Args: {
          _action: string
          _context?: Json
          _id: string
          _org: string
          _table: string
        }
        Returns: undefined
      }
      sales_availability: {
        Args: { _location?: string; _order: string; _org: string }
        Returns: Json
      }
      sales_available: {
        Args: {
          _batch?: string
          _location?: string
          _org: string
          _variant: string
        }
        Returns: number
      }
      sales_carrier_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: Json
      }
      sales_company_activity: {
        Args: { _company: string; _limit?: number; _org: string }
        Returns: Json
      }
      sales_convert_quote: {
        Args: { _data?: Json; _key?: string; _org: string; _quote: string }
        Returns: Json
      }
      sales_create_receivables: {
        Args: { _order: string; _org: string; _trigger: string }
        Returns: number
      }
      sales_credit_check: {
        Args: {
          _amount: number
          _company: string
          _order?: string
          _org: string
        }
        Returns: Json
      }
      sales_dashboard: {
        Args: { _filters?: Json; _org: string }
        Returns: Json
      }
      sales_emit: {
        Args: { _key: string; _org: string; _payload: Json; _type: string }
        Returns: undefined
      }
      sales_ensure_settings: { Args: { _org: string }; Returns: undefined }
      sales_exception_action: {
        Args: {
          _action: string
          _data?: Json
          _exception: string
          _org: string
        }
        Returns: Json
      }
      sales_exception_create: {
        Args: {
          _message: string
          _org: string
          _refs?: Json
          _severity: string
          _type: string
        }
        Returns: Json
      }
      sales_execute: {
        Args: {
          _action: string
          _data: Json
          _id: string
          _key: string
          _operation: string
          _org: string
        }
        Returns: Json
      }
      sales_expire_reservations: {
        Args: { _data?: Json; _org: string }
        Returns: Json
      }
      sales_fulfillment_action: {
        Args: {
          _action: string
          _data?: Json
          _fulfillment: string
          _org: string
        }
        Returns: Json
      }
      sales_fulfillment_create: {
        Args: { _data?: Json; _order: string; _org: string }
        Returns: Json
      }
      sales_insert_order: {
        Args: { _data: Json; _items: Json; _org: string; _quote: string }
        Returns: Json
      }
      sales_next_number: {
        Args: { _kind: string; _org: string }
        Returns: string
      }
      sales_on_hand: {
        Args: {
          _batch?: string
          _location?: string
          _org: string
          _variant: string
        }
        Returns: number
      }
      sales_open_exception: {
        Args: {
          _message: string
          _org: string
          _refs: Json
          _severity: string
          _type: string
        }
        Returns: string
      }
      sales_order_action: {
        Args: { _action: string; _data?: Json; _order: string; _org: string }
        Returns: Json
      }
      sales_order_detail: {
        Args: { _order: string; _org: string }
        Returns: Json
      }
      sales_pack: {
        Args: { _data?: Json; _fulfillment: string; _org: string }
        Returns: Json
      }
      sales_pick_confirm: {
        Args: { _data?: Json; _org: string; _task: string }
        Returns: Json
      }
      sales_pick_scan: {
        Args: { _data?: Json; _org: string; _task: string }
        Returns: Json
      }
      sales_prepare_item: {
        Args: { _as_of: string; _item: Json; _org: string; _table: string }
        Returns: Json
      }
      sales_query: {
        Args: { _filters?: Json; _kind?: string; _org: string }
        Returns: Json
      }
      sales_receivable_total: {
        Args: { _order: string; _org: string }
        Returns: number
      }
      sales_require: {
        Args: { _org: string; _permission: string }
        Returns: undefined
      }
      sales_reservation_action: {
        Args: {
          _action: string
          _data?: Json
          _org: string
          _reservation: string
        }
        Returns: Json
      }
      sales_reserve: {
        Args: { _data?: Json; _order: string; _org: string }
        Returns: Json
      }
      sales_reserved: {
        Args: {
          _batch?: string
          _location?: string
          _org: string
          _variant: string
        }
        Returns: number
      }
      sales_return_action: {
        Args: { _action: string; _data?: Json; _org: string; _ret: string }
        Returns: Json
      }
      sales_return_create: {
        Args: { _data?: Json; _order: string; _org: string }
        Returns: Json
      }
      sales_save: { Args: { _data: Json; _org: string }; Returns: Json }
      sales_settings: { Args: { _org: string }; Returns: Json }
      sales_settings_save: {
        Args: { _data: Json; _org: string }
        Returns: Json
      }
      sales_shipment_action: {
        Args: { _action: string; _data?: Json; _org: string; _shipment: string }
        Returns: Json
      }
      sales_shipment_create: {
        Args: { _data?: Json; _order: string; _org: string }
        Returns: Json
      }
      sales_shipment_dispatch: {
        Args: { _data?: Json; _org: string; _shipment: string }
        Returns: Json
      }
      sales_validate_order: {
        Args: { _order: string; _org: string }
        Returns: Json
      }
      supplier_product_save: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
      supplier_query: {
        Args: { _filters?: Json; _kind: string; _org: string; _page?: number }
        Returns: Json
      }
      supplier_save_company: {
        Args: { _data: Json; _id?: string; _org: string }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "gestor"
        | "financeiro"
        | "estoque"
        | "producao"
        | "comercial"
        | "marketplace"
      bom_status: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED"
      inventory_batch_status: "ACTIVE" | "EXPIRED" | "DISABLED"
      inventory_count_item_status: "PENDING" | "COUNTED" | "ADJUSTED"
      inventory_count_status:
        | "DRAFT"
        | "IN_PROGRESS"
        | "REVIEW"
        | "COMPLETED"
        | "CANCELED"
      inventory_location_status: "ACTIVE" | "INACTIVE"
      inventory_location_type:
        | "FACTORY"
        | "WAREHOUSE"
        | "OWN_STORE"
        | "MARKETPLACE"
        | "PARTNER"
        | "TRANSIT"
        | "OTHER"
      inventory_movement_direction: "IN" | "OUT"
      inventory_movement_status: "PENDING" | "POSTED" | "REVERSED" | "CANCELED"
      inventory_movement_type:
        | "OPENING_BALANCE"
        | "PURCHASE_RECEIPT"
        | "PRODUCTION_OUTPUT"
        | "PRODUCTION_CONSUMPTION"
        | "SALE"
        | "SALE_RETURN"
        | "PARTNER_SHIPMENT"
        | "PARTNER_RETURN"
        | "TRANSFER_IN"
        | "TRANSFER_OUT"
        | "ADJUSTMENT_IN"
        | "ADJUSTMENT_OUT"
        | "LOSS"
        | "MANUAL_CORRECTION"
        | "REVERSAL"
        | "PURCHASE_RETURN"
      inventory_transfer_status:
        | "DRAFT"
        | "PENDING"
        | "APPROVED"
        | "IN_TRANSIT"
        | "COMPLETED"
        | "CANCELED"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      item_type:
        | "FINISHED_GOOD"
        | "RAW_MATERIAL"
        | "COMPONENT"
        | "PACKAGING"
        | "SEMI_FINISHED_GOOD"
      product_status: "ACTIVE" | "INACTIVE" | "DISCONTINUED" | "DRAFT"
      product_variant_status: "ACTIVE" | "INACTIVE" | "DISCONTINUED" | "DRAFT"
      production_order_status:
        | "DRAFT"
        | "PLANNED"
        | "RELEASED"
        | "IN_PROGRESS"
        | "COMPLETED"
        | "CANCELED"
      unit_category:
        | "COUNT"
        | "MASS"
        | "LENGTH"
        | "VOLUME"
        | "AREA"
        | "TIME"
        | "OTHER"
      unit_status: "ACTIVE" | "INACTIVE"
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
      app_role: [
        "admin",
        "gestor",
        "financeiro",
        "estoque",
        "producao",
        "comercial",
        "marketplace",
      ],
      bom_status: ["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"],
      inventory_batch_status: ["ACTIVE", "EXPIRED", "DISABLED"],
      inventory_count_item_status: ["PENDING", "COUNTED", "ADJUSTED"],
      inventory_count_status: [
        "DRAFT",
        "IN_PROGRESS",
        "REVIEW",
        "COMPLETED",
        "CANCELED",
      ],
      inventory_location_status: ["ACTIVE", "INACTIVE"],
      inventory_location_type: [
        "FACTORY",
        "WAREHOUSE",
        "OWN_STORE",
        "MARKETPLACE",
        "PARTNER",
        "TRANSIT",
        "OTHER",
      ],
      inventory_movement_direction: ["IN", "OUT"],
      inventory_movement_status: ["PENDING", "POSTED", "REVERSED", "CANCELED"],
      inventory_movement_type: [
        "OPENING_BALANCE",
        "PURCHASE_RECEIPT",
        "PRODUCTION_OUTPUT",
        "PRODUCTION_CONSUMPTION",
        "SALE",
        "SALE_RETURN",
        "PARTNER_SHIPMENT",
        "PARTNER_RETURN",
        "TRANSFER_IN",
        "TRANSFER_OUT",
        "ADJUSTMENT_IN",
        "ADJUSTMENT_OUT",
        "LOSS",
        "MANUAL_CORRECTION",
        "REVERSAL",
        "PURCHASE_RETURN",
      ],
      inventory_transfer_status: [
        "DRAFT",
        "PENDING",
        "APPROVED",
        "IN_TRANSIT",
        "COMPLETED",
        "CANCELED",
      ],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      item_type: [
        "FINISHED_GOOD",
        "RAW_MATERIAL",
        "COMPONENT",
        "PACKAGING",
        "SEMI_FINISHED_GOOD",
      ],
      product_status: ["ACTIVE", "INACTIVE", "DISCONTINUED", "DRAFT"],
      product_variant_status: ["ACTIVE", "INACTIVE", "DISCONTINUED", "DRAFT"],
      production_order_status: [
        "DRAFT",
        "PLANNED",
        "RELEASED",
        "IN_PROGRESS",
        "COMPLETED",
        "CANCELED",
      ],
      unit_category: [
        "COUNT",
        "MASS",
        "LENGTH",
        "VOLUME",
        "AREA",
        "TIME",
        "OTHER",
      ],
      unit_status: ["ACTIVE", "INACTIVE"],
    },
  },
} as const
