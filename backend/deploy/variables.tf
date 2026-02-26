variable "aws_region" {
  description = "AWS region to deploy resources"
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "claimcoach"
}

variable "environment" {
  description = "Environment name (e.g., production, staging, dev)"
  type        = string
  default     = "production"
}

variable "frontend_url" {
  description = "Frontend URL for CORS configuration and Lambda env var"
  type        = string
}

variable "database_url" {
  description = "Postgres database connection URL (Supabase connection string)"
  type        = string
  sensitive   = true
}

variable "supabase_url" {
  description = "Supabase project URL"
  type        = string
}

variable "supabase_service_key" {
  description = "Supabase service role key"
  type        = string
  sensitive   = true
}

variable "supabase_jwt_secret" {
  description = "Supabase JWT secret (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "perplexity_api_key" {
  description = "Perplexity API key for AI analysis features (optional)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "sendgrid_api_key" {
  description = "SendGrid API key for email (optional - falls back to mock)"
  type        = string
  sensitive   = true
  default     = ""
}

variable "sendgrid_from_email" {
  description = "From email address for SendGrid"
  type        = string
  default     = "claims@claimcoach.ai"
}

variable "sendgrid_from_name" {
  description = "From name for SendGrid emails"
  type        = string
  default     = "ClaimCoach AI"
}

variable "claimcoach_email" {
  description = "Internal ClaimCoach email address"
  type        = string
  default     = "jesse@claimcoach.ai"
}

variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 30
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 512
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 7
}
