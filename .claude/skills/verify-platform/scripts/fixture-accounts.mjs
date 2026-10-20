/** local verify fixtures. seed-member.mjs hashes these passwords, and
 * drive.mjs signs in with the same values. seed.sql's campaign admin row
 * is this admin, hashed the same way, so a later seed does not replace it. */

export const MEMBER = {
  id: "verify-member",
  email: "verify-member@example.com",
  first_name: "Verify",
  last_name: "Member",
  role: "user",
  password: "Verify-member-1",
};

export const ADMIN = {
  id: "verify-admin",
  email: "verify-admin@example.com",
  first_name: "Verify",
  last_name: "Admin",
  role: "admin",
  password: "Verify-admin-1",
};
