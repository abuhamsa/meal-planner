import { useAuth } from "react-oidc-context";

const LogoutButton = () => {
  const auth = useAuth();

  const handleLogout = () => {
    auth.signoutRedirect();
  };

  return (
    <button
      onClick={handleLogout}
      className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
    >
      Logout
    </button>
  );
};

export default LogoutButton;