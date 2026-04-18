# Africa Logistics AI Assistance RAG Data

This folder is the knowledge base for the Africa Logistics AI assistant.

Its purpose is to show the AI:
- who it is
- which role is asking
- which folder to read first
- where to find each feature explanation
- how to answer using the correct scope

## How The AI Should Use This Data

When a user asks a question, the AI should follow this reading order:

1. Read [identity/who_am_i.md](identity/who_am_i.md) first.
2. Identify the user's role: admin, shipper, or driver.
3. Open the matching role folder.
4. Read the overview guide for that role.
5. Read the specific feature file that matches the user's question.
6. Answer only from the correct role scope.
7. If the question belongs to another role, politely refuse and redirect to Contact and Support or staff.

## Folder Map

### `identity/`
Use this folder for the AI's identity, behavior, refusal rules, and support escalation rules.

Main file:
- [identity/who_am_i.md](identity/who_am_i.md)

What it contains:
- the assistant name
- how the assistant should speak
- what it may answer
- what it must refuse
- when to redirect to support

### `driver/`
Use this folder for everything the driver can do in the system.

Main files:
- [driver/driver_guide.md](driver/driver_guide.md)
- [driver/controller_reference.md](driver/controller_reference.md)
- [driver/my_account.md](driver/my_account.md)
- [driver/my_vehicle.md](driver/my_vehicle.md)
- [driver/my_jobs.md](driver/my_jobs.md)
- [driver/report.md](driver/report.md)
- [driver/wallet.md](driver/wallet.md)
- [driver/history.md](driver/history.md)
- [driver/help_support.md](driver/help_support.md)

What to find there:
- driver account and settings
- vehicle submission and approval
- job acceptance, OTP, chat, status updates, and cross-border docs
- driver report and performance charts
- wallet balance and withdrawals
- transaction history and receipts
- help and support fallback

### `shipper/`
Use this folder for everything the shipper can do in the system.

Main files:
- [shipper/shipper_guide.md](shipper/shipper_guide.md)
- [shipper/my_account.md](shipper/my_account.md)
- [shipper/my_shipments.md](shipper/my_shipments.md)
- [shipper/report.md](shipper/report.md)
- [shipper/wallet.md](shipper/wallet.md)
- [shipper/history.md](shipper/history.md)
- [shipper/help_support.md](shipper/help_support.md)

What to find there:
- shipper profile and settings
- create order workflow
- shipment tracking and chat
- invoice download
- ratings and tips
- cross-border documents
- shipper report, wallet, and history

### `admin/`
Use this folder for everything the admin or staff side can do in the system.

Main files:
- [admin/admin_guide.md](admin/admin_guide.md)
- [admin/overview.md](admin/overview.md)
- [admin/my_account.md](admin/my_account.md)
- [admin/users.md](admin/users.md)
- [admin/drivers.md](admin/drivers.md)
- [admin/vehicles.md](admin/vehicles.md)
- [admin/orders.md](admin/orders.md)
- [admin/payments.md](admin/payments.md)
- [admin/wallet_adjustment.md](admin/wallet_adjustment.md)
- [admin/live_drivers.md](admin/live_drivers.md)
- [admin/reports.md](admin/reports.md)
- [admin/settings.md](admin/settings.md)
- [admin/role_management.md](admin/role_management.md)
- [admin/security_events.md](admin/security_events.md)
- [admin/cross_border.md](admin/cross_border.md)
- [admin/contact_ai_settings.md](admin/contact_ai_settings.md)

What to find there:
- dashboard overview and counts
- user management
- driver verification and documents
- vehicle management and submissions
- order dispatch and order controls
- manual payments and withdrawals
- wallet adjustments and admin wallet tools
- live driver monitoring
- reports
- system settings
- role permissions
- security logs
- cross-border review tools
- contact details and AI settings

## Recommended Reading Rules

- Use `identity/who_am_i.md` before any role file.
- Use the role guide file first: `driver/driver_guide.md`, `shipper/shipper_guide.md`, or `admin/admin_guide.md`.
- Then open the specific feature file for the exact question.
- If a file is not found in the role folder, check the role guide to see which file should contain it.
- Do not mix driver, shipper, and admin instructions.
- If a user asks a role-inappropriate question, refuse politely and send them to support or staff.

## Quick Examples

If the user asks:
- "How do I accept a job?" -> read `driver/my_jobs.md`
- "How do I place an order?" -> read `shipper/my_shipments.md`
- "How do I review withdrawals?" -> read `admin/payments.md`
- "Who are you?" -> read `identity/who_am_i.md`

## Final Rule

This folder is a map, not the final answer.
The AI should use it to find the correct source file, then answer only from the correct role scope.
