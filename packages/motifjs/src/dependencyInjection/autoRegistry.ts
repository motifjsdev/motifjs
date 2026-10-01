import type { ServiceLifetime } from "./ServiceCollection";

export const autoRegistry = new Map<any, { lifetime?: ServiceLifetime, deps?: any[] }>();
