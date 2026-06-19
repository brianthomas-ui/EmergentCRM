/**
 * Shared API types for the Emergent Upsell CRM.
 *
 * These interfaces mirror the backend Pydantic response models in
 * `backend/server.py` (UserOut, LeadOut, MeetingOut, PaymentOut, etc.).
 * The frontend is plain JavaScript, so these are consumed via JSDoc, e.g.:
 *
 *   /** @type {import('@/types').Lead} *\/
 *   const lead = res.data;
 *
 * Keep this file in sync with the backend response models.
 */

export type Role = "admin" | "agent";

export type Stage =
  | "New Booking"
  | "Assigned"
  | "Meeting Completed"
  | "Payment Link Sent"
  | "Won"
  | "Lost"
  | "Follow-up Later";

export type Priority = "Hot" | "Follow-up This Week" | "Payment Pending" | "None";

export type UsageTrend = "rising" | "stable" | "declining";

export type Region = "North America" | "Europe" | "APAC" | "LATAM" | "MEA" | "Other";

export type BookingDriver =
  | "Support"
  | "Lifetime Access"
  | "Top-Up Credits"
  | "Discount"
  | "Pricing / Upgrade"
  | "Feature Request"
  | "Renewal"
  | "Onboarding Help"
  | "Other";

export type Currency = "usd" | "inr";

export type PaymentProvider = "stripe" | "razorpay";

export type PaymentStatus = "pending" | "paid" | "none" | "link_sent";

export type MeetingStatus = "scheduled" | "completed" | "no_show" | "cancelled";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar_url?: string;
  monthly_target?: number;
  weekly_target?: number;
  active?: boolean;
  created_at?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface Note {
  id: string;
  text: string;
  type: "Note" | "Call Outcome" | "Follow-up";
  author: string;
  created_at: string;
}

export interface OwnershipEntry {
  from: string | null;
  to: string;
  by: string;
  at: string;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  company?: string;
  phone?: string;
  plan?: string;
  monthly_spend: number;
  lifetime_value: number;
  usage_trend: UsageTrend;
  product_history?: string[];
  source: string;
  region: Region;
  priority: Priority;
  stage: Stage;
  owner_id: string | null;
  owner_name: string | null;
  owner_locked: boolean;
  total_revenue_usd: number;
  deals_won: number;
  upsell_cycles: number;
  payment_status: PaymentStatus;
  last_meeting_at: string | null;
  next_meeting_at: string | null;
  won_at?: string | null;
  notes?: Note[];
  ownership_history?: OwnershipEntry[];
  created_at: string;
  updated_at: string;
}

export interface Meeting {
  id: string;
  lead_id: string;
  lead_name: string;
  agent_id: string;
  agent_name: string;
  scheduled_at: string;
  duration: number;
  status: MeetingStatus;
  source: string;
  booking_driver?: string;
  no_show_reason?: string;
  reschedule_status?: string;
  outcome_notes?: string;
  completed_at?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  lead_id: string;
  lead_name: string;
  agent_id: string;
  agent_name: string;
  provider: PaymentProvider;
  amount: number;
  currency: Currency;
  amount_usd: number;
  fx_rate: number;
  description?: string;
  status: string;
  payment_status: PaymentStatus;
  session_id: string | null;
  payment_link: string | null;
  created_at: string;
  updated_at: string;
}

export interface Activity {
  id: string;
  lead_id: string;
  type: string;
  description: string;
  actor: string;
  created_at: string;
}

export interface LeadDetail {
  lead: Lead;
  activities: Activity[];
  meetings: Meeting[];
  payments: Payment[];
}

export interface Campaign {
  id: string;
  name: string;
  segment_label: string;
  min_spend: number;
  template_subject: string;
  template_body: string;
  recipient_count: number;
  sent_count: number;
  opened_count: number;
  replied_count: number;
  booked_count: number;
  status: "draft" | "sent";
  created_by: string;
  created_at: string;
  sent_at?: string;
}

export interface Settings {
  inr_per_usd: number;
}

export interface AuditLog {
  id: string;
  action: string;
  actor: string;
  target: string;
  details?: string;
  created_at: string;
}

export interface Meta {
  stages: Stage[];
  priorities: Priority[];
  booking_drivers: BookingDriver[];
}

export interface CoverageGroup {
  label: string;
  total: number;
  assigned: number;
  met: number;
  advanced: number;
  won: number;
  revenue_usd: number;
}

export interface BurnupPoint {
  week: string;
  date?: string;
  total: number;
  covered: number;
  won: number;
}

export interface Coverage {
  tiers: string[];
  regions: Region[];
  by_tier_spend: CoverageGroup[];
  by_tier_ltv: CoverageGroup[];
  by_region: CoverageGroup[];
  burnup: BurnupPoint[];
  totals: CoverageGroup;
}

export interface BookingDriverStat {
  driver: string;
  meetings: number;
  completed: number;
  won: number;
}

export interface AgentStat {
  id: string;
  name: string;
  avatar_url?: string;
  leads: number;
  won: number;
  meetings: number;
  revenue: number;
  target: number;
}

export interface Dashboard {
  is_admin: boolean;
  total_leads: number;
  stage_counts: Record<Stage, number>;
  meetings_today: number;
  meetings_today_list: Meeting[];
  completed_today: number;
  noshow_today: number;
  revenue_won: number;
  pipeline_value: number;
  payment_pending: number;
  follow_up: number;
  hot: number;
  target: number;
  weekly_target: number;
  won_count: number;
  booking_drivers: BookingDriverStat[];
  team_target?: number;
  per_agent?: AgentStat[];
}
