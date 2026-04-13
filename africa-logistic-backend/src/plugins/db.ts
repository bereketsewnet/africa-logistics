/**
 * Database Plugin (src/plugins/db.ts)
 *
 * This Fastify plugin creates a MySQL connection pool using credentials
 * from the .env file, then "decorates" the Fastify instance with it.
 *
 * What does "decorate" mean?
 *   Think of it like attaching a tool to the Fastify object.
 *   After this plugin runs, every route and controller in the entire app
 *   can access the database by calling:  fastify.db.query(...)
 *   You never need to import or create a DB connection anywhere else.
 */

import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import mysql from 'mysql2/promise'

// We use fastify-plugin (fp) so the decoration is not scoped —
// it's available everywhere in the app, not just in this plugin's scope.
export default fp(async function dbPlugin(fastify: FastifyInstance) {
  // Create the connection pool from .env variables
  const pool = mysql.createPool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     Number(process.env.DB_PORT) || 3306,
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'africa_logistics',
    waitForConnections: true,   // Queue requests if all connections are busy
    connectionLimit:    10,     // Max 10 simultaneous DB connections
    queueLimit:         0,      // Unlimited queue
  })

  // Test the connection on startup so we know immediately if MySQL is down
  try {
    const conn = await pool.getConnection()
    fastify.log.info('✅ MySQL database connected successfully.')
    // Ensure auxiliary tables for email/phone verification exist
    await conn.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id CHAR(36) NOT NULL PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        new_email VARCHAR(100) NOT NULL,
        token VARCHAR(128) NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (user_id),
        CONSTRAINT email_verifications_fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS phone_change_requests (
        id CHAR(36) NOT NULL PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        new_phone VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        INDEX (user_id),
        CONSTRAINT phone_change_requests_fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Order Management tables ────────────────────────────────────────────

    await conn.query(`
      CREATE TABLE IF NOT EXISTS cargo_types (
        id   INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description VARCHAR(255),
        requires_special_handling TINYINT(1) DEFAULT 0,
        icon  VARCHAR(80),
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS pricing_rules (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        vehicle_type    VARCHAR(50)      NOT NULL,
        base_fare       DECIMAL(10,2)    NOT NULL,
        per_km_rate     DECIMAL(10,4)    NOT NULL,
        city_surcharge  DECIMAL(10,2)    DEFAULT 0.00,
        min_distance_km DECIMAL(8,2)     DEFAULT 0.00,
        max_weight_kg   DECIMAL(10,2),
        is_active       TINYINT(1)       DEFAULT 1,
        created_at      TIMESTAMP        DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id                    CHAR(36)     NOT NULL PRIMARY KEY,
        reference_code        VARCHAR(20)  NOT NULL UNIQUE,
        shipper_id            CHAR(36)     NOT NULL,
        driver_id             CHAR(36),
        vehicle_id            CHAR(36),
        cargo_type_id         INT          NOT NULL,
        pickup_lat            DECIMAL(10,8) NOT NULL,
        pickup_lng            DECIMAL(11,8) NOT NULL,
        pickup_address        VARCHAR(255),
        delivery_lat          DECIMAL(10,8) NOT NULL,
        delivery_lng          DECIMAL(11,8) NOT NULL,
        delivery_address      VARCHAR(255),
        estimated_weight_kg   DECIMAL(10,2),
        vehicle_type_required VARCHAR(50),
        special_instructions  TEXT,
        internal_notes        TEXT,
        distance_km           DECIMAL(10,4)  NOT NULL DEFAULT 0,
        base_fare             DECIMAL(10,2)  NOT NULL DEFAULT 0,
        per_km_rate           DECIMAL(10,4)  NOT NULL DEFAULT 0,
        city_surcharge        DECIMAL(10,2)  DEFAULT 0.00,
        estimated_price       DECIMAL(10,2)  NOT NULL DEFAULT 0,
        final_price           DECIMAL(10,2),
        status                ENUM('PENDING','ASSIGNED','EN_ROUTE','AT_PICKUP',
                                   'IN_TRANSIT','AT_BORDER','IN_CUSTOMS',
                                   'CUSTOMS_CLEARED','DELIVERED','COMPLETED',
                                   'CANCELLED','FAILED') DEFAULT 'PENDING',
        pickup_otp_hash         VARCHAR(255) NOT NULL,
        delivery_otp_hash       VARCHAR(255) NOT NULL,
        pickup_otp_verified_at  TIMESTAMP NULL,
        delivery_otp_verified_at TIMESTAMP NULL,
        invoice_url             VARCHAR(255),
        payment_status          ENUM('UNPAID','ESCROWED','SETTLED') DEFAULT 'UNPAID',
        assigned_at    TIMESTAMP NULL,
        picked_up_at   TIMESTAMP NULL,
        delivered_at   TIMESTAMP NULL,
        completed_at   TIMESTAMP NULL,
        created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_by     CHAR(36),
        updated_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_orders_status    (status),
        INDEX idx_orders_shipper   (shipper_id),
        INDEX idx_orders_driver    (driver_id),
        INDEX idx_orders_reference (reference_code),
        CONSTRAINT orders_fk_shipper      FOREIGN KEY (shipper_id)    REFERENCES users(id),
        CONSTRAINT orders_fk_driver       FOREIGN KEY (driver_id)     REFERENCES users(id),
        CONSTRAINT orders_fk_cargo_type   FOREIGN KEY (cargo_type_id) REFERENCES cargo_types(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS order_status_history (
        id         BIGINT       AUTO_INCREMENT PRIMARY KEY,
        order_id   CHAR(36)     NOT NULL,
        status     VARCHAR(50)  NOT NULL,
        changed_by CHAR(36),
        notes      TEXT,
        created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_osh_order (order_id),
        CONSTRAINT osh_fk_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_locations (
        id          BIGINT        AUTO_INCREMENT PRIMARY KEY,
        driver_id   CHAR(36)      NOT NULL,
        order_id    CHAR(36),
        lat         DECIMAL(10,8) NOT NULL,
        lng         DECIMAL(11,8) NOT NULL,
        heading     DECIMAL(5,2),
        speed_kmh   DECIMAL(6,2),
        recorded_at TIMESTAMP(3)  DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_dl_driver   (driver_id),
        INDEX idx_dl_order    (order_id),
        INDEX idx_dl_recorded (recorded_at),
        CONSTRAINT dl_fk_driver FOREIGN KEY (driver_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS order_messages (
        id         CHAR(36)  NOT NULL PRIMARY KEY,
        order_id   CHAR(36)  NOT NULL,
        sender_id  CHAR(36)  NOT NULL,
        message    TEXT      NOT NULL,
        is_read    TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_om_order   (order_id),
        INDEX idx_om_created (created_at),
        CONSTRAINT om_fk_order  FOREIGN KEY (order_id)  REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT om_fk_sender FOREIGN KEY (sender_id) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Module 10: Cross-Border Documents ────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS cross_border_documents (
        id            CHAR(36)     NOT NULL PRIMARY KEY,
        order_id      CHAR(36)     NOT NULL,
        document_type ENUM('COMMERCIAL_INVOICE','BILL_OF_LADING','PACKING_LIST',
                           'CERTIFICATE_OF_ORIGIN','CHECKPOINT_PHOTO','OTHER')
                      NOT NULL DEFAULT 'CHECKPOINT_PHOTO',
        document_url  VARCHAR(500) NOT NULL,
        uploaded_by   CHAR(36)     NOT NULL,
        status        ENUM('PENDING_REVIEW','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
        notes         TEXT         NULL,
        created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_cbd_order  (order_id),
        INDEX idx_cbd_status (status),
        CONSTRAINT cbd_fk_order     FOREIGN KEY (order_id)    REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT cbd_fk_uploader  FOREIGN KEY (uploaded_by) REFERENCES users(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS web_push_subscriptions (
        id           BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id      CHAR(36) NOT NULL,
        endpoint     VARCHAR(700) NOT NULL,
        p256dh       VARCHAR(255) NOT NULL,
        auth         VARCHAR(255) NOT NULL,
        user_agent   VARCHAR(255),
        is_active    TINYINT(1) DEFAULT 1,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wps_endpoint (endpoint),
        INDEX idx_wps_user (user_id),
        CONSTRAINT wps_fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    
    await conn.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        table_name VARCHAR(50) NOT NULL,
        record_id CHAR(36) NOT NULL,
        action ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
        old_data JSON,
        new_data JSON,
        changed_by CHAR(36),
        changed_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS security_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        event_type VARCHAR(80) NOT NULL,
        user_id CHAR(36) NULL,
        role_id INT NULL,
        ip_address VARCHAR(64) NULL,
        method VARCHAR(10) NULL,
        endpoint VARCHAR(255) NULL,
        reason VARCHAR(255) NULL,
        metadata JSON NULL,
        created_at TIMESTAMP(6) DEFAULT CURRENT_TIMESTAMP(6),
        INDEX idx_security_event_type_created (event_type, created_at),
        INDEX idx_security_user_created (user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Schema migrations (add columns introduced after initial deploy) ──────
    // MySQL 8.0 does not support ADD COLUMN IF NOT EXISTS — check information_schema instead
    const dbName = process.env.DB_NAME ?? 'africa_logistics'
    const addColIfMissing = async (table: string, column: string, definition: string) => {
      const [rows] = await conn.query<any[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [dbName, table, column]
      )
      if ((rows as any[]).length === 0) {
        await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`)
      }
    }
    await addColIfMissing('pricing_rules', 'per_kg_rate',    'DECIMAL(10,4) DEFAULT 0.0000 AFTER per_km_rate')
    await addColIfMissing('pricing_rules', 'additional_fees','JSON NULL AFTER city_surcharge')
    await addColIfMissing('orders',        'order_image_1_url',    'VARCHAR(500) NULL')
    await addColIfMissing('orders',        'order_image_2_url',    'VARCHAR(500) NULL')
    await addColIfMissing('cargo_types',   'icon_url',             'VARCHAR(500) NULL')
    // Guest order + payment/cargo image columns
    await addColIfMissing('orders',        'cargo_image_url',      'VARCHAR(500) NULL')
    await addColIfMissing('orders',        'payment_receipt_url',  'VARCHAR(500) NULL')
    await addColIfMissing('orders',        'is_guest_order',       'TINYINT(1) DEFAULT 0')
    await addColIfMissing('orders',        'guest_name',           'VARCHAR(200) NULL')
    await addColIfMissing('orders',        'guest_phone',          'VARCHAR(50) NULL')
    await addColIfMissing('orders',        'guest_email',          'VARCHAR(200) NULL')
    await addColIfMissing('orders',        'internal_notes',       'TEXT NULL')
    await addColIfMissing('orders',        'updated_by',           'CHAR(36) NULL')
    // Chat channel separation: 'main' = shipper+driver visible, 'driver' = admin↔driver only
    await addColIfMissing('order_messages', 'channel',             "VARCHAR(20) NOT NULL DEFAULT 'main'")
    // ─── Module 10: Cross-Border & Customs columns ────────────────────────────
    await addColIfMissing('orders',        'is_cross_border',       "TINYINT(1) NOT NULL DEFAULT 0")
    await addColIfMissing('orders',        'pickup_country_id',     "INT NOT NULL DEFAULT 1")
    await addColIfMissing('orders',        'delivery_country_id',   "INT NOT NULL DEFAULT 1")
    await addColIfMissing('orders',        'border_crossing_ref',   "VARCHAR(100) NULL")
    await addColIfMissing('orders',        'customs_declaration_ref',"VARCHAR(100) NULL")
    await addColIfMissing('orders',        'hs_code',               "VARCHAR(20) NULL")
    await addColIfMissing('orders',        'shipper_tin',           "VARCHAR(50) NULL")
    await addColIfMissing('pricing_rules', 'cross_border_multiplier',"DECIMAL(5,2) NOT NULL DEFAULT 1.00")

    // ─── Create Triggers for Audit Logs ──────────────────────────────────────
    await conn.query(`DROP TRIGGER IF EXISTS trg_orders_update_audit;`)
    await conn.query(`
      CREATE TRIGGER trg_orders_update_audit
      AFTER UPDATE ON orders
      FOR EACH ROW
      BEGIN
        IF NEW.updated_by IS NOT NULL THEN
          INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
          VALUES (
            'orders',
            NEW.id,
            'UPDATE',
            JSON_OBJECT(
              'status', OLD.status,
              'final_price', OLD.final_price,
              'driver_id', OLD.driver_id,
              'cargo_type_id', OLD.cargo_type_id,
              'vehicle_type_required', OLD.vehicle_type_required,
              'estimated_weight_kg', OLD.estimated_weight_kg,
              'pickup_address', OLD.pickup_address,
              'pickup_lat', OLD.pickup_lat,
              'pickup_lng', OLD.pickup_lng,
              'delivery_address', OLD.delivery_address,
              'delivery_lat', OLD.delivery_lat,
              'delivery_lng', OLD.delivery_lng,
              'distance_km', OLD.distance_km,
              'estimated_price', OLD.estimated_price,
              'special_instructions', OLD.special_instructions,
              'internal_notes', OLD.internal_notes,
              'updated_by', OLD.updated_by
            ),
            JSON_OBJECT(
              'status', NEW.status,
              'final_price', NEW.final_price,
              'driver_id', NEW.driver_id,
              'cargo_type_id', NEW.cargo_type_id,
              'vehicle_type_required', NEW.vehicle_type_required,
              'estimated_weight_kg', NEW.estimated_weight_kg,
              'pickup_address', NEW.pickup_address,
              'pickup_lat', NEW.pickup_lat,
              'pickup_lng', NEW.pickup_lng,
              'delivery_address', NEW.delivery_address,
              'delivery_lat', NEW.delivery_lat,
              'delivery_lng', NEW.delivery_lng,
              'distance_km', NEW.distance_km,
              'estimated_price', NEW.estimated_price,
              'special_instructions', NEW.special_instructions,
              'internal_notes', NEW.internal_notes,
              'updated_by', NEW.updated_by
            ),
            NEW.updated_by
          );
        END IF;
      END;
    `)

    // ─── Make shipper_id nullable for guest orders ───────────────────────────
    // Drop FK first (if still NOT NULL), then modify column, then re-add FK
    const [shipperColRows] = await conn.query<any[]>(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'shipper_id'`,
      [dbName]
    )
    if (shipperColRows[0]?.IS_NULLABLE === 'NO') {
      // Drop existing FK so we can alter the column
      const [fkRows] = await conn.query<any[]>(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'orders'
           AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = 'orders_fk_shipper'`,
        [dbName]
      )
      if (fkRows.length > 0) {
        await conn.query(`ALTER TABLE orders DROP FOREIGN KEY orders_fk_shipper`)
      }
      await conn.query(`ALTER TABLE orders MODIFY COLUMN shipper_id CHAR(36) NULL`)
      // Re-add FK allowing NULL (ON DELETE SET NULL so orphaned rows are handled)
      await conn.query(
        `ALTER TABLE orders ADD CONSTRAINT orders_fk_shipper
           FOREIGN KEY (shipper_id) REFERENCES users(id) ON DELETE SET NULL`
      )
      fastify.log.info('✅ orders.shipper_id made nullable for guest orders.')
    }

    // ─── Seed default cargo types if table is empty ──────────────────────────
    const [ctRows] = await conn.query<any[]>('SELECT COUNT(*) as cnt FROM cargo_types')
    if (ctRows[0].cnt === 0) {
      await conn.query(`
        INSERT INTO cargo_types (name, description, requires_special_handling, icon) VALUES
          ('General Cargo',         'Standard goods with no special requirements', 0, 'LuPackage'),
          ('Fragile Goods',         'Requires careful handling — glass, ceramics, electronics', 1, 'LuAlertTriangle'),
          ('Refrigerated / Cold Chain', 'Temperature-sensitive goods requiring cold storage', 1, 'LuThermometer'),
          ('Hazardous Materials',   'Chemicals, flammables — requires certified handling', 1, 'LuFlame'),
          ('Electronics',           'High-value electronic equipment', 1, 'LuMonitor'),
          ('Furniture & Heavy Items','Large bulky items requiring special loading', 0, 'LuSofa'),
          ('Livestock',             'Live animals — requires ventilated vehicle', 1, 'LuHeart'),
          ('Agricultural Produce',  'Crops, grain, perishables', 0, 'LuLeaf')
      `)
      fastify.log.info('✅ Default cargo types seeded.')
    }

    // ─── Seed default pricing rules if table is empty ────────────────────────
    const [prRows] = await conn.query<any[]>('SELECT COUNT(*) as cnt FROM pricing_rules')
    if (prRows[0].cnt === 0) {
      await conn.query(`
        INSERT INTO pricing_rules (vehicle_type, base_fare, per_km_rate, city_surcharge, min_distance_km) VALUES
          ('Truck',        500.00, 15.0000, 100.00,  5.00),
          ('Mini Truck',   350.00, 12.0000,  70.00,  3.00),
          ('Van',          300.00, 10.0000,  50.00,  2.00),
          ('Pickup',       200.00,  8.0000,  30.00,  1.00),
          ('Motorcycle',   100.00,  5.0000,  20.00,  0.50),
          ('Cargo Bike',    80.00,  4.0000,  15.00,  0.50),
          ('Trailer',      800.00, 22.0000, 200.00, 10.00),
          ('Other',        250.00,  9.0000,  40.00,  1.00)
      `)
      fastify.log.info('✅ Default pricing rules seeded.')
    }

    // ─── Driver Ratings table ─────────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_ratings (
        id          CHAR(36)   NOT NULL PRIMARY KEY,
        driver_id   CHAR(36)   NOT NULL,
        shipper_id  CHAR(36)   NOT NULL,
        order_id    CHAR(36)   NOT NULL UNIQUE,
        stars       TINYINT    NOT NULL CHECK (stars BETWEEN 1 AND 5),
        comment     TEXT       NULL,
        created_at  TIMESTAMP  DEFAULT CURRENT_TIMESTAMP,
        is_deleted  TINYINT(1) DEFAULT 0,
        deleted_at  TIMESTAMP  NULL,
        deleted_by  CHAR(36)   NULL,
        INDEX idx_dr_driver  (driver_id),
        INDEX idx_dr_shipper (shipper_id),
        CONSTRAINT dr_fk_driver  FOREIGN KEY (driver_id)  REFERENCES users(id),
        CONSTRAINT dr_fk_shipper FOREIGN KEY (shipper_id) REFERENCES users(id),
        CONSTRAINT dr_fk_order   FOREIGN KEY (order_id)   REFERENCES orders(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Financial Engine: Wallets (Double-Entry Ledger) ─────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id              CHAR(36)      NOT NULL PRIMARY KEY,
        user_id         CHAR(36)      NOT NULL UNIQUE,
        balance         DECIMAL(14,2) DEFAULT 0.00,
        currency        VARCHAR(3)    DEFAULT 'ETB',
        total_earned    DECIMAL(14,2) DEFAULT 0.00,
        total_spent     DECIMAL(14,2) DEFAULT 0.00,
        total_withdrawn DECIMAL(14,2) DEFAULT 0.00,
        is_locked       TINYINT(1)    DEFAULT 0,
        lock_reason     VARCHAR(500)  NULL,
        created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_wallets_user (user_id),
        CONSTRAINT w_fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Wallet Transactions (Immutable Ledger) ───────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS wallet_transactions (
        id                CHAR(36)        NOT NULL PRIMARY KEY,
        wallet_id         CHAR(36)        NOT NULL,
        order_id          CHAR(36),
        transaction_type  ENUM('CREDIT','DEBIT','COMMISSION','TIP','REFUND','BONUS','ADMIN_ADJUSTMENT') NOT NULL,
        amount            DECIMAL(14,2)   NOT NULL,
        description       VARCHAR(500)    NOT NULL,
        reference_code    VARCHAR(100),
        status            ENUM('PENDING','COMPLETED','FAILED','REVERSED') DEFAULT 'COMPLETED',
        related_user_id   CHAR(36),
        metadata          JSON            NULL,
        created_at        TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
        processed_at      TIMESTAMP       NULL,
        reversed_at       TIMESTAMP       NULL,
        reversed_by       CHAR(36)        NULL,
        reversal_reason   VARCHAR(500)    NULL,
        INDEX idx_wt_wallet (wallet_id),
        INDEX idx_wt_order  (order_id),
        INDEX idx_wt_type   (transaction_type),
        INDEX idx_wt_status (status),
        INDEX idx_wt_created (created_at),
        CONSTRAINT wt_fk_wallet FOREIGN KEY (wallet_id)     REFERENCES wallets(id) ON DELETE CASCADE,
        CONSTRAINT wt_fk_order  FOREIGN KEY (order_id)      REFERENCES orders(id) ON DELETE SET NULL,
        CONSTRAINT wt_fk_user   FOREIGN KEY (related_user_id) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Order Charges (Tips, Extra Fees) ──────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS order_charges (
        id              CHAR(36)      NOT NULL PRIMARY KEY,
        order_id        CHAR(36)      NOT NULL,
        charge_type     ENUM('TIP','WAITING_TIME','LOADING_FEE','SPECIAL_HANDLING','OTHER') NOT NULL,
        amount          DECIMAL(10,2) NOT NULL,
        description     VARCHAR(255),
        added_by        CHAR(36)      NOT NULL,
        status          ENUM('PENDING','APPROVED','REJECTED','APPLIED') DEFAULT 'PENDING',
        approved_at     TIMESTAMP     NULL,
        approved_by     CHAR(36)      NULL,
        is_optional     TINYINT(1)    DEFAULT 1,
        created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_oc_order  (order_id),
        INDEX idx_oc_status (status),
        CONSTRAINT oc_fk_order       FOREIGN KEY (order_id)   REFERENCES orders(id) ON DELETE CASCADE,
        CONSTRAINT oc_fk_added_by    FOREIGN KEY (added_by)   REFERENCES users(id),
        CONSTRAINT oc_fk_approved_by FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Order Invoices & Receipts ────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS order_invoices (
        id              CHAR(36)      NOT NULL PRIMARY KEY,
        order_id        CHAR(36)      NOT NULL UNIQUE,
        invoice_number  VARCHAR(50)   NOT NULL UNIQUE,
        pdf_url         VARCHAR(500)  NOT NULL,
        total_amount    DECIMAL(14,2) NOT NULL,
        shipper_amount  DECIMAL(14,2) NOT NULL,
        driver_amount   DECIMAL(14,2) NOT NULL,
        commission      DECIMAL(14,2) NOT NULL,
        tip_amount      DECIMAL(14,2) DEFAULT 0.00,
        extra_charges   DECIMAL(14,2) DEFAULT 0.00,
        generated_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        downloaded_by_shipper TINYINT(1) DEFAULT 0,
        downloaded_by_driver  TINYINT(1) DEFAULT 0,
        downloaded_at_shipper TIMESTAMP NULL,
        downloaded_at_driver  TIMESTAMP NULL,
        created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_oi_order (order_id),
        INDEX idx_oi_invoice_number (invoice_number),
        CONSTRAINT oi_fk_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Manual Payment Records (Admin) ────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS manual_payment_records (
        id              CHAR(36)      NOT NULL PRIMARY KEY,
        wallet_id       CHAR(36)      NOT NULL,
        amount          DECIMAL(14,2) NOT NULL,
        action_type     ENUM('DEPOSIT','WITHDRAWAL','REFUND','ADJUSTMENT') NOT NULL,
        reason          VARCHAR(500)  NOT NULL,
        proof_image_url VARCHAR(500),
        submitted_by    CHAR(36)      NOT NULL,
        approved_by     CHAR(36),
        status          ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
        notes           TEXT,
        submitted_at    TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
        approved_at     TIMESTAMP     NULL,
        transaction_id  CHAR(36),
        INDEX idx_mpr_wallet  (wallet_id),
        INDEX idx_mpr_status  (status),
        INDEX idx_mpr_created (submitted_at),
        CONSTRAINT mpr_fk_wallet  FOREIGN KEY (wallet_id)    REFERENCES wallets(id) ON DELETE CASCADE,
        CONSTRAINT mpr_fk_submitted FOREIGN KEY (submitted_by) REFERENCES users(id),
        CONSTRAINT mpr_fk_approved  FOREIGN KEY (approved_by)  REFERENCES users(id) ON DELETE SET NULL,
        CONSTRAINT mpr_fk_transaction FOREIGN KEY (transaction_id) REFERENCES wallet_transactions(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Performance Metrics (for bonuses) ─────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS driver_performance_metrics (
        id                CHAR(36)    NOT NULL PRIMARY KEY,
        driver_id         CHAR(36)    NOT NULL UNIQUE,
        total_trips       INT         DEFAULT 0,
        on_time_trips     INT         DEFAULT 0,
        late_trips        INT         DEFAULT 0,
        cancelled_trips   INT         DEFAULT 0,
        average_rating    DECIMAL(3,2) DEFAULT 0.00,
        total_earned      DECIMAL(14,2) DEFAULT 0.00,
        on_time_percentage DECIMAL(5,2) DEFAULT 0.00,
        bonus_earned      DECIMAL(14,2) DEFAULT 0.00,
        last_trip_date    TIMESTAMP   NULL,
        streak_days       INT         DEFAULT 0,
        updated_at        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_dpm_driver (driver_id),
        CONSTRAINT dpm_fk_driver FOREIGN KEY (driver_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // ─── Initialize wallets for existing users ────────────────────────────────
    const [existingWallets] = await conn.query<any[]>('SELECT COUNT(*) as cnt FROM wallets')
    if (existingWallets[0].cnt === 0) {
      const [allUsers] = await conn.query<any[]>('SELECT id FROM users WHERE is_active = 1')
      for (const user of allUsers) {
        const walletId = require('crypto').randomUUID()
        await conn.query(
          `INSERT IGNORE INTO wallets (id, user_id, balance, currency) VALUES (?, ?, 0.00, 'ETB')`,
          [walletId, user.id]
        ).catch(() => {}) // Ignore duplicates
      }
      fastify.log.info('✅ Initialized wallets for all existing users.')
    }

    // ─── System Notification Settings (7.5 Admin Control Panel) ──────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS system_notification_settings (
        id                      INT        NOT NULL DEFAULT 1 PRIMARY KEY,
        email_order_updates     TINYINT(1) NOT NULL DEFAULT 1,
        email_payment_alerts    TINYINT(1) NOT NULL DEFAULT 1,
        push_order_updates      TINYINT(1) NOT NULL DEFAULT 1,
        push_driver_job_alerts  TINYINT(1) NOT NULL DEFAULT 1,
        push_admin_alerts       TINYINT(1) NOT NULL DEFAULT 1,
        email_admin_alerts      TINYINT(1) NOT NULL DEFAULT 1,
        updated_at              TIMESTAMP  DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        updated_by              CHAR(36)   NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
    await conn.query(`INSERT IGNORE INTO system_notification_settings (id) VALUES (1)`)

    // ─── Module 8: System Configuration ──────────────────────────────────────

    // 8.1 / 8.4 — Vehicle Types (dynamic, replaces all static dropdowns)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS vehicle_types (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        name            VARCHAR(100) NOT NULL UNIQUE,
        max_capacity_kg DECIMAL(10,2),
        icon            VARCHAR(80),
        icon_url        VARCHAR(500),
        is_active       TINYINT(1)   DEFAULT 1,
        sort_order      INT          DEFAULT 0,
        created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
    const [vtRows] = await conn.query<any[]>('SELECT COUNT(*) as cnt FROM vehicle_types')
    if (vtRows[0].cnt === 0) {
      await conn.query(`
        INSERT INTO vehicle_types (name, icon, sort_order) VALUES
          ('Truck',       'LuTruck',   1),
          ('Mini Truck',  'LuTruck',   2),
          ('Van',         'LuCar',     3),
          ('Pickup',      'LuCar',     4),
          ('Motorcycle',  'LuBike',    5),
          ('Cargo Bike',  'LuBike',    6),
          ('Trailer',     'LuTruck',   7),
          ('Other',       'LuPackage', 8)
      `)
      fastify.log.info('✅ Default vehicle types seeded.')
    }

    // 8.1 — Countries (geographic expansion management)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS countries (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        name       VARCHAR(100) NOT NULL,
        iso_code   CHAR(2) NOT NULL UNIQUE,
        is_active  TINYINT(1)  DEFAULT 0,
        created_at TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
    const [cRows] = await conn.query<any[]>('SELECT COUNT(*) as cnt FROM countries')
    if (cRows[0].cnt === 0) {
      await conn.query(`
        INSERT INTO countries (name, iso_code, is_active) VALUES
          ('Ethiopia',  'et', 1),
          ('Djibouti',  'dj', 0),
          ('Eritrea',   'er', 0),
          ('Kenya',     'ke', 0),
          ('Sudan',     'sd', 0),
          ('Somalia',   'so', 0)
      `)
      fastify.log.info('✅ Default countries seeded (Ethiopia active).')
    }

    // 8.3 — System Configuration (maintenance mode + app versioning)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS system_config (
        config_key   VARCHAR(100) NOT NULL PRIMARY KEY,
        config_value TEXT,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)
    await conn.query(`
      INSERT IGNORE INTO system_config (config_key, config_value) VALUES
        ('maintenance_mode',    '0'),
        ('maintenance_message', 'The platform is currently under maintenance. We will be back shortly.'),
        ('app_version',         '1.0.0')
    `)

    // 9.4 — RBAC permission model (role → permission matrix)
    await conn.query(`
      CREATE TABLE IF NOT EXISTS permissions (
        permission_key VARCHAR(100) NOT NULL PRIMARY KEY,
        label          VARCHAR(120) NOT NULL,
        description    VARCHAR(255) NULL,
        is_active      TINYINT(1)   DEFAULT 1,
        created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    await conn.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        role_id         INT          NOT NULL,
        permission_key  VARCHAR(100) NOT NULL,
        is_allowed      TINYINT(1)   NOT NULL DEFAULT 1,
        updated_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (role_id, permission_key),
        CONSTRAINT rp_fk_permission FOREIGN KEY (permission_key) REFERENCES permissions(permission_key) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `)

    // Ensure staff roles exist — 4=Cashier (finance), 5=Dispatcher (operations).
    await conn.query(`
      INSERT IGNORE INTO roles (id, role_name, description) VALUES
        (4, 'Cashier',    'Finance/cashier role handling payment approvals and wallet operations'),
        (5, 'Dispatcher', 'Operations dispatcher handling order assignment and dispatch flow')
    `).catch(() => {})

    await conn.query(`
      INSERT IGNORE INTO permissions (permission_key, label, description) VALUES
        ('overview.view',       'Overview Access',            'View admin overview dashboard widgets and totals'),
        ('orders.manage',       'Orders Management',          'View and manage order lifecycle, chat, status and details'),
        ('dispatch.manage',     'Dispatch Operations',        'Assign drivers/vehicles and live dispatch operations'),
        ('drivers.verify',      'Driver Verification',        'Approve/reject driver documents and verification states'),
        ('vehicles.manage',     'Vehicle Management',         'Manage fleet vehicles and submissions'),
        ('cargo.manage',        'Cargo Types Management',     'Manage cargo categories and handling flags'),
        ('pricing.manage',      'Pricing Rules Management',   'Manage pricing rules, fares and dynamic fees'),
        ('payments.approve',    'Payment Approvals',          'Approve/reject manual payment requests'),
        ('wallet.manage',       'Wallet Management',          'Adjust wallets and manage platform financial actions'),
        ('bonuses.manage',      'Performance Bonuses',        'View/process driver performance bonuses'),
        ('notifications.manage','Notification Controls',      'Manage global push/email notification settings'),
        ('settings.manage',     'System Settings',            'Manage countries, vehicle types and maintenance config'),
        ('users.manage',        'User Management',            'Manage users and staff accounts'),
        ('roles.manage',        'Role Management',            'Manage role-permission assignments')
    `)

    // Default permissions for role 1 (super admin) — all permissions.
    await conn.query(`
      INSERT IGNORE INTO role_permissions (role_id, permission_key, is_allowed)
      SELECT 1, p.permission_key, 1 FROM permissions p
    `)

    // Default permissions for Cashier role (4) — financial/payments only.
    // Use INSERT IGNORE so custom edits made in the UI are preserved on restart.
    await conn.query(`
      INSERT IGNORE INTO role_permissions (role_id, permission_key, is_allowed) VALUES
        (4, 'overview.view',    1),
        (4, 'payments.approve', 1),
        (4, 'wallet.manage',    1)
    `)

    // Default permissions for Dispatcher role (5) — order/dispatch/ops only.
    await conn.query(`
      INSERT IGNORE INTO role_permissions (role_id, permission_key, is_allowed) VALUES
        (5, 'overview.view',   1),
        (5, 'orders.manage',   1),
        (5, 'dispatch.manage', 1),
        (5, 'vehicles.manage', 1),
        (5, 'drivers.verify',  1)
    `)

    conn.release() // Return the connection back to the pool
  } catch (err) {
    fastify.log.error('❌ MySQL connection failed. Is XAMPP running?')
    throw err // Stop the server from starting if DB is unavailable
  }

  // "Decorate" Fastify — attach the pool to the fastify instance
  // From now on: fastify.db.query('SELECT * FROM users') works anywhere
  fastify.decorate('db', pool)

  // Clean up: close all pool connections when the server shuts down
  fastify.addHook('onClose', async () => {
    await pool.end()
    fastify.log.info('MySQL pool closed.')
  })
})
