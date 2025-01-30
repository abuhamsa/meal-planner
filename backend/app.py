from flask import Flask, jsonify, request
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from datetime import datetime, timedelta
import os

app = Flask(__name__)
CORS(app)
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'meals.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

class Meal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    meal_type = db.Column(db.String(10), nullable=False)  # 'lunch' or 'dinner'
    person1 = db.Column(db.String(100))
    person2 = db.Column(db.String(100))

    def to_dict(self):
        return {
            'id': self.id,
            'date': self.date.isoformat(),
            'meal_type': self.meal_type,
            'person1': self.person1,
            'person2': self.person2
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
    
    # Delete existing entries for this date and meal type
    Meal.query.filter_by(date=date, meal_type=data['meal_type']).delete()
    
    # Create new entries
    meal = Meal(
        date=date,
        meal_type=data['meal_type'],
        person1=data['person1'],
        person2=data['person2']
    )
    db.session.add(meal)
    db.session.commit()
    
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    app.run(debug=True)