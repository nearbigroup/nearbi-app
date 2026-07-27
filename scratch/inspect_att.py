import psycopg2

db_url = "postgresql://postgres:%25%23P%23-%2B..4e*%26x7*@db.hvhigpyopdtyiysnguid.supabase.co:5432/postgres"

def run():
    conn = psycopg2.connect(db_url)
    cursor = conn.cursor()
    
    # Check columns of attendance
    cursor.execute("""
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_name = 'attendance'
    """)
    cols = cursor.fetchall()
    print("Columns in attendance table:")
    for col in cols:
        print("  ", col)
        
    # Check Aneesha's attendance rows in detail
    cursor.execute("""
        SELECT date, status, minutes_late, late_salary_deduction_minutes 
        FROM attendance 
        WHERE staff_id = 'da82b57a-fb3b-4dfd-845b-782fad118adc' 
        AND date >= '2026-07-01' AND date <= '2026-07-31'
    """)
    rows = cursor.fetchall()
    print("\nAneesha attendance rows detail:")
    for row in rows:
        print("  ", row)
        
    cursor.close()
    conn.close()

if __name__ == '__main__':
    run()
