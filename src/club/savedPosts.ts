import AsyncStorage from "@react-native-async-storage/async-storage";

export type SavedPost = {
  post_id: string;
  caption: string | null;
  image_url: string | null;
  created_at: string | null;

  store_id?: string | null;
  store_name?: string | null;
  store_location?: string | null;
  store_category?: string | null;

  likes_count?: number | null;
  comments_count?: number | null;
};

const KEY = "zetra.club.saved.v1";

type SavedMap = Record<string, SavedPost>;

async function readMap(): Promise<SavedMap> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as SavedMap) : {};
  } catch {
    return {};
  }
}

async function writeMap(m: SavedMap) {
  await AsyncStorage.setItem(KEY, JSON.stringify(m));
}

export async function getSavedMap(): Promise<SavedMap> {
  return readMap();
}

export async function isPostSaved(postId: string): Promise<boolean> {
  const m = await readMap();
  return !!m[String(postId)];
}

export async function toggleSave(post: SavedPost): Promise<{ saved: boolean; map: SavedMap }> {
  const id = String(post.post_id || "").trim();
  if (!id) return { saved: false, map: await readMap() };

  const m = await readMap();
  const exists = !!m[id];

  if (exists) {
    delete m[id];
    await writeMap(m);
    return { saved: false, map: m };
  }

  // store snapshot
  m[id] = { ...post, post_id: id };
  await writeMap(m);
  return { saved: true, map: m };
}

export async function removeSaved(postId: string) {
  const id = String(postId || "").trim();
  if (!id) return;
  const m = await readMap();
  delete m[id];
  await writeMap(m);
}

export async function getSavedList(): Promise<SavedPost[]> {
  const m = await readMap();
  const arr = Object.values(m);
  // newest first by created_at (fallback by insertion unknown)
  arr.sort((a, b) => {
    const ta = a?.created_at ? new Date(a.created_at).getTime() : 0;
    const tb = b?.created_at ? new Date(b.created_at).getTime() : 0;
    return tb - ta;
  });
  return arr;
}