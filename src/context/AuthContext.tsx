import React, { createContext, useContext, useState, useEffect } from 'react';
import { UserProfile, UserType } from '../types';

interface AuthContextType {
  currentUser: UserProfile | null;
  isAuthenticated: boolean;
  isModerator: boolean;
  login: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  register: (name: string, email: string, pass: string, district: string, userType: UserType) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
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
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('vigila_pe_user');
      return saved ? JSON.parse(saved) : DEFAULT_USER;
    } catch {
      return DEFAULT_USER;
    }
  });

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('vigila_pe_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('vigila_pe_user');
    }
  }, [currentUser]);

  const login = async (email: string, pass: string): Promise<{ success: boolean; error?: string }> => {
    if (!email || !pass) {
      return { success: false, error: 'Por favor ingresa correo y contraseña.' };
    }
    // Simulate auth validation
    const initials = email.split('@')[0].slice(0, 2).toUpperCase();
    const isMod = email.includes('admin') || email.includes('mod');
    const newUser: UserProfile = {
      uid: 'usr-' + Date.now().toString(36),
      name: email.split('@')[0].replace('.', ' '),
      email,
      district: 'Miraflores',
      userType: 'peaton',
      role: isMod ? 'moderator' : 'user',
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
    setCurrentUser(null);
  };

  const updateProfile = (updates: Partial<UserProfile>) => {
    setCurrentUser(prev => (prev ? { ...prev, ...updates } : null));
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; message: string }> => {
    if (!email || !email.includes('@')) {
      return { success: false, message: 'Ingresa un correo electrónico válido.' };
    }
    return {
      success: true,
      message: `Hemos enviado un enlace seguro de recuperación a ${email}. Revisa tu bandeja.`
    };
  };

  const toggleModeratorRole = () => {
    setCurrentUser(prev => {
      if (!prev) return DEFAULT_USER;
      const nextRole = prev.role === 'moderator' ? 'user' : 'moderator';
      return { ...prev, role: nextRole };
    });
  };

  const switchUserPersona = (type: UserType | 'moderador') => {
    if (type === 'moderador') {
      setCurrentUser({
        uid: 'mod-demo-01',
        name: 'Oficial María Huamán',
        email: 'moderacion@vigila.pe',
        district: 'Lima (Cercado)',
        userType: 'peaton',
        role: 'moderator',
        avatarInitials: 'MH',
        joinedDate: '2024-09-01'
      });
    } else if (type === 'conductor') {
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

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: !!currentUser,
        isModerator: currentUser?.role === 'moderator',
        login,
        register,
        logout,
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
