import { describe, expect, it } from "vitest";
import { getEmailAdapter, renderInviteEmail } from "../../src/lib/email";

describe("getEmailAdapter", () => {
  it("returns the console no-op adapter when zero EMAIL_* env vars are set — the app keeps working unconfigured", async () => {
    const adapter = getEmailAdapter({});
    expect(adapter.kind).toBe("console");
    await expect(
      adapter.send({
        to: "worker@example.com",
        subject: "hola",
        text: "cuerpo",
      }),
    ).resolves.toBeUndefined();
  });

  it("ignores unrelated env vars and still falls back to console when EMAIL_* is absent", async () => {
    const adapter = getEmailAdapter({ NODE_ENV: "test", PATH: "/usr/bin" });
    expect(adapter.kind).toBe("console");
  });

  it("returns the SMTP-backed adapter when EMAIL_SMTP_HOST/EMAIL_SMTP_PORT/EMAIL_FROM are set, without opening a socket", () => {
    const adapter = getEmailAdapter({
      EMAIL_SMTP_HOST: "smtp.example.com",
      EMAIL_SMTP_PORT: "587",
      EMAIL_FROM: "no-reply@agropeq.io",
    });
    expect(adapter.kind).toBe("smtp");
    if (adapter.kind === "smtp") {
      expect(adapter.config.host).toBe("smtp.example.com");
      expect(adapter.config.port).toBe(587);
      expect(adapter.config.from).toBe("no-reply@agropeq.io");
    }
  });

  it("carries optional auth credentials into the SMTP config when provided", () => {
    const adapter = getEmailAdapter({
      EMAIL_SMTP_HOST: "smtp.example.com",
      EMAIL_SMTP_PORT: "465",
      EMAIL_FROM: "no-reply@agropeq.io",
      EMAIL_SMTP_USER: "agropeq",
      EMAIL_SMTP_PASS: "secret",
    });
    expect(adapter.kind).toBe("smtp");
    if (adapter.kind === "smtp") {
      expect(adapter.config.user).toBe("agropeq");
      expect(adapter.config.pass).toBe("secret");
    }
  });

  it("falls back to console when only a partial SMTP config is present (missing EMAIL_FROM)", () => {
    const adapter = getEmailAdapter({
      EMAIL_SMTP_HOST: "smtp.example.com",
      EMAIL_SMTP_PORT: "587",
    });
    expect(adapter.kind).toBe("console");
  });
});

describe("renderInviteEmail", () => {
  const params = {
    orgName: "Finca El Roble",
    acceptUrl: "https://agropeq.io/es/invite/abc123",
  };

  it("renders a Spanish invite containing the org name and accept link", () => {
    const email = renderInviteEmail(params, "es");
    expect(email.subject).toContain("Finca El Roble");
    expect(email.text).toContain(params.acceptUrl);
  });

  it("renders an English invite with a subject distinct from the Spanish one", () => {
    const es = renderInviteEmail(params, "es");
    const en = renderInviteEmail(params, "en");
    expect(en.subject).not.toBe(es.subject);
    expect(en.subject).toContain("Finca El Roble");
    expect(en.text).toContain(params.acceptUrl);
  });
});
