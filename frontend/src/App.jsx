import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import axios from 'axios';
import Modal from 'react-modal';
import { startOfWeek, addDays,format } from 'date-fns';
import { de } from 'date-fns/locale';
import { 
  formatDateInGerman, 
  formatDateAPI, 
  formatDateDisplay, 
  weekConfig 
} from './utils/helpers';
import Spinner from './components/Spinner';  // Keep this as is, it's correct with default export

Modal.setAppElement('#root');

const MealEditor = ({ date, mealType, onClose, onSave, initialValues }) => {
  const [person1, setPerson1] = useState(initialValues?.person1 || '');
  const [person2, setPerson2] = useState(initialValues?.person2 || '');


const handleSave = () => {
  onSave({
    date: format(date, 'yyyy-MM-dd', { locale: de }),  // Use date-fns format with German locale
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
        {formatDateInGerman(date)} - {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
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
            placeholder="Enter meal"
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
            placeholder="Enter meal"
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
  const [startDate, setStartDate] = useState(startOfWeek(new Date(), weekConfig));
  const [meals, setMeals] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCurrentWeek = () => {
    const currentWeekStart = startOfWeek(new Date(), weekConfig);
    setStartDate(currentWeekStart);
  };

  const getWeekDays = () => {
    return Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));
  };

  const formatWeekRange = () => {
    const endDate = addDays(startDate, 6);
    return `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`;
  };

  useEffect(() => {
    const fetchMeals = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await axios.get('http://localhost:5000/api/meals/week', {
          params: { start_date: formatDateAPI(startDate) }
        });
        setMeals(response.data);
      } catch (err) {
        setError('Error loading meals. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchMeals();
  }, [startDate]);

  const handleDateChange = (date) => {
    const monday = startOfWeek(date, weekConfig);
    setStartDate(monday);
  };

  const handleWeekNavigation = (days) => {
    setStartDate(prev => addDays(prev, days * 7));
  };

  const handleSaveMeal = async (mealData) => {
    setLoading(true);
    setError(null);
    try {
      await axios.post('http://localhost:5000/api/meals', mealData);
      const response = await axios.get('http://localhost:5000/api/meals/week', {
        params: { start_date: formatDateAPI(startDate) }
      });
      setMeals(response.data);
    } catch (err) {
      setError('Error saving meal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
              ×
            </button>
          </div>
        )}

        {loading && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <Spinner className="w-16 h-16 text-white" />
          </div>
        )}

        <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900">
            Mealplanner NG <span className="text-lg text-gray-600">({formatWeekRange()})</span>
          </h1>
          
          <div className="flex items-center gap-4">
  <button 
    onClick={() => handleWeekNavigation(-1)}
    className="p-2 hover:bg-gray-100 rounded-md"
  >
    ← Previous
  </button>
  
  <button
    onClick={handleCurrentWeek}
    className="px-3 py-2 bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
  >
    Today
  </button>
  
  <DatePicker
    selected={startDate}
    onChange={handleDateChange}
    dateFormat="dd.MM.yyyy"
    locale={de}
    calendarStartDay={1}
    className="px-4 py-2 border rounded-md focus:ring-2 focus:ring-primary focus:border-primary outline-none w-40 text-center"
    showWeekNumbers
    weekLabel="KW"
    placeholderText="Select week"
  />
  
  <button 
    onClick={() => handleWeekNavigation(1)}
    className="p-2 hover:bg-gray-100 rounded-md"
  >
    Next →
  </button>
</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700 min-w-[160px]">Date</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Lunch (P1)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Lunch (P2)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Dinner (P1)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Dinner (P2)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {getWeekDays().map((date) => {
                const dateStr = formatDateAPI(date);
                const lunch = meals.find(m => m.date === dateStr && m.meal_type === 'lunch');
                const dinner = meals.find(m => m.date === dateStr && m.meal_type === 'dinner');

                return (
                  <tr key={dateStr} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600 font-medium">
                      {formatDateInGerman(date)}
                    </td>
                    
                    {['lunch', 'dinner'].flatMap(mealType => 
                      [1, 2].map(person => (
                        <td
                          key={`${dateStr}-${mealType}-${person}`}
                          onClick={() => setEditing({ 
                            date, 
                            mealType, 
                            data: mealType === 'lunch' ? lunch : dinner 
                          })}
                          className="px-6 py-4 text-sm cursor-pointer hover:bg-gray-100"
                        >
                          {((mealType === 'lunch' ? lunch : dinner)?.[`person${person}`]) || (
                            <span className="text-gray-400 italic">Add meal</span>
                          )}
                        </td>
                      ))
                    )}
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