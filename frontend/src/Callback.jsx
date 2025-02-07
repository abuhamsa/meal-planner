import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { useNavigate } from "react-router-dom";
import Spinner from "./components/Spinner";

const Callback = () => {
    const auth = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        if (auth.isAuthenticated) {
            navigate("/"); // Redirect to home after successful login
        }
    }, [auth.isAuthenticated, navigate]);

    return <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
        <Spinner className="w-16 h-16 text-white" />
    </div>;
};

export default Callback;
