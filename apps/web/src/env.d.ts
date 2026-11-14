interface ImportMetaEnv {
  /** The Supabase project URL, for accounts and cloud saves. Optional. */
  readonly VITE_SUPABASE_URL?: string;
  /** The project's publishable (public) key. Optional. */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  /** "test" builds the end-to-end test stand-in for the account service. */
  readonly VITE_CLOUD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
