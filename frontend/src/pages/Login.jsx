import { useEffect } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { useNavigate } from 'react-router-dom';
import Spinner from '../components/Spinner';

const Login = () => {
  const { user, login, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  if (isLoading) return <Spinner />;

  return (
    <div className="min-h-screen bg-downy-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-downy-900 mb-6 text-center">
          Welcome to Mealplanner
        </h1>
        <button
          onClick={login}
          className="w-full bg-downy-500 hover:bg-downy-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          Log in with Authtentik
        </button>
      </div>
    </div>
  );
};

export default Login;