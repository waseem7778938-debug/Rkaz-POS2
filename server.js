const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./rkaz_pos.db', (err) => {
    if (err) console.error('خطأ في قاعدة البيانات:', err.message);
    else console.log('تم الاتصال بقاعدة بيانات نظام ركاز بنجاح.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        barcode TEXT UNIQUE,
        unit TEXT DEFAULT 'حبة',
        price REAL NOT NULL,
        cost REAL NOT NULL,
        discount REAL DEFAULT 0,
        stock INTEGER NOT NULL,
        min_stock INTEGER DEFAULT 5,
        expiry_date TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_type TEXT DEFAULT 'بيع',
        payment_method TEXT DEFAULT 'نقدي',
        customer_name TEXT DEFAULT 'عميل نقدي',
        total_amount REAL NOT NULL,
        total_discount REAL DEFAULT 0,
        net_amount REAL NOT NULL,
        total_profit REAL NOT NULL,
        review_status TEXT DEFAULT 'قيد المراجعة',
        cashier_name TEXT DEFAULT 'المشرف العام',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS invoice_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_id INTEGER,
        product_id INTEGER,
        product_name TEXT,
        barcode TEXT,
        quantity INTEGER,
        original_price REAL,
        discount_val REAL,
        net_price REAL,
        FOREIGN KEY(invoice_id) REFERENCES invoices(id)
    )`);
});

app.get('/api/products', (req, res) => {
    db.all(`SELECT * FROM products ORDER BY id DESC`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/products', (req, res) => {
    const { name, barcode, unit, price, cost, discount, stock, min_stock, expiry_date } = req.body;
    db.run(`INSERT INTO products (name, barcode, unit, price, cost, discount, stock, min_stock, expiry_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, barcode, unit || 'حبة', price, cost, discount || 0, stock, min_stock || 5, expiry_date || null], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: 'تم حفظ الصنف بنجاح', productId: this.lastID });
    });
});

app.get('/api/invoices', (req, res) => {
    db.all(`SELECT * FROM invoices ORDER BY id DESC LIMIT 50`, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/sales', (req, res) => {
    const { invoice_type, payment_method, customer_name, total_amount, total_discount, net_amount, total_profit, items } = req.body;
    db.run(`INSERT INTO invoices (invoice_type, payment_method, customer_name, total_amount, total_discount, net_amount, total_profit) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [invoice_type || 'بيع', payment_method || 'نقدي', customer_name || 'عميل نقدي', total_amount, total_discount, net_amount, total_profit], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        const invoiceId = this.lastID;
        if (items && Array.isArray(items)) {
            items.forEach(item => {
                db.run(`INSERT INTO invoice_items (invoice_id, product_id, product_name, barcode, quantity, original_price, discount_val, net_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [invoiceId, item.id, item.name, item.barcode, item.quantity, item.originalPrice, item.discountVal, (item.originalPrice - item.discountVal) * item.quantity]);
                db.run(`UPDATE products SET stock = stock - ? WHERE id = ?`, [item.quantity, item.id]);
            });
        }
        res.json({ message: `تم اعتماد الفاتورة رقم #${invoiceId} بنجاح`, invoiceId });
    });
});

app.get('/api/reports', (req, res) => {
    db.get(`SELECT COALESCE(SUM(net_amount),0) as total_sales, COALESCE(SUM(total_profit),0) as total_profits, COUNT(id) as total_invoices FROM invoices`, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`خادم نظام ركاز يعمل على المنفذ: ${PORT}`);
});
