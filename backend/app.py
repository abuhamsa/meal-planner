from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timedelta
from flask_migrate import Migrate
import os

app = Flask(__name__)
app.config['CORS_ORIGINS'] = os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(',')
# Sett this properly if going public
# CORS(app, resources={r"/api/*": {"origins": app.config['CORS_ORIGINS']}})
CORS(app, resources={r"/api/*": {"origins": "*"}})
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'meals.db')
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

with app.app_context():
    db.create_all()
@app.route('/api/config', methods=['GET'])
def get_config():
    config = {
        'person1_label': 'Person 1',  # Default values
        'person2_label': 'Person 2'
    }
    
    # Try to get from database
    person1 = Config.query.filter_by(key='person1_label').first()
    person2 = Config.query.filter_by(key='person2_label').first()
    
    if person1:
        config['person1_label'] = person1.value
    if person2:
        config['person2_label'] = person2.value
    
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

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    app.run(host='0.0.0.0')