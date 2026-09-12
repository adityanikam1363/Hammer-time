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
      boundary_frames: {
        Row: {
          breached: boolean
          frame_index: number
          left_boundary: Json
          offset_left_px: number
          offset_right_px: number
          right_boundary: Json
          session_id: string
          timestamp_sec: number
          tire_left: Json
          tire_right: Json
        }
        Insert: {
          breached: boolean
          frame_index: number
          left_boundary: Json
          offset_left_px: number
          offset_right_px: number
          right_boundary: Json
          session_id: string
          timestamp_sec: number
          tire_left: Json
          tire_right: Json
        }
        Update: {
          breached?: boolean
          frame_index?: number
          left_boundary?: Json
          offset_left_px?: number
          offset_right_px?: number
          right_boundary?: Json
          session_id?: string
          timestamp_sec?: number
          tire_left?: Json
          tire_right?: Json
        }
        Relationships: [
          {
            foreignKeyName: "boundary_frames_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_points: {
        Row: {
          session_id: string
          timestamp_sec: number
          turn_number: number
          x_pct: number
          y_pct: number
        }
        Insert: {
          session_id: string
          timestamp_sec: number
          turn_number: number
          x_pct: number
          y_pct: number
        }
        Update: {
          session_id?: string
          timestamp_sec?: number
          turn_number?: number
          x_pct?: number
          y_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "calibration_points_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_frames: {
        Row: {
          created_at: string
          frame_height: number
          frame_index: number
          frame_width: number
          id: number
          left_boundary_px: Json
          right_boundary_px: Json
          seg_confidence: number
          session_id: string | null
          timestamp_sec: number
          tire_left_px: Json
          tire_right_px: Json
        }
        Insert: {
          created_at?: string
          frame_height: number
          frame_index: number
          frame_width: number
          id?: never
          left_boundary_px: Json
          right_boundary_px: Json
          seg_confidence: number
          session_id?: string | null
          timestamp_sec: number
          tire_left_px: Json
          tire_right_px: Json
        }
        Update: {
          created_at?: string
          frame_height?: number
          frame_index?: number
          frame_width?: number
          id?: never
          left_boundary_px?: Json
          right_boundary_px?: Json
          seg_confidence?: number
          session_id?: string | null
          timestamp_sec?: number
          tire_left_px?: Json
          tire_right_px?: Json
        }
        Relationships: [
          {
            foreignKeyName: "raw_frames_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          duration_sec: number
          id: string
          status: string
          track_slug: string
          video_url: string | null
        }
        Insert: {
          created_at?: string
          duration_sec: number
          id?: string
          status?: string
          track_slug?: string
          video_url?: string | null
        }
        Update: {
          created_at?: string
          duration_sec?: number
          id?: string
          status?: string
          track_slug?: string
          video_url?: string | null
        }
        Relationships: []
      }
      violations: {
        Row: {
          clip_url: string | null
          confidence: number
          created_at: string
          id: string
          offset_px: number
          session_id: string | null
          side: string
          status: string
          timestamp_sec: number
          turn_number: number
        }
        Insert: {
          clip_url?: string | null
          confidence: number
          created_at?: string
          id: string
          offset_px: number
          session_id?: string | null
          side: string
          status?: string
          timestamp_sec: number
          turn_number: number
        }
        Update: {
          clip_url?: string | null
          confidence?: number
          created_at?: string
          id?: string
          offset_px?: number
          session_id?: string | null
          side?: string
          status?: string
          timestamp_sec?: number
          turn_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "violations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
