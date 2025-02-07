import { createContext, useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Create the Auth Context
const AuthContext = createContext(null);

// Define the Auth Provider
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // Configuration for Authentik
  const authConfig = {
    domain: import.meta.env.VITE_AUTHTENTIK_DOMAIN,
    clientId: import.meta.env.VITE_AUTHTENTIK_CLIENT_ID,
    redirectUri: import.meta.env.VITE_AUTHTENTIK_REDIRECT_URI,
    scope: 'openid profile email',
  };

  // Function to handle login via OAuth2 redirect
  const login = () => {
    const authUrl = `${authConfig.domain}/application/o/authorize/?response_type=code&client_id=${authConfig.clientId}&redirect_uri=${encodeURIComponent(
      authConfig.redirectUri
    )}&scope=${authConfig.scope}`;
    window.location.href = authUrl;
  };

  // Function to handle logout
  const logout = () => {
    setUser(null);
    localStorage.removeItem('access_token');
    navigate('/login');
  };

  // Function to exchange the authorization code for an access token
  const handleCallback = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');

    if (code) {
      try {
        const tokenResponse = await fetch(`${authConfig.domain}/application/o/token/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: authConfig.redirectUri,
            client_id: authConfig.clientId,
            client_secret: import.meta.env.VITE_AUTHTENTIK_CLIENT_SECRET,
          }),
        });

        if (!tokenResponse.ok) {
          throw new Error('Failed to retrieve access token');
        }

        const tokenData = await tokenResponse.json();
        localStorage.setItem('access_token', tokenData.access_token);

        // Fetch user profile
        const userProfile = await fetchUserDetails(tokenData.access_token);
        setUser(userProfile);
      } catch (error) {
        console.error('Error during callback:', error);
      } finally {
        setIsLoading(false);
      }
    } else {
      setIsLoading(false);
    }
  };

  // Function to fetch user details using the access token
  const fetchUserDetails = async (accessToken) => {
    try {
      const response = await fetch(`${authConfig.domain}/api/v1/user/`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user details');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching user details:', error);
      return null;
    }
  };

  // Function to get the access token silently
  const getAccessToken = () => {
    return localStorage.getItem('access_token');
  };

  // Effect to check if the user is authenticated on component mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const accessToken = getAccessToken();
        if (accessToken) {
          const userProfile = await fetchUserDetails(accessToken);
          if (userProfile) {
            setUser(userProfile);
          }
        } else {
          handleCallback(); // Handle the OAuth2 callback if present
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  // Provide the context value
  const authValue = {
    user,
    isLoading,
    login,
    logout,
    getAccessToken,
  };

  return <AuthContext.Provider value={authValue}>{children}</AuthContext.Provider>;
};

// Custom hook to use the Auth Context
export const useAuth = () => useContext(AuthContext);