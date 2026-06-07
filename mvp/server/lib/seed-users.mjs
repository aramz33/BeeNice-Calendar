import Database from "better-sqlite3";

export async function seedAuthUsers(auth, dbPath) {
  // Ensure better-auth tables exist (lazy init — must be triggered explicitly)
  const ctx = await auth.$context;
  await ctx.runMigrations();

  // Skip if users already seeded
  const db = new Database(dbPath);
  let alreadySeeded = false;
  try {
    const result = db.prepare('SELECT COUNT(*) AS count FROM "user"').get();
    alreadySeeded = result.count > 0;
  } finally {
    db.close();
  }
  if (alreadySeeded) return;

  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_SEED_PASSWORD) throw new Error("ADMIN_SEED_PASSWORD must be set in production.");
    if (!process.env.CALLER_SEED_PASSWORD) throw new Error("CALLER_SEED_PASSWORD must be set in production.");
  }

  const adminPwd = process.env.ADMIN_SEED_PASSWORD ?? "changeme";
  const callerPwd = process.env.CALLER_SEED_PASSWORD ?? "changeme";

  await auth.api.signUpEmail({
    body: {
      email: "julien@beeniceagency.com",
      password: adminPwd,
      name: "Julien Bouic",
      role: "admin",
      active: true,
    },
  });

  await auth.api.signUpEmail({
    body: {
      email: "clotilde@beeniceagency.com",
      password: callerPwd,
      name: "Clotilde",
      role: "caller",
      active: true,
      callerId: "caller-clotilde",
    },
  });

  await auth.api.signUpEmail({
    body: {
      email: "florian@beeniceagency.com",
      password: callerPwd,
      name: "Florian",
      role: "caller",
      active: true,
      callerId: "caller-florian",
    },
  });

  // Link callers.user_id for referential integrity
  const appDb = new Database(dbPath);
  try {
    const linkCaller = appDb.prepare(
      'UPDATE callers SET user_id = (SELECT id FROM "user" WHERE email = ?) WHERE id = ?',
    );
    linkCaller.run("clotilde@beeniceagency.com", "caller-clotilde");
    linkCaller.run("florian@beeniceagency.com", "caller-florian");
  } finally {
    appDb.close();
  }
}
