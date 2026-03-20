# Context for Claude Verification - ClaimCoach Bug Fixes

## Recent Changes Made

I've implemented fixes for two critical bugs in the ClaimCoach application:

### Bug 1: ClaimCoach Estimate Not Being Generated
**Problem**: Users click "Generate Industry Estimate" but no estimate is created

**Root Causes Identified**:
1. Missing scope sheet for the claim
2. OpenAI API key not configured (required for live pricing)
3. Async Lambda invocation failures
4. Silent errors without logging

**Fixes Implemented**:
- Added comprehensive logging throughout `audit_service.go`
- Enhanced error messages for missing scope sheet and API configuration
- Added Lambda invocation logging in `lambda_invoker.go`
- Added backend step advancement logging in `inspection_service.go`

### Bug 2: Looping in Scope Sheet App During Recording
**Problem**: Users get stuck in a loop when indicating damage to the front side during recording

**Root Causes Identified**:
1. Silent error handling in saveElevation function
2. No retry mechanism for failed API calls
3. Race conditions between automatic step advancement and user actions
4. No user feedback on save failures

**Fixes Implemented**:
- Added retry mechanism with exponential backoff (3 attempts) in `useWizardV2State.ts`
- Created custom navigation hook `useWizardNavigation.ts` to prevent race conditions
- Added user-facing error messages that auto-clear after 5 seconds
- Added step change detection polling to handle backend auto-advancement

## Files Modified

### Backend Changes:
1. `backend/internal/services/audit_service.go`
   - Added logging throughout SubmitEstimateJob and ProcessEstimateJob
   - Enhanced error messages for better debugging

2. `backend/internal/services/lambda_invoker.go`
   - Added invocation logging for async Lambda calls

3. `backend/internal/services/inspection_service.go`
   - Added logging for automatic step advancement

### Frontend Changes:
1. `frontend/src/components/contractor-wizard-v2/useWizardV2State.ts`
   - Added retry logic with exponential backoff
   - Enhanced error handling and user notifications
   - Added step change detection polling

2. `frontend/src/components/contractor-wizard-v2/useWizardNavigation.ts` (NEW)
   - Custom hook to prevent navigation race conditions

## Verification Tasks for Next Claude Chat

### 1. Verify Estimate Generation Works
**Test Steps**:
1. Create a claim with a complete scope sheet
2. Navigate to Step 3 and click "Generate Industry Estimate"
3. Monitor the logs for these specific messages:
   - `SubmitEstimateJob starting for claimID=XXX`
   - `scope sheet found with ID=XXX`
   - `invoking async Lambda for reportID=XXX`
   - `fetching live pricing for auditReportID=XXX`
   - `Claude LLM responded successfully`
   - `ProcessEstimateJob completed successfully`

**If Estimate Fails, Check**:
- Error message in logs for specific failure reason
- `audit_reports` table status and `error_message` field
- Whether OPENAI_API_KEY is configured
- Whether scope sheet exists for the claim

### 2. Verify Scope Sheet Looping is Fixed
**Test Steps**:
1. Access contractor wizard via magic link
2. Complete Step 1 and proceed to Step 2 (Elevations)
3. For each elevation side:
   - Upload a photo
   - Indicate damage (Yes/No)
   - Add damage details if applicable
4. Verify no looping occurs when indicating damage
5. Check browser console for:
   - Retry attempt messages: `Failed to save elevation for side X (attempt Y/3)`
   - Success messages after retries
   - Error messages only after 3 failed attempts

**Specific Things to Test**:
- Network throttling to simulate slow connection
- Damage indication on front side specifically
- Step advancement when all 4 photos are uploaded
- No race conditions during navigation

### 3. Monitor These Log Patterns

**Backend Logs** (in `/var/log/claimcoach.log` or CloudWatch):
```bash
# Successful estimate flow
grep "SubmitEstimateJob starting" /var/log/claimcoach.log
grep "ProcessEstimateJob completed successfully" /var/log/claimcoach.log

# Failed estimates
grep "ERROR:.*ProcessEstimateJob" /var/log/claimcoach.log
grep "scope sheet not found" /var/log/claimcoach.log
grep "OPENAI_API_KEY" /var/log/claimcoach.log

# Step advancement
grep "SaveElevation: all 4 sides have photos" /var/log/claimcoach.log
```

**Frontend Console** (Browser DevTools):
- Look for: `Failed to save elevation for side front (attempt 1/3)`
- Look for: `Backend advanced step from X to Y`
- Look for user error messages after max retries

### 4. Database Queries to Run

```sql
-- Check recent estimate jobs
SELECT id, claim_id, status, error_message, created_at
FROM audit_reports
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check for failed estimates
SELECT id, claim_id, error_message, created_at
FROM audit_reports
WHERE status = 'failed'
AND created_at > NOW() - INTERVAL '1 hour';

-- Check processing jobs that might be stuck
SELECT id, claim_id, created_at
FROM audit_reports
WHERE status = 'processing'
AND created_at < NOW() - INTERVAL '10 minutes';
```

### 5. Environment Variables to Verify

Ensure these are set in production:
- `OPENAI_API_KEY` - Required for live pricing data
- `ANTHROPIC_API_KEY` - Required for Claude estimate generation
- `AWS_LAMBDA_FUNCTION_NAME` - Required for async invocations

## Success Criteria

### For Estimate Generation:
- ✅ Estimate job starts within 1 second of button click
- ✅ Job status shows "processing" immediately
- ✅ Polling occurs every 3 seconds
- ✅ Estimate completes within 3 minutes
- ✅ No 29-second timeout errors
- ✅ Clear error messages if something fails

### For Scope Sheet Flow:
- ✅ No looping when indicating damage
- ✅ Damage selections save successfully
- ✅ Retry attempts visible in console (if network issues)
- ✅ Error message shown after 3 failed attempts
- ✅ Step advances automatically when all photos uploaded
- ✅ No navigation conflicts or race conditions

## Common Issues to Check

1. **"OPENAI_API_KEY is not configured"**
   - Solution: Add OpenAI API key to environment variables

2. **"Scope sheet not found"**
   - Solution: Ensure scope sheet exists before generating estimate

3. **Lambda invocation failures**
   - Solution: Check IAM permissions for Lambda self-invocation

4. **Frontend retry loops**
   - Solution: Check browser console for specific error messages

5. **Step advancement conflicts**
   - Solution: Verify navigation hook prevents race conditions

## Quick Diagnosis Commands

```bash
# Check recent logs
tail -f /var/log/claimcoach.log | grep -E "(SubmitEstimateJob|ProcessEstimateJob|SaveElevation)"

# Check failed estimates
grep "ERROR:.*ProcessEstimateJob" /var/log/claimcoach.log | tail -10

# Check Lambda invocations
grep "LambdaAsyncInvoker" /var/log/claimcoach.log | tail -10

# Check frontend errors (in browser console)
# Filter by "elevation" or "damage"
```

Please verify these fixes work correctly by testing both scenarios and checking the logs for the specific messages outlined above.