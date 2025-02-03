import { useState, useEffect } from 'react';
import axios from 'axios';
import Modal from 'react-modal';
import { API_BASE_URL } from '../config';

const SettingsModal = ({ isOpen, onClose, initialLabels, onSave }) => {
    const [person1Label, setPerson1Label] = useState('');
    const [person2Label, setPerson2Label] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [versions, setVersions] = useState({
        frontend: import.meta.env.VITE_APP_VERSION,
        backend: 'Loading...'
    });

    useEffect(() => {
        const fetchConfigAndVersions = async () => {
            try {
                setLoading(true);
                // Fetch current config
                const configResponse = await axios.get(`${API_BASE_URL}/api/config`);
                const { person1_label, person2_label } = configResponse.data;
                
                setPerson1Label(person1_label || initialLabels.person1);
                setPerson2Label(person2_label || initialLabels.person2);

                // Fetch versions
                const versionResponse = await axios.get(`${API_BASE_URL}/api/version`);
                setVersions({
                    frontend: import.meta.env.VITE_APP_VERSION,
                    backend: versionResponse.data.backend_version
                });
            } catch (error) {
                console.error('Error fetching data:', error);
                setError('Failed to load settings');
                // Fallback to initial labels
                setPerson1Label(initialLabels.person1);
                setPerson2Label(initialLabels.person2);
                setVersions(prev => ({
                    ...prev,
                    backend: 'Unavailable'
                }));
            } finally {
                setLoading(false);
            }
        };

        if (isOpen) {
            fetchConfigAndVersions();
        }
    }, [isOpen, initialLabels.person1, initialLabels.person2]);

    const handleSubmit = async () => {
        setLoading(true);
        setError(null);

        try {
            await axios.post(`${API_BASE_URL}/api/config`, {
                person1_label: person1Label,
                person2_label: person2Label
            });
            onSave({
                person1: person1Label,
                person2: person2Label
            });
            onClose();
        } catch (err) {
            setError('Failed to save settings. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onRequestClose={onClose}
            className="bg-white rounded-lg p-6 max-w-md mx-auto mt-20 shadow-xl border-2 border-downy-100"
            overlayClassName="fixed inset-0 bg-downy-950/20 backdrop-blur-xs"
        >
            <h2 className="text-xl font-semibold mb-4 text-downy-800">Settings</h2>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-lg">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-downy-700 mb-1">
                        Label for Person 1
                    </label>
                    <input
                        value={person1Label || ''}
                        onChange={(e) => setPerson1Label(e.target.value)}
                        className="w-full px-3 py-2 border border-downy-200 rounded-md focus:ring-2 focus:ring-downy-300 focus:border-downy-400 outline-hidden"
                        disabled={loading}
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-downy-700 mb-1">
                        Label for Person 2
                    </label>
                    <input
                        value={person2Label || ''}
                        onChange={(e) => setPerson2Label(e.target.value)}
                        className="w-full px-3 py-2 border border-downy-200 rounded-md focus:ring-2 focus:ring-downy-300 focus:border-downy-400 outline-hidden"
                        disabled={loading}
                    />
                </div>
            </div>

            <div className="flex gap-3 justify-end mt-6">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-gray-600 bg-downy-100 hover:bg-downy-200 rounded-md"
                    disabled={loading}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSubmit}
                    className="px-4 py-2 bg-downy-500 text-white rounded-md hover:bg-downy-600 disabled:bg-downy-300"
                    disabled={loading}
                >
                    {loading ? 'Saving...' : 'Save Settings'}
                </button>
            </div>
            <div className="mt-8 pt-4 border-t border-downy-100">
                <div className="text-sm text-downy-500">
                    <p>Frontend Version: {versions.frontend}</p>
                    <p className="mt-1">Backend Version: {versions.backend}</p>
                </div>
            </div>
        </Modal>
    );
};

export default SettingsModal;