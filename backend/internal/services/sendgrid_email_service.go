package services

import (
	"fmt"

	"github.com/claimcoach/backend/internal/models"
	"github.com/sendgrid/sendgrid-go"
	"github.com/sendgrid/sendgrid-go/helpers/mail"
)

// SendGridEmailService is a production email service using SendGrid
type SendGridEmailService struct {
	apiKey          string
	fromEmail       string
	fromName        string
	claimCoachEmail string
	appURL          string
}

// NewSendGridEmailService creates a new SendGrid email service
func NewSendGridEmailService(apiKey, fromEmail, fromName, claimCoachEmail, appURL string) *SendGridEmailService {
	return &SendGridEmailService{
		apiKey:          apiKey,
		fromEmail:       fromEmail,
		fromName:        fromName,
		claimCoachEmail: claimCoachEmail,
		appURL:          appURL,
	}
}

// SendMagicLinkEmail sends a magic link email using SendGrid
func (s *SendGridEmailService) SendMagicLinkEmail(input SendMagicLinkEmailInput) error {
	from := mail.NewEmail(s.fromName, s.fromEmail)
	to := mail.NewEmail(input.ContractorName, input.To)
	subject := fmt.Sprintf("Upload Request - %s Claim", input.LossType)

	plainText := plainTextEmailTemplate(input)
	htmlContent := htmlEmailTemplate(input)

	message := mail.NewSingleEmail(from, subject, to, plainText, htmlContent)
	client := sendgrid.NewSendClient(s.apiKey)

	response, err := client.Send(message)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	if response.StatusCode >= 400 {
		return fmt.Errorf("email service error: %d - %s", response.StatusCode, response.Body)
	}

	return nil
}

// SendMeetingNotification sends a meeting notification email using SendGrid
func (s *SendGridEmailService) SendMeetingNotification(input SendMeetingNotificationInput) error {
	from := mail.NewEmail(s.fromName, s.fromEmail)
	to := mail.NewEmail(input.RecipientName, input.To)
	subject := fmt.Sprintf("Meeting Scheduled - %s", input.MeetingType)

	plainText := plainTextMeetingTemplate(input)
	htmlContent := htmlMeetingTemplate(input)

	message := mail.NewSingleEmail(from, subject, to, plainText, htmlContent)
	client := sendgrid.NewSendClient(s.apiKey)

	response, err := client.Send(message)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	if response.StatusCode >= 400 {
		return fmt.Errorf("email service error: %d - %s", response.StatusCode, response.Body)
	}

	return nil
}

// htmlMeetingTemplate returns the HTML email template for meeting notifications
func htmlMeetingTemplate(input SendMeetingNotificationInput) string {
	adjusterSection := ""
	if input.AdjusterName != "" {
		adjusterSection = fmt.Sprintf(`<p style="margin: 5px 0;"><strong>Adjuster:</strong> %s</p>`, input.AdjusterName)
	}

	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Meeting Scheduled - ClaimCoach AI</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #2563eb; margin-top: 0;">ClaimCoach AI</h1>

            <p>Hi %s,</p>

            <p>A meeting has been scheduled for a property claim:</p>

            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                <p style="margin: 5px 0;"><strong>Claim:</strong> %s</p>
                <p style="margin: 5px 0;"><strong>Property:</strong> %s</p>
                <p style="margin: 5px 0;"><strong>Meeting Type:</strong> %s</p>
                <hr style="margin: 15px 0; border: none; border-top: 1px solid #d1d5db;">
                <p style="margin: 5px 0;"><strong>📅 Date:</strong> %s</p>
                <p style="margin: 5px 0;"><strong>🕐 Time:</strong> %s</p>
                <p style="margin: 5px 0;"><strong>📍 Location:</strong> %s</p>
                %s
            </div>

            <p>Please confirm your attendance or contact us if you need to reschedule.</p>

            <p>Thank you!<br>
            <strong>ClaimCoach AI Team</strong></p>

            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">

            <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">
                This email was sent by ClaimCoach AI. If you did not expect this email,
                please contact the property manager.
            </p>
        </div>
    </div>
</body>
</html>`,
		input.RecipientName,
		input.ClaimNumber,
		input.PropertyAddress,
		input.MeetingType,
		input.MeetingDate,
		input.MeetingTime,
		input.Location,
		adjusterSection,
	)
}

// plainTextMeetingTemplate returns the plain text email template for meeting notifications
func plainTextMeetingTemplate(input SendMeetingNotificationInput) string {
	adjusterLine := ""
	if input.AdjusterName != "" {
		adjusterLine = fmt.Sprintf("\nAdjuster: %s", input.AdjusterName)
	}

	return fmt.Sprintf(`Hi %s,

A meeting has been scheduled for a property claim:

Claim: %s
Property: %s
Meeting Type: %s

Date: %s
Time: %s
Location: %s%s

Please confirm your attendance or contact us if you need to reschedule.

Thank you!
ClaimCoach AI Team

---
This email was sent by ClaimCoach AI. If you did not expect this email, please contact the property manager.`,
		input.RecipientName,
		input.ClaimNumber,
		input.PropertyAddress,
		input.MeetingType,
		input.MeetingDate,
		input.MeetingTime,
		input.Location,
		adjusterLine,
	)
}

// SendClaimCoachNotification sends a notification email to ClaimCoach team when a claim is ready to file
func (s *SendGridEmailService) SendClaimCoachNotification(claim *models.Claim) error {
	if claim.Property == nil {
		return fmt.Errorf("claim property relationship not loaded")
	}
	if claim.Policy == nil {
		return fmt.Errorf("claim policy relationship not loaded")
	}

	subject := fmt.Sprintf("New Claim Ready to File - %s", claim.Property.LegalAddress)

	lossTypeDisplay := "Unknown"
	if claim.LossType == "water" {
		lossTypeDisplay = "💧 Water Damage"
	} else if claim.LossType == "hail" {
		lossTypeDisplay = "🧊 Hail Damage"
	}

	incidentDateFormatted := claim.IncidentDate.Format("January 2, 2006")

	description := "No description provided"
	if claim.Description != nil {
		description = *claim.Description
	}

	deductible := claim.Policy.DeductibleCalculated

	estimateTotal := 0.0
	estimateDisplay := "Pending estimate"
	if claim.ContractorEstimateTotal != nil {
		estimateTotal = *claim.ContractorEstimateTotal
		estimateDisplay = fmt.Sprintf("$%.2f", estimateTotal)
	}

	amountAboveDeductible := 0.0
	if estimateTotal > 0 {
		amountAboveDeductible = estimateTotal - deductible
		if amountAboveDeductible < 0 {
			amountAboveDeductible = 0
		}
	}

	carrierName := "Not specified"
	if claim.Policy.CarrierName != "" {
		carrierName = claim.Policy.CarrierName
	}

	policyNumber := "Not specified"
	if claim.Policy.PolicyNumber != nil {
		policyNumber = *claim.Policy.PolicyNumber
	}

	ownerEntity := "Not specified"
	if claim.Property.OwnerEntityName != "" {
		ownerEntity = claim.Property.OwnerEntityName
	}

	body := fmt.Sprintf(`
	<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
		<h2 style="color: #1e3a8a;">New Claim Submission</h2>

		<h3 style="color: #475569; margin-top: 24px;">Property Information</h3>
		<ul style="line-height: 1.6;">
			<li><strong>Address:</strong> %s</li>
			<li><strong>Owner:</strong> %s</li>
		</ul>

		<h3 style="color: #475569; margin-top: 24px;">Claim Details</h3>
		<ul style="line-height: 1.6;">
			<li><strong>Loss Type:</strong> %s</li>
			<li><strong>Incident Date:</strong> %s</li>
			<li><strong>Description:</strong> %s</li>
		</ul>

		<h3 style="color: #475569; margin-top: 24px;">Financial Summary</h3>
		<ul style="line-height: 1.6;">
			<li><strong>Policy Deductible:</strong> $%.2f</li>
			<li><strong>Contractor Estimate:</strong> %s</li>
			<li><strong>Amount Above Deductible:</strong> $%.2f</li>
		</ul>

		<h3 style="color: #475569; margin-top: 24px;">Insurance Information</h3>
		<ul style="line-height: 1.6;">
			<li><strong>Carrier:</strong> %s</li>
			<li><strong>Policy Number:</strong> %s</li>
		</ul>

		<p style="margin-top: 24px;">
			<a href="%s/claims/%s" style="background-color: #1e3a8a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Claim in Dashboard</a>
		</p>
	</div>
	`,
		claim.Property.LegalAddress,
		ownerEntity,
		lossTypeDisplay,
		incidentDateFormatted,
		description,
		deductible,
		estimateDisplay,
		amountAboveDeductible,
		carrierName,
		policyNumber,
		s.appURL,
		claim.ID,
	)

	return s.sendEmail(s.claimCoachEmail, subject, body)
}

// sendEmail is a helper method that sends an email via SendGrid
func (s *SendGridEmailService) sendEmail(to, subject, htmlBody string) error {
	from := mail.NewEmail(s.fromName, s.fromEmail)
	toEmail := mail.NewEmail("", to)

	message := mail.NewSingleEmail(from, subject, toEmail, "", htmlBody)
	client := sendgrid.NewSendClient(s.apiKey)

	response, err := client.Send(message)
	if err != nil {
		return fmt.Errorf("failed to send email: %w", err)
	}

	if response.StatusCode >= 400 {
		return fmt.Errorf("email service error: %d - %s", response.StatusCode, response.Body)
	}

	return nil
}
