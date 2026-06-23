import Database from "better-sqlite3";

const AUTH_SEED_USERS = [
  {
    email: "julien@beeniceagency.com",
    passwordEnv: "ADMIN_SEED_PASSWORD",
    defaultPassword: "changeme",
    name: "Julien Bouic",
    role: "admin",
    active: true,
    callerId: null,
  },
  {
    email: "clotilde@beeniceagency.com",
    passwordEnv: "CALLER_SEED_PASSWORD",
    defaultPassword: "changeme",
    name: "Clotilde",
    role: "caller",
    active: true,
    callerId: "caller-clotilde",
  },
  {
    email: "florian@beeniceagency.com",
    passwordEnv: "CALLER_SEED_PASSWORD",
    defaultPassword: "changeme",
    name: "Florian",
    role: "caller",
    active: true,
    callerId: "caller-florian",
  },
];

export async function seedAuthUsers(auth, dbPath) {
  // Ensure better-auth tables exist (lazy init — must be triggered explicitly)
  const ctx = await auth.$context;
  await ctx.runMigrations();

  if (process.env.NODE_ENV === "production") {
    if (!process.env.ADMIN_SEED_PASSWORD) throw new Error("ADMIN_SEED_PASSWORD must be set in production.");
    if (!process.env.CALLER_SEED_PASSWORD) throw new Error("CALLER_SEED_PASSWORD must be set in production.");
  }

  for (const user of AUTH_SEED_USERS) {
    await ensureAuthUser(auth, dbPath, user);
  }

  linkCallerUsers(dbPath);
}

async function ensureAuthUser(auth, dbPath, user) {
  const existingUser = findUserByEmail(dbPath, user.email);
  if (!existingUser) {
    await auth.api.signUpEmail({
      body: {
        email: user.email,
        password: process.env[user.passwordEnv] ?? user.defaultPassword,
        name: user.name,
        role: user.role,
        active: user.active,
        callerId: user.callerId,
      },
    });
    return;
  }

  const db = new Database(dbPath);
  try {
    db.prepare(`
      UPDATE "user"
      SET name = ?,
          role = ?,
          active = ?,
          callerId = ?,
          updatedAt = ?
      WHERE email = ?
    `).run(
      existingUser.name || user.name,
      user.role,
      user.active ? 1 : 0,
      user.callerId,
      new Date().toISOString(),
      user.email,
    );
  } finally {
    db.close();
  }
}

function findUserByEmail(dbPath, email) {
  const db = new Database(dbPath);
  try {
    return db.prepare('SELECT * FROM "user" WHERE email = ?').get(email) ?? null;
  } finally {
    db.close();
  }
}

function linkCallerUsers(dbPath) {
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
