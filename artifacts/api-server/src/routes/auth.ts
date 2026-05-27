import { Router } from "express";
import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { webUsersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { signToken, requireAuth } from "../middlewares/jwt-auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.post("/auth/register", async (req: Request, res: Response) => {
  const { email, password, username } = req.body as {
    email?: string; password?: string; username?: string;
  };

  if (!email || !password || !username) {
    res.status(400).json({ error: "email, password, and username are required" });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  try {
    const existing = await db.select().from(webUsersTable).where(eq(webUsersTable.email, email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db.insert(webUsersTable).values({
      email: email.toLowerCase(),
      username: username.trim(),
      passwordHash,
      role: "user",
    }).returning();

    if (!user) {
      res.status(500).json({ error: "Failed to create user" });
      return;
    }

    const token = signToken({ userId: user.id, email: user.email, username: user.username, role: user.role as "user" | "admin" });

    res.cookie("wre_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
      token,
    });
  } catch (err) {
    logger.error({ err }, "auth/register error");
    res.status(500).json({ error: "Registration failed" });
  }
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: "email and password are required" });
    return;
  }

  try {
    const [user] = await db.select().from(webUsersTable).where(eq(webUsersTable.email, email.toLowerCase())).limit(1);

    if (!user) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    await db.update(webUsersTable).set({ lastLoginAt: new Date() }).where(eq(webUsersTable.id, user.id));

    const token = signToken({ userId: user.id, email: user.email, username: user.username, role: user.role as "user" | "admin" });

    res.cookie("wre_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
      token,
    });
  } catch (err) {
    logger.error({ err }, "auth/login error");
    res.status(500).json({ error: "Login failed" });
  }
});

router.get("/auth/me", requireAuth, async (req: Request, res: Response) => {
  try {
    const [user] = await db.select().from(webUsersTable).where(eq(webUsersTable.id, req.user!.userId)).limit(1);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json({ id: user.id, email: user.email, username: user.username, role: user.role, createdAt: user.createdAt });
  } catch (err) {
    logger.error({ err }, "auth/me error");
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

router.post("/auth/logout", (_req: Request, res: Response) => {
  res.clearCookie("wre_token");
  res.json({ success: true });
});

router.get("/auth/stats", async (_req: Request, res: Response) => {
  try {
    const result = await db.execute(sql`SELECT COUNT(*) as total FROM web_users`);
    const total = Number((result.rows?.[0] as Record<string, unknown>)?.total ?? 0);
    res.json({ totalWebUsers: total });
  } catch {
    res.json({ totalWebUsers: 0 });
  }
});

export default router;
