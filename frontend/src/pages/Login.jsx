// src/pages/Login.jsx
import { useAuth } from 'react-oidc-context';
import { Navigate } from 'react-router-dom';
import Spinner from '../components/Spinner';

const Login = () => {
  const { isAuthenticated, isLoading, signinRedirect } = useAuth();

  if (isLoading) return <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
  <Spinner className="w-16 h-16 text-white" />
</div>;
  if (isAuthenticated) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-downy-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full">
        <h1 className="text-2xl font-bold text-downy-900 mb-6 text-center">
          Welcome to Mealplanner
        </h1>
        <button
          onClick={() => signinRedirect()} // ✅ Fixed function
          className="w-full bg-downy-500 hover:bg-downy-600 text-white font-medium py-2 px-4 rounded-md transition-colors"
        >
          Log in with Authtentik
        </button>
      </div>
    </div>
  );
};

export default Login;