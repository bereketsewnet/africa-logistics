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
