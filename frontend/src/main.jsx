import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider  } from "react-oidc-context"; // Import AuthProvider
import { WebStorageStateStore } from "oidc-client-ts"; // Required import
import App from "./App.jsx";
import "./index.css";

// OIDC Configuration for Authentik
const oidcConfig = {
  authority: import.meta.env.VITE_OIDC_AUTHORITY,
  client_id: import.meta.env.VITE_OIDC_CLIENT_ID,
  redirect_uri: import.meta.env.VITE_OIDC_REDIRECT_URI,
  post_logout_redirect_uri: import.meta.env.VITE_OIDC_POST_LOGOUT_URI,
  silent_redirect_uri: import.meta.env.VITE_OIDC_SILENT_REDIRECT_URI,
  scope: "openid profile email offline_access",
  response_type: "code",
  automaticSilentRenew: true,
  monitorSession: true,
  revokeTokensOnSignout: false,
  userStore: new WebStorageStateStore({ store: window.localStorage }),
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider {...oidcConfig}>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
