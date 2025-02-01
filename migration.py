import mysql.connector
import sqlite3
import re

# MySQL connection config
mysql_config = {
    'user': 'root',
    'password': 'xxxxxx',
    'host': '1xxxxxx',
    'database': 'mealplanner'
}

# SQLite connection
sqlite_conn = sqlite3.connect('backend/data/meals.db')
sqlite_cursor = sqlite_conn.cursor()

# Regular expression to find URLs in text
URL_PATTERN = re.compile(r'(https?://\S+)')

def parse_meal_entry(text):
    """Extract meal name and URL from text entry"""
    if not text:
        return None, None
    
    match = URL_PATTERN.search(text)
    if match:
        url = match.group(0)
        name = text.replace(url, '').strip()
        return name, url
    return text, None

def migrate_data():
    # Connect to MySQL
    mysql_conn = mysql.connector.connect(**mysql_config)
    mysql_cursor = mysql_conn.cursor(dictionary=True)
    
    # Get old data
    mysql_cursor.execute("SELECT * FROM dayplan_simple")
    rows = mysql_cursor.fetchall()
    
    # Insert into SQLite
    for row in rows:
        date_str = row['datum'].isoformat()
        
        # Process lunch entries
        lunch_nat_name, lunch_nat_url = parse_meal_entry(row['mittag_nat'])
        lunch_jan_name, lunch_jan_url = parse_meal_entry(row['mittag_jan'])
        
        sqlite_cursor.execute('''
            INSERT INTO meal (date, meal_type, person1, person2, person1_url, person2_url)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            date_str, 
            'lunch',
            lunch_nat_name,
            lunch_jan_name,
            lunch_nat_url,
            lunch_jan_url
        ))
        
        # Process dinner entries
        dinner_nat_name, dinner_nat_url = parse_meal_entry(row['abend_nat'])
        dinner_jan_name, dinner_jan_url = parse_meal_entry(row['abend_jan'])
        
        sqlite_cursor.execute('''
            INSERT INTO meal (date, meal_type, person1, person2, person1_url, person2_url)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (
            date_str, 
            'dinner',
            dinner_nat_name,
            dinner_jan_name,
            dinner_nat_url,
            dinner_jan_url
        ))
    
    # Commit and close
    sqlite_conn.commit()
    mysql_conn.close()
    sqlite_conn.close()

if __name__ == '__main__':
    migrate_data()
    print("Migration completed successfully!")