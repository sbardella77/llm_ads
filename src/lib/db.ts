import { neon } from "@neondatabase/serverless";
import { env } from "./env";

export function sql() {
  return neon(env().DATABASE_URL);
}
