# Email Notification Setup Guide

## Overview

The ClaimCoach AI system sends email notifications to contractors when property managers generate magic links for document uploads. This guide explains how to configure email services for production.

## Current Implementation (MVP)

**Status:** Mock email service (development only)

The current implementation uses `MockEmailService` which logs email details to the console instead of sending actual emails. This is suitable for development and testing but must be replaced with a real email service for production.

### What the Mock Service Does

- Logs all email details to server console
- Shows contractor name, email, property info
- Displays the magic link URL
- Confirms expiration time
- Does NOT send actual emails

### Example Console Output

```
=======================================================
📧 EMAIL NOTIFICATION (MOCK - Development Only)
=======================================================
To: contractor@example.com
Subject: Upload Request - Water Damage Claim

--- Email Body ---
Hi John Smith,

We need your help uploading photos and an estimate for a property claim:

  Property: Sunset Apartments
  Address: 123 Main St, Unit 4B
  Loss Type: Water Damage

Please upload your photos and estimate using this secure link:
  🔗 http://localhost:5173/upload/abc-123-xyz

⚠️  IMPORTANT: This link expires on Wed, Feb 7, 2026 at 2:30 PM PST (72 hours)
...
=======================================================
```

## Production Email Services

For production deployment, you need to configure one of the following email services:

### Option 1: SendGrid (Recommended for MVP)

**Pros:**
- Easy to set up and use
- Reliable delivery
- Good free tier (100 emails/day)
- Excellent documentation
- Email templates and analytics

**Cons:**
- Costs increase with volume
- Requires account verification

**Setup Steps:**

1. **Create SendGrid Account**
   - Sign up at https://sendgrid.com
   - Verify your email and account
   - Complete sender identity verification

2. **Get API Key**
   - Navigate to Settings → API Keys
   - Create a new API key with "Mail Send" permissions
   - Save the API key securely

3. **Verify Sender Domain (Recommended)**
   - Go to Settings → Sender Authentication
   - Verify your sending domain (e.g., claimcoach.ai)
   - Add DNS records to your domain
   - Wait for verification (usually < 24 hours)

4. **Update Environment Variables**
   ```bash
   EMAIL_SERVICE=sendgrid
   SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxx
   SENDGRID_FROM_EMAIL=noreply@claimcoach.ai
   SENDGRID_FROM_NAME=ClaimCoach AI
   ```

5. **Update Code in `router.go`**
   ```go
   // Replace MockEmailService with SendGridEmailService
   emailService := services.NewSendGridEmailService(
       cfg.SendGridAPIKey,
       cfg.SendGridFromEmail,
       cfg.SendGridFromName,
   )
   ```

6. **Add SendGrid Dependency**
   ```bash
   go get github.com/sendgrid/sendgrid-go
   ```

### Option 2: AWS SES

**Pros:**
- Very cost-effective ($0.10 per 1000 emails)
- Highly scalable
- Good for high-volume applications
- Integrates with other AWS services

**Cons:**
- More complex setup
- Starts in sandbox mode (limited sending)
- Requires AWS account and configuration
- More technical to implement

**Setup Steps:**

1. **Configure AWS Account**
   - Create/login to AWS account
   - Navigate to Amazon SES
   - Request production access (removes sandbox limits)

2. **Verify Sender Domain**
   - Add and verify your domain in SES
   - Configure DKIM and SPF records
   - Wait for verification

3. **Get AWS Credentials**
   - Create IAM user with SES permissions
   - Get Access Key ID and Secret Access Key
   - Store credentials securely

4. **Update Environment Variables**
   ```bash
   EMAIL_SERVICE=aws_ses
   AWS_SES_REGION=us-east-1
   AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
   AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
   AWS_SES_FROM_EMAIL=noreply@claimcoach.ai
   ```

5. **Update Code**
   - Implement `AWSEmailService` (see example in email_service.go)
   - Update router.go to use AWS service

6. **Add AWS SDK**
   ```bash
   go get github.com/aws/aws-sdk-go/service/ses
   ```

### Option 3: Supabase Email (SMTP)

**Pros:**
- Already using Supabase for other services
- Integrated with your stack
- Custom email templates in dashboard

**Cons:**
- Requires SMTP configuration
- Less flexible than dedicated email services
- May have limitations on customization

**Setup Steps:**

1. **Configure Supabase SMTP**
   - Go to Supabase Dashboard → Authentication
   - Navigate to Email Templates
   - Configure SMTP settings (or use Supabase's default)

2. **Create Custom Email Template**
   - Add magic link email template in dashboard
   - Use variables for dynamic content

3. **Update Code**
   - Use Supabase Admin API to send emails
   - Reference template by name

## Implementation Checklist

When implementing a production email service:

- [ ] Choose email service provider
- [ ] Create and verify account
- [ ] Configure sender domain/email
- [ ] Get API credentials
- [ ] Add credentials to environment variables
- [ ] Implement email service class (see examples in email_service.go)
- [ ] Update router.go to use real service instead of mock
- [ ] Add required Go dependencies
- [ ] Test email delivery in staging environment
- [ ] Check spam folder and deliverability
- [ ] Monitor email delivery rates
- [ ] Set up email tracking/analytics (optional)
- [ ] Configure bounce/complaint handling (optional)

## Email Content

The magic link email includes:

- **Subject:** "Upload Request - [Loss Type] Claim"
- **Greeting:** Personalized with contractor name
- **Property Details:** Name, address, loss type
- **Magic Link:** Secure upload link (valid 72 hours)
- **Expiration Notice:** Clear warning about link expiry
- **Call to Action:** Button/link to upload portal
- **Support Info:** Contact property manager for questions

Both HTML and plain text versions are provided for better compatibility.

## Testing

### Development Testing (Mock Service)

1. Generate a magic link via API
2. Check server console for email log
3. Verify all details are correct
4. Test the magic link URL manually

### Production Testing

1. **Initial Test:**
   - Send test email to your own email address
   - Check inbox AND spam folder
   - Verify email formatting and links

2. **Deliverability Test:**
   - Test with different email providers (Gmail, Outlook, Yahoo)
   - Check spam scores using tools like Mail-Tester
   - Verify SPF and DKIM records are properly configured

3. **Integration Test:**
   - Generate magic link through full workflow
   - Confirm email is received
   - Test magic link functionality
   - Verify contractor can upload documents

## Monitoring

For production, consider monitoring:

- Email delivery success rate
- Bounce rate
- Spam complaints
- Open rate (optional, for engagement tracking)
- Link click rate
- Time between email send and contractor upload

## Security Considerations

- **Never log API keys** or credentials
- Store credentials in environment variables only
- Use verified sender domains to avoid spam
- Implement rate limiting to prevent abuse
- Monitor for suspicious email patterns
- Consider implementing email allowlist/blocklist

## Troubleshooting

### Emails Not Sending

1. Check API credentials are correct
2. Verify sender domain is verified
3. Check service provider status/limits
4. Review error logs for specific errors
5. Test with curl/Postman directly to email API

### Emails Going to Spam

1. Verify SPF, DKIM, and DMARC records
2. Use verified sender domain (not generic Gmail)
3. Avoid spam trigger words in subject/body
4. Ensure proper HTML formatting
5. Include unsubscribe link (if required)
6. Warm up your sending domain gradually

### High Bounce Rate

1. Validate email addresses before sending
2. Implement double opt-in (if applicable)
3. Remove invalid addresses from future sends
4. Check for typos in contractor emails

## Cost Estimation

**SendGrid:**
- Free: 100 emails/day
- Essentials: $19.95/month (50K emails)
- Pro: $89.95/month (100K emails)

**AWS SES:**
- $0.10 per 1,000 emails sent
- First 62,000 emails/month free (if sent from EC2)
- Very economical for high volume

**Supabase:**
- Included in Supabase plan
- Check your specific plan limits

## Next Steps

1. Choose email service provider based on your needs
2. Follow setup steps for chosen provider
3. Implement the email service class
4. Update router.go configuration
5. Test thoroughly in staging
6. Monitor delivery in production
7. Optimize based on metrics

## Support Resources

- **SendGrid Docs:** https://docs.sendgrid.com
- **AWS SES Docs:** https://docs.aws.amazon.com/ses
- **Supabase Docs:** https://supabase.com/docs/guides/auth/auth-smtp
- **Email Deliverability:** https://www.mail-tester.com

## Questions?

If you have questions about email setup:
1. Check provider documentation
2. Review error logs
3. Test with debugging enabled
4. Contact provider support if needed
