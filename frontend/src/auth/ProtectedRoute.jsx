import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useNavigate } from "react-router-dom";
import Spinner from "../components/Spinner";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, signinRedirect } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Try to log in automatically if a valid session exists
      
        navigate("/login"); // Redirect to login if no session
      
    }
  }, [isAuthenticated, isLoading, signinRedirect, navigate]);

  if (isLoading) return <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
  <Spinner className="w-16 h-16 text-white" />
</div>;

  return isAuthenticated ? children : null;
};

export default ProtectedRoute;
