package models

import "time"

type RCVDemandLetter struct {
	ID                string     `json:"id" db:"id"`
	ClaimID           string     `json:"claim_id" db:"claim_id"`
	PaymentID         *string    `json:"payment_id" db:"payment_id"`
	Content           string     `json:"content" db:"content"`
	ACVReceived       *float64   `json:"acv_received" db:"acv_received"`
	RCVExpected       *float64   `json:"rcv_expected" db:"rcv_expected"`
	RCVOutstanding    *float64   `json:"rcv_outstanding" db:"rcv_outstanding"`
	CreatedByUserID   string     `json:"created_by_user_id" db:"created_by_user_id"`
	CreatedAt         time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt         time.Time  `json:"updated_at" db:"updated_at"`
	SentAt            *time.Time `json:"sent_at" db:"sent_at"`
	SentToEmail       *string    `json:"sent_to_email" db:"sent_to_email"`
}
