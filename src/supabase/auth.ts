import { supabase } from "./client";

export async function getInitialSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

export function listenAuthChanges(onChange: () => void) {
  const { data } = supabase.auth.onAuthStateChange(() => {
    onChange();
  });
  return () => data.subscription.unsubscribe();
}
