package main

import (
	"context"
	"log"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	ginadapter "github.com/awslabs/aws-lambda-go-api-proxy/gin"

	"github.com/claimcoach/backend/internal/api"
	"github.com/claimcoach/backend/internal/config"
	"github.com/claimcoach/backend/internal/database"
)

var ginLambda *ginadapter.GinLambdaV2

func init() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := database.RunMigrations(db); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	router, err := api.NewRouter(cfg, db)
	if err != nil {
		log.Fatalf("Failed to create router: %v", err)
	}

	ginLambda = ginadapter.NewV2(router)
}

func handler(ctx context.Context, req events.APIGatewayV2HTTPRequest) (events.APIGatewayV2HTTPResponse, error) {
	return ginLambda.ProxyWithContext(ctx, req)
}

func main() {
	lambda.Start(handler)
}
