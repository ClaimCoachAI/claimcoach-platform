package services

import (
	"fmt"
	"log"
	"time"
)

// EmailService defines the interface for sending emails
type EmailService interface {
	SendMagicLinkEmail(input SendMagicLinkEmailInput) error
	SendMeetingNotification(input SendMeetingNotificationInput) error
}

// SendMagicLinkEmailInput contains all data needed to send a magic link email
type SendMagicLinkEmailInput struct {
	To              string
	ContractorName  string
	PropertyName    string
	PropertyAddress string
	LossType        string
	MagicLinkURL    string
	ExpiresAt       time.Time
}

// SendMeetingNotificationInput contains all data needed to send a meeting notification email
type SendMeetingNotificationInput struct {
	To              string
	RecipientName   string
	MeetingType     string
	MeetingDate     string
	MeetingTime     string
	Location        string
	PropertyAddress string
	ClaimNumber     string
	AdjusterName    string
}

// MockEmailService is a development implementation that logs email details
// TODO: Replace with real email service in production
// Options:
//   - SendGrid: Popular, reliable, easy to integrate
//   - AWS SES: Cost-effective for high volume
//   - Supabase SMTP: Requires dashboard configuration
type MockEmailService struct{}

// NewMockEmailService creates a new mock email service
func NewMockEmailService() *MockEmailService {
	return &MockEmailService{}
}

// SendMagicLinkEmail logs email details to console for development
func (s *MockEmailService) SendMagicLinkEmail(input SendMagicLinkEmailInput) error {
	log.Println("=======================================================")
	log.Println("📧 EMAIL NOTIFICATION (MOCK - Development Only)")
	log.Println("=======================================================")
	log.Printf("To: %s", input.To)
	log.Printf("Subject: Upload Request - %s Claim", input.LossType)
	log.Println("")
	log.Println("--- Email Body ---")
	log.Printf("Hi %s,", input.ContractorName)
	log.Println("")
	log.Println("We need your help uploading photos and an estimate for a property claim:")
	log.Println("")
	log.Printf("  Property: %s", input.PropertyName)
	log.Printf("  Address: %s", input.PropertyAddress)
	log.Printf("  Loss Type: %s", input.LossType)
	log.Println("")
	log.Println("Please upload your photos and estimate using this secure link:")
	log.Printf("  🔗 %s", input.MagicLinkURL)
	log.Println("")
	log.Printf("⚠️  IMPORTANT: This link expires on %s (72 hours)", input.ExpiresAt.Format("Mon, Jan 2, 2006 at 3:04 PM MST"))
	log.Println("")
	log.Println("If you have any questions, please contact the property manager.")
	log.Println("")
	log.Println("Thank you!")
	log.Println("ClaimCoach AI Team")
	log.Println("=======================================================")
	log.Println("")

	// TODO: In production, replace with actual email sending logic
	// Example for SendGrid:
	//   client := sendgrid.NewSendClient(apiKey)
	//   message := mail.NewSingleEmail(from, subject, to, plainText, htmlContent)
	//   response, err := client.Send(message)
	//
	// Example for AWS SES:
	//   sess := session.Must(session.NewSession())
	//   svc := ses.New(sess)
	//   input := &ses.SendEmailInput{...}
	//   result, err := svc.SendEmail(input)
	//
	// Example for Supabase:
	//   Requires configuring SMTP settings in Supabase dashboard
	//   Use Supabase Admin API to send custom emails

	return nil
}

// SendMeetingNotification logs meeting notification to console for development
func (s *MockEmailService) SendMeetingNotification(input SendMeetingNotificationInput) error {
	log.Println("=======================================================")
	log.Println("📧 MEETING NOTIFICATION (MOCK - Development Only)")
	log.Println("=======================================================")
	log.Printf("To: %s", input.To)
	log.Printf("Subject: Meeting Scheduled - %s", input.MeetingType)
	log.Println("")
	log.Println("--- Email Body ---")
	log.Printf("Hi %s,", input.RecipientName)
	log.Println("")
	log.Println("A meeting has been scheduled for a property claim:")
	log.Println("")
	log.Printf("  Claim: %s", input.ClaimNumber)
	log.Printf("  Property: %s", input.PropertyAddress)
	log.Printf("  Meeting Type: %s", input.MeetingType)
	log.Printf("  Date: %s", input.MeetingDate)
	log.Printf("  Time: %s", input.MeetingTime)
	log.Printf("  Location: %s", input.Location)
	if input.AdjusterName != "" {
		log.Printf("  Adjuster: %s", input.AdjusterName)
	}
	log.Println("")
	log.Println("Please confirm your attendance or contact us if you need to reschedule.")
	log.Println("")
	log.Println("Thank you!")
	log.Println("ClaimCoach AI Team")
	log.Println("=======================================================")
	log.Println("")

	return nil
}

// htmlEmailTemplate returns the HTML email template for magic link emails
// This will be used when implementing a real email service
func htmlEmailTemplate(input SendMagicLinkEmailInput) string {
	return fmt.Sprintf(`<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Upload Request - ClaimCoach AI</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f5f5f5;">
    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h1 style="color: #2563eb; margin-top: 0;">ClaimCoach AI</h1>
            
            <p>Hi %s,</p>
            
            <p>We need your help uploading photos and an estimate for a property claim:</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                <p style="margin: 5px 0;"><strong>Property:</strong> %s</p>
                <p style="margin: 5px 0;"><strong>Address:</strong> %s</p>
                <p style="margin: 5px 0;"><strong>Loss Type:</strong> %s</p>
            </div>
            
            <p style="margin-top: 30px;"><strong>Please upload your photos and estimate using this secure link:</strong></p>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="%s" 
                   style="background: #2563eb; color: white; padding: 15px 30px; 
                          text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                    Upload Photos & Estimate
                </a>
            </div>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e;">
                    <strong>⚠️ Important:</strong> This link expires on <strong>%s</strong> (72 hours from now).
                </p>
            </div>
            
            <p>If you have any questions, please contact the property manager.</p>
            
            <p>Thank you!<br>
            <strong>ClaimCoach AI Team</strong></p>
            
            <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
            
            <p style="font-size: 12px; color: #6b7280; margin-bottom: 0;">
                This email was sent by ClaimCoach AI. If you did not expect this email, 
                please ignore it or contact the property manager.
            </p>
        </div>
    </div>
</body>
</html>`,
		input.ContractorName,
		input.PropertyName,
		input.PropertyAddress,
		input.LossType,
		input.MagicLinkURL,
		input.ExpiresAt.Format("Monday, January 2, 2006 at 3:04 PM MST"),
	)
}

// plainTextEmailTemplate returns the plain text email template for magic link emails
func plainTextEmailTemplate(input SendMagicLinkEmailInput) string {
	return fmt.Sprintf(`Hi %s,

We need your help uploading photos and an estimate for a property claim:

Property: %s
Address: %s
Loss Type: %s

Please upload your photos and estimate using this secure link:
%s

IMPORTANT: This link expires on %s (72 hours from now).

If you have any questions, please contact the property manager.

Thank you!
ClaimCoach AI Team

---
This email was sent by ClaimCoach AI. If you did not expect this email, please ignore it or contact the property manager.`,
		input.ContractorName,
		input.PropertyName,
		input.PropertyAddress,
		input.LossType,
		input.MagicLinkURL,
		input.ExpiresAt.Format("Monday, January 2, 2006 at 3:04 PM MST"),
	)
}

// Production Email Service Examples:
//
// 1. SendGrid Implementation:
// type SendGridEmailService struct {
//     apiKey string
//     fromEmail string
//     fromName string
// }
//
// func NewSendGridEmailService(apiKey, fromEmail, fromName string) *SendGridEmailService {
//     return &SendGridEmailService{
//         apiKey: apiKey,
//         fromEmail: fromEmail,
//         fromName: fromName,
//     }
// }
//
// func (s *SendGridEmailService) SendMagicLinkEmail(input SendMagicLinkEmailInput) error {
//     from := mail.NewEmail(s.fromName, s.fromEmail)
//     to := mail.NewEmail(input.ContractorName, input.To)
//     subject := fmt.Sprintf("Upload Request - %s Claim", input.LossType)
//     plainText := plainTextEmailTemplate(input)
//     htmlContent := htmlEmailTemplate(input)
//     
//     message := mail.NewSingleEmail(from, subject, to, plainText, htmlContent)
//     client := sendgrid.NewSendClient(s.apiKey)
//     
//     response, err := client.Send(message)
//     if err != nil {
//         return fmt.Errorf("failed to send email: %w", err)
//     }
//     
//     if response.StatusCode >= 400 {
//         return fmt.Errorf("email service error: %d", response.StatusCode)
//     }
//     
//     return nil
// }
//
// 2. AWS SES Implementation:
// type AWSEmailService struct {
//     sesClient *ses.SES
//     fromEmail string
// }
//
// func NewAWSEmailService(awsConfig aws.Config, fromEmail string) *AWSEmailService {
//     return &AWSEmailService{
//         sesClient: ses.New(session.New(&awsConfig)),
//         fromEmail: fromEmail,
//     }
// }
//
// func (s *AWSEmailService) SendMagicLinkEmail(input SendMagicLinkEmailInput) error {
//     subject := fmt.Sprintf("Upload Request - %s Claim", input.LossType)
//     plainText := plainTextEmailTemplate(input)
//     htmlContent := htmlEmailTemplate(input)
//     
//     emailInput := &ses.SendEmailInput{
//         Source: aws.String(s.fromEmail),
//         Destination: &ses.Destination{
//             ToAddresses: []*string{aws.String(input.To)},
//         },
//         Message: &ses.Message{
//             Subject: &ses.Content{Data: aws.String(subject)},
//             Body: &ses.Body{
//                 Text: &ses.Content{Data: aws.String(plainText)},
//                 Html: &ses.Content{Data: aws.String(htmlContent)},
//             },
//         },
//     }
//     
//     _, err := s.sesClient.SendEmail(emailInput)
//     return err
// }
