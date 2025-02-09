import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider  } from "react-oidc-context"; // Import AuthProvider
import { WebStorageStateStore } from "oidc-client-ts"; // Required import
import App from "./App.jsx";
import "./index.css";

import { ConfigProvider } from "./contexts/ConfigContext";
import { configureApi } from './api/axios';

(async function initializeApp() {
  try {
    const response = await fetch("/runtime-config/config.json");
    if (!response.ok) throw new Error("Failed to load config");
    const config = await response.json();

    configureApi(config);

    const oidcConfig = {
      authority: config.OIDC_AUTHORITY,
      client_id: config.OIDC_CLIENT_ID,
      redirect_uri: config.OIDC_REDIRECT_URI,
      post_logout_redirect_uri: config.OIDC_POST_LOGOUT_URI,
      silent_redirect_uri: config.OIDC_SILENT_REDIRECT_URI,
      scope: "openid profile email offline_access",
      response_type: "code",
      automaticSilentRenew: true,
      monitorSession: true,
      revokeTokensOnSignout: false,
      userStore: new WebStorageStateStore({ store: window.localStorage }),
    };

    const root = ReactDOM.createRoot(document.getElementById("root"));
    root.render(
      <React.StrictMode>
        <BrowserRouter>
          <AuthProvider {...oidcConfig}>
            <ConfigProvider config={config}>
              <App />
            </ConfigProvider>
          </AuthProvider>
        </BrowserRouter>
      </React.StrictMode>
    );
  } catch (error) {
    console.error("Initialization failed:", error);
    const fallbackRoot = ReactDOM.createRoot(document.getElementById("root"));
    fallbackRoot.render(
      <div style={{ padding: '20px', color: 'red' }}>
        Failed to initialize application. Please check the configuration file.
      </div>
    );
  }
})();