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
  verified?: boolean | null;
  verification_level?: string | null;
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

function shortText(value: unknown, max = 120) {
  const s = clean(value);
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}...`;
}

function isVerified(store: StoreRow | null) {
  if (!store) return false;
  if (store.verified === true) return true;

  const level = clean(store.verification_level).toLowerCase();
  return level === "verified" || level === "premium" || level === "official";
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
          .select("id, name, slug, organization_id, is_active, verified, verification_level")
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
  const cartTotal = useMemo(() => cart.reduce((a, x) => a + x.qty * x.price, 0), [cart]);

  const title = clean(store?.name) || "Store";
  const heroImage = clean(heroPost?.image_url);
  const heroCaption = clean(heroPost?.caption);
  const verified = isVerified(store);

  const featuredPosts = useMemo(() => {
    return [...products]
      .filter((p) => !!firstNonEmpty(p.post_image_hq_url, p.post_image_url))
      .sort((a, b) => {
        const at = new Date(clean(a.post_created_at) || 0).getTime();
        const bt = new Date(clean(b.post_created_at) || 0).getTime();
        return bt - at;
      })
      .slice(0, 6);
  }, [products]);

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <div style={styles.loadingHero}>
            <div style={styles.loadingGlow} />
            <h1 style={styles.title}>Loading...</h1>
            <p style={styles.text}>Tunavuta taarifa za store na bidhaa zake.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!storeSlug) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <h1 style={styles.title}>Store not found</h1>
          <p style={styles.text}>Invalid store slug.</p>
        </div>
      </main>
    );
  }

  if (!store) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <h1 style={styles.title}>Store not found</h1>
          <p style={styles.text}>
            Hatukupata store ya slug: <b>{storeSlug}</b>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        {heroImage ? (
          <div style={styles.heroWrap}>
            <img src={heroImage} alt={title} style={styles.heroImage} />
            <div style={styles.heroOverlay} />

            <div style={styles.heroTopBadge}>ZETRA STORE</div>

            <div style={styles.heroContent}>
              <div style={styles.heroTitleRow}>
                <h1 style={styles.heroTitle}>{title}</h1>
                {verified ? <span style={styles.verifiedBadge}>✓ Verified</span> : null}
              </div>

              <p style={styles.heroText}>
                {heroCaption || "Welcome to the ZETRA marketplace store page."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={styles.titleRow}>
              <h1 style={styles.title}>{title}</h1>
              {verified ? <span style={styles.verifiedBadge}>✓ Verified</span> : null}
            </div>
            <p style={styles.text}>Welcome to the ZETRA marketplace store page.</p>
          </>
        )}

        <div style={styles.storeMetaCard}>
          <div style={styles.metaHead}>
            <div>
              <p style={styles.metaKicker}>STORE PROFILE</p>
              <h3 style={styles.cardTitle}>Store Details</h3>
            </div>

            <div style={styles.metaPill}>ACTIVE</div>
          </div>

          <div style={styles.metaGrid}>
            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Name</span>
              <span style={styles.metaValue}>{store.name}</span>
            </div>

            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Slug</span>
              <span style={styles.metaValue}>/{storeSlug}</span>
            </div>

            <div style={styles.metaItem}>
              <span style={styles.metaLabel}>Verification</span>
              <span style={styles.metaValue}>{verified ? "VERIFIED" : "STANDARD"}</span>
            </div>
          </div>
        </div>

        {!!featuredPosts.length && (
          <section style={styles.section}>
            <div style={styles.sectionHead}>
              <div>
                <p style={styles.sectionKicker}>LATEST FROM THIS STORE</p>
                <h2 style={styles.sectionTitle}>Featured Posts</h2>
              </div>

              <div style={styles.sectionBadge}>
                {featuredPosts.length} visual post{featuredPosts.length === 1 ? "" : "s"}
              </div>
            </div>

            <div style={styles.featuredGrid}>
              {featuredPosts.map((p) => {
                const imageUrl = firstNonEmpty(p.post_image_hq_url, p.post_image_url);
                const displayPrice =
                  toNumber(p.post_price) > 0 ? toNumber(p.post_price) : toNumber(p.selling_price);

                return (
                  <div key={`featured-${p.id}`} style={styles.featuredCard}>
                    <div style={styles.featuredImageWrap}>
                      <img
                        src={imageUrl}
                        alt={clean(p.name) || "Post"}
                        style={styles.featuredImage}
                      />
                      <div style={styles.featuredShade} />
                      <div style={styles.featuredInfo}>
                        <h3 style={styles.featuredName}>{p.name ?? "Product"}</h3>
                        {!!clean(p.post_caption) && (
                          <p style={styles.featuredCaption}>
                            {shortText(p.post_caption, 88)}
                          </p>
                        )}
                        <p style={styles.featuredPrice}>{money(displayPrice)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div style={styles.cartCard}>
          <div style={styles.cartTopRow}>
            <div>
              <p style={styles.metaKicker}>SHOPPING</p>
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
                  <div style={{ flex: 1 }}>
                    <p style={{ ...styles.textStrong, marginBottom: 6 }}>{item.name}</p>
                    <p style={{ ...styles.small, marginBottom: 0 }}>
                      {money(item.price)} × {item.qty} = {money(item.price * item.qty)}
                    </p>
                  </div>

                  <div style={styles.qtyWrap}>
                    <button onClick={() => decQty(item.product_id)} style={styles.qtyButton}>
                      −
                    </button>

                    <div style={styles.qtyValue}>{item.qty}</div>

                    <button onClick={() => incQty(item.product_id)} style={styles.qtyButton}>
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <section style={styles.section}>
          <div style={styles.sectionHead}>
            <div>
              <p style={styles.sectionKicker}>STORE CATALOG</p>
              <h2 style={styles.sectionTitle}>Products</h2>
            </div>

            <div style={styles.sectionBadge}>
              {products.length} item{products.length === 1 ? "" : "s"}
            </div>
          </div>

          {!products.length ? (
            <div style={styles.emptyCard}>
              <h3 style={styles.emptyTitle}>No products found</h3>
              <p style={styles.emptyText}>
                Hakuna bidhaa zilizopatikana kwa store hii kwa sasa.
              </p>
            </div>
          ) : (
            <div style={styles.grid}>
              {products.map((p) => {
                const stock = toNumber(p.qty_on_hand) - toNumber(p.reserved_qty);
                const qty = cart.find((x) => x.product_id === p.id)?.qty ?? 0;
                const imageUrl = firstNonEmpty(p.post_image_hq_url, p.post_image_url);
                const displayPrice =
                  toNumber(p.post_price) > 0 ? toNumber(p.post_price) : toNumber(p.selling_price);
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
                        <div style={styles.productImageOverlay} />
                      </div>
                    ) : (
                      <div style={styles.productImageFallback}>
                        <span style={styles.productImageFallbackText}>No Image</span>
                      </div>
                    )}

                    <div style={styles.productBody}>
                      <h4 style={styles.productTitle}>{p.name ?? "Product"}</h4>

                      {!!caption && <p style={styles.captionText}>{shortText(caption, 90)}</p>}

                      <p style={styles.small}>SKU: {p.sku ?? "—"}</p>
                      <p style={styles.small}>Category: {p.category ?? "—"}</p>
                      <p style={styles.price}>{money(displayPrice)}</p>

                      <p
                        style={{
                          ...styles.small,
                          color: stock > 0 ? "#9ca3af" : "#ef4444",
                        }}
                      >
                        Stock: {stock}
                      </p>

                      <p style={styles.small}>Barcode: {p.barcode ?? "—"}</p>

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
                            marginTop: 12,
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

        <div style={{ height: 30 }} />

        <div style={styles.actionRow}>
          <button style={styles.button}>Contact Store</button>

          <button
            style={{
              ...styles.button,
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
    padding: "32px 20px 60px",
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  container: {
    maxWidth: 1160,
    margin: "0 auto",
  },

  loadingHero: {
    position: "relative",
    overflow: "hidden",
    padding: 28,
    borderRadius: 24,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, #11161d 0%, #0f141b 100%)",
  },

  loadingGlow: {
    position: "absolute",
    width: 340,
    height: 340,
    right: -90,
    top: -120,
    borderRadius: 999,
    background:
      "radial-gradient(circle, rgba(0,208,132,0.14) 0%, rgba(0,208,132,0) 72%)",
    pointerEvents: "none",
  },

  heroWrap: {
    position: "relative",
    width: "100%",
    height: 460,
    borderRadius: 24,
    overflow: "hidden",
    marginBottom: 22,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "#11161d",
    boxShadow: "0 18px 44px rgba(0,0,0,0.24)",
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
      "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.24) 36%, rgba(0,0,0,0.74) 100%)",
  },

  heroTopBadge: {
    position: "absolute",
    left: 24,
    top: 24,
    zIndex: 2,
    padding: "9px 14px",
    borderRadius: 999,
    background: "rgba(11,15,20,0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#ffffff",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 0.9,
    textTransform: "uppercase",
    backdropFilter: "blur(8px)",
  },

  heroContent: {
    position: "absolute",
    left: 24,
    right: 24,
    bottom: 24,
    zIndex: 2,
  },

  heroTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 10,
  },

  heroTitle: {
    fontSize: 46,
    fontWeight: 900,
    margin: 0,
    color: "white",
    textShadow: "0 4px 18px rgba(0,0,0,0.35)",
    letterSpacing: -0.8,
  },

  heroText: {
    margin: 0,
    color: "rgba(255,255,255,0.92)",
    fontSize: 16,
    fontWeight: 700,
    maxWidth: 760,
    lineHeight: 1.6,
  },

  verifiedBadge: {
    padding: "7px 12px",
    borderRadius: 999,
    background: "#34d399",
    color: "#000",
    fontWeight: 900,
    fontSize: 12,
    boxShadow: "0 10px 24px rgba(52,211,153,0.22)",
  },

  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    marginBottom: 10,
  },

  title: {
    fontSize: 38,
    fontWeight: 900,
    margin: 0,
    letterSpacing: -0.6,
  },

  text: {
    opacity: 0.82,
    marginBottom: 10,
    lineHeight: 1.6,
  },

  textStrong: {
    margin: 0,
    fontSize: 15,
    fontWeight: 700,
    color: "white",
  },

  storeMetaCard: {
    padding: 22,
    borderRadius: 18,
    background: "linear-gradient(180deg, #11161d 0%, #0f141b 100%)",
    border: "1px solid rgba(255,255,255,0.08)",
    marginBottom: 22,
  },

  metaHead: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 18,
  },

  metaKicker: {
    margin: 0,
    color: "#34d399",
    fontSize: 11,
    fontWeight: 900,
    letterSpacing: 1.2,
  },

  metaPill: {
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(0,208,132,0.10)",
    border: "1px solid rgba(0,208,132,0.22)",
    color: "#ffffff",
    fontWeight: 800,
    fontSize: 12,
  },

  metaGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
    gap: 14,
  },

  metaItem: {
    padding: 14,
    borderRadius: 14,
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.05)",
  },

  metaLabel: {
    display: "block",
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    fontWeight: 700,
    marginBottom: 6,
  },

  metaValue: {
    display: "block",
    color: "#ffffff",
    fontSize: 15,
    fontWeight: 900,
    wordBreak: "break-word",
  },

  section: {
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
    fontSize: 30,
    fontWeight: 900,
    letterSpacing: -0.6,
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

  featuredGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
    gap: 18,
  },

  featuredCard: {
    borderRadius: 18,
    overflow: "hidden",
    background: "linear-gradient(180deg, #11161d 0%, #0f141b 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 14px 30px rgba(0,0,0,0.18)",
  },

  featuredImageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1.05",
    overflow: "hidden",
    background: "#0b0f14",
  },

  featuredImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  featuredShade: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.08) 10%, rgba(0,0,0,0.14) 44%, rgba(0,0,0,0.76) 100%)",
  },

  featuredInfo: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 2,
  },

  featuredName: {
    margin: 0,
    color: "#ffffff",
    fontSize: 19,
    fontWeight: 900,
    lineHeight: 1.25,
    marginBottom: 8,
  },

  featuredCaption: {
    margin: 0,
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 10,
    fontWeight: 600,
  },

  featuredPrice: {
    margin: 0,
    color: "#ffffff",
    fontSize: 18,
    fontWeight: 900,
  },

  cardTitle: {
    marginTop: 0,
    marginBottom: 14,
    fontSize: 24,
    fontWeight: 900,
    letterSpacing: -0.4,
  },

  cartCard: {
    padding: 20,
    borderRadius: 18,
    background: "rgba(0,208,132,0.08)",
    border: "1px solid rgba(0,208,132,0.22)",
    marginBottom: 22,
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

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))",
    gap: 18,
  },

  productCard: {
    borderRadius: 16,
    background: "#0f141b",
    border: "1px solid rgba(255,255,255,0.06)",
    overflow: "hidden",
    boxShadow: "0 10px 24px rgba(0,0,0,0.14)",
  },

  productImageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    background: "#0b0f14",
    overflow: "hidden",
  },

  productImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  productImageOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.02) 54%, rgba(0,0,0,0.26) 100%)",
  },

  productImageFallback: {
    width: "100%",
    aspectRatio: "1 / 1",
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
  },

  captionText: {
    marginTop: 0,
    marginBottom: 10,
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    lineHeight: 1.45,
  },

  price: {
    fontWeight: 900,
    fontSize: 18,
    marginTop: 10,
    marginBottom: 8,
    color: "#ffffff",
  },

  small: {
    opacity: 0.72,
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
    boxShadow: "0 10px 22px rgba(0,208,132,0.18)",
  },

  secondaryButton: {
    padding: "12px 18px",
    background: "#1a2028",
    border: "1px solid rgba(255,255,255,0.10)",
    borderRadius: 10,
    color: "white",
    fontWeight: 700,
  },
};