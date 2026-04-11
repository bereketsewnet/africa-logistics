Excellent. This module is all about giving your non-technical operations team the power to scale and adapt the business without needing a developer to change hardcoded values every time they want to open a new city or add a payment method.

Here is the granular, step-by-step technical breakdown for **Module 8: System Configuration & Admin Controls**.

### **8.1 Global Geography & Expansion Management**

As the platform expands from domestic Ethiopian routes into cross-border corridors (like Djibouti, Kenya, and Sudan), the system needs a dynamic geographic rule engine.

* **Geographic Schema:** Create relational database tables for Countries, Regions, and Cities. Ensure each entity has standard identifiers (like ISO country codes) to align with third-party APIs like Mapbox.  
* **City & Corridor CRUD UI:** Build a dashboard interface where admins can add or update supported countries and cities.

* **Operational Toggles:** Add boolean flags (e.g., is\_active) to these geographic entities so the admin team can instantly turn off order creation for a specific city if a route becomes impassable or unsafe, without deleting the city from the database.

### **8.2 Cargo Categorization Engine**

The types of freight being moved dictate the vehicle required and the commercial routing parameters.

* **Cargo Type Schema:** Build a table to define and manage the list of cargo categories. Fields should include cargo\_name (e.g., General Freight, Refrigerated, Hazardous), max\_weight\_limit, and requires\_special\_handling.

* **Routing Constraints Integration:** Ensure the database flags specific cargo types (like Hazardous) so that when a shipper selects them, the backend automatically adjusts the Mapbox Directions API request to avoid restricted roads or tunnels.  
* **Admin Management UI:** Provide a simple list-view interface for the admin to add, edit, or deprecate cargo types as the business expands its freight capabilities.

### **8.3 App Versioning & Maintenance Controls**

Because we are heavily utilizing Progressive Web Apps (PWAs) and Telegram WebViews, we must ensure users aren't running severely outdated, cached versions of the application.

* **Global Maintenance Mode:** Implement a master "kill switch" in the admin dashboard. When activated, all client applications (Shipper, Driver, and Telegram Mini App) instantly lock and display a "System Under Maintenance" message, preventing any new database writes during critical backend upgrades.

**8.4, about Vehicle Type and Cargo Type**

Make this variable also update in config section

