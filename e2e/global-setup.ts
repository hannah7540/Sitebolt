import {
  resolveE2ETestContext,
  writeTestContext,
} from "./helpers/test-context";
import { loadEnvLocal } from "./helpers/env";

export default async function globalSetup(): Promise<void> {
  loadEnvLocal();
  const context = await resolveE2ETestContext();
  writeTestContext(context);
}
