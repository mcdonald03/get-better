import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

// One anonymous session per browser. Memoised so React StrictMode's double effect can't create two users.
let pending: Promise<string | null> | undefined;
export const getUserId = () =>
  (pending ??= (async () => {
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user ?? (await supabase.auth.signInAnonymously()).data.user;
    return user?.id ?? null;
  })());

