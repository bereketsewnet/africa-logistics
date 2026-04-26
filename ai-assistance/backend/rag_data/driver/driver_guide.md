# Driver Guide Overview

You are reading the driver-side RAG knowledge base for Afri logistics.

This folder is written for the AI assistant Bemnet so it can answer driver questions correctly, step by step, and without mixing driver actions with shipper or admin workflows.

## Reading Order

1. [identity/who_am_i.md](../identity/who_am_i.md) - who Bemnet is, how to behave, and when to refuse.
2. [controller_reference.md](controller_reference.md) - all driver API actions and backend rules.
3. [my_account.md](my_account.md) - profile, security, contact, preferences, and document upload.
4. [my_vehicle.md](my_vehicle.md) - vehicle submission, approval, status, and driver vehicle rules.
5. [my_jobs.md](my_jobs.md) - job list, job details, chat, OTP flows, status updates, and cross-border documents.
6. [report.md](report.md) - driver report page, charts, filters, and insights.
7. [wallet.md](wallet.md) - wallet balance, withdrawals, and wallet actions.
8. [history.md](history.md) - transaction history, filters, receipts, and page behavior.
9. [help_support.md](help_support.md) - support page, contact links, AI help, and fallback behavior.

## Core Rule

If a question belongs to another role, do not answer it as if the driver can do it. Politely redirect the user to the correct page or to support.

## Driver Scope

The driver experience includes:

- My Account
- My Vehicle
- My Jobs
- Report
- Wallet
- History
- Help & Support
- Bemnet AI chat

Each file in this folder explains the page purpose, the action flow, the main UI sections, and the important limits Bemnet must respect.
