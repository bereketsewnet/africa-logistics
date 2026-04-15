# My Jobs

## What This Page Is

The My Jobs page is the driver's main work area.

It shows assigned jobs, completed jobs, active jobs, job details, chat, status transitions, OTP verification, and cross-border actions.

## Main Purpose

This is the page the driver uses to perform delivery work step by step.

## What the Driver Sees

- Active jobs and completed jobs tabs
- Job cards with status badges
- Select-all and bulk actions
- Job detail modal
- Chat tab
- Cross-border document tab when needed
- GPS ping button in the header

## Step-by-Step Actions

### 1. Open My Jobs
- The driver clicks **My Jobs** in the sidebar.
- The page loads the driver's assigned jobs.

### 2. Check active and completed jobs
- Active jobs are shown first.
- Completed jobs are separated into their own tab.
- The driver can switch between the two tabs.

### 3. Read the job card
Each job card shows:
- Reference code
- Status badge
- Pickup and delivery addresses
- Cargo type
- Vehicle type required
- Weight
- Fare or earnings information
- Unread message count if there are new messages

### 4. Open job details
- The driver clicks a job card to open the detail modal.
- The modal shows tabs for job details, chat, and docs if cross-border.

### 5. Accept a new assigned job
- If the job is in `ASSIGNED`, the driver can accept or decline.
- Accepting moves the job to `EN_ROUTE`.
- Declining returns the order to `PENDING`.

### 6. Move through the status flow
- The driver can move the job forward only.
- Status changes depend on the current state.
- The UI shows a button for the next allowed step.

Typical flow:
- `ASSIGNED`
- `EN_ROUTE`
- `AT_PICKUP`
- `IN_TRANSIT`
- `DELIVERED`

Cross-border flow can also include:
- `AT_BORDER`
- `IN_CUSTOMS`
- `CUSTOMS_CLEARED`
- back to `IN_TRANSIT`

### 7. Verify pickup OTP
- When the job reaches `AT_PICKUP`, the driver may need an OTP.
- The driver opens the OTP modal.
- They enter the 6-digit code from the shipper.
- If valid, the job advances to `IN_TRANSIT`.

### 8. Verify delivery OTP
- When the job reaches `IN_TRANSIT`, the driver may need a delivery OTP.
- The driver enters the 6-digit OTP from the shipper.
- If valid, the job becomes `DELIVERED`.
- The system then triggers payment settlement and invoice generation.

### 9. Use chat
- The driver opens the Chat tab inside the job detail modal.
- They can send messages to the shipper and see replies.
- New messages show unread indicators when chat is not open.

### 10. Upload cross-border documents
- If the job is cross-border, the Docs tab appears.
- The driver can upload checkpoint photos and customs documents.
- They can add notes to each upload.
- Uploaded files show in the docs history.

### 11. Use GPS ping
- The driver can ping their location from the header button.
- Auto ping can be enabled or disabled.
- This keeps live tracking updated.

### 12. Bulk actions
- The driver can select multiple jobs.
- They can mark selected jobs as delivered.
- They can cancel only jobs that are still pending or assigned.

## Important Rules For Bemnet

- Explain only the status transitions that the driver is allowed to use.
- If the status is blocked, tell the driver what is required next, such as OTP or a different current status.
- Do not tell the driver to skip verification rules.
- Do not describe admin-only status changes as driver actions.
- If a cross-border file is missing, direct the driver to the Docs tab.
- If the driver asks about another user's job, refuse politely and redirect to support.
