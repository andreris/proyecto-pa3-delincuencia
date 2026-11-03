import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserType } from '../../types';
import { PERU_DISTRICTS } from '../../data/demoData';
import {
  X,
  Shield,
  User,
  Mail,
  Lock,
  MapPin,
  Car,
  Store,
  Footprints,
  AlertCircle,
  CheckCircle2
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'register';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'login'
}) => {
  const { login, register, resetPassword, switchUserPersona } = useAuth();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [district, setDistrict] = useState('Lima (Cercado)');
  const [userType, setUserType] = useState<UserType>('peaton');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (mode === 'login') {
      const res = await login(email, password);
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.error || 'Credenciales inválidas.');
      }
    } else if (mode === 'register') {
      const res = await register(name, email, password, district, userType);
      if (res.success) {
        onClose();
      } else {
        setErrorMsg(res.error || 'Error al crear cuenta.');
      }
    } else if (mode === 'forgot') {
      const res = await resetPassword(email);
      if (res.success) {
        setSuccessMsg(res.message);
      } else {
        setErrorMsg(res.message);
      }
    }
  };

  const handleQuickDemo = (type: UserType | 'moderador') => {
    switchUserPersona(type);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-[#0B1F3A] text-white p-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-white">
                {mode === 'login'
                  ? 'Iniciar sesión en Vigila.pe'
                  : mode === 'register'
                  ? 'Crear cuenta ciudadana'
                  : 'Recuperar contraseña'}
              </h3>
              <p className="text-[11px] text-blue-200">Red colaborativa de geoseguridad en Perú</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1 rounded-lg hover:bg-white/10"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-slate-100 bg-slate-50 text-xs font-bold text-slate-600">
          <button
            onClick={() => {
              setMode('login');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-3 text-center transition-all ${
              mode === 'login'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'hover:text-slate-900'
            }`}
          >
            Ingresar
          </button>
          <button
            onClick={() => {
              setMode('register');
              setErrorMsg('');
              setSuccessMsg('');
            }}
            className={`flex-1 py-3 text-center transition-all ${
              mode === 'register'
                ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                : 'hover:text-slate-900'
            }`}
          >
            Registrarse
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 text-emerald-800 text-xs border border-emerald-200 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          {mode === 'register' && (
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nombre completo *</label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Ej. Rosa Quispe"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Correo electrónico *</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                placeholder="tu.correo@ejemplo.pe"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700">Contraseña *</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    className="text-[11px] font-semibold text-blue-600 hover:underline"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Distrito de residencia o comercio *
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={district}
                    onChange={e => setDistrict(e.target.value)}
                    className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    {PERU_DISTRICTS.filter(d => d !== 'Todos los distritos').map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tipo de usuario principal *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setUserType('peaton')}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      userType === 'peaton'
                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <Footprints className="w-4 h-4" />
                    <span className="text-[11px] font-bold">Peatón</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserType('conductor')}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      userType === 'conductor'
                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <Car className="w-4 h-4" />
                    <span className="text-[11px] font-bold">Conductor</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setUserType('comerciante')}
                    className={`p-2.5 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                      userType === 'comerciante'
                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <Store className="w-4 h-4" />
                    <span className="text-[11px] font-bold">Comerciante</span>
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md transition-all mt-2"
          >
            {mode === 'login'
              ? 'Ingresar a mi cuenta'
              : mode === 'register'
              ? 'Completar registro'
              : 'Enviar enlace de recuperación'}
          </button>

          {/* Instant Demo Switcher for fast evaluation */}
          <div className="pt-3 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-400 font-medium mb-2">
              O accede al instante con un perfil demo:
            </p>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => handleQuickDemo('conductor')}
                className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
              >
                🚗 Conductor (Callao)
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('comerciante')}
                className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
              >
                🏪 Comerciante (SJL)
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('peaton')}
                className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold"
              >
                🚶 Peatón (Surco)
              </button>
              <button
                type="button"
                onClick={() => handleQuickDemo('moderador')}
                className="py-1.5 px-2 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold"
              >
                🛡️ Moderador (Lima)
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
