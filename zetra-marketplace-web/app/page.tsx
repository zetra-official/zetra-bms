export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0f14",
        color: "white",
        padding: "60px",
        fontFamily: "system-ui",
      }}
    >
      <h1 style={{ fontSize: 40, fontWeight: 800 }}>
        ZETRA Marketplace
      </h1>

      <p style={{ marginTop: 10, opacity: 0.7 }}>
        Discover businesses, products, and services powered by ZETRA.
      </p>
    </main>
  );
}