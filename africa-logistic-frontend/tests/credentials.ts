/**
 * Shared test credentials and helper utilities.
 * Keep credentials here so all spec files stay in sync.
 */
export const ADMIN = {
  email:     'admin@gmail.com',
  password:  'Admin1234',
  firstName: 'Admin',
}

/**
 * A pre-created driver account used for driver-specific tests.
 * Create this account once via the register page before running the full suite,
 * OR rely on the registerDriver helper in register.spec.ts to seed it.
 */
export const DRIVER = {
  phone:     '+251911000010',
  email:     'driver.test@gmail.com',
  password:  'Driver1234!',
  firstName: 'Test',
  lastName:  'Driver',
}

export const SHIPPER = {
  phone:     '+251911000020',
  email:     'shipper.test@gmail.com',
  password:  'Shipper1234!',
  firstName: 'Test',
  lastName:  'Shipper',
}
