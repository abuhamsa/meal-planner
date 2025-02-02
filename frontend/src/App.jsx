import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import axios from 'axios';
import Modal from 'react-modal';
import { startOfWeek, addDays } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  formatDateInGerman,
  formatDateAPI,
  formatDateDisplay,
  weekConfig
} from './utils/helpers';
import Spinner from './components/Spinner'; 
import MealEditor from './components/MealEditor';
import SettingsModal from './components/SettingsModal';
import IconLink from './components/IconLink';
import GearIcon from './components/GearIcon';

// Add this right after the imports and before component definitions
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
Modal.setAppElement('#root');




const App = () => {
  const [startDate, setStartDate] = useState(startOfWeek(new Date(), weekConfig));
  const [meals, setMeals] = useState([]);
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [personLabels, setPersonLabels] = useState({ person1: 'Person 1', person2: 'Person 2' });
  const [showSettings, setShowSettings] = useState(false);
  const [configLoading, setConfigLoading] = useState(true);

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
        const response = await axios.get(`${API_BASE_URL}/api/meals/week`, {
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
    const fetchConfig = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/config`);
        setPersonLabels({
          person1: response.data.person1_label,
          person2: response.data.person2_label
        });
      } catch (error) {
        console.error('Error loading config:', error);
      } finally {
        setConfigLoading(false);
      }
    };

    fetchConfig();
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
      await axios.post(`${API_BASE_URL}/api/meals`, mealData);
      const response = await axios.get(`${API_BASE_URL}/api/meals/week`, {
        params: { start_date: formatDateAPI(startDate) }
      });
      setMeals(response.data);
    } catch (err) {
      setError('Error saving meal. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = (newLabels) => {
    setPersonLabels(newLabels);
  };

  return (
    <div className="min-h-screen bg-downy-50 p-8">
      <div className="max-w-6xl mx-auto">
        {error && (
          <div className="mb-4 p-4 bg-red-100 text-red-700 rounded-lg flex justify-between items-center border border-red-200">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
              ×
            </button>
          </div>
        )}

        {(loading || configLoading) && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <Spinner className="w-16 h-16 text-white" />
          </div>
        )}

        <div className="mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-downy-900">
            Mealplanner NG <span className="text-lg text-downy-700">({formatWeekRange()})</span>
          </h1>

          <div className="flex items-center gap-4">
            <button
              onClick={() => handleWeekNavigation(-1)}
              className="p-2 text-downy-700 hover:bg-downy-100 rounded-md transition-colors"
            >
              ← Previous
            </button>

            <button
              onClick={handleCurrentWeek}
              className="px-3 py-2 bg-downy-200 text-downy-700 rounded-md hover:bg-downy-300 transition-colors"
            >
              Current Week
            </button>

            <DatePicker
              selected={startDate}
              onChange={handleDateChange}
              dateFormat="dd.MM.yyyy"
              locale={de}
              calendarStartDay={1}
              className="px-4 py-2 border border-downy-200 rounded-md focus:ring-2 focus:ring-downy-300 focus:border-downy-400 outline-none w-40 text-center text-downy-800"
              showWeekNumbers
              weekLabel="KW"
              placeholderText="Select week"
            />

            <button
              onClick={() => handleWeekNavigation(1)}
              className="p-2 text-downy-700 hover:bg-downy-100 rounded-md transition-colors"
            >
              Next →
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-downy-300">
              <tr>
                <th className="bg-downy-300 sticky left-0 px-4 py-4 text-left text-sm font-semibold text-downy-900 w-[160px]  shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)]">Date</th>
                <th className="bg-downy-300 px-6 py-4 text-left text-sm font-semibold text-downy-900">Lunch ({personLabels.person1})</th>
                <th className="bg-downy-300 px-6 py-4 text-left text-sm font-semibold text-downy-900">Lunch ({personLabels.person2})</th>
                <th className="bg-downy-300 px-6 py-4 text-left text-sm font-semibold text-downy-900">Dinner ({personLabels.person1})</th>
                <th className="bg-downy-300 px-6 py-4 text-left text-sm font-semibold text-downy-900">Dinner ({personLabels.person2})</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {getWeekDays().map((date) => {
                const dateStr = formatDateAPI(date);
                const lunch = meals.find(m => m.date === dateStr && m.meal_type === 'lunch');
                const dinner = meals.find(m => m.date === dateStr && m.meal_type === 'dinner');

                return (
                  <tr key={dateStr} className="hover:bg-gray-50 transition-colors">
                    <td className="sticky left-0 bg-white px-4 py-4 text-sm text-downy-600 font-medium w-[160px] shadow-[4px_0_4px_-2px_rgba(0,0,0,0.05)]">
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
                          {((mealType === 'lunch' ? lunch : dinner)?.[`person${person}_url`] ? (
                            <a
                              href={(mealType === 'lunch' ? lunch : dinner)[`person${person}_url`]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-downy-600 hover:underline inline-flex items-center"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {(mealType === 'lunch' ? lunch : dinner)[`person${person}`]}
                              <IconLink />
                            </a>
                          ) : (
                            <span>
                              {(mealType === 'lunch' ? lunch : dinner)?.[`person${person}`] || (
                                <span className="text-gray-400 italic">Add meal</span>
                              )}
                            </span>
                          ))}
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
            personLabels={personLabels}
            date={editing.date}
            mealType={editing.mealType}
            onClose={() => setEditing(null)}
            onSave={handleSaveMeal}
            initialValues={editing.data}
          />
        )}
      </div>
      <div className="fixed bottom-4 right-4">
        <button
          onClick={() => setShowSettings(true)}
          className="p-3 bg-downy-100 hover:bg-downy-200 rounded-full shadow-lg"
          aria-label="Settings"
        >
          <GearIcon />
        </button>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        initialLabels={personLabels}
        onSave={handleSaveSettings}
      />
    </div>
  );
};

export default App;