/**
 * An array of routes that are accessible to the public
 * These routes do not require authentication
 */
export const publicRoutes: string[] = [];


/**
 * An array of routes that require authentication
 */
export const protectedRoutes: string[] = [
  "/",
];

/**
 * An array of auth routes (like sign-in, sign-up)
 */
export const authRoutes: string[] = [
  "/auth/sign-in",
];

/**
 * Routes that start with this prefix do not require authentication
 */
export const apiAuthPrefix: string = "/api/auth";

export const DEFAULT_LOGIN_REDIRECT = "/";
