import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserType } from '../types';
import {
  authenticateGoogle,
  ApiClientError,
  authenticateModeratorSession,
  clearBackendSession
} from '../services/apiClient';

interface AuthContextType {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  isModerator: boolean;
  isModeratorAuthenticated: boolean;
  isModeratorModalOpen: boolean;
  openModeratorModal: () => void;
  closeModeratorModal: () => void;
  activateModeratorWithCode: (
    code: string
  ) => Promise<{ success: boolean; error?: string }>;
  loginGoogle: (credential: string) => Promise<void>;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (
    name: string,
    email: string,
    pass: string,
    district: string,
    userType: UserType
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  enterGuest: () => void;
  updateProfile: (updates: Partial<UserProfile>) => void;
  resetPassword: (email: string) => Promise<{ success: boolean; message: string }>;
  toggleModeratorRole: () => void;
  switchUserPersona: (type: UserType | 'moderador') => void;
}

const DEFAULT_USER: UserProfile = {
  uid: 'usr-demo-001',
  name: 'Alejandro Morales Rivera',
  email: 'alejandro.morales@vigila.pe',
  district: 'Comas',
  userType: 'conductor',
  role: 'user',
  avatarInitials: 'AM',
  joinedDate: '2025-01-15'
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [isModeratorAuthenticated, setIsModeratorAuthenticated] = useState<boolean>(false);
  const [isModeratorModalOpen, setIsModeratorModalOpen] = useState<boolean>(false);

  useEffect(() => {
    if (currentUser) {
      // Never persist moderator privilege or access codes in localStorage
      const safeToPersist: UserProfile = {
        ...currentUser,
        role: 'user'
      };
      localStorage.setItem('vigila_pe_user', JSON.stringify(safeToPersist));
    } else {
      localStorage.removeItem('vigila_pe_user');
    }
  }, [currentUser]);

  const openModeratorModal = () => {
    setIsModeratorModalOpen(true);
  };

  const closeModeratorModal = () => {
    setIsModeratorModalOpen(false);
  };

  const activateModeratorWithCode = async (
    moderatorCode: string
  ): Promise<{ success: boolean; error?: string }> => {
    const trimmedCode = moderatorCode.trim();
    if (!trimmedCode) {
      return { success: false, error: 'Ingresa el código de acceso de moderador.' };
    }

    try {
      const session = await authenticateModeratorSession(currentUser, trimmedCode);
      setIsModeratorAuthenticated(true);
      setCurrentUser(prev => ({
        uid: session.user.uid || prev?.uid || 'mod-session-01',
        name: prev?.name || session.user.name || 'Moderador Vigila.pe',
        email: prev?.email || session.user.email || 'moderacion@vigila.pe',
        district: prev?.district || 'Lima (Cercado)',
        userType: prev?.userType || 'peaton',
        role: 'moderator',
        avatarInitials: prev?.avatarInitials || 'MV',
        joinedDate: prev?.joinedDate || new Date().toISOString().split('T')[0]
      }));
      setIsModeratorModalOpen(false);
      return { success: true };
    } catch (err) {
      setIsModeratorAuthenticated(false);
      if (err instanceof ApiClientError && err.status === 403) {
        return { success: false, error: 'Código de moderador inválido' };
      }
      const message =
        err instanceof Error
          ? err.message
          : 'No se pudo verificar el código de moderador con el servidor.';
      return { success: false, error: message };
    }
  };

  const login = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!email || !pass) {
      return { success: false, error: 'Por favor ingresa correo y contraseña.' };
    }
    clearBackendSession();
    setIsModeratorAuthenticated(false);
    const initials = email.split('@')[0].slice(0, 2).toUpperCase();
    const newUser: UserProfile = {
      uid: 'usr-' + Date.now().toString(36),
      name: email.split('@')[0].replace('.', ' '),
      email,
      district: 'Miraflores',
      userType: 'peaton',
      role: 'user',
      avatarInitials: initials || 'VG',
      joinedDate: new Date().toISOString().split('T')[0]
    };
    setCurrentUser(newUser);
    return { success: true };
  };

  const register = async (
    name: string,
    email: string,
    pass: string,
    district: string,
    userType: UserType
  ): Promise<{ success: boolean; error?: string }> => {
    if (!name.trim() || !email.trim() || !pass) {
      return { success: false, error: 'Todos los campos obligatorios deben ser completados.' };
    }
    if (pass.length < 6) {
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }

    clearBackendSession();
    setIsModeratorAuthenticated(false);
    const initials = name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(p => p[0].toUpperCase())
      .join('');

    const newUser: UserProfile = {
      uid: 'usr-' + Date.now().toString(36),
      name,
      email,
      district,
      userType,
      role: 'user',
      avatarInitials: initials || 'VP',
      joinedDate: new Date().toISOString().split('T')[0]
    };
    setCurrentUser(newUser);
    return { success: true };
  };

  const logout = () => {
    clearBackendSession();
    setIsModeratorAuthenticated(false);
    setCurrentUser(null);
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    setCurrentUser(prev => (prev ? { ...prev, ...updates } : null));
  };

  const resetPassword = async (
    email: string
  ): Promise<{ success: boolean; message: string }> => {
    if (!email || !email.includes('@')) {
      return { success: false, message: 'Ingresa un correo electrónico válido.' };
    }
    return {
      success: true,
      message: `Hemos enviado un enlace seguro de recuperación a ${email}. Revisa tu bandeja.`
    };
  };

  const toggleModeratorRole = () => {
    if (isModeratorAuthenticated) {
      clearBackendSession();
      setIsModeratorAuthenticated(false);
      setCurrentUser(prev => (prev ? { ...prev, role: 'user' } : DEFAULT_USER));
      return;
    }
    openModeratorModal();
  };

  const switchUserPersona = (type: UserType | 'moderador') => {
    if (type === 'moderador') {
      // Always prompt for MODERATOR_ACCESS_CODE modal instead of direct elevation
      openModeratorModal();
      return;
    }

    clearBackendSession();
    setIsModeratorAuthenticated(false);

    if (type === 'conductor') {
      setCurrentUser({
        uid: 'usr-cond-02',
        name: 'Jorge Quispe Cárdenas',
        email: 'jorge.quispe@taxi.pe',
        district: 'Callao',
        userType: 'conductor',
        role: 'user',
        avatarInitials: 'JQ',
        joinedDate: '2025-02-10'
      });
    } else if (type === 'comerciante') {
      setCurrentUser({
        uid: 'usr-com-03',
        name: 'Rosa Palomino Gómez',
        email: 'bodega.rosita@comercio.pe',
        district: 'San Juan de Lurigancho',
        userType: 'comerciante',
        role: 'user',
        avatarInitials: 'RP',
        joinedDate: '2024-11-20'
      });
    } else {
      setCurrentUser({
        uid: 'usr-peat-04',
        name: 'Carlos Mendoza',
        email: 'carlos.mendoza@estudiante.pe',
        district: 'Santiago de Surco',
        userType: 'peaton',
        role: 'user',
        avatarInitials: 'CM',
        joinedDate: '2025-03-01'
      });
    }
  };

  const isModerator = Boolean(
    isModeratorAuthenticated && currentUser?.role === 'moderator'
  );

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isModerator,
        isModeratorAuthenticated,
        isModeratorModalOpen,
        openModeratorModal,
        closeModeratorModal,
        activateModeratorWithCode,
        loginGoogle: async credential => {
          const user = await authenticateGoogle(credential);
          setIsModeratorAuthenticated(false);
          setCurrentUser({ ...user, role: 'user', district: '', userType: 'peaton', avatarInitials: user.name.slice(0,2).toUpperCase(), joinedDate: new Date().toISOString().slice(0,10) });
        },
        login,
        register,
        logout,
        enterGuest: () => {
          clearBackendSession();
          setIsModeratorAuthenticated(false);
          setCurrentUser({ uid: 'guest-' + crypto.randomUUID(), name: 'Usuario invitado', email: '', district: '', userType: 'peaton', role: 'user', avatarInitials: 'UI', joinedDate: new Date().toISOString().slice(0, 10) });
        },
        updateProfile,
        resetPassword,
        toggleModeratorRole,
        switchUserPersona
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
