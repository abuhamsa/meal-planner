import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useNavigate } from "react-router-dom";
import Spinner from "../components/Spinner";

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, isLoading, signinRedirect, events } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Handle automatic session checks
    const handleUserSignedOut = () => {
      navigate("/login");
    };

    events.addUserSignedOut(handleUserSignedOut);

    return () => {
      events.removeUserSignedOut(handleUserSignedOut);
    };
  }, [events, navigate]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Add current location to redirect back after login
      signinRedirect({ state: { redirectTo: window.location.pathname } });
    }
  }, [isAuthenticated, isLoading, signinRedirect]);

  if (isLoading) return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <Spinner className="w-16 h-16 text-white" />
    </div>
  );

  return isAuthenticated ? children : null;
};

export default ProtectedRoute;