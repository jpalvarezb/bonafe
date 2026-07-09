/** Cookie name for the desktop sidebar's collapsed/expanded state. Read by
 * the org layout server component so the first paint already has the right
 * width class — no client-side flash on load.
 *
 * Must live in a module WITHOUT "use client": a server component importing a
 * named export from a client module receives a client-reference proxy, not
 * the string, so the layout's cookie lookup would silently never match. */
export const SIDEBAR_COLLAPSED_COOKIE = "agropeq-sidebar-collapsed";
