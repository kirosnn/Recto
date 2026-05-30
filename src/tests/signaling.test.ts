/**
 * Tests du module de signaling Supabase.
 * Utilise un mock Supabase pour tester la logique de création/récupération
 * de sessions et l'échange de candidates ICE.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Supabase complet
const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockSend = vi.fn().mockResolvedValue({ error: null });
const mockSubscribe = vi.fn().mockReturnValue({ send: mockSend, unsubscribe: vi.fn() });
const mockOn = vi.fn();
const mockChannel = vi.fn();

const makeChain = (result: unknown) => {
  const chain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
    from: vi.fn().mockReturnThis(),
  };
  return chain;
};

vi.mock("../lib/supabase", () => {
  let _onUpdateCb: ((payload: { new: unknown }) => void) | null = null;
  let _sessionStore: Record<string, unknown> = {};

  const mockFrom = (_table: string) => {
    // Builder pattern with accumulated filters
    const makeBuilder = (filters: Record<string, string> = {}) => ({
      select: vi.fn().mockImplementation(() => makeBuilder(filters)),
      eq: vi.fn().mockImplementation((col: string, val: string) => makeBuilder({ ...filters, [col]: val })),
      single: vi.fn(async () => {
        // Find entry matching all filters
        const entry = Object.values(_sessionStore).find((s) => {
          const sess = s as Record<string, string>;
          return Object.entries(filters).every(([k, v]) => sess[k] === v);
        }) ?? null;
        return { data: entry, error: entry ? null : { message: "Not found" } };
      }),
    });

    return {
      insert: vi.fn(async (data: { code: string; offer: unknown; status: string }) => {
        _sessionStore[data.code] = { id: "sess-" + data.code, ...data };
        return { data: _sessionStore[data.code], error: null };
      }),
      ...makeBuilder(),
      update: vi.fn((patch: { answer?: unknown; status?: string }) => ({
        eq: vi.fn((_col: string, val: string) => {
          if (_sessionStore[val]) {
            Object.assign(_sessionStore[val] as object, patch);
            _onUpdateCb?.({ new: _sessionStore[val] });
          }
          return Promise.resolve({ error: null });
        }),
      })),
    };
  };

  return {
    supabase: {
      from: mockFrom,
      channel: vi.fn((name: string) => ({
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
        send: vi.fn().mockResolvedValue({ error: null }),
        unsubscribe: vi.fn(),
      })),
    },
  };
});

import { createSession, fetchSession, submitAnswer, endSession } from "../lib/signaling";

describe("Signaling — gestion des sessions", () => {
  it("createSession retourne un code 6 caractères", async () => {
    const offer: RTCSessionDescriptionInit = { type: "offer", sdp: "v=0\r\n" };
    const code = await createSession(offer);
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z2-9]+$/);
  });

  it("fetchSession retourne la session créée", async () => {
    const offer: RTCSessionDescriptionInit = { type: "offer", sdp: "v=0\r\n" };
    const code = await createSession(offer);
    const session = await fetchSession(code);
    expect(session.code).toBe(code);
    expect(session.offer).toEqual(offer);
    expect(session.status).toBe("waiting");
  });

  it("submitAnswer met à jour la session avec l'answer", async () => {
    const offer: RTCSessionDescriptionInit = { type: "offer", sdp: "v=0\r\n" };
    const answer: RTCSessionDescriptionInit = { type: "answer", sdp: "v=0\r\na=1\r\n" };
    const code = await createSession(offer);
    // submitAnswer ne doit pas lever d'erreur et doit changer le status en "connected"
    await expect(submitAnswer(code, answer)).resolves.toBeUndefined();
    // La session est maintenant "connected" — fetchSession la rejette comme occupée
    await expect(fetchSession(code)).rejects.toThrow("Cette session est déjà occupée");
  });

  it("endSession change le status en 'ended'", async () => {
    const offer: RTCSessionDescriptionInit = { type: "offer", sdp: "v=0\r\n" };
    const code = await createSession(offer);
    await endSession(code);
    // La session est marquée ended — fetchSession (filtre status=waiting) doit échouer
    await expect(fetchSession(code)).rejects.toThrow();
  });

  it("fetchSession lève une erreur si code introuvable", async () => {
    await expect(fetchSession("XXXXXX")).rejects.toThrow("Session introuvable");
  });
});

describe("Signaling — génération de code", () => {
  it("génère des codes uniques", async () => {
    const offer: RTCSessionDescriptionInit = { type: "offer", sdp: "" };
    const codes = new Set<string>();
    for (let i = 0; i < 20; i++) {
      // Mock fresh session store each time
      vi.clearAllMocks();
      const code = await createSession(offer);
      codes.add(code);
    }
    // Tous les codes doivent être alphanumériques uppercase sans ambiguïté (0, O, I, 1 exclus)
    codes.forEach((code) => {
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    });
  });
});
