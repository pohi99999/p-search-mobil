export interface BusinessProfile {
  id: string;
  user_id: string;
  company_name: string;
  tax_number: string | null;
  industry_code: string | null;
  employee_count: number | null;
  yearly_revenue: number | null;
  goals: string | null;
  created_at: string;
  updated_at: string;
}

export interface Grant {
  id: string;
  title: string;
  description: string | null;
  provider: string | null;
  grant_type: string | null;
  amount_min: number | null;
  amount_max: number | null;
  deadline: string | null;
  eligibility_criteria: string | null;
  source_url: string | null;
  created_at: string;
}

export interface GrantMatch {
  id: string;
  business_id: string;
  grant_id: string;
  match_score: number;
  match_reasoning: string | null;
  status: string;
  created_at: string;
}

export interface UserProfile {
  id: string;
  subscription_tier: string;
  search_frequency: string;
  search_count: number;
}

export interface ActionPlan {
  id: string;
  business_profile_id: string;
  match_id: string | null;
  title: string;
  ai_context: {
    generated_document_html?: string;
    [key: string]: unknown;
  };
  created_at: string;
  updated_at: string;
}

export type ActionTaskStatus = 'todo' | 'in_progress' | 'done';

export interface ActionTask {
  id: string;
  plan_id: string;
  title: string;
  description: string | null;
  status: ActionTaskStatus;
  order_index: number;
  created_at: string;
  updated_at: string;
}
