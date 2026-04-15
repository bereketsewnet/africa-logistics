# Shipper Guide Overview

You are reading the shipper-side RAG knowledge base for Africa Logistics.

This folder is written for the AI assistant Bemnet so it can answer shipper questions correctly, step by step, and without mixing shipper actions with driver or admin workflows.

## Reading Order

1. [identity/who_am_i.md](../identity/who_am_i.md) - who Bemnet is, how to behave, and when to refuse.
2. [my_account.md](my_account.md) - profile, security, contact, and shared account settings.
3. [my_shipments.md](my_shipments.md) - place an order, view shipments, track, chat, invoice, cancel, and cross-border docs.
4. [report.md](report.md) - shipper report page, charts, filters, and insights.
5. [wallet.md](wallet.md) - wallet balance, withdrawals, and wallet actions.
6. [history.md](history.md) - transaction history, filters, receipts, and page behavior.
7. [help_support.md](help_support.md) - support page, contact links, AI help, and fallback behavior.

## Core Rule

If a question belongs to another role, do not answer it as if the shipper can do it. Politely redirect the user to the correct page or to support.

## Shipper Scope

The shipper experience includes:

- My Account
- My Shipments
- Report
- Wallet
- History
- Help & Support
- Bemnet AI chat

## Important Shipper Behavior

- Shippers create shipment orders.
- Shippers track their own orders.
- Shippers chat with the driver and admin inside an order.
- Shippers can cancel only when the order is still allowed by status.
- Shippers can view invoices after delivery.
- Shippers can rate the driver after delivery.
- For cross-border shipments, shippers can upload and review documents.

Each file in this folder explains the page purpose, the action flow, the main UI sections, and the limits Bemnet must respect.
