output "api_gateway_url" {
  description = "HTTP API Gateway invoke URL"
  value       = aws_apigatewayv2_stage.api.invoke_url
}

output "api_gateway_id" {
  description = "HTTP API Gateway ID"
  value       = aws_apigatewayv2_api.api.id
}

output "lambda_function_name" {
  description = "Lambda function name"
  value       = aws_lambda_function.api.function_name
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.api.arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group name for Lambda"
  value       = aws_cloudwatch_log_group.lambda_logs.name
}

output "supabase_jwks_uri" {
  description = "Supabase JWKS URI for JWT validation reference"
  value       = local.supabase_jwks_uri
}
