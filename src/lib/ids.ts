import { uuidv7 } from "uuidv7";

/** UUIDv7 — time-ordered, safe to generate on client or server (offline sync). */
export function newId(): string {
  return uuidv7();
}
