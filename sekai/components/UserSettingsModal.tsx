"use client";

import { useEffect, useState } from "react";
import { X, LogOut, Copy } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Tab = "conta" | "privacidade" | "aparencia" | "idioma" | "avancado";

interface UserSettingsModalProps {
  userId: string;
  initial: {
    displayName: string;
    bio?: string | null;
    customStatus?: string | null;
    avatarUrl?: string | null;
  };
  onClose: () => void;
  onSaved: () => void;
}

export function UserSettingsModal({ userId, initial, onClose, onSaved }: UserSettingsModalProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<Tab>("conta");

  return (
    <div className="fixed inset-0 z-50 flex bg-discord-bg-primary">
      <div className="w-60 shrink-0 bg-discord-bg-dark p-4">
        <p className="mb-2 px-2 text-xs font-bold uppercase text-discord-text-muted">Configurações de usuário</p>
        {(
          [
            ["conta", "Minha Conta"],
            ["privacidade", "Privacidade e Segurança"],
            ["aparencia", "Aparência"],
            ["idioma", "Idioma"],
            ["avancado", "Avançado"],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "mb-0.5 w-full rounded px-2 py-1.5 text-left text-sm",
              tab === id
                ? "bg-discord-bg-modifier-hover text-discord-header-primary"
                : "text-discord-text-muted hover:bg-discord-bg-modifier-hover hover:text-discord-text-normal"
            )}
          >
            {label}
          </button>
        ))}

        <div className="my-3 h-px bg-black/30" />

        <button
          onClick={() => supabase.auth.signOut()}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-discord-danger hover:bg-discord-danger/10"
        >
          <LogOut className="h-4 w-4" /> Sair da conta
        </button>
      </div>

      <div className="relative flex-1 overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-6 top-6 flex h-9 w-9 items-center justify-center rounded-full border border-discord-text-muted text-discord-text-muted hover:border-discord-text-normal hover:text-discord-text-normal"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mx-auto max-w-xl px-8 py-10">
          {tab === "conta" && <ContaTab userId={userId} initial={initial} onSaved={onSaved} />}
          {tab === "privacidade" && <PrivacidadeTab userId={userId} />}
          {tab === "aparencia" && <AparenciaTab userId={userId} />}
          {tab === "idioma" && <IdiomaTab userId={userId} />}
          {tab === "avancado" && <AvancadoTab userId={userId} />}
        </div>
      </div>
    </div>
  );
}

// ---------------- Minha Conta ----------------
function ContaTab({
  userId,
  initial,
  onSaved,
}: {
  userId: string;
  initial: UserSettingsModalProps["initial"];
  onSaved: () => void;
}) {
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio ?? "");
  const [customStatus, setCustomStatus] = useState(initial.customStatus ?? "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(initial.avatarUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    setSaved(false);

    let avatarUrl = initial.avatarUrl ?? null;

    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });

      if (uploadError) {
        setSaving(false);
        setError("Falha ao enviar imagem: " + uploadError.message);
        return;
      }
      avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        custom_status: customStatus.trim() || null,
        avatar_url: avatarUrl,
      })
      .eq("id", userId);

    setSaving(false);

    if (updateError) {
      setError("Falha ao salvar: " + updateError.message);
      return;
    }

    setSaved(true);
    onSaved();
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-discord-header-primary">Minha Conta</h1>

      <div className="mb-6 rounded-lg bg-discord-bg-secondary p-6">
        <div className="mb-4 flex items-center gap-4">
          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full bg-discord-brand">
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
                {displayName[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <label className="cursor-pointer rounded bg-discord-bg-primary px-3 py-2 text-sm text-discord-text-normal hover:bg-discord-bg-modifier-hover">
            Trocar avatar
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
          </label>
        </div>

        <label className="mb-3 block text-xs font-semibold uppercase text-discord-text-muted">
          Nome de exibição
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="mt-1 w-full rounded bg-discord-bg-primary px-3 py-2 text-discord-text-normal focus:outline-none"
          />
        </label>

        <label className="mb-3 block text-xs font-semibold uppercase text-discord-text-muted">
          Status personalizado
          <input
            value={customStatus}
            maxLength={128}
            onChange={(e) => setCustomStatus(e.target.value)}
            placeholder="O que você está fazendo?"
            className="mt-1 w-full rounded bg-discord-bg-primary px-3 py-2 text-discord-text-normal focus:outline-none"
          />
        </label>

        <label className="block text-xs font-semibold uppercase text-discord-text-muted">
          Bio
          <textarea
            value={bio}
            maxLength={190}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="mt-1 w-full resize-none rounded bg-discord-bg-primary px-3 py-2 text-discord-text-normal focus:outline-none"
          />
        </label>
      </div>

      {error && <p className="mb-3 text-sm text-discord-danger">{error}</p>}
      {saved && <p className="mb-3 text-sm text-discord-online">Salvo!</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="rounded bg-discord-brand px-4 py-2 text-sm font-medium text-white hover:bg-discord-brand-hover disabled:opacity-60"
      >
        {saving ? "Salvando..." : "Salvar alterações"}
      </button>
    </div>
  );
}

// ---------------- Privacidade e Segurança ----------------
function PrivacidadeTab({ userId }: { userId: string }) {
  const supabase = createClient();
  const [allowDms, setAllowDms] = useState(true);
  const [explicitFilter, setExplicitFilter] = useState(0);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("user_settings")
      .select("allow_dms_from_server_members, explicit_content_filter")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setAllowDms(data.allow_dms_from_server_members);
          setExplicitFilter(data.explicit_content_filter);
        }
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function update(fields: Record<string, any>) {
    await supabase.from("user_settings").update(fields).eq("user_id", userId);
  }

  if (!loaded) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-discord-header-primary">Privacidade e Segurança</h1>

      <div className="mb-4 flex items-center justify-between rounded-lg bg-discord-bg-secondary p-4">
        <div>
          <p className="text-sm font-medium text-discord-header-primary">
            Permitir mensagens diretas de membros de servidores
          </p>
          <p className="text-xs text-discord-text-muted">
            Isso não afeta mensagens de amigos ou de quem você já conversou.
          </p>
        </div>
        <input
          type="checkbox"
          checked={allowDms}
          onChange={(e) => {
            setAllowDms(e.target.checked);
            update({ allow_dms_from_server_members: e.target.checked });
          }}
          className="h-5 w-5"
        />
      </div>

      <div className="rounded-lg bg-discord-bg-secondary p-4">
        <p className="mb-2 text-sm font-medium text-discord-header-primary">Filtro de conteúdo explícito</p>
        <select
          value={explicitFilter}
          onChange={(e) => {
            const v = Number(e.target.value);
            setExplicitFilter(v);
            update({ explicit_content_filter: v });
          }}
          className="w-full rounded bg-discord-bg-primary px-3 py-2 text-discord-text-normal focus:outline-none"
        >
          <option value={0}>Não filtrar imagens de ninguém</option>
          <option value={1}>Filtrar imagens de quem não é seu amigo</option>
          <option value={2}>Filtrar imagens de todos</option>
        </select>
      </div>
    </div>
  );
}

// ---------------- Aparência ----------------
function AparenciaTab({ userId }: { userId: string }) {
  const supabase = createClient();
  const [theme, setTheme] = useState("dark");
  const [compact, setCompact] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("user_settings")
      .select("theme, compact_mode")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setTheme(data.theme);
          setCompact(data.compact_mode);
        }
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function update(fields: Record<string, any>) {
    await supabase.from("user_settings").update(fields).eq("user_id", userId);
  }

  if (!loaded) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-discord-header-primary">Aparência</h1>

      <p className="mb-2 text-xs font-semibold uppercase text-discord-text-muted">Tema</p>
      <div className="mb-4 flex gap-3">
        {(["dark", "light", "amoled"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTheme(t);
              update({ theme: t });
            }}
            className={cn(
              "flex-1 rounded-lg border-2 p-3 text-sm capitalize",
              theme === t ? "border-discord-brand" : "border-transparent bg-discord-bg-secondary",
              t === "dark" && "bg-discord-bg-tertiary text-white",
              t === "light" && "bg-gray-200 text-black",
              t === "amoled" && "bg-black text-white"
            )}
          >
            {t === "dark" ? "Escuro" : t === "light" ? "Claro" : "Amoled"}
          </button>
        ))}
      </div>
      <p className="mb-4 text-xs text-discord-text-muted">
        Sua preferência é salva; a troca visual completa de tema entra no próximo passe de design do app.
      </p>

      <div className="flex items-center justify-between rounded-lg bg-discord-bg-secondary p-4">
        <p className="text-sm font-medium text-discord-header-primary">Modo compacto</p>
        <input
          type="checkbox"
          checked={compact}
          onChange={(e) => {
            setCompact(e.target.checked);
            update({ compact_mode: e.target.checked });
          }}
          className="h-5 w-5"
        />
      </div>
    </div>
  );
}

// ---------------- Idioma ----------------
function IdiomaTab({ userId }: { userId: string }) {
  const supabase = createClient();
  const [locale, setLocale] = useState("pt-BR");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase
      .from("user_settings")
      .select("locale")
      .eq("user_id", userId)
      .single()
      .then(({ data }) => {
        if (data) setLocale(data.locale);
        setLoaded(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!loaded) return null;

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-discord-header-primary">Idioma</h1>
      <select
        value={locale}
        onChange={async (e) => {
          setLocale(e.target.value);
          await supabase.from("user_settings").update({ locale: e.target.value }).eq("user_id", userId);
        }}
        className="w-full rounded bg-discord-bg-secondary px-3 py-2.5 text-discord-text-normal focus:outline-none"
      >
        <option value="pt-BR">Português (Brasil)</option>
        <option value="en-US">English (US)</option>
        <option value="es-ES">Español</option>
      </select>
      <p className="mt-2 text-xs text-discord-text-muted">
        Salvo, mas o app hoje só tem textos em português — tradução da interface é trabalho futuro.
      </p>
    </div>
  );
}

// ---------------- Avançado ----------------
function AvancadoTab({ userId }: { userId: string }) {
  const [devMode, setDevMode] = useState(false);

  useEffect(() => {
    setDevMode(localStorage.getItem("sekai_dev_mode") === "1");
  }, []);

  function toggle(checked: boolean) {
    setDevMode(checked);
    localStorage.setItem("sekai_dev_mode", checked ? "1" : "0");
  }

  return (
    <div>
      <h1 className="mb-6 text-xl font-bold text-discord-header-primary">Avançado</h1>

      <div className="mb-4 flex items-center justify-between rounded-lg bg-discord-bg-secondary p-4">
        <div>
          <p className="text-sm font-medium text-discord-header-primary">Modo desenvolvedor</p>
          <p className="text-xs text-discord-text-muted">Mostra o ID do seu usuário abaixo para copiar.</p>
        </div>
        <input type="checkbox" checked={devMode} onChange={(e) => toggle(e.target.checked)} className="h-5 w-5" />
      </div>

      {devMode && (
        <div className="flex items-center justify-between rounded-lg bg-discord-bg-secondary p-3">
          <span className="font-mono text-sm text-discord-text-normal">{userId}</span>
          <button onClick={() => navigator.clipboard.writeText(userId)} className="text-discord-text-muted hover:text-discord-text-normal">
            <Copy className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
