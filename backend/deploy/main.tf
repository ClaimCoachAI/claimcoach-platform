terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "claimcoach-terraform-state"
    key            = "claimcoach-platform/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "claimcoach-terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region
}

# Extract Supabase project ID for reference (used in outputs)
locals {
  supabase_project_id = regex("https://([^.]+).supabase.co", var.supabase_url)[0]
  supabase_jwks_uri   = "https://${local.supabase_project_id}.supabase.co/auth/v1/jwks"
}

# Import pre-existing resources so Terraform doesn't try to recreate them
import {
  to = aws_iam_role.lambda_role
  id = "claimcoach-lambda-role"
}

import {
  to = aws_cloudwatch_log_group.api_gateway_logs
  id = "/aws/apigateway/claimcoach-api"
}

# IAM Role for Lambda
resource "aws_iam_role" "lambda_role" {
  name = "${var.project_name}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name        = "${var.project_name}-lambda-role"
    Project     = var.project_name
    Environment = var.environment
  }
}

# IAM Policy for Lambda to write CloudWatch Logs
resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda_logs" {
  name              = "/aws/lambda/${var.project_name}-prod-api"
  retention_in_days = var.log_retention_days

  tags = {
    Name        = "${var.project_name}-lambda-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

# CloudWatch Log Group for API Gateway
resource "aws_cloudwatch_log_group" "api_gateway_logs" {
  name              = "/aws/apigateway/${var.project_name}-api"
  retention_in_days = var.log_retention_days

  tags = {
    Name        = "${var.project_name}-api-gateway-logs"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Lambda Function
resource "aws_lambda_function" "api" {
  filename         = "${path.module}/../dist/bootstrap.zip"
  function_name    = "${var.project_name}-prod-api"
  role             = aws_iam_role.lambda_role.arn
  handler          = "bootstrap"
  runtime          = "provided.al2023"
  source_code_hash = filebase64sha256("${path.module}/../dist/bootstrap.zip")
  timeout          = var.lambda_timeout
  memory_size      = var.lambda_memory_size
  architectures    = ["arm64"]

  environment {
    variables = {
      DATABASE_URL        = var.database_url
      SUPABASE_URL        = var.supabase_url
      SUPABASE_SERVICE_KEY = var.supabase_service_key
      SUPABASE_JWT_SECRET = var.supabase_jwt_secret
      FRONTEND_URL        = var.frontend_url
      ALLOWED_ORIGINS     = var.frontend_url
      PERPLEXITY_API_KEY  = var.perplexity_api_key
      SENDGRID_API_KEY    = var.sendgrid_api_key
      SENDGRID_FROM_EMAIL = var.sendgrid_from_email
      SENDGRID_FROM_NAME  = var.sendgrid_from_name
      CLAIMCOACH_EMAIL    = var.claimcoach_email
    }
  }

  tags = {
    Name        = "${var.project_name}-api"
    Project     = var.project_name
    Environment = var.environment
  }

  depends_on = [
    aws_cloudwatch_log_group.lambda_logs,
    aws_iam_role_policy_attachment.lambda_basic_execution,
  ]
}

# HTTP API Gateway (API Gateway v2)
resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
  description   = "ClaimCoach AI HTTP API Gateway"

  cors_configuration {
    allow_origins     = [var.frontend_url]
    allow_methods     = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    allow_headers     = ["Content-Type", "Authorization", "X-Amz-Date", "X-Api-Key", "X-Amz-Security-Token"]
    allow_credentials = true
    max_age           = 300
  }

  tags = {
    Name        = "${var.project_name}-api"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Lambda Integration
resource "aws_apigatewayv2_integration" "lambda" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# Default catch-all route
resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.lambda.id}"
}

# Stage
resource "aws_apigatewayv2_stage" "api" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_gateway_logs.arn
    format = jsonencode({
      requestId      = "$context.requestId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
      errorMessage   = "$context.error.message"
    })
  }

  tags = {
    Name        = "${var.project_name}-api-stage"
    Project     = var.project_name
    Environment = var.environment
  }
}

# Lambda Permission for HTTP API Gateway
resource "aws_lambda_permission" "api_gateway" {
  statement_id  = "AllowHTTPAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
