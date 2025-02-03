from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timedelta
from flask_migrate import Migrate
import os
from pathlib import Path
from dotenv import load_dotenv


load_dotenv()
# Version should be in MAJOR.MINOR.PATCH format (semantic versioning)
APP_VERSION = "0.1.0"  # Update this with each release



app = Flask(__name__)
app.config['CORS_ORIGINS'] = os.environ.get('CORS_ORIGINS', '*').split(',')
# Sett this properly if going public
CORS(app, resources={r"/api/*": {"origins": app.config['CORS_ORIGINS']}})
# Database configuration
basedir = Path(__file__).parent.resolve()
db_dir = basedir / "data"
db_path = db_dir / "meals.db"

# Ensure directory exists with proper permissions
db_dir.mkdir(mode=0o755, parents=True, exist_ok=True)

app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)
migrate = Migrate(app, db)

class Meal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    meal_type = db.Column(db.String(10), nullable=False)
    person1 = db.Column(db.String(100))
    person2 = db.Column(db.String(100))
    person1_url = db.Column(db.String(500))  # New field
    person2_url = db.Column(db.String(500))  # New field

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat(),
            'meal_type': self.meal_type,
            'person1': self.person1,
            'person2': self.person2,
            'person1_url': self.person1_url,  # Include in response
            'person2_url': self.person2_url   # Include in response
        }

class Config(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(50), unique=True, nullable=False)
    value = db.Column(db.String(500), nullable=False)
    
# Add this endpoint
@app.route('/api/version')
def get_version():
    return jsonify({
        'backend_version': APP_VERSION
    })

@app.route('/api/config', methods=['GET'])
def get_config():
    config = {
        'person1_label': 'Person 1',
        'person2_label': 'Person 2',
        'search_enabled': 'true'  # Default to enabled
    }
    
    # Get all config entries at once
    config_entries = Config.query.all()
    for entry in config_entries:
        config[entry.key] = entry.value
    
    return jsonify(config)

@app.route('/api/config', methods=['POST'])
def update_config():
    data = request.get_json()
    
    for key, value in data.items():
        config = Config.query.filter_by(key=key).first()
        if config:
            config.value = value
        else:
            config = Config(key=key, value=value)
            db.session.add(config)
    
    db.session.commit()
    return jsonify({'status': 'success'})

@app.route('/api/meals/week', methods=['GET'])
def get_week_meals():
    start_date = datetime.strptime(request.args.get('start_date'), '%Y-%m-%d').date()
    end_date = start_date + timedelta(days=6)
    
    meals = Meal.query.filter(Meal.date.between(start_date, end_date)).all()
    meals_data = [meal.to_dict() for meal in meals]
    
    return jsonify(meals_data)

@app.route('/api/meals', methods=['POST'])
def save_meal():
    data = request.get_json()
    date = datetime.strptime(data['date'], '%Y-%m-%d').date()
    
    # Update existing entries
    Meal.query.filter_by(date=date, meal_type=data['meal_type']).delete()
    
    meal = Meal(
        date=date,
        meal_type=data['meal_type'],
        person1=data['person1'],
        person2=data['person2'],
        person1_url=data.get('person1_url'),  # Add URL fields
        person2_url=data.get('person2_url')
    )
    db.session.add(meal)
    db.session.commit()
    
    return jsonify({'status': 'success'})

@app.route('/api/meals/search')
def search_meals():
    search_term = request.args.get('q', '')
    results = Meal.query.filter(
        (Meal.person1.ilike(f'%{search_term}%')) | 
        (Meal.person2.ilike(f'%{search_term}%'))
    ).all()
    
    meals = []
    seen = set()
    for meal in reversed(results):  # Get most recent first
        for person in ['person1', 'person2']:
            name = getattr(meal, person)
            url = getattr(meal, f'{person}_url')
            if name and name.lower() not in seen:
                seen.add(name.lower())
                meals.append({'name': name, 'url': url})
    
    return jsonify(meals[:10])  # Return top 10 results

@app.route('/healthz')
def health_check():
    return jsonify(status='ok'), 200

if __name__ == '__main__':
    if os.environ.get('FLASK_ENV') == 'development':
        from argparse import ArgumentParser
        
        parser = ArgumentParser()
        parser.add_argument('--create-db', action='store_true')
        args = parser.parse_args()

        if args.create_db:
            with app.app_context():
                db.create_all()
                print("Initial database created")
        else:
            app.run(host='0.0.0.0', port=8000)