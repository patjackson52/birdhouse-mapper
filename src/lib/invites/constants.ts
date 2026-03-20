/** How long an invite link stays valid after creation (milliseconds) */
export const INVITE_LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

/** Maximum number of active (unclaimed, unexpired) invites per admin */
export const MAX_ACTIVE_INVITES = 20;

/** Days after session expiry before a convertible account is cleaned up */
export const CONVERSION_WINDOW_DAYS = 7;
