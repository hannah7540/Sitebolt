import type { ProfileRole } from "./platform-roles";

/** Primary platform owner — override via MASTER_ADMIN_EMAIL in .env.local */
export const MASTER_ADMIN_EMAIL = (
  process.env.MASTER_ADMIN_EMAIL?.trim().toLowerCase() || "hannah@site-bolt.com.au"
);

export const MASTER_ADMIN_ROLE: ProfileRole = "owner";

export const MASTER_ADMIN_FIRST_NAME = "Hannah";
export const MASTER_ADMIN_LAST_NAME = "Owner";

export const MASTER_ADMIN_FULL_NAME = `${MASTER_ADMIN_FIRST_NAME} ${MASTER_ADMIN_LAST_NAME}`;
