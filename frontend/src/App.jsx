import { Routes, Route, useNavigate } from 'react-router-dom';
import { useAuth } from './auth/AuthProvider';
import ProtectedRoute from './auth/ProtectedRoute';
import Login from './pages/Login';
import Mealplanner from './Mealplanner'; // Rename your existing App component to Mealplanner

const App = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
            <Mealplanner />
        }
      />
      {/* Add callback route if needed */}
    </Routes>
  );
};

export default App;