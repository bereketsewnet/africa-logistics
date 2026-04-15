# My Shipments

## What This Page Is

The My Shipments page is the shipper's main order management area.

It is where the shipper creates a new shipment, reviews existing orders, opens order details, tracks a driver, chats, downloads invoices, rates the driver, adds tips, and works with cross-border documents.

## Main Purpose

This is the page the shipper uses to create and manage logistics orders step by step.

## What the Shipper Sees

- Orders tab and Place tab
- Search and status filter
- Order cards with status and unread count
- Order detail modal
- Info, Timeline, Chat, Track, and Docs tabs inside the modal
- Create Order wizard
- Quote screen
- OTP reveal box for the shipper's own order
- Invoice download button after delivery
- Driver rating and tip section after delivery
- Cross-border document uploads and review actions

## Step-by-Step Actions

### 1. Open My Shipments
- The shipper clicks **My Shipments** in the sidebar.
- The page loads the shipper's existing orders.

### 2. View existing shipments
- The Orders tab shows the list of shipment cards.
- The shipper can search by order text or filter by status.
- Each card shows order reference, cargo, route, driver, and status.

### 3. Open an order detail
- The shipper clicks an order card.
- A modal opens with tabs for Info, Timeline, Chat, Track, and Docs.

### 4. Read order information
The Info tab shows:
- Cargo type
- Vehicle type required
- Weight
- Pickup address
- Delivery address
- Order price
- Notes
- Estimated value
- Driver name and phone if assigned

### 5. Reveal the OTPs
- The shipper can reveal the pickup OTP and delivery OTP for the order.
- These OTPs are shared with the driver during handover and delivery.
- For older orders, OTPs may not still be stored.

### 6. Download invoice after delivery
- When the order is delivered or completed, the shipper can download the PDF invoice.
- The invoice button appears inside the order modal.

### 7. Rate the driver
- After delivery, the shipper can rate the driver once.
- They choose 1 to 5 stars and optionally leave a comment.

### 8. Add a tip
- After delivery, the shipper can add a tip amount.
- Quick buttons are available for common values.
- The tip is added to the order and shown in the charges list.

### 9. Cancel an order
- If the order is still `PENDING` or `ASSIGNED`, the shipper can cancel it.
- Cancellation is blocked once the order is too far along in the workflow.

### 10. Track the driver live
- The Track tab shows the driver's latest location on a map.
- It also shows driver name, speed, heading, and last update time when available.
- When the order is delivered or cancelled, live tracking stops and the last known location remains.

### 11. Use chat
- The shipper can chat in the order modal.
- There is a main order chat and, in some cases, a shipper/admin channel.
- Unread messages are highlighted when the modal is closed.

### 12. Work with cross-border documents
- If the order is cross-border, the Docs tab appears.
- The shipper can upload required documents such as invoices, bills of lading, packing lists, checkpoint photos, or other files.
- The shipper can add notes to documents.
- Uploaded documents appear in the history list.
- Pending documents can be approved or rejected by the shipper when the page exposes that control.

### 13. Create a new shipment
- The shipper switches to the Place tab.
- The order wizard opens.
- The wizard has two steps: enter details, then confirm the quote.

### 14. Choose operating country
- The shipper selects the operating country first.
- The system uses this to validate pickup and delivery locations.

### 15. Select cargo and vehicle type
- The shipper chooses the cargo type.
- The shipper chooses the required vehicle type.
- The system uses this to calculate the quote.

### 16. Set the route
- The shipper enters or pins pickup and delivery locations.
- They can search addresses or tap the map.
- GPS can also be used to fill the current location.

### 17. Add optional details
- The shipper can add a description.
- The shipper can add estimated value.
- The shipper can upload up to two optional order images.

### 18. Use cross-border mode when needed
- If the shipment crosses countries, the shipper turns on cross-border mode.
- They choose the destination country.
- They can add HS code and shipper TIN.
- The system validates that the route matches the selected country rules.

### 19. Get a quote
- The shipper clicks Get Quote.
- The system shows a breakdown with distance, base fare, distance charge, weight charge, fees, and total.

### 20. Confirm and place the order
- The shipper reviews the summary.
- They confirm the order.
- If successful, the system returns the order reference and OTPs.
- The shipper should save those OTPs immediately.

## Important Rules For Bemnet

- Always explain that order creation starts in the Place tab.
- Always explain that pickup and delivery OTPs are given after order creation.
- Do not tell the shipper they can use driver-only status changes.
- Do not tell the shipper to access admin-only approval screens.
- If the user asks how to track a shipment, direct them to the Track tab.
- If the user asks about cancelling, explain the status limits clearly.
- If the user asks for unsupported fields or actions, redirect to support.
