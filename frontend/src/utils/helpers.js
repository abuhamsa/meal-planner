// src/utils/helpers.js
import { format } from 'date-fns';
import { de } from 'date-fns/locale';

// Date formatting
export const formatDateInGerman = (date) => {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
};

// Use date-fns format with German locale
export const formatDateAPI = (date) => format(date, 'yyyy-MM-dd', { locale: de });
export const formatDateDisplay = (date) => format(date, 'dd.MM.yyyy', { locale: de });

// Week configuration
export const weekConfig = {
  locale: de,
  weekStartsOn: 1,
  weekLabel: "KW"
};