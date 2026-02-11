package models

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Date is a custom type that handles both date-only strings ("2006-01-02")
// and full RFC3339 timestamps during JSON unmarshaling
type Date struct {
	time.Time
}

// UnmarshalJSON implements the json.Unmarshaler interface
// It accepts both "2006-01-02" date format and full RFC3339 timestamps
func (d *Date) UnmarshalJSON(b []byte) error {
	// Remove quotes from the JSON string
	s := strings.Trim(string(b), "\"")

	if s == "null" || s == "" {
		return nil
	}

	// Try parsing as date-only first (YYYY-MM-DD)
	t, err := time.Parse("2006-01-02", s)
	if err == nil {
		d.Time = t
		return nil
	}

	// If that fails, try parsing as RFC3339 timestamp
	t, err = time.Parse(time.RFC3339, s)
	if err == nil {
		d.Time = t
		return nil
	}

	// If both fail, return an error
	return fmt.Errorf("invalid date format: expected YYYY-MM-DD or RFC3339, got %s", s)
}

// MarshalJSON implements the json.Marshaler interface
// It outputs the date in RFC3339 format
func (d Date) MarshalJSON() ([]byte, error) {
	if d.Time.IsZero() {
		return []byte("null"), nil
	}
	return json.Marshal(d.Time.Format(time.RFC3339))
}

// ToTime returns the underlying time.Time value
func (d Date) ToTime() time.Time {
	return d.Time
}
