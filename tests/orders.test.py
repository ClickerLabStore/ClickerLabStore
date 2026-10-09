import sqlite3, unittest
from pathlib import Path

class Orders(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.execute('CREATE TABLE keycaps(id INTEGER PRIMARY KEY,name TEXT,stock INTEGER)')
        self.db.execute("INSERT INTO keycaps VALUES (1,'Keycap 1',6)")
        self.db.executescript(Path('migrations/0001_orders_and_bases.sql').read_text())
        self.db.executescript(Path('migrations/0002_shipping_quotes.sql').read_text())
        self.db.executescript(Path('migrations/0003_nine_key_base.sql').read_text())
        self.db.execute('UPDATE bases SET stock=2 WHERE id=3')
        self.db.commit()
    def reserve(self,id,quantity=2):
        with self.db:
            self.db.execute("INSERT INTO orders(id,status,amount,cart_json,created_at,shipping_amount,shipping_countries) VALUES (?,'creating',998,'[]',0,0,'US')",(id,))
            self.db.execute("INSERT INTO order_components VALUES (?,'base',3,?)",(id,quantity))
            self.db.execute("INSERT INTO order_components VALUES (?,'keycap',1,?)",(id,quantity*3))
            self.db.execute("UPDATE orders SET status='open' WHERE id=?",(id,))
    def stocks(self):
        return (self.db.execute('SELECT stock FROM bases WHERE id=3').fetchone()[0],self.db.execute('SELECT stock FROM keycaps WHERE id=1').fetchone()[0])
    def test_reserve_pay_duplicate(self):
        self.reserve('a'); self.assertEqual(self.stocks(),(2,6))
        self.db.execute("UPDATE orders SET status='paid' WHERE id='a' AND status='open'")
        self.assertEqual(self.stocks(),(0,0))
        self.db.execute("UPDATE orders SET status='paid' WHERE id='a'")
        self.assertEqual(self.stocks(),(0,0))
    def test_competing_checkout_rollback(self):
        self.reserve('a')
        with self.assertRaises(sqlite3.IntegrityError): self.reserve('b',1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM orders WHERE id='b'").fetchone()[0],0)
        self.assertEqual(self.stocks(),(2,6))
    def test_expiration_releases_without_deduction(self):
        self.reserve('a'); self.db.execute("UPDATE orders SET status='expired' WHERE id='a'"); self.db.commit()
        self.reserve('b'); self.assertEqual(self.stocks(),(2,6))
    def test_payment_all_or_nothing(self):
        self.reserve('a'); self.db.execute('UPDATE keycaps SET stock=1 WHERE id=1'); self.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            with self.db: self.db.execute("UPDATE orders SET status='paid' WHERE id='a'")
        self.assertEqual(self.stocks(),(2,1))
        self.assertEqual(self.db.execute("SELECT status FROM orders WHERE id='a'").fetchone()[0],'open')

    def test_nine_key_payment(self):
        self.db.execute('UPDATE keycaps SET stock=10 WHERE id=1'); self.db.commit()
        with self.db:
            self.db.execute("INSERT INTO orders(id,status,amount,cart_json,created_at,shipping_amount,shipping_countries) VALUES ('nine','creating',1499,'[]',0,0,'US')")
            self.db.execute("INSERT INTO order_components VALUES ('nine','base',9,1)")
            self.db.execute("INSERT INTO order_components VALUES ('nine','keycap',1,9)")
            self.db.execute("UPDATE orders SET status='open' WHERE id='nine'")
            self.db.execute("UPDATE orders SET status='paid' WHERE id='nine'")
        self.assertEqual(self.db.execute('SELECT stock FROM bases WHERE id=9').fetchone()[0],99)
        self.assertEqual(self.db.execute('SELECT stock FROM keycaps WHERE id=1').fetchone()[0],1)
        self.assertEqual(self.db.execute('SELECT stock FROM bases WHERE id=3').fetchone()[0],2)

if __name__=='__main__': unittest.main()
