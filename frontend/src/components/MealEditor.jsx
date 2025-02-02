import { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from 'react-modal';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { isValidUrl, formatDateInGerman } from '../utils/helpers';
import { API_BASE_URL } from '../config';


const MealEditor = ({ personLabels, date, mealType, onClose, onSave, initialValues }) => {
    const [person1, setPerson1] = useState(initialValues?.person1 || '');
    const [person2, setPerson2] = useState(initialValues?.person2 || '');
    const [person1Url, setPerson1Url] = useState(initialValues?.person1_url || '');
    const [person2Url, setPerson2Url] = useState(initialValues?.person2_url || '');
    const [person1UrlError, setPerson1UrlError] = useState('');
    const [person2UrlError, setPerson2UrlError] = useState('');
    const [copyToPerson2, setCopyToPerson2] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [activeField, setActiveField] = useState(null);
  
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
  
  
    useEffect(() => {
      const delayDebounce = setTimeout(async () => {
        if (searchTerm.length > 2) {
          try {
            const response = await axios.get(`${API_BASE_URL}/api/meals/search`, {
              params: { q: searchTerm }
            });
            const uniqueMeals = response.data.reduce((acc, meal) => {
              if (!acc.some(m => m.name.toLowerCase() === meal.name.toLowerCase())) {
                acc.push(meal);
              }
              return acc;
            }, []);
            setSearchResults(uniqueMeals);
          } catch (error) {
            console.error('Search error:', error);
          }
        } else {
          setSearchResults([]);
        }
      }, 300);
  
      return () => clearTimeout(delayDebounce);
    }, [searchTerm]);
  
    const handleMealSelect = (meal) => {
      if (activeField === 'person1') {
        setPerson1(meal.name);
        setPerson1Url(meal.url || '');
      } else {
        setPerson2(meal.name);
        setPerson2Url(meal.url || '');
      }
      setSearchResults([]);
    };
  
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
              {personLabels.person1}
            </label>
            <div className="relative">
              <input
                value={person1}
                onChange={(e) => {
                  setPerson1(e.target.value);
                  setSearchTerm(e.target.value);
                }}
                onFocus={() => setActiveField('person1')}
                className="w-full px-3 py-2 border border-downy-200 rounded-md focus:ring-2 focus:ring-downy-300 focus:border-downy-400 outline-none"
                placeholder="Enter meal"
              />
              {activeField === 'person1' && searchResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md max-h-60 overflow-auto border border-downy-200">
                  {searchResults.map((meal, index) => (
                    <div
                      key={index}
                      onClick={() => handleMealSelect(meal)}
                      className="px-4 py-2 hover:bg-downy-50 cursor-pointer text-sm text-downy-900"
                    >
                      {meal.name}
                      {meal.url && <span className="text-downy-500 ml-2 text-xs">({new URL(meal.url).hostname})</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
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
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {personLabels.person2}
    </label>
    <div className="relative">
      <input
        value={person2}
        onChange={(e) => {
          setPerson2(e.target.value);
          setSearchTerm(e.target.value);
          setCopyToPerson2(false); // Uncheck if manual edit
        }}
        onFocus={() => setActiveField('person2')}
        className="w-full px-3 py-2 border border-downy-200 rounded-md focus:ring-2 focus:ring-downy-300 focus:border-downy-400 outline-none"
        placeholder="Enter meal"
      />
      {activeField === 'person2' && searchResults.length > 0 && (
        <div className="absolute z-10 mt-1 w-full bg-white shadow-lg rounded-md max-h-60 overflow-auto border border-downy-200">
          {searchResults.map((meal, index) => (
            <div
              key={index}
              onClick={() => handleMealSelect(meal)}
              className="px-4 py-2 hover:bg-downy-50 cursor-pointer text-sm text-downy-900"
            >
              {meal.name}
              {meal.url && <span className="text-downy-500 ml-2 text-xs">({new URL(meal.url).hostname})</span>}
            </div>
          ))}
        </div>
      )}
    </div>
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

export default MealEditor;