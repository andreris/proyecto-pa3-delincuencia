import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShieldCheck, Lock, X, AlertTriangle, Loader2 } from 'lucide-react';

export const ModeratorAuthModal: React.FC = () => {
  const {
    isModeratorModalOpen,
    closeModeratorModal,
    activateModeratorWithCode
  } = useAuth();

  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isModeratorModalOpen) {
      setCode('');
      setErrorMsg(null);
      setSubmitting(false);
    }
  }, [isModeratorModalOpen]);

  if (!isModeratorModalOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMsg(null);
    setSubmitting(true);

    const submitted = code;
    const result = await activateModeratorWithCode(submitted);

    setSubmitting(false);
    if (!result.success) {
      setErrorMsg(result.error || 'Código de moderador inválido');
      return;
    }

    setCode('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="moderator-auth-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="bg-[#0B1F3A] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 id="moderator-auth-title" className="font-extrabold text-sm sm:text-base">
                Activar modo Moderador
              </h3>
              <p className="text-[11px] text-blue-200">
                Verificación en servidor vía sesión segura
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeModeratorModal}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10"
            aria-label="Cerrar modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <p className="text-slate-600 leading-relaxed">
            Ingresa el <strong className="text-slate-900">código de acceso de moderador</strong> configurado en el servidor para habilitar el panel de validación y la sincronización de <strong>Fuentes sociales</strong>.
          </p>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center gap-2 font-semibold">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="moderator-access-code"
              className="block font-bold text-slate-800 mb-1.5"
            >
              Código de acceso de moderador
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="moderator-access-code"
                type="password"
                value={code}
                onChange={e => setCode(e.target.value)}
                autoComplete="off"
                autoFocus
                required
                placeholder="Ingresa MODERATOR_ACCESS_CODE"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              El código se valida únicamente contra el servidor y no se guarda en tu navegador.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={closeModeratorModal}
              className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !code.trim()}
              className="px-5 py-2 rounded-xl bg-[#0B1F3A] hover:bg-blue-900 disabled:opacity-50 text-white font-bold shadow-sm inline-flex items-center gap-1.5"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Validando...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Verificar acceso
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
