import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../lib/api";
import type {
  RepoConfig,
  RepoTemplate,
  TrustLevel,
  TrustPresetKey,
} from "../../lib/types";
import { TRUST_PRESETS, ALL_TOOLS } from "../../lib/types";

type Step = "repo" | "input";

export default function NewTaskScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillRepo = searchParams.get("repo");
  const prefillPrompt = searchParams.get("prompt");
  const [step, setStep] = useState<Step>(prefillRepo ? "input" : "repo");
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [reposLoading, setReposLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<RepoConfig | null>(null);
  const [templates, setTemplates] = useState<{
    global: RepoTemplate[];
    repo: RepoTemplate[];
  }>({ global: [], repo: [] });
  const [prompt, setPrompt] = useState("");
  const [trustPreset, setTrustPreset] = useState<TrustPresetKey>("edit-freely");
  const [customTools, setCustomTools] = useState<Set<string>>(
    new Set(["Read", "Grep", "Glob"])
  );
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load repos on mount
  useEffect(() => {
    api.repos
      .list()
      .then((r) => {
        setRepos(r);
        // Handle prefill from retry-with-changes
        if (prefillRepo) {
          const match = r.find((repo) => repo.name === prefillRepo);
          if (match) {
            setSelectedRepo(match);
            setStep("input");
          }
        }
        if (prefillPrompt) setPrompt(prefillPrompt);
      })
      .catch(console.error)
      .finally(() => setReposLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load templates when repo is selected
  useEffect(() => {
    if (!selectedRepo) return;
    api.repos
      .templates(selectedRepo.name)
      .then(setTemplates)
      .catch(console.error);
  }, [selectedRepo]);

  const handleRepoSelect = (repo: RepoConfig) => {
    setSelectedRepo(repo);
    setStep("input");
  };

  const handleTemplateSelect = (template: RepoTemplate) => {
    setPrompt(template.prompt || "");
    if (template.trustLevel) {
      // Find matching preset or keep current
      for (const [key, preset] of Object.entries(TRUST_PRESETS)) {
        const tl = template.trustLevel;
        if (
          JSON.stringify([...preset.trustLevel.autoApprove].sort()) ===
          JSON.stringify([...(tl.autoApprove ?? [])].sort())
        ) {
          setTrustPreset(key as TrustPresetKey);
          break;
        }
      }
    }
  };

  const toggleCustomTool = (tool: string) => {
    setCustomTools((prev) => {
      const next = new Set(prev);
      if (next.has(tool)) next.delete(tool);
      else next.add(tool);
      return next;
    });
  };

  const handleSend = async () => {
    if (!selectedRepo || !prompt.trim() || sending) return;
    setSending(true);
    setError(null);

    let trustLevel: TrustLevel;
    if (trustPreset === "custom") {
      const autoApprove = ALL_TOOLS.filter((t) => customTools.has(t));
      const alwaysAsk = ALL_TOOLS.filter((t) => !customTools.has(t));
      trustLevel = { autoApprove: [...autoApprove], alwaysAsk: [...alwaysAsk], deny: [] };
    } else {
      const preset = TRUST_PRESETS[trustPreset].trustLevel;
      trustLevel = {
        autoApprove: [...preset.autoApprove],
        alwaysAsk: [...preset.alwaysAsk],
        deny: [...preset.deny],
      };
    }

    try {
      const task = await api.tasks.create({
        repo: selectedRepo.name,
        prompt: prompt.trim(),
        trustLevel,
      });
      navigate(`/tasks/${task.id}`);
    } catch (err: any) {
      setError(err.message);
      setSending(false);
    }
  };

  if (step === "repo") {
    return (
      <div className="flex flex-col min-h-dvh bg-gray-950 text-gray-100">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
            aria-label="Back"
          >
            \u25C0
          </button>
          <h1 className="text-lg font-semibold">New Task</h1>
        </header>

        <main className="flex-1 px-4 py-6">
          <h2 className="text-sm font-medium text-gray-400 mb-4">
            Pick a repository:
          </h2>
          <div className="flex flex-col gap-3">
            {reposLoading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-gray-800 px-4 py-3 animate-pulse">
                  <div className="h-3 w-28 bg-gray-800 rounded mb-2" />
                  <div className="h-2.5 w-40 bg-gray-800 rounded" />
                </div>
              ))
            ) : repos.length === 0 ? (
              <p className="text-sm text-gray-600 text-center py-8">
                No repos configured. Edit claude-remote.config.yaml
              </p>
            ) : (
              repos.map((repo) => (
                <button
                  key={repo.name}
                  onClick={() => handleRepoSelect(repo)}
                  className="w-full text-left rounded-xl border border-gray-800 px-4 py-3 hover:bg-gray-800/50 transition-colors"
                >
                  <div className="text-sm font-medium">{repo.name}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {repo.path}
                  </div>
                </button>
              ))
            )}
          </div>
        </main>
      </div>
    );
  }

  // Step 2: Task input
  const allTemplates = [...templates.repo, ...templates.global];

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 text-gray-100">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
        <button
          onClick={() => setStep("repo")}
          className="flex items-center justify-center w-11 h-11 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
          aria-label="Back"
        >
          \u25C0
        </button>
        <h1 className="text-lg font-semibold">{selectedRepo?.name}</h1>
      </header>

      <main className="flex-1 px-4 py-6 flex flex-col gap-5">
        {/* Quick action templates */}
        {allTemplates.length > 0 && (
          <section>
            <h2 className="text-sm font-medium text-gray-400 mb-2">
              Quick actions:
            </h2>
            <div className="flex flex-wrap gap-2">
              {allTemplates.map((t) => (
                <button
                  key={t.name}
                  onClick={() => handleTemplateSelect(t)}
                  className="px-3 py-1.5 rounded-lg border border-gray-700 text-sm text-gray-300 hover:bg-gray-800 hover:border-gray-600 transition-colors"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Trust level selector */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-2">
            Trust level:
          </h2>
          <div className="flex flex-col gap-2">
            {(
              Object.entries(TRUST_PRESETS) as [
                Exclude<TrustPresetKey, "custom">,
                (typeof TRUST_PRESETS)[Exclude<TrustPresetKey, "custom">],
              ][]
            ).map(([key, preset]) => (
              <label
                key={key}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                  trustPreset === key
                    ? "border-indigo-500 bg-indigo-950/30"
                    : "border-gray-800 hover:bg-gray-800/50"
                }`}
              >
                <input
                  type="radio"
                  name="trust"
                  value={key}
                  checked={trustPreset === key}
                  onChange={() => setTrustPreset(key)}
                  className="accent-indigo-500"
                />
                <div>
                  <div className="text-sm font-medium">{preset.label}</div>
                  <div className="text-xs text-gray-500">
                    {preset.description}
                  </div>
                </div>
              </label>
            ))}
            {/* Custom option */}
            <label
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                trustPreset === "custom"
                  ? "border-indigo-500 bg-indigo-950/30"
                  : "border-gray-800 hover:bg-gray-800/50"
              }`}
            >
              <input
                type="radio"
                name="trust"
                value="custom"
                checked={trustPreset === "custom"}
                onChange={() => setTrustPreset("custom")}
                className="accent-indigo-500"
              />
              <div>
                <div className="text-sm font-medium">Custom</div>
                <div className="text-xs text-gray-500">
                  Pick which tools to auto-approve
                </div>
              </div>
            </label>
            {trustPreset === "custom" && (
              <div className="ml-8 flex flex-col gap-1.5">
                {ALL_TOOLS.map((tool) => (
                  <label
                    key={tool}
                    className="flex items-center gap-2 cursor-pointer py-1"
                  >
                    <input
                      type="checkbox"
                      checked={customTools.has(tool)}
                      onChange={() => toggleCustomTool(tool)}
                      className="accent-indigo-500 w-4 h-4"
                    />
                    <span className="text-sm text-gray-300">{tool}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Task input */}
        <section className="flex-1 flex flex-col">
          <h2 className="text-sm font-medium text-gray-400 mb-2">Task</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="flex-1 min-h-32 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 text-gray-100 placeholder-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500"
            placeholder="Describe the task..."
            autoFocus={allTemplates.length === 0}
          />
        </section>

        {error && (
          <p className="text-sm text-red-400 text-center">{error}</p>
        )}
      </main>

      <footer className="px-4 py-4 border-t border-gray-800">
        <button
          onClick={handleSend}
          disabled={!prompt.trim() || sending}
          className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? "Starting..." : "Send"}
        </button>
      </footer>
    </div>
  );
}
