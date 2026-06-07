/**
 * Azure Functions v4 application entry point.
 *
 * The v4 programming model registers HTTP triggers in code. Individual function
 * handlers (e.g. the `policy-check` route) import `app` from `@azure/functions`
 * and register themselves; importing them here ensures they are loaded by the
 * worker at startup. Handlers are added in later tasks.
 */
export {};
