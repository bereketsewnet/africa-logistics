step-by-step technical breakdown for **Module 2: User Account & Profile Management**, built strictly according to the system's requirements.

### **2.1 Core Profile & Preferences Engine**

Before branching into specific roles, we need a unified foundation for how user data and UI preferences are handled across the application.

* **Unified Profile Schema:** Create robust database tables to handle shared data like names, profile photos, and role identifiers, ensuring the system can distinguish between Shippers, Drivers, Dispatchers, and Admins.

* **Theme Management (Dark/Light Mode):** Build a universal state toggle for users to switch between dark and light display themes to suit their environment. Ensure this setting persists across sessions and, for the Telegram integration, automatically matches the user's Telegram theme for a seamless experience.

* **Privacy Enforcement Layer:** Implement strict data serialization rules on the backend so that API responses never leak personal phone numbers between shippers and drivers; all communication must be forced through the platform's chat feature.

### **2.2 Shipper Profile Management**

Shippers (businesses, NGOs, or individuals) need a low-friction way to manage their details and control how the platform communicates with them.

* **Contact & Details Update API:** Build endpoints allowing shippers to update their name and contact details at any time.

* **Notification Preferences:** Create a UI and corresponding database columns for shippers to toggle their notification preferences. This includes opting in or out of specific SMS, Push, or Email alerts for order updates. Notificaion opton sms and Email and also webiste popup bowswer notificiaons SMS used for very important notificiaon only

### **2.3 Driver Onboarding & Document Upload Pipeline**

This is a high-stakes workflow. We are dealing with sensitive, legal documents that must be captured reliably from mobile browsers, often over weak cellular connections.

* **Initial Profile Completion:** Build the frontend flow where a newly registered driver completes their basic profile by adding their name, photo, and phone number.

* **Secure File Upload Service:** Implement a robust file upload endpoint utilizing multipart/form-data. This service must handle the secure ingestion of three specific files: National ID, Driver's License, and the Libre (vehicle ownership document).

* **Private Storage Bucket:** Driver documents must be stored securely and remain accessible only to authorized admin users.

### **2.4 Admin Verification Engine & The "Verified" Badge**

The system must prevent any driver from operating on the platform until an authorized human explicitly approves their legal documents.

* **Verification Dashboard UI:** Build a dedicated view in the Admin dashboard that lists pending driver registrations and allows the operations team to securely view the uploaded ID, License, and Libre.

* **Approval/Rejection Logic:** Create backend endpoints for admins to explicitly approve or reject each submitted document. If rejected, trigger an automated SMS/Push notification to the driver explaining the issue.

* **Badge Generation:** Program the state machine so that once all required documents are approved by the admin, the driver's profile is automatically updated with a "Verified" badge. Ensure this badge is clearly visible to shippers on the frontend UI.

### **2.5 Vehicle Asset Linking**

A driver is only as useful as the truck they operate. The platform must tie the verified human to a verified physical asset.

* **Vehicle Database Schema:** Create a specific schema for vehicles that tracks the vehicle type, cargo capacity, plate number, and ownership details, and photos

* **Asset Assignment:** Build the admin functionality to officially link an approved vehicle profile to a verified driver's account.

* **Status Activation:** Implement the final state transition: once the driver is verified and a vehicle is linked, their system status is automatically set to 'Available', allowing them to receive incoming job requests.  
  ss