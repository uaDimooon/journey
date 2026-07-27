// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { api } from "./client";

// Integration tests for the real API client against a mocked network (MSW).
// UC-1 (auth) and UC-2 (journeys), plus the shared error-surfacing behavior.

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe("api.login (UC-1)", () => {
  it("REQ-1.2: sends credentials and returns the user on success", async () => {
    let received: unknown;
    server.use(
      http.post("/api/auth/login", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ user: { id: "u1", email: "a@b.com" } });
      }),
    );

    const res = await api.login("a@b.com", "pw");

    expect(received).toEqual({ email: "a@b.com", password: "pw" });
    expect(res.user).toEqual({ id: "u1", email: "a@b.com" });
  });

  it("surfaces the server error message on failure", async () => {
    server.use(
      http.post("/api/auth/login", () =>
        HttpResponse.json({ error: "Invalid credentials" }, { status: 401 }),
      ),
    );

    await expect(api.login("x", "y")).rejects.toThrow("Invalid credentials");
  });

  it("falls back to a generic message when no error body is present", async () => {
    server.use(
      http.post("/api/auth/login", () => new HttpResponse(null, { status: 500 })),
    );

    await expect(api.login("x", "y")).rejects.toThrow(/500/);
  });
});

describe("api.journeys (UC-2)", () => {
  it("REQ-2.1: lists journeys", async () => {
    server.use(
      http.get("/api/journeys", () =>
        HttpResponse.json({
          journeys: [{ id: "j1", name: "Life", updatedAt: 1 }],
        }),
      ),
    );

    const res = await api.listJourneys();

    expect(res.journeys).toHaveLength(1);
    expect(res.journeys[0].name).toBe("Life");
  });

  it("REQ-2.1: creates a journey via POST with the given name", async () => {
    let received: unknown;
    server.use(
      http.post("/api/journeys", async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({
          journey: { id: "j2", name: "Health", updatedAt: 2 },
        });
      }),
    );

    const res = await api.createJourney("Health", { nodes: {}, edges: {} });

    expect((received as { name: string }).name).toBe("Health");
    expect(res.journey.id).toBe("j2");
  });
});
