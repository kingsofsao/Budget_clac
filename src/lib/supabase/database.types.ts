
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "expense_participants": {
                  Row: {
                    "expense_id": string,"member_id": string,"share_paise": number,"split_value": number | null,"trip_id": string
                  }
                  Insert: {
                    "expense_id": string,"member_id": string,"share_paise": number,"split_value"?: number | null,"trip_id": string
                  }
                  Update: {
                    "expense_id"?: string,"member_id"?: string,"share_paise"?: number,"split_value"?: number | null,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_participants_expense_fkey"
      columns: ["trip_id","expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["trip_id","id"]
    },{
      foreignKeyName: "expense_participants_member_fkey"
      columns: ["trip_id","member_id"]
isOneToOne: false
      referencedRelation: "trip_members"
      referencedColumns: ["trip_id","id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount_paise": number,"category": string,"created_at": string,"created_by": string | null,"description": string,"expense_date": string,"id": string,"notes": string | null,"paid_by_member_id": string,"split_method": string,"trip_id": string,"updated_at": string,"updated_by": string | null
                  }
                  Insert: {
                    "amount_paise": number,"category": string,"created_at"?: string,"created_by"?: string | null,"description": string,"expense_date": string,"id"?: string,"notes"?: string | null,"paid_by_member_id": string,"split_method": string,"trip_id": string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "amount_paise"?: number,"category"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"expense_date"?: string,"id"?: string,"notes"?: string | null,"paid_by_member_id"?: string,"split_method"?: string,"trip_id"?: string,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_payer_fkey"
      columns: ["trip_id","paid_by_member_id"]
isOneToOne: false
      referencedRelation: "trip_members"
      referencedColumns: ["trip_id","id"]
    },{
      foreignKeyName: "expenses_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string | null,"id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"display_name"?: string | null,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string | null,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"settlement_payments": {
                  Row: {
                    "amount_paise": number,"created_at": string,"created_by": string | null,"from_member_id": string,"id": string,"note": string | null,"paid_on": string,"to_member_id": string,"trip_id": string
                  }
                  Insert: {
                    "amount_paise": number,"created_at"?: string,"created_by"?: string | null,"from_member_id": string,"id"?: string,"note"?: string | null,"paid_on": string,"to_member_id": string,"trip_id": string
                  }
                  Update: {
                    "amount_paise"?: number,"created_at"?: string,"created_by"?: string | null,"from_member_id"?: string,"id"?: string,"note"?: string | null,"paid_on"?: string,"to_member_id"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlement_payments_from_fkey"
      columns: ["trip_id","from_member_id"]
isOneToOne: false
      referencedRelation: "trip_members"
      referencedColumns: ["trip_id","id"]
    },{
      foreignKeyName: "settlement_payments_to_fkey"
      columns: ["trip_id","to_member_id"]
isOneToOne: false
      referencedRelation: "trip_members"
      referencedColumns: ["trip_id","id"]
    },{
      foreignKeyName: "settlement_payments_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_access": {
                  Row: {
                    "joined_at": string,"last_accessed_at": string,"role": string,"trip_id": string,"user_id": string
                  }
                  Insert: {
                    "joined_at"?: string,"last_accessed_at"?: string,"role"?: string,"trip_id": string,"user_id": string
                  }
                  Update: {
                    "joined_at"?: string,"last_accessed_at"?: string,"role"?: string,"trip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_access_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_activity": {
                  Row: {
                    "action": string,"actor_name": string,"actor_user_id": string | null,"amount_paise": number | null,"created_at": string,"id": number,"previous_amount_paise": number | null,"subject": string | null,"trip_id": string
                  }
                  Insert: {
                    "action": string,"actor_name": string,"actor_user_id"?: string | null,"amount_paise"?: number | null,"created_at"?: string,"id"?: never,"previous_amount_paise"?: number | null,"subject"?: string | null,"trip_id": string
                  }
                  Update: {
                    "action"?: string,"actor_name"?: string,"actor_user_id"?: string | null,"amount_paise"?: number | null,"created_at"?: string,"id"?: never,"previous_amount_paise"?: number | null,"subject"?: string | null,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_activity_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trip_members": {
                  Row: {
                    "color": string,"display_name": string,"email": string | null,"id": string,"joined_at": string,"position": number,"trip_id": string,"user_id": string | null
                  }
                  Insert: {
                    "color": string,"display_name": string,"email"?: string | null,"id"?: string,"joined_at"?: string,"position": number,"trip_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "color"?: string,"display_name"?: string,"email"?: string | null,"id"?: string,"joined_at"?: string,"position"?: number,"trip_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_members_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string | null,"end_date": string,"id": string,"name": string,"public_code": string,"start_date": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"end_date": string,"id"?: string,"name": string,"public_code": string,"start_date": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string | null,"end_date"?: string,"id"?: string,"name"?: string,"public_code"?: string,"start_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "add_member":
{ Args: { "p_claim"?: boolean,"p_email": string,"p_name": string,"p_trip_id": string }; Returns: string
                           },
"claim_member":
{ Args: { "p_claim"?: boolean,"p_member_id": string }; Returns: undefined
                           },
"create_trip":
{ Args: { "p_creator_name": string,"p_description": string,"p_end_date": string,"p_name": string,"p_start_date": string }; Returns: {
              "public_code": string,"trip_id": string
            }[]
                           },
"delete_expense":
{ Args: { "p_expense_id": string }; Returns: undefined
                           },
"delete_payment":
{ Args: { "p_payment_id": string }; Returns: undefined
                           },
"delete_trip":
{ Args: { "p_trip_id": string }; Returns: undefined
                           },
"get_trip_preview":
{ Args: { "p_code": string }; Returns: {
              "end_date": string,"is_member": boolean,"member_count": number,"name": string,"start_date": string
            }[]
                           },
"join_trip":
{ Args: { "p_code": string }; Returns: string
                           },
"leave_trip":
{ Args: { "p_trip_id": string }; Returns: undefined
                           },
"list_my_trips":
{ Args: { "p_limit"?: number }; Returns: {
              "end_date": string,"expense_count": number,"last_accessed_at": string,"member_count": number,"name": string,"public_code": string,"role": string,"start_date": string,"total_paise": number,"updated_at": string
            }[]
                           },
"record_payment":
{ Args: { "p_amount_paise": number,"p_from_member_id": string,"p_note": string,"p_paid_on": string,"p_to_member_id": string,"p_trip_id": string }; Returns: string
                           },
"regenerate_trip_code":
{ Args: { "p_trip_id": string }; Returns: string
                           },
"remove_member":
{ Args: { "p_member_id": string }; Returns: undefined
                           },
"save_expense":
{ Args: { "p_amount_paise": number,"p_category": string,"p_description": string,"p_expense_date": string,"p_expense_id": string,"p_notes": string,"p_paid_by_member_id": string,"p_shares": Json,"p_split_method": string,"p_trip_id": string }; Returns: string
                           },
"set_display_name":
{ Args: { "p_name": string }; Returns: undefined
                           },
"touch_trip":
{ Args: { "p_trip_id": string }; Returns: undefined
                           },
"update_member":
{ Args: { "p_email": string,"p_member_id": string,"p_name": string }; Returns: undefined
                           },
"update_trip":
{ Args: { "p_description": string,"p_end_date": string,"p_name": string,"p_start_date": string,"p_trip_id": string }; Returns: undefined
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
