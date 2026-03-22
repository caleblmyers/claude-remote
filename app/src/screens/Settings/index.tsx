import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";
import { useWebSocket } from "../../hooks/useWebSocket";
import { useAuth } from "../../hooks/useAuth";
import { TRUST_PRESETS } from "../../lib/types";
import type { RepoConfig, RepoTemplate, TrustLevel, TrustPresetKey } from "../../lib/types";

export default function SettingsScreen() {
  const navigate = useNavigate();
  const { status: wsStatus } = useWebSocket();
  const { logout } = useAuth();
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [globalTemplates, setGlobalTemplates] = useState<RepoTemplate[]>([]);
  const [defaults, setDefaults] = useState<{
    trustLevel: TrustLevel;
    notifications: { onComplete: boolean; onError: boolean; onPermission: boolean };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Add repo form
  const [showAddRepo, setShowAddRepo] = useState(false);
  const [newRepoName, setNewRepoName] = useState("");
  const [newRepoPath, setNewRepoPath] = useState("");

  // Add template form
  const [showAddTemplate, setShowAddTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplatePrompt, setNewTemplatePrompt] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const config = await api.config.get();
        setRepos((config.repos as RepoConfig[]) ?? []);
        setGlobalTemplates((config.globalTemplates as RepoTemplate[]) ?? []);
        setDefaults(config.defaults as any ?? null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async (updates: Record<string, unknown>) => {
    setSaving(true);
    setMessage(null);
    try {
      const result = await api.config.update(updates);
      setRepos((result.repos as RepoConfig[]) ?? []);
      setGlobalTemplates((result.globalTemplates as RepoTemplate[]) ?? []);
      setDefaults(result.defaults as any ?? null);
      setMessage("Saved");
      setTimeout(() => setMessage(null), 2000);
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const addRepo = () => {
    if (!newRepoName.trim() || !newRepoPath.trim()) return;
    const updated = [...repos, { name: newRepoName.trim(), path: newRepoPath.trim() }];
    save({ repos: updated });
    setNewRepoName("");
    setNewRepoPath("");
    setShowAddRepo(false);
  };

  const removeRepo = (name: string) => {
    save({ repos: repos.filter((r) => r.name !== name) });
  };

  const addTemplate = () => {
    if (!newTemplateName.trim()) return;
    const updated = [
      ...globalTemplates,
      { name: newTemplateName.trim(), prompt: newTemplatePrompt.trim() },
    ];
    save({ globalTemplates: updated });
    setNewTemplateName("");
    setNewTemplatePrompt("");
    setShowAddTemplate(false);
  };

  const removeTemplate = (name: string) => {
    save({ globalTemplates: globalTemplates.filter((t) => t.name !== name) });
  };

  const toggleNotification = (key: "onComplete" | "onError" | "onPermission") => {
    if (!defaults) return;
    const updated = {
      ...defaults,
      notifications: { ...defaults.notifications, [key]: !defaults.notifications[key] },
    };
    save({ defaults: updated });
  };

  const findPreset = (): TrustPresetKey | "custom" => {
    if (!defaults) return "read-only";
    for (const [key, preset] of Object.entries(TRUST_PRESETS)) {
      if (
        JSON.stringify([...preset.trustLevel.autoApprove].sort()) ===
        JSON.stringify([...defaults.trustLevel.autoApprove].sort())
      ) {
        return key as TrustPresetKey;
      }
    }
    return "custom";
  };

  const setTrustPreset = (key: TrustPresetKey) => {
    if (!defaults || key === "custom") return;
    const preset = TRUST_PRESETS[key].trustLevel;
    save({
      defaults: {
        ...defaults,
        trustLevel: {
          autoApprove: [...preset.autoApprove],
          alwaysAsk: [...preset.alwaysAsk],
          deny: [...preset.deny],
        },
      },
    });
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          aria-label="Back"
        >
          {"\u25C0"}
        </button>
        <h1 className="text-lg font-semibold flex-1">Settings</h1>
        {saving && <span className="text-xs text-gray-500">Saving...</span>}
        {message && (
          <span className={`text-xs ${message.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
            {message}
          </span>
        )}
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col gap-6 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col gap-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-gray-900 border border-gray-800" />
            ))}
          </div>
        ) : (
          <>
            {/* Repositories */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Repositories
              </h2>
              <div className="rounded-xl border border-gray-800 divide-y divide-gray-800">
                {repos.map((repo) => (
                  <div key={repo.name} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm text-gray-300">{repo.name}</div>
                      <div className="text-xs text-gray-600">{repo.path}</div>
                    </div>
                    <button
                      onClick={() => removeRepo(repo.name)}
                      className="text-xs text-red-400/60 hover:text-red-400 px-2 py-1 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {repos.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-600">No repos configured</div>
                )}
              </div>
              {showAddRepo ? (
                <div className="mt-2 flex flex-col gap-2">
                  <input
                    value={newRepoName}
                    onChange={(e) => setNewRepoName(e.target.value)}
                    placeholder="Name"
                    className="h-10 bg-gray-900 border border-gray-800 rounded-lg px-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    value={newRepoPath}
                    onChange={(e) => setNewRepoPath(e.target.value)}
                    placeholder="Path (e.g. /home/user/project)"
                    className="h-10 bg-gray-900 border border-gray-800 rounded-lg px-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button onClick={addRepo} className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white">
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddRepo(false)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddRepo(true)}
                  className="mt-2 text-sm text-indigo-400 hover:text-indigo-300"
                >
                  + Add Repo
                </button>
              )}
            </section>

            {/* Default Trust Level */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Default Trust Level
              </h2>
              <div className="flex flex-col gap-2">
                {(Object.entries(TRUST_PRESETS) as [Exclude<TrustPresetKey, "custom">, any][]).map(
                  ([key, preset]) => (
                    <label
                      key={key}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-2.5 cursor-pointer transition-colors ${
                        findPreset() === key
                          ? "border-indigo-500 bg-indigo-950/30"
                          : "border-gray-800 hover:bg-gray-800/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="defaultTrust"
                        checked={findPreset() === key}
                        onChange={() => setTrustPreset(key)}
                        className="accent-indigo-500"
                      />
                      <div>
                        <div className="text-sm font-medium">{preset.label}</div>
                        <div className="text-xs text-gray-500">{preset.description}</div>
                      </div>
                    </label>
                  )
                )}
              </div>
            </section>

            {/* Notifications */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Notifications
              </h2>
              <div className="rounded-xl border border-gray-800 divide-y divide-gray-800">
                {(
                  [
                    ["onComplete", "Completions"],
                    ["onError", "Errors"],
                    ["onPermission", "Permissions"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-300">{label}</span>
                    <button
                      onClick={() => toggleNotification(key)}
                      className={`w-11 h-6 rounded-full relative transition-colors ${
                        defaults?.notifications?.[key] ? "bg-indigo-600" : "bg-gray-700"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                          defaults?.notifications?.[key] ? "left-[22px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Templates */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Global Templates
              </h2>
              <div className="rounded-xl border border-gray-800 divide-y divide-gray-800">
                {globalTemplates.map((t) => (
                  <div key={t.name} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="text-sm text-gray-300">{t.name}</div>
                      {t.prompt && (
                        <div className="text-xs text-gray-600 truncate max-w-[200px]">
                          {t.prompt}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => removeTemplate(t.name)}
                      className="text-xs text-red-400/60 hover:text-red-400 px-2 py-1 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {globalTemplates.length === 0 && (
                  <div className="px-4 py-3 text-sm text-gray-600">No templates</div>
                )}
              </div>
              {showAddTemplate ? (
                <div className="mt-2 flex flex-col gap-2">
                  <input
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    placeholder="Template name"
                    className="h-10 bg-gray-900 border border-gray-800 rounded-lg px-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <input
                    value={newTemplatePrompt}
                    onChange={(e) => setNewTemplatePrompt(e.target.value)}
                    placeholder="Prompt (optional, user fills in)"
                    className="h-10 bg-gray-900 border border-gray-800 rounded-lg px-3 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2">
                    <button onClick={addTemplate} className="text-sm px-3 py-1.5 rounded-lg bg-indigo-600 text-white">
                      Add
                    </button>
                    <button
                      onClick={() => setShowAddTemplate(false)}
                      className="text-sm px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddTemplate(true)}
                  className="mt-2 text-sm text-indigo-400 hover:text-indigo-300"
                >
                  + Add Template
                </button>
              )}
            </section>

            {/* Server status */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Server
              </h2>
              <div className="rounded-xl border border-gray-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      wsStatus === "connected"
                        ? "bg-emerald-400"
                        : wsStatus === "connecting"
                        ? "bg-amber-400 animate-pulse"
                        : "bg-red-400"
                    }`}
                  />
                  <span className="text-sm text-gray-300">
                    {wsStatus === "connected"
                      ? `Connected (${window.location.hostname})`
                      : wsStatus === "connecting"
                      ? "Connecting..."
                      : "Disconnected"}
                  </span>
                </div>
              </div>
            </section>

            {/* Disconnect */}
            <section>
              <button
                onClick={handleLogout}
                className="w-full h-11 rounded-xl border border-red-800 text-red-400 hover:bg-red-950/40 font-medium transition-colors"
              >
                Disconnect
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
