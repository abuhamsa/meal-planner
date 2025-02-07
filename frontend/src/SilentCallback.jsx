import { useEffect } from "react";
import { useAuth } from "react-oidc-context";

const SilentCallback = () => {
  const auth = useAuth();

  useEffect(() => {
    auth.signinSilentCallback();
  }, [auth]);

  return <p>Refreshing session...</p>;
};

export default SilentCallback;
