import { useAuth } from 'react-oidc-context';
import LogoutIcon from './LogoutIcon';

const LogoutButton = () => {
  const { signoutRedirect, removeUser } = useAuth();

  const handleLogout = () => {
    // Clear local session storage
    removeUser();
    // Initiate OIDC logout
    signoutRedirect();
  };

  return (
    <button
      onClick={handleLogout}
      className="p-3 bg-downy-100 hover:bg-downy-200 rounded-full shadow-lg"
          aria-label="Settings"
        >
      <LogoutIcon />
    </button>
  );
};

export default LogoutButton;