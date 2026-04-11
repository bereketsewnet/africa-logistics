tep-by-step technical breakdown for **Module 4: Fleet & Dispatch Operations (Admin Domain)**. This module serves as the central command center, giving the operations team full control over the platform, from monitoring the live fleet to resolving active disputes.

### **4.1 Live Fleet Monitoring & Geospatial View**

To effectively manage a logistics network, dispatchers need immediate, visual awareness of the entire operational fleet.

* **Real-Time Map Integration:** Integrate Mapbox GL JS into the Admin Web Application (React/Next.js) to render a high-performance, live map view.

* **WebSocket Telemetry Ingestion:** Establish continuous listener channels on the backend that subscribe to the PostgreSQL LISTEN/NOTIFY events. As drivers ping their locations, push these updates via WebSockets directly to the admin dashboard.  
* **Dynamic Asset Plotting:** Plot all active drivers on the map in real time, ensuring the location refreshes automatically. Implement color-coded markers to instantly distinguish between driver states (e.g., "Available" vs. "In Transit").

### **4.2 Unified Order Management**

Dispatchers require a powerful interface to view, filter, and initiate shipments rapidly.

* **All Orders Data Table:** Build a comprehensive data grid to see every order on the platform in one view. Implement server-side pagination and advanced filtering capabilities (by status, city, date, or specific driver).

* **Internal Order Creation:** Develop an endpoint and UI flow allowing the operations team to create an order on behalf of a shipper directly from the admin panel. This is crucial for handling phone-in requests or VIP enterprise clients.

### **4.3 The Dispatch & Assignment Engine**

This sub-system bridges the gap between unassigned freight and available trucks, utilizing both human intelligence and spatial algorithms.

* **Algorithmic Auto-Suggestion:** Build a specialized backend query utilizing PostGIS. When an order requires assignment, execute an ST\_DWithin spatial query to instantly calculate the distance to all drivers currently marked as "Available", returning a sorted list based on proximity.

* **Manual Assignment Interface:** Provide a UI allowing the dispatcher to review the auto-suggestions or manually search for and assign any order to a specific driver.

* **Dispatch Execution:** Upon assignment, trigger an asynchronous push notification directly to the selected driver's mobile application containing the full order details for them to accept or decline.

### **4.4 Exception Handling & Order Overrides**

In physical logistics, things go wrong. The operations team must have the systemic authority to correct the state of the platform, backed by strict auditing.

* **Override Endpoints:** Build powerful, privileged API endpoints that allow admins to forcefully update an order's status, adjust the pricing, add internal notes, or reassign a driver at any point in the order lifecycle.

* **Immutable Audit Integration:** (Crucial Architectural Requirement) Ensure that every single manual override executed by the dispatch team triggers a PostgreSQL AFTER trigger. This guarantees that the exact identity of the admin, the timestamp, and the OLD/NEW row states are permanently recorded in the tamper-proof audit\_logs schema, preventing internal fraud.

### **4.5 Vehicle Asset Management**

Managing the physical trucks ensures that heavy cargo is not assigned to a vehicle lacking the necessary capacity.

* **Vehicle CRUD Operations:** Build interfaces and endpoints to add, edit, and manage all vehicles operating within the fleet.

* **Asset Categorization:** Ensure the database strictly categorizes vehicle type (e.g., Flatbed, Box Truck), maximum cargo capacity, and ownership details (distinguishing between company-owned fleet assets and independent driver-owned trucks).

* **Driver-Vehicle Linking:** Maintain the relational logic that pairs a verified driver to a specific active vehicle asset.