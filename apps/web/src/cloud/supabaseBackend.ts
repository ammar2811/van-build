import { createClient, type User } from "@supabase/supabase-js";
import { DESIGN_SCHEMA_VERSION, type DesignDoc } from "@vanbuild/core";
import {
  type CloudBackend,
  type CloudDesignSummary,
  type CloudUser,
  type CloudVersion,
  ConflictError,
  newShareToken,
  sha256Hex,
} from "./backend";

const SUMMARY = "id, name, shell_id, revision, updated_at";

interface SummaryRow {
  id: string;
  name: string;
  shell_id: string;
  revision: number;
  updated_at: string;
}

function summary(row: SummaryRow): CloudDesignSummary {
  return {
    id: row.id,
    name: row.name,
    shellId: row.shell_id,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function toUser(user: User | null | undefined): CloudUser | null {
  return user ? { id: user.id, email: user.email ?? "" } : null;
}

/** Postgres raised "revision conflict" from the designs trigger. */
const SERIALIZATION_FAILURE = "40001";

function designName(doc: DesignDoc): string {
  return doc.name.trim().slice(0, 120) || "Untitled layout";
}

export function supabaseBackend(url: string, key: string): CloudBackend {
  const client = createClient(url, key, {
    auth: { flowType: "pkce", persistSession: true, detectSessionInUrl: true },
  });

  const fail = (error: { message: string } | null): void => {
    if (error) throw new Error(error.message);
  };

  return {
    async currentUser() {
      const { data } = await client.auth.getSession();
      return toUser(data.session?.user);
    },
    onUserChange(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        // Supabase calls back while holding its auth lock; anything that calls the API from
        // inside the callback would wait on that lock forever. Step outside it first.
        setTimeout(() => listener(toUser(session?.user)), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async sendSignInLink(email, redirectTo) {
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
      });
      fail(error);
    },
    async signOut() {
      const { error } = await client.auth.signOut();
      fail(error);
    },

    async listDesigns() {
      const { data, error } = await client
        .from("designs")
        .select(SUMMARY)
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });
      fail(error);
      return (data ?? []).map(summary);
    },
    async getDesign(id) {
      const { data, error } = await client
        .from("designs")
        .select(`${SUMMARY}, doc`)
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      fail(error);
      return data ? { ...summary(data), doc: data.doc } : null;
    },
    async createDesign(doc) {
      const { data, error } = await client
        .from("designs")
        .insert({
          name: designName(doc),
          shell_id: doc.shellId,
          schema_version: DESIGN_SCHEMA_VERSION,
          doc,
        })
        .select(SUMMARY)
        .single();
      fail(error);
      return summary(data as SummaryRow);
    },
    async saveDesign(id, doc, expectedRevision) {
      const { data, error } = await client
        .from("designs")
        .update({
          name: designName(doc),
          shell_id: doc.shellId,
          schema_version: DESIGN_SCHEMA_VERSION,
          doc,
          revision: expectedRevision + 1,
        })
        .eq("id", id)
        .eq("revision", expectedRevision)
        .is("deleted_at", null)
        .select("revision");
      if (error?.code === SERIALIZATION_FAILURE) throw new ConflictError();
      fail(error);
      const row = data?.[0];
      // No row matched: someone else saved first (or the design was deleted).
      if (!row) throw new ConflictError();
      return row.revision;
    },
    async deleteDesign(id, expectedRevision) {
      const { data, error } = await client
        .from("designs")
        .update({ deleted_at: new Date().toISOString(), revision: expectedRevision + 1 })
        .eq("id", id)
        .eq("revision", expectedRevision)
        .select("id");
      if (error?.code === SERIALIZATION_FAILURE) throw new ConflictError();
      fail(error);
      if (!data?.length) throw new ConflictError();
    },

    async listVersions(designId) {
      const { data, error } = await client
        .from("design_versions")
        .select("id, label, revision, created_at")
        .eq("design_id", designId)
        .order("created_at", { ascending: false });
      fail(error);
      return (data ?? []).map(
        (row): CloudVersion => ({
          id: row.id,
          label: row.label,
          revision: row.revision,
          createdAt: row.created_at,
        }),
      );
    },
    async getVersion(id) {
      const { data, error } = await client
        .from("design_versions")
        .select("doc")
        .eq("id", id)
        .maybeSingle();
      fail(error);
      return data?.doc ?? null;
    },
    async saveVersion(designId, label, revision, doc) {
      const { data, error } = await client
        .from("design_versions")
        .insert({ design_id: designId, label, revision, doc })
        .select("id, label, revision, created_at")
        .single();
      fail(error);
      if (!data) throw new Error("The version was not saved");
      return {
        id: data.id,
        label: data.label,
        revision: data.revision,
        createdAt: data.created_at,
      };
    },

    async createShareLink(designId) {
      await this.revokeShareLinks(designId);
      const token = newShareToken();
      const { error } = await client
        .from("share_links")
        .insert({ design_id: designId, token_hash: await sha256Hex(token) });
      fail(error);
      return token;
    },
    async revokeShareLinks(designId) {
      const { error } = await client
        .from("share_links")
        .update({ revoked_at: new Date().toISOString() })
        .eq("design_id", designId)
        .is("revoked_at", null);
      fail(error);
    },
    async hasShareLink(designId) {
      const { count, error } = await client
        .from("share_links")
        .select("id", { count: "exact", head: true })
        .eq("design_id", designId)
        .is("revoked_at", null);
      fail(error);
      return (count ?? 0) > 0;
    },
    async openShared(token) {
      const { data, error } = await client.rpc("get_shared_design", { token });
      fail(error);
      const row = (data as { name: string; doc: unknown }[] | null)?.[0];
      return row ? { name: row.name, doc: row.doc } : null;
    },
  };
}
