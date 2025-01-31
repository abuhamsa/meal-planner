from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timedelta
from flask_migrate import Migrate
import os

app = Flask(__name__)
CORS(app)
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

with app.app_context():
    db.create_all()

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
    app.run(debug=True)