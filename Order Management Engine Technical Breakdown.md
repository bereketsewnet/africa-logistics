step-by-step technical breakdown for **Module 3: Order Management Engine (Shipper Domain)**. This is the transactional heart of the platform where precise geographic data meets the pricing and routing algorithms.

### **3.1 Interactive Map & Location Services**

The shipper needs a frictionless way to input geographic data without manually typing complex Ethiopian addresses.

* **Mapbox Integration:** Implement the Mapbox GL JS library on the frontend to render the interactive map, moving away from more expensive proprietary alternatives.  
* **Coordinate Extraction:** Build the UI allowing shippers to drop distinct pins for the pickup and delivery destinations. Extract these points as precise WGS84 (SRID 4326\) coordinates for the backend.

* **Reverse Geocoding:** Implement an API call to translate the dropped map coordinates into human-readable street or area names to display on the order summary UI.

### **3.2 Cargo Definition & Order Formulation**

Capturing the physical constraints of the freight to ensure accurate pricing and vehicle assignment.

* **Dynamic Cargo Categories:** Fetch the active list of cargo types (managed by the Admin) from the PostgreSQL database to populate a frontend selection interface.

* **Weight & Instructions Input:** Build form fields to capture the estimated weight and any specific handling instructions.

### **3.3 The Pricing & Routing Engine**

This sub-system must instantly calculate a legally binding price estimate based on complex spatial and administrative rules.

* **Commercial Routing API:** Pass the extracted coordinates to the Mapbox Directions API, specifically utilizing commercial trucking profiles to account for heavy vehicle route restrictions.  
* **Distance & Surcharge Calculation:** Compute the total route distance. Cross-reference the route against Mapbox Boundaries utilizing PostGIS spatial joins to detect if the route crosses into municipal zones with active city surcharges.

* **Instant Quote Generation:** Execute the algorithmic pricing rule (Base Fare \+ (Distance × Per-Km Rate) \+ Surcharges). Return this locked estimate instantly to the shipper's UI for confirmation.

### **3.4 Order Commit & Cryptographic Dispatch**

Transitioning the finalized quote into a live, trackable database entity.

* **Atomic Database Transaction:** Upon user confirmation, execute a single, atomic ACID transaction in PostgreSQL to write the order details, preventing partial data generation.  
* **Reference Code Generation:** Programmatically generate a unique, human-readable reference code (e.g., AL-2024-00042) for the shipment.

* **OTP Generation:** Cryptographically generate the two distinct 6-digit One-Time Passwords required for pickup and delivery. Store these securely against the order record.

* **Dispatch Notification:** Trigger an asynchronous alert to the operations team dashboard indicating a new unassigned order is pending.

### **3.5 Real-Time Tracking & WebSocket Telemetry**

Delivering the "live" experience to the shipper without forcing them to refresh their browser.

* **WebSocket Connection:** Establish a persistent WebSocket connection between the shipper's client app and the backend Node.js/Rust server.  
* **Event-Driven Pipeline (LISTEN/NOTIFY):** Configure the backend to listen to the specific PostgreSQL channel for this order. When the driver's app pings a new GPS coordinate to the PostGIS database, instantly push that payload through the WebSocket to the shipper.  
* **Live Map Rendering:** Dynamically update the truck icon's position on the shipper's Mapbox UI in real time.

* **State Machine UI:** Build a visual progress timeline that updates instantly as the backend registers state changes: Order Placed, Driver Assigned, Picked Up, In Transit, and Delivered.

### **3.6 Secure In-App Communication**

Ensuring operational communication happens without exposing sensitive personal data.

* **Chat Interface:** Build a dedicated messaging UI within the active order view.

* **Anonymized Proxy Routing:** Route all text messages through the WebSocket server directly to the assigned driver's app. Ensure the database explicitly blocks the transmission or display of personal phone numbers.

### **3.7 Order History & Automated Invoicing**

Providing businesses with the required financial and historical paper trail.

* **History View:** Build a paginated frontend table displaying all past and active orders, filterable by date and status.

* **PDF Generation Engine:** Implement a server-side library (like Puppeteer or PDFKit) triggered by the "Delivered" state transition.

* **Invoice Delivery:** Compile the distance, final cost, dates, and reference codes into a professional PDF format. Automatically attach it to the completed order record and provide a secure download endpoint for the shipper.  
