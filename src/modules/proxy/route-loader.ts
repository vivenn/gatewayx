// Loads and validates the static route table at startup. A malformed
// routes.yaml should crash the process immediately with a clear error, not
// surface as a mysterious 404 once traffic starts arriving.
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { routesFileSchema, type RouteEntry } from '../../config/routes.schema.js';

export function loadRoutes(filePath: string): RouteEntry[] {
  // Step 1: read the raw YAML file from disk.
  const raw = readFileSync(filePath, 'utf-8');

  // Step 2: parse YAML into a plain object.
  const parsed: unknown = parseYaml(raw);

  // Step 3: validate against the Zod schema — throws with a readable path
  // if any entry is malformed (bad URL, missing prefix, etc).
  const result = routesFileSchema.parse(parsed);

  return result.routes;
}
