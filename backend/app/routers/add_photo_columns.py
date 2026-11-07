from sqlalchemy import text
from app.database import engine

sql = """
ALTER TABLE grievances
ADD COLUMN IF NOT EXISTS submission_type VARCHAR(20) NOT NULL DEFAULT 'text',
ADD COLUMN IF NOT EXISTS location VARCHAR(255),
ADD COLUMN IF NOT EXISTS image_public_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS image_format VARCHAR(20);
"""

with engine.begin() as connection:
    connection.execute(text(sql))

print("Photo grievance columns added successfully!")