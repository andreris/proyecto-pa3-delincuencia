import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useIncidents } from '../../context/IncidentContext';
import { UserType } from '../../types';
import { PERU_DISTRICTS } from '../../data/demoData';
import {
  User,
  Mail,
  MapPin,
  Car,
  Store,
  Footprints,
  Shield,
  Save,
  CheckCircle2,
  Calendar,
  Award
} from 'lucide-react';

export const ProfileView: React.FC = () => {
  const { currentUser, updateProfile } = useAuth();
  const { incidents, trustedContacts } = useIncidents();

  const [name, setName] = useState(currentUser?.name || '');
  const [district, setDistrict] = useState(currentUser?.district || 'Lima (Cercado)');
  const [userType, setUserType] = useState<UserType>(currentUser?.userType || 'peaton');
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile({
      name,
      district,
      userType
    });
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="flex-1 bg-slate-50 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Profile Header */}
        <div className="bg-[#0B1F3A] text-white p-6 sm:p-8 rounded-3xl shadow-lg flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-extrabold text-2xl shadow-md">
              {currentUser?.avatarInitials || 'VP'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-extrabold">{currentUser?.name}</h1>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-800 text-blue-200 border border-blue-700">
                  {currentUser?.role === 'moderator' ? '🛡️ Moderador' : currentUser?.userType}
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">{currentUser?.email}</p>
              <p className="text-[11px] text-slate-300 mt-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-blue-400" />
                Miembro vigilante desde {currentUser?.joinedDate}
              </p>
            </div>
          </div>
        </div>

        {savedNotice && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Perfil actualizado correctamente en la plataforma.</span>
          </div>
        )}

        {/* Community Activity Summary */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
            <span className="text-xs text-slate-400 font-medium">Incidentes en tu zona</span>
            <p className="text-xl font-extrabold text-slate-900 mt-1">
              {incidents.filter(i => i.district === currentUser?.district).length}
            </p>
            <span className="text-[10px] text-blue-600 font-semibold">{currentUser?.district}</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
            <span className="text-xs text-slate-400 font-medium">Contactos SOS</span>
            <p className="text-xl font-extrabold text-slate-900 mt-1">{trustedContacts.length} de 3</p>
            <span className="text-[10px] text-emerald-600 font-semibold">Listos para auxilio</span>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs text-center">
            <span className="text-xs text-slate-400 font-medium">Insignia cívica</span>
            <p className="text-xl font-extrabold text-amber-600 mt-1">Nivel 2</p>
            <span className="text-[10px] text-slate-500 font-semibold">Vigilante activo</span>
          </div>
        </div>

        {/* Edit Form */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <h2 className="font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            Editar información personal
          </h2>

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nombre completo</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Correo electrónico</label>
              <input
                type="email"
                value={currentUser?.email}
                disabled
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                El correo está vinculado a tu cuenta ciudadana de seguridad.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Distrito preferencial</label>
              <select
                value={district}
                onChange={e => setDistrict(e.target.value)}
                className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
              >
                {PERU_DISTRICTS.filter(d => d !== 'Todos los distritos').map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Tipo de usuario principal
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setUserType('peaton')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                    userType === 'peaton'
                      ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <Footprints className="w-4 h-4" />
                  <span className="text-xs font-bold">Peatón</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUserType('conductor')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                    userType === 'conductor'
                      ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <Car className="w-4 h-4" />
                  <span className="text-xs font-bold">Conductor</span>
                </button>

                <button
                  type="button"
                  onClick={() => setUserType('comerciante')}
                  className={`p-3 rounded-xl border text-center transition-all flex flex-col items-center gap-1 ${
                    userType === 'comerciante'
                      ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                      : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <Store className="w-4 h-4" />
                  <span className="text-xs font-bold">Comerciante</span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Guardar modificaciones
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
