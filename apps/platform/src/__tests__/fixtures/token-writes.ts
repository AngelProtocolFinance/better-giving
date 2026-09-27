import type { TestDb } from "$/pg/test-utils/pglite";

/** runs `run` while better-auth's verification rows can't be written, so a
 * link or reset request fails where production's can — the adapter, before any
 * mail is attempted */
export async function while_token_writes_fail(
  test_db: TestDb,
  run: () => Promise<void>
): Promise<void> {
  await test_db.client.exec(
    "ALTER TABLE verification RENAME TO verification_off"
  );
  try {
    await run();
  } finally {
    await test_db.client.exec(
      "ALTER TABLE verification_off RENAME TO verification"
    );
  }
}
