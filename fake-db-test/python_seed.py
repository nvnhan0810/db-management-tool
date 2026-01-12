import mysql.connector
from faker import Faker
from tqdm import tqdm
import random

# ======================
# CONFIG
# ======================
DB_HOST = "localhost"
DB_USER = "gl_user"
DB_PASS = "gl_password"
DB_NAME = "gl_db"

TOTAL_USERS = 1000_000
TOTAL_POSTS = 1000_000
BATCH_SIZE = 10_000

fake = Faker()

# ======================
# CONNECT MYSQL
# ======================
conn = mysql.connector.connect(
    host=DB_HOST,
    user=DB_USER,
    password=DB_PASS,
    autocommit=True
)
cursor = conn.cursor()

# ======================
# CREATE DATABASE
# ======================
cursor.execute(f"CREATE DATABASE IF NOT EXISTS {DB_NAME}")
cursor.execute(f"USE {DB_NAME}")

# ======================
# CREATE TABLES
# ======================
cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100),
    email VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS posts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT,
    title VARCHAR(255),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX(user_id)
) ENGINE=InnoDB;
""")

print("✅ Database & tables created")

# ======================
# INSERT USERS
# ======================
print("🚀 Inserting users...")

user_sql = "INSERT INTO users (name, email) VALUES (%s, %s)"

for _ in tqdm(range(TOTAL_USERS // BATCH_SIZE)):
    data = []
    for _ in range(BATCH_SIZE):
        data.append((
            fake.name(),
            fake.unique.email()
        ))
    cursor.executemany(user_sql, data)

print("✅ Users inserted")

# ======================
# INSERT POSTS
# ======================
print("🚀 Inserting posts...")

post_sql = "INSERT INTO posts (user_id, title, content) VALUES (%s, %s, %s)"

for _ in tqdm(range(TOTAL_POSTS // BATCH_SIZE)):
    data = []
    for _ in range(BATCH_SIZE):
        data.append((
            random.randint(1, TOTAL_USERS),
            fake.sentence(nb_words=6),
            fake.text(max_nb_chars=1000)
        ))
    cursor.executemany(post_sql, data)

print("✅ Posts inserted")

cursor.close()
conn.close()
