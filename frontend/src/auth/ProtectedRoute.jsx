import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useNavigate } from 'react-router-dom';

const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [user, isLoading, navigate]);

  if (isLoading) return <div>Loading...</div>;
  
  return user ? children : null;
};

export default ProtectedRoute;