// src/contexts/ConfigContext.jsx
import { createContext } from 'react';

export const ConfigContext = createContext({});

export const ConfigProvider = ({ children, config }) => {
  return (
    <ConfigContext.Provider value={config}>
      {children}
    </ConfigContext.Provider>
  );
};