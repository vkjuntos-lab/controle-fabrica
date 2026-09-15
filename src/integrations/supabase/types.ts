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
          updated_at?: string
        }
        Relationships: []
      }
      customers: {
        Row: {
          cashback: number
          cpf: string
          created_at: string
          id: string
          name: string
          phone: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          cashback?: number
          cpf: string
          created_at?: string
          id?: string
          name: string
          phone?: string | null
          tier?: string
          updated_at?: string
        }
        Update: {
          cashback?: number
          cpf?: string
          created_at?: string
          id?: string
          name?: string
          phone?: string | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_lots: {
        Row: {
          created_at: string
          id: string
          lot_code: string
          product_id: string
          qty: number
          updated_at: string
          validity: string
        }
        Insert: {
          created_at?: string
          id?: string
          lot_code: string
          product_id: string
          qty?: number
          updated_at?: string
          validity: string
        }
        Update: {
          created_at?: string
          id?: string
          lot_code?: string
          product_id?: string
          qty?: number
          updated_at?: string
          validity?: string
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
        ]
      }
      products: {
        Row: {
          active: boolean
          created_at: string
          ean: string | null
          id: string
          name: string
          sku: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          ean?: string | null
          id?: string
          name: string
          sku: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          ean?: string | null
          id?: string
          name?: string
          sku?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
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
          payments: Json
          session_id: string | null
          total: number
        }
        Insert: {
          cashback_used?: number
          code: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lines?: Json
          operator?: string | null
          payments?: Json
          session_id?: string | null
          total?: number
        }
        Update: {
          cashback_used?: number
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          lines?: Json
          operator?: string | null
          payments?: Json
          session_id?: string | null
          total?: number
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
          qty: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["stock_movement_kind"]
          lot_id: string
          note?: string | null
          operator?: string | null
          qty: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["stock_movement_kind"]
          lot_id?: string
          note?: string | null
          operator?: string | null
          qty?: number
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
        ]
      }
      stores: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
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
    }
    Functions: {
      __setup_exec: { Args: { sql: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier"
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
      app_role: ["admin", "manager", "cashier"],
      stock_movement_kind: ["entry", "sale", "adjust"],
    },
  },
} as const
