# Driver Controller Reference

This file explains the backend driver controller so Bemnet understands what actions are actually available to a driver.

## Purpose

The driver controller handles driver-only features such as jobs, chat, OTP verification, location pings, cross-border document upload, and driver status changes.

If the user is not a driver, these actions must not be described as available to them.

## Main Driver Endpoints

### 1. Get assigned jobs
- `GET /api/driver/jobs`
- Returns the driver's active and assigned jobs.
- Use this when the driver asks where to see their jobs.

### 2. Get one job
- `GET /api/driver/jobs/:id`
- Returns the details for a single job.
- Only the assigned driver can open the job.

### 3. Accept a job
- `PATCH /api/driver/jobs/:id/accept`
- Only valid when the job status is `ASSIGNED`.
- Changes the job to `EN_ROUTE`.
- If a job is not assigned to the driver, reject the request.

### 4. Decline a job
- `PATCH /api/driver/jobs/:id/decline`
- Only valid for jobs in `ASSIGNED` or `EN_ROUTE`.
- Removes the driver from the job and returns it to `PENDING`.
- This is a direct job rejection flow.

### 5. Update job status
- `PATCH /api/driver/jobs/:id/status`
- Allowed transitions are controlled by backend rules.
- The driver can only move forward in the approved flow.

Important transitions:
- `ASSIGNED -> EN_ROUTE`
- `EN_ROUTE -> AT_PICKUP`
- `AT_PICKUP -> IN_TRANSIT`
- `IN_TRANSIT -> DELIVERED`
- Cross-border path: `IN_TRANSIT -> AT_BORDER -> IN_CUSTOMS -> CUSTOMS_CLEARED -> IN_TRANSIT`

### 6. Verify pickup OTP
- `POST /api/driver/jobs/:id/verify-pickup`
- Used when the job is at `AT_PICKUP`.
- Requires a valid 6-digit OTP from the shipper.
- After success, the job automatically advances to `IN_TRANSIT`.

### 7. Verify delivery OTP
- `POST /api/driver/jobs/:id/verify-delivery`
- Used when the job is at `IN_TRANSIT`.
- Requires a valid 6-digit OTP from the shipper.
- After success, the job becomes `DELIVERED`, the driver is released, and invoice/payment settlement starts.

### 8. Ping location
- `POST /api/driver/location`
- Sends live GPS coordinates for tracking.
- Can include the current order ID, heading, and speed.
- Used for live movement tracking.

### 9. Read messages
- `GET /api/driver/jobs/:id/messages`
- Drivers can read the main chat and driver/admin channel.
- Messages are sanitized before being returned.

### 10. Send messages
- `POST /api/driver/jobs/:id/messages`
- Drivers can send chat messages on the job.
- The default channel is the main job channel.

### 11. Update own availability
- `PATCH /api/driver/status`
- Driver can switch between `AVAILABLE` and `OFFLINE`.
- This controls whether the driver receives work.

### 12. Upload cross-border documents
- `POST /api/driver/jobs/:id/cross-border-doc`
- Only available for cross-border jobs.
- Used for checkpoint photos and customs-related files.

## Important Rules

- A driver can only act on their own assigned jobs.
- OTP actions are required for pickup and delivery verification.
- Cross-border actions only apply when `is_cross_border` is true.
- The driver controller should never be described as giving admin permissions.
- If a workflow is missing or blocked, direct the user to support.
