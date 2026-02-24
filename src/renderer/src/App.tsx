import { ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Clientes } from './pages/Clientes';
import { Financeiro } from './pages/Financeiro';
import { ProLabore } from './pages/ProLabore';
import { Holerite } from './pages/Holerite';
import { Login } from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';

function PrivateRoute({ children }: { children: ReactNode }) {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" replace />;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
          <Route index element={<Clientes />} />
          <Route path="financeiro" element={<Financeiro />} />
          <Route path="pro-labore" element={<ProLabore />} />
          <Route path="holerite" element={<Holerite />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
