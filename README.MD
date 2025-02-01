# Meal Planner NG 🍽️

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18.2.0-blue)](https://reactjs.org/)
[![Flask](https://img.shields.io/badge/Flask-2.0.1-green)](https://flask.palletsprojects.com/)

A modern meal planning application with collaborative features and recipe management. Perfect for households managing meals for multiple people.

![Meal Planner Screenshot](./screenshot.png)

## Features ✨

- **Weekly Meal Overview** 
  - Intuitive calendar view with week navigation
  - Current week quick-jump button
  - German date formatting support
- **Smart Meal Management**
  - Separate tracking for two people
  - Lunch/Dinner differentiation
  - URL attachment for recipes
- **Advanced Search**
  - Typeahead meal suggestions
  - Cross-meal search (toggleable in settings)
  - URL domain display in results
- **Customization**
  - Rename person labels
  - Toggle search functionality
  - Responsive design with Tailwind
- **Data Safety**
  - SQLite database persistence
  - Configurable CORS policies
  - Proper input validation

## Tech Stack 💻

**Frontend**
- React 18 + Vite
- Tailwind CSS + Custom animations
- React Datepicker
- Axios for API calls
- Date-fns for date management

**Backend**
- Flask 2.0
- SQLAlchemy ORM
- Flask-Migrate
- SQLite (Production-ready DB support via config)
- CORS security

## Installation 🛠️

1. **Clone Repository**
   ```bash
   git clone https://github.com/abuhamsa/meal-planner.git
   cd meal-planner
   ```
2. **Backend Setup**
   ```bash
   cd backend
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   ```

4. **Environment Variables**
Create .env in frontend:
   ```env
   VITE_API_URL=http://localhost:5000
   ```
## Installation 🛠️
1. **Start Backend**
    ```bash
   cd backend
   flask run --port 5000
   ```
2. **Start Frontend**
    ```bash
   cd frontend
   npm run dev
   ```   
3. **Enjos**
   Visit `http://localhost:5173`    

## Configuration ⚙️

### Application Settings
Accessible via the gear icon (bottom-right corner):
- **Person Labels**  
  Rename "Person 1" and "Person 2" to custom names (e.g. "Sarah" and "James")
- **Search Functionality**  
  Toggle meal search autocomplete feature on/off
- **Weekly Reset**  
  Defaults to current week on page reload

### Environment Variables

#### Frontend (`.env` file)
| Variable          | Description                     | Default               |
|-------------------|---------------------------------|-----------------------|
| `VITE_API_URL`    | Backend API base URL            | `http://localhost:5000` |

#### Backend
Set via system environment or `.flaskenv`:
| Variable                   | Description                      | Default               |
|----------------------------|----------------------------------|-----------------------|
| `FLASK_ENV`                | Runtime environment              | `development`         |
| `SQLALCHEMY_DATABASE_URI`  | Database connection string       | `sqlite:///meals.db`  |
| `CORS_ORIGINS`             | Allowed origins (comma-separated)| `*`                   |

### Database Configuration
- **Development**: Uses SQLite by default (auto-created in `backend` directory)
- **Production**: Recommend PostgreSQL/MySQL:
  ```bash
  postgresql://user:password@localhost/mydatabase