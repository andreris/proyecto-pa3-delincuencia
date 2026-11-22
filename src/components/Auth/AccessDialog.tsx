import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface GoogleIdentity {
  initialize(options: {client_id: string; callback: (response: {credential: string}) => void}): void;
  renderButton(element: HTMLElement, options: {theme: string; text: string}): void;
}

export function AccessDialog({close}: {close: () => void}) {
  const {loginGoogle, openModeratorModal} = useAuth();
  const target = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  const clientId = (import.meta as ImportMeta & {env: Record<string,string>}).env.VITE_GOOGLE_CLIENT_ID;
  useEffect(() => {
    if (!clientId) return;
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const id = (window as Window & {google?: {accounts: {id: GoogleIdentity}}}).google?.accounts.id;
      if (!id || !target.current) return;
      id.initialize({client_id: clientId, callback: async ({credential}) => {
        try { await loginGoogle(credential); close(); }
        catch { setError('No se pudo iniciar sesión con Google. Inténtalo de nuevo.'); }
      }});
      id.renderButton(target.current, {theme: 'outline', text: 'continue_with'});
    };
    script.onerror = () => setError('Google no está disponible en este momento.');
    document.head.appendChild(script);
    return () => { script.onload = null; script.onerror = null; script.remove(); };
  }, [clientId, loginGoogle, close]);

  return <div className="fixed inset-0 z-[2000] grid place-items-center bg-slate-950/60 p-4">
    <section role="dialog" aria-modal="true" aria-labelledby="access-title" className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between"><h2 id="access-title" className="text-xl font-bold">Iniciar sesión</h2><button onClick={close} aria-label="Cerrar" className="p-2">✕</button></div>
      <div ref={target} />
      {!clientId && <p className="text-sm text-slate-600">El acceso ciudadano con Google estará disponible próximamente.</p>}
      {error && <p role="alert">{error}</p>}
      <button onClick={() => {close(); openModeratorModal();}} className="w-full rounded-xl bg-blue-700 px-4 py-3 font-semibold text-white">Ingresar como moderador</button>
    </section>
  </div>;
}
