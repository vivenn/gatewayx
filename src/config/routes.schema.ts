// Schema for the static route table (src/config/routes.yaml). This is what
// makes "add new services without changing business logic" true: a new
// backend just needs a new entry here, not a new route handler.
import { z } from 'zod';

// Step 1: each route entry maps a path prefix to an upstream base URL and
// declares what auth strategy applies to everything under that prefix.
export const routeEntrySchema = z.object({
  prefix: z.string().startsWith('/', 'prefix must start with /'),
  upstream: z.string().url(),
  auth: z.enum(['none', 'jwt']),
});

// Step 2: the file is a list of entries under a `routes:` key.
export const routesFileSchema = z.object({
  routes: z.array(routeEntrySchema).min(1, 'at least one route must be configured'),
});

export type RouteEntry = z.infer<typeof routeEntrySchema>;
export type RoutesFile = z.infer<typeof routesFileSchema>;
