// Shape of the JWT payload the gateway trusts, once verified. The gateway
// never issues these tokens itself — only verifies ones issued by the Auth
// Service — so this is a read-only view of "whoever the Auth Service says
// this is", not a gateway-owned user record.
export interface AuthenticatedUser {
  sub: string;
  roles: string[];
  [claim: string]: unknown;
}
