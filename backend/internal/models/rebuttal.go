package models

import "time"

type Rebuttal struct {
	ID            string    `json:"id" db:"id"`
	AuditReportID string    `json:"audit_report_id" db:"audit_report_id"`
	Content       string    `json:"content" db:"content"`
	CreatedAt     time.Time `json:"created_at" db:"created_at"`
	UpdatedAt     time.Time `json:"updated_at" db:"updated_at"`
}
