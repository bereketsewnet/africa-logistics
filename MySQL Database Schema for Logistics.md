This is the exact right next step. Getting the foundation right before writing any application code is what separates a functioning system from a brittle one.

Before I hand over the schema, we need to have a quick architect-to-architect reality check. You mentioned deploying this on MySQL using XAMPP.

While I can absolutely write this schema in MySQL for you to use locally on XAMPP, **the official architectural specification for this platform strictly mandates PostgreSQL.** The report states that the architecture "decisively eschews Redis for spatial state management, opting instead to unify the stack around PostgreSQL enhanced by the PostGIS extension". It also relies heavily on "PostgreSQL's native LISTEN/NOTIFY publish/subscribe mechanism"  to push live GPS updates to the WebSockets without crashing the server. MySQL does not have a direct equivalent to LISTEN/NOTIFY, and its spatial functions are not as advanced for complex commercial truck routing.

However, since you are setting up your local environment with XAMPP, I have adapted the full database schema into **MySQL syntax**. I have utilized MySQL's native POINT data type for the geospatial coordinates and JSON data types for the audit logs so you can build out the core logic perfectly. When you are ready for production, I highly recommend migrating this to a PostgreSQL environment.

Here is the complete, unified MySQL schema for the Africa Logistics Platform.

SQL

\-- \=========================================================================  
\-- AFRICA LOGISTICS PLATFORM \- COMPLETE MYSQL SCHEMA  
\-- \=========================================================================  
\-- Note: Run this entire script to generate the database and all tables.

CREATE DATABASE IF NOT EXISTS africa\_logistics;  
USE africa\_logistics;

\-- \=========================================================================  
\-- 1 & 2\. AUTHENTICATION, USER ACCOUNT & PROFILE MANAGEMENT  
\-- \=========================================================================

CREATE TABLE roles (  
    id INT AUTO\_INCREMENT PRIMARY KEY,  
    role\_name VARCHAR(50) NOT NULL UNIQUE, \-- 'SHIPPER', 'DRIVER', 'DISPATCHER', 'ADMIN'  
    description VARCHAR(255)  
);

CREATE TABLE users (  
    id CHAR(36) PRIMARY KEY, \-- UUID recommended for distributed systems  
    role\_id INT NOT NULL,  
    phone\_number VARCHAR(20) UNIQUE NOT NULL,  
    password\_hash VARCHAR(255), \-- Nullable for Telegram-only users initially  
    email VARCHAR(100) UNIQUE,  
    telegram\_id VARCHAR(100) UNIQUE,  
    first\_name VARCHAR(100) NOT NULL,  
    last\_name VARCHAR(100) NOT NULL,  
    profile\_photo\_url VARCHAR(255),  
    is\_phone\_verified BOOLEAN DEFAULT FALSE,  
    is\_email\_verified BOOLEAN DEFAULT FALSE,  
    is\_active BOOLEAN DEFAULT TRUE,  
    theme\_preference ENUM('LIGHT', 'DARK', 'SYSTEM') DEFAULT 'SYSTEM',  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    updated\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP,  
    FOREIGN KEY (role\_id) REFERENCES roles(id)  
);

CREATE TABLE driver\_profiles (  
    user\_id CHAR(36) PRIMARY KEY,  
    national\_id\_url VARCHAR(255),  
    license\_url VARCHAR(255),  
    libre\_url VARCHAR(255),  
    is\_verified BOOLEAN DEFAULT FALSE, \-- The "Verified" Badge  
    status ENUM('AVAILABLE', 'ON\_JOB', 'OFFLINE', 'SUSPENDED') DEFAULT 'OFFLINE',  
    verified\_by\_admin\_id CHAR(36),  
    FOREIGN KEY (user\_id) REFERENCES users(id),  
    FOREIGN KEY (verified\_by\_admin\_id) REFERENCES users(id)  
);

CREATE TABLE vehicles (  
    id CHAR(36) PRIMARY KEY,  
    driver\_id CHAR(36),  
    plate\_number VARCHAR(20) UNIQUE NOT NULL,  
    vehicle\_type VARCHAR(50) NOT NULL, \-- e.g., 'Flatbed', 'Box Truck'  
    max\_capacity\_kg DECIMAL(10, 2) NOT NULL,  
    is\_company\_owned BOOLEAN DEFAULT FALSE,  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (driver\_id) REFERENCES users(id)  
);

\-- \=========================================================================  
\-- 8\. SYSTEM CONFIGURATION & ADMIN CONTROLS  
\-- \=========================================================================

CREATE TABLE cargo\_types (  
    id INT AUTO\_INCREMENT PRIMARY KEY,  
    name VARCHAR(100) NOT NULL UNIQUE,  
    requires\_special\_handling BOOLEAN DEFAULT FALSE,  
    is\_active BOOLEAN DEFAULT TRUE  
);

CREATE TABLE supported\_cities (  
    id INT AUTO\_INCREMENT PRIMARY KEY,  
    country\_code CHAR(2) NOT NULL, \-- ISO code, e.g., 'ET'  
    city\_name VARCHAR(100) NOT NULL,  
    is\_active BOOLEAN DEFAULT TRUE,  
    cross\_border\_multiplier DECIMAL(4, 2) DEFAULT 1.00  
);

\-- \=========================================================================  
\-- 6\. FINANCIAL ENGINE & PRICING  
\-- \=========================================================================

CREATE TABLE pricing\_rules (  
    id INT AUTO\_INCREMENT PRIMARY KEY,  
    vehicle\_type VARCHAR(50) NOT NULL,  
    base\_fare DECIMAL(10, 2) NOT NULL,  
    per\_km\_rate DECIMAL(10, 2) NOT NULL,  
    city\_surcharge DECIMAL(10, 2) DEFAULT 0.00,  
    active\_from TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    is\_active BOOLEAN DEFAULT TRUE  
);

CREATE TABLE wallets (  
    id CHAR(36) PRIMARY KEY,  
    user\_id CHAR(36) UNIQUE NOT NULL,  
    balance DECIMAL(12, 2) DEFAULT 0.00,  
    currency VARCHAR(3) DEFAULT 'ETB',  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (user\_id) REFERENCES users(id)  
);

CREATE TABLE wallet\_transactions (  
    id CHAR(36) PRIMARY KEY,  
    wallet\_id CHAR(36) NOT NULL,  
    order\_id CHAR(36), \-- Can be null for direct deposits/withdrawals  
    amount DECIMAL(12, 2) NOT NULL, \-- Positive for credit, negative for debit  
    transaction\_type ENUM('PAYMENT', 'EARNING', 'COMMISSION', 'WITHDRAWAL', 'BONUS') NOT NULL,  
    status ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',  
    reference\_code VARCHAR(100),  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (wallet\_id) REFERENCES wallets(id)  
);

\-- \=========================================================================  
\-- 3 & 4 & 5\. ORDER MANAGEMENT, DISPATCH & TELEMATICS  
\-- \=========================================================================

CREATE TABLE orders (  
    id CHAR(36) PRIMARY KEY,  
    reference\_code VARCHAR(20) UNIQUE NOT NULL, \-- e.g., AL-2024-00042  
    shipper\_id CHAR(36) NOT NULL,  
    driver\_id CHAR(36), \-- Nullable until assigned  
    cargo\_type\_id INT NOT NULL,  
      
    \-- Using MySQL SPATIAL data types for coordinates  
    pickup\_location POINT NOT NULL,   
    pickup\_address VARCHAR(255),  
    delivery\_location POINT NOT NULL,  
    delivery\_address VARCHAR(255),  
      
    estimated\_weight\_kg DECIMAL(10, 2),  
    special\_instructions TEXT,  
      
    \-- Status and OTPs  
    status ENUM('PENDING', 'ASSIGNED', 'EN\_ROUTE', 'AT\_PICKUP', 'IN\_TRANSIT', 'AT\_BORDER', 'IN\_CUSTOMS', 'CUSTOMS\_CLEARED', 'DELIVERED', 'COMPLETED', 'FAILED') DEFAULT 'PENDING',  
    pickup\_otp\_hash VARCHAR(255) NOT NULL,  
    delivery\_otp\_hash VARCHAR(255) NOT NULL,  
      
    \-- Financials  
    estimated\_price DECIMAL(10, 2) NOT NULL,  
    final\_price DECIMAL(10, 2),  
    payment\_status ENUM('UNPAID', 'ESCROWED', 'SETTLED') DEFAULT 'UNPAID',  
      
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    updated\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP ON UPDATE CURRENT\_TIMESTAMP,  
    FOREIGN KEY (shipper\_id) REFERENCES users(id),  
    FOREIGN KEY (driver\_id) REFERENCES users(id),  
    FOREIGN KEY (cargo\_type\_id) REFERENCES cargo\_types(id)  
);

\-- High-frequency telematics table. (In PostgreSQL, this would be UNLOGGED)  
CREATE TABLE driver\_locations (  
    id BIGINT AUTO\_INCREMENT PRIMARY KEY,  
    driver\_id CHAR(36) NOT NULL,  
    order\_id CHAR(36), \-- If they are currently on a job  
    current\_location POINT NOT NULL,  
    heading DECIMAL(5,2),  
    speed DECIMAL(5,2),  
    recorded\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (driver\_id) REFERENCES users(id),  
    FOREIGN KEY (order\_id) REFERENCES orders(id)  
);

\-- \=========================================================================  
\-- 9 & 10\. AUDITING & CROSS-BORDER COMPLIANCE  
\-- \=========================================================================

CREATE TABLE cross\_border\_documents (  
    id CHAR(36) PRIMARY KEY,  
    order\_id CHAR(36) NOT NULL,  
    document\_type ENUM('COMMERCIAL\_INVOICE', 'BILL\_OF\_LADING', 'PACKING\_LIST', 'CERTIFICATE\_OF\_ORIGIN', 'CUSTOMS\_CLEARANCE\_PHOTO'),  
    document\_url VARCHAR(255) NOT NULL,  
    uploaded\_by CHAR(36) NOT NULL,  
    status ENUM('PENDING\_REVIEW', 'APPROVED', 'REJECTED') DEFAULT 'PENDING\_REVIEW',  
    created\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP,  
    FOREIGN KEY (order\_id) REFERENCES orders(id),  
    FOREIGN KEY (uploaded\_by) REFERENCES users(id)  
);

CREATE TABLE audit\_logs (  
    id BIGINT AUTO\_INCREMENT PRIMARY KEY,  
    table\_name VARCHAR(50) NOT NULL,  
    record\_id CHAR(36) NOT NULL,  
    action ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,  
    old\_data JSON, \-- MySQL JSON type to store previous state  
    new\_data JSON, \-- MySQL JSON type to store new state  
    changed\_by CHAR(36), \-- User ID who made the change  
    changed\_at TIMESTAMP DEFAULT CURRENT\_TIMESTAMP(6) \-- Microsecond precision  
);

\-- \=========================================================================  
\-- INDEXES FOR PERFORMANCE  
\-- \=========================================================================  
CREATE INDEX idx\_orders\_status ON orders(status);  
CREATE INDEX idx\_orders\_shipper ON orders(shipper\_id);  
CREATE INDEX idx\_driver\_locations\_driver ON driver\_locations(driver\_id);  
\-- Spatial Index for location queries in MySQL  
CREATE SPATIAL INDEX sp\_idx\_driver\_locations ON driver\_locations(current\_location);

You can execute this entire block directly in your XAMPP phpMyAdmin or via the MySQL command line, and it will generate the complete relational structure for the entire application.

Since your JavaScript development environment will be interacting with this, would you like to start building out the Node.js API endpoints for **Module 1 (Auth)**, or would you prefer to map out the exact JSON payloads that the Telegram Mini App will send to this database first?