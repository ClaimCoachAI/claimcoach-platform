# Deployment Notes for Bug Fixes

## Changes Made

### Backend (Go)
1. **audit_service.go**
   - Added comprehensive logging throughout estimate generation pipeline
   - Enhanced error messages for missing scope sheet and API configuration
   - Added success/failure logging for each major operation

2. **lambda_invoker.go**
   - Added logging for async Lambda invocations
   - Track function name and payload details
   - Log success/failure of invocations

3. **inspection_service.go**
   - Added logging for automatic step advancement
   - Track when all 4 elevation photos trigger step 3 advancement
   - Added log import

### Frontend (TypeScript/React)
1. **useWizardV2State.ts**
   - Added retry mechanism with exponential backoff (3 attempts)
   - Enhanced error handling with user notifications
   - Added step change detection polling
   - Improved error logging

2. **useWizardNavigation.ts** (New file)
   - Custom hook to prevent navigation race conditions
   - Implements navigation queue for pending requests
   - Provides canNavigate() check

## Pre-deployment Checklist

### Before Deploying
- [ ] Backend compiles successfully: `go build ./cmd/server/main.go`
- [ ] Frontend builds successfully: `npm run build` (in frontend directory)
- [ ] All environment variables are set:
  - `OPENAI_API_KEY` for live pricing (required for estimates)
  - `AWS_LAMBDA_FUNCTION_NAME` for async invocations
  - `ANTHROPIC_API_KEY` for Claude LLM

### Database Queries for Monitoring
```sql
-- Check for failed estimates
SELECT id, claim_id, status, error_message, created_at
FROM audit_reports
WHERE status = 'failed'
ORDER BY created_at DESC
LIMIT 10;

-- Check recent processing jobs
SELECT id, claim_id, status, created_at
FROM audit_reports
WHERE status IN ('processing', 'pending')
ORDER BY created_at DESC
LIMIT 10;

-- Check completed estimates
SELECT id, claim_id, created_at
FROM audit_reports
WHERE status = 'completed'
ORDER BY created_at DESC
LIMIT 10;
```

### Log Monitoring
After deployment, monitor these log patterns:

```bash
# Successful estimate generation
grep "ProcessEstimateJob completed successfully" /var/log/claimcoach.log

# Failed estimates
grep "ERROR:.*ProcessEstimateJob" /var/log/claimcoach.log

# Missing scope sheet
grep "scope sheet not found" /var/log/claimcoach.log

# OpenAI API issues
grep "OPENAI_API_KEY" /var/log/claimcoach.log

# Lambda invocation failures
grep "LambdaAsyncInvoker: failed" /var/log/claimcoach.log

# Step advancement
grep "SaveElevation: all 4 sides have photos" /var/log/claimcoach.log
```

## Post-deployment Verification

### Test Estimate Generation
1. Create a claim with a scope sheet
2. Navigate to Step 3 and click "Generate Industry Estimate"
3. Check logs for:
   - `SubmitEstimateJob starting`
   - `ProcessEstimateJob starting`
   - `Successfully fetched live pricing`
   - `Claude LLM responded successfully`
   - `ProcessEstimateJob completed successfully`

### Test Scope Sheet Flow
1. Access contractor wizard via magic link
2. Complete Step 1 (Quick Setup)
3. In Step 2 (Elevations):
   - Upload photos for each side
   - Indicate damage on front side
   - Check browser console for retry attempts if network is throttled
4. Verify no looping behavior occurs
5. Check that step advances when all 4 photos are uploaded

### Rollback Plan
If issues arise:
1. Revert to previous commit: `git revert HEAD`
2. Re-deploy previous version
3. Monitor error rates return to baseline

## Support

If users report continued issues:
1. Check audit_reports table for specific error messages
2. Review logs for the specific claim ID
3. Verify all API keys are configured
4. Check Lambda function logs in AWS CloudWatch
5. Ensure database migrations are up to date

## Success Criteria

- Estimate generation success rate > 95%
- No user reports of looping in scope sheet app
- Error messages provide actionable information
- Logs show clear success/failure patterns