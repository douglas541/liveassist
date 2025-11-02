export interface User {
  id: number;
  telegram_id: string;
  name: string | null;
  created_at: string;
}

export interface Specification {
  id: number;
  type: string;
  user_id: number;
  created_at: string;
  updated_at: string;
  spec_json: string;
  active: boolean;
}

export interface SpecificationData {
  metadata: {
    version: string;
    description: string;
    capabilities: string[];
  };
  record_model: any;
  llm_instructions: {
    system_prompt: string;
    context_guidelines: string[];
    response_templates?: { [key: string]: string };
  };
  [key: string]: any;
}

export interface Record {
  id: number;
  spec_id: number;
  user_id: number;
  created_at: string;
  record_json: string;
  processed_at: string | null;
}

export interface Reminder {
  id: number;
  spec_id: number;
  user_id: number;
  reminder_type: 'one_time' | 'recurring' | 'interval';
  next_execution: string;
  reminder_config: string;
  message_template: string | null;
  action_config: string | null;
  record_id: number | null;
  active: boolean;
}

export interface LLMResponse {
  action: string;
  data?: any;
  response: string;
}

export interface Food {
  name: string;
  quantity: number;
  unit: string;
}

export interface NutritionInfo {
  calories: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  fiber_g: number;
}

