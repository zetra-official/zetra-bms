"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/supabaseClient";

type Props = {
  params:
    | Promise<{
        slug: string;
      }>
    | {
        slug: string;
      };
};

type StoreRow = {
  id: string;
  name: string | null;
  slug: string | null;
  organization_id: string;
  is_active: boolean | null;
};

type PublicStoreHeroRow = {
  store_slug: string | null;
  store_name: string | null;
  post_id: string | null;
  store_id: string | null;
  caption: string | null;
  image_url: string | null;
  created_at: string | null;
};

type StoreProductCardRow = {
  store_slug: string | null;
  store_name: string | null;
  store_id: string | null;
  id: string;
  name: string | null;
  sku: string | null;
  category: string | null;
  selling_price: number | null;
  barcode: string | null;
  qty_on_hand: number | null;
  reserved_qty: number | null;
  post_image_url: string | null;
  post_image_hq_url: string | null;
  post_caption: string | null;
  post_price: number | null;
  post_created_at: string | null;
};

type CartItem = {
  product_id: string;
  name: string;
  price: number;
  qty: number;
};

function money(n: number) {
  return `TZS ${Number(n || 0).toLocaleString()}`;
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function firstNonEmpty(...values: unknown[]) {
  for (const value of values) {
    const s = clean(value);
    if (s) return s;
  }
  return "";
}

function shortText(value: unknown, max = 88) {
  const s = clean(value);
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}...`;
}

export const dynamic = "force-dynamic";

export default function StorePage({ params }: Props) {
  const [storeSlug, setStoreSlug] = useState("");
  const [store, setStore] = useState<StoreRow | null>(null);
  const [heroPost, setHeroPost] = useState<PublicStoreHeroRow | null>(null);
  const [products, setProducts] = useState<StoreProductCardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);

        const resolvedParams = await Promise.resolve(params);
        const slug = clean(resolvedParams?.slug).toLowerCase();

        if (!mounted) return;
        setStoreSlug(slug);

        if (!slug) {
          setStore(null);
          setHeroPost(null);
          setProducts([]);
          return;
        }

        const { data: foundStore, error: storeError } = await supabase
          .from("stores")
          .select("id, name, slug, organization_id, is_active")
          .eq("slug", slug)
          .eq("is_active", true)
          .maybeSingle();

        if (!mounted) return;

        if (storeError || !foundStore) {
          setStore(null);
          setHeroPost(null);
          setProducts([]);
          return;
        }

        setStore(foundStore as StoreRow);

        const [{ data: foundHero }, { data: foundProducts, error: productsError }] =
          await Promise.all([
            supabase
              .from("public_store_hero_posts")
              .select(
                "store_slug, store_name, post_id, store_id, caption, image_url, created_at"
              )
              .eq("store_slug", slug)
              .maybeSingle(),

            supabase
              .from("public_store_products_with_images_v2")
              .select(`
                store_slug,
                store_name,
                store_id,
                id,
                name,
                sku,
                category,
                selling_price,
                barcode,
                qty_on_hand,
                reserved_qty,
                post_image_url,
                post_image_hq_url,
                post_caption,
                post_price,
                post_created_at
              `)
              .eq("store_slug", slug)
              .order("name", { ascending: true }),
          ]);

        if (!mounted) return;

        setHeroPost((foundHero as PublicStoreHeroRow | null) ?? null);

        if (productsError || !foundProducts) {
          setProducts([]);
          return;
        }

        setProducts((foundProducts as StoreProductCardRow[]) ?? []);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void run();

    return () => {
      mounted = false;
    };
  }, [params]);

  const addToCart = (p: StoreProductCardRow) => {
    const id = clean(p.id);
    if (!id) return;

    const stock = toNumber(p.qty_on_hand) - toNumber(p.reserved_qty);
    if (stock <= 0) return;

    const name = clean(p.name) || "Product";
    const price =
      toNumber(p.post_price) > 0 ? toNumber(p.post_price) : toNumber(p.selling_price);

    setCart((prev) => {
      const exists = prev.find((x) => x.product_id === id);

      if (exists) {
        if (exists.qty >= stock) return prev;
        return prev.map((x) =>
          x.product_id === id ? { ...x, qty: x.qty + 1 } : x
        );
      }

      return [...prev, { product_id: id, name, price, qty: 1 }];
    });
  };

  const incQty = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;

    const stock = toNumber(product.qty_on_hand) - toNumber(product.reserved_qty);

    setCart((prev) =>
      prev.map((x) => {
        if (x.product_id !== productId) return x;
        if (x.qty >= stock) return x;
        return { ...x, qty: x.qty + 1 };
      })
    );
  };

  const decQty = (productId: string) => {
    setCart((prev) =>
      prev
        .map((x) =>
          x.product_id === productId ? { ...x, qty: x.qty - 1 } : x
        )
        .filter((x) => x.qty > 0)
    );
  };

  const clearCart = () => {
    setCart([]);
  };

  const cartItems = useMemo(() => cart.reduce((a, x) => a + x.qty, 0), [cart]);
  const cartTotal = useMemo(
    () => cart.reduce((a, x) => a + x.qty * x.price, 0),
    [cart]
  );

  const title = clean(store?.name) || "Store";
  const heroImage = clean(heroPost?.image_url);
  const heroCaption = clean(heroPost?.caption);

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <div style={styles.loadingCard}>
            <div style={styles.loadingLineLg} />
            <div style={styles.loadingLineMd} />
            <div style={styles.loadingLineSm} />
          </div>
        </div>
      </main>
    );
  }

  if (!storeSlug) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <div style={styles.emptyCard}>
            <h1 style={styles.title}>Store not found</h1>
            <p style={styles.text}>Invalid store slug.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!store) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <div style={styles.emptyCard}>
            <h1 style={styles.title}>Store not found</h1>
            <p style={styles.text}>
              Hatukupata store ya slug: <b>{storeSlug}</b>
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        {heroImage ? (
          <section style={styles.heroWrap}>
            <img src={heroImage} alt={title} style={styles.heroImage} />
            <div style={styles.heroOverlay} />
            <div style={styles.heroContent}>
              <div style={styles.heroBadge}>ZETRA STORE</div>
              <h1 style={styles.heroTitle}>{title}</h1>
              <p style={styles.heroText}>
                {shortText(
                  heroCaption || "Welcome to the ZETRA marketplace store page.",
                  120
                )}
              </p>
            </div>
          </section>
        ) : (
          <section style={styles.plainHero}>
            <div style={styles.heroBadge}>ZETRA STORE</div>
            <h1 style={styles.title}>{title}</h1>
            <p style={styles.text}>Welcome to the ZETRA marketplace store page.</p>
          </section>
        )}

        <section style={styles.infoGrid}>
          <div style={styles.infoCard}>
            <div style={styles.infoCardTop}>
              <div>
                <p style={styles.sectionKicker}>STORE INFO</p>
                <h3 style={styles.cardTitle}>Store Details</h3>
              </div>
            </div>

            <div style={styles.metaGrid}>
              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Name</span>
                <span style={styles.metaValue}>{store.name || "—"}</span>
              </div>

              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Slug</span>
                <span style={styles.metaValue}>{storeSlug}</span>
              </div>

              <div style={styles.metaItem}>
                <span style={styles.metaLabel}>Status</span>
                <span style={styles.statusPill}>ACTIVE</span>
              </div>
            </div>
          </div>

          <div style={styles.cartCard}>
            <div style={styles.cartTopRow}>
              <div>
                <p style={styles.sectionKicker}>ORDER PREVIEW</p>
                <h3 style={{ ...styles.cardTitle, marginBottom: 8 }}>Cart Summary</h3>
                <p style={styles.text}>
                  <b>Items:</b> {cartItems}
                </p>
                <p style={styles.text}>
                  <b>Total:</b> {money(cartTotal)}
                </p>
              </div>

              <button
                onClick={clearCart}
                style={{
                  ...styles.secondaryButton,
                  opacity: cart.length === 0 ? 0.5 : 1,
                  cursor: cart.length === 0 ? "not-allowed" : "pointer",
                }}
                disabled={cart.length === 0}
              >
                Clear Cart
              </button>
            </div>

            {cart.length === 0 ? (
              <p style={{ ...styles.text, marginBottom: 0 }}>
                Hakuna bidhaa kwenye cart bado.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {cart.map((item) => (
                  <div key={item.product_id} style={styles.cartItem}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ ...styles.textStrong, marginBottom: 6 }}>{item.name}</p>
                      <p style={{ ...styles.small, marginBottom: 0 }}>
                        {money(item.price)} × {item.qty} = {money(item.price * item.qty)}
                      </p>
                    </div>

                    <div style={styles.qtyWrap}>
                      <button
                        onClick={() => decQty(item.product_id)}
                        style={styles.qtyButton}
                      >
                        −
                      </button>

                      <div style={styles.qtyValue}>{item.qty}</div>

                      <button
                        onClick={() => incQty(item.product_id)}
                        style={styles.qtyButton}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section style={styles.catalogCard}>
          <div style={styles.sectionHead}>
            <div>
              <p style={styles.sectionKicker}>STORE CATALOG</p>
              <h3 style={styles.sectionTitle}>Products</h3>
            </div>
            <div style={styles.sectionBadge}>
              {products.length} item{products.length === 1 ? "" : "s"}
            </div>
          </div>

          {!products.length ? (
            <div style={styles.emptyCard}>
              <h3 style={styles.emptyTitle}>No products found</h3>
              <p style={styles.emptyText}>Hakuna bidhaa kwenye store hii kwa sasa.</p>
            </div>
          ) : (
            <div style={styles.grid}>
              {products.map((p) => {
                const stock = toNumber(p.qty_on_hand) - toNumber(p.reserved_qty);
                const qty = cart.find((x) => x.product_id === p.id)?.qty ?? 0;
                const imageUrl = firstNonEmpty(p.post_image_hq_url, p.post_image_url);
                const displayPrice =
                  toNumber(p.post_price) > 0
                    ? toNumber(p.post_price)
                    : toNumber(p.selling_price);
                const caption = clean(p.post_caption);

                return (
                  <div key={p.id} style={styles.productCard}>
                    {imageUrl ? (
                      <div style={styles.productImageWrap}>
                        <img
                          src={imageUrl}
                          alt={clean(p.name) || "Product"}
                          style={styles.productImage}
                        />
                      </div>
                    ) : (
                      <div style={styles.productImageFallback}>
                        <span style={styles.productImageFallbackText}>No Image</span>
                      </div>
                    )}

                    <div style={styles.productBody}>
                      <h4 style={styles.productTitle}>{p.name ?? "Product"}</h4>

                      <p style={styles.captionText}>
                        {caption ? shortText(caption, 72) : "No product caption."}
                      </p>

                      <div style={styles.metaLines}>
                        <p style={styles.small}>SKU: {p.sku ?? "—"}</p>
                        <p style={styles.small}>Category: {p.category ?? "—"}</p>
                        <p style={styles.small}>Barcode: {p.barcode ?? "—"}</p>
                      </div>

                      <div style={styles.priceBlock}>
                        <p style={styles.price}>{money(displayPrice)}</p>

                        <p
                          style={{
                            ...styles.stockText,
                            color: stock > 0 ? "#9ca3af" : "#ef4444",
                          }}
                        >
                          Stock: {stock}
                        </p>
                      </div>

                      {qty > 0 ? (
                        <div style={styles.qtySection}>
                          <div style={styles.qtyWrap}>
                            <button onClick={() => decQty(p.id)} style={styles.qtyButton}>
                              −
                            </button>

                            <div style={styles.qtyValue}>{qty}</div>

                            <button onClick={() => incQty(p.id)} style={styles.qtyButton}>
                              +
                            </button>
                          </div>

                          <p style={{ ...styles.small, marginTop: 10, marginBottom: 0 }}>
                            In cart: {qty}
                          </p>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(p)}
                          style={{
                            ...styles.button,
                            width: "100%",
                            marginTop: 14,
                            opacity: stock > 0 ? 1 : 0.55,
                            cursor: stock > 0 ? "pointer" : "not-allowed",
                          }}
                          disabled={stock <= 0}
                        >
                          {stock > 0 ? "Add to Cart" : "Out of Stock"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div style={styles.actionRow}>
          <button style={styles.secondaryButtonLarge}>Contact Store</button>

          <button
            style={{
              ...styles.buttonLarge,
              background: cart.length === 0 ? "#3a3f46" : "#00d084",
              opacity: cart.length === 0 ? 0.55 : 1,
              cursor: cart.length === 0 ? "not-allowed" : "pointer",
            }}
            disabled={cart.length === 0}
          >
            Checkout ({cartItems})
          </button>
        </div>
      </div>
    </main>
  );
}

const styles: any = {
  main: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(16,185,129,0.06) 0%, rgba(11,15,20,1) 34%), #0b0f14",
    color: "white",
    padding: "28px 20px 56px",
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  container: {
    maxWidth: 1180,
    margin: "0 auto",
  },

  heroWrap: {
    position: "relative",
    width: "100%",
    height: 300,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 20,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "#11161d",
    boxShadow: "0 18px 40px rgba(0,0,0,0.22)",
  },

  plainHero: {
    padding: 22,
    borderRadius: 24,
    background: "linear-gradient(180deg, #131922 0%, #0f141b 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    marginBottom: 20,
  },

  heroImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  heroOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.20) 45%, rgba(0,0,0,0.74) 100%)",
  },

  heroContent: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 22,
  },

  heroBadge: {
    display: "inline-block",
    marginBottom: 10,
    padding: "7px 12px",
    borderRadius: 999,
    background: "rgba(0,0,0,0.36)",
    border: "1px solid rgba(255,255,255,0.10)",
    color: "#34d399",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1,
  },

  heroTitle: {
    fontSize: 40,
    fontWeight: 900,
    margin: 0,
    marginBottom: 10,
    color: "white",
    textShadow: "0 4px 18px rgba(0,0,0,0.35)",
    lineHeight: 1.02,
  },

  heroText: {
    margin: 0,
    color: "rgba(255,255,255,0.92)",
    fontSize: 15,
    fontWeight: 700,
    maxWidth: 760,
    lineHeight: 1.55,
  },

  title: {
    fontSize: 38,
    fontWeight: 900,
    margin: 0,
    marginBottom: 10,
  },

  text: {
    opacity: 0.82,
    marginBottom: 10,
    lineHeight: 1.55,
  },

  textStrong: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: "white",
  },

  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))",
    gap: 18,
    marginBottom: 20,
  },

  infoCard: {
    padding: 20,
    borderRadius: 18,
    background: "linear-gradient(180deg, #131922 0%, #0f141b 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
  },

  infoCardTop: {
    marginBottom: 14,
  },

  metaGrid: {
    display: "grid",
    gap: 12,
  },

  metaItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "12px 14px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
    flexWrap: "wrap",
  },

  metaLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontWeight: 700,
  },

  metaValue: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 800,
    textAlign: "right",
    wordBreak: "break-word",
  },

  statusPill: {
    padding: "7px 12px",
    borderRadius: 999,
    background: "rgba(52,211,153,0.12)",
    border: "1px solid rgba(52,211,153,0.24)",
    color: "#34d399",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 0.4,
  },

  cartCard: {
    padding: 20,
    borderRadius: 18,
    background: "rgba(0,208,132,0.08)",
    border: "1px solid rgba(0,208,132,0.22)",
    boxShadow: "0 12px 28px rgba(0,0,0,0.16)",
  },

  cartTopRow: {
    display: "flex",
    gap: 12,
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
    flexWrap: "wrap",
  },

  cartItem: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    background: "#0f141b",
    border: "1px solid rgba(255,255,255,0.06)",
    flexWrap: "wrap",
  },

  cardTitle: {
    marginTop: 0,
    marginBottom: 0,
    fontSize: 20,
    fontWeight: 900,
  },

  catalogCard: {
    padding: 20,
    borderRadius: 20,
    background: "linear-gradient(180deg, #131922 0%, #0f141b 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
    marginBottom: 22,
  },

  sectionHead: {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    marginBottom: 18,
  },

  sectionKicker: {
    margin: 0,
    color: "#34d399",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.2,
  },

  sectionTitle: {
    margin: "6px 0 0",
    fontSize: 28,
    fontWeight: 900,
  },

  sectionBadge: {
    padding: "10px 14px",
    borderRadius: 999,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: 13,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
    gap: 18,
  },

  productCard: {
    borderRadius: 18,
    background: "#0f141b",
    border: "1px solid rgba(255,255,255,0.06)",
    overflow: "hidden",
    boxShadow: "0 10px 26px rgba(0,0,0,0.14)",
  },

  productImageWrap: {
    width: "100%",
    aspectRatio: "4 / 4",
    background: "#0b0f14",
    overflow: "hidden",
  },

  productImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  productImageFallback: {
    width: "100%",
    aspectRatio: "4 / 4",
    background: "linear-gradient(180deg, #151b23 0%, #0f141b 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },

  productImageFallbackText: {
    color: "rgba(255,255,255,0.45)",
    fontWeight: 800,
    letterSpacing: 0.3,
  },

  productBody: {
    padding: 16,
  },

  productTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.3,
    marginBottom: 8,
    minHeight: 46,
  },

  captionText: {
    marginTop: 0,
    marginBottom: 10,
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    lineHeight: 1.45,
    minHeight: 38,
  },

  metaLines: {
    display: "grid",
    gap: 2,
  },

  priceBlock: {
    marginTop: 10,
  },

  price: {
    fontWeight: 900,
    fontSize: 20,
    marginTop: 0,
    marginBottom: 8,
    color: "#ffffff",
  },

  stockText: {
    fontSize: 13,
    fontWeight: 700,
    margin: 0,
    lineHeight: 1.45,
  },

  small: {
    opacity: 0.74,
    fontSize: 13,
    marginTop: 4,
    marginBottom: 0,
    lineHeight: 1.45,
  },

  qtySection: {
    marginTop: 12,
  },

  qtyWrap: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },

  qtyButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#161c24",
    color: "white",
    fontSize: 20,
    fontWeight: 800,
    cursor: "pointer",
  },

  qtyValue: {
    minWidth: 40,
    height: 38,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.08)",
    fontWeight: 800,
  },

  actionRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },

  button: {
    padding: "12px 22px",
    background: "#00d084",
    border: "none",
    borderRadius: 10,
    color: "black",
    fontWeight: 800,
    cursor: "pointer",
  },

  buttonLarge: {
    padding: "14px 22px",
    background: "#00d084",
    border: "none",
    borderRadius: 12,
    color: "black",
    fontWeight: 900,
    cursor: "pointer",
  },

  secondaryButton: {
    padding: "12px 18px",
    background: "#1a2028",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 10,
    color: "white",
    fontWeight: 700,
  },

  secondaryButtonLarge: {
    padding: "14px 22px",
    background: "#1a2028",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 12,
    color: "white",
    fontWeight: 800,
    cursor: "pointer",
  },

  emptyCard: {
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "linear-gradient(180deg, #131922 0%, #0f141b 100%)",
    padding: 22,
  },

  emptyTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 900,
  },

  emptyText: {
    margin: "8px 0 0",
    color: "rgba(255,255,255,0.70)",
    lineHeight: 1.6,
  },

  loadingCard: {
    marginTop: 22,
    padding: 22,
    borderRadius: 22,
    border: "1px solid rgba(255,255,255,0.06)",
    background: "linear-gradient(180deg, #131922 0%, #0f141b 100%)",
  },

  loadingLineLg: {
    height: 18,
    width: "42%",
    borderRadius: 999,
    background: "rgba(255,255,255,0.08)",
    marginBottom: 14,
  },

  loadingLineMd: {
    height: 14,
    width: "64%",
    borderRadius: 999,
    background: "rgba(255,255,255,0.06)",
    marginBottom: 10,
  },

  loadingLineSm: {
    height: 14,
    width: "30%",
    borderRadius: 999,
    background: "rgba(255,255,255,0.05)",
  },
};