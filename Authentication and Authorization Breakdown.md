Here is the granular, step-by-step technical breakdown for **Module 1: Authentication & Authorization**, incorporating your specific architectural rules.

### **1.1 Database Schema & Core Account Setup**

Before building the flows, the underlying data structures must be established to support multiple login vectors anchored to a single identity.

* **Design User Schema:** Create the primary users table with fields for phone\_number (primary key/unique), password\_hash, email (unique, nullable), and telegram\_id (unique, nullable).  
* **Define Status Flags:** Implement boolean flags such as is\_phone\_verified, is\_email\_verified, and is\_active (for admin suspensions).  
* **Implement Role-Based Access Control (RBAC):** Create a roles relationship to designate the user as a Shipper, Driver, Dispatcher, or Admin, ensuring strict separation of access across the platform.

### **1.2 Primary Authentication: Phone Number & Password**

This is the mandatory entry point for all users, particularly drivers who rely on phone and password access.

* **Initiate Registration:** Build an endpoint accepting a new phone number. Generate a secure, 6-digit cryptographic OTP.  
* **Dispatch OTP (Premium SMS):** Route the OTP specifically through a premium SMS gateway API (avoiding economy routes) to ensure sub-3-second delivery and carrier-grade reliability.  
* **Verify Phone OTP:** Create an endpoint to receive the user's OTP input. Validate it against the database (with a 5-minute expiration window). Upon success, toggle is\_phone\_verified to true.  
* **Password Setup:** Prompt the user to establish a secure password. Hash the password using a strong algorithmic standard (e.g., bcrypt or Argon2) before saving it to the database.  
* **Phone Login Form:** Build the responsive UI and backend endpoint to accept a phone number and password, returning a secure JSON Web Token (JWT) or HTTP-only cookie upon successful validation.

### **1.3 Secondary Authentication: Optional Email Integration**

Once a user is verified via their phone, they can optionally link an email address for alternative access.

* **Email Linking Request:** Create a user profile interface where an authenticated user can input an email address.  
* **Email Verification Dispatch:** Generate a unique verification token and send a verification link (or OTP) to the provided email address via an SMTP service provider (e.g., SendGrid, AWS SES).  
* **Confirm Email:** Build an endpoint to capture the clicked link or submitted OTP, toggling is\_email\_verified to true.  
* **Unified Login Endpoint:** Update the primary login endpoint to dynamically check if the provided username string is a phone number or an email address, allowing authentication via either method.

### **1.4 Telegram WebView Integration (The "Mini App" Bridge)**

Users can sign in seamlessly using their existing Telegram account. Instead of a standalone app, the Telegram bot will serve the responsive web URL, requiring a secure cryptographic handshake.

* **Bot Configuration:** Configure the Telegram Bot with a defined webhook and menu button that launches the main web application URL within Telegram's in-app browser.  
* **Extract initData:** Program the frontend to capture the raw initData string injected by the Telegram client when the WebView opens.  
* **HMAC-SHA256 Validation:** Build a backend middleware to parse the initData, isolate the hash, and cryptographically verify the signature using your private Telegram Bot Token to prevent spoofing.  
* **Account Linking Flow:**  
  * *If the Telegram ID is known:* Issue a JWT immediately and log the user in.  
  * *If the Telegram ID is new:* Prompt the user within the WebView to enter their phone number and complete the primary SMS OTP flow to link their Telegram ID to a new or existing account.

### **1.5 Session Management & Security**

Ensuring the ongoing security of the user's connection across standard web browsers and the Telegram environment.

* **JWT Generation & Storage:** Configure the backend to issue short-lived Access Tokens (passed via headers) and long-lived Refresh Tokens (stored securely in HTTP-only cookies to prevent XSS attacks).  
* **Middleware Implementation:** Build routing middleware that verifies the JWT signature on every protected API request, rejecting unauthorized access.  
* **Device & Session Revocation:** Create an admin-level and user-level ability to invalidate refresh tokens, effectively forcing a global logout across all devices.

### **1.6 Account Recovery & User Controls**

Allowing users to manage their security credentials and data autonomously.

* **Forgot Password Flow:** Create an endpoint where a user inputs their phone or email. Dispatch an OTP to the verified channel.

* **Password Reset Execution:** Validate the recovery OTP and allow the user to submit a newly hashed password.  
* **In-App Password Change:** Provide an authenticated endpoint for users to change their password by confirming their current password first.

* **Account Deletion:** Build a compliance-ready endpoint allowing users to request account deletion. Implement a soft-delete mechanism (anonymizing personal data while preserving financial audit logs) to maintain the integrity of the platform's history.