import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute";
import Login from "./pages/Login";
import Mealplanner from "./Mealplanner"; // Your main app component
import Callback from "./Callback";

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/callback" element={<Callback />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Mealplanner />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

export default App;
