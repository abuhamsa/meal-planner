import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import axios from 'axios';
import Modal from 'react-modal';

Modal.setAppElement('#root');

const MealEditor = ({ date, mealType, onClose, onSave, initialValues }) => {
  const [person1, setPerson1] = useState(initialValues?.person1 || '');
  const [person2, setPerson2] = useState(initialValues?.person2 || '');

  const handleSave = () => {
    onSave({
      date: date.toISOString().split('T')[0],
      meal_type: mealType,
      person1,
      person2
    });
    onClose();
  };

  return (
    <Modal
      isOpen={true}
      onRequestClose={onClose}
      className="bg-white rounded-lg p-6 max-w-md mx-auto mt-20 shadow-xl"
      overlayClassName="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm"
    >
      <h2 className="text-xl font-semibold mb-4 text-gray-800">
        {date.toLocaleDateString()} - {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
      </h2>
      
      <div className="space-y-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Person 1
          </label>
          <input
            value={person1}
            onChange={(e) => setPerson1(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Person 2
          </label>
          <input
            value={person2}
            onChange={(e) => setPerson2(e.target.value)}
            className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
        </div>
      </div>

      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90"
        >
          Save Meal
        </button>
      </div>
    </Modal>
  );
};

const App = () => {
  const [startDate, setStartDate] = useState(new Date());
  const [meals, setMeals] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const fetchMeals = async () => {
      const response = await axios.get('http://localhost:5000/api/meals/week', {
        params: { start_date: startDate.toISOString().split('T')[0] }
      });
      setMeals(response.data);
    };
    fetchMeals();
  }, [startDate]);

  const getWeekDays = () => {
    const days = [];
    const current = new Date(startDate);
    for (let i = 0; i < 7; i++) {
      days.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    return days;
  };

  const handleSaveMeal = async (mealData) => {
    await axios.post('http://localhost:5000/api/meals', mealData);
    const response = await axios.get('http://localhost:5000/api/meals/week', {
      params: { start_date: startDate.toISOString().split('T')[0] }
    });
    setMeals(response.data);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Meal Planner</h1>
          <DatePicker
            selected={startDate}
            onChange={(date) => setStartDate(date)}
            dateFormat="yyyy-MM-dd"
            className="px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary outline-none"
          />
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Lunch (P1)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Lunch (P2)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Dinner (P1)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Dinner (P2)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {getWeekDays().map((date) => {
                const dateStr = date.toISOString().split('T')[0];
                const lunch = meals.find(m => m.date === dateStr && m.meal_type === 'lunch');
                const dinner = meals.find(m => m.date === dateStr && m.meal_type === 'dinner');

                return (
                  <tr key={dateStr} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">{date.toLocaleDateString()}</td>
                    <td
                      onClick={() => setEditing({ date, mealType: 'lunch', data: lunch })}
                      className="px-6 py-4 text-sm cursor-pointer hover:bg-gray-100"
                    >
                      {lunch?.person1 || <span className="text-gray-400">Add meal</span>}
                    </td>
                    <td
                      onClick={() => setEditing({ date, mealType: 'lunch', data: lunch })}
                      className="px-6 py-4 text-sm cursor-pointer hover:bg-gray-100"
                    >
                      {lunch?.person2 || <span className="text-gray-400">Add meal</span>}
                    </td>
                    <td
                      onClick={() => setEditing({ date, mealType: 'dinner', data: dinner })}
                      className="px-6 py-4 text-sm cursor-pointer hover:bg-gray-100"
                    >
                      {dinner?.person1 || <span className="text-gray-400">Add meal</span>}
                    </td>
                    <td
                      onClick={() => setEditing({ date, mealType: 'dinner', data: dinner })}
                      className="px-6 py-4 text-sm cursor-pointer hover:bg-gray-100"
                    >
                      {dinner?.person2 || <span className="text-gray-400">Add meal</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {editing && (
          <MealEditor
            date={editing.date}
            mealType={editing.mealType}
            onClose={() => setEditing(null)}
            onSave={handleSaveMeal}
            initialValues={editing.data}
          />
        )}
      </div>
    </div>
  );
};

export default App;