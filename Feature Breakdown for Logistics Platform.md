I am strictly using the provided client PDF and the architectural report to map out the high-level feature modules. I will hold off on the detailed sub-tasks (like "forgot password", "OTP generation", etc.) until you give me the green light to break them down one by one.

Here is the high-level feature breakdown of the entire platform:

### **1\. Authentication & Authorization (Auth)**

* Handles secure access across all three platforms (Web, Driver App, Telegram Mini App).

* Manages Telegram-integrated login, traditional phone/password login, account recovery, and session management.

### **2\. User Account & Profile Management**

* Manages user profiles for Shippers, Drivers, Dispatchers, and Admins.

* Handles profile updates, theme preferences (Dark/Light mode), and the complete driver document upload workflow (National ID, License, Libre) for the verification badge system.

### **3\. Order Management Engine (Shipper Domain)**

* The core engine for creating shipments, including map-based pickup/drop-off selection, cargo categorization, and instant price estimation.

* Handles order history, real-time tracking views, and invoice generation.

### **4\. Fleet & Dispatch Operations (Admin Domain)**

* Provides the operations team with a live map view of all active drivers.

* Manages the assignment of orders to drivers via manual dispatch, algorithmic auto-suggestion, and order overrides.

* Handles complete vehicle asset management (type, capacity, ownership).

### **5\. Driver Telematics & Job Execution (Driver Domain)**

* Manages the driver's active lifecycle: receiving incoming job requests, accepting/declining, and executing status updates (en route, picked up, in transit, delivered).

* Handles the high-frequency geospatial tracking and battery-optimized GPS pinging discussed in the architectural report.

### **6\. Financial Engine & Wallet System**

* Manages the multi-party digital ledger, including the shipper's wallet balance, the driver's trip earnings, and platform commission transparency.

* Includes the integration with payment gateways (Telebirr, CBE Birr, Chapa escrow) and dynamic pricing rules (base fares, per-km rates, extra charges).

### **7\. Real-Time Communication & Notifications**

* Handles all event-driven messaging, including the in-app chat between shippers and drivers to protect personal phone numbers.

* Manages multi-channel alerts via Push Notifications, SMS (Premium Routes onaly for phone sing up otp useage only)updates.

### **8\. System Configuration & Admin Controls**

* The global settings engine for the platform.  
* Controls the management of supported countries, cities, cargo types, and global push notification toggles.

* Handles admin-level document verification approvals/rejections and user suspensions.

### **9\. Security, Trust & Auditing**

* Manages the cryptographic 6-digit OTP verification system required for every physical pickup and delivery.

* Maintains the permanent, tamper-proof audit trail that logs every status change, wallet transaction, and manual override.

### **10\. Cross-Border & Customs Workflows (Phase 2 & 3\)**

* Handles specialized workflows for international freight, including tracking stages like "At Border" and "Customs Cleared".

* Manages complex document handling and integrations with the Electronic Single Window (eSW) for customs clearance.

---

This is our architectural blueprint. Would you like me to take **Module 1: Authentication & Authorization** and break it down into the granular, one-by-one sub-tasks (like SMS validation, password resets, Telegram JWT handshakes) so we can start building?