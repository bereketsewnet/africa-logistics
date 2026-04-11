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
