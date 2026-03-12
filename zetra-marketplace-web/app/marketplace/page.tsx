"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/src/supabaseClient";

type StoreRow = {
  id: string;
  slug: string | null;
  name: string | null;
  verified?: boolean | null;
  verification_level?: string | null;
};

type PostRow = {
  post_id: string;
  store_slug: string | null;
  store_name: string | null;
  image_url: string | null;
  caption: string | null;
  verified?: boolean | null;
  verification_level?: string | null;
};

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function includesText(value: unknown, q: string) {
  return clean(value).toLowerCase().includes(q);
}

function isVerified(row: { verified?: boolean | null; verification_level?: string | null }) {
  if (row.verified === true) return true;
  const lvl = clean(row.verification_level).toLowerCase();
  return lvl === "verified" || lvl === "premium" || lvl === "official";
}

function shortText(value: unknown, max = 110) {
  const s = clean(value);
  if (!s) return "";
  if (s.length <= max) return s;
  return `${s.slice(0, max).trim()}...`;
}

export default function MarketplacePage() {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "stores" | "posts">("all");

  useEffect(() => {
    let mounted = true;

    async function run() {
      try {
        setLoading(true);

        const [{ data: sto }, { data: pos }] = await Promise.all([
          supabase.from("public_marketplace_stores_v1").select("*").limit(16),
          supabase.from("public_marketplace_posts_v1").select("*").limit(24),
        ]);

        if (!mounted) return;

        setStores((sto ?? []) as StoreRow[]);
        setPosts((pos ?? []) as PostRow[]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void run();

    return () => {
      mounted = false;
    };
  }, []);

  const q = clean(search).toLowerCase();

  const filteredStores = useMemo(() => {
    if (!q) return stores;
    return stores.filter((s) => includesText(s.name, q) || includesText(s.slug, q));
  }, [stores, q]);

  const filteredPosts = useMemo(() => {
    if (!q) return posts;
    return posts.filter((p) => {
      return (
        includesText(p.caption, q) ||
        includesText(p.store_name, q) ||
        includesText(p.store_slug, q)
      );
    });
  }, [posts, q]);

  const featuredPosts = useMemo(() => filteredPosts.slice(0, 3), [filteredPosts]);
  const feedPosts = useMemo(() => filteredPosts.slice(3), [filteredPosts]);

  const totalResults = filteredStores.length + filteredPosts.length;

  if (loading) {
    return (
      <main style={styles.main}>
        <div style={styles.container}>
          <div style={styles.hero}>
            <div style={styles.heroGlow} />
            <div style={styles.heroGlow2} />
            <div style={styles.heroContent}>
              <p style={styles.eyebrow}>ZETRA GLOBAL MARKETPLACE</p>
              <h1 style={styles.heroTitle}>Loading marketplace...</h1>
              <p style={styles.heroText}>Tunavuta stores na latest posts.</p>
            </div>
          </div>

          <div style={styles.loadingCard}>
            <div style={styles.loadingLineLg} />
            <div style={styles.loadingLineMd} />
            <div style={styles.loadingLineSm} />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.main}>
      <div style={styles.container}>
        <section style={styles.hero}>
          <div style={styles.heroGlow} />
          <div style={styles.heroGlow2} />
          <div style={styles.heroContent}>
            <p style={styles.eyebrow}>ZETRA GLOBAL MARKETPLACE</p>

            <h1 style={styles.heroTitle}>Discover stores and live business posts</h1>

            <p style={styles.heroText}>
              Marketplace ya ZETRA ime-focus kwenye stores na live posts za biashara
              ili kuonyesha content halisi yenye mvuto zaidi.
            </p>

            <div style={styles.searchWrap}>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search stores or posts..."
                style={styles.searchInput}
              />

              <button
                type="button"
                onClick={() => setSearch("")}
                style={{
                  ...styles.clearBtn,
                  opacity: q ? 1 : 0.5,
                  cursor: q ? "pointer" : "not-allowed",
                }}
                disabled={!q}
              >
                Clear
              </button>
            </div>

            <div style={styles.statsRow}>
              <div style={styles.statPill}>
                <span style={styles.statLabel}>Stores</span>
                <span style={styles.statValue}>{filteredStores.length}</span>
              </div>

              <div style={styles.statPill}>
                <span style={styles.statLabel}>Posts</span>
                <span style={styles.statValue}>{filteredPosts.length}</span>
              </div>

              <div style={styles.statPill}>
                <span style={styles.statLabel}>Results</span>
                <span style={styles.statValue}>{totalResults}</span>
              </div>
            </div>

            <div style={styles.tabsRow}>
              <button
                type="button"
                onClick={() => setTab("all")}
                style={{ ...styles.tabBtn, ...(tab === "all" ? styles.tabActive : {}) }}
              >
                All
              </button>

              <button
                type="button"
                onClick={() => setTab("stores")}
                style={{ ...styles.tabBtn, ...(tab === "stores" ? styles.tabActive : {}) }}
              >
                Stores
              </button>

              <button
                type="button"
                onClick={() => setTab("posts")}
                style={{ ...styles.tabBtn, ...(tab === "posts" ? styles.tabActive : {}) }}
              >
                Posts
              </button>
            </div>
          </div>
        </section>

        {(tab === "all" || tab === "posts") && featuredPosts.length > 0 && (
          <section style={styles.section}>
            <div style={styles.sectionHead}>
              <div>
                <p style={styles.sectionKicker}>TRENDING NOW</p>
                <h2 style={styles.sectionTitle}>Featured Posts</h2>
              </div>

              <div style={styles.sectionBadge}>
                {featuredPosts.length} featured
              </div>
            </div>

            <div style={styles.featuredGrid}>
              {featuredPosts.map((p, index) => {
                const href = clean(p.store_slug) ? `/store/${clean(p.store_slug)}` : "#";
                const verified = isVerified(p);

                return (
                  <a key={p.post_id} href={href} style={styles.featuredCard}>
                    <div style={styles.featuredImageWrap}>
                      {clean(p.image_url) ? (
                        <img
                          src={clean(p.image_url)}
                          alt={clean(p.caption) || "Featured post"}
                          style={styles.featuredImage}
                        />
                      ) : (
                        <div style={styles.imageFallback}>No Image</div>
                      )}

                      <div style={styles.featuredShade} />

                      <div style={styles.featuredBadge}>
                        <span style={styles.featuredBadgeText}>
                          #{index + 1} Featured
                        </span>
                      </div>

                      <div style={styles.featuredContent}>
                        <div style={styles.featuredStoreRow}>
                          <span style={styles.featuredStoreName}>
                            {clean(p.store_name) || "Store"}
                          </span>
                          {verified ? <span style={styles.verifiedDot}>✓</span> : null}
                        </div>

                        <p style={styles.featuredCaption}>
                          {shortText(p.caption, 120) || "Open store to view this business post."}
                        </p>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}

        {(tab === "all" || tab === "stores") && (
          <section style={styles.section}>
            <div style={styles.sectionHead}>
              <div>
                <p style={styles.sectionKicker}>EXPLORE STORES</p>
                <h2 style={styles.sectionTitle}>Stores</h2>
              </div>

              <div style={styles.sectionBadge}>
                {filteredStores.length} store{filteredStores.length === 1 ? "" : "s"}
              </div>
            </div>

            {!filteredStores.length ? (
              <div style={styles.emptyCard}>
                <h3 style={styles.emptyTitle}>No stores found</h3>
                <p style={styles.emptyText}>
                  Search nyingine inaweza kuonyesha stores zaidi.
                </p>
              </div>
            ) : (
              <div style={styles.storesGrid}>
                {filteredStores.map((s) => {
                  const verified = isVerified(s);

                  return (
                    <a
                      key={s.id}
                      href={clean(s.slug) ? `/store/${clean(s.slug)}` : "#"}
                      style={styles.storeCard}
                    >
                      <div style={styles.storeIcon}>S</div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={styles.storeTitleRow}>
                          <h3 style={styles.storeTitle}>
                            {clean(s.name) || "Unnamed store"}
                          </h3>
                          {verified ? <span style={styles.verifiedMini}>✓</span> : null}
                        </div>

                        <p style={styles.storeSlug}>
                          /store/{clean(s.slug) || "no-slug"}
                        </p>
                      </div>

                      <span style={styles.storeArrow}>→</span>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {(tab === "all" || tab === "posts") && (
          <section style={styles.section}>
            <div style={styles.sectionHead}>
              <div>
                <p style={styles.sectionKicker}>LIVE BUSINESS FEED</p>
                <h2 style={styles.sectionTitle}>Latest Posts</h2>
              </div>

              <div style={styles.sectionBadge}>
                {filteredPosts.length} post{filteredPosts.length === 1 ? "" : "s"}
              </div>
            </div>

            {!filteredPosts.length ? (
              <div style={styles.emptyCard}>
                <h3 style={styles.emptyTitle}>No posts found</h3>
                <p style={styles.emptyText}>
                  Hakuna post inayolingana na search yako kwa sasa.
                </p>
              </div>
            ) : (
              <div style={styles.postsGrid}>
                {(tab === "posts" ? filteredPosts : feedPosts).map((p) => {
                  const verified = isVerified(p);

                  return (
                    <a
                      key={p.post_id}
                      href={clean(p.store_slug) ? `/store/${clean(p.store_slug)}` : "#"}
                      style={styles.postCard}
                    >
                      <div style={styles.postImageWrap}>
                        {clean(p.image_url) ? (
                          <img
                            src={clean(p.image_url)}
                            alt={clean(p.caption) || "Post"}
                            style={styles.postImage}
                          />
                        ) : (
                          <div style={styles.imageFallback}>No Image</div>
                        )}

                        <div style={styles.postImageShade} />
                      </div>

                      <div style={styles.postBody}>
                        <div style={styles.postStoreRow}>
                          <p style={styles.cardOverline}>
                            Store: {clean(p.store_name) || "Store"}
                          </p>
                          {verified ? <span style={styles.verifiedMini}>✓</span> : null}
                        </div>

                        <p style={styles.postCaption}>
                          {shortText(p.caption, 92) || "No caption"}
                        </p>

                        <div style={styles.postActionRow}>
                          <span style={styles.viewLink}>Visit store</span>
                          <span style={styles.actionArrow}>→</span>
                        </div>
                      </div>
                    </a>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

const styles: any = {
  main: {
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top, rgba(16,185,129,0.08) 0%, rgba(11,15,20,1) 32%), #0b0f14",
    color: "#ffffff",
    padding: "28px 18px 80px",
    fontFamily:
      'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },

  container: {
    maxWidth: 1280,
    margin: "0 auto",
  },

  hero: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 28,
    border: "1px solid rgba(255,255,255,0.08)",
    background:
      "linear-gradient(135deg, rgba(17,22,29,0.96) 0%, rgba(10,14,19,0.98) 100%)",
    padding: "36px 24px 28px",
    marginBottom: 28,
    boxShadow: "0 20px 60px rgba(0,0,0,0.30)",
  },

  heroGlow: {
    position: "absolute",
    width: 420,
    height: 420,
    right: -120,
    top: -160,
    borderRadius: 999,
    background:
      "radial-gradient(circle, rgba(0,208,132,0.18) 0%, rgba(0,208,132,0) 70%)",
    pointerEvents: "none",
  },

  heroGlow2: {
    position: "absolute",
    width: 260,
    height: 260,
    left: -80,
    bottom: -120,
    borderRadius: 999,
    background:
      "radial-gradient(circle, rgba(59,130,246,0.10) 0%, rgba(59,130,246,0) 72%)",
    pointerEvents: "none",
  },

  heroContent: {
    position: "relative",
    zIndex: 1,
  },

  eyebrow: {
    margin: 0,
    marginBottom: 12,
    color: "#34d399",
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: 1.4,
  },

  heroTitle: {
    margin: 0,
    fontSize: "clamp(34px, 6vw, 64px)",
    lineHeight: 1.02,
    fontWeight: 900,
    maxWidth: 920,
    letterSpacing: -1.4,
  },

  heroText: {
    marginTop: 14,
    marginBottom: 0,
    maxWidth: 760,
    color: "rgba(255,255,255,0.78)",
    fontSize: 16,
    lineHeight: 1.7,
    fontWeight: 500,
  },

  searchWrap: {
    marginTop: 22,
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
  },

  searchInput: {
    flex: 1,
    minWidth: 260,
    height: 54,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    color: "#ffffff",
    outline: "none",
    padding: "0 16px",
    fontSize: 15,
    fontWeight: 600,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  },

  clearBtn: {
    height: 54,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "#161c24",
    color: "#ffffff",
    borderRadius: 14,
    padding: "0 18px",
    fontWeight: 800,
  },

  statsRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 18,
  },

  statPill: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
  },

  statLabel: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 13,
    fontWeight: 700,
  },

  statValue: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: 900,
  },

  tabsRow: {
    display: "flex",
    gap: 10,
    marginTop: 18,
    flexWrap: "wrap",
  },

  tabBtn: {
    padding: "10px 16px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#ffffff",
    fontWeight: 800,
    cursor: "pointer",
    transition: "all 0.18s ease",
  },

  tabActive: {
    background: "#34d399",
    color: "#000",
    border: "1px solid #34d399",
    boxShadow: "0 8px 24px rgba(52,211,153,0.26)",
  },

  section: {
    marginTop: 30,
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
    gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))",
    gap: 18,
  },

  featuredCard: {
    display: "block",
    textDecoration: "none",
    color: "inherit",
    borderRadius: 24,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, #131922 0%, #0f141b 100%)",
    boxShadow: "0 16px 36px rgba(0,0,0,0.18)",
  },

  featuredImageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1.08",
    background: "#0b0f14",
    overflow: "hidden",
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
      "linear-gradient(180deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0.12) 40%, rgba(0,0,0,0.70) 100%)",
    pointerEvents: "none",
  },

  featuredBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    zIndex: 2,
    padding: "8px 12px",
    borderRadius: 999,
    background: "rgba(11,15,20,0.72)",
    border: "1px solid rgba(255,255,255,0.08)",
    backdropFilter: "blur(8px)",
  },

  featuredBadgeText: {
    color: "#ffffff",
    fontWeight: 900,
    fontSize: 11,
    letterSpacing: 0.3,
  },

  featuredContent: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    zIndex: 2,
  },

  featuredStoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  featuredStoreName: {
    color: "#ffffff",
    fontWeight: 900,
    fontSize: 16,
    lineHeight: 1.2,
  },

  verifiedDot: {
    width: 22,
    height: 22,
    minWidth: 22,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#34d399",
    color: "#000",
    fontSize: 12,
    fontWeight: 900,
  },

  featuredCaption: {
    margin: 0,
    color: "rgba(255,255,255,0.92)",
    fontSize: 14,
    lineHeight: 1.55,
    fontWeight: 600,
  },

  storesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
    gap: 16,
  },

  storeCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    textDecoration: "none",
    color: "inherit",
    padding: 18,
    borderRadius: 18,
    background: "linear-gradient(180deg, #131922 0%, #0f141b 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.14)",
  },

  storeIcon: {
    width: 46,
    height: 46,
    minWidth: 46,
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,208,132,0.12)",
    border: "1px solid rgba(0,208,132,0.24)",
    color: "#34d399",
    fontWeight: 900,
    fontSize: 18,
  },

  storeTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },

  storeTitle: {
    margin: 0,
    fontSize: 16,
    fontWeight: 900,
    lineHeight: 1.3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  verifiedMini: {
    width: 18,
    height: 18,
    minWidth: 18,
    borderRadius: 999,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#34d399",
    color: "#000",
    fontWeight: 900,
    fontSize: 10,
  },

  storeSlug: {
    margin: "6px 0 0",
    color: "rgba(255,255,255,0.60)",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.45,
    wordBreak: "break-word",
  },

  storeArrow: {
    color: "#34d399",
    fontWeight: 900,
    fontSize: 20,
  },

  postsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))",
    gap: 18,
  },

  postCard: {
    textDecoration: "none",
    color: "inherit",
    borderRadius: 20,
    overflow: "hidden",
    background: "linear-gradient(180deg, #131922 0%, #0f141b 100%)",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
    display: "block",
  },

  postImageWrap: {
    position: "relative",
    width: "100%",
    aspectRatio: "1 / 1",
    background: "#0b0f14",
    overflow: "hidden",
  },

  postImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },

  postImageShade: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(180deg, rgba(0,0,0,0.02) 45%, rgba(0,0,0,0.26) 100%)",
    pointerEvents: "none",
  },

  imageFallback: {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgba(255,255,255,0.40)",
    fontWeight: 800,
    background: "linear-gradient(180deg, #151b23 0%, #0f141b 100%)",
  },

  postBody: {
    padding: 16,
  },

  postStoreRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },

  cardOverline: {
    margin: 0,
    color: "#34d399",
    fontSize: 12,
    fontWeight: 800,
  },

  postCaption: {
    margin: 0,
    color: "#ffffff",
    lineHeight: 1.55,
    fontSize: 14,
    fontWeight: 600,
    minHeight: 44,
  },

  postActionRow: {
    marginTop: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTop: "1px solid rgba(255,255,255,0.06)",
  },

  viewLink: {
    color: "#34d399",
    fontWeight: 900,
    fontSize: 13,
  },

  actionArrow: {
    color: "#34d399",
    fontWeight: 900,
    fontSize: 18,
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