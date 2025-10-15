const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const session = require('express-session');

const app = express();
const PORT = 3000;
const TelegramBot = require('node-telegram-bot-api');
const telegramBot = new TelegramBot('', { polling: false });
const telegramChatId = ''; // replace this with the actual chat ID


app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(session({
  secret: 'saffazSecretKey123',
  resave: false,
  saveUninitialized: true
}));

function authMiddleware(req, res, next) {
  if (req.session.loggedIn) next();
  else res.redirect('/login');
}
function adminMiddleware(req, res, next) {
  if (req.session.isAdmin) {
    next();
  } else {
    res.status(403).send("⛔ Access Denied: Admins only.");
  }
}
app.get('/', authMiddleware, (req, res) => {
  db.all("SELECT * FROM settings", [], (err, rows) => {
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));

    // ✅ This simulates a user object so dashboard.ejs can safely use user.role
    res.render('dashboard', {
      settings,
      user: req.session.isAdmin ? { role: 'admin' } : { role: 'user' }
    });
  });
});


app.get('/login', (req, res) => {
  res.render('login', { error: null });
  // 🔧 Create settings table
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);

  // ⬇️ Set default values
  const defaultSettings = [
    ['business_name', 'SAFFAZ & CO'],
    ['background_color', '#f9f9f9'],
    ['logo_path', '']
  ];
  defaultSettings.forEach(([key, value]) => {
    db.run("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  });
});


// LOGIN SYSTEM
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Normal user
  if (username === 'Affan' && password === 'affan100') {
    req.session.loggedIn = true;
    req.session.username = username;
    req.session.isAdmin = false;
    return res.redirect('/');
  }

  // Admin login
  if (username === 'admin' && password === 'Admin') {
    req.session.loggedIn = true;
    req.session.username = username;
    req.session.isAdmin = true;
    return res.redirect('/');
  }

  // Invalid
  res.render('login', { error: '❌ Invalid credentials' });
});


// Admin Dashboard
app.get('/admin-dashboard', adminMiddleware, (req, res) => {
  res.render('admin-dashboard');
  session: req.session

  // ===================
  // Admin - Invoices
  // ===================
// 🧾 SHOW ALL INVOICES (GROUPED)
app.get('/admin/invoices', adminMiddleware, (req, res) => {
  db.all(`SELECT 
            MIN(id) AS id, 
            invoice_number, 
            MIN(date) AS date, 
            party_name, 
            type, 
            SUM(amount) AS total
          FROM invoices
          GROUP BY invoice_number
          ORDER BY date DESC`, 
  (err, rows) => {
    if (err) return res.send("❌ Error loading invoices.");
    res.render('admin-invoices', { invoices: rows });
  });
});



// ✏️ GET EDIT FORM FOR A WHOLE INVOICE GROUP
app.get('/admin/invoice/:id/edit', adminMiddleware, (req, res) => {
  const id = req.params.id;

  db.get("SELECT * FROM invoices WHERE id = ?", [id], (err, row) => {
    if (err || !row) return res.send("❌ Invoice not found.");

    const invoiceNumber = row.invoice_number;

    db.all("SELECT * FROM invoices WHERE invoice_number = ?", [invoiceNumber], (err2, invoiceGroup) => {
      if (err2) return res.send("❌ Failed to load invoice group.");
      res.render('edit-invoice', {
        invoiceGroup,
        invoice_number: invoiceNumber,
        party_name: row.party_name,
        date: row.date,
        type: row.type
      });
    });
  });
});

// 💾 POST UPDATE FOR FULL INVOICE GROUP
app.post('/admin/invoice/:invoice_number/edit', adminMiddleware, (req, res) => {
  const invoice_number = req.params.invoice_number;
  const { item_name, quantity, rate, amount, party_name, date, type } = req.body;

  db.all("SELECT * FROM invoices WHERE invoice_number = ?", [invoice_number], (err, oldRows) => {
    if (err || !oldRows.length) return res.send("❌ Original invoice not found.");

    // Backup deleted rows
    for (const row of oldRows) {
      db.run("INSERT INTO deleted_log (table_name, data) VALUES (?, ?)", ['invoices', JSON.stringify(row)]);
    }

    // Delete old invoice rows
    db.run("DELETE FROM invoices WHERE invoice_number = ?", [invoice_number], () => {
      // Insert updated items
      const items = Array.isArray(item_name) ? item_name.map((_, i) => ({
        item_name: item_name[i],
        quantity: parseFloat(quantity[i]),
        rate: parseFloat(rate[i]),
        amount: parseFloat(amount[i])
      })) : [{
        item_name,
        quantity: parseFloat(quantity),
        rate: parseFloat(rate),
        amount: parseFloat(amount)
      }];

      let inserted = 0;
      for (const item of items) {
        db.run(`INSERT INTO invoices (date, item_name, quantity, rate, amount, type, party_name, invoice_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [date, item.item_name, item.quantity, item.rate, item.amount, type, party_name, invoice_number], () => {
            inserted++;
            if (inserted === items.length) {
              res.redirect('/admin/invoices');
            }
          });
      }
    });
  });
});

});
const multer = require('multer');
const upload = multer({ dest: 'public/uploads/' }); // for logo upload

app.get('/admin/settings', adminMiddleware, (req, res) => {
  db.all("SELECT * FROM settings", [], (err, rows) => {
    if (err) return res.send("Error loading settings.");
    const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
    res.render('admin-settings', { settings });
  });
});

app.post('/admin/settings', adminMiddleware, upload.single('logo'), (req, res) => {
  const { business_name, background_color } = req.body;
  const logo = req.file ? '/uploads/' + req.file.filename : null;

  db.run("UPDATE settings SET value = ? WHERE key = 'business_name'", [business_name]);
  db.run("UPDATE settings SET value = ? WHERE key = 'background_color'", [background_color]);
  if (logo) db.run("UPDATE settings SET value = ? WHERE key = 'logo_path'", [logo]);

  res.redirect('/admin/settings');
  const multer = require('multer');
  const upload = multer({ dest: 'public/uploads/' }); // for logo upload

  app.get('/admin/settings', adminMiddleware, (req, res) => {
    db.all("SELECT * FROM settings", [], (err, rows) => {
      if (err) return res.send("Error loading settings.");
      const settings = Object.fromEntries(rows.map(r => [r.key, r.value]));
      res.render('admin-settings', { settings });
    });
  });

  app.post('/admin/settings', adminMiddleware, upload.single('logo'), (req, res) => {
    const { business_name, background_color } = req.body;
    const logo = req.file ? '/uploads/' + req.file.filename : null;

    db.run("UPDATE settings SET value = ? WHERE key = 'business_name'", [business_name]);
    db.run("UPDATE settings SET value = ? WHERE key = 'background_color'", [background_color]);
    if (logo) db.run("UPDATE settings SET value = ? WHERE key = 'logo_path'", [logo]);

    res.redirect('/admin/settings');
  });

});


// DATABASE CONNECTION
const db = new sqlite3.Database('./db/database.db', (err) => {
  if (err) return console.error(err.message);
  console.log('✅ Connected to SQLite DB');
});
app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});
// Ensure required columns in stock table
db.run(`ALTER TABLE stock ADD COLUMN date TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error("❌ Failed to alter stock table (date):", err.message);
  } else {
    console.log("✅ 'date' column ensured in 'stock' table.");
  }
});

db.run(`ALTER TABLE stock ADD COLUMN type TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error("❌ Failed to alter stock table (type):", err.message);
  } else {
    console.log("✅ 'type' column ensured in 'stock' table.");
  }
});

db.run(`ALTER TABLE stock ADD COLUMN related_invoice TEXT`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error("❌ Failed to alter stock table (related_invoice):", err.message);
  } else {
    console.log("✅ 'related_invoice' column ensured in 'stock' table.");
  }
});

// Permanent table setup on app start
db.run(`CREATE TABLE IF NOT EXISTS deleted_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  table_name TEXT,
  data TEXT,
  deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`);

db.run(`ALTER TABLE invoices ADD COLUMN invoice_number TEXT`, () => {
  // This will silently fail if column already exists, which is fine
});
// Add invoice_number column if missing (silent fail if exists)
db.run(`ALTER TABLE invoices ADD COLUMN invoice_number TEXT`, () => {
  // silently ignore errors
});

// --- Add this snippet below for 'side' column in 'accounts' table ---
db.all("PRAGMA table_info(accounts)", (err, columns) => {
  if (err) {
    return console.error("🔴 Failed to check columns:", err.message);
  }

  const hasSideColumn = columns.some(col => col.name === "side");
  if (!hasSideColumn) {
    db.run("ALTER TABLE accounts ADD COLUMN side TEXT", (err) => {
      if (err) {
        console.error("❌ Could not add 'side' column:", err.message);
      } else {
        console.log("✅ 'side' column successfully added to 'accounts' table.");
      }
    });
  } else {
    console.log("✅ 'side' column already exists in 'accounts' table.");
  }
});
db.all("PRAGMA table_info(accounts)", (err, columns) => {
  if (err) return console.error("Failed to check columns:", err.message);

  const hasDateColumn = columns.some(col => col.name === "date");
  if (!hasDateColumn) {
    db.run("ALTER TABLE accounts ADD COLUMN date TEXT", (err) => {
      if (err) {
        console.error("Could not add 'date' column:", err.message);
      } else {
        console.log("'date' column successfully added to 'accounts' table.");
      }
    });
  } else {
    console.log("'date' column already exists in 'accounts' table.");
  }
});
function ensureAccountsColumns(db, columnsToAdd) {
  db.all("PRAGMA table_info(accounts)", (err, columns) => {
    if (err) {
      console.error("Failed to get accounts table info:", err.message);
      return;
    }

    const existingColumns = columns.map(c => c.name);
    columnsToAdd.forEach(({ name, type }) => {
      if (!existingColumns.includes(name)) {
        db.run(`ALTER TABLE accounts ADD COLUMN ${name} ${type}`, (err) => {
          if (err) {
            console.error(`Failed to add '${name}' column:`, err.message);
          } else {
            console.log(`✅ '${name}' column added to 'accounts' table.`);
          }
        });
      } else {
        console.log(`✅ '${name}' column already exists.`);
      }
    });
  });
}

// Usage after DB connection:
ensureAccountsColumns(db, [
  { name: "side", type: "TEXT" },
  { name: "date", type: "TEXT" },
  { name: "related_invoice", type: "TEXT" }
]);


// DASHBOARD
app.get('/dashboard', authMiddleware, (req, res) => {
  res.render('dashboard', {
    user: req.session.user
  });
});
//opening parties
app.get('/opening-parties', authMiddleware, (req, res) => {
  res.render('opening-parties');
});

app.post('/opening-parties', authMiddleware, (req, res) => {
  const { name, amount, type } = req.body;
  const numericAmount = parseFloat(amount);

  if (!name || isNaN(numericAmount) || !['debtor', 'creditor'].includes(type)) {
    return res.send("❌ Please fill all fields correctly.");
  }

  db.run(`INSERT INTO accounts (name, amount, type) VALUES (?, ?, ?)`, [name, numericAmount, type], (err) => {
    if (err) {
      console.error("❌ DB error:", err.message);
      return res.send("❌ Failed to add opening balance.");
    }
    res.redirect('/dashboard');
  });
  
});


// INVOICE FORM
app.get('/invoice', authMiddleware, (req, res) => {
  res.render('invoice');
});

// INVOICE HANDLING
app.post('/invoice', authMiddleware, async (req, res) => {
  const { date, type, party_name } = req.body;
  const invoiceNumber = `INV${Date.now()}`;

  // Handle direct payments
  if ([
    'receive_payment',
    'make_payment',
    'received_cash_from_debtor',
    'paid_cash_to_creditor'
  ].includes(type)) {
    const amount = parseFloat(req.body.amount_direct || 0);
    if (isNaN(amount) || amount <= 0 || !party_name) {
      return res.send("❌ Please provide a valid amount and party name for payment.");
    }

    let description = '';
    let accountType = '';
    let cashAmount = 0;
    let accountAmount = 0;

    switch (type) {
      case 'receive_payment':
        description = 'Payment Received';
        accountType = 'debtor';
        cashAmount = amount;
        accountAmount = -amount;
        break;
      case 'make_payment':
        description = 'Payment Made';
        accountType = 'creditor';
        cashAmount = -amount;
        accountAmount = -amount;
        break;
      case 'received_cash_from_debtor':
        description = 'Cash Received from Debtor';
        accountType = 'debtor';
        cashAmount = amount;
        accountAmount = -amount;
        break;
      case 'paid_cash_to_creditor':
        description = 'Cash Paid to Creditor';
        accountType = 'creditor';
        cashAmount = -amount;
        accountAmount = -amount;
        break;
    }

    db.run(`INSERT INTO cash (date, amount, description) VALUES (?, ?, ?)`, [date, cashAmount, description]);
    db.run(`INSERT INTO accounts (name, amount, type) VALUES (?, ?, ?)`, [party_name, accountAmount, accountType]);

    const message = `🧾 ${description}\nDate: ${date}\nParty: ${party_name}\nAmount: ${amount} BDT`;
    telegramBot.sendMessage(telegramChatId, message);

    return res.send(`<h3>✅ ${description} recorded and sent to Telegram!</h3><a href="/invoice">← Create Another Invoice</a>`);
  }

  // Multi-item invoice
  if (["cash_sale", "credit_sale", "cash_purchase", "credit_purchase"].includes(type)) {
    const itemNames = Array.isArray(req.body.item_name) ? req.body.item_name : [req.body.item_name];
    const quantities = Array.isArray(req.body.quantity) ? req.body.quantity : [req.body.quantity];
    const rates = Array.isArray(req.body.rate) ? req.body.rate : [req.body.rate];

    const items = itemNames.map((name, i) => {
      const quantity = parseFloat(quantities[i]);
      const rate = parseFloat(rates[i]);
      return { name, quantity, rate, amount: quantity * rate };
    });

    const totalAmount = items.reduce((sum, item) => sum + item.amount, 0);
    let stockErrors = [];
    let stockChecksDone = 0;

    const processInvoice = () => {
      // Insert invoice and stock
      items.forEach((item) => {
        db.run(`INSERT INTO invoices (date, item_name, quantity, rate, amount, type, party_name, invoice_number)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [date, item.name, item.quantity, item.rate, item.amount, type, party_name, invoiceNumber]);

        const stockChange = (type.includes("sale")) ? -item.quantity : item.quantity;
        db.get(`SELECT quantity FROM stock WHERE item_name = ?`, [item.name], (err, row) => {
          if (row) {
            db.run(`UPDATE stock SET quantity = ?, date = ? WHERE item_name = ?`, [row.quantity + stockChange, date, item.name]);
          } else {
            db.run(`INSERT INTO stock (date, item_name, quantity, type, related_invoice) VALUES (?, ?, ?, ?, ?)`,
              [date, item.name, stockChange, type, invoiceNumber]);
          }
        });
      });
      // Accounting entries
if (type === "credit_purchase") {
  // Credit Purchase: purchase (debit), creditor (credit)
  db.run(`INSERT INTO accounts (name, amount, type, side, date, related_invoice)
          VALUES (?, ?, 'purchase', 'debit', ?, ?)`,
    [party_name, totalAmount, date, invoiceNumber]);
  db.run(`INSERT INTO accounts (name, amount, type, side, date, related_invoice)
          VALUES (?, ?, 'creditor', 'credit', ?, ?)`,
    [party_name, totalAmount, date, invoiceNumber]);

} else if (type === "cash_purchase") {
  // Cash Purchase: purchase (debit), cash (credit)
  db.run(`INSERT INTO accounts (name, amount, type, side, date, related_invoice)
          VALUES (?, ?, 'purchase', 'debit', ?, ?)`,
    [party_name, totalAmount, date, invoiceNumber]);
  db.run(`INSERT INTO accounts (name, amount, type, side, date, related_invoice)
          VALUES (?, ?, 'cash', 'credit', ?, ?)`,
    ['Cash', totalAmount, date, invoiceNumber]);

  // Insert cash outflow record
  db.run(`INSERT INTO cash (date, amount, description) VALUES (?, ?, ?)`,
    [date, -totalAmount, 'Cash Purchase']);

} else if (type === "credit_sale") {
  // Credit Sale: debtor (debit), sales (credit)
  db.run(`INSERT INTO accounts (name, amount, type, side, date, related_invoice)
          VALUES (?, ?, 'debtor', 'debit', ?, ?)`,
    [party_name, totalAmount, date, invoiceNumber]);
  db.run(`INSERT INTO accounts (name, amount, type, side, date, related_invoice)
          VALUES (?, ?, 'sales', 'credit', ?, ?)`,
    [party_name, totalAmount, date, invoiceNumber]);

} else if (type === "cash_sale") {
  // Cash Sale: cash (debit), sales (credit)
  db.run(`INSERT INTO accounts (name, amount, type, side, date, related_invoice)
          VALUES (?, ?, 'cash', 'debit', ?, ?)`,
    ['Cash', totalAmount, date, invoiceNumber]);
  db.run(`INSERT INTO accounts (name, amount, type, side, date, related_invoice)
          VALUES (?, ?, 'sales', 'credit', ?, ?)`,
    [party_name, totalAmount, date, invoiceNumber]);

  // Insert cash inflow record
  db.run(`INSERT INTO cash (date, amount, description) VALUES (?, ?, ?)`,
    [date, totalAmount, 'Cash Sale']);
}

const summary = items.map(i => `${i.name} x${i.quantity} @${i.rate} = ${i.amount}`).join("\n");
const message = `🧾 SAFFAZ & CO Invoice\nDate: ${date}\n${summary}\n\nTotal: ${totalAmount} BDT\nType: ${type.replace("_", " ")}\nParty: ${party_name || 'N/A'}\n\nThank you!`;
telegramBot.sendMessage(telegramChatId, message);

return res.send(`<h3>✅ Invoice posted and sent to Telegram!</h3><a href="/invoice">← Create Another Invoice</a>`);
};
// Stock check
items.forEach((item) => {
  if (type.includes("sale")) {
    db.get(`SELECT quantity FROM stock WHERE item_name = ?`, [item.name], (err, row) => {
      stockChecksDone++;
      if (err || !row || row.quantity < item.quantity) {
        stockErrors.push(`❌ Not enough stock for ${item.name}. Available: ${row ? row.quantity : 0}, Requested: ${item.quantity}`);
      }
      if (stockChecksDone === items.length) {
        stockErrors.length > 0 ? res.send(stockErrors.join('<br>')) : processInvoice();
      }
    });
  } else {
    stockChecksDone++;
    if (stockChecksDone === items.length) processInvoice();
  }
});
} else {
  return res.send("❌ Invalid invoice type selected.");
}
});
// LEDGER PAGE
app.get('/ledger', authMiddleware, (req, res) => {
  db.all(`SELECT DISTINCT party_name FROM invoices WHERE party_name IS NOT NULL`, [], (err, rows) => {
    if (err) return res.status(500).send("❌ Failed to load ledger parties.");
    res.render('ledger-list', { parties: rows });
  });
});


// STOCK PAGE
app.get('/stock', authMiddleware, (req, res) => {
  db.all(`SELECT * FROM stock`, [], (err, rows) => {
    if (err) return res.send("❌ Error loading stock.");
    res.render('stock', { stock: rows });
  });
});




// CASH BOOK
app.get('/cash', authMiddleware, (req, res) => {
  db.all(`SELECT * FROM cash`, [], (err, rows) => {
    if (err) return res.send("Error loading cash");
    res.render('cash', { cash: rows });
  });
});
app.get('/accounts', authMiddleware, (req, res) => {
  const debtorsQuery = `
    SELECT name,
           SUM(CASE WHEN side = 'debit' THEN amount ELSE 0 END) AS total_debit,
           SUM(CASE WHEN side = 'credit' THEN amount ELSE 0 END) AS total_credit,
           SUM(CASE WHEN side = 'debit' THEN amount ELSE 0 END) - SUM(CASE WHEN side = 'credit' THEN amount ELSE 0 END) AS balance
    FROM accounts
    WHERE type = 'debtor'
    GROUP BY name
  `;

  const creditorsQuery = `
    SELECT name,
           SUM(CASE WHEN side = 'debit' THEN amount ELSE 0 END) AS total_debit,
           SUM(CASE WHEN side = 'credit' THEN amount ELSE 0 END) AS total_credit,
           SUM(CASE WHEN side = 'debit' THEN amount ELSE 0 END) - SUM(CASE WHEN side = 'credit' THEN amount ELSE 0 END) AS balance
    FROM accounts
    WHERE type = 'creditor'
    GROUP BY name
  `;

  db.all(debtorsQuery, (err, debtors) => {
    if (err) {
      console.error('DB error fetching debtors:', err);
      return res.status(500).send('Database error fetching debtors');
    }
    db.all(creditorsQuery, (err2, creditors) => {
      if (err2) {
        console.error('DB error fetching creditors:', err2);
        return res.status(500).send('Database error fetching creditors');
      }

      // Fix null balances
      debtors = debtors.map(d => ({ ...d, balance: d.balance || 0 }));
      creditors = creditors.map(c => ({ ...c, balance: c.balance || 0 }));

      // Calculate totals
      const totalDebtors = debtors.reduce((sum, d) => sum + d.balance, 0);
      const totalCreditors = creditors.reduce((sum, c) => sum + c.balance, 0);

      res.render('accounts', {
        debtors,
        creditors,
        totalDebtors,
        totalCreditors,
      });
    });
  });
});
//party Transactions
app.get('/party-transactions/:partyName', authMiddleware, (req, res) => {
  const partyName = req.params.partyName;

  db.all(
    `SELECT * FROM invoices WHERE party_name = ? ORDER BY date ASC`,
    [partyName],
    (err, rows) => {
      if (err) {
        console.error('DB error fetching transactions:', err);
        return res.status(500).send('Database error');
      }

      // Separate into two sets
      const creditorTypes = ['credit_purchase', 'make_payment'];
      const debtorTypes = ['credit_sale', 'receive_payment'];

      const creditorTransactions = rows.filter(tx => creditorTypes.includes(tx.type));
      const debtorTransactions = rows.filter(tx => debtorTypes.includes(tx.type));

      res.render('party-ledger', {
        partyName,
        creditorTransactions,
        debtorTransactions
      });
    }
  );
});



// PROFIT & LOSS
app.get('/profit-loss', authMiddleware, (req, res) => {
  let totalSales = 0, totalPurchases = 0, totalExpenses = 0;
  db.get(`SELECT SUM(amount) as total FROM invoices WHERE type IN ('cash_sale', 'credit_sale')`, (err, row1) => {
    totalSales = row1?.total || 0;
    db.get(`SELECT SUM(amount) as total FROM invoices WHERE type IN ('cash_purchase', 'credit_purchase')`, (err, row2) => {
      totalPurchases = row2?.total || 0;
      db.get(`SELECT SUM(amount) as total FROM expenses`, (err, row3) => {
        totalExpenses = row3?.total || 0;
        const profit = totalSales - totalPurchases - totalExpenses;
        res.render('profit-loss', { sales: totalSales, purchases: totalPurchases, expenses: totalExpenses, profit });
      });
    });
  });
});

// TRIAL BALANCE
app.get('/trial-balance', authMiddleware, (req, res) => {
  let cashTotal = 0, debtors = 0, creditors = 0;
  db.get("SELECT SUM(amount) as total FROM cash", (err, row) => {
    cashTotal = row?.total || 0;
    db.get("SELECT SUM(amount) as total FROM accounts WHERE type = 'debtor'", (err, row2) => {
      debtors = row2?.total || 0;
      db.get("SELECT SUM(amount) as total FROM accounts WHERE type = 'creditor'", (err, row3) => {
        creditors = row3?.total || 0;
        res.render('trial-balance', { cash: cashTotal, debtors, creditors });
      });
    });
  });
});

// INVOICE TRACKER
app.get('/invoice-tracker', authMiddleware, (req, res) => {
  const search = req.query.search || '';
  const sql = search
    ? `SELECT * FROM invoices WHERE item_name LIKE ? OR party_name LIKE ? ORDER BY id DESC`
    : `SELECT * FROM invoices ORDER BY id DESC`;
  const params = search ? [`%${search}%`, `%${search}%`] : [];
  db.all(sql, params, (err, rows) => {
    if (err) return res.send("Error loading invoices.");
    res.render('invoice-tracker', { invoices: rows, search });
  });
});
// Opening Stock Page
app.get('/opening-stock', authMiddleware, (req, res) => {
  db.all("SELECT * FROM stock", [], (err, rows) => {
    if (err) return res.send("Error loading stock.");
    res.render('opening-stock', { stock: rows });
  });
});

app.post('/opening-stock', authMiddleware, (req, res) => {
  const { item_name, quantity } = req.body;
  const qty = parseFloat(quantity);
  if (!item_name || isNaN(qty)) return res.send("❌ Invalid input.");

  db.get("SELECT * FROM stock WHERE item_name = ?", [item_name], (err, row) => {
    if (row) {
      db.run("UPDATE stock SET quantity = ? WHERE item_name = ?", [qty, item_name]);
    } else {
      db.run("INSERT INTO stock (item_name, quantity) VALUES (?, ?)", [item_name, qty]);
    }
    res.redirect('/opening-stock');
  });
});

app.get('/opening-balance', authMiddleware, (req, res) => {
  db.all("SELECT * FROM cash WHERE description LIKE 'Opening%'", [], (err, rows) => {
    if (err) return res.send("❌ Error loading balances.");
    res.render('opening-balance', { records: rows });
  });
});

app.post('/opening-balance', authMiddleware, (req, res) => {
  const { cash_amount, bank_name, bank_amount } = req.body;
  const date = new Date().toISOString().slice(0, 10);

  if (cash_amount && !isNaN(parseFloat(cash_amount))) {
    db.run("INSERT INTO cash (date, amount, description) VALUES (?, ?, ?)", [date, parseFloat(cash_amount), 'Opening Cash Balance']);
  }

  if (bank_name && bank_amount && !isNaN(parseFloat(bank_amount))) {
    const desc = `Opening Bank Balance - ${bank_name}`;
    db.run("INSERT INTO cash (date, amount, description) VALUES (?, ?, ?)", [date, parseFloat(bank_amount), desc]);
  }

  res.redirect('/opening-balance');
});
// Opening Cash Page (no bank)
app.get('/opening-cash', authMiddleware, (req, res) => {
  db.all("SELECT * FROM cash WHERE description = 'Opening Cash Balance'", [], (err, rows) => {
    if (err) return res.send("❌ Error loading cash.");
    res.render('opening-cash', { records: rows });
  });
});

app.post('/opening-cash', authMiddleware, (req, res) => {
  const { amount } = req.body;
  const date = new Date().toISOString().slice(0, 10);
  const amt = parseFloat(amount);
  if (!isNaN(amt)) {
    db.run("INSERT INTO cash (date, amount, description) VALUES (?, ?, ?)", [date, amt, 'Opening Cash Balance']);
  }
  res.redirect('/opening-cash');
});
// Party Opening Balance Page
app.get('/parties', authMiddleware, (req, res) => {
  db.all("SELECT * FROM accounts WHERE type = 'debtor' OR type = 'creditor'", [], (err, rows) => {
    if (err) {
      console.error(err); // log it so we can debug
      return res.send("❌ Error loading parties.");
    }
    res.render('parties', { parties: rows });
  });
});

app.post('/parties', authMiddleware, (req, res) => {
  const { name, balance, type } = req.body;
  const amount = parseFloat(balance);
  if (!name || isNaN(amount) || !['debtor', 'creditor'].includes(type)) {
    return res.send("❌ Please enter valid party name, type, and amount.");
  }

  const signedAmount = type === 'debtor' ? amount : -amount;

  db.run("INSERT INTO accounts (name, amount, type) VALUES (?, ?, ?)", [name, signedAmount, type]);
  res.redirect('/parties');
});



// RESET EVERYTHING 
app.get('/reset', authMiddleware, (req, res) => {
  db.serialize(() => {
    db.run("DELETE FROM invoices");
    db.run("DELETE FROM stock");
    db.run("DELETE FROM cash");
    db.run("DELETE FROM accounts");
    db.run("DELETE FROM expenses");
  });
  res.send(`<h3>⚠️ All data has been reset.</h3><a href='/'>Back to Dashboard</a>`);
});

// SERVER START
app.listen(PORT, () => {
  console.log(`🚀 SAFFAZ & CO rungning at http://localhost:${PORT}`);
});