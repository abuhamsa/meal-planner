import { useState, useEffect } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import axios from 'axios';
import Modal from 'react-modal';
import { startOfWeek, addDays, format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  formatDateInGerman,
  formatDateAPI,
  formatDateDisplay,
  weekConfig
} from './utils/helpers';
import Spinner from './components/Spinner';  // Keep this as is, it's correct with default export
import { isValidUrl } from './utils/helpers';


Modal.setAppElement('#root');

const IconLink = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-4 h-4 inline-block ml-1 text-downy-500"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
    />
  </svg>
);

const MealEditor = ({ date, mealType, onClose, onSave, initialValues }) => {
  const [person1, setPerson1] = useState(initialValues?.person1 || '');
  const [person2, setPerson2] = useState(initialValues?.person2 || '');
  const [person1Url, setPerson1Url] = useState(initialValues?.person1_url || '');
  const [person2Url, setPerson2Url] = useState(initialValues?.person2_url || '');
  const [person1UrlError, setPerson1UrlError] = useState('');
  const [person2UrlError, setPerson2UrlError] = useState('');
  const [copyToPerson2, setCopyToPerson2] = useState(false);

  const validateUrls = () => {
    let isValid = true;

    if (person1Url && !isValidUrl(person1Url)) {
      setPerson1UrlError('Invalid URL format');
      isValid = false;
    } else {
      setPerson1UrlError('');
    }

    if (!copyToPerson2 && person2Url && !isValidUrl(person2Url)) {
      setPerson2UrlError('Invalid URL format');
      isValid = false;
    } else {
      setPerson2UrlError('');
    }

    return isValid;
  };

  // Automatically copy person1 to person2 when checkbox is checked
  useEffect(() => {
    if (copyToPerson2) {
      setPerson2(person1);
      setPerson2Url(person1Url);
    }
  }, [person1, person1Url, copyToPerson2]);

  const handleSave = () => {
    if (!validateUrls()) return;
    onSave({
      date: format(date, 'yyyy-MM-dd', { locale: de }),
      meal_type: mealType,
      person1,
      person2: copyToPerson2 ? person1 : person2,
      person1_url: person1Url,
      person2_url: copyToPerson2 ? person1Url : person2Url
    });
    onClose();
  };



  return (
    <Modal
      isOpen={true}
      onRequestClose={onClose}
      className="bg-white rounded-lg p-6 max-w-md mx-auto mt-20 shadow-xl border-2 border-downy-100"
      overlayClassName="fixed inset-0 bg-downy-950/20 backdrop-blur-sm"
    >
      <h2 className="text-xl font-semibold mb-4 text-downy-800">
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
            className="w-full px-3 py-2 border border-downy-200 rounded-md focus:ring-2 focus:ring-downy-300 focus:border-downy-400 outline-none"
            placeholder="Enter meal"
          />
          <div className="mt-2">
            <input
              type="url"
              value={person1Url}
              onChange={(e) => {
                setPerson1Url(e.target.value);
                if (e.target.value && !isValidUrl(e.target.value)) {
                  setPerson1UrlError('Invalid URL format');
                } else {
                  setPerson1UrlError('');
                }
              }}
              onBlur={() => {
                if (person1Url && !isValidUrl(person1Url)) {
                  setPerson1UrlError('Invalid URL format');
                }
              }}
              placeholder="URL (optional)"
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 outline-none ${person1UrlError ? 'border-red-500 focus:ring-red-300' : 'border-downy-200 focus:ring-downy-300'
                }`}
            />
            {person1UrlError && (
              <p className="text-red-500 text-sm mt-1">{person1UrlError}</p>
            )}
          </div>
        </div>
        <label className="flex items-center space-x-2 mb-4">
          <input
            type="checkbox"
            checked={copyToPerson2}
            onChange={(e) => setCopyToPerson2(e.target.checked)}
            className="h-4 w-4 text-downy-500 focus:ring-downy-300 rounded border-gray-300"
          />
          <span className="text-sm text-downy-700">Same meal for Person 2</span>
        </label>
        <div>
          <label className="block text-sm font-medium text-downy-700 mb-1">
            Person 2
          </label>
          <input
            value={copyToPerson2 ? person1 : person2}
            onChange={(e) => {
              setPerson2(e.target.value);
              setCopyToPerson2(false); // Uncheck if manual edit
            }}
            disabled={copyToPerson2}
            className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-downy-300 focus:border-downy-400 outline-none ${copyToPerson2 ? 'bg-gray-50 cursor-not-allowed' : ''
              }`}
            placeholder="Meal name"
          />
          <div className="mt-2">
            <input
              type="url"
              value={copyToPerson2 ? person1Url : person2Url}
              onChange={(e) => {
                if (!copyToPerson2) {
                  setPerson2Url(e.target.value);
                  if (e.target.value && !isValidUrl(e.target.value)) {
                    setPerson2UrlError('Invalid URL format');
                  } else {
                    setPerson2UrlError('');
                  }
                }
              }}
              onBlur={() => {
                if (!copyToPerson2 && person2Url && !isValidUrl(person2Url)) {
                  setPerson2UrlError('Invalid URL format');
                }
              }}
              disabled={copyToPerson2}
              className={`w-full px-3 py-2 border rounded-md focus:ring-2 outline-none ${person2UrlError ? 'border-red-500 focus:ring-red-300' : 'border-downy-200 focus:ring-downy-300'
                } ${copyToPerson2 ? 'bg-gray-50 cursor-not-allowed' : ''
                }`}
            />
            {person2UrlError && (
              <p className="text-red-500 text-sm mt-1">{person2UrlError}</p>
            )}
          </div>
        </div>
      </div>


      <div className="flex gap-3 justify-end">
        <button
          onClick={onClose}
          className="px-4 py-2 text-gray-600 bg-downy-100 hover:bg-downy-200 rounded-md"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-downy-500 text-white rounded-md hover:bg-downy-600 disabled:bg-downy-300"
          disabled={!!person1UrlError || !!person2UrlError}
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

        {loading && (
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
                <th className="px-4 py-4 text-left text-sm font-semibold text-downy-900 w-40">Date</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-downy-900">Lunch (P1)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-downy-900">Lunch (P2)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-downy-900">Dinner (P1)</th>
                <th className="px-6 py-4 text-left text-sm font-semibold text-downy-900">Dinner (P2)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {getWeekDays().map((date) => {
                const dateStr = formatDateAPI(date);
                const lunch = meals.find(m => m.date === dateStr && m.meal_type === 'lunch');
                const dinner = meals.find(m => m.date === dateStr && m.meal_type === 'dinner');

                return (
                  <tr key={dateStr} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 text-sm text-downy-600 font-medium w-32 sm:w-40 whitespace-nowrap">
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