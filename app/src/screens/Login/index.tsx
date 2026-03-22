import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, setToken } from "../../lib/api";

export default function LoginScreen() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { token } = await api.auth.login(code.trim());
      setToken(token);
      navigate("/", { replace: true });
    } catch (err: any) {
      setError(
        err.message?.includes("401") ? "Invalid setup code" : "Connection failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-dvh bg-gray-950 text-gray-100 items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center mb-2">Claude Remote</h1>
        <p className="text-sm text-gray-500 text-center mb-8">
          Enter the setup code from your server
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Setup code"
            autoFocus
            className="h-12 bg-gray-900 border border-gray-800 rounded-xl px-4 text-gray-100 placeholder-gray-600 text-center text-lg tracking-widest focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {error && (
            <p className="text-sm text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={!code.trim() || loading}
            className="h-12 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        </form>
      </div>
    </div>
  );
}
