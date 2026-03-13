export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at top, rgba(16,185,129,0.06) 0%, rgba(11,15,20,1) 34%), #0b0f14",
        color: "white",
        padding: "60px 24px",
        fontFamily:
          'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        <div
          style={{
            borderRadius: 28,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              "linear-gradient(135deg, rgba(17,22,29,0.96) 0%, rgba(10,14,19,0.98) 100%)",
            padding: "48px 28px",
            boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
          }}
        >
          <p
            style={{
              margin: 0,
              marginBottom: 12,
              color: "#34d399",
              fontSize: 12,
              fontWeight: 900,
              letterSpacing: 1.4,
            }}
          >
            ZETRA GLOBAL MARKETPLACE
          </p>

          <h1
            style={{
              margin: 0,
              fontSize: "clamp(40px, 7vw, 78px)",
              lineHeight: 1.02,
              fontWeight: 900,
              letterSpacing: -1.6,
              maxWidth: 900,
            }}
          >
            Discover stores and live business posts
          </h1>

          <p
            style={{
              marginTop: 18,
              marginBottom: 0,
              maxWidth: 760,
              color: "rgba(255,255,255,0.78)",
              fontSize: 18,
              lineHeight: 1.75,
              fontWeight: 500,
            }}
          >
            Marketplace ya ZETRA ime-focus kwenye stores na live posts za
            biashara ili kuonyesha content halisi yenye mvuto, usafi, na quality
            ya kimataifa.
          </p>

          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
              marginTop: 26,
            }}
          >
            <a
              href="/marketplace"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                padding: "14px 22px",
                borderRadius: 12,
                background: "#34d399",
                color: "#000",
                fontWeight: 900,
              }}
            >
              Open Marketplace
            </a>

            <a
              href="https://zetra.co.tz"
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                padding: "14px 22px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
                color: "#fff",
                fontWeight: 800,
              }}
            >
              Visit ZETRA
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}