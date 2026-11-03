import React, { useState } from 'react';
import { useIncidents } from '../../context/IncidentContext';
import { TrustedContact } from '../../types';
import { EMERGENCY_SERVICES } from '../../data/demoData';
import {
  Users,
  UserPlus,
  Phone,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Shield,
  PhoneCall,
  HeartHandshake
} from 'lucide-react';

export const TrustedContactsView: React.FC = () => {
  const { trustedContacts, addTrustedContact, deleteTrustedContact, updateTrustedContact } = useIncidents();

  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('Familiar directo');
  const [errorMsg, setErrorMsg] = useState('');
  const [testSuccessNotice, setTestSuccessNotice] = useState<string | null>(null);

  const handleSaveContact = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!name.trim() || !phone.trim()) {
      setErrorMsg('Por favor completa el nombre y teléfono del contacto.');
      return;
    }

    if (editingId) {
      updateTrustedContact(editingId, {
        name: name.trim(),
        phone: phone.trim(),
        relationship
      });
      setEditingId(null);
    } else {
      const res = addTrustedContact({
        name: name.trim(),
        phone: phone.trim(),
        relationship
      });
      if (!res.success) {
        setErrorMsg(res.error || 'Error al agregar contacto.');
        return;
      }
    }

    setName('');
    setPhone('');
    setRelationship('Familiar directo');
    setIsAdding(false);
  };

  const handleStartEdit = (contact: TrustedContact) => {
    setEditingId(contact.id);
    setName(contact.name);
    setPhone(contact.phone);
    setRelationship(contact.relationship);
    setIsAdding(true);
  };

  const handleCancel = () => {
    setIsAdding(false);
    setEditingId(null);
    setName('');
    setPhone('');
    setErrorMsg('');
  };

  const handleTestSimulatedAlert = (contact: TrustedContact) => {
    setTestSuccessNotice(`Prueba de alerta enviada con éxito al contacto ${contact.name} (${contact.phone}).`);
    setTimeout(() => setTestSuccessNotice(null), 4000);
  };

  return (
    <div className="flex-1 bg-slate-50 p-4 sm:p-6 lg:p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header card */}
        <div className="bg-[#0B1F3A] text-white p-6 sm:p-8 rounded-3xl shadow-lg relative overflow-hidden">
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-300 bg-blue-900/60 px-3 py-1 rounded-full border border-blue-800">
                Red de Apoyo Cívico
              </span>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Contactos de Confianza y Auxilio SOS
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
                Configura hasta 3 personas de tu círculo íntimo (familiares, colegas de ruta o vecinos) que recibirán tu señal y geolocalización al presionar el Botón SOS.
              </p>
            </div>
            {trustedContacts.length < 3 && !isAdding && (
              <button
                onClick={() => setIsAdding(true)}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md active:scale-95 transition-all flex items-center gap-2 shrink-0"
              >
                <UserPlus className="w-4 h-4" />
                Agregar contacto
              </button>
            )}
          </div>
        </div>

        {/* Test notice feedback */}
        {testSuccessNotice && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-300 text-emerald-800 rounded-2xl text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{testSuccessNotice}</span>
          </div>
        )}

        {/* Add / Edit Form Card */}
        {isAdding && (
          <div className="bg-white p-6 rounded-2xl shadow-md border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-blue-600" />
                {editingId ? 'Editar contacto de confianza' : 'Registrar nuevo contacto de confianza'}
              </h3>
              <span className="text-xs text-slate-400">
                {trustedContacts.length} de 3 contactos registrados
              </span>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-xs border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveContact} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Roberto Morales"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono celular (Perú) *
                  </label>
                  <input
                    type="tel"
                    placeholder="Ej. +51 987 654 321"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    required
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Vínculo o relación
                  </label>
                  <select
                    value={relationship}
                    onChange={e => setRelationship(e.target.value)}
                    className="w-full text-xs px-3 py-2.5 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="Familiar directo">Familiar directo</option>
                    <option value="Cónyuge / Pareja">Cónyuge / Pareja</option>
                    <option value="Contacto de ruta laboral">Contacto de ruta laboral</option>
                    <option value="Vecino de confianza">Vecino de confianza</option>
                    <option value="Socio comercial">Socio comercial</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md transition-all"
                >
                  {editingId ? 'Guardar cambios' : 'Registrar contacto'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Contact Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {trustedContacts.map((contact, index) => (
            <div
              key={contact.id}
              className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                    Contacto #{index + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleStartEdit(contact)}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded"
                      title="Editar"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => deleteTrustedContact(contact.id)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="font-bold text-sm text-slate-900 leading-snug">{contact.name}</h3>
                <p className="text-xs text-slate-500">{contact.relationship}</p>
                <div className="pt-2 flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-800">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  <span>{contact.phone}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Verificado
                </span>
                <button
                  onClick={() => handleTestSimulatedAlert(contact)}
                  className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Probar alerta
                </button>
              </div>
            </div>
          ))}

          {/* Empty slot card */}
          {trustedContacts.length < 3 && !isAdding && (
            <button
              onClick={() => setIsAdding(true)}
              className="border-2 border-dashed border-slate-300 hover:border-blue-400 p-6 rounded-2xl flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-blue-600 bg-white/50 hover:bg-blue-50/20 transition-all min-h-[160px]"
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <UserPlus className="w-5 h-5" />
              </div>
              <span className="font-semibold text-xs">Registrar contacto #{trustedContacts.length + 1}</span>
            </button>
          )}
        </div>

        {/* Official Directory of Peruvian Emergency Numbers */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-blue-600" />
            <div>
              <h3 className="font-bold text-sm text-slate-900">Directorio Oficial de Emergencias en el Perú</h3>
              <p className="text-xs text-slate-500">
                Líneas gratuitas disponibles las 24 horas a nivel nacional
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {EMERGENCY_SERVICES.map(srv => (
              <div key={srv.phone} className="p-3.5 rounded-2xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-2">
                <div>
                  <span className="font-bold text-xs text-slate-900 block">{srv.name}</span>
                  <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">{srv.description}</span>
                </div>
                <a
                  href={`tel:${srv.phone.replace(/\s+/g, '')}`}
                  className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shrink-0 flex items-center gap-1 shadow-xs"
                >
                  <PhoneCall className="w-3 h-3" />
                  {srv.phone}
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
