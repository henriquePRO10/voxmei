import { createContext } from 'react'

export interface AuthContextType {
  currentUser: import('firebase/auth').User | null
  loading: boolean
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)
