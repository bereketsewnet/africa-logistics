Here is the granular, step-by-step technical breakdown for the final module, **Module 10: Cross-Border & Customs Workflows**.

This module represents the Phase 2 and Phase 3 evolution of the platform. Moving freight across borders in the Horn of Africa (especially the Ethiopia-Djibouti corridor) involves massive bureaucratic friction. The architecture must transition from simply tracking physical trucks to actively managing international legal compliance and government API integrations.

### **10.1 Geographic & Routing Expansion**

To move beyond domestic Ethiopian routes, the system's foundational geography and communication rules must be upgraded.

* **Corridor Activation:** Update the database to support new international routing corridors, starting with Djibouti, followed by Kenya and Sudan.

* **International Email Routing:** Upgrade the Email gateway configuration to support international routing for non-Ethiopian phone numbers and emails, ensuring drivers and recipients across borders receive their OTPs and alerts.

* **Dynamic Cross-Border Pricing:** Enhance the pricing algorithm to automatically apply cross-border multipliers. This accounts for inherent border delays, international tariffs, and extended transit distances \[Report: 7.1\].

### **10.2 Expanded State Machine & Border Tracking**

A cross-border shipment does not simply go from "In Transit" to "Delivered." It gets bottlenecked at the border. The system state machine must reflect this physical reality.

* **New Tracking Stages:** Inject new state parameters into the PostgreSQL order lifecycle: "At Border," "In Customs," and "Customs Cleared".

* **Driver UI Updates:** Update the Driver App interface so that when a driver arrives at a national checkpoint, they can tap an "At Border" status button.

* **Admin Dashboard Monitoring:** Upgrade the Admin UI to meticulously monitor the chronological progression of freight through these new border stages, recording border crossing references.

### **10.3 International Document Repository**

Cross-border freight requires a massive paper trail. The platform must act as a secure, centralized digital vault for these artifacts.

* **Artifact Schema:** Create database tables to handle and track specific cross-border documents: Commercial Invoices (detailing product values), Bills of Lading, Packing Lists, and Certificates of Origin \[Report: 7.1\].  
* **Driver Photographic Evidence:** Build an endpoint allowing drivers to upload cryptographic photographic evidence of physical checkpoint clearances directly from their mobile browser \[Report: 7.1\].

### **10.4 Ethiopian Electronic Single Window (eSW) API Integration**

This is the technical crown jewel of Phase 2\. By integrating directly with the Ethiopian government's etrade.gov.et systems, the platform can cut customs clearance times from weeks down to days.

* **OAuth 2.0 Authentication:** Securely store the eSW Client ID and Client Secret in the backend. Program the system to authenticate with the eSW Security Token Service (STS) to generate short-lived OAuth 2.0 Bearer access tokens \[Report: 7.2\].  
* **Data Serialization & Submission:** Build a backend service that maps internal platform data—such as cargo weight, Harmonized System (HS) tariff codes, and the shipper's Tax Identification Number (TIN)—into the exact JSON schema required by the eSW. Execute POST requests to lodge documentation electronically with their Customs Catalog and Declaration APIs \[Report: 7.2\].  
* **Asynchronous Webhook Callbacks:** Because customs approval requires human intervention, the API cannot be synchronous. Configure a highly available webhook endpoint to listen for POST payloads from the eSW platform. When the eSW triggers a status change (e.g., from "Pending Inspection" to "Released"), the backend must catch this webhook, instantly update the platform status to "Customs Cleared," and alert the driver to proceed \[Report: 7.2\].

### **10.5 Broker Integration & Duties Tracking (Phase 3\)**

Preparing the architecture for full compliance and advanced financial workflows.

* **Customs Broker Ecosystem:** Build a specialized user role and interface to connect licensed customs brokers directly into the platform.

* **Duties Tracking:** Implement structured customs declarations and a financial tracking sub-ledger specifically for monitoring government duties and taxes.  
