# Payment & Wallet System - Complete Implementation

## Overview
A comprehensive double-entry ledger wallet system integrated into Africa Logistics platform with automatic payment settlement, invoicing, bonuses, and admin controls.

---

## 🎯 System Components

### Backend Services (Node.js/TypeScript)

#### 1. **Wallet Service** (`src/services/wallet.service.ts`)
- **Core Functions:**
  - `addWalletTransaction()` - Atomic transactions with DB locks
  - `reverseWalletTransaction()` - Transaction undo with audit trail
  - `checkSufficientBalance()` - Pre-flight validation
  - `getWalletTransactionHistory()` - Paginated ledger queries
  - `lockWallet()` / `unlockWallet()` - Freeze funds for disputes

- **Features:**
  - Double-entry ledger (every debit paired with credit)
  - Atomic transactions prevent inconsistency
  - Full audit trail
  - Balance validation before operations

#### 2. **Payment Service** (`src/services/payment.service.ts`)
- **Pricing Calculation:**
  - Base fare + distance-based + weight-based + city surcharge
  - Platform commission: 15% of subtotal
  
- **Core Functions:**
  - `calculateOrderPrice()` - Full pricing with all charges
  - `validateOrderPayment()` - Check wallet before order creation
  - `settleOrderPayment()` - Debit shipper, credit driver atomically
  - `addOrderCharge()` - Tips, waiting time, loading fees
  - `getPendingManualPayments()` - Admin review queue

- **Key Workflows:**
  1. **Order Creation:** Validate shipper has sufficient funds
  2. **Order Completion:** On OTP verification, settle payment atomically
  3. **Admin Approval:** Manual payment deposits reviewed and credited

#### 3. **Performance Bonus Service** (`src/services/performance.service.ts`)
- **Tier System:**
  - **TIER_1:** 500 ብር (50+ trips, 90%+ on-time, 4.5+ rating)
  - **TIER_2:** 200 ብር (20+ trips, 80%+ on-time, 4.0+ rating)
  - **TIER_3:** 50 ብር (10+ trips, 70%+ on-time, 3.5+ rating)
  - **Streak Bonus:** +50 ብር per day for consecutive deliveries

- **Core Functions:**
  - `calculatePerformanceBonus()` - Tier calculation with qualification check
  - `rewardPerformanceBonus()` - Credit bonus to wallet
  - `batchProcessPerformanceBonuses()` - Admin bulk distribution
  - `updateDriverMetricsAfterDelivery()` - Automatic metric tracking

#### 4. **Enhanced Invoice Service** (`src/services/invoice.service.ts`)
- PDF generation with pricing breakdown
- Download tracking and audit
- Financial record keeping
- Email and push notifications

---

### Database Schema

#### `wallets` Table
```sql
user_id (FK)
current_balance DECIMAL(12,2)
total_earned DECIMAL(15,2)
total_spent DECIMAL(15,2)
lock_status ENUM('ACTIVE', 'LOCKED')
created_at, updated_at
```

#### `wallet_transactions` Table (Immutable Ledger)
```sql
wallet_id (FK)
transaction_type ENUM('CREDIT', 'DEBIT', 'COMMISSION', 'TIP', 'REFUND', 'BONUS', 'ADMIN_ADJUSTMENT')
amount DECIMAL(12,2)
description VARCHAR(255)
reference_id VARCHAR(100)  -- Links to orders, bonuses, etc.
created_at
```

#### `order_charges` Table
```sql
order_id (FK)
charge_type ENUM('TIP', 'WAITING_TIME', 'LOADING_FEE', 'SPECIAL_HANDLING', 'OTHER')
amount DECIMAL(10,2)
description TEXT
created_at
```

#### `order_invoices` Table
```sql
order_id (FK)
shipper_id, driver_id
Pricing breakdown (base, distance, weight, surcharge, commission)
shipper_pays, driver_earns DECIMAL(12,2)
pdf_url VARCHAR(255)
download_count INT
generated_at, created_at
```

#### `manual_payment_records` Table
```sql
user_id (FK)
amount DECIMAL(12,2)
proof_image_url TEXT
status ENUM('PENDING', 'APPROVED', 'REJECTED')
admin_notes, rejection_reason TEXT
created_at, updated_at, reviewed_at
```

#### `driver_performance_metrics` Table
```sql
driver_id (FK)
total_trips INT
on_time_delivery_rate DECIMAL(5,2)
average_rating DECIMAL(3,2)
streak_days INT
last_delivery_date DATE
last_bonus_date DATE
created_at, updated_at
```

---

### API Endpoints (20+ Total)

#### User/Shipper/Driver Endpoints

**Wallet Management**
```
GET  /profile/wallet
     → Returns: { wallet, recent_transactions }
     
GET  /profile/wallet/transactions?limit=50&offset=0
     → Paginated transaction history
     
GET  /profile/invoices
     → List all invoices
     
POST /profile/invoices/:id/download
     → Track download, return PDF URL
```

**Payment Submission**
```
POST /profile/wallet/manual-payment
     Body: { amount, proof_image (multipart) }
     → Submit deposit proof for admin review
```

**Order Charges**
```
POST /orders/:id/add-tip?tip_amount=500&rating_stars=5
     → Add tip and rating after delivery
     
GET  /orders/:id/charges
     → View all charges for order
     
POST /orders/:id/extra-charge
     Body: { charge_type, amount, description }
```

#### Admin Endpoints

**Payment Review**
```
GET  /admin/payments/pending
     → List pending manual payments for review
     
POST /admin/payments/:id/approve?notes=...
     → Approve and credit wallet
     
POST /admin/payments/:id/reject?reason=...
     → Reject with reason
```

**Wallet Adjustment**
```
POST /admin/wallets/:userId/adjust
     Body: { 
       adjustment_type: 'DEPOSIT'|'WITHDRAWAL'|'REFUND'|'ADJUSTMENT',
       amount, 
       notes 
     }
     → Emergency wallet correction by admin
```

**Financial Queries**
```
GET  /admin/wallet-stats
     → Dashboard: totals, transactions, pending amounts
     
GET  /admin/drivers/performance-metrics?limit=50&offset=0&sort_by=bonus|trips|rating
     → All drivers' stats and bonus eligibility
```

**Bonus Distribution**
```
POST /admin/bonuses/process
     → Trigger batch bonus calculation and distribution
     → Returns: { processed_count, total_rewarded }
```

---

### Frontend Components

#### User Dashboard (`DashboardPage.tsx`)
**Payment Tabs:**
1. **Wallet Dashboard** (`WalletDashboard.tsx`)
   - Balance display
   - Recent transactions
   - Wallet status (locked/active)
   - Quick stats (earned/spent)

2. **Transaction History** (`TransactionHistory.tsx`)
   - Paginated transaction list
   - Filter by type (credit/debit/bonus/tip)
   - Search by description/reference
   - Date range view

3. **Invoices** (`InvoicesPage.tsx`)
   - Invoice list with quick preview
   - Detailed view with fare breakdown
   - Download PDF button
   - View shipper pays / driver earns

4. **Add Funds** (`ManualPaymentPage.tsx`)
   - Photo/file upload of payment proof
   - Amount input with validation
   - Real-time preview
   - Submit to admin review queue

5. **Tip Form** (`TipRatingForm.tsx`)
   - Star rating (1-5)
   - Quick tip buttons (0, 50, 100, 200 ብር)
   - Custom amount input
   - Success confirmation

#### Admin Dashboard (`AdminDashboardPage.tsx`)

**Section 1: Payment Reviews** (`AdminPaymentReview.tsx`)
- Pending payment queue
- User info + proof image viewing
- Approve/reject with notes
- Rejection reason tracking
- Status filtering

**Section 2: Wallet Adjustment** (`AdminWalletAdjustment.tsx`)
- Search users by email/phone
- Adjustment type selection
- Amount input
- Reason/notes documentation
- New balance preview

**Section 3: Performance Bonuses** (`AdminPerformanceBonus.tsx`)
- Driver performance metrics table
- Sort by bonus/trips/rating
- Tier eligibility display
- Batch process trigger
- Real-time metric updates

---

## 🔄 Payment Workflows

### Workflow 1: Order Creation to Completion

```
1. [Shipper] Places Order
   ↓
2. [Backend] validateOrderPayment()
   - Check wallet has sufficient funds
   - Return 402 if insufficient (short response example: "Wallet balance ETB 500, order costs ETB 1000")
   ↓
3. [Order] Created with status PENDING_PAYMENT
   ↓
4. [Driver] Delivers order, gets OTP from customer
   ↓
5. [Driver] Enters OTP → Triggers verifyDeliveryOtpHandler()
   ↓
6. [Backend] Atomic Settlement:
   - Calculate final pricing (base + distance + weight + city surcharge + charges)
   - Debit shipper wallet (shipper_pays amount)
   - Credit driver wallet (driver_earns amount)
   - Track commission separately
   - Mark payment_status = 'SETTLED'
   ↓
7. [Backend] Generate Invoice PDF
   ↓
8. [Backend] Send Notifications:
   - Push: "Your order has been delivered. Invoice generated."
   - Email: Invoice attachment
   - WebSocket: Broadcast to driver & shipper
   ↓
9. [Frontend] Show success, update wallet balance
```

### Workflow 2: Manual Payment Deposit

```
1. [Driver] Wants to add funds
   ↓
2. [Frontend] Open "Add Funds" tab
   ↓
3. [Driver] Submits:
   - Amount (100-500,000 ብር)
   - Bank transfer proof (photo/screenshot)
   ↓
4. [Backend] Create manual_payment_record with status PENDING
   ↓
5. [Admin] Reviews in "Payment Reviews" section
   - View user details
   - View proof image
   - Add notes if needed
   ↓
6. [Admin] Clicks "Approve & Credit"
   ↓
7. [Backend] Executes:
   - Add DEPOSIT transaction to wallet
   - Update manual_payment_record → APPROVED
   - Send push notification
   ↓
8. [Driver] Wallet balance updated instantly
```

### Workflow 3: Performance Bonus Distribution

```
1. [Backend] Automatic tracking after each delivery:
   - Update trip count
   - Update on-time delivery rate
   - Update average rating
   - Increment streak if within 24h
   ↓
2. [Admin] Clicks "Process Bonuses" button
   ↓
3. [Backend] For each driver:
   - Call calculatePerformanceBonus()
   - Check tier eligibility (TIER_1/2/3 or NOT_ELIGIBLE)
   - If eligible: Add BONUS transaction
   - Send push: "You've earned 500 ብር bonus!"
   ↓
4. [Driver] Sees bonus in transaction history
   ↓
5. [Dashboard] Updates performance metrics in real-time
```

---

## 🛡️ Security & Validation

### Transaction Safety
- **Atomic SQL Transactions:** All debit/credit pairs happen together or roll back
- **Balance Validation:** Insufficient funds = HTTP 402 Payment Required
- **Immutable Ledger:** All transactions recorded, cannot be deleted
- **Audit Trail:** Every mutation tracked with timestamp and reason

### Authorization
- JWT token required for all endpoints
- Shipper can only view own wallet/invoices
- Driver can only view own wallet/transactions
- Admin has full read/write access

### Input Validation
- Amount must be positive, max 50,000 for orders
- Proof image < 5MB, JPG/PNG/WebP only
- Rating 1-5 stars, transact on integers
- Email format, phone number normalized

---

## 📊 Metrics & Reporting

### Dashboard Stats
- Total wallet balance ecosystem
- Transaction volume (daily/weekly/monthly)
- Platform commission collected
- Driver payouts distributed
- Bonus allocation summary

### Driver Performance
- Trips completed
- On-time delivery rate (%)
- Average customer rating (1-5)
- Current bonus tier
- Streak days
- Bonus earned lifetime

### Payment Health
- Pending approvals (count/amount)
- Rejected payments (with reasons)
- Average approval time
- Wallet adjustments audit log

---

## 🚀 Deployment Checklist

- ✅ Database migrations (6 new tables)
- ✅ Backend API routes registered
- ✅ Frontend components created & imported
- ✅ TypeScript compilation passes
- ✅ Responsive design verified
- ✅ Email notifications configured
- ✅ Web Push notifications wired
- ✅ PDF invoice generation tested
- ⏳ Load testing on wallet service
- ⏳ Production API URLs configured
- ⏳ SSL certificates validated

---

## 🔧 Configuration

### Environment Variables Needed
```
# Backend
VITE_API_BASE_URL=http://localhost:3000/api

# Database
DB_USER, DB_PASSWORD, DB_NAME
```

### Feature Flags
```
ENABLE_WALLET_SYSTEM=true
ENABLE_MANUAL_PAYMENTS=true
ENABLE_BONUSES=true
INVOICE_PDF_ENABLED=true
```

---

## 📱 Responsive Design

All components built with:
- Mobile-first CSS media queries
- Flex wrapping for small screens
- Touch-friendly button sizes (min 44px)
- Portrait + landscape orientation support
- Readable on 320px to 1920px widths

---

## 🎨 Design System

**Color Scheme (inherited from platform):**
- Primary Accent: `#00e5ff` (cyan)
- Secondary Accent: `#7c3aed` (purple)
- Success: `#39ff14` (neon green)
- Danger: `#ef4444` (red)
- Warning: `#f59e0b` (amber)
- Muted: `#64748b` (slate)

**Typography:**
- Font: Plus Jakarta Sans
- Sizes: 0.75rem (caption) → 1.3rem (heading)
- Weights: 300 (light) → 800 (black)

**Components:**
- Glassmorphic cards (backdrop blur + transparency)
- Smooth transitions (0.25s ease)
- Hover lift effect on interactive elements
- Aurora animated background

---

## 🧪 Testing Recommendations

1. **Unit Tests:** Wallet calculations, bonus logic
2. **Integration Tests:** End-to-end order settlement
3. **Load Tests:** 1000+ concurrent transactions
4. **UI Tests:** Responsive breakpoint validation
5. **E2E Tests:** Full user journey (order → payment → invoice)

---

## 📞 Support

Common Issues & Solutions:

**Issue:** "Insufficient funds" error on order creation
- **Solution:** User needs to add funds via manual payment or wait for bonus

**Issue:** Invoice PDF not generating
- **Solution:** Check PDFKit installation, verify `uploads/invoices/` directory exists

**Issue:** Bonus not appearing in wallet
- **Solution:** Admin must click "Process Bonuses" button to distribute

**Issue:** Manual payment stuck on PENDING
- **Solution:** Admin needs to approve/reject in Payment Reviews section

---

## 📚 Integration Points

This system integrates with:
- ✅ Order Management Engine (validates balance before order creation)
- ✅ Driver Verification System (tracks metrics for bonuses)
- ✅ Invoice System (PDF generation integrated)
- ✅ Notification System (email + push triggers)
- ✅ WebSocket System (real-time balance updates)
- ✅ Authentication System (JWT token validation)

---

## Version
**Payment & Wallet System v1.0**
- Release Date: April 2026
- Database Migrations: 6 new tables
- API Endpoints: 20+ new routes
- Frontend Components: 8 new components
- Backend Services: 4 new services (wallet, payment, performance, enhanced invoice)

