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
