import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "react-oidc-context"; // Import AuthProvider
import App from "./App.jsx";
import "./index.css";

// OIDC Configuration for Authentik
const oidcConfig = {
  authority: "https://auth.abuhamsa.ch/application/o/mealplannerdev/", // Replace with your Authentik URL
  client_id: "iIiiYk7zOD3KQGXbPj8Ux4FUOGEr6rHuTUnquJww",
  redirect_uri: "http://127.0.0.1:5173/callback", // Match with Authentik's allowed redirect URIs
  scope: "openid profile email",
  response_type: "code",
  post_logout_redirect_uri: "http://127.0.0.1:5173/",
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
