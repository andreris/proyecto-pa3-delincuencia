import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export function AccessDialog({close, register}: {close: () => void; register: () => void}) {
  const { enterGuest, openModeratorModal } = useAuth();
  const [visible, setVisible] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);

  return <dialog ref={dialog} onCancel={close} aria-labelledby="access-title"
    className="fixed inset-0 m-auto w-[min(92vw,30rem)] rounded-xl border-0 bg-white px-6 py-8 text-slate-900 shadow-xl backdrop:bg-slate-950/60">
    <button type="button" aria-label="Cerrar" onClick={close} className="absolute right-4 top-4 rounded-full p-1 text-slate-500 hover:bg-slate-100"><X size={18}/></button>
    <div className="mx-auto max-w-xs">
      <div className="mb-6 flex items-baseline justify-center gap-6 text-sm">
        <button onClick={register} className="text-slate-600 hover:text-blue-700">Regístrate</button>
        <h2 id="access-title" className="border-b-2 border-blue-600 pb-2 font-bold">Inicia sesión</h2>
      </div>
      <form noValidate onSubmit={event => { event.preventDefault(); enterGuest(); close(); }} className="space-y-3">
        <input aria-label="Correo electrónico opcional" placeholder="Correo electrónico" type="email" autoComplete="off" className="w-full rounded-lg border border-slate-300 px-3 py-3 text-sm"/>
        <div className="relative">
          <input aria-label="Contraseña opcional" placeholder="Contraseña" type={visible ? 'text' : 'password'} autoComplete="off" className="w-full rounded-lg border border-slate-300 py-3 pl-3 pr-11 text-sm"/>
          <button type="button" aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setVisible(!visible)} className="absolute inset-y-0 right-0 px-3 text-slate-500">{visible ? <EyeOff size={16}/> : <Eye size={16}/>}</button>
        </div>
        <p className="text-xs text-slate-600">Para la demostración, deja los campos vacíos y entra como usuario invitado.</p>
        <button className="w-full rounded-full bg-blue-600 py-3 text-sm font-bold text-white hover:bg-blue-700">Iniciar sesión</button>
      </form>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-500"><span className="h-px flex-1 bg-slate-200"/>Acceso para editores<span className="h-px flex-1 bg-slate-200"/></div>
      <button onClick={() => { close(); openModeratorModal(); }} className="w-full rounded-full bg-blue-800 py-3 text-sm font-bold text-white hover:bg-blue-900">Iniciar como moderador</button>
    </div>
  </dialog>;
}
