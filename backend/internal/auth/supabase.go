package auth

import (
	"fmt"

	supabase "github.com/supabase-community/supabase-go"
)

type SupabaseClient struct {
	client *supabase.Client
	// Removed jwtSecret - token verification done by Supabase API
}

func NewSupabaseClient(url, serviceKey, jwtSecret string) (*SupabaseClient, error) {
	client, err := supabase.NewClient(url, serviceKey, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create supabase client: %w", err)
	}

	return &SupabaseClient{
		client: client,
	}, nil
}

func (s *SupabaseClient) VerifyToken(token string) (string, error) {
	// Verify JWT token and extract user ID
	// Set the token on the client to authenticate the GetUser request
	authClient := s.client.Auth.WithToken(token)

	user, err := authClient.GetUser()
	if err != nil {
		return "", fmt.Errorf("invalid token: %w", err)
	}

	return user.ID.String(), nil
}

type SupabaseUser struct {
	ID    string
	Email string
}

func (s *SupabaseClient) GetUser(token string) (*SupabaseUser, error) {
	authClient := s.client.Auth.WithToken(token)

	user, err := authClient.GetUser()
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &SupabaseUser{
		ID:    user.ID.String(),
		Email: user.Email,
	}, nil
}
