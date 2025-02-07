import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { Navigate } from "react-router-dom";
import Spinner from "../components/Spinner";

const ProtectedRoute = ({ children }) => {
  const { isLoading, isAuthenticated, signinSilent } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Attempt silent login if session exists
      signinSilent().catch(() => {
        // Fallback to regular login if silent renew fails
        window.location = '/login';
      });
    }
  }, [isLoading, isAuthenticated, signinSilent]);

  if (isLoading) {
    return <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
    <Spinner className="w-16 h-16 text-white" />
  </div>;
  }

  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

export default ProtectedRoute;