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
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_count_items: {
        Row: {
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
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transfer_items: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          quantity: number
          transfer_id: string
          variant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          quantity?: number
          transfer_id?: string
          variant_id?: string
        }
        Relationships: [
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
          sell_price: number | null
          size: string | null
          sku: string
          status: Database["public"]["Enums"]["product_variant_status"]
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
          sell_price?: number | null
          size?: string | null
          sku: string
          status?: Database["public"]["Enums"]["product_variant_status"]
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
          sell_price?: number | null
          size?: string | null
          sku?: string
          status?: Database["public"]["Enums"]["product_variant_status"]
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
            referencedRelation: "products"
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
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      __apply_migration_sql: { Args: { _sql: string }; Returns: undefined }
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
      inventory_complete_count: {
        Args: { _count_id: string; _organization_id: string; _user_id?: string }
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
      inventory_reverse_movement: {
        Args: {
          _movement_id: string
          _organization_id: string
          _reason: string
          _user_id?: string
        }
        Returns: Json
      }
      is_org_member: {
        Args: { _organization_id: string; _user_id?: string }
        Returns: boolean
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
      inventory_transfer_status:
        | "DRAFT"
        | "PENDING"
        | "APPROVED"
        | "IN_TRANSIT"
        | "COMPLETED"
        | "CANCELED"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      product_status: "ACTIVE" | "INACTIVE" | "DISCONTINUED" | "DRAFT"
      product_variant_status: "ACTIVE" | "INACTIVE" | "DISCONTINUED" | "DRAFT"
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
      product_status: ["ACTIVE", "INACTIVE", "DISCONTINUED", "DRAFT"],
      product_variant_status: ["ACTIVE", "INACTIVE", "DISCONTINUED", "DRAFT"],
    },
  },
} as const
